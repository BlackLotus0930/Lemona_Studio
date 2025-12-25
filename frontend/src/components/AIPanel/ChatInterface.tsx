import { useState, useRef, useEffect } from 'react'
import { AIChatMessage } from '@shared/types'
import { aiApi, chatApi } from '../../services/api'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useTheme } from '../../contexts/ThemeContext'
// @ts-ignore
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward'
// @ts-ignore
import VpnKeyIcon from '@mui/icons-material/VpnKey'

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
  const previousMessageCountRef = useRef<number>(0)
  const hasRestoredScrollRef = useRef<boolean>(false)
  const lastStreamingContentLengthRef = useRef<number>(0)
  const streamingScrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [inputContainerWidth, setInputContainerWidth] = useState<number | null>(null)
  
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
          setModalPosition({
            top: rect.top - 8, // 8px above the button
            left: rect.left,
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
      if (inputContainerRef.current) {
        // Get the inner container (the one with padding: '8px 12px')
        const innerContainer = inputContainerRef.current.querySelector('div[style*="padding"]') as HTMLElement
        if (innerContainer) {
          // Get the width of the inner container
          const width = innerContainer.offsetWidth
          setInputContainerWidth(width)
        }
      }
    }
    
    // Use a small delay to ensure DOM is ready
    const timeoutId = setTimeout(updateWidth, 0)
    window.addEventListener('resize', updateWidth)
    
    // Use ResizeObserver to watch for panel width changes
    const resizeObserver = new ResizeObserver(() => {
      updateWidth()
    })
    
    if (inputContainerRef.current) {
      resizeObserver.observe(inputContainerRef.current)
    }
    
    return () => {
      clearTimeout(timeoutId)
      window.removeEventListener('resize', updateWidth)
      resizeObserver.disconnect()
    }
  }, [])

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

  const handleSend = async () => {
    if (!input.trim() || isLoading || !documentId || !chatId) return

    const userMessage: AIChatMessage = {
      id: `msg_${Date.now()}`,
      role: 'user',
      content: input,
      timestamp: new Date().toISOString(),
    }

    setMessages(prev => [...prev, userMessage])
    setInput('')
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
      const response = await aiApi.streamChat(input, documentContent, documentId, chatHistoryForAPI, useWebSearch, selectedModel)
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
              </div>
            )}
            {message.role === 'assistant' && (
              <div
                style={{
                  width: '100%',
                  color: textColor,
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
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={{
                    // Headers
                    h1: ({node, ...props}) => <h1 style={{ fontSize: '24px', fontWeight: 600, marginTop: '24px', marginBottom: '12px', color: textColor, lineHeight: '1.3' }} {...props} />,
                    h2: ({node, ...props}) => <h2 style={{ fontSize: '20px', fontWeight: 600, marginTop: '20px', marginBottom: '10px', color: textColor, lineHeight: '1.3' }} {...props} />,
                    h3: ({node, ...props}) => <h3 style={{ fontSize: '18px', fontWeight: 600, marginTop: '16px', marginBottom: '8px', color: textColor, lineHeight: '1.3' }} {...props} />,
                    h4: ({node, ...props}) => <h4 style={{ fontSize: '16px', fontWeight: 600, marginTop: '14px', marginBottom: '8px', color: textColor, lineHeight: '1.3' }} {...props} />,
                    h5: ({node, ...props}) => <h5 style={{ fontSize: '15px', fontWeight: 600, marginTop: '12px', marginBottom: '6px', color: textColor, lineHeight: '1.3' }} {...props} />,
                    h6: ({node, ...props}) => <h6 style={{ fontSize: '14px', fontWeight: 600, marginTop: '10px', marginBottom: '6px', color: textColor, lineHeight: '1.3' }} {...props} />,
                    // Paragraphs
                    p: ({node, ...props}) => <p style={{ marginBottom: '12px', marginTop: 0, lineHeight: '1.6', color: textColor }} {...props} />,
                    // Code blocks
                    code: ({node, inline, className, children, ...props}: any) => {
                      if (inline) {
                        return <code style={{ 
                          backgroundColor: theme === 'dark' ? '#2d2d2d' : '#f1f3f4', 
                          padding: '2px 6px', 
                          borderRadius: '4px', 
                          fontSize: '13px',
                          fontFamily: 'Monaco, "Courier New", monospace',
                          color: theme === 'dark' ? '#ce9178' : '#c5221f'
                        }} {...props}>{children}</code>
                      }
                      return (
                        <code 
                          className={className}
                          style={{
                            display: 'block',
                            fontFamily: 'Monaco, "Courier New", monospace',
                            fontSize: '13px',
                            lineHeight: '1.5',
                            color: textColor
                          }}
                          {...props}
                        >
                          {children}
                        </code>
                      )
                    },
                    pre: ({node, children, ...props}: any) => {
                      return (
                        <pre style={{
                          backgroundColor: theme === 'dark' ? '#181818' : '#f8f9fa',
                          border: `1px solid ${borderColor}`,
                          borderRadius: '8px',
                          padding: '16px',
                          overflowX: 'auto',
                          marginBottom: '16px',
                          marginTop: '8px',
                          fontSize: '13px',
                          lineHeight: '1.5',
                          fontFamily: 'Monaco, "Courier New", monospace'
                        }} {...props}>
                          {children}
                        </pre>
                      )
                    },
                    // Lists
                    ul: ({node, ...props}) => <ul style={{ marginBottom: '12px', paddingLeft: '24px', marginTop: '8px', listStyleType: 'disc', color: textColor }} {...props} />,
                    ol: ({node, ...props}) => <ol style={{ marginBottom: '12px', paddingLeft: '24px', marginTop: '8px', color: textColor }} {...props} />,
                    li: ({node, ...props}) => <li style={{ marginBottom: '6px', lineHeight: '1.6', color: textColor }} {...props} />,
                    // Links
                    a: ({node, ...props}: any) => <a style={{ color: '#1a73e8', textDecoration: 'none' }} target="_blank" rel="noopener noreferrer" {...props} />,
                    // Blockquotes
                    blockquote: ({node, ...props}) => <blockquote style={{
                      borderLeft: `4px solid ${borderColor}`,
                      paddingLeft: '16px',
                      marginLeft: 0,
                      marginRight: 0,
                      marginTop: '12px',
                      marginBottom: '12px',
                      color: secondaryTextColor,
                      fontStyle: 'italic'
                    }} {...props} />,
                    // Horizontal rule
                    hr: ({node, ...props}) => <hr style={{ border: 'none', borderTop: `1px solid ${borderColor}`, margin: '20px 0' }} {...props} />,
                    // Tables
                    table: ({node, ...props}) => <div style={{ overflowX: 'auto', marginBottom: '16px', marginTop: '8px' }}><table style={{ 
                      borderCollapse: 'collapse', 
                      width: '100%'
                    }} {...props} /></div>,
                    thead: ({node, ...props}) => <thead style={{ backgroundColor: theme === 'dark' ? '#181818' : '#f8f9fa' }} {...props} />,
                    tbody: ({node, ...props}) => <tbody {...props} />,
                    th: ({node, ...props}) => <th style={{ 
                      border: `1px solid ${borderColor}`, 
                      padding: '10px 12px', 
                      textAlign: 'left',
                      fontWeight: 600,
                      fontSize: '13px',
                      color: textColor
                    }} {...props} />,
                    td: ({node, ...props}) => <td style={{ 
                      border: `1px solid ${borderColor}`, 
                      padding: '10px 12px',
                      fontSize: '13px',
                      color: textColor
                    }} {...props} />,
                    // Strong and emphasis
                    strong: ({node, ...props}) => <strong style={{ fontWeight: 600 }} {...props} />,
                    em: ({node, ...props}) => <em style={{ fontStyle: 'italic' }} {...props} />,
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
        {/* Unified Container - Text input and buttons together */}
        <div style={{
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
          {/* Settings button - bottom left */}
          <button
            ref={settingsButtonRef}
            onClick={() => setShowSettingsModal(!showSettingsModal)}
            title="API Keys"
            style={{
              position: 'absolute',
              bottom: '8px',
              left: '10px',
              padding: '4px',
              border: 'none',
              background: 'transparent',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: showSettingsModal ? '#858585' : (theme === 'dark' ? 'rgba(255, 255, 255, 0)' : 'rgba(0, 0, 0, 0)'),
              transition: 'color 0.2s',
              zIndex: 10,
            }}
            onMouseEnter={(e) => {
              if (!showSettingsModal) {
                e.currentTarget.style.color = '#858585'
              }
            }}
            onMouseLeave={(e) => {
              if (!showSettingsModal) {
                e.currentTarget.style.color = theme === 'dark' ? 'rgba(255, 255, 255, 0)' : 'rgba(0, 0, 0, 0)'
              }
            }}
          >
            <VpnKeyIcon style={{ fontSize: '16px'}} />
          </button>

              {/* Text Input Section - On Top */}
              <textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onFocus={() => setIsInputFocused(true)}
                onBlur={() => setIsInputFocused(false)}
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
          
          {/* Controls Section - Model selector, web search toggle, and send button */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            gap: '6px'
          }}>
            {/* Model Selector */}
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
            
            {/* Web Search Toggle */}
              <button
              onClick={() => setUseWebSearch(!useWebSearch)}
              disabled={isLoading}
                style={{
                  padding: '4px',
                backgroundColor: useWebSearch ? (theme === 'dark' ? '#3a3a3a' : '#e0e0e0') : 'transparent',
                color: useWebSearch ? (theme === 'dark' ? '#d6d6d6' : '#424242') : secondaryTextColor,
                  border: 'none',
                borderRadius: '8px',
                cursor: isLoading ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                justifyContent: 'center',
                transition: 'all 0.15s',
                opacity: isLoading ? 0.5 : 1,
                width: '28px',
                height: '28px'
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
                  fontSize: '18px'
                }}
              >
                language
              </span>
              </button>
              
              {/* Send button */}
              <button
                onClick={handleSend}
                disabled={isLoading || !input.trim()}
                style={{
                  padding: '4px',
                  backgroundColor: isLoading || !input.trim() ? 'transparent' : (theme === 'dark' ? '#3a3a3a' : '#e0e0e0'),
                  color: isLoading || !input.trim() ? secondaryTextColor : (theme === 'dark' ? '#d6d6d6' : '#424242'),
                  border: 'none',
                  borderRadius: '8px',
                  cursor: isLoading || !input.trim() ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'all 0.15s',
                  opacity: isLoading ? 0.5 : 1,
                  width: '28px',
                  height: '28px'
                }}
                onMouseEnter={(e) => {
                  if (!isLoading && input.trim()) {
                    e.currentTarget.style.backgroundColor = theme === 'dark' ? '#454545' : '#d0d0d0'
                  } else if (!isLoading) {
                    e.currentTarget.style.backgroundColor = theme === 'dark' ? '#1d1d1d' : '#f5f5f5'
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isLoading && input.trim()) {
                    e.currentTarget.style.backgroundColor = theme === 'dark' ? '#3a3a3a' : '#e0e0e0'
                  } else if (!isLoading) {
                    e.currentTarget.style.backgroundColor = 'transparent'
                  }
                }}
                title="Send"
              >
                <ArrowUpwardIcon style={{ fontSize: '20px' }} />
              </button>
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
