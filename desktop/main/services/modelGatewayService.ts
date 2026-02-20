import { aiProviderStore } from './aiProviderStore.js'
import { geminiService } from './geminiService.js'
import { openaiService } from './openaiService.js'
import type { AIChatMessage, ChatAttachment, AgentProgressEvent } from '../../../shared/types.js'

function hasKey(value?: string): boolean {
  return !!(value && value.trim().length > 0)
}

export const modelGatewayService = {
  async streamChat(
    googleApiKey: string,
    openaiApiKey: string,
    message: string,
    documentContent?: string,
    projectId?: string,
    chatHistory?: AIChatMessage[],
    useWebSearch?: boolean,
    modelName?: string,
    attachments?: ChatAttachment[],
    style?: string,
    onProgress?: (event: AgentProgressEvent) => void
  ): Promise<AsyncGenerator<string>> {
    const active = await aiProviderStore.getActiveChatProfile()

    if (active && active.type === 'custom-openai') {
      const apiKey = active.apiKey || openaiApiKey
      if (!hasKey(apiKey)) {
        throw new Error('Custom AI provider requires an API key.')
      }
      const targetModel = modelName || active.chatModel || 'gpt-4.1-nano'
      return openaiService.streamChat(
        apiKey,
        message,
        documentContent,
        projectId,
        chatHistory,
        useWebSearch,
        targetModel,
        attachments,
        style,
        googleApiKey,
        active.baseUrl,
        onProgress
      )
    }

    if (active && active.type === 'builtin-openai') {
      const apiKey = active.apiKey || openaiApiKey
      if (!hasKey(apiKey)) {
        throw new Error('OpenAI API key is required for the active provider.')
      }
      return openaiService.streamChat(
        apiKey,
        message,
        documentContent,
        projectId,
        chatHistory,
        useWebSearch,
        modelName || active.chatModel || 'gpt-4.1-nano',
        attachments,
        style,
        googleApiKey,
        undefined,
        onProgress
      )
    }

    if (active && active.type === 'builtin-gemini') {
      const apiKey = active.apiKey || googleApiKey
      if (!hasKey(apiKey)) {
        throw new Error('Gemini API key is required for the active provider.')
      }
      return geminiService.streamChat(
        apiKey,
        message,
        documentContent,
        projectId,
        chatHistory,
        useWebSearch,
        modelName || active.chatModel || 'gemini-3-flash-preview',
        attachments,
        style,
        openaiApiKey,
        onProgress
      )
    }

    // Backward-compatible fallback path when provider state is missing/incomplete.
    const isOpenaiModel = modelName && modelName.startsWith('gpt-')
    const isGeminiModel = modelName && (modelName.startsWith('gemini-') || modelName.includes('gemini'))
    const hasOpenaiKey = hasKey(openaiApiKey)
    const hasGoogleKey = hasKey(googleApiKey)

    if (isOpenaiModel) {
      if (!hasOpenaiKey && hasGoogleKey) {
        return geminiService.streamChat(
          googleApiKey,
          message,
          documentContent,
          projectId,
          chatHistory,
          useWebSearch,
          'gemini-3-flash-preview',
          attachments,
          style,
          openaiApiKey,
          onProgress
        )
      }
      if (!hasOpenaiKey) {
        throw new Error('OpenAI API key is required for GPT models. Please set it in Settings > API Keys.')
      }
      return openaiService.streamChat(
        openaiApiKey,
        message,
        documentContent,
        projectId,
        chatHistory,
        useWebSearch,
        modelName,
        attachments,
        style,
        googleApiKey,
        undefined,
        onProgress
      )
    }

    if (isGeminiModel) {
      if (!hasGoogleKey && hasOpenaiKey) {
        return openaiService.streamChat(
          openaiApiKey,
          message,
          documentContent,
          projectId,
          chatHistory,
          useWebSearch,
          'gpt-4.1-nano',
          attachments,
          style,
          googleApiKey,
          undefined,
          onProgress
        )
      }
      if (!hasGoogleKey) {
        throw new Error('Google API key is required for Gemini models. Please set it in Settings > API Keys.')
      }
      return geminiService.streamChat(
        googleApiKey,
        message,
        documentContent,
        projectId,
        chatHistory,
        useWebSearch,
        modelName,
        attachments,
        style,
        openaiApiKey,
        onProgress
      )
    }

    if (hasGoogleKey) {
      return geminiService.streamChat(
        googleApiKey,
        message,
        documentContent,
        projectId,
        chatHistory,
        useWebSearch,
        modelName || 'gemini-3-flash-preview',
        attachments,
        style,
        openaiApiKey,
        onProgress
      )
    }
    if (hasOpenaiKey) {
      return openaiService.streamChat(
        openaiApiKey,
        message,
        documentContent,
        projectId,
        chatHistory,
        useWebSearch,
        modelName || 'gpt-4.1-nano',
        attachments,
        style,
        googleApiKey,
        undefined,
        onProgress
      )
    }
    throw new Error('No API key configured. Please add an API key in Settings > API Keys.')
  },
}

