import { integrationStore } from './integrationStore.js'
import {
  buildIntegrationFilePrefix,
  GithubIntegrationConfig,
  IntegrationSource,
  IntegrationSourceType,
  IntegrationSyncResult,
  parseIntegrationFileId,
} from './integrationTypes.js'
import { fetchRssItems } from './integrations/rssConnector.js'
import { fetchGithubItems, fetchGithubRepos } from './integrations/githubConnector.js'
import { indexIntegrationContent } from './indexingService.js'
import { getProjectLockManager, getVectorStore } from './vectorStore.js'
import { integrationTokenStore } from './integrationTokenStore.js'
import { getOAuthConfigStatus, saveOAuthConfig, startOAuthFlow } from './oauthService.js'
import { BrowserWindow } from 'electron'

async function clearSourceFromIndex(projectId: string, source: IntegrationSource): Promise<number> {
  const projectLockManager = getProjectLockManager()
  const releaseLock = await projectLockManager.acquireWriteLock(projectId)
  try {
    const vectorStore = getVectorStore(projectId, 'library')
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
    const token = await integrationTokenStore.getToken(source.id)
    if (!token) {
      throw new Error('GitHub source is not connected. Please reconnect.')
    }
    return fetchGithubItems(source, token)
  }
  throw new Error(`Unsupported source type: ${source.sourceType}`)
}

export const integrationService = {
  async getOAuthConfigStatus(sourceType: 'github') {
    return getOAuthConfigStatus(sourceType)
  },

  async saveOAuthConfig(sourceType: 'github', config: { clientId: string; clientSecret: string }) {
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
    throw new Error(`Unsupported source type: ${sourceType}`)
  },

  async startOAuth(
    projectId: string,
    sourceType: 'github',
    parentWindow?: BrowserWindow | null
  ): Promise<IntegrationSource> {
    const oauth = await startOAuthFlow(sourceType, parentWindow)
    const existingSources = await integrationStore.getSourcesForProject(projectId)
    const githubSource = existingSources.find(source => source.sourceType === 'github')

    if (githubSource) {
      await integrationTokenStore.saveToken(githubSource.id, oauth.accessToken)
      const currentConfig = (githubSource.config || {}) as GithubIntegrationConfig
      const nextConfig: GithubIntegrationConfig = {
        ...currentConfig,
        login: oauth.login || currentConfig.login,
      }
      const updated = await integrationStore.updateSource(projectId, githubSource.id, {
        config: nextConfig,
        connectionStatus: 'connected',
        lastError: undefined,
        displayName: githubSource.displayName || oauth.login || 'GitHub',
      })
      if (!updated) {
        throw new Error('Failed to update GitHub source after OAuth')
      }
      return updated
    }

    const created = await integrationStore.addSource(
      projectId,
      'github',
      { repos: [], login: oauth.login },
      oauth.login || 'GitHub'
    )
    await integrationTokenStore.saveToken(created.id, oauth.accessToken)
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
    const removedChunks = await clearSourceFromIndex(projectId, source)
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
      const vectorStore = getVectorStore(projectId, 'library')
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
    const token = await integrationTokenStore.getToken(sourceId)
    if (!token) {
      throw new Error('GitHub source is not connected. Please reconnect.')
    }
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
        const vectorStore = getVectorStore(projectId, 'library')
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
        connectionStatus: source.sourceType === 'github' ? 'connected' : source.connectionStatus,
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
      if (source.sourceType === 'github' && status === 401) {
        await integrationTokenStore.removeToken(source.id)
        await integrationStore.updateSource(projectId, source.id, {
          connectionStatus: 'expired',
          lastError: 'GitHub token expired. Please reconnect.',
        })
      } else {
        await integrationStore.updateSource(projectId, source.id, {
          connectionStatus: source.sourceType === 'github' ? 'error' : source.connectionStatus,
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
