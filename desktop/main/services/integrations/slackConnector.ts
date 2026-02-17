import { IntegrationItem, IntegrationSource } from '../integrationTypes.js'

const SLACK_API = 'https://slack.com/api'
const MAX_CHANNELS = 20
const MAX_MESSAGES_PER_CHANNEL = 15
const DELAY_MS = 2000 // 2s between history calls; Slack rate-limits new non-Marketplace apps to ~1 req/min

interface SlackChannel {
  id: string
  name: string
  is_private?: boolean
  num_members?: number
}

interface SlackConversationsListResponse {
  ok: boolean
  channels?: SlackChannel[]
  response_metadata?: { next_cursor?: string }
  error?: string
}

interface SlackMessage {
  type: string
  ts: string
  user?: string
  text?: string
  subtype?: string
  bot_id?: string
}

interface SlackConversationsHistoryResponse {
  ok: boolean
  messages?: SlackMessage[]
  has_more?: boolean
  response_metadata?: { next_cursor?: string }
  error?: string
}

function getChannelsFromConfig(source: IntegrationSource): string[] {
  const config = source.config as { channels?: unknown }
  if (!Array.isArray(config?.channels)) {
    return []
  }
  return config.channels
    .filter((ch): ch is string => typeof ch === 'string' && ch.trim().length > 0)
    .map(ch => ch.trim())
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function slackFetch<T>(path: string, token: string, method = 'GET', body?: string): Promise<T> {
  const url = path.startsWith('http') ? path : `${SLACK_API}${path}`
  const opts: RequestInit = {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': 'Lemona-Desktop',
    },
  }
  if (body && method === 'POST') {
    opts.body = body
  }
  const response = await fetch(url, opts)
  if (!response.ok) {
    const text = await response.text()
    const error = new Error(`Slack API request failed (${response.status})`)
    ;(error as { status?: number; body?: string }).status = response.status
    ;(error as { status?: number; body?: string }).body = text
    throw error
  }
  return (await response.json()) as T
}

export async function fetchSlackChannels(token: string): Promise<{ id: string; name: string; isPrivate: boolean }[]> {
  const channels: { id: string; name: string; isPrivate: boolean }[] = []
  let cursor: string | undefined
  do {
    const params = new URLSearchParams({
      exclude_archived: 'true',
      types: 'public_channel,private_channel',
      limit: '200',
    })
    if (cursor) params.set('cursor', cursor)
    const data = await slackFetch<SlackConversationsListResponse>(
      `/conversations.list?${params.toString()}`,
      token
    )
    if (!data.ok && data.error) {
      throw new Error(data.error)
    }
    for (const ch of data.channels || []) {
      if (ch.id && ch.name) {
        channels.push({
          id: ch.id,
          name: ch.name,
          isPrivate: !!ch.is_private,
        })
      }
    }
    cursor = data.response_metadata?.next_cursor
  } while (cursor)

  return channels
}

function extractMessageText(msg: SlackMessage): string {
  if (msg.type !== 'message') return ''
  if (msg.subtype === 'channel_join' || msg.subtype === 'channel_leave') return ''
  return (msg.text || '').trim()
}

function mapMessageToIntegrationItem(
  sourceId: string,
  channelId: string,
  channelName: string,
  msg: SlackMessage
): IntegrationItem | null {
  const text = extractMessageText(msg)
  if (!text) return null
  return {
    sourceId,
    sourceType: 'slack',
    id: `${channelId}:msg:${msg.ts}`,
    externalId: msg.ts,
    title: `[#${channelName}] ${text.slice(0, 80)}${text.length > 80 ? '…' : ''}`,
    content: text,
    metadata: {
      itemType: 'channel_message',
      url: `https://app.slack.com/client/TBD/${channelId}/p${msg.ts.replace('.', '')}`,
      author: msg.user || msg.bot_id || '',
      createdAt: msg.ts ? new Date(parseFloat(msg.ts) * 1000).toISOString() : undefined,
      project: channelName,
    },
    updatedAt: msg.ts ? new Date(parseFloat(msg.ts) * 1000).toISOString() : new Date().toISOString(),
  }
}

export async function fetchSlackItems(source: IntegrationSource, token: string): Promise<IntegrationItem[]> {
  const selectedChannels = getChannelsFromConfig(source)
  const allChannels = await fetchSlackChannels(token)
  const channelsToFetch =
    selectedChannels.length > 0
      ? allChannels.filter(ch => selectedChannels.includes(ch.id) || selectedChannels.includes(ch.name))
      : allChannels.slice(0, MAX_CHANNELS)

  if (channelsToFetch.length === 0) {
    return []
  }

  const items: IntegrationItem[] = []
  for (let i = 0; i < channelsToFetch.length; i++) {
    if (i > 0) {
      await sleep(DELAY_MS)
    }
    const ch = channelsToFetch[i]
    try {
      const params = new URLSearchParams({
        channel: ch.id,
        limit: String(MAX_MESSAGES_PER_CHANNEL),
      })
      const data = await slackFetch<SlackConversationsHistoryResponse>(
        `/conversations.history?${params.toString()}`,
        token
      )
      if (!data.ok && data.error) {
        if (data.error === 'channel_not_found' || data.error === 'not_in_channel') continue
        throw new Error(data.error)
      }
      for (const msg of data.messages || []) {
        const item = mapMessageToIntegrationItem(source.id, ch.id, ch.name, msg)
        if (item) items.push(item)
      }
    } catch (err) {
      console.error(`[Slack] Failed to fetch history for #${ch.name}:`, err)
    }
  }
  return items
}
