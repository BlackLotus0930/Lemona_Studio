import { app, BrowserWindow, session } from 'electron';
import updater from 'electron-updater';
import log from 'electron-log';
import path from 'path';
import { fileURLToPath } from 'url';
import { existsSync, readdirSync } from 'fs';
import fs from 'fs/promises';
import { setupIPC } from './ipc.js';
import { migrateDocuments } from './services/migration.js';
import { documentService } from './services/documentService.js';
import { getVectorStore, cleanupVectorIndex } from './services/vectorStore.js';
const { autoUpdater } = updater;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// Get project root directory (Lemona/)
// __dirname in compiled code (running from desktop/): dist/desktop/main
// Going up 4 levels from dist/desktop/main gives us the Lemona/ directory
// Example: desktop/dist/desktop/main -> desktop/dist/desktop -> desktop/dist -> desktop -> Lemona
const projectRoot = path.resolve(__dirname, '../../../../'); // This is the Lemona/ directory
let mainWindow = null;
const ZOOM_LEVEL_FILE = path.join(app.getPath('userData'), 'zoom-level.json');
async function loadZoomLevel() {
    try {
        const data = await fs.readFile(ZOOM_LEVEL_FILE, 'utf-8');
        const parsed = JSON.parse(data);
        return typeof parsed.zoomLevel === 'number' ? parsed.zoomLevel : null;
    }
    catch {
        return null;
    }
}
async function saveZoomLevel(zoomLevel) {
    try {
        await fs.writeFile(ZOOM_LEVEL_FILE, JSON.stringify({ zoomLevel }), 'utf-8');
    }
    catch (error) {
        console.error('❌ Failed to save zoom level:', error);
    }
}
// Setup IPC handlers
setupIPC();
// Set Content Security Policy
function setupCSP() {
    const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;
    // Build CSP string
    // In dev mode, allow unsafe-eval for Vite HMR, but block it in production
    const cspDirectives = [
        "default-src 'self'",
        "script-src 'self'" + (isDev ? " 'unsafe-eval' 'unsafe-inline' http://localhost:5173" : ""),
        "worker-src 'self' blob:", // Allow workers from 'self' and blob URLs (required for PDF.js)
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
        "font-src 'self' https://fonts.gstatic.com data:",
        "img-src 'self' data: blob: https:",
        "connect-src 'self' https://generativelanguage.googleapis.com https://*.googleapis.com" + (isDev ? " http://localhost:5173 ws://localhost:5173" : ""),
        // Allow blob: and data: for PDF viewing in iframe
        "frame-src 'self' blob: data:",
        // Allow blob: for object-src to support PDF rendering in some browsers
        "object-src 'self' blob: data:",
        "base-uri 'self'",
        "form-action 'self'",
        "frame-ancestors 'none'",
        "upgrade-insecure-requests"
    ];
    const csp = cspDirectives.join('; ');
    // Set CSP via session headers
    session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
        callback({
            responseHeaders: {
                ...details.responseHeaders,
                'Content-Security-Policy': [csp]
            }
        });
    });
    console.log(`✅ Content Security Policy configured (dev mode: ${isDev})`);
}
function createWindow() {
    // Get logo path - try both source and compiled locations
    // Prefer .ico for Windows (better quality), fallback to .png
    const logoPathSourceIco = path.join(projectRoot, 'frontend', 'public', 'lemonalogo.ico');
    const logoPathDistIco = path.join(__dirname, '../../frontend/public/lemonalogo.ico');
    const logoPathSourcePng = path.join(projectRoot, 'frontend', 'public', 'lemonalogo.png');
    const logoPathDistPng = path.join(__dirname, '../../frontend/public/lemonalogo.png');
    // Use whichever exists, prefer .ico
    let iconPath = undefined;
    if (existsSync(logoPathSourceIco)) {
        iconPath = logoPathSourceIco;
    }
    else if (existsSync(logoPathDistIco)) {
        iconPath = logoPathDistIco;
    }
    else if (existsSync(logoPathSourcePng)) {
        iconPath = logoPathSourcePng;
    }
    else if (existsSync(logoPathDistPng)) {
        iconPath = logoPathDistPng;
    }
    if (iconPath) {
        console.log(`✅ Using icon: ${iconPath}`);
    }
    else {
        console.warn(`⚠️  Icon not found. Tried: ${logoPathSourceIco}, ${logoPathDistIco}, ${logoPathSourcePng}, and ${logoPathDistPng}`);
    }
    const shouldUseNativeControlsOverlay = process.platform === 'win32';
    mainWindow = new BrowserWindow({
        width: 1400,
        height: 900,
        icon: iconPath, // Set window icon (Windows/Linux)
        frame: false, // Remove default frame completely - we use custom title bar
        titleBarStyle: 'hidden', // Hide default title bar (macOS)
        backgroundColor: '#141414', // Set dark background to prevent white flash
        show: false, // Don't show window until content is ready (prevents white flash)
        // Use native window controls overlay on Windows (Snap Layouts support)
        titleBarOverlay: shouldUseNativeControlsOverlay ? {
            color: '#141414',
            symbolColor: '#bcbcbc',
            height: 36
        } : undefined,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, '../../preload/index.js'),
        },
    });
    // Show window only when content is ready to prevent white flash
    mainWindow.once('ready-to-show', () => {
        mainWindow?.show();
    });
    const applySavedZoom = async () => {
        const savedZoom = await loadZoomLevel();
        if (savedZoom !== null) {
            mainWindow?.webContents.setZoomLevel(savedZoom);
        }
    };
    mainWindow.webContents.on('did-finish-load', () => {
        void applySavedZoom();
    });
    mainWindow.on('focus', () => {
        void applySavedZoom();
    });
    // Handle window close: notify renderer to cleanup before closing
    mainWindow.on('close', (event) => {
        // Send message to renderer to cleanup (clear undo/redo, restore documents)
        mainWindow?.webContents.send('window-will-close');
        // Don't prevent default - allow window to close normally
        // The cleanup will happen synchronously in the renderer
    });
    // 开发环境：加载 Vite dev server
    if (process.env.NODE_ENV === 'development' || !app.isPackaged) {
        mainWindow.loadURL('http://localhost:5173');
        // Suppress DevTools protocol warnings (harmless warnings from Chromium 142)
        mainWindow.webContents.on('console-message', (event, level, message) => {
            if (message.includes('Autofill.setAddresses') || message.includes('wasn\'t found')) {
                // Suppress harmless DevTools protocol warnings
                event.preventDefault();
            }
        });
        mainWindow.webContents.openDevTools();
    }
    else {
        // 生产环境：加载打包后的文件
        // extraResources 中的文件会被放在 resources 目录下
        const frontendDistPath = path.join(process.resourcesPath, 'frontend', 'dist', 'index.html');
        mainWindow.loadFile(frontendDistPath);
    }
    // Enable zoom commands (Ctrl/Cmd + Plus, Minus, 0)
    mainWindow.webContents.on('before-input-event', (event, input) => {
        if ((input.control || input.meta) && input.shift && (input.key === 'E' || input.key === 'e')) {
            // Toggle File Explorer regardless of focus
            mainWindow?.webContents.send('toggle-file-explorer');
            event.preventDefault();
            return;
        }
        if (input.key === 'F11') {
            // Focus Mode: hide menu bar and toggle fullscreen
            const shouldEnable = !mainWindow.isFullScreen();
            mainWindow.setFullScreen(shouldEnable);
            mainWindow.setMenuBarVisibility(!shouldEnable);
            mainWindow.setAutoHideMenuBar(shouldEnable);
            event.preventDefault();
            return;
        }
        if (input.control || input.meta) {
            if (input.key === '+' || input.key === '=') {
                // Zoom in
                const currentZoom = mainWindow.webContents.getZoomLevel();
                const nextZoom = currentZoom + 0.5;
                mainWindow.webContents.setZoomLevel(nextZoom);
                void saveZoomLevel(nextZoom);
                event.preventDefault();
            }
            else if (input.key === '-' || input.key === '_') {
                // Zoom out
                const currentZoom = mainWindow.webContents.getZoomLevel();
                const nextZoom = currentZoom - 0.5;
                mainWindow.webContents.setZoomLevel(nextZoom);
                void saveZoomLevel(nextZoom);
                event.preventDefault();
            }
            else if (input.key === '0') {
                // Reset zoom
                mainWindow.webContents.setZoomLevel(0);
                void saveZoomLevel(0);
                event.preventDefault();
            }
        }
    });
    mainWindow.webContents.on('zoom-changed', () => {
        const currentZoom = mainWindow.webContents.getZoomLevel();
        void saveZoomLevel(currentZoom);
    });
}
// Set app icon (macOS)
const logoPath = path.join(projectRoot, 'frontend', 'public', 'lemonalogo.png');
if (existsSync(logoPath)) {
    if (process.platform === 'darwin') {
        app.dock?.setIcon(logoPath); // macOS dock icon
    }
    // Windows/Linux icon is set in createWindow() via icon property
    console.log(`✅ App icon set: ${logoPath}`);
}
else {
    console.warn(`⚠️  Icon not found: ${logoPath}`);
}
// Configure auto-updater
function setupAutoUpdater() {
    // Only enable auto-updater in production
    if (process.env.NODE_ENV === 'development' || !app.isPackaged) {
        console.log('⏭️  Auto-updater disabled in development mode');
        return;
    }
    // Set auto-updater log level
    autoUpdater.logger = log;
    // Configure log level (optional - electron-log defaults are usually fine)
    try {
        // @ts-ignore - electron-log types may not include transports in some versions
        if (log.transports?.file) {
            log.transports.file.level = 'info';
        }
    }
    catch (e) {
        // Ignore if transports API is not available
        console.log('Note: Could not configure electron-log transports');
    }
    // Check for updates on startup (after a delay to not block app startup)
    setTimeout(() => {
        autoUpdater.checkForUpdatesAndNotify().catch((error) => {
            console.error('❌ Failed to check for updates:', error);
        });
    }, 5000); // Check after 5 seconds
    // Check for updates every 4 hours
    setInterval(() => {
        autoUpdater.checkForUpdatesAndNotify().catch((error) => {
            console.error('❌ Failed to check for updates:', error);
        });
    }, 4 * 60 * 60 * 1000); // 4 hours
    // Event handlers
    autoUpdater.on('checking-for-update', () => {
        console.log('🔍 Checking for updates...');
        if (mainWindow) {
            mainWindow.webContents.send('update-checking');
        }
    });
    autoUpdater.on('update-available', (info) => {
        console.log('✅ Update available:', info.version);
        if (mainWindow) {
            mainWindow.webContents.send('update-available', info);
        }
    });
    autoUpdater.on('update-not-available', (info) => {
        console.log('✅ App is up to date:', info.version);
        if (mainWindow) {
            mainWindow.webContents.send('update-not-available', info);
        }
    });
    autoUpdater.on('error', (error) => {
        console.error('❌ Auto-updater error:', error);
        if (mainWindow) {
            mainWindow.webContents.send('update-error', error.message);
        }
    });
    autoUpdater.on('download-progress', (progressObj) => {
        const message = `Download speed: ${progressObj.bytesPerSecond} - Downloaded ${progressObj.percent}% (${progressObj.transferred}/${progressObj.total})`;
        console.log('📥 Download progress:', message);
        if (mainWindow) {
            mainWindow.webContents.send('update-download-progress', progressObj);
        }
    });
    autoUpdater.on('update-downloaded', (info) => {
        console.log('✅ Update downloaded:', info.version);
        if (mainWindow) {
            mainWindow.webContents.send('update-downloaded', info);
        }
    });
}
// Migrate existing documents and create window on app ready
app.whenReady().then(async () => {
    // Setup Content Security Policy first
    setupCSP();
    // Setup auto-updater
    setupAutoUpdater();
    // Migrate documents first
    await migrateDocuments();
    // Clean up logically deleted documents first
    const deletedCleanupResult = await documentService.cleanupDeletedDocuments();
    // Clean up orphaned/corrupted documents
    const cleanupResult = await documentService.cleanupOrphanedFiles();
    // Clean up vector index: remove corrupted files and orphaned chunks
    const vectorCleanupResult = await cleanupVectorIndex();
    // Check for old library index migration
    await checkAndHandleLibraryIndexMigration();
    // Validate index integrity for all projects
    await validateAllIndexes();
    // Start background cleanup service for deleted documents
    documentService.startDeletedDocumentsCleanupService();
    // Then create window
    createWindow();
    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});
// Stop background services on app quit
app.on('before-quit', () => {
    documentService.stopDeletedDocumentsCleanupService();
});
/**
 * Check for old library index and handle migration
 * If old index exists, notify frontend to prompt user for migration choice
 */
async function checkAndHandleLibraryIndexMigration() {
    try {
        const BASE_VECTOR_INDEX_DIR = path.join(app.getPath('userData'), 'vectorIndex');
        const oldLibraryIndexDir = path.join(BASE_VECTOR_INDEX_DIR, 'library');
        const oldMetadataFile = path.join(oldLibraryIndexDir, 'metadata.json');
        const oldIndexFile = path.join(oldLibraryIndexDir, 'index.bin');
        const deprecatedMarker = path.join(oldLibraryIndexDir, '.deprecated');
        // Check if old index exists and is not already deprecated
        let oldIndexExists = false;
        let isDeprecated = false;
        try {
            await fs.access(oldMetadataFile);
            await fs.access(oldIndexFile);
            oldIndexExists = true;
            // Check if already deprecated
            try {
                await fs.access(deprecatedMarker);
                isDeprecated = true;
            }
            catch {
                isDeprecated = false;
            }
        }
        catch {
            oldIndexExists = false;
        }
        if (oldIndexExists && !isDeprecated) {
            // Old index exists and is not deprecated - need to migrate
            // Store migration state for frontend to check
            const migrationStateFile = path.join(BASE_VECTOR_INDEX_DIR, '.migration-pending.json');
            await fs.writeFile(migrationStateFile, JSON.stringify({
                oldIndexExists: true,
                checkedAt: new Date().toISOString(),
            }), 'utf-8');
            console.log('[Migration] Old library index detected. Frontend will prompt user for migration.');
        }
        else if (isDeprecated) {
            console.log('[Migration] Old library index is already deprecated.');
        }
    }
    catch (error) {
        console.error('❌ Failed to check library index migration:', error);
    }
}
/**
 * Validate index integrity for all projects
 * Checks each project's index and reports any issues
 */
async function validateAllIndexes() {
    try {
        const baseIndexDir = path.join(app.getPath('userData'), 'vectorIndex');
        // Check if base index directory exists
        if (!existsSync(baseIndexDir)) {
            return;
        }
        // Get all project directories
        const projectDirs = readdirSync(baseIndexDir, { withFileTypes: true })
            .filter(dirent => dirent.isDirectory())
            .map(dirent => dirent.name);
        if (projectDirs.length === 0) {
            return;
        }
        // Validate each project's index
        const validationResults = [];
        for (const projectDir of projectDirs) {
            try {
                const projectId = projectDir === 'library' ? 'library' : projectDir;
                // Only validate library indexes (project indexes not supported yet)
                const vectorStore = getVectorStore(projectId, 'library');
                const result = await vectorStore.validateIntegrity();
                validationResults.push({
                    projectId,
                    ...result
                });
            }
            catch (error) {
                console.error(`❌ Failed to validate index for project "${projectDir}":`, error.message);
            }
        }
        // Summary
        const validCount = validationResults.filter(r => r.valid).length;
        const needsRebuildCount = validationResults.filter(r => r.needsRebuild).length;
        if (validCount !== validationResults.length) {
        }
    }
    catch (error) {
        console.error('❌ Failed to validate indexes:', error);
    }
}
app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});
