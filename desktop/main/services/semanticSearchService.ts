// Semantic Search Service - Parse @mentions and perform semantic search
import { generateEmbedding } from './embeddingService.js'
import { getVectorStore, SearchResult, getProjectLockManager } from './vectorStore.js'
import { documentService } from './documentService.js'
import { indexProjectLibraryFiles, indexProjectWorkspaceFiles } from './indexingService.js'
import { parseIntegrationFileId } from './integrationTypes.js'

/**
 * Parsed mention information
 */
export interface ParsedMentions {
  hasLibraryMention: boolean // @Library mentioned
  fileMentions: string[] // Array of file IDs or file names mentioned
  sourceMentions: Array<'github' | 'notion'> // Source mentions like @github, @notion
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
    sourceMentions: [],
    originalMessage: message,
    cleanedMessage: message,
  }

  if (!message || typeof message !== 'string') {
    return result
  }

  // Normalize Add-to-Chat references like:
  // @File Name.md (12-20)  ->  @"File Name.md"
  // This keeps line-range text user-visible while making mention parsing robust.
  const normalizedMessage = message.replace(
    /(^|\s)@([^\n@]+?) \(\d+-\d+\)(?=\s|$)/g,
    (_full, prefix, fileName) => `${prefix}@"${String(fileName).trim()}"`
  )

  // Pattern to match @mentions
  // Matches: @Library, @filename, @file-id, @"File Name.md", @'File Name.md'
  // Keep a leading whitespace group so we can preserve it in replacements.
  const mentionPattern = /(^|\s)@\s*("([^"]+)"|'([^']+)'|([^\s@]+))/g
  const matches = Array.from(normalizedMessage.matchAll(mentionPattern))

  if (matches.length === 0) {
    return result
  }

  // Process each mention
  for (const match of matches) {
    const rawMention = (match[3] || match[4] || match[5] || '').trim()
    if (!rawMention) {
      continue
    }
    
    // Trim trailing punctuation that often follows mentions in prose
    const cleanedMention = rawMention.replace(/[.,:;!?]+$/, '')
    if (!cleanedMention) {
      continue
    }
    
    const mention = cleanedMention.toLowerCase()

    // Check for @Library mention
    if (mention === 'library') {
      result.hasLibraryMention = true
    } else if (mention === 'github' || mention === 'notion') {
      if (!result.sourceMentions.includes(mention)) {
        result.sourceMentions.push(mention)
      }
    } else {
      // Assume it's a file mention (could be filename or ID)
      // We'll resolve it later when searching
      result.fileMentions.push(cleanedMention) // Keep original case for matching
    }
  }

  // Remove @mentions from message for embedding generation
  // Keep the text content but remove the @mention syntax
  result.cleanedMessage = normalizedMessage.replace(mentionPattern, (_full, prefix) => prefix || '').trim()

  return result
}

const INDEX_RECOVERY_COOLDOWN_MS = 2 * 60 * 1000
const indexRecoveryState = new Map<string, { inFlight: Promise<void> | null; lastAttempt: number }>()

function getRecoveryKey(projectId: string, folder: 'library' | 'project'): string {
  return `${projectId}:${folder}`
}

function isIndexableLibraryDocument(doc: { title?: string }): boolean {
  const fileExt = (doc.title || '').toLowerCase().split('.').pop() || ''
  return fileExt === 'pdf' // PDF indexed on upload; DOCX is editable TipTap, indexed on Ctrl+S
}

async function shouldAttemptIndexRecovery(
  projectId: string,
  folder: 'library' | 'project',
  indexCount: number,
  metadataCount: number
): Promise<boolean> {
  if (metadataCount > 0 && indexCount === 0) {
    return true
  }

  if (metadataCount === 0 && indexCount === 0) {
    const allDocuments = await documentService.getAll()
    if (folder === 'project') {
      return allDocuments.some(doc =>
        doc.projectId === projectId &&
        (doc.folder === 'project' || doc.folder == null) &&
        !isIndexableLibraryDocument(doc)
      )
    }

    return allDocuments.some(
      doc => doc.projectId === projectId && doc.folder !== 'worldlab' && isIndexableLibraryDocument(doc)
    )
  }

  return false
}

async function recoverIndexIfNeeded(
  projectId: string,
  folder: 'library' | 'project',
  geminiApiKey?: string,
  openaiApiKey?: string
): Promise<void> {
  const hasGeminiKey = geminiApiKey && geminiApiKey.trim().length > 0
  const hasOpenaiKey = openaiApiKey && openaiApiKey.trim().length > 0
  if (!hasGeminiKey && !hasOpenaiKey) {
    return
  }

  const key = getRecoveryKey(projectId, folder)
  const state = indexRecoveryState.get(key) || { inFlight: null, lastAttempt: 0 }
  const now = Date.now()
  if (state.inFlight) {
    await state.inFlight
    return
  }
  if (now - state.lastAttempt < INDEX_RECOVERY_COOLDOWN_MS) {
    return
  }

  state.lastAttempt = now
  const recoveryPromise = (async () => {
    try {
      if (folder === 'project') {
        console.warn(`[SemanticSearch] Rebuilding workspace index for project ${projectId}`)
        await indexProjectWorkspaceFiles(projectId, geminiApiKey, openaiApiKey, true)
        return
      }

      console.warn(`[SemanticSearch] Rebuilding library index for project ${projectId}`)
      await indexProjectLibraryFiles(projectId, geminiApiKey, openaiApiKey, true)
    } catch (error: any) {
      console.error('[SemanticSearch] Index recovery failed:', error)
    }
  })()

  state.inFlight = recoveryPromise
  indexRecoveryState.set(key, state)

  try {
    await recoveryPromise
  } finally {
    state.inFlight = null
    indexRecoveryState.set(key, state)
  }
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

const FILE_EXISTENCE_CACHE_TTL_MS = 60_000
const fileExistenceCache = new Map<string, { exists: boolean; timestamp: number }>()

/**
 * Verify file existence and filter out results for non-existent or deleted files.
 * Uses a short-lived cache to reduce repeated lookups.
 * 
 * @param results - Search results to filter
 * @returns Filtered results containing only existing files
 */
async function filterByFileExistence(results: SearchResult[]): Promise<SearchResult[]> {
  if (results.length === 0) {
    return []
  }

  const now = Date.now()
  const uniqueFileIds = [...new Set(results.map(r => r.chunk.fileId))]
  const fileExistenceMap = new Map<string, boolean>()
  const missingFileIds: string[] = []

  for (const fileId of uniqueFileIds) {
    const cached = fileExistenceCache.get(fileId)
    if (cached && now - cached.timestamp <= FILE_EXISTENCE_CACHE_TTL_MS) {
      fileExistenceMap.set(fileId, cached.exists)
    } else {
      missingFileIds.push(fileId)
    }
  }

  if (missingFileIds.length > 0) {
    await Promise.all(
      missingFileIds.map(async (fileId) => {
        if (fileId.startsWith('integration:')) {
          // Integration chunks use synthetic file IDs and are managed separately from documentService.
          fileExistenceMap.set(fileId, true)
          fileExistenceCache.set(fileId, { exists: true, timestamp: now })
          return
        }
        try {
          const doc = await documentService.getById(fileId)
          const exists = doc !== null && doc.deleted !== true
          fileExistenceMap.set(fileId, exists)
          fileExistenceCache.set(fileId, { exists, timestamp: now })
        } catch (error) {
          fileExistenceMap.set(fileId, false)
          fileExistenceCache.set(fileId, { exists: false, timestamp: now })
        }
      })
    )
  }

  const filteredResults = results.filter(result => {
    const exists = fileExistenceMap.get(result.chunk.fileId) ?? false
    if (!exists) {
      console.log(`[SemanticSearch] Filtering out result for non-existent file: ${result.chunk.fileId}`)
    }
    return exists
  })

  return filteredResults
}

function filterResultsBySourceMentions(
  results: SearchResult[],
  sourceMentions?: Array<'github' | 'notion'>
): SearchResult[] {
  if (!sourceMentions || sourceMentions.length === 0) {
    return results
  }
  return results.filter(result => {
    const parsed = parseIntegrationFileId(result.chunk.fileId)
    if (!parsed) {
      return false
    }
    return sourceMentions.includes(parsed.sourceType as 'github' | 'notion')
  })
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
 * @param k Number of results to return (default: 6)
 */
export async function searchLibrary(
  query: string,
  projectId: string,
  folder: 'library' | 'project',
  geminiApiKey?: string,
  openaiApiKey?: string,
  fileIds?: string[],
  k: number = 6,
  sourceMentions?: Array<'github' | 'notion'>
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

      const stats = vectorStore.getStats()
      const shouldRecover = await shouldAttemptIndexRecovery(
        projectId,
        folder,
        stats.indexCount,
        stats.metadataCount
      )
      if (shouldRecover) {
        releaseLock()
        await recoverIndexIfNeeded(projectId, folder, geminiApiKey, openaiApiKey)
        releaseLock = await projectLockManager.acquireReadLock(projectId)
        await vectorStore.loadIndexUnsafe()
      }

      // Search - we hold read lock
      // Index is already scoped by projectId and folder, no need for additional filtering
      const effectiveK = getAdaptiveK(query, k, folder)
      const efSearch = getAdaptiveEfSearch(query)
      
      // Use rerank if enabled (both library and workspace)
      let results: SearchResult[]
      if (RERANK_ENABLED) {
        // Get more results for reranking based on folder type
        const rerankInitialK = folder === 'project' ? WORKSPACE_RERANK_INITIAL_K : LIBRARY_RERANK_INITIAL_K
        const rerankFinalK = folder === 'project' ? WORKSPACE_RERANK_FINAL_K : LIBRARY_RERANK_FINAL_K
        const rerankK = Math.max(effectiveK, rerankInitialK)
        const rerankResults = await vectorStore.searchUnsafe(embedding, rerankK, fileIds, efSearch)
        results = rerankSearchResults(rerankResults, query, rerankFinalK, RRF_K)
      } else {
        results = await vectorStore.searchUnsafe(embedding, effectiveK, fileIds, efSearch)
      }
      
      // Apply folder-specific filtering
      const relevanceFiltered = filterByRelevance(results, folder)
      const filtered = filterResultsBySourceMentions(relevanceFiltered, sourceMentions)
      if (folder === 'library' && sourceMentions && sourceMentions.length > 0) {
        const dedicated = await searchIntegrationBySourceTypes(
          query.trim(),
          projectId,
          sourceMentions,
          geminiApiKey,
          openaiApiKey,
          MIXED_SEARCH_CONFIG.integrationMention.dedicatedK
        ).catch(() => [])
        const seen = new Set<string>()
        const merged: SearchResult[] = []
        for (const r of dedicated) {
          if (!seen.has(r.chunk.id)) {
            seen.add(r.chunk.id)
            merged.push(r)
          }
        }
        for (const r of filtered) {
          if (merged.length >= MIXED_SEARCH_CONFIG.integrationMention.totalKWhenMentioned) break
          if (!seen.has(r.chunk.id)) {
            seen.add(r.chunk.id)
            merged.push(r)
          }
        }
        return merged
      }
      return filtered
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
  k: number = 6
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
    k,
    mentions.sourceMentions
  )

  // Outer-layer existence validation for library-only searches
  const filteredResults = await filterByFileExistence(results)

  // Format results for AI context
  const formattedResults = formatSearchResults(filteredResults)

  return {
    results: filteredResults,
    mentions,
    formattedResults,
  }
}

/**
 * Get all uploaded files (PDF, DOCX) for autocomplete - indexed in library index
 */
export async function getLibraryFiles(): Promise<Array<{ id: string; name: string }>> {
  const allDocuments = await documentService.getAll()
  const uploadedDocs = allDocuments.filter(doc => isIndexableLibraryDocument(doc))
  
  return uploadedDocs.map(doc => ({
    id: doc.id,
    name: doc.title,
  }))
}

/**
 * Search project files (Workspace folder)
 * @param query - Search query
 * @param projectId - Project ID
 * @param geminiApiKey - Optional Gemini API key
 * @param openaiApiKey - Optional OpenAI API key
 * @param fileIds - Optional: filter by specific file IDs
 * @param k - Number of results to return (default: 6)
 */
export async function searchProjectFiles(
  query: string,
  projectId: string,
  geminiApiKey?: string,
  openaiApiKey?: string,
  fileIds?: string[],
  k: number = WORKSPACE_SEARCH_K
): Promise<SearchResult[]> {
  return searchLibrary(query, projectId, 'project', geminiApiKey, openaiApiKey, fileIds, k, undefined)
}

/**
 * Resolve file mentions to document IDs (workspace + library)
 * Supports both workspace and library files
 */
export async function resolveFileMentionsAll(
  mentions: string[],
  projectId: string
): Promise<{ workspaceIds: string[]; libraryIds: string[] }> {
  if (mentions.length === 0) {
    return { workspaceIds: [], libraryIds: [] }
  }

  const allDocuments = await documentService.getAll()
  const projectDocuments = allDocuments.filter(
    doc => doc.projectId === projectId && doc.folder !== 'worldlab'
  )
  
  const workspaceIds: string[] = []
  const libraryIds: string[] = []

  for (const mention of mentions) {
    const exactMatch = projectDocuments.find(
      doc => doc.title.toLowerCase() === mention.toLowerCase() || doc.id === mention
    )

    if (exactMatch) {
      if (isIndexableLibraryDocument(exactMatch)) {
        libraryIds.push(exactMatch.id)
      } else {
        workspaceIds.push(exactMatch.id)
      }
      continue
    }

    // Try partial match
    const mentionLower = mention.toLowerCase()
    const partialMatch = projectDocuments.find(doc => {
      const fileName = doc.title.toLowerCase()
      const nameWithoutExt = fileName.substring(0, fileName.lastIndexOf('.'))
      return nameWithoutExt === mentionLower || fileName.includes(mentionLower)
    })

    if (partialMatch) {
      if (isIndexableLibraryDocument(partialMatch)) {
        libraryIds.push(partialMatch.id)
      } else {
        workspaceIds.push(partialMatch.id)
      }
    }
  }

  return { workspaceIds, libraryIds }
}

/**
 * Dedicated search for integration content when user @mentions a source (e.g. @github, @notion)
 * Returns results ONLY from integration chunks matching the mentioned source types.
 * Used to give @mentioned sources higher weight - user explicitly asked for that context.
 *
 * Extensible: add new source types to parseMentions and the sourceMentions type.
 */
async function searchIntegrationBySourceTypes(
  query: string,
  projectId: string,
  sourceTypes: Array<'github' | 'notion'>,
  geminiApiKey?: string,
  openaiApiKey?: string,
  k: number = MIXED_SEARCH_CONFIG.integrationMention.dedicatedK
): Promise<SearchResult[]> {
  if (!query?.trim() || sourceTypes.length === 0) return []
  const hasGeminiKey = !!(geminiApiKey && geminiApiKey.trim().length > 0)
  const hasOpenaiKey = !!(openaiApiKey && openaiApiKey.trim().length > 0)
  if (!hasGeminiKey && !hasOpenaiKey) return []

  try {
    const { embedding } = await generateEmbedding(
      query.trim(),
      geminiApiKey,
      openaiApiKey
    )

    const projectLockManager = getProjectLockManager()
    let releaseLock = await projectLockManager.acquireReadLock(projectId)

    try {
      const vectorStore = getVectorStore(projectId, 'library')
      try {
        await vectorStore.loadIndexUnsafe()
      } catch (loadError: any) {
        releaseLock()
        releaseLock = await projectLockManager.acquireWriteLock(projectId)
        try {
          await vectorStore.loadIndexUnsafe()
        } finally {
          releaseLock()
          releaseLock = await projectLockManager.acquireReadLock(projectId)
        }
      }

      const integrationFileIds = new Set<string>()
      for (const sourceType of sourceTypes) {
        const prefix = `integration:${sourceType}:`
        const ids = vectorStore.getFileIdsByPrefixUnsafe(prefix)
        ids.forEach(id => integrationFileIds.add(id))
      }

      if (integrationFileIds.size === 0) {
        return []
      }

      const efSearch = getAdaptiveEfSearch(query)
      const rerankK = Math.max(k, LIBRARY_RERANK_INITIAL_K)
      let raw = await vectorStore.searchUnsafe(
        embedding,
        rerankK,
        Array.from(integrationFileIds),
        efSearch
      )
      raw = rerankSearchResults(raw, query, k, RRF_K)
      return filterByRelevance(raw, 'library')
    } finally {
      releaseLock()
    }
  } catch (error: any) {
    if (error.message?.includes('No embedding API key') || error.message?.includes('not configured')) {
      return []
    }
    console.error('[SemanticSearch] Integration search failed:', error.message)
    return []
  }
}

/**
 * Search workspace and library folders together with normalized distances and RRF rerank
 * 
 * This function implements a fair comparison system:
 * 1. Normalizes distances using folder-specific thresholds (workspace: 0.35, library: 0.40)
 * 2. Applies RRF (Reciprocal Rank Fusion) for reranking
 * 3. Applies source weights (workspace: 1.1x boost, library: 1.0x baseline)
 * 4. Prioritizes @mentioned files with boost factor
 * 
 * @param query - Search query
 * @param projectId - Project ID
 * @param geminiApiKey - Optional Gemini API key
 * @param openaiApiKey - Optional OpenAI API key
 * @param fileIds - Optional: @mentioned file IDs (will be prioritized)
 * @param k - Number of final results to return (default: 10)
 */
// Mixed search configuration (for workspace + library combined search)
// Must be defined before functions that use it
const MIXED_SEARCH_CONFIG = {
  retrieval: {
    initialMultiplier: 1.5,      // Multiplier for initial retrieval (for rerank)
    defaultTotalK: 10,           // Final number of results to return
  },
  normalization: {
    workspaceThreshold: 0.35,    // Workspace distance threshold for normalization
    libraryThreshold: 0.40,     // Library distance threshold for normalization
  },
  sourceWeights: {
    workspaceBoost: 1.1,         // Workspace boost factor
    libraryBoost: 1.0,           // Library baseline weight
  },
  rrf: {
    k: 60,                       // RRF constant
  },
  // @source mention: dedicated integration search gets higher weight
  // Extensible: add new types (e.g. 'slack') to parseMentions + sourceMentions type
  integrationMention: {
    dedicatedK: 12,              // Results from dedicated integration search when user @mentions
    totalKWhenMentioned: 14,      // Total results when @source used (integration first, then general)
  },
}

/**
 * Normalize distance based on folder-specific threshold
 * 
 * Purpose: Allows fair comparison between workspace and library results
 *          by scaling distances to a common [0, 1] range
 * 
 * Formula: normalizedDistance = min(distance / threshold, 1.0)
 * 
 * @param distance - Original L2 distance from vector search
 * @param folder - Source folder type ('library' or 'project')
 * @returns Normalized distance in [0, 1] range
 *          - 0 = perfect match (distance = 0)
 *          - 1 = at or beyond threshold (distance >= threshold)
 *          - Lower normalized distance = better match
 * 
 * Example:
 *   - Workspace: distance 0.28 → normalized = 0.28 / 0.35 = 0.8
 *   - Library: distance 0.32 → normalized = 0.32 / 0.40 = 0.8
 *   Both have same normalized distance, allowing fair comparison
 */
function normalizeDistance(
  distance: number,
  folder: 'library' | 'project'
): number {
  const threshold = folder === 'project' 
    ? MIXED_SEARCH_CONFIG.normalization.workspaceThreshold
    : MIXED_SEARCH_CONFIG.normalization.libraryThreshold
  
  // Normalize: distance / threshold, clamped to [0, 1]
  // Lower normalized distance = better match
  return Math.min(distance / threshold, 1.0)
}

/**
 * Rerank mixed search results using RRF with normalized distances and source weights
 * 
 * Algorithm:
 * 1. Normalize distances separately for each source (workspace/library)
 * 2. Calculate RRF scores based on rank within each source list
 * 3. Combine RRF scores from both sources
 * 4. Calculate normalized distance scores (1 - normalizedDistance)
 * 5. Combine RRF and distance scores
 * 6. Apply source weights and mention boost
 */
function rerankMixedResults(
  workspaceResults: SearchResult[],
  libraryResults: SearchResult[],
  query: string,
  finalK: number,
  mentionedFileIds?: Set<string>
): SearchResult[] {
  // Tag results with source, normalized distance, and RRF scores
  interface TaggedResult extends SearchResult {
    source: 'workspace' | 'library'
    normalizedDistance: number
    originalDistance: number
    rrfScore: number // RRF score from its source list
  }

  const taggedResults: TaggedResult[] = []
  const rrfK = MIXED_SEARCH_CONFIG.rrf.k

  // Process workspace results: calculate RRF based on rank within workspace list
  for (let i = 0; i < workspaceResults.length; i++) {
    const result = workspaceResults[i]
    const normalizedDist = normalizeDistance(result.distance, 'project')
    const rank = i + 1 // Rank within workspace list (1-indexed)
    const rrfScore = 1 / (rrfK + rank) // RRF formula: 1 / (k + rank)
    
    taggedResults.push({
      ...result,
      source: 'workspace',
      normalizedDistance: normalizedDist,
      originalDistance: result.distance,
      rrfScore,
    })
  }

  // Process library results: calculate RRF based on rank within library list
  for (let i = 0; i < libraryResults.length; i++) {
    const result = libraryResults[i]
    const normalizedDist = normalizeDistance(result.distance, 'library')
    const rank = i + 1 // Rank within library list (1-indexed)
    const rrfScore = 1 / (rrfK + rank) // RRF formula: 1 / (k + rank)
    
    taggedResults.push({
      ...result,
      source: 'library',
      normalizedDistance: normalizedDist,
      originalDistance: result.distance,
      rrfScore,
    })
  }

  // Calculate final scores for each result
  const scoredResults = taggedResults.map((result) => {
    // 1. Normalized distance score: convert distance to similarity score
    //    Lower normalized distance = better match = higher score
    //    Formula: score = 1 - normalizedDistance (range: [0, 1])
    const normalizedDistanceScore = 1 - result.normalizedDistance
    
    // 2. Combine RRF and distance scores
    //    RRF provides rank-based signal, distance provides similarity signal
    //    Weight: RRF 40% + Distance 60% (distance is more important for semantic similarity)
    const baseScore = result.rrfScore * 0.4 + normalizedDistanceScore * 0.6
    
    // 3. Apply source weight (before mention boost)
    //    Workspace gets 1.1x boost, library stays at 1.0x
    const sourceWeight = result.source === 'workspace'
      ? MIXED_SEARCH_CONFIG.sourceWeights.workspaceBoost
      : MIXED_SEARCH_CONFIG.sourceWeights.libraryBoost
    const weightedScore = baseScore * sourceWeight
    
    // 4. Apply mention boost (if file is @mentioned)
    //    Mentioned files get distance reduced by 50% (effectively 2x boost)
    //    This is applied as a multiplier to the final score
    const isMentioned = mentionedFileIds?.has(result.chunk.fileId) ?? false
    const mentionBoost = isMentioned ? 1.5 : 1.0 // 1.5x boost for mentioned files
    const finalScore = weightedScore * mentionBoost
    
    return {
      result,
      score: finalScore,
    }
  })

  // Sort by final score (higher is better)
  scoredResults.sort((a, b) => b.score - a.score)

  // Return top k results
  return scoredResults.slice(0, finalK).map(item => item.result)
}

export async function searchWorkspaceAndLibrary(
  query: string,
  projectId: string,
  geminiApiKey?: string,
  openaiApiKey?: string,
  fileIds?: string[],
  k: number = MIXED_SEARCH_CONFIG.retrieval.defaultTotalK,
  sourceMentions?: Array<'github' | 'notion'>
): Promise<SearchResult[]> {
  if (!query || query.trim().length === 0) {
    return []
  }

  const hasGeminiKey = geminiApiKey && geminiApiKey.trim().length > 0
  const hasOpenaiKey = openaiApiKey && openaiApiKey.trim().length > 0
  
  if (!hasGeminiKey && !hasOpenaiKey) {
    console.warn('[SemanticSearch] No API keys available for search, returning empty results')
    return []
  }

  const hasSourceMentions = sourceMentions && sourceMentions.length > 0
  if (hasSourceMentions) {
    const { dedicatedK, totalKWhenMentioned } = MIXED_SEARCH_CONFIG.integrationMention
    const integrationK = dedicatedK
    const totalK = totalKWhenMentioned
    const generalK = Math.max(6, totalK - integrationK)

    const [integrationResults, workspaceResults, libraryResults] = await Promise.all([
      searchIntegrationBySourceTypes(
        query,
        projectId,
        sourceMentions,
        geminiApiKey,
        openaiApiKey,
        integrationK
      ).catch(() => [] as SearchResult[]),
      searchProjectFiles(query, projectId, geminiApiKey, openaiApiKey, fileIds, Math.ceil(generalK * 1.5)).catch(() => [] as SearchResult[]),
      searchLibrary(query, projectId, 'library', geminiApiKey, openaiApiKey, fileIds, Math.ceil(generalK * 1.5), undefined).catch(() => [] as SearchResult[]),
    ])

    const filteredWorkspace = filterByRelevance(workspaceResults, 'project')
    const filteredLibrary = filterByRelevance(libraryResults, 'library')
    const mentionedFileIds = new Set(fileIds || [])
    const generalReranked = rerankMixedResults(
      filteredWorkspace.length > 0 ? filteredWorkspace : workspaceResults,
      filteredLibrary.length > 0 ? filteredLibrary : libraryResults,
      query,
      generalK,
      mentionedFileIds
    )

    const seenIds = new Set<string>()
    const merged: SearchResult[] = []
    for (const r of integrationResults) {
      if (!seenIds.has(r.chunk.id)) {
        seenIds.add(r.chunk.id)
        merged.push(r)
      }
    }
    for (const r of generalReranked) {
      if (merged.length >= totalK) break
      if (!seenIds.has(r.chunk.id)) {
        seenIds.add(r.chunk.id)
        merged.push(r)
      }
    }

    const diversified = diversifyByFile(merged, 2)
    return filterByFileExistence(diversified.slice(0, totalK))
  }

  const initialK = Math.ceil(k * MIXED_SEARCH_CONFIG.retrieval.initialMultiplier)
  const workspaceK = getAdaptiveK(query, initialK, 'project')
  const libraryK = getAdaptiveK(query, initialK, 'library')

  const [workspaceResults, libraryResults] = await Promise.all([
    searchProjectFiles(query, projectId, geminiApiKey, openaiApiKey, fileIds, workspaceK).catch(() => [] as SearchResult[]),
    searchLibrary(query, projectId, 'library', geminiApiKey, openaiApiKey, fileIds, libraryK).catch(() => [] as SearchResult[]),
  ])

  const filteredWorkspace = filterByRelevance(workspaceResults, 'project')
  const filteredLibrary = filterByRelevance(libraryResults, 'library')
  const mentionedFileIds = new Set(fileIds || [])
  const rerankedResults = rerankMixedResults(
    filteredWorkspace.length > 0 ? filteredWorkspace : workspaceResults,
    filteredLibrary.length > 0 ? filteredLibrary : libraryResults,
    query,
    k,
    mentionedFileIds
  )

  const diversified = diversifyByFile(rerankedResults, 2)
  return filterByFileExistence(diversified.slice(0, k))
}

// Search configuration for library folder
const DEFAULT_SEARCH_K = 8
const MAX_SEARCH_K = 16
const DEFAULT_EF_SEARCH = 50
const HIGH_RECALL_EF = 80
const MAX_DISTANCE_THRESHOLD = 0.40
const MAX_DISTANCE_FROM_BEST = 0.15
const MIN_RESULTS_AFTER_FILTER = 4

// Search configuration for workspace/project folder (optimized for precision)
const WORKSPACE_SEARCH_K = 10
const WORKSPACE_MAX_SEARCH_K = 20
const WORKSPACE_MAX_DISTANCE_THRESHOLD = 0.35
const WORKSPACE_MIN_RESULTS_AFTER_FILTER = 5

// Rerank configuration
const RERANK_ENABLED = true
const LIBRARY_RERANK_INITIAL_K = 16
const LIBRARY_RERANK_FINAL_K = 8
const WORKSPACE_RERANK_INITIAL_K = 20
const WORKSPACE_RERANK_FINAL_K = 10
const RRF_K = 60 // Reciprocal Rank Fusion constant

function getAdaptiveK(query: string, requestedK: number, folder: 'library' | 'project' = 'library'): number {
  if (!query) {
    return requestedK
  }

  const isWorkspace = folder === 'project'
  const defaultK = isWorkspace ? WORKSPACE_SEARCH_K : DEFAULT_SEARCH_K
  const maxK = isWorkspace ? WORKSPACE_MAX_SEARCH_K : MAX_SEARCH_K

  // Respect custom k values from callers
  if (requestedK !== defaultK) {
    return requestedK
  }

  const wordCount = query.trim().split(/\s+/).filter(Boolean).length
  let multiplier = 1
  if (wordCount >= 20) {
    multiplier = 1.8
  } else if (wordCount >= 12) {
    multiplier = 1.5
  } else if (wordCount >= 7) {
    multiplier = 1.2
  }

  const adapted = Math.round(defaultK * multiplier)
  return Math.min(maxK, Math.max(defaultK, adapted))
}

function getAdaptiveEfSearch(query: string): number {
  if (!query) {
    return DEFAULT_EF_SEARCH
  }

  const wordCount = query.trim().split(/\s+/).filter(Boolean).length
  if (wordCount >= 10 || query.length >= 80) {
    return HIGH_RECALL_EF
  }

  return DEFAULT_EF_SEARCH
}

function diversifyByFile(results: SearchResult[], maxPerFile: number): SearchResult[] {
  if (maxPerFile <= 0) {
    return results
  }

  const counts = new Map<string, number>()
  const diversified: SearchResult[] = []

  for (const result of results) {
    const fileId = result.chunk.fileId
    const count = counts.get(fileId) || 0
    if (count >= maxPerFile) {
      continue
    }
    counts.set(fileId, count + 1)
    diversified.push(result)
  }

  return diversified
}

function filterByRelevance(results: SearchResult[], folder: 'library' | 'project' = 'library'): SearchResult[] {
  if (results.length === 0) {
    return results
  }

  const isWorkspace = folder === 'project'
  const maxDistanceThreshold = isWorkspace ? WORKSPACE_MAX_DISTANCE_THRESHOLD : MAX_DISTANCE_THRESHOLD
  const minResultsAfterFilter = isWorkspace ? WORKSPACE_MIN_RESULTS_AFTER_FILTER : MIN_RESULTS_AFTER_FILTER

  // Results are already sorted by (effective) distance; use actual distances for thresholds
  const bestDistance = results[0]?.distance ?? 0
  const maxAllowedDistance = Math.min(
    maxDistanceThreshold,
    bestDistance + MAX_DISTANCE_FROM_BEST
  )

  const filtered = results.filter(result => result.distance <= maxAllowedDistance)

  if (filtered.length < minResultsAfterFilter) {
    return results.slice(0, Math.min(results.length, minResultsAfterFilter))
  }

  return filtered
}

/**
 * Rerank search results using reciprocal rank fusion (RRF)
 * RRF formula: score = 1 / (k + rank), where k is a constant and rank is the position (1-indexed)
 * This method combines rank-based scoring with distance-based scoring for better results
 */
function rerankSearchResults(
  results: SearchResult[],
  query: string,
  finalK: number,
  rrfK: number = RRF_K
): SearchResult[] {
  if (results.length === 0) {
    return results
  }

  // Calculate RRF scores for each result
  const reranked = results.map((result, index) => {
    // RRF score: 1 / (k + rank), where rank is 1-indexed
    const rank = index + 1
    const rrfScore = 1 / (rrfK + rank)
    
    // Normalize distance to 0-1 range (assuming max distance ~1.0 for L2 distance)
    // Lower distance = higher similarity score
    const normalizedDistance = Math.min(result.distance / 1.0, 1.0)
    const distanceScore = 1 - normalizedDistance
    
    // Combine RRF and distance scores
    // Weight: RRF 40%, Distance 60% (distance is more important for semantic similarity)
    const combinedScore = rrfScore * 0.4 + distanceScore * 0.6
    
    return {
      result,
      score: combinedScore,
    }
  })

  // Sort by combined score (higher is better)
  reranked.sort((a, b) => b.score - a.score)

  // Return top k results
  return reranked.slice(0, finalK).map(item => item.result)
}

export const semanticSearchService = {
  parseMentions,
  searchLibrary,
  searchLibraryWithMentions,
  searchProjectFiles,
  searchWorkspaceAndLibrary,
  formatSearchResults,
  getLibraryFiles,
}

