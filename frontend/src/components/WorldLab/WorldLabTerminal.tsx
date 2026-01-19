import React, { useState, useRef, useEffect, useCallback } from 'react'
import { useTheme } from '../../contexts/ThemeContext'
import { WorldLab, WorldLabNode, WorldLabEdge } from '@shared/types'
import { aiApi } from '../../services/api'

interface WorldLabTerminalProps {
  labName: string
  worldLabData: WorldLab | null
  selectedNodeId?: string | null
  onNodeSelect?: (nodeId: string | null) => void
  onNodesChange?: (nodes: WorldLabNode[]) => void
  onEdgesChange?: (edges: WorldLabEdge[]) => void
  projectId?: string
  onClose?: () => void // Available for future use (e.g., close button)
}

interface TerminalLine {
  id: string
  type: 'command' | 'output' | 'error' | 'info'
  content: string
  timestamp: string
  nodeRefs?: string[] // 引用的节点 ID
}

// 命令解析结果
interface CommandResult {
  type: 'command' | 'ai' | 'error'
  command?: string
  args?: Record<string, any>
  error?: string
}

export default function WorldLabTerminal({
  labName,
  worldLabData,
  selectedNodeId,
  onNodeSelect,
  onNodesChange,
  onEdgesChange,
  projectId,
  onClose: _onClose, // Available for future use (e.g., close button)
}: WorldLabTerminalProps) {
  const { theme } = useTheme()
  
  // 状态管理
  const [commandHistory, setCommandHistory] = useState<string[]>([])
  const [historyIndex, setHistoryIndex] = useState<number>(-1)
  const [currentInput, setCurrentInput] = useState<string>('')
  const [outputLines, setOutputLines] = useState<TerminalLine[]>([])
  const [isProcessing, setIsProcessing] = useState<boolean>(false)
  const [autocompleteSuggestions, setAutocompleteSuggestions] = useState<string[]>([])
  const [autocompleteIndex, setAutocompleteIndex] = useState<number>(-1)
  const [showAutocomplete, setShowAutocomplete] = useState<boolean>(false)
  
  // Refs
  const terminalRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLDivElement>(null)
  const scrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const streamReaderRef = useRef<ReadableStreamDefaultReader<Uint8Array> | null>(null)
  const currentAIOutputRef = useRef<string>('')
  const currentAILineIdRef = useRef<string | null>(null)

  // 初始化欢迎消息
  useEffect(() => {
    const welcomeLine: TerminalLine = {
      id: `line_${Date.now()}`,
      type: 'info',
      content: `Welcome to WorldLab Terminal. Type 'help' for available commands.`,
      timestamp: new Date().toISOString(),
    }
    setOutputLines([welcomeLine])
  }, [])

  // 自动滚动到底部
  const scrollToBottom = useCallback(() => {
    if (scrollTimeoutRef.current) {
      clearTimeout(scrollTimeoutRef.current)
    }
    scrollTimeoutRef.current = setTimeout(() => {
      if (terminalRef.current) {
        terminalRef.current.scrollTop = terminalRef.current.scrollHeight
      }
    }, 10)
  }, [])

  // 添加输出行
  const addOutputLine = useCallback((line: TerminalLine) => {
    setOutputLines(prev => [...prev, line])
    scrollToBottom()
  }, [scrollToBottom])

  // 命令解析器
  const parseCommand = useCallback((input: string): CommandResult => {
    const trimmed = input.trim()
    if (!trimmed) {
      return { type: 'error', error: 'Empty command' }
    }

    const parts = trimmed.split(/\s+/)
    const command = parts[0].toLowerCase()

    // help 命令
    if (command === 'help') {
      return {
        type: 'command',
        command: 'help',
        args: {},
      }
    }

    // clear 命令
    if (command === 'clear') {
      return {
        type: 'command',
        command: 'clear',
        args: {},
      }
    }

    // history 命令
    if (command === 'history') {
      return {
        type: 'command',
        command: 'history',
        args: {},
      }
    }

    // query nodes [category]
    if (command === 'query' && parts[1] === 'nodes') {
      const category = parts[2] || null
      return {
        type: 'command',
        command: 'query-nodes',
        args: { category },
      }
    }

    // query edges [nodeId]
    if (command === 'query' && parts[1] === 'edges') {
      const nodeId = parts[2] || null
      return {
        type: 'command',
        command: 'query-edges',
        args: { nodeId },
      }
    }

    // query node <nodeId>
    if (command === 'query' && parts[1] === 'node' && parts[2]) {
      return {
        type: 'command',
        command: 'query-node',
        args: { nodeId: parts[2] },
      }
    }

    // create node category:<category> name:<name>
    if (command === 'create' && parts[1] === 'node') {
      const args: Record<string, string> = {}
      for (let i = 2; i < parts.length; i++) {
        const part = parts[i]
        if (part.includes(':')) {
          const [key, ...valueParts] = part.split(':')
          args[key] = valueParts.join(':')
        }
      }
      return {
        type: 'command',
        command: 'create-node',
        args,
      }
    }

    // create edge <sourceId> -> <targetId> [label:<label>]
    if (command === 'create' && parts[1] === 'edge') {
      const arrowIndex = parts.findIndex(p => p === '->')
      if (arrowIndex === -1 || arrowIndex < 2 || arrowIndex >= parts.length - 1) {
        return { type: 'error', error: 'Invalid edge syntax. Use: create edge <sourceId> -> <targetId> [label:<label>]' }
      }
      const sourceId = parts[2]
      const targetId = parts[arrowIndex + 1]
      const args: Record<string, string> = { sourceId, targetId }
      
      // 解析 label
      for (let i = arrowIndex + 2; i < parts.length; i++) {
        const part = parts[i]
        if (part.startsWith('label:')) {
          args.label = part.slice(6)
        }
      }
      
      return {
        type: 'command',
        command: 'create-edge',
        args,
      }
    }

    // update node <nodeId> property:<key> value:<value>
    if (command === 'update' && parts[1] === 'node' && parts[2]) {
      const nodeId = parts[2]
      const args: Record<string, string> = { nodeId }
      
      for (let i = 3; i < parts.length; i++) {
        const part = parts[i]
        if (part.startsWith('property:')) {
          args.property = part.slice(9)
        } else if (part.startsWith('value:')) {
          args.value = part.slice(6)
        }
      }
      
      return {
        type: 'command',
        command: 'update-node',
        args,
      }
    }

    // delete node <nodeId>
    if (command === 'delete' && parts[1] === 'node' && parts[2]) {
      return {
        type: 'command',
        command: 'delete-node',
        args: { nodeId: parts[2] },
      }
    }

    // delete edge <edgeId>
    if (command === 'delete' && parts[1] === 'edge' && parts[2]) {
      return {
        type: 'command',
        command: 'delete-edge',
        args: { edgeId: parts[2] },
      }
    }

    // focus node <nodeId>
    if (command === 'focus' && parts[1] === 'node' && parts[2]) {
      return {
        type: 'command',
        command: 'focus-node',
        args: { nodeId: parts[2] },
      }
    }

    // simulate <query>
    if (command === 'simulate') {
      const query = parts.slice(1).join(' ')
      return {
        type: 'ai',
        command: 'simulate',
        args: { query },
      }
    }

    // analyze consistency [nodeId]
    if (command === 'analyze' && parts[1] === 'consistency') {
      return {
        type: 'ai',
        command: 'analyze-consistency',
        args: { nodeId: parts[2] || null },
      }
    }

    // suggest connections [nodeId]
    if (command === 'suggest' && parts[1] === 'connections') {
      return {
        type: 'ai',
        command: 'suggest-connections',
        args: { nodeId: parts[2] || null },
      }
    }

    // 如果无法解析，交给 AI 处理
    return {
      type: 'ai',
      command: 'natural-language',
      args: { query: trimmed },
    }
  }, [])

  // 执行命令
  const executeCommand = useCallback(async (input: string) => {
    if (isProcessing) return

    setIsProcessing(true)
    
    // 添加命令到输出
    const commandLine: TerminalLine = {
      id: `cmd_${Date.now()}`,
      type: 'command',
      content: `worldlab > ${input}`,
      timestamp: new Date().toISOString(),
    }
    addOutputLine(commandLine)

    // 解析命令
    const result = parseCommand(input)

    if (result.type === 'error') {
      const errorLine: TerminalLine = {
        id: `err_${Date.now()}`,
        type: 'error',
        content: `Error: ${result.error}`,
        timestamp: new Date().toISOString(),
      }
      addOutputLine(errorLine)
      setIsProcessing(false)
      return
    }

    // 执行命令
    try {
      if (result.type === 'command') {
        await executeLocalCommand(result.command!, result.args || {})
      } else if (result.type === 'ai') {
        await executeAICommand(result.command!, result.args || {})
      }
    } catch (error: any) {
      const errorLine: TerminalLine = {
        id: `err_${Date.now()}`,
        type: 'error',
        content: `Error: ${error.message || 'Unknown error'}`,
        timestamp: new Date().toISOString(),
      }
      addOutputLine(errorLine)
    } finally {
      setIsProcessing(false)
    }
  }, [isProcessing, parseCommand, addOutputLine])

  // 执行本地命令
  const executeLocalCommand = useCallback(async (command: string, args: Record<string, any>) => {
    if (!worldLabData) {
      addOutputLine({
        id: `err_${Date.now()}`,
        type: 'error',
        content: 'Error: No WorldLab data available',
        timestamp: new Date().toISOString(),
      })
      return
    }

    const nodes = worldLabData.nodes
    const edges = worldLabData.edges

    switch (command) {
      case 'help': {
        const helpText = `Available commands:
  query nodes [category]     - Query nodes (optionally filter by category)
  query edges [nodeId]        - Query edges (optionally filter by node)
  query node <nodeId>        - Query specific node details
  create node category:<cat> name:<name>  - Create a new node
  create edge <src> -> <dst> [label:<label>]  - Create an edge
  update node <nodeId> property:<key> value:<value>  - Update node property
  delete node <nodeId>       - Delete a node
  delete edge <edgeId>       - Delete an edge
  focus node <nodeId>        - Focus on a node in canvas
  simulate <query>           - AI simulate a scenario
  analyze consistency [nodeId]  - Analyze consistency
  suggest connections [nodeId]  - Suggest connections
  help                       - Show this help
  clear                      - Clear terminal
  history                    - Show command history`
        addOutputLine({
          id: `out_${Date.now()}`,
          type: 'output',
          content: helpText,
          timestamp: new Date().toISOString(),
        })
        break
      }

      case 'clear': {
        setOutputLines([])
        break
      }

      case 'history': {
        if (commandHistory.length === 0) {
          addOutputLine({
            id: `out_${Date.now()}`,
            type: 'output',
            content: 'No command history.',
            timestamp: new Date().toISOString(),
          })
        } else {
          const historyText = commandHistory.map((cmd, idx) => `${idx + 1}. ${cmd}`).join('\n')
          addOutputLine({
            id: `out_${Date.now()}`,
            type: 'output',
            content: historyText,
            timestamp: new Date().toISOString(),
          })
        }
        break
      }

      case 'query-nodes': {
        let filteredNodes = nodes
        if (args.category) {
          filteredNodes = nodes.filter(n => 
            (n.category || '').toLowerCase() === args.category.toLowerCase()
          )
        }
        const count = filteredNodes.length
        const nodeList = filteredNodes.map(n => `  - ${n.label} (${n.id}) [${n.category || 'Uncategorized'}]`).join('\n')
        addOutputLine({
          id: `out_${Date.now()}`,
          type: 'output',
          content: `Found ${count} node(s):\n${nodeList || '  (none)'}`,
          timestamp: new Date().toISOString(),
          nodeRefs: filteredNodes.map(n => n.id),
        })
        break
      }

      case 'query-edges': {
        let filteredEdges = edges
        if (args.nodeId) {
          filteredEdges = edges.filter(e => 
            e.source === args.nodeId || e.target === args.nodeId
          )
        }
        const count = filteredEdges.length
        const edgeList = filteredEdges.map(e => 
          `  - ${e.source} -> ${e.target}${e.label ? ` [${e.label}]` : ''} (${e.id})`
        ).join('\n')
        addOutputLine({
          id: `out_${Date.now()}`,
          type: 'output',
          content: `Found ${count} edge(s):\n${edgeList || '  (none)'}`,
          timestamp: new Date().toISOString(),
        })
        break
      }

      case 'query-node': {
        const node = nodes.find(n => n.id === args.nodeId)
        if (!node) {
          addOutputLine({
            id: `err_${Date.now()}`,
            type: 'error',
            content: `Node "${args.nodeId}" not found.`,
            timestamp: new Date().toISOString(),
          })
        } else {
          const info = `Node: ${node.label} (${node.id})
Category: ${node.category || 'Uncategorized'}
Position: (${node.position.x}, ${node.position.y})
${node.data?.description ? `Description: ${node.data.description}` : ''}`
          addOutputLine({
            id: `out_${Date.now()}`,
            type: 'output',
            content: info,
            timestamp: new Date().toISOString(),
            nodeRefs: [node.id],
          })
        }
        break
      }

      case 'focus-node': {
        const node = nodes.find(n => n.id === args.nodeId)
        if (!node) {
          addOutputLine({
            id: `err_${Date.now()}`,
            type: 'error',
            content: `Node "${args.nodeId}" not found.`,
            timestamp: new Date().toISOString(),
          })
        } else {
          if (onNodeSelect) {
            onNodeSelect(args.nodeId)
          }
          addOutputLine({
            id: `out_${Date.now()}`,
            type: 'info',
            content: `Focused on node: ${node.label} (${args.nodeId})`,
            timestamp: new Date().toISOString(),
            nodeRefs: [args.nodeId],
          })
        }
        break
      }

      case 'create-node': {
        if (!args.category || !args.name) {
          addOutputLine({
            id: `err_${Date.now()}`,
            type: 'error',
            content: 'Error: Missing required parameters. Use: create node category:<category> name:<name>',
            timestamp: new Date().toISOString(),
          })
          break
        }

        if (!onNodesChange) {
          addOutputLine({
            id: `err_${Date.now()}`,
            type: 'error',
            content: 'Error: onNodesChange callback not available',
            timestamp: new Date().toISOString(),
          })
          break
        }

        // Generate node ID
        const nodeId = `node_${Date.now()}`
        const newNode: WorldLabNode = {
          id: nodeId,
          label: args.name,
          category: args.category,
          position: { x: Math.random() * 400 + 100, y: Math.random() * 400 + 100 },
          data: {},
        }

        const updatedNodes = [...nodes, newNode]
        onNodesChange(updatedNodes)

        addOutputLine({
          id: `out_${Date.now()}`,
          type: 'info',
          content: `Created node: ${args.name} (${nodeId})`,
          timestamp: new Date().toISOString(),
          nodeRefs: [nodeId],
        })
        break
      }

      case 'create-edge': {
        if (!args.sourceId || !args.targetId) {
          addOutputLine({
            id: `err_${Date.now()}`,
            type: 'error',
            content: 'Error: Missing source or target node ID',
            timestamp: new Date().toISOString(),
          })
          break
        }

        // Check if nodes exist
        const sourceNode = nodes.find(n => n.id === args.sourceId)
        const targetNode = nodes.find(n => n.id === args.targetId)

        if (!sourceNode || !targetNode) {
          addOutputLine({
            id: `err_${Date.now()}`,
            type: 'error',
            content: `Error: Node not found. Source: ${sourceNode ? 'found' : 'not found'}, Target: ${targetNode ? 'found' : 'not found'}`,
            timestamp: new Date().toISOString(),
          })
          break
        }

        if (!onEdgesChange) {
          addOutputLine({
            id: `err_${Date.now()}`,
            type: 'error',
            content: 'Error: onEdgesChange callback not available',
            timestamp: new Date().toISOString(),
          })
          break
        }

        // Check if edge already exists
        const edgeExists = edges.some(e => 
          e.source === args.sourceId && e.target === args.targetId
        )

        if (edgeExists) {
          addOutputLine({
            id: `err_${Date.now()}`,
            type: 'error',
            content: `Error: Edge already exists between ${args.sourceId} and ${args.targetId}`,
            timestamp: new Date().toISOString(),
          })
          break
        }

        // Generate edge ID
        const edgeId = `edge_${Date.now()}`
        const newEdge: WorldLabEdge = {
          id: edgeId,
          source: args.sourceId,
          target: args.targetId,
          label: args.label || undefined,
          type: 'default',
        }

        const updatedEdges = [...edges, newEdge]
        onEdgesChange(updatedEdges)

        addOutputLine({
          id: `out_${Date.now()}`,
          type: 'info',
          content: `Created edge: ${args.sourceId} -> ${args.targetId}${args.label ? ` [${args.label}]` : ''}`,
          timestamp: new Date().toISOString(),
        })
        break
      }

      case 'update-node': {
        if (!args.nodeId || !args.property || args.value === undefined) {
          addOutputLine({
            id: `err_${Date.now()}`,
            type: 'error',
            content: 'Error: Missing required parameters. Use: update node <nodeId> property:<key> value:<value>',
            timestamp: new Date().toISOString(),
          })
          break
        }

        const nodeIndex = nodes.findIndex(n => n.id === args.nodeId)
        if (nodeIndex === -1) {
          addOutputLine({
            id: `err_${Date.now()}`,
            type: 'error',
            content: `Error: Node "${args.nodeId}" not found`,
            timestamp: new Date().toISOString(),
          })
          break
        }

        if (!onNodesChange) {
          addOutputLine({
            id: `err_${Date.now()}`,
            type: 'error',
            content: 'Error: onNodesChange callback not available',
            timestamp: new Date().toISOString(),
          })
          break
        }

        const updatedNodes = [...nodes]
        const node = { ...updatedNodes[nodeIndex] }

        // Update property
        if (args.property === 'label') {
          node.label = args.value
        } else if (args.property === 'category') {
          node.category = args.value
        } else {
          // Update data property
          if (!node.data) node.data = {}
          node.data[args.property] = args.value
        }

        updatedNodes[nodeIndex] = node
        onNodesChange(updatedNodes)

        addOutputLine({
          id: `out_${Date.now()}`,
          type: 'info',
          content: `Updated node ${args.nodeId}: ${args.property} = ${args.value}`,
          timestamp: new Date().toISOString(),
          nodeRefs: [args.nodeId],
        })
        break
      }

      case 'delete-node': {
        const nodeIndex = nodes.findIndex(n => n.id === args.nodeId)
        if (nodeIndex === -1) {
          addOutputLine({
            id: `err_${Date.now()}`,
            type: 'error',
            content: `Error: Node "${args.nodeId}" not found`,
            timestamp: new Date().toISOString(),
          })
          break
        }

        if (!onNodesChange || !onEdgesChange) {
          addOutputLine({
            id: `err_${Date.now()}`,
            type: 'error',
            content: 'Error: Callbacks not available',
            timestamp: new Date().toISOString(),
          })
          break
        }

        // Delete node
        const updatedNodes = nodes.filter(n => n.id !== args.nodeId)
        onNodesChange(updatedNodes)

        // Delete related edges
        const updatedEdges = edges.filter(e => 
          e.source !== args.nodeId && e.target !== args.nodeId
        )
        onEdgesChange(updatedEdges)

        addOutputLine({
          id: `out_${Date.now()}`,
          type: 'info',
          content: `Deleted node: ${args.nodeId} (and related edges)`,
          timestamp: new Date().toISOString(),
        })
        break
      }

      case 'delete-edge': {
        const edgeIndex = edges.findIndex(e => e.id === args.edgeId)
        if (edgeIndex === -1) {
          addOutputLine({
            id: `err_${Date.now()}`,
            type: 'error',
            content: `Error: Edge "${args.edgeId}" not found`,
            timestamp: new Date().toISOString(),
          })
          break
        }

        if (!onEdgesChange) {
          addOutputLine({
            id: `err_${Date.now()}`,
            type: 'error',
            content: 'Error: onEdgesChange callback not available',
            timestamp: new Date().toISOString(),
          })
          break
        }

        const updatedEdges = edges.filter(e => e.id !== args.edgeId)
        onEdgesChange(updatedEdges)

        addOutputLine({
          id: `out_${Date.now()}`,
          type: 'info',
          content: `Deleted edge: ${args.edgeId}`,
          timestamp: new Date().toISOString(),
        })
        break
      }

      default:
        addOutputLine({
          id: `err_${Date.now()}`,
          type: 'error',
          content: `Command "${command}" not implemented yet.`,
          timestamp: new Date().toISOString(),
        })
    }
  }, [worldLabData, commandHistory, addOutputLine, onNodeSelect, onNodesChange, onEdgesChange])

  // 构建 WorldLab 上下文内容
  const buildWorldLabContext = useCallback((): string => {
    if (!worldLabData) return ''
    
    const nodes = worldLabData.nodes
    const edges = worldLabData.edges
    
    let context = `WorldLab: ${labName}\n\n`
    context += `Nodes (${nodes.length}):\n`
    nodes.forEach(node => {
      context += `  - ${node.label} (ID: ${node.id})`
      if (node.category) context += ` [Category: ${node.category}]`
      if (node.data?.description) context += ` - ${node.data.description}`
      context += '\n'
    })
    
    context += `\nEdges (${edges.length}):\n`
    edges.forEach(edge => {
      context += `  - ${edge.source} -> ${edge.target}`
      if (edge.label) context += ` [${edge.label}]`
      context += '\n'
    })
    
    if (selectedNodeId) {
      const selectedNode = nodes.find(n => n.id === selectedNodeId)
      if (selectedNode) {
        context += `\nCurrently selected node: ${selectedNode.label} (${selectedNodeId})\n`
      }
    }
    
    return context
  }, [worldLabData, labName, selectedNodeId])

  // 执行 AI 命令
  const executeAICommand = useCallback(async (command: string, args: Record<string, any>) => {
    if (!worldLabData) {
      addOutputLine({
        id: `err_${Date.now()}`,
        type: 'error',
        content: 'Error: No WorldLab data available',
        timestamp: new Date().toISOString(),
      })
      return
    }

    // 构建 AI 提示
    const worldLabContext = buildWorldLabContext()
    let aiPrompt = ''

    switch (command) {
      case 'simulate': {
        aiPrompt = `You are analyzing a WorldLab (world-building system). Here is the current state:

${worldLabContext}

User wants to simulate: "${args.query}"

Please analyze what would happen in this scenario. Consider:
- How would the nodes interact?
- What new connections or events might occur?
- Are there any inconsistencies or conflicts?
- What are the implications?

Provide a clear, structured analysis.`
        break
      }

      case 'analyze-consistency': {
        const nodeContext = args.nodeId 
          ? `Focusing on node: ${args.nodeId}\n`
          : 'Analyzing the entire WorldLab for consistency.\n'
        aiPrompt = `You are analyzing a WorldLab for consistency. Here is the current state:

${worldLabContext}
${nodeContext}

Please check for:
- Contradictions between nodes
- Missing connections that should exist
- Inconsistent properties or relationships
- Logical errors or gaps

Provide a detailed consistency analysis.`
        break
      }

      case 'suggest-connections': {
        const nodeContext = args.nodeId
          ? `Focusing on node: ${args.nodeId}\n`
          : 'Suggesting connections for the entire WorldLab.\n'
        aiPrompt = `You are analyzing a WorldLab to suggest connections. Here is the current state:

${worldLabContext}
${nodeContext}

Please suggest:
- Missing connections between nodes that make sense
- Relationships that could be added
- Edges that would improve the world structure

Provide specific suggestions with source and target node IDs.`
        break
      }

      case 'natural-language': {
        aiPrompt = `You are an AI assistant helping with a WorldLab (world-building system). Here is the current state:

${worldLabContext}

User question/request: "${args.query}"

Please help the user understand or interact with this WorldLab. You can:
- Answer questions about nodes, edges, and relationships
- Suggest modifications or improvements
- Help explore the world structure
- Provide insights about the world state

Respond in a helpful, clear manner.`
        break
      }

      default: {
        addOutputLine({
          id: `err_${Date.now()}`,
          type: 'error',
          content: `Unknown AI command: ${command}`,
          timestamp: new Date().toISOString(),
        })
        return
      }
    }

    // 创建 AI 输出行
    const aiLine: TerminalLine = {
      id: `ai_${Date.now()}`,
      type: 'output',
      content: '',
      timestamp: new Date().toISOString(),
    }
    currentAILineIdRef.current = aiLine.id
    currentAIOutputRef.current = ''
    addOutputLine(aiLine)

    try {
      // 调用 AI API
      const response = await aiApi.streamChat(
        aiPrompt,
        worldLabContext, // documentContent
        undefined, // documentId
        [], // chatHistory
        false, // useWebSearch
        'gemini-3-flash-preview', // modelName
        undefined, // attachments
        'Normal', // style
        projectId // projectId
      )

      const reader = response.body?.getReader()
      if (!reader) {
        throw new Error('Failed to get stream reader')
      }

      streamReaderRef.current = reader
      const decoder = new TextDecoder()

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const chunk = decoder.decode(value)
        const lines = chunk.split('\n')

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6))
              if (data.error) {
                throw new Error(data.error)
              }
              if (data.chunk) {
                // Skip metadata chunks
                if (!data.chunk.includes('__METADATA__')) {
                  currentAIOutputRef.current += data.chunk
                  // Update the output line
                  setOutputLines(prev => {
                    const updated = [...prev]
                    const lineIndex = updated.findIndex(l => l.id === currentAILineIdRef.current)
                    if (lineIndex !== -1) {
                      updated[lineIndex] = {
                        ...updated[lineIndex],
                        content: currentAIOutputRef.current,
                      }
                    }
                    return updated
                  })
                  scrollToBottom()
                }
              }
            } catch (e) {
              // Ignore parse errors
            }
          }
        }
      }
    } catch (error: any) {
      const errorLine: TerminalLine = {
        id: `err_${Date.now()}`,
        type: 'error',
        content: `AI Error: ${error.message || 'Unknown error'}`,
        timestamp: new Date().toISOString(),
      }
      addOutputLine(errorLine)
      
      // Remove the empty AI line if it exists
      if (currentAILineIdRef.current) {
        setOutputLines(prev => prev.filter(l => l.id !== currentAILineIdRef.current))
      }
    } finally {
      streamReaderRef.current = null
      currentAILineIdRef.current = null
      currentAIOutputRef.current = ''
    }
  }, [worldLabData, buildWorldLabContext, addOutputLine, scrollToBottom, projectId, labName])

  // 获取自动补全建议
  const getAutocompleteSuggestions = useCallback((input: string): string[] => {
    if (!input.trim()) return []

    const trimmed = input.trim().toLowerCase()
    const parts = trimmed.split(/\s+/)
    const lastPart = parts[parts.length - 1] || ''

    // 命令补全
    const commands = [
      'query', 'create', 'update', 'delete', 'focus',
      'simulate', 'analyze', 'suggest', 'help', 'clear', 'history'
    ]
    if (parts.length === 1) {
      return commands.filter(cmd => cmd.startsWith(trimmed))
    }

    // 节点 ID 补全
    if (worldLabData) {
      const nodes = worldLabData.nodes
      const nodeIds = nodes.map(n => n.id).filter(id => id.toLowerCase().includes(lastPart))
      const nodeLabels = nodes
        .filter(n => n.label.toLowerCase().includes(lastPart))
        .map(n => n.id)
      
      if (nodeIds.length > 0 || nodeLabels.length > 0) {
        return [...new Set([...nodeIds, ...nodeLabels])].slice(0, 10)
      }
    }

    // 子命令补全
    if (parts[0] === 'query' && parts.length === 2) {
      const subCommands = ['nodes', 'edges', 'node']
      return subCommands.filter(cmd => cmd.startsWith(parts[1] || ''))
    }

    if (parts[0] === 'create' && parts.length === 2) {
      const subCommands = ['node', 'edge']
      return subCommands.filter(cmd => cmd.startsWith(parts[1] || ''))
    }

    if (parts[0] === 'delete' && parts.length === 2) {
      const subCommands = ['node', 'edge']
      return subCommands.filter(cmd => cmd.startsWith(parts[1] || ''))
    }

    if (parts[0] === 'analyze' && parts.length === 2) {
      const subCommands = ['consistency']
      return subCommands.filter(cmd => cmd.startsWith(parts[1] || ''))
    }

    if (parts[0] === 'suggest' && parts.length === 2) {
      const subCommands = ['connections']
      return subCommands.filter(cmd => cmd.startsWith(parts[1] || ''))
    }

    return []
  }, [worldLabData])

  // 处理输入变化，更新自动补全
  useEffect(() => {
    if (currentInput.trim()) {
      const suggestions = getAutocompleteSuggestions(currentInput)
      setAutocompleteSuggestions(suggestions)
      setShowAutocomplete(suggestions.length > 0)
      setAutocompleteIndex(-1)
    } else {
      setShowAutocomplete(false)
      setAutocompleteSuggestions([])
    }
  }, [currentInput, getAutocompleteSuggestions])

  // 处理输入提交
  const handleSubmit = useCallback(async (e: React.KeyboardEvent<HTMLDivElement>) => {
    // Tab 键：应用自动补全
    if (e.key === 'Tab' && showAutocomplete && autocompleteSuggestions.length > 0) {
      e.preventDefault()
      const selectedIndex = autocompleteIndex === -1 ? 0 : autocompleteIndex
      const suggestion = autocompleteSuggestions[selectedIndex]
      
      if (suggestion) {
        const parts = currentInput.trim().split(/\s+/)
        const lastPart = parts[parts.length - 1] || ''
        const newInput = currentInput.slice(0, currentInput.length - lastPart.length) + suggestion
        setCurrentInput(newInput)
        setShowAutocomplete(false)
        
        // 更新 contentEditable
        if (inputRef.current) {
          inputRef.current.textContent = newInput
          // 移动光标到末尾
          const range = document.createRange()
          const sel = window.getSelection()
          range.selectNodeContents(inputRef.current)
          range.collapse(false)
          sel?.removeAllRanges()
          sel?.addRange(range)
        }
      }
      return
    }

    // 上下箭头：导航自动补全
    if (e.key === 'ArrowUp' && showAutocomplete) {
      e.preventDefault()
      if (autocompleteSuggestions.length > 0) {
        const newIndex = autocompleteIndex === -1 
          ? autocompleteSuggestions.length - 1 
          : Math.max(0, autocompleteIndex - 1)
        setAutocompleteIndex(newIndex)
      }
      return
    }

    if (e.key === 'ArrowDown' && showAutocomplete) {
      e.preventDefault()
      if (autocompleteSuggestions.length > 0) {
        const newIndex = autocompleteIndex === -1 
          ? 0 
          : Math.min(autocompleteSuggestions.length - 1, autocompleteIndex + 1)
        setAutocompleteIndex(newIndex)
      }
      return
    }

    // Esc: 关闭自动补全
    if (e.key === 'Escape' && showAutocomplete) {
      e.preventDefault()
      setShowAutocomplete(false)
      return
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      const input = currentInput.trim()
      if (!input || isProcessing) return

      // 关闭自动补全
      setShowAutocomplete(false)

      // 添加到命令历史
      setCommandHistory(prev => [...prev, input])
      setHistoryIndex(-1)
      setCurrentInput('')

      // 执行命令
      await executeCommand(input)
    } else if (e.key === 'ArrowUp' && !showAutocomplete) {
      e.preventDefault()
      if (commandHistory.length > 0) {
        const newIndex = historyIndex === -1 
          ? commandHistory.length - 1 
          : Math.max(0, historyIndex - 1)
        setHistoryIndex(newIndex)
        setCurrentInput(commandHistory[newIndex])
        if (inputRef.current) {
          inputRef.current.textContent = commandHistory[newIndex]
        }
      }
    } else if (e.key === 'ArrowDown' && !showAutocomplete) {
      e.preventDefault()
      if (historyIndex !== -1) {
        const newIndex = historyIndex + 1
        if (newIndex >= commandHistory.length) {
          setHistoryIndex(-1)
          setCurrentInput('')
          if (inputRef.current) {
            inputRef.current.textContent = ''
          }
        } else {
          setHistoryIndex(newIndex)
          setCurrentInput(commandHistory[newIndex])
          if (inputRef.current) {
            inputRef.current.textContent = commandHistory[newIndex]
          }
        }
      }
    }
  }, [currentInput, isProcessing, commandHistory, historyIndex, executeCommand, showAutocomplete, autocompleteSuggestions, autocompleteIndex])

  // 样式
  const bgColor = theme === 'dark' ? '#0D0D0D' : '#FAFAFA'
  const textColor = theme === 'dark' ? '#E8E8E8' : '#1A1A1A'
  const borderColor = theme === 'dark' ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.1)'
  const promptColor = theme === 'dark' ? '#5BA3FF' : '#1976D2'
  const errorColor = theme === 'dark' ? '#FF6B9D' : '#D32F2F'
  const infoColor = theme === 'dark' ? '#51CF66' : '#388E3C'

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        background: bgColor,
        fontFamily: "'SF Mono', 'Monaco', 'Inconsolata', 'Roboto Mono', monospace",
        fontSize: '13px',
        lineHeight: '1.5',
        color: textColor,
      }}
    >
      {/* Terminal Output Area */}
      <div
        ref={terminalRef}
        style={{
          flex: 1,
          overflowY: 'auto',
          overflowX: 'hidden',
          padding: '16px',
          paddingBottom: '8px',
          position: 'relative',
        }}
      >
        {outputLines.map(line => {
          let lineColor = textColor
          if (line.type === 'error') lineColor = errorColor
          else if (line.type === 'info') lineColor = infoColor
          else if (line.type === 'command') lineColor = promptColor

          // 语法高亮：节点 ID（绿色）、命令（蓝色）
          const highlightContent = (content: string): React.ReactNode => {
            if (line.type === 'command') {
              // 命令行：高亮命令部分
              const parts = content.split('worldlab > ')
              if (parts.length === 2) {
                return (
                  <>
                    <span style={{ color: promptColor }}>worldlab &gt; </span>
                    <span style={{ color: textColor }}>{parts[1]}</span>
                  </>
                )
              }
            } else if (line.type === 'output' && worldLabData) {
              // 输出行：高亮节点 ID
              const nodes = worldLabData.nodes
              let highlighted = content
              nodes.forEach(node => {
                const regex = new RegExp(`\\b(${node.id})\\b`, 'g')
                highlighted = highlighted.replace(regex, `__NODE_${node.id}__`)
              })
              
              const parts = highlighted.split(/(__NODE_\w+__)/g)
              return (
                <>
                  {parts.map((part, idx) => {
                    if (part.startsWith('__NODE_') && part.endsWith('__')) {
                      const nodeId = part.slice(7, -2)
                      const nodeColor = theme === 'dark' ? '#51CF66' : '#388E3C'
                      return (
                        <span key={idx} style={{ color: nodeColor, fontWeight: 500 }}>
                          {nodeId}
                        </span>
                      )
                    }
                    return <span key={idx}>{part}</span>
                  })}
                </>
              )
            }
            
            return content
          }

          return (
            <div
              key={line.id}
              style={{
                color: lineColor,
                marginBottom: '4px',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
              }}
            >
              {highlightContent(line.content)}
            </div>
          )
        })}
        
        {/* Input Prompt */}
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            marginTop: '8px',
          }}
        >
          <span style={{ color: promptColor, marginRight: '8px' }}>worldlab &gt;</span>
          <div
            ref={inputRef}
            contentEditable
            suppressContentEditableWarning
            onKeyDown={handleSubmit}
            onInput={(e) => {
              const text = e.currentTarget.textContent || ''
              setCurrentInput(text)
            }}
            style={{
              flex: 1,
              outline: 'none',
              color: textColor,
              minHeight: '20px',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
            }}
            data-placeholder={isProcessing ? 'Processing...' : 'Type a command...'}
          />
        </div>

        {/* Autocomplete Dropdown */}
        {showAutocomplete && autocompleteSuggestions.length > 0 && (
          <div
            style={{
              position: 'absolute',
              bottom: '40px',
              left: '16px',
              right: '16px',
              background: theme === 'dark' ? 'rgba(28, 28, 28, 0.98)' : 'rgba(255, 255, 255, 0.98)',
              border: `1px solid ${borderColor}`,
              borderRadius: '6px',
              boxShadow: theme === 'dark'
                ? '0 4px 12px rgba(0, 0, 0, 0.4)'
                : '0 4px 12px rgba(0, 0, 0, 0.1)',
              maxHeight: '200px',
              overflowY: 'auto',
              zIndex: 1000,
              padding: '4px 0',
            }}
          >
            {autocompleteSuggestions.map((suggestion, idx) => (
              <div
                key={idx}
                onClick={() => {
                  const parts = currentInput.trim().split(/\s+/)
                  const lastPart = parts[parts.length - 1] || ''
                  const newInput = currentInput.slice(0, currentInput.length - lastPart.length) + suggestion
                  setCurrentInput(newInput)
                  setShowAutocomplete(false)
                  if (inputRef.current) {
                    inputRef.current.textContent = newInput
                    const range = document.createRange()
                    const sel = window.getSelection()
                    range.selectNodeContents(inputRef.current)
                    range.collapse(false)
                    sel?.removeAllRanges()
                    sel?.addRange(range)
                  }
                }}
                style={{
                  padding: '6px 12px',
                  cursor: 'pointer',
                  background: idx === autocompleteIndex 
                    ? (theme === 'dark' ? 'rgba(91, 163, 255, 0.2)' : 'rgba(25, 118, 210, 0.1)')
                    : 'transparent',
                  color: textColor,
                  fontSize: '13px',
                  fontFamily: "'SF Mono', 'Monaco', 'Inconsolata', 'Roboto Mono', monospace",
                }}
                onMouseEnter={() => setAutocompleteIndex(idx)}
              >
                {suggestion}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Custom Scrollbar Styles */}
      <style>{`
        div::-webkit-scrollbar {
          width: 8px;
          height: 8px;
        }
        div::-webkit-scrollbar-track {
          background: transparent;
        }
        div::-webkit-scrollbar-thumb {
          background: ${theme === 'dark' ? 'rgba(255, 255, 255, 0.2)' : 'rgba(0, 0, 0, 0.2)'};
          border-radius: 4px;
        }
        div::-webkit-scrollbar-thumb:hover {
          background: ${theme === 'dark' ? 'rgba(255, 255, 255, 0.3)' : 'rgba(0, 0, 0, 0.3)'};
        }
        [contenteditable][data-placeholder]:empty:before {
          content: attr(data-placeholder);
          color: ${theme === 'dark' ? 'rgba(255, 255, 255, 0.4)' : 'rgba(0, 0, 0, 0.4)'};
          pointer-events: none;
        }
      `}</style>
    </div>
  )
}
