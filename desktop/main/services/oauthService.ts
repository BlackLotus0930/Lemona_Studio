import { shell } from 'electron'
import http from 'http'
import crypto from 'crypto'
import { oauthConfigStore } from './oauthConfigStore.js'

type OAuthSourceType = 'github'

interface OAuthStartResult {
  accessToken: string
  login?: string
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
}

interface CallbackServer {
  redirectUri: string
  waitForCallback: Promise<CallbackPayload>
  close: () => Promise<void>
}

interface OAuthConfigStatus {
  sourceType: 'github'
  configured: boolean
  configSource: 'saved' | 'env' | 'missing'
}

const OAUTH_TIMEOUT_MS = 2 * 60 * 1000
const GITHUB_OAUTH_HOST = 'https://github.com'
const GITHUB_API_HOST = 'https://api.github.com'

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

export async function getOAuthConfigStatus(sourceType: 'github'): Promise<OAuthConfigStatus> {
  const saved = await oauthConfigStore.getGithubConfig()
  if (saved) {
    return {
      sourceType,
      configured: true,
      configSource: 'saved',
    }
  }
  const envClientId = (process.env.GITHUB_CLIENT_ID || '').trim()
  const envClientSecret = (process.env.GITHUB_CLIENT_SECRET || '').trim()
  if (envClientId && envClientSecret) {
    return {
      sourceType,
      configured: true,
      configSource: 'env',
    }
  }
  return {
    sourceType,
    configured: false,
    configSource: 'missing',
  }
}

export async function saveOAuthConfig(
  sourceType: 'github',
  config: { clientId: string; clientSecret: string }
): Promise<OAuthConfigStatus> {
  if (sourceType !== 'github') {
    throw new Error(`Unsupported OAuth source type: ${sourceType}`)
  }
  await oauthConfigStore.saveGithubConfig(config.clientId, config.clientSecret)
  return getOAuthConfigStatus(sourceType)
}

function createCallbackServer(expectedState: string): Promise<CallbackServer> {
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
        res.end('<html><body><h3>GitHub connected. You can close this window.</h3></body></html>')
        callbackResolve?.({ code, state })
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

export async function handleCallback(code: string, state: string, redirectUri: string): Promise<OAuthStartResult> {
  if (!code || !state) {
    throw new Error('Invalid OAuth callback')
  }
  const accessToken = await exchangeGithubCodeForToken(code, redirectUri)
  const login = await fetchGithubLogin(accessToken)
  return { accessToken, login }
}

export async function startOAuthFlow(
  sourceType: OAuthSourceType,
  _parentWindow?: unknown
): Promise<OAuthStartResult> {
  if (sourceType !== 'github') {
    throw new Error(`Unsupported OAuth source type: ${sourceType}`)
  }

  const state = crypto.randomBytes(24).toString('hex')
  const callbackServer = await createCallbackServer(state)
  const authUrl = await buildGithubAuthUrl(callbackServer.redirectUri, state)
  await shell.openExternal(authUrl)

  try {
    const callback = await Promise.race([
      callbackServer.waitForCallback,
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('OAuth timed out')), OAUTH_TIMEOUT_MS)),
    ])
    const result = await handleCallback(callback.code, callback.state, callbackServer.redirectUri)
    return result
  } finally {
    await callbackServer.close()
  }
}
