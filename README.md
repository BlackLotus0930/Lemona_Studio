# Lemona

A document-editing workspace combined with an AI reasoning assistant, similar to how Cursor combines an IDE with an AI coding partner.

## Features

- **Document Editor**: Google Docs-like rich text editor with sections, outline view, and drag-and-drop
- **AI Assistant Panel**: Cursor-like AI assistant for writing, reasoning, and editing
- **Autocomplete**: Real-time writing suggestions powered by Gemini 2.5 Flash
- **Export**: Download documents as PDF or DOCX with exact formatting

## Setup

### Prerequisites

- Node.js 18+ and npm

### Installation

1. Install frontend dependencies:
```bash
cd frontend
npm install
```

2. Install backend dependencies:
```bash
cd backend
npm install
```

3. Create `.env` file in backend directory:
```
GEMINI_API_KEY=your_gemini_api_key_here
PORT=3000
```

### Running

1. Start the backend server:
```bash
cd backend
npm run dev
```

2. Start the frontend (in a new terminal):
```bash
cd frontend
npm run dev
```

3. Open http://localhost:5173 in your browser

## Project Structure

- `frontend/` - React + Vite + TypeScript frontend
- `backend/` - Node.js + Express + TypeScript backend
- `shared/` - Shared TypeScript types

