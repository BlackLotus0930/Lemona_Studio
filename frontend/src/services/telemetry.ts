/**
 * Anonymous telemetry service. No PII, no content data.
 * Enable via VITE_POSTHOG_KEY or VITE_TELEMETRY_ENDPOINT.
 */

const DEVICE_ID_KEY = 'lemona_telemetry_device_id'
const SESSION_START_KEY = 'lemona_telemetry_session_start'

let deviceId: string
let sessionId: string
let sessionStartMs: number
let initialized = false

function getOrCreateDeviceId(): string {
  try {
    let id = localStorage.getItem(DEVICE_ID_KEY)
    if (!id) {
      id = crypto.randomUUID()
      localStorage.setItem(DEVICE_ID_KEY, id)
    }
    return id
  } catch {
    return crypto.randomUUID()
  }
}

async function getAppVersion(): Promise<string> {
  try {
    if (typeof window !== 'undefined' && (window as any).electron?.invoke) {
      return await (window as any).electron.invoke('app:getVersion') ?? 'unknown'
    }
  } catch {
    // ignore
  }
  return 'web'
}

function getPlatform(): string {
  try {
    if (typeof window !== 'undefined' && (window as any).electron?.platform) {
      return (window as any).electron.platform ?? 'unknown'
    }
  } catch {
    // ignore
  }
  return typeof navigator !== 'undefined' ? navigator.platform : 'unknown'
}

function isEnabled(): boolean {
  const env = import.meta.env
  if (env.VITE_TELEMETRY_ENABLED === 'false') return false
  if (env.DEV && env.VITE_TELEMETRY_DEV !== 'true') return false
  return !!(env.VITE_POSTHOG_KEY || env.VITE_TELEMETRY_ENDPOINT)
}

export function initTelemetry(): void {
  if (initialized) return
  deviceId = getOrCreateDeviceId()
  sessionId = crypto.randomUUID()
  sessionStartMs = Date.now()
  try {
    sessionStorage.setItem(SESSION_START_KEY, String(sessionStartMs))
  } catch {
    // ignore
  }
  initialized = true
}

export function endSession(): void {
  if (!initialized || !isEnabled()) return
  try {
    const start = sessionStorage.getItem(SESSION_START_KEY)
    const durationMs = start ? Date.now() - Number(start) : 0
    track('app_session_end', { duration_ms: durationMs })
  } catch {
    // ignore
  }
}

export async function track(eventName: string, properties: Record<string, unknown> = {}): Promise<void> {
  if (!initialized) initTelemetry()
  if (!isEnabled()) return

  const posthogKey = import.meta.env.VITE_POSTHOG_KEY
  const customEndpoint = import.meta.env.VITE_TELEMETRY_ENDPOINT

  const appVersion = await getAppVersion()
  const payload = {
    device_id: deviceId,
    session_id: sessionId,
    event_name: eventName,
    timestamp: new Date().toISOString(),
    app_version: appVersion,
    platform: getPlatform(),
    ...properties,
  }

  try {
    if (posthogKey) {
      await fetch('https://us.i.posthog.com/capture/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          api_key: posthogKey,
          distinct_id: deviceId,
          event: eventName,
          timestamp: payload.timestamp,
          properties: { ...properties, app_version: appVersion, platform: getPlatform(), session_id: sessionId },
        }),
        keepalive: true,
      })
    } else if (customEndpoint) {
      await fetch(customEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        keepalive: true,
      })
    }
  } catch (err) {
    if (import.meta.env.DEV) {
      console.warn('[Telemetry] Failed to send event:', eventName, err)
    }
  }
}
