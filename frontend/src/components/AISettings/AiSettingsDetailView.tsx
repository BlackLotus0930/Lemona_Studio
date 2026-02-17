import { useMemo, useState, type CSSProperties } from 'react'
import { useTheme } from '../../contexts/ThemeContext'
import type { AiProviderProfile } from '../../services/desktop-api'
import { useAiSettings } from './AiSettingsContext'

export type AiSettingsTabId = 'ai-settings' | 'custom-ai' | 'custom-embeddings'

export interface AiSettingsTabItem {
  id: AiSettingsTabId
  title: string
  type: 'ai-settings'
  settingsTabId: AiSettingsTabId
}

function normalizeId(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9_-]/g, '-')
}

export default function AiSettingsDetailView({ tab }: { tab: AiSettingsTabItem }) {
  const { theme } = useTheme()
  const { state, loading, error, saveProfile, removeProfile, setActiveProviders } = useAiSettings()
  const [customName, setCustomName] = useState('')
  const [customBaseUrl, setCustomBaseUrl] = useState('')
  const [customApiKey, setCustomApiKey] = useState('')
  const [customChatModel, setCustomChatModel] = useState('')
  const [customEmbeddingName, setCustomEmbeddingName] = useState('')
  const [customEmbeddingBaseUrl, setCustomEmbeddingBaseUrl] = useState('')
  const [customEmbeddingApiKey, setCustomEmbeddingApiKey] = useState('')
  const [customEmbeddingModel, setCustomEmbeddingModel] = useState('')
  const [customEmbeddingDimension, setCustomEmbeddingDimension] = useState('')
  const [saveMessage, setSaveMessage] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)

  const textColor = theme === 'dark' ? '#cccccc' : '#333333'
  const subTextColor = theme === 'dark' ? '#8f8f8f' : '#6e6e6e'
  const borderColor = theme === 'dark' ? '#3c3c3c' : '#e0e0e0'
  const panelBg = theme === 'dark' ? '#1e1e1e' : '#ffffff'

  const customProfiles = useMemo(
    () => (state?.profiles || []).filter(p => p.type === 'custom-openai'),
    [state]
  )

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

  const buttonStyle = (primary = false): CSSProperties => ({
    padding: '6px 12px',
    fontSize: 12,
    borderRadius: 4,
    border: `1px solid ${borderColor}`,
    background: primary ? (theme === 'dark' ? '#0e639c' : '#0078d4') : 'transparent',
    color: primary ? '#fff' : textColor,
    cursor: 'pointer',
  })

  const clearStatus = () => {
    setSaveMessage(null)
    setSaveError(null)
  }

  const handleSaveCustomChat = async () => {
    clearStatus()
    const name = customName.trim() || 'Custom'
    const baseUrl = customBaseUrl.trim().replace(/\/$/, '')
    const model = customChatModel.trim()
    if (!baseUrl) {
      setSaveError('Base URL is required')
      return
    }
    if (!model) {
      setSaveError('Chat model name is required')
      return
    }
    const profileId = `custom-${normalizeId(name)}`
    const payload: Omit<AiProviderProfile, 'createdAt' | 'updatedAt'> = {
      id: profileId,
      name,
      type: 'custom-openai',
      baseUrl,
      apiKey: customApiKey.trim() || undefined,
      chatModel: model,
      enabled: true,
    }
    try {
      await saveProfile(payload)
      setSaveMessage('Custom AI provider saved.')
    } catch (err: any) {
      setSaveError(err?.message || 'Failed to save custom AI model')
    }
  }

  const handleSaveCustomEmbeddingEndpoint = async () => {
    clearStatus()
    const name = customEmbeddingName.trim() || 'Custom Embedding'
    const baseUrl = customEmbeddingBaseUrl.trim().replace(/\/$/, '')
    const model = customEmbeddingModel.trim()
    const dimension = customEmbeddingDimension.trim()
      ? Number.parseInt(customEmbeddingDimension, 10)
      : 1536
    if (!baseUrl) {
      setSaveError('Base URL is required')
      return
    }
    if (!model) {
      setSaveError('Embedding model name is required')
      return
    }
    if (!Number.isFinite(dimension) || dimension <= 0) {
      setSaveError('Dimension must be a positive integer (or leave empty for 1536)')
      return
    }

    const profileId = `custom-embed-${normalizeId(name)}`
    const payload: Omit<AiProviderProfile, 'createdAt' | 'updatedAt'> = {
      id: profileId,
      name,
      type: 'custom-openai',
      baseUrl,
      apiKey: customEmbeddingApiKey.trim() || undefined,
      embeddingModel: model,
      embeddingDimension: dimension,
      enabled: true,
    }
    try {
      const saved = await saveProfile(payload)
      await setActiveProviders({ embeddingProviderId: saved.id })
      setSaveMessage('Custom embedding endpoint saved and selected.')
    } catch (err: any) {
      setSaveError(err?.message || 'Failed to save custom embedding endpoint')
    }
  }

  return (
    <div style={{ width: '100%', height: '100%', overflow: 'auto', backgroundColor: panelBg, color: textColor }}>
      <div style={{ padding: 16, maxWidth: 760 }}>
        {(error || saveError) && (
          <div style={{ marginBottom: 10, padding: 8, borderRadius: 4, background: theme === 'dark' ? '#3d2020' : '#ffebee', color: '#f44336', fontSize: 12 }}>
            {saveError || error}
          </div>
        )}
        {saveMessage && (
          <div style={{ marginBottom: 10, padding: 8, borderRadius: 4, background: theme === 'dark' ? '#1e3a1e' : '#e8f5e9', color: '#4caf50', fontSize: 12 }}>
            {saveMessage}
          </div>
        )}

        {(tab.settingsTabId === 'ai-settings' || tab.settingsTabId === 'custom-ai') && (
          <div style={{ marginBottom: 24 }}>
            <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8 }}>Custom Chat Endpoint</div>
            <p style={{ margin: '0 0 12px', fontSize: 12, color: subTextColor }}>
              Use an OpenAI-compatible API (Groq, Together, OpenRouter, local models, etc.) for chat.
            </p>
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 6, color: subTextColor }}>Setup</div>
              <ol style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: subTextColor, lineHeight: 1.7 }}>
                <li>Obtain the API base URL and model name from your provider.</li>
                <li>Enter base URL (e.g. https://api.openai.com/v1) and model name below.</li>
                <li>Add API key if your endpoint requires it. Saved endpoints appear in the chat model dropdown.</li>
              </ol>
            </div>
            <input value={customName} onChange={e => setCustomName(e.target.value)} placeholder="Display name (optional)" style={inputStyle} />
            <input value={customBaseUrl} onChange={e => setCustomBaseUrl(e.target.value)} placeholder="Base URL" style={inputStyle} />
            <input value={customChatModel} onChange={e => setCustomChatModel(e.target.value)} placeholder="Chat model name" style={inputStyle} />
            <input value={customApiKey} onChange={e => setCustomApiKey(e.target.value)} placeholder="API key (optional)" type="password" style={inputStyle} />
            <button onClick={handleSaveCustomChat} style={buttonStyle(true)} disabled={loading}>Save</button>
            {customProfiles.length > 0 && (
              <div style={{ marginTop: 16 }}>
                <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8 }}>Saved custom endpoints</div>
                {customProfiles.map(profile => (
                  <div
                    key={profile.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      border: `1px solid ${borderColor}`,
                      borderRadius: 4,
                      padding: 8,
                      marginBottom: 8,
                    }}
                  >
                    <div style={{ fontSize: 12 }}>
                      <div>{profile.name}</div>
                      <div style={{ color: subTextColor }}>
                        {profile.baseUrl || 'No URL'} {profile.chatModel ? `- ${profile.chatModel}` : ''}
                      </div>
                    </div>
                    <button onClick={() => removeProfile(profile.id)} style={buttonStyle(false)} disabled={loading}>
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {(tab.settingsTabId === 'ai-settings' || tab.settingsTabId === 'custom-embeddings') && (
          <div style={{ marginBottom: 24 }}>
            <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8 }}>Custom Embedding Endpoint</div>
            <p style={{ margin: '0 0 12px', fontSize: 12, color: subTextColor }}>
              Use an OpenAI-compatible embedding API for semantic search (e.g. text-embedding-3-small, Voyage, Cohere).
            </p>
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 6, color: subTextColor }}>Setup</div>
              <ol style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: subTextColor, lineHeight: 1.7 }}>
                <li>Obtain the embedding API base URL and model name from your provider.</li>
                <li>Enter base URL and model name below. Set dimension only if your model differs from 1536.</li>
                <li>Add API key if required. Saved endpoint will be used for semantic search.</li>
              </ol>
            </div>
            <input value={customEmbeddingName} onChange={e => setCustomEmbeddingName(e.target.value)} placeholder="Display name (optional)" style={inputStyle} />
            <input value={customEmbeddingBaseUrl} onChange={e => setCustomEmbeddingBaseUrl(e.target.value)} placeholder="Base URL" style={inputStyle} />
            <input value={customEmbeddingModel} onChange={e => setCustomEmbeddingModel(e.target.value)} placeholder="Embedding model name" style={inputStyle} />
            <input value={customEmbeddingDimension} onChange={e => setCustomEmbeddingDimension(e.target.value)} placeholder="Dimension (optional, default 1536)" style={inputStyle} />
            <input value={customEmbeddingApiKey} onChange={e => setCustomEmbeddingApiKey(e.target.value)} placeholder="API key (optional)" type="password" style={inputStyle} />
            <button onClick={handleSaveCustomEmbeddingEndpoint} style={buttonStyle(true)} disabled={loading}>Save</button>
          </div>
        )}
      </div>
    </div>
  )
}

