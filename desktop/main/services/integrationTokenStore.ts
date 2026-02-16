import { app, safeStorage } from 'electron'
import fs from 'fs/promises'
import path from 'path'

interface TokenEntry {
  sourceId: string
  token: string
  createdAt: string
}

interface TokenStoreData {
  tokens: Record<string, string>
}

const TOKEN_STORE_FILE = path.join(app.getPath('userData'), 'integrationTokens.json')

async function ensureStoreFile(): Promise<void> {
  try {
    await fs.access(TOKEN_STORE_FILE)
  } catch {
    const initial: TokenStoreData = { tokens: {} }
    await fs.writeFile(TOKEN_STORE_FILE, JSON.stringify(initial, null, 2), 'utf-8')
  }
}

function encrypt(value: string): string {
  if (safeStorage.isEncryptionAvailable()) {
    return safeStorage.encryptString(value).toString('base64')
  }
  return Buffer.from(value, 'utf-8').toString('base64')
}

function decrypt(value: string): string {
  const buffer = Buffer.from(value, 'base64')
  if (safeStorage.isEncryptionAvailable()) {
    return safeStorage.decryptString(buffer)
  }
  return buffer.toString('utf-8')
}

async function loadStore(): Promise<TokenStoreData> {
  await ensureStoreFile()
  try {
    const content = await fs.readFile(TOKEN_STORE_FILE, 'utf-8')
    const parsed = JSON.parse(content) as Partial<TokenStoreData>
    if (!parsed || typeof parsed.tokens !== 'object' || parsed.tokens == null) {
      return { tokens: {} }
    }
    return { tokens: parsed.tokens }
  } catch (error) {
    console.error('[IntegrationTokenStore] Failed to load store:', error)
    return { tokens: {} }
  }
}

async function saveStore(data: TokenStoreData): Promise<void> {
  await fs.writeFile(TOKEN_STORE_FILE, JSON.stringify(data, null, 2), 'utf-8')
}

export const integrationTokenStore = {
  async saveToken(sourceId: string, token: string): Promise<void> {
    if (!sourceId || !token) {
      throw new Error('sourceId and token are required')
    }
    const store = await loadStore()
    const payload: TokenEntry = {
      sourceId,
      token,
      createdAt: new Date().toISOString(),
    }
    store.tokens[sourceId] = encrypt(JSON.stringify(payload))
    await saveStore(store)
  },

  async getToken(sourceId: string): Promise<string | null> {
    if (!sourceId) {
      return null
    }
    const store = await loadStore()
    const raw = store.tokens[sourceId]
    if (!raw) {
      return null
    }
    try {
      const decrypted = decrypt(raw)
      const parsed = JSON.parse(decrypted) as TokenEntry
      return parsed.token || null
    } catch (error) {
      console.error('[IntegrationTokenStore] Failed to decrypt token:', error)
      return null
    }
  },

  async removeToken(sourceId: string): Promise<void> {
    const store = await loadStore()
    if (!store.tokens[sourceId]) {
      return
    }
    delete store.tokens[sourceId]
    await saveStore(store)
  },
}
