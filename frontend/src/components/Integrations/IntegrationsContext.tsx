import { createContext, useContext, useCallback, useEffect, useMemo, useState, ReactNode } from 'react'
import { integrationApi, IntegrationSource, OAuthConfigStatus, settingsApi } from '../../services/desktop-api'

export type IntegrationTabItem =
  | { id: string; title: string; type: 'source'; source: IntegrationSource }
  | { id: string; title: string; type: 'available'; kind: 'rss' | 'github' }

interface IntegrationsContextValue {
  projectId: string | null
  sources: IntegrationSource[]
  githubRepos: string[]
  indexedGithubRepos: string[]
  selectedGithubRepos: string[]
  setSelectedGithubRepos: React.Dispatch<React.SetStateAction<string[]>>
  isLoading: boolean
  isAdding: boolean
  isSyncingAll: boolean
  isConnectingGithub: boolean
  isSavingGithubRepos: boolean
  isSavingOAuthConfig: boolean
  displayName: string
  setDisplayName: React.Dispatch<React.SetStateAction<string>>
  url: string
  setUrl: React.Dispatch<React.SetStateAction<string>>
  oauthClientId: string
  setOauthClientId: React.Dispatch<React.SetStateAction<string>>
  oauthClientSecret: string
  setOauthClientSecret: React.Dispatch<React.SetStateAction<string>>
  oauthStatus: OAuthConfigStatus | null
  showOAuthConfigForm: boolean
  setShowOAuthConfigForm: React.Dispatch<React.SetStateAction<boolean>>
  error: string | null
  setError: React.Dispatch<React.SetStateAction<string | null>>
  successMessage: string | null
  syncingSourceId: string | null
  getStatusInfo: (s: IntegrationSource) => { label: string; color: string }
  githubSource: IntegrationSource | null
  canAdd: boolean
  loadSources: () => Promise<void>
  handleAddSource: () => Promise<void>
  handleSyncSource: (sourceId: string) => Promise<void>
  handleSyncAll: () => Promise<void>
  handleConnectGithub: () => Promise<void>
  cancelConnectGithub: () => void
  handleSaveOAuthConfig: () => Promise<void>
  handleSaveGithubRepos: () => Promise<void>
  handleRemove: (sourceId: string) => Promise<void>
}

const IntegrationsContext = createContext<IntegrationsContextValue | null>(null)

export function IntegrationsProvider({ projectId, children, onSourceRemoved }: { projectId: string | null; children: ReactNode; onSourceRemoved?: (sourceId: string) => void }) {
  const [sources, setSources] = useState<IntegrationSource[]>([])
  const [githubRepos, setGithubRepos] = useState<string[]>([])
  const [indexedGithubRepos, setIndexedGithubRepos] = useState<string[]>([])
  const [selectedGithubRepos, setSelectedGithubRepos] = useState<string[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isAdding, setIsAdding] = useState(false)
  const [isSyncingAll, setIsSyncingAll] = useState(false)
  const [isConnectingGithub, setIsConnectingGithub] = useState(false)
  const [isSavingGithubRepos, setIsSavingGithubRepos] = useState(false)
  const [isSavingOAuthConfig, setIsSavingOAuthConfig] = useState(false)
  const [displayName, setDisplayName] = useState('')
  const [url, setUrl] = useState('')
  const [oauthClientId, setOauthClientId] = useState('')
  const [oauthClientSecret, setOauthClientSecret] = useState('')
  const [oauthStatus, setOauthStatus] = useState<OAuthConfigStatus | null>(null)
  const [showOAuthConfigForm, setShowOAuthConfigForm] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [syncingSourceId, setSyncingSourceId] = useState<string | null>(null)

  const canAdd = useMemo(() => !!projectId && url.trim().length > 0 && !isAdding, [projectId, url, isAdding])
  const githubSource = useMemo(() => sources.find(s => s.sourceType === 'github') || null, [sources])

  const getStatusInfo = useCallback((source: IntegrationSource) => {
    const s = source.connectionStatus
    if (s === 'connected') return { label: 'Connected', color: '#4caf50' }
    if (s === 'expired' || s === 'error') return { label: s === 'expired' ? 'Expired' : 'Error', color: '#ff9800' }
    return { label: 'Disconnected', color: '#858585' }
  }, [])

  const loadGithubRepos = useCallback(async (sourceId: string) => {
    if (!projectId) return
    try {
      const [repos, indexed] = await Promise.all([
        integrationApi.listGithubRepos(projectId, sourceId),
        integrationApi.getIndexedGithubRepos(projectId, sourceId),
      ])
      setGithubRepos(repos)
      setIndexedGithubRepos(indexed)
    } catch {
      setGithubRepos([])
      setIndexedGithubRepos([])
    }
  }, [projectId])

  const loadOAuthStatus = useCallback(async () => {
    try {
      const status = await integrationApi.getOAuthConfigStatus('github')
      setOauthStatus(status)
      if (status.configured) setShowOAuthConfigForm(false)
    } catch {
      setOauthStatus({ sourceType: 'github', configured: false, configSource: 'missing' })
    }
  }, [])

  const loadSources = useCallback(async () => {
    if (!projectId) {
      setSources([])
      setGithubRepos([])
      setSelectedGithubRepos([])
      return
    }
    setIsLoading(true)
    setError(null)
    try {
      const data = await integrationApi.getSources(projectId)
      setSources(data)
      await loadOAuthStatus()
      const github = data.find(s => s.sourceType === 'github')
      const repos = Array.isArray((github?.config as { repos?: unknown })?.repos)
        ? ((github?.config as { repos?: unknown }).repos as unknown[]).filter((r): r is string => typeof r === 'string').map(r => r.trim())
        : []
      setSelectedGithubRepos(repos)
      if (github?.connectionStatus === 'connected') await loadGithubRepos(github.id)
      else {
        setGithubRepos([])
        setIndexedGithubRepos([])
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to load')
    } finally {
      setIsLoading(false)
    }
  }, [projectId, loadGithubRepos, loadOAuthStatus])

  useEffect(() => {
    loadSources().catch(() => {})
  }, [loadSources])

  const getKeys = useCallback(async () => {
    const keys = await settingsApi.getApiKeys()
    return { geminiApiKey: keys.geminiApiKey || undefined, openaiApiKey: keys.openaiApiKey || undefined }
  }, [])

  const handleAddSource = useCallback(async () => {
    if (!projectId || !url.trim() || isAdding) return
    setIsAdding(true)
    setError(null)
    try {
      await integrationApi.addSource(projectId, 'rss', { url: url.trim() }, displayName.trim() || undefined)
      setDisplayName('')
      setUrl('')
      await loadSources()
    } catch (err: any) {
      setError(err?.message || 'Failed to add')
    } finally {
      setIsAdding(false)
    }
  }, [projectId, url, displayName, isAdding, loadSources])

  const handleSyncSource = useCallback(async (sourceId: string) => {
    if (!projectId) return
    setSyncingSourceId(sourceId)
    setError(null)
    setSuccessMessage(null)
    try {
      const keys = await getKeys()
      const result = await integrationApi.syncSource(projectId, sourceId, keys.geminiApiKey, keys.openaiApiKey)
      await loadSources()
      const count = (result as { itemCount?: number })?.itemCount ?? 0
      setSuccessMessage(`Sync complete. ${count > 0 ? `${count} items indexed.` : 'Index updated.'}`)
      setTimeout(() => setSuccessMessage(null), 4000)
    } catch (err: any) {
      setError(err?.message || 'Sync failed')
      await loadSources()
    } finally {
      setSyncingSourceId(null)
    }
  }, [projectId, getKeys, loadSources])

  const handleSyncAll = useCallback(async () => {
    if (!projectId || sources.length === 0) return
    setIsSyncingAll(true)
    setError(null)
    setSuccessMessage(null)
    try {
      const keys = await getKeys()
      const results = await integrationApi.syncAll(projectId, keys.geminiApiKey, keys.openaiApiKey)
      await loadSources()
      const total = Array.isArray(results) ? results.reduce((s, r) => s + ((r as { itemCount?: number })?.itemCount ?? 0), 0) : 0
      setSuccessMessage(`Sync complete. ${total > 0 ? `${total} items indexed.` : 'All sources synced.'}`)
      setTimeout(() => setSuccessMessage(null), 4000)
    } catch (err: any) {
      setError(err?.message || 'Sync failed')
      await loadSources()
    } finally {
      setIsSyncingAll(false)
    }
  }, [projectId, sources.length, getKeys, loadSources])

  const handleConnectGithub = useCallback(async () => {
    if (!projectId) return
    if (!oauthStatus?.configured) {
      const cid = oauthClientId.trim()
      const csec = oauthClientSecret.trim()
      if (!cid || !csec) {
        setError('Client ID and Secret required')
        return
      }
      setIsConnectingGithub(true)
      setError(null)
      try {
        await integrationApi.saveOAuthConfig('github', { clientId: cid, clientSecret: csec })
        await loadOAuthStatus()
        await integrationApi.startOAuth(projectId, 'github')
        await loadSources()
        setSuccessMessage('GitHub connected. Select repos and click Save and Index.')
        setTimeout(() => setSuccessMessage(null), 5000)
      } catch (err: any) {
        const msg = err?.message || 'Connect failed'
        setError(msg)
      } finally {
        setIsConnectingGithub(false)
      }
      return
    }
    setIsConnectingGithub(true)
    setError(null)
    try {
      await integrationApi.startOAuth(projectId, 'github')
      await loadSources()
      setSuccessMessage('GitHub connected. Select repos and Save scope, then Sync to index.')
      setTimeout(() => setSuccessMessage(null), 5000)
    } catch (err: any) {
      const msg = err?.message || 'Connect failed'
      setError(msg)
    } finally {
      setIsConnectingGithub(false)
    }
  }, [projectId, oauthStatus?.configured, oauthClientId, oauthClientSecret, loadOAuthStatus, loadSources])

  const cancelConnectGithub = useCallback(() => {
    setIsConnectingGithub(false)
  }, [])

  const handleSaveOAuthConfig = useCallback(async () => {
    const cid = oauthClientId.trim()
    const csec = oauthClientSecret.trim()
    if (!cid || !csec) {
      setError('Client ID and Secret required')
      return
    }
    setIsSavingOAuthConfig(true)
    setError(null)
    try {
      await integrationApi.saveOAuthConfig('github', { clientId: cid, clientSecret: csec })
      await loadOAuthStatus()
      setOauthClientSecret('')
      setShowOAuthConfigForm(false)
    } catch (err: any) {
      setError(err?.message || 'Save failed')
    } finally {
      setIsSavingOAuthConfig(false)
    }
  }, [oauthClientId, oauthClientSecret, loadOAuthStatus])

  const handleSaveGithubRepos = useCallback(async () => {
    if (!projectId || !githubSource) return
    setIsSavingGithubRepos(true)
    setSyncingSourceId(githubSource.id)
    setError(null)
    setSuccessMessage(null)
    try {
      await integrationApi.updateGithubRepos(projectId, githubSource.id, selectedGithubRepos)
      await loadSources()
      const keys = await getKeys()
      const result = await integrationApi.syncSource(projectId, githubSource.id, keys.geminiApiKey, keys.openaiApiKey)
      await loadSources()
      const count = (result as { itemCount?: number })?.itemCount ?? 0
      setSuccessMessage(count > 0 ? `${count} items indexed.` : 'Scope saved and index updated.')
      setTimeout(() => setSuccessMessage(null), 4000)
    } catch (err: any) {
      setError(err?.message || 'Save failed')
      await loadSources()
    } finally {
      setIsSavingGithubRepos(false)
      setSyncingSourceId(null)
    }
  }, [projectId, githubSource, selectedGithubRepos, loadSources, getKeys])

  const handleRemove = useCallback(async (sourceId: string) => {
    if (!projectId) return
    setError(null)
    try {
      await integrationApi.removeSource(projectId, sourceId)
      onSourceRemoved?.(sourceId)
      await loadSources()
    } catch (err: any) {
      setError(err?.message || 'Disconnect failed')
    }
  }, [projectId, loadSources, onSourceRemoved])

  const value = useMemo(() => ({
    projectId,
    sources,
    githubRepos,
    indexedGithubRepos,
    selectedGithubRepos,
    setSelectedGithubRepos,
    isLoading,
    isAdding,
    isSyncingAll,
    isConnectingGithub,
    isSavingGithubRepos,
    isSavingOAuthConfig,
    displayName,
    setDisplayName,
    url,
    setUrl,
    oauthClientId,
    setOauthClientId,
    oauthClientSecret,
    setOauthClientSecret,
    oauthStatus,
    showOAuthConfigForm,
    setShowOAuthConfigForm,
    error,
    setError,
    successMessage,
    syncingSourceId,
    getStatusInfo,
    githubSource,
    canAdd,
    loadSources,
    handleAddSource,
    handleSyncSource,
    handleSyncAll,
    handleConnectGithub,
    cancelConnectGithub,
    handleSaveOAuthConfig,
    handleSaveGithubRepos,
    handleRemove,
  }), [
    projectId, sources, githubRepos, indexedGithubRepos, selectedGithubRepos, isLoading, isAdding, isSyncingAll,
    isConnectingGithub, isSavingGithubRepos, isSavingOAuthConfig, displayName, url, oauthClientId,
    oauthClientSecret, oauthStatus, showOAuthConfigForm, error, successMessage, syncingSourceId, getStatusInfo,
    githubSource, canAdd, loadSources, handleAddSource, handleSyncSource, handleSyncAll,
    handleConnectGithub, cancelConnectGithub, handleSaveOAuthConfig, handleSaveGithubRepos, handleRemove,
  ])

  return <IntegrationsContext.Provider value={value}>{children}</IntegrationsContext.Provider>
}

export function useIntegrations() {
  const ctx = useContext(IntegrationsContext)
  if (!ctx) throw new Error('useIntegrations must be used within IntegrationsProvider')
  return ctx
}
