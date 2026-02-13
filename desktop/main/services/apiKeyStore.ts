// API Key Store - Stores API keys in memory for use by main process services
// Keys are saved via IPC from the frontend and can be retrieved by services

let storedApiKeys: { geminiApiKey?: string; openaiApiKey?: string } = {}

export function saveApiKeys(geminiApiKey?: string, openaiApiKey?: string): boolean {
  let changed = false
  
  if (geminiApiKey !== undefined) {
    const newValue = geminiApiKey || undefined
    if (storedApiKeys.geminiApiKey !== newValue) {
      storedApiKeys.geminiApiKey = newValue
      changed = true
    }
  }
  if (openaiApiKey !== undefined) {
    const newValue = openaiApiKey || undefined
    if (storedApiKeys.openaiApiKey !== newValue) {
      storedApiKeys.openaiApiKey = newValue
      changed = true
    }
  }
  
  return changed
}

export function getApiKeys(): { geminiApiKey?: string; openaiApiKey?: string } {
  return {
    geminiApiKey: storedApiKeys.geminiApiKey,
    openaiApiKey: storedApiKeys.openaiApiKey,
  }
}

export function saveSmartIndexing(_enabled: boolean): void {
  // No-op: indexing is always enabled
}

export function getSmartIndexing(): boolean {
  return true // Always enabled
}

