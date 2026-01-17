// AI Reasoning Service - Retrieval orchestration system
// System controls the flow, AI evaluates content relevance
import { SearchResult } from './vectorStore.js'
import { searchWorkspaceAndLibrary, parseMentions, resolveFileMentionsAll } from './semanticSearchService.js'
import { documentService } from './documentService.js'
import { generateEmbedding } from './embeddingService.js'

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
function formatSearchResults(results: SearchResult[]): string {
  if (results.length === 0) {
    return ''
  }

  return results.map((result, index) => {
    const chunk = result.chunk
    const fileName = chunk.fileId // Will be resolved to actual filename if needed
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

  // Resolve file mentions if any
  if (mentions.fileMentions.length > 0) {
    const resolved = await resolveFileMentionsAll(mentions.fileMentions, projectId)
    currentFileIds = [...resolved.workspaceIds, ...resolved.libraryIds]
  }

  // Step 1: Initial search
  budgetRemaining--
  const initialResults = await searchWorkspaceAndLibrary(
    searchQuery,
    projectId,
    geminiApiKey,
    openaiApiKey,
    currentFileIds,
    6 // Initial k
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
        const broaderResults = await searchWorkspaceAndLibrary(
          searchQuery,
          projectId,
          geminiApiKey,
          openaiApiKey,
          undefined, // No file filter
          6
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
    formattedResults: formatSearchResults(finalResults),
    totalStepsUsed: maxSteps - budgetRemaining,
    stoppedReason,
  }
}

export const aiReasoningService = {
  reason,
}
