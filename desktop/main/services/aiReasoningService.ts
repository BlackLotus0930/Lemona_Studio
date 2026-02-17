// AI Reasoning Service - Retrieval orchestration system
// System controls the flow, AI evaluates content relevance
import { SearchResult } from './vectorStore.js'
import { searchLibrary, searchWorkspaceAndLibrary, parseMentions, resolveFileMentionsAll } from './semanticSearchService.js'
import { documentService } from './documentService.js'
import { generateEmbedding } from './embeddingService.js'
import { parseIntegrationFileId } from './integrationTypes.js'
import { integrationStore } from './integrationStore.js'

function sourceTypeLabel(sourceType: string): string {
  if (sourceType === 'github') {
    return 'GitHub'
  }
  if (sourceType === 'gitlab') {
    return 'GitLab'
  }
  if (sourceType === 'slack') {
    return 'Slack'
  }
  if (sourceType === 'notion') {
    return 'Notion'
  }
  if (sourceType === 'quickbooks') {
    return 'QuickBooks'
  }
  if (sourceType === 'hubspot') {
    return 'HubSpot'
  }
  if (sourceType === 'linear') {
    return 'Linear'
  }
  if (sourceType === 'stripe') {
    return 'Stripe'
  }
  if (sourceType === 'sentry') {
    return 'Sentry'
  }
  if (sourceType === 'posthog') {
    return 'PostHog'
  }
  if (sourceType === 'metabase') {
    return 'Metabase'
  }
  if (sourceType === 'db-schema') {
    return 'DB Schema'
  }
  if (sourceType === 'rss') {
    return 'RSS'
  }
  return sourceType
}

function formatIntegrationItemDetail(sourceType: string, itemId: string): string {
  const parts = itemId.split(':')

  if (sourceType === 'github') {
    if (parts.length >= 3 && parts[1] === 'issue') {
      return `Issue #${parts.slice(2).join(':')} (${parts[0]})`
    }
    if (parts.length >= 3 && parts[1] === 'pr') {
      return `PR #${parts.slice(2).join(':')} (${parts[0]})`
    }
    if (parts.length >= 3 && parts[1] === 'file') {
      return `File ${parts.slice(2).join(':')} (${parts[0]})`
    }
  }

  if (sourceType === 'linear') {
    if (parts[0] === 'issue') return `Issue ${parts.slice(1).join(':')}`
    if (parts[0] === 'project') return `Project ${parts.slice(1).join(':')}`
    if (parts[0] === 'cycle') return `Cycle ${parts.slice(1).join(':')}`
  }

  if (sourceType === 'gitlab') {
    if (parts[0] === 'issue') return `Issue ${parts.slice(1).join(':')}`
    if (parts[0] === 'mr') return `MR !${parts.slice(1).join(':')}`
    if (parts[0] === 'file') return `File ${parts.slice(1).join(':')}`
  }

  if (sourceType === 'slack') {
    if (parts[1] === 'msg') return `Channel message`
    return `Channel #${parts[0] || ''}`
  }

  if (sourceType === 'stripe') {
    if (parts[0] === 'customer') return `Customer ${parts.slice(1).join(':')}`
    if (parts[0] === 'product') return `Product ${parts.slice(1).join(':')}`
    if (parts[0] === 'subscription') return `Subscription ${parts.slice(1).join(':')}`
    if (parts[0] === 'invoice') return `Invoice ${parts.slice(1).join(':')}`
  }

  if (sourceType === 'sentry') {
    if (parts[0] === 'issue') return `Issue ${parts.slice(1).join(':')}`
  }

  if (sourceType === 'posthog') {
    if (parts[0] === 'dashboard') return `Dashboard ${parts.slice(1).join(':')}`
    if (parts[0] === 'insight') return `Insight ${parts.slice(1).join(':')}`
  }

  if (sourceType === 'metabase') {
    if (parts[0] === 'dashboard') return `Dashboard ${parts.slice(1).join(':')}`
    if (parts[0] === 'question') return `Question ${parts.slice(1).join(':')}`
  }

  if (sourceType === 'notion') {
    if (parts[0] === 'page') return `Page ${parts.slice(1).join(':')}`
    return `Page`
  }

  if (sourceType === 'quickbooks') {
    if (parts[0] === 'customer') return `Customer ${parts.slice(1).join(':')}`
    if (parts[0] === 'invoice') return `Invoice ${parts.slice(1).join(':')}`
  }

  if (sourceType === 'hubspot') {
    if (parts[0] === 'contact') return `Contact ${parts.slice(1).join(':')}`
    if (parts[0] === 'deal') return `Deal ${parts.slice(1).join(':')}`
    if (parts[0] === 'company') return `Company ${parts.slice(1).join(':')}`
  }

  if (sourceType === 'rss') {
    return 'Feed Item'
  }

  if (sourceType === 'db-schema') {
    if (parts[0] === 'file') return `Schema file: ${parts.slice(1).join(':')}`
    return `Schema: ${itemId}`
  }

  return parts[0] || itemId
}

function formatIntegrationReference(sourceType: string, sourceName: string, itemId: string): string {
  const sourceLabel = sourceTypeLabel(sourceType)
  const detail = formatIntegrationItemDetail(sourceType, itemId)
  return `${sourceLabel} • ${detail} • ${sourceName}`
}

/**
 * Reasoning step (defined locally to avoid compilation issues)
 */
export interface ReasoningStep {
  step: number
  action: 'search' | 'read' | 'browse'
  query?: string
  results?: SearchResult[]
  documentId?: string
  budgetRemaining: number
  relevanceScore?: number // AI-assessed relevance score (0-1)
  needsMoreContext?: boolean // AI assessment: whether more context is needed
  informationGap?: string // AI-identified information gap (if any)
}

/**
 * Reasoning result
 */
export interface ReasoningResult {
  steps: ReasoningStep[]
  finalResults: SearchResult[]
  formattedResults: string
  totalStepsUsed: number
  stoppedReason: 'budget_exhausted' | 'sufficient_context' | 'no_more_info'
  libraryRequested?: boolean
  libraryRequestedNoResults?: boolean
}

/**
 * Relevance assessment from AI
 */
interface RelevanceAssessment {
  relevanceScore: number // 0-1, higher is more relevant
  needsMoreContext: boolean // Whether more context is needed
  informationGap?: string // What information is missing (if any)
  confidence: number // 0-1, confidence in the assessment
}

/**
 * Simple AI relevance assessment (prompt-based)
 * In future, can be enhanced with function calling
 */
async function assessRelevance(
  query: string,
  results: SearchResult[],
  geminiApiKey?: string,
  openaiApiKey?: string
): Promise<RelevanceAssessment> {
  // For now, use a simple heuristic-based assessment
  // In future, can call AI with a concise prompt
  
  if (results.length === 0) {
    return {
      relevanceScore: 0,
      needsMoreContext: true,
      informationGap: 'No relevant documents found',
      confidence: 1.0,
    }
  }

  // Calculate average relevance score based on distance
  // Lower distance = higher relevance
  const avgDistance = results.reduce((sum, r) => sum + r.distance, 0) / results.length
  const maxDistance = Math.max(...results.map(r => r.distance))
  
  // Normalize to 0-1 (inverse of distance, normalized)
  const relevanceScore = Math.max(0, 1 - (avgDistance / Math.max(maxDistance, 1)))
  
  // Heuristic: if average distance is high, we need more context
  const needsMoreContext = avgDistance > 0.3 // Threshold can be tuned
  
  return {
    relevanceScore,
    needsMoreContext,
    confidence: 0.7, // Medium confidence for heuristic-based assessment
  }
}

/**
 * Format search results for context
 */
async function formatSearchResults(results: SearchResult[]): Promise<string> {
  if (results.length === 0) {
    return ''
  }

  // Resolve all file IDs to document titles
  const fileIdToTitle = new Map<string, string>()
  const uniqueFileIds = [...new Set(results.map(r => r.chunk.fileId))]
  
  for (const fileId of uniqueFileIds) {
    try {
      const document = await documentService.getById(fileId)
      if (document) {
        fileIdToTitle.set(fileId, document.title)
      } else {
        const parsedIntegration = parseIntegrationFileId(fileId)
        if (parsedIntegration) {
          const projectIdForFile = results.find(r => r.chunk.fileId === fileId)?.chunk.projectId
          const source = await integrationStore.getSourceById(
            projectIdForFile || '',
            parsedIntegration.sourceId
          )
          const sourceName = source?.displayName || parsedIntegration.sourceId
          fileIdToTitle.set(fileId, formatIntegrationReference(parsedIntegration.sourceType, sourceName, parsedIntegration.itemId))
        } else {
          fileIdToTitle.set(fileId, fileId) // Fallback to fileId if document not found
        }
      }
    } catch (error) {
      const parsedIntegration = parseIntegrationFileId(fileId)
      if (parsedIntegration) {
        fileIdToTitle.set(
          fileId,
          formatIntegrationReference(parsedIntegration.sourceType, parsedIntegration.sourceId, parsedIntegration.itemId)
        )
      } else {
        fileIdToTitle.set(fileId, fileId) // Fallback to fileId on error
      }
    }
  }

  return results.map((result, index) => {
    const chunk = result.chunk
    const fileName = fileIdToTitle.get(chunk.fileId) || chunk.fileId
    return `[${index + 1}] ${fileName} (score: ${result.score.toFixed(3)})
${chunk.text}

---`
  }).join('\n\n')
}

/**
 * Main reasoning function
 * System controls the flow, AI evaluates relevance
 * 
 * @param query - User query
 * @param projectId - Project ID
 * @param geminiApiKey - Optional Gemini API key
 * @param openaiApiKey - Optional OpenAI API key
 * @param maxSteps - Maximum number of reasoning steps (default: 10)
 * @param initialFileIds - Optional: @mentioned file IDs
 */
export async function reason(
  query: string,
  projectId: string,
  geminiApiKey?: string,
  openaiApiKey?: string,
  maxSteps: number = 10,
  initialFileIds?: string[]
): Promise<ReasoningResult> {
  const steps: ReasoningStep[] = []
  let allResults: SearchResult[] = []
  let currentFileIds = initialFileIds
  let budgetRemaining = maxSteps
  let stoppedReason: 'budget_exhausted' | 'sufficient_context' | 'no_more_info' = 'budget_exhausted'

  // Parse mentions from query
  const mentions = parseMentions(query)
  const searchQuery = mentions.cleanedMessage || query
  const useLibraryOnly = mentions.hasLibraryMention

  // Resolve file mentions if any
  if (mentions.fileMentions.length > 0) {
    const resolved = await resolveFileMentionsAll(mentions.fileMentions, projectId)
    currentFileIds = useLibraryOnly ? resolved.libraryIds : [...resolved.workspaceIds, ...resolved.libraryIds]
  }

  // Step 1: Initial search
  budgetRemaining--
  const effectiveFileIds = currentFileIds && currentFileIds.length > 0 ? currentFileIds : undefined
  const initialResults = useLibraryOnly
    ? await searchLibrary(
        searchQuery,
        projectId,
        'library',
        geminiApiKey,
        openaiApiKey,
        effectiveFileIds,
        6, // Initial k
        mentions.sourceMentions
      )
    : await searchWorkspaceAndLibrary(
        searchQuery,
        projectId,
        geminiApiKey,
        openaiApiKey,
        effectiveFileIds,
        6, // Initial k
        mentions.sourceMentions
      )

  allResults.push(...initialResults)

  // AI assesses relevance
  let assessment = await assessRelevance(searchQuery, initialResults, geminiApiKey, openaiApiKey)

  steps.push({
    step: 1,
    action: 'search',
    query: searchQuery,
    results: initialResults,
    budgetRemaining,
    relevanceScore: assessment.relevanceScore,
    needsMoreContext: assessment.needsMoreContext,
    informationGap: assessment.informationGap,
  })

  // System decision: continue or stop?
  if (!assessment.needsMoreContext) {
    stoppedReason = 'sufficient_context'
  } else if (budgetRemaining <= 0) {
    stoppedReason = 'budget_exhausted'
  } else {
    // Continue searching with expanded strategy
    // System decides: try different queries, search other documents, etc.
    
    // Strategy: Expand search with related terms or search other documents
    let stepCount = 1
    
    while (budgetRemaining > 0 && assessment.needsMoreContext) {
      stepCount++
      budgetRemaining--

      // System decision: what to search next?
      // For now, try searching without file filters to get broader results
      if (currentFileIds && currentFileIds.length > 0 && stepCount === 2) {
        // Second step: search without file filters to get broader context
        const broaderResults = useLibraryOnly
          ? await searchLibrary(
              searchQuery,
              projectId,
              'library',
              geminiApiKey,
              openaiApiKey,
              undefined,
              6,
              mentions.sourceMentions
            )
          : await searchWorkspaceAndLibrary(
              searchQuery,
              projectId,
              geminiApiKey,
              openaiApiKey,
              undefined, // No file filter
              6,
              mentions.sourceMentions
            )

        // Merge results, avoiding duplicates
        const existingChunkIds = new Set(allResults.map(r => r.chunk.id))
        const newResults = broaderResults.filter(r => !existingChunkIds.has(r.chunk.id))
        allResults.push(...newResults)

        // Re-assess with all results
        assessment = await assessRelevance(searchQuery, allResults, geminiApiKey, openaiApiKey)

        steps.push({
          step: stepCount,
          action: 'search',
          query: searchQuery,
          results: newResults,
          budgetRemaining,
          relevanceScore: assessment.relevanceScore,
          needsMoreContext: assessment.needsMoreContext,
          informationGap: assessment.informationGap,
        })

        // System decision: continue or stop?
        if (!assessment.needsMoreContext) {
          stoppedReason = 'sufficient_context'
          break
        }
      } else {
        // No more effective search strategies, stop
        stoppedReason = 'no_more_info'
        break
      }
    }
    
    // If we exited the loop due to budget, mark as budget exhausted
    if (budgetRemaining <= 0 && assessment.needsMoreContext) {
      stoppedReason = 'budget_exhausted'
    }
  }

  // Remove duplicates (by chunk ID)
  const uniqueResults = new Map<string, SearchResult>()
  for (const result of allResults) {
    const key = result.chunk.id
    if (!uniqueResults.has(key) || uniqueResults.get(key)!.distance > result.distance) {
      uniqueResults.set(key, result)
    }
  }

  const finalResults = Array.from(uniqueResults.values())
    .sort((a, b) => a.distance - b.distance)
    .slice(0, 12) // Top 12 results

  return {
    steps,
    finalResults,
    formattedResults: await formatSearchResults(finalResults),
    totalStepsUsed: maxSteps - budgetRemaining,
    stoppedReason,
    libraryRequested: useLibraryOnly,
    libraryRequestedNoResults: useLibraryOnly && finalResults.length === 0,
  }
}

export const aiReasoningService = {
  reason,
}
