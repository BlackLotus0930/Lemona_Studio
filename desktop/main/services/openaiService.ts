// Desktop OpenAI Service - Uses OpenAI API
import OpenAI from 'openai'
import { AIChatMessage, AutocompleteSuggestion, ChatAttachment } from '../../../shared/types.js'
import { projectService } from './projectService.js'
import { documentService } from './documentService.js'
import { createRequire } from 'module'
import { pathToFileURL } from 'url'
import { searchLibraryWithMentions } from './semanticSearchService.js'

// Import pdfjs-dist for PDF text extraction
const require = createRequire(import.meta.url)
const pdfjsLib = require('pdfjs-dist/legacy/build/pdf.mjs')
// pdfjs-dist 5.x requires file:// URL format on Windows
const pdfjsWorkerPath = require.resolve('pdfjs-dist/legacy/build/pdf.worker.mjs')
const pdfjsWorkerUrl = pathToFileURL(pdfjsWorkerPath).href
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorkerUrl

// Helper function to extract text from PDF base64 data
async function extractPDFTextFromBase64(base64Data: string): Promise<string> {
  try {
    // Convert base64 to Uint8Array
    const binaryString = Buffer.from(base64Data, 'base64')
    const bytes = new Uint8Array(binaryString)
    
    // Load PDF document
    const loadingTask = pdfjsLib.getDocument({
      data: bytes,
      useSystemFonts: true,
      verbosity: 0,
    })
    
    const pdfDocument = await loadingTask.promise
    let fullText = ''
    const totalPages = pdfDocument.numPages
    
    // Extract text from each page (limit to first 50 pages to avoid token limits)
    const maxPages = Math.min(totalPages, 50)
    for (let pageNum = 1; pageNum <= maxPages; pageNum++) {
      try {
        const page = await pdfDocument.getPage(pageNum)
        const textContent = await page.getTextContent()
        
        let pageText = ''
        if (textContent.items && Array.isArray(textContent.items)) {
          pageText = textContent.items
            .map((item: any) => {
              if (typeof item === 'string') return item
              if (item.str) return item.str
              return ''
            })
            .filter((text: string) => text.length > 0)
            .join(' ')
        }
        
        fullText += (fullText ? '\n\n' : '') + `[Page ${pageNum}]\n${pageText}`
        
        if (page.cleanup) {
          page.cleanup()
        }
      } catch (pageError) {
        console.error(`[OpenAI PDF] Error extracting page ${pageNum}:`, pageError)
      }
    }
    
    if (totalPages > maxPages) {
      fullText += `\n\n[Note: PDF has ${totalPages} pages, showing first ${maxPages} pages]`
    }
    
    return fullText.trim() || '[PDF content could not be extracted]'
  } catch (error: any) {
    console.error('[OpenAI PDF] Error extracting PDF text:', error)
    return '[PDF content could not be extracted]'
  }
}

// Store API key instances per API key to allow multiple users
const openaiCache: Map<string, OpenAI> = new Map()

function getClient(apiKey: string): OpenAI {
  if (!apiKey) {
    throw new Error('OpenAI API key is not configured. Please set it in Settings > API Keys.')
  }
  
  // Use cached instance if available, otherwise create new one
  if (!openaiCache.has(apiKey)) {
    openaiCache.set(apiKey, new OpenAI({ apiKey }))
  }
  
  return openaiCache.get(apiKey)!
}

// Map model names to OpenAI model identifiers
function getModelName(modelName: string, hasAttachments?: boolean): string {
  const modelMap: { [key: string]: string } = {
    'gpt-4.1-nano': 'gpt-4.1-nano',
    'gpt-5-mini': 'gpt-5-mini',
    'gpt-5.2': 'gpt-5.2',
  }
  return modelMap[modelName] || 'gpt-4.1-nano'
}

// Get max output tokens for a model (8K for all models)
function getMaxOutputTokens(modelName?: string): number {
  return 8192 // 8K tokens for all models
}

// Get max context window for a model (used for web search)
function getMaxContextWindow(modelName?: string): number {
  const contextWindows: { [key: string]: number } = {
    'gpt-4.1-nano': 200000,      // 200K tokens
    'gpt-5-mini': 200000,         // 200K tokens
    'gpt-5.2': 200000,            // 200K tokens
  }
  return contextWindows[modelName || 'gpt-4.1-nano'] || 200000
}

// Check if model is a gpt-5 model (which has different API constraints)
function isGpt5Model(modelName: string): boolean {
  return modelName.startsWith('gpt-5')
}

// Extract text from TipTap JSON node
function extractTextFromTipTap(node: any): string {
  if (typeof node === 'string') return node
  if (node.type === 'text') return node.text || ''
  if (node.content && Array.isArray(node.content)) {
    return node.content.map(extractTextFromTipTap).join('')
  }
  return ''
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

async function buildContext(documentContent?: string, projectId?: string, chatHistory?: AIChatMessage[], style?: string, cursorPosition?: number, apiKey?: string, userMessage?: string, geminiApiKey?: string): Promise<{ systemInstruction: string, chatHistory: AIChatMessage[], reasoningMetadata?: { actions?: { [key: string]: { fileCount: number; fileIds?: string[] } } } }> {
  let systemInstruction = `You are Lemona's AI writing companion.

Keep responses concise. 
Use rich markdown formatting to make information visually clear:
- Use ## headings for main sections (not just bold text)
- Use ### for subsections
- Use **bold** for emphasis and key points
- Use bullet lists for multiple items
- Use code blocks for technical content`

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

  // Add style instructions
  if (style && style !== 'Normal') {
    switch (style) {
      case 'Learning':
        systemInstruction += '\n\nResponse Style: LEARNING\n- Explain concepts step-by-step\n- Provide examples and analogies\n- Break down complex ideas into simpler parts\n- Encourage questions and deeper understanding'
        break
      case 'Concise':
        systemInstruction += '\n\nResponse Style: CONCISE\n- Be brief and to the point\n- Avoid unnecessary elaboration\n- Focus on key information\n- Use bullet points or short paragraphs when appropriate'
        break
      case 'Explanatory':
        systemInstruction += '\n\nResponse Style: EXPLANATORY\n- Provide detailed explanations\n- Include context and background\n- Explain the "why" behind concepts\n- Use examples and illustrations'
        break
      case 'Formal':
        systemInstruction += '\n\nResponse Style: FORMAL\n- Use formal language and tone\n- Structure responses professionally\n- Avoid contractions and casual expressions\n- Maintain a respectful and authoritative tone'
        break
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

  // 4️⃣ Add search results using reasoning service (system-controlled retrieval)
  let reasoningMetadata: { actions?: { [key: string]: { fileCount: number; fileIds?: string[] } } } | undefined = undefined
  
  if (userMessage && (geminiApiKey || apiKey)) {
    try {
      // CRITICAL: projectId is required for search
      if (!projectId) {
        console.warn('[OpenAI] Cannot search: projectId is not provided')
      } else {
        // Use reasoning service for intelligent retrieval
        // System controls the flow, AI evaluates relevance
        const { reason } = await import('./aiReasoningService.js')
        const reasoningResult = await reason(
          userMessage,
          projectId,
          geminiApiKey, // Prefer Gemini
          apiKey, // Fallback to OpenAI
          10 // max steps
        )

        // Collect metadata: actions and file counts
        const actions: { [key: string]: { fileCount: number; fileIds?: string[] } } = {}
        const searchedFiles = new Set<string>()
        
        // Count files searched
        for (const step of reasoningResult.steps) {
          if (step.action === 'search' && step.results) {
            for (const result of step.results) {
              if (result.chunk.fileId) {
                searchedFiles.add(result.chunk.fileId)
              }
            }
          }
        }
        
        if (searchedFiles.size > 0) {
          actions['Searched'] = { fileCount: searchedFiles.size, fileIds: Array.from(searchedFiles) }
        }
        
        if (Object.keys(actions).length > 0) {
          reasoningMetadata = { actions }
        }

        if (reasoningResult.finalResults.length > 0 && reasoningResult.formattedResults) {
          const folderLabel = reasoningResult.finalResults.some(r => r.chunk.paragraphType === 'semantic-block')
            ? 'Workspace and Library'
            : 'Library'
          
          systemInstruction += `\n\n## ${folderLabel.toUpperCase()} REFERENCES\n\nRelevant excerpts from ${folderLabel.toLowerCase()} documents:\n\n${reasoningResult.formattedResults}\n\nUse these references to inform your response, but do not assume they are the only relevant information.`
        }
      }
    } catch (error: any) {
      // Fallback to existing search logic if reasoning service fails
      console.warn('[OpenAI] Reasoning service failed, falling back to direct search:', error.message)
      
      try {
        if (projectId) {
          const { searchLibraryWithMentions } = await import('./semanticSearchService.js')
          const searchResult = await searchLibraryWithMentions(
            userMessage,
            projectId,
            geminiApiKey,
            apiKey,
            6
          )

          // Collect metadata from fallback search
          if (searchResult.results.length > 0) {
            const searchedFiles = new Set<string>()
            
            for (const result of searchResult.results) {
              if (result.chunk.fileId) {
                searchedFiles.add(result.chunk.fileId)
              }
            }
            
            if (searchedFiles.size > 0) {
              reasoningMetadata = {
                actions: {
                  'Searched': { fileCount: searchedFiles.size, fileIds: Array.from(searchedFiles) }
                }
              }
            }
          }

          if (searchResult.results.length > 0 && searchResult.formattedResults) {
            systemInstruction += `\n\n## LIBRARY REFERENCES\n\nThe user has referenced the Library folder (@Library or @filename). Here are relevant excerpts from the library files:\n\n${searchResult.formattedResults}\n\nUse these references to inform your response, but do not assume they are the only relevant information. The user may be asking about specific aspects of these documents.`
          }
        }
      } catch (fallbackError: any) {
        console.warn('[OpenAI] Fallback search also failed:', fallbackError.message)
      }
    }
  }

  return { systemInstruction, chatHistory: contextHistory, reasoningMetadata }
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
      const client = getClient(apiKey)
      const summaryPrompt = `Please provide a concise summary of the following conversation history. Focus on:
- Key topics discussed
- Important decisions or conclusions
- User's writing goals and preferences
- Any specific instructions or context mentioned

Keep the summary to approximately ${targetTokens} tokens (roughly ${targetTokens * 4} characters). Be concise but preserve important context.

Conversation history:
${historyText}

Summary:`

      const completion = await client.chat.completions.create({
        model: 'gpt-4.1-nano', // Use a lightweight model for summarization
        messages: [
          {
            role: 'system',
            content: 'You are a helpful assistant that summarizes conversation history concisely while preserving important context.'
          },
          {
            role: 'user',
            content: summaryPrompt
          }
        ],
        max_tokens: 4000, // 4K tokens for summarization
        temperature: 0.3 // Lower temperature for more focused summaries
      })

      const summary = completion.choices[0]?.message?.content || ''
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

export const openaiService = {
  async chat(apiKey: string, message: string, documentContent?: string, projectId?: string, chatHistory?: AIChatMessage[], modelName?: string, style?: string, attachments?: ChatAttachment[], geminiApiKey?: string): Promise<AIChatMessage> {
    const client = getClient(apiKey)
    const model = getModelName(modelName || 'gpt-4.1-nano', attachments && attachments.length > 0)
    const { systemInstruction, chatHistory: history } = await buildContext(documentContent, projectId, chatHistory, style, undefined, apiKey, message, geminiApiKey)
    
    try {
      const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
        {
          role: 'system',
          content: systemInstruction
        }
      ]

      // Add chat history with attachments
      for (const msg of history || []) {
        if (msg.attachments && msg.attachments.length > 0) {
          // Build content array for messages with attachments
          const content: Array<{ type: 'text' | 'image_url'; text?: string; image_url?: { url: string } }> = []
          
          // Add text content first (OpenAI prefers text before images)
          if (msg.content) {
            content.push({
              type: 'text',
              text: msg.content
            })
          } else if (msg.attachments.some(a => a.type === 'image')) {
            // If no text but has images, add a prompt
            content.push({
              type: 'text',
              text: 'Please analyze the attached image(s).'
            })
          }
          
          // Process attachments - extract PDF text asynchronously
          for (const attachment of msg.attachments) {
            if (attachment.type === 'image') {
              // Ensure base64 data is properly formatted
              const base64Data = attachment.data.startsWith('data:') 
                ? attachment.data.split(',')[1] || attachment.data
                : attachment.data
              
              content.push({
                type: 'image_url',
                image_url: {
                  url: `data:${attachment.mimeType || 'image/png'};base64,${base64Data}`
                }
              })
            } else if (attachment.type === 'pdf') {
              // Extract text from PDF
              const pdfText = await extractPDFTextFromBase64(attachment.data)
              content.push({
                type: 'text',
                text: `[PDF: ${attachment.name}]\n\n${pdfText}`
              })
            }
          }
          
          // Ensure content is always an array when we have attachments
          if (content.length > 0) {
            messages.push({
              role: msg.role === 'user' ? 'user' : 'assistant',
              content: content
            } as OpenAI.Chat.Completions.ChatCompletionMessageParam)
          } else {
            // Fallback to string content if no attachments
            messages.push({
              role: msg.role === 'user' ? 'user' : 'assistant',
              content: msg.content
            } as OpenAI.Chat.Completions.ChatCompletionMessageParam)
          }
        } else {
          messages.push({
            role: msg.role === 'user' ? 'user' : 'assistant',
            content: msg.content
          } as OpenAI.Chat.Completions.ChatCompletionMessageParam)
        }
      }

      // Build current message with attachments
      const currentMessageContent: Array<{ type: 'text' | 'image_url'; text?: string; image_url?: { url: string } }> = []
      
      // Add text message first (OpenAI prefers text before images)
      // If no text but we have images, add a prompt to analyze the image
      const textMessage = message || (attachments && attachments.some(a => a.type === 'image') 
        ? 'Please analyze the attached image(s) and provide a detailed description.' 
        : '')
      
      if (textMessage) {
        currentMessageContent.push({
          type: 'text',
          text: textMessage
        })
      }
      
      // Add attachments - extract PDF text
      if (attachments && attachments.length > 0) {
        for (const attachment of attachments) {
          if (attachment.type === 'image') {
            // Ensure base64 data is properly formatted
            const base64Data = attachment.data.startsWith('data:') 
              ? attachment.data.split(',')[1] || attachment.data
              : attachment.data
            
            currentMessageContent.push({
              type: 'image_url',
              image_url: {
                url: `data:${attachment.mimeType || 'image/png'};base64,${base64Data}`
              }
            })
          } else if (attachment.type === 'pdf') {
            // Extract text from PDF
            const pdfText = await extractPDFTextFromBase64(attachment.data)
            currentMessageContent.push({
              type: 'text',
              text: `[PDF: ${attachment.name}]\n\n${pdfText}`
            })
          }
        }
      }

      // If we have attachments, use content array, otherwise use string
      if (currentMessageContent.length > 0) {
        messages.push({
          role: 'user',
          content: currentMessageContent
        } as OpenAI.Chat.Completions.ChatCompletionMessageParam)
      } else {
        messages.push({
          role: 'user',
          content: message
        } as OpenAI.Chat.Completions.ChatCompletionMessageParam)
      }

      // gpt-5 models only support default temperature (1), not custom values
      // gpt-5 models use max_completion_tokens instead of max_tokens
      const completionParams: any = {
        model,
        messages,
      }
      if (isGpt5Model(model)) {
        completionParams.max_completion_tokens = getMaxOutputTokens(modelName)
      } else {
        completionParams.max_tokens = getMaxOutputTokens(modelName)
        completionParams.temperature = 0.7
      }
      
      const completion = await client.chat.completions.create(completionParams)

      const text = completion.choices[0]?.message?.content || ''
      return {
        id: `msg_${Date.now()}`,
        role: 'assistant',
        content: text,
        timestamp: new Date().toISOString(),
      }
    } catch (error: any) {
      console.error('OpenAI API error:', error)
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
    style?: string,
    geminiApiKey?: string
  ): AsyncGenerator<string> {
    const client = getClient(apiKey)
    const model = getModelName(modelName || 'gpt-4.1-nano', attachments && attachments.length > 0)
    const { systemInstruction, chatHistory: history, reasoningMetadata } = await buildContext(documentContent, projectId, chatHistory, style, undefined, apiKey, message, geminiApiKey)
    
    // Send metadata first (if available) as a special chunk
    if (reasoningMetadata) {
      // Add web_search action if enabled
      if (useWebSearch) {
        if (!reasoningMetadata.actions) {
          reasoningMetadata.actions = {}
        }
        reasoningMetadata.actions['Web search'] = { fileCount: 0 }
      }
      
      // Send metadata as JSON string in special format
      yield `__METADATA__${JSON.stringify(reasoningMetadata)}__METADATA__`
    } else if (useWebSearch) {
      // Only web search, no other actions
      yield `__METADATA__${JSON.stringify({ actions: { 'Web search': { fileCount: 0 } } })}__METADATA__`
    }
    
    try {
      // If web search is enabled, use OpenAI's Responses API with native web_search tool
      if (useWebSearch) {
        // Build input message from chat history and current message
        // For Responses API, we need to combine the conversation into a single input string
        let inputText = ''
        
        // Add system instruction if present
        if (systemInstruction) {
          inputText += `System: ${systemInstruction}\n\n`
        }
        
        // Add chat history with attachments
        for (const msg of history || []) {
          const role = msg.role === 'user' ? 'User' : 'Assistant'
          let msgText = msg.content || ''
          
          // Process attachments in history
          if (msg.attachments && msg.attachments.length > 0) {
            for (const attachment of msg.attachments) {
              if (attachment.type === 'pdf') {
                // Extract text from PDF
                const pdfText = await extractPDFTextFromBase64(attachment.data)
                msgText += `\n\n[PDF Attachment: ${attachment.name}]\n${pdfText}`
              } else if (attachment.type === 'image') {
                msgText += `\n\n[Image Attachment: ${attachment.name}]`
              }
            }
          }
          
          inputText += `${role}: ${msgText}\n\n`
        }
        
        // Add current message with attachments
        let currentMessageText = message || ''
        if (attachments && attachments.length > 0) {
          for (const attachment of attachments) {
            if (attachment.type === 'pdf') {
              // Extract text from PDF
              const pdfText = await extractPDFTextFromBase64(attachment.data)
              currentMessageText += `\n\n[PDF Attachment: ${attachment.name}]\n${pdfText}`
            } else if (attachment.type === 'image') {
              currentMessageText += `\n\n[Image Attachment: ${attachment.name}]`
            }
          }
        }
        
        inputText += `User: ${currentMessageText}`
        
        // Use OpenAI's Responses API with native web_search tool
        try {
          const response = await (client as any).responses.create({
            model: model, // Use the model from getModelName
            tools: [{ type: 'web_search' }],
            input: inputText,
          })
          
          // Stream the response text character by character to simulate streaming
          const responseText = response.output_text || ''
          const chunkSize = 10 // Characters per chunk for smooth streaming
          
          for (let i = 0; i < responseText.length; i += chunkSize) {
            const chunk = responseText.slice(i, i + chunkSize)
            yield chunk
            // Small delay to simulate streaming
            await new Promise(resolve => setTimeout(resolve, 10))
          }
          
          return
        } catch (responsesError: any) {
          // If Responses API fails (e.g., model doesn't support it or API not available),
          // fall back to Chat Completions API with function tool
          console.warn('Responses API failed, falling back to Chat Completions:', responsesError.message)
          // Continue to Chat Completions implementation below
        }
      }
      
      // Standard Chat Completions API implementation (for non-web-search or fallback)
      // Build messages array with support for attachments
      const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
        {
          role: 'system',
          content: systemInstruction
        }
      ]

      // Add chat history with attachments
      for (const msg of history || []) {
        if (msg.attachments && msg.attachments.length > 0) {
          // Build content array for messages with attachments
          const content: Array<{ type: 'text' | 'image_url'; text?: string; image_url?: { url: string } }> = []
          
          // Add text content first (OpenAI prefers text before images)
          if (msg.content) {
            content.push({
              type: 'text',
              text: msg.content
            })
          } else if (msg.attachments.some(a => a.type === 'image')) {
            // If no text but has images, add a prompt
            content.push({
              type: 'text',
              text: 'Please analyze the attached image(s).'
            })
          }
          
          // Process attachments - extract PDF text asynchronously
          for (const attachment of msg.attachments) {
            if (attachment.type === 'image') {
              // Ensure base64 data is properly formatted
              const base64Data = attachment.data.startsWith('data:') 
                ? attachment.data.split(',')[1] || attachment.data
                : attachment.data
              
              content.push({
                type: 'image_url',
                image_url: {
                  url: `data:${attachment.mimeType || 'image/png'};base64,${base64Data}`
                }
              })
            } else if (attachment.type === 'pdf') {
              // Extract text from PDF
              const pdfText = await extractPDFTextFromBase64(attachment.data)
              content.push({
                type: 'text',
                text: `[PDF: ${attachment.name}]\n\n${pdfText}`
              })
            }
          }
          
          // Ensure content is always an array when we have attachments
          if (content.length > 0) {
            messages.push({
              role: msg.role === 'user' ? 'user' : 'assistant',
              content: content
            } as OpenAI.Chat.Completions.ChatCompletionMessageParam)
          } else {
            // Fallback to string content if no attachments
            messages.push({
              role: msg.role === 'user' ? 'user' : 'assistant',
              content: msg.content
            } as OpenAI.Chat.Completions.ChatCompletionMessageParam)
          }
        } else {
          messages.push({
            role: msg.role === 'user' ? 'user' : 'assistant',
            content: msg.content
          } as OpenAI.Chat.Completions.ChatCompletionMessageParam)
        }
      }

      // Build current message with attachments
      const currentMessageContent: Array<{ type: 'text' | 'image_url'; text?: string; image_url?: { url: string } }> = []
      
      // Add text message first (OpenAI prefers text before images)
      // If no text but we have images, add a prompt to analyze the image
      const textMessage = message || (attachments && attachments.some(a => a.type === 'image') 
        ? 'Please analyze the attached image(s) and provide a detailed description.' 
        : '')
      
      if (textMessage) {
        currentMessageContent.push({
          type: 'text',
          text: textMessage
        })
      }
      
      // Add attachments - extract PDF text
      if (attachments && attachments.length > 0) {
        for (const attachment of attachments) {
          if (attachment.type === 'image') {
            // Ensure base64 data is properly formatted
            const base64Data = attachment.data.startsWith('data:') 
              ? attachment.data.split(',')[1] || attachment.data
              : attachment.data
            
            currentMessageContent.push({
              type: 'image_url',
              image_url: {
                url: `data:${attachment.mimeType || 'image/png'};base64,${base64Data}`
              }
            })
          } else if (attachment.type === 'pdf') {
            // Extract text from PDF
            const pdfText = await extractPDFTextFromBase64(attachment.data)
            currentMessageContent.push({
              type: 'text',
              text: `[PDF: ${attachment.name}]\n\n${pdfText}`
            })
          }
        }
      }

      messages.push({
        role: 'user',
        content: currentMessageContent
      } as OpenAI.Chat.Completions.ChatCompletionMessageParam)

      // Stream using Chat Completions API (no web search tools here since we handle it above)
      // gpt-5 models only support default temperature (1), not custom values
      // gpt-5 models use max_completion_tokens instead of max_tokens
      const streamParams: OpenAI.Chat.Completions.ChatCompletionCreateParamsStreaming = {
        model,
        messages,
        stream: true,
      } as any
      if (isGpt5Model(model)) {
        streamParams.max_completion_tokens = getMaxOutputTokens(modelName)
      } else {
        streamParams.max_tokens = getMaxOutputTokens(modelName)
        streamParams.temperature = 0.7
      }
      
      const stream = await client.chat.completions.create(streamParams)

      for await (const chunk of stream) {
        const choice = chunk.choices[0]
        const delta = choice?.delta
        const content = delta?.content
        
        if (content) {
          yield content
        }
      }
    } catch (error: any) {
      console.error('OpenAI API error:', error)
      throw new Error(`Failed to generate response: ${error.message || 'Unknown error'}`)
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
    const client = getClient(apiKey)
    const model = getModelName(modelName || 'gpt-4.1-nano', false)
    const { systemInstruction } = await buildContext(documentContent, projectId, undefined, undefined, undefined, apiKey)
    const beforeCursor = text.slice(0, cursorPosition)
    const afterCursor = text.slice(cursorPosition)
    const prompt = `${systemInstruction}\n\nUser is typing: "${beforeCursor}|${afterCursor}"\n\nPlease suggest the next few words or sentence to complete their thought. Only provide the continuation text, nothing else.`
    
    try {
      const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
        {
          role: 'system',
          content: systemInstruction
        },
        {
          role: 'user',
          content: prompt
        }
      ]

      const completionParams: any = {
        model,
        messages,
      }
      if (isGpt5Model(model)) {
        completionParams.max_completion_tokens = getMaxOutputTokens(modelName)
      } else {
        completionParams.max_tokens = getMaxOutputTokens(modelName)
        completionParams.temperature = 0.7
      }

      const completion = await client.chat.completions.create(completionParams)
      const suggestion = completion.choices[0]?.message?.content?.trim() || ''
      
      return {
        text: suggestion,
        start: cursorPosition,
        end: cursorPosition + suggestion.length,
      }
    } catch (error: any) {
      console.error('OpenAI autocomplete error:', error)
      throw new Error(`Failed to generate autocomplete: ${error.message || 'Unknown error'}`)
    }
  },
}

