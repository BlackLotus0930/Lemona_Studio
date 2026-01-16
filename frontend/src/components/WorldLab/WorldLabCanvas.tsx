import React, { useCallback, useState, useRef, useEffect, useLayoutEffect, useMemo } from 'react'
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
  EdgeLabelRenderer,
  getBezierPath,
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
    Idea: {
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

// Category list
const CATEGORIES = ['Character', 'Event', 'Concept', 'Place', 'Idea']

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
  const renameInputRef = useRef<HTMLInputElement>(null)
  const labelRef = useRef<HTMLDivElement>(null)
  const categoryDropdownRef = useRef<HTMLDivElement>(null)
  const [isCategoryDropdownOpen, setIsCategoryDropdownOpen] = useState(false)
  const [inputWidth, setInputWidth] = useState<number | undefined>(undefined)
  const [isHovered, setIsHovered] = useState(false)
  const [isRenameInputFocused, setIsRenameInputFocused] = useState(false)
  
  // Get connection state from data
  const isConnecting = data.isConnecting || false
  const connectingFromNodeId = data.connectingFromNodeId || null
  
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
  
  // Always use a category - default to 'Character' if none set
  const nodeCategory = data.category || 'Character'
  const categoryColors = getCategoryColor(nodeCategory, theme)

  // Handle configuration - four handles on all sides
  const handleConfigs = [
    { id: 'top-target', type: 'target' as const, position: Position.Top },
    { id: 'bottom-source', type: 'source' as const, position: Position.Bottom },
    { id: 'left-target', type: 'target' as const, position: Position.Left },
    { id: 'right-source', type: 'source' as const, position: Position.Right },
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

  // Measure label width when renaming starts and apply to input
  // Use useLayoutEffect to measure synchronously before browser paints
  useLayoutEffect(() => {
    if (isRenaming) {
      // Measure the label width (it's still in DOM, just hidden)
      if (labelRef.current) {
        const width = labelRef.current.offsetWidth
        // Add extra width for better usability (30px padding + 15% of width)
        const extraWidth = 30 + Math.floor(width * 0.15)
        setInputWidth(Math.max(width + extraWidth, 100)) // Minimum width of 100px
      }
    } else {
      // Reset input width when not renaming
      setInputWidth(undefined)
    }
  }, [isRenaming])
  
  // Focus input when renaming starts (without scrolling/zooming)
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
        }
      })
    }
  }, [isRenaming, data.label, data.elementName, data.id])

  // Handle click outside to close category dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (categoryDropdownRef.current && !categoryDropdownRef.current.contains(event.target as HTMLElement)) {
        setIsCategoryDropdownOpen(false)
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
    }
  }, [isCategoryDropdownOpen])

  const handleCategoryClick = (e: React.MouseEvent) => {
    e.stopPropagation() // Prevent node click
    setIsCategoryDropdownOpen(!isCategoryDropdownOpen)
  }

  const handleCategorySelect = (category: string) => {
    setIsCategoryDropdownOpen(false)
    onCategoryChange(category)
  }

  // Handle rename input
  const handleRenameKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      const newLabel = e.currentTarget.value.trim()
      if (newLabel) {
        onRename(newLabel)
      } else {
        onRenameCancel()
      }
      // Remove focus from input after Enter
      if (renameInputRef.current) {
        renameInputRef.current.blur()
      }
    } else if (e.key === 'Escape') {
      e.preventDefault()
      onRenameCancel()
      // Remove focus from input after Escape
      if (renameInputRef.current) {
        renameInputRef.current.blur()
      }
    }
  }

  const handleRenameBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    const newLabel = e.currentTarget.value.trim()
    if (newLabel) {
      onRename(newLabel)
    } else {
      onRenameCancel()
    }
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

  return (
    <div
      className="world-lab-node"
      style={{
        background: nodeBg,
        border: `${selected ? '2px' : '3px'} solid ${borderColor}`,
        borderRadius: '12px',
        padding: '20px 24px',
        minWidth: '180px',
        maxWidth: '220px',
        boxShadow: selected
          ? `0 8px 32px ${shadowColor}, 0 0 0 3px ${categoryColors.glow}`
          : `0 4px 16px ${shadowColor}`,
        position: 'relative',
        backdropFilter: 'blur(10px)',
        fontFamily: "'Inter', 'Noto Sans SC', -apple-system, BlinkMacSystemFont, sans-serif",
        cursor: 'pointer',
        transition: 'border-width 0.2s ease, border-color 0.2s ease, box-shadow 0.3s ease, transform 0.2s ease',
        transform: selected ? 'scale(1.01)' : 'scale(1)',
      }}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
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
        
        return (
          <Handle
            key={handleConfig.id}
            id={handleConfig.id}
            type={handleConfig.type}
            position={handleConfig.position}
            // Don't add onMouseDown here - React Flow needs to handle it for connections to work
            style={{
              background: categoryColors.primary,
              width: '10px',
              height: '10px',
              border: `2px solid ${theme === 'dark' ? '#1a1a1a' : '#ffffff'}`,
              borderRadius: '50%',
              opacity: shouldShowHandles ? 1 : 0,
              visibility: shouldShowHandles ? 'visible' : 'hidden',
              transition: 'opacity 0.2s ease, visibility 0.2s ease',
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
              : '0 2px 8px rgba(0, 0, 0, 0.15)',
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
              const isSelected = (data.category || 'Character') === cat
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
      {/* Input field for renaming */}
      {isRenaming && (
        <input
          ref={renameInputRef}
          type="text"
          defaultValue={data.label || data.elementName || data.id}
          onKeyDown={handleRenameKeyDown}
          onBlur={(e) => {
            setIsRenameInputFocused(false)
            handleRenameBlur(e)
          }}
          onFocus={() => setIsRenameInputFocused(true)}
          style={{
            width: inputWidth !== undefined ? `${inputWidth}px` : 'auto',
            minWidth: '60px',
            maxWidth: '100%',
            height: '22px', // Increased height
            fontSize: '16px', // Match label font size
            fontWeight: 400,
            color: nodeTextColor,
            background: theme === 'dark' ? 'rgba(40, 40, 40, 0.8)' : 'rgba(248, 249, 250, 0.9)',
            border: isRenameInputFocused 
              ? `1px solid ${theme === 'dark' ? 'rgba(255, 255, 255, 0.2)' : 'rgba(0, 0, 0, 0.2)'}` // Thin grey border when focused
              : `2px solid ${hexToRgba(categoryColors.primary, 0.5)}`, // Less bright border (50% opacity) when not focused
            borderRadius: '4px', // Less rounded corners
            padding: '0px 10px', // Remove vertical padding since we're using fixed height
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
          }}
          onClick={(e) => e.stopPropagation()}
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
    initialEdges.map((edge) => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      type: edge.type || 'smoothstep',
      label: edge.label,
      animated: edge.animated,
      style: edge.style,
      sourceHandle: edge.sourceHandle,
      targetHandle: edge.targetHandle,
    }))
  )
  const [renamingNodeId, setRenamingNodeId] = useState<string | null>(null)
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const reactFlowInstance = useRef<ReactFlowInstance | null>(null)
  
  // Track previous node positions to detect position changes
  const prevNodePositionsRef = useRef<Map<string, { x: number; y: number }>>(new Map())
  
  // Floating editor state
  const [editingNodeId, setEditingNodeId] = useState<string | null>(null)
  const [editorPosition, setEditorPosition] = useState<{ x: number; y: number } | null>(null)
  const editorRef = useRef<HTMLDivElement>(null)
  const canvasContainerRef = useRef<HTMLDivElement>(null)
  
  // Connection dragging state - track when user is dragging a connection
  const [isConnecting, setIsConnecting] = useState(false)
  const [connectingFromNodeId, setConnectingFromNodeId] = useState<string | null>(null)
  
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
        console.error('Error setting editor content:', error)
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

  // Keyboard shortcuts modal state
  const [showShortcutsModal, setShowShortcutsModal] = useState(false)

  // Normalize edge to match state type
  const normalizeEdge = useCallback((edge: Edge) => {
    return {
      id: edge.id,
      source: edge.source,
      target: edge.target,
      type: typeof edge.type === 'string' ? edge.type : 'default',
      label: typeof edge.label === 'string' ? edge.label : undefined,
      animated: edge.animated ?? undefined,
      style: edge.style,
      sourceHandle: edge.sourceHandle ?? undefined,
      targetHandle: edge.targetHandle ?? undefined,
    }
  }, [])

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
    }))
  }, [])

  // Note: Node and edge changes are handled by onNodesChangeInner and onEdgesChangeInner
  // which are provided by useNodesState and useEdgesState hooks
  // We sync changes through the saveNodes and saveEdges callbacks

  // Calculate optimal handle positions based on shortest path with directional constraints
  // This ensures edges take the most natural route when nodes are moved
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
    
    // Calculate node centers
    const sourceCenterY = sourceY + sourceHeight / 2
    const targetCenterY = targetY + targetHeight / 2
    const sourceCenterX = sourceX + sourceWidth / 2
    const targetCenterX = targetX + targetWidth / 2
    
    // Determine relative position
    const deltaY = targetCenterY - sourceCenterY
    const deltaX = targetCenterX - sourceCenterX
    const absDeltaY = Math.abs(deltaY)
    const absDeltaX = Math.abs(deltaX)
    
    // Calculate handle positions on node edges
    // Source handles (outgoing)
    const sourceHandles = {
      'bottom-source': { x: sourceX + sourceWidth / 2, y: sourceY + sourceHeight },
      'right-source': { x: sourceX + sourceWidth, y: sourceY + sourceHeight / 2 },
    }
    
    // Target handles (incoming)
    const targetHandles = {
      'top-target': { x: targetX + targetWidth / 2, y: targetY },
      'left-target': { x: targetX, y: targetY + targetHeight / 2 },
    }
    
    // Calculate distance for each valid handle combination
    const combinations: Array<{ 
      sourceHandle: string
      targetHandle: string
      distance: number
      directionalScore: number // Bonus for natural directional flow
    }> = []
    
    // Try all valid combinations
    Object.entries(sourceHandles).forEach(([sourceHandleId, sourcePos]) => {
      Object.entries(targetHandles).forEach(([targetHandleId, targetPos]) => {
        // Calculate Euclidean distance
        const dx = targetPos.x - sourcePos.x
        const dy = targetPos.y - sourcePos.y
        const distance = Math.sqrt(dx * dx + dy * dy)
        
        // Calculate directional score (bonus for natural flow)
        let directionalScore = 0
        
        // Vertical relationships: prefer bottom-source -> top-target when target is below
        if (absDeltaY > absDeltaX) {
          if (deltaY > 0) {
            // Target is below source - prefer bottom-source -> top-target
            if (sourceHandleId === 'bottom-source' && targetHandleId === 'top-target') {
              directionalScore = 50 // Strong preference
            }
          } else {
            // Target is above source - prefer bottom-source -> top-target (still natural)
            if (sourceHandleId === 'bottom-source' && targetHandleId === 'top-target') {
              directionalScore = 30 // Moderate preference
            }
          }
        }
        
        // Horizontal relationships: prefer right-source -> left-target when target is to the right
        if (absDeltaX > absDeltaY) {
          if (deltaX > 0) {
            // Target is to the right of source - prefer right-source -> left-target
            if (sourceHandleId === 'right-source' && targetHandleId === 'left-target') {
              directionalScore = 50 // Strong preference
            }
          } else {
            // Target is to the left of source - prefer right-source -> left-target (still natural)
            if (sourceHandleId === 'right-source' && targetHandleId === 'left-target') {
              directionalScore = 30 // Moderate preference
            }
          }
        }
        
        combinations.push({
          sourceHandle: sourceHandleId,
          targetHandle: targetHandleId,
          distance,
          directionalScore,
        })
      })
    })
    
    // Find the combination with best score (distance - directionalScore)
    // Lower score is better (distance minus bonus)
    const best = combinations.reduce((min, combo) => {
      const score = combo.distance - combo.directionalScore
      const minScore = min.distance - min.directionalScore
      return score < minScore ? combo : min
    })
    
    return {
      sourceHandle: best.sourceHandle,
      targetHandle: best.targetHandle,
    }
  }, [])

  // Auto-adjust edge handles when nodes are moved
  // Note: saveEdges will be defined later, so we use a ref to avoid dependency issues
  const saveEdgesRef = useRef<((edges: Edge[], nodes?: Node[]) => void) | null>(null)
  
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
          }
          
          return currentNodes
        })
      }
    },
    [onNodesChangeInner, setNodes, adjustEdgeHandlesOnNodeMove]
  )

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
      console.log(`[WorldLabCanvas] saveNodes called with ${nodesToSave.length} nodes`)
      console.log(`[WorldLabCanvas] saveNodes - node IDs:`, nodesToSave.map((n: any) => n.id))
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current)
      }
      saveTimeoutRef.current = setTimeout(async () => {
        const worldLabNodes = convertToWorldLabNodes(nodesToSave)
        console.log(`[WorldLabCanvas] saveNodes timeout: Converting to ${worldLabNodes.length} WorldLabNodes`)
        console.log(`[WorldLabCanvas] saveNodes timeout - WorldLabNode IDs:`, worldLabNodes.map((n: any) => n.id))
        
        // Update local state first for immediate UI feedback
        if (onNodesChange) {
          onNodesChange(worldLabNodes)
        }
        
        // Persist nodes to backend (positions and metadata)
        try {
          console.log(`[WorldLabCanvas] saveNodes timeout: Calling saveNodePositions for lab: ${labName}`)
          const result = await worldLabApi.saveNodePositions(labName, worldLabNodes)
          console.log(`[WorldLabCanvas] saveNodes timeout: saveNodePositions result:`, result)
        } catch (error) {
          console.error('[WorldLabCanvas] saveNodes timeout: Failed to save nodes:', error)
        }
      }, 500)
    },
    [convertToWorldLabNodes, labName, onNodesChange]
  )

  // Save edges with debounce - also saves current node positions and metadata
  // FIXED: Now accepts nodes parameter to avoid closure stale state issue
  const saveEdges = useCallback(
    (edgesToSave: Edge[], nodesToSave?: Node[]) => {
      // Use provided nodes or fall back to current state (for backward compatibility)
      const nodesToUse = nodesToSave ?? nodes
      console.log(`[WorldLabCanvas] saveEdges called with ${edgesToSave.length} edges`)
      console.log(`[WorldLabCanvas] saveEdges - edge IDs:`, edgesToSave.map((e: any) => `${e.source}->${e.target}`))
      console.log(`[WorldLabCanvas] saveEdges - using ${nodesToUse.length} nodes (provided: ${nodesToSave ? 'yes' : 'no'})`)
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current)
      }
      saveTimeoutRef.current = setTimeout(async () => {
        const worldLabEdges = convertToWorldLabEdges(edgesToSave)
        console.log(`[WorldLabCanvas] saveEdges timeout: Converting to ${worldLabEdges.length} WorldLabEdges`)
        
        // Use the nodes that were passed in (or current state if not provided)
        // This ensures we don't use stale closure state
        const currentNodesSnapshot = nodesToSave ?? nodes
        const worldLabNodes = convertToWorldLabNodes(currentNodesSnapshot)
        console.log(`[WorldLabCanvas] saveEdges timeout: Current nodes count: ${worldLabNodes.length}`)
        console.log(`[WorldLabCanvas] saveEdges timeout: Current node IDs:`, worldLabNodes.map((n: any) => n.id))
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
        
        console.log(`[WorldLabCanvas] saveEdges timeout: Node positions count: ${Object.keys(nodePositions).length}`)
        console.log(`[WorldLabCanvas] saveEdges timeout: Node positions keys:`, Object.keys(nodePositions))
        
        try {
          // Save edges along with current node positions and metadata
          console.log(`[WorldLabCanvas] saveEdges timeout: Calling saveEdges API for lab: ${labName}`)
          const result = await worldLabApi.saveEdges(labName, worldLabEdges, nodePositions, nodeMetadata)
          console.log(`[WorldLabCanvas] saveEdges timeout: saveEdges API result:`, result)
          if (onEdgesChange) {
            onEdgesChange(worldLabEdges)
          }
        } catch (error) {
          console.error('Failed to save edges:', error)
        }
      }, 500)
    },
    [convertToWorldLabEdges, convertToWorldLabNodes, labName, nodes, onEdgesChange]
  )
  
  // Update ref so adjustEdgeHandlesOnNodeMove can use it
  saveEdgesRef.current = saveEdges

  // Note: ReactFlow's useNodesState and useEdgesState handle changes internally
  // We sync state through onNodesChangeInner and onEdgesChangeInner callbacks

  // Add to history for undo/redo (MUST be defined before other handlers use it)
  const addToHistory = useCallback(
    (newNodes: Node[], newEdges: Edge[]) => {
      if (isUndoingRef.current) return

      const newEntry: HistoryEntry = {
        nodes: JSON.parse(JSON.stringify(newNodes)),
        edges: JSON.parse(JSON.stringify(newEdges)),
      }

      setHistory((prev) => {
        // Remove future history if we're not at the end
        const newHistory = prev.slice(0, historyIndex + 1)
        // Add new entry
        newHistory.push(newEntry)
        // Limit history to 50 entries
        if (newHistory.length > 50) {
          newHistory.shift()
          return newHistory
        }
        return newHistory
      })
      setHistoryIndex((prev) => Math.min(prev + 1, 49))
    },
    [historyIndex]
  )

  // Undo function
  const undo = useCallback(() => {
    if (historyIndex <= 0) return

    isUndoingRef.current = true
    const prevEntry = history[historyIndex - 1]
    setNodes(prevEntry.nodes as any)
    setEdges(prevEntry.edges as any)
    setHistoryIndex(historyIndex - 1)
    
    setTimeout(() => {
      isUndoingRef.current = false
    }, 100)
  }, [history, historyIndex, setNodes, setEdges])

  // Redo function
  const redo = useCallback(() => {
    if (historyIndex >= history.length - 1) return

    isUndoingRef.current = true
    const nextEntry = history[historyIndex + 1]
    setNodes(nextEntry.nodes as any)
    setEdges(nextEntry.edges as any)
    setHistoryIndex(historyIndex + 1)
    
    setTimeout(() => {
      isUndoingRef.current = false
    }, 100)
  }, [history, historyIndex, setNodes, setEdges])

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

  // Handle node context menu (right-click)
  const handleNodeContextMenu = useCallback((event: React.MouseEvent, node: Node) => {
    event.preventDefault()
    setContextMenu({
      x: event.clientX,
      y: event.clientY,
      type: 'node',
      nodeId: node.id,
    })
  }, [])

  // Handle edge context menu (right-click)
  const handleEdgeContextMenu = useCallback((event: React.MouseEvent, edge: Edge) => {
    event.preventDefault()
    setContextMenu({
      x: event.clientX,
      y: event.clientY,
      type: 'edge',
      edgeId: edge.id,
    })
  }, [])

  // Handle edge double-click - show inline input for label editing
  const handleEdgeDoubleClick = useCallback(
    (event: React.MouseEvent, edge: Edge) => {
      event.preventDefault()
      event.stopPropagation()

      console.log('[WorldLabCanvas] Edge double-clicked:', edge.id)

      if (!canvasContainerRef.current) {
        console.log('[WorldLabCanvas] No canvas container ref')
        return
      }

      // Use the click position directly - convert from client coordinates to container-relative coordinates
      const containerRect = canvasContainerRef.current.getBoundingClientRect()
      const x = event.clientX - containerRect.left
      const y = event.clientY - containerRect.top

      console.log('[WorldLabCanvas] Setting inline editing:', { edgeId: edge.id, x, y, clientX: event.clientX, clientY: event.clientY })

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
          console.log('[WorldLabCanvas] Textarea focused')
        } else {
          console.log('[WorldLabCanvas] Textarea ref is null')
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
    },
    [nodes, setEdges, addToHistory, saveEdges]
  )

  // Handle inline edge label cancel
  const handleInlineEdgeLabelCancel = useCallback(() => {
    setInlineEditingEdgeId(null)
    setInlineEditingPosition(null)
  }, [])

  // Handle pane context menu (right-click on canvas)
  const handlePaneContextMenu = useCallback((event: MouseEvent | React.MouseEvent) => {
    event.preventDefault()
    setContextMenu({
      x: event.clientX,
      y: event.clientY,
      type: 'pane',
    })
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
        .catch((error) => {
          console.error(`[WorldLabCanvas] Failed to reload node content for ${closedNodeId}:`, error)
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
    [setEdges, saveEdges, normalizeEdge, nodes, addToHistory]
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
          console.error('Failed to create node file:', error)
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
          console.error('Failed to create node file on category change:', error)
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
              category: undefined,
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

  // Context menu actions
  const handleDeleteNode = useCallback(
    async (nodeId: string) => {
      console.log(`[WorldLabCanvas] handleDeleteNode called for node: ${nodeId}`)
      const newNodes = nodes.filter((n) => n.id !== nodeId)
      const newEdges = edges.filter((e) => e.source !== nodeId && e.target !== nodeId)
      
      console.log(`[WorldLabCanvas] handleDeleteNode: ${nodes.length} -> ${newNodes.length} nodes, ${edges.length} -> ${newEdges.length} edges`)
      
      // Store original state for rollback if deletion fails
      const originalNodes = nodes
      const originalEdges = edges
      
      setNodes(newNodes)
      setEdges(newEdges)
      addToHistory(newNodes, newEdges)
      
      console.log(`[WorldLabCanvas] handleDeleteNode: Calling saveNodes with ${newNodes.length} nodes`)
      saveNodes(newNodes)
      console.log(`[WorldLabCanvas] handleDeleteNode: Calling saveEdges with ${newEdges.length} edges and ${newNodes.length} nodes`)
      saveEdges(newEdges, newNodes)
      
      // Delete node file from backend
      try {
        console.log(`[WorldLabCanvas] handleDeleteNode: Attempting to delete node file: ${nodeId} in lab: ${labName}`)
        const result = await worldLabApi.deleteNode(labName, nodeId)
        console.log(`[WorldLabCanvas] handleDeleteNode: Backend deletion result for node ${nodeId}:`, result)
        if (!result) {
          console.error(`[WorldLabCanvas] handleDeleteNode: Backend deletion returned false for node ${nodeId}, rolling back`)
          // Rollback: restore original state
          setNodes(originalNodes as any)
          setEdges(originalEdges as any)
          addToHistory(originalNodes, originalEdges)
          saveNodes(originalNodes)
          saveEdges(originalEdges, originalNodes)
          alert(`Failed to delete node. Changes have been rolled back.`)
          return
        }
      } catch (error) {
        console.error(`[WorldLabCanvas] handleDeleteNode: Failed to delete node file ${nodeId}:`, error)
          // Rollback on error
          setNodes(originalNodes as any)
          setEdges(originalEdges as any)
        addToHistory(originalNodes, originalEdges)
        saveNodes(originalNodes)
        saveEdges(originalEdges, originalNodes)
        alert(`Failed to delete node: ${error}. Changes have been rolled back.`)
        return
      }
      
      setContextMenu(null)
      if (renamingNodeId === nodeId) {
        setRenamingNodeId(null)
      }
    },
    [nodes, edges, setNodes, setEdges, addToHistory, saveNodes, saveEdges, renamingNodeId, labName]
  )

  const handleDuplicateNode = useCallback(
    (nodeId: string) => {
      const nodeToDuplicate = nodes.find((n) => n.id === nodeId)
      if (nodeToDuplicate) {
        const newNodeId = `node_${Date.now()}`
        const newNode = {
          ...nodeToDuplicate,
          id: newNodeId,
          position: {
            x: nodeToDuplicate.position.x + 50,
            y: nodeToDuplicate.position.y + 50,
          },
          selected: false,
        }
        const newNodes = [...nodes, newNode]
        setNodes(newNodes)
        addToHistory(newNodes, edges)
        saveNodes(newNodes)
        setContextMenu(null)
      }
    },
    [nodes, edges, setNodes, addToHistory, saveNodes]
  )

  const handleDeleteEdge = useCallback(
    (edgeId: string) => {
      const newEdges = edges.filter((e) => e.id !== edgeId)
      setEdges(newEdges)
      addToHistory(nodes, newEdges)
      saveEdges(newEdges)
      setContextMenu(null)
    },
    [edges, nodes, setEdges, addToHistory, saveEdges]
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
                // Will be added after this map
                setTimeout(() => {
                  setEdges((current: any) => {
                    const withReverse = [...current, reverseEdge]
                    addToHistory(nodes, withReverse)
                    saveEdges(withReverse, nodes)
                    return withReverse
                  })
                }, 0)
              }
            } else if (updates.bidirectional === false) {
              // Remove reverse edge
              setTimeout(() => {
                setEdges((current: any) => {
                  const filtered = current.filter(
                    (e: any) => !(e.source === edge.target && e.target === edge.source)
                  )
                  addToHistory(nodes, filtered)
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

  // Handle ReactFlow instance initialization
  const handleInit = useCallback((instance: any) => {
    reactFlowInstance.current = instance
  }, [])

  // Keyboard shortcuts and click handlers
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
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
      
      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0
      const ctrlOrCmd = isMac ? e.metaKey : e.ctrlKey

      // Undo: Ctrl/Cmd + Z
      if (ctrlOrCmd && e.key === 'z' && !e.shiftKey) {
        e.preventDefault()
        undo()
      }
      // Redo: Ctrl/Cmd + Shift + Z or Ctrl/Cmd + Y
      else if ((ctrlOrCmd && e.key === 'z' && e.shiftKey) || (ctrlOrCmd && e.key === 'y')) {
        e.preventDefault()
        redo()
      }
      // Delete: Delete or Backspace
      else if (e.key === 'Delete' || e.key === 'Backspace') {
        console.log(`[WorldLabCanvas] ${e.key} key pressed (capture phase)`)
        console.log('[WorldLabCanvas] keydown target:', e.target)
        console.log('[WorldLabCanvas] activeElement:', document.activeElement)
        console.log('[WorldLabCanvas] activeElement tagName:', document.activeElement?.tagName)
        console.log('[WorldLabCanvas] activeElement isContentEditable:', (document.activeElement as HTMLElement)?.isContentEditable)
        
        // Check selection from our own state FIRST (in capture phase, before React Flow processes it)
        const selectedNodesFromState = nodes.filter((n: any) => n.selected)
        const selectedEdgesFromState = edges.filter((e: any) => e.selected)
        
        console.log(`[WorldLabCanvas] Selected nodes from state: ${selectedNodesFromState.length}, Selected edges from state: ${selectedEdgesFromState.length}`)
        console.log(`[WorldLabCanvas] Selected node IDs from state:`, selectedNodesFromState.map((n: any) => n.id))
        
        // Also check React Flow instance as fallback
        let selectedNodes = selectedNodesFromState
        let selectedEdges = selectedEdgesFromState
        
        if (reactFlowInstance.current) {
          const currentNodes = reactFlowInstance.current.getNodes()
          const currentEdges = reactFlowInstance.current.getEdges()
          const selectedNodesFromRF = currentNodes.filter((n: any) => n.selected)
          const selectedEdgesFromRF = currentEdges.filter((e: any) => e.selected)
          
          console.log(`[WorldLabCanvas] Selected nodes from ReactFlow: ${selectedNodesFromRF.length}, Selected edges from ReactFlow: ${selectedEdgesFromRF.length}`)
          console.log(`[WorldLabCanvas] Selected node IDs from ReactFlow:`, selectedNodesFromRF.map((n: any) => n.id))
          
          // Use React Flow selection if state selection is empty (might be more up-to-date)
          if (selectedNodesFromState.length === 0 && selectedNodesFromRF.length > 0) {
            console.log('[WorldLabCanvas] Using ReactFlow selection (state was empty)')
            selectedNodes = selectedNodesFromRF as any
            selectedEdges = selectedEdgesFromRF as any
          }
        }
        
        if (selectedNodes.length > 0 || selectedEdges.length > 0) {
          // Prevent default immediately in capture phase to stop React Flow from processing backspace
          e.preventDefault()
          e.stopPropagation()
          console.log('[WorldLabCanvas] Prevented default and stopped propagation for deletion')
          
          console.log(`[WorldLabCanvas] Processing deletion for ${selectedNodes.length} nodes and ${selectedEdges.length} edges`)
          
          // Filter out selected nodes and edges from state
          const selectedNodeIds = new Set(selectedNodes.map((n: any) => n.id))
          const selectedEdgeIds = new Set(selectedEdges.map((e: any) => e.id))
          const newNodes = nodes.filter((n: any) => !selectedNodeIds.has(n.id))
          const newEdges = edges.filter((e: any) => !selectedEdgeIds.has(e.id))
          
          console.log(`[WorldLabCanvas] Updating state: ${nodes.length} -> ${newNodes.length} nodes, ${edges.length} -> ${newEdges.length} edges`)
          
          // Store original state for rollback if deletion fails
          const originalNodes = nodes
          const originalEdges = edges
          
          setNodes(newNodes)
          setEdges(newEdges)
          addToHistory(newNodes, newEdges)
          
          console.log(`[WorldLabCanvas] Calling saveNodes with ${newNodes.length} nodes`)
          saveNodes(newNodes)
          console.log(`[WorldLabCanvas] Calling saveEdges with ${newEdges.length} edges and ${newNodes.length} nodes`)
          // FIXED: Pass newNodes to saveEdges to avoid stale closure
          saveEdges(newEdges, newNodes)
          
          // Delete node files from backend
          console.log(`[WorldLabCanvas] Starting backend deletion for ${selectedNodes.length} nodes`)
          Promise.all(
            selectedNodes.map(async (node) => {
              try {
                console.log(`[WorldLabCanvas] Attempting to delete node file: ${node.id} in lab: ${labName}`)
                const result = await worldLabApi.deleteNode(labName, node.id)
                console.log(`[WorldLabCanvas] Backend deletion result for node ${node.id}:`, result)
                return { nodeId: node.id, success: result }
              } catch (error) {
                console.error(`[WorldLabCanvas] Failed to delete node file ${node.id}:`, error)
                return { nodeId: node.id, success: false, error }
              }
            })
          ).then((results) => {
            const failedDeletions = results.filter(r => !r.success)
            if (failedDeletions.length > 0) {
              console.error(`[WorldLabCanvas] Backend deletion failed for ${failedDeletions.length} nodes, rolling back state`)
              console.error(`[WorldLabCanvas] Failed nodes:`, failedDeletions.map(r => r.nodeId))
              
              // Rollback: restore original state
              setNodes(originalNodes as any)
              setEdges(originalEdges as any)
              addToHistory(originalNodes as any, originalEdges as any)
              
              // Also rollback saves
              console.log(`[WorldLabCanvas] Rolling back saves with original state`)
              saveNodes(originalNodes as any)
              saveEdges(originalEdges as any, originalNodes as any)
              
              // Show user-friendly error (you might want to add a toast/notification here)
              alert(`Failed to delete ${failedDeletions.length} node(s). Changes have been rolled back.`)
            } else {
              console.log(`[WorldLabCanvas] Successfully completed backend deletion for all ${selectedNodes.length} nodes`)
            }
          }).catch((error) => {
            console.error(`[WorldLabCanvas] Error during backend deletion:`, error)
            // Rollback on unexpected error
            console.error(`[WorldLabCanvas] Rolling back state due to error`)
            setNodes(originalNodes as any)
            setEdges(originalEdges as any)
            addToHistory(originalNodes, originalEdges)
            saveNodes(originalNodes)
            saveEdges(originalEdges, originalNodes)
          })
        } else {
          console.log('[WorldLabCanvas] No nodes or edges selected, nothing to delete')
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

  // Record initial state in history
  useEffect(() => {
    if (history.length === 0 && nodes.length > 0) {
      addToHistory(nodes, edges)
    }
  }, []) // Only run once on mount

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
      const sourceNode = nodes.find((n) => n.id === edge.source)
      
      // Get custom edge type from edge.data or edge.label
      const edgeData = (edge as any).data || {}
      const edgeType = edgeData.edgeType || edgeData.type || 'default'
      const edgeStrength = edgeData.strength || edgeData.thickness || 1
      
      // Get colors from source node category
      const sourceCategory = sourceNode?.data?.category
      const categoryColors = sourceCategory
        ? getCategoryColor(sourceCategory, theme)
        : getCategoryColor('', theme)

      // Base edge color
      const edgeColor = theme === 'dark'
        ? `rgba(255, 255, 255, ${edge.selected ? 0.4 : 0.15})`
        : `rgba(0, 0, 0, ${edge.selected ? 0.3 : 0.12})`

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
      const baseWidth = edge.selected ? 3 : 2
      const strokeWidth = Math.max(1, Math.min(5, baseWidth * edgeStrength))

      // Use custom color if specified, otherwise use category color or default
      const customColor = edgeData.color
      const finalStrokeColor = edge.selected
        ? (customColor || categoryColors.primary)
        : (customColor || edgeColor)

      return {
        stroke: finalStrokeColor,
        strokeWidth: strokeWidth,
        strokeDasharray: strokeDasharray,
        opacity: edge.selected ? 1 : 0.6,
        transition: 'all 0.3s ease',
      }
    },
    [nodes, theme]
  )

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
      },
    }))
  }, [nodes, renamingNodeId, isConnecting, connectingFromNodeId, handleNodeRename, handleRenameCancel, handleStartRename, handleNodeCategoryChange])

  // Filter edges to only show connections between visible nodes
  const filteredEdges = React.useMemo(() => {
    const visibleNodeIds = new Set(filteredNodes.map((n) => n.id))
    return edges.filter((edge) => visibleNodeIds.has(edge.source) && visibleNodeIds.has(edge.target))
  }, [edges, filteredNodes])

  // Calculate offset for edges between the same node pairs to avoid overlap
  const edgesWithOffset = React.useMemo(() => {
    const EDGE_OFFSET_SPACING = 20 // Spacing between parallel edges in pixels
    
    // Group edges by (source, target, sourceHandle, targetHandle)
    const edgeGroups = new Map<string, Edge[]>()
    
    filteredEdges.forEach(edge => {
      const key = `${edge.source}-${edge.target}-${edge.sourceHandle || ''}-${edge.targetHandle || ''}`
      if (!edgeGroups.has(key)) {
        edgeGroups.set(key, [])
      }
      edgeGroups.get(key)!.push(edge)
    })
    
    // Calculate offset for each edge in each group
    const offsetMap = new Map<string, number>()
    edgeGroups.forEach((groupEdges) => {
      // Sort edges by ID to ensure consistent ordering (by creation time)
      const sortedEdges = [...groupEdges].sort((a, b) => a.id.localeCompare(b.id))
      
      sortedEdges.forEach((edge, index) => {
        // Center the offsets around 0: for 1 edge -> 0, for 2 edges -> -10, 10, for 3 edges -> -20, 0, 20, etc.
        const offset = (index - (sortedEdges.length - 1) / 2) * EDGE_OFFSET_SPACING
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
  }, [filteredEdges])

  // Enhanced background colors
  const bgColor = theme === 'dark' ? '#0D0D0D' : '#FAFAFA'
  const gridColor = theme === 'dark' ? '#1A1A1A' : '#F0F0F0'
  const borderColor = theme === 'dark' ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.08)'

  return (
    <PanelGroup direction="vertical" style={{ width: '100%', height: '100%' }}>
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
              cursor: grabbing !important;
            }
            .react-flow__node {
              pointer-events: all;
            }
          `}</style>

          <ReactFlow
            nodes={filteredNodes}
            edges={edgesWithOffset.map((edge) => ({
              ...edge,
              type: 'default', // Smooth bezier curves (default type in React Flow v11)
              style: getEdgeStyle(edge),
              markerEnd: undefined, // No arrow markers - just smooth lines
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
            }))}
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
            }}
            nodeTypes={nodeTypes}
            nodesDraggable={true}
            nodesConnectable={true}
            elementsSelectable={true}
            edgesFocusable={true}
            isValidConnection={(connection) => {
              return !!(connection.source && connection.target && connection.source !== connection.target)
            }}
            style={{ background: bgColor }}
            defaultEdgeOptions={{
              type: 'default', // Smooth bezier curves (default type in React Flow v11)
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
            defaultViewport={{ x: 0, y: 0, zoom: 1 }}
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
              {edgesWithOffset
                .filter((edge) => {
                  // Only show labels that are not being edited and have content
                  return inlineEditingEdgeId !== edge.id && edge.label && edge.label.trim()
                })
                .map((edge) => {
                  const sourceNode = nodes.find((n) => n.id === edge.source)
                  const targetNode = nodes.find((n) => n.id === edge.target)
                  
                  if (!sourceNode || !targetNode || !reactFlowInstance.current) return null

                  // Get actual node dimensions (use measured width/height if available, otherwise defaults)
                  const sourceNodeWidth = (sourceNode as any).measured?.width || (sourceNode as any).width || 150
                  const sourceNodeHeight = (sourceNode as any).measured?.height || (sourceNode as any).height || 50
                  const targetNodeWidth = (targetNode as any).measured?.width || (targetNode as any).width || 150
                  const targetNodeHeight = (targetNode as any).measured?.height || (targetNode as any).height || 50

                  // Calculate edge endpoints (center of nodes)
                  const sourceX = sourceNode.position.x + sourceNodeWidth / 2
                  const sourceY = sourceNode.position.y + sourceNodeHeight / 2
                  const targetX = targetNode.position.x + targetNodeWidth / 2
                  const targetY = targetNode.position.y + targetNodeHeight / 2

                  try {
                    // Calculate label position at midpoint of edge path
                    // Note: offset affects the edge path but label position is calculated at midpoint,
                    // so the visual difference is minimal for label positioning
                    const [, labelX, labelY] = getBezierPath({
                      sourceX,
                      sourceY,
                      targetX,
                      targetY,
                      sourcePosition: Position.Bottom,
                      targetPosition: Position.Top,
                    })
                    
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
                          fontWeight: 500,
                          color: theme === 'dark' ? '#E8E8E8' : '#1A1A1A',
                          background: theme === 'dark' ? 'rgba(30, 30, 30, 0.9)' : 'rgba(255, 255, 255, 0.9)',
                          padding: '4px 8px',
                          borderRadius: '6px',
                          border: `1px solid ${theme === 'dark' ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)'}`,
                          whiteSpace: 'pre-wrap',
                          wordBreak: 'break-word',
                          maxWidth: '200px',
                          textAlign: 'center',
                          pointerEvents: 'none',
                          lineHeight: '1.4',
                        }}
                      >
                        {edge.label}
                      </div>
                    )
                  } catch (error) {
                    // Fallback to simple midpoint
                    const midX = (sourceX + targetX) / 2
                    const midY = (sourceY + targetY) / 2
                    
                    return (
                      <div
                        key={edge.id}
                        className="nodrag nopan"
                        style={{
                          position: 'absolute',
                          left: midX,
                          top: midY,
                          transform: 'translate(-50%, -50%)',
                          fontSize: '12px',
                          fontWeight: 500,
                          color: theme === 'dark' ? '#E8E8E8' : '#1A1A1A',
                          background: theme === 'dark' ? 'rgba(30, 30, 30, 0.9)' : 'rgba(255, 255, 255, 0.9)',
                          padding: '4px 8px',
                          borderRadius: '6px',
                          border: `1px solid ${theme === 'dark' ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)'}`,
                          whiteSpace: 'pre-wrap',
                          wordBreak: 'break-word',
                          maxWidth: '200px',
                          textAlign: 'center',
                          pointerEvents: 'none',
                          lineHeight: '1.4',
                        }}
                      >
                        {edge.label}
                      </div>
                    )
                  }
                })}
            </EdgeLabelRenderer>
          </ReactFlow>

          {/* Inline Edge Label Input */}
          {inlineEditingEdgeId && inlineEditingPosition && (() => {
            const edge = edges.find((e) => e.id === inlineEditingEdgeId)
            if (!edge) {
              console.log('[WorldLabCanvas] Edge not found for inline editing:', inlineEditingEdgeId)
              return null
            }

            console.log('[WorldLabCanvas] Rendering inline input at:', inlineEditingPosition)

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
                    padding: '4px 8px',
                    fontSize: '12px',
                    fontWeight: 500,
                    color: theme === 'dark' ? '#E8E8E8' : '#1A1A1A',
                    background: theme === 'dark' ? 'rgba(30, 30, 30, 0.9)' : 'rgba(255, 255, 255, 0.9)',
                    border: `1px solid ${theme === 'dark' ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)'}`,
                    borderRadius: '6px',
                    outline: 'none',
                    resize: 'none',
                    overflow: 'hidden',
                    fontFamily: 'inherit',
                    lineHeight: '1.4',
                    width: '120px',
                    minWidth: '80px',
                    maxWidth: '250px',
                  }}
                  onKeyDown={(e) => {
                    // Ctrl/Cmd+Enter to save
                    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                      e.preventDefault()
                      handleInlineEdgeLabelSave(inlineEditingEdgeId, e.currentTarget.value)
                    } else if (e.key === 'Escape') {
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

          {/* Context Menu */}
          {contextMenu && (
            <div
              style={{
                position: 'fixed',
                top: contextMenu.y,
                left: contextMenu.x,
                background: theme === 'dark' ? 'rgba(30, 30, 30, 0.98)' : 'rgba(255, 255, 255, 0.98)',
                border: `1px solid ${borderColor}`,
                borderRadius: '8px',
                boxShadow: theme === 'dark' ? '0 8px 32px rgba(0, 0, 0, 0.4)' : '0 8px 32px rgba(0, 0, 0, 0.15)',
                zIndex: 10000,
                minWidth: '180px',
                padding: '4px',
                backdropFilter: 'blur(20px)',
                fontFamily: "'Inter', 'Noto Sans SC', -apple-system, BlinkMacSystemFont, sans-serif",
              }}
            >
              {contextMenu.type === 'node' && contextMenu.nodeId && (
                <>
                  <div
                    onClick={() => {
                      setRenamingNodeId(contextMenu.nodeId!)
                      setContextMenu(null)
                    }}
                    style={{
                      padding: '10px 14px',
                      cursor: 'pointer',
                      color: theme === 'dark' ? '#E8E8E8' : '#1A1A1A',
                      fontSize: '14px',
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
                    ✏️ Rename
                  </div>
                  <div
                    onClick={() => handleDuplicateNode(contextMenu.nodeId!)}
                    style={{
                      padding: '10px 14px',
                      cursor: 'pointer',
                      color: theme === 'dark' ? '#E8E8E8' : '#1A1A1A',
                      fontSize: '14px',
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
                    📋 Duplicate
                  </div>
                  <div style={{ height: '1px', background: borderColor, margin: '4px 0' }} />
                  <div
                    onClick={() => handleDeleteNode(contextMenu.nodeId!)}
                    style={{
                      padding: '10px 14px',
                      cursor: 'pointer',
                      color: '#FF6B6B',
                      fontSize: '14px',
                      borderRadius: '6px',
                      transition: 'background 0.15s',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = 'rgba(255, 107, 107, 0.1)'
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'transparent'
                    }}
                  >
                    🗑️ Delete
                  </div>
                </>
              )}
              {contextMenu.type === 'edge' && contextMenu.edgeId && (
                <>
                  <div
                    onClick={() => {
                      setEditingEdgeId(contextMenu.edgeId!)
                      setContextMenu(null)
                    }}
                    style={{
                      padding: '10px 14px',
                      cursor: 'pointer',
                      color: theme === 'dark' ? '#E8E8E8' : '#1A1A1A',
                      fontSize: '14px',
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
                    ✏️ Edit Properties
                  </div>
                  <div style={{ height: '1px', background: borderColor, margin: '4px 0' }} />
                  <div
                    onClick={() => handleDeleteEdge(contextMenu.edgeId!)}
                    style={{
                      padding: '10px 14px',
                      cursor: 'pointer',
                      color: '#FF6B6B',
                      fontSize: '14px',
                      borderRadius: '6px',
                      transition: 'background 0.15s',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = 'rgba(255, 107, 107, 0.1)'
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'transparent'
                    }}
                  >
                    🗑️ Delete Connection
                  </div>
                </>
              )}
            </div>
          )}

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
  )
}

export default function WorldLabCanvas(props: WorldLabCanvasProps) {
  return (
    <ReactFlowProvider>
      <WorldLabCanvasInner {...props} />
    </ReactFlowProvider>
  )
}
