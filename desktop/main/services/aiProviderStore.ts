import { app } from 'electron'
import fs from 'fs/promises'
import path from 'path'

export type AiProviderType = 'builtin-gemini' | 'builtin-openai' | 'custom-openai'

export interface AiProviderProfile {
  id: string
  name: string
  type: AiProviderType
  baseUrl?: string
  apiKey?: string
  chatModel?: string
  embeddingModel?: string
  embeddingDimension?: number
  enabled?: boolean
  createdAt: string
  updatedAt: string
}

export interface AiProviderState {
  profiles: AiProviderProfile[]
  activeChatProviderId: string
  activeEmbeddingProviderId: string
  updatedAt: string
}

export interface ResolvedEmbeddingConfig {
  providerId: string
  providerType: AiProviderType
  model: string
  dimension: number
  baseUrl?: string
  apiKey?: string
}

const STORE_FILE = path.join(app.getPath('userData'), 'ai-providers.json')
const DEFAULT_DIMENSION = 1536

function nowIso(): string {
  return new Date().toISOString()
}

function defaultProfiles(): AiProviderProfile[] {
  const now = nowIso()
  return [
    {
      id: 'builtin-gemini',
      name: 'Gemini (Built-in)',
      type: 'builtin-gemini',
      chatModel: 'gemini-3-flash-preview',
      embeddingModel: 'gemini-embedding-001',
      embeddingDimension: DEFAULT_DIMENSION,
      enabled: true,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'builtin-openai',
      name: 'OpenAI (Built-in)',
      type: 'builtin-openai',
      chatModel: 'gpt-4.1-nano',
      embeddingModel: 'text-embedding-3-small',
      embeddingDimension: DEFAULT_DIMENSION,
      enabled: true,
      createdAt: now,
      updatedAt: now,
    },
  ]
}

function defaultState(): AiProviderState {
  return {
    profiles: defaultProfiles(),
    activeChatProviderId: 'builtin-gemini',
    activeEmbeddingProviderId: 'builtin-gemini',
    updatedAt: nowIso(),
  }
}

function normalizeState(input: Partial<AiProviderState> | null | undefined): AiProviderState {
  const base = defaultState()
  if (!input) return base

  const profileMap = new Map<string, AiProviderProfile>()
  for (const p of base.profiles) profileMap.set(p.id, p)

  if (Array.isArray(input.profiles)) {
    for (const raw of input.profiles) {
      if (!raw || typeof raw.id !== 'string' || typeof raw.type !== 'string') continue
      const prev = profileMap.get(raw.id)
      profileMap.set(raw.id, {
        ...(prev || {
          id: raw.id,
          name: raw.name || raw.id,
          type: raw.type as AiProviderType,
          createdAt: raw.createdAt || nowIso(),
          updatedAt: raw.updatedAt || nowIso(),
        }),
        ...raw,
        createdAt: raw.createdAt || prev?.createdAt || nowIso(),
        updatedAt: raw.updatedAt || nowIso(),
      })
    }
  }

  const profiles = Array.from(profileMap.values())
  const ids = new Set(profiles.map(p => p.id))

  const activeChatProviderId =
    typeof input.activeChatProviderId === 'string' && ids.has(input.activeChatProviderId)
      ? input.activeChatProviderId
      : base.activeChatProviderId
  const activeEmbeddingProviderId =
    typeof input.activeEmbeddingProviderId === 'string' && ids.has(input.activeEmbeddingProviderId)
      ? input.activeEmbeddingProviderId
      : base.activeEmbeddingProviderId

  return {
    profiles,
    activeChatProviderId,
    activeEmbeddingProviderId,
    updatedAt: input.updatedAt || nowIso(),
  }
}

async function ensureStoreFile(): Promise<void> {
  try {
    await fs.access(STORE_FILE)
  } catch {
    await fs.writeFile(STORE_FILE, JSON.stringify(defaultState(), null, 2), 'utf-8')
  }
}

async function loadStore(): Promise<AiProviderState> {
  await ensureStoreFile()
  try {
    const content = await fs.readFile(STORE_FILE, 'utf-8')
    return normalizeState(JSON.parse(content) as Partial<AiProviderState>)
  } catch {
    return defaultState()
  }
}

async function saveStore(state: AiProviderState): Promise<void> {
  await fs.writeFile(STORE_FILE, JSON.stringify(state, null, 2), 'utf-8')
}

export function buildEmbeddingIndexKey(config: ResolvedEmbeddingConfig): string {
  const modelSafe = (config.model || 'unknown').replace(/[^a-zA-Z0-9._-]/g, '_')
  return `${config.providerId}:${modelSafe}:${config.dimension}`
}

function hasKey(value?: string): boolean {
  return !!(value && value.trim().length > 0)
}

export const aiProviderStore = {
  async getState(): Promise<AiProviderState> {
    return loadStore()
  },

  async saveProfile(profile: Omit<AiProviderProfile, 'createdAt' | 'updatedAt'>): Promise<AiProviderProfile> {
    const state = await loadStore()
    const now = nowIso()
    const idx = state.profiles.findIndex(p => p.id === profile.id)
    const next: AiProviderProfile = {
      ...(idx >= 0 ? state.profiles[idx] : { createdAt: now }),
      ...profile,
      createdAt: idx >= 0 ? state.profiles[idx].createdAt : now,
      updatedAt: now,
    }
    if (idx >= 0) {
      state.profiles[idx] = next
    } else {
      state.profiles.push(next)
    }
    state.updatedAt = now
    await saveStore(state)
    return next
  },

  async removeProfile(id: string): Promise<boolean> {
    if (id === 'builtin-gemini' || id === 'builtin-openai') return false
    const state = await loadStore()
    const before = state.profiles.length
    state.profiles = state.profiles.filter(p => p.id !== id)
    if (state.profiles.length === before) return false

    if (!state.profiles.some(p => p.id === state.activeChatProviderId)) {
      state.activeChatProviderId = 'builtin-gemini'
    }
    if (!state.profiles.some(p => p.id === state.activeEmbeddingProviderId)) {
      state.activeEmbeddingProviderId = 'builtin-gemini'
    }
    state.updatedAt = nowIso()
    await saveStore(state)
    return true
  },

  async setActiveProviders(next: { chatProviderId?: string; embeddingProviderId?: string }): Promise<AiProviderState> {
    const state = await loadStore()
    const ids = new Set(state.profiles.map(p => p.id))
    if (next.chatProviderId && ids.has(next.chatProviderId)) {
      state.activeChatProviderId = next.chatProviderId
    }
    if (next.embeddingProviderId && ids.has(next.embeddingProviderId)) {
      state.activeEmbeddingProviderId = next.embeddingProviderId
    }
    state.updatedAt = nowIso()
    await saveStore(state)
    return state
  },

  async bootstrapFromLegacyKeys(geminiApiKey?: string, openaiApiKey?: string): Promise<AiProviderState> {
    const state = await loadStore()
    const now = nowIso()
    const gemini = state.profiles.find(p => p.id === 'builtin-gemini')
    const openai = state.profiles.find(p => p.id === 'builtin-openai')
    if (gemini && typeof geminiApiKey === 'string') {
      gemini.apiKey = geminiApiKey || undefined
      gemini.updatedAt = now
    }
    if (openai && typeof openaiApiKey === 'string') {
      openai.apiKey = openaiApiKey || undefined
      openai.updatedAt = now
    }
    state.updatedAt = now
    await saveStore(state)
    return state
  },

  async getActiveChatProfile(): Promise<AiProviderProfile | null> {
    const state = await loadStore()
    return state.profiles.find(p => p.id === state.activeChatProviderId) || null
  },

  async getActiveEmbeddingConfig(geminiApiKey?: string, openaiApiKey?: string): Promise<ResolvedEmbeddingConfig> {
    const state = await loadStore()
    const geminiProfile = state.profiles.find(p => p.id === 'builtin-gemini')
    const openaiProfile = state.profiles.find(p => p.id === 'builtin-openai')
    const activeProfile = state.profiles.find(p => p.id === state.activeEmbeddingProviderId) || state.profiles[0]

    const geminiResolvedKey = geminiProfile?.apiKey || geminiApiKey
    const openaiResolvedKey = openaiProfile?.apiKey || openaiApiKey

    const resolveConfigFromProfile = (profile: AiProviderProfile | undefined): ResolvedEmbeddingConfig | null => {
      if (!profile) return null
      const model =
        profile.embeddingModel ||
        (profile.type === 'builtin-openai' ? 'text-embedding-3-small' : 'gemini-embedding-001')
      const apiKey =
        profile.apiKey ||
        (profile.type === 'builtin-openai' || profile.type === 'custom-openai' ? openaiResolvedKey : geminiResolvedKey)

      return {
        providerId: profile.id,
        providerType: profile.type,
        model,
        dimension: profile.embeddingDimension || DEFAULT_DIMENSION,
        baseUrl: profile.baseUrl,
        apiKey: apiKey || undefined,
      }
    }

    const activeConfig = resolveConfigFromProfile(activeProfile)
    if (activeConfig && hasKey(activeConfig.apiKey)) {
      return activeConfig
    }

    // Auto-fallback for normal users: if active provider has no usable key, follow whichever key exists.
    if (hasKey(geminiResolvedKey)) {
      const fallbackGemini = resolveConfigFromProfile(geminiProfile)
      if (fallbackGemini) return fallbackGemini
    }
    if (hasKey(openaiResolvedKey)) {
      const fallbackOpenai = resolveConfigFromProfile(openaiProfile)
      if (fallbackOpenai) return fallbackOpenai
    }

    // Last resort: keep previous default behavior.
    if (activeConfig) return activeConfig
    return {
      providerId: 'builtin-gemini',
      providerType: 'builtin-gemini',
      model: 'gemini-embedding-001',
      dimension: DEFAULT_DIMENSION,
      apiKey: geminiResolvedKey || undefined,
    }
  },
}

