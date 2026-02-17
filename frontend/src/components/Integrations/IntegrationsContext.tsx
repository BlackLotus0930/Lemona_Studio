import { createContext, useContext, useCallback, useEffect, useMemo, useState, ReactNode } from 'react'
import { integrationApi, IntegrationSource, OAuthConfigStatus, settingsApi } from '../../services/desktop-api'
import type { AvailableIntegrationKind } from './availableIntegrations'

export type IntegrationTabItem =
  | { id: string; title: string; type: 'source'; source: IntegrationSource }
  | { id: string; title: string; type: 'available'; kind: AvailableIntegrationKind }

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
  linearApiKey: string
  setLinearApiKey: React.Dispatch<React.SetStateAction<string>>
  stripeApiKey: string
  setStripeApiKey: React.Dispatch<React.SetStateAction<string>>
  sentryApiKey: string
  setSentryApiKey: React.Dispatch<React.SetStateAction<string>>
  sentryOrganization: string
  setSentryOrganization: React.Dispatch<React.SetStateAction<string>>
  posthogApiKey: string
  setPosthogApiKey: React.Dispatch<React.SetStateAction<string>>
  posthogHost: string
  setPosthogHost: React.Dispatch<React.SetStateAction<string>>
  posthogProjectId: string
  setPosthogProjectId: React.Dispatch<React.SetStateAction<string>>
  metabaseApiKey: string
  setMetabaseApiKey: React.Dispatch<React.SetStateAction<string>>
  metabaseUrl: string
  setMetabaseUrl: React.Dispatch<React.SetStateAction<string>>
  hubspotApiKey: string
  setHubspotApiKey: React.Dispatch<React.SetStateAction<string>>
  dbSchemaBasePath: string
  setDbSchemaBasePath: React.Dispatch<React.SetStateAction<string>>
  isSelectingDbSchemaFolder: boolean
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
  gitlabSource: IntegrationSource | null
  gitlabRepos: string[]
  indexedGitlabRepos: string[]
  selectedGitlabRepos: string[]
  setSelectedGitlabRepos: React.Dispatch<React.SetStateAction<string[]>>
  gitlabOauthStatus: OAuthConfigStatus | null
  isConnectingGitlab: boolean
  isSavingGitlabRepos: boolean
  slackSource: IntegrationSource | null
  slackChannels: { id: string; name: string; isPrivate: boolean }[]
  indexedSlackChannels: string[]
  selectedSlackChannels: string[]
  setSelectedSlackChannels: React.Dispatch<React.SetStateAction<string[]>>
  slackOauthStatus: OAuthConfigStatus | null
  isConnectingSlack: boolean
  isSavingSlackChannels: boolean
  handleConnectSlack: () => Promise<void>
  cancelConnectSlack: () => void
  handleSaveSlackChannels: () => Promise<void>
  notionSource: IntegrationSource | null
  notionPages: { id: string; title: string; url?: string }[]
  indexedNotionPages: string[]
  selectedNotionPages: string[]
  setSelectedNotionPages: React.Dispatch<React.SetStateAction<string[]>>
  notionOauthStatus: OAuthConfigStatus | null
  isConnectingNotion: boolean
  isSavingNotionPages: boolean
  handleConnectNotion: () => Promise<void>
  cancelConnectNotion: () => void
  handleSaveNotionPages: () => Promise<void>
  quickbooksSource: IntegrationSource | null
  quickbooksOauthStatus: OAuthConfigStatus | null
  isConnectingQuickbooks: boolean
  handleConnectQuickbooks: () => Promise<void>
  cancelConnectQuickbooks: () => void
  canAdd: boolean
  canAddLinear: boolean
  canAddStripe: boolean
  canAddSentry: boolean
  canAddPosthog: boolean
  canAddMetabase: boolean
  canAddHubspot: boolean
  canAddDbSchema: boolean
  loadSources: () => Promise<void>
  handleAddSource: () => Promise<void>
  handleAddLinearSource: () => Promise<void>
  handleAddStripeSource: () => Promise<void>
  handleAddSentrySource: () => Promise<void>
  handleAddPosthogSource: () => Promise<void>
  handleAddMetabaseSource: () => Promise<void>
  handleAddHubspotSource: () => Promise<void>
  handleAddDbSchemaSource: () => Promise<void>
  handleBrowseDbSchemaFolder: () => Promise<void>
  handleSyncSource: (sourceId: string) => Promise<void>
  handleSyncAll: () => Promise<void>
  handleConnectGithub: () => Promise<void>
  cancelConnectGithub: () => void
  handleConnectGitlab: () => Promise<void>
  cancelConnectGitlab: () => void
  handleSaveOAuthConfig: (sourceType: 'github' | 'gitlab' | 'slack' | 'notion' | 'quickbooks') => Promise<void>
  handleSaveGithubRepos: () => Promise<void>
  handleSaveGitlabRepos: () => Promise<void>
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
  const [linearApiKey, setLinearApiKey] = useState('')
  const [stripeApiKey, setStripeApiKey] = useState('')
  const [sentryApiKey, setSentryApiKey] = useState('')
  const [sentryOrganization, setSentryOrganization] = useState('')
  const [posthogApiKey, setPosthogApiKey] = useState('')
  const [posthogHost, setPosthogHost] = useState('')
  const [posthogProjectId, setPosthogProjectId] = useState('')
  const [metabaseApiKey, setMetabaseApiKey] = useState('')
  const [metabaseUrl, setMetabaseUrl] = useState('')
  const [hubspotApiKey, setHubspotApiKey] = useState('')
  const [dbSchemaBasePath, setDbSchemaBasePath] = useState('')
  const [isSelectingDbSchemaFolder, setIsSelectingDbSchemaFolder] = useState(false)
  const [oauthClientId, setOauthClientId] = useState('')
  const [oauthClientSecret, setOauthClientSecret] = useState('')
  const [oauthStatus, setOauthStatus] = useState<OAuthConfigStatus | null>(null)
  const [gitlabOauthStatus, setGitlabOauthStatus] = useState<OAuthConfigStatus | null>(null)
  const [gitlabRepos, setGitlabRepos] = useState<string[]>([])
  const [indexedGitlabRepos, setIndexedGitlabRepos] = useState<string[]>([])
  const [selectedGitlabRepos, setSelectedGitlabRepos] = useState<string[]>([])
  const [isConnectingGitlab, setIsConnectingGitlab] = useState(false)
  const [isSavingGitlabRepos, setIsSavingGitlabRepos] = useState(false)
  const [slackChannels, setSlackChannels] = useState<{ id: string; name: string; isPrivate: boolean }[]>([])
  const [indexedSlackChannels, setIndexedSlackChannels] = useState<string[]>([])
  const [selectedSlackChannels, setSelectedSlackChannels] = useState<string[]>([])
  const [slackOauthStatus, setSlackOauthStatus] = useState<OAuthConfigStatus | null>(null)
  const [isConnectingSlack, setIsConnectingSlack] = useState(false)
  const [isSavingSlackChannels, setIsSavingSlackChannels] = useState(false)
  const [notionPages, setNotionPages] = useState<{ id: string; title: string; url?: string }[]>([])
  const [indexedNotionPages, setIndexedNotionPages] = useState<string[]>([])
  const [selectedNotionPages, setSelectedNotionPages] = useState<string[]>([])
  const [notionOauthStatus, setNotionOauthStatus] = useState<OAuthConfigStatus | null>(null)
  const [quickbooksOauthStatus, setQuickbooksOauthStatus] = useState<OAuthConfigStatus | null>(null)
  const [isConnectingQuickbooks, setIsConnectingQuickbooks] = useState(false)
  const [isConnectingNotion, setIsConnectingNotion] = useState(false)
  const [isSavingNotionPages, setIsSavingNotionPages] = useState(false)
  const [showOAuthConfigForm, setShowOAuthConfigForm] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [syncingSourceId, setSyncingSourceId] = useState<string | null>(null)

  const canAdd = useMemo(() => !!projectId && url.trim().length > 0 && !isAdding, [projectId, url, isAdding])
  const canAddLinear = useMemo(() => !!projectId && linearApiKey.trim().length > 0 && !isAdding, [projectId, linearApiKey, isAdding])
  const canAddStripe = useMemo(() => !!projectId && stripeApiKey.trim().length > 0 && !isAdding, [projectId, stripeApiKey, isAdding])
  const canAddSentry = useMemo(() => !!projectId && sentryApiKey.trim().length > 0 && sentryOrganization.trim().length > 0 && !isAdding, [projectId, sentryApiKey, sentryOrganization, isAdding])
  const canAddPosthog = useMemo(() => !!projectId && posthogApiKey.trim().length > 0 && posthogProjectId.trim().length > 0 && !isAdding, [projectId, posthogApiKey, posthogProjectId, isAdding])
  const canAddMetabase = useMemo(() => !!projectId && metabaseApiKey.trim().length > 0 && metabaseUrl.trim().length > 0 && !isAdding, [projectId, metabaseApiKey, metabaseUrl, isAdding])
  const canAddHubspot = useMemo(() => !!projectId && hubspotApiKey.trim().length > 0 && !isAdding, [projectId, hubspotApiKey, isAdding])
  const canAddDbSchema = useMemo(() => !!projectId && dbSchemaBasePath.trim().length > 0 && !isAdding, [projectId, dbSchemaBasePath, isAdding])
  const githubSource = useMemo(() => sources.find(s => s.sourceType === 'github') || null, [sources])
  const gitlabSource = useMemo(() => sources.find(s => s.sourceType === 'gitlab') || null, [sources])
  const slackSource = useMemo(() => sources.find(s => s.sourceType === 'slack') || null, [sources])
  const notionSource = useMemo(() => sources.find(s => s.sourceType === 'notion') || null, [sources])
  const quickbooksSource = useMemo(() => sources.find(s => s.sourceType === 'quickbooks') || null, [sources])

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

  const loadGitlabOAuthStatus = useCallback(async () => {
    try {
      const status = await integrationApi.getOAuthConfigStatus('gitlab')
      setGitlabOauthStatus(status)
    } catch {
      setGitlabOauthStatus({ sourceType: 'gitlab', configured: false, configSource: 'missing' })
    }
  }, [])

  const loadGitlabRepos = useCallback(async (sourceId: string) => {
    if (!projectId) return
    try {
      const [repos, indexed] = await Promise.all([
        integrationApi.listGitlabRepos(projectId, sourceId),
        integrationApi.getIndexedGitlabRepos(projectId, sourceId),
      ])
      setGitlabRepos(repos)
      setIndexedGitlabRepos(indexed)
    } catch {
      setGitlabRepos([])
      setIndexedGitlabRepos([])
    }
  }, [projectId])

  const loadSlackOAuthStatus = useCallback(async () => {
    try {
      const status = await integrationApi.getOAuthConfigStatus('slack')
      setSlackOauthStatus(status)
    } catch {
      setSlackOauthStatus({ sourceType: 'slack', configured: false, configSource: 'missing' })
    }
  }, [])

  const loadSlackChannels = useCallback(async (sourceId: string) => {
    if (!projectId) return
    try {
      const [channels, indexed] = await Promise.all([
        integrationApi.listSlackChannels(projectId, sourceId),
        integrationApi.getIndexedSlackChannels(projectId, sourceId),
      ])
      setSlackChannels(channels)
      setIndexedSlackChannels(indexed)
    } catch {
      setSlackChannels([])
      setIndexedSlackChannels([])
    }
  }, [projectId])

  const loadNotionOAuthStatus = useCallback(async () => {
    try {
      const status = await integrationApi.getOAuthConfigStatus('notion')
      setNotionOauthStatus(status)
    } catch {
      setNotionOauthStatus({ sourceType: 'notion', configured: false, configSource: 'missing' })
    }
  }, [])

  const loadQuickBooksOAuthStatus = useCallback(async () => {
    try {
      const status = await integrationApi.getOAuthConfigStatus('quickbooks')
      setQuickbooksOauthStatus(status)
    } catch {
      setQuickbooksOauthStatus({ sourceType: 'quickbooks', configured: false, configSource: 'missing' })
    }
  }, [])

  const loadNotionPages = useCallback(async (sourceId: string) => {
    if (!projectId) return
    try {
      const [pages, indexed] = await Promise.all([
        integrationApi.listNotionPages(projectId, sourceId),
        integrationApi.getIndexedNotionPages(projectId, sourceId),
      ])
      setNotionPages(pages)
      setIndexedNotionPages(indexed)
    } catch {
      setNotionPages([])
      setIndexedNotionPages([])
    }
  }, [projectId])

  const loadSources = useCallback(async () => {
    if (!projectId) {
      setSources([])
      setGithubRepos([])
      setSelectedGithubRepos([])
      setGitlabRepos([])
      setSelectedGitlabRepos([])
      setSlackChannels([])
      setSelectedSlackChannels([])
      setNotionPages([])
      setSelectedNotionPages([])
      return
    }
    setIsLoading(true)
    setError(null)
    try {
      const data = await integrationApi.getSources(projectId)
      setSources(data)
      await Promise.all([loadOAuthStatus(), loadGitlabOAuthStatus(), loadSlackOAuthStatus(), loadNotionOAuthStatus(), loadQuickBooksOAuthStatus()])
      const github = data.find(s => s.sourceType === 'github')
      const githubReposList = Array.isArray((github?.config as { repos?: unknown })?.repos)
        ? ((github?.config as { repos?: unknown }).repos as unknown[]).filter((r): r is string => typeof r === 'string').map(r => r.trim())
        : []
      setSelectedGithubRepos(githubReposList)
      if (github?.connectionStatus === 'connected') await loadGithubRepos(github.id)
      else {
        setGithubRepos([])
        setIndexedGithubRepos([])
      }
      const gitlab = data.find(s => s.sourceType === 'gitlab')
      const gitlabReposList = Array.isArray((gitlab?.config as { repos?: unknown })?.repos)
        ? ((gitlab?.config as { repos?: unknown }).repos as unknown[]).filter((r): r is string => typeof r === 'string').map(r => r.trim())
        : []
      setSelectedGitlabRepos(gitlabReposList)
      if (gitlab?.connectionStatus === 'connected') await loadGitlabRepos(gitlab.id)
      else {
        setGitlabRepos([])
        setIndexedGitlabRepos([])
      }
      const slack = data.find(s => s.sourceType === 'slack')
      const slackChannelsList = Array.isArray((slack?.config as { channels?: unknown })?.channels)
        ? ((slack?.config as { channels?: unknown }).channels as unknown[]).filter((c): c is string => typeof c === 'string').map(c => c.trim())
        : []
      setSelectedSlackChannels(slackChannelsList)
      if (slack?.connectionStatus === 'connected') await loadSlackChannels(slack.id)
      else {
        setSlackChannels([])
        setIndexedSlackChannels([])
      }
      const notion = data.find(s => s.sourceType === 'notion')
      const notionPagesList = Array.isArray((notion?.config as { pageIds?: unknown })?.pageIds)
        ? ((notion?.config as { pageIds?: unknown }).pageIds as unknown[]).filter((id): id is string => typeof id === 'string').map(id => id.trim())
        : []
      setSelectedNotionPages(notionPagesList)
      if (notion?.connectionStatus === 'connected') await loadNotionPages(notion.id)
      else {
        setNotionPages([])
        setIndexedNotionPages([])
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to load')
    } finally {
      setIsLoading(false)
    }
  }, [projectId, loadGithubRepos, loadGitlabRepos, loadSlackChannels, loadNotionPages, loadOAuthStatus, loadGitlabOAuthStatus, loadSlackOAuthStatus, loadNotionOAuthStatus, loadQuickBooksOAuthStatus])

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

  const handleAddLinearSource = useCallback(async () => {
    if (!projectId || !linearApiKey.trim() || isAdding) return
    setIsAdding(true)
    setError(null)
    try {
      await integrationApi.addSource(projectId, 'linear', { apiKey: linearApiKey.trim() }, displayName.trim() || 'Linear')
      setDisplayName('')
      setLinearApiKey('')
      await loadSources()
    } catch (err: any) {
      setError(err?.message || 'Failed to add Linear')
    } finally {
      setIsAdding(false)
    }
  }, [projectId, linearApiKey, displayName, isAdding, loadSources])

  const handleAddStripeSource = useCallback(async () => {
    if (!projectId || !stripeApiKey.trim() || isAdding) return
    setIsAdding(true)
    setError(null)
    try {
      await integrationApi.addSource(projectId, 'stripe', { apiKey: stripeApiKey.trim() }, displayName.trim() || 'Stripe')
      setDisplayName('')
      setStripeApiKey('')
      await loadSources()
    } catch (err: any) {
      setError(err?.message || 'Failed to add Stripe')
    } finally {
      setIsAdding(false)
    }
  }, [projectId, stripeApiKey, displayName, isAdding, loadSources])

  const handleAddSentrySource = useCallback(async () => {
    if (!projectId || !sentryApiKey.trim() || !sentryOrganization.trim() || isAdding) return
    setIsAdding(true)
    setError(null)
    try {
      await integrationApi.addSource(
        projectId,
        'sentry',
        { apiKey: sentryApiKey.trim(), organization: sentryOrganization.trim() },
        displayName.trim() || 'Sentry'
      )
      setDisplayName('')
      setSentryApiKey('')
      setSentryOrganization('')
      await loadSources()
    } catch (err: any) {
      setError(err?.message || 'Failed to add Sentry')
    } finally {
      setIsAdding(false)
    }
  }, [projectId, sentryApiKey, sentryOrganization, displayName, isAdding, loadSources])

  const handleAddPosthogSource = useCallback(async () => {
    if (!projectId || !posthogApiKey.trim() || !posthogProjectId.trim() || isAdding) return
    setIsAdding(true)
    setError(null)
    try {
      await integrationApi.addSource(
        projectId,
        'posthog',
        {
          apiKey: posthogApiKey.trim(),
          host: posthogHost.trim() || 'https://us.posthog.com',
          projectId: posthogProjectId.trim(),
        },
        displayName.trim() || 'PostHog'
      )
      setDisplayName('')
      setPosthogApiKey('')
      setPosthogProjectId('')
      await loadSources()
    } catch (err: any) {
      setError(err?.message || 'Failed to add PostHog')
    } finally {
      setIsAdding(false)
    }
  }, [projectId, posthogApiKey, posthogHost, posthogProjectId, displayName, isAdding, loadSources])

  const handleAddHubspotSource = useCallback(async () => {
    if (!projectId || !hubspotApiKey.trim() || isAdding) return
    setIsAdding(true)
    setError(null)
    try {
      await integrationApi.addSource(projectId, 'hubspot', { apiKey: hubspotApiKey.trim() }, displayName.trim() || 'HubSpot')
      setHubspotApiKey('')
      await loadSources()
    } catch (err: any) {
      setError(err?.message || 'Connection failed')
    } finally {
      setIsAdding(false)
    }
  }, [projectId, hubspotApiKey, displayName, isAdding, loadSources])

  const handleBrowseDbSchemaFolder = useCallback(async () => {
    setIsSelectingDbSchemaFolder(true)
    setError(null)
    try {
      const result = await integrationApi.selectDbSchemaFolder()
      if (!result.canceled && result.path) {
        setDbSchemaBasePath(result.path)
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to select folder')
    } finally {
      setIsSelectingDbSchemaFolder(false)
    }
  }, [])

  const handleAddDbSchemaSource = useCallback(async () => {
    if (!projectId || !dbSchemaBasePath.trim() || isAdding) return
    setIsAdding(true)
    setError(null)
    try {
      await integrationApi.addSource(projectId, 'db-schema', { basePath: dbSchemaBasePath.trim() }, displayName.trim() || 'DB Schema')
      setDbSchemaBasePath('')
      await loadSources()
    } catch (err: any) {
      setError(err?.message || 'Failed to add DB Schema source')
    } finally {
      setIsAdding(false)
    }
  }, [projectId, dbSchemaBasePath, displayName, isAdding, loadSources])

  const handleAddMetabaseSource = useCallback(async () => {
    if (!projectId || !metabaseApiKey.trim() || !metabaseUrl.trim() || isAdding) return
    setIsAdding(true)
    setError(null)
    try {
      await integrationApi.addSource(
        projectId,
        'metabase',
        { apiKey: metabaseApiKey.trim(), metabaseUrl: metabaseUrl.trim().replace(/\/$/, '') },
        displayName.trim() || 'Metabase'
      )
      setDisplayName('')
      setMetabaseApiKey('')
      setMetabaseUrl('')
      await loadSources()
    } catch (err: any) {
      setError(err?.message || 'Failed to add Metabase')
    } finally {
      setIsAdding(false)
    }
  }, [projectId, metabaseApiKey, metabaseUrl, displayName, isAdding, loadSources])

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

  const handleConnectGitlab = useCallback(async () => {
    if (!projectId) return
    if (!gitlabOauthStatus?.configured) {
      const cid = oauthClientId.trim()
      const csec = oauthClientSecret.trim()
      if (!cid || !csec) {
        setError('Client ID and Secret required')
        return
      }
      setIsConnectingGitlab(true)
      setError(null)
      try {
        await integrationApi.saveOAuthConfig('gitlab', { clientId: cid, clientSecret: csec })
        await loadGitlabOAuthStatus()
        await integrationApi.startOAuth(projectId, 'gitlab')
        await loadSources()
        setSuccessMessage('GitLab connected. Select projects and click Save and Index.')
        setTimeout(() => setSuccessMessage(null), 5000)
      } catch (err: any) {
        const msg = err?.message || 'Connect failed'
        setError(msg)
      } finally {
        setIsConnectingGitlab(false)
      }
      return
    }
    setIsConnectingGitlab(true)
    setError(null)
    try {
      await integrationApi.startOAuth(projectId, 'gitlab')
      await loadSources()
      setSuccessMessage('GitLab connected. Select projects and Save scope, then Sync to index.')
      setTimeout(() => setSuccessMessage(null), 5000)
    } catch (err: any) {
      const msg = err?.message || 'Connect failed'
      setError(msg)
    } finally {
      setIsConnectingGitlab(false)
    }
  }, [projectId, gitlabOauthStatus?.configured, oauthClientId, oauthClientSecret, loadGitlabOAuthStatus, loadSources])

  const cancelConnectGitlab = useCallback(() => {
    setIsConnectingGitlab(false)
  }, [])

  const handleConnectSlack = useCallback(async () => {
    if (!projectId) return
    if (!slackOauthStatus?.configured) {
      const cid = oauthClientId.trim()
      const csec = oauthClientSecret.trim()
      if (!cid || !csec) {
        setError('Client ID and Secret required')
        return
      }
      setIsConnectingSlack(true)
      setError(null)
      try {
        await integrationApi.saveOAuthConfig('slack', { clientId: cid, clientSecret: csec })
        await loadSlackOAuthStatus()
        await integrationApi.startOAuth(projectId, 'slack')
        await loadSources()
        setSuccessMessage('Slack connected. Select channels and click Save and Index.')
        setTimeout(() => setSuccessMessage(null), 5000)
      } catch (err: any) {
        const msg = err?.message || 'Connect failed'
        setError(msg)
      } finally {
        setIsConnectingSlack(false)
      }
      return
    }
    setIsConnectingSlack(true)
    setError(null)
    try {
      await integrationApi.startOAuth(projectId, 'slack')
      await loadSources()
      setSuccessMessage('Slack connected. Select channels and Save scope, then Sync to index.')
      setTimeout(() => setSuccessMessage(null), 5000)
    } catch (err: any) {
      const msg = err?.message || 'Connect failed'
      setError(msg)
    } finally {
      setIsConnectingSlack(false)
    }
  }, [projectId, slackOauthStatus?.configured, oauthClientId, oauthClientSecret, loadSlackOAuthStatus, loadSources])

  const cancelConnectSlack = useCallback(() => {
    setIsConnectingSlack(false)
  }, [])

  const handleConnectNotion = useCallback(async () => {
    if (!projectId) return
    if (!notionOauthStatus?.configured) {
      const cid = oauthClientId.trim()
      const csec = oauthClientSecret.trim()
      if (!cid || !csec) {
        setError('Client ID and Secret required')
        return
      }
      setIsConnectingNotion(true)
      setError(null)
      try {
        await integrationApi.saveOAuthConfig('notion', { clientId: cid, clientSecret: csec })
        await loadNotionOAuthStatus()
        await integrationApi.startOAuth(projectId, 'notion')
        await loadSources()
        setSuccessMessage('Notion connected. Select pages and click Save and Index.')
        setTimeout(() => setSuccessMessage(null), 5000)
      } catch (err: any) {
        const msg = err?.message || 'Connect failed'
        setError(msg)
      } finally {
        setIsConnectingNotion(false)
      }
      return
    }
    setIsConnectingNotion(true)
    setError(null)
    try {
      await integrationApi.startOAuth(projectId, 'notion')
      await loadSources()
      setSuccessMessage('Notion connected. Select pages and Save scope, then Sync to index.')
      setTimeout(() => setSuccessMessage(null), 5000)
    } catch (err: any) {
      const msg = err?.message || 'Connect failed'
      setError(msg)
    } finally {
      setIsConnectingNotion(false)
    }
  }, [projectId, notionOauthStatus?.configured, oauthClientId, oauthClientSecret, loadNotionOAuthStatus, loadSources])

  const cancelConnectNotion = useCallback(() => {
    setIsConnectingNotion(false)
  }, [])

  const handleConnectQuickbooks = useCallback(async () => {
    if (!projectId) return
    setIsConnectingQuickbooks(true)
    setError(null)
    try {
      if (!quickbooksOauthStatus?.configured) {
        const cid = oauthClientId.trim()
        const csec = oauthClientSecret.trim()
        if (cid && csec) {
          await integrationApi.saveOAuthConfig('quickbooks', { clientId: cid, clientSecret: csec })
          setOauthClientSecret('')
        }
        await loadQuickBooksOAuthStatus()
        await integrationApi.startOAuth(projectId, 'quickbooks')
      } else {
        await integrationApi.startOAuth(projectId, 'quickbooks')
      }
      await loadSources()
    } catch (err: any) {
      const msg = err?.message || 'QuickBooks connection failed'
      setError(msg)
    } finally {
      setIsConnectingQuickbooks(false)
    }
  }, [projectId, quickbooksOauthStatus?.configured, oauthClientId, oauthClientSecret, loadQuickBooksOAuthStatus, loadSources])

  const cancelConnectQuickbooks = useCallback(() => {
    setIsConnectingQuickbooks(false)
  }, [])

  const handleSaveOAuthConfig = useCallback(async (sourceType: 'github' | 'gitlab' | 'slack' | 'notion' | 'quickbooks') => {
    const cid = oauthClientId.trim()
    const csec = oauthClientSecret.trim()
    if (!cid || !csec) {
      setError('Client ID and Secret required')
      return
    }
    setIsSavingOAuthConfig(true)
    setError(null)
    try {
      await integrationApi.saveOAuthConfig(sourceType, { clientId: cid, clientSecret: csec })
      if (sourceType === 'github') await loadOAuthStatus()
      else if (sourceType === 'gitlab') await loadGitlabOAuthStatus()
      else if (sourceType === 'slack') await loadSlackOAuthStatus()
      else if (sourceType === 'notion') await loadNotionOAuthStatus()
      else await loadQuickBooksOAuthStatus()
      setOauthClientSecret('')
      setShowOAuthConfigForm(false)
    } catch (err: any) {
      setError(err?.message || 'Save failed')
    } finally {
      setIsSavingOAuthConfig(false)
    }
  }, [oauthClientId, oauthClientSecret, loadOAuthStatus, loadGitlabOAuthStatus, loadSlackOAuthStatus, loadNotionOAuthStatus, loadQuickBooksOAuthStatus])

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

  const handleSaveGitlabRepos = useCallback(async () => {
    if (!projectId || !gitlabSource) return
    setIsSavingGitlabRepos(true)
    setSyncingSourceId(gitlabSource.id)
    setError(null)
    setSuccessMessage(null)
    try {
      await integrationApi.updateGitlabRepos(projectId, gitlabSource.id, selectedGitlabRepos)
      await loadSources()
      const keys = await getKeys()
      const result = await integrationApi.syncSource(projectId, gitlabSource.id, keys.geminiApiKey, keys.openaiApiKey)
      await loadSources()
      const count = (result as { itemCount?: number })?.itemCount ?? 0
      setSuccessMessage(count > 0 ? `${count} items indexed.` : 'Scope saved and index updated.')
      setTimeout(() => setSuccessMessage(null), 4000)
    } catch (err: any) {
      setError(err?.message || 'Save failed')
      await loadSources()
    } finally {
      setIsSavingGitlabRepos(false)
      setSyncingSourceId(null)
    }
  }, [projectId, gitlabSource, selectedGitlabRepos, loadSources, getKeys])

  const handleSaveSlackChannels = useCallback(async () => {
    if (!projectId || !slackSource) return
    setIsSavingSlackChannels(true)
    setSyncingSourceId(slackSource.id)
    setError(null)
    setSuccessMessage(null)
    try {
      await integrationApi.updateSlackChannels(projectId, slackSource.id, selectedSlackChannels)
      await loadSources()
      const keys = await getKeys()
      const result = await integrationApi.syncSource(projectId, slackSource.id, keys.geminiApiKey, keys.openaiApiKey)
      await loadSources()
      const count = (result as { itemCount?: number })?.itemCount ?? 0
      setSuccessMessage(count > 0 ? `${count} items indexed.` : 'Scope saved and index updated.')
      setTimeout(() => setSuccessMessage(null), 4000)
    } catch (err: any) {
      setError(err?.message || 'Save failed')
      await loadSources()
    } finally {
      setIsSavingSlackChannels(false)
      setSyncingSourceId(null)
    }
  }, [projectId, slackSource, selectedSlackChannels, loadSources, getKeys])

  const handleSaveNotionPages = useCallback(async () => {
    if (!projectId || !notionSource) return
    setIsSavingNotionPages(true)
    setSyncingSourceId(notionSource.id)
    setError(null)
    setSuccessMessage(null)
    try {
      await integrationApi.updateNotionPages(projectId, notionSource.id, selectedNotionPages)
      await loadSources()
      const keys = await getKeys()
      const result = await integrationApi.syncSource(projectId, notionSource.id, keys.geminiApiKey, keys.openaiApiKey)
      await loadSources()
      const count = (result as { itemCount?: number })?.itemCount ?? 0
      setSuccessMessage(count > 0 ? `${count} items indexed.` : 'Scope saved and index updated.')
      setTimeout(() => setSuccessMessage(null), 4000)
    } catch (err: any) {
      setError(err?.message || 'Save failed')
      await loadSources()
    } finally {
      setIsSavingNotionPages(false)
      setSyncingSourceId(null)
    }
  }, [projectId, notionSource, selectedNotionPages, loadSources, getKeys])

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
    linearApiKey,
    setLinearApiKey,
    stripeApiKey,
    setStripeApiKey,
    sentryApiKey,
    setSentryApiKey,
    sentryOrganization,
    setSentryOrganization,
    posthogApiKey,
    setPosthogApiKey,
    posthogHost,
    setPosthogHost,
    posthogProjectId,
    setPosthogProjectId,
    metabaseApiKey,
    setMetabaseApiKey,
    metabaseUrl,
    setMetabaseUrl,
    hubspotApiKey,
    setHubspotApiKey,
    dbSchemaBasePath,
    setDbSchemaBasePath,
    isSelectingDbSchemaFolder,
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
    gitlabSource,
    gitlabRepos,
    indexedGitlabRepos,
    selectedGitlabRepos,
    setSelectedGitlabRepos,
    gitlabOauthStatus,
    isConnectingGitlab,
    isSavingGitlabRepos,
    slackSource,
    slackChannels,
    indexedSlackChannels,
    selectedSlackChannels,
    setSelectedSlackChannels,
    slackOauthStatus,
    isConnectingSlack,
    isSavingSlackChannels,
    handleConnectSlack,
    cancelConnectSlack,
    handleSaveSlackChannels,
    notionSource,
    notionPages,
    indexedNotionPages,
    selectedNotionPages,
    setSelectedNotionPages,
    notionOauthStatus,
    isConnectingNotion,
    isSavingNotionPages,
    handleConnectNotion,
    cancelConnectNotion,
    handleSaveNotionPages,
    quickbooksSource,
    quickbooksOauthStatus,
    isConnectingQuickbooks,
    handleConnectQuickbooks,
    cancelConnectQuickbooks,
    canAdd,
    canAddLinear,
    canAddStripe,
    canAddSentry,
    canAddPosthog,
    canAddMetabase,
    canAddHubspot,
    canAddDbSchema,
    loadSources,
    handleAddSource,
    handleAddLinearSource,
    handleAddStripeSource,
    handleAddSentrySource,
    handleAddPosthogSource,
    handleAddMetabaseSource,
    handleAddHubspotSource,
    handleAddDbSchemaSource,
    handleBrowseDbSchemaFolder,
    handleSyncSource,
    handleSyncAll,
    handleConnectGithub,
    cancelConnectGithub,
    handleConnectGitlab,
    cancelConnectGitlab,
    handleSaveOAuthConfig,
    handleSaveGithubRepos,
    handleSaveGitlabRepos,
    handleRemove,
  }), [
    projectId, sources, githubRepos, indexedGithubRepos, selectedGithubRepos, isLoading, isAdding, isSyncingAll,
    isConnectingGithub, isSavingGithubRepos, isSavingOAuthConfig, displayName, url, linearApiKey, stripeApiKey,     metabaseApiKey, metabaseUrl, hubspotApiKey, dbSchemaBasePath, oauthClientId,
    oauthClientSecret, oauthStatus, showOAuthConfigForm, error, successMessage, syncingSourceId, getStatusInfo,
    githubSource, gitlabSource, notionSource, quickbooksSource, quickbooksOauthStatus, isConnectingQuickbooks, canAdd, canAddLinear, canAddStripe, canAddSentry, canAddPosthog, canAddMetabase, canAddDbSchema, loadSources, handleAddSource, handleAddLinearSource, handleAddStripeSource, handleAddSentrySource, handleAddPosthogSource, handleAddDbSchemaSource, handleBrowseDbSchemaFolder, handleAddMetabaseSource, handleSyncSource, handleSyncAll,
    handleConnectGithub, cancelConnectGithub, handleConnectGitlab, cancelConnectGitlab, handleConnectNotion, handleConnectQuickbooks, handleSaveOAuthConfig, handleSaveGithubRepos, handleSaveGitlabRepos, handleRemove,
  ])

  return <IntegrationsContext.Provider value={value}>{children}</IntegrationsContext.Provider>
}

export function useIntegrations() {
  const ctx = useContext(IntegrationsContext)
  if (!ctx) throw new Error('useIntegrations must be used within IntegrationsProvider')
  return ctx
}
