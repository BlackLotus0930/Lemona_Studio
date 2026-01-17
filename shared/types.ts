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
  folder?: 'library' | 'project' | 'worldlab'; // Optional: Folder this document belongs to ('library', 'project', or 'worldlab')
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
  choices?: Array<{id: string; label: string; text: string}>; // Multiple choice options (A, B, C, etc.)
  reasoningMetadata?: {
    actions?: {
      [action: string]: {
        fileCount: number; // Number of files accessed by this action
        fileIds?: string[]; // File IDs accessed by this action
      };
    };
  };
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

// WorldLab Types
export interface WorldLabMetadata {
  author?: string;
  theme?: string;
  tags?: string[];
  version?: string;
  createdAt?: string;
  updatedAt?: string;
  description?: string;
  viewport?: {
    x: number;
    y: number;
    zoom: number;
  };
}

export interface WorldLabNode {
  id: string; // Node ID (corresponds to filename without .md extension)
  label: string; // Display label (usually elementName or extracted from file)
  category?: string; // Category: 人物, 事件, 地点, 规则, 设定, 概念, 想法, etc.
  elementName?: string; // Element name
  position: { x: number; y: number }; // Position on canvas
  data?: {
    // Additional node data
    description?: string;
    content?: string; // File content preview or full content
    [key: string]: any;
  };
}

export interface WorldLabEdge {
  id: string; // Edge ID
  source: string; // Source node ID
  target: string; // Target node ID
  type?: string; // Edge type (default, smoothstep, step, etc.)
  label?: string; // Optional edge label
  animated?: boolean; // Whether edge is animated
  style?: Record<string, any>; // Edge style
  sourceHandle?: string; // Source handle ID (e.g., 'top-target', 'bottom-source', etc.)
  targetHandle?: string; // Target handle ID (e.g., 'top-target', 'bottom-source', etc.)
}

export interface WorldLab {
  labPath: string; // Full path to the Lab directory
  labName: string; // Lab name (folder name)
  metadata: WorldLabMetadata;
  nodes: WorldLabNode[];
  edges: WorldLabEdge[];
}

// AI Reasoning Types
export interface ReasoningStep {
  step: number;
  action: 'search' | 'read' | 'browse';
  query?: string;
  results?: any[]; // SearchResult[] - using any to avoid circular dependency
  documentId?: string;
  budgetRemaining: number;
  relevanceScore?: number; // AI-assessed relevance score (0-1)
  needsMoreContext?: boolean; // AI assessment: whether more context is needed
  informationGap?: string; // AI-identified information gap (if any)
}
