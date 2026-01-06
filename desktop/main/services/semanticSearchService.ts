// Semantic Search Service - Parse @mentions and perform semantic search
import { generateEmbedding } from './embeddingService.js'
import { getVectorStore, SearchResult, getProjectLockManager } from './vectorStore.js'
import { documentService } from './documentService.js'

/**
 * Parsed mention information
 */
export interface ParsedMentions {
  hasLibraryMention: boolean // @Library mentioned
  fileMentions: string[] // Array of file IDs or file names mentioned
  originalMessage: string // Original message text
  cleanedMessage: string // Message with @mentions removed (for embedding)
}

/**
 * Parse @mentions from user message
 * Supports:
 * - @Library - search entire library
 * - @filename - search specific file (by name or ID)
 */
export function parseMentions(message: string): ParsedMentions {
  const result: ParsedMentions = {
    hasLibraryMention: false,
    fileMentions: [],
    originalMessage: message,
    cleanedMessage: message,
  }

  if (!message || typeof message !== 'string') {
    return result
  }

  // Pattern to match @mentions
  // Matches: @Library, @filename, @file-id, etc.
  const mentionPattern = /@(\w+)/g
  const matches = Array.from(message.matchAll(mentionPattern))

  if (matches.length === 0) {
    return result
  }

  // Process each mention
  for (const match of matches) {
    const mention = match[1].toLowerCase()

    // Check for @Library mention
    if (mention === 'library') {
      result.hasLibraryMention = true
    } else {
      // Assume it's a file mention (could be filename or ID)
      // We'll resolve it later when searching
      result.fileMentions.push(match[1]) // Keep original case for matching
    }
  }

  // Remove @mentions from message for embedding generation
  // Keep the text content but remove the @mention syntax
  result.cleanedMessage = message.replace(mentionPattern, '').trim()

  return result
}

/**
 * Resolve file mentions to document IDs
 * Tries to match by filename or document ID
 * Only searches library files in the current project
 */
async function resolveFileMentions(
  mentions: string[],
  projectId: string // Required: Current project ID
): Promise<string[]> {
  if (mentions.length === 0) {
    return []
  }

  // Search only library files in the current project
  const allDocuments = await documentService.getAll()
  const projectLibraryDocuments = allDocuments.filter(
    doc => doc.folder === 'library' && doc.projectId === projectId
  )
  
  const resolvedIds: string[] = []

  for (const mention of mentions) {
    // Try exact match first (case-insensitive) - search only project's library files
    const exactMatch = projectLibraryDocuments.find(
      doc => doc.title.toLowerCase() === mention.toLowerCase() ||
             doc.id === mention
    )

    if (exactMatch) {
      resolvedIds.push(exactMatch.id)
      continue
    }

    // Try partial match (filename without extension) - search only project's library files
    const mentionLower = mention.toLowerCase()
    const partialMatch = projectLibraryDocuments.find(doc => {
      const fileName = doc.title.toLowerCase()
      const nameWithoutExt = fileName.substring(0, fileName.lastIndexOf('.'))
      return nameWithoutExt === mentionLower || fileName.includes(mentionLower)
    })

    if (partialMatch) {
      resolvedIds.push(partialMatch.id)
    }
  }

  return resolvedIds
}

/**
 * Format search results for AI context injection
 */
export function formatSearchResults(results: SearchResult[]): string {
  if (results.length === 0) {
    return ''
  }

  const formatted = results.map((result, index) => {
    const chunk = result.chunk
    return `[Reference ${index + 1}]
File: ${chunk.fileId}
Chunk: ${chunk.chunkIndex + 1}
Similarity: ${(result.score * 100).toFixed(1)}%

${chunk.text}

---`
  }).join('\n\n')

  return formatted
}

/**
 * Search library for relevant chunks
 * @param query User query text
 * @param geminiApiKey Gemini API key for embedding generation
 * @param openaiApiKey OpenAI API key for embedding generation (fallback)
 * @param fileIds Optional: filter by specific file IDs
 * @param k Number of results to return (default: 3)
 */
export async function searchLibrary(
  query: string,
  projectId: string,
  folder: 'library' | 'project',
  geminiApiKey?: string,
  openaiApiKey?: string,
  fileIds?: string[],
  k: number = 3
): Promise<SearchResult[]> {
  if (!query || query.trim().length === 0) {
    return []
  }

  // Check for deprecated old library index (only for library folder)
  if (folder === 'library') {
    try {
      const { app } = await import('electron')
      const fs = await import('fs/promises')
      const path = await import('path')
      const BASE_VECTOR_INDEX_DIR = path.join(app.getPath('userData'), 'vectorIndex')
      const oldLibraryIndexDir = path.join(BASE_VECTOR_INDEX_DIR, 'library')
      const deprecatedMarker = path.join(oldLibraryIndexDir, '.deprecated')
      
      try {
        await fs.access(deprecatedMarker)
        // Old index is deprecated, don't search it
        // Only search the new project-isolated index
        console.log('[SemanticSearch] Old library index is deprecated, using project-isolated index only')
      } catch {
        // .deprecated marker doesn't exist, continue normally
      }
    } catch (error) {
      // Ignore errors checking deprecated marker
    }
  }

  // Check for API keys
  const hasGeminiKey = geminiApiKey && geminiApiKey.trim().length > 0
  const hasOpenaiKey = openaiApiKey && openaiApiKey.trim().length > 0
  
  if (!hasGeminiKey && !hasOpenaiKey) {
    console.warn('[SemanticSearch] No API keys available for search, returning empty results')
    return []
  }

  try {
    // Generate query embedding
    const { embedding } = await generateEmbedding(
      query.trim(),
      geminiApiKey,
      openaiApiKey
    )

    // Get vector store for the correct project and folder
    const projectLockManager = getProjectLockManager()
    
    // Try read lock first (most common case)
    let releaseLock = await projectLockManager.acquireReadLock(projectId)
    
    try {
      const vectorStore = getVectorStore(projectId, folder)
      
      // Try to load with read lock first
      try {
        await vectorStore.loadIndexUnsafe()
      } catch (loadError: any) {
        // If loadIndexUnsafe fails (e.g., needs rebuilding), upgrade to write lock explicitly
        releaseLock()
        releaseLock = await projectLockManager.acquireWriteLock(projectId)
        try {
          await vectorStore.loadIndexUnsafe()
        } finally {
          // Release write lock and re-acquire read lock for search
          releaseLock()
          releaseLock = await projectLockManager.acquireReadLock(projectId)
        }
      }

      // Search - we hold read lock
      // Index is already scoped by projectId and folder, no need for additional filtering
      const results = await vectorStore.searchUnsafe(embedding, k, fileIds)
      return results
    } finally {
      releaseLock()
    }
  } catch (error: any) {
    // Handle missing API keys gracefully
    if (error.message?.includes('No embedding API key') || 
        error.message?.includes('not configured')) {
      console.warn('[SemanticSearch] API key error:', error.message)
      return []
    }
    
    console.error('[SemanticSearch] Search failed:', error)
    throw new Error(`Failed to search library: ${error.message}`)
  }
}

/**
 * Search library with @mention parsing
 * Automatically detects @Library or @filename mentions and performs search
 * 
 * SEARCH STRATEGY:
 * - @library → Search project's library index ({projectId}/library)
 * - @files → Search specific library file(s) in current project
 */
export async function searchLibraryWithMentions(
  message: string,
  projectId: string, // Required: Current project ID
  geminiApiKey?: string,
  openaiApiKey?: string,
  k: number = 3
): Promise<{
  results: SearchResult[]
  mentions: ParsedMentions
  formattedResults: string
}> {
  // Parse mentions
  const mentions = parseMentions(message)

  // If no library mention, return empty results
  if (!mentions.hasLibraryMention && mentions.fileMentions.length === 0) {
    return {
      results: [],
      mentions,
      formattedResults: '',
    }
  }

  // Resolve file mentions to document IDs (only library files in current project)
  let fileIds: string[] | undefined
  
  if (mentions.fileMentions.length > 0) {
    fileIds = await resolveFileMentions(mentions.fileMentions, projectId)
    
    // If no files found, return empty results
    if (fileIds.length === 0) {
      console.warn('[SemanticSearch] File mentions not found:', mentions.fileMentions)
      return {
        results: [],
        mentions,
        formattedResults: '',
      }
    }
  }

  // Use cleaned message (without @mentions) for search
  const searchQuery = mentions.cleanedMessage || message

  // Perform search in current project's library index
  // Index is already scoped by projectId and folder='library', no need for filtering
  const results = await searchLibrary(
    searchQuery,
    projectId,
    'library',
    geminiApiKey,
    openaiApiKey,
    fileIds,
    k
  )

  // Format results for AI context
  const formattedResults = formatSearchResults(results)

  return {
    results,
    mentions,
    formattedResults,
  }
}

/**
 * Get all library file names and IDs (for autocomplete)
 */
export async function getLibraryFiles(): Promise<Array<{ id: string; name: string }>> {
  const allDocuments = await documentService.getAll()
  const libraryDocuments = allDocuments.filter(doc => doc.folder === 'library')
  
  return libraryDocuments.map(doc => ({
    id: doc.id,
    name: doc.title,
  }))
}

export const semanticSearchService = {
  parseMentions,
  searchLibrary,
  searchLibraryWithMentions,
  formatSearchResults,
  getLibraryFiles,
}

