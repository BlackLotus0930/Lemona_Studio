import { app, BrowserWindow, session } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import { config } from 'dotenv';
import { existsSync } from 'fs';
import { setupIPC } from './ipc.js';
import { migrateDocuments } from './services/migration.js';
import { documentService } from './services/documentService.js';

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
} else {
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

// Note: API keys are now stored in localStorage via the Settings modal
// Users can configure their Google API key in Settings > API Keys
console.log('✅ API keys are configured via Settings > API Keys in the application');

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

  // 开发环境：加载 Vite dev server
  if (process.env.NODE_ENV === 'development' || !app.isPackaged) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    // 生产环境：加载打包后的文件
    mainWindow.loadFile(path.join(__dirname, '../../frontend/dist/index.html'));
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
  
  // Clean up orphaned/corrupted documents
  console.log('🧹 Cleaning up orphaned documents...');
  const cleanupResult = await documentService.cleanupOrphanedFiles();
  if (cleanupResult.removed > 0) {
    console.log(`✅ Removed ${cleanupResult.removed} orphaned/corrupted document(s)`);
  }
  if (cleanupResult.errors.length > 0) {
    console.warn(`⚠️  Cleanup errors:`, cleanupResult.errors);
  }
  
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

