// Desktop Document Service - Uses Electron userData directory
import { Document } from '../../../shared/types.js'
import { app } from 'electron'
import fs from 'fs/promises'
import path from 'path'
import { extractPDFTextAsync } from './pdfTextExtractor.js'
import { parseDocx, convertHtmlToTipTap } from './docxParser.js'
import { indexLibraryFile, reindexFile } from './indexingService.js'
import { getVectorStore, cleanupVectorIndex, getProjectLockManager } from './vectorStore.js'
import { getApiKeys } from './apiKeyStore.js'

// Use Electron's userData directory for documents
const DOCUMENTS_DIR = path.join(app.getPath('userData'), 'documents')

console.log('Desktop Document service initialized:')
console.log('  DOCUMENTS_DIR:', DOCUMENTS_DIR)

// Ensure documents directory exists
async function ensureDocumentsDir() {
  try {
    await fs.mkdir(DOCUMENTS_DIR, { recursive: true })
  } catch (error) {
    console.error('Error creating documents directory:', error)
  }
}

// Initialize on import
ensureDocumentsDir()

function getDocumentPath(id: string): string {
  return path.join(DOCUMENTS_DIR, `${id}.json`)
}

// Files directory for uploaded files
const FILES_DIR = path.join(app.getPath('userData'), 'files')

async function ensureFilesDir() {
  try {
    await fs.mkdir(FILES_DIR, { recursive: true })
  } catch (error) {
    console.error('Error creating files directory:', error)
  }
}

// Initialize files directory
ensureFilesDir()

function getFilePath(fileId: string, fileName: string): string {
  return path.join(FILES_DIR, `${fileId}_${fileName}`)
}

export const documentService = {
  async getAll(): Promise<Document[]> {
    try {
      await ensureDocumentsDir()
      
      const files = await fs.readdir(DOCUMENTS_DIR)
      const documents: Document[] = []
      
      for (const file of files) {
        if (file.endsWith('.json')) {
          try {
            const filePath = path.join(DOCUMENTS_DIR, file)
            
            // Check if file still exists (may have been deleted)
            try {
              await fs.access(filePath)
            } catch {
              // File doesn't exist, skip it
              console.log(`[getAll] Skipping deleted file: ${file}`)
              continue
            }
            
            const content = await fs.readFile(filePath, 'utf-8')
            const doc = JSON.parse(content)
            
            // Validate document has required fields
            if (!doc.id || !doc.title) {
              console.warn(`[getAll] Skipping invalid document: ${file}`)
              continue
            }
            
            // Filter out logically deleted documents
            if (doc.deleted === true) {
              continue
            }
            
            documents.push(doc)
          } catch (fileError) {
            console.error(`Error reading file ${file}:`, fileError)
            // Continue with other files instead of crashing
          }
        }
      }
      
      return documents.sort((a, b) => 
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      )
    } catch (error) {
      console.error('Error in getAll():', error)
      return []
    }
  },

  async getById(id: string): Promise<Document | null> {
    try {
      const filePath = getDocumentPath(id)
      const content = await fs.readFile(filePath, 'utf-8')
      return JSON.parse(content)
    } catch (error) {
      return null
    }
  },

  async create(title: string, folder?: 'library' | 'project'): Promise<Document> {
    await ensureDocumentsDir()
    
    const id = `doc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    const now = new Date().toISOString()
    
    console.log('[documentService.create] Creating document with folder:', folder, 'title:', title)
    
    const document: Document = {
      id,
      title,
      content: JSON.stringify({
        type: 'doc',
        content: []
      }),
      createdAt: now,
      updatedAt: now,
      folder,
    }

    console.log('[documentService.create] Document object before save:', JSON.stringify(document, null, 2))

    const filePath = getDocumentPath(id)
    await fs.writeFile(filePath, JSON.stringify(document, null, 2))
    
    console.log('[documentService.create] Document saved, returning:', JSON.stringify(document, null, 2))
    
    return document
  },

  async update(id: string, content: string): Promise<Document | null> {
    const document = await this.getById(id)
    if (!document) {
      return null
    }

    const wasLibraryFile = document.folder === 'library'
    document.content = content
    document.updatedAt = new Date().toISOString()

    const filePath = getDocumentPath(id)
    await fs.writeFile(filePath, JSON.stringify(document, null, 2))
    
    // Re-index library files if content was updated (for incremental updates)
    if (wasLibraryFile) {
      const fileExt = document.title.toLowerCase().split('.').pop() || ''
      // Only re-index if it's a supported file type (PDF/DOCX) or TipTap content
      if (fileExt === 'pdf' || fileExt === 'docx' || (!fileExt || fileExt === 'md')) {
        console.log(`[Auto-Reindexing] Triggering re-index for updated library file: ${document.title} (${id})`)
        // Trigger re-indexing asynchronously (non-blocking)
        reindexFile(id).then((status) => {
          console.log(`[Auto-Reindexing] Completed re-indexing for ${id}: ${status.status}, ${status.chunksCount || 0} chunks`)
        }).catch((error) => {
          console.error(`[Auto-Reindexing] Failed to re-index ${id}:`, error)
          // Don't throw - re-indexing failure shouldn't break update
        })
      }
    }
    
    return document
  },

  async updateTitle(id: string, title: string): Promise<Document | null> {
    const document = await this.getById(id)
    if (!document) {
      return null
    }

    document.title = title
    document.updatedAt = new Date().toISOString()

    const filePath = getDocumentPath(id)
    await fs.writeFile(filePath, JSON.stringify(document, null, 2))
    
    return document
  },

  async updateFolder(id: string, folder: 'library' | 'project'): Promise<Document | null> {
    const document = await this.getById(id)
    if (!document) {
      return null
    }

    document.folder = folder
    document.updatedAt = new Date().toISOString()

    const filePath = getDocumentPath(id)
    await fs.writeFile(filePath, JSON.stringify(document, null, 2))
    
    return document
  },

  async delete(id: string): Promise<boolean> {
    const projectLockManager = getProjectLockManager()
    let releaseLock: (() => void) | null = null
    
    try {
      // Step 1: Get document, check if exists (idempotency)
      const document = await this.getById(id)
      if (!document) {
        // Document doesn't exist - consider it already deleted (idempotent)
        console.log(`[documentService.delete] Document ${id} does not exist, considering already deleted`)
        return true
      }
      
      // Check if already deleted (idempotency)
      if (document.deleted === true) {
        console.log(`[documentService.delete] Document ${id} is already marked as deleted`)
        return true
      }
      
      // Step 2: Acquire write lock for the project
      // Use 'library' for library folder, projectId for project files
      const projectId = document.folder === 'library' ? 'library' : document.projectId
      
      // Only acquire lock if document is indexed (library or project file)
      if (document.folder === 'library' || document.projectId) {
        releaseLock = await projectLockManager.acquireWriteLock(projectId)
        console.log(`[documentService.delete] Acquired write lock for project: ${projectId || 'global'}`)
      }
      
      try {
        // Step 3: Remove from vector index (if indexed)
        if (document.folder === 'library' || document.projectId) {
          try {
            const vectorStore = getVectorStore(projectId)
            await vectorStore.loadIndex()
            // Use skipLock=true since we already hold the write lock
            await vectorStore.removeChunksByFile(id, false, true) // autoSave=false, skipLock=true
            console.log(`[documentService.delete] Removed chunks from index for file: ${id} (project: ${projectId || 'global'})`)
            
            // Step 4: Immediately save index and metadata (atomic)
            await vectorStore.saveIndex()
            console.log(`[documentService.delete] Successfully saved index after removing chunks for file: ${id}`)
          } catch (indexError: any) {
            // If index removal fails, don't proceed with deletion (ensure consistency)
            console.error(`[documentService.delete] Failed to remove from index:`, indexError.message)
            throw new Error(`Failed to remove from index: ${indexError.message}`)
          }
        }
        
        // Step 5: Mark document as deleted (logical deletion)
        document.deleted = true
        document.updatedAt = new Date().toISOString()
        
        // Step 6: Save document with deleted flag
        const filePath = getDocumentPath(id)
        await fs.writeFile(filePath, JSON.stringify(document, null, 2))
        console.log(`[documentService.delete] Successfully marked document as deleted: ${id}`)
        
        // Step 7: Release write lock
        if (releaseLock) {
          releaseLock()
          releaseLock = null
        }
        
        // Step 8: Background async deletion of disk files (non-blocking)
        // Delete the document JSON file and associated file asynchronously
        setImmediate(async () => {
          try {
            const docPath = getDocumentPath(id)
            try {
              await fs.access(docPath)
              await fs.unlink(docPath)
              console.log(`[documentService.delete] Background: Successfully deleted document JSON: ${id}`)
            } catch (accessError) {
              console.log(`[documentService.delete] Background: Document JSON file does not exist: ${docPath}`)
            }
            
            // Also delete the associated file (PDF, image, etc.) if it exists
            if (document.title) {
              const associatedFilePath = getFilePath(id, document.title)
              try {
                await fs.access(associatedFilePath)
                await fs.unlink(associatedFilePath)
                console.log(`[documentService.delete] Background: Successfully deleted associated file: ${associatedFilePath}`)
              } catch (fileError) {
                console.log(`[documentService.delete] Background: Associated file does not exist: ${associatedFilePath}`)
              }
            }
          } catch (bgError) {
            console.error(`[documentService.delete] Background: Error deleting files for ${id}:`, bgError)
            // Don't throw - background cleanup failure shouldn't affect deletion
          }
        })
        
        return true
      } catch (error: any) {
        // If any step fails, release lock and re-throw
        if (releaseLock) {
          releaseLock()
          releaseLock = null
        }
        throw error
      }
    } catch (error: any) {
      console.error(`[documentService.delete] Failed to delete document: ${id}`, error)
      // Ensure lock is released even on error
      if (releaseLock) {
        releaseLock()
      }
      return false
    }
  },

  async uploadFile(sourceFilePath: string, fileName: string, folder: 'library' | 'project', projectId?: string): Promise<Document> {
    await ensureDocumentsDir()
    await ensureFilesDir()
    
    // Note: We don't cleanup vector index here to avoid performance impact
    // Cleanup is done on app startup, which should be sufficient
    // File naming is based on documentService.getAll(), not vector index
    
    // Check for duplicate file names and add number suffix if needed
    // CRITICAL: Only check duplicates within the same scope:
    // - Library files: check against all library files (shared across projects)
    // - Project files: check only against files in the same project (project-specific)
    const allDocs = await this.getAll()
    const baseName = fileName.substring(0, fileName.lastIndexOf('.')) || fileName
    const ext = fileName.substring(fileName.lastIndexOf('.')) || ''
    
    let finalFileName = fileName
    let counter = 1
    
    // Filter documents to check based on folder and projectId
    let docsToCheck: Document[]
    if (folder === 'library') {
      // Library files: check against all library files
      docsToCheck = allDocs.filter(doc => doc.folder === 'library')
    } else {
      // Project files: check only against files in the same project
      if (projectId) {
        docsToCheck = allDocs.filter(doc => doc.folder === 'project' && doc.projectId === projectId)
      } else {
        // If no projectId provided, check against all project files (fallback, should not happen)
        console.warn(`[DocumentService] Uploading to project folder without projectId, checking against all project files`)
        docsToCheck = allDocs.filter(doc => doc.folder === 'project')
      }
    }
    
    // Check if file with same name already exists in the same scope
    while (docsToCheck.some(doc => doc.title === finalFileName)) {
      finalFileName = `${baseName} (${counter})${ext}`
      counter++
    }
    
    // Read the source file
    const fileBuffer = await fs.readFile(sourceFilePath)
    
    // Generate document ID
    const id = `doc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    const now = new Date().toISOString()
    
    // Copy file to files directory
    const targetFilePath = getFilePath(id, finalFileName)
    await fs.writeFile(targetFilePath, fileBuffer)
    
    // Determine file type and create appropriate content
    const fileExt = finalFileName.toLowerCase().split('.').pop() || ''
    let content: any
    
    if (fileExt === 'png' || fileExt === 'jpg' || fileExt === 'jpeg' || fileExt === 'gif' || fileExt === 'webp') {
      // Image file - convert to base64 and embed as image
      const base64 = fileBuffer.toString('base64')
      const mimeType = fileExt === 'png' ? 'image/png' : 
                      fileExt === 'jpg' || fileExt === 'jpeg' ? 'image/jpeg' :
                      fileExt === 'gif' ? 'image/gif' : 'image/webp'
      const dataUrl = `data:${mimeType};base64,${base64}`
      
      content = {
        type: 'doc',
        content: [
          {
            type: 'image',
            attrs: {
              src: dataUrl,
              alt: finalFileName,
            }
          },
          {
            type: 'paragraph',
            content: []
          }
        ]
      }
    } else if (fileExt === 'pdf') {
      // PDF file - create a PDF viewer node
      // For large PDFs, don't store base64 in JSON - use document ID reference instead
      // The frontend will load the PDF file content on demand via IPC
      content = {
        type: 'doc',
        content: [
          {
            type: 'pdfViewer',
            attrs: {
              src: `document://${id}`, // Use document ID reference instead of base64
              fileName: finalFileName,
            }
          },
          {
            type: 'paragraph',
            content: []
          }
        ]
      }
    } else if (fileExt === 'docx') {
      // DOCX file - parse and convert to TipTap format
      try {
        const parseResult = await parseDocx(sourceFilePath)
        // Convert HTML to TipTap JSON format
        // Pass document ID to optimize large images by storing them separately
        content = await convertHtmlToTipTap(parseResult.fullContent, id)
      } catch (error) {
        // Fallback to file info if parsing fails
        content = {
          type: 'doc',
          content: [
            {
              type: 'paragraph',
              content: [
                {
                  type: 'text',
                  text: `📄 ${finalFileName}`,
                  marks: [{ type: 'bold' }]
                }
              ]
            },
            {
              type: 'paragraph',
              content: [
                {
                  type: 'text',
                  text: `File type: DOCX\nUploaded to: ${folder === 'library' ? 'Library' : 'Workspace'}\n\nFailed to parse DOCX content. This file can be downloaded from the file explorer.`
                }
              ]
            },
            {
              type: 'paragraph',
              content: []
            }
          ]
        }
      }
    } else if (fileExt === 'xlsx') {
      // Excel files - show file info and download option
      content = {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              {
                type: 'text',
                text: `📄 ${finalFileName}`,
                marks: [{ type: 'bold' }]
              }
            ]
          },
          {
            type: 'paragraph',
            content: [
              {
                type: 'text',
                text: `File type: ${fileExt.toUpperCase()}\nUploaded to: ${folder === 'library' ? 'Library' : 'Workspace'}\n\nThis file can be downloaded from the file explorer.`
              }
            ]
          },
          {
            type: 'paragraph',
            content: []
          }
        ]
      }
    } else {
      // Unknown file type - just show file name
      content = {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              {
                type: 'text',
                text: `📄 ${finalFileName}`
              }
            ]
          },
          {
            type: 'paragraph',
            content: []
          }
        ]
      }
    }
    
    // Remove .docx extension from title if it's a DOCX file
    const documentTitle = fileExt === 'docx' 
      ? finalFileName.replace(/\.docx$/i, '')
      : finalFileName
    
    // Create document entry
    // CRITICAL: If uploading to project folder, set projectId immediately
    // This ensures indexing uses the correct project index
    const document: Document = {
      id,
      title: documentTitle,
      content: JSON.stringify(content),
      createdAt: now,
      updatedAt: now,
      folder,
      ...(folder === 'project' && projectId ? { projectId } : {}), // Set projectId if provided for project files
    }
    
    // Log projectId assignment for debugging
    if (folder === 'project') {
      console.log(`[DocumentService] Uploading file to project folder with projectId: ${projectId || 'NOT SET (will be set later)'}`)
      if (!projectId) {
        console.warn(`[DocumentService] WARNING: Uploading to project folder without projectId. Document will need projectId set before indexing.`)
      }
    }
    
    // Save document metadata
    const docPath = getDocumentPath(id)
    await fs.writeFile(docPath, JSON.stringify(document, null, 2))
    
    // If PDF, extract text asynchronously in the background
    if (ext === 'pdf') {
      // Start PDF text extraction in background (non-blocking)
      extractPDFTextAsync(targetFilePath, id, async (pdfText) => {
        try {
          // Update document with extracted text
          const updatedDoc = await this.getById(id)
          if (updatedDoc) {
            updatedDoc.pdfText = pdfText
            updatedDoc.updatedAt = new Date().toISOString()
            await fs.writeFile(docPath, JSON.stringify(updatedDoc, null, 2))
            console.log(`[PDF Text Extraction] Completed for document ${id}`)
          }
        } catch (error) {
          console.error(`[PDF Text Extraction] Failed to update document ${id}:`, error)
        }
      }).catch((error) => {
        console.error(`[PDF Text Extraction] Failed for document ${id}:`, error)
        // Don't throw - extraction failure shouldn't break upload
      })
    }
    
    // Auto-index library files asynchronously (don't block upload)
    if (folder === 'library') {
      // Check if file type is supported for indexing (PDF or DOCX)
      const fileExt = finalFileName.toLowerCase().split('.').pop() || ''
      if (fileExt === 'pdf' || fileExt === 'docx') {
        console.log(`[Auto-Indexing] Starting indexing for library file: ${finalFileName} (${id})`)
        
        // Get API keys from store for auto-indexing
        const { geminiApiKey, openaiApiKey } = getApiKeys()
        
        // Trigger indexing asynchronously (non-blocking) with API keys
        indexLibraryFile(id, geminiApiKey, openaiApiKey).then((status) => {
          console.log(`[Auto-Indexing] Completed indexing for ${id}: ${status.status}, ${status.chunksCount || 0} chunks`)
        }).catch((error) => {
          console.error(`[Auto-Indexing] Failed to index ${id}:`, error)
          // Don't throw - indexing failure shouldn't break upload
          // The indexing service will handle API key errors gracefully
        })
      } else {
        console.log(`[Auto-Indexing] Skipping indexing for ${finalFileName}: unsupported file type (${fileExt})`)
      }
    }
    
    return document
  },

  /**
   * Clean up orphaned or corrupted document files
   * This removes any .json files that can't be parsed or are missing required fields
   */
  async cleanupOrphanedFiles(): Promise<{ removed: number; errors: string[] }> {
    try {
      await ensureDocumentsDir()
      
      const files = await fs.readdir(DOCUMENTS_DIR)
      let removed = 0
      const errors: string[] = []
      
      for (const file of files) {
        if (file.endsWith('.json')) {
          try {
            const filePath = path.join(DOCUMENTS_DIR, file)
            const content = await fs.readFile(filePath, 'utf-8')
            const doc = JSON.parse(content)
            
            // Check if document has required fields
            if (!doc.id || !doc.title || !doc.content || !doc.createdAt) {
              console.log(`[cleanupOrphanedFiles] Removing corrupted document: ${file}`)
              await fs.unlink(filePath)
              removed++
            }
          } catch (fileError) {
            // File is corrupted or can't be parsed - remove it
            console.log(`[cleanupOrphanedFiles] Removing unparseable file: ${file}`)
            try {
              const filePath = path.join(DOCUMENTS_DIR, file)
              await fs.unlink(filePath)
              removed++
            } catch (unlinkError) {
              errors.push(`Failed to remove ${file}: ${unlinkError}`)
            }
          }
        }
      }
      
      return { removed, errors }
    } catch (error) {
      console.error('[cleanupOrphanedFiles] Error during cleanup:', error)
      return { removed: 0, errors: [String(error)] }
    }
  },

  /**
   * Clean up logically deleted documents
   * This removes disk files for documents marked as deleted (deleted=true)
   * Should be called on app startup and periodically
   */
  async cleanupDeletedDocuments(): Promise<{ removed: number; errors: string[] }> {
    try {
      await ensureDocumentsDir()
      
      const files = await fs.readdir(DOCUMENTS_DIR)
      let removed = 0
      const errors: string[] = []
      
      for (const file of files) {
        if (file.endsWith('.json')) {
          try {
            const filePath = path.join(DOCUMENTS_DIR, file)
            const content = await fs.readFile(filePath, 'utf-8')
            const doc = JSON.parse(content)
            
            // Check if document is marked as deleted
            if (doc.deleted === true) {
              console.log(`[cleanupDeletedDocuments] Cleaning up deleted document: ${doc.id} (${doc.title || 'untitled'})`)
              
              // Delete the document JSON file
              try {
                await fs.unlink(filePath)
                removed++
                console.log(`[cleanupDeletedDocuments] Removed document JSON: ${filePath}`)
              } catch (unlinkError: any) {
                errors.push(`Failed to remove document JSON ${file}: ${unlinkError.message}`)
              }
              
              // Also delete the associated file (PDF, image, etc.) if it exists
              if (doc.title) {
                const associatedFilePath = getFilePath(doc.id, doc.title)
                try {
                  await fs.access(associatedFilePath)
                  await fs.unlink(associatedFilePath)
                  console.log(`[cleanupDeletedDocuments] Removed associated file: ${associatedFilePath}`)
                } catch (fileError: any) {
                  // File doesn't exist - this is okay, just log
                  if (fileError.code !== 'ENOENT') {
                    errors.push(`Failed to remove associated file for ${doc.id}: ${fileError.message}`)
                  }
                }
              }
            }
          } catch (fileError: any) {
            // File is corrupted or can't be parsed - skip it (handled by cleanupOrphanedFiles)
            console.warn(`[cleanupDeletedDocuments] Skipping unparseable file: ${file}`)
          }
        }
      }
      
      if (removed > 0) {
        console.log(`[cleanupDeletedDocuments] Cleanup complete. Removed ${removed} deleted document(s).`)
      }
      return { removed, errors }
    } catch (error: any) {
      console.error('[cleanupDeletedDocuments] Error during cleanup:', error)
      return { removed: 0, errors: [String(error)] }
    }
  },
}

