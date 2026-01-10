export interface Project {
  id: string;
  title: string;
  description?: string;
  intent?: string; // README/Intent content for AI to understand overall project goals
  createdAt: string;
  updatedAt: string;
  // Document IDs in this project (ordered)
  documentIds: string[];
  chatHistory?: { [chatId: string]: AIChatMessage[] }; // Chat history per chat thread (shared across all documents in project)
}

export interface Document {
  id: string;
  title: string;
  content: string; // TipTap JSON format
  createdAt: string;
  updatedAt: string;
  // Project management fields
  projectId?: string; // Optional: ID of the project this document belongs to
  dependencies?: string[]; // Optional: Array of document IDs this document depends on
  order?: number; // Optional: Order within project (for sorting)
  folder?: 'library' | 'project'; // Optional: Folder this document belongs to ('library' or 'project')
  // PDF text extraction
  pdfText?: PDFTextContent; // Optional: Extracted text from PDF files, organized by page/paragraph
  // Logical deletion
  deleted?: boolean; // Optional: Whether this document has been logically deleted
  // Metadata for indexing and change detection
  metadata?: {
    contentHash?: string; // SHA-256 hash of file content (for change detection)
  };
}

export interface PDFTextContent {
  pages: PDFPageText[]; // Text content per page
  fullText: string; // Full concatenated text for quick search
  extractedAt?: string; // Timestamp when text was extracted
}

export interface PDFPageText {
  pageNumber: number; // 1-indexed page number
  paragraphs: string[]; // Text paragraphs on this page
  fullText: string; // Full text of the page
}

export interface Section {
  id: string;
  title: string;
  content: string;
  order: number;
}

export interface ChatAttachment {
  id: string;
  type: 'image' | 'pdf';
  name: string;
  data: string; // base64 encoded data or file path
  mimeType?: string; // for images: image/png, image/jpeg, etc.
}

export interface AIChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  attachments?: ChatAttachment[]; // Optional attachments (images or PDFs)
}

export interface AIQuestion {
  id: string;
  question: string;
  answer?: string;
  status: 'pending' | 'answering' | 'completed';
}

export interface AutocompleteSuggestion {
  text: string;
  start: number;
  end: number;
}

export interface ExportOptions {
  format: 'pdf' | 'docx';
  filename?: string;
}

export interface IndexingStatus {
  documentId: string;
  status: 'pending' | 'indexing' | 'completed' | 'error';
  chunksCount?: number;
  indexedAt?: string;
  error?: string;
  contentHash?: string; // File content hash when indexed (for change detection)
}

export interface LibrarySearchResult {
  chunk: {
    id: string;
    fileId: string;
    fileName: string;
    text: string;
    chunkIndex: number;
  };
  score: number;
}

export interface Commit {
  id: string;
  projectId: string;
  parentId: string | null; // Parent commit ID (null for first commit)
  timestamp: string; // ISO string, used as display name
  documentSnapshots: DocumentSnapshot[];
  createdAt: string;
}

export interface DocumentSnapshot {
  documentId: string;
  title: string;
  content: string; // Full TipTap JSON content
}

