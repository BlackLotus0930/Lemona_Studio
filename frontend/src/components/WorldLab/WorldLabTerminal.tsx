import React, { useState, useRef, useEffect, useCallback, useLayoutEffect } from 'react'
import { useTheme } from '../../contexts/ThemeContext'
import { WorldLab, WorldLabNode, WorldLabEdge, AIChatMessage } from '@shared/types'
import { aiApi } from '../../services/api'
import { worldLabApi } from '../../services/desktop-api'
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
  onBeforeOperation?: () => void // Called before any operation that modifies nodes/edges
  undoRedoHandlers?: {
    undo: () => void
    redo: () => void
    canUndo: () => boolean
    canRedo: () => boolean
  } | null
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

// Helper functions to persist active terminal session ID per lab and project
function getActiveTerminalIdKey(labName: string, projectId: string): string {
  return `activeTerminalId_${projectId}_${labName}`
}

function loadActiveTerminalId(labName: string, projectId: string): string | null {
  try {
    return localStorage.getItem(getActiveTerminalIdKey(labName, projectId))
  } catch (error) {
    console.error('Failed to load active terminal ID:', error)
    return null
  }
}

function saveActiveTerminalId(labName: string, terminalId: string, projectId: string): void {
  try {
    localStorage.setItem(getActiveTerminalIdKey(labName, projectId), terminalId)
  } catch (error) {
    console.error('Failed to save active terminal ID:', error)
  }
}

// Helper functions to persist open terminal tabs per lab and project
function getOpenTerminalTabsKey(labName: string, projectId: string): string {
  return `openTerminalTabs_${projectId}_${labName}`
}

function loadOpenTerminalTabs(labName: string, projectId: string): string[] {
  try {
    const saved = localStorage.getItem(getOpenTerminalTabsKey(labName, projectId))
    if (saved) {
      const parsed = JSON.parse(saved)
      return Array.isArray(parsed) ? parsed : []
    }
  } catch (error) {
    console.error('Failed to load open terminal tabs:', error)
  }
  return []
}

function saveOpenTerminalTabs(labName: string, terminalIds: string[], projectId: string): void {
  try {
    localStorage.setItem(getOpenTerminalTabsKey(labName, projectId), JSON.stringify(terminalIds))
  } catch (error) {
    console.error('Failed to save open terminal tabs:', error)
  }
}

type EdgeHandleIds = {
  sourceHandle?: string
  targetHandle?: string
}

function getEdgeHandlesForNodes(
  sourceNode?: WorldLabNode,
  targetNode?: WorldLabNode
): EdgeHandleIds {
  if (!sourceNode || !targetNode) {
    return {}
  }

  const dx = targetNode.position.x - sourceNode.position.x
  const dy = targetNode.position.y - sourceNode.position.y

  if (Math.abs(dx) >= Math.abs(dy)) {
    const isRight = dx >= 0
    return {
      sourceHandle: isRight ? 'right-source' : 'left-source',
      targetHandle: isRight ? 'left-target' : 'right-target',
    }
  }

  const isDown = dy >= 0
  return {
    sourceHandle: isDown ? 'bottom-source' : 'top-source',
    targetHandle: isDown ? 'top-target' : 'bottom-target',
  }
}

function ensureEdgeHandles(
  edge: WorldLabEdge,
  nodeById: Map<string, WorldLabNode>
): WorldLabEdge {
  const edgeData = (edge as any).data || {}
  const existingSourceHandle = edge.sourceHandle ?? edgeData.sourceHandle
  const existingTargetHandle = edge.targetHandle ?? edgeData.targetHandle

  if (existingSourceHandle && existingTargetHandle) {
    return edge
  }

  const handles = getEdgeHandlesForNodes(
    nodeById.get(edge.source),
    nodeById.get(edge.target)
  )

  return {
    ...edge,
    sourceHandle: existingSourceHandle ?? handles.sourceHandle,
    targetHandle: existingTargetHandle ?? handles.targetHandle,
  }
}

// Helper function to load terminal session from localStorage
function loadTerminalSession(labName: string, terminalId: string, projectId: string): TerminalSession | null {
  try {
    const storageKey = `worldlab_terminal_${projectId}_${labName}_${terminalId}`
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
function saveTerminalSession(labName: string, session: TerminalSession, projectId: string): void {
  try {
    const storageKey = `worldlab_terminal_${projectId}_${labName}_${session.id}`
    localStorage.setItem(storageKey, JSON.stringify({
      name: session.name,
      lines: session.lines,
      commandHistory: session.commandHistory,
    }))
  } catch (error) {
    console.error('Failed to save terminal session:', error)
  }
}

// Helper function to clear all terminal sessions for a lab and project
function clearTerminalSessions(labName: string, projectId: string): void {
  try {
    // Clear active terminal ID
    localStorage.removeItem(getActiveTerminalIdKey(labName, projectId))
    
    // Clear open terminal tabs
    localStorage.removeItem(getOpenTerminalTabsKey(labName, projectId))
    
    // Clear all terminal sessions
    const savedOpenTabs = loadOpenTerminalTabs(labName, projectId)
    for (const terminalId of savedOpenTabs) {
      const storageKey = `worldlab_terminal_${projectId}_${labName}_${terminalId}`
      localStorage.removeItem(storageKey)
    }
    
    // Also clear conversation history for all terminals
    for (const terminalId of savedOpenTabs) {
      const storageKey = `worldlab_conversation_${projectId}_${labName}_${terminalId}`
      localStorage.removeItem(storageKey)
    }
    
    console.log(`[WorldLabTerminal] Cleared all terminal sessions for lab: ${labName}, project: ${projectId}`)
  } catch (error) {
    console.error('Failed to clear terminal sessions:', error)
  }
}

// Helper function to generate terminal name from first command
function generateTerminalName(firstCommand: string): string {
  if (!firstCommand || !firstCommand.trim()) return 'New Terminal'
  const cleaned = firstCommand.trim().replace(/\n/g, ' ').substring(0, 30)
  return cleaned.length < firstCommand.trim().length ? `${cleaned}...` : cleaned
}

const MAX_CONVERSATION_MESSAGES = 20 // Keep only recent 20 messages (frontend), backend will handle summarization

// Helper function to load conversation history from localStorage
function loadConversationHistory(labName: string, terminalId: string, projectId: string): AIChatMessage[] {
  try {
    const storageKey = `worldlab_conversation_${projectId}_${labName}_${terminalId}`
    const saved = localStorage.getItem(storageKey)
    if (saved) {
      const parsed = JSON.parse(saved)
      return Array.isArray(parsed) ? parsed : []
    }
  } catch (error) {
    console.error('Failed to load conversation history:', error)
  }
  return []
}

// Helper function to save conversation history to localStorage
function saveConversationHistory(labName: string, terminalId: string, history: AIChatMessage[], projectId: string): void {
  try {
    const storageKey = `worldlab_conversation_${projectId}_${labName}_${terminalId}`
    localStorage.setItem(storageKey, JSON.stringify(history))
  } catch (error) {
    console.error('Failed to save conversation history:', error)
  }
}

function trimConversationHistory(history: AIChatMessage[]): AIChatMessage[] {
  if (history.length <= MAX_CONVERSATION_MESSAGES) return history
  return history.slice(history.length - MAX_CONVERSATION_MESSAGES)
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
  onBeforeOperation,
  undoRedoHandlers,
}: WorldLabTerminalProps) {
  const { theme } = useTheme()
  
  // Terminal session management
  const [terminalSessions, setTerminalSessions] = useState<TerminalSession[]>([])
  const [activeTerminalId, setActiveTerminalId] = useState<string>(() => {
    if (!projectId) return 'terminal_default'
    const saved = loadActiveTerminalId(labName, projectId)
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
  const [promptWidth, setPromptWidth] = useState<number>(0)
  const [isProcessing, setIsProcessing] = useState<boolean>(false)
  const [hasStartedStreaming, setHasStartedStreaming] = useState<boolean>(false)
  const [googleApiKey, setGoogleApiKey] = useState<string>('')
  const [openaiApiKey, setOpenaiApiKey] = useState<string>('')
  // Conversation history for AI memory (persisted per labName + terminal + project)
  const [conversationHistory, setConversationHistory] = useState<AIChatMessage[]>(() => {
    if (!projectId) return []
    const initialTerminalId = loadActiveTerminalId(labName, projectId) || 'terminal_default'
    return loadConversationHistory(labName, initialTerminalId, projectId)
  })
  // Initialize selectedModel - first check for saved preference, then fall back to API key-based selection
  const [selectedModel, setSelectedModel] = useState<string>(() => {
    try {
      // First, try to load saved model preference
      const savedModel = localStorage.getItem('worldLabTerminalSelectedModel')
      const validModels = ['gemini-3-flash-preview', 'gemini-3-pro-preview', 'gpt-4.1-nano', 'gpt-5-mini', 'gpt-5.2']
      
      if (savedModel && validModels.includes(savedModel)) {
        return savedModel
      }
      
      // Fall back to API key-based selection if no saved preference or incompatible
      const googleKey = localStorage.getItem('googleApiKey') || ''
      const openaiKey = localStorage.getItem('openaiApiKey') || ''
      const hasGoogleKey = !!googleKey && googleKey.trim().length > 0
      const hasOpenaiKey = !!openaiKey && openaiKey.trim().length > 0
      
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
      
      return selectedModel
    } catch (error) {
      console.error('[WorldLabTerminal] Failed to initialize model from localStorage:', error)
      // Default to GPT if there's an error reading localStorage
      return 'gpt-4.1-nano'
    }
  })
  const [isModelPreferenceLocked, setIsModelPreferenceLocked] = useState<boolean>(() => {
    try {
      return !!localStorage.getItem('worldLabTerminalSelectedModel')
    } catch (error) {
      return false
    }
  })
  
  // Refs
  const terminalRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLDivElement>(null)
  const promptRef = useRef<HTMLSpanElement>(null)
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
        loadApiKeys()
      }
    }
    
    window.addEventListener('storage', handleStorageChange)
    return () => window.removeEventListener('storage', handleStorageChange)
  }, [])

  // Save selected model to localStorage whenever it changes
  useEffect(() => {
    try {
      localStorage.setItem('worldLabTerminalSelectedModel', selectedModel)
    } catch (error) {
      console.error('[WorldLabTerminal] Failed to save selected model:', error)
    }
  }, [selectedModel])

  const measurePromptWidth = useCallback(() => {
    if (!promptRef.current) return
    const nextWidth = promptRef.current.offsetWidth
    if (nextWidth && nextWidth !== promptWidth) {
      setPromptWidth(nextWidth)
    }
  }, [promptWidth])

  // Measure prompt width so the caret sits immediately after "worldlab >"
  useLayoutEffect(() => {
    measurePromptWidth()
  }, [measurePromptWidth])

  // Re-measure after first paint / font load to avoid zero width on reopen
  useEffect(() => {
    const raf = requestAnimationFrame(measurePromptWidth)
    const timeout = setTimeout(measurePromptWidth, 120)
    let cancelled = false

    if (typeof document !== 'undefined' && 'fonts' in document && document.fonts?.ready) {
      document.fonts.ready.then(() => {
        if (!cancelled) {
          measurePromptWidth()
        }
      }).catch(() => undefined)
    }

    return () => {
      cancelled = true
      cancelAnimationFrame(raf)
      clearTimeout(timeout)
    }
  }, [measurePromptWidth])

  // Select appropriate model based on available API keys
  useEffect(() => {
    if (isModelPreferenceLocked) {
      return
    }
    const hasGoogleKey = !!googleApiKey && googleApiKey.trim().length > 0
    const hasOpenaiKey = !!openaiApiKey && openaiApiKey.trim().length > 0
    const isGeminiModel = selectedModel && (selectedModel.startsWith('gemini-') || selectedModel.includes('gemini'))
    const isGptModel = selectedModel && selectedModel.startsWith('gpt-')
    
    // If current model is incompatible with available keys, switch to a compatible one
    if (isGptModel && !hasOpenaiKey) {
      // GPT model selected but no OpenAI key - switch to Gemini if available
      if (hasGoogleKey) {
        setSelectedModel('gemini-3-flash-preview')
      }
      // If no keys at all, keep GPT (will show error when used, but at least won't try Gemini)
    } else if (isGeminiModel && !hasGoogleKey) {
      // Gemini model selected but no Google key - switch to GPT if available
      if (hasOpenaiKey) {
        setSelectedModel('gpt-4.1-nano')
      }
      // If no keys at all, switch to GPT (will show clearer error message)
      else if (!hasOpenaiKey && !hasGoogleKey) {
        setSelectedModel('gpt-4.1-nano')
      }
    } else if (!hasGoogleKey && !hasOpenaiKey) {
      // No keys available - prefer GPT model (will show clearer error message)
      if (!isGptModel && !isGeminiModel) {
        setSelectedModel('gpt-4.1-nano')
      } else if (isGeminiModel) {
        // Switch from Gemini to GPT if no keys available
        setSelectedModel('gpt-4.1-nano')
      }
    } else if (hasGoogleKey && hasOpenaiKey) {
      // Both keys available - prefer Gemini if current model is invalid
      if (!isGeminiModel && !isGptModel) {
        setSelectedModel('gemini-3-flash-preview')
      }
    } else if (hasGoogleKey && !hasOpenaiKey) {
      // Only Google key - ensure we're using a Gemini model
      if (!isGeminiModel) {
        setSelectedModel('gemini-3-flash-preview')
      }
    } else if (hasOpenaiKey && !hasGoogleKey) {
      // Only OpenAI key - ensure we're using a GPT model
      if (!isGptModel) {
        setSelectedModel('gpt-4.1-nano')
      }
    }
  }, [googleApiKey, openaiApiKey, selectedModel, isModelPreferenceLocked])

  // Initialize terminal sessions on mount
  useEffect(() => {
    // Check if this is a newly created WorldLab (created within last 2 minutes)
    // If so, clear old terminal sessions to start fresh
    if (worldLabData?.metadata?.createdAt) {
      const createdAt = new Date(worldLabData.metadata.createdAt)
      const now = new Date()
      const ageInMinutes = (now.getTime() - createdAt.getTime()) / (1000 * 60)
      
      // If WorldLab was created within last 2 minutes, clear old terminal sessions
      if (ageInMinutes < 2) {
        console.log(`[WorldLabTerminal] Detected newly created WorldLab (${ageInMinutes.toFixed(2)} minutes old), clearing old terminal sessions`)
        if (projectId) {
          clearTerminalSessions(labName, projectId)
        }
      }
    }
    
    if (!projectId) {
      // No projectId, initialize empty
      const defaultId = 'terminal_default'
      const defaultSession: TerminalSession = {
        id: defaultId,
        name: 'Terminal 1',
        lines: [],
        commandHistory: [],
      }
      setTerminalSessions([defaultSession])
      setActiveTerminalId(defaultId)
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
      return
    }
    
    const savedActiveId = loadActiveTerminalId(labName, projectId)
    const savedOpenTabs = loadOpenTerminalTabs(labName, projectId)
    
    if (savedOpenTabs.length > 0) {
      // Load saved sessions
      const loadedSessions: TerminalSession[] = []
      for (const terminalId of savedOpenTabs) {
        const session = loadTerminalSession(labName, terminalId, projectId)
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
          saveTerminalSession(labName, newSession, projectId)
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
        saveActiveTerminalId(labName, activeId, projectId)
        // Reset flag after state updates complete
        setTimeout(() => {
          isLoadingSessionRef.current = false
        }, 0)
      }
    } else {
      // First time - create default session with initial help command
      const defaultId = 'terminal_default'
      const now = new Date().toISOString()
      const initialHelpLines: TerminalLine[] = [
        {
          id: `cmd_${Date.now()}`,
          type: 'command',
          content: 'worldlab > help',
          timestamp: now,
        },
        {
          id: `out_${Date.now() + 1}`,
          type: 'output',
          content: `CORE COMMANDS
  create [description]
  edit [node1] [node2] [description]
  derive [description]
  undo
  redo
  help

CAPABILITIES
  • Capture and build ideas
  • Natural conversation
  • All changes are reversible

EXAMPLE
  create In the broken city of Virelia, magic girl Elara and brave soldier Kael try to stop scary shadow monsters from eating everyone.`,
          timestamp: now,
        },
      ]
      const defaultSession: TerminalSession = {
        id: defaultId,
        name: 'Terminal 1',
        lines: initialHelpLines,
        commandHistory: ['help'],
      }
      setTerminalSessions([defaultSession])
      setActiveTerminalId(defaultId)
      if (projectId) {
        saveTerminalSession(labName, defaultSession, projectId)
        saveOpenTerminalTabs(labName, [defaultId], projectId)
        saveActiveTerminalId(labName, defaultId, projectId)
      }
      
      // Initialize with help command lines and history
      isLoadingSessionRef.current = true
      setOutputLines(initialHelpLines)
      setCommandHistory(['help'])
      setHistoryIndex(-1)
      setCurrentInput('')
      if (inputRef.current) {
        inputRef.current.textContent = ''
      }
      setTimeout(() => {
        isLoadingSessionRef.current = false
      }, 0)
    }
  }, [labName, worldLabData?.metadata?.createdAt, projectId])

  // Load conversation history when labName, projectId, or active terminal changes
  useEffect(() => {
    if (!projectId) {
      setConversationHistory([])
      return
    }
    const history = loadConversationHistory(labName, activeTerminalId, projectId)
    setConversationHistory(history)
  }, [labName, activeTerminalId, projectId])

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
      if (projectId) {
        saveActiveTerminalId(labName, activeTerminalId, projectId)
      }
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
      if (projectId) {
        saveTerminalSession(labName, updatedSession, projectId)
      }
      
      // Update state - always update to ensure state stays in sync
      return prev.map(s => s.id === activeTerminalId ? updatedSession : s)
    })
  }, [outputLines, commandHistory, activeTerminalId, labName, projectId])

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
      
      if (projectId) {
        sessionsToSave.forEach(session => {
          saveTerminalSession(labName, session, projectId)
        })
      }
    }
  }, [labName, projectId]) // Only depend on labName and projectId to avoid re-running unnecessarily

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

    // create [描述] - 创建节点（使用 AI）
    if (command === 'create') {
      const description = parts.slice(1).join(' ')
      if (description.trim()) {
        return {
          type: 'ai',
          command: 'create-node-ai',
          args: { description },
        }
      } else {
        return { type: 'error', error: 'Please provide a description for the node to create' }
      }
    }

    // edit [node1,node2,...] [变更] - 编辑节点（支持多个节点，用逗号分隔）
    if (command === 'edit') {
      if (parts.length < 3) {
        return { type: 'error', error: 'Usage: edit <nodeLabel1,nodeLabel2,...> <change description>' }
      }
      const nodeIdentifiers = parts[1].split(',').map(id => id.trim()).filter(id => id.length > 0)
      if (nodeIdentifiers.length === 0) {
        return { type: 'error', error: 'Please provide at least one node to edit' }
      }
      const changeDescription = parts.slice(2).join(' ')
      return {
        type: 'ai',
        command: 'edit-node-ai',
        args: { nodeIds: nodeIdentifiers, changeDescription },
      }
    }

    // derive - 根据 nodes 和 edges 生成故事
    if (command === 'derive') {
      return {
        type: 'ai',
        command: 'derive-story',
        args: {},
      }
    }

    // undo - 撤销上一个操作
    if (command === 'undo') {
      return {
        type: 'command',
        command: 'undo',
        args: {},
      }
    }

    // redo - 重做上一个操作
    if (command === 'redo') {
      return {
        type: 'command',
        command: 'redo',
        args: {},
      }
    }

    // model [modelName] - 显示或设置 AI 模型
    if (command === 'model') {
      const modelName = parts.slice(1).join(' ').trim()
      return {
        type: 'command',
        command: 'model',
        args: { modelName: modelName || null },
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
  // 执行本地命令
  const executeLocalCommand = useCallback(async (command: string, _args: Record<string, any>) => {
    if (!worldLabData) {
      addOutputLine({
        id: `err_${Date.now()}`,
        type: 'error',
        content: 'Error: No WorldLab data available',
        timestamp: new Date().toISOString(),
      })
      return
    }

    switch (command) {
      case 'help': {
        const helpText = `CORE COMMANDS
  create [description]
  edit [node1] [node2] [description]
  derive [description]
  model
  undo
  redo
  help

CAPABILITIES
  • Capture and build ideas
  • Natural conversation
  • All changes are reversible

EXAMPLE
  create "In the broken city of Virelia, magic girl Elara and brave soldier Kael try to stop scary shadow monsters from eating everyone."`
  
        addOutputLine({
          id: `out_${Date.now()}`,
          type: 'output',
          content: helpText,
          timestamp: new Date().toISOString(),
        })
        break
      }

      case 'undo': {
        if (!undoRedoHandlers) {
          addOutputLine({
            id: `err_${Date.now()}`,
            type: 'error',
            content: 'Error: Undo/redo handlers not available',
            timestamp: new Date().toISOString(),
          })
          return
        }

        if (!undoRedoHandlers.canUndo()) {
          addOutputLine({
            id: `out_${Date.now()}`,
            type: 'output',
            content: 'Nothing to undo',
            timestamp: new Date().toISOString(),
          })
          return
        }

        // Call undo handler directly
        undoRedoHandlers.undo()
        
        addOutputLine({
          id: `out_${Date.now()}`,
          type: 'info',
          content: 'Undone previous operation',
          timestamp: new Date().toISOString(),
        })
        break
      }

      case 'redo': {
        if (!undoRedoHandlers) {
          addOutputLine({
            id: `err_${Date.now()}`,
            type: 'error',
            content: 'Error: Undo/redo handlers not available',
            timestamp: new Date().toISOString(),
          })
          return
        }

        if (!undoRedoHandlers.canRedo()) {
          addOutputLine({
            id: `out_${Date.now()}`,
            type: 'output',
            content: 'Nothing to redo',
            timestamp: new Date().toISOString(),
          })
          return
        }

        // Call redo handler directly
        undoRedoHandlers.redo()
        
        addOutputLine({
          id: `out_${Date.now()}`,
          type: 'info',
          content: 'Redone previous operation',
          timestamp: new Date().toISOString(),
        })
        break
      }

      case 'model': {
        const modelName = _args.modelName as string | null
        // Read API keys directly from localStorage to ensure we use the same keys as ChatInterface
        // This ensures consistency even if state hasn't updated yet
        const currentGoogleKey = localStorage.getItem('googleApiKey') || ''
        const currentOpenaiKey = localStorage.getItem('openaiApiKey') || ''
        const hasGoogleKey = !!currentGoogleKey && currentGoogleKey.trim().length > 0
        const hasOpenaiKey = !!currentOpenaiKey && currentOpenaiKey.trim().length > 0
        
        // Update state to keep it in sync
        if (currentGoogleKey !== googleApiKey) setGoogleApiKey(currentGoogleKey)
        if (currentOpenaiKey !== openaiApiKey) setOpenaiApiKey(currentOpenaiKey)
        
        // Available models matching chat interface
        const availableModels = [
          { name: 'gemini-3-flash-preview', displayName: 'Gemini 3 Flash', requiresKey: 'google' },
          { name: 'gemini-3-pro-preview', displayName: 'Gemini 3 Pro', requiresKey: 'google' },
          { name: 'gpt-4.1-nano', displayName: 'GPT-4.1 Nano', requiresKey: 'openai' },
          { name: 'gpt-5-mini', displayName: 'GPT-5 Mini', requiresKey: 'openai' },
          { name: 'gpt-5.2', displayName: 'GPT-5.2', requiresKey: 'openai' },
        ]

        if (!modelName) {
          // Check if current model is available
          const currentModel = availableModels.find(m => m.name === selectedModel)
          const isCurrentModelAvailable = currentModel ? (currentModel.requiresKey === 'google' ? hasGoogleKey : hasOpenaiKey) : false
          const hasAnyAvailable = availableModels.some(model => {
            const isAvailable = model.requiresKey === 'google' ? hasGoogleKey : hasOpenaiKey
            return isAvailable
          })
          
          let modelInfo: string
          
          if (!hasAnyAvailable) {
            // No models available - only show current status
            modelInfo = `Current: no api key`
          } else {
            // Show current model and available models
            const currentModelDisplay = isCurrentModelAvailable 
              ? (currentModel?.displayName || selectedModel)
              : 'no api key'
            
            modelInfo = `Current: ${currentModelDisplay}\n\nAvailable:\n`
            
            availableModels.forEach(model => {
              const isAvailable = model.requiresKey === 'google' ? hasGoogleKey : hasOpenaiKey
              const isCurrent = model.name === selectedModel
              if (isAvailable) {
                if (isCurrent) {
                  modelInfo += `  > ${model.displayName}\n`
                } else {
                  modelInfo += `    ${model.displayName}\n`
                }
              }
            })
            
            modelInfo += `\nUse: model <name>`
          }
          
          addOutputLine({
            id: `out_${Date.now()}`,
            type: 'output',
            content: modelInfo,
            timestamp: new Date().toISOString(),
          })
        } else {
          // Set model - strip angle brackets and normalize
          const cleanedModelName = modelName.replace(/^[<]|[>]$/g, '').trim()
          const normalizedModelName = cleanedModelName.toLowerCase()
          const targetModel = availableModels.find(
            m => {
              const modelNameLower = m.name.toLowerCase()
              const displayNameLower = m.displayName.toLowerCase()
              // Match by exact model name, or by display name (partial or full)
              return modelNameLower === normalizedModelName || 
                     displayNameLower === normalizedModelName ||
                     displayNameLower.includes(normalizedModelName) ||
                     normalizedModelName.includes(displayNameLower.replace(/\s+/g, ''))
            }
          )
          
          if (!targetModel) {
            addOutputLine({
              id: `err_${Date.now()}`,
              type: 'error',
              content: `Unknown model: ${modelName}`,
              timestamp: new Date().toISOString(),
            })
            return
          }
          
          // Check if API key is available for the selected model
          const hasRequiredKey = targetModel.requiresKey === 'google' ? hasGoogleKey : hasOpenaiKey
          if (!hasRequiredKey) {
            const keyType = targetModel.requiresKey === 'google' ? 'Google' : 'OpenAI'
            addOutputLine({
              id: `err_${Date.now()}`,
              type: 'error',
              content: `${targetModel.displayName} requires ${keyType} API key`,
              timestamp: new Date().toISOString(),
            })
            return
          }
          
          // Set the model
          setSelectedModel(targetModel.name)
          setIsModelPreferenceLocked(true)
          addOutputLine({
            id: `out_${Date.now()}`,
            type: 'info',
            content: `Switched to ${targetModel.displayName}`,
            timestamp: new Date().toISOString(),
          })
        }
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
  }, [worldLabData, commandHistory, addOutputLine, onNodeSelect, onNodesChange, onEdgesChange, onBeforeOperation, undoRedoHandlers, googleApiKey, openaiApiKey, selectedModel, setSelectedModel])

  // 计算节点初始位置 - 在创建节点时调用
  const calculateInitialPosition = useCallback((
    _nodeId: string,
    nodeLabel: string,
    allEdges: Array<{from: string, to: string}>,
    existingNodes: WorldLabNode[],
    labelToIdMap: Map<string, string>,
    newNodeIds: Set<string>,
    viewportCenter: { x: number; y: number } = { x: 400, y: 300 }
  ): { x: number; y: number } => {
    // Find edges involving this node (by label) that connect to EXISTING nodes only
    const edgesToExisting = allEdges.filter(e => {
      const involvesThisNode = e.from === nodeLabel || e.to === nodeLabel
      if (!involvesThisNode) return false
      
      // Check if the other end is an existing node
      const otherLabel = e.from === nodeLabel ? e.to : e.from
      const otherId = labelToIdMap.get(otherLabel)
      return otherId && !newNodeIds.has(otherId) // Other node exists and is not new
    })
    
    if (edgesToExisting.length > 0) {
      // Get connected EXISTING node IDs
      const connectedExistingNodeIds = new Set<string>()
      edgesToExisting.forEach(edge => {
        const otherLabel = edge.from === nodeLabel ? edge.to : edge.from
        const otherId = labelToIdMap.get(otherLabel)
        if (otherId && !newNodeIds.has(otherId)) {
          connectedExistingNodeIds.add(otherId)
        }
      })
      
      // Calculate center of connected existing nodes
      const connectedNodes = existingNodes.filter(n => 
        connectedExistingNodeIds.has(n.id)
      )
      
      if (connectedNodes.length > 0) {
        const centerX = connectedNodes.reduce((sum, n) => sum + n.position.x, 0) / connectedNodes.length
        const centerY = connectedNodes.reduce((sum, n) => sum + n.position.y, 0) / connectedNodes.length
        // Place nearby (offset by some distance)
        return {
          x: centerX + (Math.random() - 0.5) * 200,
          y: centerY + (Math.random() - 0.5) * 200
        }
      }
    }
    
    // Isolated node or only connected to new nodes - use viewport center
    return viewportCenter
  }, [])

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

  // 获取用于 derive 的 nodes 和 edges（如果 selectedNodeId 存在，只使用该节点和相关的边）
  const getDeriveNodesAndEdges = useCallback((): { nodes: WorldLabNode[], edges: WorldLabEdge[] } => {
    if (!worldLabData) {
      return { nodes: [], edges: [] }
    }
    
    // 如果没有选中节点，使用所有节点和边
    if (!selectedNodeId) {
      return {
        nodes: worldLabData.nodes,
        edges: worldLabData.edges,
      }
    }
    
    // 如果选中了节点，只使用该节点和连接到它的边
    const selectedNode = worldLabData.nodes.find(n => n.id === selectedNodeId)
    if (!selectedNode) {
      return {
        nodes: worldLabData.nodes,
        edges: worldLabData.edges,
      }
    }
    
    // 找到所有连接到选中节点的边
    const relatedEdges = worldLabData.edges.filter(edge => 
      edge.source === selectedNodeId || edge.target === selectedNodeId
    )
    
    // 找到所有相关的节点（选中节点 + 通过边连接的节点）
    const relatedNodeIds = new Set<string>([selectedNodeId])
    relatedEdges.forEach(edge => {
      relatedNodeIds.add(edge.source)
      relatedNodeIds.add(edge.target)
    })
    
    const relatedNodes = worldLabData.nodes.filter(node => relatedNodeIds.has(node.id))
    
    return {
      nodes: relatedNodes,
      edges: relatedEdges,
    }
  }, [worldLabData, selectedNodeId])

  // 构建 WorldLab 上下文内容 - 使用 label-based JSON 格式
  const buildWorldLabContext = useCallback((): string => {
    if (!worldLabData) return ''
    
    const nodes = worldLabData.nodes
    const edges = worldLabData.edges
    
    // Build label-to-ID map for reference
    const labelToIdMap = new Map<string, string>()
    nodes.forEach(node => {
      labelToIdMap.set(node.label, node.id)
    })
    
    // Build nodes JSON with labels
    const nodesJson = nodes.map(node => ({
      label: node.label,
      category: node.category || 'Uncategorized',
      type: node.data?.type || 'node',
      ...(node.data?.description && { description: node.data.description })
    }))
    
    // Build edges JSON with labels (convert IDs to labels)
    const edgesJson = edges.map(edge => {
      const sourceNode = nodes.find(n => n.id === edge.source)
      const targetNode = nodes.find(n => n.id === edge.target)
      const edgeObj: {
        from: string
        to: string
        label?: string
        directional?: boolean
      } = {
        from: sourceNode?.label || edge.source,
        to: targetNode?.label || edge.target,
      }
      if (edge.label) {
        edgeObj.label = edge.label
      }
      // Determine if edge is directional
      // directed: true means directional (with arrow), false/undefined means bidirectional (no arrow)
      // Check data.directed first (most accurate), fallback to type check for backward compatibility
      if (edge.data?.directed !== undefined) {
        edgeObj.directional = edge.data.directed === true
      } else {
        // Fallback: check type (smoothstep usually means directional, default means bidirectional)
        edgeObj.directional = edge.type !== 'default' && edge.type !== undefined
      }
      return edgeObj
    })
    
    // Build context as JSON
    const contextObj: {
      worldLab: string
      nodes: typeof nodesJson
      edges: typeof edgesJson
      selectedNode?: string
    } = {
      worldLab: labName,
      nodes: nodesJson,
      edges: edgesJson,
    }
    
    if (selectedNodeId) {
      const selectedNode = nodes.find(n => n.id === selectedNodeId)
      if (selectedNode) {
        contextObj.selectedNode = selectedNode.label
      }
    }
    
    return JSON.stringify(contextObj, null, 2)
  }, [worldLabData, labName, selectedNodeId])

  // 执行 AI 命令
  const executeAICommand = useCallback(async (command: string, args: Record<string, any>, rawInput?: string) => {
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
      case 'natural-language': {
        aiPrompt = `You are an AI assistant helping with a WorldLab (world-building system). Here is the current state:

${worldLabContext}

User question/request: "${args.query}"

Please help the user understand or interact with this WorldLab. You can:
- Answer questions about nodes, edges, and relationships
- Suggest modifications or improvements
- Help explore the world structure
- Provide insights about the world state

IMPORTANT: 
- Respond in the same language as the nodes and edges in the WorldLab (observe the language used in the node labels, content, and edge labels, and match that language)
- Respond in plain text format only. Do NOT use markdown formatting (no **bold**, no # headers, no code blocks, no lists with markdown syntax). Use simple text with line breaks and indentation for structure.`
        break
      }

      case 'create-node-ai': {
        const description = args.description || 'a new node'
        
        aiPrompt = `You are helping create a new node in a WorldLab (world-building system). Here is the current state:

${worldLabContext}

User wants to create: ${description}

Please generate:
1. label: Short name (1-6 words, e.g., "Alice", "Magic Sword")
2. category: Character, Concept, Event, Place, Time.
3. content: Detailed description (multiple sentences of background/characteristics)
4. edges: Connections to existing or new nodes

IMPORTANT:
- Respond in the same language as the nodes and edges in the WorldLab (observe the language used in the node labels, content, and edge labels, and use that language for all generated content including labels, descriptions, and edge labels)
- Do NOT include position coordinates - system will calculate automatically
- Ensure all node labels are unique (if you need multiple similar nodes, use distinct labels)
- Edges should reference existing nodes by label, or new nodes you're creating
- Respond ONLY with valid JSON, no other text before or after

Respond in JSON format:
{
  "nodes": [
    {
      "label": "Alice",
      "category": "Character",
      "content": "A brave warrior named Alice who grew up in a small village. She is known for her exceptional sword skills and kind heart. Alice has been traveling the world for the past five years, seeking adventure and helping those in need."
    }
  ],
  "edges": [
    {"from": "label1", "to": "label2", "label": "...", "directional": true}
  ]
}`
        break
      }

      case 'edit-node-ai': {
        // Support both single node (backward compatibility) and multiple nodes
        const nodeIdentifiers = args.nodeIds || (args.nodeId ? [args.nodeId] : [])
        const changeDescription = args.changeDescription
        
        if (nodeIdentifiers.length === 0) {
          addOutputLine({
            id: `err_${Date.now()}`,
            type: 'error',
            content: 'Error: No nodes specified to edit',
            timestamp: new Date().toISOString(),
          })
          return
        }
        
        // Find all nodes to edit - first by label, then by ID, with normalization fallback
        const nodesToEdit: WorldLabNode[] = []
        const notFoundIdentifiers: string[] = []
        const ambiguousIdentifiers: Record<string, string[]> = {}

        const normalizeIdentifier = (value: string) =>
          value.trim().replace(/^["']|["']$/g, '').toLowerCase().normalize('NFKC')

        const normalizedNodeMap = new Map<string, WorldLabNode>()
        worldLabData.nodes.forEach(node => {
          const normalizedLabel = normalizeIdentifier(node.label)
          const normalizedId = normalizeIdentifier(node.id)
          if (!normalizedNodeMap.has(normalizedLabel)) {
            normalizedNodeMap.set(normalizedLabel, node)
          }
          if (!normalizedNodeMap.has(normalizedId)) {
            normalizedNodeMap.set(normalizedId, node)
          }
        })
        
        for (const identifier of nodeIdentifiers) {
          const cleanedIdentifier = identifier.trim().replace(/^["']|["']$/g, '')
          let nodeToEdit = worldLabData.nodes.find(n => n.label === cleanedIdentifier)
          if (!nodeToEdit) {
            // If not found by label, try by ID (backward compatibility)
            nodeToEdit = worldLabData.nodes.find(n => n.id === cleanedIdentifier)
          }
          if (!nodeToEdit) {
            // Fallback to normalized lookup (case/width-insensitive)
            nodeToEdit = normalizedNodeMap.get(normalizeIdentifier(cleanedIdentifier))
          }
          if (!nodeToEdit) {
            // Fallback to partial match if there is exactly one candidate
            const normalizedIdentifier = normalizeIdentifier(cleanedIdentifier)
            const partialMatches = worldLabData.nodes.filter(node =>
              normalizeIdentifier(node.label).includes(normalizedIdentifier)
            )
            if (partialMatches.length === 1) {
              nodeToEdit = partialMatches[0]
            } else if (partialMatches.length > 1) {
              ambiguousIdentifiers[identifier] = partialMatches.map(node => node.label)
            }
          }
          
          if (nodeToEdit) {
            nodesToEdit.push(nodeToEdit)
          } else {
            notFoundIdentifiers.push(identifier)
          }
        }
        
        if (notFoundIdentifiers.length > 0 || Object.keys(ambiguousIdentifiers).length > 0) {
          const errorMessages: string[] = []
          if (notFoundIdentifiers.length > 0) {
            errorMessages.push(`Node(s) not found: ${notFoundIdentifiers.join(', ')}`)
          }
          if (Object.keys(ambiguousIdentifiers).length > 0) {
            Object.entries(ambiguousIdentifiers).forEach(([identifier, matches]) => {
              errorMessages.push(`Multiple matches for "${identifier}": ${matches.join(', ')}`)
            })
          }
          addOutputLine({
            id: `err_${Date.now()}`,
            type: 'error',
            content: `Error: ${errorMessages.join('\n')}`,
            timestamp: new Date().toISOString(),
          })
          return
        }
        
        // Update args.nodeIds to actual IDs for later use
        args.nodeIds = nodesToEdit.map(n => n.id)
        
        // Build nodes info for prompt
        const nodesInfo = nodesToEdit.map(node => {
          return `- Label: ${node.label}
- Category: ${node.category || 'Uncategorized'}
- Content: ${node.data?.content || '(no content)'}`
        }).join('\n\n')
        
        const nodesLabel = nodesToEdit.length === 1 ? 'node' : 'nodes'
        
        aiPrompt = `You are helping edit ${nodesToEdit.length} ${nodesLabel} in a WorldLab (world-building system). Here is the current state:

${worldLabContext}

Current ${nodesLabel} to edit:
${nodesInfo}

User wants to: ${changeDescription}

Please generate the updated node information. You can:
- Update the node content/description
- Update the label if needed
- Change the category if appropriate
- Create new edges or modifications to existing edges
- Create any additional related nodes that may be needed

IMPORTANT:
- Respond in the same language as the nodes and edges in the WorldLab (observe the language used in the node labels, content, and edge labels, and use that language for all generated content including labels, descriptions, and edge labels)
- Do NOT include position coordinates
- Respond ONLY with valid JSON, no other text before or after
- For multiple nodes, provide an array of nodes in the "nodes" field

Respond in JSON format:
{
  "nodes": [
    {
      "label": "Alice",
      "category": "Character",
      "content": "A brave warrior named Alice who grew up in a small village. She is known for her exceptional sword skills and kind heart."
    }
  ],
  "edges": [
    {"from": "label1", "to": "label2", "label": "...", "directional": true}
  ],
  "newNodes": [
    {
      "label": "Bob",
      "category": "Character",
      "content": "A wise mentor who guides Alice on her journey. Bob has extensive knowledge of ancient magic and combat techniques."
    }
  ]
}`
        break
      }

      case 'derive-story': {
        // 获取用于 derive 的 nodes 和 edges
        const { nodes: deriveNodes, edges: deriveEdges } = getDeriveNodesAndEdges()
        
        if (deriveNodes.length === 0) {
          addOutputLine({
            id: `err_${Date.now()}`,
            type: 'error',
            content: 'Error: No nodes available to derive story from',
            timestamp: new Date().toISOString(),
          })
          return
        }
        
        // 异步加载所有节点的内容
        try {
          const nodesWithContent = await Promise.all(
            deriveNodes.map(async (node) => {
              // Try to load node content from file if not already in data
              let nodeContent = node.data?.content || ''
              if (!nodeContent) {
                try {
                  const loadedContent = await worldLabApi.loadNodeContent(labName, node.id, projectId || '')
                  if (loadedContent) {
                    nodeContent = loadedContent
                  }
                } catch (error) {
                  console.warn(`[WorldLabTerminal] Failed to load content for node ${node.id}:`, error)
                }
              }
              
              return {
                label: node.label,
                category: node.category || 'Uncategorized',
                content: nodeContent,
              }
            })
          )
          
          // Build edges JSON with labels (convert IDs to labels)
          const edgesJson = deriveEdges.map(edge => {
            const sourceNode = deriveNodes.find(n => n.id === edge.source)
            const targetNode = deriveNodes.find(n => n.id === edge.target)
            const edgeObj: {
              from: string
              to: string
              label?: string
              directional?: boolean
            } = {
              from: sourceNode?.label || edge.source,
              to: targetNode?.label || edge.target,
            }
            if (edge.label) {
              edgeObj.label = edge.label
            }
            // Determine if edge is directional
            // directed: true means directional (with arrow), false/undefined means bidirectional (no arrow)
            // Check data.directed first (most accurate), fallback to type check for backward compatibility
            if (edge.data?.directed !== undefined) {
              edgeObj.directional = edge.data.directed === true
            } else {
              // Fallback: check type (smoothstep usually means directional, default means bidirectional)
              edgeObj.directional = edge.type !== 'default' && edge.type !== undefined
            }
            return edgeObj
          })
          
          const deriveContext = JSON.stringify({
            nodes: nodesWithContent,
            edges: edgesJson,
          }, null, 2)
          
          const nodeCount = deriveNodes.length
          const edgeCount = deriveEdges.length
          
          aiPrompt = `You are helping derive story possibilities from a WorldLab (world-building system). Based on the following nodes and edges,
          ${deriveContext}

What could happen next based on:
- Current relationships and tensions
- Unresolved conflicts
- Pending character decisions

Format (plain text, no markdown):
Derived from: ${nodeCount} nodes, ${edgeCount} edges

Possibility 1: [specific event]
Why: [based on which nodes/edges]

Possibility 2: [specific event]
Why: [based on which nodes/edges]

...

Which direction interests you?

IMPORTANT: 
- Use same language as nodes/edges
- Plain text only (no **bold**, # headers, code blocks)
- Start with "Derived from: X nodes, Y edges"`
        } catch (error) {
          addOutputLine({
            id: `err_${Date.now()}`,
            type: 'error',
            content: `Error loading node content: ${error instanceof Error ? error.message : 'Unknown error'}`,
            timestamp: new Date().toISOString(),
          })
          return
        }
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
    // For create and edit commands, immediately mark streaming as started to hide "Processing…"
    if (command === 'create-node-ai' || command === 'edit-node-ai') {
      setHasStartedStreaming(true)
    } else {
      setHasStartedStreaming(false) // Reset streaming state
    }
    addOutputLine(aiLine)

    // 添加日志：显示正在执行的操作
    let logMessage = ''
    if (command === 'create-node-ai') {
      // Truncate description to max 60 characters for log message
      const description = args.description || ''
      const truncatedDescription = description.length > 30
        ? description.substring(0, 30) + '...' 
        : description
      logMessage = `[AI] Creating node: "${truncatedDescription}"`
    } else if (command === 'edit-node-ai') {
      // Support both single node (backward compatibility) and multiple nodes
      const nodeIdentifiers = args.nodeIds || (args.nodeId ? [args.nodeId] : [])
      const nodesToEdit = nodeIdentifiers.map((identifier: string) => {
        let node = worldLabData.nodes.find(n => n.label === identifier)
        if (!node) {
          node = worldLabData.nodes.find(n => n.id === identifier)
        }
        return node
      }).filter(Boolean) as WorldLabNode[]
      
      if (nodesToEdit.length === 1) {
        logMessage = `[AI] Editing node: "${nodesToEdit[0].label}"...`
      } else if (nodesToEdit.length > 1) {
        logMessage = `[AI] Editing ${nodesToEdit.length} nodes: ${nodesToEdit.map(n => n.label).join(', ')}...`
      }
    } else if (command === 'derive-story') {
      // No log message for derive - the "Derived from" info is in the story output
    } else if (command === 'natural-language') {
      // No log message for natural language - just show the conversation
    }
    
    if (logMessage) {
      addOutputLine({
        id: `log_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        type: 'info',
        content: logMessage,
        timestamp: new Date().toISOString(),
      })
    }

    try {
      // Always read API keys directly from localStorage to ensure we use the same keys as ChatInterface
      // This ensures consistency even if state hasn't updated yet
      const currentGoogleKey = localStorage.getItem('googleApiKey') || ''
      const currentOpenaiKey = localStorage.getItem('openaiApiKey') || ''
      
      // Add user message to conversation history before calling AI
      const userMessage: AIChatMessage = {
        id: `msg_${Date.now()}_user`,
        role: 'user',
        content: rawInput?.trim() || aiPrompt,
        timestamp: new Date().toISOString(),
      }
      const trimmedHistory = trimConversationHistory(conversationHistory)
      const updatedHistoryWithUser = [...trimmedHistory, userMessage]
      
      // 调用 AI API - pass API keys directly from localStorage to ensure we use the same keys as ChatInterface
      // Pass conversation history for memory (backend will handle summarization when needed)
      const response = await aiApi.streamChat(
        aiPrompt,
        worldLabContext, // documentContent
        undefined, // documentId
        trimmedHistory, // chatHistory - pass conversation history for memory
        false, // useWebSearch
        selectedModel, // modelName - uses model selected based on available API keys
        undefined, // attachments
        'Concise', // style
        projectId, // projectId
        currentGoogleKey, // googleApiKeyOverride - read directly from localStorage to match ChatInterface
        currentOpenaiKey // openaiApiKeyOverride - read directly from localStorage to match ChatInterface
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
                  // Mark that streaming has started (hide "Processing…")
                  if (!hasStartedStreaming) {
                    setHasStartedStreaming(true)
                  }
                  
                  currentAIOutputRef.current += data.chunk
                  
                  // For create-node-ai and edit-node-ai, don't show raw output, we'll parse and apply it
                  if (command !== 'create-node-ai' && command !== 'edit-node-ai') {
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
              }
            } catch (e) {
              // Ignore parse errors
            }
          }
        }
      }

          // After stream completes, handle create-node-ai and edit-node-ai responses
      if (command === 'create-node-ai' || command === 'edit-node-ai') {
        try {
          // Parse the complete AI response as JSON
          const fullResponse = currentAIOutputRef.current.trim()
          
          
          // Try to extract JSON from the response (might have markdown code blocks or other text)
          let jsonStr = fullResponse
          const jsonMatch = fullResponse.match(/\{[\s\S]*\}/)
          if (jsonMatch) {
            jsonStr = jsonMatch[0]
          }
          
          const aiResponse = JSON.parse(jsonStr)
          
          const existingNodes = worldLabData.nodes
          const existingEdges = worldLabData.edges || []
          
          // Add log: show what AI generated
          if (command === 'create-node-ai' && aiResponse.nodes) {
            const nodeCount = Array.isArray(aiResponse.nodes) ? aiResponse.nodes.length : 0
            const edgeCount = Array.isArray(aiResponse.edges) ? aiResponse.edges.length : 0
            addOutputLine({
              id: `log_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
              type: 'info',
              content: `[AI] Generated ${nodeCount} node(s), ${edgeCount} edge(s)`,
              timestamp: new Date().toISOString(),
            })
          } else if (command === 'edit-node-ai') {
            // Get the nodes being edited from args
            const nodeIdsToEdit = args.nodeIds || (args.nodeId ? [args.nodeId] : [])
            const nodesToEdit = existingNodes.filter(n => nodeIdsToEdit.includes(n.id))
            if (nodesToEdit.length > 0) {
              addOutputLine({
                id: `log_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                type: 'info',
                content: `[AI] Editing ${nodesToEdit.length} node(s)...`,
                timestamp: new Date().toISOString(),
              })
            }
          }
          
          // Build label-to-ID map for existing nodes first
          const labelToIdMap = new Map<string, string>()
          existingNodes.forEach(node => {
            labelToIdMap.set(node.label, node.id)
          })
          
          // Track used labels for deduplication
          const usedLabels = new Set<string>(existingNodes.map(n => n.label))
          
          // Handle edit-node-ai: update existing node(s) and possibly create new nodes
          if (command === 'edit-node-ai') {
            // Support both single node (backward compatibility) and multiple nodes
            const nodeIdsToEdit = args.nodeIds || (args.nodeId ? [args.nodeId] : [])
            const nodesToEdit = existingNodes.filter(n => nodeIdsToEdit.includes(n.id))
            
            if (nodesToEdit.length === 0) {
              throw new Error(`No nodes found to edit`)
            }
            
            // Save current state to history before applying changes
            onBeforeOperation?.()
            
            // Process updated nodes from AI response
            // Support both old format (single "node") and new format (array "nodes")
            const updatedNodesData = aiResponse.nodes || (aiResponse.node ? [aiResponse.node] : [])
            const updatedNodes = [...existingNodes]
            
            // Create a map of label to updated data for matching
            const updatedDataMap = new Map<string, any>()
            updatedNodesData.forEach((nodeData: any) => {
              if (nodeData.label) {
                updatedDataMap.set(nodeData.label, nodeData)
              }
            })
            
            // Update each node that matches
            for (const nodeToEdit of nodesToEdit) {
              const nodeIndex = updatedNodes.findIndex(n => n.id === nodeToEdit.id)
              if (nodeIndex === -1) continue
              
              // Find matching updated data by label (or use first one if only one node to edit)
              let updatedNodeData: any = {}
              if (updatedNodesData.length === 1 && nodesToEdit.length === 1) {
                updatedNodeData = updatedNodesData[0]
              } else if (updatedDataMap.has(nodeToEdit.label)) {
                updatedNodeData = updatedDataMap.get(nodeToEdit.label) || {}
              } else if (updatedNodesData.length === nodesToEdit.length) {
                // If counts match, assume order matches
                const nodeIndexInArray = nodesToEdit.findIndex(n => n.id === nodeToEdit.id)
                if (nodeIndexInArray >= 0 && nodeIndexInArray < updatedNodesData.length) {
                  updatedNodeData = updatedNodesData[nodeIndexInArray]
                }
              }
              
              // Update the node - explicitly preserve position from original node to prevent movement
              const nextLabel = updatedNodeData.label || nodeToEdit.label
              const nextCategory = updatedNodeData.category || nodeToEdit.category
              updatedNodes[nodeIndex] = {
                ...nodeToEdit, // Start with original node to preserve all properties including position
                label: nextLabel,
                category: nextCategory,
                // Explicitly preserve position from original node
                position: nodeToEdit.position,
                data: {
                  ...nodeToEdit.data,
                  label: nextLabel,
                  category: nextCategory,
                  content: updatedNodeData.content || nodeToEdit.data?.content || '',
                },
              }
              
              // Update label in map if changed
              if (updatedNodeData.label && updatedNodeData.label !== nodeToEdit.label) {
                labelToIdMap.delete(nodeToEdit.label)
                labelToIdMap.set(updatedNodeData.label, nodeToEdit.id)
              }
              
              // Save updated node content to file
              try {
                const nodeContent = updatedNodeData.content || updatedNodes[nodeIndex].data?.content || ''
                await worldLabApi.saveNode(labName, nodeToEdit.id, nodeContent, projectId || '')
              } catch (error) {
                console.error('[WorldLabTerminal] Error saving updated node:', error)
              }
            }
            
            if (nodesToEdit.length > 0) {
              addOutputLine({
                id: `log_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                type: 'info',
                content: `[AI] Saved ${nodesToEdit.length} updated node file(s)...`,
                timestamp: new Date().toISOString(),
              })
            }
            
            // Process new nodes from AI response (if any)
            const newNodesFromEdit: WorldLabNode[] = []
            if (aiResponse.newNodes && Array.isArray(aiResponse.newNodes)) {
              const processedNewNodes: Array<{
                originalLabel: string
                finalLabel: string
                category: string
                content: string
              }> = []
              
              aiResponse.newNodes.forEach((node: any) => {
                let finalLabel = node.label || 'Unnamed Node'
                let suffix = 2
                
                while (usedLabels.has(finalLabel)) {
                  finalLabel = `${node.label}_${suffix}`
                  suffix++
                }
                
                usedLabels.add(finalLabel)
                processedNewNodes.push({
                  originalLabel: node.label || finalLabel,
                  finalLabel,
                  category: node.category || 'Uncategorized',
                  content: node.content || '',
                })
              })
              
              // Generate IDs and create new nodes
              const newNodeIds = new Set<string>()
              processedNewNodes.forEach(node => {
                const nodeId = `node_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
                newNodeIds.add(nodeId)
                labelToIdMap.set(node.finalLabel, nodeId)
                
                const position = calculateInitialPosition(
                  nodeId,
                  node.finalLabel,
                  aiResponse.edges || [],
                  existingNodes,
                  labelToIdMap,
                  newNodeIds
                )
                
                newNodesFromEdit.push({
                  id: nodeId,
                  label: node.finalLabel,
                  category: node.category,
                  position,
                  data: {
                    label: node.finalLabel,
                    category: node.category,
                    content: node.content,
                  },
                })
              })
              
              // Create node files
              if (newNodesFromEdit.length > 0) {
                addOutputLine({
                  id: `log_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                  type: 'info',
                  content: `[AI] Saving ${newNodesFromEdit.length} new node file(s)...`,
                  timestamp: new Date().toISOString(),
                })
                for (const node of newNodesFromEdit) {
                  try {
                    await worldLabApi.createNode(labName, node.id, projectId || '', node.data?.content || '')
                  } catch (error) {
                    console.error('[WorldLabTerminal] Error creating new node file:', error)
                  }
                }
              }
              
              updatedNodes.push(...newNodesFromEdit)
            }
            
            // Update nodes
            if (onNodesChange) {
              onNodesChange(updatedNodes)
            }

            const nodeById = new Map(updatedNodes.map(node => [node.id, node]))
            
            // Process edges (create new or update existing)
            const allEdges = Array.isArray(aiResponse.edges) ? aiResponse.edges : []
            const newEdges: WorldLabEdge[] = []
            const updatedEdgesList: WorldLabEdge[] = [...existingEdges]
            
            allEdges.forEach((edge: any) => {
              const fromId = labelToIdMap.get(edge.from)
              const toId = labelToIdMap.get(edge.to)
              
              if (fromId && toId) {
                const handles = getEdgeHandlesForNodes(nodeById.get(fromId), nodeById.get(toId))
                // Check if edge already exists
                const existingEdgeIndex = updatedEdgesList.findIndex(e => 
                  e.source === fromId && e.target === toId
                )
                
                if (existingEdgeIndex >= 0) {
                  // Update existing edge (e.g., change directionality, label)
                  const existingEdge = updatedEdgesList[existingEdgeIndex]
                  updatedEdgesList[existingEdgeIndex] = {
                    ...existingEdge,
                    label: edge.label !== undefined ? edge.label : existingEdge.label,
                    type: edge.directional !== undefined 
                      ? (edge.directional ? 'smoothstep' : 'default')
                      : existingEdge.type,
                    sourceHandle: existingEdge.sourceHandle ?? handles.sourceHandle,
                    targetHandle: existingEdge.targetHandle ?? handles.targetHandle,
                    data: {
                      ...existingEdge.data,
                      directed: edge.directional !== undefined 
                        ? edge.directional 
                        : (existingEdge.data?.directed || false),
                    },
                  }
                } else {
                  // Create new edge
                  const edgeId = `edge_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
                  newEdges.push({
                    id: edgeId,
                    source: fromId,
                    target: toId,
                    label: edge.label || undefined,
                    type: edge.directional ? 'smoothstep' : 'default',
                    sourceHandle: handles.sourceHandle,
                    targetHandle: handles.targetHandle,
                    data: {
                      directed: edge.directional || false,
                    },
                  })
                }
              }
            })
            
            // Add new edges to the updated list
            const finalEdges = [...updatedEdgesList, ...newEdges].map(edge =>
              ensureEdgeHandles(edge, nodeById)
            )
            
            // Only update if there are changes (new edges or updated edges)
            if ((newEdges.length > 0 || allEdges.length > 0) && onEdgesChange) {
              onEdgesChange(finalEdges)
            }
            
            // Explicitly save node positions and metadata for all nodes (including newly created ones)
            // This ensures positions are persisted even if Canvas hasn't synced yet
            try {
              const nodePositions: Record<string, { x: number; y: number }> = {}
              const nodeMetadata: Record<string, { label?: string; category?: string; elementName?: string }> = {}
              
              updatedNodes.forEach(node => {
                nodePositions[node.id] = node.position
                nodeMetadata[node.id] = {
                  label: node.label,
                  category: node.category,
                  elementName: node.elementName,
                }
              })
              
              // Save edges with all node positions and metadata (including new nodes)
              await worldLabApi.saveEdges(labName, finalEdges, projectId || '', nodePositions, nodeMetadata)
            } catch (error) {
              console.error('[WorldLabTerminal] Error saving node positions:', error)
              // Don't show error to user as this is a background operation
            }
            
            // Add log: operation complete
            addOutputLine({
              id: `log_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
              type: 'info',
              content: '[AI] Operation completed successfully',
              timestamp: new Date().toISOString(),
            })
            
            // Update output line
            const newNodeLabels = newNodesFromEdit.map(n => n.label).join(', ')
            const updatedEdgesCount = allEdges.length - newEdges.length // Count of updated edges
            const updatedNodeLabels = nodesToEdit.map(n => n.label).join(', ')
            let edgeSummary = ''
            if (newEdges.length > 0 && updatedEdgesCount > 0) {
              edgeSummary = `\nCreated ${newEdges.length} edge(s), updated ${updatedEdgesCount} edge(s)`
            } else if (newEdges.length > 0) {
              edgeSummary = `\nCreated ${newEdges.length} edge(s)`
            } else if (updatedEdgesCount > 0) {
              edgeSummary = `\nUpdated ${updatedEdgesCount} edge(s)`
            }
            setOutputLines(prev => {
              const updated = [...prev]
              const lineIndex = updated.findIndex(l => l.id === currentAILineIdRef.current)
              if (lineIndex !== -1) {
                updated[lineIndex] = {
                  ...updated[lineIndex],
                  content: `Updated ${nodesToEdit.length} node(s): ${updatedNodeLabels}${newNodesFromEdit.length > 0 ? `\nCreated ${newNodesFromEdit.length} new node(s): ${newNodeLabels}` : ''}${edgeSummary}`,
                  type: 'info',
                  nodeRefs: [...nodeIdsToEdit, ...newNodesFromEdit.map(n => n.id)],
                }
              }
              return updated
            })
            
          } else {
            // Handle create-node-ai: create new nodes
            if (!aiResponse.nodes || !Array.isArray(aiResponse.nodes)) {
              throw new Error('Invalid AI response: missing nodes array')
            }
            
            if (!aiResponse.edges || !Array.isArray(aiResponse.edges)) {
              aiResponse.edges = []
            }

            // Process new nodes with label deduplication
            const processedNodes: Array<{
              originalLabel: string
              finalLabel: string
              category: string
              content: string
            }> = []
            
            aiResponse.nodes.forEach((node: any) => {
              let finalLabel = node.label || 'Unnamed Node'
              let suffix = 2
              
              // Handle label deduplication
              while (usedLabels.has(finalLabel)) {
                finalLabel = `${node.label}_${suffix}`
                suffix++
              }
              
              usedLabels.add(finalLabel)
              processedNodes.push({
                originalLabel: node.label || finalLabel,
                finalLabel,
                category: node.category || args.category || 'Uncategorized',
                content: node.content || '',
              })
            })

            // Generate IDs and build labelToIdMap, then create nodes with calculated positions
            const newNodeIds = new Set<string>()
            const newNodes: WorldLabNode[] = []
            
            // First pass: generate IDs and add to labelToIdMap
            processedNodes.forEach(node => {
              const nodeId = `node_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
              newNodeIds.add(nodeId)
              labelToIdMap.set(node.finalLabel, nodeId)
            })
            
            // Second pass: create nodes with calculated positions
            processedNodes.forEach((node) => {
              const nodeId = labelToIdMap.get(node.finalLabel)!
              const position = calculateInitialPosition(
                nodeId,
                node.finalLabel,
                aiResponse.edges,
                existingNodes,
                labelToIdMap,
                newNodeIds
              )
              
              newNodes.push({
                id: nodeId,
                label: node.finalLabel,
                category: node.category,
                position,
                data: {
                  label: node.finalLabel,
                  category: node.category,
                  content: node.content,
                },
              })
            })

            // Save current state to history before applying changes
            onBeforeOperation?.()

            // Add log: saving files
            if (newNodes.length > 0) {
              addOutputLine({
                id: `log_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                type: 'info',
                content: `[AI] Saving ${newNodes.length} node file(s)...`,
                timestamp: new Date().toISOString(),
              })
            }

            // Create node files in the backend before updating state
            try {
              for (const node of newNodes) {
                const nodeContent = node.data?.content || ''
                await worldLabApi.createNode(labName, node.id, projectId || '', nodeContent)
              }
            } catch (error) {
              console.error('[WorldLabTerminal] Error creating node files:', error)
              addOutputLine({
                id: `err_${Date.now()}`,
                type: 'error',
                content: `Error creating node files: ${error instanceof Error ? error.message : 'Unknown error'}`,
                timestamp: new Date().toISOString(),
              })
            }

            // Update nodes first
            const updatedNodes = [...existingNodes, ...newNodes]
            if (onNodesChange) {
              onNodesChange(updatedNodes)
            }
            const nodeById = new Map(updatedNodes.map(node => [node.id, node]))

            // Create edges (convert labels to IDs using labelToIdMap)
            const newEdges: WorldLabEdge[] = []
            aiResponse.edges.forEach((edge: any) => {
              const fromId = labelToIdMap.get(edge.from)
              const toId = labelToIdMap.get(edge.to)
              
              if (fromId && toId) {
                const handles = getEdgeHandlesForNodes(nodeById.get(fromId), nodeById.get(toId))
                // Check if edge already exists
                const edgeExists = existingEdges.some(e => 
                  e.source === fromId && e.target === toId
                )
                
                if (!edgeExists) {
                  const edgeId = `edge_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
                  newEdges.push({
                    id: edgeId,
                    source: fromId,
                    target: toId,
                    label: edge.label || undefined,
                    type: edge.directional ? 'smoothstep' : 'default',
                    sourceHandle: handles.sourceHandle,
                    targetHandle: handles.targetHandle,
                    data: {
                      directed: edge.directional || false,
                    },
                  })
                }
              }
            })

            // Update edges
            const updatedEdges = [...existingEdges, ...newEdges].map(edge =>
              ensureEdgeHandles(edge, nodeById)
            )
            if (onEdgesChange) {
              onEdgesChange(updatedEdges)
            }

            // Explicitly save node positions and metadata for newly created nodes
            // This ensures positions are persisted even if Canvas hasn't synced yet
            try {
              const nodePositions: Record<string, { x: number; y: number }> = {}
              const nodeMetadata: Record<string, { label?: string; category?: string; elementName?: string }> = {}
              
              updatedNodes.forEach(node => {
                nodePositions[node.id] = node.position
                nodeMetadata[node.id] = {
                  label: node.label,
                  category: node.category,
                  elementName: node.elementName,
                }
              })
              
              // Save edges with all node positions and metadata (including new nodes)
              await worldLabApi.saveEdges(labName, updatedEdges, projectId || '', nodePositions, nodeMetadata)
            } catch (error) {
              console.error('[WorldLabTerminal] Error saving node positions:', error)
              // Don't show error to user as this is a background operation
            }

            // Add log: operation complete
            addOutputLine({
              id: `log_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
              type: 'info',
              content: '[AI] Operation completed successfully',
              timestamp: new Date().toISOString(),
            })

            // Update output line with success message
            const nodeLabels = newNodes.map(n => n.label).join(', ')
            const edgeCount = newEdges.length
            setOutputLines(prev => {
              const updated = [...prev]
              const lineIndex = updated.findIndex(l => l.id === currentAILineIdRef.current)
              if (lineIndex !== -1) {
                updated[lineIndex] = {
                  ...updated[lineIndex],
                  content: `Created ${newNodes.length} node(s): ${nodeLabels}${edgeCount > 0 ? `\nCreated ${edgeCount} edge(s)` : ''}`,
                  type: 'info',
                  nodeRefs: newNodes.map(n => n.id),
                }
              }
              return updated
            })
          }
          
        } catch (parseError: any) {
          // Update output line with error
          setOutputLines(prev => {
            const updated = [...prev]
            const lineIndex = updated.findIndex(l => l.id === currentAILineIdRef.current)
            if (lineIndex !== -1) {
              updated[lineIndex] = {
                ...updated[lineIndex],
                content: `Error parsing AI response: ${parseError.message}\nRaw response: ${currentAIOutputRef.current.substring(0, 200)}...`,
                type: 'error',
              }
            }
            return updated
          })
        }
      }
      
      // Update conversation history with assistant response
      // For create-node-ai and edit-node-ai, use a summary of what was done
      // For natural-language, use the cleaned response
      let assistantContent = cleanMarkdownForTerminal(currentAIOutputRef.current.trim())
      if (command === 'create-node-ai' || command === 'edit-node-ai') {
        // For structured commands, create a summary instead of raw JSON
        try {
          const fullResponse = currentAIOutputRef.current.trim()
          const jsonMatch = fullResponse.match(/\{[\s\S]*\}/)
          if (jsonMatch) {
            const aiResponse = JSON.parse(jsonMatch[0])
            if (command === 'create-node-ai' && aiResponse.nodes) {
              const nodeLabels = Array.isArray(aiResponse.nodes) 
                ? aiResponse.nodes.map((n: any) => n.label || 'Unnamed').join(', ')
                : ''
              const edgeCount = Array.isArray(aiResponse.edges) ? aiResponse.edges.length : 0
              assistantContent = `Created ${aiResponse.nodes.length} node(s): ${nodeLabels}${edgeCount > 0 ? `, ${edgeCount} edge(s)` : ''}`
            } else if (command === 'edit-node-ai') {
              assistantContent = `Updated node and ${aiResponse.newNodes?.length || 0} new node(s), ${aiResponse.edges?.length || 0} edge(s)`
            }
          }
        } catch (e) {
          // Fallback to raw content if parsing fails
          assistantContent = currentAIOutputRef.current.trim()
        }
      }
      
      const assistantMessage: AIChatMessage = {
        id: `msg_${Date.now()}_assistant`,
        role: 'assistant',
        content: assistantContent,
        timestamp: new Date().toISOString(),
      }
      
      // Update conversation history: add user message and assistant response
      const updatedHistory = trimConversationHistory([...updatedHistoryWithUser, assistantMessage])
      setConversationHistory(updatedHistory)
      if (projectId) {
        saveConversationHistory(labName, activeTerminalId, updatedHistory, projectId)
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
      setHasStartedStreaming(false) // Reset streaming state
    }
  }, [worldLabData, buildWorldLabContext, addOutputLine, scrollToBottom, projectId, labName, selectedModel, cleanMarkdownForTerminal, calculateInitialPosition, onBeforeOperation, onNodesChange, onEdgesChange, conversationHistory, activeTerminalId])

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
        await executeAICommand(result.command!, result.args || {}, input)
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
      setHasStartedStreaming(false) // Reset streaming state
    }
  }, [isProcessing, parseCommand, addOutputLine, executeLocalCommand, executeAICommand])

  // 处理粘贴事件 - 移除格式，只保留纯文本
  const handlePaste = useCallback(async (e: React.ClipboardEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    
    // 获取剪贴板中的纯文本
    const text = e.clipboardData.getData('text/plain')
    
    if (!text || !inputRef.current) return
    
    // 确保焦点在输入框上
    inputRef.current.focus()
    
    // 获取当前选择范围 - 确保在输入框内
    const selection = window.getSelection()
    if (!selection) return
    
    // 创建或获取正确的范围在输入框内
    let range: Range
    if (selection.rangeCount > 0) {
      const currentRange = selection.getRangeAt(0)
      // 检查选择是否在输入框内
      const isInInput = inputRef.current.contains(currentRange.commonAncestorContainer) ||
                        currentRange.commonAncestorContainer === inputRef.current ||
                        (currentRange.commonAncestorContainer.nodeType === Node.TEXT_NODE && 
                         inputRef.current.contains(currentRange.commonAncestorContainer.parentNode))
      
      if (isInInput) {
        range = currentRange
      } else {
        // 选择不在输入框内，创建新范围在输入框末尾
        range = document.createRange()
        range.selectNodeContents(inputRef.current)
        range.collapse(false) // 折叠到末尾
        selection.removeAllRanges()
        selection.addRange(range)
      }
    } else {
      // 没有选择，创建新范围在输入框末尾
      range = document.createRange()
      range.selectNodeContents(inputRef.current)
      range.collapse(false) // 折叠到末尾
      selection.removeAllRanges()
      selection.addRange(range)
    }
    
    // 删除选中的内容（如果有）
    range.deleteContents()
    
    // 插入纯文本
    const textNode = document.createTextNode(text)
    range.insertNode(textNode)
    
    // 移动光标到插入文本的末尾
    range.setStartAfter(textNode)
    range.collapse(true)
    selection.removeAllRanges()
    selection.addRange(range)
    
    // 更新输入状态
    const newText = inputRef.current.textContent || ''
    setCurrentInput(newText)
    
    // 滚动到底部
    setTimeout(() => {
      if (terminalRef.current) {
        terminalRef.current.scrollTop = terminalRef.current.scrollHeight
      }
    }, 0)
  }, [])

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

  // Handle keyboard events in terminal output area to allow Ctrl+C copy
  const handleTerminalKeyDown = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    // Don't interfere if the input field is focused - let handleSubmit handle it
    if (inputRef.current && document.activeElement === inputRef.current) {
      return
    }
    
    // Allow Ctrl+C (or Cmd+C on Mac) when text is selected in output area
    const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0
    const ctrlOrCmd = isMac ? e.metaKey : e.ctrlKey
    
    // Check if text is selected
    const selection = window.getSelection()
    const hasSelection = selection && selection.toString().length > 0
    
    // If Ctrl+C/Cmd+C is pressed and text is selected, allow default copy behavior
    // Don't prevent default or stop propagation - let browser handle copy
    if (ctrlOrCmd && (e.key === 'c' || e.key === 'C') && hasSelection) {
      // Explicitly allow the default copy behavior by not calling preventDefault
      // and not stopping propagation - browser will handle the copy
      return
    }
    
    // For all other keys, don't interfere - let them bubble up normally
  }, [])

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
    if (projectId) {
      saveTerminalSession(labName, newSession, projectId)
      saveOpenTerminalTabs(labName, newSessions.map(s => s.id), projectId)
      saveActiveTerminalId(labName, newTerminalId, projectId)
    }
    
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
      if (projectId) {
        saveTerminalSession(labName, newSession, projectId)
        saveOpenTerminalTabs(labName, [newTerminalId], projectId)
        saveActiveTerminalId(labName, newTerminalId, projectId)
      }
    } else {
      // Remove the terminal from tabs
      const newSessions = terminalSessions.filter(s => s.id !== terminalId)
      setTerminalSessions(newSessions)
      
      // Update persisted open tabs list
      if (projectId) {
        saveOpenTerminalTabs(labName, newSessions.map(s => s.id), projectId)
      }
      
      // If the closed terminal was active, switch to another one
      if (activeTerminalId === terminalId) {
        const closedIndex = terminalSessions.findIndex(s => s.id === terminalId)
        const newActiveIndex = closedIndex > 0 ? closedIndex - 1 : 0
        const newActiveId = newSessions[newActiveIndex]?.id || newSessions[0]?.id
        setActiveTerminalId(newActiveId)
        if (projectId) {
          saveActiveTerminalId(labName, newActiveId, projectId)
        }
      }
    }
  }

  const handleRenameTerminal = (terminalId: string, newName: string) => {
    setTerminalSessions(prev => {
      const updated = prev.map(s => s.id === terminalId ? { ...s, name: newName } : s)
      // Update saved session with the updated session data
      const updatedSession = updated.find(s => s.id === terminalId)
      if (updatedSession && projectId) {
        saveTerminalSession(labName, updatedSession, projectId)
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
        if (projectId) {
          saveOpenTerminalTabs(labName, newSessions.map(s => s.id), projectId)
        }
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
    // Load all saved sessions from localStorage for this project and lab
    const allSessions: TerminalSession[] = []
    if (!projectId) return allSessions
    
    try {
      // Get all keys that match the pattern: worldlab_terminal_{projectId}_{labName}_{terminalId}
      const prefix = `worldlab_terminal_${projectId}_${labName}_`
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i)
        if (key && key.startsWith(prefix)) {
          const terminalId = key.replace(prefix, '')
          const session = loadTerminalSession(labName, terminalId, projectId)
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
      data-worldlab-terminal="true"
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
                    if (projectId) {
                      saveActiveTerminalId(labName, session.id, projectId)
                    }
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
            
            if (!terminalExists && projectId) {
              // Load the terminal from localStorage and add it to tabs
              const session = loadTerminalSession(labName, terminalId, projectId)
              if (session) {
                const newSessions = [...terminalSessions, session]
                setTerminalSessions(newSessions)
                saveOpenTerminalTabs(labName, newSessions.map(s => s.id), projectId)
              }
            }
            
            setActiveTerminalId(terminalId)
            if (projectId) {
              saveActiveTerminalId(labName, terminalId, projectId)
            }
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
        onKeyDown={handleTerminalKeyDown}
        style={{
          flex: 1,
          overflowY: 'auto',
          overflowX: 'hidden',
          padding: '16px',
          paddingTop: '8px',
          paddingBottom: '80px',
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
                userSelect: 'text',
                WebkitUserSelect: 'text',
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
                position: 'relative',
              }}
            >
              <span 
                ref={promptRef}
                style={{ 
                  color: promptColor, 
                  position: 'absolute',
                  left: 0,
                  top: 0,
                  whiteSpace: 'pre',
                  paddingRight: '8px',
                  pointerEvents: 'none',
                }}
              >
                worldlab &gt; 
              </span>
              <div
                ref={inputRef}
                contentEditable
                suppressContentEditableWarning
                onKeyDown={handleSubmit}
                onPaste={handlePaste}
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
                  outline: 'none',
                  color: textColor,
                  minHeight: '20px',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                  marginLeft: `${-promptWidth}px`,
                  paddingLeft: `${promptWidth}px`,
                  textIndent: `${promptWidth}px`,
                }}
              />
            </div>
          )}
          {isProcessing && !hasStartedStreaming && (
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
