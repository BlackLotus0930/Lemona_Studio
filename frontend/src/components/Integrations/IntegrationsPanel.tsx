import { useCallback, useEffect, useMemo, useState } from 'react'
import { integrationApi, IntegrationSource, OAuthConfigStatus, settingsApi } from '../../services/desktop-api'
import { useTheme } from '../../contexts/ThemeContext'
import { AVAILABLE_INTEGRATIONS, getIntegrationLabel, getIntegrationLogoSrc, IntegrationLogoImg, type AvailableIntegrationKind } from './availableIntegrations'
import RssFeedIcon from '@mui/icons-material/RssFeed'
import CodeIcon from '@mui/icons-material/Code'
import SettingsIcon from '@mui/icons-material/Settings'
import SearchIcon from '@mui/icons-material/Search'
import CloseIcon from '@mui/icons-material/Close'

interface IntegrationsPanelProps {
  projectId: string | null
}

type TabItem =
  | { id: string; type: 'source'; source: IntegrationSource }
  | { id: string; type: 'available'; kind: AvailableIntegrationKind }

const SIDEBAR_WIDTH = 220

export default function IntegrationsPanel({ projectId }: IntegrationsPanelProps) {
  const { theme } = useTheme()
  const [sources, setSources] = useState<IntegrationSource[]>([])
  const [githubRepos, setGithubRepos] = useState<string[]>([])
  const [indexedGithubRepos, setIndexedGithubRepos] = useState<string[]>([])
  const [selectedGithubRepos, setSelectedGithubRepos] = useState<string[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isAdding, setIsAdding] = useState(false)
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
  const [syncingSourceId, setSyncingSourceId] = useState<string | null>(null)
  const [tabs, setTabs] = useState<TabItem[]>([])
  const [activeTabIndex, setActiveTabIndex] = useState(0)
  const [hoveredTabIndex, setHoveredTabIndex] = useState<number | null>(null)
  const [search, setSearch] = useState('')

  const panelBg = theme === 'dark' ? '#1e1e1e' : '#ffffff'
  const listBg = theme === 'dark' ? '#252526' : '#f3f3f3'
  const textColor = theme === 'dark' ? '#cccccc' : '#333333'
  const subTextColor = theme === 'dark' ? '#858585' : '#6e6e6e'
  const borderColor = theme === 'dark' ? '#3c3c3c' : '#e0e0e0'
  const selectedBg = theme === 'dark' ? '#094771' : '#e3f2fd'
  const accentColor = theme === 'dark' ? '#0e639c' : '#0078d4'
  const successColor = '#4caf50'
  const warnColor = '#ff9800'
  const errorColor = '#f44336'

  const canAdd = useMemo(() => !!projectId && url.trim().length > 0 && !isAdding, [projectId, url, isAdding])
  const githubSource = useMemo(() => sources.find(s => s.sourceType === 'github') || null, [sources])

  const getStatusInfo = (source: IntegrationSource) => {
    const s = source.connectionStatus
    if (s === 'connected') return { label: 'Connected', color: successColor }
    if (s === 'expired' || s === 'error') return { label: s === 'expired' ? 'Expired' : 'Error', color: warnColor }
    return { label: 'Disconnected', color: subTextColor }
  }

  const filteredSources = useMemo(() => {
    if (!search.trim()) return sources
    const q = search.toLowerCase()
    return sources.filter(s => {
      const name = (s.displayName || (s.config as { url?: string })?.url || s.sourceType).toLowerCase()
      return name.includes(q)
    })
  }, [sources, search])

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
      setIndexedGithubRepos([])
      setSelectedGithubRepos([])
      setTabs([])
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
      setTabs(prev => prev.map(t => (t.type === 'source' ? { ...t, source: data.find(s => s.id === t.source.id) ?? t.source } : t)))
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

  const handleAddSource = async () => {
    if (!canAdd || !projectId) return
    setIsAdding(true)
    setError(null)
    try {
      await integrationApi.addSource(projectId, 'rss', { url: url.trim() }, displayName.trim() || undefined)
      setDisplayName('')
      setUrl('')
      const updated = await integrationApi.getSources(projectId)
      setSources(updated)
      const added = updated[updated.length - 1]
      if (added) openOrFocusTab({ id: `source-${added.id}`, type: 'source', source: added })
    } catch (err: any) {
      setError(err?.message || 'Failed to add')
    } finally {
      setIsAdding(false)
    }
  }

  const handleSyncSource = async (sourceId: string) => {
    if (!projectId) return
    setSyncingSourceId(sourceId)
    setError(null)
    try {
      const keys = await getKeys()
      await integrationApi.syncSource(projectId, sourceId, keys.geminiApiKey, keys.openaiApiKey)
      await loadSources()
    } catch (err: any) {
      setError(err?.message || 'Sync failed')
      await loadSources()
    } finally {
      setSyncingSourceId(null)
    }
  }

  const handleConnectGithub = async () => {
    if (!projectId) return
    if (!oauthStatus?.configured) {
      setShowOAuthConfigForm(true)
      setError('Configure OAuth first')
      openOrFocusTab({ id: 'available-github', type: 'available', kind: 'github' })
      return
    }
    setIsConnectingGithub(true)
    setError(null)
    try {
      await integrationApi.startOAuth(projectId, 'github')
      await loadSources()
    } catch (err: any) {
      const msg = err?.message || 'Connect failed'
      if (msg.toLowerCase().includes('oauth')) setShowOAuthConfigForm(true)
      setError(msg)
    } finally {
      setIsConnectingGithub(false)
    }
  }

  const handleSaveOAuthConfig = async () => {
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
  }

  const handleSaveGithubRepos = async () => {
    if (!projectId || !githubSource) return
    setIsSavingGithubRepos(true)
    setSyncingSourceId(githubSource.id)
    setError(null)
    try {
      await integrationApi.updateGithubRepos(projectId, githubSource.id, selectedGithubRepos)
      await loadSources()
      const keys = await getKeys()
      await integrationApi.syncSource(projectId, githubSource.id, keys.geminiApiKey, keys.openaiApiKey)
      await loadSources()
    } catch (err: any) {
      setError(err?.message || 'Save failed')
    } finally {
      setIsSavingGithubRepos(false)
      setSyncingSourceId(null)
    }
  }

  const handleRemove = async (sourceId: string) => {
    if (!projectId) return
    setError(null)
    try {
      await integrationApi.removeSource(projectId, sourceId)
      setTabs(prev => {
        const next = prev.filter(t => !(t.type === 'source' && t.source.id === sourceId))
        setActiveTabIndex(i => Math.min(Math.max(0, i), Math.max(0, next.length - 1)))
        return next
      })
      await loadSources()
    } catch (err: any) {
      setError(err?.message || 'Disconnect failed')
    }
  }

  const openOrFocusTab = (item: TabItem) => {
    setTabs(prev => {
      const idx = prev.findIndex(t => t.id === item.id)
      if (idx >= 0) {
        setActiveTabIndex(idx)
        return prev
      }
      const next = [...prev, item]
      setActiveTabIndex(next.length - 1)
      return next
    })
  }

  const closeTab = (e: React.MouseEvent, index: number) => {
    e.stopPropagation()
    setTabs(prev => prev.filter((_, i) => i !== index))
    setActiveTabIndex(i => (i >= index && i > 0 ? i - 1 : i < index ? i : Math.max(0, index - 1)))
  }

  const listItem = (label: string, sub?: string, icon?: React.ReactNode) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
      {icon && <span style={{ flexShrink: 0, display: 'flex' }}>{icon}</span>}
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</div>
        {sub && <div style={{ fontSize: 11, color: subTextColor, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sub}</div>}
      </div>
    </div>
  )

  const btn = (label: string, onClick: () => void, primary = false, disabled = false) => (
    <button
      onClick={onClick}
      disabled={disabled}
      className={!primary ? 'integration-btn-secondary' : undefined}
      style={{
        padding: '6px 12px',
        fontSize: 12,
        borderRadius: 4,
        border: `1px solid ${borderColor}`,
        background: primary ? (theme === 'dark' ? '#0e639c' : '#0078d4') : 'transparent',
        color: primary ? '#fff' : textColor,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
      }}
    >
      {label}
    </button>
  )

  if (!projectId) {
    return (
      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: subTextColor, fontSize: 13 }}>
        Open a project to manage integrations.
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', width: '100%', height: '100%', overflow: 'hidden' }}>
      {/* Sidebar */}
      <div
        style={{
          width: SIDEBAR_WIDTH,
          flexShrink: 0,
          backgroundColor: listBg,
          borderRight: `1px solid ${borderColor}`,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        <div style={{ padding: 8, borderBottom: `1px solid ${borderColor}` }}>
          <div style={{ position: 'relative' }}>
            <SearchIcon style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', fontSize: 16, color: subTextColor }} />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search integrations..."
              style={{
                width: '100%',
                padding: '6px 8px 6px 28px',
                fontSize: 12,
                border: `1px solid ${borderColor}`,
                borderRadius: 4,
                backgroundColor: panelBg,
                color: textColor,
                boxSizing: 'border-box',
              }}
            />
          </div>
        </div>
        <div style={{ flex: 1, overflowY: 'auto' }}>
          <div style={{ padding: '8px 12px', fontSize: 11, fontWeight: 600, color: subTextColor, textTransform: 'uppercase' }}>
            INSTALLED ({sources.length})
          </div>
          {filteredSources.map(source => {
            const tab = tabs[activeTabIndex]
            const sel = tab?.type === 'source' && tab.source.id === source.id
            const cfg = source.config as { url?: string; login?: string }
            const label = source.displayName || (source.sourceType === 'github' ? `GitHub${cfg.login ? ` @${cfg.login}` : ''}` : cfg.url) || source.sourceType
            return (
              <div
                key={source.id}
                onClick={() => openOrFocusTab({ id: `source-${source.id}`, type: 'source', source })}
                style={{
                  padding: '8px 12px',
                  cursor: 'pointer',
                  backgroundColor: sel ? selectedBg : undefined,
                  borderLeft: sel ? `3px solid ${accentColor}` : '3px solid transparent',
                }}
              >
                {listItem(
                  label,
                  getStatusInfo(source).label,
                  getIntegrationLogoSrc(source.sourceType) ? (
                    <IntegrationLogoImg kind={source.sourceType} size={18} />
                  ) : null
                )}
              </div>
            )
          })}
          <div style={{ padding: '8px 12px', fontSize: 11, fontWeight: 600, color: subTextColor, textTransform: 'uppercase', marginTop: 8 }}>
            AVAILABLE ({AVAILABLE_INTEGRATIONS.filter(i => !sources.some(s => s.sourceType === i.kind)).length})
          </div>
          {AVAILABLE_INTEGRATIONS.filter(i => !sources.some(s => s.sourceType === i.kind)).map(({ kind, label, sub, icon }) => {
            const tab = tabs[activeTabIndex]
            const sel = tab?.type === 'available' && tab.kind === kind
            return (
              <div
                key={kind}
                onClick={() => openOrFocusTab({ id: `available-${kind}`, type: 'available', kind })}
                style={{
                  padding: '8px 12px',
                  cursor: 'pointer',
                  backgroundColor: sel ? selectedBg : undefined,
                  borderLeft: sel ? `3px solid ${accentColor}` : '3px solid transparent',
                }}
              >
                {listItem(label, sub, icon)}
              </div>
            )
          })}
        </div>
      </div>

      {/* Detail */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', backgroundColor: panelBg }}>
        {error && (
          <div style={{ padding: 8, backgroundColor: theme === 'dark' ? '#3d2020' : '#ffebee', color: errorColor, fontSize: 12, flexShrink: 0 }}>
            {error}
          </div>
        )}
        {tabs.length === 0 ? (
          <div style={{ flex: 1, padding: 24, color: subTextColor, fontSize: 13, overflow: 'auto' }}>
            Click an integration from the list to open it. Add RSS feeds or connect GitHub to bring external data into AI context.
          </div>
        ) : (
          <>
            <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column' }}>
              <div style={{ display: 'flex', alignItems: 'center', borderBottom: `1px solid ${borderColor}`, backgroundColor: theme === 'dark' ? '#252526' : '#f3f3f3' }} className="integration-tabs">
                {tabs.map((t, i) => {
                  const active = i === activeTabIndex
                  const cfg = t.type === 'source' ? (t.source.config as { url?: string; login?: string }) : null
                  const title = t.type === 'source'
                    ? (t.source.displayName || (t.source.sourceType === 'github' ? `GitHub${cfg?.login ? ` @${cfg.login}` : ''}` : cfg?.url) || t.source.sourceType)
                    : getIntegrationLabel(t.kind)
                  const logoSrc = t.type === 'source' ? getIntegrationLogoSrc(t.source.sourceType) : getIntegrationLogoSrc(t.kind)
                  const icon = logoSrc ? (
                    <IntegrationLogoImg kind={t.type === 'source' ? t.source.sourceType : t.kind} size={16} />
                  ) : (
                    t.type === 'source' ? (t.source.sourceType === 'github' ? <CodeIcon style={{ fontSize: 16, color: subTextColor }} /> : <RssFeedIcon style={{ fontSize: 16, color: subTextColor }} />) : <CodeIcon style={{ fontSize: 16, color: subTextColor }} />
                  )
                  return (
                    <div
                      key={t.id}
                      onClick={() => setActiveTabIndex(i)}
                      onMouseEnter={() => setHoveredTabIndex(i)}
                      onMouseLeave={() => setHoveredTabIndex(null)}
                      style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px', minWidth: 60, maxWidth: 180, cursor: 'pointer', backgroundColor: active ? panelBg : 'transparent', borderBottom: active ? `2px solid ${panelBg}` : '2px solid transparent', marginBottom: active ? -1 : 0, fontSize: 12, flexShrink: 0 }}
                    >
                      {icon}
                      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</span>
                      <button
                        onClick={e => { e.stopPropagation(); closeTab(e, i) }}
                        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 18, height: 18, border: 'none', background: 'transparent', color: subTextColor, cursor: 'pointer', borderRadius: 4, opacity: active || hoveredTabIndex === i ? 0.8 : 0, flexShrink: 0 }}
                      >
                        <CloseIcon style={{ fontSize: 14 }} />
                      </button>
                    </div>
                  )
                })}
              </div>
            </div>
            <div style={{ flex: 1, overflow: 'auto' }}>
              {isLoading ? (
                <div style={{ padding: 24, color: subTextColor, fontSize: 13 }}>Loading...</div>
              ) : (() => {
                const tab = tabs[activeTabIndex]
                if (!tab) return null
                if (tab.type === 'source') {
                  return (
                    <SourceDetail
                      source={tab.source}
                      subTextColor={subTextColor}
                      borderColor={borderColor}
                      getStatusInfo={getStatusInfo}
                      syncingSourceId={syncingSourceId}
                      githubRepos={githubRepos}
                      indexedGithubRepos={indexedGithubRepos}
                      selectedGithubRepos={selectedGithubRepos}
                      onToggleRepo={repo => setSelectedGithubRepos(prev => (prev.includes(repo) ? prev.filter(r => r !== repo) : [...prev, repo]))}
                      onSync={handleSyncSource}
                      onRemove={handleRemove}
                      onReconnect={tab.source.sourceType === 'github' ? handleConnectGithub : undefined}
                      isConnectingGithub={isConnectingGithub}
                      onSaveRepos={handleSaveGithubRepos}
                      isSavingRepos={isSavingGithubRepos}
                      btn={btn}
                    />
                  )
                }
                if (tab.kind !== 'rss' && tab.kind !== 'github') {
                  const logoSrc = getIntegrationLogoSrc(tab.kind)
                  return (
                    <div style={{ padding: 24 }}>
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, marginBottom: 20 }}>
                        {logoSrc ? (
                          <IntegrationLogoImg kind={tab.kind} size={48} />
                        ) : null}
                        <div>
                          <h2 style={{ margin: '0 0 4px', fontSize: 18, fontWeight: 600 }}>{getIntegrationLabel(tab.kind)}</h2>
                          <p style={{ margin: 0, fontSize: 13, color: subTextColor, lineHeight: 1.5 }}>
                            Coming soon. This integration will connect your {getIntegrationLabel(tab.kind)} data to Lemona for AI context.
                          </p>
                        </div>
                      </div>
                    </div>
                  )
                }
                return tab.kind === 'rss' ? (
                  <AvailableDetail
                    title="RSS Feed"
                    desc="Subscribe to blogs, news, or podcasts. Content is indexed for AI context."
                    setupSteps={[
                      'Enter a display name (optional) to identify this feed.',
                      'Paste the feed URL (e.g. https://blog.example.com/feed.xml).',
                      'Click Add — the feed will be synced and indexed for AI context.',
                    ]}
                    theme={theme}
                    textColor={textColor}
                    subTextColor={subTextColor}
                    borderColor={borderColor}
                    displayName={displayName}
                    url={url}
                    onDisplayNameChange={setDisplayName}
                    onUrlChange={setUrl}
                    onAdd={handleAddSource}
                    canAdd={canAdd}
                    isAdding={isAdding}
                    btn={btn}
                  />
                ) : (
                  <AvailableDetail
                    title="GitHub"
                    desc="Connect your repos to index issues, pull requests, and repo files (README, source code)."
                    setupSteps={[
                      'Go to GitHub → Settings → Developer settings → OAuth Apps → New OAuth App.',
                      'Application name: any name (e.g. Lemona). Homepage URL: use https://github.com or https://localhost — any valid URL works.',
                      'Authorization callback URL: https://127.0.0.1:38473/oauth/callback',
                      'If you see Webhook URL, you\'re on GitHub Apps — use OAuth Apps instead. Copy Client ID and Client Secret, paste below, then Save.',
                      'Click Connect to authorize. Select repos and click Save and Index.',
                    ]}
                    theme={theme}
                    textColor={textColor}
                    subTextColor={subTextColor}
                    borderColor={borderColor}
                    oauthConfigured={oauthStatus?.configured}
                    showOAuthForm={showOAuthConfigForm}
                    oauthClientId={oauthClientId}
                    oauthClientSecret={oauthClientSecret}
                    onOAuthClientIdChange={setOauthClientId}
                    onOAuthClientSecretChange={setOauthClientSecret}
                    onShowOAuthForm={setShowOAuthConfigForm}
                    onSaveOAuth={handleSaveOAuthConfig}
                    onConnect={handleConnectGithub}
                    githubSource={githubSource}
                    isConnecting={isConnectingGithub}
                    isSavingOAuth={isSavingOAuthConfig}
                    getStatusInfo={getStatusInfo}
                    githubRepos={githubRepos}
                    indexedGithubRepos={indexedGithubRepos}
                    selectedGithubRepos={selectedGithubRepos}
                    onToggleRepo={repo => setSelectedGithubRepos(prev => (prev.includes(repo) ? prev.filter(r => r !== repo) : [...prev, repo]))}
                    onSaveRepos={handleSaveGithubRepos}
                    isSavingRepos={isSavingGithubRepos}
                    btn={btn}
                  />
                )
              })()}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function SourceDetail({
  source,
  subTextColor,
  borderColor,
  getStatusInfo,
  syncingSourceId,
  githubRepos,
  indexedGithubRepos,
  selectedGithubRepos,
  onToggleRepo,
  onSync,
  onRemove,
  onReconnect,
  isConnectingGithub,
  onSaveRepos,
  isSavingRepos,
  btn,
}: {
  source: IntegrationSource
  subTextColor: string
  borderColor: string
  getStatusInfo: (s: IntegrationSource) => { label: string; color: string }
  syncingSourceId: string | null
  githubRepos: string[]
  indexedGithubRepos: string[]
  selectedGithubRepos: string[]
  onToggleRepo: (repo: string) => void
  onSync: (id: string) => void
  onRemove: (id: string) => void
  onReconnect?: () => void
  isConnectingGithub?: boolean
  onSaveRepos: () => void
  isSavingRepos: boolean
  btn: (l: string, fn: () => void, p?: boolean, d?: boolean) => JSX.Element
}) {
  const cfg = source.config as { url?: string; login?: string }
  const label = source.displayName || (source.sourceType === 'github' ? 'GitHub' : 'RSS')
  const status = getStatusInfo(source)
  const isSyncing = syncingSourceId === source.id
  const needsReconnect = source.sourceType === 'github' && (source.connectionStatus === 'expired' || source.connectionStatus === 'error')

  const Icon = source.sourceType === 'github' ? CodeIcon : RssFeedIcon
  const manageSteps = source.sourceType === 'github'
    ? [
        'Select repos and click Save and Index to sync issues, PRs, and repo files.',
        'Click Sync to fetch new or removed content and update the index.',
        'Use @github in chat to filter AI context by GitHub content.',
      ]
    : ['Click Sync to refresh feed content.', 'Content is indexed for AI context.']
  return (
    <div style={{ padding: 16 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, marginBottom: 20 }}>
        <Icon style={{ fontSize: 48, color: subTextColor, flexShrink: 0 }} />
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>{label}</h2>
            <span style={{ fontSize: 11, color: status.color }}>{status.label}</span>
          </div>
          <div style={{ fontSize: 12, color: subTextColor, marginBottom: 8 }}>
            {source.sourceType === 'github' ? `@${cfg.login || '—'}` : cfg.url || '—'}
          </div>
          <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6, color: subTextColor }}>Manage</div>
          <ol style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: subTextColor, lineHeight: 1.6 }}>
            {manageSteps.map((s, i) => <li key={i} style={{ marginBottom: 2 }}>{s}</li>)}
          </ol>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {needsReconnect && onReconnect && btn(isConnectingGithub ? 'Reconnecting...' : 'Reconnect', onReconnect, true, isConnectingGithub)}
          {source.sourceType === 'github' && btn(isSyncing ? 'Syncing...' : 'Sync', () => onSync(source.id), false, isSyncing)}
          {source.sourceType !== 'github' && btn(isSyncing ? 'Syncing...' : 'Sync', () => onSync(source.id), false, isSyncing)}
          {btn('Disconnect', () => onRemove(source.id))}
        </div>
      </div>
      <div style={{ fontSize: 12, color: subTextColor, marginBottom: 12 }}>
        Last index: {source.lastSyncedAt ? new Date(source.lastSyncedAt).toLocaleString() : 'Never'}
      </div>
      {source.lastError && (
        <div style={{ fontSize: 12, color: '#f44336', marginBottom: 12 }}>{source.lastError}</div>
      )}
      {source.sourceType === 'github' && source.connectionStatus === 'connected' && githubRepos.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 500, marginBottom: 8 }}>Repository scope</div>
          <div style={{ maxHeight: 240, overflowY: 'auto', border: `1px solid ${borderColor}`, borderRadius: 4, padding: 8 }}>
            {githubRepos.map(repo => (
              <label key={repo} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4, fontSize: 12, cursor: 'pointer' }}>
                <input type="checkbox" checked={selectedGithubRepos.includes(repo)} onChange={() => onToggleRepo(repo)} />
                {repo}
                {indexedGithubRepos.includes(repo) && <span style={{ fontSize: 11, color: subTextColor, marginLeft: 4 }}>indexed</span>}
              </label>
            ))}
          </div>
          <div style={{ marginTop: 6 }}>
            {btn(isSavingRepos ? 'Saving and indexing...' : 'Save and Index', onSaveRepos, true, isSavingRepos)}
          </div>
        </div>
      )}
    </div>
  )
}

function AvailableDetail(props: {
  title: string
  desc: string
  setupSteps?: string[]
  theme: string
  textColor: string
  subTextColor: string
  borderColor: string
  displayName?: string
  url?: string
  onDisplayNameChange?: (v: string) => void
  onUrlChange?: (v: string) => void
  onAdd?: () => void
  canAdd?: boolean
  isAdding?: boolean
  oauthConfigured?: boolean
  showOAuthForm?: boolean
  oauthClientId?: string
  oauthClientSecret?: string
  onOAuthClientIdChange?: (v: string) => void
  onOAuthClientSecretChange?: (v: string) => void
  onShowOAuthForm?: (v: boolean) => void
  onSaveOAuth?: () => void
  onConnect?: () => void
  githubSource?: IntegrationSource | null
  isConnecting?: boolean
  isSavingOAuth?: boolean
  getStatusInfo?: (s: IntegrationSource) => { label: string; color: string }
  githubRepos?: string[]
  indexedGithubRepos?: string[]
  selectedGithubRepos?: string[]
  onToggleRepo?: (repo: string) => void
  onSaveRepos?: () => void
  isSavingRepos?: boolean
  btn: (l: string, fn: () => void, p?: boolean, d?: boolean) => JSX.Element
}) {
  const {
    title,
    desc,
    setupSteps = [],
    theme,
    textColor,
    subTextColor,
    borderColor,
    displayName = '',
    url = '',
    onDisplayNameChange,
    onUrlChange,
    onAdd,
    canAdd = false,
    isAdding = false,
    oauthConfigured,
    showOAuthForm,
    oauthClientId = '',
    oauthClientSecret = '',
    onOAuthClientIdChange,
    onOAuthClientSecretChange,
    onShowOAuthForm,
    onSaveOAuth,
    onConnect,
    githubSource,
    isConnecting,
    isSavingOAuth,
    getStatusInfo,
    githubRepos = [],
    indexedGithubRepos = [],
    selectedGithubRepos = [],
    onToggleRepo,
    onSaveRepos,
    isSavingRepos,
    btn,
  } = props

  const isRss = !!onDisplayNameChange
  const inputStyle = {
    width: '100%',
    padding: '8px 10px',
    fontSize: 12,
    border: `1px solid ${borderColor}`,
    borderRadius: 4,
    backgroundColor: theme === 'dark' ? '#252526' : '#fff',
    color: textColor,
    boxSizing: 'border-box' as const,
    marginBottom: 8,
  }

  const Icon = isRss ? RssFeedIcon : CodeIcon
  return (
    <div style={{ padding: 16 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, marginBottom: 20 }}>
        <Icon style={{ fontSize: 48, color: subTextColor, flexShrink: 0 }} />
        <div>
          <h2 style={{ margin: '0 0 4px', fontSize: 18, fontWeight: 600 }}>{title}</h2>
          <p style={{ margin: 0, fontSize: 13, color: subTextColor, lineHeight: 1.5 }}>{desc}</p>
        </div>
      </div>
      {setupSteps.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8, color: subTextColor }}>Setup</div>
          <ol style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: subTextColor, lineHeight: 1.7 }}>
            {setupSteps.map((step, i) => (
              <li key={i} style={{ marginBottom: 4 }}>{step}</li>
            ))}
          </ol>
        </div>
      )}
      {isRss ? (
        <div style={{ maxWidth: 400 }}>
          <input
            value={displayName}
            onChange={e => onDisplayNameChange?.(e.target.value)}
            placeholder="Display name (optional)"
            style={inputStyle}
          />
          <input
            value={url}
            onChange={e => onUrlChange?.(e.target.value)}
            placeholder="https://example.com/feed.xml"
            style={inputStyle}
          />
          {btn(isAdding ? 'Adding...' : 'Add', onAdd!, true, !canAdd || isAdding)}
        </div>
      ) : (
        <>
          {!oauthConfigured && (
            <div style={{ marginBottom: 16, padding: 12, border: `1px solid ${borderColor}`, borderRadius: 4 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <SettingsIcon style={{ fontSize: 18, color: subTextColor }} />
                <span style={{ fontSize: 12, fontWeight: 500 }}>OAuth setup</span>
              </div>
              {showOAuthForm ? (
                <div>
                  <input value={oauthClientId} onChange={e => onOAuthClientIdChange?.(e.target.value)} placeholder="Client ID" style={inputStyle} />
                  <input
                    value={oauthClientSecret}
                    onChange={e => onOAuthClientSecretChange?.(e.target.value)}
                    placeholder="Client Secret"
                    type="password"
                    style={inputStyle}
                  />
                  <div style={{ display: 'flex', gap: 8 }}>
                    {btn('Save', onSaveOAuth!, true, isSavingOAuth)}
                    {btn('Cancel', () => onShowOAuthForm?.(false))}
                  </div>
                </div>
              ) : (
                btn('Configure', () => onShowOAuthForm?.(true))
              )}
            </div>
          )}
          {githubSource ? (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                <span style={{ fontSize: 12, color: getStatusInfo?.(githubSource).color }}>{getStatusInfo?.(githubSource).label}</span>
                {(githubSource.connectionStatus === 'expired' || githubSource.connectionStatus === 'error') && (
                  btn('Reconnect', onConnect!, true, isConnecting)
                )}
              </div>
              {githubSource.connectionStatus === 'connected' && githubRepos.length > 0 && (
                <div>
                  <div style={{ fontSize: 12, fontWeight: 500, marginBottom: 8 }}>Repository scope</div>
                  <div style={{ maxHeight: 240, overflowY: 'auto', border: `1px solid ${borderColor}`, borderRadius: 4, padding: 8, marginBottom: 8 }}>
                    {githubRepos.map(repo => (
                      <label key={repo} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4, fontSize: 12, cursor: 'pointer' }}>
                        <input type="checkbox" checked={selectedGithubRepos.includes(repo)} onChange={() => onToggleRepo?.(repo)} />
                        {repo}
                        {indexedGithubRepos.includes(repo) && <span style={{ fontSize: 11, color: subTextColor, marginLeft: 4 }}>indexed</span>}
                      </label>
                    ))}
                  </div>
                  <div style={{ marginTop: 6 }}>{btn(isSavingRepos ? 'Saving and indexing...' : 'Save and Index', onSaveRepos!, true, isSavingRepos)}</div>
                </div>
              )}
            </div>
          ) : (
            btn(isConnecting ? 'Connecting...' : 'Connect', onConnect!, true, isConnecting)
          )}
        </>
      )}
    </div>
  )
}
