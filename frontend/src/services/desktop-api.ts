// Desktop API - Uses Electron IPC instead of HTTP
import { Project, AIChatMessage } from '@shared/types'

// Check if running in Electron
const isElectron = typeof window !== 'undefined' && window.electron !== undefined

// Helper to invoke IPC or fallback to HTTP
async function invokeOrFetch(channel: string, ...args: any[]): Promise<any> {
  if (isElectron) {
    return window.electron!.invoke(channel, ...args)
  } else {
    // Fallback for Web (will be disabled, but kept for reference)
    throw new Error(`IPC channel ${channel} not available in web mode`)
  }
}

export const documentApi = {
  get: (id: string) => invokeOrFetch('document:getById', id),
  create: (title: string, folder?: 'library' | 'project') => invokeOrFetch('document:create', title, folder),
  update: (id: string, content: string) => invokeOrFetch('document:update', id, content),
  updateTitle: (id: string, title: string) => invokeOrFetch('document:updateTitle', id, title),
  delete: (id: string) => invokeOrFetch('document:delete', id),
  list: () => invokeOrFetch('document:getAll'),
  uploadFile: (filePath: string, fileName: string, folder: 'library' | 'project') => 
    invokeOrFetch('document:uploadFile', filePath, fileName, folder),
}

export const aiApi = {
  chat: (message: string, documentContent?: string, documentId?: string, provider?: 'gemini' | 'ollama' | 'auto') =>
    invokeOrFetch('ai:chat', message, documentContent, documentId, provider),
  batchQuestions: (questions: string[], documentContent?: string, documentId?: string, provider?: 'gemini' | 'ollama' | 'auto') =>
    invokeOrFetch('ai:batchQuestions', questions, documentContent, documentId, provider),
  autocomplete: (text: string, cursorPosition: number, documentContent?: string, documentId?: string, provider?: 'gemini' | 'ollama' | 'auto') =>
    invokeOrFetch('ai:autocomplete', text, cursorPosition, documentContent, documentId, provider),
  generateTitle: (documentContent: string, provider?: 'gemini' | 'ollama' | 'auto') =>
    invokeOrFetch('ai:generateTitle', documentContent, provider),
  rephraseText: (text: string, instruction: string, provider?: 'gemini' | 'ollama' | 'auto') =>
    invokeOrFetch('ai:rephraseText', text, instruction, provider),
  getStatus: () =>
    invokeOrFetch('ai:getStatus'),
  streamChat: async (message: string, documentContent?: string, documentId?: string, chatHistory?: AIChatMessage[], useWebSearch?: boolean, modelName?: string, provider?: 'gemini' | 'ollama' | 'auto'): Promise<Response> => {
    if (!isElectron) {
      throw new Error('Streaming not available in web mode')
    }

    // Create a ReadableStream that reads from IPC events
    const stream = new ReadableStream({
      async start(controller) {
        try {
          // Start stream and get streamId
          const { streamId } = await window.electron!.invoke('ai:streamChat', message, documentContent, documentId, chatHistory, useWebSearch, modelName, provider)
          console.log('[Desktop API] Stream started with ID:', streamId)
          
          // Note: preload script strips the event, so callbacks receive args directly
          const onChunk = (receivedStreamId: string, chunk: string) => {
            console.log('[Desktop API] Received chunk for stream:', receivedStreamId)
            if (receivedStreamId === streamId) {
              // Format as SSE (Server-Sent Events) for compatibility with existing code
              const sseData = `data: ${JSON.stringify({ chunk })}\n\n`
              controller.enqueue(new TextEncoder().encode(sseData))
            }
          }
          
          const onEnd = (receivedStreamId: string) => {
            console.log('[Desktop API] Stream ended:', receivedStreamId)
            if (receivedStreamId === streamId) {
              controller.close()
              cleanup()
            }
          }
          
          const onError = (receivedStreamId: string, error: string) => {
            console.log('[Desktop API] Stream error:', receivedStreamId, error)
            if (receivedStreamId === streamId) {
              controller.error(new Error(error))
              cleanup()
            }
          }
          
          const cleanup = () => {
            window.electron!.removeListener('ai:streamChunk', onChunk)
            window.electron!.removeListener('ai:streamEnd', onEnd)
            window.electron!.removeListener('ai:streamError', onError)
          }
          
          window.electron!.on('ai:streamChunk', onChunk)
          window.electron!.on('ai:streamEnd', onEnd)
          window.electron!.on('ai:streamError', onError)
        } catch (error) {
          controller.error(error)
        }
      }
    })

    // Return a Response-like object
    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
      },
    })
  },
}

export const exportApi = {
  export: (documentId: string, format: 'pdf' | 'docx', filename?: string) =>
    invokeOrFetch('export:export', documentId, format, filename),
}

export const chatApi = {
  getChatHistory: (documentId: string) => invokeOrFetch('chat:getHistory', documentId),
  getChat: (documentId: string, chatId: string) => invokeOrFetch('chat:getChat', documentId, chatId),
  addMessage: (documentId: string, chatId: string, message: AIChatMessage) =>
    invokeOrFetch('chat:addMessage', documentId, chatId, message),
  updateMessage: (documentId: string, chatId: string, messageId: string, content: string) =>
    invokeOrFetch('chat:updateMessage', documentId, chatId, messageId, content),
  deleteChat: (documentId: string, chatId: string) => invokeOrFetch('chat:deleteChat', documentId, chatId),
}

export const projectApi = {
  getAll: () => invokeOrFetch('project:getAll'),
  getById: (id: string) => invokeOrFetch('project:getById', id),
  create: (title: string, description?: string, intent?: string) => invokeOrFetch('project:create', title, description, intent),
  update: (id: string, updates: Partial<Pick<Project, 'title' | 'description' | 'intent'>>) => invokeOrFetch('project:update', id, updates),
  updateIntent: (id: string, intent: string) => invokeOrFetch('project:updateIntent', id, intent),
  addDocument: (projectId: string, documentId: string, order?: number) => invokeOrFetch('project:addDocument', projectId, documentId, order),
  removeDocument: (projectId: string, documentId: string) => invokeOrFetch('project:removeDocument', projectId, documentId),
  reorderDocuments: (projectId: string, documentIds: string[]) => invokeOrFetch('project:reorderDocuments', projectId, documentIds),
  getDocuments: (projectId: string) => invokeOrFetch('project:getDocuments', projectId),
  delete: (id: string) => invokeOrFetch('project:delete', id),
}

