import { IntegrationItem, IntegrationSource } from '../integrationTypes.js'

interface MetabaseDashboard {
  id?: number
  name?: string | null
  description?: string | null
  created_at?: string | null
  updated_at?: string | null
  collection_id?: number | null
}

interface MetabaseCard {
  id?: number
  name?: string | null
  description?: string | null
  dataset_query?: unknown
  database_id?: number | null
  table_id?: number | null
  created_at?: string | null
  updated_at?: string | null
  collection_id?: number | null
}

function requireMetabaseConfig(source: IntegrationSource): { apiKey: string; metabaseUrl: string } {
  const cfg = source.config as { apiKey?: unknown; metabaseUrl?: unknown }
  const apiKey = typeof cfg.apiKey === 'string' ? cfg.apiKey.trim() : ''
  const metabaseUrl = typeof cfg.metabaseUrl === 'string' ? cfg.metabaseUrl.trim().replace(/\/$/, '') : ''
  if (!apiKey) {
    throw new Error('Metabase API key is missing. Reconnect Metabase and try again.')
  }
  if (!metabaseUrl) {
    throw new Error('Metabase URL is required. Reconnect Metabase and try again.')
  }
  return { apiKey, metabaseUrl }
}

async function metabaseGet<T>(baseUrl: string, path: string, apiKey: string): Promise<T> {
  const url = `${baseUrl}${path}`
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'X-API-KEY': apiKey,
      'Content-Type': 'application/json',
    },
  })

  if (!response.ok) {
    const body = await response.text()
    const err = new Error(`Metabase API request failed (${response.status})`)
    ;(err as { status?: number; body?: string }).status = response.status
    ;(err as { status?: number; body?: string }).body = body
    throw err
  }

  return response.json() as Promise<T>
}

function mapDashboardToItem(source: IntegrationSource, d: MetabaseDashboard): IntegrationItem {
  const content = [
    d.description || '',
  ]
    .filter(Boolean)
    .join('\n')

  return {
    sourceId: source.id,
    sourceType: 'metabase',
    id: `dashboard:${d.id ?? ''}`,
    externalId: d.id != null ? String(d.id) : undefined,
    title: `[Metabase Dashboard] ${d.name || `Dashboard ${d.id ?? ''}`}`,
    content: content || 'Metabase dashboard',
    updatedAt: d.updated_at || d.created_at || new Date().toISOString(),
    metadata: {
      itemType: 'metabase:dashboard',
      identifier: d.id != null ? String(d.id) : undefined,
      name: d.name || undefined,
    },
  }
}

function mapCardToItem(source: IntegrationSource, c: MetabaseCard): IntegrationItem {
  const queryMeta = c.dataset_query && typeof c.dataset_query === 'object'
    ? JSON.stringify((c.dataset_query as Record<string, unknown>).type || 'query')
    : ''
  const content = [
    c.description || '',
    queryMeta ? `Query type: ${queryMeta}` : '',
  ]
    .filter(Boolean)
    .join('\n')

  return {
    sourceId: source.id,
    sourceType: 'metabase',
    id: `question:${c.id ?? ''}`,
    externalId: c.id != null ? String(c.id) : undefined,
    title: `[Metabase Question] ${c.name || `Question ${c.id ?? ''}`}`,
    content: content || 'Metabase question',
    updatedAt: c.updated_at || c.created_at || new Date().toISOString(),
    metadata: {
      itemType: 'metabase:question',
      identifier: c.id != null ? String(c.id) : undefined,
      name: c.name || undefined,
    },
  }
}

export async function fetchMetabaseItems(source: IntegrationSource): Promise<IntegrationItem[]> {
  const { apiKey, metabaseUrl } = requireMetabaseConfig(source)

  const [dashboardsRes, cardsRes] = await Promise.all([
    metabaseGet<MetabaseDashboard[] | { data?: MetabaseDashboard[] }>(metabaseUrl, '/api/dashboard', apiKey),
    metabaseGet<MetabaseCard[] | { data?: MetabaseCard[] }>(metabaseUrl, '/api/card', apiKey),
  ])

  const dashboards = Array.isArray(dashboardsRes)
    ? dashboardsRes
    : (dashboardsRes && Array.isArray((dashboardsRes as { data?: MetabaseDashboard[] }).data))
      ? (dashboardsRes as { data: MetabaseDashboard[] }).data
      : []

  const cards = Array.isArray(cardsRes)
    ? cardsRes
    : (cardsRes && Array.isArray((cardsRes as { data?: MetabaseCard[] }).data))
      ? (cardsRes as { data: MetabaseCard[] }).data
      : []

  const items: IntegrationItem[] = []
  for (const d of dashboards) {
    if (d?.id != null || d?.name) {
      items.push(mapDashboardToItem(source, d))
    }
  }
  for (const c of cards) {
    if (c?.id != null || c?.name) {
      items.push(mapCardToItem(source, c))
    }
  }

  return items
}
