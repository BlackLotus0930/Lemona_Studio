import { useState, useEffect, useRef } from 'react'
import { Document } from '@shared/types'
import ChatInterface from './ChatInterface'
import ChatHistoryDropdown from './ChatHistoryDropdown'
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

// Helper functions to persist active chat ID per project/document
function getActiveChatIdKey(document: Document | null): string | null {
  if (!document) return null
  // Use projectId if available, otherwise fall back to documentId
  return document.projectId ? `activeChatId_${document.projectId}` : `activeChatId_doc_${document.id}`
}

function loadActiveChatId(document: Document | null): string | null {
  const key = getActiveChatIdKey(document)
  if (!key) return null
  try {
    return localStorage.getItem(key)
  } catch (error) {
    console.error('Failed to load active chat ID:', error)
    return null
  }
}

function saveActiveChatId(document: Document | null, chatId: string): void {
  const key = getActiveChatIdKey(document)
  if (!key) return
  try {
    localStorage.setItem(key, chatId)
  } catch (error) {
    console.error('Failed to save active chat ID:', error)
  }
}

// Helper functions to persist open chat tabs per project/document
function getOpenChatTabsKey(document: Document | null): string | null {
  if (!document) return null
  // Use projectId if available, otherwise fall back to documentId
  return document.projectId ? `openChatTabs_${document.projectId}` : `openChatTabs_doc_${document.id}`
}

function loadOpenChatTabs(document: Document | null): string[] {
  const key = getOpenChatTabsKey(document)
  if (!key) return []
  try {
    const saved = localStorage.getItem(key)
    if (saved) {
      const parsed = JSON.parse(saved)
      return Array.isArray(parsed) ? parsed : []
    }
  } catch (error) {
    console.error('Failed to load open chat tabs:', error)
  }
  return []
}

function saveOpenChatTabs(document: Document | null, chatIds: string[]): void {
  const key = getOpenChatTabsKey(document)
  if (!key) return
  try {
    localStorage.setItem(key, JSON.stringify(chatIds))
  } catch (error) {
    console.error('Failed to save open chat tabs:', error)
  }
}

export default function AIPanel({ document, onClose }: AIPanelProps) {
  const { theme } = useTheme()
  const [chats, setChats] = useState<Chat[]>([
    { id: 'chat_default', name: 'Chat 1', messages: [] }
  ])
  // Initialize activeChatId from localStorage if available
  const [activeChatId, setActiveChatId] = useState<string>(() => {
    const saved = loadActiveChatId(document)
    return saved || 'chat_default'
  })
  const savedActiveChatId = loadActiveChatId(document)
  const previousActiveChatIdRef = useRef<string>(savedActiveChatId || 'chat_default') // Track previous activeChatId to maintain across file switches
  const chatsRef = useRef<Chat[]>([]) // Track current chats to preserve new chats when switching files
  const isNavigatingAwayRef = useRef<boolean>(false) // Track if we're navigating away to prevent persisting 'chat_default'
  const [isStreaming, setIsStreaming] = useState(false)
  const [showMenu, setShowMenu] = useState(false)
  const [showHistoryDropdown, setShowHistoryDropdown] = useState(false)
  const [hoveredChatId, setHoveredChatId] = useState<string | null>(null)
  const [chatInputText, setChatInputText] = useState<string>('')
  const [draggedChatId, setDraggedChatId] = useState<string | null>(null)
  const [dropTargetChatId, setDropTargetChatId] = useState<string | null>(null)
  const [dropPosition, setDropPosition] = useState<'left' | 'right' | null>(null)
  const headerScrollRef = useRef<HTMLDivElement>(null)
  const chatTabsScrollRef = useRef<HTMLDivElement>(null) // Ref for chat tabs scrollable container
  const scrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const historyButtonRef = useRef<HTMLButtonElement>(null)
  
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
  const hoverBg = theme === 'dark' ? '#1f1f1f' : '#f5f5f5' // Brighter for chat tabs
  const buttonHoverBg = theme === 'dark' ? '#252525' : '#f8f8f8' // Even brighter for buttons
  const iconColor = theme === 'dark' ? '#858585' : '#5f6368'

  const documentContent = document?.content || undefined

  // Update chatsRef whenever chats change
  useEffect(() => {
    chatsRef.current = chats
  }, [chats])

  // Persist active chat ID whenever it changes
  useEffect(() => {
    // Don't persist if we're navigating away (document is null) or if activeChatId is 'chat_default' during navigation
    // This prevents persisting 'chat_default' when clicking Home
    if (document?.id && activeChatId && !isNavigatingAwayRef.current) {
      saveActiveChatId(document, activeChatId)
    }
  }, [document?.id, activeChatId])

  // Load chat history when document changes
  useEffect(() => {
    if (!document?.id) {
      // Reset to default if no document
      // Set flag to prevent persisting 'chat_default' when navigating away
      isNavigatingAwayRef.current = true
      setChats([{ id: 'chat_default', name: 'Chat 1', messages: [] }])
      const defaultChatId = 'chat_default'
      setActiveChatId(defaultChatId)
      // Don't reset previousActiveChatIdRef here - preserve it for when we return
      return
    }
    
    // Document exists - reset the navigation flag
    isNavigatingAwayRef.current = false

    const loadChatHistory = async () => {
      try {
        // Load saved active chat ID from localStorage for this project/document
        const savedActiveChatId = loadActiveChatId(document)
        
        // Load saved open chat tabs
        const savedOpenTabs = loadOpenChatTabs(document)
        
        // Always prioritize saved active chat ID from localStorage for this project
        // This ensures we restore the correct chat when returning to a project
        const currentChatId = savedActiveChatId || (previousActiveChatIdRef && previousActiveChatIdRef.current) || activeChatId
        
        // IPC returns data directly, not wrapped in { data: ... }
        const chatHistory = await chatApi.getChatHistory(document.id) || {}
        
        // Convert chat history to Chat format
        const chatEntries = Object.entries(chatHistory)
        
        if (chatEntries.length === 0) {
          // No chat history, but maintain current activeChatId instead of switching
          // Only create default chat if we don't have a current activeChatId
          const chatIdToUse = currentChatId || 'chat_default'
          setChats([{ id: chatIdToUse, name: 'Chat 1', messages: [] }])
          setActiveChatId(chatIdToUse)
          previousActiveChatIdRef.current = chatIdToUse
          saveActiveChatId(document, chatIdToUse)
          saveOpenChatTabs(document, [chatIdToUse])
        } else {
          // Load existing chats
          const allLoadedChats: Chat[] = chatEntries.map(([chatId, messages], index) => {
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
          
          // Filter to only include chats that are in the saved open tabs list
          // If no saved tabs exist (first time), include all chats
          let openChatIds: string[]
          if (savedOpenTabs.length === 0) {
            // First time loading - include all chats
            openChatIds = allLoadedChats.map(chat => chat.id)
            // Ensure saved active chat is included if it exists in chat history
            if (savedActiveChatId && allLoadedChats.some(chat => chat.id === savedActiveChatId)) {
              if (!openChatIds.includes(savedActiveChatId)) {
                openChatIds.push(savedActiveChatId)
              }
            }
            saveOpenChatTabs(document, openChatIds)
          } else {
            // Use saved open tabs, but ensure saved active chat is included if it exists
            openChatIds = [...savedOpenTabs]
            if (savedActiveChatId && allLoadedChats.some(chat => chat.id === savedActiveChatId)) {
              if (!openChatIds.includes(savedActiveChatId)) {
                openChatIds.push(savedActiveChatId)
                saveOpenChatTabs(document, openChatIds)
              }
            }
          }
          
          // Build loadedChats based on openChatIds order (not allLoadedChats order)
          // This preserves the correct tab order from localStorage
          const chatMap = new Map(allLoadedChats.map(chat => [chat.id, chat]))
          const loadedChats = openChatIds
            .map(chatId => chatMap.get(chatId))
            .filter((chat): chat is Chat => chat !== undefined)
          
          // Always prioritize saved active chat ID from localStorage when restoring
          // Check if saved active chat exists in loaded chats first
          let chatIdToUse: string
          if (savedActiveChatId && loadedChats.some(chat => chat.id === savedActiveChatId)) {
            // Saved active chat exists - use it
            chatIdToUse = savedActiveChatId
          } else if (currentChatId && loadedChats.some(chat => chat.id === currentChatId)) {
            // Current chat ID exists - use it
            chatIdToUse = currentChatId
          } else {
            // Fallback to first available chat
            if (loadedChats.length > 0) {
              chatIdToUse = loadedChats[0].id
            } else {
              // Fallback to default if no chats loaded (shouldn't happen)
              chatIdToUse = 'chat_default'
            }
          }
          
          // Ensure we have at least one chat open
          if (loadedChats.length === 0) {
            // If no open chats, create a default one
            const defaultChat: Chat = {
              id: chatIdToUse || 'chat_default',
              name: 'Chat 1',
              messages: []
            }
            setChats([defaultChat])
            const finalChatId = chatIdToUse || 'chat_default'
            setActiveChatId(finalChatId)
            previousActiveChatIdRef.current = finalChatId
            saveActiveChatId(document, finalChatId)
            saveOpenChatTabs(document, [finalChatId])
          } else {
            setChats(loadedChats)
            
            // Restore the saved active chat ID (or first chat if saved one doesn't exist)
            setActiveChatId(chatIdToUse)
            // Keep ref in sync
            previousActiveChatIdRef.current = chatIdToUse
            saveActiveChatId(document, chatIdToUse)
          }
        }
      } catch (error) {
        console.error('Failed to load chat history:', error)
        // Fallback to default chat on error
        const defaultChatId = 'chat_default'
        setChats([{ id: defaultChatId, name: 'Chat 1', messages: [] }])
        setActiveChatId(defaultChatId)
        previousActiveChatIdRef.current = defaultChatId
        saveActiveChatId(document, defaultChatId)
        saveOpenChatTabs(document, [defaultChatId])
      }
    }

    loadChatHistory()
  }, [document?.id]) // Only reload when document changes, not when activeChatId changes

  // Auto-scroll active tab into view when it changes
  useEffect(() => {
    if (!activeChatId || !chatTabsScrollRef.current) return
    
    // Use setTimeout to ensure DOM has updated
    const timeoutId = setTimeout(() => {
      const container = chatTabsScrollRef.current
      if (!container) return
      
      // Find the active tab element
      const activeTab = container.querySelector(`[data-chat-id="${activeChatId}"]`) as HTMLElement
      if (!activeTab) return
      
      // Get the container's bounding rect and the tab's bounding rect
      const containerRect = container.getBoundingClientRect()
      const tabRect = activeTab.getBoundingClientRect()
      
      // Calculate if the tab is hidden behind the buttons on the right
      // The buttons take up approximately 120px (3 buttons * ~40px each)
      const buttonsWidth = 120
      const visibleRight = containerRect.right - buttonsWidth
      const padding = 8 // Padding to ensure tab is fully visible
      
      // Check if tab is outside visible area
      if (tabRect.right > visibleRight || tabRect.left < containerRect.left) {
        // Calculate relative positions within the scrollable container
        const tabLeftRelative = tabRect.left - containerRect.left + container.scrollLeft
        const tabWidth = tabRect.width
        const containerWidth = container.clientWidth
        const currentScrollLeft = container.scrollLeft
        
        // Calculate desired scroll position
        let desiredScrollLeft = currentScrollLeft
        
        // If tab is to the right of visible area (hidden behind buttons)
        if (tabRect.right > visibleRight) {
          // Scroll so tab's right edge is visible, accounting for buttons
          desiredScrollLeft = tabLeftRelative + tabWidth - (containerWidth - buttonsWidth) + padding
        } 
        // If tab is to the left of visible area
        else if (tabRect.left < containerRect.left) {
          // Scroll so tab's left edge is visible
          desiredScrollLeft = tabLeftRelative - padding
        }
        
        // Ensure scroll position is within bounds
        const maxScrollLeft = container.scrollWidth - containerWidth
        desiredScrollLeft = Math.max(0, Math.min(desiredScrollLeft, maxScrollLeft))
        
        // Scroll to the desired position (no animation)
        container.scrollLeft = desiredScrollLeft
      }
    }, 50) // Small delay to ensure DOM update
    
    return () => clearTimeout(timeoutId)
  }, [activeChatId, chats])

  // Add scroll detection and edge detection to show scrollbar for header
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

  // Add scroll detection for chat tabs to hide scrollbar when not scrolling
  const chatTabsScrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    const container = chatTabsScrollRef.current
    if (!container) return

    const handleScroll = () => {
      if (container) {
        container.classList.add('scrolling')
        if (chatTabsScrollTimeoutRef.current) {
          clearTimeout(chatTabsScrollTimeoutRef.current)
        }
        chatTabsScrollTimeoutRef.current = setTimeout(() => {
          if (container) {
            container.classList.remove('scrolling')
          }
        }, 600) // Hide scrollbar after 600ms of no scrolling
      }
    }

    container.addEventListener('scroll', handleScroll, { passive: true })
    
    return () => {
      container.removeEventListener('scroll', handleScroll)
      if (chatTabsScrollTimeoutRef.current) {
        clearTimeout(chatTabsScrollTimeoutRef.current)
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
    const newChats = [...chats, newChat]
    setChats(newChats)
    setActiveChatId(newChatId)
    previousActiveChatIdRef.current = newChatId // Update ref when creating new chat
    
    // Update persisted open tabs list
    const newOpenTabs = newChats.map(c => c.id)
    saveOpenChatTabs(document, newOpenTabs)
  }

  const handleCloseChat = (chatId: string, e?: React.MouseEvent) => {
    if (e) {
      e.stopPropagation()
    }
    
    if (chats.length === 1) {
      // If it's the last chat, create a new one and replace the old one
      if (!document?.id) return
      
      const newChatId = `chat_${Date.now()}`
      const newChat: Chat = {
        id: newChatId,
        name: `Chat 1`,
        messages: []
      }
      // Replace the old chat with the new one
      setChats([newChat])
      setActiveChatId(newChatId)
      previousActiveChatIdRef.current = newChatId
      
      // Update persisted open tabs list
      saveOpenChatTabs(document, [newChatId])
      // Don't delete from backend - keep it in history so it can be reopened
    } else {
      // Remove the chat from tabs (but keep it in backend history)
      const newChats = chats.filter(c => c.id !== chatId)
      setChats(newChats)
      
      // Update persisted open tabs list
      if (document) {
        const newOpenTabs = newChats.map(c => c.id)
        saveOpenChatTabs(document, newOpenTabs)
      }
      
      // If the closed chat was active, switch to another one
      if (activeChatId === chatId) {
        const closedIndex = chats.findIndex(c => c.id === chatId)
        const newActiveIndex = closedIndex > 0 ? closedIndex - 1 : 0
        const newActiveChatId = newChats[newActiveIndex]?.id || newChats[0]?.id
        setActiveChatId(newActiveChatId)
        previousActiveChatIdRef.current = newActiveChatId
        if (document) {
          saveActiveChatId(document, newActiveChatId) // Persist when switching after closing
        }
      }
      
      // Don't delete from backend - keep it in history so it can be reopened
    }
  }

  const handleCloseOtherChats = () => {
    if (!document?.id) return
    
    const activeChat = chats.find(c => c.id === activeChatId)
    if (!activeChat) return
    
    setChats([activeChat])
    
    // Update persisted open tabs list
    saveOpenChatTabs(document, [activeChatId])
    
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
    const defaultChatId = 'chat_default'
    setActiveChatId(defaultChatId)
    previousActiveChatIdRef.current = defaultChatId
    if (document) {
      saveActiveChatId(document, defaultChatId) // Persist when clearing all chats
      saveOpenChatTabs(document, [defaultChatId]) // Persist open tabs
    }
    setShowMenu(false)
  }

  const handleRenameChat = (chatId: string, newName: string) => {
    setChats(prevChats => 
      prevChats.map(chat => 
        chat.id === chatId ? { ...chat, name: newName } : chat
      )
    )
  }

  // Drag and drop handlers for chat tabs
  const handleChatDragStart = (e: React.DragEvent, chatId: string) => {
    setDraggedChatId(chatId)
    setDropTargetChatId(null)
    setDropPosition(null)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', chatId)
  }

  const handleChatDragOver = (e: React.DragEvent, targetChatId: string) => {
    e.preventDefault()
    e.stopPropagation()
    e.dataTransfer.dropEffect = 'move'
    
    if (draggedChatId && draggedChatId !== targetChatId) {
      // Calculate drop position based on mouse position within the tab
      const rect = e.currentTarget.getBoundingClientRect()
      const mouseX = e.clientX - rect.left
      const tabWidth = rect.width
      const dropSide = mouseX < tabWidth / 2 ? 'left' : 'right'
      
      setDropTargetChatId(targetChatId)
      setDropPosition(dropSide)
    }
  }

  const handleChatDragLeave = () => {
    setDropTargetChatId(null)
    setDropPosition(null)
  }

  const handleChatDrop = (e: React.DragEvent, targetChatId: string) => {
    e.preventDefault()
    e.stopPropagation()
    
    if (draggedChatId && draggedChatId !== targetChatId && dropPosition) {
      const draggedIndex = chats.findIndex(c => c.id === draggedChatId)
      const targetIndex = chats.findIndex(c => c.id === targetChatId)
      
      if (draggedIndex !== -1 && targetIndex !== -1) {
        const newChats = [...chats]
        const [draggedChat] = newChats.splice(draggedIndex, 1)
        
        // Insert at the correct position
        const insertIndex = dropPosition === 'left' ? targetIndex : targetIndex + 1
        newChats.splice(insertIndex, 0, draggedChat)
        
        setChats(newChats)
        
        // Update persisted open tabs list with new order
        if (document) {
          const newOpenTabs = newChats.map(c => c.id)
          saveOpenChatTabs(document, newOpenTabs)
        }
      }
    }
    
    setDraggedChatId(null)
    setDropTargetChatId(null)
    setDropPosition(null)
  }

  const handleChatDragEnd = () => {
    setDraggedChatId(null)
    setDropTargetChatId(null)
    setDropPosition(null)
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
          paddingTop: '6px',
          paddingBottom: '6px',
          paddingLeft: '12px',
          paddingRight: '12px',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          backgroundColor: brighterBg,
          overflow: 'hidden'
        }}>
        {/* Chat Containers - Scrollable area that compresses */}
        <div 
          ref={chatTabsScrollRef}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            flex: '1',
            minWidth: 0,
            overflowX: 'auto',
            overflowY: 'hidden',
            scrollbarWidth: 'thin', // Firefox - thin scrollbar
            msOverflowStyle: 'auto', // IE/Edge
          } as React.CSSProperties}
          className="chat-tabs-scrollable scrollable-container"
        >
          {chats.map((chat) => {
            const isDragging = draggedChatId === chat.id
            const isDropTarget = dropTargetChatId === chat.id
            const showDropIndicator = isDropTarget && dropPosition
            
            return (
            <div
              key={chat.id}
              data-chat-id={chat.id}
              draggable
              onDragStart={(e) => handleChatDragStart(e, chat.id)}
              onDragOver={(e) => handleChatDragOver(e, chat.id)}
              onDragLeave={handleChatDragLeave}
              onDrop={(e) => handleChatDrop(e, chat.id)}
              onDragEnd={handleChatDragEnd}
              onClick={() => {
                if (!isDragging) {
                  setActiveChatId(chat.id)
                  previousActiveChatIdRef.current = chat.id
                  if (document) {
                    saveActiveChatId(document, chat.id) // Persist when switching chats
                  }
                }
              }}
              onMouseEnter={() => {
                if (!isDragging) {
                  setHoveredChatId(chat.id)
                }
              }}
              onMouseLeave={() => {
                if (!isDragging) {
                  setHoveredChatId(null)
                }
              }}
              style={{
                paddingTop: '4px',
                paddingBottom: '6px',
                paddingLeft: '8px',
                paddingRight: '8px',
                borderRadius: (activeChatId === chat.id || hoveredChatId === chat.id) ? '6px' : '12px',
                backgroundColor: activeChatId === chat.id 
                  ? activeChatBg 
                  : (hoveredChatId === chat.id ? hoverBg : 'transparent'),
                border: 'none',
                display: 'flex',
                alignItems: 'center',
                cursor: isDragging ? 'grabbing' : 'grab',
                transition: isDragging ? 'none' : 'all 0.2s ease',
                minWidth: '60px',
                maxWidth: '120px',
                flexShrink: 0, // Don't shrink, allow horizontal scroll instead
                flexGrow: 0,
                position: 'relative',
                opacity: isDragging ? 0.5 : 1,
                userSelect: 'none'
              }}
            >
              {/* Drop indicator line */}
              {showDropIndicator && dropPosition === 'left' && (
                <div
                  style={{
                    position: 'absolute',
                    left: 0,
                    top: 0,
                    bottom: 0,
                    width: '2px',
                    backgroundColor: theme === 'dark' ? '#999999' : '#c0c0c0',
                    zIndex: 1000,
                    pointerEvents: 'none'
                  }}
                />
              )}
              {showDropIndicator && dropPosition === 'right' && (
                <div
                  style={{
                    position: 'absolute',
                    right: 0,
                    top: 0,
                    bottom: 0,
                    width: '2px',
                    backgroundColor: theme === 'dark' ? '#999999' : '#c0c0c0',
                    zIndex: 1000,
                    pointerEvents: 'none'
                  }}
                />
              )}
              <span style={{
                fontSize: '13px',
                fontWeight: 500,
                color: activeChatId === chat.id ? textColor : '#6b6b6b',
                overflow: 'hidden',
                textOverflow: 'clip',
                whiteSpace: 'nowrap',
                width: hoveredChatId === chat.id ? 'calc(100% - 24px)' : '100%',
                display: 'block',
                paddingRight: hoveredChatId === chat.id ? '4px' : '0'
              }}>
                {chat.name}
              </span>
              {hoveredChatId === chat.id && !isDragging && (
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    handleCloseChat(chat.id, e)
                  }}
                  onMouseDown={(e) => e.stopPropagation()}
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
                    backdropFilter: 'blur(4px)',
                    zIndex: 5
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
            )
          })}
        </div>
        
        {/* Action Buttons - Always visible on the right */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '1px', flexShrink: 0, marginRight: '0px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1px' }}>
          <button
            onClick={handleNewChat}
            style={{
              padding: '4px 6px',
              border: 'none',
              borderRadius: '4px',
              backgroundColor: 'transparent',
              color: iconColor,
              cursor: 'pointer',
              fontSize: '20px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'background-color 0.15s',
              minWidth: '28px',
              minHeight: '28px'
            }}
            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = buttonHoverBg}
            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
            title="New chat"
          >
            <AddIcon style={{ fontSize: '19px' }} />
          </button>
          
          <button
            ref={historyButtonRef}
            onClick={() => {
              setShowHistoryDropdown(!showHistoryDropdown)
              setShowMenu(false) // Close other menu if open
            }}
            style={{
              padding: '4px 8px 4px 6px',
              border: 'none',
              borderRadius: '4px',
              backgroundColor: showHistoryDropdown ? buttonHoverBg : 'transparent',
              color: iconColor,
              cursor: 'pointer',
              fontSize: '20px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'background-color 0.15s',
              minWidth: '28px',
              minHeight: '28px'
            }}
            onMouseEnter={(e) => !showHistoryDropdown && (e.currentTarget.style.backgroundColor = buttonHoverBg)}
            onMouseLeave={(e) => !showHistoryDropdown && (e.currentTarget.style.backgroundColor = 'transparent')}
            title="History"
          >
            <HistoryIcon style={{ fontSize: '16px' }} />
          </button>
          
          </div>
          <button
            onClick={onClose}
            style={{
              padding: '4px 6px',
              border: 'none',
              borderRadius: '4px',
              backgroundColor: 'transparent',
              color: iconColor,
              cursor: 'pointer',
              fontSize: '20px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'background-color 0.15s',
              transform: 'translateY(0.5px)',
              marginLeft: '0px',
              minWidth: '28px',
              minHeight: '28px'
            }}
            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = buttonHoverBg}
            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
            title="Close AI Panel"
          >
            <CloseIcon style={{ fontSize: '18px', fontWeight: 200 }} />
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
          projectId={document?.projectId}
          chatId={activeChatId}
          documentContent={documentContent}
          isStreaming={isStreaming}
          setIsStreaming={setIsStreaming}
          onFirstMessage={(message) => handleChatNameUpdate(activeChatId, message)}
          initialInput={chatInputText}
          onInputSet={() => setChatInputText('')}
        />
      </div>

      {/* Chat History Dropdown */}
      {showHistoryDropdown && (
        <ChatHistoryDropdown
          documentId={document?.id}
          chats={chats}
          isOpen={showHistoryDropdown}
          onClose={() => setShowHistoryDropdown(false)}
          onSelectChat={async (chatId) => {
            // Check if chat is already in tabs
            const chatExists = chats.some(c => c.id === chatId)
            
            if (!chatExists && document?.id) {
              // Load the chat from backend and add it to tabs
              try {
                const messages = await chatApi.getChat(document.id, chatId)
                const messageArray = Array.isArray(messages) ? messages : []
                const firstUserMessage = messageArray.find((msg: any) => msg.role === 'user')
                const chatName = firstUserMessage?.content 
                  ? generateChatName(firstUserMessage.content)
                  : `Chat ${chats.length + 1}`
                
                const loadedChat: Chat = {
                  id: chatId,
                  name: chatName,
                  messages: messageArray
                }
                
                const newChats = [...chats, loadedChat]
                setChats(newChats)
                
                // Update persisted open tabs list
                const newOpenTabs = newChats.map(c => c.id)
                saveOpenChatTabs(document, newOpenTabs)
              } catch (error) {
                console.error('Failed to load chat:', error)
              }
            }
            
            setActiveChatId(chatId)
            previousActiveChatIdRef.current = chatId
            if (document) {
              saveActiveChatId(document, chatId)
            }
          }}
          onDeleteChat={async (chatId) => {
            // Permanently delete from backend
            if (document?.id) {
              await chatApi.deleteChat(document.id, chatId).catch(console.error)
            }
            
            // Remove from tabs if it's open
            const chatExists = chats.some(c => c.id === chatId)
            if (chatExists) {
              handleCloseChat(chatId)
            }
          }}
          onRenameChat={handleRenameChat}
          activeChatId={activeChatId}
          anchorElement={historyButtonRef.current}
        />
      )}
    </div>
  )
}
