import React, { useCallback, useState, useRef, useEffect, useMemo } from 'react'
import {
  ReactFlow,
  Node,
  Edge,
  Background,
  useNodesState,
  useEdgesState,
  Connection,
  NodeTypes,
  Panel as ReactFlowPanel,
  ReactFlowProvider,
  Handle,
  Position,
  ReactFlowInstance,
  useUpdateNodeInternals,
  useNodesInitialized,
  EdgeLabelRenderer,
  getBezierPath,
  BaseEdge,
  EdgeTypes,
  SelectionMode,
  MarkerType,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { Panel, PanelGroup } from 'react-resizable-panels'
import { useTheme } from '../../contexts/ThemeContext'
import { WorldLabNode, WorldLabEdge } from '@shared/types'
import { worldLabApi } from '../../services/desktop-api'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'

interface WorldLabCanvasProps {
  labName: string
  initialNodes: WorldLabNode[]
  initialEdges: WorldLabEdge[]
  onNodeDoubleClick?: (nodeId: string) => void
  onNodeClick?: (nodeId: string) => void
  onNodesChange?: (nodes: WorldLabNode[]) => void
  onEdgesChange?: (edges: WorldLabEdge[]) => void
  onCloseNodeEditor?: () => void
  onUndoRedoReady?: (handlers: { undo: () => void; redo: () => void; canUndo: () => boolean; canRedo: () => boolean }) => void
  nodeDocumentContent?: string // Content for the node document editor
  onNodeDocumentSave?: (nodeId: string, content: string) => void // Callback to save node document
}

// Enhanced category color palette with gradients
function getCategoryColor(category: string, theme: 'dark' | 'light'): {
  primary: string
  secondary: string
  glow: string
  badgeBg: string
} {
  // Normalize category name (support both lowercase and capitalized)
  const categoryKey = category.charAt(0).toUpperCase() + category.slice(1).toLowerCase()
  
  const colors: Record<string, { dark: any; light: any }> = {
    Uncategorized: {
      dark: {
        primary: '#9E9E9E',
        secondary: '#757575',
        glow: 'rgba(158, 158, 158, 0.25)',
        badgeBg: 'rgba(158, 158, 158, 0.12)',
      },
      light: {
        primary: '#757575',
        secondary: '#616161',
        glow: 'rgba(117, 117, 117, 0.15)',
        badgeBg: 'rgba(117, 117, 117, 0.08)',
      },
    },
    Character: {
      dark: {
        primary: '#5BA3FF',
        secondary: '#4285F4',
        glow: 'rgba(91, 163, 255, 0.4)',
        badgeBg: 'rgba(91, 163, 255, 0.15)',
      },
      light: {
        primary: '#1976D2',
        secondary: '#1565C0',
        glow: 'rgba(25, 118, 210, 0.2)',
        badgeBg: 'rgba(25, 118, 210, 0.1)',
      },
    },
    Event: {
      dark: {
        primary: '#FF6B9D',
        secondary: '#FF5252',
        glow: 'rgba(255, 107, 157, 0.4)',
        badgeBg: 'rgba(255, 107, 157, 0.15)',
      },
      light: {
        primary: '#D32F2F',
        secondary: '#C62828',
        glow: 'rgba(211, 47, 47, 0.2)',
        badgeBg: 'rgba(211, 47, 47, 0.1)',
      },
    },
    Concept: {
      dark: {
        primary: '#9C88FF',
        secondary: '#7C6AFF',
        glow: 'rgba(156, 136, 255, 0.4)',
        badgeBg: 'rgba(156, 136, 255, 0.15)',
      },
      light: {
        primary: '#6A4C93',
        secondary: '#5A3C83',
        glow: 'rgba(106, 76, 147, 0.2)',
        badgeBg: 'rgba(106, 76, 147, 0.1)',
      },
    },
    Custom: {
      dark: {
        primary: '#FFB84D',
        secondary: '#FFA726',
        glow: 'rgba(255, 184, 77, 0.4)',
        badgeBg: 'rgba(255, 184, 77, 0.15)',
      },
      light: {
        primary: '#F57C00',
        secondary: '#E65100',
        glow: 'rgba(245, 124, 0, 0.2)',
        badgeBg: 'rgba(245, 124, 0, 0.1)',
      },
    },
    Location: {
      dark: {
        primary: '#51CF66',
        secondary: '#40C057',
        glow: 'rgba(81, 207, 102, 0.4)',
        badgeBg: 'rgba(81, 207, 102, 0.15)',
      },
      light: {
        primary: '#388E3C',
        secondary: '#2E7D32',
        glow: 'rgba(56, 142, 60, 0.2)',
        badgeBg: 'rgba(56, 142, 60, 0.1)',
      },
    },
    Rule: {
      dark: {
        primary: '#FFD43B',
        secondary: '#FCC419',
        glow: 'rgba(255, 212, 59, 0.4)',
        badgeBg: 'rgba(255, 212, 59, 0.15)',
      },
      light: {
        primary: '#F57C00',
        secondary: '#E65100',
        glow: 'rgba(245, 124, 0, 0.2)',
        badgeBg: 'rgba(245, 124, 0, 0.1)',
      },
    },
    Setting: {
      dark: {
        primary: '#B197FC',
        secondary: '#9775FA',
        glow: 'rgba(177, 151, 252, 0.4)',
        badgeBg: 'rgba(177, 151, 252, 0.15)',
      },
      light: {
        primary: '#7B1FA2',
        secondary: '#6A1B9A',
        glow: 'rgba(123, 31, 162, 0.2)',
        badgeBg: 'rgba(123, 31, 162, 0.1)',
      },
    },
    Question: {
      dark: {
        primary: '#66D9EF',
        secondary: '#4DD0E1',
        glow: 'rgba(102, 217, 239, 0.4)',
        badgeBg: 'rgba(102, 217, 239, 0.15)',
      },
      light: {
        primary: '#0277BD',
        secondary: '#01579B',
        glow: 'rgba(2, 119, 189, 0.2)',
        badgeBg: 'rgba(2, 119, 189, 0.1)',
      },
    },
    Place: {
      dark: {
        primary: '#51CF66',
        secondary: '#40C057',
        glow: 'rgba(81, 207, 102, 0.4)',
        badgeBg: 'rgba(81, 207, 102, 0.15)',
      },
      light: {
        primary: '#388E3C',
        secondary: '#2E7D32',
        glow: 'rgba(56, 142, 60, 0.2)',
        badgeBg: 'rgba(56, 142, 60, 0.1)',
      },
    },
  }
  const defaultColors = {
    dark: {
      primary: '#858585',
      secondary: '#666666',
      glow: 'rgba(133, 133, 133, 0.3)',
      badgeBg: 'rgba(133, 133, 133, 0.1)',
    },
    light: {
      primary: '#5F6368',
      secondary: '#3C4043',
      glow: 'rgba(95, 99, 104, 0.15)',
      badgeBg: 'rgba(95, 99, 104, 0.08)',
    },
  }
  const cat = colors[categoryKey] || colors[category] || { dark: defaultColors.dark, light: defaultColors.light }
  return theme === 'dark' ? cat.dark : cat.light
}

// Category list (Uncategorized is not shown in dropdown, only used as default for new nodes)
const CATEGORIES = ['Character', 'Concept', 'Event', 'Place', 'Question']

// Beautiful custom node component representing "existences in the world"
// Helper function to extract preview text from content (markdown or TipTap JSON)
// Returns text that can span up to 2 lines
function extractPreviewText(content: any): string {
  if (!content) return ''
  
  // If content is a string (markdown), extract text lines
  if (typeof content === 'string') {
    const lines = content.split('\n')
    const validLines: string[] = []
    
    for (const line of lines) {
      if (validLines.length >= 2) break // Max 2 lines
      
      const trimmed = line.trim()
      // Skip markdown headers, empty lines, and code blocks
      if (trimmed && !trimmed.startsWith('#') && !trimmed.startsWith('```') && !trimmed.startsWith('---')) {
        // Remove markdown formatting
        const cleanText = trimmed
          .replace(/^[-*+]\s+/, '') // Remove list markers
          .replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1') // Remove links, keep text
          .replace(/\*\*([^*]+)\*\*/g, '$1') // Remove bold
          .replace(/\*([^*]+)\*/g, '$1') // Remove italic
          .replace(/`([^`]+)`/g, '$1') // Remove inline code
          .trim()
        if (cleanText) {
          validLines.push(cleanText)
        }
      }
    }
    
    return validLines.join(' ')
  }
  
  // If content is TipTap JSON object
  if (typeof content === 'object') {
    const extractText = (node: any): string => {
      if (node.type === 'text' && node.text) {
        return node.text
      }
      if (node.content && Array.isArray(node.content)) {
        const texts: string[] = []
        for (const child of node.content) {
          const text = extractText(child)
          if (text) texts.push(text)
        }
        return texts.join(' ')
      }
      return ''
    }
    
    if (content.type === 'doc' && content.content) {
      const texts: string[] = []
      for (const node of content.content) {
        if (texts.length >= 2) break // Max 2 lines worth of content
        const text = extractText(node)
        if (text) {
          texts.push(text)
        }
      }
      return texts.join(' ')
    }
  }
  
  return ''
}

// Helper function to convert hex color to rgba with opacity
function hexToRgba(hex: string, opacity: number): string {
  // Remove # if present
  const cleanHex = hex.replace('#', '')
  // Parse RGB values
  const r = parseInt(cleanHex.substring(0, 2), 16)
  const g = parseInt(cleanHex.substring(2, 4), 16)
  const b = parseInt(cleanHex.substring(4, 6), 16)
  return `rgba(${r}, ${g}, ${b}, ${opacity})`
}

const CustomNode = ({ data, selected, id }: { data: any; selected: boolean; id: string }) => {
  const { theme } = useTheme()
  const updateNodeInternals = useUpdateNodeInternals()
  const isRenaming = data.isRenaming || false
  const onRename = data.onRename || (() => {})
  const onRenameCancel = data.onRenameCancel || (() => {})
  const onStartRename = data.onStartRename || (() => {})
  const onCategoryChange = data.onCategoryChange || (() => {})
  const renameInputRef = useRef<HTMLTextAreaElement>(null)
  const labelRef = useRef<HTMLDivElement>(null)
  const categoryDropdownRef = useRef<HTMLDivElement>(null)
  const [isCategoryDropdownOpen, setIsCategoryDropdownOpen] = useState(false)
  const [isHovered, setIsHovered] = useState(false)
  const [isRenameInputFocused, setIsRenameInputFocused] = useState(false)
  
  // Get connection state from data
  const isConnecting = data.isConnecting || false
  const connectingFromNodeId = data.connectingFromNodeId || null
  const onHandleRightClick = data.onHandleRightClick || (() => {})
  
  // Update node internals when handles are rendered
  useEffect(() => {
    updateNodeInternals(id)
  }, [id, updateNodeInternals])
  
  // Extract preview text from content
  const previewText = useMemo(() => {
    if (data.content) {
      // Try to parse as JSON first (TipTap format), otherwise treat as markdown string
      try {
        const parsed = typeof data.content === 'string' ? JSON.parse(data.content) : data.content
        return extractPreviewText(parsed)
      } catch {
        // If parsing fails, treat as markdown string
        return extractPreviewText(data.content)
      }
    }
    return ''
  }, [data.content])
  
  // Always use a category - default to 'Uncategorized' if none set
  const nodeCategory = data.category || 'Uncategorized'
  const categoryColors = getCategoryColor(nodeCategory, theme)

  // Handle configuration - handles on all four sides for both source and target
  // This allows edges to always find the shortest path regardless of node positions
  const handleConfigs = [
    { id: 'top-source', type: 'source' as const, position: Position.Top },
    { id: 'top-target', type: 'target' as const, position: Position.Top },
    { id: 'bottom-source', type: 'source' as const, position: Position.Bottom },
    { id: 'bottom-target', type: 'target' as const, position: Position.Bottom },
    { id: 'left-source', type: 'source' as const, position: Position.Left },
    { id: 'left-target', type: 'target' as const, position: Position.Left },
    { id: 'right-source', type: 'source' as const, position: Position.Right },
    { id: 'right-target', type: 'target' as const, position: Position.Right },
  ]

  const nodeBg = theme === 'dark'
    ? 'linear-gradient(135deg, rgba(30, 30, 30, 0.95) 0%, rgba(25, 25, 25, 0.95) 100%)'
    : 'linear-gradient(135deg, rgba(255, 255, 255, 0.98) 0%, rgba(250, 250, 250, 0.98) 100%)'

  const nodeTextColor = theme === 'dark' ? '#E8E8E8' : '#1A1A1A'
  const secondaryTextColor = theme === 'dark' ? '#9E9E9E' : '#6B6B6B'

  // Always show category color in border (subtle when not selected, less bright when selected)
  const borderColor = selected
    ? `${categoryColors.primary}60` // 60% opacity when selected (less bright)
    : `${categoryColors.primary}40` // 40% opacity when not selected

  const shadowColor = selected
    ? categoryColors.glow
    : theme === 'dark'
    ? 'rgba(0, 0, 0, 0.3)'
    : 'rgba(0, 0, 0, 0.08)'

  // Auto-resize textarea height
  const adjustTextareaHeight = useCallback(() => {
    if (renameInputRef.current) {
      renameInputRef.current.style.height = 'auto'
      const scrollHeight = renameInputRef.current.scrollHeight
      // Set max height to prevent it from growing too large (e.g., 5 lines)
      const maxHeight = 22 * 5 // 5 lines at 22px per line
      renameInputRef.current.style.height = `${Math.min(scrollHeight, maxHeight)}px`
    }
  }, [])

  // Focus textarea when renaming starts (without scrolling/zooming)
  useEffect(() => {
    if (isRenaming && renameInputRef.current) {
      // Use requestAnimationFrame to ensure DOM is ready and prevent any viewport changes
      requestAnimationFrame(() => {
        if (renameInputRef.current) {
          // Prevent auto-scroll/zoom by focusing without scrolling
          renameInputRef.current.focus({ preventScroll: true })
          // Only select all text if this is a newly created node (label is "New Element")
          const isNewNode = (data.label || data.elementName || data.id) === 'New Element'
          if (isNewNode) {
            renameInputRef.current.select()
          } else {
            // Place cursor at the end for existing nodes
            const length = renameInputRef.current.value.length
            renameInputRef.current.setSelectionRange(length, length)
          }
          // Adjust height after focusing
          adjustTextareaHeight()
        }
      })
    }
  }, [isRenaming, data.label, data.elementName, data.id, adjustTextareaHeight])

  // Handle click outside to close category dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (categoryDropdownRef.current && !categoryDropdownRef.current.contains(event.target as HTMLElement)) {
        setIsCategoryDropdownOpen(false)
        setIsHovered(false) // Clear hover state when dropdown closes
      }
    }

    if (isCategoryDropdownOpen) {
      // Use a small delay to avoid immediate closure when opening
      const timeoutId = setTimeout(() => {
        document.addEventListener('mousedown', handleClickOutside, true)
      }, 0)
      
      return () => {
        clearTimeout(timeoutId)
        document.removeEventListener('mousedown', handleClickOutside, true)
      }
    } else {
      // Clear hover state when dropdown closes (e.g., when clicking category button again)
      setIsHovered(false)
    }
  }, [isCategoryDropdownOpen])

  const handleCategoryClick = (e: React.MouseEvent) => {
    e.stopPropagation() // Prevent node click
    setIsCategoryDropdownOpen(!isCategoryDropdownOpen)
  }

  const handleCategorySelect = (category: string) => {
    setIsCategoryDropdownOpen(false)
    setIsHovered(false) // Clear hover state when category is selected
    onCategoryChange(category)
  }

  // Handle rename input
  const handleRenameKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter') {
      // Enter to submit/confirm name
      if (!e.ctrlKey && !e.shiftKey) {
        e.preventDefault()
        const newLabel = e.currentTarget.value.trim()
        if (newLabel) {
          onRename(newLabel)
        } else {
          onRenameCancel()
        }
        // Remove focus from textarea after submit
        if (renameInputRef.current) {
          renameInputRef.current.blur()
        }
      } else {
        // Ctrl+Enter or Shift+Enter to create new line
        // Allow default behavior (insert newline) and adjust height
        setTimeout(adjustTextareaHeight, 0)
      }
    } else if (e.key === 'Escape') {
      e.preventDefault()
      onRenameCancel()
      // Remove focus from textarea after Escape
      if (renameInputRef.current) {
        renameInputRef.current.blur()
      }
    } else {
      // For other keys, adjust height if needed (e.g., when deleting lines)
      setTimeout(adjustTextareaHeight, 0)
    }
  }

  const handleRenameBlur = (e: React.FocusEvent<HTMLTextAreaElement>) => {
    const newLabel = e.currentTarget.value.trim()
    if (newLabel) {
      onRename(newLabel)
    } else {
      onRenameCancel()
    }
  }

  const handleRenameInput = () => {
    adjustTextareaHeight()
  }

  // Handle mouse events for hover state
  const handleMouseEnter = (e: React.MouseEvent) => {
    e.stopPropagation()
    setIsHovered(true)
  }

  const handleMouseLeave = (e: React.MouseEvent) => {
    e.stopPropagation()
    setIsHovered(false)
  }

  // Prevent default context menu on handles during right-click drag
  const handleNodeContextMenu = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement
    // Check if right-click was on a handle (React Flow handles have specific classes)
    const isHandle = target.closest('.react-flow__handle')
    if (isHandle) {
      e.preventDefault()
      e.stopPropagation()
    }
  }

  // Handle right-click down on handles
  const handleNodeMouseDown = (e: React.MouseEvent) => {
    // Detect right-click (button === 2) on handles
    if (e.button === 2) {
      const target = e.target as HTMLElement
      const handleElement = target.closest('.react-flow__handle')
      if (handleElement) {
        e.preventDefault()
        e.stopPropagation()
        // React Flow handles use data-handleid attribute
        const rawHandleId = handleElement.getAttribute('data-handleid') || ''
        if (!rawHandleId) {
          return
        }
        const handleId = rawHandleId.replace(/-(target|source)$/, '-source')
        onHandleRightClick(id, handleId, e.clientX, e.clientY)
      }
    }
  }

  return (
    <div
      className="world-lab-node"
      style={{
        background: nodeBg,
        border: `${selected ? '2px' : '3px'} solid ${borderColor}`,
        borderRadius: '12px',
        padding: '20px 24px',
        minWidth: '160px',
        maxWidth: '200px',
        boxShadow: selected
          ? `0 8px 32px ${shadowColor}, 0 0 0 3px ${categoryColors.glow}`
          : `0 4px 16px ${shadowColor}`,
        position: 'relative',
        backdropFilter: 'blur(10px)',
        fontFamily: "'Inter', 'Noto Sans SC', -apple-system, BlinkMacSystemFont, sans-serif",
        cursor: 'pointer',
        transition: 'border-width 0.1s ease, border-color 0.1s ease, box-shadow 0.1s ease, transform 0.1s ease',
        transform: selected ? 'scale(1.01)' : 'scale(1)',
      }}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onContextMenu={handleNodeContextMenu}
      onMouseDown={handleNodeMouseDown}
    >
      {/* Connection handles - four handles on all sides */}
      {/* Show handles when:
          1. Node is hovered → show all handles
          2. Node is selected → show all handles  
          3. User is dragging a connection:
             - Hide handles on source node (where drag started)
             - Show only compatible handles on target nodes (source handle → target handle, target handle → source handle)
      */}
      {handleConfigs.map((handleConfig) => {
        // Determine if handles should be visible
        let shouldShowHandles = false
        
        if (isHovered || selected) {
          // Show all handles when hovered or selected
          shouldShowHandles = true
        } else if (isConnecting) {
          // When connecting:
          if (connectingFromNodeId === id) {
            // Hide handles on source node
            shouldShowHandles = false
          } else {
            // Show handles on target nodes (React Flow will handle compatibility)
            // Show all handles - React Flow's isValidConnection will filter incompatible ones
            shouldShowHandles = true
          }
        }
        // Otherwise: handles are hidden (opacity: 0, visibility: hidden)
        
        // Determine handle dimensions based on position
        // Horizontal handles (top/bottom): wider width, smaller height
        // Vertical handles (left/right): wider height, smaller width
        const isHorizontal = handleConfig.position === Position.Top || handleConfig.position === Position.Bottom
        const handleWidth = isHorizontal ? '24px' : '8px'
        const handleHeight = isHorizontal ? '8px' : '24px'
        
        return (
          <Handle
            key={handleConfig.id}
            id={handleConfig.id}
            type={handleConfig.type}
            position={handleConfig.position}
            // Don't add onMouseDown here - React Flow needs to handle it for connections to work
            style={{
              background: categoryColors.primary,
              width: handleWidth,
              height: handleHeight,
              border: `2px solid ${theme === 'dark' ? '#1a1a1a' : '#ffffff'}`,
              borderRadius: '4px',
              opacity: shouldShowHandles ? 1 : 0,
              visibility: shouldShowHandles ? 'visible' : 'hidden',
              transition: 'opacity 0.1s ease, visibility 0.1s ease',
              pointerEvents: shouldShowHandles ? 'all' : 'none',
            }}
          />
        )
      })}

      {/* Category color dot - top right corner */}
      <div style={{ position: 'relative' }} ref={categoryDropdownRef}>
        <div
          onClick={handleCategoryClick}
          style={{
            position: 'absolute',
            top: '-12px',
            right: '-12px',
            width: '18px',
            height: '18px',
            borderRadius: '6px',
            background: categoryColors.primary,
            border: `2px solid ${theme === 'dark' ? '#1a1a1a' : '#ffffff'}`,
            cursor: 'pointer',
            zIndex: 10,
            boxShadow: theme === 'dark'
              ? '0 2px 8px rgba(0, 0, 0, 0.3)'
              : 'none',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = 'scale(1.15)'
            e.currentTarget.style.transition = 'transform 0.2s ease'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'scale(1)'
          }}
        />

        {/* Category dropdown */}
        {isCategoryDropdownOpen && (
          <div
            onClick={(e) => e.stopPropagation()}
            onMouseEnter={() => setIsHovered(false)} // Clear hover when mouse enters dropdown
            onMouseLeave={() => setIsHovered(false)} // Ensure hover is cleared when mouse leaves dropdown
            style={{
              position: 'absolute',
              top: '0',
              left: '100%',
              marginLeft: '8px',
              background: theme === 'dark' ? 'rgba(30, 30, 30, 0.98)' : 'rgba(255, 255, 255, 0.98)',
              border: `1.5px solid ${theme === 'dark' ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.08)'}`,
              borderRadius: '12px',
              boxShadow: theme === 'dark'
                ? '0 8px 32px rgba(0, 0, 0, 0.4)'
                : '0 8px 32px rgba(0, 0, 0, 0.15)',
              zIndex: 1000,
              minWidth: '160px',
              padding: '4px',
              backdropFilter: 'blur(20px)',
            }}
          >
            {CATEGORIES.map((cat) => {
              const catColors = getCategoryColor(cat, theme)
              const isSelected = (data.category || 'Uncategorized') === cat
              return (
                <div
                  key={cat}
                  onClick={(e) => {
                    e.stopPropagation()
                    handleCategorySelect(cat)
                  }}
                  style={{
                    padding: '10px 14px',
                    cursor: 'pointer',
                    color: theme === 'dark' ? '#E8E8E8' : '#1A1A1A',
                    fontSize: '14px',
                    fontWeight: 400,
                    backgroundColor: isSelected 
                      ? (theme === 'dark' ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.05)')
                      : 'transparent',
                    borderRadius: '8px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = theme === 'dark' 
                      ? 'rgba(255, 255, 255, 0.04)' 
                      : 'rgba(0, 0, 0, 0.03)'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = isSelected
                      ? (theme === 'dark' ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.05)')
                      : 'transparent'
                  }}
                >
                  <div
                    style={{
                      width: '12px',
                      height: '12px',
                      borderRadius: '2px',
                      background: catColors.primary,
                      border: `1px solid ${theme === 'dark' ? 'rgba(255, 255, 255, 0.2)' : 'rgba(0, 0, 0, 0.2)'}`,
                      flexShrink: 0,
                    }}
                  />
                  <span>{cat}</span>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Main label - inline edit when renaming */}
      {/* Always render label div (hidden when renaming) so we can measure its width */}
      <div
        ref={labelRef}
        className="node-label"
        onDoubleClick={(e) => {
          e.stopPropagation()
          onStartRename()
        }}
        style={{
          fontSize: '16px',
          fontWeight: 400,
          color: nodeTextColor,
          marginBottom: data.elementName && data.elementName !== data.label ? '6px' : '0',
          lineHeight: '1.4',
          letterSpacing: '-0.2px',
          cursor: 'text',
          display: isRenaming ? 'none' : 'inline-block',
          height: '22px', // Match input height
          boxSizing: 'border-box',
        }}
      >
        {data.label || data.elementName || data.id}
      </div>
      {/* Textarea field for renaming (expandable) */}
      {isRenaming && (
        <textarea
          ref={renameInputRef}
          defaultValue={data.label || data.elementName || data.id}
          onKeyDown={handleRenameKeyDown}
          onInput={handleRenameInput}
          onBlur={(e) => {
            setIsRenameInputFocused(false)
            handleRenameBlur(e)
          }}
          onFocus={() => {
            setIsRenameInputFocused(true)
            // Adjust height on focus to ensure proper initial size
            setTimeout(adjustTextareaHeight, 0)
          }}
          style={{
            width: '100%',
            minWidth: '100%',
            maxWidth: '100%',
            minHeight: '22px',
            fontSize: '16px', // Match label font size
            fontWeight: 400,
            color: nodeTextColor,
            background: theme === 'dark' ? 'rgba(40, 40, 40, 0.8)' : 'rgba(248, 249, 250, 0.9)',
            border: isRenameInputFocused 
              ? `1px solid ${theme === 'dark' ? 'rgba(255, 255, 255, 0.2)' : 'rgba(0, 0, 0, 0.2)'}` // Thin grey border when focused
              : `2px solid ${hexToRgba(categoryColors.primary, 0.5)}`, // Less bright border (50% opacity) when not focused
            borderRadius: '4px', // Less rounded corners
            padding: '4px 10px', // Add vertical padding for better textarea appearance
            outline: 'none',
            marginBottom: data.elementName && data.elementName !== data.label ? '6px' : '0',
            lineHeight: '1.4',
            letterSpacing: '-0.2px',
            fontFamily: "'Inter', 'Noto Sans SC', -apple-system, BlinkMacSystemFont, sans-serif",
            boxShadow: isRenameInputFocused 
              ? 'none' // No shadow when focused
              : `inset 0 0 0 1px ${categoryColors.primary}20`,
            boxSizing: 'border-box',
            verticalAlign: 'top', // Align with label
            resize: 'none', // Disable manual resize, use auto-resize instead
            overflow: 'hidden', // Hide scrollbar, textarea will auto-expand
            wordWrap: 'break-word',
            whiteSpace: 'pre-wrap', // Preserve line breaks and wrap text
          }}
          onClick={(e) => e.stopPropagation()}
          rows={1}
        />
      )}

      {/* Element name (if different from label) */}
      {data.elementName && data.elementName !== data.label && (
        <div
          style={{
            fontSize: '14px',
            color: secondaryTextColor,
            fontWeight: 'normal',
            lineHeight: '1.4',
            opacity: 0.8,
            marginBottom: previewText ? '8px' : '0',
          }}
        >
          {data.elementName}
        </div>
      )}

      {/* Preview text */}
      {previewText && (
        <div
          style={{
            fontSize: '12px',
            color: secondaryTextColor,
            fontWeight: 'normal',
            lineHeight: '1.4',
            opacity: 0.7,
            marginTop: '8px',
            overflow: 'hidden',
            display: '-webkit-box',
            WebkitLineClamp: 2, // Max 2 lines
            WebkitBoxOrient: 'vertical',
            wordBreak: 'break-word',
            textOverflow: 'ellipsis',
          }}
        >
          {previewText}
        </div>
      )}

    </div>
  )
}

// Define nodeTypes outside component to prevent React Flow warning
const nodeTypes: NodeTypes = {
  custom: CustomNode,
}

// Custom Bezier Edge with curve offset support
// Keeps source and target points fixed, only offsets control points for natural curve bending
function CustomBezierEdge({ 
  id, 
  sourceX, 
  sourceY, 
  targetX, 
  targetY, 
  sourcePosition, 
  targetPosition, 
  style, 
  markerEnd, 
  pathOptions 
}: any) {
  const offset = pathOptions?.offset || 0
  
  // Calculate direction vector
  const dx = targetX - sourceX
  const dy = targetY - sourceY
  const length = Math.sqrt(dx * dx + dy * dy)
  
  if (length === 0 || offset === 0) {
    // No offset, use standard bezier path
    const [edgePath] = getBezierPath({
      sourceX,
      sourceY,
      targetX,
      targetY,
      sourcePosition,
      targetPosition,
    })
    return (
      <BaseEdge
        id={id}
        path={edgePath}
        style={style}
        markerEnd={markerEnd}
      />
    )
  }
  
  // Calculate perpendicular unit vector (normal to the edge direction)
  const perpX = -dy / length
  const perpY = dx / length
  
  // Calculate control point positions (at 38% and 62% along the path for more pronounced curve)
  // Apply offset perpendicular to create curve bending effect
  // Increase offset magnitude for more visible curve
  const curveMultiplier = 2.0 // Multiply offset for more pronounced curve
  const controlOffsetX = perpX * offset * curveMultiplier
  const controlOffsetY = perpY * offset * curveMultiplier
  
  // First control point (closer to source, at ~38% of path - moved closer to center for more curve)
  const cp1X = sourceX + dx * 0.38 + controlOffsetX
  const cp1Y = sourceY + dy * 0.38 + controlOffsetY
  
  // Second control point (closer to target, at ~62% of path - moved closer to center for more curve)
  const cp2X = sourceX + dx * 0.62 + controlOffsetX
  const cp2Y = sourceY + dy * 0.62 + controlOffsetY
  
  // Build custom Bezier path: M (move to source), C (cubic bezier curve)
  // Format: M x,y C cp1x,cp1y cp2x,cp2y x,y
  const edgePath = `M ${sourceX},${sourceY} C ${cp1X},${cp1Y} ${cp2X},${cp2Y} ${targetX},${targetY}`
  
  return (
    <BaseEdge
      id={id}
      path={edgePath}
      style={style}
      markerEnd={markerEnd}
    />
  )
}

// Define edgeTypes outside component to prevent React Flow warning
const edgeTypes: EdgeTypes = {
  customBezier: CustomBezierEdge,
}

// History entry for undo/redo
interface HistoryEntry {
  nodes: Node[]
  edges: Edge[]
}

function WorldLabCanvasInner({
  labName,
  initialNodes,
  initialEdges,
  onNodeDoubleClick,
  onNodeClick,
  onNodesChange,
  onEdgesChange,
  onCloseNodeEditor,
  onUndoRedoReady,
  nodeDocumentContent,
  onNodeDocumentSave,
}: WorldLabCanvasProps) {
  const { theme } = useTheme()
  const [nodes, setNodes, onNodesChangeInner] = useNodesState(
    initialNodes.map((node) => ({
      id: node.id,
      type: 'custom',
      position: node.position,
      data: {
        label: node.label,
        category: node.category,
        elementName: node.elementName,
        ...node.data,
      },
    }))
  )
  const [edges, setEdges, onEdgesChangeInner] = useEdgesState(
    initialEdges.map((edge) => {
      const edgeData = (edge as any).data || {}
      const sourceHandle = edge.sourceHandle ?? edgeData.sourceHandle
      const targetHandle = edge.targetHandle ?? edgeData.targetHandle
      return {
        id: edge.id,
        source: edge.source,
        target: edge.target,
        type: edge.type || 'smoothstep',
        label: edge.label,
        animated: edge.animated,
        style: edge.style,
        data: edgeData,
        sourceHandle: sourceHandle?.replace(/-target$/, '-source'),
        targetHandle: targetHandle?.replace(/-source$/, '-target'),
      }
    })
  )
  const [renamingNodeId, setRenamingNodeId] = useState<string | null>(null)
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const reactFlowInstance = useRef<ReactFlowInstance | null>(null)
  const viewportSaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const savedViewportRef = useRef<{ x: number; y: number; zoom: number } | null>(null)
  
  // Track previous node positions to detect position changes
  const prevNodePositionsRef = useRef<Map<string, { x: number; y: number }>>(new Map())
  
  // Refs to store latest nodes/edges for cleanup on unmount
  const nodesRef = useRef<Node[]>(nodes)
  const edgesRef = useRef<Edge[]>(edges)
  
  // Update refs whenever nodes/edges change
  useEffect(() => {
    nodesRef.current = nodes
  }, [nodes])
  
  useEffect(() => {
    edgesRef.current = edges
  }, [edges])

  
  // Track if we've refreshed node internals after WorldLab hydrate
  const didRefreshNodeInternalsRef = useRef(false)
  
  // Wait for ReactFlow nodes to initialize before refreshing node internals
  // (Edge labels depend on node dimensions, so updating node internals refreshes edge labels)
  const nodesInitialized = useNodesInitialized()
  const updateNodeInternals = useUpdateNodeInternals()
  
  // Floating editor state
  const [editingNodeId, setEditingNodeId] = useState<string | null>(null)
  const [editorPosition, setEditorPosition] = useState<{ x: number; y: number } | null>(null)
  const editorRef = useRef<HTMLDivElement>(null)
  const canvasContainerRef = useRef<HTMLDivElement>(null)
  
  // Connection dragging state - track when user is dragging a connection
  const [isConnecting, setIsConnecting] = useState(false)
  const [connectingFromNodeId, setConnectingFromNodeId] = useState<string | null>(null)
  
  // Track if next connection should be directed (right-click drag)
  const [isDirectingEdge, setIsDirectingEdge] = useState(false)
  
  // Track right-click drag state for custom directed edge creation
  const rightClickDragStateRef = useRef<{
    isDragging: boolean
    sourceNodeId: string | null
    sourceHandleId: string | null
    startX: number
    startY: number
  }>({
    isDragging: false,
    sourceNodeId: null,
    sourceHandleId: null,
    startX: 0,
    startY: 0,
  })

  // Track drag preview line position (in screen coordinates relative to canvas)
  const [dragPreviewPosition, setDragPreviewPosition] = useState<{ x: number; y: number } | null>(null)
  
  // Helper function to clean TipTap content by removing empty text nodes
  const cleanTipTapContent = useCallback((content: any): any => {
    if (!content || typeof content !== 'object') return null
    
    // If it's a doc node, clean its content recursively
    if (content.type === 'doc' && Array.isArray(content.content)) {
      const cleanedContent = content.content
        .map((node: any) => cleanTipTapContent(node))
        .filter((node: any) => node !== null)
      
      // Ensure at least one paragraph exists
      if (cleanedContent.length === 0) {
        return { type: 'doc', content: [{ type: 'paragraph' }] }
      }
      
      return {
        ...content,
        content: cleanedContent
      }
    }
    
    // If it's a node with content array, clean recursively
    if (content.content && Array.isArray(content.content)) {
      const cleanedContent = content.content
        .map((node: any) => cleanTipTapContent(node))
        .filter((node: any) => node !== null)
      
      // For paragraph nodes, if all content is removed, return empty paragraph
      if (content.type === 'paragraph' && cleanedContent.length === 0) {
        return { type: 'paragraph' }
      }
      
      // If no content remains and it's not a paragraph, return null
      if (cleanedContent.length === 0 && content.type !== 'paragraph') {
        return null
      }
      
      return {
        ...content,
        content: cleanedContent
      }
    }
    
    // If it's a text node, ensure it has non-empty text
    if (content.type === 'text') {
      if (!content.text || typeof content.text !== 'string' || content.text.trim() === '') {
        return null
      }
      return content
    }
    
    // Return other node types as-is
    return content
  }, [])

  // Parse node document content
  const parsedNodeContent = useMemo(() => {
    if (!nodeDocumentContent) return ''
    try {
      const parsed = JSON.parse(nodeDocumentContent)
      const cleaned = cleanTipTapContent(parsed)
      return cleaned || ''
    } catch {
      return ''
    }
  }, [nodeDocumentContent, cleanTipTapContent])
  
  // Create TipTap editor for floating editor
  const floatingEditor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({
        placeholder: 'Start typing...',
      }),
    ],
    content: parsedNodeContent || '',
    editorProps: {
      attributes: {
        class: 'prose prose-sm max-w-none focus:outline-none',
      },
    },
  })
  
  // Update editor content when nodeDocumentContent changes
  useEffect(() => {
    if (floatingEditor && parsedNodeContent && editingNodeId) {
      try {
        // Clean content before setting to avoid empty text node errors
        const cleanedContent = cleanTipTapContent(parsedNodeContent)
        if (cleanedContent) {
          floatingEditor.commands.setContent(cleanedContent)
        } else {
          floatingEditor.commands.clearContent()
        }
        // Focus the editor after content is set (only if editor is mounted)
        setTimeout(() => {
          if (floatingEditor && !floatingEditor.isDestroyed && floatingEditor.view) {
            try {
              floatingEditor.commands.focus()
            } catch (error) {
              // Editor view not ready yet, ignore
            }
          }
        }, 100)
      } catch (error) {
        // Fallback to empty content if there's an error
        floatingEditor.commands.clearContent()
        setTimeout(() => {
          if (floatingEditor && !floatingEditor.isDestroyed && floatingEditor.view) {
            try {
              floatingEditor.commands.focus()
            } catch (error) {
              // Editor view not ready yet, ignore
            }
          }
        }, 100)
      }
    }
  }, [floatingEditor, parsedNodeContent, editingNodeId, cleanTipTapContent])
  
  // Auto-focus editor when editingNodeId changes (node double-clicked)
  useEffect(() => {
    if (floatingEditor && editingNodeId) {
      // Focus the editor when a node is opened for editing (only if editor is mounted)
      setTimeout(() => {
        if (floatingEditor && !floatingEditor.isDestroyed && floatingEditor.view) {
          try {
            floatingEditor.commands.focus()
          } catch (error) {
            // Editor view not ready yet, ignore
          }
        }
      }, 200)
    }
  }, [floatingEditor, editingNodeId])
  
  // Save editor content when it changes
  useEffect(() => {
    if (!floatingEditor || !editingNodeId || !onNodeDocumentSave) return
    
    const handleUpdate = () => {
      const content = floatingEditor.getJSON()
      onNodeDocumentSave(editingNodeId, JSON.stringify(content))
    }
    
    floatingEditor.on('update', handleUpdate)
    
    return () => {
      floatingEditor.off('update', handleUpdate)
    }
  }, [floatingEditor, editingNodeId, onNodeDocumentSave])
  
  // Cleanup editor on unmount
  useEffect(() => {
    return () => {
      if (floatingEditor && !floatingEditor.isDestroyed) {
        floatingEditor.destroy()
      }
    }
  }, [floatingEditor])

  // Undo/Redo state
  const [history, setHistory] = useState<HistoryEntry[]>([])
  const [historyIndex, setHistoryIndex] = useState(-1)
  const isUndoingRef = useRef(false)
  const historyInitializedRef = useRef(false)

  // Context menu state
  const [contextMenu, setContextMenu] = useState<{
    x: number
    y: number
    type: 'node' | 'edge' | 'pane'
    nodeId?: string
    edgeId?: string
  } | null>(null)

  // Edge editing state
  const [editingEdgeId, setEditingEdgeId] = useState<string | null>(null)

  // Inline edge label editing state
  const [inlineEditingEdgeId, setInlineEditingEdgeId] = useState<string | null>(null)
  const [inlineEditingPosition, setInlineEditingPosition] = useState<{ x: number; y: number } | null>(null)
  const inlineEdgeInputRef = useRef<HTMLTextAreaElement>(null)
  
  // Track hover state for edge labels
  const [hoveredEdgeLabelId, setHoveredEdgeLabelId] = useState<string | null>(null)

  // Keyboard shortcuts modal state
  const [showShortcutsModal, setShowShortcutsModal] = useState(false)

  // Normalize handle IDs to match expected source/target suffix
  const normalizeHandleId = useCallback((handleId: string | null | undefined, expected: 'source' | 'target') => {
    if (!handleId) return undefined
    if (expected === 'source' && handleId.endsWith('-target')) {
      return handleId.replace(/-target$/, '-source')
    }
    if (expected === 'target' && handleId.endsWith('-source')) {
      return handleId.replace(/-source$/, '-target')
    }
    return handleId
  }, [])

  // Normalize edge to match state type
  const normalizeEdge = useCallback((edge: Edge) => {
    const edgeData = (edge as any).data
    return {
      id: edge.id,
      source: edge.source,
      target: edge.target,
      type: typeof edge.type === 'string' ? edge.type : 'default',
      label: typeof edge.label === 'string' ? edge.label : undefined,
      animated: edge.animated ?? undefined,
      style: edge.style,
      data: edgeData,
      sourceHandle: normalizeHandleId(edge.sourceHandle, 'source'),
      targetHandle: normalizeHandleId(edge.targetHandle, 'target'),
    }
  }, [normalizeHandleId])

  // Normalize existing edges once to fix any invalid handle IDs
  const didNormalizeEdgesRef = useRef(false)
  useEffect(() => {
    if (didNormalizeEdgesRef.current) return
    setEdges((eds) => eds.map((edge) => normalizeEdge(edge)))
    didNormalizeEdgesRef.current = true
  }, [setEdges, normalizeEdge])

  // Convert ReactFlow nodes back to WorldLabNode format
  const convertToWorldLabNodes = useCallback((rfNodes: Node[]): WorldLabNode[] => {
    return rfNodes.map((node) => ({
      id: node.id,
      label: typeof node.data.label === 'string' ? node.data.label : node.id,
      category: typeof node.data.category === 'string' ? node.data.category : undefined,
      elementName: typeof node.data.elementName === 'string' ? node.data.elementName : undefined,
      position: node.position,
      data: node.data,
    }))
  }, [])

  // Convert ReactFlow edges back to WorldLabEdge format
  const convertToWorldLabEdges = useCallback((rfEdges: Edge[]): WorldLabEdge[] => {
    return rfEdges.map((edge) => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      type: typeof edge.type === 'string' ? edge.type : undefined,
      label: typeof edge.label === 'string' ? edge.label : undefined,
      animated: edge.animated,
      style: edge.style,
      sourceHandle: edge.sourceHandle ?? undefined,
      targetHandle: edge.targetHandle ?? undefined,
      data: (edge as any).data,
    }))
  }, [])

  // Note: Node and edge changes are handled by onNodesChangeInner and onEdgesChangeInner
  // which are provided by useNodesState and useEdgesState hooks
  // We sync changes through the saveNodes and saveEdges callbacks

  // Calculate optimal handle positions based on shortest path between two nodes
  // This ensures edges always use the shortest distance between nodes
  // Now considers all 4 sides for both source and target handles (4x4 = 16 combinations)
  const calculateOptimalHandles = useCallback((sourceNode: Node, targetNode: Node): { sourceHandle: string; targetHandle: string } => {
    const sourceX = sourceNode.position.x
    const sourceY = sourceNode.position.y
    const targetX = targetNode.position.x
    const targetY = targetNode.position.y
    
    // Get node dimensions (approximate if not available)
    const sourceWidth = (sourceNode as any).measured?.width || (sourceNode as any).width || 200
    const sourceHeight = (sourceNode as any).measured?.height || (sourceNode as any).height || 100
    const targetWidth = (targetNode as any).measured?.width || (targetNode as any).width || 200
    const targetHeight = (targetNode as any).measured?.height || (targetNode as any).height || 100
    
    // Calculate handle positions on node edges - ALL 4 sides for both source and target
    // Source handles (outgoing) - all 4 sides
    const sourceHandles = {
      'top-source': { x: sourceX + sourceWidth / 2, y: sourceY },
      'bottom-source': { x: sourceX + sourceWidth / 2, y: sourceY + sourceHeight },
      'left-source': { x: sourceX, y: sourceY + sourceHeight / 2 },
      'right-source': { x: sourceX + sourceWidth, y: sourceY + sourceHeight / 2 },
    }
    
    // Target handles (incoming) - all 4 sides
    const targetHandles = {
      'top-target': { x: targetX + targetWidth / 2, y: targetY },
      'bottom-target': { x: targetX + targetWidth / 2, y: targetY + targetHeight },
      'left-target': { x: targetX, y: targetY + targetHeight / 2 },
      'right-target': { x: targetX + targetWidth, y: targetY + targetHeight / 2 },
    }
    
    // Calculate distance for each valid handle combination (4x4 = 16 combinations)
    const combinations: Array<{ 
      sourceHandle: string
      targetHandle: string
      distance: number
    }> = []
    
    // Try all valid combinations
    Object.entries(sourceHandles).forEach(([sourceHandleId, sourcePos]) => {
      Object.entries(targetHandles).forEach(([targetHandleId, targetPos]) => {
        // Calculate Euclidean distance
        const dx = targetPos.x - sourcePos.x
        const dy = targetPos.y - sourcePos.y
        const distance = Math.sqrt(dx * dx + dy * dy)
        
        combinations.push({
          sourceHandle: sourceHandleId,
          targetHandle: targetHandleId,
          distance,
        })
      })
    })
    
    // Find the combination with the shortest distance
    const best = combinations.reduce((min, combo) => {
      return combo.distance < min.distance ? combo : min
    })
    
    return {
      sourceHandle: best.sourceHandle,
      targetHandle: best.targetHandle,
    }
  }, [])

  // Auto-adjust edge handles when nodes are moved
  // Note: saveEdges and saveNodes will be defined later, so we use refs to avoid dependency issues
  const saveEdgesRef = useRef<((edges: Edge[], nodes?: Node[]) => void) | null>(null)
  const saveNodesRef = useRef<((nodes: Node[]) => void) | null>(null)
  
  const adjustEdgeHandlesOnNodeMove = useCallback((updatedNodes: Node[], movedNodeIds: Set<string>) => {
    setEdges((currentEdges) => {
      let hasChanges = false
      const updatedEdges = currentEdges.map((edge) => {
        const sourceNode = updatedNodes.find((n) => n.id === edge.source)
        const targetNode = updatedNodes.find((n) => n.id === edge.target)
        
        if (!sourceNode || !targetNode) {
          return edge
        }
        
        // Only update edges connected to moved nodes
        // This ensures that when moving Z, edges connected to Z will update,
        // and for the connected nodes (like X), we'll always choose the shortest path handle
        // even if that handle is already used by other edges
        const sourceMoved = movedNodeIds.has(edge.source)
        const targetMoved = movedNodeIds.has(edge.target)
        
        if (!sourceMoved && !targetMoved) {
          // Neither node moved, skip this edge
          return edge
        }
        
        // Calculate optimal handles based on current node positions (shortest path)
        // This will always choose the shortest path, regardless of whether handles are already in use
        const optimalHandles = calculateOptimalHandles(sourceNode, targetNode)
        
        // Only update if handles have changed
        if (edge.sourceHandle !== optimalHandles.sourceHandle || edge.targetHandle !== optimalHandles.targetHandle) {
          hasChanges = true
          const edgeData = (edge as any).data || {}
          return {
            ...edge,
            sourceHandle: optimalHandles.sourceHandle,
            targetHandle: optimalHandles.targetHandle,
            data: {
              ...edgeData,
              sourceHandle: optimalHandles.sourceHandle,
              targetHandle: optimalHandles.targetHandle,
            },
          }
        }
        
        return edge
      })
      
      if (hasChanges && saveEdgesRef.current) {
        // Save updated edges
        setTimeout(() => {
          saveEdgesRef.current!(updatedEdges, updatedNodes)
        }, 100)
      }
      
      return updatedEdges
    })
  }, [setEdges, calculateOptimalHandles])

  // Wrapper for onNodesChangeInner to auto-adjust edge handles when nodes are moved
  const onNodesChangeWithHandleAdjustment = useCallback(
    (changes: any[]) => {
      // Call the original handler first
      onNodesChangeInner(changes)
      
      // Check if any changes involve position updates
      const hasPositionChanges = changes.some(
        (change) => change.type === 'position' && change.dragging === false
      )
      
      if (hasPositionChanges) {
        // Get current nodes after the change
        setNodes((currentNodes) => {
          // Track which nodes actually moved
          const movedNodeIds = new Set<string>()
          const currentPositions = new Map<string, { x: number; y: number }>()
          
          currentNodes.forEach((node) => {
            const prevPos = prevNodePositionsRef.current.get(node.id)
            const currentPos = { x: node.position.x, y: node.position.y }
            currentPositions.set(node.id, currentPos)
            
            if (!prevPos || prevPos.x !== currentPos.x || prevPos.y !== currentPos.y) {
              movedNodeIds.add(node.id)
            }
          })
          
          // Update ref with current positions
          prevNodePositionsRef.current = currentPositions
          
          // Adjust edge handles if any nodes moved
          if (movedNodeIds.size > 0) {
            // Use setTimeout to ensure nodes state is updated first
            setTimeout(() => {
              adjustEdgeHandlesOnNodeMove(currentNodes, movedNodeIds)
            }, 0)
            
            // Save nodes to persist position changes to backend
            // This ensures positions are saved when switching away from WorldLab
            if (saveNodesRef.current) {
              saveNodesRef.current(currentNodes)
            }
          }
          
          return currentNodes
        })
      }
    },
    [onNodesChangeInner, setNodes, adjustEdgeHandlesOnNodeMove]
  )

  // Track previous labName to detect project changes (external data source changes)
  const prevLabNameRef = useRef<string>(labName)
  // Store latest props in refs so we can access them in useEffect without adding to deps
  const initialNodesRef = useRef<WorldLabNode[]>(initialNodes)
  const initialEdgesRef = useRef<WorldLabEdge[]>(initialEdges)
  
  // Update refs on every render (but don't trigger sync)
  initialNodesRef.current = initialNodes
  initialEdgesRef.current = initialEdges

  // Sync nodes and edges ONLY when labName changes (external data source change)
  // This ensures we only sync when switching projects, not when user edits the graph
  // Graph editing is the single source of truth - we never overwrite user edits
  useEffect(() => {
    const labNameChanged = prevLabNameRef.current !== labName
    
    if (labNameChanged) {
      // Lab name changed = external data source changed = WorldLab hydrate started
      prevLabNameRef.current = labName
      // Reset refresh flag when switching projects
      didRefreshNodeInternalsRef.current = false
      
      // Sync memory state with external data source (from refs, which have latest props)
      const newNodes = initialNodesRef.current.map((node) => ({
        id: node.id,
        type: 'custom' as const,
        position: node.position,
        data: {
          label: node.label,
          category: node.category,
          elementName: node.elementName,
          ...node.data,
        },
      }))
      setNodes(newNodes)

      const newEdges = initialEdgesRef.current.map((edge) => {
        const edgeData = (edge as any).data || {}
        const sourceHandle = edge.sourceHandle ?? edgeData.sourceHandle
        const targetHandle = edge.targetHandle ?? edgeData.targetHandle
        return {
          id: edge.id,
          source: edge.source,
          target: edge.target,
          type: edge.type || 'smoothstep',
          label: edge.label,
          animated: edge.animated,
          style: edge.style,
          data: edgeData,
          sourceHandle: sourceHandle?.replace(/-target$/, '-source'),
          targetHandle: targetHandle?.replace(/-source$/, '-target'),
        }
      })
      setEdges(newEdges)
    }
    // Only depend on labName - do NOT depend on initialNodes/initialEdges/edges
    // because they change when user edits (via onNodesChange/onEdgesChange callbacks),
    // which would cause unwanted syncs that overwrite user edits
    // We use refs to access latest props without adding them to deps
  }, [labName, setNodes, setEdges])

  // ✅ Refresh node internals AFTER ReactFlow nodes initialize (WorldLab hydrate completes)
  // This is the ONLY time we refresh internals - ensures edge labels render correctly
  // Edge labels depend on node dimensions, so updating node internals refreshes edge labels
  // 
  // ❌ DO NOT refresh when:
  // - edges/nodes state changes (user editing, connecting, etc.)
  // - during render
  // - user is dragging/typing/connecting
  //
  // ✅ ONLY refresh when:
  // - WorldLab enters/hydrates (labName changes) AND nodes are initialized
  useEffect(() => {
    if (!nodesInitialized) return
    if (didRefreshNodeInternalsRef.current) return

    // Refresh all node internals to ensure edge labels render correctly
    // Edge labels calculate position based on node dimensions, so updating node internals
    // will trigger edge label recalculation
    // Use nodes from state (via closure) but don't add to deps to avoid refresh on every node change
    nodes.forEach((node) => {
      updateNodeInternals(node.id)
    })

    didRefreshNodeInternalsRef.current = true
    // Only depend on nodesInitialized and labName - do NOT depend on nodes/edges
    // because they change when user edits, which would cause unwanted refreshes
  }, [nodesInitialized, labName, updateNodeInternals])

  // Initialize previous positions on mount
  useEffect(() => {
    const initialPositions = new Map<string, { x: number; y: number }>()
    nodes.forEach((node) => {
      initialPositions.set(node.id, { x: node.position.x, y: node.position.y })
    })
    prevNodePositionsRef.current = initialPositions
  }, []) // Only run on mount

  // Save nodes with debounce - persists to backend
  const saveNodes = useCallback(
    (nodesToSave: Node[]) => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current)
      }
      saveTimeoutRef.current = setTimeout(async () => {
        const worldLabNodes = convertToWorldLabNodes(nodesToSave)
        
        // Update local state first for immediate UI feedback
        if (onNodesChange) {
          onNodesChange(worldLabNodes)
        }
        
        // Persist nodes to backend (positions and metadata)
        try {
          await worldLabApi.saveNodePositions(labName, worldLabNodes)
        } catch (error) {
          // Error handling
        }
      }, 500)
    },
    [convertToWorldLabNodes, labName, onNodesChange]
  )

  // Save edges with debounce - also saves current node positions and metadata
  // FIXED: Now accepts nodes parameter to avoid closure stale state issue
  const saveEdges = useCallback(
    (edgesToSave: Edge[], nodesToSave?: Node[]) => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current)
      }
      saveTimeoutRef.current = setTimeout(async () => {
        const worldLabEdges = convertToWorldLabEdges(edgesToSave)
        
        // Use the nodes that were passed in (or current state if not provided)
        // This ensures we don't use stale closure state
        const currentNodesSnapshot = nodesToSave ?? nodes
        const worldLabNodes = convertToWorldLabNodes(currentNodesSnapshot)
        const nodePositions: Record<string, { x: number; y: number }> = {}
        const nodeMetadata: Record<string, { label?: string; category?: string; elementName?: string }> = {}
        
        worldLabNodes.forEach(node => {
          nodePositions[node.id] = node.position
          nodeMetadata[node.id] = {
            label: node.label,
            category: node.category,
            elementName: node.elementName,
          }
        })
        
        try {
          // Save edges along with current node positions and metadata
          await worldLabApi.saveEdges(labName, worldLabEdges, nodePositions, nodeMetadata)
          if (onEdgesChange) {
            onEdgesChange(worldLabEdges)
          }
        } catch (error) {
          // Error handling
        }
      }, 500)
    },
    [convertToWorldLabEdges, convertToWorldLabNodes, labName, nodes, onEdgesChange]
  )
  
  // Update refs so adjustEdgeHandlesOnNodeMove can use them
  saveEdgesRef.current = saveEdges
  saveNodesRef.current = saveNodes

  // Store refs for cleanup access
  const labNameRef = useRef(labName)
  const convertToWorldLabNodesRef = useRef(convertToWorldLabNodes)
  const onNodesChangeRef = useRef(onNodesChange)
  
  // Update refs when values change
  useEffect(() => {
    labNameRef.current = labName
  }, [labName])
  
  useEffect(() => {
    convertToWorldLabNodesRef.current = convertToWorldLabNodes
  }, [convertToWorldLabNodes])
  
  useEffect(() => {
    onNodesChangeRef.current = onNodesChange
  }, [onNodesChange])

  // Cleanup effect: flush pending saves when component unmounts
  // This ensures node positions are saved even if user switches away before debounce completes
  useEffect(() => {
    return () => {
      // Flush any pending saves before unmounting
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current)
        saveTimeoutRef.current = null
      }
      
      // Get current nodes from ref (always has latest values)
      const currentNodesSnapshot = nodesRef.current
      
      // Save nodes immediately (no debounce) - convert and save directly
      const worldLabNodes = convertToWorldLabNodesRef.current(currentNodesSnapshot)
      if (onNodesChangeRef.current) {
        onNodesChangeRef.current(worldLabNodes)
      }
      // Save to backend synchronously (fire and forget)
      worldLabApi.saveNodePositions(labNameRef.current, worldLabNodes).catch((error) => {
        console.error('[WorldLab] Failed to save nodes on unmount:', error)
      })
    }
    // Empty deps - only run cleanup on unmount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Note: ReactFlow's useNodesState and useEdgesState handle changes internally
  // We sync state through onNodesChangeInner and onEdgesChangeInner callbacks

  // Add to history for undo/redo (MUST be defined before other handlers use it)
  const addToHistory = useCallback(
    (newNodes: Node[], newEdges: Edge[]) => {
      if (isUndoingRef.current) {
        return
      }

      // Check if only selection state changed (compare edges excluding selected property)
      const currentEdgesWithoutSelection = edges.map((edge: any) => {
        const { selected, ...rest } = edge
        return rest
      })
      const newEdgesWithoutSelection = newEdges.map((edge: any) => {
        const { selected, ...rest } = edge
        return rest
      })
      const edgesEqual = JSON.stringify(currentEdgesWithoutSelection) === JSON.stringify(newEdgesWithoutSelection)
      
      // Check if only selection state changed for nodes
      const currentNodesWithoutSelection = nodes.map((node: any) => {
        const { selected, ...rest } = node
        return rest
      })
      const newNodesWithoutSelection = newNodes.map((node: any) => {
        const { selected, ...rest } = node
        return rest
      })
      const nodesEqual = JSON.stringify(currentNodesWithoutSelection) === JSON.stringify(newNodesWithoutSelection)
      
      // If only selection changed, don't add to history
      if (edgesEqual && nodesEqual) {
        return
      }

      // Strip selected property from edges and nodes before saving to history
      const edgesWithoutSelection = newEdges.map((edge: any) => {
        const { selected, ...rest } = edge
        return rest
      })
      const nodesWithoutSelection = newNodes.map((node: any) => {
        const { selected, ...rest } = node
        return rest
      })

      const newEntry: HistoryEntry = {
        nodes: JSON.parse(JSON.stringify(nodesWithoutSelection)),
        edges: JSON.parse(JSON.stringify(edgesWithoutSelection)),
      }

      setHistory((prev) => {
        // Remove future history if we're not at the end
        const newHistory = prev.slice(0, historyIndex + 1)
        // Add new entry
        newHistory.push(newEntry)
        // Limit history to 50 entries
        if (newHistory.length > 50) {
          newHistory.shift()
        }
        const finalLength = newHistory.length
        // Update historyIndex to point to the new entry (last index in array = length - 1)
        setHistoryIndex(finalLength - 1)
        return newHistory
      })
    },
    [historyIndex, edges, nodes]
  )

  // Undo function
  const undo = useCallback(() => {
    if (historyIndex <= 0 || history.length === 0) {
      return
    }

    const prevIndex = historyIndex - 1
    
    if (prevIndex < 0 || prevIndex >= history.length) {
      return
    }

    const prevEntry = history[prevIndex]
    if (!prevEntry || !prevEntry.nodes || !prevEntry.edges) {
      return
    }

    isUndoingRef.current = true
    
    // Preserve current selection state when restoring from history
    const currentSelectionMap = new Map<string, boolean>()
    edges.forEach((edge: any) => {
      if ('selected' in edge && edge.selected !== undefined) {
        currentSelectionMap.set(edge.id, edge.selected)
      }
    })
    
    const restoredEdges = prevEntry.edges.map((edge: any) => {
      const currentSelected = currentSelectionMap.get(edge.id)
      return currentSelected !== undefined ? { ...edge, selected: currentSelected } : edge
    })
    
    setNodes(prevEntry.nodes as any)
    setEdges(restoredEdges as any)
    setHistoryIndex(prevIndex)
    
    setTimeout(() => {
      isUndoingRef.current = false
    }, 100)
  }, [history, historyIndex, setNodes, setEdges, edges])

  // Redo function
  const redo = useCallback(() => {
    if (historyIndex >= history.length - 1 || history.length === 0) {
      return
    }

    const nextIndex = historyIndex + 1
    
    if (nextIndex < 0 || nextIndex >= history.length) {
      return
    }

    const nextEntry = history[nextIndex]
    if (!nextEntry || !nextEntry.nodes || !nextEntry.edges) {
      return
    }

    isUndoingRef.current = true
    
    // Preserve current selection state when restoring from history
    const currentSelectionMap = new Map<string, boolean>()
    edges.forEach((edge: any) => {
      if ('selected' in edge && edge.selected !== undefined) {
        currentSelectionMap.set(edge.id, edge.selected)
      }
    })
    
    const restoredEdges = nextEntry.edges.map((edge: any) => {
      const currentSelected = currentSelectionMap.get(edge.id)
      return currentSelected !== undefined ? { ...edge, selected: currentSelected } : edge
    })
    
    setNodes(nextEntry.nodes as any)
    setEdges(restoredEdges as any)
    setHistoryIndex(nextIndex)
    
    setTimeout(() => {
      isUndoingRef.current = false
    }, 100)
  }, [history, historyIndex, setNodes, setEdges, edges])

  // Handle node click - just select the node, don't open editor
  const handleNodeClick = useCallback(
    (_event: React.MouseEvent, node: Node) => {
      setContextMenu(null) // Close context menu
      
      // Focus canvas container to enable keyboard events
      if (canvasContainerRef.current) {
        canvasContainerRef.current.focus()
      }
      
      // Single click on node: just select it (ReactFlow handles selection)
      // Don't open editor on single click - that's for double click
      if (onNodeClick) {
        onNodeClick(node.id)
      }
    },
    [onNodeClick]
  )

  // Handle node context menu (right-click) - disabled, just prevent default
  const handleNodeContextMenu = useCallback((event: React.MouseEvent) => {
    event.preventDefault()
  }, [])

  // Handle edge context menu (right-click) - disabled, just prevent default
  const handleEdgeContextMenu = useCallback((event: React.MouseEvent) => {
    event.preventDefault()
  }, [])

  // Handle edge double-click - show inline input for label editing
  const handleEdgeDoubleClick = useCallback(
    (event: React.MouseEvent, edge: Edge) => {
      event.preventDefault()
      event.stopPropagation()

      if (!canvasContainerRef.current) {
        return
      }

      // Use the click position directly - convert from client coordinates to container-relative coordinates
      const containerRect = canvasContainerRef.current.getBoundingClientRect()
      const x = event.clientX - containerRect.left
      const y = event.clientY - containerRect.top

      setInlineEditingEdgeId(edge.id)
      setInlineEditingPosition({ x, y })

      // Focus textarea and set initial height after a short delay to ensure it's rendered
      setTimeout(() => {
        if (inlineEdgeInputRef.current) {
          // Set initial height based on content
          inlineEdgeInputRef.current.style.height = 'auto'
          inlineEdgeInputRef.current.style.height = `${inlineEdgeInputRef.current.scrollHeight}px`
          inlineEdgeInputRef.current.focus()
          // Set cursor position to end of text
          const length = inlineEdgeInputRef.current.value.length
          inlineEdgeInputRef.current.setSelectionRange(length, length)
        }
      }, 10)
    },
    []
  )

  // Handle inline edge label save
  const handleInlineEdgeLabelSave = useCallback(
    (edgeId: string, label: string) => {
      setEdges((eds) => {
        const trimmedLabel = label.trim()
        const updatedEdges = eds.map((edge) => {
          if (edge.id === edgeId) {
            return {
              ...edge,
              label: trimmedLabel || undefined, // Set to undefined if empty
            }
          }
          return edge
        })
        addToHistory(nodes, updatedEdges)
        saveEdges(updatedEdges, nodes)
        return updatedEdges
      })
      setInlineEditingEdgeId(null)
      setInlineEditingPosition(null)
      setHoveredEdgeLabelId(null) // Clear hover state when closing editor
    },
    [nodes, setEdges, addToHistory, saveEdges]
  )

  // Handle inline edge label cancel
  const handleInlineEdgeLabelCancel = useCallback(() => {
    setInlineEditingEdgeId(null)
    setInlineEditingPosition(null)
    setHoveredEdgeLabelId(null) // Clear hover state when closing editor
  }, [])

  // Handle pane context menu (right-click on canvas) - disabled to avoid empty menu
  const handlePaneContextMenu = useCallback((event: MouseEvent | React.MouseEvent) => {
    event.preventDefault()
    // Don't show context menu for pane (empty menu)
    // setContextMenu(null)
  }, [])

  // Handle node double click - open floating editor (only if not clicking on label or handle)
  const handleNodeDoubleClick = useCallback(
    (event: React.MouseEvent, node: Node) => {
      // Check if the click was on the label - if so, let the label handle it (rename)
      const target = event.target as HTMLElement
      // If clicking on the label div (has class "node-label"), don't open editor
      if (target.closest('.node-label')) {
        return
      }
      // If clicking on a handle, don't open editor (let React Flow handle connections)
      if (target.closest('.react-flow__handle')) {
        return
      }
      
      event.preventDefault()
      event.stopPropagation()
      
      // Don't open editor if node is being renamed
      if (renamingNodeId === node.id) {
        return
      }
      
      // If editor is already open for this node, just focus it (don't reload)
      if (editingNodeId === node.id) {
        // Editor already open, just ensure it's visible
        return
      }
      
      // Close editor if open for a different node
      if (editingNodeId && editingNodeId !== node.id) {
        setEditingNodeId(null)
        setEditorPosition(null)
        if (onCloseNodeEditor) {
          onCloseNodeEditor()
        }
      }
      
      // Set fixed position at bottom-right corner (position will be handled by CSS)
      setEditingNodeId(node.id)
      setEditorPosition({ x: 0, y: 0 }) // Dummy values, actual positioning via CSS
      
      // Also call parent callback for loading document content
      if (onNodeDoubleClick) {
        onNodeDoubleClick(node.id)
      }
    },
    [onNodeDoubleClick, editingNodeId, renamingNodeId, onCloseNodeEditor]
  )
  
  // Handle click outside editor to close it
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (!editingNodeId || !editorRef.current) return
      
      const target = event.target as HTMLElement
      
      // Don't close if clicking inside the editor
      if (editorRef.current.contains(target)) {
        return
      }
      
      // Don't close if clicking on the node that's being edited (user might want to interact with it)
      const clickedOnNode = target.closest('.react-flow__node')
      if (clickedOnNode) {
        const nodeId = clickedOnNode.getAttribute('data-id')
        // If clicking on the same node, don't close (might be accidental)
        // If clicking on a different node, close editor (user wants to switch focus)
        if (nodeId !== editingNodeId) {
          setEditingNodeId(null)
          setEditorPosition(null)
          if (onCloseNodeEditor) {
            onCloseNodeEditor()
          }
        }
        return
      }
      
      // Clicking anywhere else (pane, other elements) closes the editor
      setEditingNodeId(null)
      setEditorPosition(null)
      if (onCloseNodeEditor) {
        onCloseNodeEditor()
      }
    }
    
    if (editingNodeId) {
      // Use a small delay to avoid immediate closure when opening
      const timeoutId = setTimeout(() => {
        // Use capture phase to catch events before they bubble
        document.addEventListener('mousedown', handleClickOutside, true)
      }, 100)
      
      return () => {
        clearTimeout(timeoutId)
        document.removeEventListener('mousedown', handleClickOutside, true)
      }
    }
  }, [editingNodeId, onCloseNodeEditor])

  // Refresh node content when editor closes to update preview text
  const prevEditingNodeIdRef = useRef<string | null>(null)
  useEffect(() => {
    // When editor closes (editingNodeId changes from a value to null)
    if (prevEditingNodeIdRef.current && !editingNodeId) {
      const closedNodeId = prevEditingNodeIdRef.current
      
      // Reload node content and update node data
      worldLabApi.loadNodeContent(labName, closedNodeId)
        .then((content) => {
          if (content !== null) {
            // Update node's data.content to refresh preview text
            setNodes((nds) => {
              const updatedNodes = nds.map((node) => {
                if (node.id === closedNodeId) {
                  return {
                    ...node,
                    data: {
                      ...node.data,
                      content: content, // Update content to refresh preview
                    },
                  }
                }
                return node
              })
              // Save nodes to persist the content update
              saveNodes(updatedNodes)
              return updatedNodes
            })
          }
        })
        .catch(() => {
          // Error handling
        })
    }
    
    // Update ref for next render
    prevEditingNodeIdRef.current = editingNodeId
  }, [editingNodeId, labName, setNodes, saveNodes])

  // Handle edge connection
  const onConnect = useCallback(
    (params: Connection) => {
      if (!params.source || !params.target) {
        return
      }
      
      if (params.source === params.target) {
        return
      }
      
      // Check if this should be a directed edge (right-click drag)
      const isDirected = isDirectingEdge
      // Reset the flag after using it
      if (isDirectingEdge) {
        setIsDirectingEdge(false)
      }
      
      const newEdge: Edge = {
        id: `edge_${params.source}_${params.target}_${Date.now()}`,
        source: params.source,
        target: params.target,
        sourceHandle: params.sourceHandle || undefined,
        targetHandle: params.targetHandle || undefined,
        type: 'default', // Smooth bezier curves (default type in React Flow v11)
        data: {
          sourceHandle: params.sourceHandle,
          targetHandle: params.targetHandle,
          directed: isDirected, // Mark edge as directed if created via right-click drag
        },
      }
      
      setEdges((eds) => {
        // Allow multiple edges between the same nodes/handles - offset will be calculated automatically
        // Add edge directly instead of using addEdge helper to avoid validation issues
        const updatedEdges = [...eds, normalizeEdge(newEdge)]
        
        addToHistory(nodes, updatedEdges)
        saveEdges(updatedEdges)
        return updatedEdges
      })
    },
    [setEdges, saveEdges, normalizeEdge, nodes, addToHistory, isDirectingEdge]
  )

  // Handle node rename
  const handleNodeRename = useCallback(
    async (nodeId: string, newLabel: string) => {
      setNodes((nds) => {
        const updatedNodes = nds.map((node) => {
          if (node.id === nodeId) {
            return {
              ...node,
              data: {
                ...node.data,
                label: newLabel,
              },
            }
          }
          return node
        })
        addToHistory(updatedNodes, edges)
        saveNodes(updatedNodes)
        return updatedNodes
      })
      setRenamingNodeId(null)
      
      // Create node file if it doesn't exist and node has a name
      if (newLabel && newLabel.trim() !== '' && newLabel !== 'New Element') {
        try {
          // Check if node file exists by trying to load it
          const existingContent = await worldLabApi.loadNodeContent(labName, nodeId)
          // If node file doesn't exist, create it empty (title is shown separately)
          if (!existingContent) {
            // Create empty markdown content - title is shown in node label, not in editor
            await worldLabApi.createNode(labName, nodeId, '')
          }
        } catch (error) {
          // Continue even if file creation fails - node metadata is already saved
        }
      }
    },
    [setNodes, saveNodes, edges, addToHistory, labName]
  )

  // Handle rename cancel
  const handleRenameCancel = useCallback(() => {
    setRenamingNodeId(null)
  }, [])

  // Handle start rename
  const handleStartRename = useCallback((nodeId: string) => {
    setRenamingNodeId(nodeId)
  }, [])

  // Handle node category change
  const handleNodeCategoryChange = useCallback(
    async (nodeId: string, newCategory: string) => {
      setNodes((nds) => {
        const updatedNodes = nds.map((node) => {
          if (node.id === nodeId) {
            return {
              ...node,
              selected: false, // Deselect node after category change to hide connection handles
              data: {
                ...node.data,
                category: newCategory,
              },
            }
          }
          return node
        })
        addToHistory(updatedNodes, edges)
        saveNodes(updatedNodes)
        return updatedNodes
      })
      
      // Ensure node file exists if node has a name
      const node = nodes.find(n => n.id === nodeId)
      const nodeLabel = node?.data?.label || ''
      if (nodeLabel && nodeLabel.trim() !== '' && nodeLabel !== 'New Element') {
        try {
          const existingContent = await worldLabApi.loadNodeContent(labName, nodeId)
          if (!existingContent) {
            // Create empty markdown content - title is shown in node label, not in editor
            await worldLabApi.createNode(labName, nodeId, '')
          }
        } catch (error) {
          // Error handling
        }
      }
    },
    [setNodes, saveNodes, edges, addToHistory, labName, nodes]
  )

  // Handle pane click to create new node or close Node Editor
  const handlePaneClick = useCallback(
    (event: React.MouseEvent) => {
      setContextMenu(null) // Close context menu
      
      // Focus canvas container to enable keyboard events
      if (canvasContainerRef.current) {
        canvasContainerRef.current.focus()
      }
      
      // Single click on pane - deselect nodes and close editor
      if (event.detail === 1) {
        // Deselect all nodes
        setNodes((nds) => nds.map((n: any) => ({ ...n, selected: false })))
        setEdges((eds) => eds.map((e: any) => ({ ...e, selected: false })))
        
        // Close inline edge input if open (but don't save - let blur handler save)
        if (inlineEditingEdgeId && inlineEdgeInputRef.current) {
          inlineEdgeInputRef.current.blur()
        }
        
        // Close editor if open
        if (editingNodeId) {
          setEditingNodeId(null)
          setEditorPosition(null)
          if (onCloseNodeEditor) {
            onCloseNodeEditor()
          }
        }
      }
      
      // Double click on pane to create a new node
      if (event.detail === 2 && reactFlowInstance.current) {
        // Store current viewport to prevent zoom changes
        const currentViewport = reactFlowInstance.current.getViewport()
        
        const point = reactFlowInstance.current.screenToFlowPosition({
          x: event.clientX,
          y: event.clientY,
        })
        
        if (point) {
          const newNodeId = `node_${Date.now()}`
          const newNode = {
            id: newNodeId,
            type: 'custom' as const,
            position: point,
            selected: false, // Don't select the node to prevent auto-zoom
            data: {
              label: 'New Element',
              category: 'Uncategorized',
              elementName: undefined,
            },
          }
          setNodes((nds) => {
            const updatedNodes = [...nds, newNode]
            addToHistory(updatedNodes, edges)
            saveNodes(updatedNodes)
            return updatedNodes
          })
          
          // Restore viewport immediately after node creation to prevent zoom
          setTimeout(() => {
            if (reactFlowInstance.current) {
              reactFlowInstance.current.setViewport(currentViewport, { duration: 0 })
            }
          }, 0)
          
          // Start renaming the new node after a small delay to ensure viewport is stable
          setTimeout(() => {
            setRenamingNodeId(newNodeId)
          }, 10)
        }
      }
    },
    [setNodes, setEdges, saveNodes, edges, addToHistory, editingNodeId, onCloseNodeEditor, inlineEditingEdgeId]
  )


  // Handle edge property update
  const handleEdgePropertyUpdate = useCallback(
    (edgeId: string, updates: {
      label?: string
      edgeType?: string
      strength?: number
      color?: string
      bidirectional?: boolean
    }) => {
      setEdges((eds) => {
        const updatedEdges = eds.map((edge) => {
          if (edge.id === edgeId) {
            const edgeData = (edge as any).data || {}
            const newData = {
              ...edgeData,
              ...(updates.edgeType !== undefined && { edgeType: updates.edgeType }),
              ...(updates.strength !== undefined && { strength: updates.strength }),
              ...(updates.color !== undefined && { color: updates.color }),
            }
            
            // Handle bidirectional: create reverse edge if needed
            if (updates.bidirectional === true) {
              const reverseEdgeExists = eds.some(
                (e) => e.source === edge.target && e.target === edge.source
              )
              if (!reverseEdgeExists) {
                const reverseEdge: Edge = {
                  id: `edge_${edge.target}_${edge.source}_${Date.now()}`,
                  source: edge.target,
                  target: edge.source,
                  type: edge.type || 'default',
                  label: edge.label,
                  data: newData,
                }
                // Will be added after this map (don't add to history - this is automatic correction, not user action)
                setTimeout(() => {
                  setEdges((current: any) => {
                    const withReverse = [...current, reverseEdge]
                    saveEdges(withReverse, nodes)
                    return withReverse
                  })
                }, 0)
              }
            } else if (updates.bidirectional === false) {
              // Remove reverse edge (don't add to history - this is automatic correction, not user action)
              setTimeout(() => {
                setEdges((current: any) => {
                  const filtered = current.filter(
                    (e: any) => !(e.source === edge.target && e.target === edge.source)
                  )
                  saveEdges(filtered, nodes)
                  return filtered
                })
              }, 0)
            }

            return {
              ...edge,
              label: updates.label !== undefined ? updates.label : edge.label,
              data: newData,
            } as any
          }
          return edge
        })
        addToHistory(nodes, updatedEdges)
        saveEdges(updatedEdges, nodes)
        return updatedEdges
      })
    },
    [nodes, setEdges, addToHistory, saveEdges]
  )

  // Save viewport to metadata with debounce
  const saveViewport = useCallback(async (viewport: { x: number; y: number; zoom: number }) => {
    if (viewportSaveTimeoutRef.current) {
      clearTimeout(viewportSaveTimeoutRef.current)
    }
    viewportSaveTimeoutRef.current = setTimeout(async () => {
      try {
        // Load current metadata to preserve other fields
        const currentMetadata = await worldLabApi.loadMetadata(labName)
        const updatedMetadata = {
          ...currentMetadata,
          viewport,
        }
        await worldLabApi.saveMetadata(labName, updatedMetadata)
        savedViewportRef.current = viewport
      } catch (error) {
        console.error('[WorldLabCanvas] Error saving viewport:', error)
      }
    }, 500) // Debounce for 500ms
  }, [labName])

  // Load viewport from metadata on mount or when labName changes
  useEffect(() => {
    // Reset saved viewport when labName changes
    savedViewportRef.current = null
    
    const loadViewport = async () => {
      try {
        const metadata = await worldLabApi.loadMetadata(labName)
        if (metadata?.viewport) {
          savedViewportRef.current = metadata.viewport
          // Set viewport if ReactFlow instance is already initialized
          if (reactFlowInstance.current) {
            reactFlowInstance.current.setViewport(metadata.viewport, { duration: 0 })
          }
        }
      } catch (error) {
        console.error('[WorldLabCanvas] Error loading viewport:', error)
      }
    }
    loadViewport()

    // Cleanup: Save viewport when leaving the project
    return () => {
      // Clear any pending timeout
      if (viewportSaveTimeoutRef.current) {
        clearTimeout(viewportSaveTimeoutRef.current)
      }
      // Save current viewport immediately if ReactFlow instance exists
      if (reactFlowInstance.current) {
        const currentViewport = reactFlowInstance.current.getViewport()
        // Only save if viewport has changed from saved value
        if (!savedViewportRef.current || 
            savedViewportRef.current.x !== currentViewport.x ||
            savedViewportRef.current.y !== currentViewport.y ||
            savedViewportRef.current.zoom !== currentViewport.zoom) {
          // Save synchronously on unmount
          worldLabApi.loadMetadata(labName).then((currentMetadata) => {
            const updatedMetadata = {
              ...currentMetadata,
              viewport: currentViewport,
            }
            worldLabApi.saveMetadata(labName, updatedMetadata).catch((error) => {
              console.error('[WorldLabCanvas] Error saving viewport on unmount:', error)
            })
          }).catch((error) => {
            console.error('[WorldLabCanvas] Error loading metadata on unmount:', error)
          })
        }
      }
    }
  }, [labName])

  // Handle ReactFlow instance initialization
  const handleInit = useCallback((instance: any) => {
    reactFlowInstance.current = instance
    // Set saved viewport if available (either from ref or load it)
    const setViewportIfNeeded = () => {
      if (savedViewportRef.current) {
        instance.setViewport(savedViewportRef.current, { duration: 0 })
      } else {
        // If viewport not loaded yet, try loading it
        worldLabApi.loadMetadata(labName).then((metadata) => {
          if (metadata?.viewport && reactFlowInstance.current) {
            savedViewportRef.current = metadata.viewport
            reactFlowInstance.current.setViewport(metadata.viewport, { duration: 0 })
          }
        }).catch((error) => {
          console.error('[WorldLabCanvas] Error loading viewport in handleInit:', error)
        })
      }
    }
    // Use requestAnimationFrame to ensure ReactFlow is fully initialized
    requestAnimationFrame(() => {
      setViewportIfNeeded()
    })
  }, [labName])

  // Handle viewport changes (pan/zoom)
  const handleMoveEnd = useCallback((_event: any, viewport: { x: number; y: number; zoom: number }) => {
    saveViewport(viewport)
  }, [saveViewport])

  // Keyboard shortcuts and click handlers
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0
      const ctrlOrCmd = isMac ? e.metaKey : e.ctrlKey
      
      // Don't handle shortcuts if user is typing in the editor
      if (editingNodeId && editorRef.current?.contains(document.activeElement)) {
        // User is typing in editor, only handle Escape to close
        if (e.key === 'Escape') {
          setEditingNodeId(null)
          setEditorPosition(null)
          if (onCloseNodeEditor) {
            onCloseNodeEditor()
          }
        }
        return
      }
      
      // Don't handle shortcuts if user is typing in an input field (like rename input)
      const activeElement = document.activeElement
      if (activeElement && (
        activeElement.tagName === 'INPUT' || 
        activeElement.tagName === 'TEXTAREA' ||
        (activeElement as HTMLElement).isContentEditable
      )) {
        return
      }

      // Undo: Ctrl/Cmd + Z (without Shift)
      if (ctrlOrCmd && (e.key === 'z' || e.key === 'Z') && !e.shiftKey) {
        e.preventDefault()
        e.stopPropagation()
        undo()
        return
      }
      // Redo: Ctrl/Cmd + Shift + Z or Ctrl/Cmd + Y
      if ((ctrlOrCmd && (e.key === 'z' || e.key === 'Z') && e.shiftKey) || (ctrlOrCmd && (e.key === 'y' || e.key === 'Y'))) {
        e.preventDefault()
        e.stopPropagation()
        redo()
        return
      }
      // Delete: Delete or Backspace
      else if (e.key === 'Delete' || e.key === 'Backspace') {
        // Check selection from our own state FIRST (in capture phase, before React Flow processes it)
        const selectedNodesFromState = nodes.filter((n: any) => n.selected)
        const selectedEdgesFromState = edges.filter((e: any) => e.selected)
        
        // Also check React Flow instance as fallback
        let selectedNodes = selectedNodesFromState
        let selectedEdges = selectedEdgesFromState
        
        if (reactFlowInstance.current) {
          const currentNodes = reactFlowInstance.current.getNodes()
          const currentEdges = reactFlowInstance.current.getEdges()
          const selectedNodesFromRF = currentNodes.filter((n: any) => n.selected)
          const selectedEdgesFromRF = currentEdges.filter((e: any) => e.selected)
          
          // Use React Flow selection if state selection is empty (might be more up-to-date)
          if (selectedNodesFromState.length === 0 && selectedNodesFromRF.length > 0) {
            selectedNodes = selectedNodesFromRF as any
            selectedEdges = selectedEdgesFromRF as any
          }
        }
        
        if (selectedNodes.length > 0 || selectedEdges.length > 0) {
          // Prevent default immediately in capture phase to stop React Flow from processing backspace
          e.preventDefault()
          e.stopPropagation()
          
          // Filter out selected nodes and edges from state
          const selectedNodeIds = new Set(selectedNodes.map((n: any) => n.id))
          const selectedEdgeIds = new Set(selectedEdges.map((e: any) => e.id))
          const newNodes = nodes.filter((n: any) => !selectedNodeIds.has(n.id))
          const newEdges = edges.filter((e: any) => !selectedEdgeIds.has(e.id))
          
          // Store original state for rollback if deletion fails
          const originalNodes = nodes
          const originalEdges = edges
          
          setNodes(newNodes)
          setEdges(newEdges)
          addToHistory(newNodes, newEdges)
          
          saveNodes(newNodes)
          // FIXED: Pass newNodes to saveEdges to avoid stale closure
          saveEdges(newEdges, newNodes)
          
          // Delete node files from backend
          Promise.all(
            selectedNodes.map(async (node) => {
              try {
                const result = await worldLabApi.deleteNode(labName, node.id)
                return { nodeId: node.id, success: result }
              } catch (error) {
                return { nodeId: node.id, success: false, error }
              }
            })
          ).then((results) => {
            const failedDeletions = results.filter(r => !r.success)
            if (failedDeletions.length > 0) {
              // Rollback: restore original state (don't add to history - this is error recovery, not user action)
              setNodes(originalNodes as any)
              setEdges(originalEdges as any)
              
              // Also rollback saves
              saveNodes(originalNodes as any)
              saveEdges(originalEdges as any, originalNodes as any)
              
              // Show user-friendly error (you might want to add a toast/notification here)
              alert(`Failed to delete ${failedDeletions.length} node(s). Changes have been rolled back.`)
            }
          }).catch(() => {
            // Rollback on unexpected error
            // Rollback (don't add to history - this is error recovery, not user action)
            setNodes(originalNodes as any)
            setEdges(originalEdges as any)
            saveNodes(originalNodes)
            saveEdges(originalEdges, originalNodes)
          })
        }
      }
      // Escape: Close editor, deselect all, close context menu
      else if (e.key === 'Escape') {
        // First close editor if open
        if (editingNodeId) {
          e.preventDefault()
          setEditingNodeId(null)
          setEditorPosition(null)
          if (onCloseNodeEditor) {
            onCloseNodeEditor()
          }
          return
        }
        // Then cancel renaming if active
        if (renamingNodeId) {
          e.preventDefault()
          setRenamingNodeId(null)
          return
        }
        // Finally deselect and close menus
        // Use setNodes/setEdges which will update React Flow's internal selection state
        e.preventDefault()
        setNodes((nds) => nds.map((n: any) => ({ ...n, selected: false })))
        setEdges((eds) => eds.map((e: any) => ({ ...e, selected: false })))
        setContextMenu(null)
        setShowShortcutsModal(false)
      }
      // Show shortcuts: ? key
      else if (e.key === '?' && !ctrlOrCmd && !e.shiftKey) {
        e.preventDefault()
        setShowShortcutsModal(true)
      }
    }

    const handleClick = () => {
      // Close context menu on any click
      if (contextMenu) {
        setContextMenu(null)
      }
    }

    // Use capture phase for keydown to catch backspace before React Flow clears selection
    window.addEventListener('keydown', handleKeyDown, true)
    window.addEventListener('click', handleClick)
    return () => {
      window.removeEventListener('keydown', handleKeyDown, true)
      window.removeEventListener('click', handleClick)
    }
  }, [nodes, edges, undo, redo, setNodes, setEdges, addToHistory, saveNodes, saveEdges, contextMenu, renamingNodeId, editingNodeId, onCloseNodeEditor, labName])

  // Record initial state in history (only once on mount)
  useEffect(() => {
    if (!historyInitializedRef.current && nodes.length > 0) {
      historyInitializedRef.current = true
      addToHistory(nodes, edges)
    }
  }, [nodes, edges, addToHistory]) // Initialize history when nodes are available

  // Expose undo/redo handlers to parent component
  useEffect(() => {
    if (onUndoRedoReady) {
      onUndoRedoReady({
        undo,
        redo,
        canUndo: () => historyIndex > 0,
        canRedo: () => historyIndex < history.length - 1,
      })
    }
  }, [onUndoRedoReady, undo, redo, historyIndex, history.length])

  // Enhanced edge styling - representing "world rules" with custom types
  const getEdgeStyle = useCallback(
    (edge: Edge) => {
      // Get custom edge type from edge.data or edge.label
      const edgeData = (edge as any).data || {}
      const edgeType = edgeData.edgeType || edgeData.type || 'default'
      const edgeStrength = edgeData.strength || edgeData.thickness || 1
      
      // Base edge color
      const edgeColor = theme === 'dark'
        ? `rgba(255, 255, 255, ${edge.selected ? 0.4 : 0.18})`
        : `rgba(0, 0, 0, ${edge.selected ? 0.3 : 0.15})`

      // Determine stroke style based on edge type
      let strokeDasharray = 'none'
      if (edgeType === 'dashed') {
        strokeDasharray = '8,4'
      } else if (edgeType === 'dotted') {
        strokeDasharray = '2,4'
      } else if (edgeType === 'dashdot') {
        strokeDasharray = '8,4,2,4'
      } else if (edge.animated) {
        strokeDasharray = '5,5'
      }

      // Calculate stroke width based on strength (1-5 scale, default 2)
      const baseWidth = 2
      const strokeWidth = Math.max(1, Math.min(5, baseWidth * edgeStrength))

      // Use custom color if specified, otherwise use category color or default
      const customColor = edgeData.color
      // When selected, use uniform grey color for all edges
      const selectedEdgeColor = theme === 'dark'
        ? 'rgba(255, 255, 255, 0.7)'  // Brighter light grey for dark theme
        : 'rgba(0, 0, 0, 0.6)'         // Brighter dark grey for light theme
      const finalStrokeColor = edge.selected
        ? selectedEdgeColor
        : (customColor || edgeColor)

      return {
        stroke: finalStrokeColor,
        strokeWidth: strokeWidth,
        strokeDasharray: strokeDasharray,
        opacity: edge.selected ? 1 : 0.6,
        transition: 'all 0.1s ease',
      }
    },
    [nodes, theme]
  )

  // Find nearest handle at screen coordinates using geometric hit testing
  const findNearestHandleAtScreenCoords = useCallback((clientX: number, clientY: number): { nodeId: string; handleId: string } | null => {
    if (!reactFlowInstance.current) {
      return null
    }

    const sourceNodeId = rightClickDragStateRef.current.sourceNodeId

    // Convert screen coordinates to flow coordinates
    const flowPosition = reactFlowInstance.current.screenToFlowPosition({ x: clientX, y: clientY })

    const currentNodes = reactFlowInstance.current.getNodes()
    
    // Use same threshold as React Flow's connectionRadius (40px) for consistency
    // Convert to flow coordinates considering zoom level
    const viewport = reactFlowInstance.current.getViewport()
    const zoom = viewport.zoom
    const HANDLE_HIT_THRESHOLD = 40 / zoom // Adjust for zoom level, matching React Flow's connectionRadius

    let nearestHandle: { nodeId: string; handleId: string; distance: number } | null = null

    // Check all nodes and their handles
    for (const node of currentNodes) {
      // Skip source node (can't connect to itself)
      if (node.id === sourceNodeId) {
        continue
      }

      // Get node dimensions
      const nodeWidth = (node as any).measured?.width || (node as any).width || 200
      const nodeHeight = (node as any).measured?.height || (node as any).height || 100
      const nodeX = node.position.x
      const nodeY = node.position.y

      // Calculate handle positions (target handles only)
      const handleConfigs = [
        { id: 'top-target', x: nodeX + nodeWidth / 2, y: nodeY },
        { id: 'bottom-target', x: nodeX + nodeWidth / 2, y: nodeY + nodeHeight },
        { id: 'left-target', x: nodeX, y: nodeY + nodeHeight / 2 },
        { id: 'right-target', x: nodeX + nodeWidth, y: nodeY + nodeHeight / 2 },
      ]

      // Check distance to each handle
      for (const handleConfig of handleConfigs) {
        const dx = flowPosition.x - handleConfig.x
        const dy = flowPosition.y - handleConfig.y
        const distance = Math.sqrt(dx * dx + dy * dy)

        if (distance < HANDLE_HIT_THRESHOLD) {
          if (!nearestHandle || distance < nearestHandle.distance) {
            nearestHandle = {
              nodeId: node.id,
              handleId: handleConfig.id,
              distance,
            }
          }
        }
      }
    }

    if (nearestHandle) {
      return {
        nodeId: nearestHandle.nodeId,
        handleId: nearestHandle.handleId,
      }
    }

    return null
  }, [])

  // Handle right-click on handle to initiate directed edge creation
  const handleHandleRightClick = useCallback((nodeId: string, handleId: string, clientX: number, clientY: number) => {
    // Find source node and calculate handle position
    const sourceNode = nodes.find((n) => n.id === nodeId)
    if (!sourceNode || !reactFlowInstance.current || !canvasContainerRef.current) {
      return
    }
    
    // Get container rect for coordinate conversion
    const containerRect = canvasContainerRef.current.getBoundingClientRect()
    
    // Try to find the actual handle DOM element to get its exact position
    // This ensures we use the same coordinate system as the SVG (relative to canvasContainerRef)
    // React Flow nodes have data-id attribute, handles have data-handleid attribute
    const nodeElement = canvasContainerRef.current.querySelector(`[data-id="${nodeId}"]`) as HTMLElement
    const handleElement = nodeElement?.querySelector(`[data-handleid="${handleId}"], [data-handleid="${handleId}-source"], [data-handleid="${handleId}-target"]`) as HTMLElement
    let sourceScreen: { x: number; y: number }
    
    if (handleElement) {
      // Use actual DOM element position for accuracy
      const handleRect = handleElement.getBoundingClientRect()
      sourceScreen = {
        x: handleRect.left + handleRect.width / 2 - containerRect.left,
        y: handleRect.top + handleRect.height / 2 - containerRect.top,
      }
    } else {
      // Fallback: calculate handle position using flow coordinates
      const sourceNodeWidth = (sourceNode as any).measured?.width || (sourceNode as any).width || 200
      const sourceNodeHeight = (sourceNode as any).measured?.height || (sourceNode as any).height || 100
      
      let sourceX = sourceNode.position.x + sourceNodeWidth / 2
      let sourceY = sourceNode.position.y + sourceNodeHeight / 2
      
      if (handleId === 'top-source') {
        sourceX = sourceNode.position.x + sourceNodeWidth / 2
        sourceY = sourceNode.position.y
      } else if (handleId === 'bottom-source') {
        sourceX = sourceNode.position.x + sourceNodeWidth / 2
        sourceY = sourceNode.position.y + sourceNodeHeight
      } else if (handleId === 'left-source') {
        sourceX = sourceNode.position.x
        sourceY = sourceNode.position.y + sourceNodeHeight / 2
      } else if (handleId === 'right-source') {
        sourceX = sourceNode.position.x + sourceNodeWidth
        sourceY = sourceNode.position.y + sourceNodeHeight / 2
      }
      
      // Convert flow coordinates to screen coordinates relative to React Flow viewport
      const flowScreen = reactFlowInstance.current.flowToScreenPosition({ x: sourceX, y: sourceY })
      
      // React Flow's flowToScreenPosition returns coordinates relative to its internal viewport
      // We need to find the React Flow viewport element to get its offset relative to canvasContainerRef
      const reactFlowViewport = canvasContainerRef.current.querySelector('.react-flow__viewport') as HTMLElement
      if (reactFlowViewport) {
        const viewportRect = reactFlowViewport.getBoundingClientRect()
        sourceScreen = {
          x: flowScreen.x + (viewportRect.left - containerRect.left),
          y: flowScreen.y + (viewportRect.top - containerRect.top),
        }
      } else {
        // Fallback: assume flowToScreenPosition is already relative to container
        sourceScreen = flowScreen
      }
    }
    
    rightClickDragStateRef.current = {
      isDragging: true,
      sourceNodeId: nodeId,
      sourceHandleId: handleId,
      startX: clientX - containerRect.left,
      startY: clientY - containerRect.top,
    }
    
    // Set initial drag preview position to source handle position (relative to canvasContainerRef)
    setDragPreviewPosition(sourceScreen)
    setIsDirectingEdge(true)
    setIsConnecting(true)
    setConnectingFromNodeId(nodeId)
  }, [nodes])

  // Handle right-click drag preview (mousemove)
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (rightClickDragStateRef.current.isDragging && canvasContainerRef.current) {
        // Get canvas container position
        const rect = canvasContainerRef.current.getBoundingClientRect()
        // Store position relative to canvas container (for SVG rendering)
        // This matches the coordinate system used in handleHandleRightClick
        setDragPreviewPosition({
          x: e.clientX - rect.left,
          y: e.clientY - rect.top,
        })
      }
    }

    document.addEventListener('mousemove', handleMouseMove)
    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
    }
  }, [])

  // Handle right-click drag end to create directed edge
  useEffect(() => {
    const handleMouseUp = (e: MouseEvent) => {
      if (rightClickDragStateRef.current.isDragging && e.button === 2) {
        const state = rightClickDragStateRef.current
        
        // Use geometric hit testing to find nearest handle at coordinates
        const nearestHandle = findNearestHandleAtScreenCoords(e.clientX, e.clientY)
        
        if (nearestHandle && state.sourceNodeId && nearestHandle.nodeId !== state.sourceNodeId) {
          const sourceNode = nodes.find((n) => n.id === state.sourceNodeId)
          const targetNode = nodes.find((n) => n.id === nearestHandle.nodeId)
          const optimalHandles = sourceNode && targetNode
            ? calculateOptimalHandles(sourceNode, targetNode)
            : null

          const sourceHandle = normalizeHandleId(
            optimalHandles?.sourceHandle || state.sourceHandleId,
            'source'
          )
          const targetHandle = normalizeHandleId(
            optimalHandles?.targetHandle || nearestHandle.handleId,
            'target'
          )

          // Create the directed edge
          const newEdge: Edge = {
            id: `edge_${state.sourceNodeId}_${nearestHandle.nodeId}_${Date.now()}`,
            source: state.sourceNodeId,
            target: nearestHandle.nodeId,
            sourceHandle: sourceHandle || undefined,
            targetHandle: targetHandle || undefined,
            type: 'default',
            data: {
              sourceHandle: sourceHandle,
              targetHandle: targetHandle,
              directed: true,
            },
          }
          
          setEdges((eds) => {
            const normalizedEdge = normalizeEdge(newEdge)
            const updatedEdges = [...eds, normalizedEdge]
            addToHistory(nodes, updatedEdges)
            saveEdges(updatedEdges)
            return updatedEdges
          })
        }
        
        // Reset state
        rightClickDragStateRef.current = {
          isDragging: false,
          sourceNodeId: null,
          sourceHandleId: null,
          startX: 0,
          startY: 0,
        }
        setIsDirectingEdge(false)
        setIsConnecting(false)
        setConnectingFromNodeId(null)
        setDragPreviewPosition(null)
      }
    }

    const handleContextMenu = (e: MouseEvent) => {
      if (rightClickDragStateRef.current.isDragging) {
        e.preventDefault()
      }
    }

    document.addEventListener('mouseup', handleMouseUp)
    document.addEventListener('contextmenu', handleContextMenu)
    
    return () => {
      document.removeEventListener('mouseup', handleMouseUp)
      document.removeEventListener('contextmenu', handleContextMenu)
    }
  }, [setEdges, normalizeEdge, nodes, addToHistory, saveEdges, findNearestHandleAtScreenCoords, calculateOptimalHandles, normalizeHandleId])

  // Add rename props and category change handler to nodes
  const filteredNodes = React.useMemo(() => {
    return nodes.map((node) => ({
      ...node,
      data: {
        ...node.data,
        isRenaming: renamingNodeId === node.id,
        onRename: (newLabel: string) => handleNodeRename(node.id, newLabel),
        onRenameCancel: handleRenameCancel,
        onStartRename: () => handleStartRename(node.id),
        onCategoryChange: (newCategory: string) => handleNodeCategoryChange(node.id, newCategory),
        // Pass connection state to nodes for dynamic handle visibility
        isConnecting: isConnecting,
        connectingFromNodeId: connectingFromNodeId,
        // Pass right-click handler for directed edges
        onHandleRightClick: handleHandleRightClick,
      },
    }))
  }, [nodes, renamingNodeId, isConnecting, connectingFromNodeId, handleNodeRename, handleRenameCancel, handleStartRename, handleNodeCategoryChange, handleHandleRightClick])

  // Filter edges to only show connections between visible nodes
  const filteredEdges = React.useMemo(() => {
    const visibleNodeIds = new Set(filteredNodes.map((n) => n.id))
    return edges.filter((edge) => visibleNodeIds.has(edge.source) && visibleNodeIds.has(edge.target))
  }, [edges, filteredNodes])

  // Calculate offset for edges between the same node pairs to avoid overlap
  // Offset scales with edge length: longer edges get bigger curves
  const edgesWithOffset = React.useMemo(() => {
    const BASE_OFFSET_SPACING = 0.15 // Base spacing as fraction of edge length (15% of edge length)
    const MIN_OFFSET_SPACING = 60 // Minimum spacing in pixels for very short edges
    const MAX_OFFSET_SPACING = 120 // Maximum spacing in pixels for very long edges
    
    // Group edges by (source, target) only
    // This groups ALL edges between the same nodes together, regardless of:
    // - handle positions (sourceHandle/targetHandle)
    // - edge type (arrow/non-arrow)
    // This ensures arrow edges and non-arrow edges maintain distance from each other
    const edgeGroups = new Map<string, Edge[]>()
    
    filteredEdges.forEach(edge => {
      // Group by node pair (undirected) so A->B and B->A also get spacing
      const pair = edge.source < edge.target
        ? `${edge.source}-${edge.target}`
        : `${edge.target}-${edge.source}`
      const key = pair
      if (!edgeGroups.has(key)) {
        edgeGroups.set(key, [])
      }
      edgeGroups.get(key)!.push(edge)
    })
    
    // Calculate offset for each edge in each group
    const offsetMap = new Map<string, number>()
    edgeGroups.forEach((groupEdges) => {
      if (groupEdges.length === 0) return
      
      // Calculate edge length for this group (all edges in group have same source/target)
      const firstEdge = groupEdges[0]
      const sourceNode = filteredNodes.find(n => n.id === firstEdge.source)
      const targetNode = filteredNodes.find(n => n.id === firstEdge.target)
      
      let edgeLength = 200 // Default fallback length
      if (sourceNode && targetNode) {
        // Get handle positions to calculate actual edge length
        const sourceWidth = (sourceNode as any).measured?.width || (sourceNode as any).width || 200
        const sourceHeight = (sourceNode as any).measured?.height || (sourceNode as any).height || 100
        const targetWidth = (targetNode as any).measured?.width || (targetNode as any).width || 200
        const targetHeight = (targetNode as any).measured?.height || (targetNode as any).height || 100
        
        // Calculate actual handle positions based on handle IDs
        let sourceX = sourceNode.position.x + sourceWidth / 2
        let sourceY = sourceNode.position.y + sourceHeight / 2
        
        if (firstEdge.sourceHandle === 'top-source') {
          sourceX = sourceNode.position.x + sourceWidth / 2
          sourceY = sourceNode.position.y
        } else if (firstEdge.sourceHandle === 'bottom-source') {
          sourceX = sourceNode.position.x + sourceWidth / 2
          sourceY = sourceNode.position.y + sourceHeight
        } else if (firstEdge.sourceHandle === 'left-source') {
          sourceX = sourceNode.position.x
          sourceY = sourceNode.position.y + sourceHeight / 2
        } else if (firstEdge.sourceHandle === 'right-source') {
          sourceX = sourceNode.position.x + sourceWidth
          sourceY = sourceNode.position.y + sourceHeight / 2
        }
        
        let targetX = targetNode.position.x + targetWidth / 2
        let targetY = targetNode.position.y + targetHeight / 2
        
        if (firstEdge.targetHandle === 'top-target') {
          targetX = targetNode.position.x + targetWidth / 2
          targetY = targetNode.position.y
        } else if (firstEdge.targetHandle === 'bottom-target') {
          targetX = targetNode.position.x + targetWidth / 2
          targetY = targetNode.position.y + targetHeight
        } else if (firstEdge.targetHandle === 'left-target') {
          targetX = targetNode.position.x
          targetY = targetNode.position.y + targetHeight / 2
        } else if (firstEdge.targetHandle === 'right-target') {
          targetX = targetNode.position.x + targetWidth
          targetY = targetNode.position.y + targetHeight / 2
        }
        
        // Calculate actual edge length
        const dx = targetX - sourceX
        const dy = targetY - sourceY
        edgeLength = Math.sqrt(dx * dx + dy * dy)
      }
      
      // Calculate offset spacing proportional to edge length
      // Use a fraction of edge length, clamped between min and max
      const proportionalSpacing = edgeLength * BASE_OFFSET_SPACING
      const offsetSpacing = Math.max(MIN_OFFSET_SPACING, Math.min(MAX_OFFSET_SPACING, proportionalSpacing))
      
      // Sort edges by ID to ensure consistent ordering (by creation time)
      const sortedEdges = [...groupEdges].sort((a, b) => a.id.localeCompare(b.id))
      
      sortedEdges.forEach((edge, index) => {
        // Center the offsets around 0: for 1 edge -> 0, for 2 edges -> -spacing/2, spacing/2, etc.
        const baseOffset = (index - (sortedEdges.length - 1) / 2) * offsetSpacing
        // Normalize offset direction so opposite-direction edges separate instead of overlapping.
        // We pick a canonical direction based on sorted node ids and flip the offset for reverse edges.
        const isReverseDirection = edge.source.localeCompare(edge.target) > 0
        const offset = isReverseDirection ? -baseOffset : baseOffset
        offsetMap.set(edge.id, offset)
      })
    })
    
    // Apply offsets to edges
    return filteredEdges.map(edge => ({
      ...edge,
      pathOptions: {
        offset: offsetMap.get(edge.id) || 0
      }
    }))
  }, [filteredEdges, filteredNodes])

  // Enhanced background colors
  const bgColor = theme === 'dark' ? '#0D0D0D' : '#FAFAFA'
  const gridColor = theme === 'dark' ? '#1A1A1A' : '#F0F0F0'
  const borderColor = theme === 'dark' ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.1)'

  return (
    <>
      <style dangerouslySetInnerHTML={{__html: `
        @keyframes fileAppear {
          from {
            opacity: 0;
            transform: translateY(-8px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}} />
      <PanelGroup direction="vertical" style={{ width: '100%', height: '100%', animation: 'fileAppear 0.3s ease-out forwards' }}>
      {/* Top Panel: Canvas */}
      <Panel defaultSize={100} minSize={30}>
        <div
          ref={canvasContainerRef}
          tabIndex={-1}
          onMouseDown={(e) => {
            // Focus canvas container when clicking on it to enable keyboard events
            if (canvasContainerRef.current && e.target === canvasContainerRef.current) {
              canvasContainerRef.current.focus()
            }
          }}
          style={{
            width: '100%',
            height: '100%',
            background: bgColor,
            position: 'relative',
            outline: 'none',
          }}
        >
          <style>{`
            .react-flow__attribution {
              display: none !important;
            }
            .react-flow__pane {
              cursor: default !important;
            }
            .react-flow__pane.draggable {
              cursor: default !important;
            }
            .react-flow__pane.dragging {
              cursor: default !important;
            }
            .react-flow__node {
              pointer-events: all;
            }
            /* Hide ReactFlow's default blue selection box around selected nodes */
            .react-flow__nodesselection,
            .react-flow__nodesselection-rect {
              display: none !important;
              opacity: 0 !important;
              pointer-events: none !important;
            }
          `}</style>

          <ReactFlow
            nodes={filteredNodes}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            edges={(() => {
              // Map existing edges
              const previewEdges = edgesWithOffset.map((edge) => {
                const edgeData = (edge as any).data
                // Check for directed property in edge.data - ensure it's explicitly true
                const isDirected = edgeData?.directed === true
                const edgeStyle = getEdgeStyle(edge)
                // Check if edge is selected (React Flow manages this)
                const isSelected = (edge as any).selected === true
                // Use the same color as non-directed edges (from getEdgeStyle)
                const finalStrokeColor = edgeStyle.stroke
                // Arrow color should be opaque (not transparent) - use solid colors
                // Convert the edge color to an opaque version for the arrow
                // If selected, use the selected color (which is already opaque); otherwise use opaque default
                const arrowColor = isSelected
                  ? finalStrokeColor  // Selected color is already opaque
                  : (theme === 'dark' ? '#505050' : '#C0C0C0')  // Opaque colors matching light theme edge color
                return {
                  ...edge,
                  type: 'customBezier', // Custom bezier with offset support
                  style: {
                    ...edgeStyle,
                    // Use final stroke color (respects selection state)
                    stroke: finalStrokeColor,
                  },
                  markerEnd: isDirected
                    ? {
                        type: MarkerType.ArrowClosed,
                        color: arrowColor,
                        width: 18,
                        height: 18,
                      }
                    : undefined, // Arrow marker for directed edges
                  data: {
                    ...edgeData,
                    directed: isDirected, // Ensure directed is passed to custom edge component
                  },
                  // Hide default label - we'll render custom multi-line labels using EdgeLabelRenderer
                  label: undefined,
                  labelStyle: {
                    fill: theme === 'dark' ? '#E8E8E8' : '#1A1A1A',
                    fontWeight: 500,
                    fontSize: '12px',
                    background: theme === 'dark' ? 'rgba(30, 30, 30, 0.9)' : 'rgba(255, 255, 255, 0.9)',
                    padding: '4px 8px',
                    borderRadius: '6px',
                    border: `1px solid ${theme === 'dark' ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)'}`,
                  },
                  labelBgStyle: {
                    fill: theme === 'dark' ? 'rgba(30, 30, 30, 0.9)' : 'rgba(255, 255, 255, 0.9)',
                    fillOpacity: 0.9,
                  },
                  // Pass pathOptions for edge offset (to avoid overlap between multiple edges)
                  pathOptions: edge.pathOptions,
                }
              })


              return previewEdges
            })()}
            onNodesChange={onNodesChangeWithHandleAdjustment}
            onEdgesChange={onEdgesChangeInner}
            onNodeClick={handleNodeClick}
            onNodeDoubleClick={handleNodeDoubleClick}
            onNodeContextMenu={handleNodeContextMenu}
            onEdgeContextMenu={handleEdgeContextMenu}
            onEdgeDoubleClick={handleEdgeDoubleClick}
            onPaneClick={handlePaneClick}
            onPaneContextMenu={handlePaneContextMenu}
            onInit={handleInit}
            onMoveEnd={handleMoveEnd}
            onConnect={onConnect}
            onConnectStart={(_, params: any) => {
              // Set connecting state to show handles on target nodes
              setIsConnecting(true)
              setConnectingFromNodeId(params?.nodeId || null)
            }}
            onConnectEnd={() => {
              // Clear connecting state
              setIsConnecting(false)
              setConnectingFromNodeId(null)
              // Reset directed edge flag in case connection was cancelled
              setIsDirectingEdge(false)
            }}
            nodesDraggable={true}
            nodesConnectable={true}
            elementsSelectable={true}
            edgesFocusable={true}
            selectionKeyCode="Shift"
            selectionOnDrag={false}
            selectionMode={SelectionMode.Partial}
            onSelectionEnd={() => {
              // Force clear selection box by removing it from DOM
              // ReactFlow should handle this automatically, but ensure it's cleared
              setTimeout(() => {
                const selectionBox = document.querySelector('.react-flow__selection')
                if (selectionBox) {
                  selectionBox.remove()
                }
              }, 0)
            }}
            isValidConnection={(connection) => {
              return !!(connection.source && connection.target && connection.source !== connection.target)
            }}
            connectionRadius={40}
            panOnDrag={true}
            panOnScroll={false}
            zoomOnScroll={true}
            style={{ background: bgColor }}
            defaultEdgeOptions={{
              animated: false,
            }}
            connectionLineStyle={{
              stroke: theme === 'dark' ? 'rgba(255, 255, 255, 0.3)' : 'rgba(0, 0, 0, 0.2)',
              strokeWidth: 2,
              strokeDasharray: '5,5',
            }}
            proOptions={{ hideAttribution: true }}
            autoPanOnNodeDrag={false}
            autoPanOnConnect={false}
            fitView={false}
            minZoom={0.1}
            maxZoom={4}
            defaultViewport={{ x: 0, y: 0, zoom: 0.8 }}
          >
            <Background
              color={gridColor}
              gap={24}
              size={1}
              style={{
                opacity: theme === 'dark' ? 0.3 : 0.4,
              }}
            />
            {/* Multi-line Edge Labels */}
            <EdgeLabelRenderer>
              {(() => {
                // First, calculate all label positions
                const labelData = edgesWithOffset
                  .filter((edge) => {
                    return inlineEditingEdgeId !== edge.id && edge.label && edge.label.trim()
                  })
                  .map((edge) => {
                    const sourceNode = nodes.find((n) => n.id === edge.source)
                    const targetNode = nodes.find((n) => n.id === edge.target)
                    
                    if (!sourceNode || !targetNode || !reactFlowInstance.current) return null

                    // Get actual node dimensions
                    const sourceNodeWidth = (sourceNode as any).measured?.width || (sourceNode as any).width || 200
                    const sourceNodeHeight = (sourceNode as any).measured?.height || (sourceNode as any).height || 100
                    const targetNodeWidth = (targetNode as any).measured?.width || (targetNode as any).width || 200
                    const targetNodeHeight = (targetNode as any).measured?.height || (targetNode as any).height || 100

                    // Calculate handle positions - support all 8 handles
                    let sourceX = sourceNode.position.x + sourceNodeWidth / 2
                    let sourceY = sourceNode.position.y + sourceNodeHeight
                    let sourcePosition = Position.Bottom
                    
                    if (edge.sourceHandle === 'top-source') {
                      sourceX = sourceNode.position.x + sourceNodeWidth / 2
                      sourceY = sourceNode.position.y
                      sourcePosition = Position.Top
                    } else if (edge.sourceHandle === 'bottom-source') {
                      sourceX = sourceNode.position.x + sourceNodeWidth / 2
                      sourceY = sourceNode.position.y + sourceNodeHeight
                      sourcePosition = Position.Bottom
                    } else if (edge.sourceHandle === 'left-source') {
                      sourceX = sourceNode.position.x
                      sourceY = sourceNode.position.y + sourceNodeHeight / 2
                      sourcePosition = Position.Left
                    } else if (edge.sourceHandle === 'right-source') {
                      sourceX = sourceNode.position.x + sourceNodeWidth
                      sourceY = sourceNode.position.y + sourceNodeHeight / 2
                      sourcePosition = Position.Right
                    }
                    
                    let targetX = targetNode.position.x + targetNodeWidth / 2
                    let targetY = targetNode.position.y
                    let targetPosition = Position.Top
                    
                    if (edge.targetHandle === 'top-target') {
                      targetX = targetNode.position.x + targetNodeWidth / 2
                      targetY = targetNode.position.y
                      targetPosition = Position.Top
                    } else if (edge.targetHandle === 'bottom-target') {
                      targetX = targetNode.position.x + targetNodeWidth / 2
                      targetY = targetNode.position.y + targetNodeHeight
                      targetPosition = Position.Bottom
                    } else if (edge.targetHandle === 'left-target') {
                      targetX = targetNode.position.x
                      targetY = targetNode.position.y + targetNodeHeight / 2
                      targetPosition = Position.Left
                    } else if (edge.targetHandle === 'right-target') {
                      targetX = targetNode.position.x + targetNodeWidth
                      targetY = targetNode.position.y + targetNodeHeight / 2
                      targetPosition = Position.Right
                    }

                    // Helper function to calculate position along curve at given t value
                    const calculatePositionOnCurve = (t: number, perpendicularOffset: number = 0): { x: number; y: number } => {
                      const offset = edge.pathOptions?.offset || 0
                      const dx = targetX - sourceX
                      const dy = targetY - sourceY
                      const length = Math.sqrt(dx * dx + dy * dy)
                      
                      if (length === 0) {
                        return { x: (sourceX + targetX) / 2, y: (sourceY + targetY) / 2 }
                      }
                      
                      if (offset !== 0) {
                        const perpX = -dy / length
                        const perpY = dx / length
                        const curveMultiplier = 2.0
                        const controlOffsetX = perpX * offset * curveMultiplier
                        const controlOffsetY = perpY * offset * curveMultiplier
                        
                        const cp1X = sourceX + dx * 0.38 + controlOffsetX
                        const cp1Y = sourceY + dy * 0.38 + controlOffsetY
                        const cp2X = sourceX + dx * 0.62 + controlOffsetX
                        const cp2Y = sourceY + dy * 0.62 + controlOffsetY
                        
                        const mt = 1 - t
                        const x = mt * mt * mt * sourceX + 
                                  3 * mt * mt * t * cp1X + 
                                  3 * mt * t * t * cp2X + 
                                  t * t * t * targetX
                        const y = mt * mt * mt * sourceY + 
                                  3 * mt * mt * t * cp1Y + 
                                  3 * mt * t * t * cp2Y + 
                                  t * t * t * targetY
                        
                        // Calculate tangent for perpendicular offset
                        const tangentX = 3 * mt * mt * (cp1X - sourceX) + 
                                         6 * mt * t * (cp2X - cp1X) + 
                                         3 * t * t * (targetX - cp2X)
                        const tangentY = 3 * mt * mt * (cp1Y - sourceY) + 
                                         6 * mt * t * (cp2Y - cp1Y) + 
                                         3 * t * t * (targetY - cp2Y)
                        const tangentLength = Math.sqrt(tangentX * tangentX + tangentY * tangentY)
                        
                        if (tangentLength > 0 && perpendicularOffset !== 0) {
                          // Perpendicular vector (rotate tangent 90 degrees)
                          const perpOffsetX = -tangentY / tangentLength * perpendicularOffset
                          const perpOffsetY = tangentX / tangentLength * perpendicularOffset
                          return { x: x + perpOffsetX, y: y + perpOffsetY }
                        }
                        
                        return { x, y }
                      } else {
                        // For bezier without offset
                        try {
                          const [, x, y] = getBezierPath({
                            sourceX,
                            sourceY,
                            targetX,
                            targetY,
                            sourcePosition,
                            targetPosition,
                          })
                          // Calculate perpendicular offset
                          if (perpendicularOffset !== 0) {
                            const perpX = -dy / length
                            const perpY = dx / length
                            return { 
                              x: x + perpX * perpendicularOffset, 
                              y: y + perpY * perpendicularOffset 
                            }
                          }
                          return { x, y }
                        } catch {
                          const midX = sourceX + (targetX - sourceX) * t
                          const midY = sourceY + (targetY - sourceY) * t
                          if (perpendicularOffset !== 0) {
                            const perpX = -dy / length
                            const perpY = dx / length
                            return { 
                              x: midX + perpX * perpendicularOffset, 
                              y: midY + perpY * perpendicularOffset 
                            }
                          }
                          return { x: midX, y: midY }
                        }
                      }
                    }
                    
                    // Start with default position (t = 0.5, midpoint, no perpendicular offset)
                    let t = 0.5
                    let perpendicularOffset = 0
                    let { x: labelX, y: labelY } = calculatePositionOnCurve(t, perpendicularOffset)
                    
                    return {
                      edge,
                      sourceX,
                      sourceY,
                      targetX,
                      targetY,
                      sourcePosition,
                      targetPosition,
                      labelX,
                      labelY,
                      t,
                      perpendicularOffset,
                      calculatePositionOnCurve,
                    }
                  })
                  .filter((data): data is NonNullable<typeof data> => data !== null)
                
                // Detect and resolve overlaps
                const MIN_DISTANCE = 60 // Minimum distance between labels to avoid overlap
                const MAX_PERPENDICULAR_OFFSET = 40 // Maximum offset perpendicular to curve
                
                // Multiple passes to resolve overlaps
                for (let pass = 0; pass < 3; pass++) {
                  for (let i = 0; i < labelData.length; i++) {
                    for (let j = i + 1; j < labelData.length; j++) {
                      const label1 = labelData[i]
                      const label2 = labelData[j]
                      
                      // Calculate distance between labels
                      const dx = label2.labelX - label1.labelX
                      const dy = label2.labelY - label1.labelY
                      const distance = Math.sqrt(dx * dx + dy * dy)
                      
                      if (distance < MIN_DISTANCE) {
                        // Labels overlap, adjust positions
                        const overlap = MIN_DISTANCE - distance
                        
                        // First try: move along curve (spread them out)
                        const tAdjustment = overlap / 300
                        label1.t = Math.max(0.2, label1.t - tAdjustment)
                        label2.t = Math.min(0.8, label2.t + tAdjustment)
                        
                        // Second: add perpendicular offset (move up/down from curve)
                        // Alternate direction for each label
                        if (Math.abs(label1.perpendicularOffset) < MAX_PERPENDICULAR_OFFSET) {
                          label1.perpendicularOffset = (label1.perpendicularOffset || 0) - overlap * 0.5
                        }
                        if (Math.abs(label2.perpendicularOffset) < MAX_PERPENDICULAR_OFFSET) {
                          label2.perpendicularOffset = (label2.perpendicularOffset || 0) + overlap * 0.5
                        }
                        
                        // Recalculate positions with new t and perpendicular offset
                        const pos1 = label1.calculatePositionOnCurve(label1.t, label1.perpendicularOffset)
                        const pos2 = label2.calculatePositionOnCurve(label2.t, label2.perpendicularOffset)
                        
                        label1.labelX = pos1.x
                        label1.labelY = pos1.y
                        label2.labelX = pos2.x
                        label2.labelY = pos2.y
                      }
                    }
                  }
                }
                
                // Render labels with adjusted positions
                return labelData.map(({ edge, labelX, labelY }) => {
                  const isHovered = hoveredEdgeLabelId === edge.id
                  
                  return (
                    <div
                      key={edge.id}
                      className="nodrag nopan"
                      style={{
                        position: 'absolute',
                        left: labelX,
                        top: labelY,
                        transform: 'translate(-50%, -50%)',
                        fontSize: '12px',
                        fontWeight: 400,
                        color: isHovered 
                          ? (theme === 'dark' ? 'rgba(232, 232, 232, 0.95)' : 'rgba(26, 26, 26, 0.95)')
                          : (theme === 'dark' ? 'rgba(232, 232, 232, 0.65)' : 'rgba(26, 26, 26, 0.65)'),
                        background: bgColor,
                        padding: '4px 8px',
                        borderRadius: '6px',
                        border: `1px solid ${theme === 'dark' ? 'rgba(255, 255, 255, 0.15)' : 'rgba(0, 0, 0, 0.15)'}`,
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'break-word',
                        display: 'inline-block',
                        width: 'max-content',
                        maxWidth: '200px',
                        textAlign: 'center',
                        pointerEvents: 'all',
                        lineHeight: '1.4',
                        zIndex: 1000,
                        cursor: 'text',
                        transition: 'color 0.2s ease',
                        writingMode: 'horizontal-tb',
                        textOrientation: 'mixed',
                      }}
                      onMouseEnter={() => setHoveredEdgeLabelId(edge.id)}
                      onMouseLeave={() => setHoveredEdgeLabelId(null)}
                      onDoubleClick={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        handleEdgeDoubleClick(e as any, edge)
                      }}
                      onClick={(e) => {
                        e.stopPropagation()
                      }}
                    >
                      {edge.label}
                    </div>
                  )
                })
              })()}
            </EdgeLabelRenderer>
          </ReactFlow>

          {/* Right-click drag preview line */}
          {rightClickDragStateRef.current.isDragging && dragPreviewPosition && reactFlowInstance.current && canvasContainerRef.current && (() => {
            const state = rightClickDragStateRef.current
            const sourceNode = nodes.find((n) => n.id === state.sourceNodeId)
            
            if (!sourceNode || !state.sourceNodeId) return null

            const containerRect = canvasContainerRef.current.getBoundingClientRect()
            
            // Try to find the actual handle DOM element to get its exact position
            // This ensures we use the same coordinate system as the SVG (relative to canvasContainerRef)
            // React Flow nodes have data-id attribute, handles have data-handleid attribute
            const nodeElement = canvasContainerRef.current.querySelector(`[data-id="${state.sourceNodeId}"]`) as HTMLElement
            const handleElement = nodeElement?.querySelector(`[data-handleid="${state.sourceHandleId}"], [data-handleid="${state.sourceHandleId}-source"], [data-handleid="${state.sourceHandleId}-target"]`) as HTMLElement
            let sourceScreen: { x: number; y: number }
            
            if (handleElement) {
              // Use actual DOM element position for accuracy
              const handleRect = handleElement.getBoundingClientRect()
              sourceScreen = {
                x: handleRect.left + handleRect.width / 2 - containerRect.left,
                y: handleRect.top + handleRect.height / 2 - containerRect.top,
              }
            } else {
              // Fallback: calculate handle position using flow coordinates
              const sourceNodeWidth = (sourceNode as any).measured?.width || (sourceNode as any).width || 200
              const sourceNodeHeight = (sourceNode as any).measured?.height || (sourceNode as any).height || 100
              
              let sourceX = sourceNode.position.x + sourceNodeWidth / 2
              let sourceY = sourceNode.position.y + sourceNodeHeight / 2
              
              if (state.sourceHandleId === 'top-source') {
                sourceX = sourceNode.position.x + sourceNodeWidth / 2
                sourceY = sourceNode.position.y
              } else if (state.sourceHandleId === 'bottom-source') {
                sourceX = sourceNode.position.x + sourceNodeWidth / 2
                sourceY = sourceNode.position.y + sourceNodeHeight
              } else if (state.sourceHandleId === 'left-source') {
                sourceX = sourceNode.position.x
                sourceY = sourceNode.position.y + sourceNodeHeight / 2
              } else if (state.sourceHandleId === 'right-source') {
                sourceX = sourceNode.position.x + sourceNodeWidth
                sourceY = sourceNode.position.y + sourceNodeHeight / 2
              }
              
              // Convert flow coordinates to screen coordinates relative to React Flow viewport
              const flowScreen = reactFlowInstance.current.flowToScreenPosition({ x: sourceX, y: sourceY })
              
              // React Flow's flowToScreenPosition returns coordinates relative to its internal viewport
              // We need to find the React Flow viewport element to get its offset relative to canvasContainerRef
              const reactFlowViewport = canvasContainerRef.current.querySelector('.react-flow__viewport') as HTMLElement
              if (reactFlowViewport) {
                const viewportRect = reactFlowViewport.getBoundingClientRect()
                sourceScreen = {
                  x: flowScreen.x + (viewportRect.left - containerRect.left),
                  y: flowScreen.y + (viewportRect.top - containerRect.top),
                }
              } else {
                // Fallback: assume flowToScreenPosition is already relative to container
                sourceScreen = flowScreen
              }
            }
            
            // dragPreviewPosition is already in screen coordinates relative to canvasContainerRef
            const targetScreen = dragPreviewPosition

            return (
              <svg
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  height: '100%',
                  pointerEvents: 'none',
                  zIndex: 1000,
                }}
              >
                <defs>
                  <marker
                    id="arrowhead-preview"
                    markerWidth="12"
                    markerHeight="12"
                    refX="10"
                    refY="4"
                    orient="auto"
                    markerUnits="userSpaceOnUse"
                  >
                    <path
                      d="M 0 0 L 0 8 L 10 4 Z"
                      fill={theme === 'dark' ? '#505050' : '#C0C0C0'}
                      stroke={theme === 'dark' ? '#505050' : '#C0C0C0'}
                      strokeWidth={0.5}
                    />
                  </marker>
                </defs>
                <path
                  d={`M ${sourceScreen.x},${sourceScreen.y} L ${targetScreen.x},${targetScreen.y}`}
                  stroke={theme === 'dark' ? 'rgba(255, 255, 255, 0.18)' : 'rgba(0, 0, 0, 0.15)'}
                  strokeWidth={2}
                  strokeDasharray="5,5"
                  fill="none"
                  markerEnd="url(#arrowhead-preview)"
                />
              </svg>
            )
          })()}

          {/* Inline Edge Label Input */}
          {inlineEditingEdgeId && inlineEditingPosition && (() => {
            const edge = edges.find((e) => e.id === inlineEditingEdgeId)
            if (!edge) {
              return null
            }

            // Get current zoom level to scale input size
            const zoom = reactFlowInstance.current?.getViewport().zoom || 1
            const baseFontSize = 12
            const basePadding = 4
            const basePaddingX = 8
            const baseMaxWidth = 140
            const baseBorderRadius = 6

            return (
              <div
                style={{
                  position: 'absolute',
                  left: `${inlineEditingPosition.x}px`,
                  top: `${inlineEditingPosition.y}px`,
                  transform: 'translate(-50%, -50%)',
                  zIndex: 10000,
                  pointerEvents: 'all',
                  backgroundColor: 'transparent', // Ensure container doesn't block
                }}
                onMouseDown={(e) => e.stopPropagation()}
                onMouseUp={(e) => e.stopPropagation()}
              >
                <textarea
                  ref={inlineEdgeInputRef}
                  defaultValue={edge.label || ''}
                  placeholder="Relation"
                  rows={1}
                  style={{
                    padding: `${basePadding * zoom}px ${basePaddingX * zoom}px`,
                    fontSize: `${baseFontSize * zoom}px`,
                    fontWeight: 400,
                    color: theme === 'dark' ? 'rgba(232, 232, 232, 0.95)' : 'rgba(26, 26, 26, 0.95)',
                    background: bgColor,
                    border: `1px solid ${theme === 'dark' ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.12)'}`,
                    borderRadius: `${baseBorderRadius * zoom}px`,
                    outline: 'none',
                    resize: 'none',
                    overflow: 'hidden',
                    fontFamily: 'inherit',
                    lineHeight: '1.4',
                    maxWidth: `${baseMaxWidth * zoom}px`,
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                    textAlign: 'center',
                  }}
                  onKeyDown={(e) => {
                    // Enter to save (for edge label editing)
                    if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
                      e.preventDefault()
                      handleInlineEdgeLabelSave(inlineEditingEdgeId, e.currentTarget.value)
                    }
                    // Ctrl/Cmd+Enter to save (alternative)
                    else if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                      e.preventDefault()
                      handleInlineEdgeLabelSave(inlineEditingEdgeId, e.currentTarget.value)
                    } 
                    // Escape to cancel
                    else if (e.key === 'Escape') {
                      e.preventDefault()
                      handleInlineEdgeLabelCancel()
                    }
                    // Auto-resize on input
                    if (e.key === 'Enter' || e.key.length === 1 || e.key === 'Backspace' || e.key === 'Delete') {
                      setTimeout(() => {
                        if (inlineEdgeInputRef.current) {
                          inlineEdgeInputRef.current.style.height = 'auto'
                          inlineEdgeInputRef.current.style.height = `${inlineEdgeInputRef.current.scrollHeight}px`
                        }
                      }, 0)
                    }
                  }}
                  onInput={(e) => {
                    // Auto-resize on input
                    const textarea = e.currentTarget
                    textarea.style.height = 'auto'
                    textarea.style.height = `${textarea.scrollHeight}px`
                  }}
                  onBlur={() => {
                    if (inlineEdgeInputRef.current) {
                      handleInlineEdgeLabelSave(inlineEditingEdgeId, inlineEdgeInputRef.current.value)
                    }
                  }}
                  onClick={(e) => e.stopPropagation()}
                />
              </div>
            )
          })()}


          {/* Edge Properties Panel */}
          {editingEdgeId && (() => {
            const edge = edges.find((e) => e.id === editingEdgeId)
            if (!edge) return null
            
            const edgeData = ((edge as any).data as any) || {}
            const edgeType = edgeData.edgeType || 'default'
            const strength = edgeData.strength || 1
            const isBidirectional = edges.some(
              (e) => e.source === edge.target && e.target === edge.source
            )

            return (
              <ReactFlowPanel position="top-right" style={{ margin: '10px', zIndex: 10 }}>
                <div
                  style={{
                    background: theme === 'dark' ? 'rgba(30, 30, 30, 0.98)' : 'rgba(255, 255, 255, 0.98)',
                    border: `1px solid ${borderColor}`,
                    borderRadius: '16px',
                    padding: '24px',
                    minWidth: '320px',
                    maxWidth: '400px',
                    boxShadow: theme === 'dark'
                      ? '0 12px 48px rgba(0, 0, 0, 0.4)'
                      : '0 12px 48px rgba(0, 0, 0, 0.12)',
                    backdropFilter: 'blur(20px)',
                    fontFamily: "'Inter', 'Noto Sans SC', -apple-system, BlinkMacSystemFont, sans-serif",
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      marginBottom: '20px',
                    }}
                  >
                    <h3
                      style={{
                        fontSize: '16px',
                        fontWeight: 600,
                        color: theme === 'dark' ? '#E8E8E8' : '#1A1A1A',
                        margin: 0,
                      }}
                    >
                      Edit Connection
                    </h3>
                    <button
                      onClick={() => setEditingEdgeId(null)}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: theme === 'dark' ? '#9E9E9E' : '#6B6B6B',
                        fontSize: '24px',
                        cursor: 'pointer',
                        padding: '0',
                        width: '32px',
                        height: '32px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        borderRadius: '6px',
                        transition: 'background 0.15s',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = theme === 'dark' ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.05)'
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = 'transparent'
                      }}
                    >
                      ×
                    </button>
                  </div>

                  {/* Label */}
                  <div style={{ marginBottom: '20px' }}>
                    <label
                      style={{
                        display: 'block',
                        fontSize: '12px',
                        fontWeight: 500,
                        color: theme === 'dark' ? '#9E9E9E' : '#6B6B6B',
                        marginBottom: '8px',
                      }}
                    >
                      Label
                    </label>
                    <input
                      type="text"
                      defaultValue={edge.label || ''}
                      placeholder="Enter connection label..."
                      onBlur={(e) => {
                        handleEdgePropertyUpdate(editingEdgeId, { label: e.target.value })
                      }}
                      style={{
                        width: '100%',
                        padding: '10px 12px',
                        background: theme === 'dark' ? 'rgba(40, 40, 40, 0.6)' : 'rgba(248, 249, 250, 0.8)',
                        border: `1px solid ${borderColor}`,
                        borderRadius: '8px',
                        color: theme === 'dark' ? '#E8E8E8' : '#1A1A1A',
                        fontSize: '14px',
                        outline: 'none',
                      }}
                    />
                  </div>

                  {/* Edge Type */}
                  <div style={{ marginBottom: '20px' }}>
                    <label
                      style={{
                        display: 'block',
                        fontSize: '12px',
                        fontWeight: 500,
                        color: theme === 'dark' ? '#9E9E9E' : '#6B6B6B',
                        marginBottom: '8px',
                      }}
                    >
                      Line Style
                    </label>
                    <select
                      value={edgeType}
                      onChange={(e) => {
                        handleEdgePropertyUpdate(editingEdgeId, { edgeType: e.target.value })
                      }}
                      style={{
                        width: '100%',
                        padding: '10px 12px',
                        background: theme === 'dark' ? 'rgba(40, 40, 40, 0.6)' : 'rgba(248, 249, 250, 0.8)',
                        border: `1px solid ${borderColor}`,
                        borderRadius: '8px',
                        color: theme === 'dark' ? '#E8E8E8' : '#1A1A1A',
                        fontSize: '14px',
                        outline: 'none',
                        cursor: 'pointer',
                      }}
                    >
                      <option value="default">Solid</option>
                      <option value="dashed">Dashed</option>
                      <option value="dotted">Dotted</option>
                      <option value="dashdot">Dash-dot</option>
                    </select>
                  </div>

                  {/* Strength/Thickness */}
                  <div style={{ marginBottom: '20px' }}>
                    <label
                      style={{
                        display: 'block',
                        fontSize: '12px',
                        fontWeight: 500,
                        color: theme === 'dark' ? '#9E9E9E' : '#6B6B6B',
                        marginBottom: '8px',
                      }}
                    >
                      Thickness: {strength.toFixed(1)}
                    </label>
                    <input
                      type="range"
                      min="0.5"
                      max="3"
                      step="0.1"
                      value={strength}
                      onChange={(e) => {
                        handleEdgePropertyUpdate(editingEdgeId, { strength: parseFloat(e.target.value) })
                      }}
                      style={{
                        width: '100%',
                        cursor: 'pointer',
                      }}
                    />
                  </div>

                  {/* Bidirectional Toggle */}
                  <div style={{ marginBottom: '20px' }}>
                    <label
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '10px',
                        cursor: 'pointer',
                        fontSize: '14px',
                        color: theme === 'dark' ? '#E8E8E8' : '#1A1A1A',
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={isBidirectional}
                        onChange={(e) => {
                          handleEdgePropertyUpdate(editingEdgeId, { bidirectional: e.target.checked })
                        }}
                        style={{
                          width: '18px',
                          height: '18px',
                          cursor: 'pointer',
                        }}
                      />
                      <span>Bidirectional</span>
                    </label>
                  </div>
                </div>
              </ReactFlowPanel>
            )
          })()}

          {/* Keyboard Shortcuts Modal */}
          {showShortcutsModal && (
            <div
              style={{
                position: 'fixed',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                background: 'rgba(0, 0, 0, 0.5)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 10001,
                backdropFilter: 'blur(4px)',
              }}
              onClick={() => setShowShortcutsModal(false)}
            >
              <div
                style={{
                  background: theme === 'dark' ? 'rgba(30, 30, 30, 0.98)' : 'rgba(255, 255, 255, 0.98)',
                  border: `1px solid ${borderColor}`,
                  borderRadius: '16px',
                  boxShadow: theme === 'dark' ? '0 12px 48px rgba(0, 0, 0, 0.5)' : '0 12px 48px rgba(0, 0, 0, 0.2)',
                  padding: '32px',
                  maxWidth: '600px',
                  maxHeight: '80vh',
                  overflow: 'auto',
                  backdropFilter: 'blur(20px)',
                  fontFamily: "'Inter', 'Noto Sans SC', -apple-system, BlinkMacSystemFont, sans-serif",
                }}
                onClick={(e) => e.stopPropagation()}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: '24px',
                  }}
                >
                  <h2
                    style={{
                      fontSize: '20px',
                      fontWeight: 600,
                      color: theme === 'dark' ? '#E8E8E8' : '#1A1A1A',
                      margin: 0,
                    }}
                  >
                    Keyboard Shortcuts
                  </h2>
                  <button
                    onClick={() => setShowShortcutsModal(false)}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: theme === 'dark' ? '#9E9E9E' : '#6B6B6B',
                      fontSize: '24px',
                      cursor: 'pointer',
                      padding: '0',
                      width: '32px',
                      height: '32px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      borderRadius: '6px',
                      transition: 'background 0.15s',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = theme === 'dark' ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.05)'
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'transparent'
                    }}
                  >
                    ×
                  </button>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                  {/* Editing */}
                  <div>
                    <h3
                      style={{
                        fontSize: '14px',
                        fontWeight: 600,
                        color: theme === 'dark' ? '#9E9E9E' : '#6B6B6B',
                        marginBottom: '12px',
                        textTransform: 'uppercase',
                        letterSpacing: '0.5px',
                      }}
                    >
                      Editing
                    </h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {[
                        { keys: ['Ctrl/Cmd', 'Z'], desc: 'Undo' },
                        { keys: ['Ctrl/Cmd', 'Shift', 'Z'], desc: 'Redo' },
                        { keys: ['Ctrl/Cmd', 'Y'], desc: 'Redo' },
                        { keys: ['Delete'], desc: 'Delete selected elements' },
                        { keys: ['Backspace'], desc: 'Delete selected elements' },
                      ].map((item, idx) => (
                        <div
                          key={idx}
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            padding: '8px 0',
                          }}
                        >
                          <span style={{ color: theme === 'dark' ? '#E8E8E8' : '#1A1A1A', fontSize: '14px' }}>
                            {item.desc}
                          </span>
                          <div style={{ display: 'flex', gap: '4px' }}>
                            {item.keys.map((key, keyIdx) => (
                              <kbd
                                key={keyIdx}
                                style={{
                                  padding: '4px 8px',
                                  background: theme === 'dark' ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.05)',
                                  border: `1px solid ${borderColor}`,
                                  borderRadius: '4px',
                                  fontSize: '12px',
                                  fontFamily: 'monospace',
                                  color: theme === 'dark' ? '#E8E8E8' : '#1A1A1A',
                                  fontWeight: 500,
                                }}
                              >
                                {key}
                              </kbd>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Navigation */}
                  <div>
                    <h3
                      style={{
                        fontSize: '14px',
                        fontWeight: 600,
                        color: theme === 'dark' ? '#9E9E9E' : '#6B6B6B',
                        marginBottom: '12px',
                        textTransform: 'uppercase',
                        letterSpacing: '0.5px',
                      }}
                    >
                      Navigation
                    </h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {[
                        { keys: ['Space', '+', 'Drag'], desc: 'Pan canvas' },
                        { keys: ['Esc'], desc: 'Deselect / Close panel' },
                      ].map((item, idx) => (
                        <div
                          key={idx}
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            padding: '8px 0',
                          }}
                        >
                          <span style={{ color: theme === 'dark' ? '#E8E8E8' : '#1A1A1A', fontSize: '14px' }}>
                            {item.desc}
                          </span>
                          <div style={{ display: 'flex', gap: '4px' }}>
                            {item.keys.map((key, keyIdx) => (
                              <kbd
                                key={keyIdx}
                                style={{
                                  padding: '4px 8px',
                                  background: theme === 'dark' ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.05)',
                                  border: `1px solid ${borderColor}`,
                                  borderRadius: '4px',
                                  fontSize: '12px',
                                  fontFamily: 'monospace',
                                  color: theme === 'dark' ? '#E8E8E8' : '#1A1A1A',
                                  fontWeight: 500,
                                }}
                              >
                                {key}
                              </kbd>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Help */}
                  <div>
                    <h3
                      style={{
                        fontSize: '14px',
                        fontWeight: 600,
                        color: theme === 'dark' ? '#9E9E9E' : '#6B6B6B',
                        marginBottom: '12px',
                        textTransform: 'uppercase',
                        letterSpacing: '0.5px',
                      }}
                    >
                      Help
                    </h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          padding: '8px 0',
                        }}
                      >
                        <span style={{ color: theme === 'dark' ? '#E8E8E8' : '#1A1A1A', fontSize: '14px' }}>
                          Show shortcuts
                        </span>
                        <kbd
                          style={{
                            padding: '4px 8px',
                            background: theme === 'dark' ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.05)',
                            border: `1px solid ${borderColor}`,
                            borderRadius: '4px',
                            fontSize: '12px',
                            fontFamily: 'monospace',
                            color: theme === 'dark' ? '#E8E8E8' : '#1A1A1A',
                            fontWeight: 500,
                          }}
                        >
                          ?
                        </kbd>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
          
          {/* Floating Node Editor - Fixed at bottom-right corner */}
          {editingNodeId && editorPosition && floatingEditor && (
            <div
              ref={editorRef}
              onClick={(e) => e.stopPropagation()}
              style={{
                position: 'absolute',
                right: '20px',
                bottom: '20px',
                width: '350px',
                height: '350px',
                background: theme === 'dark'
                  ? 'rgba(28, 28, 28, 0.98)'
                  : 'rgba(255, 255, 255, 0.98)',
                border: `1px solid ${theme === 'dark' ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.1)'}`,
                borderRadius: '12px',
                boxShadow: theme === 'dark'
                  ? '0 20px 60px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(255, 255, 255, 0.06)'
                  : '0 20px 60px rgba(0, 0, 0, 0.12), 0 0 0 1px rgba(0, 0, 0, 0.06)',
                zIndex: 10000,
                backdropFilter: 'blur(24px)',
                display: 'flex',
                flexDirection: 'column',
                fontFamily: "'Inter', 'Noto Sans SC', -apple-system, BlinkMacSystemFont, sans-serif",
                animation: 'fadeInSlide 0.2s ease-out',
                overflow: 'hidden',
              }}
            >
              <style>{`
                @keyframes fadeInSlide {
                  from {
                    opacity: 0;
                    transform: translateY(-8px) scale(0.98);
                  }
                  to {
                    opacity: 1;
                    transform: translateY(0) scale(1);
                  }
                }
              `}</style>
              {/* Header with node name */}
              <div
                style={{
                  padding: '12px 16px',
                  background: theme === 'dark' ? 'rgba(255, 255, 255, 0.02)' : 'rgba(0, 0, 0, 0.01)',
                }}
              >
                <div
                  style={{
                    fontSize: '14px',
                    fontWeight: 500,
                    color: theme === 'dark' ? '#E8E8E8' : '#1A1A1A',
                    letterSpacing: '-0.01em',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {nodes.find(n => n.id === editingNodeId)?.data?.label || editingNodeId}
                </div>
              </div>
              {/* Editor Content */}
              <div
                style={{
                  flex: 1,
                  overflow: 'auto',
                  padding: '16px',
                }}
              >
                <EditorContent editor={floatingEditor} />
                <style>{`
                  .ProseMirror {
                    outline: none;
                    color: ${theme === 'dark' ? '#E0E0E0' : '#1F1F1F'};
                    font-size: 12px;
                    line-height: 1.7;
                    letter-spacing: -0.01em;
                  }
                  .ProseMirror p {
                    margin: 0.75em 0;
                    word-wrap: break-word;
                  }
                  .ProseMirror p:first-child {
                    margin-top: 0;
                  }
                  .ProseMirror p:last-child {
                    margin-bottom: 0;
                  }
                  .ProseMirror p.is-editor-empty:first-child::before {
                    content: attr(data-placeholder);
                    float: left;
                    color: ${theme === 'dark' ? 'rgba(255, 255, 255, 0.4)' : 'rgba(0, 0, 0, 0.4)'};
                    pointer-events: none;
                    height: 0;
                    font-style: italic;
                  }
                  .ProseMirror h1, .ProseMirror h2, .ProseMirror h3 {
                    font-weight: 600;
                    margin-top: 1.25em;
                    margin-bottom: 0.5em;
                    color: ${theme === 'dark' ? '#F0F0F0' : '#1A1A1A'};
                    letter-spacing: -0.02em;
                  }
                  .ProseMirror h1 { 
                    font-size: 1.75em; 
                    margin-top: 0;
                  }
                  .ProseMirror h2 { 
                    font-size: 1.4em; 
                  }
                  .ProseMirror h3 { 
                    font-size: 1.15em; 
                  }
                  .ProseMirror ul, .ProseMirror ol {
                    padding-left: 1.75em;
                    margin: 0.75em 0;
                  }
                  .ProseMirror li {
                    margin: 0.4em 0;
                  }
                  .ProseMirror code {
                    background: ${theme === 'dark' ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.06)'};
                    padding: 3px 6px;
                    border-radius: 4px;
                    font-size: 0.9em;
                    font-family: 'SF Mono', 'Monaco', 'Inconsolata', 'Roboto Mono', monospace;
                    color: ${theme === 'dark' ? '#E8E8E8' : '#1A1A1A'};
                  }
                  .ProseMirror pre {
                    background: ${theme === 'dark' ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.04)'};
                    padding: 16px;
                    border-radius: 8px;
                    overflow-x: auto;
                    margin: 1em 0;
                    border: 1px solid ${theme === 'dark' ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.08)'};
                  }
                  .ProseMirror pre code {
                    background: transparent;
                    padding: 0;
                    border-radius: 0;
                  }
                  .ProseMirror blockquote {
                    border-left: 3px solid ${theme === 'dark' ? 'rgba(255, 255, 255, 0.25)' : 'rgba(0, 0, 0, 0.2)'};
                    padding-left: 1.25em;
                    margin: 1em 0;
                    font-style: italic;
                    color: ${theme === 'dark' ? 'rgba(255, 255, 255, 0.7)' : 'rgba(0, 0, 0, 0.7)'};
                  }
                  .ProseMirror strong {
                    font-weight: 600;
                    color: ${theme === 'dark' ? '#F0F0F0' : '#1A1A1A'};
                  }
                  .ProseMirror em {
                    font-style: italic;
                  }
                  .ProseMirror a {
                    color: ${theme === 'dark' ? '#5BA3FF' : '#1976D2'};
                    text-decoration: none;
                    border-bottom: 1px solid ${theme === 'dark' ? 'rgba(91, 163, 255, 0.3)' : 'rgba(25, 118, 210, 0.3)'};
                    transition: border-color 0.2s;
                  }
                  .ProseMirror a:hover {
                    border-bottom-color: ${theme === 'dark' ? '#5BA3FF' : '#1976D2'};
                  }
                  /* Custom scrollbar */
                  .ProseMirror::-webkit-scrollbar {
                    width: 8px;
                    height: 8px;
                  }
                  .ProseMirror::-webkit-scrollbar-track {
                    background: transparent;
                  }
                  .ProseMirror::-webkit-scrollbar-thumb {
                    background: ${theme === 'dark' ? 'rgba(255, 255, 255, 0.2)' : 'rgba(0, 0, 0, 0.2)'};
                    border-radius: 4px;
                  }
                  .ProseMirror::-webkit-scrollbar-thumb:hover {
                    background: ${theme === 'dark' ? 'rgba(255, 255, 255, 0.3)' : 'rgba(0, 0, 0, 0.3)'};
                  }
                `}</style>
              </div>
            </div>
          )}
        </div>
      </Panel>

    </PanelGroup>
    </>
  )
}

export default function WorldLabCanvas(props: WorldLabCanvasProps) {
  return (
    <ReactFlowProvider>
      <WorldLabCanvasInner {...props} />
    </ReactFlowProvider>
  )
}
