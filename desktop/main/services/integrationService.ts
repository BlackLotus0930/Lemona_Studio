import { integrationStore } from './integrationStore.js'
import {
  buildIntegrationFilePrefix,
  GithubIntegrationConfig,
  GitlabIntegrationConfig,
  IntegrationSource,
  IntegrationSourceType,
  IntegrationSyncResult,
  parseIntegrationFileId,
} from './integrationTypes.js'
import type { SlackIntegrationConfig, NotionIntegrationConfig } from './integrationTypes.js'
import { fetchRssItems } from './integrations/rssConnector.js'
import { fetchGithubItems, fetchGithubRepos } from './integrations/githubConnector.js'
import { fetchGitlabItems, fetchGitlabRepos } from './integrations/gitlabConnector.js'
import { fetchSlackItems, fetchSlackChannels } from './integrations/slackConnector.js'
import { fetchNotionItems, listNotionPages } from './integrations/notionConnector.js'
import { fetchQuickBooksItems } from './integrations/quickbooksConnector.js'
import { fetchHubSpotItems } from './integrations/hubspotConnector.js'
import { fetchLinearItems } from './integrations/linearConnector.js'
import { fetchStripeItems } from './integrations/stripeConnector.js'
import { fetchSentryItems } from './integrations/sentryConnector.js'
import { fetchPosthogItems } from './integrations/posthogConnector.js'
import { fetchMetabaseItems } from './integrations/metabaseConnector.js'
import { fetchDbSchemaItems } from './integrations/dbSchemaConnector.js'
import { indexIntegrationContent } from './indexingService.js'
import { getProjectLockManager, getVectorStore } from './vectorStore.js'
import { integrationTokenStore } from './integrationTokenStore.js'
import { getOAuthConfigStatus, refreshGithubToken, refreshGitlabToken, refreshQuickBooksToken, refreshSlackToken, saveOAuthConfig, startOAuthFlow } from './oauthService.js'
import { BrowserWindow } from 'electron'
import { aiProviderStore, buildEmbeddingIndexKey } from './aiProviderStore.js'

async function resolveActiveIndexKey() {
  const config = await aiProviderStore.getActiveEmbeddingConfig()
  return buildEmbeddingIndexKey(config)
}

type StoredOAuthTokenPayload = {
  accessToken?: string
  refreshToken?: string
  expiresAt?: number
}

function parseStoredOAuthToken(tokenPayload: string): StoredOAuthTokenPayload | null {
  try {
    return JSON.parse(tokenPayload) as StoredOAuthTokenPayload
  } catch {
    return null
  }
}

async function refreshOAuthAccessToken(
  sourceType: 'github' | 'gitlab' | 'slack' | 'quickbooks',
  refreshToken: string
): Promise<{ accessToken: string; refreshToken: string; expiresIn: number }> {
  if (sourceType === 'github') return refreshGithubToken(refreshToken)
  if (sourceType === 'gitlab') return refreshGitlabToken(refreshToken)
  if (sourceType === 'slack') return refreshSlackToken(refreshToken)
  return refreshQuickBooksToken(refreshToken)
}

async function resolveOAuthAccessToken(
  sourceType: 'github' | 'gitlab' | 'slack' | 'quickbooks',
  sourceId: string,
  disconnectedMessage: string
): Promise<string> {
  const tokenPayload = await integrationTokenStore.getToken(sourceId)
  if (!tokenPayload) {
    throw new Error(disconnectedMessage)
  }
  const parsed = parseStoredOAuthToken(tokenPayload)
  if (parsed?.accessToken && parsed.refreshToken) {
    const expiresAt = parsed.expiresAt ?? 0
    const nowSec = Math.floor(Date.now() / 1000)
    if (expiresAt - nowSec < 300) {
      const refreshed = await refreshOAuthAccessToken(sourceType, parsed.refreshToken)
      const newExpiresAt = Math.floor(Date.now() / 1000) + refreshed.expiresIn
      await integrationTokenStore.saveToken(
        sourceId,
        JSON.stringify({
          accessToken: refreshed.accessToken,
          refreshToken: refreshed.refreshToken,
          expiresAt: newExpiresAt,
        })
      )
      return refreshed.accessToken
    }
    return parsed.accessToken
  }
  return tokenPayload
}

async function clearSourceFromIndex(projectId: string, source: IntegrationSource): Promise<number> {
  const projectLockManager = getProjectLockManager()
  const releaseLock = await projectLockManager.acquireWriteLock(projectId)
  try {
    const indexKey = await resolveActiveIndexKey()
    const vectorStore = getVectorStore(projectId, 'library', indexKey)
    await vectorStore.loadIndexUnsafe()
    const prefix = buildIntegrationFilePrefix(source.sourceType, source.id)
    const removed = await vectorStore.removeChunksByFilePrefixUnsafe(prefix, false)
    await vectorStore.saveIndexUnsafe()
    return removed
  } finally {
    releaseLock()
  }
}

async function fetchItems(source: IntegrationSource) {
  if (source.sourceType === 'rss') {
    return fetchRssItems(source)
  }
  if (source.sourceType === 'github') {
    const token = await resolveOAuthAccessToken('github', source.id, 'GitHub source is not connected. Please reconnect.')
    return fetchGithubItems(source, token)
  }
  if (source.sourceType === 'gitlab') {
    const token = await resolveOAuthAccessToken('gitlab', source.id, 'GitLab source is not connected. Please reconnect.')
    return fetchGitlabItems(source, token)
  }
  if (source.sourceType === 'slack') {
    const token = await resolveOAuthAccessToken('slack', source.id, 'Slack source is not connected. Please reconnect.')
    return fetchSlackItems(source, token)
  }
  if (source.sourceType === 'notion') {
    const token = await integrationTokenStore.getToken(source.id)
    if (!token) {
      throw new Error('Notion source is not connected. Please reconnect.')
    }
    return fetchNotionItems(source, token)
  }
  if (source.sourceType === 'quickbooks') {
    const accessToken = await resolveOAuthAccessToken('quickbooks', source.id, 'QuickBooks source is not connected. Please reconnect.')
    if (!accessToken) {
      throw new Error('QuickBooks source is not connected. Please reconnect.')
    }
    return fetchQuickBooksItems(source, accessToken)
  }
  if (source.sourceType === 'linear') {
    return fetchLinearItems(source)
  }
  if (source.sourceType === 'stripe') {
    return fetchStripeItems(source)
  }
  if (source.sourceType === 'sentry') {
    return fetchSentryItems(source)
  }
  if (source.sourceType === 'posthog') {
    return fetchPosthogItems(source)
  }
  if (source.sourceType === 'metabase') {
    return fetchMetabaseItems(source)
  }
  if (source.sourceType === 'hubspot') {
    return fetchHubSpotItems(source)
  }
  if (source.sourceType === 'db-schema') {
    return fetchDbSchemaItems(source)
  }
  throw new Error(`Unsupported source type: ${source.sourceType}`)
}

export const integrationService = {
  async getOAuthConfigStatus(sourceType: 'github' | 'gitlab' | 'slack' | 'notion' | 'quickbooks') {
    return getOAuthConfigStatus(sourceType)
  },

  async saveOAuthConfig(sourceType: 'github' | 'gitlab' | 'slack' | 'notion' | 'quickbooks', config: { clientId: string; clientSecret: string }) {
    return saveOAuthConfig(sourceType, config)
  },

  async getSources(projectId: string): Promise<IntegrationSource[]> {
    return integrationStore.getSourcesForProject(projectId)
  },

  async addSource(
    projectId: string,
    sourceType: IntegrationSourceType,
    config: Record<string, unknown>,
    displayName?: string
  ): Promise<IntegrationSource> {
    if (!projectId || projectId.trim().length === 0) {
      throw new Error('projectId is required')
    }
    if (sourceType === 'rss') {
      const url = typeof config.url === 'string' ? config.url.trim() : ''
      if (!url) {
        throw new Error('RSS url is required')
      }
      return integrationStore.addSource(projectId, sourceType, { url }, displayName)
    }
    if (sourceType === 'github') {
      const repos = Array.isArray(config.repos)
        ? config.repos.filter((repo): repo is string => typeof repo === 'string' && repo.trim().length > 0).map(repo => repo.trim())
        : undefined
      const login = typeof config.login === 'string' && config.login.trim().length > 0
        ? config.login.trim()
        : undefined
      return integrationStore.addSource(projectId, sourceType, { repos, login }, displayName)
    }
    if (sourceType === 'gitlab') {
      const repos = Array.isArray(config.repos)
        ? config.repos.filter((repo): repo is string => typeof repo === 'string' && repo.trim().length > 0).map(repo => repo.trim())
        : undefined
      const login = typeof config.login === 'string' && config.login.trim().length > 0
        ? config.login.trim()
        : undefined
      return integrationStore.addSource(projectId, sourceType, { repos, login }, displayName)
    }
    if (sourceType === 'slack') {
      const channels = Array.isArray(config.channels)
        ? config.channels.filter((ch): ch is string => typeof ch === 'string' && ch.trim().length > 0).map(ch => ch.trim())
        : undefined
      const teamName = typeof config.teamName === 'string' && config.teamName.trim().length > 0
        ? config.teamName.trim()
        : undefined
      const teamId = typeof config.teamId === 'string' && config.teamId.trim().length > 0
        ? config.teamId.trim()
        : undefined
      return integrationStore.addSource(projectId, sourceType, { channels, teamName, teamId }, displayName)
    }
    if (sourceType === 'notion') {
      const pageIds = Array.isArray(config.pageIds)
        ? config.pageIds.filter((id): id is string => typeof id === 'string' && id.trim().length > 0).map(id => id.trim())
        : undefined
      const workspaceId = typeof config.workspaceId === 'string' && config.workspaceId.trim().length > 0
        ? config.workspaceId.trim()
        : undefined
      const workspaceName = typeof config.workspaceName === 'string' && config.workspaceName.trim().length > 0
        ? config.workspaceName.trim()
        : undefined
      return integrationStore.addSource(projectId, sourceType, { pageIds, workspaceId, workspaceName }, displayName)
    }
    if (sourceType === 'linear') {
      const apiKey = typeof config.apiKey === 'string' ? config.apiKey.trim() : ''
      if (!apiKey) {
        throw new Error('Linear API key is required')
      }
      return integrationStore.addSource(projectId, sourceType, { apiKey }, displayName || 'Linear')
    }
    if (sourceType === 'stripe') {
      const apiKey = typeof config.apiKey === 'string' ? config.apiKey.trim() : ''
      if (!apiKey) {
        throw new Error('Stripe API key is required')
      }
      return integrationStore.addSource(projectId, sourceType, { apiKey }, displayName || 'Stripe')
    }
    if (sourceType === 'sentry') {
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
      return integrationStore.addSource(
        projectId,
        sourceType,
        { apiKey, organization, ...(host ? { host } : {}) },
        displayName || 'Sentry'
      )
    }
    if (sourceType === 'posthog') {
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
      return integrationStore.addSource(
        projectId,
        sourceType,
        { apiKey, host, projectId: projectIdConfig },
        displayName || 'PostHog'
      )
    }
    if (sourceType === 'quickbooks') {
      const realmId = typeof config.realmId === 'string' && config.realmId.trim().length > 0 ? config.realmId.trim() : undefined
      const companyName = typeof config.companyName === 'string' && config.companyName.trim().length > 0 ? config.companyName.trim() : undefined
      return integrationStore.addSource(projectId, sourceType, { realmId, companyName }, displayName || 'QuickBooks')
    }
    if (sourceType === 'metabase') {
      const apiKey = typeof config.apiKey === 'string' ? config.apiKey.trim() : ''
      const metabaseUrl = typeof config.metabaseUrl === 'string' ? config.metabaseUrl.trim() : ''
      if (!apiKey) {
        throw new Error('Metabase API key is required')
      }
      if (!metabaseUrl) {
        throw new Error('Metabase URL is required')
      }
      return integrationStore.addSource(
        projectId,
        sourceType,
        { apiKey, metabaseUrl: metabaseUrl.replace(/\/$/, '') },
        displayName || 'Metabase'
      )
    }
    if (sourceType === 'hubspot') {
      const apiKey = typeof config.apiKey === 'string' ? config.apiKey.trim() : ''
      if (!apiKey) {
        throw new Error('HubSpot API key is required')
      }
      return integrationStore.addSource(projectId, sourceType, { apiKey }, displayName || 'HubSpot')
    }
    if (sourceType === 'db-schema') {
      const basePath = typeof config.basePath === 'string' ? config.basePath.trim() : ''
      if (!basePath) {
        throw new Error('DB Schema base path is required. Choose a project folder.')
      }
      const migrationPaths = Array.isArray(config.migrationPaths)
        ? config.migrationPaths.filter((p): p is string => typeof p === 'string' && p.trim().length > 0).map(p => p.trim())
        : undefined
      return integrationStore.addSource(
        projectId,
        sourceType,
        { basePath: basePath.trim(), migrationPaths },
        displayName || 'DB Schema'
      )
    }
    throw new Error(`Unsupported source type: ${sourceType}`)
  },

  async startOAuth(
    projectId: string,
    sourceType: 'github' | 'gitlab' | 'slack' | 'notion' | 'quickbooks',
    parentWindow?: BrowserWindow | null
  ): Promise<IntegrationSource> {
    const oauth = await startOAuthFlow(sourceType, parentWindow)
    const existingSources = await integrationStore.getSourcesForProject(projectId)
    const existingSource = existingSources.find(source => source.sourceType === sourceType)
    const defaultName =
      sourceType === 'gitlab' ? 'GitLab' : sourceType === 'slack' ? 'Slack' : sourceType === 'notion' ? 'Notion' : sourceType === 'quickbooks' ? 'QuickBooks' : 'GitHub'

    if (existingSource) {
      const tokenToSave =
        oauth.refreshToken && oauth.expiresIn != null
          ? JSON.stringify({
              accessToken: oauth.accessToken,
              refreshToken: oauth.refreshToken,
              expiresAt: Math.floor(Date.now() / 1000) + oauth.expiresIn,
            })
          : oauth.accessToken
      await integrationTokenStore.saveToken(existingSource.id, tokenToSave)
      const currentConfig = existingSource.config || {}
      const nextConfig =
        sourceType === 'slack'
          ? {
              ...currentConfig,
              teamName: (oauth as { teamName?: string }).teamName || (currentConfig as { teamName?: string }).teamName,
              teamId: (oauth as { teamId?: string }).teamId || (currentConfig as { teamId?: string }).teamId,
            }
          : sourceType === 'notion'
            ? {
                ...currentConfig,
                workspaceId: (oauth as { workspaceId?: string }).workspaceId || (currentConfig as { workspaceId?: string }).workspaceId,
                workspaceName: (oauth as { workspaceName?: string }).workspaceName || (currentConfig as { workspaceName?: string }).workspaceName,
              }
            : sourceType === 'quickbooks'
              ? {
                  ...currentConfig,
                  realmId: (oauth as { realmId?: string }).realmId || (currentConfig as { realmId?: string }).realmId,
                  companyName: (oauth as { companyName?: string }).companyName || (currentConfig as { companyName?: string }).companyName,
                }
              : {
                  ...currentConfig,
                  login: oauth.login || (currentConfig as { login?: string }).login,
                }
      const displayNameValue =
        sourceType === 'slack'
          ? (oauth as { teamName?: string }).teamName || (currentConfig as { teamName?: string }).teamName
          : sourceType === 'notion'
            ? (oauth as { workspaceName?: string }).workspaceName || (currentConfig as { workspaceName?: string }).workspaceName
            : sourceType === 'quickbooks'
              ? (oauth as { companyName?: string }).companyName || (currentConfig as { companyName?: string }).companyName
              : oauth.login
      const updated = await integrationStore.updateSource(projectId, existingSource.id, {
        config: nextConfig,
        connectionStatus: 'connected',
        lastError: undefined,
        displayName: existingSource.displayName || displayNameValue || defaultName,
      })
      if (!updated) {
        throw new Error(`Failed to update ${defaultName} source after OAuth`)
      }
      return updated
    }

    const created = await integrationStore.addSource(
      projectId,
      sourceType,
      sourceType === 'slack'
        ? { channels: [], teamName: (oauth as { teamName?: string }).teamName, teamId: (oauth as { teamId?: string }).teamId }
        : sourceType === 'notion'
          ? { pageIds: [], workspaceId: (oauth as { workspaceId?: string }).workspaceId, workspaceName: (oauth as { workspaceName?: string }).workspaceName }
          : sourceType === 'quickbooks'
            ? { realmId: (oauth as { realmId?: string }).realmId, companyName: (oauth as { companyName?: string }).companyName }
            : { repos: [], login: oauth.login },
      sourceType === 'slack'
        ? (oauth as { teamName?: string }).teamName || defaultName
        : sourceType === 'notion'
          ? (oauth as { workspaceName?: string }).workspaceName || defaultName
          : sourceType === 'quickbooks'
            ? (oauth as { companyName?: string }).companyName || defaultName
            : oauth.login || defaultName
    )
    const tokenToSave =
      oauth.refreshToken && oauth.expiresIn != null
        ? JSON.stringify({
            accessToken: oauth.accessToken,
            refreshToken: oauth.refreshToken,
            expiresAt: Math.floor(Date.now() / 1000) + oauth.expiresIn,
          })
        : oauth.accessToken
    await integrationTokenStore.saveToken(created.id, tokenToSave)
    const updated = await integrationStore.updateSource(projectId, created.id, {
      connectionStatus: 'connected',
      lastError: undefined,
    })
    return updated || created
  },

  async removeSource(projectId: string, sourceId: string): Promise<{ success: boolean; removedChunks: number }> {
    const source = await integrationStore.getSourceById(projectId, sourceId)
    if (!source) {
      return { success: false, removedChunks: 0 }
    }
    let removedChunks = 0
    try {
      removedChunks = await clearSourceFromIndex(projectId, source)
    } catch (error) {
      // Disconnect should still succeed even if vector index cleanup fails
      // (e.g. legacy/invalid index directory on Windows).
      console.warn('[IntegrationService] removeSource: failed to clear source chunks, continuing with source removal:', error)
    }
    const success = await integrationStore.removeSource(projectId, sourceId)
    await integrationTokenStore.removeToken(sourceId)
    return { success, removedChunks }
  },

  async getIndexedGithubRepos(projectId: string, sourceId: string): Promise<string[]> {
    const source = await integrationStore.getSourceById(projectId, sourceId)
    if (!source || source.sourceType !== 'github') {
      return []
    }
    const projectLockManager = getProjectLockManager()
    const releaseLock = await projectLockManager.acquireReadLock(projectId)
    try {
      const indexKey = await resolveActiveIndexKey()
      const vectorStore = getVectorStore(projectId, 'library', indexKey)
      await vectorStore.loadIndexUnsafe()
      const prefix = buildIntegrationFilePrefix('github', sourceId)
      const fileIds = vectorStore.getFileIdsByPrefixUnsafe(prefix)
      const repos = new Set<string>()
      for (const fileId of fileIds) {
        const parsed = parseIntegrationFileId(fileId)
        if (parsed && parsed.sourceType === 'github') {
          const repo = parsed.itemId.split(':')[0]
          if (repo && repo.includes('/')) {
            repos.add(repo)
          }
        }
      }
      return Array.from(repos)
    } finally {
      releaseLock()
    }
  },

  async listGithubRepos(projectId: string, sourceId: string): Promise<string[]> {
    const source = await integrationStore.getSourceById(projectId, sourceId)
    if (!source || source.sourceType !== 'github') {
      throw new Error('GitHub source not found')
    }
    const token = await resolveOAuthAccessToken('github', sourceId, 'GitHub source is not connected. Please reconnect.')
    return fetchGithubRepos(token)
  },

  async updateGithubRepos(projectId: string, sourceId: string, repos: string[]): Promise<IntegrationSource> {
    const source = await integrationStore.getSourceById(projectId, sourceId)
    if (!source || source.sourceType !== 'github') {
      throw new Error('GitHub source not found')
    }
    const normalizedRepos = repos
      .filter(repo => typeof repo === 'string' && repo.trim().length > 0)
      .map(repo => repo.trim())
    const currentConfig = (source.config || {}) as GithubIntegrationConfig
    const currentRepos = Array.isArray(currentConfig.repos)
      ? currentConfig.repos.filter((r): r is string => typeof r === 'string').map(r => r.trim())
      : []
    const newReposSet = new Set(normalizedRepos)
    const removedRepos = currentRepos.filter(r => !newReposSet.has(r))

    if (removedRepos.length > 0) {
      const projectLockManager = getProjectLockManager()
      const releaseLock = await projectLockManager.acquireWriteLock(projectId)
      try {
        const indexKey = await resolveActiveIndexKey()
        const vectorStore = getVectorStore(projectId, 'library', indexKey)
        await vectorStore.loadIndexUnsafe()
        const sourcePrefix = buildIntegrationFilePrefix('github', sourceId)
        for (const repo of removedRepos) {
          const repoPrefix = `${sourcePrefix}${repo}:`
          await vectorStore.removeChunksByFilePrefixUnsafe(repoPrefix, false)
        }
        await vectorStore.saveIndexUnsafe()
      } finally {
        releaseLock()
      }
    }

    const updated = await integrationStore.updateSource(projectId, sourceId, {
      config: {
        ...currentConfig,
        repos: normalizedRepos,
      },
      lastError: undefined,
    })
    if (!updated) {
      throw new Error('Failed to update GitHub repositories')
    }
    return updated
  },

  async getIndexedGitlabRepos(projectId: string, sourceId: string): Promise<string[]> {
    const source = await integrationStore.getSourceById(projectId, sourceId)
    if (!source || source.sourceType !== 'gitlab') {
      return []
    }
    const projectLockManager = getProjectLockManager()
    const releaseLock = await projectLockManager.acquireReadLock(projectId)
    try {
      const indexKey = await resolveActiveIndexKey()
      const vectorStore = getVectorStore(projectId, 'library', indexKey)
      await vectorStore.loadIndexUnsafe()
      const prefix = buildIntegrationFilePrefix('gitlab', sourceId)
      const fileIds = vectorStore.getFileIdsByPrefixUnsafe(prefix)
      const repos = new Set<string>()
      for (const fileId of fileIds) {
        const parsed = parseIntegrationFileId(fileId)
        if (parsed && parsed.sourceType === 'gitlab') {
          const repo = parsed.itemId.split(':')[0]
          if (repo && repo.includes('/')) {
            repos.add(repo)
          }
        }
      }
      return Array.from(repos)
    } finally {
      releaseLock()
    }
  },

  async listGitlabRepos(projectId: string, sourceId: string): Promise<string[]> {
    const source = await integrationStore.getSourceById(projectId, sourceId)
    if (!source || source.sourceType !== 'gitlab') {
      throw new Error('GitLab source not found')
    }
    const token = await resolveOAuthAccessToken('gitlab', sourceId, 'GitLab source is not connected. Please reconnect.')
    return fetchGitlabRepos(token)
  },

  async updateGitlabRepos(projectId: string, sourceId: string, repos: string[]): Promise<IntegrationSource> {
    const source = await integrationStore.getSourceById(projectId, sourceId)
    if (!source || source.sourceType !== 'gitlab') {
      throw new Error('GitLab source not found')
    }
    const normalizedRepos = repos
      .filter(repo => typeof repo === 'string' && repo.trim().length > 0)
      .map(repo => repo.trim())
    const currentConfig = (source.config || {}) as GitlabIntegrationConfig
    const currentRepos = Array.isArray(currentConfig.repos)
      ? currentConfig.repos.filter((r): r is string => typeof r === 'string').map(r => r.trim())
      : []
    const newReposSet = new Set(normalizedRepos)
    const removedRepos = currentRepos.filter(r => !newReposSet.has(r))

    if (removedRepos.length > 0) {
      const projectLockManager = getProjectLockManager()
      const releaseLock = await projectLockManager.acquireWriteLock(projectId)
      try {
        const indexKey = await resolveActiveIndexKey()
        const vectorStore = getVectorStore(projectId, 'library', indexKey)
        await vectorStore.loadIndexUnsafe()
        const sourcePrefix = buildIntegrationFilePrefix('gitlab', sourceId)
        for (const repo of removedRepos) {
          const repoPrefix = `${sourcePrefix}${repo}:`
          await vectorStore.removeChunksByFilePrefixUnsafe(repoPrefix, false)
        }
        await vectorStore.saveIndexUnsafe()
      } finally {
        releaseLock()
      }
    }

    const updated = await integrationStore.updateSource(projectId, sourceId, {
      config: {
        ...currentConfig,
        repos: normalizedRepos,
      },
      lastError: undefined,
    })
    if (!updated) {
      throw new Error('Failed to update GitLab repositories')
    }
    return updated
  },

  async getIndexedSlackChannels(projectId: string, sourceId: string): Promise<string[]> {
    const source = await integrationStore.getSourceById(projectId, sourceId)
    if (!source || source.sourceType !== 'slack') {
      return []
    }
    const projectLockManager = getProjectLockManager()
    const releaseLock = await projectLockManager.acquireReadLock(projectId)
    try {
      const indexKey = await resolveActiveIndexKey()
      const vectorStore = getVectorStore(projectId, 'library', indexKey)
      await vectorStore.loadIndexUnsafe()
      const prefix = buildIntegrationFilePrefix('slack', sourceId)
      const fileIds = vectorStore.getFileIdsByPrefixUnsafe(prefix)
      const channelIds = new Set<string>()
      for (const fileId of fileIds) {
        const parsed = parseIntegrationFileId(fileId)
        if (parsed && parsed.sourceType === 'slack') {
          const channelId = parsed.itemId.split(':')[0]
          if (channelId) {
            channelIds.add(channelId)
          }
        }
      }
      return Array.from(channelIds)
    } finally {
      releaseLock()
    }
  },

  async listSlackChannels(projectId: string, sourceId: string): Promise<{ id: string; name: string; isPrivate: boolean }[]> {
    const source = await integrationStore.getSourceById(projectId, sourceId)
    if (!source || source.sourceType !== 'slack') {
      throw new Error('Slack source not found')
    }
    const token = await resolveOAuthAccessToken('slack', sourceId, 'Slack source is not connected. Please reconnect.')
    return fetchSlackChannels(token)
  },

  async updateSlackChannels(projectId: string, sourceId: string, channels: string[]): Promise<IntegrationSource> {
    const source = await integrationStore.getSourceById(projectId, sourceId)
    if (!source || source.sourceType !== 'slack') {
      throw new Error('Slack source not found')
    }
    const normalizedChannels = channels
      .filter(ch => typeof ch === 'string' && ch.trim().length > 0)
      .map(ch => ch.trim())
    const currentConfig = (source.config || {}) as SlackIntegrationConfig
    const currentChannels = Array.isArray(currentConfig.channels)
      ? currentConfig.channels.filter((c): c is string => typeof c === 'string').map(c => c.trim())
      : []
    const newChannelsSet = new Set(normalizedChannels)
    const removedChannels = currentChannels.filter(c => !newChannelsSet.has(c))

    if (removedChannels.length > 0) {
      const projectLockManager = getProjectLockManager()
      const releaseLock = await projectLockManager.acquireWriteLock(projectId)
      try {
        const indexKey = await resolveActiveIndexKey()
        const vectorStore = getVectorStore(projectId, 'library', indexKey)
        await vectorStore.loadIndexUnsafe()
        const sourcePrefix = buildIntegrationFilePrefix('slack', sourceId)
        for (const ch of removedChannels) {
          const chPrefix = `${sourcePrefix}${ch}:`
          await vectorStore.removeChunksByFilePrefixUnsafe(chPrefix, false)
        }
        await vectorStore.saveIndexUnsafe()
      } finally {
        releaseLock()
      }
    }

    const updated = await integrationStore.updateSource(projectId, sourceId, {
      config: {
        ...currentConfig,
        channels: normalizedChannels,
      },
      lastError: undefined,
    })
    if (!updated) {
      throw new Error('Failed to update Slack channels')
    }
    return updated
  },

  async getIndexedNotionPages(projectId: string, sourceId: string): Promise<string[]> {
    const source = await integrationStore.getSourceById(projectId, sourceId)
    if (!source || source.sourceType !== 'notion') {
      return []
    }
    const projectLockManager = getProjectLockManager()
    const releaseLock = await projectLockManager.acquireReadLock(projectId)
    try {
      const indexKey = await resolveActiveIndexKey()
      const vectorStore = getVectorStore(projectId, 'library', indexKey)
      await vectorStore.loadIndexUnsafe()
      const prefix = buildIntegrationFilePrefix('notion', sourceId)
      const fileIds = vectorStore.getFileIdsByPrefixUnsafe(prefix)
      const pageIds = new Set<string>()
      for (const fileId of fileIds) {
        const parsed = parseIntegrationFileId(fileId)
        if (parsed && parsed.sourceType === 'notion') {
          const match = /^page:(.+)$/.exec(parsed.itemId)
          if (match?.[1]) pageIds.add(match[1])
        }
      }
      return Array.from(pageIds)
    } finally {
      releaseLock()
    }
  },

  async listNotionPages(projectId: string, sourceId: string): Promise<{ id: string; title: string; url?: string }[]> {
    const source = await integrationStore.getSourceById(projectId, sourceId)
    if (!source || source.sourceType !== 'notion') {
      throw new Error('Notion source not found')
    }
    const token = await integrationTokenStore.getToken(sourceId)
    if (!token) {
      throw new Error('Notion source is not connected. Please reconnect.')
    }
    return listNotionPages(token)
  },

  async updateNotionPages(projectId: string, sourceId: string, pageIds: string[]): Promise<IntegrationSource> {
    const source = await integrationStore.getSourceById(projectId, sourceId)
    if (!source || source.sourceType !== 'notion') {
      throw new Error('Notion source not found')
    }
    const normalizedPageIds = pageIds
      .filter(id => typeof id === 'string' && id.trim().length > 0)
      .map(id => id.trim())
    const currentConfig = (source.config || {}) as NotionIntegrationConfig
    const currentPageIds = Array.isArray(currentConfig.pageIds)
      ? currentConfig.pageIds.filter((p): p is string => typeof p === 'string').map(p => p.trim())
      : []
    const newPageIdsSet = new Set(normalizedPageIds)
    const removedPageIds = currentPageIds.filter(p => !newPageIdsSet.has(p))

    if (removedPageIds.length > 0) {
      const projectLockManager = getProjectLockManager()
      const releaseLock = await projectLockManager.acquireWriteLock(projectId)
      try {
        const indexKey = await resolveActiveIndexKey()
        const vectorStore = getVectorStore(projectId, 'library', indexKey)
        await vectorStore.loadIndexUnsafe()
        const sourcePrefix = buildIntegrationFilePrefix('notion', sourceId)
        for (const pageId of removedPageIds) {
          const pagePrefix = `${sourcePrefix}page:${pageId}`
          await vectorStore.removeChunksByFilePrefixUnsafe(pagePrefix, false)
        }
        await vectorStore.saveIndexUnsafe()
      } finally {
        releaseLock()
      }
    }

    const updated = await integrationStore.updateSource(projectId, sourceId, {
      config: {
        ...currentConfig,
        pageIds: normalizedPageIds,
      },
      lastError: undefined,
    })
    if (!updated) {
      throw new Error('Failed to update Notion pages')
    }
    return updated
  },

  async syncSource(
    projectId: string,
    sourceId: string,
    geminiApiKey?: string,
    openaiApiKey?: string
  ): Promise<IntegrationSyncResult> {
    const source = await integrationStore.getSourceById(projectId, sourceId)
    if (!source) {
      throw new Error('Integration source not found')
    }
    try {
      const items = await fetchItems(source)
      const { itemCount, chunkCount } = await indexIntegrationContent(
        projectId,
        source.sourceType,
        source.id,
        items,
        geminiApiKey,
        openaiApiKey
      )
      const syncedAt = new Date().toISOString()
      await integrationStore.updateSource(projectId, source.id, {
        lastSyncedAt: syncedAt,
        lastError: undefined,
        connectionStatus:
          source.sourceType === 'github' || source.sourceType === 'gitlab' || source.sourceType === 'slack' || source.sourceType === 'notion'
            ? 'connected'
            : source.connectionStatus,
      })
      return {
        sourceId: source.id,
        sourceType: source.sourceType,
        itemCount,
        chunkCount,
        syncedAt,
      }
    } catch (error: any) {
      const status = error?.status as number | undefined
      if ((source.sourceType === 'github' || source.sourceType === 'gitlab' || source.sourceType === 'slack' || source.sourceType === 'notion') && status === 401) {
        await integrationTokenStore.removeToken(source.id)
        const providerName = source.sourceType === 'github' ? 'GitHub' : source.sourceType === 'gitlab' ? 'GitLab' : source.sourceType === 'slack' ? 'Slack' : 'Notion'
        await integrationStore.updateSource(projectId, source.id, {
          connectionStatus: 'expired',
          lastError: `${providerName} token expired. Please reconnect.`,
        })
      } else {
        await integrationStore.updateSource(projectId, source.id, {
          connectionStatus:
            source.sourceType === 'github' || source.sourceType === 'gitlab' || source.sourceType === 'slack' || source.sourceType === 'notion'
              ? 'error'
              : source.connectionStatus,
          lastError: error?.message || 'Sync failed',
        })
      }
      throw error
    }
  },

  async syncAll(projectId: string, geminiApiKey?: string, openaiApiKey?: string): Promise<IntegrationSyncResult[]> {
    const sources = await integrationStore.getSourcesForProject(projectId)
    const results: IntegrationSyncResult[] = []
    for (const source of sources) {
      try {
        const result = await this.syncSource(projectId, source.id, geminiApiKey, openaiApiKey)
        results.push(result)
      } catch (error: any) {
        await integrationStore.updateSource(projectId, source.id, {
          lastError: error?.message || 'Sync failed',
        })
      }
    }
    return results
  },
}
