import { projectService } from './projectService.js'
import { integrationService } from './integrationService.js'
import { getApiKeys } from './apiKeyStore.js'

const DEFAULT_SYNC_INTERVAL_MS = 60 * 60 * 1000

let timer: NodeJS.Timeout | null = null
let running = false

async function runScheduledSync(): Promise<void> {
  if (running) {
    return
  }
  running = true
  try {
    const projects = await projectService.getAll()
    const keys = getApiKeys()
    for (const project of projects) {
      try {
        await integrationService.syncAll(project.id, keys.geminiApiKey, keys.openaiApiKey)
      } catch (error) {
        console.error(`[IntegrationScheduler] Failed to sync project ${project.id}:`, error)
      }
    }
  } finally {
    running = false
  }
}

export function startIntegrationScheduler(intervalMs: number = DEFAULT_SYNC_INTERVAL_MS): void {
  if (timer) {
    return
  }
  timer = setInterval(() => {
    void runScheduledSync()
  }, intervalMs)
}

export function stopIntegrationScheduler(): void {
  if (!timer) {
    return
  }
  clearInterval(timer)
  timer = null
}
