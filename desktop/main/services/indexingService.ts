// Indexing Service - Orchestrate file indexing workflow
import { Document } from '../../../shared/types.js'
import { documentService } from './documentService.js'
import { extractPDFText } from './pdfTextExtractor.js'
import { parseDocx } from './docxParser.js'
import { chunkText, chunkPDF, chunkDocx, chunkTipTap, chunkTipTapToSemanticBlocks, Chunk, SemanticBlock, DEFAULT_CHUNK_SIZE, DEFAULT_CHUNK_OVERLAP, WORKSPACE_CHUNK_SIZE, WORKSPACE_CHUNK_OVERLAP } from './chunkingService.js'
import { generateEmbeddingsBatch, EMBEDDING_DIMENSION, isQuotaError } from './embeddingService.js'
import { getVectorStore, ChunkMetadata, getProjectIndexDirectory, getProjectLockManager, IndexManifest } from './vectorStore.js'
import { app } from 'electron'
import fs from 'fs/promises'
import path from 'path'
import { buildIntegrationFileId, buildIntegrationFilePrefix, IntegrationItem, IntegrationSourceType } from './integrationTypes.js'

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
  contentHash?: string // File content hash when indexed (for change detection)
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
 * - Library folder files → vectorIndex/{projectId}/library/ (project-isolated)
 *   - Each project has its own isolated library index
 *   - Library files must have projectId set
 *   - This allows @library to search only within the current project's library files
 * - Project folder files → vectorIndex/{projectId}/project/ (project-specific, not implemented yet)
 *   - Project vector index is not supported yet
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

  // Only index PDF (DOCX becomes editable TipTap - use incremental indexing on Ctrl+S instead)
  const fileExt = document.title.toLowerCase().split('.').pop() || ''
  if (fileExt !== 'pdf') {
    throw new Error(`Document ${documentId} is not a PDF. Use incremental indexing for TipTap documents (including editable DOCX).`)
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
    // CRITICAL: Uploaded files (PDF/DOCX) index to project-specific "library" index
    // Architecture: vectorIndex/{projectId}/library/ (project-isolated)
    
    // Uploaded files MUST have projectId set
    if (!document.projectId) {
      const errorMsg = `Cannot index uploaded file ${documentId}: document.projectId is not set. Files must belong to a project.`
      console.error(`[Indexing] ${errorMsg}`)
      throw new Error(errorMsg)
    }
    const projectId = document.projectId
    console.log(`[Indexing] Indexing uploaded file ${documentId} (${document.title}) with projectId: ${projectId}`)
      
      // 📌 Check if document was deleted before indexing
      // If deleted, skip indexing (cleanup will handle it)
      const currentDocument = await documentService.getById(documentId)
      if (currentDocument?.deleted === true) {
        console.log(`[Indexing] Skipping indexing for deleted document: ${documentId}`)
        const skippedStatus: IndexingStatus = {
          documentId,
          status: 'error',
          error: 'Document was deleted',
        }
        await saveIndexingStatus(skippedStatus)
        return skippedStatus
      }
      
      // 📌 Acquire write lock at transaction boundary for entire indexing operation
      // VectorStore is a "database kernel" - it doesn't manage locks
      const projectLockManager = getProjectLockManager()
      const releaseLock = await projectLockManager.acquireWriteLock(projectId)
      
      try {
        // Double-check document wasn't deleted while waiting for lock
        const documentAfterLock = await documentService.getById(documentId)
        if (documentAfterLock?.deleted === true) {
          console.log(`[Indexing] Document ${documentId} was deleted while waiting for lock, skipping indexing`)
          const skippedStatus: IndexingStatus = {
            documentId,
            status: 'error',
            error: 'Document was deleted',
          }
          await saveIndexingStatus(skippedStatus)
          return skippedStatus
        }
        if (!documentAfterLock) {
          const missingStatus: IndexingStatus = {
            documentId,
            status: 'error',
            error: 'Document not found while indexing',
          }
          await saveIndexingStatus(missingStatus)
          return missingStatus
        }
        
        const vectorStore = getVectorStore(projectId, 'library')
        // Load index - we hold write lock
        await vectorStore.loadIndexUnsafe()
        
        // Verify we're using the correct index
        const currentStoreProjectId = vectorStore.getProjectId()
        const currentStoreFolder = vectorStore.getFolder()
        if (currentStoreProjectId !== projectId || currentStoreFolder !== 'library') {
          throw new Error(`Index mismatch: expected ${projectId}/library, but vectorStore has ${currentStoreProjectId}/${currentStoreFolder}`)
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
          // Even if no chunks, we should save an empty index with manifest
          // This ensures the index directory and files exist
          const manifest: IndexManifest = {
            projectId: projectId,
            folder: 'library',
            embeddingModel: geminiApiKey ? 'gemini-embedding-001' : (openaiApiKey ? 'text-embedding-3-small' : 'unknown'),
            embeddingDimension: EMBEDDING_DIMENSION,
            chunkSize: DEFAULT_CHUNK_SIZE,
            chunkOverlap: DEFAULT_CHUNK_OVERLAP,
            indexVersion: '1.0.0',
            appVersion: app.getVersion(),
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          }
          await vectorStore.saveManifest(manifest)
          // Save empty index to ensure files exist
          await vectorStore.saveIndexUnsafe()
          
          status = {
            documentId,
            status: 'completed',
            chunksCount: 0,
            indexedAt: new Date().toISOString(),
            contentHash: document.metadata?.contentHash,
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

        try {
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
        } catch (embeddingError: any) {
          // If quota error, stop immediately and update status
          if (isQuotaError(embeddingError)) {
            console.error(`[Indexing] Quota error detected for document ${documentId}, stopping indexing:`, embeddingError.message)
            status = {
              documentId,
              status: 'error',
              error: `API quota exceeded: ${embeddingError.message}. Please check your API plan and billing details.`,
            }
            await saveIndexingStatus(status)
            throw embeddingError // Re-throw to stop processing
          }
          // For other errors, re-throw to be handled by outer try-catch
          throw embeddingError
        }

        // Add chunks to vector store - we hold write lock
        await vectorStore.addChunksUnsafe(chunks, allEmbeddings)

        // Save manifest after indexing
        const manifest: IndexManifest = {
          projectId: projectId,
          folder: 'library',
          embeddingModel: geminiApiKey ? 'gemini-embedding-001' : (openaiApiKey ? 'text-embedding-3-small' : 'unknown'),
          embeddingDimension: EMBEDDING_DIMENSION,
          chunkSize: DEFAULT_CHUNK_SIZE,
          chunkOverlap: DEFAULT_CHUNK_OVERLAP,
          indexVersion: '1.0.0', // Index structure version, manually bumped when schema changes
          appVersion: app.getVersion(), // App version for debug
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }
        await vectorStore.saveManifest(manifest)

        // CRITICAL: Save vector store explicitly
        // addChunksUnsafe does NOT automatically save - we must save here
        await vectorStore.saveIndexUnsafe()

        // CRITICAL: Verify index was saved successfully
        console.log(`[Indexing] Index operations completed for document ${documentId}`)
        console.log(`[Indexing] ✓ Index saved successfully for document ${documentId}`)
        
        // Verify index was saved by checking file existence
        const storeProjectId = vectorStore.getProjectId()
        const storeFolder = vectorStore.getFolder()
        
        if (!storeProjectId) {
          throw new Error('VectorStore project ID is not set')
        }
        
        // Use getProjectIndexDirectory to ensure consistent path building (with sanitization)
        const indexDir = getProjectIndexDirectory(storeProjectId, storeFolder)
        const indexFile = path.join(indexDir, 'index.bin')
        const metadataFile = path.join(indexDir, 'metadata.json')
        const manifestFile = path.join(indexDir, 'manifest.json')
        
        try {
          const indexStats = await fs.stat(indexFile)
          const metadataStats = await fs.stat(metadataFile)
          const manifestStats = await fs.stat(manifestFile)
          console.log(`[Indexing] ✓ Index files verified: index=${indexStats.size} bytes, metadata=${metadataStats.size} bytes, manifest=${manifestStats.size} bytes`)
          console.log(`[Indexing] ✓ Index location: ${indexDir}`)
          console.log(`[Indexing] ✓ Project ID: ${storeProjectId}/${storeFolder}`)
        } catch (verifyError: any) {
          console.error(`[Indexing] ✗ Index files verification failed:`, verifyError.message)
          console.error(`[Indexing] Expected index file: ${indexFile}`)
          console.error(`[Indexing] Expected metadata file: ${metadataFile}`)
          console.error(`[Indexing] Expected manifest file: ${manifestFile}`)
          console.error(`[VectorStore] Project ID: ${storeProjectId}/${storeFolder}`)
          throw new Error(`Index files were not saved correctly: ${verifyError.message}`)
        }

        // Update status to completed
        // Store contentHash for change detection
        status = {
          documentId,
          status: 'completed',
          chunksCount: chunks.length,
          indexedAt: new Date().toISOString(),
          contentHash: document.metadata?.contentHash, // Store contentHash when indexed
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
 * Check if index is valid (Index-level check)
 * Compares manifest configuration: indexVersion, embeddingModel, chunkSize, chunkOverlap, embeddingDimension
 * @param projectId - Project ID
 * @param folder - Folder type: 'library' or 'project'
 * @returns true if index is valid, false if needs rebuild
 */
export async function isIndexValid(projectId: string, folder: 'library' | 'project'): Promise<boolean> {
  try {
    const vectorStore = getVectorStore(projectId, folder)
    const manifest = await vectorStore.loadManifest()
    
    if (!manifest) {
      // No manifest means index doesn't exist or is legacy
      return false
    }
    
    // Check critical configuration fields
    // Use different chunk sizes for library vs workspace/project folders
    const isWorkspace = folder === 'project'
    const expectedConfig = {
      embeddingModel: 'gemini-embedding-001', // Default, will be checked against actual
      embeddingDimension: EMBEDDING_DIMENSION,
      chunkSize: isWorkspace ? WORKSPACE_CHUNK_SIZE : DEFAULT_CHUNK_SIZE,
      chunkOverlap: isWorkspace ? WORKSPACE_CHUNK_OVERLAP : DEFAULT_CHUNK_OVERLAP,
      indexVersion: '1.0.0', // Current index version
    }
    
    // Check if manifest matches expected configuration
    if (manifest.embeddingDimension !== expectedConfig.embeddingDimension) {
      console.warn(`[Indexing] Index invalid: embeddingDimension mismatch (${manifest.embeddingDimension} vs ${expectedConfig.embeddingDimension})`)
      return false
    }
    
    if (manifest.chunkSize !== expectedConfig.chunkSize) {
      console.warn(`[Indexing] Index invalid: chunkSize mismatch (${manifest.chunkSize} vs ${expectedConfig.chunkSize}). Please reindex files to use the new chunk size.`)
      return false
    }
    
    if (manifest.chunkOverlap !== expectedConfig.chunkOverlap) {
      console.warn(`[Indexing] Index invalid: chunkOverlap mismatch (${manifest.chunkOverlap} vs ${expectedConfig.chunkOverlap}). Please reindex files to use the new chunk overlap.`)
      return false
    }
    
    if (manifest.indexVersion !== expectedConfig.indexVersion) {
      console.warn(`[Indexing] Index invalid: indexVersion mismatch (${manifest.indexVersion} vs ${expectedConfig.indexVersion})`)
      return false
    }
    
    // Embedding model check (more lenient - accept both Gemini and OpenAI models)
    const validModels = ['gemini-embedding-001', 'text-embedding-3-small']
    if (!validModels.includes(manifest.embeddingModel)) {
      console.warn(`[Indexing] Index invalid: embeddingModel not supported (${manifest.embeddingModel})`)
      return false
    }
    
    return true
  } catch (error: any) {
    console.error(`[Indexing] Error checking index validity:`, error)
    return false
  }
}

/**
 * Check if a file needs to be reindexed (File-level check)
 * Only checks file content hash, not chunk configuration or embedding model
 * @param documentId - Document ID
 * @returns true if file needs reindexing, false if already indexed correctly
 */
export async function shouldReindexFile(documentId: string): Promise<boolean> {
  try {
    const document = await documentService.getById(documentId)
    if (!document) {
      return true // Document doesn't exist, needs indexing
    }
    
    // Check if document has contentHash in metadata
    if (!document.metadata?.contentHash) {
      return true // No contentHash means file needs indexing
    }
    
    // Get the current contentHash from document metadata
    const currentHash = document.metadata.contentHash
    
    // Check if file has been indexed before
    const existingStatus = await getIndexingStatus(documentId)
    if (!existingStatus || existingStatus.status !== 'completed') {
      return true // Not indexed yet
    }
    
    // Compare current contentHash with the hash stored when indexed
    // If contentHash changed, file content has changed and needs reindexing
    if (existingStatus.contentHash && existingStatus.contentHash !== currentHash) {
      console.log(`[Indexing] File ${documentId} contentHash changed: ${existingStatus.contentHash} -> ${currentHash}, needs reindexing`)
      return true // File content changed
    }
    
    // If no contentHash stored in status (legacy index), assume needs reindexing if contentHash exists now
    // This handles the case where old indexes don't have contentHash stored
    if (!existingStatus.contentHash && currentHash) {
      console.log(`[Indexing] File ${documentId} has contentHash but index status doesn't, needs reindexing`)
      return true // Legacy index without contentHash
    }
    
    // File is correctly indexed: contentHash matches and status is completed
    // The index-level check (isIndexValid) will catch configuration changes
    return false
  } catch (error: any) {
    console.error(`[Indexing] Error checking if file should be reindexed:`, error)
    return true // On error, assume needs reindexing
  }
}

/**
 * Index uploaded files (PDF, DOCX) for a specific project
 * Used when project changes or API key is added - indexes unindexed uploaded files
 * @param projectId - The project ID to index uploaded files for
 * @param geminiApiKey - Optional Gemini API key
 * @param openaiApiKey - Optional OpenAI API key
 * @param onlyUnindexed - If true, only index files that need indexing (default: true)
 */
export async function indexProjectLibraryFiles(
  projectId: string,
  geminiApiKey?: string,
  openaiApiKey?: string,
  onlyUnindexed: boolean = true
): Promise<Array<{ documentId: string; status: IndexingStatus }>> {
  if (!projectId) {
    throw new Error('Project ID is required for indexing uploaded files')
  }

  const allDocuments = await documentService.getAll()
  // Filter to PDF files (DOCX is editable TipTap, indexed on Ctrl+S)
  const indexableDocuments = allDocuments.filter(doc => {
    if (doc.projectId !== projectId || doc.folder === 'worldlab') return false
    const fileExt = doc.title.toLowerCase().split('.').pop() || ''
    return fileExt === 'pdf'
  })

  if (indexableDocuments.length === 0) {
    console.log(`[Indexing] No indexable PDF files found for project ${projectId}`)
    return []
  }

  // Check index validity for this project
  const indexValid = await isIndexValid(projectId, 'library')
  if (!indexValid) {
    console.warn(`[Indexing] Index for project ${projectId}/library is invalid, forcing full reindex to rebuild`)
  }
  const effectiveOnlyUnindexed = onlyUnindexed && indexValid

  const results: Array<{ documentId: string; status: IndexingStatus }> = []

  for (const doc of indexableDocuments) {
    // If onlyUnindexed is true, use shouldReindexFile for strict checking
    if (effectiveOnlyUnindexed) {
      const needsReindex = await shouldReindexFile(doc.id)
      if (!needsReindex) {
        continue // Skip files that are correctly indexed
      }
    }

    try {
      const status = await indexLibraryFile(doc.id, geminiApiKey, openaiApiKey)
      results.push({ documentId: doc.id, status })
    } catch (error: any) {
      // If quota error, stop processing all remaining files
      if (isQuotaError(error)) {
        console.error(`[Indexing] Quota error detected while indexing ${doc.id}, stopping project indexing:`, error.message)
        results.push({
          documentId: doc.id,
          status: {
            documentId: doc.id,
            status: 'error',
            error: `API quota exceeded: ${error.message}. Please check your API plan and billing details.`,
          },
        })
        // Stop processing remaining files in this project
        break
      }
      
      // For other errors, continue with next file
      console.error(`[Indexing] Failed to index ${doc.title}:`, error.message)
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

  const successCount = results.filter(r => r.status.status === 'completed').length
  const errorCount = results.filter(r => r.status.status === 'error').length

  return results
}

/**
 * Index workspace files for a specific project (project folder)
 * Uses incremental indexing and skips already indexed files when onlyUnindexed is true
 * @param projectId - The project ID to index workspace files for
 * @param geminiApiKey - Optional Gemini API key
 * @param openaiApiKey - Optional OpenAI API key
 * @param onlyUnindexed - If true, only index files that need indexing (default: true)
 */
export async function indexProjectWorkspaceFiles(
  projectId: string,
  geminiApiKey?: string,
  openaiApiKey?: string,
  onlyUnindexed: boolean = true
): Promise<Array<{ documentId: string; status: IndexingStatus }>> {
  if (!projectId) {
    throw new Error('Project ID is required for indexing workspace files')
  }

  const allDocuments = await documentService.getAll()
  const projectWorkspaceDocuments = allDocuments.filter(
    doc => doc.folder === 'project' && doc.projectId === projectId
  )

  if (projectWorkspaceDocuments.length === 0) {
    console.log(`[Indexing] No workspace files found for project ${projectId}`)
    return []
  }

  const results: Array<{ documentId: string; status: IndexingStatus }> = []

  for (const doc of projectWorkspaceDocuments) {
    if (onlyUnindexed) {
      const needsReindex = await shouldReindexFile(doc.id)
      if (!needsReindex) {
        continue
      }
    }

    try {
      const status = await incrementalIndexProjectFile(doc.id, geminiApiKey, openaiApiKey)
      results.push({ documentId: doc.id, status })
    } catch (error: any) {
      if (isQuotaError(error)) {
        console.error(`[Indexing] Quota error detected while indexing ${doc.id}, stopping workspace indexing:`, error.message)
        results.push({
          documentId: doc.id,
          status: {
            documentId: doc.id,
            status: 'error',
            error: `API quota exceeded: ${error.message}. Please check your API plan and billing details.`,
          },
        })
        break
      }

      console.error(`[Indexing] Failed to index workspace file ${doc.title}:`, error.message)
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
 * Index all library files (batch operation)
 * Groups files by project and indexes them to project-specific library indexes
 * NOTE: This indexes ALL projects. Use indexProjectLibraryFiles() for single-project indexing.
 */
export async function indexAllLibraryFiles(
  geminiApiKey?: string,
  openaiApiKey?: string,
  onlyUnindexed: boolean = false
): Promise<Array<{ documentId: string; status: IndexingStatus }>> {
  const allDocuments = await documentService.getAll()
  const libraryDocuments = allDocuments.filter(doc => doc.folder === 'library')

  // Filter to only PDF and DOCX files
  const indexableDocuments = libraryDocuments.filter(doc => {
    const fileExt = doc.title.toLowerCase().split('.').pop() || ''
    return fileExt === 'pdf' || fileExt === 'docx'
  })

  // Group by projectId
  const documentsByProject = new Map<string | undefined, typeof indexableDocuments>()
  for (const doc of indexableDocuments) {
    const projectId = doc.projectId
    if (!documentsByProject.has(projectId)) {
      documentsByProject.set(projectId, [])
    }
    documentsByProject.get(projectId)!.push(doc)
  }

  const results: Array<{ documentId: string; status: IndexingStatus }> = []

  // Process each project group
  for (const [projectId, docs] of documentsByProject.entries()) {
    // Skip documents without projectId (they can't be indexed)
    if (!projectId) {
      console.warn(`[Indexing] Skipping ${docs.length} library files without projectId`)
      for (const doc of docs) {
        results.push({
          documentId: doc.id,
          status: {
            documentId: doc.id,
            status: 'error',
            error: 'Library file must have projectId to be indexed',
          },
        })
      }
      continue
    }

    // Check index validity for this project
    const indexValid = await isIndexValid(projectId, 'library')
    if (!indexValid) {
      console.warn(`[Indexing] Index for project ${projectId}/library is invalid, forcing full reindex to rebuild`)
    }
    const effectiveOnlyUnindexed = onlyUnindexed && indexValid

    for (const doc of docs) {
      // If onlyUnindexed is true, use shouldReindexFile for strict checking
      if (effectiveOnlyUnindexed) {
        const needsReindex = await shouldReindexFile(doc.id)
        if (!needsReindex) {
          continue // Skip files that are correctly indexed
        }
      }

      try {
        const status = await indexLibraryFile(doc.id, geminiApiKey, openaiApiKey)
        results.push({ documentId: doc.id, status })
      } catch (error: any) {
        // If quota error, stop processing all remaining files
        if (isQuotaError(error)) {
          console.error(`[Indexing] Quota error detected while indexing ${doc.id}, stopping batch processing:`, error.message)
          results.push({
            documentId: doc.id,
            status: {
              documentId: doc.id,
              status: 'error',
              error: `API quota exceeded: ${error.message}. Please check your API plan and billing details.`,
            },
          })
          // Stop processing remaining files
          break
        }
        
        // For other errors, continue with next file
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
  
  // Only handle library files (project files not indexed yet)
  if (document.folder !== 'library') {
    console.warn(`[Indexing] Cannot remove non-library file ${documentId} from index: Project vector index is not supported yet`)
    return
  }
  
  // Library files must have projectId
  if (!document.projectId) {
    console.warn(`[Indexing] Cannot remove library file ${documentId} from index: document.projectId is not set`)
    return
  }
  
  const projectId = document.projectId
  const projectLockManager = getProjectLockManager()
  const releaseLock = await projectLockManager.acquireWriteLock(projectId)
  
  try {
    const vectorStore = getVectorStore(projectId, 'library')
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

/**
 * Migrate old shared library index to project-isolated indexes
 * This is a destructive migration that requires re-generating all embeddings
 * 
 * Migration process:
 * 1. Read old vectorIndex/library/ index metadata
 * 2. Group chunks by projectId from metadata
 * 3. Re-generate embeddings for each chunk (destructive - requires API keys)
 * 4. Migrate each project's chunks to {projectId}/library/ index
 * 5. Backup old index to vectorIndex/library.backup.{timestamp}/
 * 
 * @param geminiApiKey - Gemini API key for re-generating embeddings
 * @param openaiApiKey - OpenAI API key for re-generating embeddings (fallback)
 * @param onProgress - Progress callback: (current: number, total: number) => void
 * @returns Migration result with success count and errors
 */
export async function migrateLibraryIndex(
  geminiApiKey?: string,
  openaiApiKey?: string,
  onProgress?: (current: number, total: number) => void
): Promise<{
  success: boolean
  migratedProjects: number
  migratedChunks: number
  errors: string[]
}> {
  const result = {
    success: false,
    migratedProjects: 0,
    migratedChunks: 0,
    errors: [] as string[],
  }

  // Check for API keys
  const hasGeminiKey = geminiApiKey && geminiApiKey.trim().length > 0
  const hasOpenaiKey = openaiApiKey && openaiApiKey.trim().length > 0
  
  if (!hasGeminiKey && !hasOpenaiKey) {
    result.errors.push('No embedding API key available. Please configure Gemini or OpenAI API key.')
    return result
  }

  try {
    const BASE_VECTOR_INDEX_DIR = path.join(app.getPath('userData'), 'vectorIndex')
    const oldLibraryIndexDir = path.join(BASE_VECTOR_INDEX_DIR, 'library')
    const oldMetadataFile = path.join(oldLibraryIndexDir, 'metadata.json')
    const oldIndexFile = path.join(oldLibraryIndexDir, 'index.bin')

    // Check if old index exists
    try {
      await fs.access(oldMetadataFile)
      await fs.access(oldIndexFile)
    } catch {
      // Old index doesn't exist, nothing to migrate
      result.success = true
      return result
    }

    // Load old metadata
    let oldMetadata: any
    try {
      const metadataContent = await fs.readFile(oldMetadataFile, 'utf-8')
      oldMetadata = JSON.parse(metadataContent)
    } catch (error: any) {
      result.errors.push(`Failed to read old metadata: ${error.message}`)
      return result
    }

    // Extract chunks grouped by projectId
    const chunksByProject = new Map<string, Array<{ chunkId: string; metadata: ChunkMetadata }>>()
    
    if (oldMetadata.metadata && Array.isArray(oldMetadata.metadata)) {
      for (const [label, chunkMetadata] of oldMetadata.metadata) {
        const projectId = chunkMetadata.projectId || 'unknown'
        if (!chunksByProject.has(projectId)) {
          chunksByProject.set(projectId, [])
        }
        chunksByProject.get(projectId)!.push({
          chunkId: chunkMetadata.id,
          metadata: chunkMetadata,
        })
      }
    }

    if (chunksByProject.size === 0) {
      // No chunks to migrate
      result.success = true
      return result
    }

    // Calculate total chunks for progress tracking
    let totalChunks = 0
    for (const chunks of chunksByProject.values()) {
      totalChunks += chunks.length
    }

    let processedChunks = 0

    // Migrate each project's chunks
    for (const [projectId, chunks] of chunksByProject.entries()) {
      if (projectId === 'unknown') {
        result.errors.push(`Skipping ${chunks.length} chunks with unknown projectId`)
        continue
      }

      try {
        const projectLockManager = getProjectLockManager()
        const releaseLock = await projectLockManager.acquireWriteLock(projectId)

        try {
          const vectorStore = getVectorStore(projectId, 'library')
          await vectorStore.loadIndexUnsafe()

          // Re-generate embeddings for each chunk (destructive migration)
          // We need to re-index the files because:
          // 1. Old index is shared across all projects
          // 2. New index is project-isolated
          // 3. We need to ensure embeddings are generated with current API keys and models
          
          // Group chunks by fileId for efficient re-indexing
          const chunksByFile = new Map<string, ChunkMetadata[]>()
          for (const { metadata } of chunks) {
            if (!chunksByFile.has(metadata.fileId)) {
              chunksByFile.set(metadata.fileId, [])
            }
            chunksByFile.get(metadata.fileId)!.push(metadata)
          }

          // Re-index each file (this will re-generate embeddings)
          for (const [fileId, fileChunks] of chunksByFile.entries()) {
            try {
              // Check if document still exists
              const document = await documentService.getById(fileId)
              if (!document) {
                console.warn(`[Migration] Document ${fileId} not found, skipping`)
                processedChunks += fileChunks.length
                continue
              }

              // Re-index the file (this will re-generate embeddings)
              console.log(`[Migration] Re-indexing file ${fileId} for project ${projectId}...`)
              await indexLibraryFile(fileId, geminiApiKey, openaiApiKey)
              
              processedChunks += fileChunks.length
              if (onProgress) {
                onProgress(processedChunks, totalChunks)
              }
            } catch (error: any) {
              console.error(`[Migration] Failed to re-index file ${fileId}:`, error)
              result.errors.push(`Failed to re-index file ${fileId}: ${error.message}`)
              processedChunks += fileChunks.length
              if (onProgress) {
                onProgress(processedChunks, totalChunks)
              }
            }
          }
        } finally {
          releaseLock()
        }
      } catch (error: any) {
        result.errors.push(`Failed to migrate project ${projectId}: ${error.message}`)
      }
    }

    // Backup old index (only if migration was successful)
    if (result.errors.length === 0 || processedChunks > 0) {
      try {
        const timestamp = Date.now()
        const backupDir = path.join(BASE_VECTOR_INDEX_DIR, `library.backup.${timestamp}`)
        await fs.mkdir(backupDir, { recursive: true })
        await fs.copyFile(oldMetadataFile, path.join(backupDir, 'metadata.json'))
        await fs.copyFile(oldIndexFile, path.join(backupDir, 'index.bin'))
        console.log(`[Migration] Old index backed up to: ${backupDir}`)
      } catch (error: any) {
        result.errors.push(`Failed to backup old index: ${error.message}`)
      }
    }

    // Mark old index as deprecated after successful migration
    if (processedChunks > 0) {
      try {
        const deprecatedMarker = path.join(oldLibraryIndexDir, '.deprecated')
        await fs.writeFile(deprecatedMarker, JSON.stringify({
          deprecatedAt: new Date().toISOString(),
          reason: 'Migration to project-isolated indexes',
          migratedChunks: processedChunks,
          migratedProjects: chunksByProject.size,
        }), 'utf-8')
        console.log(`[Migration] Old index marked as deprecated`)
      } catch (error: any) {
        result.errors.push(`Failed to mark old index as deprecated: ${error.message}`)
      }
    }

    result.success = result.errors.length === 0 || processedChunks > 0
    result.migratedProjects = chunksByProject.size
    result.migratedChunks = processedChunks
  } catch (error: any) {
    result.errors.push(`Migration failed: ${error.message}`)
  }

  return result
}

/**
 * Incrementally index a project file (Workspace folder)
 * Only re-indexes modified paragraphs, updates positions for moved paragraphs
 * 
 * @param documentId - Document ID to index
 * @param geminiApiKey - Optional Gemini API key
 * @param openaiApiKey - Optional OpenAI API key
 * @returns Indexing status
 */
export async function incrementalIndexProjectFile(
  documentId: string,
  geminiApiKey?: string,
  openaiApiKey?: string
): Promise<IndexingStatus> {
  const hasGeminiKey = geminiApiKey && geminiApiKey.trim().length > 0
  const hasOpenaiKey = openaiApiKey && openaiApiKey.trim().length > 0
  
  if (!hasGeminiKey && !hasOpenaiKey) {
    const errorStatus: IndexingStatus = {
      documentId,
      status: 'error',
      error: 'No embedding API key available. Please configure Gemini or OpenAI API key in Settings > API Keys.',
    }
    await saveIndexingStatus(errorStatus)
    return errorStatus
  }

  // Load document
  const document = await documentService.getById(documentId)
  if (!document) {
    throw new Error(`Document ${documentId} not found`)
  }

  // Only index project files
  if (document.folder !== 'project') {
    throw new Error(`Document ${documentId} is not in project folder`)
  }

  if (!document.projectId) {
    throw new Error(`Document ${documentId} must have projectId set`)
  }

  const projectId = document.projectId

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
    // Acquire write lock
    const projectLockManager = getProjectLockManager()
    const releaseLock = await projectLockManager.acquireWriteLock(projectId)
    
    try {
      // Double-check document wasn't deleted while waiting for lock
      const documentAfterLock = await documentService.getById(documentId)
      if (documentAfterLock?.deleted === true) {
        console.log(`[Indexing] Document ${documentId} was deleted while waiting for lock, skipping indexing`)
        const skippedStatus: IndexingStatus = {
          documentId,
          status: 'error',
          error: 'Document was deleted',
        }
        await saveIndexingStatus(skippedStatus)
        return skippedStatus
      }
      if (!documentAfterLock) {
        const missingStatus: IndexingStatus = {
          documentId,
          status: 'error',
          error: 'Document not found while indexing',
        }
        await saveIndexingStatus(missingStatus)
        return missingStatus
      }
      
      const vectorStore = getVectorStore(projectId, 'project')
      await vectorStore.loadIndexUnsafe()

      // Parse TipTap content to semantic blocks
      let currentBlocks: SemanticBlock[] = []
      try {
        const content = JSON.parse(document.content)
        currentBlocks = chunkTipTapToSemanticBlocks(content, documentId)
      } catch (parseError: any) {
        throw new Error(`Failed to parse TipTap content: ${parseError.message}`)
      }

      if (currentBlocks.length === 0) {
        // No blocks to index
        status = {
          documentId,
          status: 'completed',
          chunksCount: 0,
          indexedAt: new Date().toISOString(),
          contentHash: document.metadata?.contentHash,
        }
        await saveIndexingStatus(status)
        return status
      }

      // Load existing blocks from index for this file
      const existingBlocks = vectorStore.getChunksByFileIdUnsafe(documentId).filter(m => m.paragraphId)

      // Create maps for matching
      const currentBlocksByHash = new Map<string, SemanticBlock>()
      const existingBlocksByHash = new Map<string, ChunkMetadata>()
      const existingBlocksByParagraphId = new Map<string, ChunkMetadata>()

      // Index current blocks by hash
      for (const block of currentBlocks) {
        currentBlocksByHash.set(block.hash, block)
      }

      // Index existing blocks by hash and paragraphId
      for (const existing of existingBlocks) {
        const hash = existing.paragraphHash || existing.hash
        if (hash) {
          existingBlocksByHash.set(hash, existing)
        }
        if (existing.paragraphId) {
          existingBlocksByParagraphId.set(existing.paragraphId, existing)
        }
      }

      // Classify blocks: new, modified, moved, deleted
      const blocksToAdd: SemanticBlock[] = []
      const blocksToUpdate: { block: SemanticBlock; existingParagraphId: string }[] = []
      const blocksToMove: { block: SemanticBlock; existingParagraphId: string }[] = []
      const paragraphIdsToDelete: string[] = []

      for (const block of currentBlocks) {
        const existingByHash = existingBlocksByHash.get(block.hash)
        
        if (!existingByHash) {
          // Hash doesn't match - new block or modified block
          // For incremental indexing, we treat hash mismatches as new blocks
          // (modified blocks will get new paragraphId and new embedding)
          blocksToAdd.push(block)
        } else {
          // Hash matches - same content, check if position changed
          const existingParagraphId = existingByHash.paragraphId
          if (existingParagraphId) {
            // Create a copy of block with preserved paragraphId
            const blockWithPreservedId: SemanticBlock = {
              ...block,
              paragraphId: existingParagraphId, // Preserve existing UUID
            }
            
            const existingByParagraphId = existingBlocksByParagraphId.get(existingParagraphId)
            if (existingByParagraphId) {
              if (existingByParagraphId.paragraphIndex !== block.paragraphIndex) {
                // Position changed - move (update position only, no re-embedding)
                blocksToMove.push({ block: blockWithPreservedId, existingParagraphId })
              }
              // Position unchanged - no action needed (block already indexed correctly)
            } else {
              // paragraphId exists but not found in index - treat as new
              blocksToAdd.push(block)
            }
          } else {
            // No paragraphId in existing block - this is a legacy block
            // Treat as new block (will get new paragraphId)
            blocksToAdd.push(block)
          }
        }
      }

      // Find deleted blocks (exist in index but not in current document)
      for (const existing of existingBlocks) {
        const hash = existing.paragraphHash || existing.hash
        if (hash && !currentBlocksByHash.has(hash)) {
          if (existing.paragraphId) {
            paragraphIdsToDelete.push(existing.paragraphId)
          }
        }
      }

      // Update progress
      const totalBlocksToProcess = blocksToAdd.length + blocksToUpdate.length
      status.progress = {
        totalChunks: totalBlocksToProcess,
        processedChunks: 0,
      }
      await saveIndexingStatus(status)

      // Generate embeddings for new and modified blocks
      const blocksNeedingEmbeddings = [...blocksToAdd, ...blocksToUpdate.map(b => b.block)]
      const embeddings: number[][] = []

      if (blocksNeedingEmbeddings.length > 0) {
        const batchSize = 10
        try {
          for (let i = 0; i < blocksNeedingEmbeddings.length; i += batchSize) {
            const batch = blocksNeedingEmbeddings.slice(i, i + batchSize)
            const batchTexts = batch.map(block => block.text)
            
            const batchResults = await generateEmbeddingsBatch(
              batchTexts,
              geminiApiKey,
              openaiApiKey,
              batchSize
            )
            
            const batchEmbeddings = batchResults.map(result => result.embedding)
            embeddings.push(...batchEmbeddings)

            // Update progress
            status.progress = {
              totalChunks: totalBlocksToProcess,
              processedChunks: Math.min(i + batchSize, blocksNeedingEmbeddings.length),
            }
            await saveIndexingStatus(status)
          }
        } catch (embeddingError: any) {
          if (isQuotaError(embeddingError)) {
            status = {
              documentId,
              status: 'error',
              error: `API quota exceeded: ${embeddingError.message}`,
            }
            await saveIndexingStatus(status)
            throw embeddingError
          }
          throw embeddingError
        }
      }

      // Delete removed blocks
      for (const paragraphId of paragraphIdsToDelete) {
        await vectorStore.removeChunkByParagraphIdUnsafe(paragraphId, false) // Don't auto-save
      }

      // Update positions for moved blocks
      for (const { block, existingParagraphId } of blocksToMove) {
        await vectorStore.updateChunkPositionUnsafe(
          existingParagraphId,
          block.paragraphIndex,
          false // Don't auto-save
        )
      }

      // Add new and modified blocks
      if (blocksNeedingEmbeddings.length > 0) {
        await vectorStore.addSemanticBlocksUnsafe(
          blocksNeedingEmbeddings,
          embeddings,
          projectId
        )
      }

      // Save index
      await vectorStore.saveIndexUnsafe()

      // Update manifest
      const manifest: IndexManifest = {
        projectId: projectId,
        folder: 'project',
        embeddingModel: geminiApiKey ? 'gemini-embedding-001' : (openaiApiKey ? 'text-embedding-3-small' : 'unknown'),
        embeddingDimension: EMBEDDING_DIMENSION,
        chunkSize: WORKSPACE_CHUNK_SIZE,
        chunkOverlap: WORKSPACE_CHUNK_OVERLAP,
        indexVersion: '1.0.0',
        appVersion: app.getVersion(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }
      await vectorStore.saveManifest(manifest)

      // Update status
      status = {
        documentId,
        status: 'completed',
        chunksCount: currentBlocks.length,
        indexedAt: new Date().toISOString(),
        contentHash: document.metadata?.contentHash,
      }
      await saveIndexingStatus(status)

      console.log(`[Indexing] ✓ Incrementally indexed ${documentId}: ${blocksToAdd.length} added, ${blocksToMove.length} moved, ${paragraphIdsToDelete.length} deleted`)
      return status
    } finally {
      releaseLock()
    }
  } catch (error: any) {
    console.error(`[Indexing] Failed to incrementally index ${documentId}:`, error)
    
    status = {
      documentId,
      status: 'error',
      error: error.message || 'Unknown error',
    }
    await saveIndexingStatus(status)
    
    throw error
  }
}

export async function indexIntegrationContent(
  projectId: string,
  sourceType: IntegrationSourceType,
  sourceId: string,
  items: IntegrationItem[],
  geminiApiKey?: string,
  openaiApiKey?: string
): Promise<{ itemCount: number; chunkCount: number }> {
  const hasGeminiKey = geminiApiKey && geminiApiKey.trim().length > 0
  const hasOpenaiKey = openaiApiKey && openaiApiKey.trim().length > 0
  if (!hasGeminiKey && !hasOpenaiKey) {
    throw new Error('No embedding API key available. Please configure Gemini or OpenAI API key.')
  }

  const projectLockManager = getProjectLockManager()
  const releaseLock = await projectLockManager.acquireWriteLock(projectId)

  try {
    const vectorStore = getVectorStore(projectId, 'library')
    await vectorStore.loadIndexUnsafe()

    const filePrefix = buildIntegrationFilePrefix(sourceType, sourceId)
    const existingFileIds = vectorStore.getFileIdsByPrefixUnsafe(filePrefix)

    const newItemFileIds = new Set<string>()
    const toAddItems: IntegrationItem[] = []
    for (const item of items) {
      const itemId = item.id || item.externalId
      if (!itemId) continue
      const itemFileId = buildIntegrationFileId(sourceType, sourceId, itemId)
      const title = (item.title || '').trim()
      const content = (item.content || '').trim()
      const text = title ? `${title}\n\n${content}` : content
      if (!text) continue
      newItemFileIds.add(itemFileId)
      if (!existingFileIds.has(itemFileId)) {
        toAddItems.push(item)
      }
    }

    const toRemove = [...existingFileIds].filter(fid => !newItemFileIds.has(fid))
    for (const fileId of toRemove) {
      await vectorStore.removeChunksByFileUnsafe(fileId, false)
    }

    if (items.length === 0 && toRemove.length === 0) {
      await vectorStore.saveIndexUnsafe()
      return { itemCount: 0, chunkCount: 0 }
    }

    if (toAddItems.length === 0) {
      await vectorStore.saveIndexUnsafe()
      return {
        itemCount: 0,
        chunkCount: 0,
      }
    }

    const chunks: Chunk[] = []
    for (const item of toAddItems) {
      const itemId = item.id || item.externalId
      if (!itemId) continue
      const itemFileId = buildIntegrationFileId(sourceType, sourceId, itemId)
      const title = (item.title || '').trim()
      const content = (item.content || '').trim()
      const text = title ? `${title}\n\n${content}` : content
      if (!text) continue
      const itemChunks = chunkText(text, itemFileId, DEFAULT_CHUNK_SIZE, DEFAULT_CHUNK_OVERLAP)
      chunks.push(...itemChunks)
    }

    if (chunks.length === 0) {
      await vectorStore.saveIndexUnsafe()
      return { itemCount: items.length, chunkCount: 0 }
    }

    const embeddingResults = await generateEmbeddingsBatch(
      chunks.map(chunk => chunk.text),
      geminiApiKey,
      openaiApiKey,
      10
    )
    const embeddings = embeddingResults.map(result => result.embedding)

    await vectorStore.addChunksUnsafe(chunks, embeddings, projectId)
    await vectorStore.saveIndexUnsafe()

    return {
      itemCount: toAddItems.length,
      chunkCount: chunks.length,
    }
  } finally {
    releaseLock()
  }
}

export const indexingService = {
  indexLibraryFile,
  reindexFile,
  getIndexingStatus,
  indexAllLibraryFiles,
  indexProjectLibraryFiles,
  indexProjectWorkspaceFiles,
  removeFromIndex,
  isIndexValid,
  shouldReindexFile,
  migrateLibraryIndex,
  incrementalIndexProjectFile,
  indexIntegrationContent,
}

