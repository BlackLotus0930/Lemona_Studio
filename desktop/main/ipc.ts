// IPC Handlers for Desktop App
import { ipcMain, BrowserWindow, shell } from 'electron'
import { documentService } from './services/documentService.js'
import { chatHistoryService } from './services/chatHistoryService.js'
import { geminiService } from './services/geminiService.js'
import { openaiService } from './services/openaiService.js'
import { projectService } from './services/projectService.js'
import { indexingService } from './services/indexingService.js'
import { semanticSearchService } from './services/semanticSearchService.js'
import { exportService } from './services/export.js'
import { extractPDFTextAsync } from './services/pdfTextExtractor.js'
import { parseDocx, splitDocxIntoChapters } from './services/docxParser.js'
import { saveApiKeys, getApiKeys } from './services/apiKeyStore.js'
import path from 'path'
import { app } from 'electron'

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

  ipcMain.handle('document:create', async (_, title: string, folder?: 'library' | 'project') => {
    try {
      const result = await documentService.create(title, folder)
      return result
    } catch (error) {
      console.error('IPC document:create error:', error)
      throw error
    }
  })

  ipcMain.handle('document:uploadFile', async (_, filePath: string, fileName: string, folder: 'library' | 'project', projectId?: string) => {
    try {
      const result = await documentService.uploadFile(filePath, fileName, folder, projectId)
      return result
    } catch (error) {
      console.error('IPC document:uploadFile error:', error)
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

  ipcMain.handle('document:updateFolder', async (_, id: string, folder: 'library' | 'project') => {
    try {
      return await documentService.updateFolder(id, folder)
    } catch (error) {
      console.error('IPC document:updateFolder error:', error)
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

  ipcMain.handle('document:cleanupOrphaned', async () => {
    try {
      return await documentService.cleanupOrphanedFiles()
    } catch (error) {
      console.error('IPC document:cleanupOrphaned error:', error)
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
  // Chat always uses Gemini (not Ollama)
  ipcMain.handle('ai:chat', async (_, apiKey: string, message: string, documentContent?: string, documentId?: string, openaiApiKey?: string) => {
    try {
      // Get projectId from document if documentId is provided
      let projectId: string | undefined
      if (documentId) {
        const document = await documentService.getById(documentId)
        projectId = document?.projectId
      }
      return await geminiService.chat(apiKey, message, documentContent, projectId, undefined, undefined, openaiApiKey)
    } catch (error) {
      console.error('IPC ai:chat error:', error)
      throw error
    }
  })

  // Stream chat - uses webContents.send to stream chunks
  // Chat always uses Gemini (not Ollama)
  ipcMain.handle('ai:streamChat', async (event, googleApiKey: string, openaiApiKey: string, message: string, documentContent?: string, documentId?: string, chatHistory?: any[], useWebSearch?: boolean, modelName?: string, attachments?: any[], style?: string) => {
    const webContents = event.sender
    const streamId = `stream_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    
    
    try {
      // Get projectId from document if documentId is provided
      let projectId: string | undefined
      if (documentId) {
        const document = await documentService.getById(documentId)
        projectId = document?.projectId
      }
      
      // Determine which service to use based on model name
      const isOpenaiModel = modelName && modelName.startsWith('gpt-')
      const useOpenai = isOpenaiModel && openaiApiKey
      
      if (useOpenai && !openaiApiKey) {
        throw new Error('OpenAI API key is required for GPT models. Please set it in Settings > API Keys.')
      }
      
      if (!useOpenai && !googleApiKey) {
        throw new Error('Google API key is required for Gemini models. Please set it in Settings > API Keys.')
      }
      
      // Start streaming in background
      ;(async () => {
        try {
          let chunkCount = 0
          const stream = useOpenai
            ? openaiService.streamChat(openaiApiKey, message, documentContent, projectId, chatHistory, useWebSearch, modelName, attachments, style, googleApiKey)
            : geminiService.streamChat(googleApiKey, message, documentContent, projectId, chatHistory, useWebSearch, modelName, attachments, openaiApiKey)
          
          for await (const chunk of stream) {
            chunkCount++
            webContents.send('ai:streamChunk', streamId, chunk)
          }
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

  // Batch questions always uses Gemini (not Ollama)
  ipcMain.handle('ai:batchQuestions', async (_, apiKey: string, questions: string[], documentContent?: string, documentId?: string) => {
    try {
      // Get projectId from document if documentId is provided
      let projectId: string | undefined
      if (documentId) {
        const document = await documentService.getById(documentId)
        projectId = document?.projectId
      }
      return await geminiService.batchQuestions(apiKey, questions, documentContent, projectId)
    } catch (error) {
      console.error('IPC ai:batchQuestions error:', error)
      throw error
    }
  })

  // Autocomplete: uses Gemini if available, otherwise falls back to OpenAI GPT-5 Nano
  ipcMain.handle('ai:autocomplete', async (_, googleApiKey: string, openaiApiKey: string, text: string, cursorPosition: number, documentContent?: string, documentId?: string) => {
    try {
      // Get projectId from document if documentId is provided
      let projectId: string | undefined
      if (documentId) {
        const document = await documentService.getById(documentId)
        projectId = document?.projectId
      }
      
      // Use Gemini if available (default), otherwise fall back to OpenAI GPT-5 Nano
      if (googleApiKey) {
        return await geminiService.autocomplete(googleApiKey, text, cursorPosition, documentContent, projectId, 'gemini-2.5-flash-lite')
      } else if (openaiApiKey) {
        return await openaiService.autocomplete(openaiApiKey, text, cursorPosition, documentContent, projectId, 'gpt-5-nano')
      } else {
        throw new Error('No API key configured. Please set either Google API key or OpenAI API key in Settings > API Keys.')
      }
    } catch (error) {
      console.error('IPC ai:autocomplete error:', error)
      throw error
    }
  })

  // New AI features: Title generation and rephrase
  // Title generation uses Gemini
  ipcMain.handle('ai:generateTitle', async (_, apiKey: string, documentContent: string) => {
    try {
      // Use Gemini via chat
      const msg = await geminiService.chat(
        apiKey,
        `Generate a short, concise title (max 5 words) for this document: "${documentContent.slice(0, 500)}"`,
        documentContent
      )
      return msg.content.trim().slice(0, 100)
    } catch (error) {
      console.error('IPC ai:generateTitle error:', error)
      throw error
    }
  })

  // Rephrase text uses GPT-5 Nano if only OpenAI key is available, otherwise Gemini 2.5 Flash Lite
  ipcMain.handle('ai:rephraseText', async (_, googleApiKey: string, openaiApiKey: string, text: string, instruction: string) => {
    try {
      
      // Explicitly instruct to only return the rephrased text with no follow-up questions or suggestions
      const prompt = `Rephrase this text according to the instruction. 

CRITICAL: Return ONLY the rephrased text. Do NOT include any follow-up questions, suggestions, "Next step" messages, or any other text. Just the rephrased text.
IMPORTANT: Use the same language as the original text. If it's in English, respond in English. Match the language exactly. If the original text is in Chinese, respond in Chinese.

Original text: "${text}"

Instruction: ${instruction}

Rephrased text:`
      
      let result: string
      
      // Use GPT-5 Nano if only OpenAI key is available, otherwise use Gemini 2.5 Flash Lite
      if (openaiApiKey && !googleApiKey) {
        const msg = await openaiService.chat(openaiApiKey, prompt, undefined, undefined, undefined, 'gpt-5-nano')
        result = msg.content.trim()
      } else if (googleApiKey) {
        const msg = await geminiService.chat(googleApiKey, prompt, undefined, undefined, undefined, 'gemini-2.5-flash-lite')
        result = msg.content.trim()
      } else {
        throw new Error('No API key configured. Please set either Google API key or OpenAI API key in Settings > API Keys.')
      }
      
      // Remove any "Next step" or similar follow-up text that might still appear
      const nextStepPatterns = [
        /Next step:.*$/i,
        /Would you like.*$/i,
        /Do you want.*$/i,
        /Can I help.*$/i,
        /Is there anything.*$/i,
        /Let me know.*$/i,
        /Feel free.*$/i,
        /\n\nNext step.*$/i,
        /\n\nWould you.*$/i,
      ]
      
      for (const pattern of nextStepPatterns) {
        result = result.replace(pattern, '').trim()
      }
      
      return result
    } catch (error) {
      console.error('[IPC] ai:rephraseText error:', error)
      throw error
    }
  })

  // Check AI service status
  ipcMain.handle('ai:getStatus', async () => {
    try {
      // API key is now stored in localStorage on the frontend
      // This endpoint is kept for compatibility but always returns true for gemini
      return {
        gemini: true
      }
    } catch (error) {
      console.error('IPC ai:getStatus error:', error)
      return {
        gemini: true
      }
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

  // Open external URL in default browser
  ipcMain.handle('openExternal', async (_, url: string) => {
    try {
      await shell.openExternal(url)
    } catch (error) {
      console.error('IPC openExternal error:', error)
      throw error
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

  // File operations
  ipcMain.handle('file:saveTemp', async (_, buffer: number[], fileName: string) => {
    try {
      const fs = await import('fs/promises')
      const path = await import('path')
      const os = await import('os')
      
      const tempDir = os.tmpdir()
      const tempPath = path.join(tempDir, `lemona_${Date.now()}_${fileName}`)
      
      await fs.writeFile(tempPath, Buffer.from(buffer))
      
      return tempPath
    } catch (error) {
      console.error('IPC file:saveTemp error:', error)
      throw error
    }
  })

  // Export operations - WYSIWYG (What You See Is What You Get)
  ipcMain.handle('export:export', async (_, documentId: string, format: 'pdf' | 'docx', filename?: string) => {
    try {
      if (!format || !['pdf', 'docx'].includes(format)) {
        throw new Error('Invalid format. Must be pdf or docx')
      }
      const fileBuffer = await exportService.exportDocument(documentId, format)
      return Array.from(fileBuffer) // Convert Buffer to array for IPC
    } catch (error) {
      console.error('IPC export:export error:', error)
      throw error
    }
  })

  ipcMain.handle('export:exportMultiple', async (_, documentIds: string[], format: 'pdf' | 'docx', filename?: string, usePageBreaks?: boolean) => {
    try {
      if (!format || !['pdf', 'docx'].includes(format)) {
        throw new Error('Invalid format. Must be pdf or docx')
      }
      if (!documentIds || documentIds.length === 0) {
        throw new Error('No documents selected')
      }
      // Ensure usePageBreaks is explicitly boolean (default to true if undefined)
      const shouldUsePageBreaks = usePageBreaks !== undefined ? usePageBreaks : true
      const fileBuffer = await exportService.exportMultipleDocuments(documentIds, format, shouldUsePageBreaks)
      return Array.from(fileBuffer) // Convert Buffer to array for IPC
    } catch (error) {
      console.error('IPC export:exportMultiple error:', error)
      throw error
    }
  })

  // Get PDF file content as base64 (for loading large PDFs without storing in JSON)
  // Uses streaming for better memory efficiency with large files
  ipcMain.handle('pdf:getFileContent', async (_, documentId: string) => {
    try {
      const document = await documentService.getById(documentId)
      if (!document) {
        const error = new Error(`Document ${documentId} not found`)
        console.error('IPC pdf:getFileContent error:', error.message)
        throw error
      }
      
      // Check if document is a PDF
      if (!document.title.toLowerCase().endsWith('.pdf')) {
        const error = new Error('Document is not a PDF')
        console.error('IPC pdf:getFileContent error:', error.message)
        throw error
      }
      
      // Get file path
      const FILES_DIR = path.join(app.getPath('userData'), 'files')
      const fileName = document.title
      const filePath = path.join(FILES_DIR, `${documentId}_${fileName}`)
      
      // Check if file exists before trying to read it
      const fs = await import('fs/promises')
      try {
        await fs.access(filePath)
      } catch (accessError) {
        const error = new Error(`PDF file not found at path: ${filePath}`)
        console.error('IPC pdf:getFileContent error:', error.message)
        throw error
      }
      
      // Read file asynchronously - this doesn't block the main process
      // The conversion to base64 happens in chunks to keep the event loop responsive
      const fileBuffer = await fs.readFile(filePath)
      
      // Convert to base64 - this is CPU intensive but necessary for PDF.js
      // The frontend will handle this conversion in chunks to keep UI responsive
      const base64 = fileBuffer.toString('base64')
      const pdfDataUrl = `data:application/pdf;base64,${base64}`
      
      return pdfDataUrl
    } catch (error) {
      console.error('IPC pdf:getFileContent error:', error)
      throw error
    }
  })

  // Get image file content as base64 (for loading images stored separately from DOCX)
  ipcMain.handle('image:getFileContent', async (_, documentId: string, imageId: string) => {
    try {
      const document = await documentService.getById(documentId)
      if (!document) {
        throw new Error(`Document ${documentId} not found`)
      }
      
      // Get file path - images are stored as documentId_imageId.ext
      const FILES_DIR = path.join(app.getPath('userData'), 'files')
      // Find the image file - it should match pattern: documentId_img_*.ext
      const fs = await import('fs/promises')
      const files = await fs.readdir(FILES_DIR)
      const imageFile = files.find((f: string) => f.startsWith(`${documentId}_img_`) && f.includes(imageId))
      
      if (!imageFile) {
        throw new Error(`Image file not found for imageId: ${imageId}`)
      }
      
      const imagePath = path.join(FILES_DIR, imageFile)
      const fileBuffer = await fs.readFile(imagePath)
      
      // Determine content type from file extension
      const ext = imageFile.split('.').pop()?.toLowerCase() || 'png'
      const contentType = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : 
                         ext === 'gif' ? 'image/gif' : 
                         ext === 'webp' ? 'image/webp' : 'image/png'
      
      const base64 = fileBuffer.toString('base64')
      return `data:${contentType};base64,${base64}`
    } catch (error) {
      throw error
    }
  })

  // PDF text extraction handler
  ipcMain.handle('pdf:extractText', async (_, documentId: string) => {
    try {
      const document = await documentService.getById(documentId)
      if (!document) {
        throw new Error(`Document ${documentId} not found`)
      }
      
      // Check if document is a PDF
      if (!document.title.toLowerCase().endsWith('.pdf')) {
        throw new Error('Document is not a PDF')
      }
      
      // Get file path
      const FILES_DIR = path.join(app.getPath('userData'), 'files')
      const fileName = document.title
      const filePath = path.join(FILES_DIR, `${documentId}_${fileName}`)
      
      // Extract text and wait for document update to complete
      const pdfText = await extractPDFTextAsync(filePath, documentId, async (extractedText) => {
        // Update document with extracted text
        const updatedDoc = await documentService.getById(documentId)
        if (updatedDoc) {
          updatedDoc.pdfText = extractedText
          updatedDoc.updatedAt = new Date().toISOString()
          const docPath = path.join(app.getPath('userData'), 'documents', `${documentId}.json`)
          const fs = await import('fs/promises')
          await fs.writeFile(docPath, JSON.stringify(updatedDoc, null, 2))
          console.log(`[IPC pdf:extractText] Document ${documentId} updated with PDF text`)
        }
      })
      
      // Wait a bit to ensure file write is complete
      await new Promise(resolve => setTimeout(resolve, 100))
      
      return pdfText
    } catch (error) {
      console.error('IPC pdf:extractText error:', error)
      throw error
    }
  })

  // DOCX parsing and splitting
  ipcMain.handle('docx:parse', async (_, filePath: string) => {
    try {
      const result = await parseDocx(filePath)
      return result
    } catch (error) {
      throw error
    }
  })

  ipcMain.handle('docx:splitAndImport', async (_, filePath: string, fileName: string, chapters: any[], split: boolean) => {
    try {
      if (split && chapters.length > 0) {
        // Split into multiple files
        const baseFileName = fileName.replace(/\.docx$/i, '')
        const chapterDocs = await splitDocxIntoChapters(filePath, chapters, baseFileName)
        
        // Create documents for each chapter in workspace
        const createdDocuments = []
        for (const chapterDoc of chapterDocs) {
          const doc = await documentService.create(chapterDoc.title, 'project')
          await documentService.update(doc.id, chapterDoc.content)
          createdDocuments.push(doc)
        }
        
        // Save original file to library
        const originalDoc = await documentService.uploadFile(filePath, fileName, 'library')
        
        return {
          success: true,
          split: true,
          documents: createdDocuments,
          originalDocument: originalDoc,
        }
      } else {
        // Import as single file to workspace
        const doc = await documentService.uploadFile(filePath, fileName, 'project')
        return {
          success: true,
          split: false,
          documents: [doc],
          originalDocument: null,
        }
      }
    } catch (error) {
      throw error
    }
  })

  // Library indexing operations
  ipcMain.handle('library:indexFile', async (_, documentId: string, geminiApiKey?: string, openaiApiKey?: string) => {
    try {
      const status = await indexingService.indexLibraryFile(documentId, geminiApiKey, openaiApiKey)
      return status
    } catch (error: any) {
      console.error('IPC library:indexFile error:', error)
      throw error
    }
  })

  ipcMain.handle('library:getIndexingStatus', async (_, documentId: string) => {
    try {
      const status = await indexingService.getIndexingStatus(documentId)
      return status
    } catch (error: any) {
      console.error('IPC library:getIndexingStatus error:', error)
      throw error
    }
  })

  ipcMain.handle('library:reindexFile', async (_, documentId: string, geminiApiKey?: string, openaiApiKey?: string) => {
    try {
      const status = await indexingService.reindexFile(documentId, geminiApiKey, openaiApiKey)
      return status
    } catch (error: any) {
      console.error('IPC library:reindexFile error:', error)
      throw error
    }
  })

  ipcMain.handle('library:indexAll', async (_, geminiApiKey?: string, openaiApiKey?: string) => {
    try {
      const results = await indexingService.indexAllLibraryFiles(geminiApiKey, openaiApiKey)
      return results
    } catch (error: any) {
      console.error('IPC library:indexAll error:', error)
      throw error
    }
  })

  ipcMain.handle('library:removeFromIndex', async (_, documentId: string) => {
    try {
      await indexingService.removeFromIndex(documentId)
      return { success: true }
    } catch (error: any) {
      console.error('IPC library:removeFromIndex error:', error)
      throw error
    }
  })

  // Library search operations (for testing/debugging)
  ipcMain.handle('library:search', async (_, query: string, geminiApiKey?: string, openaiApiKey?: string, fileIds?: string[], k?: number, projectId?: string) => {
    try {
      const { searchLibrary } = await import('./services/semanticSearchService.js')
      // Use 'library' as default for library search, or projectId for project-specific search
      const searchProjectId = projectId || 'library'
      const results = await searchLibrary(query, geminiApiKey, openaiApiKey, fileIds, k || 3, searchProjectId)
      return results
    } catch (error: any) {
      console.error('IPC library:search error:', error)
      throw error
    }
  })

  ipcMain.handle('library:getFiles', async () => {
    try {
      const files = await semanticSearchService.getLibraryFiles()
      return files
    } catch (error: any) {
      console.error('IPC library:getFiles error:', error)
      throw error
    }
  })

  // API Key storage handlers
  ipcMain.handle('settings:saveApiKeys', async (_, geminiApiKey?: string, openaiApiKey?: string) => {
    try {
      const changed = saveApiKeys(geminiApiKey, openaiApiKey)
      // Only log if keys actually changed to avoid spam from duplicate calls
      if (changed) {
        const keys = getApiKeys()
      }
      return { success: true }
    } catch (error) {
      console.error('IPC settings:saveApiKeys error:', error)
      throw error
    }
  })

  ipcMain.handle('settings:getApiKeys', async () => {
    try {
      const keys = getApiKeys()
      return {
        geminiApiKey: keys.geminiApiKey || '',
        openaiApiKey: keys.openaiApiKey || '',
      }
    } catch (error) {
      console.error('IPC settings:getApiKeys error:', error)
      throw error
    }
  })

}

