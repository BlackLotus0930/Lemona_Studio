import React, { useCallback, useState, useRef, useEffect, useMemo } from 'react'
import {
  ReactFlow,
  Node,
  Edge,
  Background,
  useNodesState,
  useEdgesState,
  addEdge,
  Connection,
  NodeTypes,
  Panel as ReactFlowPanel,
  ReactFlowProvider,
  Handle,
  Position,
  ReactFlowInstance,
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
const CATEGORIES = ['concept', 'event', 'character', 'custom']

// Beautiful custom node component representing "existences in the world"
const CustomNode = ({ data, selected }: { data: any; selected: boolean }) => {
  const { theme } = useTheme()
  const isRenaming = data.isRenaming || false
  const onRename = data.onRename || (() => {})
  const onRenameCancel = data.onRenameCancel || (() => {})
  const onCategoryChange = data.onCategoryChange || (() => {})
  const renameInputRef = useRef<HTMLInputElement>(null)
  const categoryDropdownRef = useRef<HTMLDivElement>(null)
  const [isCategoryDropdownOpen, setIsCategoryDropdownOpen] = useState(false)
  
  // Always use a category - default to 'custom' if none set
  const nodeCategory = data.category || 'custom'
  const categoryColors = getCategoryColor(nodeCategory, theme)

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

  // Focus input when renaming starts (without scrolling/zooming)
  useEffect(() => {
    if (isRenaming && renameInputRef.current) {
      // Use requestAnimationFrame to ensure DOM is ready and prevent any viewport changes
      requestAnimationFrame(() => {
        if (renameInputRef.current) {
          // Prevent auto-scroll/zoom by focusing without scrolling
          renameInputRef.current.focus({ preventScroll: true })
          renameInputRef.current.select()
        }
      })
    }
  }, [isRenaming])

  // Handle click outside to close category dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (categoryDropdownRef.current && !categoryDropdownRef.current.contains(event.target as HTMLElement)) {
        setIsCategoryDropdownOpen(false)
      }
    }

    if (isCategoryDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => {
        document.removeEventListener('mousedown', handleClickOutside)
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
    } else if (e.key === 'Escape') {
      e.preventDefault()
      onRenameCancel()
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

  return (
    <div
      className="world-lab-node"
      style={{
        background: nodeBg,
        border: `3px solid ${borderColor}`,
        borderRadius: '16px',
        padding: '20px 24px',
        minWidth: '180px',
        maxWidth: '280px',
        boxShadow: selected
          ? `0 8px 32px ${shadowColor}, 0 0 0 3px ${categoryColors.glow}`
          : `0 4px 16px ${shadowColor}`,
        position: 'relative',
        backdropFilter: 'blur(10px)',
        fontFamily: "'Inter', 'Noto Sans SC', -apple-system, BlinkMacSystemFont, sans-serif",
        cursor: 'pointer',
      }}
    >
      {/* Connection handles */}
      <Handle
        type="target"
        position={Position.Top}
        style={{
          background: categoryColors.primary,
          width: '10px',
          height: '10px',
          border: `2px solid ${theme === 'dark' ? '#1a1a1a' : '#ffffff'}`,
          borderRadius: '50%',
        }}
      />
      <Handle
        type="source"
        position={Position.Bottom}
        style={{
          background: categoryColors.primary,
          width: '10px',
          height: '10px',
          border: `2px solid ${theme === 'dark' ? '#1a1a1a' : '#ffffff'}`,
          borderRadius: '50%',
        }}
      />

      {/* Category badge - always show, default to "custom" if no category, clickable to change */}
      <div style={{ position: 'relative', marginBottom: '12px' }} ref={categoryDropdownRef}>
        <div
          onClick={handleCategoryClick}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            padding: '4px 10px',
            background: theme === 'dark' ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.03)',
            borderRadius: '12px',
            border: `1px solid ${theme === 'dark' ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)'}`,
            cursor: 'pointer',
            userSelect: 'none',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = theme === 'dark' ? 'rgba(255, 255, 255, 0.2)' : 'rgba(0, 0, 0, 0.15)'
            e.currentTarget.style.background = theme === 'dark' ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.05)'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = theme === 'dark' ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)'
            e.currentTarget.style.background = theme === 'dark' ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.03)'
          }}
        >
          <span
            style={{
              fontSize: '11px',
              fontWeight: 500,
              color: secondaryTextColor,
              letterSpacing: '0.3px',
              textTransform: 'none',
            }}
          >
            {data.category || 'custom'}
          </span>
        </div>

        {/* Category dropdown */}
        {isCategoryDropdownOpen && (
          <div
            style={{
              position: 'absolute',
              top: '100%',
              left: 0,
              marginTop: '8px',
              background: theme === 'dark' ? 'rgba(30, 30, 30, 0.98)' : 'rgba(255, 255, 255, 0.98)',
              border: `1.5px solid ${theme === 'dark' ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.08)'}`,
              borderRadius: '12px',
              boxShadow: theme === 'dark'
                ? '0 8px 32px rgba(0, 0, 0, 0.4)'
                : '0 8px 32px rgba(0, 0, 0, 0.15)',
              zIndex: 1000,
              minWidth: '140px',
              padding: '4px',
              backdropFilter: 'blur(20px)',
            }}
          >
            {CATEGORIES.map((cat) => {
              const catColors = getCategoryColor(cat, theme)
              const isSelected = (data.category || 'custom') === cat
              return (
                <div
                  key={cat}
                  onClick={() => handleCategorySelect(cat)}
                  style={{
                    padding: '10px 14px',
                    cursor: 'pointer',
                    color: theme === 'dark' ? '#E8E8E8' : '#1A1A1A',
                    fontSize: '14px',
                    fontWeight: isSelected ? 600 : 400,
                    backgroundColor: isSelected ? catColors.badgeBg : 'transparent',
                    borderRadius: '8px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                  }}
                  onMouseEnter={(e) => {
                    if (!isSelected) {
                      e.currentTarget.style.backgroundColor = theme === 'dark' 
                        ? 'rgba(255, 255, 255, 0.08)' 
                        : 'rgba(0, 0, 0, 0.05)'
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isSelected) {
                      e.currentTarget.style.backgroundColor = 'transparent'
                    }
                  }}
                >
                  <span>{cat}</span>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Main label - inline edit when renaming */}
      {isRenaming ? (
        <input
          ref={renameInputRef}
          type="text"
          defaultValue={data.label || data.elementName || data.id}
          onKeyDown={handleRenameKeyDown}
          onBlur={handleRenameBlur}
          style={{
            width: '100%',
            fontSize: '14px',
            fontWeight: 400,
            color: nodeTextColor,
            background: theme === 'dark' ? 'rgba(40, 40, 40, 0.8)' : 'rgba(248, 249, 250, 0.9)',
            border: `2px solid ${categoryColors.primary}`,
            borderRadius: '8px',
            padding: '6px 10px',
            outline: 'none',
            marginBottom: data.elementName && data.elementName !== data.label ? '6px' : '0',
            lineHeight: '1.4',
            letterSpacing: '-0.2px',
            fontFamily: "'Inter', 'Noto Sans SC', -apple-system, BlinkMacSystemFont, sans-serif",
            boxShadow: `0 0 0 3px ${categoryColors.primary}20`,
            boxSizing: 'border-box',
          }}
          onClick={(e) => e.stopPropagation()}
        />
      ) : (
        <div
          style={{
            fontSize: '16px',
            fontWeight: 400,
            color: nodeTextColor,
            marginBottom: data.elementName && data.elementName !== data.label ? '6px' : '0',
            lineHeight: '1.4',
            letterSpacing: '-0.2px',
          }}
        >
          {data.label || data.elementName || data.id}
        </div>
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
          }}
        >
          {data.elementName}
        </div>
      )}

    </div>
  )
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
    }))
  )
  const [renamingNodeId, setRenamingNodeId] = useState<string | null>(null)
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const reactFlowInstance = useRef<ReactFlowInstance | null>(null)
  
  // Memoize nodeTypes to prevent React Flow warning
  const nodeTypes = useMemo<NodeTypes>(() => ({
    custom: CustomNode,
  }), [])
  
  // Floating editor state
  const [editingNodeId, setEditingNodeId] = useState<string | null>(null)
  const [editorPosition, setEditorPosition] = useState<{ x: number; y: number } | null>(null)
  const editorRef = useRef<HTMLDivElement>(null)
  const canvasContainerRef = useRef<HTMLDivElement>(null)
  
  // Parse node document content
  const parsedNodeContent = useMemo(() => {
    if (!nodeDocumentContent) return ''
    try {
      const parsed = JSON.parse(nodeDocumentContent)
      return parsed
    } catch {
      return ''
    }
  }, [nodeDocumentContent])
  
  // Create TipTap editor for floating editor
  const floatingEditor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({
        placeholder: 'Start typing...',
      }),
    ],
    content: parsedNodeContent,
    editorProps: {
      attributes: {
        class: 'prose prose-sm max-w-none focus:outline-none',
      },
    },
  })
  
  // Update editor content when nodeDocumentContent changes
  useEffect(() => {
    if (floatingEditor && parsedNodeContent && editingNodeId) {
      floatingEditor.commands.setContent(parsedNodeContent)
    }
  }, [floatingEditor, parsedNodeContent, editingNodeId])
  
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
    }))
  }, [])

  // Note: Node and edge changes are handled by onNodesChangeInner and onEdgesChangeInner
  // which are provided by useNodesState and useEdgesState hooks
  // We sync changes through the saveNodes and saveEdges callbacks

  // Save nodes with debounce
  const saveNodes = useCallback(
    (nodesToSave: Node[]) => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current)
      }
      saveTimeoutRef.current = setTimeout(async () => {
        const worldLabNodes = convertToWorldLabNodes(nodesToSave)
        // Save node positions to edges.json or a separate file
        // For now, we'll update the edges.json with positions
        // In a future enhancement, we can create a positions.json file
        if (onNodesChange) {
          onNodesChange(worldLabNodes)
        }
      }, 500)
    },
    [convertToWorldLabNodes, onNodesChange]
  )

  // Save edges with debounce
  const saveEdges = useCallback(
    (edgesToSave: Edge[]) => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current)
      }
      saveTimeoutRef.current = setTimeout(async () => {
        const worldLabEdges = convertToWorldLabEdges(edgesToSave)
        try {
          await worldLabApi.saveEdges(labName, worldLabEdges)
          if (onEdgesChange) {
            onEdgesChange(worldLabEdges)
          }
        } catch (error) {
          console.error('Failed to save edges:', error)
        }
      }, 500)
    },
    [convertToWorldLabEdges, labName, onEdgesChange]
  )

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

  // Handle pane context menu (right-click on canvas)
  const handlePaneContextMenu = useCallback((event: MouseEvent | React.MouseEvent) => {
    event.preventDefault()
    setContextMenu({
      x: event.clientX,
      y: event.clientY,
      type: 'pane',
    })
  }, [])

  // Handle node double click - open floating editor
  const handleNodeDoubleClick = useCallback(
    (event: React.MouseEvent, node: Node) => {
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
      
      // Get the actual node DOM element to get its position
      const nodeDomElement = document.querySelector(`[data-id="${node.id}"]`) as HTMLElement
      
      if (nodeDomElement && canvasContainerRef.current) {
        const nodeRect = nodeDomElement.getBoundingClientRect()
        const containerRect = canvasContainerRef.current.getBoundingClientRect()
        
        // Calculate position relative to the canvas container (which has position: relative)
        const nodeX = nodeRect.left - containerRect.left
        const nodeY = nodeRect.top - containerRect.top
        const nodeWidth = nodeRect.width
        
        // Position editor to the right of the node with a small gap (20px)
        const editorX = nodeX + nodeWidth + 20
        const editorY = nodeY
        
        setEditingNodeId(node.id)
        setEditorPosition({ x: editorX, y: editorY })
      }
      
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

  // Handle edge connection
  const onConnect = useCallback(
    (params: Connection) => {
      if (params.source && params.target) {
        const newEdge: Edge = {
          id: `edge_${params.source}_${params.target}_${Date.now()}`,
          source: params.source,
          target: params.target,
          type: 'smoothstep',
        }
        setEdges((eds) => {
          const updatedEdges = addEdge(newEdge, eds).map(normalizeEdge)
          addToHistory(nodes, updatedEdges)
          saveEdges(updatedEdges)
          return updatedEdges
        })
      }
    },
    [setEdges, saveEdges, normalizeEdge, nodes, addToHistory]
  )

  // Handle node rename
  const handleNodeRename = useCallback(
    (nodeId: string, newLabel: string) => {
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
    },
    [setNodes, saveNodes, edges, addToHistory]
  )

  // Handle rename cancel
  const handleRenameCancel = useCallback(() => {
    setRenamingNodeId(null)
  }, [])

  // Handle node category change
  const handleNodeCategoryChange = useCallback(
    (nodeId: string, newCategory: string) => {
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
    },
    [setNodes, saveNodes, edges, addToHistory]
  )

  // Handle pane click to create new node or close Node Editor
  const handlePaneClick = useCallback(
    (event: React.MouseEvent) => {
      setContextMenu(null) // Close context menu
      
      // Single click on pane - deselect nodes and close editor
      if (event.detail === 1) {
        // Deselect all nodes
        setNodes((nds) => nds.map((n: any) => ({ ...n, selected: false })))
        setEdges((eds) => eds.map((e: any) => ({ ...e, selected: false })))
        
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
    [setNodes, setEdges, saveNodes, edges, addToHistory, editingNodeId, onCloseNodeEditor]
  )

  // Context menu actions
  const handleDeleteNode = useCallback(
    (nodeId: string) => {
      const newNodes = nodes.filter((n) => n.id !== nodeId)
      const newEdges = edges.filter((e) => e.source !== nodeId && e.target !== nodeId)
      setNodes(newNodes)
      setEdges(newEdges)
      addToHistory(newNodes, newEdges)
      saveNodes(newNodes)
      saveEdges(newEdges)
      setContextMenu(null)
      if (renamingNodeId === nodeId) {
        setRenamingNodeId(null)
      }
    },
    [nodes, edges, setNodes, setEdges, addToHistory, saveNodes, saveEdges, renamingNodeId]
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
                  type: edge.type || 'smoothstep',
                  label: edge.label,
                  data: newData,
                }
                // Will be added after this map
                setTimeout(() => {
                  setEdges((current: any) => {
                    const withReverse = [...current, reverseEdge]
                    addToHistory(nodes, withReverse)
                    saveEdges(withReverse)
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
                  saveEdges(filtered)
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
        saveEdges(updatedEdges)
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
        const selectedNodes = nodes.filter((n: any) => n.selected)
        const selectedEdges = edges.filter((e: any) => e.selected)
        
        if (selectedNodes.length > 0 || selectedEdges.length > 0) {
          e.preventDefault()
          const newNodes = nodes.filter((n: any) => !n.selected)
          const newEdges = edges.filter((e: any) => !e.selected)
          setNodes(newNodes)
          setEdges(newEdges)
          addToHistory(newNodes, newEdges)
          saveNodes(newNodes)
          saveEdges(newEdges)
        }
      }
      // Enter: Start renaming selected node (only if editor is not open)
      else if (e.key === 'Enter' && !ctrlOrCmd && !e.shiftKey) {
        // Don't start renaming if editor is open (user might be typing in editor)
        if (editingNodeId) {
          return // Let the editor handle Enter key
        }
        const selectedNodes = nodes.filter((n: any) => n.selected)
        if (selectedNodes.length === 1 && !renamingNodeId) {
          e.preventDefault()
          setRenamingNodeId(selectedNodes[0].id)
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

    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('click', handleClick)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('click', handleClick)
    }
  }, [nodes, edges, undo, redo, setNodes, setEdges, addToHistory, saveNodes, saveEdges, contextMenu, renamingNodeId, editingNodeId, onCloseNodeEditor])

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
        onCategoryChange: (newCategory: string) => handleNodeCategoryChange(node.id, newCategory),
      },
    }))
  }, [nodes, renamingNodeId, handleNodeRename, handleRenameCancel, handleNodeCategoryChange])

  // Filter edges to only show connections between visible nodes
  const filteredEdges = React.useMemo(() => {
    const visibleNodeIds = new Set(filteredNodes.map((n) => n.id))
    return edges.filter((edge) => visibleNodeIds.has(edge.source) && visibleNodeIds.has(edge.target))
  }, [edges, filteredNodes])

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
          style={{
            width: '100%',
            height: '100%',
            background: bgColor,
            position: 'relative',
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
            edges={filteredEdges.map((edge) => ({
              ...edge,
              type: 'smoothstep',
              style: getEdgeStyle(edge),
              markerEnd: {
                type: 'arrowclosed',
                color: theme === 'dark' ? 'rgba(255, 255, 255, 0.2)' : 'rgba(0, 0, 0, 0.15)',
                width: 20,
                height: 20,
              },
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
            }))}
            onNodesChange={onNodesChangeInner}
            onEdgesChange={onEdgesChangeInner}
            onNodeClick={handleNodeClick}
            onNodeDoubleClick={handleNodeDoubleClick}
            onNodeContextMenu={handleNodeContextMenu}
            onEdgeContextMenu={handleEdgeContextMenu}
            onPaneClick={handlePaneClick}
            onPaneContextMenu={handlePaneContextMenu}
            onInit={handleInit}
            onConnect={onConnect}
            nodeTypes={nodeTypes}
            nodesDraggable={true}
            nodesConnectable={true}
            elementsSelectable={true}
            style={{ background: bgColor }}
            defaultEdgeOptions={{
              type: 'smoothstep',
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
          </ReactFlow>

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
          
          {/* Floating Node Editor */}
          {editingNodeId && editorPosition && floatingEditor && (
            <div
              ref={editorRef}
              onClick={(e) => e.stopPropagation()}
              style={{
                position: 'absolute',
                left: `${editorPosition.x}px`,
                top: `${editorPosition.y}px`,
                width: '400px',
                maxHeight: '650px',
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
              {/* Header */}
              <div
                style={{
                  padding: '12px 20px',
                  borderBottom: `1px solid ${theme === 'dark' ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)'}`,
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  background: theme === 'dark' ? 'rgba(255, 255, 255, 0.02)' : 'rgba(0, 0, 0, 0.01)',
                }}
              >
                <div
                  onDoubleClick={(e) => {
                    e.stopPropagation()
                    const node = nodes.find(n => n.id === editingNodeId)
                    if (node) {
                      setRenamingNodeId(node.id)
                      // Close editor when starting rename
                      setEditingNodeId(null)
                      setEditorPosition(null)
                      if (onCloseNodeEditor) {
                        onCloseNodeEditor()
                      }
                    }
                  }}
                  style={{
                    fontSize: '15px',
                    fontWeight: 500,
                    color: theme === 'dark' ? '#E8E8E8' : '#1A1A1A',
                    letterSpacing: '-0.01em',
                    cursor: 'pointer',
                    userSelect: 'none',
                    padding: '2px 4px',
                    borderRadius: '4px',
                    transition: 'background 0.15s ease',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = theme === 'dark' ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.04)'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'transparent'
                  }}
                  title="Double click to rename"
                >
                  {nodes.find(n => n.id === editingNodeId)?.data?.label || editingNodeId}
                </div>
                <button
                  onClick={() => {
                    setEditingNodeId(null)
                    setEditorPosition(null)
                    if (onCloseNodeEditor) {
                      onCloseNodeEditor()
                    }
                  }}
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
                    transition: 'all 0.15s ease',
                    lineHeight: '1',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = theme === 'dark' ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.06)'
                    e.currentTarget.style.color = theme === 'dark' ? '#E8E8E8' : '#1A1A1A'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'transparent'
                    e.currentTarget.style.color = theme === 'dark' ? '#9E9E9E' : '#6B6B6B'
                  }}
                >
                  ×
                </button>
              </div>
              
              {/* Editor Content */}
              <div
                style={{
                  flex: 1,
                  overflow: 'auto',
                  padding: '24px',
                  minHeight: '240px',
                  maxHeight: '560px',
                }}
              >
                <EditorContent editor={floatingEditor} />
                <style>{`
                  .ProseMirror {
                    outline: none;
                    color: ${theme === 'dark' ? '#E0E0E0' : '#1F1F1F'};
                    font-size: 14px;
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
