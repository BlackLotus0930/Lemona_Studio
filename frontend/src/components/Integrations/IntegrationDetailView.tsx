import { useTheme } from '../../contexts/ThemeContext'
import { useIntegrations } from './IntegrationsContext'
import type { IntegrationTabItem } from './IntegrationsContext'
import { getIntegrationLabel, getIntegrationLogoSrc, IntegrationLogoImg } from './availableIntegrations'

export default function IntegrationDetailView({ tab }: { tab: IntegrationTabItem }) {
  const { theme } = useTheme()
  const ctx = useIntegrations()
  const {
    error,
    setError,
    successMessage,
    sources,
    getStatusInfo,
    githubRepos,
    indexedGithubRepos,
    selectedGithubRepos,
    setSelectedGithubRepos,
    syncingSourceId,
    displayName,
    setDisplayName,
    url,
    setUrl,
    oauthClientId,
    setOauthClientId,
    oauthClientSecret,
    setOauthClientSecret,
    oauthStatus,
    githubSource,
    canAdd,
    isAdding,
    isConnectingGithub,
    isSavingGithubRepos,
    handleAddSource,
    handleSyncSource,
    handleRemove,
    handleConnectGithub,
    cancelConnectGithub,
    handleSaveGithubRepos,
  } = ctx

  const textColor = theme === 'dark' ? '#cccccc' : '#333333'
  const subTextColor = theme === 'dark' ? '#858585' : '#6e6e6e'
  const borderColor = theme === 'dark' ? '#3c3c3c' : '#e0e0e0'

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

  if (tab.type === 'source') {
    const source = sources.find(s => s.id === tab.source.id) ?? tab.source
    const cfg = source.config as { url?: string; login?: string }
    const label = source.displayName || (source.sourceType === 'github' ? 'GitHub' : 'RSS')
    const status = getStatusInfo(source)
    const isSyncing = syncingSourceId === source.id
    const needsReconnect = source.sourceType === 'github' && (source.connectionStatus === 'expired' || source.connectionStatus === 'error')
    const logoSrc = getIntegrationLogoSrc(source.sourceType)
    const manageSteps = source.sourceType === 'github'
      ? [
          'Select repos and click Save and Index to sync issues, PRs, and repo files.',
          'Click Sync to fetch new or removed content and update the index.',
          'Use @github in chat to filter AI context by GitHub content.',
        ]
      : ['Click Sync to refresh feed content.', 'Content is indexed for AI context.']

    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        {error && (
          <div style={{ padding: 8, backgroundColor: theme === 'dark' ? '#3d2020' : '#ffebee', color: '#f44336', fontSize: 12, flexShrink: 0, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>{error}</span>
            <button onClick={() => setError(null)} style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', fontSize: 14 }}>×</button>
          </div>
        )}
        {successMessage && (
          <div style={{ padding: 8, backgroundColor: theme === 'dark' ? '#1e3a1e' : '#e8f5e9', color: '#4caf50', fontSize: 12, flexShrink: 0 }}>
            {successMessage}
          </div>
        )}
      <div style={{ padding: 16, flex: 1, overflow: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, marginBottom: 20 }}>
          {logoSrc ? (
            <IntegrationLogoImg kind={source.sourceType} size={48} />
          ) : (
            <div style={{ width: 48, height: 48, flexShrink: 0, backgroundColor: subTextColor, opacity: 0.3, borderRadius: 8 }} />
          )}
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
            {needsReconnect && btn(isConnectingGithub ? 'Reconnecting...' : 'Reconnect', handleConnectGithub, true, isConnectingGithub)}
            {source.sourceType === 'github' && btn(isSyncing ? 'Syncing...' : 'Sync', () => handleSyncSource(source.id), false, isSyncing)}
            {source.sourceType !== 'github' && btn(isSyncing ? 'Syncing...' : 'Sync', () => handleSyncSource(source.id), false, isSyncing)}
            {btn('Disconnect', () => handleRemove(source.id))}
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
                  <input
                    type="checkbox"
                    checked={selectedGithubRepos.includes(repo)}
                    onChange={() => setSelectedGithubRepos(prev => (prev.includes(repo) ? prev.filter(r => r !== repo) : [...prev, repo]))}
                  />
                  {repo}
                  {indexedGithubRepos.includes(repo) && <span style={{ fontSize: 11, color: subTextColor, marginLeft: 4 }}>indexed</span>}
                </label>
              ))}
            </div>
            <div style={{ marginTop: 6 }}>
              {btn(isSavingGithubRepos ? 'Saving and indexing...' : 'Save and Index', handleSaveGithubRepos, true, isSavingGithubRepos)}
            </div>
          </div>
        )}
      </div>
      </div>
    )
  }

  const isRss = tab.kind === 'rss'
  const isGithub = tab.kind === 'github'
  if (!isRss && !isGithub) {
    const logoSrc = getIntegrationLogoSrc(tab.kind)
    return (
      <div style={{ padding: 24, flex: 1, overflow: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, marginBottom: 20 }}>
          {logoSrc ? (
            <IntegrationLogoImg kind={tab.kind} size={48} />
          ) : (
            <div style={{ width: 48, height: 48, flexShrink: 0, backgroundColor: subTextColor, opacity: 0.3, borderRadius: 8 }} />
          )}
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
  const logoSrc = getIntegrationLogoSrc(tab.kind)
  const setupSteps: string[] = isRss
    ? [
        'Enter a display name (optional) to identify this feed.',
        'Paste the feed URL (e.g. https://blog.example.com/feed.xml).',
        'Click Add — the feed will be synced and indexed for AI context.',
      ]
    : (isGithub ? [
        'Go to GitHub → Settings → Developer settings → OAuth Apps → New OAuth App.',
        'Application name: any name (e.g. Lemona). Homepage URL: use https://github.com or https://localhost — any valid URL works.',
        'Authorization callback URL: http://127.0.0.1/oauth/callback (Lemona uses a dynamic port; if Connect fails, check the error for the exact URL).',
        'If you see Webhook URL, you\'re on GitHub Apps — use OAuth Apps instead. Copy Client ID and Client Secret, paste below, then Save.',
        'Click Connect to authorize. Select repos and click Save and Index.',
      ] : [])
  const title = isRss ? 'RSS Feed' : 'GitHub'
  const desc = isRss
    ? 'Subscribe to blogs, news, or podcasts. Content is indexed for AI context.'
    : 'Connect your repos to index issues, pull requests, and repo files (README, source code).'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {error && (
        <div
          style={{
            padding: 8,
            backgroundColor: theme === 'dark' ? '#3d2020' : '#ffebee',
            color: '#f44336',
            fontSize: 12,
            flexShrink: 0,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <span>{error}</span>
          <button onClick={() => setError(null)} style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', fontSize: 14 }}>×</button>
        </div>
      )}
      {successMessage && (
        <div
          style={{
            padding: 8,
            backgroundColor: theme === 'dark' ? '#1e3a1e' : '#e8f5e9',
            color: '#4caf50',
            fontSize: 12,
            flexShrink: 0,
          }}
        >
          {successMessage}
        </div>
      )}
    <div style={{ padding: 16, flex: 1, overflow: 'auto' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, marginBottom: 20 }}>
        {logoSrc ? (
          <IntegrationLogoImg kind={tab.kind} size={48} />
        ) : (
          <div style={{ width: 48, height: 48, flexShrink: 0, backgroundColor: subTextColor, opacity: 0.3, borderRadius: 8 }} />
        )}
        <div>
          <h2 style={{ margin: '0 0 4px', fontSize: 18, fontWeight: 600 }}>{title}</h2>
          <p style={{ margin: 0, fontSize: 13, color: subTextColor, lineHeight: 1.5 }}>{desc}</p>
        </div>
      </div>
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8, color: subTextColor }}>Setup</div>
        <ol style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: subTextColor, lineHeight: 1.7 }}>
          {setupSteps.map((step, i) => (
            <li key={i} style={{ marginBottom: 4 }}>{step}</li>
          ))}
        </ol>
      </div>
      {isRss ? (
        <div style={{ maxWidth: 400 }}>
          <input
            value={displayName}
            onChange={e => setDisplayName(e.target.value)}
            placeholder="Display name (optional)"
            style={inputStyle}
          />
          <input
            value={url}
            onChange={e => setUrl(e.target.value)}
            placeholder="https://example.com/feed.xml"
            style={inputStyle}
          />
          {btn(isAdding ? 'Adding...' : 'Add', handleAddSource, true, !canAdd || isAdding)}
        </div>
      ) : (
        <>
          {!oauthStatus?.configured && (
            <div style={{ marginBottom: 16, maxWidth: 400 }}>
              <input value={oauthClientId} onChange={e => setOauthClientId(e.target.value)} placeholder="Client ID" style={inputStyle} />
              <input
                value={oauthClientSecret}
                onChange={e => setOauthClientSecret(e.target.value)}
                placeholder="Client Secret"
                type="password"
                style={inputStyle}
              />
            </div>
          )}
          {githubSource ? (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                <span style={{ fontSize: 12, color: getStatusInfo(githubSource).color }}>{getStatusInfo(githubSource).label}</span>
                {(githubSource.connectionStatus === 'expired' || githubSource.connectionStatus === 'error') && (
                  <>
                    {btn(isConnectingGithub ? 'Reconnecting...' : 'Reconnect', handleConnectGithub, true, isConnectingGithub)}
                    {isConnectingGithub && btn('Cancel', cancelConnectGithub, false)}
                  </>
                )}
              </div>
              {githubSource.connectionStatus === 'connected' && githubRepos.length > 0 && (
                <div>
                  <div style={{ fontSize: 12, fontWeight: 500, marginBottom: 8 }}>Repository scope</div>
                  <div style={{ maxHeight: 240, overflowY: 'auto', border: `1px solid ${borderColor}`, borderRadius: 4, padding: 8, marginBottom: 8 }}>
                    {githubRepos.map(repo => (
                      <label key={repo} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4, fontSize: 12, cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={selectedGithubRepos.includes(repo)}
                          onChange={() => setSelectedGithubRepos(prev => (prev.includes(repo) ? prev.filter(r => r !== repo) : [...prev, repo]))}
                        />
                        {repo}
                        {indexedGithubRepos.includes(repo) && <span style={{ fontSize: 11, color: subTextColor, marginLeft: 4 }}>indexed</span>}
                      </label>
                    ))}
                  </div>
                  <div style={{ marginTop: 6 }}>
                    {btn(isSavingGithubRepos ? 'Saving and indexing...' : 'Save and Index', handleSaveGithubRepos, true, isSavingGithubRepos)}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div style={{ display: 'flex', gap: 8 }}>
              {btn(
                isConnectingGithub ? 'Connecting...' : 'Connect',
                handleConnectGithub,
                true,
                isConnectingGithub || (!oauthStatus?.configured && (!oauthClientId.trim() || !oauthClientSecret.trim()))
              )}
              {isConnectingGithub && btn('Cancel', cancelConnectGithub, false)}
            </div>
          )}
        </>
      )}
    </div>
    </div>
  )
}
