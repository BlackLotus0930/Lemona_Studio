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
}

export interface Section {
  id: string;
  title: string;
  content: string;
  order: number;
}

export interface AIChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
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

