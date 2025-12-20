import { useState, useEffect, useRef } from 'react'
import { Document } from '@shared/types'
import ChatInterface from './ChatInterface'
import { chatApi } from '../../services/api'
import { useTheme } from '../../contexts/ThemeContext'
// @ts-ignore
import AddIcon from '@mui/icons-material/Add'
// @ts-ignore
import HistoryIcon from '@mui/icons-material/History'
// @ts-ignore
import MoreVertIcon from '@mui/icons-material/MoreVert'
// @ts-ignore
import CloseIcon from '@mui/icons-material/Close'

interface AIPanelProps {
  document: Document | null
  onClose?: () => void
}

interface Chat {
  id: string
  name: string
  messages: any[]
}

export default function AIPanel({ document, onClose }: AIPanelProps) {
  const { theme } = useTheme()
  const [chats, setChats] = useState<Chat[]>([
    { id: 'chat_default', name: 'Chat 1', messages: [] }
  ])
  const [activeChatId, setActiveChatId] = useState<string>('chat_default')
  const [isStreaming, setIsStreaming] = useState(false)
  const [showMenu, setShowMenu] = useState(false)
  const [hoveredChatId, setHoveredChatId] = useState<string | null>(null)
  const [chatInputText, setChatInputText] = useState<string>('')
  const headerScrollRef = useRef<HTMLDivElement>(null)
  const scrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  
  // Listen for "Add to Chat" events from editor
  useEffect(() => {
    const handleAddToChat = (event: CustomEvent<string>) => {
      setChatInputText(event.detail)
    }
    
    window.addEventListener('addToChat' as any, handleAddToChat as EventListener)
    return () => window.removeEventListener('addToChat' as any, handleAddToChat as EventListener)
  }, [])
  
  const bgColor = theme === 'dark' ? '#141414' : '#ffffff'
  const brighterBg = theme === 'dark' ? '#141414' : '#ffffff'
  const borderColor = theme === 'dark' ? '#232323' : '#dadce0'
  const textColor = theme === 'dark' ? '#D6D6DD' : '#202124'
  const activeChatBg = theme === 'dark' ? '#212121' : '#f0f0f0'
  const hoverBg = theme === 'dark' ? '#181818' : '#f1f3f4'
  const iconColor = theme === 'dark' ? '#858585' : '#5f6368'

  const documentContent = document?.content || undefined

  // Load chat history when document changes
  useEffect(() => {
    if (!document?.id) {
      // Reset to default if no document
      setChats([{ id: 'chat_default', name: 'Chat 1', messages: [] }])
      setActiveChatId('chat_default')
      return
    }

    const loadChatHistory = async () => {
      try {
        // IPC returns data directly, not wrapped in { data: ... }
        const chatHistory = await chatApi.getChatHistory(document.id) || {}
        
        // Convert chat history to Chat format
        const chatEntries = Object.entries(chatHistory)
        
        if (chatEntries.length === 0) {
          // No chat history, start with consistent default chat ID
          // This ensures all documents in the same project share the same default chat
          setChats([{ id: 'chat_default', name: 'Chat 1', messages: [] }])
          setActiveChatId('chat_default')
        } else {
          // Load existing chats
          const loadedChats: Chat[] = chatEntries.map(([chatId, messages], index) => {
            const messageArray = Array.isArray(messages) ? messages : []
            // Find first user message to generate name
            const firstUserMessage = messageArray.find((msg: any) => msg.role === 'user')
            const chatName = firstUserMessage?.content 
              ? generateChatName(firstUserMessage.content)
              : `Chat ${index + 1}`
            
            return {
              id: chatId,
              name: chatName,
              messages: messageArray
            }
          })
          setChats(loadedChats)
          setActiveChatId(loadedChats[0].id)
        }
      } catch (error) {
        console.error('Failed to load chat history:', error)
        // Fallback to default chat on error
        setChats([{ id: 'chat_default', name: 'Chat 1', messages: [] }])
        setActiveChatId('chat_default')
      }
    }

    loadChatHistory()
  }, [document?.id])

  // Add scroll detection and edge detection to show scrollbar
  useEffect(() => {
    const container = headerScrollRef.current
    if (!container) return

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
      }
    }

    const handleMouseMove = (e: MouseEvent) => {
      if (!container) return
      const rect = container.getBoundingClientRect()
      const mouseX = e.clientX - rect.left
      const mouseY = e.clientY - rect.top
      const width = rect.width
      const height = rect.height
      
      // For horizontal scrollbar, check if near bottom edge
      const nearBottomEdge = mouseY > height - EDGE_DISTANCE
      const nearRightEdge = mouseX > width - EDGE_DISTANCE
      
      if (nearBottomEdge || nearRightEdge) {
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
  }, [])

  // Generate chat name from first user message
  const generateChatName = (firstMessage: string): string => {
    if (!firstMessage || !firstMessage.trim()) return 'New Chat'
    
    // Take first 30 characters, remove newlines, and trim
    const cleaned = firstMessage.trim().replace(/\n/g, ' ').substring(0, 30)
    return cleaned.length < firstMessage.trim().length ? `${cleaned}...` : cleaned
  }

  // Update chat name when first message is sent
  const handleChatNameUpdate = (chatId: string, firstMessage: string) => {
    setChats(prevChats => {
      const chat = prevChats.find(c => c.id === chatId)
      if (chat && chat.name.startsWith('Chat ') && firstMessage) {
        const newName = generateChatName(firstMessage)
        return prevChats.map(c => c.id === chatId ? { ...c, name: newName } : c)
      }
      return prevChats
    })
  }

  const handleNewChat = () => {
    if (!document?.id) return
    
    const newChatId = `chat_${Date.now()}`
    const newChat: Chat = {
      id: newChatId,
      name: `Chat ${chats.length + 1}`,
      messages: []
    }
    setChats([...chats, newChat])
    setActiveChatId(newChatId)
  }

  const handleCloseChat = (chatId: string, e?: React.MouseEvent) => {
    if (e) {
      e.stopPropagation()
    }
    
    if (chats.length === 1) {
      // If it's the last chat, create a new one
      handleNewChat()
      // Delete the old chat from backend
      if (document?.id) {
        chatApi.deleteChat(document.id, chatId).catch(console.error)
      }
    } else {
      // Remove the chat
      const newChats = chats.filter(c => c.id !== chatId)
      setChats(newChats)
      
      // If the closed chat was active, switch to another one
      if (activeChatId === chatId) {
        const closedIndex = chats.findIndex(c => c.id === chatId)
        const newActiveIndex = closedIndex > 0 ? closedIndex - 1 : 0
        setActiveChatId(newChats[newActiveIndex]?.id || newChats[0]?.id)
      }
      
      // Delete from backend
      if (document?.id) {
        chatApi.deleteChat(document.id, chatId).catch(console.error)
      }
    }
  }

  const handleCloseOtherChats = () => {
    if (!document?.id) return
    
    const activeChat = chats.find(c => c.id === activeChatId)
    if (!activeChat) return
    
    setChats([activeChat])
    
    // Delete other chats from backend
    chats.forEach(chat => {
      if (chat.id !== activeChatId && document?.id) {
        chatApi.deleteChat(document.id, chat.id).catch(console.error)
      }
    })
    
    setShowMenu(false)
  }

  const handleClearAllChats = () => {
    if (!document?.id) return
    
    // Delete all chats from backend
    chats.forEach(chat => {
      if (document?.id) {
        chatApi.deleteChat(document.id, chat.id).catch(console.error)
      }
    })
    
    // Create a new default chat with consistent ID
    const newChat: Chat = {
      id: 'chat_default',
      name: 'Chat 1',
      messages: []
    }
    setChats([newChat])
    setActiveChatId('chat_default')
    setShowMenu(false)
  }

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowMenu(false)
      }
    }
    if (showMenu) {
      window.document.addEventListener('mousedown', handleClickOutside)
      return () => window.document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [showMenu])

  return (
    <div 
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      style={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: bgColor,
        borderRight: `1px solid ${borderColor}`
      }}>
      {/* Header - Chat Containers */}
      <div 
        ref={headerScrollRef}
        style={{
          padding: '8px 12px',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          backgroundColor: brighterBg,
          overflow: 'hidden'
        }}>
        {/* Chat Containers - Scrollable area that compresses */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '4px',
          flex: '1',
          minWidth: 0,
          overflow: 'hidden'
        }}>
          {chats.map((chat) => (
            <div
              key={chat.id}
              onClick={() => setActiveChatId(chat.id)}
              onMouseEnter={() => setHoveredChatId(chat.id)}
              onMouseLeave={() => setHoveredChatId(null)}
              style={{
                padding: '6px 12px',
                paddingRight: '12px',
                borderRadius: activeChatId === chat.id ? '6px' : '12px',
                backgroundColor: activeChatId === chat.id ? activeChatBg : 'transparent',
                border: 'none',
                display: 'flex',
                alignItems: 'center',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                minWidth: '60px',
                maxWidth: '200px',
                flexShrink: 1,
                flexGrow: 0,
                position: 'relative'
              }}
            >
              <span style={{
                fontSize: '13px',
                fontWeight: 500,
                color: textColor,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                width: '100%',
                display: 'block'
              }}>
                {chat.name}
              </span>
              {hoveredChatId === chat.id && (
                <button
                  onClick={(e) => handleCloseChat(chat.id, e)}
                  style={{
                    position: 'absolute',
                    right: '6px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    padding: '2px',
                    border: 'none',
                    borderRadius: '2px',
                    backgroundColor: theme === 'dark' ? 'rgba(33, 33, 33, 0.95)' : 'rgba(255, 255, 255, 0.95)',
                    color: iconColor,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: '18px',
                    height: '18px',
                    transition: 'background-color 0.15s',
                    backdropFilter: 'blur(4px)'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = theme === 'dark' ? '#232323' : '#e8eaed'
                    e.currentTarget.style.color = theme === 'dark' ? '#D6D6DD' : '#202124'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = theme === 'dark' ? 'rgba(33, 33, 33, 0.95)' : 'rgba(255, 255, 255, 0.95)'
                    e.currentTarget.style.color = iconColor
                  }}
                  title="Close chat"
                >
                  <CloseIcon style={{ fontSize: '14px' }} />
                </button>
              )}
            </div>
          ))}
        </div>
        
        {/* Action Buttons - Always visible on the right */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '2px', flexShrink: 0 }}>
          <button
            onClick={handleNewChat}
            style={{
              padding: '4px 8px',
              border: 'none',
              borderRadius: '4px',
              backgroundColor: 'transparent',
              color: iconColor,
              cursor: 'pointer',
              fontSize: '20px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'background-color 0.15s'
            }}
            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = hoverBg}
            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
            title="New chat"
          >
            <AddIcon style={{ fontSize: '18px' }} />
          </button>
          
          <button
            onClick={() => {
              // Show history
            }}
            style={{
              padding: '4px 8px',
              border: 'none',
              borderRadius: '4px',
              backgroundColor: 'transparent',
              color: iconColor,
              cursor: 'pointer',
              fontSize: '20px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'background-color 0.15s'
            }}
            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = hoverBg}
            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
            title="History"
          >
            <HistoryIcon style={{ fontSize: '18px' }} />
          </button>
          
          <button
            onClick={onClose}
            style={{
              padding: '4px 8px',
              border: 'none',
              borderRadius: '4px',
              backgroundColor: 'transparent',
              color: iconColor,
              cursor: 'pointer',
              fontSize: '20px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'background-color 0.15s'
            }}
            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = hoverBg}
            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
            title="Close AI Panel"
          >
            <CloseIcon style={{ fontSize: '18px' }} />
          </button>
          
          <div ref={menuRef} style={{ position: 'relative', display: 'none' }}>
            <button
              onClick={() => setShowMenu(!showMenu)}
              style={{
                padding: '4px 8px',
                border: 'none',
                borderRadius: '4px',
                backgroundColor: showMenu ? hoverBg : 'transparent',
                color: iconColor,
                cursor: 'pointer',
                fontSize: '20px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'background-color 0.15s'
              }}
              onMouseEnter={(e) => !showMenu && (e.currentTarget.style.backgroundColor = hoverBg)}
              onMouseLeave={(e) => !showMenu && (e.currentTarget.style.backgroundColor = 'transparent')}
              title="More options"
            >
              <MoreVertIcon style={{ fontSize: '18px' }} />
            </button>
            {showMenu && (() => {
              const rect = menuRef.current?.getBoundingClientRect()
              return (
                <div style={{
                  position: 'fixed',
                  top: rect ? `${rect.bottom + 4}px` : '100%',
                  right: rect ? `${window.innerWidth - rect.right}px` : 0,
                  backgroundColor: theme === 'dark' ? '#141414' : '#ffffff',
                  border: `1px solid ${theme === 'dark' ? '#232323' : '#dadce0'}`,
                  borderRadius: '4px',
                  boxShadow: theme === 'dark' ? '0 2px 8px rgba(0,0,0,0.5)' : '0 2px 8px rgba(0,0,0,0.15)',
                  zIndex: 10020,
                  minWidth: '160px',
                  overflow: 'hidden'
                }}>
                <button
                  onClick={() => {
                    if (activeChatId) {
                      handleCloseChat(activeChatId)
                    }
                    setShowMenu(false)
                  }}
                  style={{
                    width: '100%',
                    padding: '8px 16px',
                    border: 'none',
                    background: 'transparent',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    fontSize: '13px',
                    color: textColor,
                    textAlign: 'left'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = theme === 'dark' ? '#181818' : '#f1f3f4'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = 'transparent'
                  }}
                >
                  Close Chat
                </button>
                <button
                  onClick={handleCloseOtherChats}
                  style={{
                    width: '100%',
                    padding: '8px 16px',
                    border: 'none',
                    background: 'transparent',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    fontSize: '13px',
                    color: textColor,
                    textAlign: 'left'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = theme === 'dark' ? '#181818' : '#f1f3f4'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = 'transparent'
                  }}
                >
                  Close Other Chats
                </button>
                <button
                  onClick={handleClearAllChats}
                  style={{
                    width: '100%',
                    padding: '8px 16px',
                    border: 'none',
                    background: 'transparent',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    fontSize: '13px',
                    color: textColor,
                    textAlign: 'left'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = theme === 'dark' ? '#181818' : '#f1f3f4'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = 'transparent'
                  }}
                >
                  Clear All Chats
                </button>
              </div>
              )
            })()}
          </div>
        </div>
      </div>
      
      {/* Chat Interface */}
      <div style={{ flex: 1, overflow: 'hidden' }}>
        <ChatInterface 
          documentId={document?.id}
          chatId={activeChatId}
          documentContent={documentContent}
          isStreaming={isStreaming}
          setIsStreaming={setIsStreaming}
          onFirstMessage={(message) => handleChatNameUpdate(activeChatId, message)}
          initialInput={chatInputText}
          onInputSet={() => setChatInputText('')}
        />
      </div>
    </div>
  )
}
