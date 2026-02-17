export type IntegrationSourceType = 'rss' | 'github' | 'gitlab' | 'slack' | 'linear' | 'stripe' | 'sentry' | 'posthog' | 'metabase' | 'notion' | 'quickbooks' | 'hubspot' | 'db-schema'

export interface RssIntegrationConfig {
  url: string
}

export interface GithubIntegrationConfig {
  repos?: string[]
  login?: string
}

export interface GitlabIntegrationConfig {
  repos?: string[]
  login?: string
}

export interface SlackIntegrationConfig {
  channels?: string[]
  teamName?: string
  teamId?: string
}

export interface NotionIntegrationConfig {
  workspaceId?: string
  workspaceName?: string
  pageIds?: string[]
  databaseIds?: string[]
}

export interface QuickBooksIntegrationConfig {
  realmId?: string
  companyName?: string
}

export interface LinearIntegrationConfig {
  apiKey: string
}

export interface StripeIntegrationConfig {
  apiKey: string
}

export interface SentryIntegrationConfig {
  apiKey: string
  organization: string
  host?: string
}

export interface PosthogIntegrationConfig {
  apiKey: string
  host: string
  projectId: string
}

export interface MetabaseIntegrationConfig {
  apiKey: string
  metabaseUrl: string
}

export interface HubSpotIntegrationConfig {
  apiKey: string
}

export interface DbSchemaIntegrationConfig {
  basePath: string
  migrationPaths?: string[]
}

export type IntegrationItemType =
  | 'issue'
  | 'pull_request'
  | 'pull_request_issue'
  | 'file'
  | 'article'
  | 'project'
  | 'cycle'
  | 'page'
  | 'database'
  | `${IntegrationSourceType}:${string}`

export interface IntegrationItemMetadata {
  itemType?: IntegrationItemType | string
  url?: string
  author?: string
  assignee?: string
  state?: string
  repo?: string
  team?: string
  project?: string
  cycle?: string
  labels?: string[] | string
  identifier?: string
  priority?: number | string
  createdAt?: string
  updatedAt?: string
  [key: string]: unknown
}

export type IntegrationSourceConfig =
  | RssIntegrationConfig
  | GithubIntegrationConfig
  | GitlabIntegrationConfig
  | SlackIntegrationConfig
  | LinearIntegrationConfig
  | StripeIntegrationConfig
  | SentryIntegrationConfig
  | PosthogIntegrationConfig
  | MetabaseIntegrationConfig
  | NotionIntegrationConfig
  | QuickBooksIntegrationConfig
  | HubSpotIntegrationConfig
  | DbSchemaIntegrationConfig

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
  metadata?: IntegrationItemMetadata
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

  if (sourceType !== 'rss' && sourceType !== 'github' && sourceType !== 'gitlab' && sourceType !== 'slack' && sourceType !== 'linear' && sourceType !== 'stripe' && sourceType !== 'sentry' && sourceType !== 'posthog' && sourceType !== 'metabase' && sourceType !== 'notion' && sourceType !== 'quickbooks' && sourceType !== 'hubspot' && sourceType !== 'db-schema') {
    return null
  }

  return { sourceType, sourceId, itemId }
}
