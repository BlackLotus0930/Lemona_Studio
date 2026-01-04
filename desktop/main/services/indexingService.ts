// Indexing Service - Orchestrate file indexing workflow
import { Document } from '../../../shared/types.js'
import { documentService } from './documentService.js'
import { extractPDFText } from './pdfTextExtractor.js'
import { parseDocx } from './docxParser.js'
import { chunkPDF, chunkDocx, chunkTipTap, Chunk } from './chunkingService.js'
import { generateEmbeddingsBatch, EMBEDDING_DIMENSION } from './embeddingService.js'
import { getVectorStore, ChunkMetadata, getProjectIndexDirectory, getProjectLockManager } from './vectorStore.js'
import { app } from 'electron'
import fs from 'fs/promises'
import path from 'path'

// Indexing status directory
const INDEXING_STATUS_DIR = path.join(app.getPath('userData'), 'indexingStatus')

// Ensure indexing status directory exists
async function ensureIndexingStatusDir() {
  try {
    await fs.mkdir(INDEXING_STATUS_DIR, { recursive: true })
  } catch (error) {
    console.error('[Indexing] Error creating indexing status directory:', error)
  }
}

ensureIndexingStatusDir()

/**
 * Indexing status
 */
export interface IndexingStatus {
  documentId: string
  status: 'pending' | 'indexing' | 'completed' | 'error'
  chunksCount?: number
  indexedAt?: string
  error?: string
  progress?: {
    totalChunks: number
    processedChunks: number
  }
}

/**
 * Get indexing status file path
 */
function getStatusFilePath(documentId: string): string {
  return path.join(INDEXING_STATUS_DIR, `${documentId}.json`)
}

/**
 * Load indexing status
 */
async function loadIndexingStatus(documentId: string): Promise<IndexingStatus | null> {
  try {
    const statusPath = getStatusFilePath(documentId)
    const content = await fs.readFile(statusPath, 'utf-8')
    return JSON.parse(content) as IndexingStatus
  } catch {
    return null
  }
}

/**
 * Save indexing status
 */
async function saveIndexingStatus(status: IndexingStatus): Promise<void> {
  try {
    await ensureIndexingStatusDir()
    const statusPath = getStatusFilePath(status.documentId)
    await fs.writeFile(statusPath, JSON.stringify(status, null, 2))
  } catch (error) {
    console.error('[Indexing] Failed to save indexing status:', error)
  }
}

/**
 * Get file path for a document
 */
function getDocumentFilePath(documentId: string, fileName: string): string {
  const FILES_DIR = path.join(app.getPath('userData'), 'files')
  return path.join(FILES_DIR, `${documentId}_${fileName}`)
}

/**
 * Extract text from document based on file type
 */
async function extractTextFromDocument(document: Document): Promise<string | null> {
  const fileExt = document.title.toLowerCase().split('.').pop() || ''
  
  if (fileExt === 'pdf') {
    // Check if PDF text is already extracted
    if (document.pdfText && document.pdfText.fullText) {
      return document.pdfText.fullText
    }
    
    // Extract PDF text
    const filePath = getDocumentFilePath(document.id, document.title)
    try {
      const pdfText = await extractPDFText(filePath)
      return pdfText.fullText
    } catch (error: any) {
      console.error('[Indexing] Failed to extract PDF text:', error)
      return null
    }
  } else if (fileExt === 'docx') {
    // Parse DOCX and extract HTML
    const filePath = getDocumentFilePath(document.id, document.title)
    try {
      const parseResult = await parseDocx(filePath)
      return parseResult.fullContent
    } catch (error: any) {
      console.error('[Indexing] Failed to parse DOCX:', error)
      return null
    }
  } else {
    // For other file types, try to extract text from TipTap content
    try {
      const content = JSON.parse(document.content)
      // Extract plain text from TipTap JSON
      return extractTextFromTipTap(content)
    } catch {
      return null
    }
  }
}

/**
 * Extract plain text from TipTap JSON
 */
function extractTextFromTipTap(node: any): string {
  if (typeof node === 'string') {
    return node
  }
  
  if (node.type === 'text') {
    return node.text || ''
  }
  
  if (node.content && Array.isArray(node.content)) {
    return node.content.map(extractTextFromTipTap).join(' ')
  }
  
  return ''
}

/**
 * Index a library file
 * Only indexes files in the 'library' folder
 * 
 * INDEXING ARCHITECTURE:
 * - Library folder files → vectorIndex/library/ (shared across all projects)
 *   - All library files are indexed together, regardless of document.projectId
 *   - This allows @library to search across all library files
 * - Project folder files → vectorIndex/{projectId}/ (project-specific)
 *   - Each project has its own isolated index
 *   - This allows @project to search only within that project's files
 */
export async function indexLibraryFile(
  documentId: string,
  geminiApiKey?: string,
  openaiApiKey?: string
): Promise<IndexingStatus> {
  // Check for API keys before starting
  const hasGeminiKey = geminiApiKey && geminiApiKey.trim().length > 0
  const hasOpenaiKey = openaiApiKey && openaiApiKey.trim().length > 0
  
  if (!hasGeminiKey && !hasOpenaiKey) {
    const errorStatus: IndexingStatus = {
      documentId,
      status: 'error',
      error: 'No embedding API key available. Please configure Gemini or OpenAI API key in Settings > API Keys.',
    }
    await saveIndexingStatus(errorStatus)
    console.warn(`[Indexing] Skipping indexing for ${documentId}: No API keys available`)
    return errorStatus
  }

  // Load document
  const document = await documentService.getById(documentId)
  if (!document) {
    throw new Error(`Document ${documentId} not found`)
  }

  // Only index library files
  if (document.folder !== 'library') {
    throw new Error(`Document ${documentId} is not in library folder`)
  }

  // Update status to indexing
  let status: IndexingStatus = {
    documentId,
    status: 'indexing',
    progress: {
      totalChunks: 0,
      processedChunks: 0,
    },
  }
  await saveIndexingStatus(status)

  try {
    // Get vector store for the correct project
    // CRITICAL: Library files always index to shared 'library' index (ignoring document.projectId)
    // Project files index to their project-specific index
    // Architecture:
    //   - Library folder files → vectorIndex/library/ (shared across all projects)
    //   - Project folder files → vectorIndex/{projectId}/ (project-specific)
    
    let projectId: string | undefined
    
    if (document.folder === 'library') {
      // Library files always use 'library' index
      projectId = 'library'
      console.log(`[Indexing] Indexing library document ${documentId} with projectId: library`)
      console.log(`[Indexing] Index strategy: SHARED library index`)
    } else {
      // Project files MUST have projectId set before indexing
      if (!document.projectId) {
        const errorMsg = `Cannot index project file ${documentId}: document.projectId is not set. File must be added to a project before indexing.`
        console.error(`[Indexing] ${errorMsg}`)
        throw new Error(errorMsg)
      }
      projectId = document.projectId
      console.log(`[Indexing] Indexing project document ${documentId} with projectId: ${projectId}`)
      console.log(`[Indexing] Index strategy: PROJECT-SPECIFIC index (${projectId})`)
    }
    
    // 📌 Acquire write lock at transaction boundary for entire indexing operation
    // VectorStore is a "database kernel" - it doesn't manage locks
    const projectLockManager = getProjectLockManager()
    const releaseLock = await projectLockManager.acquireWriteLock(projectId)
    
    try {
      const vectorStore = getVectorStore(projectId)
      // Load index - we hold write lock
      await vectorStore.loadIndexUnsafe()
      
      // CRITICAL: Verify we're using the correct index (only for project files)
      // For library files, projectId is always 'library', so no need to verify
      if (document.folder !== 'library') {
        const vectorStoreProjectId = vectorStore.getProjectId()
        if (vectorStoreProjectId !== projectId) {
          throw new Error(`Index mismatch: expected projectId ${projectId}, but vectorStore has ${vectorStoreProjectId || 'undefined'}`)
        }
      }

      // Remove existing chunks for this file (for re-indexing)
      // We hold write lock
      await vectorStore.removeChunksByFileUnsafe(documentId, false) // autoSave=false, will save after adding

    // Extract text based on file type
    const fileExt = document.title.toLowerCase().split('.').pop() || ''
    let chunks: Chunk[] = []

    if (fileExt === 'pdf') {
      // Extract PDF text if not already extracted
      let pdfText
      if (document.pdfText && document.pdfText.fullText) {
        pdfText = document.pdfText
      } else {
        const filePath = getDocumentFilePath(document.id, document.title)
        pdfText = await extractPDFText(filePath)
        // Update document with extracted text (optional, don't block indexing)
        // Note: We don't update the document here to avoid modifying content
        // PDF text is stored separately in pdfText field
      }
      chunks = chunkPDF(pdfText, documentId)
    } else if (fileExt === 'docx') {
      const filePath = getDocumentFilePath(document.id, document.title)
      const parseResult = await parseDocx(filePath)
      chunks = chunkDocx(parseResult.fullContent, documentId)
    } else {
      // Try TipTap content
      try {
        const content = JSON.parse(document.content)
        chunks = chunkTipTap(content, documentId)
      } catch {
        throw new Error(`Unsupported file type for indexing: ${fileExt}`)
      }
    }

    if (chunks.length === 0) {
      status = {
        documentId,
        status: 'completed',
        chunksCount: 0,
        indexedAt: new Date().toISOString(),
      }
      await saveIndexingStatus(status)
      return status
    }

    // Update progress
    status.progress = {
      totalChunks: chunks.length,
      processedChunks: 0,
    }
    await saveIndexingStatus(status)

    // Generate embeddings in batches
    const batchSize = 10
    const allEmbeddings: number[][] = []

    for (let i = 0; i < chunks.length; i += batchSize) {
      const batch = chunks.slice(i, i + batchSize)
      const batchTexts = batch.map(chunk => chunk.text)
      
      const batchResults = await generateEmbeddingsBatch(
        batchTexts,
        geminiApiKey,
        openaiApiKey,
        batchSize
      )
      
      const batchEmbeddings = batchResults.map(result => result.embedding)
      allEmbeddings.push(...batchEmbeddings)

      // Update progress
      status.progress = {
        totalChunks: chunks.length,
        processedChunks: Math.min(i + batchSize, chunks.length),
      }
      await saveIndexingStatus(status)
    }

      // Add chunks to vector store - we hold write lock
      await vectorStore.addChunksUnsafe(chunks, allEmbeddings)

    // CRITICAL: Save vector store and verify it was saved successfully
    // vectorStore.addChunks already handles saving, but we verify here
    console.log(`[Indexing] Index operations completed for document ${documentId}`)
    console.log(`[Indexing] ✓ Index saved successfully for document ${documentId}`)
    
    // Verify index was saved by checking file existence
    // Use vectorStore's getProjectId() to get the normalized project ID
    const vectorStoreProjectId = vectorStore.getProjectId()
    
    // Use getProjectIndexDirectory to ensure consistent path building (with sanitization)
    const indexDir = getProjectIndexDirectory(vectorStoreProjectId)
    const indexFile = path.join(indexDir, 'index.bin')
    const metadataFile = path.join(indexDir, 'metadata.json')
    
    try {
      const indexStats = await fs.stat(indexFile)
      const metadataStats = await fs.stat(metadataFile)
      console.log(`[Indexing] ✓ Index files verified: index=${indexStats.size} bytes, metadata=${metadataStats.size} bytes`)
      console.log(`[Indexing] ✓ Index location: ${indexDir}`)
      console.log(`[Indexing] ✓ Project ID: ${vectorStoreProjectId || 'global'}`)
    } catch (verifyError: any) {
      console.error(`[Indexing] ✗ Index files verification failed:`, verifyError.message)
      console.error(`[Indexing] Expected index file: ${indexFile}`)
      console.error(`[Indexing] Expected metadata file: ${metadataFile}`)
      console.error(`[Indexing] VectorStore project ID: ${vectorStoreProjectId || 'global'}`)
      throw new Error(`Index files were not saved correctly: ${verifyError.message}`)
    }

    // Update status to completed
    status = {
      documentId,
      status: 'completed',
      chunksCount: chunks.length,
      indexedAt: new Date().toISOString(),
    }
    await saveIndexingStatus(status)

      console.log(`[Indexing] ✓ Successfully indexed ${documentId}: ${chunks.length} chunks`)
      return status
    } finally {
      // Release write lock
      releaseLock()
    }
  } catch (error: any) {
    console.error(`[Indexing] Failed to index ${documentId}:`, error)
    
    status = {
      documentId,
      status: 'error',
      error: error.message || 'Unknown error',
    }
    await saveIndexingStatus(status)
    
    throw error
  }
}

/**
 * Re-index a file (useful when file is updated)
 */
export async function reindexFile(
  documentId: string,
  geminiApiKey?: string,
  openaiApiKey?: string
): Promise<IndexingStatus> {
  return indexLibraryFile(documentId, geminiApiKey, openaiApiKey)
}

/**
 * Get indexing status for a document
 */
export async function getIndexingStatus(documentId: string): Promise<IndexingStatus | null> {
  return loadIndexingStatus(documentId)
}

/**
 * Index all library files (batch operation)
 */
export async function indexAllLibraryFiles(
  geminiApiKey?: string,
  openaiApiKey?: string
): Promise<Array<{ documentId: string; status: IndexingStatus }>> {
  const allDocuments = await documentService.getAll()
  const libraryDocuments = allDocuments.filter(doc => doc.folder === 'library')

  const results: Array<{ documentId: string; status: IndexingStatus }> = []

  for (const doc of libraryDocuments) {
    try {
      const status = await indexLibraryFile(doc.id, geminiApiKey, openaiApiKey)
      results.push({ documentId: doc.id, status })
    } catch (error: any) {
      results.push({
        documentId: doc.id,
        status: {
          documentId: doc.id,
          status: 'error',
          error: error.message || 'Unknown error',
        },
      })
    }
  }

  return results
}

/**
 * Remove document from index (when file is deleted or moved out of library)
 */
export async function removeFromIndex(documentId: string): Promise<void> {
  // Get document to determine project ID
  const document = await documentService.getById(documentId)
  if (!document) {
    console.warn(`[Indexing] Document ${documentId} not found, cannot remove from index`)
    return
  }
  
  // Use 'library' for library folder, projectId for project files
  const projectId = document.folder === 'library' ? 'library' : document.projectId
  const projectLockManager = getProjectLockManager()
  const releaseLock = await projectLockManager.acquireWriteLock(projectId)
  
  try {
    const vectorStore = getVectorStore(projectId)
    await vectorStore.loadIndexUnsafe()
    // removeChunksByFileUnsafe() automatically saves the index (autoSave=true by default)
    await vectorStore.removeChunksByFileUnsafe(documentId)
  } finally {
    releaseLock()
  }

  // Remove status file
  try {
    const statusPath = getStatusFilePath(documentId)
    await fs.unlink(statusPath).catch(() => {})
  } catch {
    // Ignore errors
  }
}

export const indexingService = {
  indexLibraryFile,
  reindexFile,
  getIndexingStatus,
  indexAllLibraryFiles,
  removeFromIndex,
}

