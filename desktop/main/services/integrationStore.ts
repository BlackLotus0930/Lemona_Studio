import { app } from 'electron'
import fs from 'fs/promises'
import path from 'path'
import crypto from 'crypto'
import {
  GithubIntegrationConfig,
  GitlabIntegrationConfig,
  HubSpotIntegrationConfig,
  DbSchemaIntegrationConfig,
  IntegrationSource,
  IntegrationSourceConfig,
  LinearIntegrationConfig,
  NotionIntegrationConfig,
  QuickBooksIntegrationConfig,
  SlackIntegrationConfig,
  MetabaseIntegrationConfig,
  PosthogIntegrationConfig,
  SentryIntegrationConfig,
  StripeIntegrationConfig,
  IntegrationSourceType,
  RssIntegrationConfig,
} from './integrationTypes.js'

interface IntegrationStoreData {
  sources: IntegrationSource[]
}

const INTEGRATIONS_FILE = path.join(app.getPath('userData'), 'integrations.json')

async function ensureStoreFile(): Promise<void> {
  try {
    await fs.access(INTEGRATIONS_FILE)
  } catch {
    const initial: IntegrationStoreData = { sources: [] }
    await fs.writeFile(INTEGRATIONS_FILE, JSON.stringify(initial, null, 2), 'utf-8')
  }
}

async function loadStore(): Promise<IntegrationStoreData> {
  await ensureStoreFile()
  try {
    const content = await fs.readFile(INTEGRATIONS_FILE, 'utf-8')
    const parsed = JSON.parse(content) as Partial<IntegrationStoreData>
    if (!parsed || !Array.isArray(parsed.sources)) {
      return { sources: [] }
    }
    return { sources: parsed.sources }
  } catch (error) {
    console.error('[IntegrationStore] Failed to load store:', error)
    return { sources: [] }
  }
}

async function saveStore(data: IntegrationStoreData): Promise<void> {
  await fs.writeFile(INTEGRATIONS_FILE, JSON.stringify(data, null, 2), 'utf-8')
}

function generateId(): string {
  return crypto.randomUUID()
}

export const integrationStore = {
  async getSourcesForProject(projectId: string): Promise<IntegrationSource[]> {
    const store = await loadStore()
    return store.sources.filter(source => source.projectId === projectId)
  },

  async getSourceById(projectId: string, sourceId: string): Promise<IntegrationSource | null> {
    const store = await loadStore()
    const source = store.sources.find(s => s.projectId === projectId && s.id === sourceId)
    return source || null
  },

  async addSource(
    projectId: string,
    sourceType: IntegrationSourceType,
    config: Record<string, unknown>,
    displayName?: string
  ): Promise<IntegrationSource> {
    const store = await loadStore()
    let normalizedConfig: IntegrationSourceConfig
    if (sourceType === 'rss') {
      const url = typeof config.url === 'string' ? config.url.trim() : ''
      if (!url) {
        throw new Error('RSS url is required')
      }
      normalizedConfig = { url } as RssIntegrationConfig
    } else if (sourceType === 'github') {
      const repos = Array.isArray(config.repos)
        ? config.repos.filter((repo): repo is string => typeof repo === 'string' && repo.trim().length > 0).map(repo => repo.trim())
        : undefined
      const login = typeof config.login === 'string' && config.login.trim().length > 0
        ? config.login.trim()
        : undefined
      normalizedConfig = { repos, login } as GithubIntegrationConfig
    } else if (sourceType === 'gitlab') {
      const repos = Array.isArray(config.repos)
        ? config.repos.filter((repo): repo is string => typeof repo === 'string' && repo.trim().length > 0).map(repo => repo.trim())
        : undefined
      const login = typeof config.login === 'string' && config.login.trim().length > 0
        ? config.login.trim()
        : undefined
      normalizedConfig = { repos, login } as GitlabIntegrationConfig
    } else if (sourceType === 'slack') {
      const channels = Array.isArray(config.channels)
        ? config.channels.filter((ch): ch is string => typeof ch === 'string' && ch.trim().length > 0).map(ch => ch.trim())
        : undefined
      const teamName = typeof config.teamName === 'string' && config.teamName.trim().length > 0
        ? config.teamName.trim()
        : undefined
      const teamId = typeof config.teamId === 'string' && config.teamId.trim().length > 0
        ? config.teamId.trim()
        : undefined
      normalizedConfig = { channels, teamName, teamId } as SlackIntegrationConfig
    } else if (sourceType === 'linear') {
      const apiKey = typeof config.apiKey === 'string' ? config.apiKey.trim() : ''
      if (!apiKey) {
        throw new Error('Linear API key is required')
      }
      normalizedConfig = { apiKey } as LinearIntegrationConfig
    } else if (sourceType === 'stripe') {
      const apiKey = typeof config.apiKey === 'string' ? config.apiKey.trim() : ''
      if (!apiKey) {
        throw new Error('Stripe API key is required')
      }
      normalizedConfig = { apiKey } as StripeIntegrationConfig
    } else if (sourceType === 'sentry') {
      const apiKey = typeof config.apiKey === 'string' ? config.apiKey.trim() : ''
      const organization = typeof config.organization === 'string' ? config.organization.trim() : ''
      if (!apiKey) {
        throw new Error('Sentry API token is required')
      }
      if (!organization) {
        throw new Error('Sentry organization slug is required')
      }
      const host = typeof config.host === 'string' && config.host.trim().length > 0
        ? config.host.trim().replace(/\/$/, '')
        : undefined
      normalizedConfig = { apiKey, organization, ...(host ? { host } : {}) } as SentryIntegrationConfig
    } else if (sourceType === 'posthog') {
      const apiKey = typeof config.apiKey === 'string' ? config.apiKey.trim() : ''
      const projectIdConfig = typeof config.projectId === 'string' ? config.projectId.trim() : ''
      if (!apiKey) {
        throw new Error('PostHog API key is required')
      }
      if (!projectIdConfig) {
        throw new Error('PostHog project ID is required')
      }
      const host = typeof config.host === 'string' && config.host.trim().length > 0
        ? config.host.trim().replace(/\/$/, '')
        : 'https://us.posthog.com'
      normalizedConfig = { apiKey, host, projectId: projectIdConfig } as PosthogIntegrationConfig
    } else if (sourceType === 'metabase') {
      const apiKey = typeof config.apiKey === 'string' ? config.apiKey.trim() : ''
      const metabaseUrl = typeof config.metabaseUrl === 'string' ? config.metabaseUrl.trim() : ''
      if (!apiKey) {
        throw new Error('Metabase API key is required')
      }
      if (!metabaseUrl) {
        throw new Error('Metabase URL is required')
      }
      normalizedConfig = { apiKey, metabaseUrl: metabaseUrl.replace(/\/$/, '') } as MetabaseIntegrationConfig
    } else if (sourceType === 'notion') {
      const pageIds = Array.isArray(config.pageIds)
        ? config.pageIds.filter((id): id is string => typeof id === 'string' && id.trim().length > 0).map(id => id.trim())
        : undefined
      const workspaceId = typeof config.workspaceId === 'string' && config.workspaceId.trim().length > 0
        ? config.workspaceId.trim()
        : undefined
      const workspaceName = typeof config.workspaceName === 'string' && config.workspaceName.trim().length > 0
        ? config.workspaceName.trim()
        : undefined
      normalizedConfig = { pageIds, workspaceId, workspaceName } as NotionIntegrationConfig
    } else if (sourceType === 'quickbooks') {
      const realmId = typeof config.realmId === 'string' && config.realmId.trim().length > 0 ? config.realmId.trim() : undefined
      const companyName = typeof config.companyName === 'string' && config.companyName.trim().length > 0 ? config.companyName.trim() : undefined
      normalizedConfig = { realmId, companyName } as QuickBooksIntegrationConfig
    } else if (sourceType === 'hubspot') {
      const apiKey = typeof config.apiKey === 'string' ? config.apiKey.trim() : ''
      if (!apiKey) {
        throw new Error('HubSpot API key is required')
      }
      normalizedConfig = { apiKey } as HubSpotIntegrationConfig
    } else if (sourceType === 'db-schema') {
      const basePath = typeof config.basePath === 'string' ? config.basePath.trim() : ''
      if (!basePath) {
        throw new Error('DB Schema base path is required')
      }
      const migrationPaths = Array.isArray(config.migrationPaths)
        ? config.migrationPaths.filter((p): p is string => typeof p === 'string' && p.trim().length > 0).map(p => p.trim())
        : undefined
      normalizedConfig = { basePath, migrationPaths } as DbSchemaIntegrationConfig
    } else {
      throw new Error(`Unsupported source type: ${sourceType}`)
    }

    const source: IntegrationSource = {
      id: generateId(),
      projectId,
      sourceType,
      config: normalizedConfig,
      connectionStatus: 'connected',
      displayName: displayName?.trim() || undefined,
      createdAt: new Date().toISOString(),
    }
    store.sources.push(source)
    await saveStore(store)
    return source
  },

  async updateSource(projectId: string, sourceId: string, updates: Partial<IntegrationSource>): Promise<IntegrationSource | null> {
    const store = await loadStore()
    const index = store.sources.findIndex(s => s.projectId === projectId && s.id === sourceId)
    if (index === -1) {
      return null
    }
    const current = store.sources[index]
    const next: IntegrationSource = {
      ...current,
      ...updates,
      id: current.id,
      projectId: current.projectId,
      sourceType: current.sourceType,
    }
    store.sources[index] = next
    await saveStore(store)
    return next
  },

  async removeSource(projectId: string, sourceId: string): Promise<boolean> {
    const store = await loadStore()
    const before = store.sources.length
    store.sources = store.sources.filter(s => !(s.projectId === projectId && s.id === sourceId))
    if (store.sources.length === before) {
      return false
    }
    await saveStore(store)
    return true
  },
}
