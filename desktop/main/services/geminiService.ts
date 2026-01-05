// Desktop Gemini Service - Uses Google Generative AI
import { GoogleGenerativeAI, GenerativeModel, Part } from '@google/generative-ai'
import { AIChatMessage, AIQuestion, AutocompleteSuggestion, ChatAttachment } from '../../../shared/types.js'
import { projectService } from './projectService.js'
import { documentService } from './documentService.js'
import { searchLibraryWithMentions } from './semanticSearchService.js'

// Store API key instances per API key to allow multiple users
const genAICache: Map<string, GoogleGenerativeAI> = new Map()

function getModel(apiKey: string, modelName: string = 'gemini-3-flash-preview'): GenerativeModel {
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

const SYSTEM_PROMPT = `You are Lemona's AI writing companion.

You are supportive, curious, and engaged, like a thoughtful collaborator sitting beside the user while they write.

Your primary goal is to help the user think clearly without taking over their thinking.

You care about:

preserving the user's voice

keeping ideas open rather than prematurely settled

supporting confidence, not replacing authorship

By default:

You do not write full passages for the user.

You do not assume access to the entire project.

You do not introduce outside knowledge unless asked.

Instead, you:

reflect what the user seems to be doing

gently point out tensions, assumptions, or unclear moves

ask questions that help the user decide their next step

When the user explicitly asks for it, you may:

help rephrase a sentence

outline possible directions

bring in external references or examples

Keep your tone warm, human, and encouraging.
Avoid sounding like a reviewer, judge, or authority.

Your role is not to finish the work, but to help the user stay in the work.`

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

// Extract paragraphs from TipTap JSON document
function parseTipTapToParagraphs(node: any): Array<{ type: string; text: string; level?: number }> {
  const paragraphs: Array<{ type: string; text: string; level?: number }> = []
  
  if (!node || !node.content) {
    return paragraphs
  }
  
  function traverse(currentNode: any) {
    if (currentNode.type === 'paragraph') {
      const text = extractTextFromTipTap(currentNode)
      if (text.trim()) {
        paragraphs.push({ type: 'paragraph', text })
      }
    } else if (currentNode.type === 'heading') {
      const text = extractTextFromTipTap(currentNode)
      const level = currentNode.attrs?.level || 1
      if (text.trim()) {
        paragraphs.push({ type: 'heading', text, level })
      }
    } else if (currentNode.content && Array.isArray(currentNode.content)) {
      currentNode.content.forEach(traverse)
    }
  }
  
  traverse(node)
  return paragraphs
}

// Get current editing context: current paragraph + 1 paragraph before + 1 paragraph after
// If no cursor position is provided, use first 3 paragraphs as "current editing area"
function getCurrentEditingContext(documentContent?: string, cursorPosition?: number, maxTokens: number = 128000): string {
  if (!documentContent) {
    return ''
  }
  
  try {
    const content = JSON.parse(documentContent)
    const paragraphs = parseTipTapToParagraphs(content)
    
    if (paragraphs.length === 0) {
      return ''
    }
    
    // If no cursor position, use first 3 paragraphs as "current editing area"
    let currentIndex = 0
    if (cursorPosition !== undefined && cursorPosition !== null) {
      // Find which paragraph contains the cursor position
      let charCount = 0
      for (let i = 0; i < paragraphs.length; i++) {
        const paraLength = paragraphs[i].text.length + 1 // +1 for newline
        if (charCount + paraLength > cursorPosition) {
          currentIndex = i
          break
        }
        charCount += paraLength
        currentIndex = i // In case cursor is at the end
      }
    }
    
    // Get 1 paragraph before + current + 1 paragraph after
    const startIndex = Math.max(0, currentIndex - 1)
    const endIndex = Math.min(paragraphs.length - 1, currentIndex + 1)
    
    const contextParagraphs = paragraphs.slice(startIndex, endIndex + 1)
    
    // Format paragraphs with their types
    const formattedParagraphs = contextParagraphs.map((para) => {
      const prefix = para.type === 'heading' 
        ? `#${'#'.repeat((para.level || 1) - 1)} ` 
        : ''
      return `${prefix}${para.text}`
    }).join('\n\n')
    
    // Limit by token count (rough estimate: 1 token ≈ 4 characters)
    const maxChars = maxTokens * 4
    if (formattedParagraphs.length > maxChars) {
      return formattedParagraphs.substring(0, maxChars) + '\n\n[... content continues ...]'
    }
    
    return formattedParagraphs
  } catch (error) {
    // Fallback: if parsing fails, use simple truncation
    return documentContent.slice(0, maxTokens * 4)
  }
}

async function buildContext(
  documentContent?: string, 
  projectId?: string,
  chatHistory?: AIChatMessage[],
  cursorPosition?: number,
  apiKey?: string,
  userMessage?: string,
  openaiApiKey?: string
): Promise<{ systemInstruction: string, chatHistory: AIChatMessage[] }> {
  let systemInstruction = SYSTEM_PROMPT

  // 1️⃣ Add project context FIRST (README, project overview, intent)
  // This gives AI the background about "what project am I working on"
  if (projectId) {
    try {
      const project = await projectService.getById(projectId)
      if (project) {
        systemInstruction += `\n\n## PROJECT CONTEXT\n\nProject: ${project.title}`
        if (project.description) {
          systemInstruction += `\nDescription: ${project.description}`
        }
        if (project.intent) {
          systemInstruction += `\nIntent: ${project.intent}`
        }
        
        // Add README content if available
        const readmeContent = await getReadmeContent(projectId)
        if (readmeContent && readmeContent.trim()) {
          systemInstruction += `\n\n### PROJECT INSTRUCTIONS (README.md)\n\n${readmeContent}`
        }
      }
    } catch (error) {
      console.error('Failed to load project context:', error)
    }
  }

  // 2️⃣ Add current editing context (local paragraph context)
  // Only pass the paragraph being edited + surrounding paragraphs, not the entire document
  if (documentContent) {
    const editingContext = getCurrentEditingContext(documentContent, cursorPosition, 128000)
    if (editingContext) {
      systemInstruction += `\n\n## CURRENT EDITING CONTEXT\n\n${editingContext}`
    }
  }

  // 3️⃣ Chat history management: sliding window + summarization
  let contextHistory: AIChatMessage[] = []
  let historySummary: string = ''

  if (chatHistory && chatHistory.length > 0) {
    // Token-based sliding window: keep recent history up to ~8K tokens
    const RECENT_HISTORY_TOKEN_LIMIT = 8000 // ~8K tokens for recent conversation
    const SUMMARY_TOKEN_LIMIT = 1000 // ~1K tokens for old history summary
    
    // Estimate tokens for all messages (rough estimate: 1 token ≈ 4 characters)
    const estimateTokens = (text: string): number => {
      return Math.ceil(text.length / 4)
    }
    
    // Calculate total tokens in history
    let totalTokens = 0
    for (const msg of chatHistory) {
      totalTokens += estimateTokens(msg.content || '')
    }
    
    if (totalTokens > RECENT_HISTORY_TOKEN_LIMIT) {
      // Need to split: keep recent messages up to token limit, summarize the rest
      let recentTokens = 0
      let splitIndex = chatHistory.length
      
      // Find split point: keep as many recent messages as possible within token limit
      for (let i = chatHistory.length - 1; i >= 0; i--) {
        const msgTokens = estimateTokens(chatHistory[i].content || '')
        if (recentTokens + msgTokens <= RECENT_HISTORY_TOKEN_LIMIT) {
          recentTokens += msgTokens
          splitIndex = i
        } else {
          break
        }
      }
      
      // Split history
      const oldHistory = chatHistory.slice(0, splitIndex)
      const recentHistory = chatHistory.slice(splitIndex)
      
      // Summarize old history (~1K tokens)
      if (oldHistory.length > 0) {
        historySummary = await summarizeChatHistory(oldHistory, SUMMARY_TOKEN_LIMIT, apiKey)
      }
      
      // Keep recent history
      contextHistory = recentHistory
    } else {
      // All history fits within token limit, keep all
      contextHistory = [...chatHistory]
    }
  }

  // Add history summary as a message in chatHistory (not in systemInstruction)
  // This allows AI to reference it as context without treating it as a "rule" or "personality instruction"
  if (historySummary) {
    // Insert summary as a system-like message at the beginning of chat history
    // Using 'assistant' role to indicate it's contextual information, not a user message
    const summaryMessage: AIChatMessage = {
      id: `summary_${Date.now()}`,
      role: 'assistant',
      content: `[Previous conversation summary]\n\n${historySummary}`,
      timestamp: new Date().toISOString()
    }
    contextHistory = [summaryMessage, ...contextHistory]
  }

  // 4️⃣ Add library search results if @mentions detected
  if (userMessage && (apiKey || openaiApiKey)) {
    try {
      // CRITICAL: Use projectId if provided (for project-specific search),
      // otherwise use 'library' for general library search
      // This ensures we search in the same index where documents were indexed
      const searchProjectId = projectId || 'library'
      const searchResult = await searchLibraryWithMentions(
        userMessage,
        apiKey, // geminiApiKey
        openaiApiKey,
        3, // top-k
        searchProjectId
      )

      if (searchResult.results.length > 0 && searchResult.formattedResults) {
        systemInstruction += `\n\n## LIBRARY REFERENCES\n\nThe user has referenced the Library folder (@Library or @filename). Here are relevant excerpts from the library files:\n\n${searchResult.formattedResults}\n\nUse these references to inform your response, but do not assume they are the only relevant information. The user may be asking about specific aspects of these documents.`
      }
    } catch (error: any) {
      // Don't fail the entire request if library search fails
      console.warn('[Gemini] Library search failed:', error.message)
    }
  }

  return { systemInstruction, chatHistory: contextHistory }
}

// Summarize old chat history to preserve context without using too many tokens
async function summarizeChatHistory(history: AIChatMessage[], targetTokens: number = 1000, apiKey?: string): Promise<string> {
  if (history.length === 0) {
    return ''
  }

  // Format history for summarization
  const historyText = history
    .map(msg => `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content}`)
    .join('\n\n')

  // If API key is available, use AI to generate summary
  if (apiKey) {
    try {
      const aiModel = getModel(apiKey, 'gemini-3-flash-preview')
      const summaryPrompt = `You are a helpful assistant that summarizes conversation history concisely while preserving important context.

Please provide a concise summary of the following conversation history. Focus on:
- Key topics discussed
- Important decisions or conclusions
- User's writing goals and preferences
- Any specific instructions or context mentioned

Keep the summary to approximately ${targetTokens} tokens (roughly ${targetTokens * 4} characters). Be concise but preserve important context.

Conversation history:
${historyText}

Summary:`

      const result = await aiModel.generateContent(summaryPrompt)
      const summary = result.response.text()
      if (summary.trim()) {
        return summary.trim()
      }
    } catch (error) {
      console.error('Failed to generate AI summary, falling back to truncation:', error)
    }
  }

  // Fallback: truncate history if AI summarization fails or API key not available
  const maxChars = targetTokens * 4
  if (historyText.length <= maxChars) {
    return historyText
  }
  
  // Simple truncation with note
  return historyText.substring(0, maxChars) + '\n\n[... earlier conversation history truncated ...]'
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
  async chat(apiKey: string, message: string, documentContent?: string, projectId?: string, chatHistory?: AIChatMessage[], modelName?: string, openaiApiKey?: string): Promise<AIChatMessage> {
    const aiModel = getModel(apiKey, modelName || 'gemini-3-flash-preview')
    const { systemInstruction, chatHistory: history } = await buildContext(documentContent, projectId, chatHistory, undefined, apiKey, message, openaiApiKey)
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
    modelName?: string,
    attachments?: ChatAttachment[],
    openaiApiKey?: string
  ): AsyncGenerator<string> {
    const aiModel = getModel(apiKey, modelName || 'gemini-3-flash-preview')
    const { systemInstruction, chatHistory: history } = await buildContext(documentContent, projectId, chatHistory, undefined, apiKey, message, openaiApiKey)
    const conversationHistory = [...(history || [])]
    conversationHistory.push({
      id: `msg_${Date.now()}`,
      role: 'user',
      content: message,
      timestamp: new Date().toISOString(),
      attachments: attachments
    })
    
    // Build parts array for the current message
    const parts: Part[] = []
    
    // Add attachments first (images and PDFs)
    if (attachments && attachments.length > 0) {
      for (const attachment of attachments) {
        if (attachment.type === 'image') {
          parts.push({
            inlineData: {
              data: attachment.data,
              mimeType: attachment.mimeType || 'image/png'
            }
          })
        } else if (attachment.type === 'pdf') {
          // For PDFs, Gemini API supports file data
          parts.push({
            inlineData: {
              data: attachment.data,
              mimeType: 'application/pdf'
            }
          })
        }
      }
    }
    
    // Add text message (even if empty, we need at least one part)
    parts.push({ text: message || '' })
    
    try {
      const chatConfig: any = {
        systemInstruction: {
          parts: [{ text: systemInstruction }],
          role: "user"
        },
        history: conversationHistory.slice(0, -1).map(msg => {
          const msgParts: Part[] = []
          // Add attachments from history
          if (msg.attachments && msg.attachments.length > 0) {
            for (const attachment of msg.attachments) {
              if (attachment.type === 'image') {
                msgParts.push({
                  inlineData: {
                    data: attachment.data,
                    mimeType: attachment.mimeType || 'image/png'
                  }
                })
              } else if (attachment.type === 'pdf') {
                msgParts.push({
                  inlineData: {
                    data: attachment.data,
                    mimeType: 'application/pdf'
                  }
                })
              }
            }
          }
          // Add text content (always add, even if empty, to ensure at least one part)
          msgParts.push({ text: msg.content || '' })
          return {
            role: msg.role === 'user' ? 'user' : 'model',
            parts: msgParts
          }
        })
      }
      
      // Add Google Search tool if enabled
      if (useWebSearch) {
        chatConfig.tools = [{
          googleSearch: {}
        }]
      }
      
      const chat = aiModel.startChat(chatConfig)
      const result = await chat.sendMessageStream(parts)
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
    const aiModel = getModel(apiKey, modelName || 'gemini-3-flash-preview')
    const { systemInstruction } = await buildContext(documentContent, projectId, undefined, undefined, apiKey)
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
    const aiModel = getModel(apiKey, modelName || 'gemini-3-flash-preview')
    const { systemInstruction } = await buildContext(documentContent, projectId, undefined, undefined, apiKey)
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