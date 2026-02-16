// Desktop API - Uses Electron IPC instead of HTTP
import { Project, AIChatMessage, DocumentSnapshot, WorldLab, WorldLabNode, WorldLabEdge, WorldLabMetadata } from '@shared/types'

export interface IntegrationSource {
  id: string
  projectId: string
  sourceType: 'rss' | 'github' | 'notion'
  config: Record<string, unknown>
  connectionStatus?: 'connected' | 'disconnected' | 'expired' | 'error'
  displayName?: string
  lastSyncedAt?: string
  lastError?: string
  createdAt?: string
}

export interface IntegrationSyncResult {
  sourceId: string
  sourceType: 'rss' | 'github' | 'notion'
  itemCount: number
  chunkCount: number
  syncedAt: string
}

export interface OAuthConfigStatus {
  sourceType: 'github'
  configured: boolean
  configSource: 'saved' | 'env' | 'missing'
}

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
  create: (title: string, folder?: 'library' | 'project' | 'worldlab') => invokeOrFetch('document:create', title, folder),
  update: (id: string, content: string) => invokeOrFetch('document:update', id, content),
  updateTitle: (id: string, title: string) => invokeOrFetch('document:updateTitle', id, title),
  updateFolder: (id: string, folder: 'library' | 'project' | 'worldlab') => invokeOrFetch('document:updateFolder', id, folder),
  delete: (id: string) => invokeOrFetch('document:delete', id),
  list: () => invokeOrFetch('document:getAll'),
  uploadFile: (filePath: string, fileName: string, folder: 'library' | 'project' | 'worldlab', projectId?: string) => 
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
  streamChat: async (message: string, documentContent?: string, documentId?: string, chatHistory?: AIChatMessage[], useWebSearch?: boolean, modelName?: string, attachments?: any[], style?: string, projectId?: string, googleApiKeyOverride?: string, openaiApiKeyOverride?: string): Promise<Response> => {
    if (!isElectron) {
      throw new Error('Streaming not available in web mode')
    }

    // Use provided API keys if available, otherwise fall back to localStorage
    const googleApiKey = googleApiKeyOverride !== undefined ? googleApiKeyOverride : getApiKey()
    const openaiApiKey = openaiApiKeyOverride !== undefined ? openaiApiKeyOverride : getOpenaiApiKey()

    // Create a ReadableStream that reads from IPC events
    // Store cleanup functions outside so they can be accessed by cancel
    let cleanupFns: Array<() => void> = []
    let isStreamClosed = false
    
    const stream = new ReadableStream({
      async start(controller) {
        let cleanupCalled = false
        
        const cleanup = () => {
          if (cleanupCalled) return
          cleanupCalled = true
          
          // Call all cleanup functions returned by on()
          cleanupFns.forEach(fn => {
            try {
              fn()
            } catch (error) {
              console.warn('[Desktop API] Error during cleanup:', error)
            }
          })
          cleanupFns = []
        }
        
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
          
          // Store cleanup functions returned by on() - these properly remove the listeners
          const cleanupChunk = window.electron!.on('ai:streamChunk', onChunk)
          const cleanupEnd = window.electron!.on('ai:streamEnd', onEnd)
          const cleanupError = window.electron!.on('ai:streamError', onError)
          
          cleanupFns = [cleanupChunk, cleanupEnd, cleanupError]
          
          // If stream was cancelled before listeners were registered, clean them up now
          if (isStreamClosed) {
            cleanup()
          }
        } catch (error) {
          if (!isStreamClosed) {
            isStreamClosed = true
            try {
              controller.error(error)
            } catch (err) {
              console.warn('[Desktop API] Failed to error stream on init:', err)
            }
          }
          cleanup()
        }
      },
      cancel() {
        // Clean up listeners when stream is cancelled
        isStreamClosed = true
        cleanupFns.forEach(fn => {
          try {
            fn()
          } catch (error) {
            console.warn('[Desktop API] Error during cancel cleanup:', error)
          }
        })
        cleanupFns = []
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
  updateMessage: (documentId: string, chatId: string, messageId: string, content: string, reasoningMetadata?: AIChatMessage['reasoningMetadata']) =>
    invokeOrFetch('chat:updateMessage', documentId, chatId, messageId, content, reasoningMetadata),
  deleteChat: (documentId: string, chatId: string) => invokeOrFetch('chat:deleteChat', documentId, chatId),
}

export const projectApi = {
  getAll: () => invokeOrFetch('project:getAll'),
  getById: (id: string) => invokeOrFetch('project:getById', id),
  create: (title: string, description?: string, intent?: string) => invokeOrFetch('project:create', title, description, intent),
  update: (id: string, updates: Partial<Pick<Project, 'title' | 'description' | 'intent' | 'coverImageData'>>) => invokeOrFetch('project:update', id, updates),
  updateIntent: (id: string, intent: string) => invokeOrFetch('project:updateIntent', id, intent),
  setCover: (id: string) => invokeOrFetch('project:setCover', id),
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

export const integrationApi = {
  getSources: (projectId: string): Promise<IntegrationSource[]> =>
    invokeOrFetch('integration:getSources', projectId),
  addSource: (projectId: string, sourceType: 'rss' | 'github', config: Record<string, unknown>, displayName?: string): Promise<IntegrationSource> =>
    invokeOrFetch('integration:addSource', projectId, sourceType, config, displayName),
  startOAuth: (projectId: string, sourceType: 'github'): Promise<IntegrationSource> =>
    invokeOrFetch('integration:startOAuth', projectId, sourceType),
  getOAuthConfigStatus: (sourceType: 'github'): Promise<OAuthConfigStatus> =>
    invokeOrFetch('integration:getOAuthConfigStatus', sourceType),
  saveOAuthConfig: async (sourceType: 'github', config: { clientId: string; clientSecret: string }): Promise<OAuthConfigStatus> => {
    try {
      return await invokeOrFetch('integration:saveOAuthConfig', sourceType, config)
    } catch (error: any) {
      if (error?.message?.includes('No handler registered')) {
        throw new Error('OAuth config could not be saved. Please fully quit Lemona, reopen it, and try again.')
      }
      throw error
    }
  },
  removeSource: (projectId: string, sourceId: string): Promise<{ success: boolean; removedChunks: number }> =>
    invokeOrFetch('integration:removeSource', projectId, sourceId),
  syncSource: (projectId: string, sourceId: string, geminiApiKey?: string, openaiApiKey?: string): Promise<IntegrationSyncResult> =>
    invokeOrFetch('integration:syncSource', projectId, sourceId, geminiApiKey, openaiApiKey),
  syncAll: (projectId: string, geminiApiKey?: string, openaiApiKey?: string): Promise<IntegrationSyncResult[]> =>
    invokeOrFetch('integration:syncAll', projectId, geminiApiKey, openaiApiKey),
  listGithubRepos: (projectId: string, sourceId: string): Promise<string[]> =>
    invokeOrFetch('integration:listGithubRepos', projectId, sourceId),
  getIndexedGithubRepos: (projectId: string, sourceId: string): Promise<string[]> =>
    invokeOrFetch('integration:getIndexedGithubRepos', projectId, sourceId),
  updateGithubRepos: (projectId: string, sourceId: string, repos: string[]): Promise<IntegrationSource> =>
    invokeOrFetch('integration:updateGithubRepos', projectId, sourceId, repos),
}

export const indexingApi = {
  getIndexingStatus: (documentId: string) => invokeOrFetch('library:getIndexingStatus', documentId),
  indexProjectLibraryFiles: (projectId: string, geminiApiKey?: string, openaiApiKey?: string, onlyUnindexed?: boolean) =>
    invokeOrFetch('library:indexProject', projectId, geminiApiKey, openaiApiKey, onlyUnindexed),
  incrementalIndexProjectFiles: (projectId: string, documentIds: string[], geminiApiKey?: string, openaiApiKey?: string) =>
    invokeOrFetch('indexing:incrementalIndexProjectFiles', projectId, documentIds, geminiApiKey, openaiApiKey),
  isLibraryIndexed: (projectId: string) => invokeOrFetch('library:isIndexValid', projectId),
}

export const versionApi = {
  createCommit: (projectId: string, documentSnapshots: DocumentSnapshot[], parentId?: string | null) =>
    invokeOrFetch('version:createCommit', projectId, documentSnapshots, parentId),
  getCommits: (projectId: string) =>
    invokeOrFetch('version:getCommits', projectId),
  getCommit: (projectId: string, commitId: string) =>
    invokeOrFetch('version:getCommit', projectId, commitId),
  getHeadCommit: (projectId: string) =>
    invokeOrFetch('version:getHeadCommit', projectId),
  restoreCommit: (projectId: string, commitId: string) =>
    invokeOrFetch('version:restoreCommit', projectId, commitId),
}

export const worldLabApi = {
  load: (labName: string, projectId: string): Promise<WorldLab | null> =>
    invokeOrFetch('worldlab:load', labName, projectId),
  loadNodes: (labName: string, projectId: string): Promise<WorldLabNode[]> =>
    invokeOrFetch('worldlab:loadNodes', labName, projectId),
  loadEdges: (labName: string, projectId: string): Promise<WorldLabEdge[]> =>
    invokeOrFetch('worldlab:loadEdges', labName, projectId),
  loadMetadata: (labName: string, projectId: string): Promise<WorldLabMetadata | null> =>
    invokeOrFetch('worldlab:loadMetadata', labName, projectId),
  loadNodeContent: (labName: string, nodeId: string, projectId: string): Promise<string | null> =>
    invokeOrFetch('worldlab:loadNodeContent', labName, nodeId, projectId),
  loadMetadataContent: (labName: string, projectId: string): Promise<string | null> =>
    invokeOrFetch('worldlab:loadMetadataContent', labName, projectId),
  saveNode: (labName: string, nodeId: string, content: string, projectId: string): Promise<boolean> =>
    invokeOrFetch('worldlab:saveNode', labName, nodeId, content, projectId),
  saveEdges: (labName: string, edges: WorldLabEdge[], projectId: string, nodePositions?: Record<string, { x: number; y: number }>, nodeMetadata?: Record<string, { label?: string; category?: string; elementName?: string }>): Promise<boolean> =>
    invokeOrFetch('worldlab:saveEdges', labName, edges, projectId, nodePositions, nodeMetadata),
  saveNodePositions: (labName: string, nodes: WorldLabNode[], projectId: string): Promise<boolean> =>
    invokeOrFetch('worldlab:saveNodePositions', labName, nodes, projectId),
  createNode: (labName: string, nodeId: string, projectId: string, content?: string): Promise<boolean> =>
    invokeOrFetch('worldlab:createNode', labName, nodeId, projectId, content),
  deleteNode: (labName: string, nodeId: string, projectId: string): Promise<boolean> =>
    invokeOrFetch('worldlab:deleteNode', labName, nodeId, projectId),
  saveMetadata: (labName: string, metadata: WorldLabMetadata, projectId: string): Promise<boolean> =>
    invokeOrFetch('worldlab:saveMetadata', labName, metadata, projectId),
  labExists: (labName: string, projectId: string): Promise<boolean> =>
    invokeOrFetch('worldlab:labExists', labName, projectId),
  getAllLabNames: (projectId: string): Promise<string[]> =>
    invokeOrFetch('worldlab:getAllLabNames', projectId),
  deleteLab: (labName: string, projectId: string): Promise<boolean> =>
    invokeOrFetch('worldlab:deleteLab', labName, projectId),
}

