import { IntegrationItem, IntegrationSource } from '../integrationTypes.js'

const DEFAULT_POSTHOG_HOST = 'https://us.posthog.com'
const PAGE_LIMIT = 100
const MAX_PAGES = 5

interface PosthogPaginatedResponse<T> {
  count?: number
  next?: string | null
  previous?: string | null
  results: T[]
}

interface PosthogDashboard {
  id: number
  name?: string | null
  description?: string | null
  pinned?: boolean
  created_at?: string | null
  created_by?: { first_name?: string; last_name?: string; email?: string } | null
  tags?: string[] | null
}

interface PosthogInsight {
  id: number
  short_id?: string | null
  name?: string | null
  derived_name?: string | null
  description?: string | null
  created_at?: string | null
  updated_at?: string | null
  created_by?: { first_name?: string; last_name?: string; email?: string } | null
  query?: Record<string, unknown>
}

const POSTHOG_HOST_ALIASES: Record<string, string> = {
  'us cloud': 'https://us.posthog.com',
  'eu cloud': 'https://eu.posthog.com',
  'us.posthog.com': 'https://us.posthog.com',
  'eu.posthog.com': 'https://eu.posthog.com',
}

function normalizePosthogHost(raw: string): string {
  const trimmed = raw.trim().replace(/\/$/, '')
  const lower = trimmed.toLowerCase()
  const alias = POSTHOG_HOST_ALIASES[lower]
  if (alias) return alias
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) return trimmed
  if (trimmed.length > 0) return `https://${trimmed}`
  return DEFAULT_POSTHOG_HOST
}

function requirePosthogConfig(source: IntegrationSource): { apiKey: string; host: string; projectId: string } {
  const cfg = source.config as { apiKey?: unknown; host?: unknown; projectId?: unknown }
  const apiKey = typeof cfg.apiKey === 'string' ? cfg.apiKey.trim() : ''
  const projectId = typeof cfg.projectId === 'string' ? cfg.projectId.trim() : ''
  if (!apiKey) {
    throw new Error('PostHog API key is missing. Reconnect PostHog and try again.')
  }
  if (!projectId) {
    throw new Error('PostHog project ID is required. Reconnect PostHog and try again.')
  }
  const host =
    typeof cfg.host === 'string' && cfg.host.trim().length > 0
      ? normalizePosthogHost(cfg.host)
      : DEFAULT_POSTHOG_HOST
  return { apiKey, host, projectId }
}

async function posthogGet<T>(
  url: string,
  apiKey: string
): Promise<T> {
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
  })

  if (!response.ok) {
    const body = await response.text()
    const err = new Error(`PostHog API request failed (${response.status})`)
    ;(err as any).status = response.status
    ;(err as any).body = body
    throw err
  }

  return response.json() as Promise<T>
}

async function fetchPaginated<T>(
  apiKey: string,
  baseUrl: string,
  mapResults: (r: PosthogPaginatedResponse<unknown>) => T[]
): Promise<T[]> {
  const all: T[] = []
  let url = `${baseUrl}?limit=${PAGE_LIMIT}`
  let page = 0

  while (page < MAX_PAGES) {
    const res = await posthogGet<PosthogPaginatedResponse<unknown>>(url, apiKey)
    const items = mapResults(res)
    all.push(...items)

    if (!res.next || items.length < PAGE_LIMIT) break
    url = res.next
    page += 1
  }

  return all
}

function mapDashboardToItem(source: IntegrationSource, d: PosthogDashboard): IntegrationItem {
  const content = [
    d.description || '',
    d.pinned ? 'Pinned' : '',
    Array.isArray(d.tags) && d.tags.length > 0 ? `Tags: ${d.tags.filter(Boolean).join(', ')}` : '',
    d.created_by ? `Created by: ${[d.created_by.first_name, d.created_by.last_name].filter(Boolean).join(' ') || d.created_by.email}` : '',
  ]
    .filter(Boolean)
    .join('\n')

  return {
    sourceId: source.id,
    sourceType: 'posthog',
    id: `dashboard:${d.id}`,
    externalId: String(d.id),
    title: `[PostHog Dashboard] ${d.name || `Dashboard ${d.id}`}`,
    content: content || 'PostHog dashboard',
    updatedAt: d.created_at || new Date().toISOString(),
    metadata: {
      itemType: 'posthog:dashboard',
      identifier: String(d.id),
      name: d.name || undefined,
    },
  }
}

function mapInsightToItem(source: IntegrationSource, i: PosthogInsight): IntegrationItem {
  const content = [
    i.description || '',
    i.derived_name ? `Derived: ${i.derived_name}` : '',
    i.created_by ? `Created by: ${[i.created_by.first_name, i.created_by.last_name].filter(Boolean).join(' ') || i.created_by.email}` : '',
  ]
    .filter(Boolean)
    .join('\n')

  const identifier = i.short_id || String(i.id)

  return {
    sourceId: source.id,
    sourceType: 'posthog',
    id: `insight:${i.id}`,
    externalId: String(i.id),
    title: `[PostHog Insight] ${identifier} ${i.name || i.derived_name || ''}`.trim(),
    content: content || 'PostHog insight',
    updatedAt: i.updated_at || i.created_at || new Date().toISOString(),
    metadata: {
      itemType: 'posthog:insight',
      identifier,
      name: i.name || i.derived_name || undefined,
    },
  }
}

export async function fetchPosthogItems(source: IntegrationSource): Promise<IntegrationItem[]> {
  const { apiKey, host, projectId } = requirePosthogConfig(source)

  const baseUrl = `${host}/api/projects/${encodeURIComponent(projectId)}`
  const [dashboards, insights] = await Promise.all([
    fetchPaginated<PosthogDashboard>(
      apiKey,
      `${baseUrl}/dashboards/`,
      res => (Array.isArray(res.results) ? res.results : []) as PosthogDashboard[]
    ),
    fetchPaginated<PosthogInsight>(
      apiKey,
      `${baseUrl}/insights/`,
      res => (Array.isArray(res.results) ? res.results : []) as PosthogInsight[]
    ),
  ])

  const items: IntegrationItem[] = []
  for (const d of dashboards) {
    items.push(mapDashboardToItem(source, d))
  }
  for (const i of insights) {
    items.push(mapInsightToItem(source, i))
  }

  return items
}
