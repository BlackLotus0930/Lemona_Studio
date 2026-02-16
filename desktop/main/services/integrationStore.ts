import { app } from 'electron'
import fs from 'fs/promises'
import path from 'path'
import crypto from 'crypto'
import {
  GithubIntegrationConfig,
  IntegrationSource,
  IntegrationSourceConfig,
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
