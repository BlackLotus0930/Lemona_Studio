import { useState, useRef, useEffect } from 'react'
import { AIChatMessage, ChatAttachment } from '@shared/types'
import { aiApi, chatApi } from '../../services/api'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useTheme } from '../../contexts/ThemeContext'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { vscDarkPlus, vs } from 'react-syntax-highlighter/dist/esm/styles/prism'
// @ts-ignore
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward'
// @ts-ignore
import VpnKeyIcon from '@mui/icons-material/VpnKey'
// @ts-ignore
import CropOriginalIcon from '@mui/icons-material/CropOriginal'
// @ts-ignore
import AlternateEmailIcon from '@mui/icons-material/AlternateEmail'
// @ts-ignore
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf'
// @ts-ignore
import CloseIcon from '@mui/icons-material/Close'
// @ts-ignore
import ContentCopyIcon from '@mui/icons-material/ContentCopy'
// @ts-ignore
import CheckIcon from '@mui/icons-material/Check'

interface ChatInterfaceProps {
  documentId?: string
  chatId: string
  documentContent?: string
  isStreaming: boolean
  setIsStreaming: (streaming: boolean) => void
  onFirstMessage?: (message: string) => void
  initialInput?: string
  onInputSet?: () => void
}

export default function ChatInterface({ documentId, chatId, documentContent, isStreaming, setIsStreaming, onFirstMessage, initialInput, onInputSet }: ChatInterfaceProps) {
  const { theme } = useTheme()
  const [messages, setMessages] = useState<AIChatMessage[]>([])
  const [input, setInput] = useState(initialInput || '')
  const [isLoading, setIsLoading] = useState(false)
  
  // Handle initial input from external source (e.g., "Add to Chat" from editor)
  useEffect(() => {
    if (initialInput && initialInput !== input) {
      setInput(initialInput)
      if (textareaRef.current) {
        textareaRef.current.value = initialInput
        textareaRef.current.style.height = 'auto'
        textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`
        textareaRef.current.focus()
      }
      if (onInputSet) {
        onInputSet()
      }
    }
  }, [initialInput, input, onInputSet])
  const [isInputFocused, setIsInputFocused] = useState(false)
  const [useWebSearch, setUseWebSearch] = useState(false)
  const [selectedModel, setSelectedModel] = useState<'gemini-2.5-flash' | 'gemini-2.5-pro'>('gemini-2.5-flash')
  const [showSettingsModal, setShowSettingsModal] = useState(false)
  const [googleApiKey, setGoogleApiKey] = useState('')
  const [modalPosition, setModalPosition] = useState({ top: 0, left: 0 })
  const settingsButtonRef = useRef<HTMLButtonElement>(null)
  const modalRef = useRef<HTMLDivElement>(null)
  const apiKeyInputRef = useRef<HTMLInputElement>(null)
  const hasNotifiedFirstMessage = useRef(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const scrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const updateMessageTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const currentAssistantMessageIdRef = useRef<string | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const inputContainerRef = useRef<HTMLDivElement>(null)
  const unifiedContainerRef = useRef<HTMLDivElement>(null)
  const previousMessageCountRef = useRef<number>(0)
  const hasRestoredScrollRef = useRef<boolean>(false)
  const lastStreamingContentLengthRef = useRef<number>(0)
  const streamingScrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [inputContainerWidth, setInputContainerWidth] = useState<number | null>(null)
  const [attachments, setAttachments] = useState<ChatAttachment[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [copiedCodeBlocks, setCopiedCodeBlocks] = useState<Set<string>>(new Set())
  
  // Load Google API key from localStorage on mount
  useEffect(() => {
    try {
      const savedKey = localStorage.getItem('googleApiKey')
      if (savedKey) {
        setGoogleApiKey(savedKey)
      }
    } catch (error) {
      console.error('Failed to load Google API key:', error)
    }
  }, [])

  // Save Google API key to localStorage
  const handleApiKeyChange = (value: string) => {
    setGoogleApiKey(value)
    try {
      if (value) {
        localStorage.setItem('googleApiKey', value)
      } else {
        localStorage.removeItem('googleApiKey')
      }
    } catch (error) {
      console.error('Failed to save Google API key:', error)
    }
  }

  // Update modal position when opening
  useEffect(() => {
    if (showSettingsModal && settingsButtonRef.current) {
      const updatePosition = () => {
        if (settingsButtonRef.current) {
          const rect = settingsButtonRef.current.getBoundingClientRect()
          // Position modal more to the left to cover both editor and AI chat panel
          // Move it left by approximately 300px to center it better
          setModalPosition({
            top: rect.top - 8, // 8px above the button
            left: Math.max(20, rect.left - 150), // Move left by 300px, but keep at least 20px from left edge
          })
        }
      }
      updatePosition()
      window.addEventListener('resize', updatePosition)
      return () => window.removeEventListener('resize', updatePosition)
    }
  }, [showSettingsModal])

  // Close modal when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (showSettingsModal) {
        const target = event.target as Node
        if (
          modalRef.current &&
          !modalRef.current.contains(target) &&
          settingsButtonRef.current &&
          !settingsButtonRef.current.contains(target)
        ) {
          setShowSettingsModal(false)
        }
      }
    }

    if (showSettingsModal) {
      // Use capture phase to catch clicks before they bubble
      document.addEventListener('mousedown', handleClickOutside, true)
      return () => {
        document.removeEventListener('mousedown', handleClickOutside, true)
      }
    }
  }, [showSettingsModal])
  
  const bgColor = theme === 'dark' ? '#141414' : '#ffffff'

  // Removed scroll position saving/loading - AI panel should maintain consistent state across files
  const brighterBg = theme === 'dark' ? '#141414' : '#ffffff'
  const inputBg = theme === 'dark' ? '#1d1d1d' : '#ffffff'
  const borderColor = theme === 'dark' ? '#313131' : '#dadce0'
  const textColor = theme === 'dark' ? '#D6D6DD' : '#202124'
  const secondaryTextColor = theme === 'dark' ? '#858585' : '#9aa0a6'
  const userMessageBg = theme === 'dark' ? '#1C1C1C' : '#f8f8f8'

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  // Reset scroll state when documentId or chatId changes
  // Keep scroll position unchanged when switching files - don't auto-scroll
  useEffect(() => {
    if (!documentId || !chatId || !scrollContainerRef.current) return

    hasRestoredScrollRef.current = false
    previousMessageCountRef.current = 0

    // Don't auto-scroll when switching files - maintain current scroll position
    // Just mark as restored so new messages can still auto-scroll if user is near bottom
    setTimeout(() => {
      hasRestoredScrollRef.current = true
    }, 150)
  }, [documentId, chatId])

  // Auto-scroll to bottom only when new messages are added (not on initial load)
  useEffect(() => {
    if (!hasRestoredScrollRef.current || !scrollContainerRef.current) return

    const currentMessageCount = messages.length
    const previousMessageCount = previousMessageCountRef.current

    // Only auto-scroll if a new message was actually added
    if (currentMessageCount > previousMessageCount && currentMessageCount > 0) {
      // Only auto-scroll if we're near the bottom (within 100px)
      // This prevents auto-scrolling when user is reading older messages
      const container = scrollContainerRef.current
      const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 100
      if (isNearBottom) {
        scrollToBottom()
      }
    }

    previousMessageCountRef.current = currentMessageCount
  }, [messages])

  // Auto-scroll during streaming (ChatGPT-like experience)
  useEffect(() => {
    if (!hasRestoredScrollRef.current || !scrollContainerRef.current || !isStreaming) {
      // Reset tracking when not streaming
      if (!isStreaming) {
        lastStreamingContentLengthRef.current = 0
      }
      return
    }

    const container = scrollContainerRef.current
    const lastMessage = messages[messages.length - 1]
    
    // Only auto-scroll if the last message is from assistant and we're streaming
    if (lastMessage && lastMessage.role === 'assistant') {
      const currentContentLength = lastMessage.content.length
      
      // Only scroll if content actually changed
      if (currentContentLength !== lastStreamingContentLengthRef.current) {
        lastStreamingContentLengthRef.current = currentContentLength
        
        // Check if user is near the bottom (within 200px for streaming)
        const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 200
        
        if (isNearBottom) {
          // Clear any pending scroll
          if (streamingScrollTimeoutRef.current) {
            clearTimeout(streamingScrollTimeoutRef.current)
          }
          
          // Debounce scroll slightly for smoother performance during rapid updates
          streamingScrollTimeoutRef.current = setTimeout(() => {
            if (messagesEndRef.current && scrollContainerRef.current) {
              // Use instant scroll for streaming (smoother than smooth during rapid updates)
              messagesEndRef.current.scrollIntoView({ behavior: 'auto' })
            }
          }, 50) // Small debounce for performance
        }
      }
    }
    
    return () => {
      if (streamingScrollTimeoutRef.current) {
        clearTimeout(streamingScrollTimeoutRef.current)
      }
    }
  }, [messages, isStreaming])

  // Measure input container width to match user message width
  useEffect(() => {
    const updateWidth = () => {
      // Use the unified container ref directly for accurate width measurement
      // This container represents the actual input box, not affected by attachments preview
      if (unifiedContainerRef.current) {
        const width = unifiedContainerRef.current.offsetWidth
        setInputContainerWidth(width)
      } else if (inputContainerRef.current) {
        // Fallback: use the input container width minus padding
        const containerWidth = inputContainerRef.current.offsetWidth
        const padding = 12 + 14 // left + right padding
        setInputContainerWidth(containerWidth - padding)
      }
    }
    
    // Use a small delay to ensure DOM is ready
    const timeoutId = setTimeout(updateWidth, 0)
    window.addEventListener('resize', updateWidth)
    
    // Use ResizeObserver to watch for panel width changes
    const resizeObserver = new ResizeObserver(() => {
      updateWidth()
    })
    
    if (unifiedContainerRef.current) {
      resizeObserver.observe(unifiedContainerRef.current)
    } else if (inputContainerRef.current) {
      resizeObserver.observe(inputContainerRef.current)
    }
    
    return () => {
      clearTimeout(timeoutId)
      window.removeEventListener('resize', updateWidth)
      resizeObserver.disconnect()
    }
  }, [attachments]) // Recalculate when attachments change

  // Show scrollbar when textarea content overflows
  useEffect(() => {
    const textarea = textareaRef.current
    if (!textarea) return

    const checkOverflow = () => {
      if (textarea.scrollHeight > textarea.clientHeight) {
        textarea.classList.add('show-scrollbar')
      } else {
        textarea.classList.remove('show-scrollbar')
      }
    }

    checkOverflow()
    const observer = new ResizeObserver(checkOverflow)
    observer.observe(textarea)
    
    return () => {
      observer.disconnect()
    }
  }, [input])

  // Load messages when documentId or chatId changes
  useEffect(() => {
    if (!documentId || !chatId) {
      setMessages([])
      hasNotifiedFirstMessage.current = false
      return
    }

    const loadMessages = async () => {
      try {
        // IPC returns data directly, not wrapped in { data: ... }
        const loadedMessages = await chatApi.getChat(documentId, chatId)
        // Ensure messages is always an array
        const messages = Array.isArray(loadedMessages) ? loadedMessages : []
        setMessages(messages)
        // Initialize addedMessageIdsRef with existing message IDs
        addedMessageIdsRef.current = new Set(messages.map(msg => msg.id))
        // Reset notification flag if chat already has messages
        hasNotifiedFirstMessage.current = messages.length > 0
      } catch (error) {
        console.error('Failed to load chat messages:', error)
        setMessages([])
        addedMessageIdsRef.current = new Set()
        hasNotifiedFirstMessage.current = false
      }
    }

    loadMessages()
  }, [documentId, chatId])

  // Add scroll detection and edge detection to show scrollbar
  useEffect(() => {
    const container = scrollContainerRef.current
    if (!container || !documentId || !chatId) return

    const EDGE_DISTANCE = 20 // pixels from edge to show scrollbar

    const handleScroll = () => {
      if (container) {
        container.classList.add('scrolling')
        if (scrollTimeoutRef.current) {
          clearTimeout(scrollTimeoutRef.current)
        }
        scrollTimeoutRef.current = setTimeout(() => {
          if (container) {
            container.classList.remove('scrolling')
          }
        }, 600) // Slightly longer than transition duration (400ms) to allow fade-out

        // Removed scroll position saving - AI panel maintains consistent state across files
      }
    }

    const handleMouseMove = (e: MouseEvent) => {
      if (!container) return
      const rect = container.getBoundingClientRect()
      const mouseX = e.clientX - rect.left
      const mouseY = e.clientY - rect.top
      const width = rect.width
      const height = rect.height
      
      // Check if mouse is near right edge (for vertical scrollbar) or bottom edge (for horizontal scrollbar)
      const nearRightEdge = mouseX > width - EDGE_DISTANCE
      const nearBottomEdge = mouseY > height - EDGE_DISTANCE
      
      if (nearRightEdge || nearBottomEdge) {
        container.classList.add('show-scrollbar')
      } else {
        container.classList.remove('show-scrollbar')
      }
    }

    const handleMouseLeave = () => {
      if (container) {
        container.classList.remove('show-scrollbar')
      }
    }

    container.addEventListener('scroll', handleScroll, { passive: true })
    container.addEventListener('mousemove', handleMouseMove, { passive: true })
    container.addEventListener('mouseleave', handleMouseLeave)
    
    return () => {
      container.removeEventListener('scroll', handleScroll)
      container.removeEventListener('mousemove', handleMouseMove)
      container.removeEventListener('mouseleave', handleMouseLeave)
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current)
      }
    }
  }, [documentId, chatId])

  // Track which messages have been added to chat history
  const addedMessageIdsRef = useRef<Set<string>>(new Set())

  // Helper function to save/update message with debouncing for streaming
  const saveMessage = async (message: AIChatMessage, isStreaming: boolean = false) => {
    if (!documentId || !chatId) return

    try {
      const messageId = message.id
      const isFirstTime = !addedMessageIdsRef.current.has(messageId)

      if (isStreaming) {
        if (isFirstTime) {
          // First time: add the message
          await chatApi.addMessage(documentId, chatId, message)
          addedMessageIdsRef.current.add(messageId)
        } else {
          // Subsequent updates: debounce updates during streaming (save every 500ms)
        if (updateMessageTimeoutRef.current) {
          clearTimeout(updateMessageTimeoutRef.current)
        }
        updateMessageTimeoutRef.current = setTimeout(async () => {
            try {
              await chatApi.updateMessage(documentId, chatId, messageId, message.content)
            } catch (error) {
              // If update fails (e.g., message not found), try adding it again
              console.warn('Update failed, trying to add message:', error)
              await chatApi.addMessage(documentId, chatId, message)
            }
        }, 500)
        }
      } else {
        // Save immediately if not streaming
        if (updateMessageTimeoutRef.current) {
          clearTimeout(updateMessageTimeoutRef.current)
          updateMessageTimeoutRef.current = null
        }
        
        if (isFirstTime) {
        await chatApi.addMessage(documentId, chatId, message)
          addedMessageIdsRef.current.add(messageId)
        } else {
          // Final save: update the message
          await chatApi.updateMessage(documentId, chatId, messageId, message.content)
        }
      }
    } catch (error) {
      console.error('Failed to save message:', error)
    }
  }

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (updateMessageTimeoutRef.current) {
        clearTimeout(updateMessageTimeoutRef.current)
      }
    }
  }, [])

  // Helper function to process files and add as attachments
  const processFiles = async (files: FileList | File[]): Promise<ChatAttachment[]> => {
    const newAttachments: ChatAttachment[] = []
    const fileArray = Array.from(files)

    for (const file of fileArray) {
      const fileType = file.type
      const isImage = fileType.startsWith('image/')
      const isPDF = fileType === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')

      if (!isImage && !isPDF) {
        console.warn(`Unsupported file type: ${fileType}`)
        continue
      }

      try {
        // Read file as base64
        const base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader()
          reader.onload = () => {
            const result = reader.result as string
            // Remove data URL prefix (e.g., "data:image/png;base64,")
            const base64Data = result.includes(',') ? result.split(',')[1] : result
            resolve(base64Data)
          }
          reader.onerror = reject
          reader.readAsDataURL(file)
        })

        const attachment: ChatAttachment = {
          id: `att_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          type: isImage ? 'image' : 'pdf',
          name: file.name || (isImage ? 'pasted-image.png' : 'pasted-file.pdf'),
          data: base64,
          mimeType: fileType,
        }

        newAttachments.push(attachment)
      } catch (error) {
        console.error('Failed to read file:', error)
      }
    }

    return newAttachments
  }

  // Handle file selection
  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files
    if (!files || files.length === 0) return

    const newAttachments = await processFiles(files)

    if (newAttachments.length > 0) {
      setAttachments(prev => [...prev, ...newAttachments])
    }

    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  // Handle paste event
  const handlePaste = async (event: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const clipboardData = event.clipboardData
    if (!clipboardData) return

    const items = clipboardData.items
    const files: File[] = []

    // Check for files in clipboard
    for (let i = 0; i < items.length; i++) {
      const item = items[i]
      if (item.kind === 'file') {
        const file = item.getAsFile()
        if (file) {
          files.push(file)
        }
      }
    }

    // If files found, process them as attachments
    if (files.length > 0) {
      event.preventDefault() // Prevent default paste behavior
      const newAttachments = await processFiles(files)
      if (newAttachments.length > 0) {
        setAttachments(prev => [...prev, ...newAttachments])
      }
    }
  }

  // Remove attachment
  const handleRemoveAttachment = (attachmentId: string) => {
    setAttachments(prev => prev.filter(att => att.id !== attachmentId))
  }

  // Copy code block to clipboard
  const handleCopyCode = async (code: string, blockId: string) => {
    try {
      await navigator.clipboard.writeText(code)
      setCopiedCodeBlocks(prev => new Set(prev).add(blockId))
      setTimeout(() => {
        setCopiedCodeBlocks(prev => {
          const newSet = new Set(prev)
          newSet.delete(blockId)
          return newSet
        })
      }, 2000)
    } catch (error) {
      console.error('Failed to copy code:', error)
    }
  }

  const handleSend = async () => {
    if ((!input.trim() && attachments.length === 0) || isLoading || !documentId || !chatId) return

    const userMessage: AIChatMessage = {
      id: `msg_${Date.now()}`,
      role: 'user',
      content: input,
      timestamp: new Date().toISOString(),
      attachments: attachments.length > 0 ? [...attachments] : undefined,
    }

    setMessages(prev => [...prev, userMessage])
    setInput('')
    setAttachments([]) // Clear attachments after sending
    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
    }
    setIsLoading(true)
    setIsStreaming(true)

    // Notify parent about first message for chat naming
    if (!hasNotifiedFirstMessage.current && onFirstMessage) {
      onFirstMessage(input.trim())
      hasNotifiedFirstMessage.current = true
    }

    // Save user message immediately
    await saveMessage(userMessage, false)

    try {
      // Pass chat history (excluding the just-added user message) for conversation continuity
      const chatHistoryForAPI = messages.filter(msg => msg.id !== userMessage.id)
      const response = await aiApi.streamChat(input, documentContent, documentId, chatHistoryForAPI, useWebSearch, selectedModel, attachments.length > 0 ? attachments : undefined)
      const reader = response.body?.getReader()
      const decoder = new TextDecoder()

      let assistantMessage: AIChatMessage = {
        id: `msg_${Date.now() + 1}`,
        role: 'assistant',
        content: '',
        timestamp: new Date().toISOString(),
      }

      currentAssistantMessageIdRef.current = assistantMessage.id
      setMessages(prev => [...prev, assistantMessage])

      // Scroll to bottom when assistant message starts
      setTimeout(() => {
        scrollToBottom()
      }, 100)

      // Save assistant message immediately (empty content, will be updated during streaming)
      await saveMessage(assistantMessage, true)

      if (reader) {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          const chunk = decoder.decode(value)
          const lines = chunk.split('\n')

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const data = JSON.parse(line.slice(6))
                if (data.chunk) {
                  assistantMessage.content += data.chunk
                  setMessages(prev => {
                    const updated = [...prev]
                    updated[updated.length - 1] = { ...assistantMessage }
                    return updated
                  })
                  // Update message during streaming (debounced)
                  await saveMessage(assistantMessage, true)
                }
              } catch (e) {
                // Ignore parse errors
              }
            }
          }
        }
      }

      // Save final message when streaming completes
      if (currentAssistantMessageIdRef.current) {
        await saveMessage(assistantMessage, false)
        currentAssistantMessageIdRef.current = null
      }
    } catch (error) {
      console.error('Chat error:', error)
      const errorMessage: AIChatMessage = {
        id: `msg_${Date.now() + 2}`,
        role: 'assistant',
        content: 'Sorry, I encountered an error. Please try again.',
        timestamp: new Date().toISOString(),
      }
      setMessages(prev => [...prev, errorMessage])
      // Save error message
      if (documentId && chatId) {
        await saveMessage(errorMessage, false)
      }
    } finally {
      setIsLoading(false)
      setIsStreaming(false)
    }
  }

  return (
    <div style={{
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      backgroundColor: bgColor
    }}>
        <div 
          ref={scrollContainerRef}
          className={`scrollable-container ${theme === 'dark' ? 'dark-theme' : ''}`}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: 0,
            display: 'flex',
            flexDirection: 'column',
            backgroundColor: brighterBg,
            userSelect: 'text',
            WebkitUserSelect: 'text',
            MozUserSelect: 'text',
            msUserSelect: 'text'
          }}>
        {messages.length === 0 && (
          <div style={{
            textAlign: 'center',
            color: secondaryTextColor,
            marginTop: '40px',
            padding: '16px'
          }}>
            <p style={{ color: textColor }}>Start a conversation</p>
          </div>
        )}
        {messages.map((message) => (
          <div
            key={message.id}
            style={{
              width: '100%',
              display: 'flex',
              flexDirection: 'column',
              padding: message.role === 'assistant' ? '16px 16px' : '8px 16px',
              backgroundColor: brighterBg,
            }}
          >
            {message.role === 'user' && (
              <div
                style={{
                  marginLeft: 'auto',
                  width: inputContainerWidth ? `${inputContainerWidth}px` : '92%',
                  maxWidth: inputContainerWidth ? `${inputContainerWidth}px` : '92%',
                  padding: '8px 12px',
                  borderRadius: '8px',
                  backgroundColor: userMessageBg,
                  border: `1px solid ${theme === 'dark' ? '#313131' : '#dadce0'}`,
                  color: textColor,
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                  fontSize: '13px',
                  lineHeight: '1.6',
                  fontFamily: '"Noto Sans SC", "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
                  userSelect: 'text',
                  WebkitUserSelect: 'text',
                  MozUserSelect: 'text',
                  msUserSelect: 'text',
                  cursor: 'text'
                }}
              >
                {message.content}
                {message.attachments && message.attachments.length > 0 && (
                  <div style={{
                    marginTop: '8px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '8px'
                  }}>
                    {message.attachments.map((att) => (
                      <div key={att.id} style={{
                        borderRadius: '6px',
                        overflow: 'hidden',
                        border: `1px solid ${theme === 'dark' ? '#313131' : '#dadce0'}`,
                        width: '60px',
                        height: '60px',
                        flexShrink: 0
                      }}>
                        {att.type === 'image' ? (
                          <img 
                            src={`data:${att.mimeType || 'image/png'};base64,${att.data}`}
                            alt={att.name}
                            style={{
                              width: '100%',
                              height: '100%',
                              display: 'block',
                              objectFit: 'cover'
                            }}
                          />
                        ) : (
                          <div style={{
                            padding: '4px',
                            backgroundColor: theme === 'dark' ? '#2d2d2d' : '#f5f5f5',
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            justifyContent: 'center',
                            height: '100%',
                            width: '100%'
                          }}>
                            <PictureAsPdfIcon style={{ fontSize: '20px', color: theme === 'dark' ? '#d6d6d6' : '#202124', marginBottom: '2px' }} />
                            <span style={{ 
                              fontSize: '8px', 
                              color: textColor,
                              textAlign: 'center',
                              wordBreak: 'break-word',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              display: '-webkit-box',
                              WebkitLineClamp: 2,
                              WebkitBoxOrient: 'vertical'
                            }}>{att.name}</span>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
            {message.role === 'assistant' && (
              <div
                style={{
                  width: '100%',
                  color: textColor,
                  fontSize: '14px',
                  lineHeight: '1.7',
                  fontFamily: '"Noto Sans SC", "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
                  userSelect: 'text',
                  WebkitUserSelect: 'text',
                  MozUserSelect: 'text',
                  msUserSelect: 'text',
                  cursor: 'text'
                }}
              >
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={{
                    // Headers
                    h1: ({node, ...props}) => <h1 style={{ 
                      fontSize: '26px', 
                      fontWeight: 700, 
                      marginTop: '28px', 
                      marginBottom: '16px', 
                      color: textColor, 
                      lineHeight: '1.3',
                      letterSpacing: '-0.02em'
                    }} {...props} />,
                    h2: ({node, ...props}) => <h2 style={{ 
                      fontSize: '22px', 
                      fontWeight: 600, 
                      marginTop: '24px', 
                      marginBottom: '12px', 
                      color: textColor, 
                      lineHeight: '1.3',
                      letterSpacing: '-0.01em'
                    }} {...props} />,
                    h3: ({node, ...props}) => <h3 style={{ 
                      fontSize: '19px', 
                      fontWeight: 600, 
                      marginTop: '20px', 
                      marginBottom: '10px', 
                      color: textColor, 
                      lineHeight: '1.3'
                    }} {...props} />,
                    h4: ({node, ...props}) => <h4 style={{ 
                      fontSize: '17px', 
                      fontWeight: 600, 
                      marginTop: '18px', 
                      marginBottom: '10px', 
                      color: textColor, 
                      lineHeight: '1.3'
                    }} {...props} />,
                    h5: ({node, ...props}) => <h5 style={{ 
                      fontSize: '16px', 
                      fontWeight: 600, 
                      marginTop: '16px', 
                      marginBottom: '8px', 
                      color: textColor, 
                      lineHeight: '1.3'
                    }} {...props} />,
                    h6: ({node, ...props}) => <h6 style={{ 
                      fontSize: '15px', 
                      fontWeight: 600, 
                      marginTop: '14px', 
                      marginBottom: '8px', 
                      color: textColor, 
                      lineHeight: '1.3'
                    }} {...props} />,
                    // Paragraphs
                    p: ({node, ...props}) => <p style={{ 
                      marginBottom: '14px', 
                      marginTop: 0, 
                      lineHeight: '1.7', 
                      color: textColor 
                    }} {...props} />,
                    // Code blocks - handle inline code
                    code: ({node, inline, className, children, ...props}: any) => {
                      if (inline) {
                        return <code style={{ 
                          backgroundColor: theme === 'dark' ? '#2d2d2d' : '#f1f3f4', 
                          padding: '3px 6px', 
                          borderRadius: '4px', 
                          fontSize: '13px',
                          fontFamily: '"SF Mono", Monaco, "Cascadia Code", "Roboto Mono", Consolas, "Courier New", monospace',
                          color: theme === 'dark' ? '#ce9178' : '#c5221f',
                          fontWeight: 500
                        }} {...props}>{children}</code>
                      }
                      // For code blocks, return the code element as-is (will be wrapped in pre)
                      return <code className={className}>{children}</code>
                    },
                    // Pre component handles code blocks
                    pre: ({children}: any) => {
                      // Extract code from children (which is a code element)
                      const codeProps = (children as any)?.props || {}
                      const codeElement = codeProps.children
                      const className = codeProps.className || ''
                      const match = /language-(\w+)/.exec(className || '')
                      const language = match ? match[1] : ''
                      const codeString = String(codeElement || '').replace(/\n$/, '')
                      // Create a stable ID based on message ID and code content hash
                      const codeHash = codeString.split('').reduce((acc, char) => {
                        const hash = ((acc << 5) - acc) + char.charCodeAt(0)
                        return hash & hash
                      }, 0)
                      const blockId = `${message.id}-${codeHash}-${codeString.length}`
                      const isCopied = copiedCodeBlocks.has(blockId)
                      
                      return (
                        <div style={{
                          position: 'relative',
                          marginTop: '16px',
                          marginBottom: '16px'
                        }}>
                          <div style={{
                            position: 'relative',
                            backgroundColor: theme === 'dark' ? '#000000' : '#f8f9fa',
                            borderRadius: '8px',
                            overflow: 'hidden'
                          }}>
                            {/* Language name overlay - top left */}
                            {language && (
                              <div style={{
                                position: 'absolute',
                                top: '8px',
                                left: '12px',
                                zIndex: 2,
                                fontSize: '11px',
                                color: theme === 'dark' ? '#8e8e93' : '#6e6e73',
                                fontWeight: 500,
                                textTransform: 'uppercase',
                                letterSpacing: '0.5px',
                                pointerEvents: 'none'
                              }}>
                                {language}
                              </div>
                            )}
                            {/* Copy button overlay - top right */}
                            <button
                              onClick={() => handleCopyCode(codeString, blockId)}
                              style={{
                                position: 'absolute',
                                top: '8px',
                                right: '14px',
                                zIndex: 2,
                                display: 'flex',
                                alignItems: 'center',
                                gap: '4px',
                                padding: 0,
                                backgroundColor: 'transparent',
                                border: 'none',
                                color: theme === 'dark' ? '#d1d1d6' : secondaryTextColor,
                                cursor: 'pointer',
                                fontSize: '12px',
                                fontFamily: 'inherit',
                                transition: 'opacity 0.2s'
                              }}
                              onMouseEnter={(e) => {
                                e.currentTarget.style.opacity = '0.7'
                              }}
                              onMouseLeave={(e) => {
                                e.currentTarget.style.opacity = '1'
                              }}
                            >
                              {isCopied ? (
                                <>
                                  <CheckIcon style={{ fontSize: '14px' }} />
                                  <span>Copied</span>
                                </>
                              ) : (
                                <>
                                  <ContentCopyIcon style={{ fontSize: '14px' }} />
                                  <span>Copy</span>
                                </>
                              )}
                            </button>
                            {/* Code content */}
                            <SyntaxHighlighter
                              language={language || 'text'}
                              style={theme === 'dark' ? vscDarkPlus : vs}
                              customStyle={{
                                margin: 0,
                                padding: '16px',
                                paddingTop: language ? '40px' : '16px',
                                fontSize: '13px',
                                lineHeight: '1.5',
                                fontFamily: '"SF Mono", Monaco, "Cascadia Code", "Roboto Mono", Consolas, "Courier New", monospace',
                                backgroundColor: theme === 'dark' ? '#000000' : '#f8f9fa',
                                borderRadius: '8px'
                              }}
                              PreTag="div"
                            >
                              {codeString}
                            </SyntaxHighlighter>
                          </div>
                        </div>
                      )
                    },
                    // Lists
                    ul: ({node, ...props}) => <ul style={{ 
                      marginBottom: '14px', 
                      paddingLeft: '28px', 
                      marginTop: '8px', 
                      listStyleType: 'disc',
                      color: textColor,
                      lineHeight: '1.7'
                    }} {...props} />,
                    ol: ({node, ...props}) => <ol style={{ 
                      marginBottom: '14px', 
                      paddingLeft: '28px', 
                      marginTop: '8px', 
                      color: textColor,
                      lineHeight: '1.7'
                    }} {...props} />,
                    li: ({node, ...props}) => <li style={{ 
                      marginBottom: '8px', 
                      lineHeight: '1.7', 
                      color: textColor,
                      paddingLeft: '4px'
                    }} {...props} />,
                    // Links
                    a: ({node, ...props}: any) => <a 
                      style={{ 
                        color: theme === 'dark' ? '#4a9eff' : '#1a73e8', 
                        textDecoration: 'none',
                        borderBottom: `1px solid ${theme === 'dark' ? 'rgba(74, 158, 255, 0.3)' : 'rgba(26, 115, 232, 0.3)'}`,
                        transition: 'all 0.2s'
                      }} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      onMouseEnter={(e) => {
                        e.currentTarget.style.borderBottomColor = theme === 'dark' ? '#4a9eff' : '#1a73e8'
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.borderBottomColor = theme === 'dark' ? 'rgba(74, 158, 255, 0.3)' : 'rgba(26, 115, 232, 0.3)'
                      }}
                      {...props} 
                    />,
                    // Blockquotes
                    blockquote: ({node, ...props}) => <blockquote style={{
                      borderLeft: `4px solid ${theme === 'dark' ? '#4a9eff' : '#1a73e8'}`,
                      paddingLeft: '20px',
                      paddingRight: '16px',
                      paddingTop: '8px',
                      paddingBottom: '8px',
                      marginLeft: 0,
                      marginRight: 0,
                      marginTop: '16px',
                      marginBottom: '16px',
                      backgroundColor: theme === 'dark' ? 'rgba(74, 158, 255, 0.05)' : 'rgba(26, 115, 232, 0.05)',
                      color: textColor,
                      fontStyle: 'normal',
                      borderRadius: '0 6px 6px 0'
                    }} {...props} />,
                    // Horizontal rule
                    hr: ({node, ...props}) => <hr style={{ 
                      border: 'none', 
                      borderTop: `1px solid ${theme === 'dark' ? '#3e3e3e' : '#e0e0e0'}`, 
                      margin: '24px 0' 
                    }} {...props} />,
                    // Tables
                    table: ({node, ...props}) => <div style={{ 
                      overflowX: 'auto', 
                      marginBottom: '16px', 
                      marginTop: '12px',
                      borderRadius: '8px',
                      border: `1px solid ${theme === 'dark' ? '#3e3e3e' : '#e0e0e0'}`
                    }}>
                      <table style={{ 
                        borderCollapse: 'collapse', 
                        width: '100%',
                        fontSize: '14px'
                      }} {...props} />
                    </div>,
                    thead: ({node, ...props}) => <thead style={{ 
                      backgroundColor: theme === 'dark' ? '#252525' : '#f8f9fa' 
                    }} {...props} />,
                    tbody: ({node, ...props}) => <tbody {...props} />,
                    th: ({node, ...props}) => <th style={{ 
                      border: `1px solid ${theme === 'dark' ? '#3e3e3e' : '#e0e0e0'}`, 
                      padding: '12px 16px', 
                      textAlign: 'left',
                      fontWeight: 600,
                      fontSize: '14px',
                      color: textColor,
                      backgroundColor: theme === 'dark' ? '#252525' : '#f8f9fa'
                    }} {...props} />,
                    td: ({node, ...props}) => <td style={{ 
                      border: `1px solid ${theme === 'dark' ? '#3e3e3e' : '#e0e0e0'}`, 
                      padding: '12px 16px',
                      fontSize: '14px',
                      color: textColor
                    }} {...props} />,
                    // Strong and emphasis
                    strong: ({node, ...props}) => <strong style={{ 
                      fontWeight: 600,
                      color: textColor
                    }} {...props} />,
                    em: ({node, ...props}) => <em style={{ 
                      fontStyle: 'italic',
                      color: textColor
                    }} {...props} />,
                  }}
                >
                  {message.content}
                </ReactMarkdown>
              </div>
            )}
          </div>
        ))}
        {isLoading && (
          <div style={{
            width: '100%',
            padding: '16px',
            color: secondaryTextColor,
            fontStyle: 'italic',
            fontSize: '13px'
          }}>
            Thinking...
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>
      
      {/* Input Container - Unified Container */}
      <div 
        ref={inputContainerRef}
        style={{
          padding: '12px 14px',
          backgroundColor: brighterBg
        }}>
        {/* Attachments Preview */}
        {attachments.length > 0 && (
          <div style={{
            marginBottom: '8px',
            display: 'flex',
            flexWrap: 'wrap',
            gap: '8px'
          }}>
            {attachments.map((att) => (
              <div
                key={att.id}
                style={{
                  position: 'relative',
                  borderRadius: '6px',
                  overflow: 'hidden',
                  border: `1px solid ${borderColor}`,
                  backgroundColor: theme === 'dark' ? '#1d1d1d' : '#f8f8f8',
                  width: '60px',
                  height: '60px',
                  flexShrink: 0
                }}
              >
                {att.type === 'image' ? (
                  <img
                    src={`data:${att.mimeType || 'image/png'};base64,${att.data}`}
                    alt={att.name}
                    style={{
                      width: '100%',
                      height: '100%',
                      objectFit: 'cover',
                      display: 'block'
                    }}
                  />
                ) : (
                  <div style={{
                    padding: '4px',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    height: '100%',
                    width: '100%'
                  }}>
                    <PictureAsPdfIcon style={{ fontSize: '20px', color: theme === 'dark' ? '#d6d6d6' : '#202124', marginBottom: '2px' }} />
                    <span style={{
                      fontSize: '8px',
                      color: textColor,
                      textAlign: 'center',
                      wordBreak: 'break-word',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      display: '-webkit-box',
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: 'vertical'
                    }}>
                      {att.name}
                    </span>
                  </div>
                )}
                <button
                  onClick={() => handleRemoveAttachment(att.id)}
                  style={{
                    position: 'absolute',
                    top: '4px',
                    right: '4px',
                    padding: '2px',
                    border: 'none',
                    borderRadius: '50%',
                    backgroundColor: theme === 'dark' ? 'rgba(0, 0, 0, 0.7)' : 'rgba(255, 255, 255, 0.9)',
                    color: textColor,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: '20px',
                    height: '20px',
                    transition: 'background-color 0.15s'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = theme === 'dark' ? 'rgba(0, 0, 0, 0.9)' : 'rgba(255, 255, 255, 1)'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = theme === 'dark' ? 'rgba(0, 0, 0, 0.7)' : 'rgba(255, 255, 255, 0.9)'
                  }}
                >
                  <CloseIcon style={{ fontSize: '14px' }} />
                </button>
              </div>
            ))}
          </div>
        )}
        
        {/* Unified Container - Text input and buttons together */}
        <div 
          ref={unifiedContainerRef}
          style={{
            padding: '4px 6px',
            backgroundColor: inputBg,
            borderRadius: '8px',
            border: `1px solid ${isInputFocused ? (theme === 'dark' ? '#3e3e42' : '#bdc1c6') : borderColor}`,
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
            transition: 'border-color 0.2s',
            position: 'relative'
          }}>
          {/* Hidden file input */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,.pdf"
            multiple
            onChange={handleFileSelect}
            style={{ display: 'none' }}
          />
          

              {/* Text Input Section - On Top */}
              <textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onFocus={() => setIsInputFocused(true)}
                onBlur={() => setIsInputFocused(false)}
                onPaste={handlePaste}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    handleSend()
                  }
                }}
                placeholder="Type your message..."
                disabled={isLoading}
                rows={1}
                className={`scrollable-container ${theme === 'dark' ? 'dark-theme' : ''}`}
                style={{
                  width: '100%',
                  padding: '4px 6px',
                  border: 'none',
                  backgroundColor: 'transparent',
                  fontSize: '13px',
                  outline: 'none',
                  color: textColor,
                  resize: 'none',
                  overflowY: 'hidden',
                  overflowX: 'hidden',
                  fontFamily: '"Noto Sans SC", "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
                  lineHeight: '1.6',
                  minHeight: '24px',
                  maxHeight: '200px'
                }}
                onInput={(e) => {
                  const target = e.target as HTMLTextAreaElement
                  target.style.height = 'auto'
                  const scrollHeight = target.scrollHeight
                  const newHeight = Math.min(scrollHeight, 200)
                  target.style.height = `${newHeight}px`
                  // Only show scrollbar when content exceeds maxHeight
                  if (scrollHeight > 200) {
                    target.style.overflowY = 'auto'
                  } else {
                    target.style.overflowY = 'hidden'
                  }
                }}
              />
          
          {/* Controls Section - Left side: Model selector, Right side: Web search, File upload, @, API key, Send button */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '6px'
          }}>
            {/* Left side - Model Selector */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              padding: '2px',
              backgroundColor: theme === 'dark' ? '#1f1f1f' : '#e0e0e0',
              borderRadius: '8px',
              fontSize: '11px',
              fontWeight: '500'
            }}>
                <button
                onClick={() => setSelectedModel('gemini-2.5-flash')}
                disabled={isLoading}
                  style={{
                  padding: '4px 8px',
                  backgroundColor: selectedModel === 'gemini-2.5-flash' 
                    ? (theme === 'dark' ? '#2d2d2d' : '#d0d0d0') 
                    : 'transparent',
                  color: selectedModel === 'gemini-2.5-flash'
                    ? (theme === 'dark' ? '#b0b0b0' : '#505050')
                    : secondaryTextColor,
                    border: 'none',
                    borderRadius: '6px',
                  cursor: isLoading ? 'not-allowed' : 'pointer',
                  fontSize: '11px',
                  fontWeight: '500',
                  transition: 'all 0.15s',
                  opacity: isLoading ? 0.5 : 1,
                  whiteSpace: 'nowrap'
                      }}
                title="Gemini 2.5 Flash - Faster responses"
              >
                Flash
              </button>
              <button
                onClick={() => setSelectedModel('gemini-2.5-pro')}
                disabled={isLoading}
                style={{
                  padding: '4px 8px',
                  backgroundColor: selectedModel === 'gemini-2.5-pro' 
                    ? (theme === 'dark' ? '#2d2d2d' : '#d0d0d0') 
                    : 'transparent',
                  color: selectedModel === 'gemini-2.5-pro'
                    ? (theme === 'dark' ? '#b0b0b0' : '#505050')
                    : secondaryTextColor,
                  border: 'none',
                  borderRadius: '6px',
                  cursor: isLoading ? 'not-allowed' : 'pointer',
                  fontSize: '11px',
                  fontWeight: '500',
                  transition: 'all 0.15s',
                  opacity: isLoading ? 0.5 : 1,
                  whiteSpace: 'nowrap'
                }}
                title="Gemini 2.5 Pro - More capable"
              >
                Pro
              </button>
            </div>
            
            {/* Right side - Web Search, File upload, @, API key, Send button */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px'
            }}>
              {/* Web Search Toggle */}
              <button
              onClick={() => setUseWebSearch(!useWebSearch)}
              disabled={isLoading}
                style={{
                  padding: '2px',
                backgroundColor: useWebSearch ? (theme === 'dark' ? '#3a3a3a' : '#e0e0e0') : 'transparent',
                color: useWebSearch ? (theme === 'dark' ? '#d6d6d6' : '#424242') : secondaryTextColor,
                  border: 'none',
                borderRadius: '6px',
                cursor: isLoading ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                justifyContent: 'center',
                transition: 'all 0.15s',
                opacity: isLoading ? 0.5 : 1,
                width: '24px',
                height: '24px'
              }}
              onMouseEnter={(e) => {
                if (!isLoading) {
                  e.currentTarget.style.backgroundColor = useWebSearch 
                    ? (theme === 'dark' ? '#454545' : '#d0d0d0')
                    : (theme === 'dark' ? '#1d1d1d' : '#f5f5f5')
                }
                }}
              onMouseLeave={(e) => {
                if (!isLoading) {
                  e.currentTarget.style.backgroundColor = useWebSearch 
                    ? (theme === 'dark' ? '#3a3a3a' : '#e0e0e0')
                    : 'transparent'
                }
              }}
              title={useWebSearch ? "Web search enabled - AI can search the internet" : "Enable web search"}
            >
              <span 
                className="material-symbols-outlined"
                style={{
                  fontVariationSettings: "'FILL' 0, 'wght' 300, 'GRAD' 0, 'opsz' 24",
                  fontSize: '17px'
                }}
              >
                language
              </span>
              </button>
              
              {/* File Upload Button */}
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={isLoading}
                title="Upload image or PDF"
                style={{
                  padding: '2px',
                  backgroundColor: 'transparent',
                  color: secondaryTextColor,
                  border: 'none',
                  borderRadius: '6px',
                  cursor: isLoading ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'all 0.15s',
                  opacity: isLoading ? 0.5 : 1,
                  width: '24px',
                  height: '24px'
                }}
                onMouseEnter={(e) => {
                  if (!isLoading) {
                    e.currentTarget.style.backgroundColor = theme === 'dark' ? '#1d1d1d' : '#f5f5f5'
                    e.currentTarget.style.color = theme === 'dark' ? '#d6d6d6' : '#424242'
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isLoading) {
                    e.currentTarget.style.backgroundColor = 'transparent'
                    e.currentTarget.style.color = secondaryTextColor
                  }
                }}
              >
                <CropOriginalIcon style={{ fontSize: '17px' }} />
              </button>
              
              {/* @ Icon Button */}
              <button
                disabled={isLoading}
                title="@"
                style={{
                  padding: '2px',
                  backgroundColor: 'transparent',
                  color: secondaryTextColor,
                  border: 'none',
                  borderRadius: '6px',
                  cursor: isLoading ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'all 0.15s',
                  opacity: isLoading ? 0.5 : 1,
                  width: '24px',
                  height: '24px'
                }}
                onMouseEnter={(e) => {
                  if (!isLoading) {
                    e.currentTarget.style.backgroundColor = theme === 'dark' ? '#1d1d1d' : '#f5f5f5'
                    e.currentTarget.style.color = theme === 'dark' ? '#d6d6d6' : '#424242'
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isLoading) {
                    e.currentTarget.style.backgroundColor = 'transparent'
                    e.currentTarget.style.color = secondaryTextColor
                  }
                }}
              >
                <AlternateEmailIcon style={{ fontSize: '17px' }} />
              </button>
              
              {/* API Keys Button */}
              <button
                ref={settingsButtonRef}
                onClick={() => setShowSettingsModal(!showSettingsModal)}
                disabled={isLoading}
                title="API Keys"
                style={{
                  padding: '2px',
                  backgroundColor: showSettingsModal ? (theme === 'dark' ? '#3a3a3a' : '#e0e0e0') : 'transparent',
                  color: showSettingsModal ? (theme === 'dark' ? '#d6d6d6' : '#424242') : secondaryTextColor,
                  border: 'none',
                  borderRadius: '6px',
                  cursor: isLoading ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'all 0.15s',
                  opacity: isLoading ? 0.5 : 1,
                  width: '24px',
                  height: '24px'
                }}
                onMouseEnter={(e) => {
                  if (!isLoading) {
                    e.currentTarget.style.backgroundColor = showSettingsModal 
                      ? (theme === 'dark' ? '#454545' : '#d0d0d0')
                      : (theme === 'dark' ? '#1d1d1d' : '#f5f5f5')
                    e.currentTarget.style.color = theme === 'dark' ? '#d6d6d6' : '#424242'
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isLoading) {
                    e.currentTarget.style.backgroundColor = showSettingsModal 
                      ? (theme === 'dark' ? '#3a3a3a' : '#e0e0e0')
                      : 'transparent'
                    e.currentTarget.style.color = showSettingsModal ? (theme === 'dark' ? '#d6d6d6' : '#424242') : secondaryTextColor
                  }
                }}
              >
                <VpnKeyIcon style={{ fontSize: '17px' }} />
              </button>
              
              {/* Send button */}
              <button
                onClick={handleSend}
                disabled={isLoading || (!input.trim() && attachments.length === 0)}
                style={{
                  padding: '2px',
                  backgroundColor: isLoading || (!input.trim() && attachments.length === 0) ? 'transparent' : (theme === 'dark' ? '#3a3a3a' : '#e0e0e0'),
                  color: isLoading || (!input.trim() && attachments.length === 0) ? secondaryTextColor : (theme === 'dark' ? '#d6d6d6' : '#424242'),
                  border: 'none',
                  borderRadius: '6px',
                  cursor: isLoading || (!input.trim() && attachments.length === 0) ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'all 0.15s',
                  opacity: isLoading ? 0.5 : 1,
                  width: '24px',
                  height: '24px'
                }}
                onMouseEnter={(e) => {
                  if (!isLoading && (input.trim() || attachments.length > 0)) {
                    e.currentTarget.style.backgroundColor = theme === 'dark' ? '#454545' : '#d0d0d0'
                  } else if (!isLoading) {
                    e.currentTarget.style.backgroundColor = theme === 'dark' ? '#1d1d1d' : '#f5f5f5'
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isLoading && (input.trim() || attachments.length > 0)) {
                    e.currentTarget.style.backgroundColor = theme === 'dark' ? '#3a3a3a' : '#e0e0e0'
                  } else if (!isLoading) {
                    e.currentTarget.style.backgroundColor = 'transparent'
                  }
                }}
                title="Send"
              >
                <ArrowUpwardIcon style={{ fontSize: '19px', transform: 'translateY(1px)' }} />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Settings Modal */}
      {showSettingsModal && (
        <div
          ref={modalRef}
          style={{
            position: 'fixed',
            top: `${modalPosition.top}px`,
            left: `${modalPosition.left}px`,
            backgroundColor: theme === 'dark' ? '#1e1e1e' : '#ffffff',
            borderRadius: '8px',
            padding: '20px',
            minWidth: '400px',
            maxWidth: '500px',
            boxShadow: theme === 'dark'
              ? '0 8px 32px rgba(0, 0, 0, 0.5), 0 2px 8px rgba(0, 0, 0, 0.3)'
              : '0 8px 32px rgba(0, 0, 0, 0.2), 0 2px 8px rgba(0, 0, 0, 0.1)',
            zIndex: 10000,
            border: `1px solid ${theme === 'dark' ? '#333' : '#e0e0e0'}`,
            fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
            transform: 'translateY(-100%)',
            marginTop: '-8px',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Close button */}
          <button
            onClick={() => setShowSettingsModal(false)}
            style={{
              position: 'absolute',
              top: '8px',
              right: '8px',
              padding: '4px',
              backgroundColor: 'transparent',
              border: 'none',
              color: theme === 'dark' ? '#999' : '#666',
              cursor: 'pointer',
              fontSize: '16px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: '4px',
              width: '24px',
              height: '24px',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = theme === 'dark' ? '#2a2a2a' : '#f1f3f4'
              e.currentTarget.style.color = theme === 'dark' ? '#fff' : '#202124'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent'
              e.currentTarget.style.color = theme === 'dark' ? '#999' : '#666'
            }}
            title="Close"
          >
            ✕
          </button>

          {/* API Keys heading */}
          <h2
            style={{
              fontSize: '18px',
              fontWeight: '500',
              color: theme === 'dark' ? '#ffffff' : '#202124',
              margin: '0 0 20px 0',
            }}
          >
            API Keys
          </h2>

          {/* Google API Key section */}
          <div style={{ marginBottom: '20px' }}>
            <label
              style={{
                display: 'block',
                fontSize: '14px',
                fontWeight: '500',
                color: theme === 'dark' ? '#e0e0e0' : '#202124',
                marginBottom: '8px',
              }}
            >
              Google API Key
            </label>
            <p
              style={{
                fontSize: '12px',
                color: theme === 'dark' ? '#999' : '#666',
                margin: '0 0 12px 0',
                lineHeight: '1.5',
              }}
            >
              Put your{' '}
              <a
                href="https://aistudio.google.com/app/api-keys"
                onClick={(e) => {
                  e.preventDefault()
                  const url = 'https://aistudio.google.com/app/api-keys'
                  // Check if running in Electron
                  const isElectron = typeof window !== 'undefined' && window.electron !== undefined
                  if (isElectron && window.electron) {
                    // Open in external browser via IPC
                    window.electron.invoke('openExternal', url).catch((error) => {
                      console.error('Failed to open external URL:', error)
                      // Fallback to window.open if IPC fails
                      window.open(url, '_blank')
                    })
                  } else {
                    // Fallback for web
                    window.open(url, '_blank')
                  }
                }}
                style={{
                  color: theme === 'dark' ? '#4a9eff' : '#1a73e8',
                  textDecoration: 'none',
                  cursor: 'pointer',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.textDecoration = 'underline'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.textDecoration = 'none'
                }}
              >
                Google AI Studio
              </a>
              {' '}key here.
            </p>
            <input
              ref={apiKeyInputRef}
              type="password"
              value={googleApiKey}
              onChange={(e) => handleApiKeyChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  // Save the API key (already handled by handleApiKeyChange, but ensure it's saved)
                  handleApiKeyChange(googleApiKey)
                  // Defocus the input
                  apiKeyInputRef.current?.blur()
                }
              }}
              placeholder="Enter your Google API key"
              style={{
                width: '100%',
                padding: '8px 12px',
                border: `1px solid ${theme === 'dark' ? '#333' : '#dadce0'}`,
                borderRadius: '4px',
                backgroundColor: theme === 'dark' ? '#252525' : '#ffffff',
                color: theme === 'dark' ? '#e0e0e0' : '#202124',
                fontSize: '13px',
                outline: 'none',
                fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
                transition: 'border-color 0.2s',
              }}
              onFocus={(e) => {
                e.target.style.borderColor = theme === 'dark' ? '#555' : '#1a73e8'
              }}
              onBlur={(e) => {
                e.target.style.borderColor = theme === 'dark' ? '#333' : '#dadce0'
              }}
            />
          </div>
        </div>
      )}
    </div>
  )
}
