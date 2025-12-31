// Desktop OpenAI Service - Uses OpenAI API
import OpenAI from 'openai'
import { AIChatMessage, ChatAttachment } from '../../../shared/types.js'
import { projectService } from './projectService.js'
import { documentService } from './documentService.js'
import { createRequire } from 'module'

// Import pdfjs-dist for PDF text extraction
const require = createRequire(import.meta.url)
const pdfjsLib = require('pdfjs-dist/legacy/build/pdf.js')
const pdfjsWorker = require.resolve('pdfjs-dist/legacy/build/pdf.worker.js')
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker

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
    'gpt-5-nano': 'gpt-5-nano',
    'gpt-5-mini': 'gpt-5-mini',
    'gpt-5.2': 'gpt-5.2',
  }
  return modelMap[modelName] || 'gpt-5-nano'
}

// Check if model is a gpt-5 model (which has different API constraints)
function isGpt5Model(modelName: string): boolean {
  return modelName.startsWith('gpt-5')
}

async function buildContext(documentContent?: string, projectId?: string, chatHistory?: AIChatMessage[], style?: string): Promise<{ systemInstruction: string, chatHistory: AIChatMessage[] }> {
  let systemInstruction = `You are a reliable, focused assistant for Lemona.

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

  let contextHistory: AIChatMessage[] = []

  // Add document context if available
  if (documentContent) {
    systemInstruction += `\n\nCurrent document context:\n${documentContent.slice(0, 8000)}`
  }

  // Add project context if available
  if (projectId) {
    try {
      const project = await projectService.getById(projectId)
      if (project) {
        systemInstruction += `\n\nProject context: ${project.title}`
        if (project.description) {
          systemInstruction += `\nDescription: ${project.description}`
        }
        if (project.intent) {
          systemInstruction += `\nIntent: ${project.intent}`
        }
      }
    } catch (error) {
      console.error('Failed to load project context:', error)
    }
  }

  // Add chat history if available
  if (chatHistory && chatHistory.length > 0) {
    contextHistory = [...chatHistory]
  }

  return { systemInstruction, chatHistory: contextHistory }
}

export const openaiService = {
  async chat(apiKey: string, message: string, documentContent?: string, projectId?: string, chatHistory?: AIChatMessage[], modelName?: string, style?: string, attachments?: ChatAttachment[]): Promise<AIChatMessage> {
    const client = getClient(apiKey)
    const model = getModelName(modelName || 'gpt-5-nano', attachments && attachments.length > 0)
    const { systemInstruction, chatHistory: history } = await buildContext(documentContent, projectId, chatHistory, style)
    
    try {
      const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
        {
          role: 'system',
          content: systemInstruction
        },
        ...(history || []).map(msg => ({
          role: msg.role === 'user' ? 'user' : 'assistant',
          content: msg.content
        } as OpenAI.Chat.Completions.ChatCompletionMessageParam)),
        {
          role: 'user',
          content: message
        }
      ]

      // gpt-5 models only support default temperature (1), not custom values
      const completionParams: any = {
        model,
        messages,
      }
      if (!isGpt5Model(model)) {
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
    style?: string
  ): AsyncGenerator<string> {
    const client = getClient(apiKey)
    const model = getModelName(modelName || 'gpt-5-nano', attachments && attachments.length > 0)
    const { systemInstruction, chatHistory: history } = await buildContext(documentContent, projectId, chatHistory, style)
    
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
        
        // Add chat history
        for (const msg of history || []) {
          const role = msg.role === 'user' ? 'User' : 'Assistant'
          inputText += `${role}: ${msg.content}\n\n`
        }
        
        // Add current message
        inputText += `User: ${message}`
        
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
      const streamParams: OpenAI.Chat.Completions.ChatCompletionCreateParamsStreaming = {
        model,
        messages,
        stream: true,
      }
      if (!isGpt5Model(model)) {
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
}

