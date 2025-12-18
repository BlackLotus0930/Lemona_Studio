import { app, BrowserWindow } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import { config } from 'dotenv';
import { existsSync } from 'fs';
import { setupIPC } from './ipc.js';
import { migrateDocuments } from './services/migration.js';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// Load .env file
// __dirname in compiled code (running from desktop/): dist/desktop/main
// Going up 3 levels from dist/desktop/main gives us the desktop/ directory
// Example: desktop/dist/desktop/main -> desktop/dist/desktop -> desktop/dist -> desktop
const desktopDir = path.resolve(__dirname, '../../..'); // This is the desktop/ directory
const projectRoot = path.resolve(desktopDir, '..'); // This is the Lemona/ directory
const desktopEnvPath = path.join(desktopDir, '.env'); // desktop/.env
const rootEnvPath = path.join(projectRoot, '.env'); // Lemona/.env
console.log(`Debug - desktopDir: ${desktopDir}`);
console.log(`Debug - Looking for .env at: ${desktopEnvPath}`);
let envLoaded = false;
// Try desktop/.env first
const desktopResult = config({ path: desktopEnvPath });
if (!desktopResult.error && desktopResult.parsed && Object.keys(desktopResult.parsed).length > 0) {
    console.log(`✅ Loaded .env from: ${desktopEnvPath} (Desktop-specific)`);
    console.log(`   Found ${Object.keys(desktopResult.parsed).length} variables`);
    envLoaded = true;
}
else {
    console.log(`   desktop/.env not found or empty, trying project root...`);
    // Fallback to project root/.env
    const rootResult = config({ path: rootEnvPath });
    if (!rootResult.error && rootResult.parsed && Object.keys(rootResult.parsed).length > 0) {
        console.log(`✅ Loaded .env from: ${rootEnvPath} (Project root)`);
        console.log(`   Found ${Object.keys(rootResult.parsed).length} variables`);
        envLoaded = true;
    }
}
if (!envLoaded) {
    console.warn(`⚠️  Could not find .env file. Tried:`);
    console.warn(`   1. ${desktopEnvPath}`);
    console.warn(`   2. ${rootEnvPath}`);
}
// Log environment status
if (process.env.GEMINI_API_KEY) {
    console.log('✅ GEMINI_API_KEY loaded from .env');
}
else {
    console.warn('⚠️  WARNING: GEMINI_API_KEY not found in .env file');
    console.warn('   AI features will not work. Please add GEMINI_API_KEY to your .env file');
}
let mainWindow = null;
// Setup IPC handlers
setupIPC();
function createWindow() {
    // Get logo path - try both source and compiled locations
    const logoPathSource = path.join(projectRoot, 'frontend', 'public', 'lemonalogo.png');
    const logoPathDist = path.join(__dirname, '../../frontend/public/lemonalogo.png');
    // Use whichever exists
    let iconPath = undefined;
    if (existsSync(logoPathSource)) {
        iconPath = logoPathSource;
    }
    else if (existsSync(logoPathDist)) {
        iconPath = logoPathDist;
    }
    if (iconPath) {
        console.log(`✅ Using icon: ${iconPath}`);
    }
    else {
        console.warn(`⚠️  Icon not found. Tried: ${logoPathSource} and ${logoPathDist}`);
    }
    mainWindow = new BrowserWindow({
        width: 1400,
        height: 900,
        icon: iconPath, // Set window icon (Windows/Linux)
        frame: false, // Remove default frame completely - we use custom title bar
        titleBarStyle: 'hidden', // Hide default title bar (macOS)
        // Note: titleBarOverlay only works on macOS, removed for Windows compatibility
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, '../../preload/index.js'),
        },
    });
    // 开发环境：加载 Vite dev server
    if (process.env.NODE_ENV === 'development' || !app.isPackaged) {
        mainWindow.loadURL('http://localhost:5173');
        mainWindow.webContents.openDevTools();
    }
    else {
        // 生产环境：加载打包后的文件
        mainWindow.loadFile(path.join(__dirname, '../../frontend/dist/index.html'));
    }
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
// Migrate existing documents and create window on app ready
app.whenReady().then(async () => {
    // Migrate documents first
    await migrateDocuments();
    // Then create window
    createWindow();
    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});
app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});
