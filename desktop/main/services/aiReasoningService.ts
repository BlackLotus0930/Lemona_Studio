// AI Reasoning Service - Retrieval orchestration system
// System controls the flow, AI evaluates content relevance
import { GoogleGenerativeAI } from '@google/generative-ai'
import OpenAI from 'openai'
import { getProjectLockManager, getVectorStore, SearchResult } from './vectorStore.js'
import { searchLibrary, searchWorkspaceAndLibrary, parseMentions, resolveFileMentionsAll } from './semanticSearchService.js'
import { documentService } from './documentService.js'
import { parseIntegrationFileId } from './integrationTypes.js'
import { integrationStore } from './integrationStore.js'
import { aiProviderStore, buildEmbeddingIndexKey } from './aiProviderStore.js'
import type { AgentPlanStep, AgentProgressEvent } from '../../../shared/types.js'
import type { AiProviderProfile } from './aiProviderStore.js'

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
  complexityLevel?: 'simple' | 'complex'
  plan?: AgentPlanStep[]
  libraryRequested?: boolean
  libraryRequestedNoResults?: boolean
}

export interface ReasoningExecutionOptions {
  onProgress?: (event: AgentProgressEvent) => void
  timeouts?: {
    classifyMs?: number
    planMs?: number
    stepMs?: number
  }
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

const DEFAULT_REASONING_TIMEOUTS = {
  classifyMs: 1500,
  planMs: 2000,
  stepMs: 3500,
}

function nowIso(): string {
  return new Date().toISOString()
}

function emitProgress(
  onProgress: ReasoningExecutionOptions['onProgress'] | undefined,
  event: Omit<AgentProgressEvent, 'timestamp'>
): void {
  if (!onProgress) {
    return
  }
  try {
    onProgress({
      ...event,
      timestamp: nowIso(),
    })
  } catch {
    // Ignore event handler failures to keep retrieval path stable.
  }
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, timeoutMessage: string): Promise<T> {
  let timeoutHandle: ReturnType<typeof setTimeout> | null = null
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutHandle = setTimeout(() => reject(new Error(timeoutMessage)), timeoutMs)
  })
  try {
    return await Promise.race([promise, timeoutPromise])
  } finally {
    if (timeoutHandle) {
      clearTimeout(timeoutHandle)
    }
  }
}

type SourceMention = ReturnType<typeof parseMentions>['sourceMentions'][number]

const geminiClientCache: Map<string, GoogleGenerativeAI> = new Map()
const openaiClientCache: Map<string, OpenAI> = new Map()

function getGeminiClient(apiKey: string): GoogleGenerativeAI {
  if (!geminiClientCache.has(apiKey)) {
    geminiClientCache.set(apiKey, new GoogleGenerativeAI(apiKey))
  }
  return geminiClientCache.get(apiKey)!
}

function getOpenAIClient(apiKey: string, baseUrl?: string): OpenAI {
  const cacheKey = `${apiKey}::${baseUrl || ''}`
  if (!openaiClientCache.has(cacheKey)) {
    openaiClientCache.set(
      cacheKey,
      new OpenAI({
        apiKey,
        ...(baseUrl ? { baseURL: baseUrl } : {}),
      })
    )
  }
  return openaiClientCache.get(cacheKey)!
}

type StructuredPromptProviderConfig =
  | { provider: 'gemini'; apiKey: string; model: string }
  | { provider: 'openai'; apiKey: string; model: string; baseUrl?: string }

function resolveConfigFromChatProfile(
  profile: AiProviderProfile | null,
  geminiApiKey?: string,
  openaiApiKey?: string
): StructuredPromptProviderConfig | null {
  if (!profile) {
    return null
  }
  if (profile.type === 'builtin-gemini') {
    const resolvedKey = profile.apiKey || geminiApiKey
    if (!resolvedKey || resolvedKey.trim().length === 0) {
      return null
    }
    return {
      provider: 'gemini',
      apiKey: resolvedKey,
      model: profile.chatModel || 'gemini-3-flash-preview',
    }
  }

  const resolvedOpenAiKey = profile.apiKey || openaiApiKey
  if (!resolvedOpenAiKey || resolvedOpenAiKey.trim().length === 0) {
    return null
  }
  return {
    provider: 'openai',
    apiKey: resolvedOpenAiKey,
    model: profile.chatModel || 'gpt-4.1-nano',
    baseUrl: profile.baseUrl,
  }
}

async function resolveStructuredPromptProviders(
  geminiApiKey?: string,
  openaiApiKey?: string
): Promise<StructuredPromptProviderConfig[]> {
  const providers: StructuredPromptProviderConfig[] = []
  const seen = new Set<string>()

  const activeProfile = await aiProviderStore.getActiveChatProfile().catch(() => null)
  const primary = resolveConfigFromChatProfile(activeProfile, geminiApiKey, openaiApiKey)
  if (primary) {
    const primaryKey = `${primary.provider}:${primary.model}:${primary.apiKey}:${primary.provider === 'openai' ? (primary.baseUrl || '') : ''}`
    providers.push(primary)
    seen.add(primaryKey)
  }

  if (geminiApiKey && geminiApiKey.trim().length > 0) {
    const fallbackGemini: StructuredPromptProviderConfig = {
      provider: 'gemini',
      apiKey: geminiApiKey,
      model: 'gemini-3-flash-preview',
    }
    const key = `${fallbackGemini.provider}:${fallbackGemini.model}:${fallbackGemini.apiKey}:`
    if (!seen.has(key)) {
      providers.push(fallbackGemini)
      seen.add(key)
    }
  }

  if (openaiApiKey && openaiApiKey.trim().length > 0) {
    const fallbackOpenAI: StructuredPromptProviderConfig = {
      provider: 'openai',
      apiKey: openaiApiKey,
      model: 'gpt-4.1-nano',
    }
    const key = `${fallbackOpenAI.provider}:${fallbackOpenAI.model}:${fallbackOpenAI.apiKey}:${fallbackOpenAI.baseUrl || ''}`
    if (!seen.has(key)) {
      providers.push(fallbackOpenAI)
      seen.add(key)
    }
  }

  return providers
}

function tryParseJsonObject(text: string): Record<string, unknown> | null {
  const trimmed = text.trim()
  if (!trimmed) {
    return null
  }

  const direct = (() => {
    try {
      return JSON.parse(trimmed) as Record<string, unknown>
    } catch {
      return null
    }
  })()
  if (direct) {
    return direct
  }

  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fenceMatch?.[1]) {
    try {
      return JSON.parse(fenceMatch[1].trim()) as Record<string, unknown>
    } catch {
      // Continue to fallback parsing below.
    }
  }

  const firstBrace = trimmed.indexOf('{')
  const lastBrace = trimmed.lastIndexOf('}')
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    const jsonSlice = trimmed.slice(firstBrace, lastBrace + 1)
    try {
      return JSON.parse(jsonSlice) as Record<string, unknown>
    } catch {
      return null
    }
  }

  return null
}

function tryParseJsonArray(text: string): unknown[] | null {
  const trimmed = text.trim()
  if (!trimmed) {
    return null
  }

  const direct = (() => {
    try {
      return JSON.parse(trimmed) as unknown[]
    } catch {
      return null
    }
  })()
  if (direct && Array.isArray(direct)) {
    return direct
  }

  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fenceMatch?.[1]) {
    try {
      const parsed = JSON.parse(fenceMatch[1].trim())
      return Array.isArray(parsed) ? parsed : null
    } catch {
      // Continue to fallback parsing below.
    }
  }

  const firstBracket = trimmed.indexOf('[')
  const lastBracket = trimmed.lastIndexOf(']')
  if (firstBracket >= 0 && lastBracket > firstBracket) {
    const jsonSlice = trimmed.slice(firstBracket, lastBracket + 1)
    try {
      const parsed = JSON.parse(jsonSlice)
      return Array.isArray(parsed) ? parsed : null
    } catch {
      return null
    }
  }

  return null
}

async function runStructuredPrompt(
  prompt: string,
  geminiApiKey?: string,
  openaiApiKey?: string
): Promise<string | null> {
  const providerCandidates = await resolveStructuredPromptProviders(geminiApiKey, openaiApiKey)
  for (const provider of providerCandidates) {
    if (provider.provider === 'gemini') {
      try {
        const model = getGeminiClient(provider.apiKey).getGenerativeModel({
          model: provider.model,
          generationConfig: {
            temperature: 0,
            maxOutputTokens: 512,
          },
        })
        const result = await model.generateContent(prompt)
        const text = result.response.text()?.trim()
        if (text) {
          return text
        }
      } catch (error: any) {
        console.warn('[Reasoning] Gemini structured prompt failed:', error?.message || error)
      }
      continue
    }

    try {
      const completion = await getOpenAIClient(provider.apiKey, provider.baseUrl).chat.completions.create({
        model: provider.model,
        temperature: 0,
        max_completion_tokens: 512,
        messages: [{ role: 'user', content: prompt }],
      })
      const text = completion.choices[0]?.message?.content?.trim()
      if (text) {
        return text
      }
    } catch (error: any) {
      console.warn('[Reasoning] OpenAI structured prompt failed:', error?.message || error)
    }
  }

  return null
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

async function resolveSearchContext(
  query: string,
  projectId: string,
  initialFileIds?: string[]
): Promise<{
  mentions: ReturnType<typeof parseMentions>
  searchQuery: string
  useLibraryOnly: boolean
  effectiveFileIds?: string[]
}> {
  const mentions = parseMentions(query)
  const searchQuery = mentions.cleanedMessage || query
  const useLibraryOnly = mentions.hasLibraryMention
  let currentFileIds = initialFileIds

  if (mentions.fileMentions.length > 0) {
    const resolved = await resolveFileMentionsAll(mentions.fileMentions, projectId)
    currentFileIds = useLibraryOnly ? resolved.libraryIds : [...resolved.workspaceIds, ...resolved.libraryIds]
  }

  const effectiveFileIds = currentFileIds && currentFileIds.length > 0 ? currentFileIds : undefined
  return { mentions, searchQuery, useLibraryOnly, effectiveFileIds }
}

async function runSearch(
  query: string,
  projectId: string,
  geminiApiKey: string | undefined,
  openaiApiKey: string | undefined,
  useLibraryOnly: boolean,
  effectiveFileIds?: string[],
  sourceMentions?: SourceMention[],
  k: number = 6
): Promise<SearchResult[]> {
  if (useLibraryOnly) {
    return searchLibrary(
      query,
        projectId,
        'library',
        geminiApiKey,
        openaiApiKey,
        effectiveFileIds,
      k,
      sourceMentions
    )
  }

  return searchWorkspaceAndLibrary(
    query,
        projectId,
        geminiApiKey,
        openaiApiKey,
        effectiveFileIds,
    k,
    sourceMentions
  )
}

async function readChunkById(
  projectId: string,
  chunkId: string,
  geminiApiKey?: string,
  openaiApiKey?: string
): Promise<SearchResult | null> {
  if (!chunkId || chunkId.trim().length === 0) {
    return null
  }

  let indexKey: string | undefined
  try {
    const embeddingConfig = await aiProviderStore.getActiveEmbeddingConfig(geminiApiKey, openaiApiKey)
    indexKey = buildEmbeddingIndexKey(embeddingConfig)
  } catch {
    // Fallback to legacy index key resolution.
  }

  const lockManager = getProjectLockManager()
  let releaseLock = await lockManager.acquireReadLock(projectId)
  try {
    for (const folder of ['project', 'library'] as const) {
      const store = getVectorStore(projectId, folder, indexKey)
      try {
        await store.loadIndexUnsafe()
      } catch {
        // Upgrade lock if loading needs write access (e.g. index repair)
        releaseLock()
        releaseLock = await lockManager.acquireWriteLock(projectId)
        try {
          await store.loadIndexUnsafe()
        } catch {
          // Skip this folder if it still cannot be loaded.
          releaseLock()
          releaseLock = await lockManager.acquireReadLock(projectId)
          continue
        }
        releaseLock()
        releaseLock = await lockManager.acquireReadLock(projectId)
      }
      try {
        const chunk = store.getChunkByIdUnsafe(chunkId)
        if (chunk) {
          return {
            chunk,
            score: 1,
            distance: 0,
          }
        }
      } catch {
        continue
      }
    }
  } finally {
    releaseLock()
  }

  return null
}

function dedupeAndRank(results: SearchResult[]): SearchResult[] {
  const uniqueResults = new Map<string, SearchResult>()
  for (const result of results) {
    const key = result.chunk.id
    if (!uniqueResults.has(key) || uniqueResults.get(key)!.distance > result.distance) {
      uniqueResults.set(key, result)
    }
  }
  return Array.from(uniqueResults.values())
    .sort((a, b) => a.distance - b.distance)
    .slice(0, 12)
}

interface BrowseCatalogItem {
  id: string
  sourceType: SourceMention
  sourceId: string
  title: string
  filePrefix: string
}

function buildBrowseLabelFromItemId(itemId: string): string {
  const parts = itemId.split(':')
  if (parts.length === 0) {
    return itemId
  }
  if (parts.length === 1) {
    return parts[0]
  }
  return `${parts[0]} ${parts.slice(1).join(':')}`
}

async function buildBrowseCatalogItems(
  projectId: string,
  sourceTypes?: SourceMention[],
  query?: string,
  geminiApiKey?: string,
  openaiApiKey?: string
): Promise<BrowseCatalogItem[]> {
  const sources = await integrationStore.getSourcesForProject(projectId).catch(() => [])
  const sourceFilter = sourceTypes && sourceTypes.length > 0 ? new Set(sourceTypes) : null
  const activeSources = sources.filter((source) =>
    !sourceFilter || sourceFilter.has(source.sourceType as SourceMention)
  )
  if (activeSources.length === 0) {
    return []
  }

  const lowerQuery = query?.trim().toLowerCase()
  const items: BrowseCatalogItem[] = []
  const seen = new Set<string>()

  let indexKey: string | undefined
  try {
    const embeddingConfig = await aiProviderStore.getActiveEmbeddingConfig(geminiApiKey, openaiApiKey)
    indexKey = buildEmbeddingIndexKey(embeddingConfig)
  } catch {
    // Keep legacy index behavior if embedding config cannot be resolved.
  }

  const lockManager = getProjectLockManager()
  let releaseLock = await lockManager.acquireReadLock(projectId)
  try {
    const libraryStore = getVectorStore(projectId, 'library', indexKey)
    try {
      await libraryStore.loadIndexUnsafe()
    } catch {
      releaseLock()
      releaseLock = await lockManager.acquireWriteLock(projectId)
      try {
        await libraryStore.loadIndexUnsafe()
      } catch {
        // Ignore if library index cannot be loaded.
      }
      releaseLock()
      releaseLock = await lockManager.acquireReadLock(projectId)
    }

    for (const source of activeSources) {
      const sourceType = source.sourceType as SourceMention
      const sourcePrefix = `integration:${sourceType}:${source.id}:`

      const pushItem = (title: string, filePrefix: string, stableId: string) => {
        if (lowerQuery && !title.toLowerCase().includes(lowerQuery)) {
          return
        }
        if (seen.has(stableId)) {
          return
        }
        seen.add(stableId)
        items.push({
          id: stableId,
          sourceType,
          sourceId: source.id,
          title,
          filePrefix,
        })
      }

      try {
        if (sourceType === 'github') {
          const { integrationService } = await import('./integrationService.js')
          const repos = await integrationService.listGithubRepos(projectId, source.id)
          for (const repo of repos.slice(0, 30)) {
            const stableId = `${sourceType}:${source.id}:${repo}`
            pushItem(`GitHub repo ${repo}`, `${sourcePrefix}${repo}:`, stableId)
          }
        } else if (sourceType === 'gitlab') {
          const { integrationService } = await import('./integrationService.js')
          const repos = await integrationService.listGitlabRepos(projectId, source.id)
          for (const repo of repos.slice(0, 30)) {
            const stableId = `${sourceType}:${source.id}:${repo}`
            pushItem(`GitLab repo ${repo}`, `${sourcePrefix}${repo}:`, stableId)
          }
        } else if (sourceType === 'slack') {
          const { integrationService } = await import('./integrationService.js')
          const channels = await integrationService.listSlackChannels(projectId, source.id)
          for (const channel of channels.slice(0, 40)) {
            const stableId = `${sourceType}:${source.id}:${channel.id}`
            const channelName = channel.name ? `#${channel.name}` : channel.id
            pushItem(`Slack channel ${channelName}`, `${sourcePrefix}${channel.id}:`, stableId)
          }
        } else if (sourceType === 'notion') {
          const { integrationService } = await import('./integrationService.js')
          const pages = await integrationService.listNotionPages(projectId, source.id)
          for (const page of pages.slice(0, 30)) {
            const stableId = `${sourceType}:${source.id}:${page.id}`
            pushItem(`Notion page ${page.title || page.id}`, `${sourcePrefix}page:${page.id}`, stableId)
          }
        }
      } catch {
        // Fall through to indexed-item fallback below for this source.
      }

      const indexedFileIds = Array.from(libraryStore.getFileIdsByPrefixUnsafe(sourcePrefix))
      for (const fileId of indexedFileIds.slice(0, 200)) {
        const parsed = parseIntegrationFileId(fileId)
        if (!parsed || parsed.sourceId !== source.id) {
          continue
        }
        const itemLabel = buildBrowseLabelFromItemId(parsed.itemId)
        const stableId = `${sourceType}:${source.id}:${parsed.itemId}`
        pushItem(`${sourceTypeLabel(sourceType)} item ${itemLabel}`, `${sourcePrefix}${parsed.itemId}`, stableId)
      }
    }
  } finally {
    releaseLock()
  }

  return items.slice(0, 20)
}

async function browseCatalogToResults(
  projectId: string,
  catalogItems: BrowseCatalogItem[],
  geminiApiKey?: string,
  openaiApiKey?: string
): Promise<SearchResult[]> {
  if (catalogItems.length === 0) {
    return []
  }

  let indexKey: string | undefined
  try {
    const embeddingConfig = await aiProviderStore.getActiveEmbeddingConfig(geminiApiKey, openaiApiKey)
    indexKey = buildEmbeddingIndexKey(embeddingConfig)
  } catch {
    // Keep legacy index behavior if embedding config cannot be resolved.
  }

  const lockManager = getProjectLockManager()
  let releaseLock = await lockManager.acquireReadLock(projectId)
  try {
    const libraryStore = getVectorStore(projectId, 'library', indexKey)
    try {
      await libraryStore.loadIndexUnsafe()
    } catch {
      releaseLock()
      releaseLock = await lockManager.acquireWriteLock(projectId)
      try {
        await libraryStore.loadIndexUnsafe()
      } catch {
        return []
      }
      releaseLock()
      releaseLock = await lockManager.acquireReadLock(projectId)
    }

    const results: SearchResult[] = []
    const seenChunkIds = new Set<string>()
    for (const item of catalogItems) {
      const fileIds = Array.from(libraryStore.getFileIdsByPrefixUnsafe(item.filePrefix))
      if (fileIds.length === 0) {
        continue
      }
      for (const fileId of fileIds) {
        const chunks = libraryStore.getChunksByFileIdUnsafe(fileId)
        if (chunks.length === 0) {
          continue
        }
        const chunk = chunks[0]
        if (seenChunkIds.has(chunk.id)) {
          continue
        }
        seenChunkIds.add(chunk.id)
        results.push({
          chunk,
          score: 0.95,
          distance: 0.05,
        })
        break
      }
      if (results.length >= 12) {
        break
      }
    }
    return results
  } finally {
    releaseLock()
  }
}

function normalizeSourceTypes(sourceTypes?: string[]): SourceMention[] | undefined {
  if (!sourceTypes || sourceTypes.length === 0) {
    return undefined
  }
  const validSourceTypes: SourceMention[] = [
    'github',
    'gitlab',
    'slack',
    'notion',
    'quickbooks',
    'hubspot',
    'linear',
    'stripe',
    'sentry',
    'posthog',
    'metabase',
    'db-schema',
  ]
  const normalized = sourceTypes.filter((value): value is SourceMention =>
    validSourceTypes.includes(value as SourceMention)
  )
  return normalized.length > 0 ? normalized : undefined
}

export async function classifyQueryComplexity(
  query: string,
  availableSources: string[],
  geminiApiKey?: string,
  openaiApiKey?: string,
  options?: ReasoningExecutionOptions
): Promise<'simple' | 'complex'> {
  const start = Date.now()
  const stepId = `classify_${start}`
  emitProgress(options?.onProgress, {
    type: 'agent_step_started',
    stepId,
    action: 'classify',
    status: 'started',
    label: 'Classifying query complexity',
  })
  const prompt = `You are a classifier for retrieval complexity.

Classify the user question as:
- "simple": one focused lookup or straightforward answer
- "complex": multi-source comparison, correlation, synthesis across systems, or likely iterative retrieval

Available sources: ${availableSources.length > 0 ? availableSources.join(', ') : 'none'}
Question: ${query}

Return strict JSON only:
{"complexity":"simple"} or {"complexity":"complex"}`

  const classifyTimeout = options?.timeouts?.classifyMs ?? DEFAULT_REASONING_TIMEOUTS.classifyMs
  let raw: string | null = null
  try {
    raw = await withTimeout(
      runStructuredPrompt(prompt, geminiApiKey, openaiApiKey),
      classifyTimeout,
      'classification_timeout'
    )
  } catch (error: any) {
    emitProgress(options?.onProgress, {
      type: 'agent_step_failed',
      stepId,
      action: 'classify',
      status: 'failed',
      label: 'Classification timed out',
      durationMs: Date.now() - start,
      summary: error?.message || 'classification_timeout',
    })
    return 'simple'
  }
  if (!raw) {
    emitProgress(options?.onProgress, {
      type: 'agent_step_finished',
      stepId,
      action: 'classify',
      status: 'finished',
      label: 'Classification fallback',
      durationMs: Date.now() - start,
      summary: 'simple',
    })
    return 'simple'
  }
  const parsed = tryParseJsonObject(raw)
  const complexity = parsed?.complexity
  if (complexity === 'simple' || complexity === 'complex') {
    emitProgress(options?.onProgress, {
      type: 'agent_step_finished',
      stepId,
      action: 'classify',
      status: 'finished',
      label: 'Classification complete',
      durationMs: Date.now() - start,
      summary: complexity,
    })
    return complexity
  }
  emitProgress(options?.onProgress, {
    type: 'agent_step_finished',
    stepId,
    action: 'classify',
    status: 'finished',
    label: 'Classification fallback',
    durationMs: Date.now() - start,
    summary: 'simple',
  })
  return 'simple'
}

export async function planQuery(
  query: string,
  availableSources: string[],
  geminiApiKey?: string,
  openaiApiKey?: string,
  options?: ReasoningExecutionOptions
): Promise<AgentPlanStep[]> {
  const fallbackPlan: AgentPlanStep[] = [{ action: 'search', query }]
  const start = Date.now()
  const stepId = `plan_${start}`
  emitProgress(options?.onProgress, {
    type: 'agent_step_started',
    stepId,
    action: 'plan',
    status: 'started',
    label: 'Planning retrieval steps',
  })
  const prompt = `You are creating a retrieval plan for a decision assistant.

User question: ${query}
Available sources: ${availableSources.length > 0 ? availableSources.join(', ') : 'none'}

Return ONLY a JSON array of 1-6 plan steps.
Schema per step:
{
  "action": "search" | "read" | "browse",
  "query": "string (required for search)",
  "chunkId": "optional string; preferred for read",
  "sourceTypes": ["optional source types from available sources"],
  "rationale": "short reason"
}

Important:
- Keep steps minimal and practical.
- Use "browse" when the question is broad/discovery-oriented (lists, what exists, latest entities).
- Use "read" when a specific chunkId is already known or after browse/search identifies targets.
- Do not include markdown, prose, or code fences.`

  const planTimeout = options?.timeouts?.planMs ?? DEFAULT_REASONING_TIMEOUTS.planMs
  let raw: string | null = null
  try {
    raw = await withTimeout(
      runStructuredPrompt(prompt, geminiApiKey, openaiApiKey),
      planTimeout,
      'planning_timeout'
    )
  } catch (error: any) {
    emitProgress(options?.onProgress, {
      type: 'agent_step_failed',
      stepId,
      action: 'plan',
      status: 'failed',
      label: 'Planning timed out',
      durationMs: Date.now() - start,
      summary: error?.message || 'planning_timeout',
    })
    return fallbackPlan
  }
  if (!raw) {
    emitProgress(options?.onProgress, {
      type: 'agent_step_finished',
      stepId,
      action: 'plan',
      status: 'finished',
      label: 'Planning fallback',
      durationMs: Date.now() - start,
      summary: '1 step',
    })
    return fallbackPlan
  }

  const parsed = tryParseJsonArray(raw)
  if (!parsed || parsed.length === 0) {
    emitProgress(options?.onProgress, {
      type: 'agent_step_finished',
      stepId,
      action: 'plan',
      status: 'finished',
      label: 'Planning fallback',
      durationMs: Date.now() - start,
      summary: '1 step',
    })
    return fallbackPlan
  }

  const allowedActions: Array<'search' | 'read' | 'browse'> = ['search', 'read', 'browse']
  const normalizedPlan: AgentPlanStep[] = []

  for (const item of parsed.slice(0, 6)) {
    if (!item || typeof item !== 'object') {
      continue
    }
    const record = item as Record<string, unknown>
    const actionRaw = String(record.action || 'search')
    const action = allowedActions.includes(actionRaw as 'search' | 'read' | 'browse')
      ? (actionRaw as 'search' | 'read' | 'browse')
      : 'search'
    const queryValue = typeof record.query === 'string' && record.query.trim().length > 0
      ? record.query.trim()
      : undefined
    const chunkId = typeof record.chunkId === 'string' && record.chunkId.trim().length > 0
      ? record.chunkId.trim()
      : undefined
    const sourceTypesRaw = Array.isArray(record.sourceTypes)
      ? record.sourceTypes.filter((value): value is string => typeof value === 'string')
      : undefined
    const normalizedSources = normalizeSourceTypes(sourceTypesRaw)
    const rationale = typeof record.rationale === 'string' && record.rationale.trim().length > 0
      ? record.rationale.trim()
      : undefined

    if (action === 'search' && !queryValue) {
      continue
    }

    normalizedPlan.push({
      action,
      query: queryValue,
      chunkId,
      sourceTypes: normalizedSources,
      rationale,
    })
  }

  const resultPlan: AgentPlanStep[] = normalizedPlan.length > 0 ? normalizedPlan : fallbackPlan
  emitProgress(options?.onProgress, {
    type: 'agent_step_finished',
    stepId,
    action: 'plan',
    status: 'finished',
    label: 'Planning complete',
    durationMs: Date.now() - start,
    summary: `${resultPlan.length} step${resultPlan.length === 1 ? '' : 's'}`,
  })
  return resultPlan
}

export async function reasonSimple(
  query: string,
  projectId: string,
  geminiApiKey?: string,
  openaiApiKey?: string,
  maxSteps: number = 10,
  initialFileIds?: string[],
  options?: ReasoningExecutionOptions
): Promise<ReasoningResult> {
  const stepId = `search_1`
  const start = Date.now()
  emitProgress(options?.onProgress, {
    type: 'agent_step_started',
    stepId,
    action: 'search',
    status: 'started',
    label: 'Searching for relevant context',
  })
  const context = await resolveSearchContext(query, projectId, initialFileIds)
  const budgetRemaining = Math.max(0, maxSteps - 1)

  let initialResults: SearchResult[] = []
  let simpleSearchTimedOut = false
  try {
    initialResults = await withTimeout(
      runSearch(
        context.searchQuery,
        projectId,
        geminiApiKey,
        openaiApiKey,
        context.useLibraryOnly,
        context.effectiveFileIds,
        context.mentions.sourceMentions,
        6
      ),
      options?.timeouts?.stepMs ?? DEFAULT_REASONING_TIMEOUTS.stepMs,
      'search_timeout'
    )
  } catch (error: any) {
    simpleSearchTimedOut = true
    emitProgress(options?.onProgress, {
      type: 'agent_step_failed',
      stepId,
      action: 'search',
      status: 'failed',
      label: 'Search step timed out',
      durationMs: Date.now() - start,
      summary: error?.message || 'search_timeout',
    })
  }
  const assessment = await assessRelevance(context.searchQuery, initialResults, geminiApiKey, openaiApiKey)
  const finalResults = dedupeAndRank(initialResults)
  emitProgress(options?.onProgress, {
    type: 'agent_step_finished',
    stepId,
    action: 'search',
    status: 'finished',
    label: 'Search complete',
    durationMs: Date.now() - start,
    summary: `${new Set(initialResults.map(result => result.chunk.fileId)).size} files`,
  })

  return {
    steps: [{
    step: 1,
    action: 'search',
      query: context.searchQuery,
    results: initialResults,
    budgetRemaining,
    relevanceScore: assessment.relevanceScore,
    needsMoreContext: assessment.needsMoreContext,
      informationGap: simpleSearchTimedOut ? 'search_timeout' : assessment.informationGap,
    }],
    finalResults,
    formattedResults: await formatSearchResults(finalResults),
    totalStepsUsed: 1,
    stoppedReason: finalResults.length > 0 ? 'sufficient_context' : 'no_more_info',
    complexityLevel: 'simple',
    libraryRequested: context.useLibraryOnly,
    libraryRequestedNoResults: context.useLibraryOnly && finalResults.length === 0,
  }
}

export async function reasonWithPlan(
  query: string,
  projectId: string,
  plan: AgentPlanStep[],
  geminiApiKey?: string,
  openaiApiKey?: string,
  maxSteps: number = 10,
  initialFileIds?: string[],
  options?: ReasoningExecutionOptions
): Promise<ReasoningResult> {
  const context = await resolveSearchContext(query, projectId, initialFileIds)
  const executablePlan = plan.slice(0, Math.max(1, Math.min(maxSteps, 6)))
  const steps: ReasoningStep[] = []
  let budgetRemaining = maxSteps
  const collectedResults: SearchResult[] = []
  let latestCandidateResults: SearchResult[] = []
  const readChunkIds = new Set<string>()
  const stepTimeout = options?.timeouts?.stepMs ?? DEFAULT_REASONING_TIMEOUTS.stepMs

  for (let i = 0; i < executablePlan.length && budgetRemaining > 0; i++) {
    const planStep = executablePlan[i]
    budgetRemaining--
    const stepNumber = i + 1
    const effectiveQuery = (planStep.query && planStep.query.trim().length > 0)
      ? planStep.query.trim()
      : context.searchQuery
    const sourceMentions = planStep.sourceTypes && planStep.sourceTypes.length > 0
      ? planStep.sourceTypes
      : context.mentions.sourceMentions
    const progressStepId = `${planStep.action}_${stepNumber}`
    const progressStartedAt = Date.now()
    emitProgress(options?.onProgress, {
      type: 'agent_step_started',
      stepId: progressStepId,
      action: planStep.action,
      status: 'started',
      label: `${planStep.action.charAt(0).toUpperCase() + planStep.action.slice(1)} step ${stepNumber}`,
    })

    if (planStep.action === 'read') {
      let readResult: SearchResult | null = null
      let readTimedOut = false
      const explicitChunkId = planStep.chunkId?.trim()
      try {
        if (explicitChunkId) {
          readResult = await withTimeout(
            readChunkById(projectId, explicitChunkId, geminiApiKey, openaiApiKey),
            stepTimeout,
            'read_timeout'
          )
        }

        if (!readResult) {
          const fallbackCandidate = [...latestCandidateResults, ...collectedResults].find(
            candidate => !readChunkIds.has(candidate.chunk.id)
          )
          if (fallbackCandidate) {
            readResult = await withTimeout(
              readChunkById(projectId, fallbackCandidate.chunk.id, geminiApiKey, openaiApiKey),
              stepTimeout,
              'read_timeout'
            )
            if (!readResult) {
              readResult = fallbackCandidate
            }
          }
        }
      } catch (error: any) {
        readTimedOut = true
        emitProgress(options?.onProgress, {
          type: 'agent_step_failed',
          stepId: progressStepId,
          action: 'read',
          status: 'failed',
          label: `Read step ${stepNumber} failed`,
          durationMs: Date.now() - progressStartedAt,
          summary: error?.message || 'read_timeout',
        })
      }

      if (readResult) {
        readChunkIds.add(readResult.chunk.id)
        collectedResults.push(readResult)
        steps.push({
          step: stepNumber,
          action: 'read',
          query: effectiveQuery,
          results: [readResult],
          budgetRemaining,
        })
        emitProgress(options?.onProgress, {
          type: 'agent_step_finished',
          stepId: progressStepId,
          action: 'read',
          status: 'finished',
          label: `Read step ${stepNumber} complete`,
          durationMs: Date.now() - progressStartedAt,
          summary: readResult.chunk.fileId,
        })
      } else {
        steps.push({
          step: stepNumber,
          action: 'read',
          query: effectiveQuery,
          results: [],
          budgetRemaining,
          informationGap: readTimedOut ? 'read_timeout' : 'No readable chunk was available for this step.',
        })
        emitProgress(options?.onProgress, {
          type: 'agent_step_finished',
          stepId: progressStepId,
          action: 'read',
          status: 'finished',
          label: `Read step ${stepNumber} complete`,
          durationMs: Date.now() - progressStartedAt,
          summary: 'No readable chunk',
        })
      }
      continue
    }

    if (planStep.action === 'browse') {
      let browseItems: BrowseCatalogItem[] = []
      let browseResults: SearchResult[] = []
      let browseTimedOut = false
      try {
        browseItems = await withTimeout(
          buildBrowseCatalogItems(
              projectId,
            sourceMentions,
            effectiveQuery,
              geminiApiKey,
            openaiApiKey
          ),
          stepTimeout,
          'browse_catalog_timeout'
        )
        browseResults = await withTimeout(
          browseCatalogToResults(
              projectId,
            browseItems,
              geminiApiKey,
            openaiApiKey
          ),
          stepTimeout,
          'browse_results_timeout'
        )
      } catch (error: any) {
        browseTimedOut = true
        emitProgress(options?.onProgress, {
          type: 'agent_step_failed',
          stepId: progressStepId,
          action: 'browse',
          status: 'failed',
          label: `Browse step ${stepNumber} failed`,
          durationMs: Date.now() - progressStartedAt,
          summary: error?.message || 'browse_timeout',
        })
      }
      if (browseResults.length > 0) {
        latestCandidateResults = browseResults
        collectedResults.push(...browseResults)
      }
      steps.push({
        step: stepNumber,
        action: 'browse',
        query: effectiveQuery,
        results: browseResults,
        budgetRemaining,
        informationGap: browseTimedOut
          ? 'browse_timeout'
          : (browseResults.length === 0 ? 'No catalog items were found for this browse step.' : undefined),
      })
      emitProgress(options?.onProgress, {
        type: 'agent_step_finished',
        stepId: progressStepId,
        action: 'browse',
        status: 'finished',
        label: `Browse step ${stepNumber} complete`,
        durationMs: Date.now() - progressStartedAt,
        summary: `${browseResults.length} catalog results`,
      })
      continue
    }

    if (planStep.action !== 'search') {
      steps.push({
        step: stepNumber,
        action: planStep.action,
        query: effectiveQuery,
        results: [],
        budgetRemaining,
        informationGap: `${planStep.action} is not implemented yet; skipped.`,
      })
      emitProgress(options?.onProgress, {
        type: 'agent_step_finished',
        stepId: progressStepId,
        action: planStep.action,
        status: 'finished',
        label: `${planStep.action} step ${stepNumber} skipped`,
        durationMs: Date.now() - progressStartedAt,
        summary: 'Unsupported step action',
      })
      continue
    }

    let stepResults: SearchResult[] = []
    let searchTimedOut = false
    try {
      stepResults = await withTimeout(
        runSearch(
          effectiveQuery,
          projectId,
          geminiApiKey,
          openaiApiKey,
          context.useLibraryOnly,
          context.effectiveFileIds,
          sourceMentions,
          6
        ),
        stepTimeout,
        'search_timeout'
      )
    } catch (error: any) {
      searchTimedOut = true
      emitProgress(options?.onProgress, {
        type: 'agent_step_failed',
        stepId: progressStepId,
        action: 'search',
        status: 'failed',
        label: `Search step ${stepNumber} failed`,
        durationMs: Date.now() - progressStartedAt,
        summary: error?.message || 'search_timeout',
      })
    }
    collectedResults.push(...stepResults)
    latestCandidateResults = stepResults
    const assessment = await assessRelevance(effectiveQuery, stepResults, geminiApiKey, openaiApiKey)

        steps.push({
      step: stepNumber,
          action: 'search',
      query: effectiveQuery,
      results: stepResults,
          budgetRemaining,
          relevanceScore: assessment.relevanceScore,
          needsMoreContext: assessment.needsMoreContext,
      informationGap: searchTimedOut ? 'search_timeout' : assessment.informationGap,
    })
    emitProgress(options?.onProgress, {
      type: 'agent_step_finished',
      stepId: progressStepId,
      action: 'search',
      status: 'finished',
      label: `Search step ${stepNumber} complete`,
      durationMs: Date.now() - progressStartedAt,
      summary: `${new Set(stepResults.map(result => result.chunk.fileId)).size} files`,
    })
  }

  const finalResults = dedupeAndRank(collectedResults)
  const stopReason: ReasoningResult['stoppedReason'] = budgetRemaining <= 0
    ? 'budget_exhausted'
    : (finalResults.length > 0 ? 'sufficient_context' : 'no_more_info')

  return {
    steps,
    finalResults,
    formattedResults: await formatSearchResults(finalResults),
    totalStepsUsed: steps.length,
    stoppedReason: stopReason,
    complexityLevel: 'complex',
    plan: executablePlan,
    libraryRequested: context.useLibraryOnly,
    libraryRequestedNoResults: context.useLibraryOnly && finalResults.length === 0,
  }
}

export async function orchestrateRetrieval(
  query: string,
  projectId: string,
  geminiApiKey?: string,
  openaiApiKey?: string,
  maxSteps: number = 10,
  initialFileIds?: string[],
  options?: ReasoningExecutionOptions
): Promise<ReasoningResult> {
  const orchestrateStart = Date.now()
  emitProgress(options?.onProgress, {
    type: 'agent_step_started',
    stepId: 'orchestrate',
    action: 'orchestrate',
    status: 'started',
    label: 'Starting retrieval orchestration',
  })
  const sources = await integrationStore.getSourcesForProject(projectId).catch(() => [])
  const availableSources = Array.from(new Set(sources.map(source => source.sourceType)))

  const complexity = await classifyQueryComplexity(query, availableSources, geminiApiKey, openaiApiKey, options)
  let result: ReasoningResult
  if (complexity === 'simple') {
    result = await reasonSimple(query, projectId, geminiApiKey, openaiApiKey, maxSteps, initialFileIds, options)
  } else {
    const plan = await planQuery(query, availableSources, geminiApiKey, openaiApiKey, options)
    result = await reasonWithPlan(query, projectId, plan, geminiApiKey, openaiApiKey, maxSteps, initialFileIds, options)
  }

  const orchestratorTotalMs = Date.now() - orchestrateStart
  emitProgress(options?.onProgress, {
    type: 'agent_step_finished',
    stepId: 'orchestrate',
    action: 'orchestrate',
    status: 'finished',
    label: 'Retrieval orchestration complete',
    durationMs: orchestratorTotalMs,
    summary: `${result.totalStepsUsed} step${result.totalStepsUsed === 1 ? '' : 's'}`,
  })
  emitProgress(options?.onProgress, {
    type: 'agent_metrics',
    stepId: 'orchestrate_metrics',
    action: 'orchestrate',
    status: 'note',
    label: 'orchestrator_metrics',
    durationMs: orchestratorTotalMs,
    meta: {
      orchestrator_total_ms: orchestratorTotalMs,
      steps_count_by_action: result.steps.reduce<Record<string, number>>((acc, step) => {
        acc[step.action] = (acc[step.action] || 0) + 1
        return acc
      }, {}),
      timeout_rate_by_action: result.steps.reduce<Record<string, number>>((acc, step) => {
        if (step.informationGap && step.informationGap.endsWith('_timeout')) {
          acc[step.action] = (acc[step.action] || 0) + 1
        }
        return acc
      }, {}),
    },
  })
  return result
}

export async function reason(
  query: string,
  projectId: string,
  geminiApiKey?: string,
  openaiApiKey?: string,
  maxSteps: number = 10,
  initialFileIds?: string[],
  options?: ReasoningExecutionOptions
): Promise<ReasoningResult> {
  return orchestrateRetrieval(query, projectId, geminiApiKey, openaiApiKey, maxSteps, initialFileIds, options)
}

export const aiReasoningService = {
  classifyQueryComplexity,
  planQuery,
  reasonSimple,
  reasonWithPlan,
  orchestrateRetrieval,
  reason,
}
