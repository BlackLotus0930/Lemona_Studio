# Lemona

**An Integrated Writing Environment**

Lemona combines a sophisticated text editor with context-aware AI assistance and visual knowledge management.

---

## Features

### Rich Text Editor
- Professional-grade editing with formatting, tables, lists, and more
- Hierarchical sections with drag-and-drop reordering
- Interactive outline for quick navigation
- Multiple font support with variable font weights
- Auto-save with version history

### WorldLab Visual Workspace
- Node-based canvas for organizing ideas
- Interactive property editing
- Terminal interface for advanced operations
- Document linking

### Context-Aware AI Assistant
- AI understands your entire project workspace
- Multi-threaded chat interface
- File references with `@library` and `@workspace`
- Step-by-step reasoning mode
- Batch query processing
- Real-time streaming responses

### Intelligent Autocomplete
- Context-aware writing suggestions as you type
- Fast, accurate completions
- Tab to accept workflow

### Semantic Search
- AI-powered search across all documents
- Multi-step search with relevance assessment
- Separate indexes per project
- Efficient incremental updates
- Full PDF and DOCX support

### Professional Export
- True WYSIWYG rendering
- High-fidelity PDF generation
- Microsoft Word compatibility
- Formatting preservation (fonts, tables, images, links)

### Desktop-First Architecture
- Native apps for Windows, macOS, and Linux
- Local data storage
- Offline capable
- Privacy-focused design

---

## Installation

### Prerequisites
- Node.js 18+ and npm 9+
- Google Gemini API key ([Get one here](https://makersuite.google.com/app/apikey))

### Setup

**1. Install Dependencies**
```bash
# Frontend
cd frontend && npm install

# Backend
cd backend && npm install

# Desktop
cd desktop && npm install
```

**2. Configure Environment**

Create `backend/.env`:
```env
GEMINI_API_KEY=your_key_here
PORT=3000
```

**3. Start Development**
```bash
# Terminal 1: Backend
cd backend && npm run dev

# Terminal 2: Frontend
cd frontend && npm run dev

# Terminal 3: Desktop
cd desktop && npm run dev
```

Access at `http://localhost:5173`

### Build Desktop App

Lemona uses **Electron Builder** to package the application for distribution. The build process automatically:
1. Builds the frontend React app
2. Compiles TypeScript for the Electron main process and preload scripts
3. Packages everything into platform-specific installers

#### Prerequisites

- **Node.js 18+** and **npm 9+**
- All dependencies installed (`npm install` in `frontend/` and `desktop/`)
- **Windows**: No additional tools needed
- **macOS**: Requires Xcode Command Line Tools (for code signing, optional)
- **Linux**: No additional tools needed

#### Building for Your Platform

```bash
cd desktop

# Windows (creates NSIS installer)
npm run dist:win

# macOS (creates DMG)
npm run dist:mac

# Linux (creates AppImage)
npm run dist:linux

# Build for current platform
npm run dist
```

#### Output Location

All packaged applications are saved to `desktop/release/`:

- **Windows**: `Lemona-0.1.0-x64.exe` (NSIS installer)
- **macOS**: `Lemona-0.1.0-x64.dmg` or `Lemona-0.1.0-arm64.dmg`
- **Linux**: `Lemona-0.1.0-x64.AppImage`

#### Build Configuration

The packaging is configured in `desktop/package.json` under the `"build"` field:

- **Windows**: NSIS installer with customizable installation directory
- **macOS**: DMG with support for x64 and ARM64 architectures
- **Linux**: AppImage format for universal compatibility
- **Icons**: Uses `frontend/public/lemonalogo.ico` (Windows) and `lemonalogo.png` (macOS/Linux)

#### Advanced Options

**Build only (no packaging):**
```bash
cd desktop
npm run build:all  # Builds frontend + desktop TypeScript
```

**Development mode:**
```bash
cd desktop
npm run dev  # Runs Electron with hot reload
```

#### Code Signing (Optional)

For production releases, you may want to sign your application:

- **Windows**: Configure in `package.json` → `build.win.certificateFile` and `certificatePassword`
- **macOS**: Set `CSC_LINK` and `CSC_KEY_PASSWORD` environment variables
- **Linux**: Not required for AppImage

#### Troubleshooting

- **Build fails**: Ensure all dependencies are installed (`npm install` in both `frontend/` and `desktop/`)
- **Large package size**: Normal for Electron apps (~100-200MB). The `files` array in `package.json` excludes unnecessary files
- **Missing icons**: Ensure `frontend/public/lemonalogo.ico` and `lemonalogo.png` exist

---

## Quick Start

### First Document
1. Click **New Document**
2. Start typing—auto-save is automatic
3. Use toolbar or keyboard shortcuts for formatting
4. Create sections via outline panel

### AI Assistance
1. Open **AI Panel** from sidebar
2. Ask questions—AI has full project context
3. Reference files: `@library paper.pdf` or `@workspace doc.md`
4. Use tabs for multiple conversations

### File Management
1. Navigate to **Library** folder
2. Upload PDFs/DOCX via drag-and-drop
3. Files auto-index for search
4. Full-screen PDF viewer available

### Export
1. Click **Export** in toolbar
2. Choose PDF or DOCX
3. Formatting preserved exactly

---

## Architecture

```
Lemona/
├── frontend/          # React + TypeScript UI
├── desktop/          # Electron application
├── backend/          # API server
└── shared/           # Common types
```

---

## Usage

### Editor
- **Sections**: Press `/` for command menu
- **Formatting**: Standard shortcuts (Ctrl/Cmd+B, etc.)
- **Images**: Drag-and-drop or paste

### AI Panel
- **Context**: Auto-includes current document
- **File Mentions**: Type `@` to reference files
- **Reasoning**: Toggle for detailed explanations

### WorldLab
- **Nodes**: Click canvas to create
- **Connections**: Drag from node handles
- **Properties**: Double-click to edit

---

## Development

### Guidelines
- TypeScript strict mode
- Functional React patterns
- Service-oriented architecture

### Reporting Issues
Include:
- Description
- Reproduction steps
- Expected vs actual behavior
- Environment details

---

## License

Proprietary - All Rights Reserved

---

## Roadmap

- Real-time collaboration
- Mobile apps
- Plugin system
- Advanced version control
- Team workspaces

---

**Built for writers who think visually**