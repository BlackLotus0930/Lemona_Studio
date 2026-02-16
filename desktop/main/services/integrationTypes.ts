export type IntegrationSourceType = 'rss' | 'github' | 'notion'

export interface RssIntegrationConfig {
  url: string
}

export interface GithubIntegrationConfig {
  repos?: string[]
  login?: string
}

export interface NotionIntegrationConfig {
  workspaceId?: string
}

export type IntegrationSourceConfig =
  | RssIntegrationConfig
  | GithubIntegrationConfig
  | NotionIntegrationConfig

export type IntegrationConnectionStatus =
  | 'connected'
  | 'disconnected'
  | 'expired'
  | 'error'

export interface IntegrationSource {
  id: string
  projectId: string
  sourceType: IntegrationSourceType
  config: IntegrationSourceConfig
  connectionStatus?: IntegrationConnectionStatus
  displayName?: string
  lastSyncedAt?: string
  lastError?: string
  createdAt?: string
}

export interface IntegrationItem {
  sourceId: string
  sourceType?: IntegrationSourceType
  id: string
  externalId?: string
  title: string
  content: string
  metadata?: Record<string, unknown>
  updatedAt: string
}

export interface IntegrationSyncResult {
  sourceId: string
  sourceType: IntegrationSourceType
  itemCount: number
  chunkCount: number
  syncedAt: string
}

export function buildIntegrationFileId(
  sourceType: IntegrationSourceType,
  sourceId: string,
  itemId: string
): string {
  return `integration:${sourceType}:${sourceId}:${itemId}`
}

export function buildIntegrationFilePrefix(
  sourceType: IntegrationSourceType,
  sourceId: string
): string {
  return `integration:${sourceType}:${sourceId}:`
}

export function parseIntegrationFileId(
  fileId: string
): { sourceType: IntegrationSourceType; sourceId: string; itemId: string } | null {
  if (!fileId.startsWith('integration:')) {
    return null
  }

  const parts = fileId.split(':')
  if (parts.length < 4) {
    return null
  }

  const sourceType = parts[1] as IntegrationSourceType
  const sourceId = parts[2]
  const itemId = parts.slice(3).join(':')
  if (!sourceType || !sourceId || !itemId) {
    return null
  }

  if (sourceType !== 'rss' && sourceType !== 'github' && sourceType !== 'notion') {
    return null
  }

  return { sourceType, sourceId, itemId }
}
