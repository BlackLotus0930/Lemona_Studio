import { IntegrationItem, IntegrationSource } from '../integrationTypes.js'

const NOTION_API = 'https://api.notion.com/v1'
const NOTION_VERSION = '2022-06-28'
const MAX_PAGES = 100
const MAX_BLOCKS_PER_PAGE = 200

interface NotionRichText {
  plain_text?: string
  type?: string
}

interface NotionBlock {
  id: string
  type: string
  [key: string]: unknown
}

interface NotionSearchResult {
  object: string
  id: string
  created_time?: string
  last_edited_time?: string
  url?: string
  title?: Array<{ plain_text?: string }>
  icon?: unknown
  properties?: Record<string, unknown>
}

interface NotionSearchResponse {
  results?: NotionSearchResult[]
  next_cursor?: string | null
  has_more?: boolean
}

interface NotionBlockChildrenResponse {
  results?: NotionBlock[]
  next_cursor?: string | null
  has_more?: boolean
}

function getPageIdsFromConfig(source: IntegrationSource): string[] {
  const config = source.config as { pageIds?: unknown; databaseIds?: unknown }
  const pages = Array.isArray(config?.pageIds)
    ? config.pageIds.filter((id): id is string => typeof id === 'string' && id.trim().length > 0).map(id => id.trim())
    : []
  return pages
}

function getDatabaseIdsFromConfig(source: IntegrationSource): string[] {
  const config = source.config as { databaseIds?: unknown }
  return Array.isArray(config?.databaseIds)
    ? config.databaseIds.filter((id): id is string => typeof id === 'string' && id.trim().length > 0).map(id => id.trim())
    : []
}

async function notionFetch<T>(path: string, token: string, options?: RequestInit): Promise<T> {
  const url = path.startsWith('http') ? path : `${NOTION_API}${path}`
  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Notion-Version': NOTION_VERSION,
      'Content-Type': 'application/json',
      'User-Agent': 'Lemona-Desktop',
      ...(options?.headers as Record<string, string> || {}),
    },
  })
  if (!response.ok) {
    const text = await response.text()
    const error = new Error(`Notion API request failed (${response.status})`)
    ;(error as { status?: number; body?: string }).status = response.status
    ;(error as { status?: number; body?: string }).body = text
    throw error
  }
  return (await response.json()) as T
}

function extractRichText(block: NotionBlock): string {
  const typeKey = block.type
  const blockData = block[typeKey] as { rich_text?: NotionRichText[] } | undefined
  if (!blockData?.rich_text || !Array.isArray(blockData.rich_text)) {
    return ''
  }
  return blockData.rich_text
    .map(rt => (typeof rt === 'object' && rt !== null && 'plain_text' in rt ? rt.plain_text || '' : ''))
    .join('')
}

function blockToText(block: NotionBlock): string {
  const text = extractRichText(block)
  if (block.type === 'heading_1') return `# ${text}`
  if (block.type === 'heading_2') return `## ${text}`
  if (block.type === 'heading_3') return `### ${text}`
  if (block.type === 'bulleted_list_item') return `• ${text}`
  if (block.type === 'numbered_list_item') return `• ${text}`
  if (block.type === 'to_do') {
    const toDo = block.to_do as { checked?: boolean }
    return `${toDo?.checked ? '[x]' : '[ ]'} ${text}`
  }
  return text
}

async function fetchBlockChildren(blockId: string, token: string): Promise<string> {
  const parts: string[] = []
  let cursor: string | undefined

  do {
    const url = `/blocks/${blockId}/children?page_size=100${cursor ? `&start_cursor=${cursor}` : ''}`
    const data = await notionFetch<NotionBlockChildrenResponse>(url, token)

    for (const block of data.results || []) {
      const text = blockToText(block)
      if (text.trim()) {
        parts.push(text)
      }
    }
    cursor = data.next_cursor || undefined
  } while (cursor && parts.length < MAX_BLOCKS_PER_PAGE)

  return parts.join('\n\n')
}

function getPageTitle(page: NotionSearchResult): string {
  const props = page.properties as Record<string, { type?: string; title?: Array<{ plain_text?: string; text?: { content?: string } }> }> | undefined
  if (props) {
    for (const key of Object.keys(props)) {
      const prop = props[key]
      if (prop?.type === 'title' && Array.isArray(prop.title) && prop.title.length > 0) {
        const text = prop.title
          .map(t => t.plain_text ?? t.text?.content ?? '')
          .join('')
          .trim()
        if (text) return text
      }
    }
  }
  const title = page.title
  if (Array.isArray(title) && title.length > 0) {
    return title.map(t => t.plain_text || '').join('').trim() || 'Untitled'
  }
  return 'Untitled'
}

async function searchPages(token: string, filterPageIds?: string[]): Promise<NotionSearchResult[]> {
  const pages: NotionSearchResult[] = []
  let cursor: string | null = null

  do {
    const body: Record<string, unknown> = {
      page_size: 100,
      filter: { property: 'object', value: 'page' },
    }
    if (cursor) body.start_cursor = cursor

    const data = await notionFetch<NotionSearchResponse>('/search', token, {
      method: 'POST',
      body: JSON.stringify(body),
    })

    for (const item of data.results || []) {
      if (filterPageIds && filterPageIds.length > 0) {
        if (filterPageIds.includes(item.id)) {
          pages.push(item)
        }
      } else {
        pages.push(item)
      }
    }

    cursor = data.has_more ? data.next_cursor || null : null
  } while (cursor && pages.length < MAX_PAGES)

  return pages
}

export async function listNotionPages(token: string): Promise<{ id: string; title: string; url?: string }[]> {
  const pages = await searchPages(token)
  return pages.map(p => ({
    id: p.id,
    title: getPageTitle(p),
    url: p.url,
  }))
}

export async function fetchNotionItems(source: IntegrationSource, token: string): Promise<IntegrationItem[]> {
  const filterPageIds = getPageIdsFromConfig(source)
  const pages = await searchPages(token, filterPageIds.length > 0 ? filterPageIds : undefined)
  const items: IntegrationItem[] = []

  for (const page of pages.slice(0, MAX_PAGES)) {
    try {
      const content = await fetchBlockChildren(page.id, token)
      const title = getPageTitle(page)
      const lastEdited = page.last_edited_time || page.created_time || new Date().toISOString()

      items.push({
        sourceId: source.id,
        sourceType: 'notion',
        id: `page:${page.id}`,
        externalId: page.id,
        title,
        content: content || `[No content]`,
        metadata: {
          itemType: 'page',
          url: page.url,
          createdAt: page.created_time,
          updatedAt: lastEdited,
        },
        updatedAt: lastEdited,
      })
    } catch (err) {
      console.error(`[Notion] Failed to fetch page ${page.id}:`, err)
    }
  }

  return items
}
