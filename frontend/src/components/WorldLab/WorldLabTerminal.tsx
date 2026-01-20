import React, { useState, useRef, useEffect, useCallback } from 'react'
import { useTheme } from '../../contexts/ThemeContext'
import { WorldLab, WorldLabNode, WorldLabEdge } from '@shared/types'
import { aiApi } from '../../services/api'
// @ts-ignore
import AddIcon from '@mui/icons-material/Add'
// @ts-ignore
import HistoryIcon from '@mui/icons-material/History'
// @ts-ignore
import CloseIcon from '@mui/icons-material/Close'
// @ts-ignore
import EditIcon from '@mui/icons-material/Edit'
// @ts-ignore
import DeleteIcon from '@mui/icons-material/Delete'

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

interface TerminalSession {
  id: string
  name: string
  lines: TerminalLine[]
  commandHistory: string[]
}

// Helper functions to persist active terminal session ID per lab
function getActiveTerminalIdKey(labName: string): string {
  return `activeTerminalId_${labName}`
}

function loadActiveTerminalId(labName: string): string | null {
  try {
    return localStorage.getItem(getActiveTerminalIdKey(labName))
  } catch (error) {
    console.error('Failed to load active terminal ID:', error)
    return null
  }
}

function saveActiveTerminalId(labName: string, terminalId: string): void {
  try {
    localStorage.setItem(getActiveTerminalIdKey(labName), terminalId)
  } catch (error) {
    console.error('Failed to save active terminal ID:', error)
  }
}

// Helper functions to persist open terminal tabs per lab
function getOpenTerminalTabsKey(labName: string): string {
  return `openTerminalTabs_${labName}`
}

function loadOpenTerminalTabs(labName: string): string[] {
  try {
    const saved = localStorage.getItem(getOpenTerminalTabsKey(labName))
    if (saved) {
      const parsed = JSON.parse(saved)
      return Array.isArray(parsed) ? parsed : []
    }
  } catch (error) {
    console.error('Failed to load open terminal tabs:', error)
  }
  return []
}

function saveOpenTerminalTabs(labName: string, terminalIds: string[]): void {
  try {
    localStorage.setItem(getOpenTerminalTabsKey(labName), JSON.stringify(terminalIds))
  } catch (error) {
    console.error('Failed to save open terminal tabs:', error)
  }
}

// Helper function to load terminal session from localStorage
function loadTerminalSession(labName: string, terminalId: string): TerminalSession | null {
  try {
    const storageKey = `worldlab_terminal_${labName}_${terminalId}`
    const saved = localStorage.getItem(storageKey)
    if (saved) {
      const parsed = JSON.parse(saved)
      return {
        id: terminalId,
        name: parsed.name || `Terminal ${terminalId.split('_').pop()?.slice(0, 6) || '1'}`,
        lines: Array.isArray(parsed.lines) ? parsed.lines : [],
        commandHistory: Array.isArray(parsed.commandHistory) ? parsed.commandHistory : [],
      }
    }
  } catch (error) {
    console.error('Failed to load terminal session:', error)
  }
  return null
}

// Helper function to save terminal session to localStorage
function saveTerminalSession(labName: string, session: TerminalSession): void {
  try {
    const storageKey = `worldlab_terminal_${labName}_${session.id}`
    localStorage.setItem(storageKey, JSON.stringify({
      name: session.name,
      lines: session.lines,
      commandHistory: session.commandHistory,
    }))
  } catch (error) {
    console.error('Failed to save terminal session:', error)
  }
}

// Helper function to generate terminal name from first command
function generateTerminalName(firstCommand: string): string {
  if (!firstCommand || !firstCommand.trim()) return 'New Terminal'
  const cleaned = firstCommand.trim().replace(/\n/g, ' ').substring(0, 30)
  return cleaned.length < firstCommand.trim().length ? `${cleaned}...` : cleaned
}

export default function WorldLabTerminal({
  labName,
  worldLabData,
  selectedNodeId,
  onNodeSelect,
  onNodesChange,
  onEdgesChange,
  projectId,
  onClose,
}: WorldLabTerminalProps) {
  const { theme } = useTheme()
  
  // Terminal session management
  const [terminalSessions, setTerminalSessions] = useState<TerminalSession[]>([])
  const [activeTerminalId, setActiveTerminalId] = useState<string>(() => {
    const saved = loadActiveTerminalId(labName)
    return saved || 'terminal_default'
  })
  const [showHistoryDropdown, setShowHistoryDropdown] = useState(false)
  const [hoveredTerminalId, setHoveredTerminalId] = useState<string | null>(null)
  const [draggedTerminalId, setDraggedTerminalId] = useState<string | null>(null)
  const [dropTargetTerminalId, setDropTargetTerminalId] = useState<string | null>(null)
  const [dropPosition, setDropPosition] = useState<'left' | 'right' | null>(null)
  const headerScrollRef = useRef<HTMLDivElement>(null)
  const terminalTabsScrollRef = useRef<HTMLDivElement>(null)
  const historyButtonRef = useRef<HTMLButtonElement>(null)
  const scrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  
  // Get current active session
  const activeSession = terminalSessions.find(s => s.id === activeTerminalId)
  
  // 状态管理 - use active session data
  const [commandHistory, setCommandHistory] = useState<string[]>([])
  const [historyIndex, setHistoryIndex] = useState<number>(-1)
  const [currentInput, setCurrentInput] = useState<string>('')
  const [outputLines, setOutputLines] = useState<TerminalLine[]>([])
  const [isProcessing, setIsProcessing] = useState<boolean>(false)
  const [googleApiKey, setGoogleApiKey] = useState<string>('')
  const [openaiApiKey, setOpenaiApiKey] = useState<string>('')
  // Initialize selectedModel based on available API keys from localStorage
  const [selectedModel, setSelectedModel] = useState<string>(() => {
    try {
      const googleKey = localStorage.getItem('googleApiKey') || ''
      const openaiKey = localStorage.getItem('openaiApiKey') || ''
      const hasGoogleKey = !!googleKey && googleKey.trim().length > 0
      const hasOpenaiKey = !!openaiKey && openaiKey.trim().length > 0
      
      console.log('[WorldLabTerminal] Initial model selection:', {
        hasGoogleKey,
        hasOpenaiKey,
        googleKeyLength: googleKey.length,
        openaiKeyLength: openaiKey.length,
      })
      
      // Select model based on available keys
      let selectedModel: string
      if (hasOpenaiKey && !hasGoogleKey) {
        // Only OpenAI key available - use GPT
        selectedModel = 'gpt-4.1-nano'
      } else if (hasGoogleKey && !hasOpenaiKey) {
        // Only Google key available - use Gemini
        selectedModel = 'gemini-3-flash-preview'
      } else if (hasGoogleKey && hasOpenaiKey) {
        // Both keys available - prefer Gemini
        selectedModel = 'gemini-3-flash-preview'
      } else {
        // No keys available - default to GPT (will show clearer error message)
        selectedModel = 'gpt-4.1-nano'
      }
      
      console.log('[WorldLabTerminal] Initial selected model:', selectedModel)
      return selectedModel
    } catch (error) {
      console.error('[WorldLabTerminal] Failed to initialize model from localStorage:', error)
      // Default to GPT if there's an error reading localStorage
      return 'gpt-4.1-nano'
    }
  })
  
  // Refs
  const terminalRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLDivElement>(null)
  const streamReaderRef = useRef<ReadableStreamDefaultReader<Uint8Array> | null>(null)
  const currentAIOutputRef = useRef<string>('')
  const currentAILineIdRef = useRef<string | null>(null)
  const isLoadingSessionRef = useRef<boolean>(false)
  const terminalSessionsRef = useRef<TerminalSession[]>([])

  // Load API keys from localStorage
  useEffect(() => {
    const loadApiKeys = () => {
      try {
        const googleKey = localStorage.getItem('googleApiKey') || ''
        const openaiKey = localStorage.getItem('openaiApiKey') || ''
        const hasGoogleKey = !!googleKey && googleKey.trim().length > 0
        const hasOpenaiKey = !!openaiKey && openaiKey.trim().length > 0
        
        console.log('[WorldLabTerminal] Loading API keys:', {
          hasGoogleKey,
          hasOpenaiKey,
          googleKeyLength: googleKey.length,
          openaiKeyLength: openaiKey.length,
        })
        
        setGoogleApiKey(googleKey)
        setOpenaiApiKey(openaiKey)
      } catch (error) {
        console.error('[WorldLabTerminal] Failed to load API keys:', error)
      }
    }
    
    loadApiKeys()
    
    // Listen for storage changes (when user updates API keys in settings)
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'googleApiKey' || e.key === 'openaiApiKey') {
        console.log('[WorldLabTerminal] Storage changed:', e.key)
        loadApiKeys()
      }
    }
    
    window.addEventListener('storage', handleStorageChange)
    return () => window.removeEventListener('storage', handleStorageChange)
  }, [])

  // Select appropriate model based on available API keys
  useEffect(() => {
    const hasGoogleKey = !!googleApiKey && googleApiKey.trim().length > 0
    const hasOpenaiKey = !!openaiApiKey && openaiApiKey.trim().length > 0
    const isGeminiModel = selectedModel && (selectedModel.startsWith('gemini-') || selectedModel.includes('gemini'))
    const isGptModel = selectedModel && selectedModel.startsWith('gpt-')
    
    console.log('[WorldLabTerminal] Model selection effect triggered:', {
      currentModel: selectedModel,
      hasGoogleKey,
      hasOpenaiKey,
      isGeminiModel,
      isGptModel,
    })
    
    // If current model is incompatible with available keys, switch to a compatible one
    if (isGptModel && !hasOpenaiKey) {
      // GPT model selected but no OpenAI key - switch to Gemini if available
      if (hasGoogleKey) {
        console.log('[WorldLabTerminal] Switching from GPT to Gemini (no OpenAI key, has Google key)')
        setSelectedModel('gemini-3-flash-preview')
      }
      // If no keys at all, keep GPT (will show error when used, but at least won't try Gemini)
    } else if (isGeminiModel && !hasGoogleKey) {
      // Gemini model selected but no Google key - switch to GPT if available
      if (hasOpenaiKey) {
        console.log('[WorldLabTerminal] Switching from Gemini to GPT (no Google key, has OpenAI key)')
        setSelectedModel('gpt-4.1-nano')
      }
      // If no keys at all, switch to GPT (will show clearer error message)
      else if (!hasOpenaiKey && !hasGoogleKey) {
        console.log('[WorldLabTerminal] Switching from Gemini to GPT (no keys available)')
        setSelectedModel('gpt-4.1-nano')
      }
    } else if (!hasGoogleKey && !hasOpenaiKey) {
      // No keys available - prefer GPT model (will show clearer error message)
      if (!isGptModel && !isGeminiModel) {
        console.log('[WorldLabTerminal] Setting model to GPT (no keys, invalid model)')
        setSelectedModel('gpt-4.1-nano')
      } else if (isGeminiModel) {
        // Switch from Gemini to GPT if no keys available
        console.log('[WorldLabTerminal] Switching from Gemini to GPT (no keys available)')
        setSelectedModel('gpt-4.1-nano')
      }
    } else if (hasGoogleKey && hasOpenaiKey) {
      // Both keys available - prefer Gemini if current model is invalid
      if (!isGeminiModel && !isGptModel) {
        console.log('[WorldLabTerminal] Setting model to Gemini (both keys available, invalid model)')
        setSelectedModel('gemini-3-flash-preview')
      }
    } else if (hasGoogleKey && !hasOpenaiKey) {
      // Only Google key - ensure we're using a Gemini model
      if (!isGeminiModel) {
        console.log('[WorldLabTerminal] Switching to Gemini (only Google key available)')
        setSelectedModel('gemini-3-flash-preview')
      }
    } else if (hasOpenaiKey && !hasGoogleKey) {
      // Only OpenAI key - ensure we're using a GPT model
      if (!isGptModel) {
        console.log('[WorldLabTerminal] Switching to GPT (only OpenAI key available)')
        setSelectedModel('gpt-4.1-nano')
      }
    }
  }, [googleApiKey, openaiApiKey, selectedModel])

  // Initialize terminal sessions on mount
  useEffect(() => {
    const savedActiveId = loadActiveTerminalId(labName)
    const savedOpenTabs = loadOpenTerminalTabs(labName)
    
    if (savedOpenTabs.length > 0) {
      // Load saved sessions
      const loadedSessions: TerminalSession[] = []
      for (const terminalId of savedOpenTabs) {
        const session = loadTerminalSession(labName, terminalId)
        if (session) {
          loadedSessions.push(session)
        } else {
          // Create new session if not found
          const newSession: TerminalSession = {
            id: terminalId,
            name: `Terminal ${terminalId.split('_').pop()?.slice(0, 6) || '1'}`,
            lines: [],
            commandHistory: [],
          }
          loadedSessions.push(newSession)
          saveTerminalSession(labName, newSession)
        }
      }
      setTerminalSessions(loadedSessions)
      
      // Set active terminal
      const activeId = savedActiveId && loadedSessions.some(s => s.id === savedActiveId)
        ? savedActiveId
        : loadedSessions[0]?.id || 'terminal_default'
      setActiveTerminalId(activeId)
      
      // Load the active session's data immediately to avoid race conditions
      const activeSession = loadedSessions.find(s => s.id === activeId)
      if (activeSession) {
        isLoadingSessionRef.current = true
        setOutputLines(activeSession.lines)
        setCommandHistory(activeSession.commandHistory)
        setHistoryIndex(-1)
        setCurrentInput('')
        if (inputRef.current) {
          inputRef.current.textContent = ''
        }
        saveActiveTerminalId(labName, activeId)
        // Reset flag after state updates complete
        setTimeout(() => {
          isLoadingSessionRef.current = false
        }, 0)
      }
    } else {
      // First time - create default session
      const defaultId = 'terminal_default'
      const defaultSession: TerminalSession = {
        id: defaultId,
        name: 'Terminal 1',
        lines: [],
        commandHistory: [],
      }
      setTerminalSessions([defaultSession])
      setActiveTerminalId(defaultId)
      saveTerminalSession(labName, defaultSession)
      saveOpenTerminalTabs(labName, [defaultId])
      saveActiveTerminalId(labName, defaultId)
      
      // Initialize empty lines and history for new session
      isLoadingSessionRef.current = true
      setOutputLines([])
      setCommandHistory([])
      setHistoryIndex(-1)
      setCurrentInput('')
      if (inputRef.current) {
        inputRef.current.textContent = ''
      }
      setTimeout(() => {
        isLoadingSessionRef.current = false
      }, 0)
    }
  }, [labName])

  // Load active session data when activeTerminalId changes
  useEffect(() => {
    const session = terminalSessions.find(s => s.id === activeTerminalId)
    if (session) {
      // Set flag to prevent save effect from running during load
      isLoadingSessionRef.current = true
      setOutputLines(session.lines)
      setCommandHistory(session.commandHistory)
      setHistoryIndex(-1)
      setCurrentInput('')
      if (inputRef.current) {
        inputRef.current.textContent = ''
      }
      saveActiveTerminalId(labName, activeTerminalId)
      // Reset flag after state updates complete
      setTimeout(() => {
        isLoadingSessionRef.current = false
      }, 0)
      
      // Auto-focus the input field when switching terminals (separate timeout for DOM update)
      setTimeout(() => {
        if (inputRef.current) {
          inputRef.current.focus()
          // Move cursor to end
          const range = document.createRange()
          const selection = window.getSelection()
          range.selectNodeContents(inputRef.current)
          range.collapse(false) // Collapse to end
          selection?.removeAllRanges()
          selection?.addRange(range)
        }
      }, 100)
    }
  }, [activeTerminalId, terminalSessions, labName])

  // Save active session when outputLines or commandHistory changes
  useEffect(() => {
    // Skip saving if we're currently loading a session to prevent infinite loops
    if (isLoadingSessionRef.current) {
      return
    }
    
    // Use functional update to get current terminalSessions without including it in dependencies
    setTerminalSessions(prev => {
      const currentSession = prev.find(s => s.id === activeTerminalId)
      if (!currentSession) {
        return prev
      }
      
      // Update terminal name if this is the first command and name is still default
      let updatedName = currentSession.name
      if (currentSession.name.startsWith('Terminal ') && commandHistory.length === 1 && currentSession.commandHistory.length === 0) {
        const firstCommand = commandHistory[0]
        if (firstCommand) {
          updatedName = generateTerminalName(firstCommand)
        }
      }
      
      // Create updated session with current data
      const updatedSession: TerminalSession = {
        ...currentSession,
        name: updatedName,
        lines: [...outputLines], // Create new array to ensure reference change
        commandHistory: [...commandHistory], // Create new array to ensure reference change
      }
      
      // Always save to localStorage immediately to ensure persistence
      saveTerminalSession(labName, updatedSession)
      
      // Update state - always update to ensure state stays in sync
      return prev.map(s => s.id === activeTerminalId ? updatedSession : s)
    })
  }, [outputLines, commandHistory, activeTerminalId, labName])

  // Keep refs in sync with current state
  useEffect(() => {
    terminalSessionsRef.current = terminalSessions
  }, [terminalSessions])
  
  const outputLinesRef = useRef<TerminalLine[]>([])
  const commandHistoryRef = useRef<string[]>([])
  const activeTerminalIdRef = useRef<string>('')
  
  useEffect(() => {
    outputLinesRef.current = outputLines
  }, [outputLines])
  
  useEffect(() => {
    commandHistoryRef.current = commandHistory
  }, [commandHistory])
  
  useEffect(() => {
    activeTerminalIdRef.current = activeTerminalId
  }, [activeTerminalId])

  // Save all sessions on unmount to ensure nothing is lost
  useEffect(() => {
    return () => {
      // Save all terminal sessions before unmounting, ensuring active session has latest data
      const sessionsToSave = terminalSessionsRef.current.map(session => {
        if (session.id === activeTerminalIdRef.current) {
          // Update active session with current outputLines and commandHistory from refs
          return {
            ...session,
            lines: outputLinesRef.current,
            commandHistory: commandHistoryRef.current,
          }
        }
        return session
      })
      
      sessionsToSave.forEach(session => {
        saveTerminalSession(labName, session)
      })
    }
  }, [labName]) // Only depend on labName to avoid re-running unnecessarily

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

  // Add scroll detection and edge detection to show scrollbar
  useEffect(() => {
    const container = terminalRef.current
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
        }, 600) // Hide scrollbar after 600ms of no scrolling
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
  }, [])

  // Auto-focus input when processing finishes
  useEffect(() => {
    if (!isProcessing && inputRef.current) {
      // Use setTimeout to ensure the input field is visible and rendered
      setTimeout(() => {
        if (inputRef.current) {
          inputRef.current.focus()
          // Move cursor to end of content if there's any text
          const range = document.createRange()
          const selection = window.getSelection()
          range.selectNodeContents(inputRef.current)
          range.collapse(false) // Collapse to end
          selection?.removeAllRanges()
          selection?.addRange(range)
        }
      }, 100)
    }
  }, [isProcessing])

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
        // Clear is handled by the session save effect
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

  // 清理 markdown 格式，转换为 terminal 友好的纯文本
  const cleanMarkdownForTerminal = useCallback((text: string): string => {
    if (!text) return text
    
    let cleaned = text
    
    // 移除代码块标记，但保留内容
    cleaned = cleaned.replace(/```[\w]*\n?/g, '')
    cleaned = cleaned.replace(/```/g, '')
    
    // 将标题转换为大写文本
    cleaned = cleaned.replace(/^#{1,6}\s+(.+)$/gm, (_match, title) => {
      return `\n${title.toUpperCase()}\n${'='.repeat(title.length)}\n`
    })
    
    // 移除粗体和斜体标记，保留文本
    cleaned = cleaned.replace(/\*\*\*(.+?)\*\*\*/g, '$1')
    cleaned = cleaned.replace(/\*\*(.+?)\*\*/g, '$1')
    cleaned = cleaned.replace(/\*(.+?)\*/g, '$1')
    cleaned = cleaned.replace(/_(.+?)_/g, '$1')
    
    // 移除链接标记，保留文本
    cleaned = cleaned.replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1')
    
    // 移除行内代码标记
    cleaned = cleaned.replace(/`([^`]+)`/g, '$1')
    
    // 清理多余的空行（保留最多两个连续空行）
    cleaned = cleaned.replace(/\n{3,}/g, '\n\n')
    
    // 移除列表标记，转换为简单的缩进
    cleaned = cleaned.replace(/^[\s]*[-*+]\s+(.+)$/gm, '  • $1')
    cleaned = cleaned.replace(/^[\s]*\d+\.\s+(.+)$/gm, '  $1')
    
    return cleaned.trim()
  }, [])

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

IMPORTANT: Respond in plain text format only. Do NOT use markdown formatting (no **bold**, no # headers, no code blocks, no lists with markdown syntax). Use simple text with line breaks and indentation for structure.`
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

IMPORTANT: Respond in plain text format only. Do NOT use markdown formatting (no **bold**, no # headers, no code blocks, no lists with markdown syntax). Use simple text with line breaks and indentation for structure.`
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

Provide specific suggestions with source and target node IDs.

IMPORTANT: Respond in plain text format only. Do NOT use markdown formatting (no **bold**, no # headers, no code blocks, no lists with markdown syntax). Use simple text with line breaks and indentation for structure.`
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

IMPORTANT: Respond in plain text format only. Do NOT use markdown formatting (no **bold**, no # headers, no code blocks, no lists with markdown syntax). Use simple text with line breaks and indentation for structure.`
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
      // Log before calling AI API
      const hasGoogleKey = !!googleApiKey && googleApiKey.trim().length > 0
      const hasOpenaiKey = !!openaiApiKey && openaiApiKey.trim().length > 0
      console.log('[WorldLabTerminal] Executing AI command:', {
        command,
        selectedModel,
        hasGoogleKey,
        hasOpenaiKey,
        googleKeyLength: googleApiKey.length,
        openaiKeyLength: openaiApiKey.length,
        isGeminiModel: selectedModel?.startsWith('gemini-') || selectedModel?.includes('gemini'),
        isGptModel: selectedModel?.startsWith('gpt-'),
      })
      
      // 调用 AI API - pass API keys from state to ensure they're used
      const response = await aiApi.streamChat(
        aiPrompt,
        worldLabContext, // documentContent
        undefined, // documentId
        [], // chatHistory
        false, // useWebSearch
        selectedModel, // modelName - uses model selected based on available API keys
        undefined, // attachments
        'Normal', // style
        projectId, // projectId
        googleApiKey, // googleApiKeyOverride - use state value
        openaiApiKey // openaiApiKeyOverride - use state value
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
                  // Clean markdown and update the output line
                  const cleanedContent = cleanMarkdownForTerminal(currentAIOutputRef.current)
                  setOutputLines(prev => {
                    const updated = [...prev]
                    const lineIndex = updated.findIndex(l => l.id === currentAILineIdRef.current)
                    if (lineIndex !== -1) {
                      updated[lineIndex] = {
                        ...updated[lineIndex],
                        content: cleanedContent,
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
  }, [worldLabData, buildWorldLabContext, addOutputLine, scrollToBottom, projectId, labName, selectedModel, cleanMarkdownForTerminal])

  // 处理输入提交
  const handleSubmit = useCallback(async (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      const input = currentInput.trim()
      if (!input || isProcessing) return

      // 添加到命令历史
      setCommandHistory(prev => [...prev, input])
      setHistoryIndex(-1)
      setCurrentInput('')
      
      // 清空输入框内容
      if (inputRef.current) {
        inputRef.current.textContent = ''
      }

      // 执行命令
      await executeCommand(input)
    } else if (e.key === 'ArrowUp') {
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
    } else if (e.key === 'ArrowDown') {
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
  }, [currentInput, isProcessing, commandHistory, historyIndex, executeCommand])

  // Terminal management handlers
  const handleNewTerminal = () => {
    const newTerminalId = `terminal_${Date.now()}`
    const newSession: TerminalSession = {
      id: newTerminalId,
      name: `Terminal ${terminalSessions.length + 1}`,
      lines: [],
      commandHistory: [],
    }
    const newSessions = [...terminalSessions, newSession]
    setTerminalSessions(newSessions)
    setActiveTerminalId(newTerminalId)
    saveTerminalSession(labName, newSession)
    saveOpenTerminalTabs(labName, newSessions.map(s => s.id))
    saveActiveTerminalId(labName, newTerminalId)
    
    // Auto-focus the input field after creating new terminal
    setTimeout(() => {
      if (inputRef.current) {
        inputRef.current.focus()
        // Move cursor to end
        const range = document.createRange()
        const selection = window.getSelection()
        range.selectNodeContents(inputRef.current)
        range.collapse(false) // Collapse to end
        selection?.removeAllRanges()
        selection?.addRange(range)
      }
    }, 100)
  }

  const handleCloseTerminal = (terminalId: string, e?: React.MouseEvent) => {
    if (e) {
      e.stopPropagation()
    }
    
    if (terminalSessions.length === 1) {
      // If it's the last terminal, create a new one and replace the old one
      const newTerminalId = `terminal_${Date.now()}`
      const newSession: TerminalSession = {
        id: newTerminalId,
        name: 'Terminal 1',
        lines: [],
        commandHistory: [],
      }
      setTerminalSessions([newSession])
      setActiveTerminalId(newTerminalId)
      saveTerminalSession(labName, newSession)
      saveOpenTerminalTabs(labName, [newTerminalId])
      saveActiveTerminalId(labName, newTerminalId)
    } else {
      // Remove the terminal from tabs
      const newSessions = terminalSessions.filter(s => s.id !== terminalId)
      setTerminalSessions(newSessions)
      
      // Update persisted open tabs list
      saveOpenTerminalTabs(labName, newSessions.map(s => s.id))
      
      // If the closed terminal was active, switch to another one
      if (activeTerminalId === terminalId) {
        const closedIndex = terminalSessions.findIndex(s => s.id === terminalId)
        const newActiveIndex = closedIndex > 0 ? closedIndex - 1 : 0
        const newActiveId = newSessions[newActiveIndex]?.id || newSessions[0]?.id
        setActiveTerminalId(newActiveId)
        saveActiveTerminalId(labName, newActiveId)
      }
    }
  }

  const handleRenameTerminal = (terminalId: string, newName: string) => {
    setTerminalSessions(prev => {
      const updated = prev.map(s => s.id === terminalId ? { ...s, name: newName } : s)
      // Update saved session with the updated session data
      const updatedSession = updated.find(s => s.id === terminalId)
      if (updatedSession) {
        saveTerminalSession(labName, updatedSession)
      }
      return updated
    })
  }

  // Drag and drop handlers for terminal tabs
  const handleTerminalDragStart = (e: React.DragEvent, terminalId: string) => {
    setDraggedTerminalId(terminalId)
    setDropTargetTerminalId(null)
    setDropPosition(null)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', terminalId)
  }

  const handleTerminalDragOver = (e: React.DragEvent, targetTerminalId: string) => {
    e.preventDefault()
    e.stopPropagation()
    e.dataTransfer.dropEffect = 'move'
    
    if (draggedTerminalId && draggedTerminalId !== targetTerminalId) {
      const rect = e.currentTarget.getBoundingClientRect()
      const mouseX = e.clientX - rect.left
      const tabWidth = rect.width
      const dropSide = mouseX < tabWidth / 2 ? 'left' : 'right'
      
      setDropTargetTerminalId(targetTerminalId)
      setDropPosition(dropSide)
    }
  }

  const handleTerminalDragLeave = () => {
    setDropTargetTerminalId(null)
    setDropPosition(null)
  }

  const handleTerminalDrop = (e: React.DragEvent, targetTerminalId: string) => {
    e.preventDefault()
    e.stopPropagation()
    
    if (draggedTerminalId && draggedTerminalId !== targetTerminalId && dropPosition) {
      const draggedIndex = terminalSessions.findIndex(s => s.id === draggedTerminalId)
      const targetIndex = terminalSessions.findIndex(s => s.id === targetTerminalId)
      
      if (draggedIndex !== -1 && targetIndex !== -1) {
        const newSessions = [...terminalSessions]
        const [draggedSession] = newSessions.splice(draggedIndex, 1)
        
        const insertIndex = dropPosition === 'left' ? targetIndex : targetIndex + 1
        newSessions.splice(insertIndex, 0, draggedSession)
        
        setTerminalSessions(newSessions)
        saveOpenTerminalTabs(labName, newSessions.map(s => s.id))
      }
    }
    
    setDraggedTerminalId(null)
    setDropTargetTerminalId(null)
    setDropPosition(null)
  }

  const handleTerminalDragEnd = () => {
    setDraggedTerminalId(null)
    setDropTargetTerminalId(null)
    setDropPosition(null)
  }

  // Get all terminal sessions for history (including closed ones)
  const getAllTerminalSessions = (): TerminalSession[] => {
    // Load all saved sessions from localStorage
    const allSessions: TerminalSession[] = []
    try {
      // Get all keys that match the pattern
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i)
        if (key && key.startsWith(`worldlab_terminal_${labName}_`)) {
          const terminalId = key.replace(`worldlab_terminal_${labName}_`, '')
          const session = loadTerminalSession(labName, terminalId)
          if (session) {
            allSessions.push(session)
          }
        }
      }
    } catch (error) {
      console.error('Failed to load all terminal sessions:', error)
    }
    
    // Merge with currently open sessions (to get latest data)
    const sessionMap = new Map(allSessions.map(s => [s.id, s]))
    terminalSessions.forEach(session => {
      sessionMap.set(session.id, session)
    })
    
    return Array.from(sessionMap.values())
      .filter(s => s.lines.length > 0) // Only show terminals with content
      .sort((a, b) => {
        // Sort by last activity (last line timestamp)
        const aLastTime = a.lines.length > 0 
          ? new Date(a.lines[a.lines.length - 1].timestamp).getTime()
          : 0
        const bLastTime = b.lines.length > 0
          ? new Date(b.lines[b.lines.length - 1].timestamp).getTime()
          : 0
        return bLastTime - aLastTime
      })
      .slice(0, 20) // Keep the 20 most recent
  }

  // Update terminal name when first command is executed
  useEffect(() => {
    // Use the activeSession's commandHistory instead of the shared state
    // to avoid stale data when switching tabs
    if (activeSession && activeSession.name.startsWith('Terminal ') && activeSession.commandHistory.length === 1) {
      const firstCommand = activeSession.commandHistory[0]
      if (firstCommand) {
        const newName = generateTerminalName(firstCommand)
        // Only update if the name hasn't been set yet (still default name)
        if (activeSession.name.startsWith('Terminal ')) {
          handleRenameTerminal(activeTerminalId, newName)
        }
      }
    }
  }, [activeSession?.commandHistory.length, activeSession?.name, activeTerminalId])

  // Add scroll detection for header
  useEffect(() => {
    const container = headerScrollRef.current
    if (!container) return

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
        }, 600)
      }
    }

    container.addEventListener('scroll', handleScroll, { passive: true })
    
    return () => {
      container.removeEventListener('scroll', handleScroll)
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current)
      }
    }
  }, [])

  // Close history dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node
      if (historyButtonRef.current && !historyButtonRef.current.contains(target)) {
        // Check if clicking on history dropdown (it will be rendered separately)
        const historyDropdown = document.querySelector('[data-terminal-history-dropdown]')
        if (!historyDropdown || !historyDropdown.contains(target)) {
          setShowHistoryDropdown(false)
        }
      }
    }

    if (showHistoryDropdown) {
      document.addEventListener('mousedown', handleClickOutside, true)
      return () => {
        document.removeEventListener('mousedown', handleClickOutside, true)
      }
    }
  }, [showHistoryDropdown])

  // 样式 - 使用与 FileExplorer 相同的背景颜色
  const bgColor = theme === 'dark' ? '#141414' : '#FAFAFA'
  const brighterBg = theme === 'dark' ? '#141414' : '#FAFAFA'
  const textColor = theme === 'dark' ? '#E8E8E8' : '#1A1A1A'
  const promptColor = theme === 'dark' ? '#5BA3FF' : '#1976D2'
  const errorColor = theme === 'dark' ? '#FF6B9D' : '#D32F2F'
  const infoColor = theme === 'dark' ? '#51CF66' : '#388E3C'
  const activeTerminalBg = theme === 'dark' ? '#212121' : '#f0f0f0'
  const hoverBg = theme === 'dark' ? '#1f1f1f' : '#f5f5f5'
  const buttonHoverBg = theme === 'dark' ? '#252525' : '#f8f8f8'
  const iconColor = theme === 'dark' ? '#858585' : '#5f6368'

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        background: bgColor,
        fontFamily: "'JetBrains Mono', 'DejaVu Sans Mono', 'Consolas', 'Monaco', 'Courier New', monospace",
        fontSize: '14px',
        lineHeight: '1.5',
        color: textColor,
      }}
    >
      {/* Header - Terminal Tabs */}
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
        {/* Terminal Tabs - Scrollable area */}
        <div 
          ref={terminalTabsScrollRef}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            flex: '1',
            minWidth: 0,
            overflowX: 'auto',
            overflowY: 'hidden',
            scrollbarWidth: 'thin',
            msOverflowStyle: 'auto',
          } as React.CSSProperties}
          className="terminal-tabs-scrollable scrollable-container"
        >
          {terminalSessions.map((session) => {
            const isDragging = draggedTerminalId === session.id
            const isDropTarget = dropTargetTerminalId === session.id
            const showDropIndicator = isDropTarget && dropPosition
            
            return (
              <div
                key={session.id}
                data-terminal-id={session.id}
                draggable
                onDragStart={(e) => handleTerminalDragStart(e, session.id)}
                onDragOver={(e) => handleTerminalDragOver(e, session.id)}
                onDragLeave={handleTerminalDragLeave}
                onDrop={(e) => handleTerminalDrop(e, session.id)}
                onDragEnd={handleTerminalDragEnd}
                onClick={() => {
                  if (!isDragging) {
                    setActiveTerminalId(session.id)
                    saveActiveTerminalId(labName, session.id)
                  }
                }}
                onMouseEnter={() => {
                  if (!isDragging) {
                    setHoveredTerminalId(session.id)
                  }
                }}
                onMouseLeave={() => {
                  if (!isDragging) {
                    setHoveredTerminalId(null)
                  }
                }}
                style={{
                  paddingTop: '4px',
                  paddingBottom: '6px',
                  paddingLeft: '8px',
                  paddingRight: '8px',
                  borderRadius: '6px',
                  backgroundColor: activeTerminalId === session.id 
                    ? activeTerminalBg 
                    : (hoveredTerminalId === session.id ? hoverBg : 'transparent'),
                  border: 'none',
                  display: 'flex',
                  alignItems: 'center',
                  cursor: isDragging ? 'grabbing' : 'pointer',
                  transition: isDragging ? 'none' : 'all 0.2s ease',
                  minWidth: '60px',
                  maxWidth: '120px',
                  flexShrink: 0,
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
                  color: activeTerminalId === session.id ? textColor : '#6b6b6b',
                  opacity: activeTerminalId === session.id ? 0.9 : 0.7,
                  overflow: 'hidden',
                  textOverflow: 'clip',
                  whiteSpace: 'nowrap',
                  width: hoveredTerminalId === session.id ? 'calc(100% - 24px)' : '100%',
                  display: 'block',
                  paddingRight: hoveredTerminalId === session.id ? '4px' : '0'
                }}>
                  {session.name}
                </span>
                {hoveredTerminalId === session.id && !isDragging && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      handleCloseTerminal(session.id, e)
                    }}
                    onMouseDown={(e) => e.stopPropagation()}
                    style={{
                      position: 'absolute',
                      right: '6px',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      padding: '2px',
                      border: 'none',
                      borderRadius: '6px',
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
                    title="Close terminal"
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
              onClick={handleNewTerminal}
              style={{
                padding: '4px 6px',
                border: 'none',
                borderRadius: '6px',
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
              title="New terminal"
            >
              <AddIcon style={{ fontSize: '19px' }} />
            </button>
            
            <button
              ref={historyButtonRef}
              onClick={() => {
                setShowHistoryDropdown(!showHistoryDropdown)
              }}
              style={{
                padding: '4px 8px 4px 6px',
                border: 'none',
                borderRadius: '6px',
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
              borderRadius: '6px',
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
            title="Close Terminal"
          >
            <CloseIcon style={{ fontSize: '18px', fontWeight: 200 }} />
          </button>
        </div>
      </div>

      {/* Terminal History Dropdown */}
      {showHistoryDropdown && (
        <TerminalHistoryDropdown
          labName={labName}
          sessions={terminalSessions}
          allSessions={getAllTerminalSessions()}
          isOpen={showHistoryDropdown}
          onClose={() => setShowHistoryDropdown(false)}
          onSelectTerminal={(terminalId) => {
            // Check if terminal is already in tabs
            const terminalExists = terminalSessions.some(s => s.id === terminalId)
            
            if (!terminalExists) {
              // Load the terminal from localStorage and add it to tabs
              const session = loadTerminalSession(labName, terminalId)
              if (session) {
                const newSessions = [...terminalSessions, session]
                setTerminalSessions(newSessions)
                saveOpenTerminalTabs(labName, newSessions.map(s => s.id))
              }
            }
            
            setActiveTerminalId(terminalId)
            saveActiveTerminalId(labName, terminalId)
          }}
          onDeleteTerminal={(terminalId) => {
            // Remove from tabs if it's open
            const terminalExists = terminalSessions.some(s => s.id === terminalId)
            if (terminalExists) {
              handleCloseTerminal(terminalId)
            }
            
            // Delete from localStorage
            try {
              const storageKey = `worldlab_terminal_${labName}_${terminalId}`
              localStorage.removeItem(storageKey)
            } catch (error) {
              console.error('Failed to delete terminal session:', error)
            }
          }}
          onRenameTerminal={handleRenameTerminal}
          activeTerminalId={activeTerminalId}
          anchorElement={historyButtonRef.current}
        />
      )}

      {/* Terminal Output Area */}
      <div
        ref={terminalRef}
        className={`scrollable-container ${theme === 'dark' ? 'dark-theme' : ''}`}
        style={{
          flex: 1,
          overflowY: 'auto',
          overflowX: 'hidden',
          padding: '16px',
          paddingTop: '8px',
          paddingBottom: '60px',
          position: 'relative',
        }}
      >
        {outputLines.map((line, index) => {
          let lineColor = textColor
          if (line.type === 'error') lineColor = errorColor
          else if (line.type === 'info') lineColor = infoColor
          else if (line.type === 'command') lineColor = promptColor

          // 检查是否是新一轮对话的开始（命令行，且前一行不是命令）
          const isNewConversationRound = line.type === 'command' && 
            index > 0 && 
            outputLines[index - 1].type !== 'command'

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
                marginTop: isNewConversationRound ? '16px' : '0',
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
            flexDirection: 'column',
            marginTop: isProcessing ? '0' : (outputLines.length === 0 ? '0' : '16px'),
          }}
        >
          {!isProcessing && (
            <div
              style={{
                display: 'flex',
                alignItems: 'flex-start',
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
                  // Auto-scroll to keep input visible when typing long text
                  setTimeout(() => {
                    if (terminalRef.current) {
                      terminalRef.current.scrollTop = terminalRef.current.scrollHeight
                    }
                  }, 0)
                }}
                style={{
                  flex: 1,
                  outline: 'none',
                  color: textColor,
                  minHeight: '20px',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                }}
              />
            </div>
          )}
          {isProcessing && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                marginTop: '0',
                marginLeft: 0,
                color: theme === 'dark' ? 'rgba(255, 255, 255, 0.5)' : 'rgba(0, 0, 0, 0.5)',
                fontSize: '14px',
                fontStyle: 'italic',
              }}
            >
              <span>Processing…</span>
            </div>
          )}
        </div>

      </div>

      {/* Styles */}
      <style>{`
        .loading-dots {
          display: inline-flex;
          align-items: center;
          gap: 2px;
        }
        .loading-dots span {
          display: inline-block;
          animation: dot-pulse 1.4s ease-in-out infinite;
          opacity: 0.3;
        }
        .loading-dots span:nth-child(1) {
          animation-delay: 0s;
        }
        .loading-dots span:nth-child(2) {
          animation-delay: 0.2s;
        }
        .loading-dots span:nth-child(3) {
          animation-delay: 0.4s;
        }
        @keyframes dot-pulse {
          0%, 100% {
            opacity: 0.3;
            transform: scale(1);
          }
          50% {
            opacity: 1;
            transform: scale(1.2);
          }
        }
      `}</style>
    </div>
  )
}

// Terminal History Dropdown Component
interface TerminalHistoryDropdownProps {
  labName: string
  sessions: TerminalSession[]
  allSessions: TerminalSession[]
  isOpen: boolean
  onClose: () => void
  onSelectTerminal: (terminalId: string) => void
  onDeleteTerminal: (terminalId: string) => void
  onRenameTerminal: (terminalId: string, newName: string) => void
  activeTerminalId: string
  anchorElement?: HTMLElement | null
}

function TerminalHistoryDropdown({
  labName: _labName,
  sessions: _sessions,
  allSessions,
  isOpen,
  onClose,
  onSelectTerminal,
  onDeleteTerminal,
  onRenameTerminal,
  activeTerminalId,
  anchorElement
}: TerminalHistoryDropdownProps) {
  const { theme } = useTheme()
  const [editingTerminalId, setEditingTerminalId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')
  const [hoveredTerminalId, setHoveredTerminalId] = useState<string | null>(null)
  const [position, setPosition] = useState({ top: 0, left: 0 })
  const dropdownRef = useRef<HTMLDivElement>(null)
  const editInputRef = useRef<HTMLInputElement>(null)

  // Calculate position based on anchor element
  useEffect(() => {
    if (isOpen && anchorElement) {
      const rect = anchorElement.getBoundingClientRect()
      setPosition({
        top: rect.bottom + 4,
        left: rect.left - 150 + rect.width / 2
      })
    }
  }, [isOpen, anchorElement])

  // Focus edit input when editing starts
  useEffect(() => {
    if (editingTerminalId && editInputRef.current) {
      editInputRef.current.focus()
      editInputRef.current.select()
    }
  }, [editingTerminalId])

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

  // Group terminals by date
  const groupTerminalsByDate = () => {
    const now = new Date()
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const yesterday = new Date(today)
    yesterday.setDate(yesterday.getDate() - 1)

    const todayItems: TerminalSession[] = []
    const yesterdayItems: TerminalSession[] = []
    const olderItems: TerminalSession[] = []

    allSessions.forEach(session => {
      let lastActivityTime = new Date(0)
      if (session.lines.length > 0) {
        const timestamps = session.lines
          .map(line => new Date(line.timestamp))
          .filter(ts => !isNaN(ts.getTime()))
        
        if (timestamps.length > 0) {
          lastActivityTime = new Date(Math.max(...timestamps.map(ts => ts.getTime())))
        }
      }

      if (lastActivityTime.getTime() === 0) {
        // Fallback to session ID timestamp
        const timestampMatch = session.id.match(/\d+/)
        if (timestampMatch) {
          lastActivityTime = new Date(parseInt(timestampMatch[0]))
        } else {
          lastActivityTime = new Date()
        }
      }

      const itemDate = new Date(lastActivityTime.getFullYear(), lastActivityTime.getMonth(), lastActivityTime.getDate())
      
      if (itemDate.getTime() === today.getTime()) {
        todayItems.push(session)
      } else if (itemDate.getTime() === yesterday.getTime()) {
        yesterdayItems.push(session)
      } else {
        olderItems.push(session)
      }
    })

    return { todayItems, yesterdayItems, olderItems }
  }

  const { todayItems, yesterdayItems, olderItems } = groupTerminalsByDate()

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node
      
      if (dropdownRef.current && !dropdownRef.current.contains(target)) {
        if (anchorElement && !anchorElement.contains(target)) {
          onClose()
        }
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside, true)
      return () => {
        document.removeEventListener('mousedown', handleClickOutside, true)
      }
    }
  }, [isOpen, onClose, anchorElement])

  const handleEdit = (terminalId: string, currentName: string) => {
    setEditingTerminalId(terminalId)
    setEditingName(currentName)
  }

  const handleSaveEdit = () => {
    if (editingTerminalId && editingName.trim()) {
      onRenameTerminal(editingTerminalId, editingName.trim())
    }
    setEditingTerminalId(null)
    setEditingName('')
  }

  const handleCancelEdit = () => {
    setEditingTerminalId(null)
    setEditingName('')
  }

  const handleDelete = async (terminalId: string) => {
    await onDeleteTerminal(terminalId)
    if (editingTerminalId === terminalId) {
      setEditingTerminalId(null)
    }
  }

  const handleEditKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSaveEdit()
    } else if (e.key === 'Escape') {
      handleCancelEdit()
    }
  }

  if (!isOpen) return null

  const renderTerminalItem = (session: TerminalSession) => {
    const isActive = session.id === activeTerminalId
    const isHovered = hoveredTerminalId === session.id
    const isEditing = editingTerminalId === session.id
    
    // Get last activity time
    let lastActivityTime = new Date(0)
    if (session.lines.length > 0) {
      const timestamps = session.lines
        .map(line => new Date(line.timestamp))
        .filter(ts => !isNaN(ts.getTime()))
      
      if (timestamps.length > 0) {
        lastActivityTime = new Date(Math.max(...timestamps.map(ts => ts.getTime())))
      }
    }

    if (lastActivityTime.getTime() === 0) {
      const timestampMatch = session.id.match(/\d+/)
      if (timestampMatch) {
        lastActivityTime = new Date(parseInt(timestampMatch[0]))
      } else {
        lastActivityTime = new Date()
      }
    }

    return (
      <div
        key={session.id}
        onMouseEnter={() => setHoveredTerminalId(session.id)}
        onMouseLeave={() => setHoveredTerminalId(null)}
        onClick={() => {
          if (editingTerminalId !== session.id) {
            onSelectTerminal(session.id)
            onClose()
          }
        }}
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
            borderRadius: '6px',
            backgroundColor: isActive ? textColor : 'transparent'
          }} />
        </div>

        {/* Terminal Name */}
        {isEditing ? (
          <input
            ref={editInputRef}
            type="text"
            value={editingName}
            onChange={(e) => setEditingName(e.target.value)}
            onBlur={handleSaveEdit}
            onKeyDown={handleEditKeyDown}
            onClick={(e) => e.stopPropagation()}
            style={{
              flex: 1,
              padding: '2px 4px',
              backgroundColor: theme === 'dark' ? '#1d1d1d' : '#ffffff',
              border: `1px solid ${theme === 'dark' ? '#3e3e42' : '#bdc1c6'}`,
              borderRadius: '6px',
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
            {session.name}
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
            {formatTimeAgo(lastActivityTime)}
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
                handleEdit(session.id, session.name)
              }}
              style={{
                padding: '4px',
                border: 'none',
                borderRadius: '6px',
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
              title="Edit terminal name"
            >
              {/* @ts-ignore */}
              <EditIcon style={{ fontSize: '14px' }} />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation()
                handleDelete(session.id)
              }}
              style={{
                padding: '4px',
                border: 'none',
                borderRadius: '6px',
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
              title="Delete terminal"
            >
              {/* @ts-ignore */}
              <DeleteIcon style={{ fontSize: '14px' }} />
            </button>
          </div>
        )}
      </div>
    )
  }

  return (
    <div
      ref={dropdownRef}
      data-terminal-history-dropdown
      style={{
        position: 'fixed',
        top: `${position.top}px`,
        left: `${position.left}px`,
        transform: 'translateX(-50%)',
        width: '400px',
        maxHeight: '60vh',
        backgroundColor: bgColor,
        border: `1px solid ${borderColor}`,
        borderRadius: '6px',
        boxShadow: theme === 'dark' 
          ? '0 4px 16px rgba(0,0,0,0.5)' 
          : '0 4px 16px rgba(0,0,0,0.15)',
        zIndex: 10000,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden'
      }}
    >
      {/* Terminal List */}
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
            {todayItems.map(session => renderTerminalItem(session))}
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
            {yesterdayItems.map(session => renderTerminalItem(session))}
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
              Past Terminals
            </div>
            {olderItems.map(session => renderTerminalItem(session))}
          </div>
        )}

        {allSessions.length === 0 && (
          <div style={{
            padding: '24px',
            textAlign: 'center',
            color: secondaryTextColor,
            fontSize: '13px'
          }}>
            No terminal history
          </div>
        )}
      </div>
    </div>
  )
}
