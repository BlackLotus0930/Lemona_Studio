import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { settingsApi, type AiProviderProfile, type AiProviderState } from '../../services/desktop-api'

interface AiSettingsContextValue {
  state: AiProviderState | null
  loading: boolean
  error: string | null
  refresh: () => Promise<void>
  saveProfile: (profile: Omit<AiProviderProfile, 'createdAt' | 'updatedAt'>) => Promise<AiProviderProfile>
  removeProfile: (profileId: string) => Promise<void>
  setActiveProviders: (active: { chatProviderId?: string; embeddingProviderId?: string }) => Promise<void>
}

const AiSettingsContext = createContext<AiSettingsContextValue | null>(null)

export function AiSettingsProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AiProviderState | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const next = await settingsApi.getAiProviderState()
      setState(next)
    } catch (err: any) {
      setError(err?.message || 'Failed to load AI settings')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refresh().catch(() => {})
  }, [refresh])

  const saveProfile = useCallback(async (profile: Omit<AiProviderProfile, 'createdAt' | 'updatedAt'>) => {
    const saved = await settingsApi.saveAiProviderProfile(profile)
    await refresh()
    return saved
  }, [refresh])

  const removeProfile = useCallback(async (profileId: string) => {
    await settingsApi.removeAiProviderProfile(profileId)
    await refresh()
  }, [refresh])

  const setActiveProviders = useCallback(async (active: { chatProviderId?: string; embeddingProviderId?: string }) => {
    await settingsApi.setActiveAiProviders(active)
    await refresh()
  }, [refresh])

  const value = useMemo<AiSettingsContextValue>(() => ({
    state,
    loading,
    error,
    refresh,
    saveProfile,
    removeProfile,
    setActiveProviders,
  }), [state, loading, error, refresh, saveProfile, removeProfile, setActiveProviders])

  return <AiSettingsContext.Provider value={value}>{children}</AiSettingsContext.Provider>
}

export function useAiSettings() {
  const ctx = useContext(AiSettingsContext)
  if (!ctx) {
    throw new Error('useAiSettings must be used within AiSettingsProvider')
  }
  return ctx
}

