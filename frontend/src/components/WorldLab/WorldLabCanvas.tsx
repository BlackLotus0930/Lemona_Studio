import React, { useCallback, useState, useRef } from 'react'
import {
  ReactFlow,
  Node,
  Edge,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  addEdge,
  Connection,
  NodeTypes,
  Panel,
  ReactFlowProvider,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { useTheme } from '../../contexts/ThemeContext'
import { WorldLabNode, WorldLabEdge } from '@shared/types'
import { worldLabApi } from '../../services/desktop-api'
import NodePropertyEditor from './NodePropertyEditor'

interface WorldLabCanvasProps {
  labName: string
  initialNodes: WorldLabNode[]
  initialEdges: WorldLabEdge[]
  onNodeDoubleClick?: (nodeId: string) => void
  onNodeClick?: (nodeId: string) => void
  onNodesChange?: (nodes: WorldLabNode[]) => void
  onEdgesChange?: (edges: WorldLabEdge[]) => void
}

// Custom node component
const CustomNode = ({ data, selected }: { data: any; selected: boolean }) => {
  const { theme } = useTheme()
  const nodeBg = theme === 'dark' ? '#1e1e1e' : '#ffffff'
  const nodeBorder = selected
    ? theme === 'dark' ? '#4285f4' : '#1976d2'
    : theme === 'dark' ? '#333' : '#dadce0'
  const nodeTextColor = theme === 'dark' ? '#D6D6DD' : '#202124'
  const categoryColor = data.category
    ? getCategoryColor(data.category, theme)
    : theme === 'dark' ? '#555' : '#e0e0e0'

  return (
    <div
      style={{
        background: nodeBg,
        border: `2px solid ${nodeBorder}`,
        borderRadius: '8px',
        padding: '12px 16px',
        minWidth: '150px',
        boxShadow: selected
          ? theme === 'dark'
            ? '0 0 0 2px rgba(66, 133, 244, 0.3)'
            : '0 0 0 2px rgba(25, 118, 210, 0.3)'
          : 'none',
      }}
    >
      {data.category && (
        <div
          style={{
            fontSize: '10px',
            color: categoryColor,
            marginBottom: '4px',
            fontWeight: 500,
            textTransform: 'uppercase',
          }}
        >
          {data.category}
        </div>
      )}
      <div
        style={{
          fontSize: '14px',
          fontWeight: 500,
          color: nodeTextColor,
          marginBottom: data.elementName ? '4px' : '0',
        }}
      >
        {data.label || data.elementName || data.id}
      </div>
      {data.elementName && data.elementName !== data.label && (
        <div
          style={{
            fontSize: '12px',
            color: theme === 'dark' ? '#858585' : '#5f6368',
          }}
        >
          {data.elementName}
        </div>
      )}
    </div>
  )
}

// Get color for category
function getCategoryColor(category: string, theme: 'dark' | 'light'): string {
  const colors: Record<string, { dark: string; light: string }> = {
    人物: { dark: '#4a9eff', light: '#1976d2' },
    事件: { dark: '#ff6b6b', light: '#d32f2f' },
    地点: { dark: '#51cf66', light: '#388e3c' },
    规则: { dark: '#ffd43b', light: '#f57c00' },
    设定: { dark: '#ae81ff', light: '#7b1fa2' },
    概念: { dark: '#ff8787', light: '#c62828' },
    想法: { dark: '#66d9ef', light: '#0277bd' },
  }
  const cat = colors[category] || { dark: '#858585', light: '#5f6368' }
  return theme === 'dark' ? cat.dark : cat.light
}

const nodeTypes: NodeTypes = {
  custom: CustomNode,
}

function WorldLabCanvasInner({
  labName,
  initialNodes,
  initialEdges,
  onNodeDoubleClick,
  onNodeClick,
  onNodesChange,
  onEdgesChange,
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
      type: edge.type || 'default',
      label: edge.label,
      animated: edge.animated,
      style: edge.style,
    }))
  )
  const [editingNodeId, setEditingNodeId] = useState<string | null>(null)
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

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

  // Handle node click
  const handleNodeClick = useCallback(
    (_event: React.MouseEvent, node: Node) => {
      setEditingNodeId(node.id)
      if (onNodeClick) {
        onNodeClick(node.id)
      }
    },
    [onNodeClick]
  )

  // Handle node double click
  const handleNodeDoubleClick = useCallback(
    (_event: React.MouseEvent, node: Node) => {
      if (onNodeDoubleClick) {
        onNodeDoubleClick(node.id)
      }
    },
    [onNodeDoubleClick]
  )

  // Handle edge connection
  const onConnect = useCallback(
    (params: Connection) => {
      if (params.source && params.target) {
        const newEdge: Edge = {
          id: `edge_${params.source}_${params.target}_${Date.now()}`,
          source: params.source,
          target: params.target,
          type: 'default',
        }
        setEdges((eds) => {
          const updatedEdges = addEdge(newEdge, eds).map(normalizeEdge)
          saveEdges(updatedEdges)
          return updatedEdges
        })
      }
    },
    [setEdges, saveEdges, normalizeEdge]
  )

  // Handle node property update
  const handleNodePropertyUpdate = useCallback(
    async (nodeId: string, updates: { category?: string; elementName?: string }) => {
      setNodes((nds) => {
        const updatedNodes = nds.map((node) => {
          if (node.id === nodeId) {
            return {
              ...node,
              data: {
                ...node.data,
                ...updates,
              },
            }
          }
          return node
        })
        saveNodes(updatedNodes)
        return updatedNodes
      })
    },
    [setNodes, saveNodes]
  )

  const bgColor = theme === 'dark' ? '#141414' : '#ffffff'
  const edgeColor = theme === 'dark' ? '#555' : '#b1b1b1'

  return (
    <div style={{ width: '100%', height: '100%', background: bgColor }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChangeInner}
        onEdgesChange={onEdgesChangeInner}
        onNodeClick={handleNodeClick}
        onNodeDoubleClick={handleNodeDoubleClick}
        onConnect={onConnect}
        nodeTypes={nodeTypes}
        fitView
        style={{ background: bgColor }}
        defaultEdgeOptions={{
          style: { stroke: edgeColor, strokeWidth: 2 },
        }}
      >
        <Background color={theme === 'dark' ? '#1a1a1a' : '#f5f5f5'} gap={16} />
        <Controls
          style={{
            background: theme === 'dark' ? '#1e1e1e' : '#ffffff',
            border: `1px solid ${theme === 'dark' ? '#333' : '#dadce0'}`,
          }}
        />
        <MiniMap
          style={{
            background: theme === 'dark' ? '#1e1e1e' : '#ffffff',
            border: `1px solid ${theme === 'dark' ? '#333' : '#dadce0'}`,
          }}
          nodeColor={(node: Node) => {
            const category = node.data?.category
            if (category && typeof category === 'string') {
              return getCategoryColor(category, theme)
            }
            return theme === 'dark' ? '#555' : '#e0e0e0'
          }}
        />
        {editingNodeId && (
          <Panel position="top-center">
            <NodePropertyEditor
              nodeId={editingNodeId}
              node={nodes.find((n: Node) => n.id === editingNodeId)}
              onUpdate={(updates: { category?: string; elementName?: string }) => handleNodePropertyUpdate(editingNodeId, updates)}
              onClose={() => setEditingNodeId(null)}
            />
          </Panel>
        )}
      </ReactFlow>
    </div>
  )
}

export default function WorldLabCanvas(props: WorldLabCanvasProps) {
  return (
    <ReactFlowProvider>
      <WorldLabCanvasInner {...props} />
    </ReactFlowProvider>
  )
}
