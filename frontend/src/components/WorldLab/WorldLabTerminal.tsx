import React, { useState, useRef, useEffect, useCallback, useLayoutEffect } from 'react'
import { useTheme } from '../../contexts/ThemeContext'
import { WorldLab, WorldLabNode, WorldLabEdge, AIChatMessage } from '@shared/types'
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
        const helpText = `COMMANDS
  model     - Show or set AI model
  undo      - Undo previous operation
  redo      - Redo operation
  help      - Show this help

  Type any message to chat with AI about this Lab.`
  
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
        aiPrompt = `You are an AI assistant helping with a Lab (canvas with nodes and edges). Current state:

${worldLabContext}

User: "${args.query}"

Help the user understand or interact with this Lab. Respond in plain text only (no markdown). Match the language of the nodes/edges if they have content.`
        break
      }

      default: {
        addOutputLine({
          id: `err_${Date.now()}`,
          type: 'error',
          content: `Unknown command: ${command}`,
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
    setHasStartedStreaming(false)
    addOutputLine(aiLine)

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

            // Update conversation history
      const assistantContent = cleanMarkdownForTerminal(currentAIOutputRef.current.trim())
      
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
  }, [worldLabData, buildWorldLabContext, addOutputLine, scrollToBottom, projectId, labName, selectedModel, cleanMarkdownForTerminal, conversationHistory, activeTerminalId])

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
