// IPC Handlers for Desktop App
import { ipcMain, BrowserWindow } from 'electron'
import { documentService } from './services/documentService.js'
import { chatHistoryService } from './services/chatHistoryService.js'
import { geminiService } from './services/geminiService.js'
import { projectService } from './services/projectService.js'

export function setupIPC() {
  // Document operations
  ipcMain.handle('document:getAll', async () => {
    try {
      return await documentService.getAll()
    } catch (error) {
      console.error('IPC document:getAll error:', error)
      throw error
    }
  })

  ipcMain.handle('document:getById', async (_, id: string) => {
    try {
      return await documentService.getById(id)
    } catch (error) {
      console.error('IPC document:getById error:', error)
      throw error
    }
  })

  ipcMain.handle('document:create', async (_, title: string) => {
    try {
      return await documentService.create(title)
    } catch (error) {
      console.error('IPC document:create error:', error)
      throw error
    }
  })

  ipcMain.handle('document:update', async (_, id: string, content: string) => {
    try {
      return await documentService.update(id, content)
    } catch (error) {
      console.error('IPC document:update error:', error)
      throw error
    }
  })

  ipcMain.handle('document:updateTitle', async (_, id: string, title: string) => {
    try {
      return await documentService.updateTitle(id, title)
    } catch (error) {
      console.error('IPC document:updateTitle error:', error)
      throw error
    }
  })

  ipcMain.handle('document:delete', async (_, id: string) => {
    try {
      return await documentService.delete(id)
    } catch (error) {
      console.error('IPC document:delete error:', error)
      throw error
    }
  })

  // Chat operations
  ipcMain.handle('chat:getHistory', async (_, documentId: string) => {
    try {
      return await chatHistoryService.getChatHistory(documentId)
    } catch (error) {
      console.error('IPC chat:getHistory error:', error)
      throw error
    }
  })

  ipcMain.handle('chat:getChat', async (_, documentId: string, chatId: string) => {
    try {
      return await chatHistoryService.getChatMessages(documentId, chatId)
    } catch (error) {
      console.error('IPC chat:getChat error:', error)
      throw error
    }
  })

  ipcMain.handle('chat:addMessage', async (_, documentId: string, chatId: string, message: any) => {
    try {
      await chatHistoryService.addMessage(documentId, chatId, message)
      return { success: true }
    } catch (error) {
      console.error('IPC chat:addMessage error:', error)
      throw error
    }
  })

  ipcMain.handle('chat:updateMessage', async (_, documentId: string, chatId: string, messageId: string, content: string) => {
    try {
      await chatHistoryService.updateMessage(documentId, chatId, messageId, content)
      return { success: true }
    } catch (error) {
      console.error('IPC chat:updateMessage error:', error)
      throw error
    }
  })

  ipcMain.handle('chat:deleteChat', async (_, documentId: string, chatId: string) => {
    try {
      await chatHistoryService.deleteChat(documentId, chatId)
      return { success: true }
    } catch (error) {
      console.error('IPC chat:deleteChat error:', error)
      throw error
    }
  })

  // AI operations
  ipcMain.handle('ai:chat', async (_, message: string, documentContent?: string, documentId?: string) => {
    try {
      // Get projectId from document if documentId is provided
      let projectId: string | undefined
      if (documentId) {
        const document = await documentService.getById(documentId)
        projectId = document?.projectId
      }
      return await geminiService.chat(message, documentContent, projectId)
    } catch (error) {
      console.error('IPC ai:chat error:', error)
      throw error
    }
  })

  // Stream chat - uses webContents.send to stream chunks
  ipcMain.handle('ai:streamChat', async (event, message: string, documentContent?: string, documentId?: string, chatHistory?: any[], useWebSearch?: boolean, modelName?: string) => {
    const webContents = event.sender
    const streamId = `stream_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    
    console.log(`[Stream] Starting stream ${streamId} (model: ${modelName || 'gemini-2.5-flash'}, web search: ${useWebSearch ? 'enabled' : 'disabled'})`)
    
    try {
      // Get projectId from document if documentId is provided
      let projectId: string | undefined
      if (documentId) {
        const document = await documentService.getById(documentId)
        projectId = document?.projectId
      }
      
      // Start streaming in background
      ;(async () => {
        try {
          console.log(`[Stream] Calling geminiService.streamChat with ${chatHistory?.length || 0} history messages...`)
          let chunkCount = 0
          for await (const chunk of geminiService.streamChat(message, documentContent, projectId, chatHistory, useWebSearch, modelName)) {
            chunkCount++
            console.log(`[Stream] Received chunk ${chunkCount}: ${chunk.substring(0, 50)}...`)
            webContents.send('ai:streamChunk', streamId, chunk)
          }
          console.log(`[Stream] Stream complete, total chunks: ${chunkCount}`)
          webContents.send('ai:streamEnd', streamId)
        } catch (error) {
          console.error('[Stream] Stream error:', error)
          webContents.send('ai:streamError', streamId, error instanceof Error ? error.message : 'Unknown error')
        }
      })()
      
      return { streamId }
    } catch (error) {
      console.error('IPC ai:streamChat error:', error)
      throw error
    }
  })

  ipcMain.handle('ai:batchQuestions', async (_, questions: string[], documentContent?: string, documentId?: string) => {
    try {
      // Get projectId from document if documentId is provided
      let projectId: string | undefined
      if (documentId) {
        const document = await documentService.getById(documentId)
        projectId = document?.projectId
      }
      return await geminiService.batchQuestions(questions, documentContent, projectId)
    } catch (error) {
      console.error('IPC ai:batchQuestions error:', error)
      throw error
    }
  })

  ipcMain.handle('ai:autocomplete', async (_, text: string, cursorPosition: number, documentContent?: string, documentId?: string) => {
    try {
      // Get projectId from document if documentId is provided
      let projectId: string | undefined
      if (documentId) {
        const document = await documentService.getById(documentId)
        projectId = document?.projectId
      }
      return await geminiService.autocomplete(text, cursorPosition, documentContent, projectId)
    } catch (error) {
      console.error('IPC ai:autocomplete error:', error)
      throw error
    }
  })

  // Window controls
  ipcMain.handle('window:minimize', async (event) => {
    const window = BrowserWindow.fromWebContents(event.sender)
    if (window) {
      window.minimize()
    }
  })

  ipcMain.handle('window:maximize', async (event) => {
    const window = BrowserWindow.fromWebContents(event.sender)
    if (window) {
      if (window.isMaximized()) {
        window.unmaximize()
      } else {
        window.maximize()
      }
    }
  })

  ipcMain.handle('window:close', async (event) => {
    const window = BrowserWindow.fromWebContents(event.sender)
    if (window) {
      window.close()
    }
  })

  // Project operations
  ipcMain.handle('project:getAll', async () => {
    try {
      return await projectService.getAll()
    } catch (error) {
      console.error('IPC project:getAll error:', error)
      throw error
    }
  })

  ipcMain.handle('project:getById', async (_, projectId: string) => {
    try {
      return await projectService.getById(projectId)
    } catch (error) {
      console.error('IPC project:getById error:', error)
      throw error
    }
  })

  ipcMain.handle('project:create', async (_, title: string, description?: string, intent?: string) => {
    try {
      return await projectService.create(title, description, intent)
    } catch (error) {
      console.error('IPC project:create error:', error)
      throw error
    }
  })

  ipcMain.handle('project:update', async (_, projectId: string, updates: any) => {
    try {
      return await projectService.update(projectId, updates)
    } catch (error) {
      console.error('IPC project:update error:', error)
      throw error
    }
  })

  ipcMain.handle('project:updateIntent', async (_, projectId: string, intent: string) => {
    try {
      return await projectService.updateIntent(projectId, intent)
    } catch (error) {
      console.error('IPC project:updateIntent error:', error)
      throw error
    }
  })

  ipcMain.handle('project:delete', async (_, projectId: string) => {
    try {
      const success = await projectService.delete(projectId)
      return { success }
    } catch (error) {
      console.error('IPC project:delete error:', error)
      throw error
    }
  })

  ipcMain.handle('project:addDocument', async (_, projectId: string, documentId: string, order?: number) => {
    try {
      return await projectService.addDocument(projectId, documentId, order)
    } catch (error) {
      console.error('IPC project:addDocument error:', error)
      throw error
    }
  })

  ipcMain.handle('project:removeDocument', async (_, projectId: string, documentId: string) => {
    try {
      return await projectService.removeDocument(projectId, documentId)
    } catch (error) {
      console.error('IPC project:removeDocument error:', error)
      throw error
    }
  })

  ipcMain.handle('project:reorderDocuments', async (_, projectId: string, documentIds: string[]) => {
    try {
      return await projectService.reorderDocuments(projectId, documentIds)
    } catch (error) {
      console.error('IPC project:reorderDocuments error:', error)
      throw error
    }
  })

  ipcMain.handle('project:getDocuments', async (_, projectId: string) => {
    try {
      return await projectService.getProjectDocuments(projectId)
    } catch (error) {
      console.error('IPC project:getDocuments error:', error)
      throw error
    }
  })

  console.log('IPC handlers registered')
}

