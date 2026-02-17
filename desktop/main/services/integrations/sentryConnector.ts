import { IntegrationItem, IntegrationSource } from '../integrationTypes.js'

const DEFAULT_SENTRY_HOST = 'https://sentry.io'
const PAGE_LIMIT = 100
const MAX_PAGES = 5

interface SentryIssue {
  id: string
  shortId?: string | null
  title?: string | null
  culprit?: string | null
  level?: string | null
  status?: string | null
  permalink?: string | null
  firstSeen?: string | null
  lastSeen?: string | null
  count?: string | null
  userCount?: number | null
  metadata?: { title?: string | null; [key: string]: unknown } | null
  project?: { id?: string; name?: string; slug?: string } | null
}

function requireSentryConfig(source: IntegrationSource): { apiKey: string; organization: string; host: string } {
  const cfg = source.config as { apiKey?: unknown; organization?: unknown; host?: unknown }
  const apiKey = typeof cfg.apiKey === 'string' ? cfg.apiKey.trim() : ''
  const organization = typeof cfg.organization === 'string' ? cfg.organization.trim() : ''
  if (!apiKey) {
    throw new Error('Sentry API token is missing. Reconnect Sentry and try again.')
  }
  if (!organization) {
    throw new Error('Sentry organization slug is required. Reconnect Sentry and try again.')
  }
  const base = typeof cfg.host === 'string' && cfg.host.trim().length > 0
    ? cfg.host.trim().replace(/\/$/, '')
    : DEFAULT_SENTRY_HOST
  return { apiKey, organization, host: base }
}

function parseNextLink(linkHeader: string | null): string | null {
  if (!linkHeader) return null
  const parts = linkHeader.split(',')
  for (const part of parts) {
    const match = part.match(/<([^>]+)>;\s*rel="next"/)
    if (match) {
      const nextUrl = match[1].trim()
      const resultsMatch = part.match(/results="([^"]+)"/)
      if (resultsMatch && resultsMatch[1] === 'false') return null
      return nextUrl
    }
  }
  return null
}

async function sentryGet<T>(
  url: string,
  apiKey: string
): Promise<{ data: T; nextUrl: string | null }> {
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
  })

  if (!response.ok) {
    const body = await response.text()
    const err = new Error(`Sentry API request failed (${response.status})`)
    ;(err as any).status = response.status
    ;(err as any).body = body
    throw err
  }

  const data = (await response.json()) as T
  const linkHeader = response.headers.get('Link')
  const nextUrl = parseNextLink(linkHeader)
  return { data, nextUrl }
}

async function fetchSentryIssues(apiKey: string, host: string, organization: string): Promise<SentryIssue[]> {
  const issues: SentryIssue[] = []
  let url = `${host}/api/0/organizations/${encodeURIComponent(organization)}/issues/?query=&limit=${PAGE_LIMIT}`
  let page = 0

  while (page < MAX_PAGES) {
    const { data, nextUrl } = await sentryGet<SentryIssue[]>(url, apiKey)
    const pageIssues = Array.isArray(data) ? data : []
    issues.push(...pageIssues)

    if (!nextUrl || pageIssues.length < PAGE_LIMIT) break
    url = nextUrl
    page += 1
  }

  return issues
}

function mapIssueToItem(source: IntegrationSource, issue: SentryIssue): IntegrationItem {
  const title = issue.metadata?.title || issue.title || issue.culprit || issue.shortId || issue.id
  const content = [
    issue.culprit ? `Culprit: ${issue.culprit}` : '',
    issue.level ? `Level: ${issue.level}` : '',
    issue.status ? `Status: ${issue.status}` : '',
    issue.count ? `Count: ${issue.count}` : '',
    issue.userCount != null ? `Users affected: ${issue.userCount}` : '',
    issue.project?.name ? `Project: ${issue.project.name}` : '',
    issue.firstSeen ? `First seen: ${issue.firstSeen}` : '',
    issue.lastSeen ? `Last seen: ${issue.lastSeen}` : '',
    issue.permalink ? `URL: ${issue.permalink}` : '',
  ]
    .filter(Boolean)
    .join('\n')

  const identifier = issue.shortId || issue.id

  return {
    sourceId: source.id,
    sourceType: 'sentry',
    id: `issue:${issue.id}`,
    externalId: issue.id,
    title: `[Sentry] ${identifier} ${title}`,
    content: content || 'Sentry issue',
    updatedAt: issue.lastSeen || issue.firstSeen || new Date().toISOString(),
    metadata: {
      itemType: 'sentry:issue',
      identifier,
      url: issue.permalink || undefined,
      level: issue.level || undefined,
      status: issue.status || undefined,
      project: issue.project?.name || issue.project?.slug || undefined,
    },
  }
}

export async function fetchSentryItems(source: IntegrationSource): Promise<IntegrationItem[]> {
  const { apiKey, organization, host } = requireSentryConfig(source)

  const issues = await fetchSentryIssues(apiKey, host, organization)

  const items: IntegrationItem[] = []
  for (const issue of issues) {
    items.push(mapIssueToItem(source, issue))
  }
  return items
}
