import { app, safeStorage } from 'electron'
import fs from 'fs/promises'
import path from 'path'

interface StoredOAuthConfig {
  github?: string
  gitlab?: string
  slack?: string
  notion?: string
  quickbooks?: string
}

export interface GithubOAuthConfig {
  clientId: string
  clientSecret: string
}

export interface GitlabOAuthConfig {
  clientId: string
  clientSecret: string
}

export interface SlackOAuthConfig {
  clientId: string
  clientSecret: string
}

export interface NotionOAuthConfig {
  clientId: string
  clientSecret: string
}

export interface QuickBooksOAuthConfig {
  clientId: string
  clientSecret: string
}

const OAUTH_CONFIG_FILE = path.join(app.getPath('userData'), 'oauthConfig.json')

async function ensureStoreFile(): Promise<void> {
  try {
    await fs.access(OAUTH_CONFIG_FILE)
  } catch {
    const initial: StoredOAuthConfig = {}
    await fs.writeFile(OAUTH_CONFIG_FILE, JSON.stringify(initial, null, 2), 'utf-8')
  }
}

function encrypt(value: string): string {
  if (safeStorage.isEncryptionAvailable()) {
    return safeStorage.encryptString(value).toString('base64')
  }
  return Buffer.from(value, 'utf-8').toString('base64')
}

function decrypt(value: string): string {
  const raw = Buffer.from(value, 'base64')
  if (safeStorage.isEncryptionAvailable()) {
    return safeStorage.decryptString(raw)
  }
  return raw.toString('utf-8')
}

async function loadStore(): Promise<StoredOAuthConfig> {
  await ensureStoreFile()
  try {
    const content = await fs.readFile(OAUTH_CONFIG_FILE, 'utf-8')
    const parsed = JSON.parse(content) as StoredOAuthConfig
    return parsed || {}
  } catch (error) {
    console.error('[OAuthConfigStore] Failed to load store:', error)
    return {}
  }
}

async function saveStore(data: StoredOAuthConfig): Promise<void> {
  await fs.writeFile(OAUTH_CONFIG_FILE, JSON.stringify(data, null, 2), 'utf-8')
}

export const oauthConfigStore = {
  async saveGithubConfig(clientId: string, clientSecret: string): Promise<void> {
    const trimmedClientId = clientId.trim()
    const trimmedClientSecret = clientSecret.trim()
    if (!trimmedClientId || !trimmedClientSecret) {
      throw new Error('GitHub client id and secret are required')
    }
    const store = await loadStore()
    store.github = encrypt(
      JSON.stringify({
        clientId: trimmedClientId,
        clientSecret: trimmedClientSecret,
      })
    )
    await saveStore(store)
  },

  async getGithubConfig(): Promise<GithubOAuthConfig | null> {
    const store = await loadStore()
    if (!store.github) {
      return null
    }
    try {
      const payload = JSON.parse(decrypt(store.github)) as Partial<GithubOAuthConfig>
      const clientId = typeof payload.clientId === 'string' ? payload.clientId.trim() : ''
      const clientSecret = typeof payload.clientSecret === 'string' ? payload.clientSecret.trim() : ''
      if (!clientId || !clientSecret) {
        return null
      }
      return { clientId, clientSecret }
    } catch (error) {
      console.error('[OAuthConfigStore] Failed to parse github config:', error)
      return null
    }
  },

  async saveGitlabConfig(clientId: string, clientSecret: string): Promise<void> {
    const trimmedClientId = clientId.trim()
    const trimmedClientSecret = clientSecret.trim()
    if (!trimmedClientId || !trimmedClientSecret) {
      throw new Error('GitLab client id and secret are required')
    }
    const store = await loadStore()
    store.gitlab = encrypt(
      JSON.stringify({
        clientId: trimmedClientId,
        clientSecret: trimmedClientSecret,
      })
    )
    await saveStore(store)
  },

  async getGitlabConfig(): Promise<GitlabOAuthConfig | null> {
    const store = await loadStore()
    if (!store.gitlab) {
      return null
    }
    try {
      const payload = JSON.parse(decrypt(store.gitlab)) as Partial<GitlabOAuthConfig>
      const clientId = typeof payload.clientId === 'string' ? payload.clientId.trim() : ''
      const clientSecret = typeof payload.clientSecret === 'string' ? payload.clientSecret.trim() : ''
      if (!clientId || !clientSecret) {
        return null
      }
      return { clientId, clientSecret }
    } catch (error) {
      console.error('[OAuthConfigStore] Failed to parse gitlab config:', error)
      return null
    }
  },

  async saveSlackConfig(clientId: string, clientSecret: string): Promise<void> {
    const trimmedClientId = clientId.trim()
    const trimmedClientSecret = clientSecret.trim()
    if (!trimmedClientId || !trimmedClientSecret) {
      throw new Error('Slack client id and secret are required')
    }
    const store = await loadStore()
    store.slack = encrypt(
      JSON.stringify({
        clientId: trimmedClientId,
        clientSecret: trimmedClientSecret,
      })
    )
    await saveStore(store)
  },

  async getSlackConfig(): Promise<SlackOAuthConfig | null> {
    const store = await loadStore()
    if (!store.slack) {
      return null
    }
    try {
      const payload = JSON.parse(decrypt(store.slack)) as Partial<SlackOAuthConfig>
      const clientId = typeof payload.clientId === 'string' ? payload.clientId.trim() : ''
      const clientSecret = typeof payload.clientSecret === 'string' ? payload.clientSecret.trim() : ''
      if (!clientId || !clientSecret) {
        return null
      }
      return { clientId, clientSecret }
    } catch (error) {
      console.error('[OAuthConfigStore] Failed to parse slack config:', error)
      return null
    }
  },

  async saveNotionConfig(clientId: string, clientSecret: string): Promise<void> {
    const trimmedClientId = clientId.trim()
    const trimmedClientSecret = clientSecret.trim()
    if (!trimmedClientId || !trimmedClientSecret) {
      throw new Error('Notion client id and secret are required')
    }
    const store = await loadStore()
    store.notion = encrypt(
      JSON.stringify({
        clientId: trimmedClientId,
        clientSecret: trimmedClientSecret,
      })
    )
    await saveStore(store)
  },

  async getNotionConfig(): Promise<NotionOAuthConfig | null> {
    const store = await loadStore()
    if (!store.notion) {
      return null
    }
    try {
      const payload = JSON.parse(decrypt(store.notion)) as Partial<NotionOAuthConfig>
      const clientId = typeof payload.clientId === 'string' ? payload.clientId.trim() : ''
      const clientSecret = typeof payload.clientSecret === 'string' ? payload.clientSecret.trim() : ''
      if (!clientId || !clientSecret) {
        return null
      }
      return { clientId, clientSecret }
    } catch (error) {
      console.error('[OAuthConfigStore] Failed to parse notion config:', error)
      return null
    }
  },

  async saveQuickBooksConfig(clientId: string, clientSecret: string): Promise<void> {
    const trimmedClientId = clientId.trim()
    const trimmedClientSecret = clientSecret.trim()
    if (!trimmedClientId || !trimmedClientSecret) {
      throw new Error('QuickBooks client id and secret are required')
    }
    const store = await loadStore()
    store.quickbooks = encrypt(
      JSON.stringify({
        clientId: trimmedClientId,
        clientSecret: trimmedClientSecret,
      })
    )
    await saveStore(store)
  },

  async getQuickBooksConfig(): Promise<QuickBooksOAuthConfig | null> {
    const store = await loadStore()
    if (!store.quickbooks) {
      return null
    }
    try {
      const payload = JSON.parse(decrypt(store.quickbooks)) as Partial<QuickBooksOAuthConfig>
      const clientId = typeof payload.clientId === 'string' ? payload.clientId.trim() : ''
      const clientSecret = typeof payload.clientSecret === 'string' ? payload.clientSecret.trim() : ''
      if (!clientId || !clientSecret) {
        return null
      }
      return { clientId, clientSecret }
    } catch (error) {
      console.error('[OAuthConfigStore] Failed to parse quickbooks config:', error)
      return null
    }
  },
}
