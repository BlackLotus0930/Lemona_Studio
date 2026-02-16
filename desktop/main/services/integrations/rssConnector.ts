import { XMLParser } from 'fast-xml-parser'
import crypto from 'crypto'
import { IntegrationItem, IntegrationSource } from '../integrationTypes.js'

interface RawFeedItem {
  title?: string
  description?: string
  content?: string
  'content:encoded'?: string
  summary?: string
  guid?: string | { '#text'?: string }
  id?: string
  link?: string | { href?: string } | Array<{ href?: string }>
  pubDate?: string
  updated?: string
  author?: string
}

function normalizeText(value: unknown): string {
  if (typeof value === 'string') {
    return value.trim()
  }
  return ''
}

function getGuid(item: RawFeedItem): string {
  if (typeof item.guid === 'string' && item.guid.trim().length > 0) {
    return item.guid.trim()
  }
  if (item.guid && typeof item.guid === 'object' && typeof item.guid['#text'] === 'string' && item.guid['#text'].trim().length > 0) {
    return item.guid['#text'].trim()
  }
  if (typeof item.id === 'string' && item.id.trim().length > 0) {
    return item.id.trim()
  }
  const link = getLink(item)
  if (link) {
    return link
  }
  const fallbackBase = `${normalizeText(item.title)}|${normalizeText(item.pubDate || item.updated)}|${normalizeText(item.description)}`
  return crypto.createHash('sha256').update(fallbackBase, 'utf8').digest('hex')
}

function getLink(item: RawFeedItem): string | undefined {
  if (typeof item.link === 'string' && item.link.trim().length > 0) {
    return item.link.trim()
  }
  if (Array.isArray(item.link) && item.link.length > 0) {
    const href = item.link.find(entry => entry?.href)?.href
    if (typeof href === 'string' && href.trim().length > 0) {
      return href.trim()
    }
  }
  if (item.link && !Array.isArray(item.link) && typeof item.link === 'object' && typeof item.link.href === 'string' && item.link.href.trim().length > 0) {
    return item.link.href.trim()
  }
  return undefined
}

function extractItems(parsed: any): RawFeedItem[] {
  const rssItems = parsed?.rss?.channel?.item
  if (Array.isArray(rssItems)) {
    return rssItems
  }
  if (rssItems && typeof rssItems === 'object') {
    return [rssItems]
  }

  const atomEntries = parsed?.feed?.entry
  if (Array.isArray(atomEntries)) {
    return atomEntries
  }
  if (atomEntries && typeof atomEntries === 'object') {
    return [atomEntries]
  }

  return []
}

function toIntegrationItem(source: IntegrationSource, item: RawFeedItem): IntegrationItem | null {
  const title = normalizeText(item.title) || 'Untitled RSS Item'
  const contentEncoded = normalizeText(item['content:encoded'])
  const description = normalizeText(item.description)
  const summary = normalizeText(item.summary)
  const content = contentEncoded || description || summary
  if (!content) {
    return null
  }

  const externalId = getGuid(item)
  const updatedAt = normalizeText(item.updated || item.pubDate) || new Date().toISOString()
  const link = getLink(item)
  const author = normalizeText(item.author)

  return {
    sourceId: source.id,
    sourceType: 'rss',
    id: externalId,
    externalId,
    title,
    content,
    updatedAt,
    metadata: {
      url: link,
      author: author || undefined,
      publishedAt: normalizeText(item.pubDate) || undefined,
    },
  }
}

export async function fetchRssItems(source: IntegrationSource): Promise<IntegrationItem[]> {
  const url = (source.config as { url?: string })?.url
  if (!url || typeof url !== 'string' || url.trim().length === 0) {
    throw new Error('RSS source config is missing url')
  }

  const response = await fetch(url.trim())
  if (!response.ok) {
    throw new Error(`Failed to fetch RSS feed (${response.status})`)
  }
  const xml = await response.text()

  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '',
    textNodeName: '#text',
    parseTagValue: true,
    trimValues: true,
  })

  const parsed = parser.parse(xml)
  const rawItems = extractItems(parsed)
  const items: IntegrationItem[] = []

  for (const rawItem of rawItems) {
    const normalized = toIntegrationItem(source, rawItem)
    if (normalized) {
      items.push(normalized)
    }
  }

  return items
}
