import { IntegrationItem, IntegrationSource } from '../integrationTypes.js'

const HUBSPOT_API = 'https://api.hubapi.com'
const PAGE_LIMIT = 100
const MAX_PAGES = 5

interface HubSpotListResponse {
  results?: Array<{
    id: string
    properties?: Record<string, string>
    createdAt?: string
    updatedAt?: string
  }>
  paging?: { next?: { after?: string } }
}

function requireHubSpotApiKey(source: IntegrationSource): string {
  const apiKey = (source.config as { apiKey?: unknown })?.apiKey
  if (typeof apiKey !== 'string' || apiKey.trim().length === 0) {
    throw new Error('HubSpot API key is missing. Reconnect HubSpot and try again.')
  }
  return apiKey.trim()
}

async function hubspotGet<T>(apiKey: string, path: string, params?: Record<string, string>): Promise<T> {
  const url = new URL(`${HUBSPOT_API}${path}`)
  if (params) {
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v))
  }

  const response = await fetch(url.toString(), {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: 'application/json',
      'User-Agent': 'Lemona-Desktop',
    },
  })

  if (!response.ok) {
    const body = await response.text()
    const err = new Error(`HubSpot API request failed (${response.status})`)
    ;(err as { status?: number; body?: string }).status = response.status
    ;(err as { status?: number; body?: string }).body = body
    throw err
  }

  return response.json() as Promise<T>
}

async function hubspotListAll(
  apiKey: string,
  objectType: string,
  properties: string
): Promise<HubSpotListResponse['results']> {
  const items: NonNullable<HubSpotListResponse['results']> = []
  let after: string | undefined
  let page = 0

  while (page < MAX_PAGES) {
    const params: Record<string, string> = {
      limit: String(PAGE_LIMIT),
      properties,
    }
    if (after) params.after = after

    const res = await hubspotGet<HubSpotListResponse>(
      apiKey,
      `/crm/v3/objects/${objectType}`,
      params
    )
    const results = res.results || []
    items.push(...results)

    if (!res.paging?.next?.after || results.length === 0) break
    after = res.paging.next.after
    page += 1
  }

  return items
}

function mapContactToItem(source: IntegrationSource, c: { id: string; properties?: Record<string, string>; updatedAt?: string }): IntegrationItem {
  const props = c.properties || {}
  const name = [props.firstname, props.lastname].filter(Boolean).join(' ').trim() || props.email || c.id
  const content = [
    props.email ? `Email: ${props.email}` : '',
    props.phone ? `Phone: ${props.phone}` : '',
    props.company ? `Company: ${props.company}` : '',
    props.jobtitle ? `Title: ${props.jobtitle}` : '',
  ].filter(Boolean).join('\n')

  return {
    sourceId: source.id,
    sourceType: 'hubspot',
    id: `contact:${c.id}`,
    externalId: c.id,
    title: `[HubSpot Contact] ${name}`,
    content: content || 'Contact',
    updatedAt: c.updatedAt || new Date().toISOString(),
    metadata: {
      itemType: 'hubspot:contact',
      identifier: c.id,
      email: props.email,
      name,
    },
  }
}

function mapDealToItem(source: IntegrationSource, d: { id: string; properties?: Record<string, string>; updatedAt?: string }): IntegrationItem {
  const props = d.properties || {}
  const name = props.dealname || props.deal_name || d.id
  const amount = props.amount ? `$${Number(props.amount).toLocaleString()}` : ''
  const content = [
    props.dealstage ? `Stage: ${props.dealstage}` : '',
    amount ? `Amount: ${amount}` : '',
    props.closedate ? `Close: ${props.closedate}` : '',
    props.pipeline ? `Pipeline: ${props.pipeline}` : '',
  ].filter(Boolean).join('\n')

  return {
    sourceId: source.id,
    sourceType: 'hubspot',
    id: `deal:${d.id}`,
    externalId: d.id,
    title: `[HubSpot Deal] ${name}`,
    content: content || 'Deal',
    updatedAt: d.updatedAt || new Date().toISOString(),
    metadata: {
      itemType: 'hubspot:deal',
      identifier: d.id,
      dealname: props.dealname || props.deal_name,
      amount: props.amount,
      dealstage: props.dealstage,
    },
  }
}

function mapCompanyToItem(source: IntegrationSource, c: { id: string; properties?: Record<string, string>; updatedAt?: string }): IntegrationItem {
  const props = c.properties || {}
  const name = props.name || props.domain || c.id
  const content = [
    props.domain ? `Domain: ${props.domain}` : '',
    props.industry ? `Industry: ${props.industry}` : '',
    props.phone ? `Phone: ${props.phone}` : '',
    props.city ? `City: ${props.city}` : '',
  ].filter(Boolean).join('\n')

  return {
    sourceId: source.id,
    sourceType: 'hubspot',
    id: `company:${c.id}`,
    externalId: c.id,
    title: `[HubSpot Company] ${name}`,
    content: content || 'Company',
    updatedAt: c.updatedAt || new Date().toISOString(),
    metadata: {
      itemType: 'hubspot:company',
      identifier: c.id,
      name: props.name,
      domain: props.domain,
    },
  }
}

export async function fetchHubSpotItems(source: IntegrationSource): Promise<IntegrationItem[]> {
  const apiKey = requireHubSpotApiKey(source)

  const [contacts, deals, companies] = await Promise.all([
    hubspotListAll(apiKey, 'contacts', 'firstname,lastname,email,phone,company,jobtitle'),
    hubspotListAll(apiKey, 'deals', 'dealname,dealstage,amount,closedate,pipeline'),
    hubspotListAll(apiKey, 'companies', 'name,domain,industry,phone,city'),
  ])

  const items: IntegrationItem[] = []
  for (const c of contacts || []) {
    if (c.id) items.push(mapContactToItem(source, c))
  }
  for (const d of deals || []) {
    if (d.id) items.push(mapDealToItem(source, d))
  }
  for (const c of companies || []) {
    if (c.id) items.push(mapCompanyToItem(source, c))
  }
  return items
}
