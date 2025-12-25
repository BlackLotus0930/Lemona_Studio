// Desktop Gemini Service - Uses Google Generative AI
import { GoogleGenerativeAI, GenerativeModel } from '@google/generative-ai'
import { AIChatMessage, AIQuestion, AutocompleteSuggestion } from '../../../shared/types.js'
import { projectService } from './projectService.js'
import { documentService } from './documentService.js'

// Store API key instances per API key to allow multiple users
const genAICache: Map<string, GoogleGenerativeAI> = new Map()

function getModel(apiKey: string, modelName: string = 'gemini-2.5-flash'): GenerativeModel {
  if (!apiKey) {
    throw new Error('Google API key is not configured. Please set it in Settings > API Keys.')
  }
  
  // Use cached instance if available, otherwise create new one
  if (!genAICache.has(apiKey)) {
    genAICache.set(apiKey, new GoogleGenerativeAI(apiKey))
  }
  
  const genAI = genAICache.get(apiKey)!
  return genAI.getGenerativeModel({ model: modelName })
}

const SYSTEM_PROMPT = `You are a reliable, focused assistant for Lemona.

You must always:

- Understand user intent and ask follow-up questions if the request is ambiguous.

- Prioritize safe, accurate, verifiable information.

- Follow the output contract defined later for each task.

- Never hallucinate facts; if you cannot answer confidently, say "INSUFFICIENT_DATA".

General rules:

1. Respond concisely and clearly unless the user requests depth.

2. Provide structured outputs in the requested format (JSON, steps, table, etc.).

3. Cite sources when available (URL or named source).

4. Abide by safety policies: avoid harmful advice, personal data exposure, and disallowed content.

When responding in JSON:

- Output only valid JSON (no extra commentary outside the JSON object).

- Follow the exact schema from the user request.

If the request is incomplete:

- Ask the user a clarifying question before answering.

End every answer with a clear "Next step" suggestion if relevant.`

async function getReadmeContent(projectId: string): Promise<string | null> {
  try {
    const documents = await projectService.getProjectDocuments(projectId)
    const readmeDoc = documents.find(doc => doc.title === 'README.md')
    if (readmeDoc) {
      const content = JSON.parse(readmeDoc.content)
      return extractTextFromTipTap(content)
    }
    return null
  } catch (error) {
    return null
  }
}

async function buildContext(
  documentContent?: string, 
  projectId?: string,
  chatHistory?: AIChatMessage[]
): Promise<{ systemInstruction: string, chatHistory: AIChatMessage[] }> {
  let systemInstruction = SYSTEM_PROMPT
  if (projectId) {
    const readmeContent = await getReadmeContent(projectId)
    if (readmeContent && readmeContent.trim()) {
      systemInstruction += `\n\n## PROJECT INSTRUCTIONS (README.md)\n\n${readmeContent}\n`
    }
  }
  if (documentContent) {
    try {
      const content = JSON.parse(documentContent)
      const textContent = extractTextFromTipTap(content)
      if (textContent && textContent.trim()) {
        const truncatedContent = textContent.length > 5000 
          ? textContent.substring(0, 5000) + '\n\n[... document continues ...]'
          : textContent
        systemInstruction += `\n\n## CURRENT DOCUMENT CONTENT\n\n${truncatedContent}\n`
      }
    } catch (error) {
      // Ignore
    }
  }
  return { systemInstruction, chatHistory: chatHistory || [] }
}

function extractTextFromTipTap(node: any): string {
  if (typeof node === 'string') return node
  if (node.type === 'text') return node.text || ''
  if (node.content && Array.isArray(node.content)) {
    return node.content.map(extractTextFromTipTap).join('')
  }
  return ''
}

export const geminiService = {
  async chat(apiKey: string, message: string, documentContent?: string, projectId?: string, chatHistory?: AIChatMessage[], modelName?: string): Promise<AIChatMessage> {
    const aiModel = getModel(apiKey, modelName || 'gemini-2.5-flash')
    const { systemInstruction, chatHistory: history } = await buildContext(documentContent, projectId, chatHistory)
    const conversationHistory = [...(history || [])]
    conversationHistory.push({
      id: `msg_${Date.now()}`,
      role: 'user',
      content: message,
      timestamp: new Date().toISOString()
    })
    try {
      const chat = aiModel.startChat({
        systemInstruction: {
          parts: [{ text: systemInstruction }],
          role: "user"
        },
        history: conversationHistory.slice(0, -1).map(msg => ({
          role: msg.role === 'user' ? 'user' : 'model',
          parts: [{ text: msg.content }]
        }))
      })
      const result = await chat.sendMessage(message)
      const text = result.response.text()
      return {
        id: `msg_${Date.now()}`,
        role: 'assistant',
        content: text,
        timestamp: new Date().toISOString(),
      }
    } catch (error: any) {
      console.error('Gemini API error:', error)
      throw new Error(`Failed to generate response: ${error.message || 'Unknown error'}`)
    }
  },

  async *streamChat(
    apiKey: string,
    message: string, 
    documentContent?: string, 
    projectId?: string,
    chatHistory?: AIChatMessage[],
    useWebSearch?: boolean,
    modelName?: string
  ): AsyncGenerator<string> {
    const aiModel = getModel(apiKey, modelName || 'gemini-2.5-flash')
    const { systemInstruction, chatHistory: history } = await buildContext(documentContent, projectId, chatHistory)
    const conversationHistory = [...(history || [])]
    conversationHistory.push({
      id: `msg_${Date.now()}`,
      role: 'user',
      content: message,
      timestamp: new Date().toISOString()
    })
    try {
      const chatConfig: any = {
        systemInstruction: {
          parts: [{ text: systemInstruction }],
          role: "user"
        },
        history: conversationHistory.slice(0, -1).map(msg => ({
          role: msg.role === 'user' ? 'user' : 'model',
          parts: [{ text: msg.content }]
        }))
      }
      
      // Add Google Search tool if enabled
      if (useWebSearch) {
        chatConfig.tools = [{
          googleSearch: {}
        }]
      }
      
      const chat = aiModel.startChat(chatConfig)
      const result = await chat.sendMessageStream(message)
      for await (const chunk of result.stream) {
        try {
          const chunkText = chunk.text()
          if (chunkText) {
            yield chunkText
          }
        } catch (chunkError: any) {
          // Continue
        }
      }
    } catch (error: any) {
      console.error('[Gemini] Streaming error:', error)
      throw new Error(`Failed to stream response: ${error.message || 'Unknown error'}`)
    }
  },

  async batchQuestions(apiKey: string, questions: string[], documentContent?: string, projectId?: string, modelName?: string): Promise<AIQuestion[]> {
    const aiModel = getModel(apiKey, modelName || 'gemini-2.5-flash')
    const { systemInstruction } = await buildContext(documentContent, projectId)
    const questionsText = questions.map((q, i) => `${i + 1}. ${q}`).join('\n')
    const prompt = `${systemInstruction}\n\nUser has the following questions. Please answer each one:\n\n${questionsText}\n\nPlease provide answers in a numbered list format.`
    try {
      const result = await aiModel.generateContent(prompt)
      const response = result.response.text()
      const answers = response.split(/\d+\./).filter(a => a.trim()).map(a => a.trim())
      return questions.map((question, index) => ({
        id: `q_${Date.now()}_${index}`,
        question,
        answer: answers[index] || 'Answer not available',
        status: 'completed' as const,
      }))
    } catch (error: any) {
      console.error('Gemini batch questions error:', error)
      throw new Error(`Failed to process batch questions: ${error.message || 'Unknown error'}`)
    }
  },

  async autocomplete(
    apiKey: string,
    text: string, 
    cursorPosition: number, 
    documentContent?: string,
    projectId?: string,
    modelName?: string
  ): Promise<AutocompleteSuggestion> {
    const aiModel = getModel(apiKey, modelName || 'gemini-2.5-flash')
    const { systemInstruction } = await buildContext(documentContent, projectId)
    const beforeCursor = text.slice(0, cursorPosition)
    const afterCursor = text.slice(cursorPosition)
    const prompt = `${systemInstruction}\n\nUser is typing: "${beforeCursor}|${afterCursor}"\n\nPlease suggest the next few words or sentence to complete their thought. Only provide the continuation text, nothing else.`
    try {
      const result = await aiModel.generateContent(prompt)
      const suggestion = result.response.text().trim()
      return {
        text: suggestion,
        start: cursorPosition,
        end: cursorPosition + suggestion.length,
      }
    } catch (error: any) {
      console.error('Gemini autocomplete error:', error)
      throw new Error(`Failed to generate autocomplete: ${error.message || 'Unknown error'}`)
    }
  },
}