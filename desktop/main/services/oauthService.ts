import { shell } from 'electron'
import http from 'http'
import crypto from 'crypto'
import { oauthConfigStore } from './oauthConfigStore.js'

type OAuthSourceType = 'github' | 'gitlab' | 'slack' | 'notion' | 'quickbooks'

interface OAuthStartResult {
  accessToken: string
  refreshToken?: string
  expiresIn?: number
  login?: string
  teamName?: string
  teamId?: string
  workspaceId?: string
  workspaceName?: string
  realmId?: string
  companyName?: string
}

interface GithubTokenResponse {
  access_token?: string
  error?: string
  error_description?: string
}

interface GithubUserResponse {
  login?: string
}

interface CallbackPayload {
  code: string
  state: string
  realmId?: string
}

interface CallbackServer {
  redirectUri: string
  waitForCallback: Promise<CallbackPayload>
  close: () => Promise<void>
}

interface OAuthConfigStatus {
  sourceType: 'github' | 'gitlab' | 'slack' | 'notion' | 'quickbooks'
  configured: boolean
  configSource: 'saved' | 'env' | 'missing'
}

const OAUTH_TIMEOUT_MS = 2 * 60 * 1000
const GITHUB_OAUTH_HOST = 'https://github.com'
const GITHUB_API_HOST = 'https://api.github.com'
const GITLAB_OAUTH_HOST = 'https://gitlab.com'
const GITLAB_API_HOST = 'https://gitlab.com/api/v4'
const SLACK_OAUTH_HOST = 'https://slack.com'
const NOTION_OAUTH_HOST = 'https://api.notion.com'
const INTUIT_OAUTH_HOST = 'https://appcenter.intuit.com/connect/oauth2'
const INTUIT_TOKEN_HOST = 'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer'

async function getGithubClientConfig(): Promise<{ clientId: string; clientSecret: string }> {
  const saved = await oauthConfigStore.getGithubConfig()
  if (saved) {
    return saved
  }
  const clientId = (process.env.GITHUB_CLIENT_ID || '').trim()
  const clientSecret = (process.env.GITHUB_CLIENT_SECRET || '').trim()
  if (!clientId || !clientSecret) {
    throw new Error(
      'Missing GitHub OAuth configuration. Add Client ID/Secret in Integrations panel, or set GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET.'
    )
  }
  return { clientId, clientSecret }
}

export async function getOAuthConfigStatus(sourceType: 'github' | 'gitlab' | 'slack' | 'notion' | 'quickbooks'): Promise<OAuthConfigStatus> {
  if (sourceType === 'quickbooks') {
    const saved = await oauthConfigStore.getQuickBooksConfig()
    if (saved) {
      return { sourceType, configured: true, configSource: 'saved' }
    }
    const envClientId = (process.env.QUICKBOOKS_CLIENT_ID || '').trim()
    const envClientSecret = (process.env.QUICKBOOKS_CLIENT_SECRET || '').trim()
    if (envClientId && envClientSecret) {
      return { sourceType, configured: true, configSource: 'env' }
    }
    return { sourceType, configured: false, configSource: 'missing' }
  }
  if (sourceType === 'notion') {
    const saved = await oauthConfigStore.getNotionConfig()
    if (saved) {
      return { sourceType, configured: true, configSource: 'saved' }
    }
    const envClientId = (process.env.NOTION_CLIENT_ID || '').trim()
    const envClientSecret = (process.env.NOTION_CLIENT_SECRET || '').trim()
    if (envClientId && envClientSecret) {
      return { sourceType, configured: true, configSource: 'env' }
    }
    return { sourceType, configured: false, configSource: 'missing' }
  }
  if (sourceType === 'slack') {
    const saved = await oauthConfigStore.getSlackConfig()
    if (saved) {
      return { sourceType, configured: true, configSource: 'saved' }
    }
    const envClientId = (process.env.SLACK_CLIENT_ID || '').trim()
    const envClientSecret = (process.env.SLACK_CLIENT_SECRET || '').trim()
    if (envClientId && envClientSecret) {
      return { sourceType, configured: true, configSource: 'env' }
    }
    return { sourceType, configured: false, configSource: 'missing' }
  }
  if (sourceType === 'gitlab') {
    const saved = await oauthConfigStore.getGitlabConfig()
    if (saved) {
      return { sourceType, configured: true, configSource: 'saved' }
    }
    const envClientId = (process.env.GITLAB_CLIENT_ID || '').trim()
    const envClientSecret = (process.env.GITLAB_CLIENT_SECRET || '').trim()
    if (envClientId && envClientSecret) {
      return { sourceType, configured: true, configSource: 'env' }
    }
    return { sourceType, configured: false, configSource: 'missing' }
  }
  const saved = await oauthConfigStore.getGithubConfig()
  if (saved) {
    return { sourceType, configured: true, configSource: 'saved' }
  }
  const envClientId = (process.env.GITHUB_CLIENT_ID || '').trim()
  const envClientSecret = (process.env.GITHUB_CLIENT_SECRET || '').trim()
  if (envClientId && envClientSecret) {
    return { sourceType, configured: true, configSource: 'env' }
  }
  return { sourceType, configured: false, configSource: 'missing' }
}

export async function saveOAuthConfig(
  sourceType: 'github' | 'gitlab' | 'slack' | 'notion' | 'quickbooks',
  config: { clientId: string; clientSecret: string }
): Promise<OAuthConfigStatus> {
  if (sourceType === 'quickbooks') {
    await oauthConfigStore.saveQuickBooksConfig(config.clientId, config.clientSecret)
    return getOAuthConfigStatus(sourceType)
  }
  if (sourceType === 'notion') {
    await oauthConfigStore.saveNotionConfig(config.clientId, config.clientSecret)
    return getOAuthConfigStatus(sourceType)
  }
  if (sourceType === 'slack') {
    await oauthConfigStore.saveSlackConfig(config.clientId, config.clientSecret)
    return getOAuthConfigStatus(sourceType)
  }
  if (sourceType === 'gitlab') {
    await oauthConfigStore.saveGitlabConfig(config.clientId, config.clientSecret)
    return getOAuthConfigStatus(sourceType)
  }
  if (sourceType === 'github') {
    await oauthConfigStore.saveGithubConfig(config.clientId, config.clientSecret)
    return getOAuthConfigStatus(sourceType)
  }
  throw new Error(`Unsupported OAuth source type: ${sourceType}`)
}

function createCallbackServer(expectedState: string, successTitle = 'Connected'): Promise<CallbackServer> {
  return new Promise((resolve, reject) => {
    let callbackResolve: ((value: CallbackPayload) => void) | null = null
    let callbackReject: ((reason?: unknown) => void) | null = null
    const waitForCallback = new Promise<CallbackPayload>((resolvePromise, rejectPromise) => {
      callbackResolve = resolvePromise
      callbackReject = rejectPromise
    })

    const server = http.createServer((req, res) => {
      try {
        const url = new URL(req.url || '/', 'http://127.0.0.1')
        if (url.pathname !== '/oauth/callback') {
          res.statusCode = 404
          res.end('Not found')
          return
        }

        const code = url.searchParams.get('code') || ''
        const state = url.searchParams.get('state') || ''
        if (!code) {
          res.statusCode = 400
          res.end('Missing code')
          callbackReject?.(new Error('Missing OAuth code'))
          return
        }

        if (state !== expectedState) {
          res.statusCode = 400
          res.end('Invalid state')
          callbackReject?.(new Error('OAuth state mismatch'))
          return
        }

        res.statusCode = 200
        res.setHeader('Content-Type', 'text/html; charset=utf-8')
        res.end(`<html><body><h3>${successTitle}. You can close this window.</h3></body></html>`)
        const realmId = url.searchParams.get('realmId') || undefined
        callbackResolve?.({ code, state, realmId })
      } catch (error) {
        res.statusCode = 500
        res.end('OAuth callback parse error')
        callbackReject?.(error)
      }
    })

    server.on('error', error => reject(error))

    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      if (!address || typeof address === 'string') {
        reject(new Error('Failed to start OAuth callback server'))
        return
      }
      const redirectUri = `http://127.0.0.1:${address.port}/oauth/callback`
      resolve({
        waitForCallback,
        close: async () => {
          await new Promise<void>((closeResolve) => server.close(() => closeResolve()))
        },
        redirectUri,
      })
    })
  })
}

async function exchangeGithubCodeForToken(code: string, redirectUri: string): Promise<string> {
  const { clientId, clientSecret } = await getGithubClientConfig()
  const response = await fetch(`${GITHUB_OAUTH_HOST}/login/oauth/access_token`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'User-Agent': 'Lemona-Desktop',
    },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: redirectUri,
    }),
  })
  if (!response.ok) {
    throw new Error(`OAuth token exchange failed (${response.status})`)
  }
  const payload = (await response.json()) as GithubTokenResponse
  if (!payload.access_token) {
    throw new Error(payload.error_description || payload.error || 'No access_token returned from GitHub')
  }
  return payload.access_token
}

async function fetchGithubLogin(accessToken: string): Promise<string | undefined> {
  const response = await fetch(`${GITHUB_API_HOST}/user`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'Lemona-Desktop',
    },
  })
  if (!response.ok) {
    return undefined
  }
  const payload = (await response.json()) as GithubUserResponse
  return payload.login
}

async function getGitlabClientConfig(): Promise<{ clientId: string; clientSecret: string }> {
  const saved = await oauthConfigStore.getGitlabConfig()
  if (saved) {
    return saved
  }
  const clientId = (process.env.GITLAB_CLIENT_ID || '').trim()
  const clientSecret = (process.env.GITLAB_CLIENT_SECRET || '').trim()
  if (!clientId || !clientSecret) {
    throw new Error(
      'Missing GitLab OAuth configuration. Add Client ID/Secret in Integrations panel, or set GITLAB_CLIENT_ID and GITLAB_CLIENT_SECRET.'
    )
  }
  return { clientId, clientSecret }
}

async function buildGithubAuthUrl(redirectUri: string, state: string): Promise<string> {
  const { clientId } = await getGithubClientConfig()
  const params = new URLSearchParams({
    client_id: clientId,
    scope: 'repo read:user',
    redirect_uri: redirectUri,
    state,
  })
  return `${GITHUB_OAUTH_HOST}/login/oauth/authorize?${params.toString()}`
}

interface GitlabTokenResponse {
  access_token?: string
  error?: string
  error_description?: string
}

interface GitlabUserResponse {
  username?: string
}

async function exchangeGitlabCodeForToken(code: string, redirectUri: string): Promise<string> {
  const { clientId, clientSecret } = await getGitlabClientConfig()
  const response = await fetch(`${GITLAB_OAUTH_HOST}/oauth/token`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': 'Lemona-Desktop',
    },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri,
    }).toString(),
  })
  if (!response.ok) {
    throw new Error(`OAuth token exchange failed (${response.status})`)
  }
  const payload = (await response.json()) as GitlabTokenResponse
  if (!payload.access_token) {
    throw new Error(payload.error_description || payload.error || 'No access_token returned from GitLab')
  }
  return payload.access_token
}

async function fetchGitlabLogin(accessToken: string): Promise<string | undefined> {
  const response = await fetch(`${GITLAB_API_HOST}/user`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'User-Agent': 'Lemona-Desktop',
    },
  })
  if (!response.ok) {
    return undefined
  }
  const payload = (await response.json()) as GitlabUserResponse
  return payload.username
}

async function buildGitlabAuthUrl(redirectUri: string, state: string): Promise<string> {
  const { clientId } = await getGitlabClientConfig()
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    state,
    scope: 'read_api read_repository read_user',
  })
  return `${GITLAB_OAUTH_HOST}/oauth/authorize?${params.toString()}`
}

async function getSlackClientConfig(): Promise<{ clientId: string; clientSecret: string }> {
  const saved = await oauthConfigStore.getSlackConfig()
  if (saved) {
    return saved
  }
  const clientId = (process.env.SLACK_CLIENT_ID || '').trim()
  const clientSecret = (process.env.SLACK_CLIENT_SECRET || '').trim()
  if (!clientId || !clientSecret) {
    throw new Error(
      'Missing Slack OAuth configuration. Add Client ID/Secret in Integrations panel, or set SLACK_CLIENT_ID and SLACK_CLIENT_SECRET.'
    )
  }
  return { clientId, clientSecret }
}

interface SlackTokenResponse {
  ok?: boolean
  access_token?: string
  error?: string
  team?: { id?: string; name?: string }
  authed_user?: { id?: string }
}

async function exchangeSlackCodeForToken(code: string, redirectUri: string): Promise<OAuthStartResult> {
  const { clientId, clientSecret } = await getSlackClientConfig()
  const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64')
  const response = await fetch(`${SLACK_OAUTH_HOST}/api/oauth.v2.access`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${basicAuth}`,
      'User-Agent': 'Lemona-Desktop',
    },
    body: new URLSearchParams({
      code,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }).toString(),
  })
  if (!response.ok) {
    throw new Error(`Slack OAuth token exchange failed (${response.status})`)
  }
  const payload = (await response.json()) as SlackTokenResponse
  if (!payload.ok || !payload.access_token) {
    throw new Error(payload.error || 'No access_token returned from Slack')
  }
  return {
    accessToken: payload.access_token,
    login: payload.authed_user?.id,
    teamName: payload.team?.name,
    teamId: payload.team?.id,
  }
}

async function buildSlackAuthUrl(redirectUri: string, state: string): Promise<string> {
  const { clientId } = await getSlackClientConfig()
  const scopes = ['channels:read', 'channels:history', 'groups:read', 'groups:history']
  const params = new URLSearchParams({
    client_id: clientId,
    scope: scopes.join(','),
    redirect_uri: redirectUri,
    state,
  })
  return `${SLACK_OAUTH_HOST}/oauth/v2/authorize?${params.toString()}`
}

async function getNotionClientConfig(): Promise<{ clientId: string; clientSecret: string }> {
  const saved = await oauthConfigStore.getNotionConfig()
  if (saved) {
    return saved
  }
  const clientId = (process.env.NOTION_CLIENT_ID || '').trim()
  const clientSecret = (process.env.NOTION_CLIENT_SECRET || '').trim()
  if (!clientId || !clientSecret) {
    throw new Error(
      'Missing Notion OAuth configuration. Add Client ID/Secret in Integrations panel, or set NOTION_CLIENT_ID and NOTION_CLIENT_SECRET.'
    )
  }
  return { clientId, clientSecret }
}

interface NotionTokenResponse {
  access_token?: string
  workspace_id?: string
  workspace_name?: string
  bot_id?: string
  duplicated_template_id?: string
  error?: string
}

async function exchangeNotionCodeForToken(code: string, redirectUri: string): Promise<OAuthStartResult> {
  const { clientId, clientSecret } = await getNotionClientConfig()
  const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64')
  const response = await fetch(`${NOTION_OAUTH_HOST}/v1/oauth/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Basic ${basicAuth}`,
      'Notion-Version': '2022-06-28',
      'User-Agent': 'Lemona-Desktop',
    },
    body: JSON.stringify({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
    }),
  })
  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Notion OAuth token exchange failed (${response.status}): ${text}`)
  }
  const payload = (await response.json()) as NotionTokenResponse
  if (!payload.access_token) {
    throw new Error(payload.error || 'No access_token returned from Notion')
  }
  return {
    accessToken: payload.access_token,
    workspaceId: payload.workspace_id,
    workspaceName: payload.workspace_name,
  }
}

async function buildNotionAuthUrl(redirectUri: string, state: string): Promise<string> {
  const { clientId } = await getNotionClientConfig()
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    owner: 'user',
    state,
  })
  return `${NOTION_OAUTH_HOST}/v1/oauth/authorize?${params.toString()}`
}

async function getQuickBooksClientConfig(): Promise<{ clientId: string; clientSecret: string }> {
  const saved = await oauthConfigStore.getQuickBooksConfig()
  if (saved) {
    return saved
  }
  const clientId = (process.env.QUICKBOOKS_CLIENT_ID || '').trim()
  const clientSecret = (process.env.QUICKBOOKS_CLIENT_SECRET || '').trim()
  if (!clientId || !clientSecret) {
    throw new Error(
      'Missing QuickBooks OAuth configuration. Add Client ID/Secret in Integrations panel, or set QUICKBOOKS_CLIENT_ID and QUICKBOOKS_CLIENT_SECRET.'
    )
  }
  return { clientId, clientSecret }
}

interface QuickBooksTokenResponse {
  access_token?: string
  refresh_token?: string
  expires_in?: number
  x_refresh_token_expires_in?: number
  error?: string
}

async function fetchQuickBooksCompanyName(accessToken: string, realmId: string): Promise<string | undefined> {
  try {
    const url = `https://quickbooks.api.intuit.com/v3/company/${realmId}/companyinfo/${realmId}`
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json',
        'User-Agent': 'Lemona-Desktop',
      },
    })
    if (!response.ok) return undefined
    const data = (await response.json()) as { CompanyInfo?: { CompanyName?: string } }
    return data.CompanyInfo?.CompanyName
  } catch {
    return undefined
  }
}

async function exchangeQuickBooksCodeForToken(code: string, redirectUri: string, realmId?: string): Promise<OAuthStartResult> {
  const { clientId, clientSecret } = await getQuickBooksClientConfig()
  const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64')
  const response = await fetch(INTUIT_TOKEN_HOST, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${basicAuth}`,
      'User-Agent': 'Lemona-Desktop',
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
    }).toString(),
  })
  if (!response.ok) {
    const text = await response.text()
    throw new Error(`QuickBooks OAuth token exchange failed (${response.status}): ${text}`)
  }
  const payload = (await response.json()) as QuickBooksTokenResponse
  if (!payload.access_token) {
    throw new Error(payload.error || 'No access_token returned from QuickBooks')
  }
  let companyName: string | undefined
  if (realmId) {
    companyName = await fetchQuickBooksCompanyName(payload.access_token, realmId)
  }
  return {
    accessToken: payload.access_token,
    refreshToken: payload.refresh_token,
    expiresIn: payload.expires_in,
    realmId,
    companyName,
  }
}

export async function refreshQuickBooksToken(refreshToken: string): Promise<{ accessToken: string; refreshToken: string; expiresIn: number }> {
  const { clientId, clientSecret } = await getQuickBooksClientConfig()
  const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64')
  const response = await fetch(INTUIT_TOKEN_HOST, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${basicAuth}`,
      'User-Agent': 'Lemona-Desktop',
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    }).toString(),
  })
  if (!response.ok) {
    const text = await response.text()
    throw new Error(`QuickBooks token refresh failed (${response.status}): ${text}`)
  }
  const payload = (await response.json()) as QuickBooksTokenResponse
  if (!payload.access_token || !payload.refresh_token) {
    throw new Error(payload.error || 'Invalid response from QuickBooks token refresh')
  }
  return {
    accessToken: payload.access_token,
    refreshToken: payload.refresh_token,
    expiresIn: payload.expires_in ?? 3600,
  }
}

async function buildQuickBooksAuthUrl(redirectUri: string, state: string): Promise<string> {
  const { clientId } = await getQuickBooksClientConfig()
  const params = new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    scope: 'com.intuit.quickbooks.accounting',
    redirect_uri: redirectUri,
    state,
  })
  return `${INTUIT_OAUTH_HOST}?${params.toString()}`
}

async function exchangeCodeForToken(sourceType: OAuthSourceType, code: string, redirectUri: string, realmId?: string): Promise<OAuthStartResult> {
  if (sourceType === 'github') {
    const accessToken = await exchangeGithubCodeForToken(code, redirectUri)
    const login = await fetchGithubLogin(accessToken)
    return { accessToken, login }
  }
  if (sourceType === 'gitlab') {
    const accessToken = await exchangeGitlabCodeForToken(code, redirectUri)
    const login = await fetchGitlabLogin(accessToken)
    return { accessToken, login }
  }
  if (sourceType === 'slack') {
    return exchangeSlackCodeForToken(code, redirectUri)
  }
  if (sourceType === 'notion') {
    return exchangeNotionCodeForToken(code, redirectUri)
  }
  if (sourceType === 'quickbooks') {
    return exchangeQuickBooksCodeForToken(code, redirectUri, realmId)
  }
  throw new Error(`Unsupported OAuth source type: ${sourceType}`)
}

export async function handleCallback(
  code: string,
  state: string,
  redirectUri: string,
  sourceType: OAuthSourceType = 'github',
  realmId?: string
): Promise<OAuthStartResult> {
  if (!code || !state) {
    throw new Error('Invalid OAuth callback')
  }
  return exchangeCodeForToken(sourceType, code, redirectUri, realmId)
}

export async function startOAuthFlow(
  sourceType: OAuthSourceType,
  _parentWindow?: unknown
): Promise<OAuthStartResult> {
  const state = crypto.randomBytes(24).toString('hex')
  const successTitle =
    sourceType === 'gitlab' ? 'GitLab connected' : sourceType === 'slack' ? 'Slack connected' : sourceType === 'notion' ? 'Notion connected' : sourceType === 'quickbooks' ? 'QuickBooks connected' : 'GitHub connected'
  const callbackServer = await createCallbackServer(state, successTitle)

  let authUrl: string
  if (sourceType === 'github') {
    authUrl = await buildGithubAuthUrl(callbackServer.redirectUri, state)
  } else if (sourceType === 'gitlab') {
    authUrl = await buildGitlabAuthUrl(callbackServer.redirectUri, state)
  } else if (sourceType === 'slack') {
    authUrl = await buildSlackAuthUrl(callbackServer.redirectUri, state)
  } else if (sourceType === 'notion') {
    authUrl = await buildNotionAuthUrl(callbackServer.redirectUri, state)
  } else if (sourceType === 'quickbooks') {
    authUrl = await buildQuickBooksAuthUrl(callbackServer.redirectUri, state)
  } else {
    throw new Error(`Unsupported OAuth source type: ${sourceType}`)
  }

  await shell.openExternal(authUrl)

  try {
    const callback = await Promise.race([
      callbackServer.waitForCallback,
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('OAuth timed out')), OAUTH_TIMEOUT_MS)),
    ])
    const result = await handleCallback(callback.code, callback.state, callbackServer.redirectUri, sourceType, callback.realmId)
    return result
  } finally {
    await callbackServer.close()
  }
}
