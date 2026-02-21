import { IntegrationItem, IntegrationSource } from '../integrationTypes.js'

const STRIPE_API = 'https://api.stripe.com/v1'
const PAGE_LIMIT = 100
const MAX_PAGES = 3

interface StripeListResponse<T> {
  object: 'list'
  data: T[]
  has_more: boolean
}

interface StripeCustomer {
  id: string
  email?: string | null
  name?: string | null
  description?: string | null
  created: number
  metadata?: Record<string, string>
}

interface StripeProduct {
  id: string
  name?: string | null
  description?: string | null
  active?: boolean
  created: number
  updated?: number
  metadata?: Record<string, string>
}

interface StripeSubscription {
  id: string
  status?: string | null
  customer: string
  created: number
  current_period_start?: number
  current_period_end?: number
  cancel_at_period_end?: boolean
  items?: { data?: Array<{ quantity?: number; price?: { unit_amount?: number; currency?: string; recurring?: { interval?: string } } }> }
}

interface StripeInvoice {
  id: string
  customer?: string | null
  status?: string | null
  amount_paid?: number
  amount_due?: number
  currency?: string | null
  created: number
  subscription?: string | null
  invoice_pdf?: string | null
}

function requireStripeApiKey(source: IntegrationSource): string {
  const apiKey = (source.config as { apiKey?: unknown })?.apiKey
  if (typeof apiKey !== 'string' || apiKey.trim().length === 0) {
    throw new Error('Stripe API key is missing. Reconnect Stripe and try again.')
  }
  return apiKey.trim()
}

async function stripeGet<T>(apiKey: string, path: string, params?: Record<string, string>): Promise<T> {
  const url = new URL(`${STRIPE_API}/${path}`)
  if (params) {
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v))
  }

  const response = await fetch(url.toString(), {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
  })

  if (!response.ok) {
    const body = await response.text()
    const err = new Error(`Stripe API request failed (${response.status})`)
    ;(err as any).status = response.status
    ;(err as any).body = body
    throw err
  }

  return response.json() as Promise<T>
}

async function stripeListAll<T>(
  apiKey: string,
  endpoint: string,
  limit = PAGE_LIMIT
): Promise<T[]> {
  const items: T[] = []
  let startingAfter: string | null = null
  let page = 0

  while (page < MAX_PAGES) {
    const params: Record<string, string> = { limit: String(limit) }
    if (startingAfter) params.starting_after = startingAfter

    const res = await stripeGet<StripeListResponse<T>>(apiKey, endpoint, params)
    const data = Array.isArray(res.data) ? res.data : []
    items.push(...data)

    if (!res.has_more || data.length === 0) break
    const last = data[data.length - 1] as { id?: string }
    if (last?.id) startingAfter = last.id
    page += 1
  }

  return items
}

function formatAmount(cents: number | undefined, currency?: string): string {
  if (cents == null) return '—'
  const curr = (currency || 'usd').toUpperCase()
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: curr }).format(cents / 100)
}

function mapCustomerToItem(source: IntegrationSource, c: StripeCustomer): IntegrationItem {
  const content = [
    c.email ? `Email: ${c.email}` : '',
    c.description ? `Description: ${c.description}` : '',
  ].filter(Boolean).join('\n')

  return {
    sourceId: source.id,
    sourceType: 'stripe',
    id: `customer:${c.id}`,
    externalId: c.id,
    title: `[Stripe Customer] ${c.name || c.email || c.id}`,
    content: content || 'Customer',
    updatedAt: new Date(c.created * 1000).toISOString(),
    metadata: {
      itemType: 'stripe:customer',
      identifier: c.id,
      email: c.email || undefined,
      name: c.name || undefined,
    },
  }
}

function mapProductToItem(source: IntegrationSource, p: StripeProduct): IntegrationItem {
  const content = [
    p.description || '',
    p.active != null ? `Active: ${p.active}` : '',
  ].filter(Boolean).join('\n')

  return {
    sourceId: source.id,
    sourceType: 'stripe',
    id: `product:${p.id}`,
    externalId: p.id,
    title: `[Stripe Product] ${p.name || p.id}`,
    content: content || 'Product',
    updatedAt: new Date((p.updated ?? p.created) * 1000).toISOString(),
    metadata: {
      itemType: 'stripe:product',
      identifier: p.id,
      name: p.name || undefined,
    },
  }
}

function mapSubscriptionToItem(source: IntegrationSource, s: StripeSubscription): IntegrationItem {
  const item = s.items?.data?.[0]
  const amount = item?.price?.unit_amount
  const currency = item?.price?.currency
  const interval = item?.price?.recurring?.interval
  const content = [
    s.status ? `Status: ${s.status}` : '',
    item?.quantity ? `Quantity: ${item.quantity}` : '',
    amount != null ? `Amount: ${formatAmount(amount * (item?.quantity ?? 1), currency)}/${interval || 'period'}` : '',
    s.cancel_at_period_end ? 'Cancels at period end' : '',
    s.current_period_end ? `Period end: ${new Date(s.current_period_end * 1000).toISOString()}` : '',
  ].filter(Boolean).join('\n')

  return {
    sourceId: source.id,
    sourceType: 'stripe',
    id: `subscription:${s.id}`,
    externalId: s.id,
    title: `[Stripe Subscription] ${s.id} (${s.status || '—'})`,
    content: content || 'Subscription',
    updatedAt: new Date(s.created * 1000).toISOString(),
    metadata: {
      itemType: 'stripe:subscription',
      identifier: s.id,
      status: s.status || undefined,
      customer: s.customer,
    },
  }
}

function mapInvoiceToItem(source: IntegrationSource, inv: StripeInvoice): IntegrationItem {
  const content = [
    inv.status ? `Status: ${inv.status}` : '',
    inv.amount_due != null ? `Amount due: ${formatAmount(inv.amount_due, inv.currency ?? undefined)}` : '',
    inv.amount_paid != null ? `Amount paid: ${formatAmount(inv.amount_paid, inv.currency ?? undefined)}` : '',
    inv.subscription ? `Subscription: ${inv.subscription}` : '',
  ].filter(Boolean).join('\n')

  return {
    sourceId: source.id,
    sourceType: 'stripe',
    id: `invoice:${inv.id}`,
    externalId: inv.id,
    title: `[Stripe Invoice] ${inv.id} (${inv.status || '—'})`,
    content: content || 'Invoice',
    updatedAt: new Date(inv.created * 1000).toISOString(),
    metadata: {
      itemType: 'stripe:invoice',
      identifier: inv.id,
      status: inv.status || undefined,
      amountPaid: inv.amount_paid,
      amountDue: inv.amount_due,
    },
  }
}

export async function fetchStripeItems(source: IntegrationSource): Promise<IntegrationItem[]> {
  const apiKey = requireStripeApiKey(source)

  const [customers, products, subscriptions, invoices] = await Promise.all([
    stripeListAll<StripeCustomer>(apiKey, 'customers'),
    stripeListAll<StripeProduct>(apiKey, 'products'),
    stripeListAll<StripeSubscription>(apiKey, 'subscriptions'),
    stripeListAll<StripeInvoice>(apiKey, 'invoices'),
  ])

  const items: IntegrationItem[] = []
  for (const c of customers) {
    items.push(mapCustomerToItem(source, c))
  }
  for (const p of products) {
    items.push(mapProductToItem(source, p))
  }
  for (const s of subscriptions) {
    items.push(mapSubscriptionToItem(source, s))
  }
  for (const inv of invoices) {
    items.push(mapInvoiceToItem(source, inv))
  }

  return items
}

/** Params for structured metric queries */
export interface StripeMetricParams {
  startDate?: string
  endDate?: string
  timeRange?: string
}

/** Result from Stripe metric fetch */
export interface StripeMetricResult {
  metric: string
  value: number
  formatted: string
  currency?: string
  subscriptionCount?: number
  executedAt: string
  timeWindow: string
}

/**
 * Compute date range from params.
 * timeRange: past_7_days | past_30_days | past_90_days | last_week | last_month
 */
function parseTimeRange(params?: StripeMetricParams): { start: number; end: number; label: string } {
  const now = Date.now() / 1000
  const day = 24 * 60 * 60
  let start: number
  let end = now
  let label: string
  const range = params?.timeRange || 'past_30_days'
  switch (range) {
    case 'past_7_days':
      start = now - 7 * day
      label = 'Past 7 days'
      break
    case 'past_30_days':
    case 'last_month':
      start = now - 30 * day
      label = 'Past 30 days'
      break
    case 'past_90_days':
      start = now - 90 * day
      label = 'Past 90 days'
      break
    case 'last_week':
      start = now - 7 * day
      label = 'Last week'
      break
    default:
      start = now - 30 * day
      label = 'Past 30 days'
  }
  if (params?.startDate && params?.endDate) {
    start = new Date(params.startDate).getTime() / 1000
    end = new Date(params.endDate).getTime() / 1000
    label = `${params.startDate} to ${params.endDate}`
  }
  return { start, end, label }
}

/**
 * Fetch MRR (Monthly Recurring Revenue) from active subscriptions.
 * Sums active subscription amounts, normalized to monthly.
 */
export async function fetchStripeMRR(
  source: IntegrationSource,
  params?: StripeMetricParams
): Promise<StripeMetricResult> {
  const apiKey = requireStripeApiKey(source)
  const { start, end, label } = parseTimeRange(params)

  const subscriptions = await stripeListAll<StripeSubscription>(apiKey, 'subscriptions')
  let totalMonthlyCents = 0
  let activeCount = 0

  for (const s of subscriptions) {
    if (s.status !== 'active' && s.status !== 'trialing') continue
    const created = s.created
    if (created > end) continue
    if (s.current_period_end && s.current_period_end < start) continue

    const item = s.items?.data?.[0]
    const amount = item?.price?.unit_amount ?? 0
    const quantity = item?.quantity ?? 1
    const interval = item?.price?.recurring?.interval ?? 'month'
    const currency = item?.price?.currency ?? 'usd'

    let monthlyCents = amount * quantity
    if (interval === 'year') monthlyCents /= 12
    else if (interval === 'week') monthlyCents *= 4.33

    totalMonthlyCents += monthlyCents
    activeCount += 1
  }

  const value = totalMonthlyCents / 100
  return {
    metric: 'mrr',
    value,
    formatted: formatAmount(Math.round(totalMonthlyCents), 'usd') + '/mo',
    currency: 'usd',
    subscriptionCount: activeCount,
    executedAt: new Date().toISOString(),
    timeWindow: label,
  }
}

/**
 * Fetch subscription count for a time range.
 */
export async function fetchStripeSubscriptionCount(
  source: IntegrationSource,
  params?: StripeMetricParams
): Promise<StripeMetricResult> {
  const apiKey = requireStripeApiKey(source)
  const { start, end, label } = parseTimeRange(params)

  const subscriptions = await stripeListAll<StripeSubscription>(apiKey, 'subscriptions')
  let count = 0
  for (const s of subscriptions) {
    if (s.status !== 'active' && s.status !== 'trialing') continue
    if (s.created <= end) count += 1
  }

  return {
    metric: 'subscription_count',
    value: count,
    formatted: String(count),
    executedAt: new Date().toISOString(),
    timeWindow: label,
    subscriptionCount: count,
  }
}
