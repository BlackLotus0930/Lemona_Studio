// Desktop Document Service - Uses Electron userData directory
import { Document } from '../../../shared/types.js'
import { app } from 'electron'
import fs from 'fs/promises'
import path from 'path'
import crypto from 'crypto'
import { extractPDFTextAsync } from './pdfTextExtractor.js'
import { parseDocx, convertHtmlToTipTap } from './docxParser.js'
import { indexLibraryFile, reindexFile } from './indexingService.js'
import { getVectorStore, cleanupVectorIndex, getProjectLockManager } from './vectorStore.js'
import { getApiKeys, getSmartIndexing } from './apiKeyStore.js'

// Use Electron's userData directory for documents
const DOCUMENTS_DIR = path.join(app.getPath('userData'), 'documents')

console.log('Desktop Document service initialized:')
console.log('  DOCUMENTS_DIR:', DOCUMENTS_DIR)

// Background cleanup service for deleted documents
class DeletedDocumentsCleanupService {
  private intervalId: NodeJS.Timeout | null = null
  private isRunning = false
  private readonly CLEANUP_INTERVAL_MS = 5 * 60 * 1000 // 5 minutes
  private readonly BATCH_SIZE = 10 // Process 10 documents at a time

  /**
   * Start the background cleanup service
   */
  start(): void {
    if (this.isRunning) {
      console.log('[DeletedDocumentsCleanupService] Already running')
      return
    }

    this.isRunning = true
    console.log(`[DeletedDocumentsCleanupService] Started (interval: ${this.CLEANUP_INTERVAL_MS / 1000}s)`)

    // Run cleanup immediately on start
    this.runCleanup()

    // Schedule periodic cleanup
    this.intervalId = setInterval(() => {
      this.runCleanup()
    }, this.CLEANUP_INTERVAL_MS)
  }

  /**
   * Stop the background cleanup service
   */
  stop(): void {
    if (!this.isRunning) {
      return
    }

    this.isRunning = false
    if (this.intervalId) {
      clearInterval(this.intervalId)
      this.intervalId = null
    }
    console.log('[DeletedDocumentsCleanupService] Stopped')
  }

  /**
   * Run cleanup for deleted documents
   */
  private async runCleanup(): Promise<void> {
    if (!this.isRunning) {
      return
    }

    try {
      // Import documentService dynamically to avoid circular dependency
      const { documentService } = await import('./documentService.js')
      
      // Get all documents
      const allDocuments = await documentService.getAll()
      
      // Filter to deleted library documents
      const deletedLibraryDocs = allDocuments.filter(
        doc => doc.deleted === true && 
               doc.folder === 'library' && 
               doc.projectId
      )

      if (deletedLibraryDocs.length === 0) {
        return // No deleted documents to clean up
      }

      console.log(`[DeletedDocumentsCleanupService] Found ${deletedLibraryDocs.length} deleted library document(s) to clean up`)

      // Process in batches to avoid blocking
      const batches = []
      for (let i = 0; i < deletedLibraryDocs.length; i += this.BATCH_SIZE) {
        batches.push(deletedLibraryDocs.slice(i, i + this.BATCH_SIZE))
      }

      let cleanedCount = 0
      let errorCount = 0

      for (const batch of batches) {
        // Process batch asynchronously
        await Promise.allSettled(
          batch.map(async (doc) => {
            try {
              // cleanupIndexForDeletedDocument is idempotent, safe to call multiple times
              await documentService.cleanupIndexForDeletedDocument(doc.id, doc.projectId!)
              cleanedCount++
            } catch (error: any) {
              errorCount++
              // Log but don't throw - will retry on next run
              console.warn(`[DeletedDocumentsCleanupService] Failed to cleanup ${doc.id}:`, error.message)
            }
          })
        )

        // Small delay between batches to avoid overwhelming the system
        if (batches.length > 1) {
          await new Promise(resolve => setTimeout(resolve, 100))
        }
      }

      if (cleanedCount > 0 || errorCount > 0) {
        console.log(`[DeletedDocumentsCleanupService] Cleanup completed: ${cleanedCount} succeeded, ${errorCount} failed`)
      }
    } catch (error: any) {
      console.error('[DeletedDocumentsCleanupService] Error during cleanup:', error)
      // Don't throw - service will retry on next interval
    }
  }
}

// Create singleton instance
const deletedDocumentsCleanupService = new DeletedDocumentsCleanupService()

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

  /**
   * Delete a single document
   * For batch deletion, use deleteMany() for better lock efficiency
   */
  async delete(id: string): Promise<boolean> {
    const results = await this.deleteMany([id])
    return results[0] ?? false
  },

  /**
   * Delete multiple documents efficiently
   * Acquires write lock once per project, processes all deletions, then releases
   * 
   * @param ids - Array of document IDs to delete
   * @returns Array of boolean results (true = success, false = failed)
   */
  async deleteMany(ids: string[]): Promise<boolean[]> {
    if (ids.length === 0) {
      return []
    }

    // Group documents by projectId for efficient lock management
    const documentsByProject = new Map<string | undefined, Array<{ id: string; document: Document }>>()
    
    // First pass: get all documents and group by project
    for (const id of ids) {
      const document = await this.getById(id)
      if (!document) {
        console.log(`[documentService.deleteMany] Document ${id} does not exist, considering already deleted`)
        continue
      }
      
      if (document.deleted === true) {
        console.log(`[documentService.deleteMany] Document ${id} is already marked as deleted`)
        continue
      }
      
      // Use document.projectId for both library and project files
      // Library files must have projectId set (per new architecture)
      const projectId = document.projectId
      if (!documentsByProject.has(projectId)) {
        documentsByProject.set(projectId, [])
      }
      documentsByProject.get(projectId)!.push({ id, document })
    }

    const results = new Map<string, boolean>()
    const projectLockManager = getProjectLockManager()

    // Process each project group with a single lock acquisition
    for (const [projectId, docs] of documentsByProject.entries()) {
      // Only acquire lock if documents are indexed (library or project files)
      if (projectId === undefined && docs.every(d => !d.document.folder && !d.document.projectId)) {
        // All documents are unindexed, process without lock
        for (const { id, document } of docs) {
          try {
            await this.deleteUnsafe(id, document)
            results.set(id, true)
          } catch (error: any) {
            console.error(`[documentService.deleteMany] Failed to delete document: ${id}`, error)
            results.set(id, false)
          }
        }
        continue
      }

      // 🎯 SOLUTION: Delete only marks documents as deleted, doesn't clean up index
      // Index cleanup happens asynchronously in background to avoid lock conflicts
      // This allows deletion to proceed even when indexing is in progress
      
      // Process all deletions without acquiring write lock
      // We only need to mark documents as deleted, which doesn't require index access
      for (const { id, document } of docs) {
        try {
          // Mark document as deleted (logical deletion)
          // Index cleanup will happen asynchronously in background
          await this.deleteUnsafe(id, document)
          results.set(id, true)
          
          // Schedule async index cleanup (non-blocking, doesn't hold lock)
          // This will be handled by background cleanup task
          if (document.folder === 'library' && document.projectId) {
            // Queue index cleanup for background processing
            setImmediate(async () => {
              try {
                await this.cleanupIndexForDeletedDocument(id, document.projectId!)
              } catch (cleanupError: any) {
                // Don't fail deletion if cleanup fails - it will be retried by background task
                console.warn(`[documentService.deleteMany] Background index cleanup failed for ${id}:`, cleanupError.message)
              }
            })
          }
        } catch (error: any) {
          console.error(`[documentService.deleteMany] Failed to delete document: ${id}`, error)
          results.set(id, false)
        }
      }
    }

    // Return results in the same order as input
    return ids.map(id => results.get(id) ?? false)
  },

  /**
   * Cleanup index for a deleted document (async, non-blocking)
   * This is called asynchronously after deletion to avoid lock conflicts
   * 
   * IDEMPOTENT: This method can be called multiple times safely:
   * - If document is not deleted, returns early (no-op)
   * - If chunks don't exist, returns early (no-op)
   * - If lock acquisition fails, returns early (will be retried)
   * - Safe to call after crashes, restarts, timeouts, or retries
   * 
   * @param documentId - Document ID
   * @param projectId - Project ID
   */
  async cleanupIndexForDeletedDocument(documentId: string, projectId: string): Promise<void> {
    // 🎯 IDEMPOTENCY CHECK 1: Verify document is still deleted
    // If document was restored, don't clean up index
    try {
      const document = await this.getById(documentId)
      if (!document || document.deleted !== true) {
        console.log(`[documentService.cleanupIndexForDeletedDocument] Document ${documentId} is not deleted, skipping cleanup (idempotent)`)
        return // Idempotent: document not deleted, nothing to clean up
      }
    } catch (error: any) {
      // If document doesn't exist, assume it's deleted and proceed with cleanup
      // This handles the case where document file was already removed
      console.log(`[documentService.cleanupIndexForDeletedDocument] Document ${documentId} not found, assuming deleted and proceeding with cleanup`)
    }
    
    const projectLockManager = getProjectLockManager()
    
    // 🎯 IDEMPOTENCY CHECK 2: Try to acquire write lock with timeout
    // If lock acquisition fails, return early (will be retried later)
    let releaseLock: (() => void) | null = null
    try {
      releaseLock = await Promise.race([
        projectLockManager.acquireWriteLock(projectId),
        new Promise<() => void>((_, reject) => 
          setTimeout(() => reject(new Error('Lock acquisition timeout')), 1000)
        )
      ])
    } catch (error: any) {
      // 🎯 IDEMPOTENT: Lock acquisition failed, return early (will be retried)
      console.log(`[documentService.cleanupIndexForDeletedDocument] Lock acquisition failed for ${documentId}, will retry later:`, error.message)
      return // Idempotent: can be called again later
    }
    
    try {
      // 🎯 IDEMPOTENCY CHECK 3: Double-check document is still deleted after acquiring lock
      // Document might have been restored while waiting for lock
      const documentAfterLock = await this.getById(documentId)
      if (!documentAfterLock || documentAfterLock.deleted !== true) {
        console.log(`[documentService.cleanupIndexForDeletedDocument] Document ${documentId} was restored after lock acquisition, skipping cleanup (idempotent)`)
        return // Idempotent: document not deleted, nothing to clean up
      }
      
      const vectorStore = getVectorStore(projectId, 'library')
      await vectorStore.loadIndexUnsafe()
      
      // 🎯 IDEMPOTENCY CHECK 4: removeChunksByFileUnsafe is already idempotent
      // It returns early if no chunks exist (removedCount === 0)
      // This handles the case where cleanup was already completed
      await vectorStore.removeChunksByFileUnsafe(documentId, true) // autoSave=true
      console.log(`[documentService.cleanupIndexForDeletedDocument] Successfully cleaned up index for ${documentId}`)
    } catch (error: any) {
      // 🎯 IDEMPOTENT: If cleanup fails, log but don't throw
      // This allows the method to be called again safely
      // Common failure cases:
      // - Index file doesn't exist (already cleaned up)
      // - Chunks don't exist (already cleaned up)
      // - Save failed (will be retried)
      console.warn(`[documentService.cleanupIndexForDeletedDocument] Cleanup failed for ${documentId} (idempotent, will retry):`, error.message)
      // Don't throw - allow retry on next call
    } finally {
      if (releaseLock) {
        releaseLock()
      }
    }
  },

  /**
   * Internal unsafe delete method - marks document as deleted without index cleanup
   * Index cleanup happens asynchronously via cleanupIndexForDeletedDocument
   * @param id - Document ID
   * @param document - Document object (must be provided to avoid re-fetching)
   */
  async deleteUnsafe(id: string, document: Document): Promise<void> {
    // Mark document as deleted (logical deletion)
    document.deleted = true
    document.updatedAt = new Date().toISOString()
    
    // Save document with deleted flag
    const filePath = getDocumentPath(id)
    await fs.writeFile(filePath, JSON.stringify(document, null, 2))
    console.log(`[documentService.deleteUnsafe] Successfully marked document as deleted: ${id}`)
    
    // Background async deletion of disk files (non-blocking)
    setImmediate(async () => {
      try {
        const docPath = getDocumentPath(id)
        try {
          await fs.access(docPath)
          await fs.unlink(docPath)
          console.log(`[documentService.deleteUnsafe] Background: Successfully deleted document JSON: ${id}`)
        } catch (accessError) {
          console.log(`[documentService.deleteUnsafe] Background: Document JSON file does not exist: ${docPath}`)
        }
        
        // Also delete the associated file (PDF, image, etc.) if it exists
        if (document.title) {
          const associatedFilePath = getFilePath(id, document.title)
          try {
            await fs.access(associatedFilePath)
            await fs.unlink(associatedFilePath)
            console.log(`[documentService.deleteUnsafe] Background: Successfully deleted associated file: ${associatedFilePath}`)
          } catch (fileError) {
            console.log(`[documentService.deleteUnsafe] Background: Associated file does not exist: ${associatedFilePath}`)
          }
        }
      } catch (bgError) {
        console.error(`[documentService.deleteUnsafe] Background: Error deleting files for ${id}:`, bgError)
        // Don't throw - background cleanup failure shouldn't affect deletion
      }
    })
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
    
    // Calculate content hash (SHA-256) for change detection
    const contentHash = crypto.createHash('sha256').update(fileBuffer).digest('hex')
    
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
    // CRITICAL: Set projectId for both project AND library files
    // Library files are scoped per project, not shared across all projects
    // This ensures indexing uses the correct project index and metadata
    const document: Document = {
      id,
      title: documentTitle,
      content: JSON.stringify(content),
      createdAt: now,
      updatedAt: now,
      folder,
      ...(projectId ? { projectId } : {}), // Set projectId for both library and project files if provided
      metadata: {
        contentHash, // Store content hash for change detection
      },
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
    // Only index new files that need indexing (use shouldReindexFile for strict checking)
    if (folder === 'library') {
      // Check if Smart indexing is enabled
      const smartIndexingEnabled = getSmartIndexing()
      if (!smartIndexingEnabled) {
        console.log(`[Auto-Indexing] Smart indexing is disabled, skipping automatic indexing for ${finalFileName}`)
        return document
      }
      
      // Check if file type is supported for indexing (PDF or DOCX)
      const fileExt = finalFileName.toLowerCase().split('.').pop() || ''
      if (fileExt === 'pdf' || fileExt === 'docx') {
        // Use shouldReindexFile to check if file needs indexing
        // This ensures we only index new files or files that have changed
        const { shouldReindexFile } = await import('./indexingService.js')
        const needsIndexing = await shouldReindexFile(id)
        
        if (needsIndexing) {
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
          console.log(`[Auto-Indexing] Skipping indexing for ${finalFileName}: file already correctly indexed`)
        }
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

  /**
   * Start background cleanup service for deleted documents
   * This should be called once on app startup
   */
  startDeletedDocumentsCleanupService(): void {
    deletedDocumentsCleanupService.start()
  },

  /**
   * Stop background cleanup service
   * This should be called on app shutdown
   */
  stopDeletedDocumentsCleanupService(): void {
    deletedDocumentsCleanupService.stop()
  },
}

