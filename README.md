# Lemona 🍋

A document-editing workspace combined with an AI reasoning assistant, similar to how Cursor combines an IDE with an AI coding partner. Lemona provides a powerful writing environment where you can create, edit, and collaborate on documents with intelligent AI assistance.

## ✨ Features

- **📝 Rich Text Editor**: Google Docs-like editor with sections, outline view, and drag-and-drop functionality
- **🤖 AI Assistant Panel**: Cursor-inspired AI companion for writing, reasoning, and editing assistance
- **⚡ Real-time Autocomplete**: Intelligent writing suggestions powered by Gemini 2.5 Flash
- **📄 Export Capabilities**: Download documents as PDF or DOCX with exact formatting preservation
- **🔍 Semantic Search**: Search across your document library using AI-powered semantic search
- **📁 Project Management**: Organize documents into projects with shared context and chat history
- **📚 Document Library**: Manage and search through your document collection
- **🖥️ Desktop Application**: Native Electron app for Windows, macOS, and Linux

## 🚀 Quick Start

### Prerequisites

- Node.js 18+ and npm

### Web Application Setup

1. **Install frontend dependencies:**
   ```bash
   cd frontend
   npm install
   ```

2. **Install backend dependencies:**
   ```bash
   cd backend
   npm install
   ```

3. **Configure environment variables:**
   
   Create a `.env` file in the `backend` directory:
   ```env
   GEMINI_API_KEY=your_gemini_api_key_here
   PORT=3000
   ```
   
   Get your Gemini API key from [Google AI Studio](https://makersuite.google.com/app/apikey).

4. **Start the backend server:**
   ```bash
   cd backend
   npm run dev
   ```

5. **Start the frontend (in a new terminal):**
   ```bash
   cd frontend
   npm run dev
   ```

6. **Open your browser:**
   
   Navigate to `http://localhost:5173`

### Desktop Application

Lemona also includes a desktop application built with Electron for a native experience.

**Development:**

1. Build and start the frontend (see Web Application Setup steps 1-2)
2. Start the Electron app:
   ```bash
   cd desktop
   npm install
   npm run dev
   ```

**Building for Production:**

- **Windows:** `npm run dist:win` (creates NSIS installer)
- **macOS:** `npm run dist:mac` (creates DMG)
- **Linux:** `npm run dist:linux` (creates AppImage)

See `desktop/README.md` for detailed desktop development instructions.

## 📂 Project Structure

```
Lemona/
├── frontend/          # React + Vite + TypeScript frontend
│   ├── src/
│   │   ├── components/    # React components
│   │   ├── pages/         # Page components
│   │   ├── services/      # API services
│   │   └── contexts/      # React contexts
├── backend/           # Node.js + Express + TypeScript backend
│   ├── src/
│   │   ├── routes/        # API routes
│   │   └── services/      # Business logic services
├── desktop/           # Electron desktop application
│   ├── main/              # Main process code
│   ├── preload/           # Preload scripts
│   └── resources/         # App resources
└── shared/            # Shared TypeScript types
```

## 🛠️ Technology Stack

- **Frontend:** React, TypeScript, Vite, TipTap, Material-UI
- **Backend:** Node.js, Express, TypeScript
- **Desktop:** Electron
- **AI:** Google Gemini API
- **Storage:** File-based JSON storage (with vector indexing for semantic search)

## 📖 Usage

### Creating Documents

1. Click "New Document" to create a new document
2. Use the rich text editor to write and format your content
3. Organize content using sections and the outline view

### Using the AI Assistant

1. Open the AI panel from the sidebar
2. Ask questions or request assistance with your writing
3. The AI has context about your current document and project
4. Chat history is preserved per project

### Autocomplete

- As you type, Lemona provides intelligent suggestions
- Press Tab to accept suggestions
- Suggestions are powered by Gemini 2.5 Flash

### Exporting Documents

- Click the export button in the document toolbar
- Choose PDF or DOCX format
- Your formatting will be preserved exactly

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## 📝 License

ISC

---

Built with ❤️ for writers and thinkers who want AI assistance without losing their voice.
