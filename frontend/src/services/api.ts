// Desktop Mode: Use IPC instead of HTTP
// This file re-exports from desktop-api.ts
// Web mode code is preserved in comments below for reference

// Always export from desktop-api.ts (TypeScript needs static exports)
export * from './desktop-api'

// Web mode - DISABLED for Desktop focus
// Keeping HTTP API code below for reference only
// To use Web mode, uncomment and replace the export above

/*
import axios from 'axios'
import { Document, AIChatMessage, AIQuestion, AutocompleteSuggestion } from '@shared/types'

const api = axios.create({
  baseURL: '/api',
  headers: {
    'Content-Type': 'application/json',
  },
})

export const documentApi = {
  get: (id: string) => api.get<Document>(`/documents/${id}`),
  create: (title: string) => api.post<Document>('/documents', { title }),
  update: (id: string, content: string) => 
    api.put<Document>(`/documents/${id}`, { content }),
  updateTitle: (id: string, title: string) =>
    api.put<Document>(`/documents/${id}`, { title }),
  delete: (id: string) => api.delete(`/documents/${id}`),
  list: () => api.get<Document[]>('/documents'),
}

export const aiApi = {
  chat: (message: string, documentContent?: string) =>
    api.post<AIChatMessage>('/ai/chat', { message, documentContent }),
  batchQuestions: (questions: string[], documentContent?: string) =>
    api.post<AIQuestion[]>('/ai/batch-questions', { questions, documentContent }),
  autocomplete: (text: string, cursorPosition: number, documentContent?: string) =>
    api.post<AutocompleteSuggestion>('/ai/autocomplete', { 
      text, 
      cursorPosition, 
      documentContent 
    }),
  streamChat: (message: string, documentContent?: string) =>
    fetch('/api/ai/chat/stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, documentContent }),
    }),
}

export const exportApi = {
  export: (documentId: string, format: 'pdf' | 'docx', filename?: string) =>
    api.post(`/export/${documentId}`, { format, filename }, { 
      responseType: 'blob' 
    }),
}

export const chatApi = {
  getChatHistory: (documentId: string) =>
    api.get<{ [chatId: string]: AIChatMessage[] }>(`/chat/${documentId}`),
  getChat: (documentId: string, chatId: string) =>
    api.get<AIChatMessage[]>(`/chat/${documentId}/${chatId}`),
  addMessage: (documentId: string, chatId: string, message: AIChatMessage) =>
    api.post(`/chat/${documentId}/${chatId}`, message),
  updateMessage: (documentId: string, chatId: string, messageId: string, content: string) =>
    api.put(`/chat/${documentId}/${chatId}/${messageId}`, { content }),
  deleteChat: (documentId: string, chatId: string) =>
    api.delete(`/chat/${documentId}/${chatId}`),
}

export default api
*/
