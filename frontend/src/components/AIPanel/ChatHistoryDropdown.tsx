import { useState, useEffect, useRef } from 'react'
import { AIChatMessage } from '@shared/types'
import { chatApi } from '../../services/api'
import { useTheme } from '../../contexts/ThemeContext'
// @ts-ignore
import EditIcon from '@mui/icons-material/Edit'
// @ts-ignore
import DeleteIcon from '@mui/icons-material/Delete'

interface ChatHistoryItem {
  id: string
  name: string
  lastMessageTime: Date
  messageCount: number
}

interface ChatHistoryDropdownProps {
  documentId: string | undefined
  chats: { id: string; name: string; messages: any[] }[]
  isOpen: boolean
  onClose: () => void
  onSelectChat: (chatId: string) => void
  onDeleteChat: (chatId: string) => void
  onRenameChat: (chatId: string, newName: string) => void
  activeChatId: string
  anchorElement?: HTMLElement | null
}

export default function ChatHistoryDropdown({
  documentId,
  chats,
  isOpen,
  onClose,
  onSelectChat,
  onDeleteChat,
  onRenameChat,
  activeChatId,
  anchorElement
}: ChatHistoryDropdownProps) {
  const { theme } = useTheme()
  const [loadedChats, setLoadedChats] = useState<{ id: string; name: string; messages: any[] }[]>(chats)
  const [editingChatId, setEditingChatId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')
  const [hoveredChatId, setHoveredChatId] = useState<string | null>(null)
  const [position, setPosition] = useState({ top: 0, left: 0 })
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Generate chat name from first user message
  const generateChatName = (firstMessage: string): string => {
    if (!firstMessage || !firstMessage.trim()) return 'New Chat'
    const cleaned = firstMessage.trim().replace(/\n/g, ' ').substring(0, 30)
    return cleaned.length < firstMessage.trim().length ? `${cleaned}...` : cleaned
  }

  // Reload chat history when dropdown opens
  useEffect(() => {
    if (isOpen && documentId) {
      const loadChatHistory = async () => {
        try {
          const chatHistory = await chatApi.getChatHistory(documentId) || {}
          const chatEntries = Object.entries(chatHistory)
          
          const loadedChatsData: { id: string; name: string; messages: any[] }[] = chatEntries.map(([chatId, messages], index) => {
            const messageArray = Array.isArray(messages) ? messages : []
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
          
          setLoadedChats(loadedChatsData)
        } catch (error) {
          console.error('Failed to load chat history for dropdown:', error)
          // Fallback to prop chats on error
          setLoadedChats(chats)
        }
      }
      
      loadChatHistory()
    }
    // Don't update from props when closed - keep the loaded data
  }, [isOpen, documentId])

  // Calculate position based on anchor element
  useEffect(() => {
    if (isOpen && anchorElement) {
      const rect = anchorElement.getBoundingClientRect()
      setPosition({
        top: rect.bottom + 4,
        left: rect.left - 150 + rect.width / 2 // Center relative to button, offset left
      })
    }
  }, [isOpen, anchorElement])

  const bgColor = theme === 'dark' ? '#141414' : '#ffffff'
  const borderColor = theme === 'dark' ? '#232323' : '#dadce0'
  const textColor = theme === 'dark' ? '#D6D6DD' : '#202124'
  const secondaryTextColor = theme === 'dark' ? '#858585' : '#9aa0a6'
  const hoverBg = theme === 'dark' ? '#1f1f1f' : '#f5f5f5'
  const selectedBg = theme === 'dark' ? '#252525' : '#e8eaed'
  const iconColor = theme === 'dark' ? '#858585' : '#5f6368'

  // Format time ago
  const formatTimeAgo = (date: Date): string => {
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)

    if (diffMins < 1) return 'now'
    if (diffMins < 60) return `${diffMins}m`
    if (diffHours < 24) return `${diffHours}h`
    if (diffDays === 1) return 'Yesterday'
    if (diffDays < 7) return `${diffDays}d`
    return date.toLocaleDateString()
  }

  // Group chats by date
  const groupChatsByDate = (items: ChatHistoryItem[]) => {
    const now = new Date()
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const yesterday = new Date(today)
    yesterday.setDate(yesterday.getDate() - 1)

    const todayItems: ChatHistoryItem[] = []
    const yesterdayItems: ChatHistoryItem[] = []
    const olderItems: ChatHistoryItem[] = []

    items.forEach(item => {
      const itemDate = new Date(item.lastMessageTime.getFullYear(), item.lastMessageTime.getMonth(), item.lastMessageTime.getDate())
      
      if (itemDate.getTime() === today.getTime()) {
        todayItems.push(item)
      } else if (itemDate.getTime() === yesterday.getTime()) {
        yesterdayItems.push(item)
      } else {
        olderItems.push(item)
      }
    })

    return { todayItems, yesterdayItems, olderItems }
  }

  // Process chats to get history items
  const getHistoryItems = (): ChatHistoryItem[] => {
    if (!documentId) return []

    return loadedChats
      .map(chat => {
        // Get the last message timestamp
        const messages = chat.messages || []
        let lastMessageTime = new Date(0)
        
        if (messages.length > 0) {
          // Find the most recent message timestamp
          const timestamps = messages
            .map((msg: AIChatMessage) => msg.timestamp ? new Date(msg.timestamp) : null)
            .filter((ts: Date | null): ts is Date => ts !== null)
          
          if (timestamps.length > 0) {
            lastMessageTime = new Date(Math.max(...timestamps.map(ts => ts.getTime())))
          }
        }

        // If no messages, use chat ID timestamp (if it contains timestamp)
        if (lastMessageTime.getTime() === 0 && chat.id.startsWith('chat_')) {
          const timestampMatch = chat.id.match(/\d+/)
          if (timestampMatch) {
            lastMessageTime = new Date(parseInt(timestampMatch[0]))
          }
        }

        // Fallback to current time if no timestamp found (for empty chats)
        if (lastMessageTime.getTime() === 0) {
          lastMessageTime = new Date()
        }

        return {
          id: chat.id,
          name: chat.name,
          lastMessageTime,
          messageCount: messages.length
        }
      })
      .filter(item => item.messageCount > 0) // Only show chats with messages
      .sort((a, b) => b.lastMessageTime.getTime() - a.lastMessageTime.getTime())
      .slice(0, 20) // Keep the 20 most recent chats
  }

  const { todayItems, yesterdayItems, olderItems } = groupChatsByDate(getHistoryItems())

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node
      
      // Don't close if clicking inside the dropdown
      if (dropdownRef.current && dropdownRef.current.contains(target)) {
        return
      }
      
      // Don't close if clicking on the anchor element (history button)
      if (anchorElement && anchorElement.contains(target)) {
        return
      }
      
      // Close for any other click
      onClose()
    }

    if (isOpen) {
      // Use capture phase to catch events before they're stopped
      document.addEventListener('mousedown', handleClickOutside, true)
      // Also listen to click events as a fallback
      document.addEventListener('click', handleClickOutside, true)
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside, true)
      document.removeEventListener('click', handleClickOutside, true)
    }
  }, [isOpen, onClose, anchorElement])

  // Handle edit
  const handleEdit = (chatId: string, currentName: string) => {
    setEditingChatId(chatId)
    setEditingName(currentName)
  }

  // Handle save edit
  const handleSaveEdit = () => {
    if (editingChatId && editingName.trim()) {
      onRenameChat(editingChatId, editingName.trim())
    }
    setEditingChatId(null)
    setEditingName('')
  }

  // Handle cancel edit
  const handleCancelEdit = () => {
    setEditingChatId(null)
    setEditingName('')
  }

  // Handle key press in edit input
  const handleEditKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSaveEdit()
    } else if (e.key === 'Escape') {
      handleCancelEdit()
    }
  }

  if (!isOpen) return null

  return (
    <div
      ref={dropdownRef}
      style={{
        position: 'fixed',
        top: `${position.top}px`,
        left: `${position.left}px`,
        transform: 'translateX(-50%)',
        width: '400px',
        maxHeight: '60vh', // Approximately 3/5 of screen height
        backgroundColor: bgColor,
        border: `1px solid ${borderColor}`,
        borderRadius: '8px',
        boxShadow: theme === 'dark' 
          ? '0 4px 16px rgba(0,0,0,0.5)' 
          : '0 4px 16px rgba(0,0,0,0.15)',
        zIndex: 10000,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden'
      }}
    >
      {/* Chat List */}
      <div style={{
        flex: 1,
        overflowY: 'auto',
        padding: '4px 0'
      }}>
        {/* Today Section */}
        {todayItems.length > 0 && (
          <div>
            <div style={{
              padding: '8px 12px 4px 12px',
              fontSize: '11px',
              fontWeight: 600,
              color: secondaryTextColor,
              textTransform: 'uppercase',
              letterSpacing: '0.5px'
            }}>
              Today
            </div>
            {todayItems.map(item => (
              <ChatItem
                key={item.id}
                item={item}
                isActive={item.id === activeChatId}
                isHovered={hoveredChatId === item.id}
                isEditing={editingChatId === item.id}
                editingName={editingName}
                onMouseEnter={() => setHoveredChatId(item.id)}
                onMouseLeave={() => setHoveredChatId(null)}
                onClick={() => {
                  if (editingChatId !== item.id) {
                    onSelectChat(item.id)
                    onClose()
                  }
                }}
                onEdit={() => handleEdit(item.id, item.name)}
                onDelete={() => {
                  onDeleteChat(item.id)
                  if (editingChatId === item.id) {
                    setEditingChatId(null)
                  }
                }}
                onSaveEdit={handleSaveEdit}
                onEditNameChange={setEditingName}
                onEditKeyDown={handleEditKeyDown}
                theme={theme}
                textColor={textColor}
                secondaryTextColor={secondaryTextColor}
                hoverBg={hoverBg}
                selectedBg={selectedBg}
                iconColor={iconColor}
                formatTimeAgo={formatTimeAgo}
              />
            ))}
          </div>
        )}

        {/* Yesterday Section */}
        {yesterdayItems.length > 0 && (
          <div>
            <div style={{
              padding: '12px 12px 4px 12px',
              fontSize: '11px',
              fontWeight: 600,
              color: secondaryTextColor,
              textTransform: 'uppercase',
              letterSpacing: '0.5px'
            }}>
              Yesterday
            </div>
            {yesterdayItems.map(item => (
              <ChatItem
                key={item.id}
                item={item}
                isActive={item.id === activeChatId}
                isHovered={hoveredChatId === item.id}
                isEditing={editingChatId === item.id}
                editingName={editingName}
                onMouseEnter={() => setHoveredChatId(item.id)}
                onMouseLeave={() => setHoveredChatId(null)}
                onClick={() => {
                  if (editingChatId !== item.id) {
                    onSelectChat(item.id)
                    onClose()
                  }
                }}
                onEdit={() => handleEdit(item.id, item.name)}
                onDelete={() => {
                  onDeleteChat(item.id)
                  if (editingChatId === item.id) {
                    setEditingChatId(null)
                  }
                }}
                onSaveEdit={handleSaveEdit}
                onEditNameChange={setEditingName}
                onEditKeyDown={handleEditKeyDown}
                theme={theme}
                textColor={textColor}
                secondaryTextColor={secondaryTextColor}
                hoverBg={hoverBg}
                selectedBg={selectedBg}
                iconColor={iconColor}
                formatTimeAgo={formatTimeAgo}
              />
            ))}
          </div>
        )}

        {/* Older Items */}
        {olderItems.length > 0 && (
          <div>
            <div style={{
              padding: '12px 12px 4px 12px',
              fontSize: '11px',
              fontWeight: 600,
              color: secondaryTextColor,
              textTransform: 'uppercase',
              letterSpacing: '0.5px'
            }}>
              Past Chats
            </div>
            {olderItems.map(item => (
              <ChatItem
                key={item.id}
                item={item}
                isActive={item.id === activeChatId}
                isHovered={hoveredChatId === item.id}
                isEditing={editingChatId === item.id}
                editingName={editingName}
                onMouseEnter={() => setHoveredChatId(item.id)}
                onMouseLeave={() => setHoveredChatId(null)}
                onClick={() => {
                  if (editingChatId !== item.id) {
                    onSelectChat(item.id)
                    onClose()
                  }
                }}
                onEdit={() => handleEdit(item.id, item.name)}
                onDelete={() => {
                  onDeleteChat(item.id)
                  if (editingChatId === item.id) {
                    setEditingChatId(null)
                  }
                }}
                onSaveEdit={handleSaveEdit}
                onEditNameChange={setEditingName}
                onEditKeyDown={handleEditKeyDown}
                theme={theme}
                textColor={textColor}
                secondaryTextColor={secondaryTextColor}
                hoverBg={hoverBg}
                selectedBg={selectedBg}
                iconColor={iconColor}
                formatTimeAgo={formatTimeAgo}
              />
            ))}
          </div>
        )}

        {getHistoryItems().length === 0 && (
          <div style={{
            padding: '24px',
            textAlign: 'center',
            color: secondaryTextColor,
            fontSize: '13px'
          }}>
            No chat history
          </div>
        )}
      </div>
    </div>
  )
}

interface ChatItemProps {
  item: ChatHistoryItem
  isActive: boolean
  isHovered: boolean
  isEditing: boolean
  editingName: string
  onMouseEnter: () => void
  onMouseLeave: () => void
  onClick: () => void
  onEdit: () => void
  onDelete: () => void
  onSaveEdit: () => void
  onEditNameChange: (name: string) => void
  onEditKeyDown: (e: React.KeyboardEvent) => void
  theme: string
  textColor: string
  secondaryTextColor: string
  hoverBg: string
  selectedBg: string
  iconColor: string
  formatTimeAgo: (date: Date) => string
}

function ChatItem({
  item,
  isActive,
  isHovered,
  isEditing,
  editingName,
  onMouseEnter,
  onMouseLeave,
  onClick,
  onEdit,
  onDelete,
  onSaveEdit,
  onEditNameChange,
  onEditKeyDown,
  theme,
  textColor,
  secondaryTextColor,
  hoverBg,
  selectedBg,
  iconColor,
  formatTimeAgo
}: ChatItemProps) {
  const editInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (isEditing && editInputRef.current) {
      editInputRef.current.focus()
      editInputRef.current.select()
    }
  }, [isEditing])

  return (
    <div
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      onClick={onClick}
      style={{
        padding: '8px 12px',
        backgroundColor: isActive ? selectedBg : (isHovered ? hoverBg : 'transparent'),
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        position: 'relative',
        transition: 'background-color 0.15s'
      }}
    >
      {/* Icon */}
      <div style={{
        width: '16px',
        height: '16px',
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}>
        <div style={{
          width: '12px',
          height: '12px',
          border: `1.5px solid ${isActive ? textColor : iconColor}`,
          borderRadius: '2px',
          backgroundColor: isActive ? textColor : 'transparent'
        }} />
      </div>

      {/* Chat Name */}
      {isEditing ? (
        <input
          ref={editInputRef}
          type="text"
          value={editingName}
          onChange={(e) => onEditNameChange(e.target.value)}
          onBlur={onSaveEdit}
          onKeyDown={onEditKeyDown}
          onClick={(e) => e.stopPropagation()}
          style={{
            flex: 1,
            padding: '2px 4px',
            backgroundColor: theme === 'dark' ? '#1d1d1d' : '#ffffff',
            border: `1px solid ${theme === 'dark' ? '#3e3e42' : '#bdc1c6'}`,
            borderRadius: '4px',
            color: textColor,
            fontSize: '13px',
            outline: 'none',
            fontFamily: 'inherit'
          }}
        />
      ) : (
        <span style={{
          flex: 1,
          fontSize: '13px',
          color: textColor,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap'
        }}>
          {item.name}
        </span>
      )}

      {/* Time Ago */}
      {!isEditing && (
        <span style={{
          fontSize: '12px',
          color: secondaryTextColor,
          marginRight: isHovered ? '40px' : '0',
          transition: 'margin-right 0.15s',
          flexShrink: 0
        }}>
          {formatTimeAgo(item.lastMessageTime)}
        </span>
      )}

      {/* Edit and Delete Buttons */}
      {isHovered && !isEditing && (
        <div style={{
          position: 'absolute',
          right: '8px',
          display: 'flex',
          gap: '4px',
          alignItems: 'center'
        }}>
          <button
            onClick={(e) => {
              e.stopPropagation()
              onEdit()
            }}
            style={{
              padding: '4px',
              border: 'none',
              borderRadius: '4px',
              backgroundColor: 'transparent',
              color: iconColor,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '20px',
              height: '20px',
              transition: 'background-color 0.15s'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = theme === 'dark' ? '#2d2d2d' : '#e8eaed'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent'
            }}
            title="Edit chat name"
          >
            <EditIcon style={{ fontSize: '14px' }} />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation()
              onDelete()
            }}
            style={{
              padding: '4px',
              border: 'none',
              borderRadius: '4px',
              backgroundColor: 'transparent',
              color: iconColor,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '20px',
              height: '20px',
              transition: 'background-color 0.15s'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = theme === 'dark' ? '#2d2d2d' : '#e8eaed'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent'
            }}
            title="Delete chat"
          >
            <DeleteIcon style={{ fontSize: '14px' }} />
          </button>
        </div>
      )}
    </div>
  )
}

