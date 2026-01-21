# Lemona Packaging Guide

Complete guide for packaging and distributing the Lemona desktop application.

## Table of Contents

1. [Quick Start](#quick-start)
2. [Prerequisites](#prerequisites)
3. [Platform-Specific Instructions](#platform-specific-instructions)
4. [Build Process Details](#build-process-details)
5. [Distribution](#distribution)
6. [Troubleshooting](#troubleshooting)

---

## Quick Start

```bash
# Navigate to desktop directory
cd desktop

# Build for your platform
npm run dist:win    # Windows
npm run dist:mac    # macOS
npm run dist:linux  # Linux
npm run dist        # Current platform
```

The packaged application will be in `desktop/release/` directory.

---

## Prerequisites

### Required for All Platforms
- **Node.js 18+** and **npm 9+**
- All dependencies installed:
  ```bash
  cd frontend && npm install
  cd ../desktop && npm install
  ```

### Platform-Specific Requirements

#### Windows
- No additional tools required
- For code signing: Windows certificate file (`.pfx`)

#### macOS
- **macOS** (cannot build macOS apps on other platforms)
- Xcode Command Line Tools (usually pre-installed)
- For code signing: Apple Developer certificate

#### Linux
- No additional tools required
- AppImage works on most Linux distributions

---

## Platform-Specific Instructions

### Windows

**Build Command:**
```bash
cd desktop
npm run dist:win
```

**Output:**
- `release/Lemona-0.1.0-x64.exe` - NSIS installer

**Installer Features:**
- Customizable installation directory
- Desktop shortcut creation
- Start menu shortcut
- Uninstaller included

**Testing:**
1. Run the generated `.exe` file
2. Install to a test directory
3. Verify the application launches correctly
4. Test uninstallation

### macOS

**Build Command:**
```bash
cd desktop
npm run dist:mac
```

**Output:**
- `release/Lemona-0.1.0-x64.dmg` - Intel Macs
- `release/Lemona-0.1.0-arm64.dmg` - Apple Silicon Macs
- Or universal build if configured

**DMG Features:**
- Drag-and-drop installation
- Applications folder shortcut
- Standard macOS disk image

**Code Signing (Recommended for Distribution):**
```bash
export CSC_LINK="/path/to/certificate.p12"
export CSC_KEY_PASSWORD="your_password"
npm run dist:mac
```

**Notarization (Required for macOS Gatekeeper):**
After building, use `xcrun notarytool` or configure in `package.json`:
```json
"afterSign": "scripts/notarize.js"
```

### Linux

**Build Command:**
```bash
cd desktop
npm run dist:linux
```

**Output:**
- `release/Lemona-0.1.0-x64.AppImage` - Portable application

**AppImage Features:**
- No installation required
- Portable (can run from USB)
- Works on most Linux distributions
- Self-contained

**Usage:**
```bash
chmod +x Lemona-0.1.0-x64.AppImage
./Lemona-0.1.0-x64.AppImage
```

---

## Build Process Details

### What Happens During Build

The `npm run dist:*` commands execute:

1. **Pre-build cleanup**: Removes problematic dependencies (canvas from pdfjs-dist)
2. **Frontend build**: 
   - Compiles TypeScript
   - Bundles React app with Vite
   - Outputs to `frontend/dist/`
3. **Desktop build**:
   - Compiles main process TypeScript (`main/`)
   - Compiles preload script TypeScript (`preload/`)
   - Outputs to `desktop/dist/`
4. **Packaging**:
   - Electron Builder packages everything
   - Includes frontend build as extra resource
   - Creates platform-specific installer
   - Outputs to `desktop/release/`

### Build Configuration

Located in `desktop/package.json` → `"build"`:

```json
{
  "appId": "com.lemona.desktop",
  "productName": "Lemona",
  "directories": {
    "output": "release",
    "buildResources": "build"
  },
  "files": [
    "dist/**/*",
    "node_modules/**/*",
    "!node_modules/**/*.{md,ts,tsx}",
    "!**/*.{ts,tsx,map}"
  ],
  "asar": true,
  "extraResources": [
    {
      "from": "../frontend/dist",
      "to": "frontend/dist"
    }
  ]
}
```

### Included Files

- Compiled JavaScript from `desktop/dist/`
- Node modules (excluding source files)
- Frontend build from `frontend/dist/`
- Application icons
- Resources (fonts, etc.)

### Excluded Files

- TypeScript source files (`.ts`, `.tsx`)
- Source maps (`.map`)
- Test files
- Documentation (`.md`)
- Backend directory (if exists)

---

## Distribution

### File Sizes

Expected sizes:
- **Windows**: ~150-250 MB (unpacked)
- **macOS**: ~150-250 MB (DMG)
- **Linux**: ~150-250 MB (AppImage)

### Version Management

Update version in `desktop/package.json`:
```json
{
  "version": "0.1.0"
}
```

The version is automatically included in:
- Installer filename
- Application metadata
- About dialog

### Release Checklist

- [ ] Update version number
- [ ] Test build on target platform
- [ ] Verify all features work
- [ ] Check file size is reasonable
- [ ] Test installation/uninstallation
- [ ] Code sign (if applicable)
- [ ] Notarize macOS build (if applicable)
- [ ] Create release notes
- [ ] Upload to distribution platform

### Distribution Platforms

**Windows:**
- Microsoft Store (requires conversion to MSIX)
- Direct download
- GitHub Releases

**macOS:**
- Mac App Store (requires additional configuration)
- Direct download
- GitHub Releases

**Linux:**
- AppImage Hub
- GitHub Releases
- Snap Store (requires snap packaging)
- Flatpak (requires flatpak packaging)

---

## Troubleshooting

### Common Issues

#### Build Fails with "Cannot find module"

**Solution:**
```bash
# Reinstall dependencies
cd frontend && npm install
cd ../desktop && npm install
```

#### Build Output is Too Large

**Check:**
- Ensure `files` array in `package.json` excludes unnecessary files
- Verify `asar: true` is set (creates archive)
- Check for large unnecessary dependencies

#### Windows: Installer Doesn't Run

**Possible causes:**
- Antivirus blocking unsigned executable
- Missing dependencies
- Corrupted build

**Solution:**
- Code sign the application
- Test on clean Windows machine
- Check Windows Event Viewer for errors

#### macOS: "App is damaged" Error

**Cause:** Gatekeeper blocking unsigned app

**Solution:**
```bash
# For testing only (not for distribution)
xattr -cr /path/to/Lemona.app
```

For distribution, code sign and notarize.

#### Linux: AppImage Won't Execute

**Solution:**
```bash
chmod +x Lemona-0.1.0-x64.AppImage
```

#### Build Hangs or Takes Too Long

**Possible causes:**
- Large node_modules
- Network issues downloading dependencies
- Insufficient disk space

**Solution:**
- Check disk space
- Clear npm cache: `npm cache clean --force`
- Check network connection

### Debugging Builds

**Enable verbose logging:**
```bash
DEBUG=electron-builder npm run dist:win
```

**Check build configuration:**
```bash
cd desktop
npx electron-builder --dir  # Build without packaging (faster)
```

**Inspect packaged app:**
- Windows: Check `release/win-unpacked/`
- macOS: Check `release/mac/`
- Linux: Check `release/linux-unpacked/`

### Getting Help

If you encounter issues:
1. Check Electron Builder documentation: https://www.electron.build/
2. Review build logs in `desktop/release/builder-debug.yml`
3. Check Electron Builder effective config: `desktop/release/builder-effective-config.yaml`

---

## Advanced Configuration

### Custom Icons

Create platform-specific icons:
- Windows: `desktop/build/icon.ico` (256x256+, multi-size)
- macOS: `desktop/build/icon.icns` (512x512+)
- Linux: `desktop/build/icon.png` (512x512)

Update `package.json`:
```json
{
  "build": {
    "win": {
      "icon": "build/icon.ico"
    },
    "mac": {
      "icon": "build/icon.icns"
    }
  }
}
```

### Environment Variables

Set before building:
```bash
# macOS code signing
export CSC_LINK="/path/to/cert.p12"
export CSC_KEY_PASSWORD="password"

# Windows code signing
export WIN_CSC_LINK="/path/to/cert.pfx"
export WIN_CSC_KEY_PASSWORD="password"

# Build
npm run dist
```

### Multi-Architecture Builds

**macOS (Universal):**
Already configured for x64 and arm64 in `package.json`.

**Linux:**
Build separately for each architecture:
```bash
npm run dist:linux -- --x64
npm run dist:linux -- --arm64
```

---

## Additional Resources

- [Electron Builder Documentation](https://www.electron.build/)
- [Electron Documentation](https://www.electronjs.org/docs)
- [NSIS Installer Guide](https://nsis.sourceforge.io/Docs/)
- [macOS Code Signing](https://developer.apple.com/documentation/security/notarizing_macos_software_before_distribution)
- [AppImage Guide](https://docs.appimage.org/)
