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
 * Searches both library and project files
 */
async function resolveFileMentions(
  mentions: string[]
): Promise<string[]> {
  if (mentions.length === 0) {
    return []
  }

  // Search all documents (both library and project files)
  const allDocuments = await documentService.getAll()
  
  const resolvedIds: string[] = []

  for (const mention of mentions) {
    // Try exact match first (case-insensitive) - search all documents
    const exactMatch = allDocuments.find(
      doc => doc.title.toLowerCase() === mention.toLowerCase() ||
             doc.id === mention
    )

    if (exactMatch) {
      resolvedIds.push(exactMatch.id)
      continue
    }

    // Try partial match (filename without extension) - search all documents
    const mentionLower = mention.toLowerCase()
    const partialMatch = allDocuments.find(doc => {
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
  geminiApiKey?: string,
  openaiApiKey?: string,
  fileIds?: string[],
  k: number = 3,
  projectId?: string // Project ID for project-specific search, or 'library' for library search
): Promise<SearchResult[]> {
  if (!query || query.trim().length === 0) {
    return []
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

    // Get vector store for the correct project
    // Use 'library' for library search, projectId for project search
    const searchProjectId = projectId === 'library' ? 'library' : projectId
    const projectLockManager = getProjectLockManager()
    
    // Try read lock first (most common case)
    let releaseLock = await projectLockManager.acquireReadLock(searchProjectId)
    
    try {
      const vectorStore = getVectorStore(searchProjectId)
      
      // Try to load with read lock first
      try {
        await vectorStore.loadIndexUnsafe()
      } catch (loadError: any) {
        // If loadIndexUnsafe fails (e.g., needs rebuilding), upgrade to write lock explicitly
        releaseLock()
        releaseLock = await projectLockManager.acquireWriteLock(searchProjectId)
        try {
          await vectorStore.loadIndexUnsafe()
        } finally {
          // Release write lock and re-acquire read lock for search
          releaseLock()
          releaseLock = await projectLockManager.acquireReadLock(searchProjectId)
        }
      }

      // Search - we hold read lock
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
 * - @library → Search entire library index (projectId = 'library', fileIds = undefined)
 * - @document → Search specific file(s) (fileIds = [docId], projectId determined by document's folder)
 */
export async function searchLibraryWithMentions(
  message: string,
  geminiApiKey?: string,
  openaiApiKey?: string,
  k: number = 3,
  projectId?: string // Default project ID (overridden by @library mention or document's folder)
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

  // Resolve file mentions to document IDs
  let fileIds: string[] | undefined
  let searchProjectId: string | undefined = projectId // Default to provided projectId
  
  if (mentions.fileMentions.length > 0) {
    fileIds = await resolveFileMentions(mentions.fileMentions)
    
    // If no files found, return empty results
    if (fileIds.length === 0) {
      console.warn('[SemanticSearch] File mentions not found:', mentions.fileMentions)
      return {
        results: [],
        mentions,
        formattedResults: '',
      }
    }
    
    // CRITICAL: Determine projectId based on mentioned documents' folders
    // If any mentioned file is in library folder, use 'library' index
    // Otherwise, use the document's projectId (if it's a project file)
    const documents = await documentService.getAll()
    const mentionedDocs = documents.filter(doc => fileIds!.includes(doc.id))
    
    // Check if any mentioned document is in library folder
    const hasLibraryFile = mentionedDocs.some(doc => doc.folder === 'library')
    
    if (hasLibraryFile) {
      // At least one library file mentioned → use 'library' index
      searchProjectId = 'library'
    } else if (mentionedDocs.length > 0) {
      // All mentioned files are project files → use first document's projectId
      const firstDoc = mentionedDocs[0]
      searchProjectId = firstDoc.projectId
    }
    // If no documents found, keep default projectId
  } else if (mentions.hasLibraryMention) {
    // @library mention → always use 'library' index (ignore projectId)
    searchProjectId = 'library'
  }

  // Use cleaned message (without @mentions) for search
  const searchQuery = mentions.cleanedMessage || message

  // Perform search
  const results = await searchLibrary(
    searchQuery,
    geminiApiKey,
    openaiApiKey,
    fileIds,
    k,
    searchProjectId
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

