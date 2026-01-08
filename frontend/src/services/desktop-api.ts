// Desktop API - Uses Electron IPC instead of HTTP
import { Project, AIChatMessage } from '@shared/types'

// Check if running in Electron
const isElectron = typeof window !== 'undefined' && window.electron !== undefined

// Helper to get Google API key from localStorage
function getApiKey(): string {
  try {
    return localStorage.getItem('googleApiKey') || ''
  } catch (error) {
    console.error('Failed to get API key from localStorage:', error)
    return ''
  }
}

// Helper to get OpenAI API key from localStorage
function getOpenaiApiKey(): string {
  try {
    return localStorage.getItem('openaiApiKey') || ''
  } catch (error) {
    console.error('Failed to get OpenAI API key from localStorage:', error)
    return ''
  }
}

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
  updateFolder: (id: string, folder: 'library' | 'project') => invokeOrFetch('document:updateFolder', id, folder),
  delete: (id: string) => invokeOrFetch('document:delete', id),
  list: () => invokeOrFetch('document:getAll'),
  uploadFile: (filePath: string, fileName: string, folder: 'library' | 'project', projectId?: string) => 
    invokeOrFetch('document:uploadFile', filePath, fileName, folder, projectId),
  extractPDFText: (documentId: string) => invokeOrFetch('pdf:extractText', documentId),
  getPDFFileContent: (documentId: string) => invokeOrFetch('pdf:getFileContent', documentId),
  getImageFileContent: (documentId: string, imageId: string) => invokeOrFetch('image:getFileContent', documentId, imageId),
}

export const docxApi = {
  parse: (filePath: string) => invokeOrFetch('docx:parse', filePath),
  splitAndImport: (filePath: string, fileName: string, chapters: any[], split: boolean) =>
    invokeOrFetch('docx:splitAndImport', filePath, fileName, chapters, split),
}

export const aiApi = {
  chat: (message: string, documentContent?: string, documentId?: string, provider?: 'gemini' | 'ollama' | 'auto') => {
    const apiKey = getApiKey()
    return invokeOrFetch('ai:chat', apiKey, message, documentContent, documentId, provider)
  },
  batchQuestions: (questions: string[], documentContent?: string, documentId?: string, provider?: 'gemini' | 'ollama' | 'auto') => {
    const apiKey = getApiKey()
    return invokeOrFetch('ai:batchQuestions', apiKey, questions, documentContent, documentId, provider)
  },
  autocomplete: (text: string, cursorPosition: number, documentContent?: string, documentId?: string, provider?: 'gemini' | 'ollama' | 'auto') => {
    const googleApiKey = getApiKey()
    const openaiApiKey = getOpenaiApiKey()
    return invokeOrFetch('ai:autocomplete', googleApiKey, openaiApiKey, text, cursorPosition, documentContent, documentId, provider)
  },
  generateTitle: (documentContent: string, provider?: 'gemini' | 'ollama' | 'auto') => {
    const apiKey = getApiKey()
    return invokeOrFetch('ai:generateTitle', apiKey, documentContent, provider)
  },
  rephraseText: (text: string, instruction: string, provider?: 'gemini' | 'ollama' | 'auto') => {
    const googleApiKey = getApiKey()
    const openaiApiKey = getOpenaiApiKey()
    return invokeOrFetch('ai:rephraseText', googleApiKey, openaiApiKey, text, instruction, provider)
  },
  getStatus: () =>
    invokeOrFetch('ai:getStatus'),
  streamChat: async (message: string, documentContent?: string, documentId?: string, chatHistory?: AIChatMessage[], useWebSearch?: boolean, modelName?: string, attachments?: any[], style?: string, projectId?: string): Promise<Response> => {
    if (!isElectron) {
      throw new Error('Streaming not available in web mode')
    }

    const googleApiKey = getApiKey()
    const openaiApiKey = getOpenaiApiKey()

    // Create a ReadableStream that reads from IPC events
    const stream = new ReadableStream({
      async start(controller) {
        let isStreamClosed = false
        
        try {
          // Start stream and get streamId
          const { streamId } = await window.electron!.invoke('ai:streamChat', googleApiKey, openaiApiKey, message, documentContent, documentId, chatHistory, useWebSearch, modelName, attachments, style, projectId)
          
          // Note: preload script strips the event, so callbacks receive args directly
          const onChunk = (receivedStreamId: string, chunk: string) => {
            if (receivedStreamId === streamId && !isStreamClosed) {
              try {
                // Format as SSE (Server-Sent Events) for compatibility with existing code
                const sseData = `data: ${JSON.stringify({ chunk })}\n\n`
                controller.enqueue(new TextEncoder().encode(sseData))
              } catch (error) {
                // Stream may have been closed, ignore the error
                console.warn('[Desktop API] Failed to enqueue chunk (stream may be closed):', error)
              }
            }
          }
          
          const onEnd = (receivedStreamId: string) => {
            if (receivedStreamId === streamId && !isStreamClosed) {
              isStreamClosed = true
              try {
                controller.close()
              } catch (error) {
                console.warn('[Desktop API] Failed to close stream:', error)
              }
              cleanup()
            }
          }
          
          const onError = (receivedStreamId: string, error: string) => {
            if (receivedStreamId === streamId && !isStreamClosed) {
              isStreamClosed = true
              try {
                controller.error(new Error(error))
              } catch (err) {
                console.warn('[Desktop API] Failed to error stream:', err)
              }
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
          if (!isStreamClosed) {
            isStreamClosed = true
            try {
              controller.error(error)
            } catch (err) {
              console.warn('[Desktop API] Failed to error stream on init:', err)
            }
          }
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
  exportMultiple: (documentIds: string[], format: 'pdf' | 'docx', filename?: string, usePageBreaks?: boolean) =>
    invokeOrFetch('export:exportMultiple', documentIds, format, filename, usePageBreaks),
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

export const settingsApi = {
  saveApiKeys: async (geminiApiKey?: string, openaiApiKey?: string) => {
    try {
      return await invokeOrFetch('settings:saveApiKeys', geminiApiKey, openaiApiKey)
    } catch (error: any) {
      // If handler not registered, log warning but don't fail (app may need restart)
      if (error?.message?.includes('No handler registered')) {
        console.warn('[Settings API] Handler not registered - app may need restart. API keys saved to localStorage only.')
        return { success: false, needsRestart: true }
      }
      throw error
    }
  },
  getApiKeys: async () => {
    try {
      return await invokeOrFetch('settings:getApiKeys')
    } catch (error: any) {
      // If handler not registered, return empty keys (app may need restart)
      if (error?.message?.includes('No handler registered')) {
        console.warn('[Settings API] Handler not registered - app may need restart.')
        return { geminiApiKey: '', openaiApiKey: '' }
      }
      throw error
    }
  },
  saveSmartIndexing: async (enabled: boolean) => {
    try {
      return await invokeOrFetch('settings:saveSmartIndexing', enabled)
    } catch (error: any) {
      // If handler not registered, log warning but don't fail (app may need restart)
      if (error?.message?.includes('No handler registered')) {
        console.warn('[Settings API] Handler not registered - app may need restart. Smart indexing saved to localStorage only.')
        return { success: false, needsRestart: true }
      }
      throw error
    }
  },
  getSmartIndexing: async () => {
    try {
      const result = await invokeOrFetch('settings:getSmartIndexing')
      return result.enabled === true // Default to false if not set
    } catch (error: any) {
      // If handler not registered, return default value (app may need restart)
      if (error?.message?.includes('No handler registered')) {
        console.warn('[Settings API] Handler not registered - app may need restart.')
        // Return default from localStorage
        try {
          const setting = localStorage.getItem('smartIndexing')
          return setting === null ? false : setting === 'true'
        } catch {
          return false // Default to disabled
        }
      }
      throw error
    }
  },
}

export const indexingApi = {
  getIndexingStatus: (documentId: string) => invokeOrFetch('library:getIndexingStatus', documentId),
  indexProjectLibraryFiles: (projectId: string, geminiApiKey?: string, openaiApiKey?: string, onlyUnindexed?: boolean) =>
    invokeOrFetch('library:indexProject', projectId, geminiApiKey, openaiApiKey, onlyUnindexed),
}

