import { app, BrowserWindow, session } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import { existsSync, readdirSync } from 'fs';
import { setupIPC } from './ipc.js';
import { migrateDocuments } from './services/migration.js';
import { documentService } from './services/documentService.js';
import { getVectorStore, cleanupVectorIndex } from './services/vectorStore.js';
import { projectService } from './services/projectService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Get project root directory (Lemona/)
// __dirname in compiled code (running from desktop/): dist/desktop/main
// Going up 4 levels from dist/desktop/main gives us the Lemona/ directory
// Example: desktop/dist/desktop/main -> desktop/dist/desktop -> desktop/dist -> desktop -> Lemona
const projectRoot = path.resolve(__dirname, '../../../../'); // This is the Lemona/ directory

let mainWindow: BrowserWindow | null = null;

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
  const logoPathSource = path.join(projectRoot, 'frontend', 'public', 'lemonalogo.png')
  const logoPathDist = path.join(__dirname, '../../frontend/public/lemonalogo.png')
  
  // Use whichever exists
  let iconPath: string | undefined = undefined
  if (existsSync(logoPathSource)) {
    iconPath = logoPathSource
  } else if (existsSync(logoPathDist)) {
    iconPath = logoPathDist
  }
  
  if (iconPath) {
    console.log(`✅ Using icon: ${iconPath}`)
  } else {
    console.warn(`⚠️  Icon not found. Tried: ${logoPathSource} and ${logoPathDist}`)
  }
  
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    icon: iconPath, // Set window icon (Windows/Linux)
    frame: false, // Remove default frame completely - we use custom title bar
    titleBarStyle: 'hidden', // Hide default title bar (macOS)
    backgroundColor: '#141414', // Set dark background to prevent white flash
    // Note: titleBarOverlay only works on macOS, removed for Windows compatibility
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, '../../preload/index.js'),
    },
  });

  // Handle window close: notify renderer to cleanup before closing
  mainWindow.on('close', (event) => {
    // Send message to renderer to cleanup (clear undo/redo, restore documents)
    mainWindow?.webContents.send('window-will-close')
    // Don't prevent default - allow window to close normally
    // The cleanup will happen synchronously in the renderer
  });

  // 开发环境：加载 Vite dev server
  if (process.env.NODE_ENV === 'development' || !app.isPackaged) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    // 生产环境：加载打包后的文件
    // extraResources 中的文件会被放在 resources 目录下
    const frontendDistPath = path.join(process.resourcesPath, 'frontend', 'dist', 'index.html');
    mainWindow.loadFile(frontendDistPath);
  }

  // Enable zoom commands (Ctrl/Cmd + Plus, Minus, 0)
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.control || input.meta) {
      if (input.key === '+' || input.key === '=') {
        // Zoom in
        const currentZoom = mainWindow!.webContents.getZoomLevel();
        mainWindow!.webContents.setZoomLevel(currentZoom + 0.5);
        event.preventDefault();
      } else if (input.key === '-' || input.key === '_') {
        // Zoom out
        const currentZoom = mainWindow!.webContents.getZoomLevel();
        mainWindow!.webContents.setZoomLevel(currentZoom - 0.5);
        event.preventDefault();
      } else if (input.key === '0') {
        // Reset zoom
        mainWindow!.webContents.setZoomLevel(0);
        event.preventDefault();
      }
    }
  });
}

// Set app icon (macOS)
const logoPath = path.join(projectRoot, 'frontend', 'public', 'lemonalogo.png')
if (existsSync(logoPath)) {
  if (process.platform === 'darwin') {
    app.dock?.setIcon(logoPath) // macOS dock icon
  }
  // Windows/Linux icon is set in createWindow() via icon property
  console.log(`✅ App icon set: ${logoPath}`)
} else {
  console.warn(`⚠️  Icon not found: ${logoPath}`)
}

// Migrate existing documents and create window on app ready
app.whenReady().then(async () => {
  // Setup Content Security Policy first
  setupCSP();
  
  // Migrate documents first
  await migrateDocuments();
  
  // Clean up logically deleted documents first
  const deletedCleanupResult = await documentService.cleanupDeletedDocuments();
  
  // Clean up orphaned/corrupted documents
  const cleanupResult = await documentService.cleanupOrphanedFiles();
  
  // Clean up vector index: remove corrupted files and orphaned chunks
  const vectorCleanupResult = await cleanupVectorIndex();
  
  // Validate index integrity for all projects
  await validateAllIndexes();
  
  // Then create window
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

/**
 * Validate index integrity for all projects
 * Checks each project's index and reports any issues
 */
async function validateAllIndexes(): Promise<void> {
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
    const validationResults: Array<{ projectId: string; valid: boolean; needsRebuild: boolean; indexCount: number; metadataCount: number }> = [];

    for (const projectDir of projectDirs) {
      try {
        const projectId = projectDir === 'library' ? 'library' : projectDir;
        const vectorStore = getVectorStore(projectId);
        const result = await vectorStore.validateIntegrity();
        
        validationResults.push({
          projectId,
          ...result
        });
      } catch (error: any) {
        console.error(`❌ Failed to validate index for project "${projectDir}":`, error.message);
      }
    }

    // Summary
    const validCount = validationResults.filter(r => r.valid).length;
    const needsRebuildCount = validationResults.filter(r => r.needsRebuild).length;
    
    if (validCount !== validationResults.length) {
    }
  } catch (error: any) {
    console.error('❌ Failed to validate indexes:', error);
  }
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

