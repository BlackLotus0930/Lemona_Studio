// Structured Evidence Service - Execute connector metric queries (Stripe MRR, PostHog DAU, etc.)
import { integrationStore } from './integrationStore.js'
import { fetchStripeMRR, fetchStripeSubscriptionCount } from './integrations/stripeConnector.js'
import { fetchPosthogDAU, fetchPosthogUniqueUsers } from './integrations/posthogConnector.js'
import type { ConnectorMetricType } from '../../../shared/types.js'

export interface StructuredQueryParams {
  timeRange?: string
  startDate?: string
  endDate?: string
  decisionTimestamp?: string
  eventFilter?: string
  [key: string]: unknown
}

export interface StructuredEvidenceResult {
  type: 'connector'
  connector: string
  metric: string
  excerpt: string
  structuredResult: Record<string, unknown>
  executedAt: string
  timeWindow?: string
  queryFingerprint: string
}

function buildQueryFingerprint(
  connector: string,
  metric: string,
  params?: StructuredQueryParams
): string {
  const p = params || {}
  return `${connector}:${metric}:${p.timeRange || 'default'}:${p.startDate || ''}:${p.endDate || ''}`
}

/**
 * Execute a structured connector metric query.
 * Returns excerpt + structured result for evidence node display.
 */
export async function runStructuredEvidenceQuery(
  projectId: string,
  connector: string,
  metric: ConnectorMetricType | string,
  params?: StructuredQueryParams
): Promise<StructuredEvidenceResult> {
  const sources = await integrationStore.getSourcesForProject(projectId)
  const source = sources.find(s => s.sourceType === connector)
  if (!source) {
    throw new Error(`No ${connector} integration connected for this project. Please add one in Integrations.`)
  }

  const timeParams = {
    timeRange: params?.timeRange,
    startDate: params?.startDate,
    endDate: params?.endDate,
    eventFilter: params?.eventFilter,
  }

  type MetricResult = { metric: string; value: number; formatted: string; executedAt: string; timeWindow: string; subscriptionCount?: number; currency?: string }
  let result: MetricResult
  const metricStr = String(metric)

  if (connector === 'stripe') {
    if (metricStr === 'stripe:mrr' || metricStr === 'mrr') {
      result = await fetchStripeMRR(source, timeParams)
    } else if (metricStr === 'stripe:subscription_count' || metricStr === 'subscription_count') {
      result = await fetchStripeSubscriptionCount(source, timeParams)
    } else {
      result = await fetchStripeMRR(source, timeParams)
    }
  } else if (connector === 'posthog') {
    if (metricStr === 'posthog:dau' || metricStr === 'dau') {
      result = await fetchPosthogDAU(source, timeParams)
    } else if (metricStr === 'posthog:unique_users' || metricStr === 'unique_users') {
      result = await fetchPosthogUniqueUsers(source, timeParams)
    } else {
      result = await fetchPosthogDAU(source, timeParams)
    }
  } else {
    throw new Error(`Unsupported connector for structured metrics: ${connector}`)
  }

  const structuredResult: Record<string, unknown> = {
    value: result.value,
    formatted: result.formatted,
    timeWindow: result.timeWindow,
  }
  if (result.subscriptionCount != null) structuredResult.subscriptionCount = result.subscriptionCount
  if (result.currency) structuredResult.currency = result.currency

  const excerpt = `[${connector}] ${metricStr}: ${result.formatted} (${result.timeWindow})`
  const fingerprint = buildQueryFingerprint(connector, metricStr, params)

  return {
    type: 'connector',
    connector,
    metric: metricStr,
    excerpt,
    structuredResult,
    executedAt: result.executedAt,
    timeWindow: result.timeWindow,
    queryFingerprint: fingerprint,
  }
}

/**
 * Check if a query is a structured connector query (vs semantic).
 */
export function isStructuredQuery(connector?: string, metric?: string): boolean {
  if (!connector || !metric) return false
  const m = String(metric).toLowerCase()
  const supported = ['stripe', 'posthog'].includes(connector)
  const hasMetric =
    m.includes('mrr') ||
    m.includes('dau') ||
    m.includes('subscription_count') ||
    m.includes('unique_users') ||
    m.includes('event_count')
  return supported && hasMetric
}
