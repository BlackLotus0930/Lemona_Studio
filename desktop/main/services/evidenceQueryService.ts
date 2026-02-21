// Evidence Query Service - Run semantic search or structured connector queries
import { semanticSearchService } from './semanticSearchService.js'
import { runStructuredEvidenceQuery, isStructuredQuery } from './structuredEvidenceService.js'
import type { ConnectorMetricType } from '../../../shared/types.js'

export type EvidenceSourceType =
  | 'github'
  | 'gitlab'
  | 'slack'
  | 'notion'
  | 'quickbooks'
  | 'hubspot'
  | 'linear'
  | 'stripe'
  | 'sentry'
  | 'posthog'
  | 'metabase'
  | 'db-schema'

export interface RunEvidenceQueryParams {
  text: string
  sourceTypes?: EvidenceSourceType[]
  /** Structured query: connector + metric (e.g. stripe + mrr) */
  connector?: string
  metric?: ConnectorMetricType | string
  params?: {
    timeRange?: string
    startDate?: string
    endDate?: string
    decisionTimestamp?: string
    eventFilter?: string
    [key: string]: unknown
  }
}

export interface RunEvidenceQueryResult {
  chunks: Array<{
    chunk: { id: string; fileId: string; chunkIndex: number; text: string }
    score: number
  }>
  excerpt: string
  /** For structured connector queries */
  structuredResult?: Record<string, unknown>
  executedAt?: string
  timeWindow?: string
  queryFingerprint?: string
}

const DEFAULT_K = 10
const EXCERPT_MAX_CHARS = 800

/**
 * Run an evidence query: semantic search OR structured connector metric.
 * When connector+metric are provided, runs structured query (Stripe MRR, PostHog DAU, etc.).
 * Otherwise runs semantic search over indexed content.
 * @param projectId - Project ID for scoping the search
 * @param query - Query params (text for semantic; connector/metric for structured)
 * @param geminiApiKey - Optional Gemini API key (semantic only)
 * @param openaiApiKey - Optional OpenAI API key (semantic only)
 */
export async function runEvidenceQuery(
  projectId: string,
  query: RunEvidenceQueryParams,
  geminiApiKey?: string,
  openaiApiKey?: string
): Promise<RunEvidenceQueryResult> {
  const { text, connector, metric, params } = query

  // Structured connector query
  if (connector && metric && isStructuredQuery(connector, metric)) {
    try {
      const result = await runStructuredEvidenceQuery(projectId, connector, metric, params)
      return {
        chunks: [],
        excerpt: result.excerpt,
        structuredResult: result.structuredResult,
        executedAt: result.executedAt,
        timeWindow: result.timeWindow,
        queryFingerprint: result.queryFingerprint,
      }
    } catch (err) {
      console.error('[evidenceQueryService] Structured query failed:', err)
      throw err
    }
  }

  // Semantic search
  const searchText = (text || '').trim()
  if (!searchText) {
    return { chunks: [], excerpt: '' }
  }

  const sourceTypes = query.sourceTypes
  const results = await semanticSearchService.searchWorkspaceAndLibrary(
    searchText,
    projectId,
    geminiApiKey,
    openaiApiKey,
    undefined,
    DEFAULT_K,
    sourceTypes
  )

  const excerpt = buildExcerpt(results, EXCERPT_MAX_CHARS)

  return {
    chunks: results.map((r) => ({
      chunk: r.chunk,
      score: r.score,
    })),
    excerpt,
  }
}

function buildExcerpt(
  results: Array<{ chunk: { text: string } }>,
  maxChars: number
): string {
  if (results.length === 0) return ''

  const parts: string[] = []
  let totalLen = 0

  for (const r of results) {
    const text = (r.chunk.text || '').trim()
    if (!text) continue
    if (totalLen + text.length + 2 <= maxChars) {
      parts.push(text)
      totalLen += text.length + 2
    } else {
      const remaining = maxChars - totalLen - 5
      if (remaining > 30) {
        parts.push(text.slice(0, remaining) + '...')
      }
      break
    }
  }

  return parts.join('\n\n')
}
