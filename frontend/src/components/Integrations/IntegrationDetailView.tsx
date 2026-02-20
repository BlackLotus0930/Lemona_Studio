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
    oauthCredentialsByProvider,
    setOauthCredentials,
    canAdd,
    canAddLinear,
    canAddStripe,
    canAddSentry,
    canAddPosthog,
    canAddMetabase,
    canAddHubspot,
    canAddDbSchema,
    handleAddDbSchemaSource,
    handleBrowseDbSchemaFolder,
    dbSchemaBasePath,
    setDbSchemaBasePath,
    isSelectingDbSchemaFolder,
    isAdding,
    isConnectingGithub,
    isSavingGithubRepos,
    handleAddSource,
    handleAddLinearSource,
    handleAddStripeSource,
    handleAddSentrySource,
    handleAddPosthogSource,
    handleAddMetabaseSource,
    handleAddHubspotSource,
    handleSyncSource,
    handleRemove,
    handleConnectGithub,
    cancelConnectGithub,
    handleConnectGitlab,
    cancelConnectGitlab,
    handleConnectSlack,
    cancelConnectSlack,
    handleConnectNotion,
    cancelConnectNotion,
    handleConnectQuickbooks,
    cancelConnectQuickbooks,
    handleSaveGithubRepos,
    handleSaveGitlabRepos,
    handleSaveSlackChannels,
    handleSaveNotionPages,
    githubSource,
    gitlabSource,
    slackSource,
    notionSource,
    quickbooksSource,
    gitlabRepos,
    indexedGitlabRepos,
    selectedGitlabRepos,
    setSelectedGitlabRepos,
    slackChannels,
    indexedSlackChannels,
    selectedSlackChannels,
    setSelectedSlackChannels,
    notionPages,
    indexedNotionPages,
    selectedNotionPages,
    setSelectedNotionPages,
    isConnectingGitlab,
    isSavingGitlabRepos,
    isConnectingSlack,
    isSavingSlackChannels,
    isConnectingNotion,
    isSavingNotionPages,
    isConnectingQuickbooks,
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
    const cfg = source.config as { url?: string; login?: string; apiKey?: string; organization?: string; projectId?: string; teamName?: string }
    const st = source.sourceType
    const label = source.displayName ||
      (st === 'github' ? 'GitHub' : st === 'gitlab' ? 'GitLab' : st === 'slack' ? 'Slack' : st === 'notion' ? 'Notion' : st === 'quickbooks' ? 'QuickBooks' : st === 'hubspot' ? 'HubSpot' : st === 'db-schema' ? 'DB Schema' : st === 'linear' ? 'Linear' : st === 'stripe' ? 'Stripe' : st === 'sentry' ? 'Sentry' : st === 'posthog' ? 'PostHog' : 'RSS')
    const status = getStatusInfo(source)
    const isSyncing = syncingSourceId === source.id
    const needsReconnect = (st === 'github' || st === 'gitlab' || st === 'slack' || st === 'notion' || st === 'quickbooks') && (source.connectionStatus === 'expired' || source.connectionStatus === 'error')
    const logoSrc = getIntegrationLogoSrc(source.sourceType)
    const manageSteps = st === 'github'
      ? [
          'Select repos and click Save and Index to sync issues, PRs, and repo files.',
          'Click Sync to fetch new or removed content and update the index.',
          'Use @github in chat to filter AI context by GitHub content.',
        ]
      : st === 'linear'
        ? [
            'Click Sync to fetch latest issues, projects, and cycles from Linear.',
            'Sync updates newly fetched items and removes missing ones from the integration index.',
            'Use @linear in chat to focus retrieval on Linear context.',
          ]
        : st === 'stripe'
          ? [
              'Click Sync to fetch customers, products, subscriptions, and invoices from Stripe.',
              'Sync updates newly fetched items and removes missing ones from the integration index.',
              'Use @stripe in chat to focus retrieval on Stripe context.',
            ]
          : st === 'sentry'
            ? [
                'Click Sync to fetch error issues from Sentry.',
                'Sync updates newly fetched items and removes missing ones from the integration index.',
                'Use @sentry in chat to focus retrieval on Sentry context.',
              ]
            : st === 'posthog'
              ? [
                  'Click Sync to fetch dashboards and insights from PostHog.',
                  'Sync updates newly fetched items and removes missing ones from the integration index.',
                  'Use @posthog in chat to focus retrieval on PostHog context.',
                ]
              : st === 'gitlab'
                ? [
                    'Select projects and click Save and Index to sync issues, merge requests, and repo files.',
                    'Click Sync to fetch new or removed content and update the index.',
                    'Use @gitlab in chat to filter AI context by GitLab content.',
                  ]
                : st === 'slack'
                  ? [
                      'Select channels and click Save and Index to sync conversation history.',
                      'Click Sync to fetch new or removed content and update the index.',
                      'Use @slack in chat to filter AI context by Slack content.',
                    ]
                  : st === 'notion'
                    ? [
                        'Select pages and click Save and Index to sync docs and wikis.',
                        'Click Sync to fetch new or removed content and update the index.',
                        'Use @notion in chat to filter AI context by Notion content.',
                      ]
                      : st === 'quickbooks'
                        ? [
                            'Click Sync to index customers and invoices.',
                            'Use @quickbooks in chat to filter AI context by QuickBooks data.',
                          ]
                        : st === 'hubspot'
                          ? [
                              'Click Sync to index contacts, deals, and companies.',
                              'Use @hubspot in chat to filter AI context by HubSpot data.',
                            ]
                          : st === 'db-schema'
                            ? [
                                'Click Sync to index SQL migrations, Prisma schemas, and other schema files.',
                                'Use @db-schema in chat to focus on schema context.',
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
              {st === 'github' || st === 'gitlab'
                ? `@${cfg.login || '—'}`
                : st === 'slack'
                  ? (cfg.teamName ? `Workspace: ${cfg.teamName}` : '—')
                  : st === 'notion'
                    ? ((cfg as { workspaceName?: string }).workspaceName ? `Workspace: ${(cfg as { workspaceName?: string }).workspaceName}` : '—')
                      : st === 'quickbooks'
                        ? ((cfg as { companyName?: string }).companyName ? `Company: ${(cfg as { companyName?: string }).companyName}` : '—')
                        : st === 'hubspot'
                          ? '—'
                          : st === 'db-schema'
                            ? ((cfg as { basePath?: string }).basePath ? `Folder: ${(cfg as { basePath?: string }).basePath}` : '—')
                            : st === 'linear' || st === 'stripe'
                  ? (cfg.apiKey ? 'API key configured' : 'API key missing')
                  : st === 'sentry'
                    ? `${cfg.organization ? `Org: ${cfg.organization}` : '—'}${cfg.apiKey ? ' • API key configured' : ''}`
                    : st === 'posthog'
                      ? `Project: ${cfg.projectId || '—'}${cfg.apiKey ? ' • API key configured' : ''}`
                      : cfg.url || '—'}
            </div>
            <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6, color: subTextColor }}>Manage</div>
            <ol style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: subTextColor, lineHeight: 1.6 }}>
              {manageSteps.map((s, i) => <li key={i} style={{ marginBottom: 2 }}>{s}</li>)}
            </ol>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {needsReconnect && st === 'github' && btn(isConnectingGithub ? 'Reconnecting...' : 'Reconnect', handleConnectGithub, true, isConnectingGithub)}
            {needsReconnect && st === 'gitlab' && btn(isConnectingGitlab ? 'Reconnecting...' : 'Reconnect', handleConnectGitlab, true, isConnectingGitlab)}
            {needsReconnect && st === 'slack' && btn(isConnectingSlack ? 'Reconnecting...' : 'Reconnect', handleConnectSlack, true, isConnectingSlack)}
            {needsReconnect && st === 'notion' && btn(isConnectingNotion ? 'Reconnecting...' : 'Reconnect', handleConnectNotion, true, isConnectingNotion)}
            {btn(isSyncing ? 'Syncing...' : 'Sync', () => handleSyncSource(source.id), false, isSyncing)}
            {btn('Disconnect', () => handleRemove(source.id))}
          </div>
        </div>
        <div style={{ fontSize: 12, color: subTextColor, marginBottom: 12 }}>
          Last index: {source.lastSyncedAt ? new Date(source.lastSyncedAt).toLocaleString() : 'Never'}
        </div>
        {source.lastError && (
          <div style={{ fontSize: 12, color: '#f44336', marginBottom: 12 }}>{source.lastError}</div>
        )}
        {st === 'github' && source.connectionStatus === 'connected' && githubRepos.length > 0 && (
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
        {st === 'slack' && source.connectionStatus === 'connected' && slackChannels.length > 0 && (
          <div style={{ marginTop: 12 }}>
            <div style={{ fontSize: 12, fontWeight: 500, marginBottom: 8 }}>Channel scope</div>
            <div style={{ maxHeight: 240, overflowY: 'auto', border: `1px solid ${borderColor}`, borderRadius: 4, padding: 8 }}>
              {slackChannels.map(ch => (
                <label key={ch.id} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4, fontSize: 12, cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={selectedSlackChannels.includes(ch.id)}
                    onChange={() => setSelectedSlackChannels(prev => (prev.includes(ch.id) ? prev.filter(c => c !== ch.id) : [...prev, ch.id]))}
                  />
                  #{ch.name}
                  {ch.isPrivate && <span style={{ fontSize: 11, color: subTextColor, marginLeft: 4 }}>private</span>}
                  {indexedSlackChannels.includes(ch.id) && <span style={{ fontSize: 11, color: subTextColor, marginLeft: 4 }}>indexed</span>}
                </label>
              ))}
            </div>
            <div style={{ marginTop: 6 }}>
              {btn(isSavingSlackChannels ? 'Saving and indexing...' : 'Save and Index', handleSaveSlackChannels, true, isSavingSlackChannels)}
            </div>
          </div>
        )}
        {st === 'notion' && source.connectionStatus === 'connected' && notionPages.length > 0 && (
          <div style={{ marginTop: 12 }}>
            <div style={{ fontSize: 12, fontWeight: 500, marginBottom: 8 }}>Page scope</div>
            <div style={{ maxHeight: 240, overflowY: 'auto', border: `1px solid ${borderColor}`, borderRadius: 4, padding: 8 }}>
              {notionPages.map(p => (
                <label key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4, fontSize: 12, cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={selectedNotionPages.includes(p.id)}
                    onChange={() => setSelectedNotionPages(prev => (prev.includes(p.id) ? prev.filter(id => id !== p.id) : [...prev, p.id]))}
                  />
                  {p.title || 'Untitled'}
                  {indexedNotionPages.includes(p.id) && <span style={{ fontSize: 11, color: subTextColor, marginLeft: 4 }}>indexed</span>}
                </label>
              ))}
            </div>
            <div style={{ marginTop: 6 }}>
              {btn(isSavingNotionPages ? 'Saving and indexing...' : 'Save and Index', handleSaveNotionPages, true, isSavingNotionPages)}
            </div>
          </div>
        )}
        {st === 'gitlab' && source.connectionStatus === 'connected' && gitlabRepos.length > 0 && (
          <div style={{ marginTop: 12 }}>
            <div style={{ fontSize: 12, fontWeight: 500, marginBottom: 8 }}>Project scope</div>
            <div style={{ maxHeight: 240, overflowY: 'auto', border: `1px solid ${borderColor}`, borderRadius: 4, padding: 8 }}>
              {gitlabRepos.map(repo => (
                <label key={repo} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4, fontSize: 12, cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={selectedGitlabRepos.includes(repo)}
                    onChange={() => setSelectedGitlabRepos(prev => (prev.includes(repo) ? prev.filter(r => r !== repo) : [...prev, repo]))}
                  />
                  {repo}
                  {indexedGitlabRepos.includes(repo) && <span style={{ fontSize: 11, color: subTextColor, marginLeft: 4 }}>indexed</span>}
                </label>
              ))}
            </div>
            <div style={{ marginTop: 6 }}>
              {btn(isSavingGitlabRepos ? 'Saving and indexing...' : 'Save and Index', handleSaveGitlabRepos, true, isSavingGitlabRepos)}
            </div>
          </div>
        )}
      </div>
      </div>
    )
  }

  const isRss = tab.kind === 'rss'
  const isGithub = tab.kind === 'github'
  const isLinear = tab.kind === 'linear'
  const isStripe = tab.kind === 'stripe'
  const isSentry = tab.kind === 'sentry'
  const isPosthog = tab.kind === 'posthog'
  const isMetabase = tab.kind === 'metabase'
  const isGitlab = tab.kind === 'gitlab'
  const isSlack = tab.kind === 'slack'
  const isNotion = tab.kind === 'notion'
  const isQuickbooks = tab.kind === 'quickbooks'
  const isHubspot = tab.kind === 'hubspot'
  const isDbSchema = tab.kind === 'db-schema'
  if (!isRss && !isGithub && !isGitlab && !isSlack && !isNotion && !isQuickbooks && !isHubspot && !isDbSchema && !isLinear && !isStripe && !isSentry && !isPosthog && !isMetabase) {
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
    : isLinear
      ? [
          'Create a Linear personal API key in Linear Settings → API.',
          'Paste the API key below and click Connect.',
          'After connect, click Sync to index issues, projects, and cycles.',
        ]
    : isStripe
      ? [
          'Copy your Stripe secret key from Stripe Dashboard → Developers → API keys.',
          'Use test key (sk_test_…) for development or live key (sk_live_…) for production.',
          'Paste the API key below and click Connect. Then click Sync to index customers, products, subscriptions, and invoices.',
        ]
    : isSentry
      ? [
          'Create an auth token in Sentry: User Settings → Auth Tokens (or Organization → Developer Settings → Internal Integration).',
          'Scopes needed: event:read or event:admin. Enter organization slug (from your Sentry URL, e.g. acme for sentry.io/acme/).',
          'Paste the token and org slug below, then Connect. Click Sync to index error issues.',
        ]
    : isPosthog
      ? [
          'Create a personal API key in PostHog: User Settings → Personal API Keys. Scopes: dashboard:read, insight:read.',
          'Host: US Cloud = us.posthog.com, EU Cloud = eu.posthog.com. Project ID is in your PostHog URL (e.g. us.posthog.com/project/12345 → 12345).',
          'Enter host, project ID, and API key below, then Connect. Click Sync to index dashboards and insights.',
        ]
    : isMetabase
      ? [
          'Create an API key in Metabase: Admin settings → Authentication → API Keys.',
          'Enter your Metabase URL (e.g. https://metabase.example.com) and API key below.',
          'Click Connect to add the source. Then click Sync to index dashboards and questions.',
        ]
    : isHubspot
      ? [
          'Create a private app in HubSpot: Settings → Integrations → Private Apps. Scopes: crm.objects.contacts.read, crm.objects.deals.read, crm.objects.companies.read.',
          'Copy the access token and paste below.',
          'Click Connect to add the source. Then click Sync to index contacts, deals, and companies.',
        ]
    : isDbSchema
      ? [
          'Choose the project folder that contains migrations, schema files (e.g. *.sql, schema.prisma).',
          'Click Browse to select a folder, or enter the path manually.',
          'Click Connect to add the source. Then click Sync to index schema files for AI context.',
        ]
    : isGithub
      ? [
          'Go to GitHub → Settings → Developer settings → OAuth Apps → New OAuth App.',
          'Application name: any name (e.g. Lemona). Homepage URL: use https://github.com or https://localhost — any valid URL works.',
          'Authorization callback URL: https://127.0.0.1:38473/oauth/callback',
          'If you see Webhook URL, you\'re on GitHub Apps — use OAuth Apps instead. Copy Client ID and Client Secret, paste below, then Save.',
          'Click Connect to authorize. Select repos and click Save and Index.',
        ]
      : isGitlab
        ? [
            'Go to GitLab → Preferences → Applications → create an application.',
            'Name: any (e.g. Lemona). Redirect URI: https://127.0.0.1:38473/oauth/callback',
            'Scopes: read_api, read_repository, read_user. Copy Application ID and Secret, paste below, then Save.',
            'Click Connect to authorize. Select projects and click Save and Index.',
          ]
        : isSlack
          ? [
              'Go to api.slack.com/apps → Create New App → From scratch. Name it (e.g. Lemona).',
              'OAuth & Permissions → Redirect URLs: add https://127.0.0.1:38473/oauth/callback',
              'Scopes: channels:read, channels:history, groups:read, groups:history (Bot Token Scopes). Copy Client ID and Client Secret, paste below, then Save.',
              'Click Connect to authorize. Invite the app to channels you want to index (e.g. /invite @YourApp in each channel). Select channels and click Save and Index.',
            ]
            : isNotion
            ? [
                'Go to notion.so/my-integrations → New integration. Name it (e.g. Lemona).',
                'Capabilities: read content, read user info. Copy OAuth domain and credentials (Client ID, Client Secret).',
                'Redirect URL: https://127.0.0.1:38473/oauth/callback. Paste below, then Save.',
                'Click Connect to authorize. Share pages with the integration (⋯ → Add connections). Select pages and click Save and Index.',
              ]
            : isQuickbooks
              ? [
                  'Go to developer.intuit.com → Create an app → Keys & OAuth. Add redirect URI: https://127.0.0.1:38473/oauth/callback',
                  'Scopes: Accounting (com.intuit.quickbooks.accounting). Copy Client ID and Client Secret.',
                  'Paste below, then Save. Click Connect to authorize and select your company.',
                  'Click Sync to index customers and invoices for AI context.',
                ]
              : []
  const title = isRss ? 'RSS Feed' : isLinear ? 'Linear' : isStripe ? 'Stripe' : isSentry ? 'Sentry' : isPosthog ? 'PostHog' : isMetabase ? 'Metabase' : isGitlab ? 'GitLab' : isSlack ? 'Slack' : isNotion ? 'Notion' : isQuickbooks ? 'QuickBooks' : isHubspot ? 'HubSpot' : isDbSchema ? 'DB Schema' : 'GitHub'
  const desc = isRss
    ? 'Subscribe to blogs, news, or podcasts. Content is indexed for AI context.'
    : isLinear
      ? 'Connect Linear using a personal API key to index issues, projects, and cycles.'
      : isStripe
        ? 'Connect Stripe using a secret API key to index customers, products, subscriptions, and invoices.'
        : isSentry
          ? 'Connect Sentry using an auth token and organization slug to index error issues.'
          : isPosthog
            ? 'Connect PostHog using a personal API key and project ID to index dashboards and insights.'
            : isMetabase
              ? 'Connect Metabase using an API key and instance URL to index dashboards and questions.'
              : isGitlab
                ? 'Connect GitLab using OAuth to index projects, issues, merge requests, and repo files.'
                : isSlack
                  ? 'Connect Slack using OAuth to index channel conversations for AI context.'
                  : isNotion
                    ? 'Connect Notion using OAuth to index pages and docs for AI context.'
                      : isQuickbooks
                        ? 'Connect QuickBooks using OAuth to index customers and invoices for AI context.'
                        : isHubspot
                          ? 'Connect HubSpot using a private app token to index contacts, deals, and companies for AI context.'
                          : isDbSchema
                            ? 'Index local SQL migrations, Prisma schemas, and other schema files for AI context.'
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
      ) : isLinear ? (
        <div style={{ maxWidth: 400 }}>
          <input
            value={displayName}
            onChange={e => setDisplayName(e.target.value)}
            placeholder="Display name (optional)"
            style={inputStyle}
          />
          <input
            value={linearApiKey}
            onChange={e => setLinearApiKey(e.target.value)}
            placeholder="Linear API key"
            type="password"
            style={inputStyle}
          />
          {btn(isAdding ? 'Connecting...' : 'Connect', handleAddLinearSource, true, !canAddLinear || isAdding)}
        </div>
      ) : isStripe ? (
        <div style={{ maxWidth: 400 }}>
          <input
            value={displayName}
            onChange={e => setDisplayName(e.target.value)}
            placeholder="Display name (optional)"
            style={inputStyle}
          />
          <input
            value={stripeApiKey}
            onChange={e => setStripeApiKey(e.target.value)}
            placeholder="Stripe secret key (sk_test_... or sk_live_...)"
            type="password"
            style={inputStyle}
          />
          {btn(isAdding ? 'Connecting...' : 'Connect', handleAddStripeSource, true, !canAddStripe || isAdding)}
        </div>
      ) : isSentry ? (
        <div style={{ maxWidth: 400 }}>
          <input
            value={displayName}
            onChange={e => setDisplayName(e.target.value)}
            placeholder="Display name (optional)"
            style={inputStyle}
          />
          <input
            value={sentryOrganization}
            onChange={e => setSentryOrganization(e.target.value)}
            placeholder="Organization slug (e.g. acme)"
            style={inputStyle}
          />
          <input
            value={sentryApiKey}
            onChange={e => setSentryApiKey(e.target.value)}
            placeholder="Sentry auth token"
            type="password"
            style={inputStyle}
          />
          {btn(isAdding ? 'Connecting...' : 'Connect', handleAddSentrySource, true, !canAddSentry || isAdding)}
        </div>
      ) : isPosthog ? (
        <div style={{ maxWidth: 400 }}>
          <input
            value={displayName}
            onChange={e => setDisplayName(e.target.value)}
            placeholder="Display name (optional)"
            style={inputStyle}
          />
          <input
            value={posthogHost}
            onChange={e => setPosthogHost(e.target.value)}
            placeholder="Host (e.g. https://us.posthog.com or US Cloud)"
            style={inputStyle}
          />
          <input
            value={posthogProjectId}
            onChange={e => setPosthogProjectId(e.target.value)}
            placeholder="Project ID"
            style={inputStyle}
          />
          <input
            value={posthogApiKey}
            onChange={e => setPosthogApiKey(e.target.value)}
            placeholder="PostHog personal API key"
            type="password"
            style={inputStyle}
          />
          {btn(isAdding ? 'Connecting...' : 'Connect', handleAddPosthogSource, true, !canAddPosthog || isAdding)}
        </div>
      ) : isMetabase ? (
        <div style={{ maxWidth: 400 }}>
          <input
            value={displayName}
            onChange={e => setDisplayName(e.target.value)}
            placeholder="Display name (optional)"
            style={inputStyle}
          />
          <input
            value={metabaseUrl}
            onChange={e => setMetabaseUrl(e.target.value)}
            placeholder="Metabase URL (e.g. https://metabase.example.com)"
            style={inputStyle}
          />
          <input
            value={metabaseApiKey}
            onChange={e => setMetabaseApiKey(e.target.value)}
            placeholder="Metabase API key"
            type="password"
            style={inputStyle}
          />
          {btn(isAdding ? 'Connecting...' : 'Connect', handleAddMetabaseSource, true, !canAddMetabase || isAdding)}
        </div>
      ) : isHubspot ? (
        <div style={{ maxWidth: 400 }}>
          <input
            value={displayName}
            onChange={e => setDisplayName(e.target.value)}
            placeholder="Display name (optional)"
            style={inputStyle}
          />
          <input
            value={hubspotApiKey}
            onChange={e => setHubspotApiKey(e.target.value)}
            placeholder="HubSpot private app access token"
            type="password"
            style={inputStyle}
          />
          {btn(isAdding ? 'Connecting...' : 'Connect', handleAddHubspotSource, true, !canAddHubspot || isAdding)}
        </div>
      ) : isDbSchema ? (
        <div style={{ maxWidth: 400 }}>
          <input
            value={displayName}
            onChange={e => setDisplayName(e.target.value)}
            placeholder="Display name (optional)"
            style={inputStyle}
          />
          <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
            <input
              value={dbSchemaBasePath}
              onChange={e => setDbSchemaBasePath(e.target.value)}
              placeholder="Project folder path (e.g. C:\Projects\my-app)"
              style={{ ...inputStyle, flex: 1, marginBottom: 0 }}
            />
            {btn(isSelectingDbSchemaFolder ? 'Selecting...' : 'Browse', handleBrowseDbSchemaFolder, false, isSelectingDbSchemaFolder)}
          </div>
          {btn(isAdding ? 'Connecting...' : 'Connect', handleAddDbSchemaSource, true, !canAddDbSchema || isAdding)}
        </div>
      ) : isSlack ? (
        <>
          {!slackSource && (
            <div style={{ marginBottom: 16, maxWidth: 400 }}>
              <div style={{ fontSize: 12, color: subTextColor, marginBottom: 6 }}>OAuth app credentials (edit and retry if connect failed)</div>
              <input value={oauthCredentialsByProvider.slack.clientId} onChange={e => setOauthCredentials('slack', { clientId: e.target.value })} placeholder="Client ID" style={inputStyle} />
              <input
                value={oauthCredentialsByProvider.slack.clientSecret}
                onChange={e => setOauthCredentials('slack', { clientSecret: e.target.value })}
                placeholder="Client Secret"
                type="password"
                style={inputStyle}
              />
            </div>
          )}
          {slackSource ? (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                <span style={{ fontSize: 12, color: getStatusInfo(slackSource).color }}>{getStatusInfo(slackSource).label}</span>
                {(slackSource.connectionStatus === 'expired' || slackSource.connectionStatus === 'error') && (
                  <>
                    {btn(isConnectingSlack ? 'Reconnecting...' : 'Reconnect', handleConnectSlack, true, isConnectingSlack)}
                    {isConnectingSlack && btn('Cancel', cancelConnectSlack, false)}
                  </>
                )}
              </div>
              {slackSource.connectionStatus === 'connected' && slackChannels.length > 0 && (
                <div>
                  <div style={{ fontSize: 12, fontWeight: 500, marginBottom: 8 }}>Channel scope</div>
                  <div style={{ maxHeight: 240, overflowY: 'auto', border: `1px solid ${borderColor}`, borderRadius: 4, padding: 8, marginBottom: 8 }}>
                    {slackChannels.map(ch => (
                      <label key={ch.id} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4, fontSize: 12, cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={selectedSlackChannels.includes(ch.id)}
                          onChange={() => setSelectedSlackChannels(prev => (prev.includes(ch.id) ? prev.filter(c => c !== ch.id) : [...prev, ch.id]))}
                        />
                        #{ch.name}
                        {ch.isPrivate && <span style={{ fontSize: 11, color: subTextColor, marginLeft: 4 }}>private</span>}
                        {indexedSlackChannels.includes(ch.id) && <span style={{ fontSize: 11, color: subTextColor, marginLeft: 4 }}>indexed</span>}
                      </label>
                    ))}
                  </div>
                  <div style={{ marginTop: 6 }}>
                    {btn(isSavingSlackChannels ? 'Saving and indexing...' : 'Save and Index', handleSaveSlackChannels, true, isSavingSlackChannels)}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {btn(
                isConnectingSlack ? 'Connecting...' : 'Connect',
                handleConnectSlack,
                true,
                isConnectingSlack || (!oauthCredentialsByProvider.slack.clientId.trim() || !oauthCredentialsByProvider.slack.clientSecret.trim())
              )}
              {isConnectingSlack && btn('Cancel', cancelConnectSlack, false)}
            </div>
          )}
        </>
      ) : isNotion ? (
        <>
          {!notionSource && (
            <div style={{ marginBottom: 16, maxWidth: 400 }}>
              <div style={{ fontSize: 12, color: subTextColor, marginBottom: 6 }}>OAuth app credentials (edit and retry if connect failed)</div>
              <input value={oauthCredentialsByProvider.notion.clientId} onChange={e => setOauthCredentials('notion', { clientId: e.target.value })} placeholder="Client ID" style={inputStyle} />
              <input
                value={oauthCredentialsByProvider.notion.clientSecret}
                onChange={e => setOauthCredentials('notion', { clientSecret: e.target.value })}
                placeholder="Client Secret"
                type="password"
                style={inputStyle}
              />
            </div>
          )}
          {notionSource ? (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                <span style={{ fontSize: 12, color: getStatusInfo(notionSource).color }}>{getStatusInfo(notionSource).label}</span>
                {(notionSource.connectionStatus === 'expired' || notionSource.connectionStatus === 'error') && (
                  <>
                    {btn(isConnectingNotion ? 'Reconnecting...' : 'Reconnect', handleConnectNotion, true, isConnectingNotion)}
                    {isConnectingNotion && btn('Cancel', cancelConnectNotion, false)}
                  </>
                )}
              </div>
              {notionSource.connectionStatus === 'connected' && notionPages.length > 0 && (
                <div>
                  <div style={{ fontSize: 12, fontWeight: 500, marginBottom: 8 }}>Page scope</div>
                  <div style={{ maxHeight: 240, overflowY: 'auto', border: `1px solid ${borderColor}`, borderRadius: 4, padding: 8, marginBottom: 8 }}>
                    {notionPages.map(p => (
                      <label key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4, fontSize: 12, cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={selectedNotionPages.includes(p.id)}
                          onChange={() => setSelectedNotionPages(prev => (prev.includes(p.id) ? prev.filter(id => id !== p.id) : [...prev, p.id]))}
                        />
                        {p.title || 'Untitled'}
                        {indexedNotionPages.includes(p.id) && <span style={{ fontSize: 11, color: subTextColor, marginLeft: 4 }}>indexed</span>}
                      </label>
                    ))}
                  </div>
                  <div style={{ marginTop: 6 }}>
                    {btn(isSavingNotionPages ? 'Saving and indexing...' : 'Save and Index', handleSaveNotionPages, true, isSavingNotionPages)}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {btn(
                isConnectingNotion ? 'Connecting...' : 'Connect',
                handleConnectNotion,
                true,
                isConnectingNotion || (!oauthCredentialsByProvider.notion.clientId.trim() || !oauthCredentialsByProvider.notion.clientSecret.trim())
              )}
              {isConnectingNotion && btn('Cancel', cancelConnectNotion, false)}
            </div>
          )}
        </>
      ) : isQuickbooks ? (
        <>
          {!quickbooksSource && (
            <div style={{ marginBottom: 16, maxWidth: 400 }}>
              <div style={{ fontSize: 12, color: subTextColor, marginBottom: 6 }}>OAuth app credentials (edit and retry if connect failed)</div>
              <input value={oauthCredentialsByProvider.quickbooks.clientId} onChange={e => setOauthCredentials('quickbooks', { clientId: e.target.value })} placeholder="Application ID" style={inputStyle} />
              <input
                value={oauthCredentialsByProvider.quickbooks.clientSecret}
                onChange={e => setOauthCredentials('quickbooks', { clientSecret: e.target.value })}
                placeholder="Client Secret"
                type="password"
                style={inputStyle}
              />
            </div>
          )}
          {quickbooksSource ? (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                <span style={{ fontSize: 12, color: getStatusInfo(quickbooksSource).color }}>{getStatusInfo(quickbooksSource).label}</span>
                {(quickbooksSource.connectionStatus === 'expired' || quickbooksSource.connectionStatus === 'error') && (
                  <>
                    {btn(isConnectingQuickbooks ? 'Reconnecting...' : 'Reconnect', handleConnectQuickbooks, true, isConnectingQuickbooks)}
                    {isConnectingQuickbooks && btn('Cancel', cancelConnectQuickbooks, false)}
                  </>
                )}
              </div>
              <p style={{ margin: 0, fontSize: 12, color: subTextColor }}>Click Sync to index customers and invoices.</p>
            </div>
          ) : (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {btn(
                isConnectingQuickbooks ? 'Connecting...' : 'Connect',
                handleConnectQuickbooks,
                true,
                isConnectingQuickbooks || (!oauthCredentialsByProvider.quickbooks.clientId.trim() || !oauthCredentialsByProvider.quickbooks.clientSecret.trim())
              )}
              {isConnectingQuickbooks && btn('Cancel', cancelConnectQuickbooks, false)}
            </div>
          )}
        </>
      ) : isGitlab ? (
        <>
          {!gitlabSource && (
            <div style={{ marginBottom: 16, maxWidth: 400 }}>
              <div style={{ fontSize: 12, color: subTextColor, marginBottom: 6 }}>OAuth app credentials (edit and retry if connect failed)</div>
              <input value={oauthCredentialsByProvider.gitlab.clientId} onChange={e => setOauthCredentials('gitlab', { clientId: e.target.value })} placeholder="Application ID" style={inputStyle} />
              <input
                value={oauthCredentialsByProvider.gitlab.clientSecret}
                onChange={e => setOauthCredentials('gitlab', { clientSecret: e.target.value })}
                placeholder="Secret"
                type="password"
                style={inputStyle}
              />
            </div>
          )}
          {gitlabSource ? (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                <span style={{ fontSize: 12, color: getStatusInfo(gitlabSource).color }}>{getStatusInfo(gitlabSource).label}</span>
                {(gitlabSource.connectionStatus === 'expired' || gitlabSource.connectionStatus === 'error') && (
                  <>
                    {btn(isConnectingGitlab ? 'Reconnecting...' : 'Reconnect', handleConnectGitlab, true, isConnectingGitlab)}
                    {isConnectingGitlab && btn('Cancel', cancelConnectGitlab, false)}
                  </>
                )}
              </div>
              {gitlabSource.connectionStatus === 'connected' && gitlabRepos.length > 0 && (
                <div>
                  <div style={{ fontSize: 12, fontWeight: 500, marginBottom: 8 }}>Project scope</div>
                  <div style={{ maxHeight: 240, overflowY: 'auto', border: `1px solid ${borderColor}`, borderRadius: 4, padding: 8, marginBottom: 8 }}>
                    {gitlabRepos.map(repo => (
                      <label key={repo} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4, fontSize: 12, cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={selectedGitlabRepos.includes(repo)}
                          onChange={() => setSelectedGitlabRepos(prev => (prev.includes(repo) ? prev.filter(r => r !== repo) : [...prev, repo]))}
                        />
                        {repo}
                        {indexedGitlabRepos.includes(repo) && <span style={{ fontSize: 11, color: subTextColor, marginLeft: 4 }}>indexed</span>}
                      </label>
                    ))}
                  </div>
                  <div style={{ marginTop: 6 }}>
                    {btn(isSavingGitlabRepos ? 'Saving and indexing...' : 'Save and Index', handleSaveGitlabRepos, true, isSavingGitlabRepos)}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {btn(
                isConnectingGitlab ? 'Connecting...' : 'Connect',
                handleConnectGitlab,
                true,
                isConnectingGitlab || (!oauthCredentialsByProvider.gitlab.clientId.trim() || !oauthCredentialsByProvider.gitlab.clientSecret.trim())
              )}
              {isConnectingGitlab && btn('Cancel', cancelConnectGitlab, false)}
            </div>
          )}
        </>
      ) : (
        <>
          {!githubSource && (
            <div style={{ marginBottom: 16, maxWidth: 400 }}>
              <div style={{ fontSize: 12, color: subTextColor, marginBottom: 6 }}>OAuth app credentials (edit and retry if connect failed)</div>
              <input value={oauthCredentialsByProvider.github.clientId} onChange={e => setOauthCredentials('github', { clientId: e.target.value })} placeholder="Client ID" style={inputStyle} />
              <input
                value={oauthCredentialsByProvider.github.clientSecret}
                onChange={e => setOauthCredentials('github', { clientSecret: e.target.value })}
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
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {btn(
                isConnectingGithub ? 'Connecting...' : 'Connect',
                handleConnectGithub,
                true,
                isConnectingGithub || (!oauthCredentialsByProvider.github.clientId.trim() || !oauthCredentialsByProvider.github.clientSecret.trim())
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
