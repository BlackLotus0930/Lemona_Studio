import { useState, useRef, useEffect } from 'react'
import { AIChatMessage, ChatAttachment, Document, IndexingStatus } from '@shared/types'
import { aiApi, chatApi, documentApi, settingsApi } from '../../services/api'
import { indexingApi } from '../../services/desktop-api'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import 'katex/dist/katex.min.css'
import { useTheme } from '../../contexts/ThemeContext'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { vscDarkPlus, vs } from 'react-syntax-highlighter/dist/esm/styles/prism'
// @ts-ignore
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward'
// @ts-ignore
import CropOriginalIcon from '@mui/icons-material/CropOriginal'
// @ts-ignore
import AlternateEmailIcon from '@mui/icons-material/AlternateEmail'
// @ts-ignore
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf'
// @ts-ignore
import CloseIcon from '@mui/icons-material/Close'
// @ts-ignore
import ContentCopyIcon from '@mui/icons-material/ContentCopy'
// @ts-ignore
import CheckIcon from '@mui/icons-material/Check'
// @ts-ignore
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown'
// @ts-ignore
import AddIcon from '@mui/icons-material/Add'
// @ts-ignore
import AttachFileIcon from '@mui/icons-material/AttachFile'
// @ts-ignore
import FormatQuoteIcon from '@mui/icons-material/FormatQuote'
// @ts-ignore
import StopIcon from '@mui/icons-material/Stop'
// @ts-ignore
import FolderIcon from '@mui/icons-material/Folder'
// @ts-ignore
import FileCopyOutlinedIcon from '@mui/icons-material/FileCopyOutlined'
// @ts-ignore
import InsertDriveFileOutlinedIcon from '@mui/icons-material/InsertDriveFileOutlined'

interface ChatInterfaceProps {
  documentId?: string
  projectId?: string
  chatId: string
  documentContent?: string
  isStreaming: boolean
  setIsStreaming: (streaming: boolean) => void
  onFirstMessage?: (message: string) => void
  initialInput?: string
  onInputSet?: () => void
}

export default function ChatInterface({ documentId, projectId, chatId, documentContent, isStreaming, setIsStreaming, onFirstMessage, initialInput, onInputSet }: ChatInterfaceProps) {
  const { theme } = useTheme()
  const [messages, setMessages] = useState<AIChatMessage[]>([])
  const [input, setInput] = useState(initialInput || '')
  const [isLoading, setIsLoading] = useState(false)
  const [lastUserMessageForSearch, setLastUserMessageForSearch] = useState<string>('')
  
  // Handle initial input from external source (e.g., "Add to Chat" from editor)
  useEffect(() => {
    if (initialInput && initialInput !== input) {
      setInput(initialInput)
      if (textareaRef.current) {
        textareaRef.current.value = initialInput
        textareaRef.current.style.height = 'auto'
        textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`
        textareaRef.current.focus()
      }
      if (onInputSet) {
        onInputSet()
      }
    }
  }, [initialInput, input, onInputSet])
  const [isInputFocused, setIsInputFocused] = useState(false)
  const [useWebSearch, setUseWebSearch] = useState(false)
  // Load saved model from localStorage, or use default
  const [selectedModel, setSelectedModel] = useState<'gemini-3-flash-preview' | 'gemini-2.5-pro' | 'gpt-4.1-nano' | 'gpt-5-mini' | 'gpt-5.2'>(() => {
    try {
      const savedModel = localStorage.getItem('aiChatSelectedModel')
      if (savedModel && ['gemini-3-flash-preview', 'gemini-2.5-pro', 'gpt-4.1-nano', 'gpt-5-mini', 'gpt-5.2'].includes(savedModel)) {
        return savedModel as 'gemini-3-flash-preview' | 'gemini-2.5-pro' | 'gpt-4.1-nano' | 'gpt-5-mini' | 'gpt-5.2'
      }
    } catch (error) {
      console.error('Failed to load saved model:', error)
    }
    return 'gemini-3-flash-preview'
  })
  const [selectedStyle, setSelectedStyle] = useState<'Normal' | 'Learning' | 'Concise' | 'Explanatory' | 'Formal'>('Normal')
  const [showSettingsModal, setShowSettingsModal] = useState(false)
  const [showModelDropdown, setShowModelDropdown] = useState(false)
  const [showPlusMenu, setShowPlusMenu] = useState(false)
  const [showStyleMenu, setShowStyleMenu] = useState(false)
  const [googleApiKey, setGoogleApiKey] = useState('')
  const [openaiApiKey, setOpenaiApiKey] = useState('')
  const [smartIndexing, setSmartIndexing] = useState(false)
  const [modalPosition, setModalPosition] = useState<{ top: number; left?: number; right?: number }>({ top: 0, left: 0 })
  const modelDropdownRef = useRef<HTMLDivElement>(null)
  const modelNameRef = useRef<HTMLButtonElement>(null)
  const plusMenuRef = useRef<HTMLDivElement>(null)
  const plusButtonRef = useRef<HTMLButtonElement>(null)
  const styleMenuRef = useRef<HTMLDivElement>(null)
  const styleButtonRef = useRef<HTMLButtonElement>(null)
  const modalRef = useRef<HTMLDivElement>(null)
  const apiKeyInputRef = useRef<HTMLInputElement>(null)
  const hasNotifiedFirstMessage = useRef(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const scrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const updateMessageTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const currentAssistantMessageIdRef = useRef<string | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const mentionOverlayRef = useRef<HTMLDivElement>(null)
  const inputContainerRef = useRef<HTMLDivElement>(null)
  const unifiedContainerRef = useRef<HTMLDivElement>(null)
  const previousMessageCountRef = useRef<number>(0)
  const hasRestoredScrollRef = useRef<boolean>(false)
  const streamReaderRef = useRef<ReadableStreamDefaultReader<Uint8Array> | null>(null)
  const abortControllerRef = useRef<AbortController | null>(null)
  const isStreamCancelledRef = useRef<boolean>(false)
  const lastStreamingContentLengthRef = useRef<number>(0)
  const streamingScrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [inputContainerWidth, setInputContainerWidth] = useState<number | null>(null)
  const [attachments, setAttachments] = useState<ChatAttachment[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [copiedCodeBlocks, setCopiedCodeBlocks] = useState<Set<string>>(new Set())
  // Store scroll positions per chat ID
  const scrollPositionsRef = useRef<Map<string, number>>(new Map())
  const previousChatIdRef = useRef<string | null>(null)
  
  // @mention autocomplete state
  const [mentionQuery, setMentionQuery] = useState('')
  const [selectedMentionIndex, setSelectedMentionIndex] = useState(0)
  const [libraryDocuments, setLibraryDocuments] = useState<Document[]>([])
  const mentionStartIndexRef = useRef<number>(-1)
  const [currentSuggestion, setCurrentSuggestion] = useState<string | null>(null)
  const [showMentionDropdown, setShowMentionDropdown] = useState(false)
  const mentionDropdownRef = useRef<HTMLDivElement>(null)
  
  // Load API keys and Smart indexing setting from localStorage on mount and sync to main process
  useEffect(() => {
    try {
      const googleKey = localStorage.getItem('googleApiKey') || undefined
      const openaiKey = localStorage.getItem('openaiApiKey') || undefined
      
      if (googleKey) {
        setGoogleApiKey(googleKey)
      }
      if (openaiKey) {
        setOpenaiApiKey(openaiKey)
      }
      
      // Load Smart indexing setting (default to false if not set)
      const smartIndexingSetting = localStorage.getItem('smartIndexing')
      const isSmartIndexingEnabled = smartIndexingSetting === null ? false : smartIndexingSetting === 'true'
      setSmartIndexing(isSmartIndexingEnabled)
      
      // Sync both keys to main process for auto-indexing
      if (googleKey || openaiKey) {
        settingsApi.saveApiKeys(googleKey, openaiKey).catch((error) => {
          console.error('Failed to sync API keys to main process:', error)
        })
      }
      
      // Sync Smart indexing setting to main process
      settingsApi.saveSmartIndexing(isSmartIndexingEnabled).catch((error) => {
        console.error('Failed to sync Smart indexing setting to main process:', error)
      })
    } catch (error) {
      console.error('Failed to load API keys:', error)
    }
  }, [])

  // Save selected model to localStorage whenever it changes (user explicitly selects a model)
  useEffect(() => {
    try {
      localStorage.setItem('aiChatSelectedModel', selectedModel)
    } catch (error) {
      console.error('Failed to save selected model:', error)
    }
  }, [selectedModel])

  // Validate model compatibility with available API keys on mount and when keys change
  // Only switch if the current model is incompatible (e.g., GPT model but no OpenAI key)
  useEffect(() => {
    const hasGoogleKey = !!googleApiKey
    const hasOpenaiKey = !!openaiApiKey
    
    // Only auto-switch if the current model is incompatible with available API keys
    // This respects user's saved preference but ensures compatibility
    
    // If user has GPT model selected but no OpenAI key, switch to Gemini
    if (selectedModel.startsWith('gpt-') && !hasOpenaiKey) {
      if (hasGoogleKey) {
        setSelectedModel('gemini-3-flash-preview')
      }
    }
    // If user has Gemini model selected but no Google key, switch to GPT
    else if ((selectedModel === 'gemini-3-flash-preview' || selectedModel === 'gemini-2.5-pro') && !hasGoogleKey) {
      if (hasOpenaiKey) {
        setSelectedModel('gpt-4.1-nano')
      }
    }
    // If both keys are available and current model is invalid, default to Gemini 2.5 Flash
    else if (hasGoogleKey && hasOpenaiKey) {
      if (!['gemini-3-flash-preview', 'gemini-2.5-pro', 'gpt-4.1-nano', 'gpt-5-mini', 'gpt-5.2'].includes(selectedModel)) {
        setSelectedModel('gemini-3-flash-preview')
      }
    }
  }, [googleApiKey, openaiApiKey]) // Removed selectedModel from dependencies to avoid loops


  // Load documents for @mention autocomplete (current project files + library)
  const loadMentionDocuments = async () => {
    try {
      const allDocuments = await documentApi.list()
      
      // Filter to only show:
      // 1. Files in the library folder that belong to the current project (doc.folder === 'library' AND doc.projectId === projectId)
      // 2. Files in the current project (doc.projectId === projectId AND folder is 'project' or undefined)
      const mentionableDocs = allDocuments.filter((doc: Document) => {
        // Exclude README files
        if (doc.title === 'README.md' || doc.title.toLowerCase() === 'readme.md') {
          return false
        }
        
        // Include library documents that belong to the current project only
        // CRITICAL: Library files are scoped per project, not shared across all projects
        if (doc.folder === 'library') {
          // Only include if it belongs to the current project
          if (projectId && doc.projectId === projectId) {
            return true
          }
          // If no projectId is set, exclude it (orphaned library file)
          return false
        }
        
        // Include documents from the current project only
        // Must have matching projectId (folder can be 'project' or undefined/null)
        if (projectId && doc.projectId === projectId) {
          // This is a project file (already excluded library files above)
          return true
        }
        
        return false
      })
      
      setLibraryDocuments(mentionableDocs)
    } catch (error) {
      console.error('Failed to load documents for mentions:', error)
      setLibraryDocuments([])
    }
  }

  // Load documents when projectId changes
  useEffect(() => {
    loadMentionDocuments()
  }, [projectId])

  // Reload documents when dropdown opens to ensure we have the latest files
  useEffect(() => {
    if (showMentionDropdown) {
      loadMentionDocuments()
    }
  }, [showMentionDropdown])


  // Save Google API key to localStorage and main process
  const handleApiKeyChange = async (value: string) => {
    // Check if API key is being added (was empty, now has value)
    const hadKeyBefore = (googleApiKey && googleApiKey.trim().length > 0) ||
                         (openaiApiKey && openaiApiKey.trim().length > 0)
    
    setGoogleApiKey(value)
    try {
      if (value) {
        localStorage.setItem('googleApiKey', value)
      } else {
        localStorage.removeItem('googleApiKey')
      }
      // Also save to main process for auto-indexing (save both keys together)
      try {
        const currentOpenaiKey = localStorage.getItem('openaiApiKey') || undefined
        await settingsApi.saveApiKeys(value || undefined, currentOpenaiKey)
        
        // If API key was just added (was empty, now has value) and we have a projectId,
        // trigger indexing for the current project (only if Smart indexing is enabled)
        const hasKeyNow = (value && value.trim().length > 0) ||
                         (currentOpenaiKey && currentOpenaiKey.trim().length > 0)
        
        if (!hadKeyBefore && hasKeyNow && projectId) {
          // Check if Smart indexing is enabled before triggering indexing
          settingsApi.getSmartIndexing().then((smartIndexingEnabled) => {
            if (!smartIndexingEnabled) {
              console.log(`[Auto-Indexing] Smart indexing is disabled, skipping automatic indexing for project ${projectId}`)
              return
            }
            
            console.log(`[Auto-Indexing] API key was just added in project ${projectId}, starting library file indexing...`)
            indexingApi.indexProjectLibraryFiles(
              projectId,
              value || undefined,
              currentOpenaiKey,
              true // onlyUnindexed = true
            ).then((results: Array<{ documentId: string; status: IndexingStatus }>) => {
              const successCount = results.filter((r: { documentId: string; status: IndexingStatus }) => r.status.status === 'completed').length
              const errorCount = results.filter((r: { documentId: string; status: IndexingStatus }) => r.status.status === 'error').length
              if (successCount > 0 || errorCount > 0) {
                console.log(`[Auto-Indexing] Completed indexing for project ${projectId}: ${successCount} succeeded, ${errorCount} errors`)
              }
            }).catch((error) => {
              // Don't show error to user - indexing failures shouldn't interrupt workflow
              console.warn(`[Auto-Indexing] Failed to index project ${projectId}:`, error)
            })
          }).catch((error) => {
            console.warn('[Auto-Indexing] Failed to get Smart indexing setting:', error)
          })
        }
      } catch (error) {
        console.error('Failed to save Google API key to main process:', error)
      }
    } catch (error) {
      console.error('Failed to save Google API key:', error)
    }
  }

  // Save OpenAI API key to localStorage and main process
  const handleOpenaiApiKeyChange = async (value: string) => {
    // Check if API key is being added (was empty, now has value)
    const hadKeyBefore = (googleApiKey && googleApiKey.trim().length > 0) ||
                         (openaiApiKey && openaiApiKey.trim().length > 0)
    
    setOpenaiApiKey(value)
    try {
      if (value) {
        localStorage.setItem('openaiApiKey', value)
      } else {
        localStorage.removeItem('openaiApiKey')
      }
      // Also save to main process for auto-indexing (save both keys together)
      try {
        const currentGoogleKey = localStorage.getItem('googleApiKey') || undefined
        await settingsApi.saveApiKeys(currentGoogleKey, value || undefined)
        
        // If API key was just added (was empty, now has value) and we have a projectId,
        // trigger indexing for the current project (only if Smart indexing is enabled)
        const hasKeyNow = (currentGoogleKey && currentGoogleKey.trim().length > 0) ||
                         (value && value.trim().length > 0)
        
        if (!hadKeyBefore && hasKeyNow && projectId) {
          // Check if Smart indexing is enabled before triggering indexing
          settingsApi.getSmartIndexing().then((smartIndexingEnabled) => {
            if (!smartIndexingEnabled) {
              console.log(`[Auto-Indexing] Smart indexing is disabled, skipping automatic indexing for project ${projectId}`)
              return
            }
            
            console.log(`[Auto-Indexing] API key was just added in project ${projectId}, starting library file indexing...`)
            indexingApi.indexProjectLibraryFiles(
              projectId,
              currentGoogleKey,
              value || undefined,
              true // onlyUnindexed = true
            ).then((results: Array<{ documentId: string; status: IndexingStatus }>) => {
              const successCount = results.filter((r: { documentId: string; status: IndexingStatus }) => r.status.status === 'completed').length
              const errorCount = results.filter((r: { documentId: string; status: IndexingStatus }) => r.status.status === 'error').length
              if (successCount > 0 || errorCount > 0) {
                console.log(`[Auto-Indexing] Completed indexing for project ${projectId}: ${successCount} succeeded, ${errorCount} errors`)
              }
            }).catch((error) => {
              // Don't show error to user - indexing failures shouldn't interrupt workflow
              console.warn(`[Auto-Indexing] Failed to index project ${projectId}:`, error)
            })
          }).catch((error) => {
            console.warn('[Auto-Indexing] Failed to get Smart indexing setting:', error)
          })
        }
      } catch (error) {
        console.error('Failed to save OpenAI API key to main process:', error)
      }
    } catch (error) {
      console.error('Failed to save OpenAI API key:', error)
    }
  }

  // Update modal position when opening
  useEffect(() => {
    if (showSettingsModal && modelNameRef.current) {
      const updatePosition = () => {
        if (modelNameRef.current) {
          const rect = modelNameRef.current.getBoundingClientRect()
          const viewportWidth = window.innerWidth
          
          // Align modal's right edge with the model button's right edge (same as model dropdown)
          // Model dropdown uses right: 0 (relative to its parent), which aligns with rect.right
          // For fixed positioning, calculate right offset from viewport right edge
          const rightOffset = viewportWidth - rect.right
          
          // Position modal above the model name
          setModalPosition({
            top: rect.top - 8, // 8px above the model name
            left: undefined, // Will use right instead
            right: rightOffset, // Align right edge with model button's right edge
          })
        }
      }
      updatePosition()
      window.addEventListener('resize', updatePosition)
      return () => window.removeEventListener('resize', updatePosition)
    }
  }, [showSettingsModal])

  // Close modal when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node
      
      if (showSettingsModal) {
        // Close modal if clicking anywhere outside the modal itself
        if (modalRef.current && !modalRef.current.contains(target)) {
          setShowSettingsModal(false)
        }
      }
      
      if (showModelDropdown) {
        if (
          modelDropdownRef.current &&
          !modelDropdownRef.current.contains(target) &&
          modelNameRef.current &&
          !modelNameRef.current.contains(target)
        ) {
          setShowModelDropdown(false)
        }
      }
      
      if (showPlusMenu) {
        // Close plus menu if clicking anywhere outside the menu, button, and style submenu
        const isInPlusMenu = plusMenuRef.current?.contains(target)
        const isInPlusButton = plusButtonRef.current?.contains(target)
        const isInStyleMenu = styleMenuRef.current?.contains(target)
        const isInStyleButton = styleButtonRef.current?.contains(target)
        
        if (
          !isInPlusMenu &&
          !isInPlusButton &&
          !isInStyleMenu &&
          !isInStyleButton
        ) {
          setShowPlusMenu(false)
          setShowStyleMenu(false)
        }
      }
      
      if (showStyleMenu && showPlusMenu) {
        // Only handle style menu closing if plus menu is also open
        const isInStyleMenu = styleMenuRef.current?.contains(target)
        const isInStyleButton = styleButtonRef.current?.contains(target)
        
        if (!isInStyleMenu && !isInStyleButton) {
          setShowStyleMenu(false)
        }
      }
    }

    if (showSettingsModal || showModelDropdown || showPlusMenu || showStyleMenu) {
      // Use capture phase to catch clicks before they bubble
      document.addEventListener('mousedown', handleClickOutside, true)
      return () => {
        document.removeEventListener('mousedown', handleClickOutside, true)
      }
    }
  }, [showSettingsModal, showModelDropdown, showPlusMenu, showStyleMenu])
  
  const bgColor = theme === 'dark' ? '#141414' : '#ffffff'

  // Removed scroll position saving/loading - AI panel should maintain consistent state across files
  const brighterBg = theme === 'dark' ? '#141414' : '#ffffff'
  const inputBg = theme === 'dark' ? '#1d1d1d' : '#ffffff'
  const borderColor = theme === 'dark' ? '#313131' : '#dadce0'
  const textColor = theme === 'dark' ? '#D6D6DD' : '#202124'
  const secondaryTextColor = theme === 'dark' ? '#858585' : '#9aa0a6'
  const userMessageBg = theme === 'dark' ? '#1C1C1C' : '#f8f8f8'

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  // Save scroll position when leaving a chat
  useEffect(() => {
    if (!documentId || !chatId || !scrollContainerRef.current) return

    // Save scroll position of previous chat before switching
    if (previousChatIdRef.current && previousChatIdRef.current !== chatId && scrollContainerRef.current) {
      const scrollTop = scrollContainerRef.current.scrollTop
      scrollPositionsRef.current.set(previousChatIdRef.current, scrollTop)
    }

    // Reset state for new chat
    hasRestoredScrollRef.current = false
    previousMessageCountRef.current = 0

    // Update previous chat ID
    previousChatIdRef.current = chatId
    
    // Mark as restored after a delay (scroll will be restored after messages load)
    setTimeout(() => {
      hasRestoredScrollRef.current = true
    }, 150)
    
    // Cleanup: save scroll position when component unmounts or documentId changes
    return () => {
      if (previousChatIdRef.current && scrollContainerRef.current) {
        const scrollTop = scrollContainerRef.current.scrollTop
        scrollPositionsRef.current.set(previousChatIdRef.current, scrollTop)
      }
    }
  }, [documentId, chatId])

  // Auto-scroll to bottom only when new messages are added (not on initial load)
  useEffect(() => {
    if (!hasRestoredScrollRef.current || !scrollContainerRef.current) return

    const currentMessageCount = messages.length
    const previousMessageCount = previousMessageCountRef.current

    // Only auto-scroll if a new message was actually added
    if (currentMessageCount > previousMessageCount && currentMessageCount > 0) {
      // Only auto-scroll if we're near the bottom (within 100px)
      // This prevents auto-scrolling when user is reading older messages
      const container = scrollContainerRef.current
      const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 100
      if (isNearBottom) {
        scrollToBottom()
      }
    }

    previousMessageCountRef.current = currentMessageCount
  }, [messages])

  // Auto-scroll during streaming (ChatGPT-like experience)
  useEffect(() => {
    if (!hasRestoredScrollRef.current || !scrollContainerRef.current || !isStreaming) {
      // Reset tracking when not streaming
      if (!isStreaming) {
        lastStreamingContentLengthRef.current = 0
      }
      return
    }

    const container = scrollContainerRef.current
    const lastMessage = messages[messages.length - 1]
    
    // Only auto-scroll if the last message is from assistant and we're streaming
    if (lastMessage && lastMessage.role === 'assistant') {
      const currentContentLength = lastMessage.content.length
      
      // Only scroll if content actually changed
      if (currentContentLength !== lastStreamingContentLengthRef.current) {
        lastStreamingContentLengthRef.current = currentContentLength
        
        // Check if user is near the bottom (within 200px for streaming)
        const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 200
        
        if (isNearBottom) {
          // Clear any pending scroll
          if (streamingScrollTimeoutRef.current) {
            clearTimeout(streamingScrollTimeoutRef.current)
          }
          
          // Debounce scroll slightly for smoother performance during rapid updates
          streamingScrollTimeoutRef.current = setTimeout(() => {
            if (messagesEndRef.current && scrollContainerRef.current) {
              // Use instant scroll for streaming (smoother than smooth during rapid updates)
              messagesEndRef.current.scrollIntoView({ behavior: 'auto' })
            }
          }, 50) // Small debounce for performance
        }
      }
    }
    
    return () => {
      if (streamingScrollTimeoutRef.current) {
        clearTimeout(streamingScrollTimeoutRef.current)
      }
    }
  }, [messages, isStreaming])

  // Measure input container width to match user message width
  useEffect(() => {
    const updateWidth = () => {
      // Use the unified container ref directly for accurate width measurement
      // This container represents the actual input box, not affected by attachments preview
      if (unifiedContainerRef.current) {
        const width = unifiedContainerRef.current.offsetWidth
        setInputContainerWidth(width)
      } else if (inputContainerRef.current) {
        // Fallback: use the input container width minus padding
        const containerWidth = inputContainerRef.current.offsetWidth
        const padding = 12 + 14 // left + right padding
        setInputContainerWidth(containerWidth - padding)
      }
    }
    
    // Use a small delay to ensure DOM is ready
    const timeoutId = setTimeout(updateWidth, 0)
    window.addEventListener('resize', updateWidth)
    
    // Use ResizeObserver to watch for panel width changes
    const resizeObserver = new ResizeObserver(() => {
      updateWidth()
    })
    
    if (unifiedContainerRef.current) {
      resizeObserver.observe(unifiedContainerRef.current)
    } else if (inputContainerRef.current) {
      resizeObserver.observe(inputContainerRef.current)
    }
    
    return () => {
      clearTimeout(timeoutId)
      window.removeEventListener('resize', updateWidth)
      resizeObserver.disconnect()
    }
  }, [attachments]) // Recalculate when attachments change

  // Show scrollbar when textarea content overflows
  useEffect(() => {
    const textarea = textareaRef.current
    if (!textarea) return

    const checkOverflow = () => {
      if (textarea.scrollHeight > textarea.clientHeight) {
        textarea.classList.add('show-scrollbar')
      } else {
        textarea.classList.remove('show-scrollbar')
      }
    }

    checkOverflow()
    const observer = new ResizeObserver(checkOverflow)
    observer.observe(textarea)
    
    return () => {
      observer.disconnect()
    }
  }, [input])

  // Sync overlay scroll position with textarea
  useEffect(() => {
    const textarea = textareaRef.current
    const overlay = mentionOverlayRef.current
    if (!textarea || !overlay) return

    const syncScroll = () => {
      overlay.style.transform = `translateY(-${textarea.scrollTop}px)`
    }

    textarea.addEventListener('scroll', syncScroll)
    syncScroll() // Initial sync
    
    return () => {
      textarea.removeEventListener('scroll', syncScroll)
    }
  }, [input])

  // Load messages when documentId or chatId changes
  useEffect(() => {
    if (!documentId || !chatId) {
      setMessages([])
      hasNotifiedFirstMessage.current = false
      return
    }

    const loadMessages = async () => {
      try {
        // IPC returns data directly, not wrapped in { data: ... }
        const loadedMessages = await chatApi.getChat(documentId, chatId)
        // Ensure messages is always an array
        const messages = Array.isArray(loadedMessages) ? loadedMessages : []
        setMessages(messages)
        // Initialize addedMessageIdsRef with existing message IDs
        addedMessageIdsRef.current = new Set(messages.map(msg => msg.id))
        // Reset notification flag if chat already has messages
        hasNotifiedFirstMessage.current = messages.length > 0
        
        // Always scroll to bottom when opening a chat
        // Use requestAnimationFrame to ensure DOM is fully updated before scrolling
        requestAnimationFrame(() => {
          if (messagesEndRef.current && scrollContainerRef.current) {
            // Use instant scroll (auto) for immediate positioning, then smooth if needed
            messagesEndRef.current.scrollIntoView({ behavior: 'auto' })
            // Also ensure scroll container is at bottom
            scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight
          }
        })
        // Double-check with another frame to ensure it sticks
        requestAnimationFrame(() => {
          if (messagesEndRef.current && scrollContainerRef.current) {
            messagesEndRef.current.scrollIntoView({ behavior: 'auto' })
            scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight
          }
        })
      } catch (error) {
        console.error('Failed to load chat messages:', error)
        setMessages([])
        addedMessageIdsRef.current = new Set()
        hasNotifiedFirstMessage.current = false
      }
    }

    loadMessages()
  }, [documentId, chatId])

  // Add scroll detection and edge detection to show scrollbar
  useEffect(() => {
    const container = scrollContainerRef.current
    if (!container || !documentId || !chatId) return

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

        // Save scroll position for current chat
        if (chatId) {
          scrollPositionsRef.current.set(chatId, container.scrollTop)
        }
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
  }, [documentId, chatId])

  // Track which messages have been added to chat history
  const addedMessageIdsRef = useRef<Set<string>>(new Set())

  // Helper function to save/update message with debouncing for streaming
  const saveMessage = async (message: AIChatMessage, isStreaming: boolean = false) => {
    if (!documentId || !chatId) return

    try {
      const messageId = message.id
      const isFirstTime = !addedMessageIdsRef.current.has(messageId)

      if (isStreaming) {
        if (isFirstTime) {
          // First time: add the message
          await chatApi.addMessage(documentId, chatId, message)
          addedMessageIdsRef.current.add(messageId)
        } else {
          // Subsequent updates: debounce updates during streaming (save every 500ms)
        if (updateMessageTimeoutRef.current) {
          clearTimeout(updateMessageTimeoutRef.current)
        }
        updateMessageTimeoutRef.current = setTimeout(async () => {
            try {
              await chatApi.updateMessage(documentId, chatId, messageId, message.content)
            } catch (error) {
              // If update fails (e.g., message not found), try adding it again
              console.warn('Update failed, trying to add message:', error)
              await chatApi.addMessage(documentId, chatId, message)
            }
        }, 500)
        }
      } else {
        // Save immediately if not streaming
        if (updateMessageTimeoutRef.current) {
          clearTimeout(updateMessageTimeoutRef.current)
          updateMessageTimeoutRef.current = null
        }
        
        if (isFirstTime) {
        await chatApi.addMessage(documentId, chatId, message)
          addedMessageIdsRef.current.add(messageId)
        } else {
          // Final save: update the message
          await chatApi.updateMessage(documentId, chatId, messageId, message.content)
        }
      }
    } catch (error) {
      console.error('Failed to save message:', error)
    }
  }

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (updateMessageTimeoutRef.current) {
        clearTimeout(updateMessageTimeoutRef.current)
      }
    }
  }, [])

  // Helper function to process files and add as attachments
  const processFiles = async (files: FileList | File[]): Promise<ChatAttachment[]> => {
    const newAttachments: ChatAttachment[] = []
    const fileArray = Array.from(files)

    for (const file of fileArray) {
      const fileType = file.type
      const isImage = fileType.startsWith('image/')
      const isPDF = fileType === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')

      if (!isImage && !isPDF) {
        console.warn(`Unsupported file type: ${fileType}`)
        continue
      }

      try {
        // Read file as base64
        const base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader()
          reader.onload = () => {
            const result = reader.result as string
            // Remove data URL prefix (e.g., "data:image/png;base64,")
            const base64Data = result.includes(',') ? result.split(',')[1] : result
            resolve(base64Data)
          }
          reader.onerror = reject
          reader.readAsDataURL(file)
        })

        const attachment: ChatAttachment = {
          id: `att_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          type: isImage ? 'image' : 'pdf',
          name: file.name || (isImage ? 'pasted-image.png' : 'pasted-file.pdf'),
          data: base64,
          mimeType: fileType,
        }

        newAttachments.push(attachment)
      } catch (error) {
        console.error('Failed to read file:', error)
      }
    }

    return newAttachments
  }

  // Handle file selection
  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files
    if (!files || files.length === 0) return

    const newAttachments = await processFiles(files)

    if (newAttachments.length > 0) {
      setAttachments(prev => [...prev, ...newAttachments])
    }

    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  // Handle paste event
  const handlePaste = async (event: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const clipboardData = event.clipboardData
    if (!clipboardData) return

    const items = clipboardData.items
    const files: File[] = []

    // Check for files in clipboard
    for (let i = 0; i < items.length; i++) {
      const item = items[i]
      if (item.kind === 'file') {
        const file = item.getAsFile()
        if (file) {
          files.push(file)
        }
      }
    }

    // If files found, process them as attachments
    if (files.length > 0) {
      event.preventDefault() // Prevent default paste behavior
      const newAttachments = await processFiles(files)
      if (newAttachments.length > 0) {
        setAttachments(prev => [...prev, ...newAttachments])
      }
    }
  }

  // Remove attachment
  const handleRemoveAttachment = (attachmentId: string) => {
    setAttachments(prev => prev.filter(att => att.id !== attachmentId))
  }

  // Copy code block to clipboard
  const handleCopyCode = async (code: string, blockId: string) => {
    try {
      await navigator.clipboard.writeText(code)
      setCopiedCodeBlocks(prev => new Set(prev).add(blockId))
      setTimeout(() => {
        setCopiedCodeBlocks(prev => {
          const newSet = new Set(prev)
          newSet.delete(blockId)
          return newSet
        })
      }, 2000)
    } catch (error) {
      console.error('Failed to copy code:', error)
    }
  }

  // Highlight @mentions in message content
  const highlightMentions = (text: string): React.ReactNode => {
    const mentionRegex = /@(Library|[^\s@]+)/g
    const parts: React.ReactNode[] = []
    let lastIndex = 0
    let match
    
    while ((match = mentionRegex.exec(text)) !== null) {
      // Add text before the mention
      if (match.index > lastIndex) {
        parts.push(text.slice(lastIndex, match.index))
      }
      
      const mentionName = match[1]
      const mentionStart = match.index
      let mentionEnd = match.index + match[0].length
      let mentionText = match[0]
      const isLibrary = mentionName === 'Library'
      
      // Check if this is a prefix of a document title (like "file" -> "file (2).pdf")
      let matchedDoc = libraryDocuments.find(doc => doc.title === mentionName || doc.id === mentionName)
      
      if (!matchedDoc && !isLibrary) {
        const textAfterMention = text.slice(mentionEnd)
        
        // Find documents that start with the mention name (case-insensitive)
        const potentialDocs = libraryDocuments.filter(doc => {
          const docTitle = doc.title
          return docTitle.toLowerCase().startsWith(mentionName.toLowerCase())
        })
        
        // Check if any of the following text completes a document title
        for (const doc of potentialDocs) {
          const remainingTitle = doc.title.slice(mentionName.length)
          
          // Check if the text after the mention starts with the remaining title
          if (remainingTitle && textAfterMention.startsWith(remainingTitle)) {
            matchedDoc = doc
            mentionEnd = mentionStart + 1 + doc.title.length // +1 for @
            mentionText = '@' + doc.title
            break
          }
        }
      }
      
      const isFile = !!matchedDoc || (!isLibrary && libraryDocuments.some(doc => doc.title === mentionName || doc.id === mentionName))
      
      // Add highlighted mention
      parts.push(
        <span
          key={`mention-${mentionStart}`}
          style={{
            backgroundColor: theme === 'dark' 
              ? (isLibrary ? '#2d4a5c' : isFile ? '#3d2d4a' : '#3d3d3d')
              : (isLibrary ? '#e8f0fe' : isFile ? '#f3e5f5' : '#f1f3f4'),
            color: theme === 'dark' ? '#ffffff' : textColor, // White for dark theme, regular text color for light theme
            padding: '2px 6px',
            borderRadius: '4px',
            fontWeight: 'normal', // Same weight as regular text
            fontSize: '13px'
          }}
        >
          {mentionText}
        </span>
      )
      
      lastIndex = mentionEnd
    }
    
    // Add remaining text
    if (lastIndex < text.length) {
      parts.push(text.slice(lastIndex))
    }
    
    return parts.length > 0 ? <>{parts}</> : text
  }

  // Get search status text based on @mentions in last user message
  const getSearchStatusText = (): string => {
    if (!lastUserMessageForSearch) {
      return 'Generating response...'
    }

    const mentionRegex = /@(Library|[^\s@]+)/g
    const matches = Array.from(lastUserMessageForSearch.matchAll(mentionRegex))
    
    if (matches.length === 0) {
      return 'Generating response...'
    }

    // Check for @Library mention first
    const hasLibraryMention = matches.some(match => match[1].toLowerCase() === 'library')
    if (hasLibraryMention) {
      return 'Searching Library'
    }

    // Check for file mentions
    const fileMentions = matches
      .filter(match => match[1].toLowerCase() !== 'library')
      .map(match => {
        const mentionName = match[1]
        // Try to find matching document
        const matchedDoc = libraryDocuments.find(
          doc => doc.title === mentionName || 
                 doc.id === mentionName ||
                 doc.title.toLowerCase().startsWith(mentionName.toLowerCase())
        )
        return matchedDoc ? matchedDoc.title : mentionName
      })

    if (fileMentions.length > 0) {
      // Show first file mention
      return `Searching ${fileMentions[0]}`
    }

    return 'Generating response...'
  }

  // Helper function to format error messages in a user-friendly way
  const formatErrorMessage = (error: any): string => {
    let errorMessage = error instanceof Error ? error.message : String(error)
    let errorDetails = ''
    
    // Try to parse JSON error responses
    try {
      // Check if error message contains JSON
      const jsonMatch = errorMessage.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        const errorJson = JSON.parse(jsonMatch[0])
        if (errorJson.error) {
          errorMessage = errorJson.error.message || errorMessage
          if (errorJson.error.code) {
            errorDetails = `Error code: ${errorJson.error.code}`
          }
          if (errorJson.error.status) {
            errorDetails += errorDetails ? `, Status: ${errorJson.error.status}` : `Status: ${errorJson.error.status}`
          }
        }
      }
    } catch (e) {
      // If parsing fails, use original error message
    }
    
    // Check for error in error object itself
    if (error && typeof error === 'object' && error.error) {
      if (typeof error.error === 'string') {
        errorMessage = error.error
      } else if (error.error.message) {
        errorMessage = error.error.message
        if (error.error.code) {
          errorDetails = `Error code: ${error.error.code}`
        }
      }
    }
    
    const lowerMessage = errorMessage.toLowerCase()
    
    // API key errors
    if (lowerMessage.includes('api key') || lowerMessage.includes('not configured') || lowerMessage.includes('no embedding api key')) {
      if (lowerMessage.includes('openai')) {
        return 'OpenAI API key is required. Please add your OpenAI API key in Settings > API Keys.'
      }
      if (lowerMessage.includes('google') || lowerMessage.includes('gemini')) {
        return 'Google API key is required. Please add your Google API key in Settings > API Keys.'
      }
      return 'API key is required. Please add your API key in Settings > API Keys.'
    }
    
    // Quota/billing errors (check first before rate limit, as quota is more specific)
    if (lowerMessage.includes('quota') || lowerMessage.includes('billing') || lowerMessage.includes('insufficient') || 
        lowerMessage.includes('exceeded your current quota') || lowerMessage.includes('resource_exhausted') ||
        errorMessage.includes('429') && (lowerMessage.includes('quota') || lowerMessage.includes('exceeded'))) {
      return `API quota exceeded. Your API account has reached its usage limit.${errorDetails ? ` (${errorDetails})` : ''}\n\nPlease check your API account billing or usage limits:\n• Gemini: https://ai.dev/usage?tab=rate-limit\n• OpenAI: Check your usage dashboard\n\nYou may need to upgrade your plan or wait for quota reset.`
    }
    
    // Rate limit errors (429 without quota mention)
    if (lowerMessage.includes('rate limit') || (errorMessage.includes('429') && !lowerMessage.includes('quota'))) {
      return `Rate limit exceeded. Too many requests in a short time.${errorDetails ? ` (${errorDetails})` : ''}\n\nPlease wait a moment and try again.`
    }
    
    // Network/connection errors
    if (lowerMessage.includes('network') || lowerMessage.includes('fetch') || lowerMessage.includes('econnrefused') || 
        lowerMessage.includes('failed to fetch') || lowerMessage.includes('networkerror')) {
      return 'Connection error. Please check your internet connection and try again.'
    }
    
    // Authentication errors
    if (lowerMessage.includes('401') || lowerMessage.includes('unauthorized') || lowerMessage.includes('invalid api key') ||
        lowerMessage.includes('authentication') || lowerMessage.includes('permission denied')) {
      return 'Invalid API key. Please check your API key in Settings > API Keys and ensure it\'s correct.'
    }
    
    // Model-specific errors
    if (lowerMessage.includes('model') && (lowerMessage.includes('not found') || lowerMessage.includes('unavailable') || 
        lowerMessage.includes('does not exist'))) {
      return 'Model unavailable. Please try selecting a different model from the dropdown.'
    }
    
    // Server errors (500, 503, etc.)
    if (errorMessage.includes('500') || lowerMessage.includes('internal server error') || 
        errorMessage.includes('503') || lowerMessage.includes('service unavailable')) {
      return `Server error. The AI service is temporarily unavailable.${errorDetails ? ` (${errorDetails})` : ''}\n\nPlease try again in a few moments.`
    }
    
    // Generic error - show a friendly message with original error if helpful
    const isDetailedError = errorMessage.length > 50 || errorMessage.includes('Error:') || errorMessage.includes('error:')
    if (isDetailedError && !lowerMessage.includes('unable to process')) {
      return `${errorMessage}${errorDetails ? `\n\n${errorDetails}` : ''}\n\nIf this persists, please check your API keys in Settings or try a different model.`
    }
    
    return `Unable to process your request.${errorDetails ? ` (${errorDetails})` : ''}\n\nPlease try again or check your API keys in Settings > API Keys.`
  }

  // Handle @mention detection and inline autocomplete
  const detectMention = (text: string, cursorPosition: number) => {
    const textBeforeCursor = text.slice(0, cursorPosition)
    const lastAtIndex = textBeforeCursor.lastIndexOf('@')
    
    // Check if @ exists
    if (lastAtIndex === -1) {
      setCurrentSuggestion(null)
      setShowMentionDropdown(false)
      return
    }
    
    const textAfterAt = textBeforeCursor.slice(lastAtIndex + 1)
    
    // If there's whitespace or newline immediately after @, it's not a mention
    if (textAfterAt.match(/^\s/)) {
      setCurrentSuggestion(null)
      setShowMentionDropdown(false)
      return
    }
    
    // Check if mention is already complete (has space after it)
    const mentionText = textBeforeCursor.slice(lastAtIndex + 1)
    if (mentionText.includes(' ')) {
      setCurrentSuggestion(null)
      setShowMentionDropdown(false)
      return
    }
    
    // Check if cursor is after a space that follows the mention
    if (cursorPosition > 0) {
      const charBeforeCursor = text[cursorPosition - 1]
      if (charBeforeCursor === ' ') {
        const textBeforeSpace = text.slice(0, cursorPosition - 1)
        const lastAtBeforeSpace = textBeforeSpace.lastIndexOf('@')
        if (lastAtBeforeSpace !== -1 && lastAtBeforeSpace === lastAtIndex) {
          setCurrentSuggestion(null)
          setShowMentionDropdown(false)
          return
        }
      }
    }
    
    // Check if there's already a space or end of word before @ (valid mention context)
    const charBeforeAt = lastAtIndex > 0 ? textBeforeCursor[lastAtIndex - 1] : ' '
    if (charBeforeAt !== ' ' && charBeforeAt !== '\n' && lastAtIndex > 0) {
      setCurrentSuggestion(null)
      setShowMentionDropdown(false)
      return
    }
    
    mentionStartIndexRef.current = lastAtIndex
    setMentionQuery(textAfterAt)
    
    // Get filtered mentions based on current query
    const mentions = getFilteredMentions()
    if (mentions.length > 0) {
      setShowMentionDropdown(true)
      
      // Determine the correct selected index
      // When user types, always select the first matching item to keep suggestion in sync
      let newSelectedIndex = 0
      
      // If there's no query (just @), keep current selection if valid
      if (textAfterAt.length === 0) {
        if (selectedMentionIndex < mentions.length) {
          newSelectedIndex = selectedMentionIndex
        } else {
          newSelectedIndex = 0
        }
      } else {
        // When user types, always select first match to ensure suggestion matches what they're typing
        newSelectedIndex = 0
      }
      
      // Update selected index if it changed
      if (newSelectedIndex !== selectedMentionIndex) {
        setSelectedMentionIndex(newSelectedIndex)
      }
      
      // Update inline suggestion for the selected mention
      const selectedMention = mentions[newSelectedIndex]
      const mentionText = selectedMention.type === 'library' ? '@Library'
        : `@${selectedMention.name}`
      // Calculate remaining text: everything after what user has typed
      const remainingText = mentionText.slice(textAfterAt.length + 1) // +1 for @
      setCurrentSuggestion(remainingText)
    } else {
      setShowMentionDropdown(false)
      setCurrentSuggestion(null)
    }
  }

  const getFilteredMentions = () => {
    const query = mentionQuery.toLowerCase().trim()
    const mentions: Array<{ 
      type: 'library' | 'file', 
      id?: string, 
      name: string, 
      folder?: string,
      fileType?: 'pdf' | 'docx'
    }> = []
    
    // Always include @Library option (only if query matches or is empty)
    if (!query || 'library'.includes(query)) {
      mentions.push({ type: 'library', name: 'Library' })
    }
    
    // Filter library documents: only PDF and DOCX files from current project's library folder
    // CRITICAL: libraryDocuments already filtered by projectId in loadMentionDocuments
    // This ensures we only see library files from the current project
    const libraryFiles = libraryDocuments.filter((doc: Document) => {
      // Only include files in library folder
      if (doc.folder !== 'library') return false
      
      // Double-check: only include files from current project
      if (projectId && doc.projectId !== projectId) return false
      
      // Only include PDF and DOCX files
      const fileName = doc.title.toLowerCase()
      const isPDF = fileName.endsWith('.pdf')
      const isDOCX = fileName.endsWith('.docx')
      if (!isPDF && !isDOCX) return false
      
      // Filter by query if provided
      if (query) {
        const docName = doc.title.toLowerCase()
        return docName.includes(query) || doc.id.toLowerCase().includes(query)
      }
      
      return true
    })
    
    // Sort library files to match FileExplorer order
    // Sort by order if available, otherwise by creation time (ascending)
    const sortDocuments = (docs: Document[]) => {
      return [...docs].sort((a, b) => {
        if (a.order !== undefined && b.order !== undefined) {
          return a.order - b.order
        }
        return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      })
    }
    
    const sortedLibraryFiles = sortDocuments(libraryFiles)
    
    // Add library files to mentions
    sortedLibraryFiles.forEach((doc: Document) => {
      const fileName = doc.title.toLowerCase()
      const fileType = fileName.endsWith('.pdf') ? 'pdf' : 'docx'
      mentions.push({
        type: 'file',
        id: doc.id,
        name: doc.title,
        folder: 'library',
        fileType
      })
    })
    
    return mentions
  }

  const insertMention = (mention: { type: 'library' | 'file', id?: string, name: string }) => {
    if (!textareaRef.current || mentionStartIndexRef.current === -1) return
    
    const textarea = textareaRef.current
    const currentValue = textarea.value
    const cursorPosition = textarea.selectionStart
    
    // Store the mention start position before it gets reset
    const mentionStartPos = mentionStartIndexRef.current
    
    // Find the end of the mention query (cursor position or next space)
    let mentionEnd = cursorPosition
    const textAfterAt = currentValue.slice(mentionStartPos + 1, cursorPosition)
    const spaceIndex = textAfterAt.indexOf(' ')
    if (spaceIndex !== -1) {
      mentionEnd = mentionStartPos + 1 + spaceIndex
    }
    
    // Build the mention text (ensure space after)
    const mentionText = mention.type === 'library' ? '@Library' : `@${mention.name}`
    
    // Replace the @query with the mention (always add space after)
    const newValue = 
      currentValue.slice(0, mentionStartPos) +
      mentionText + ' ' +
      currentValue.slice(mentionEnd)
    
    setInput(newValue)
    setCurrentSuggestion(null)
    setShowMentionDropdown(false)
    
    // Set cursor position after the mention and space (highlighting is now persistent via overlay)
    // Use requestAnimationFrame to ensure the DOM has updated
    requestAnimationFrame(() => {
      setTimeout(() => {
        if (textareaRef.current) {
          // Calculate cursor position: start of mention + mention text length + space (1 char)
          // This places the cursor AFTER the space
          const newCursorPos = mentionStartPos + mentionText.length + 1
          textareaRef.current.setSelectionRange(newCursorPos, newCursorPos)
          textareaRef.current.focus()
        }
      }, 0)
    })
    
    mentionStartIndexRef.current = -1
  }

  const handleStopGeneration = async () => {
    isStreamCancelledRef.current = true
    
    if (streamReaderRef.current) {
      try {
        await streamReaderRef.current.cancel()
      } catch (error) {
        console.error('Error canceling stream:', error)
      }
      streamReaderRef.current = null
    }
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
      abortControllerRef.current = null
    }
    
    // Remove the incomplete assistant message if it exists
    if (currentAssistantMessageIdRef.current) {
      setMessages(prev => {
        const filtered = prev.filter(msg => msg.id !== currentAssistantMessageIdRef.current)
        return filtered
      })
      currentAssistantMessageIdRef.current = null
    }
    
    setIsLoading(false)
    setIsStreaming(false)
    setLastUserMessageForSearch('')
  }

  const handleSend = async () => {
    // If already generating, stop the current generation
    if (isLoading) {
      await handleStopGeneration()
      return
    }

    if ((!input.trim() && attachments.length === 0) || !documentId || !chatId) return

    // Check for required API keys before sending
    const isOpenaiModel = selectedModel.startsWith('gpt-')
    const hasGoogleKey = !!googleApiKey
    const hasOpenaiKey = !!openaiApiKey
    
    if (isOpenaiModel && !hasOpenaiKey) {
      const errorMessage: AIChatMessage = {
        id: `msg_${Date.now()}`,
        role: 'assistant',
        content: 'OpenAI API key is required for GPT models. Please add your OpenAI API key in Settings > API Keys.',
        timestamp: new Date().toISOString(),
      }
      setMessages(prev => [...prev, errorMessage])
      await saveMessage(errorMessage, false)
      setShowSettingsModal(true)
      return
    }
    
    if (!isOpenaiModel && !hasGoogleKey) {
      const errorMessage: AIChatMessage = {
        id: `msg_${Date.now()}`,
        role: 'assistant',
        content: 'Google API key is required for Gemini models. Please add your Google API key in API Keys.',
        timestamp: new Date().toISOString(),
      }
      setMessages(prev => [...prev, errorMessage])
      await saveMessage(errorMessage, false)
      setShowSettingsModal(true)
      return
    }

    // Store the input value before clearing it (for onFirstMessage callback)
    const messageContent = input.trim()

    const userMessage: AIChatMessage = {
      id: `msg_${Date.now()}`,
      role: 'user',
      content: input,
      timestamp: new Date().toISOString(),
      attachments: attachments.length > 0 ? [...attachments] : undefined,
    }

    setMessages(prev => [...prev, userMessage])
    setInput('')
    setAttachments([]) // Clear attachments after sending
    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
    }
    setIsLoading(true)
    setIsStreaming(true)
    setLastUserMessageForSearch(userMessage.content)

    // Notify parent about first message for chat naming (only when message is actually being sent)
    if (!hasNotifiedFirstMessage.current && onFirstMessage && messageContent) {
      onFirstMessage(messageContent)
      hasNotifiedFirstMessage.current = true
    }

    // Save user message immediately
    await saveMessage(userMessage, false)

    try {
      // Reset cancellation flag
      isStreamCancelledRef.current = false
      
      // Create abort controller for this request
      abortControllerRef.current = new AbortController()
      
      // Pass chat history (excluding the just-added user message) for conversation continuity
      const chatHistoryForAPI = messages.filter(msg => msg.id !== userMessage.id)
      const response = await aiApi.streamChat(userMessage.content, documentContent, documentId, chatHistoryForAPI, useWebSearch, selectedModel, attachments.length > 0 ? attachments : undefined, selectedStyle, projectId)
      const reader = response.body?.getReader()
      
      // Store reader reference for cancellation
      streamReaderRef.current = reader || null
      
      const decoder = new TextDecoder()

      let assistantMessage: AIChatMessage = {
        id: `msg_${Date.now() + 1}`,
        role: 'assistant',
        content: '',
        timestamp: new Date().toISOString(),
      }

      currentAssistantMessageIdRef.current = assistantMessage.id
      setMessages(prev => [...prev, assistantMessage])

      // Scroll to bottom when assistant message starts
      setTimeout(() => {
        scrollToBottom()
      }, 100)

      // Save assistant message immediately (empty content, will be updated during streaming)
      await saveMessage(assistantMessage, true)

      if (reader) {
        try {
          while (true) {
            // Check if stream was cancelled
            if (isStreamCancelledRef.current || !streamReaderRef.current) {
              break
            }
            
            const { done, value } = await reader.read()
            if (done) break

            const chunk = decoder.decode(value)
            const lines = chunk.split('\n')

            for (const line of lines) {
              if (line.startsWith('data: ')) {
                try {
                  const data = JSON.parse(line.slice(6))
                  // Check for error in stream data
                  if (data.error) {
                    throw new Error(data.error)
                  }
                  if (data.chunk) {
                    assistantMessage.content += data.chunk
                    setMessages(prev => {
                      const updated = [...prev]
                      updated[updated.length - 1] = { ...assistantMessage }
                      return updated
                    })
                    // Update message during streaming (debounced)
                    await saveMessage(assistantMessage, true)
                  }
                } catch (e) {
                  // If it's an error object, throw it to be caught by outer catch
                  if (e instanceof Error && e.message) {
                    throw e
                  }
                  // Otherwise ignore parse errors
                }
              }
            }
          }
        } catch (readError) {
          // Stream was cancelled or error occurred
          if (streamReaderRef.current && !isStreamCancelledRef.current) {
            // Only handle error if it wasn't a cancellation
            console.error('Error reading stream:', readError)
            // Re-throw to be caught by outer catch block for proper error display
            throw readError
          }
        }
      }

      // Save final message when streaming completes (only if not cancelled)
      if (currentAssistantMessageIdRef.current && !isStreamCancelledRef.current) {
        await saveMessage(assistantMessage, false)
        currentAssistantMessageIdRef.current = null
      }
    } catch (error) {
      console.error('Chat error:', error)
      
      // Remove the empty assistant message if it exists
      setMessages(prev => {
        if (currentAssistantMessageIdRef.current) {
          return prev.filter(msg => msg.id !== currentAssistantMessageIdRef.current)
        }
        return prev
      })
      
      const friendlyError = formatErrorMessage(error)
      const errorMessage: AIChatMessage = {
        id: `msg_${Date.now() + 2}`,
        role: 'assistant',
        content: friendlyError, // formatErrorMessage already includes appropriate emoji
        timestamp: new Date().toISOString(),
      }
      setMessages(prev => [...prev, errorMessage])
      
      // Save error message
      if (documentId && chatId) {
        await saveMessage(errorMessage, false)
      }
      
      // If it's an API key error or quota error, open settings modal
      const errorMsg = error instanceof Error ? error.message : String(error)
      const lowerErrorMsg = errorMsg.toLowerCase()
      if (lowerErrorMsg.includes('api key') || lowerErrorMsg.includes('not configured') || 
          lowerErrorMsg.includes('quota') || lowerErrorMsg.includes('429') || 
          lowerErrorMsg.includes('billing') || lowerErrorMsg.includes('no embedding api key')) {
        setTimeout(() => setShowSettingsModal(true), 500)
      }
    } finally {
      setIsLoading(false)
      setIsStreaming(false)
      setLastUserMessageForSearch('')
      currentAssistantMessageIdRef.current = null
      streamReaderRef.current = null
      abortControllerRef.current = null
      isStreamCancelledRef.current = false
    }
  }

  return (
    <>
      <style>{`
        @keyframes thinkingPulse {
          0%, 60%, 100% {
            opacity: 0.3;
            transform: scale(0.8);
          }
          30% {
            opacity: 1;
            transform: scale(1);
          }
        }
      `}</style>
      <div style={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: bgColor
      }}>
        <div 
          ref={scrollContainerRef}
          className={`scrollable-container ${theme === 'dark' ? 'dark-theme' : ''}`}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: 0,
            display: 'flex',
            flexDirection: 'column',
            backgroundColor: brighterBg,
            userSelect: 'text',
            WebkitUserSelect: 'text',
            MozUserSelect: 'text',
            msUserSelect: 'text'
          }}>
        {messages.map((message) => (
          <div
            key={message.id}
            style={{
              width: '100%',
              display: 'flex',
              flexDirection: 'column',
              padding: message.role === 'assistant' ? '16px 16px' : '8px 16px',
              backgroundColor: brighterBg,
            }}
          >
            {message.role === 'user' && (
              <div
                style={{
                  marginLeft: 'auto',
                  width: inputContainerWidth ? `${inputContainerWidth}px` : '92%',
                  maxWidth: inputContainerWidth ? `${inputContainerWidth}px` : '92%',
                  padding: '8px 12px',
                  borderRadius: '8px',
                  backgroundColor: userMessageBg,
                  border: `1px solid ${theme === 'dark' ? '#313131' : '#dadce0'}`,
                  color: textColor,
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                  fontSize: '13px',
                  lineHeight: '1.6',
                  fontFamily: '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Noto Sans SC", "Helvetica Neue", Arial, sans-serif',
                  userSelect: 'text',
                  WebkitUserSelect: 'text',
                  MozUserSelect: 'text',
                  msUserSelect: 'text',
                  cursor: 'text'
                }}
              >
                {highlightMentions(message.content)}
                {message.attachments && message.attachments.length > 0 && (
                  <div style={{
                    marginTop: '8px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '8px'
                  }}>
                    {message.attachments.map((att) => (
                      <div key={att.id} style={{
                        borderRadius: '6px',
                        overflow: 'hidden',
                        border: `1px solid ${theme === 'dark' ? '#313131' : '#dadce0'}`,
                        width: '60px',
                        height: '60px',
                        flexShrink: 0
                      }}>
                        {att.type === 'image' ? (
                          <img 
                            src={`data:${att.mimeType || 'image/png'};base64,${att.data}`}
                            alt={att.name}
                            style={{
                              width: '100%',
                              height: '100%',
                              display: 'block',
                              objectFit: 'cover'
                            }}
                          />
                        ) : (
                          <div style={{
                            padding: '4px',
                            backgroundColor: theme === 'dark' ? '#2d2d2d' : '#f5f5f5',
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            justifyContent: 'center',
                            height: '100%',
                            width: '100%'
                          }}>
                            <PictureAsPdfIcon style={{ fontSize: '20px', color: theme === 'dark' ? '#d6d6d6' : '#202124', marginBottom: '2px' }} />
                            <span style={{ 
                              fontSize: '8px', 
                              color: textColor,
                              textAlign: 'center',
                              wordBreak: 'break-word',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              display: '-webkit-box',
                              WebkitLineClamp: 2,
                              WebkitBoxOrient: 'vertical'
                            }}>{att.name}</span>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
            {message.role === 'assistant' && (
              <div
                style={{
                  width: '100%',
                  color: textColor,
                  fontSize: '14px',
                  lineHeight: '1.7',
                  fontFamily: '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Noto Sans SC", "Helvetica Neue", Arial, sans-serif',
                  userSelect: 'text',
                  WebkitUserSelect: 'text',
                  MozUserSelect: 'text',
                  msUserSelect: 'text',
                  cursor: 'text'
                }}
              >
                {(() => {
                  const contentLower = message.content.toLowerCase()
                  const isError = contentLower.includes('api quota exceeded') ||
                    contentLower.includes('rate limit exceeded') ||
                    contentLower.includes('connection error') ||
                    contentLower.includes('invalid api key') ||
                    contentLower.includes('api key is required') ||
                    contentLower.includes('model unavailable') ||
                    contentLower.includes('server error') ||
                    contentLower.includes('unable to process') ||
                    contentLower.includes('error code:') ||
                    contentLower.includes('status:')
                  return isError
                })() ? (
                  <div
                    style={{
                      padding: '14px 18px',
                      backgroundColor: theme === 'dark' ? '#3a1f1f' : '#fce8e6',
                      borderRadius: '8px',
                      border: `1px solid ${theme === 'dark' ? '#5a2f2f' : '#f28b82'}`,
                      color: theme === 'dark' ? '#ff6b6b' : '#c5221f',
                      fontSize: '14px',
                      lineHeight: '1.7',
                      fontWeight: 400,
                      boxShadow: theme === 'dark' 
                        ? '0 2px 8px rgba(255, 107, 107, 0.15)' 
                        : '0 2px 8px rgba(197, 34, 31, 0.1)',
                    }}
                  >
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm]}
                      components={{
                        p: ({node, ...props}) => <p style={{ 
                          marginBottom: '10px', 
                          marginTop: 0, 
                          lineHeight: '1.7', 
                          color: 'inherit' 
                        }} {...props} />,
                        a: ({node, ...props}: any) => <a 
                          style={{ 
                            color: theme === 'dark' ? '#4a9eff' : '#1a73e8',
                            textDecoration: 'underline',
                            fontWeight: 500
                          }} 
                          {...props} 
                          target="_blank" 
                          rel="noopener noreferrer"
                        />,
                        ul: ({node, ...props}) => <ul style={{ 
                          marginTop: '8px', 
                          marginBottom: '8px', 
                          paddingLeft: '20px' 
                        }} {...props} />,
                        li: ({node, ...props}) => <li style={{ 
                          marginBottom: '6px',
                          lineHeight: '1.6'
                        }} {...props} />,
                        strong: ({node, ...props}) => <strong style={{ 
                          fontWeight: 600,
                          color: 'inherit'
                        }} {...props} />,
                      }}
                    >
                      {message.content}
                    </ReactMarkdown>
                  </div>
                ) : (
                  <ReactMarkdown
                  remarkPlugins={[remarkGfm, remarkMath]}
                  rehypePlugins={[rehypeKatex]}
                  components={{
                    // Headers
                    h1: ({node, ...props}) => <h1 style={{ 
                      fontSize: '26px', 
                      fontWeight: 700, 
                      marginTop: '28px', 
                      marginBottom: '16px', 
                      color: textColor, 
                      lineHeight: '1.3',
                      letterSpacing: '-0.02em'
                    }} {...props} />,
                    h2: ({node, ...props}) => <h2 style={{ 
                      fontSize: '22px', 
                      fontWeight: 600, 
                      marginTop: '24px', 
                      marginBottom: '12px', 
                      color: textColor, 
                      lineHeight: '1.3',
                      letterSpacing: '-0.01em'
                    }} {...props} />,
                    h3: ({node, ...props}) => <h3 style={{ 
                      fontSize: '19px', 
                      fontWeight: 600, 
                      marginTop: '20px', 
                      marginBottom: '10px', 
                      color: textColor, 
                      lineHeight: '1.3'
                    }} {...props} />,
                    h4: ({node, ...props}) => <h4 style={{ 
                      fontSize: '17px', 
                      fontWeight: 600, 
                      marginTop: '18px', 
                      marginBottom: '10px', 
                      color: textColor, 
                      lineHeight: '1.3'
                    }} {...props} />,
                    h5: ({node, ...props}) => <h5 style={{ 
                      fontSize: '16px', 
                      fontWeight: 600, 
                      marginTop: '16px', 
                      marginBottom: '8px', 
                      color: textColor, 
                      lineHeight: '1.3'
                    }} {...props} />,
                    h6: ({node, ...props}) => <h6 style={{ 
                      fontSize: '15px', 
                      fontWeight: 600, 
                      marginTop: '14px', 
                      marginBottom: '8px', 
                      color: textColor, 
                      lineHeight: '1.3'
                    }} {...props} />,
                    // Paragraphs
                    p: ({node, ...props}) => <p style={{ 
                      marginBottom: '14px', 
                      marginTop: 0, 
                      lineHeight: '1.7', 
                      color: textColor 
                    }} {...props} />,
                    // Code blocks - handle inline code
                    code: ({node, inline, className, children, ...props}: any) => {
                      if (inline) {
                        return <code style={{ 
                          backgroundColor: theme === 'dark' ? '#2d2d2d' : '#f1f3f4', 
                          padding: '3px 6px', 
                          borderRadius: '4px', 
                          fontSize: '13px',
                          fontFamily: '"SF Mono", Monaco, "Cascadia Code", "Roboto Mono", Consolas, "Courier New", monospace',
                          color: theme === 'dark' ? '#ce9178' : '#c5221f',
                          fontWeight: 500
                        }} {...props}>{children}</code>
                      }
                      // For code blocks, return the code element as-is (will be wrapped in pre)
                      return <code className={className}>{children}</code>
                    },
                    // Pre component handles code blocks
                    pre: ({children}: any) => {
                      // Extract code from children (which is a code element)
                      const codeProps = (children as any)?.props || {}
                      const codeElement = codeProps.children
                      const className = codeProps.className || ''
                      const match = /language-(\w+)/.exec(className || '')
                      const language = match ? match[1] : ''
                      const codeString = String(codeElement || '').replace(/\n$/, '')
                      // Create a stable ID based on message ID and code content hash
                      const codeHash = codeString.split('').reduce((acc, char) => {
                        const hash = ((acc << 5) - acc) + char.charCodeAt(0)
                        return hash & hash
                      }, 0)
                      const blockId = `${message.id}-${codeHash}-${codeString.length}`
                      const isCopied = copiedCodeBlocks.has(blockId)
                      
                      return (
                        <div style={{
                          position: 'relative',
                          marginTop: '16px',
                          marginBottom: '16px'
                        }}>
                          <div style={{
                            position: 'relative',
                            backgroundColor: theme === 'dark' ? '#000000' : '#f8f9fa',
                            borderRadius: '8px',
                            overflow: 'hidden'
                          }}>
                            {/* Language name overlay - top left */}
                            {language && (
                              <div style={{
                                position: 'absolute',
                                top: '8px',
                                left: '12px',
                                zIndex: 2,
                                fontSize: '11px',
                                color: theme === 'dark' ? '#8e8e93' : '#6e6e73',
                                fontWeight: 500,
                                textTransform: 'uppercase',
                                letterSpacing: '0.5px',
                                pointerEvents: 'none'
                              }}>
                                {language}
                              </div>
                            )}
                            {/* Copy button overlay - top right */}
                            <button
                              onClick={() => handleCopyCode(codeString, blockId)}
                              style={{
                                position: 'absolute',
                                top: '8px',
                                right: '14px',
                                zIndex: 2,
                                display: 'flex',
                                alignItems: 'center',
                                gap: '4px',
                                padding: 0,
                                backgroundColor: 'transparent',
                                border: 'none',
                                color: theme === 'dark' ? '#d1d1d6' : secondaryTextColor,
                                cursor: 'pointer',
                                fontSize: '12px',
                                fontFamily: 'inherit',
                                transition: 'opacity 0.2s'
                              }}
                              onMouseEnter={(e) => {
                                e.currentTarget.style.opacity = '0.7'
                              }}
                              onMouseLeave={(e) => {
                                e.currentTarget.style.opacity = '1'
                              }}
                            >
                              {isCopied ? (
                                <>
                                  <CheckIcon style={{ fontSize: '14px' }} />
                                  <span>Copied</span>
                                </>
                              ) : (
                                <>
                                  <ContentCopyIcon style={{ fontSize: '14px' }} />
                                  <span>Copy</span>
                                </>
                              )}
                            </button>
                            {/* Code content */}
                            <SyntaxHighlighter
                              language={language || 'text'}
                              style={theme === 'dark' ? vscDarkPlus : vs}
                              customStyle={{
                                margin: 0,
                                padding: '16px',
                                paddingTop: language ? '40px' : '16px',
                                fontSize: '13px',
                                lineHeight: '1.5',
                                fontFamily: '"SF Mono", Monaco, "Cascadia Code", "Roboto Mono", Consolas, "Courier New", monospace',
                                backgroundColor: theme === 'dark' ? '#000000' : '#f8f9fa',
                                borderRadius: '8px'
                              }}
                              PreTag="div"
                            >
                              {codeString}
                            </SyntaxHighlighter>
                          </div>
                        </div>
                      )
                    },
                    // Lists
                    ul: ({node, ...props}) => <ul style={{ 
                      marginBottom: '14px', 
                      paddingLeft: '28px', 
                      marginTop: '8px', 
                      listStyleType: 'disc',
                      color: textColor,
                      lineHeight: '1.7'
                    }} {...props} />,
                    ol: ({node, ...props}) => <ol style={{ 
                      marginBottom: '14px', 
                      paddingLeft: '28px', 
                      marginTop: '8px', 
                      color: textColor,
                      lineHeight: '1.7'
                    }} {...props} />,
                    li: ({node, ...props}) => <li style={{ 
                      marginBottom: '8px', 
                      lineHeight: '1.7', 
                      color: textColor,
                      paddingLeft: '4px'
                    }} {...props} />,
                    // Links
                    a: ({node, ...props}: any) => <a 
                      style={{ 
                        color: theme === 'dark' ? '#4a9eff' : '#1a73e8', 
                        textDecoration: 'none',
                        borderBottom: `1px solid ${theme === 'dark' ? 'rgba(74, 158, 255, 0.3)' : 'rgba(26, 115, 232, 0.3)'}`,
                        transition: 'all 0.2s'
                      }} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      onMouseEnter={(e) => {
                        e.currentTarget.style.borderBottomColor = theme === 'dark' ? '#4a9eff' : '#1a73e8'
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.borderBottomColor = theme === 'dark' ? 'rgba(74, 158, 255, 0.3)' : 'rgba(26, 115, 232, 0.3)'
                      }}
                      {...props} 
                    />,
                    // Blockquotes
                    blockquote: ({node, ...props}) => <blockquote style={{
                      borderLeft: `4px solid ${theme === 'dark' ? '#4a9eff' : '#1a73e8'}`,
                      paddingLeft: '20px',
                      paddingRight: '16px',
                      paddingTop: '8px',
                      paddingBottom: '8px',
                      marginLeft: 0,
                      marginRight: 0,
                      marginTop: '16px',
                      marginBottom: '16px',
                      backgroundColor: theme === 'dark' ? 'rgba(74, 158, 255, 0.05)' : 'rgba(26, 115, 232, 0.05)',
                      color: textColor,
                      fontStyle: 'normal',
                      borderRadius: '0 6px 6px 0'
                    }} {...props} />,
                    // Horizontal rule
                    hr: ({node, ...props}) => <hr style={{ 
                      border: 'none', 
                      borderTop: `1px solid ${theme === 'dark' ? '#3e3e3e' : '#e0e0e0'}`, 
                      margin: '24px 0' 
                    }} {...props} />,
                    // Tables
                    table: ({node, ...props}) => <div style={{ 
                      overflowX: 'auto', 
                      marginBottom: '16px', 
                      marginTop: '12px',
                      borderRadius: '8px',
                      border: `1px solid ${theme === 'dark' ? '#3e3e3e' : '#e0e0e0'}`
                    }}>
                      <table style={{ 
                        borderCollapse: 'collapse', 
                        width: '100%',
                        fontSize: '14px'
                      }} {...props} />
                    </div>,
                    thead: ({node, ...props}) => <thead style={{ 
                      backgroundColor: theme === 'dark' ? '#252525' : '#f8f9fa' 
                    }} {...props} />,
                    tbody: ({node, ...props}) => <tbody {...props} />,
                    th: ({node, ...props}) => <th style={{ 
                      border: `1px solid ${theme === 'dark' ? '#3e3e3e' : '#e0e0e0'}`, 
                      padding: '12px 16px', 
                      textAlign: 'left',
                      fontWeight: 600,
                      fontSize: '14px',
                      color: textColor,
                      backgroundColor: theme === 'dark' ? '#252525' : '#f8f9fa'
                    }} {...props} />,
                    td: ({node, ...props}) => <td style={{ 
                      border: `1px solid ${theme === 'dark' ? '#3e3e3e' : '#e0e0e0'}`, 
                      padding: '12px 16px',
                      fontSize: '14px',
                      color: textColor
                    }} {...props} />,
                    // Strong and emphasis
                    strong: ({node, ...props}) => <strong style={{ 
                      fontWeight: 600,
                      color: textColor
                    }} {...props} />,
                    em: ({node, ...props}) => <em style={{ 
                      fontStyle: 'italic',
                      color: textColor
                    }} {...props} />,
                  }}
                >
                  {message.content}
                </ReactMarkdown>
                )}
              </div>
            )}
          </div>
        ))}
        {isLoading && (
          <div style={{
            width: '100%',
            padding: '0px 16px 16px 16px',
            marginTop: '-8px',
            color: secondaryTextColor,
            fontSize: '13px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}>
            <div style={{
              display: 'flex',
              gap: '4px',
              alignItems: 'center'
            }}>
              <div style={{
                width: '6px',
                height: '6px',
                borderRadius: '50%',
                backgroundColor: theme === 'dark' ? '#666' : '#999',
                animation: 'thinkingPulse 1.4s ease-in-out infinite',
                animationDelay: '0s'
              }} />
              <div style={{
                width: '6px',
                height: '6px',
                borderRadius: '50%',
                backgroundColor: theme === 'dark' ? '#666' : '#999',
                animation: 'thinkingPulse 1.4s ease-in-out infinite',
                animationDelay: '0.2s'
              }} />
              <div style={{
                width: '6px',
                height: '6px',
                borderRadius: '50%',
                backgroundColor: theme === 'dark' ? '#666' : '#999',
                animation: 'thinkingPulse 1.4s ease-in-out infinite',
                animationDelay: '0.4s'
              }} />
            </div>
            <span style={{
              color: textColor,
              fontWeight: 400
            }}>{getSearchStatusText()}</span>
            <style>{`
              @keyframes pulse {
                0%, 60%, 100% {
                  opacity: 0.3;
                  transform: scale(0.8);
                }
                30% {
                  opacity: 1;
                  transform: scale(1);
                }
              }
            `}</style>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>
      
      {/* Input Container - Unified Container */}
      <div 
        ref={inputContainerRef}
        style={{
          padding: '6px 14px 12px 14px',
          backgroundColor: brighterBg
        }}>
        {/* Attachments Preview */}
        {attachments.length > 0 && (
          <div style={{
            marginBottom: '8px',
            display: 'flex',
            flexWrap: 'wrap',
            gap: '8px'
          }}>
            {attachments.map((att) => (
              <div
                key={att.id}
                style={{
                  position: 'relative',
                  borderRadius: '6px',
                  overflow: 'hidden',
                  border: `1px solid ${borderColor}`,
                  backgroundColor: theme === 'dark' ? '#1d1d1d' : '#f8f8f8',
                  width: '60px',
                  height: '60px',
                  flexShrink: 0
                }}
              >
                {att.type === 'image' ? (
                  <img
                    src={`data:${att.mimeType || 'image/png'};base64,${att.data}`}
                    alt={att.name}
                    style={{
                      width: '100%',
                      height: '100%',
                      objectFit: 'cover',
                      display: 'block'
                    }}
                  />
                ) : (
                  <div style={{
                    padding: '4px',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    height: '100%',
                    width: '100%'
                  }}>
                    <PictureAsPdfIcon style={{ fontSize: '20px', color: theme === 'dark' ? '#d6d6d6' : '#202124', marginBottom: '2px' }} />
                    <span style={{
                      fontSize: '8px',
                      color: textColor,
                      textAlign: 'center',
                      wordBreak: 'break-word',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      display: '-webkit-box',
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: 'vertical'
                    }}>
                      {att.name}
                    </span>
                  </div>
                )}
                <button
                  onClick={() => handleRemoveAttachment(att.id)}
                  style={{
                    position: 'absolute',
                    top: '4px',
                    right: '4px',
                    padding: '2px',
                    border: 'none',
                    borderRadius: '50%',
                    backgroundColor: theme === 'dark' ? 'rgba(0, 0, 0, 0.7)' : 'rgba(255, 255, 255, 0.9)',
                    color: textColor,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: '20px',
                    height: '20px',
                    transition: 'background-color 0.15s'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = theme === 'dark' ? 'rgba(0, 0, 0, 0.9)' : 'rgba(255, 255, 255, 1)'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = theme === 'dark' ? 'rgba(0, 0, 0, 0.7)' : 'rgba(255, 255, 255, 0.9)'
                  }}
                >
                  <CloseIcon style={{ fontSize: '14px' }} />
                </button>
              </div>
            ))}
          </div>
        )}
        
        {/* Unified Container - Text input and buttons together */}
        <div 
          ref={unifiedContainerRef}
          style={{
            padding: '4px 6px',
            backgroundColor: inputBg,
            borderRadius: '8px',
            border: `1px solid ${isInputFocused ? (theme === 'dark' ? '#3e3e42' : '#bdc1c6') : borderColor}`,
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
            transition: 'border-color 0.2s',
            position: 'relative'
          }}>
          {/* Hidden file input */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,.pdf"
            multiple
            onChange={handleFileSelect}
            style={{ display: 'none' }}
          />
          

              {/* Text Input Section - On Top */}
              <div style={{ position: 'relative', width: '100%' }}>
              <textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => {
                  setInput(e.target.value)
                  const cursorPosition = e.target.selectionStart
                  detectMention(e.target.value, cursorPosition)
                }}
                onFocus={() => {
                  setIsInputFocused(true)
                  if (textareaRef.current) {
                    const cursorPosition = textareaRef.current.selectionStart
                    detectMention(textareaRef.current.value, cursorPosition)
                  }
                }}
                onBlur={(e) => {
                  // Don't hide dropdown if clicking on it
                  if (mentionDropdownRef.current?.contains(e.relatedTarget as Node)) {
                    return
                  }
                  setIsInputFocused(false)
                  setCurrentSuggestion(null)
                  setShowMentionDropdown(false)
                }}
                onPaste={handlePaste}
                onKeyDown={(e) => {
                  // Handle mention autocomplete navigation
                  if (showMentionDropdown || currentSuggestion) {
                    const mentions = getFilteredMentions()
                    
                    if (e.key === 'Tab' || (e.key === 'Enter' && !e.shiftKey && showMentionDropdown)) {
                      e.preventDefault()
                      const selectedMention = mentions[selectedMentionIndex] || mentions[0]
                      if (selectedMention) {
                        insertMention(selectedMention)
                      }
                      return
                    }
                    
                    if (e.key === 'ArrowDown') {
                      e.preventDefault()
                      const newIndex = selectedMentionIndex < mentions.length - 1 ? selectedMentionIndex + 1 : 0
                      setSelectedMentionIndex(newIndex)
                      const selectedMention = mentions[newIndex]
                      if (selectedMention) {
                        const mentionText = selectedMention.type === 'library' ? '@Library'
                          : `@${selectedMention.name}`
                        const textAfterAt = textareaRef.current?.value.slice(mentionStartIndexRef.current + 1, textareaRef.current?.selectionStart || 0) || ''
                        const remainingText = mentionText.slice(textAfterAt.length + 1)
                        setCurrentSuggestion(remainingText)
                      }
                      return
                    }
                    
                    if (e.key === 'ArrowUp') {
                      e.preventDefault()
                      const newIndex = selectedMentionIndex > 0 ? selectedMentionIndex - 1 : mentions.length - 1
                      setSelectedMentionIndex(newIndex)
                      const selectedMention = mentions[newIndex]
                      if (selectedMention) {
                        const mentionText = selectedMention.type === 'library' ? '@Library'
                          : `@${selectedMention.name}`
                        const textAfterAt = textareaRef.current?.value.slice(mentionStartIndexRef.current + 1, textareaRef.current?.selectionStart || 0) || ''
                        const remainingText = mentionText.slice(textAfterAt.length + 1)
                        setCurrentSuggestion(remainingText)
                      }
                      return
                    }
                    
                    if (e.key === 'Escape') {
                      e.preventDefault()
                      setCurrentSuggestion(null)
                      setShowMentionDropdown(false)
                      return
                    }
                  }
                  
                  // Handle Backspace to delete entire mention at once
                  if (e.key === 'Backspace' && textareaRef.current) {
                    const cursorPosition = textareaRef.current.selectionStart
                    const text = textareaRef.current.value
                    
                    // Find if cursor is within a mention
                    const mentionRegex = /@(Library|[^\s@]+)/g
                    let match
                    mentionRegex.lastIndex = 0
                    
                    while ((match = mentionRegex.exec(text)) !== null) {
                      const mentionName = match[1]
                      const mentionStart = match.index
                      let mentionEnd = match.index + match[0].length
                      
                      // Check if this is a prefix of a document title (like "file" -> "file (2).pdf")
                      if (mentionName !== 'Library') {
                        const textAfterMention = text.slice(mentionEnd)
                        
                        // Find documents that start with the mention name (case-insensitive)
                        const potentialDocs = libraryDocuments.filter(doc => {
                          const docTitle = doc.title
                          return docTitle.toLowerCase().startsWith(mentionName.toLowerCase())
                        })
                        
                        // Check if any of the following text completes a document title
                        for (const doc of potentialDocs) {
                          const remainingTitle = doc.title.slice(mentionName.length)
                          
                          // Check if the text after the mention starts with the remaining title
                          if (remainingTitle && textAfterMention.startsWith(remainingTitle)) {
                            mentionEnd = mentionStart + 1 + doc.title.length // +1 for @
                            break
                          }
                        }
                      }
                      
                      // Check if cursor is at the start, end, or within the mention
                      // Also check if cursor is right after the mention (to delete it)
                      if (cursorPosition >= mentionStart && cursorPosition <= mentionEnd + 1) {
                        e.preventDefault()
                        
                        // Check if there's a space after the mention and include it in deletion
                        let deleteEnd = mentionEnd
                        if (text[mentionEnd] === ' ') {
                          deleteEnd = mentionEnd + 1
                        }
                        
                        // Delete the entire mention (including @ symbol, full name, and trailing space if present)
                        const newValue = text.slice(0, mentionStart) + text.slice(deleteEnd)
                        setInput(newValue)
                        
                        // Set cursor position where the mention was
                        setTimeout(() => {
                          if (textareaRef.current) {
                            textareaRef.current.setSelectionRange(mentionStart, mentionStart)
                            textareaRef.current.focus()
                          }
                        }, 0)
                        return
                      }
                    }
                  }
                  
                  if (e.key === 'Enter' && !e.shiftKey && !showMentionDropdown) {
                    e.preventDefault()
                    handleSend()
                  }
                }}
                placeholder="Type your message..."
                disabled={isLoading}
                rows={1}
                className={`scrollable-container ${theme === 'dark' ? 'dark-theme' : ''}`}
                style={{
                  width: '100%',
                  padding: '4px 6px',
                  border: 'none',
                  backgroundColor: 'transparent',
                  fontSize: '13px',
                  outline: 'none',
                  color: textColor, // Keep text visible for proper cursor alignment
                  resize: 'none',
                  overflowY: 'hidden',
                  overflowX: 'hidden',
                  fontFamily: '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Noto Sans SC", "Helvetica Neue", Arial, sans-serif',
                  lineHeight: '1.6',
                  minHeight: '24px',
                  maxHeight: '200px',
                  caretColor: textColor // Keep caret visible
                }}
                onInput={(e) => {
                  const target = e.target as HTMLTextAreaElement
                  target.style.height = 'auto'
                  const scrollHeight = target.scrollHeight
                  const newHeight = Math.min(scrollHeight, 200)
                  target.style.height = `${newHeight}px`
                  // Only show scrollbar when content exceeds maxHeight
                  if (scrollHeight > 200) {
                    target.style.overflowY = 'auto'
                  } else {
                    target.style.overflowY = 'hidden'
                  }
                }}
              />
          
          {/* Persistent Mention Highlighting Overlay - Backgrounds only */}
          {input && (() => {
            const mentionRegex = /@(Library|[^\s@]+)/g
            const highlights: Array<{ start: number, end: number, text: string, isLibrary: boolean, isFile: boolean }> = []
            let match
            
            mentionRegex.lastIndex = 0
            while ((match = mentionRegex.exec(input)) !== null) {
              const mentionName = match[1]
              const isLibrary = mentionName === 'Library'
              
              // Check for exact match first
              let matchedDoc = libraryDocuments.find(doc => doc.title === mentionName || doc.id === mentionName)
              let highlightEnd = match.index + match[0].length
              let highlightText = match[0]
              
              // If no exact match, check if this is a prefix of any document title
              // and if the following text matches the rest of the document name
              if (!matchedDoc && !isLibrary) {
                const mentionStart = match.index
                const textAfterMention = input.slice(highlightEnd)
                
                // Find documents that start with the mention name (case-insensitive)
                const potentialDocs = libraryDocuments.filter(doc => {
                  const docTitle = doc.title
                  return docTitle.toLowerCase().startsWith(mentionName.toLowerCase())
                })
                
                // Check if any of the following text completes a document title
                for (const doc of potentialDocs) {
                  const remainingTitle = doc.title.slice(mentionName.length)
                  
                  // Check if the text after the mention starts with the remaining title
                  if (remainingTitle && textAfterMention.startsWith(remainingTitle)) {
                    matchedDoc = doc
                    highlightEnd = mentionStart + 1 + doc.title.length // +1 for @
                    highlightText = '@' + doc.title
                    break
                  }
                }
              }
              
              const isFile = !!matchedDoc || (!isLibrary && libraryDocuments.some(doc => doc.title === mentionName || doc.id === mentionName))
              
              highlights.push({
                start: match.index,
                end: highlightEnd,
                text: highlightText,
                isLibrary,
                isFile
              })
            }
            
            if (highlights.length === 0) return null
            
            return (
              <div
                ref={mentionOverlayRef}
                style={{
                  position: 'absolute',
                  pointerEvents: 'none',
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  padding: '4px 6px',
                  fontSize: '13px',
                  fontFamily: '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Noto Sans SC", "Helvetica Neue", Arial, sans-serif',
                  lineHeight: '1.6',
                  whiteSpace: 'pre-wrap',
                  wordWrap: 'break-word',
                  overflowY: 'hidden',
                  overflowX: 'hidden',
                  zIndex: 1,
                  color: 'transparent' // Make all text transparent
                }}
              >
                {/* Render text with highlights matching textarea layout */}
                {(() => {
                  const parts: React.ReactNode[] = []
                  let lastIndex = 0
                  
                  highlights.forEach((highlight) => {
                    // Add text before highlight
                    if (highlight.start > lastIndex) {
                      parts.push(input.slice(lastIndex, highlight.start))
                    }
                    
                    // Add highlighted mention (no horizontal padding to avoid covering next character)
                    parts.push(
                      <span
                        key={`hl-${highlight.start}`}
                        style={{
                          backgroundColor: theme === 'dark' 
                            ? (highlight.isLibrary ? '#2d4a5c' : highlight.isFile ? '#3d2d4a' : '#3d3d3d')
                            : (highlight.isLibrary ? '#e8f0fe' : highlight.isFile ? '#f3e5f5' : '#f1f3f4'),
                          color: theme === 'dark' ? '#ffffff' : textColor, // White for dark theme, regular text color for light theme
                          borderRadius: '4px',
                          fontWeight: 'normal', // Same weight as regular text
                          padding: '2px 0', // Only vertical padding to avoid covering adjacent characters
                          display: 'inline',
                          boxDecorationBreak: 'clone' as any
                        }}
                      >
                        {highlight.text}
                      </span>
                    )
                    
                    lastIndex = highlight.end
                  })
                  
                  // Add remaining text
                  if (lastIndex < input.length) {
                    parts.push(input.slice(lastIndex))
                  }
                  
                  return parts.length > 0 ? <>{parts}</> : input
                })()}
              </div>
            )
          })()}
          
          {/* Inline Autocomplete Suggestion */}
          {currentSuggestion && textareaRef.current && (
            <div
              style={{
                position: 'absolute',
                pointerEvents: 'none',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                padding: '4px 6px',
                fontSize: '13px',
                fontFamily: '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Noto Sans SC", "Helvetica Neue", Arial, sans-serif',
                lineHeight: '1.6',
                color: 'transparent',
                whiteSpace: 'pre-wrap',
                wordWrap: 'break-word',
                overflow: 'hidden',
                zIndex: 2
              }}
            >
              {input}
              <span style={{
                color: theme === 'dark' ? 'rgba(214, 214, 221, 0.4)' : 'rgba(95, 99, 104, 0.4)'
              }}>
                {currentSuggestion}
              </span>
            </div>
          )}
          
          {/* Mention Autocomplete Dropdown */}
          {showMentionDropdown && textareaRef.current && (() => {
            const mentions = getFilteredMentions()
            if (mentions.length === 0) return null
            
            // Calculate dropdown position - show ABOVE the @ symbol
            const textarea = textareaRef.current
            const textareaRect = textarea.getBoundingClientRect()
            const containerRect = unifiedContainerRef.current?.getBoundingClientRect()
            
            // Estimate cursor position
            const textBeforeCursor = textarea.value.slice(0, textarea.selectionStart)
            const lines = textBeforeCursor.split('\n')
            const currentLine = lines.length - 1
            const lineStart = textBeforeCursor.lastIndexOf('\n') + 1
            
            // Create a temporary span to measure text width
            const tempSpan = document.createElement('span')
            tempSpan.style.visibility = 'hidden'
            tempSpan.style.position = 'absolute'
            tempSpan.style.fontSize = '13px'
            tempSpan.style.fontFamily = '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Noto Sans SC", "Helvetica Neue", Arial, sans-serif'
            tempSpan.style.whiteSpace = 'pre'
            tempSpan.textContent = textBeforeCursor.slice(lineStart, textBeforeCursor.length)
            document.body.appendChild(tempSpan)
            const textWidth = tempSpan.offsetWidth
            document.body.removeChild(tempSpan)
            
            // Calculate line height (approximate)
            const lineHeight = 20.8 // Same as used in calculation
            
            // Position dropdown ABOVE the cursor line
            // Calculate cursor line bottom position relative to container
            const cursorLineBottom = containerRect 
              ? (textareaRect.top - containerRect.top + (currentLine + 1) * lineHeight)
              : 0
            
            // Position dropdown above the cursor line using bottom positioning
            // bottom = distance from container bottom to cursor line bottom
            const dropdownBottom = containerRect 
              ? (containerRect.height - cursorLineBottom)
              : 0
            const dropdownLeft = containerRect ? (textareaRect.left - containerRect.left + textWidth + 6) : 0
            
            // Match model dropdown design
            const dropdownBg = theme === 'dark' ? '#1e1e1e' : '#ffffff'
            const dropdownBorder = theme === 'dark' ? '#333' : '#e0e0e0'
            const dropdownShadow = theme === 'dark'
              ? '0 -4px 16px rgba(0, 0, 0, 0.5), 0 -2px 4px rgba(0, 0, 0, 0.3)'
              : '0 -4px 16px rgba(0, 0, 0, 0.2), 0 -2px 4px rgba(0, 0, 0, 0.1)'
            const itemHoverBg = theme === 'dark' ? '#2a2a2a' : '#f5f5f5'
            const itemSelectedBg = theme === 'dark' ? '#2d2d2d' : '#e8e8e8'
            const textColor = theme === 'dark' ? '#d6d6d6' : '#202124'
            const textColorSelected = theme === 'dark' ? '#ffffff' : '#202124'
            
            return (
              <div
                ref={mentionDropdownRef}
                style={{
                  position: 'absolute',
                  bottom: `${dropdownBottom}px`,
                  left: `${dropdownLeft}px`,
                  backgroundColor: dropdownBg,
                  border: `1px solid ${dropdownBorder}`,
                  borderRadius: '8px',
                  boxShadow: dropdownShadow,
                  minWidth: '240px',
                  maxWidth: '350px',
                  maxHeight: '300px',
                  overflowY: 'auto',
                  zIndex: 1000,
                  padding: '6px',
                  marginBottom: '4px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '2px',
                  fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
                }}
                onMouseDown={(e) => e.preventDefault()} // Prevent textarea blur
              >
                {mentions.map((mention, index) => {
                  const isSelected = index === selectedMentionIndex
                  const mentionText = mention.type === 'library' ? '@Library'
                    : `@${mention.name}`
                  // Display text without @ symbol in the menu
                  const displayText = mention.type === 'library' ? 'Library'
                    : mention.name
                  
                  return (
                    <div
                      key={mention.id || mention.name}
                      onClick={() => {
                        insertMention(mention)
                      }}
                      style={{
                        padding: '10px 14px',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        backgroundColor: isSelected ? itemSelectedBg : 'transparent',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '10px',
                        transition: 'all 0.15s',
                        border: 'none',
                        width: '100%',
                        textAlign: 'left'
                      }}
                      onMouseEnter={(e) => {
                        setSelectedMentionIndex(index)
                        const textAfterAt = textareaRef.current?.value.slice(mentionStartIndexRef.current + 1, textareaRef.current?.selectionStart || 0) || ''
                        const remainingText = mentionText.slice(textAfterAt.length + 1)
                        setCurrentSuggestion(remainingText)
                        if (!isSelected) {
                          e.currentTarget.style.backgroundColor = itemHoverBg
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (!isSelected) {
                          e.currentTarget.style.backgroundColor = 'transparent'
                        }
                      }}
                    >
                      {/* Icon */}
                      <div style={{
                        width: '20px',
                        height: '20px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0
                      }}>
                        {mention.type === 'library' ? (
                          <FolderIcon style={{ fontSize: '18px', color: theme === 'dark' ? '#9aa0a6' : '#5f6368' }} />
                        ) : mention.fileType === 'pdf' ? (
                          <PictureAsPdfIcon style={{ fontSize: '18px', color: theme === 'dark' ? '#9aa0a6' : '#5f6368' }} />
                        ) : (
                          <FileCopyOutlinedIcon style={{ fontSize: '18px', color: theme === 'dark' ? '#34a853' : '#137333' }} />
                        )}
                      </div>
                      
                      {/* Text - Single line, no description */}
                      <div style={{
                        flex: 1,
                        minWidth: 0,
                        display: 'flex',
                        alignItems: 'center'
                      }}>
                        <div style={{
                          fontSize: '13px',
                          fontWeight: '300',
                          color: isSelected ? textColorSelected : textColor,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
                        }}>
                          {displayText}
                        </div>
                      </div>
                      
                    </div>
                  )
                })}
              </div>
            )
          })()}
              </div>
          
          {/* Bottom Controls Section */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '6px'
          }}>
            {/* Left side - Plus button and Web search */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginLeft: '1px' }}>
              {/* Plus Button */}
              <div style={{ position: 'relative' }}>
                <button
                  ref={plusButtonRef}
                  onClick={() => {
                    setShowPlusMenu(!showPlusMenu)
                    setShowModelDropdown(false)
                  }}
                  disabled={isLoading}
                  style={{
                    padding: '2px',
                    backgroundColor: showPlusMenu ? (theme === 'dark' ? '#3a3a3a' : '#e0e0e0') : 'transparent',
                    color: showPlusMenu ? (theme === 'dark' ? '#d6d6d6' : '#424242') : secondaryTextColor,
                    border: 'none',
                    borderRadius: '6px',
                    cursor: isLoading ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    transition: 'all 0.15s',
                    opacity: isLoading ? 0.5 : 1,
                    width: '24px',
                    height: '24px'
                  }}
                  onMouseEnter={(e) => {
                    if (!isLoading) {
                      e.currentTarget.style.backgroundColor = showPlusMenu 
                        ? (theme === 'dark' ? '#454545' : '#d0d0d0')
                        : (theme === 'dark' ? '#1d1d1d' : '#f5f5f5')
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isLoading) {
                      e.currentTarget.style.backgroundColor = showPlusMenu 
                        ? (theme === 'dark' ? '#3a3a3a' : '#e0e0e0')
                        : 'transparent'
                    }
                  }}
                  title="More options"
                >
                  <AddIcon style={{ fontSize: '20px', transform: 'translateY(-1px)' }} />
                </button>
                
                {/* Plus Menu Dropup */}
                {showPlusMenu && (
                  <div
                    ref={plusMenuRef}
                    style={{
                      position: 'absolute',
                      bottom: '100%',
                      left: 0,
                      marginBottom: '4px',
                      backgroundColor: theme === 'dark' ? '#1e1e1e' : '#ffffff',
                      borderRadius: '8px',
                      padding: '6px',
                      minWidth: '180px',
                      boxShadow: theme === 'dark'
                        ? '0 -4px 16px rgba(0, 0, 0, 0.5), 0 -2px 4px rgba(0, 0, 0, 0.3)'
                        : '0 -4px 16px rgba(0, 0, 0, 0.2), 0 -2px 4px rgba(0, 0, 0, 0.1)',
                      zIndex: 10001,
                      border: `1px solid ${theme === 'dark' ? '#333' : '#e0e0e0'}`,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '2px',
                      fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
                    }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    {/* Upload files */}
                    <button
                      onClick={() => {
                        fileInputRef.current?.click()
                        setShowPlusMenu(false)
                      }}
                      disabled={isLoading}
                      style={{
                        padding: '10px 14px',
                        backgroundColor: 'transparent',
                        color: theme === 'dark' ? '#d6d6d6' : '#202124',
                        border: 'none',
                        borderRadius: '6px',
                        cursor: isLoading ? 'not-allowed' : 'pointer',
                        fontSize: '13px',
                        fontWeight: '300',
                        fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                        textAlign: 'left',
                        transition: 'all 0.15s',
                        opacity: isLoading ? 0.5 : 1,
                        width: '100%',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '12px'
                      }}
                      onMouseEnter={(e) => {
                        if (!isLoading) {
                          e.currentTarget.style.backgroundColor = theme === 'dark' ? '#2a2a2a' : '#f5f5f5'
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (!isLoading) {
                          e.currentTarget.style.backgroundColor = 'transparent'
                        }
                      }}
                    >
                      <AttachFileIcon style={{ fontSize: '18px' }} />
                      <span>Upload files</span>
                    </button>
                    
                    {/* Web search */}
                    <button
                      onClick={() => {
                        setUseWebSearch(!useWebSearch)
                        setShowPlusMenu(false)
                      }}
                      disabled={isLoading}
                      style={{
                        padding: '10px 14px',
                        backgroundColor: useWebSearch 
                          ? (theme === 'dark' ? '#2d2d2d' : '#e8e8e8') 
                          : 'transparent',
                        color: useWebSearch
                          ? (theme === 'dark' ? '#ffffff' : '#202124')
                          : (theme === 'dark' ? '#d6d6d6' : '#202124'),
                        border: 'none',
                        borderRadius: '6px',
                        cursor: isLoading ? 'not-allowed' : 'pointer',
                        fontSize: '13px',
                        fontWeight: useWebSearch ? '400' : '300',
                        fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                        textAlign: 'left',
                        transition: 'all 0.15s',
                        opacity: isLoading ? 0.5 : 1,
                        width: '100%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '12px'
                      }}
                      onMouseEnter={(e) => {
                        if (!isLoading) {
                          e.currentTarget.style.backgroundColor = theme === 'dark' ? '#2a2a2a' : '#f5f5f5'
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (!isLoading) {
                          e.currentTarget.style.backgroundColor = useWebSearch 
                            ? (theme === 'dark' ? '#2d2d2d' : '#e8e8e8') 
                            : 'transparent'
                        }
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <span 
                          className="material-symbols-outlined"
                          style={{
                            fontVariationSettings: "'FILL' 0, 'wght' 300, 'GRAD' 0, 'opsz' 24",
                            fontSize: '18px'
                          }}
                        >
                          language
                        </span>
                        <span>Web search</span>
                      </div>
                      {useWebSearch && (
                        <CheckIcon style={{ fontSize: '18px' }} />
                      )}
                    </button>
                    
                    {/* Use style */}
                    <div style={{ position: 'relative' }}>
                      <button
                        ref={styleButtonRef}
                        disabled={isLoading}
                        onMouseEnter={() => {
                          if (!isLoading) {
                            setShowStyleMenu(true)
                          }
                        }}
                        onMouseLeave={(e) => {
                          // Don't close if mouse is moving to style menu
                          const relatedTarget = e.relatedTarget as Node
                          if (
                            styleMenuRef.current &&
                            !styleMenuRef.current.contains(relatedTarget) &&
                            relatedTarget !== styleMenuRef.current
                          ) {
                            setShowStyleMenu(false)
                          }
                        }}
                        style={{
                          padding: '10px 14px',
                          backgroundColor: showStyleMenu ? (theme === 'dark' ? '#2a2a2a' : '#f5f5f5') : 'transparent',
                          color: theme === 'dark' ? '#d6d6d6' : '#202124',
                          border: 'none',
                          borderRadius: '6px',
                          cursor: isLoading ? 'not-allowed' : 'pointer',
                          fontSize: '13px',
                          fontWeight: '300',
                          fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                          textAlign: 'left',
                          transition: 'all 0.15s',
                          opacity: isLoading ? 0.5 : 1,
                          width: '100%',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: '12px'
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                          <FormatQuoteIcon style={{ fontSize: '18px' }} />
                          <span>Use style</span>
                        </div>
                        <KeyboardArrowDownIcon style={{ fontSize: '16px', transform: 'rotate(-90deg)' }} />
                      </button>
                      
                      {/* Style Submenu */}
                      {showStyleMenu && (
                        <>
                          {/* Invisible bridge to prevent gap */}
                          <div
                            onMouseEnter={() => setShowStyleMenu(true)}
                            style={{
                              position: 'absolute',
                              left: '100%',
                              bottom: 0,
                              width: '4px',
                              height: '100%',
                              zIndex: 10001,
                              backgroundColor: 'transparent'
                            }}
                          />
                          <div
                            ref={styleMenuRef}
                            onMouseEnter={() => setShowStyleMenu(true)}
                            onMouseLeave={() => setShowStyleMenu(false)}
                            style={{
                              position: 'absolute',
                              left: '100%',
                              bottom: 0,
                              marginLeft: '4px',
                              backgroundColor: theme === 'dark' ? '#1e1e1e' : '#ffffff',
                              borderRadius: '8px',
                              padding: '6px',
                              minWidth: '160px',
                              boxShadow: theme === 'dark'
                                ? '0 4px 16px rgba(0, 0, 0, 0.5), 0 2px 4px rgba(0, 0, 0, 0.3)'
                                : '0 4px 16px rgba(0, 0, 0, 0.2), 0 2px 4px rgba(0, 0, 0, 0.1)',
                              zIndex: 10002,
                              border: `1px solid ${theme === 'dark' ? '#333' : '#e0e0e0'}`,
                              display: 'flex',
                              flexDirection: 'column',
                              gap: '2px',
                              fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
                            }}
                            onClick={(e) => e.stopPropagation()}
                          >
                            {(['Normal', 'Learning', 'Concise', 'Explanatory', 'Formal'] as const).map((style) => (
                              <button
                                key={style}
                                onClick={() => {
                                  setSelectedStyle(style)
                                  setShowStyleMenu(false)
                                  setShowPlusMenu(false)
                                }}
                                disabled={isLoading}
                                style={{
                                  padding: '10px 14px',
                                  backgroundColor: selectedStyle === style 
                                    ? (theme === 'dark' ? '#2d2d2d' : '#e8e8e8') 
                                    : 'transparent',
                                  color: selectedStyle === style
                                    ? (theme === 'dark' ? '#ffffff' : '#202124')
                                    : (theme === 'dark' ? '#d6d6d6' : '#202124'),
                                  border: 'none',
                                  borderRadius: '6px',
                                  cursor: isLoading ? 'not-allowed' : 'pointer',
                                  fontSize: '13px',
                                  fontWeight: selectedStyle === style ? '400' : '300',
                                  fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                                  textAlign: 'left',
                                  transition: 'all 0.15s',
                                  opacity: isLoading ? 0.5 : 1,
                                  width: '100%',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'space-between',
                                  gap: '12px'
                                }}
                                onMouseEnter={(e) => {
                                  if (!isLoading && selectedStyle !== style) {
                                    e.currentTarget.style.backgroundColor = theme === 'dark' ? '#2a2a2a' : '#f5f5f5'
                                  }
                                }}
                                onMouseLeave={(e) => {
                                  if (!isLoading && selectedStyle !== style) {
                                    e.currentTarget.style.backgroundColor = 'transparent'
                                  }
                                }}
                              >
                                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                  <FormatQuoteIcon style={{ fontSize: '18px' }} />
                                  <span>{style}</span>
                                </div>
                                {selectedStyle === style && (
                                  <CheckIcon style={{ fontSize: '18px' }} />
                                )}
                              </button>
                            ))}
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                )}
              </div>
              
              {/* Web Search Button */}
              <button
                onClick={() => setUseWebSearch(!useWebSearch)}
                disabled={isLoading}
                style={{
                  padding: '2px',
                  backgroundColor: useWebSearch ? (theme === 'dark' ? '#3a3a3a' : '#e0e0e0') : 'transparent',
                  color: useWebSearch ? (theme === 'dark' ? '#d6d6d6' : '#424242') : secondaryTextColor,
                  border: 'none',
                  borderRadius: '6px',
                  cursor: isLoading ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'all 0.15s',
                  opacity: isLoading ? 0.5 : 1,
                  width: '24px',
                  height: '24px'
                }}
                onMouseEnter={(e) => {
                  if (!isLoading) {
                    e.currentTarget.style.backgroundColor = useWebSearch 
                      ? (theme === 'dark' ? '#454545' : '#d0d0d0')
                      : (theme === 'dark' ? '#1d1d1d' : '#f5f5f5')
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isLoading) {
                    e.currentTarget.style.backgroundColor = useWebSearch 
                      ? (theme === 'dark' ? '#3a3a3a' : '#e0e0e0')
                      : 'transparent'
                  }
                }}
                title={useWebSearch ? "Web search enabled - AI can search the internet" : "Enable web search"}
              >
                <span 
                  className="material-symbols-outlined"
                  style={{
                    fontVariationSettings: "'FILL' 0, 'wght' 300, 'GRAD' 0, 'opsz' 24",
                    fontSize: '17px'
                  }}
                >
                  language
                </span>
              </button>
            </div>
            
            {/* Right side - Model name and Send button */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              {/* Model name container */}
              <div style={{ position: 'relative' }}>
                <button
                  ref={modelNameRef}
                  onClick={() => {
                    setShowModelDropdown(!showModelDropdown)
                    setShowSettingsModal(false)
                    setShowPlusMenu(false)
                  }}
                  disabled={isLoading}
                  style={{
                    padding: '2px',
                    backgroundColor: showModelDropdown ? (theme === 'dark' ? '#3a3a3a' : '#e0e0e0') : 'transparent',
                    color: showModelDropdown ? (theme === 'dark' ? '#d6d6d6' : '#424242') : secondaryTextColor,
                    border: 'none',
                    borderRadius: '6px',
                    cursor: isLoading ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    transition: 'all 0.15s',
                    opacity: isLoading ? 0.5 : 1,
                    fontSize: '11px',
                    fontWeight: '400',
                    fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                    gap: '4px'
                  }}
                  onMouseEnter={(e) => {
                    if (!isLoading) {
                      e.currentTarget.style.backgroundColor = showModelDropdown 
                        ? (theme === 'dark' ? '#454545' : '#d0d0d0')
                        : (theme === 'dark' ? '#1d1d1d' : '#f5f5f5')
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isLoading) {
                      e.currentTarget.style.backgroundColor = showModelDropdown 
                        ? (theme === 'dark' ? '#3a3a3a' : '#e0e0e0')
                        : 'transparent'
                    }
                  }}
                  title={
                    selectedModel === 'gemini-3-flash-preview' ? 'Gemini 3 Flash Preview - Faster responses' :
                    selectedModel === 'gemini-2.5-pro' ? 'Gemini 3 Pro - More capable' :
                    selectedModel === 'gpt-4.1-nano' ? 'GPT-4.1 Nano - Fast and efficient' :
                    selectedModel === 'gpt-5-mini' ? 'GPT-5 Mini - Balanced performance' :
                    selectedModel === 'gpt-5.2' ? 'GPT-5.2 - Most capable' : ''
                  }
                >
                  <span>{
                    selectedModel === 'gemini-3-flash-preview' ? 'Flash 3' :
                    selectedModel === 'gemini-2.5-pro' ? 'Pro 3' :
                    selectedModel === 'gpt-4.1-nano' ? 'GPT-4.1 Nano' :
                    selectedModel === 'gpt-5-mini' ? 'GPT-5 Mini' :
                    selectedModel === 'gpt-5.2' ? 'GPT-5.2' : 'Flash 2.5'
                  }</span>
                  <KeyboardArrowDownIcon style={{ fontSize: '14px' }} />
                </button>
                
                {/* Model Dropdown Menu */}
                {showModelDropdown && (() => {
                  const hasGoogleKey = !!googleApiKey
                  const hasOpenaiKey = !!openaiApiKey
                  
                  return (
                    <div
                      ref={modelDropdownRef}
                      style={{
                        position: 'absolute',
                        bottom: '100%',
                        right: 0,
                        marginBottom: '4px',
                        backgroundColor: theme === 'dark' ? '#1e1e1e' : '#ffffff',
                        borderRadius: '8px',
                        padding: '6px',
                        minWidth: '180px',
                        boxShadow: theme === 'dark'
                          ? '0 -4px 16px rgba(0, 0, 0, 0.5), 0 -2px 4px rgba(0, 0, 0, 0.3)'
                          : '0 -4px 16px rgba(0, 0, 0, 0.2), 0 -2px 4px rgba(0, 0, 0, 0.1)',
                        zIndex: 10001,
                        border: `1px solid ${theme === 'dark' ? '#333' : '#e0e0e0'}`,
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '2px',
                        fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
                      }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      {/* Gemini Models - only show if Google API key is present */}
                      {hasGoogleKey && (
                        <>
                          <button
                            onClick={() => {
                              setSelectedModel('gemini-3-flash-preview')
                              setShowModelDropdown(false)
                            }}
                            disabled={isLoading}
                            style={{
                              padding: '10px 14px',
                              backgroundColor: selectedModel === 'gemini-3-flash-preview' 
                                ? (theme === 'dark' ? '#2d2d2d' : '#e8e8e8') 
                                : 'transparent',
                              color: selectedModel === 'gemini-3-flash-preview'
                                ? (theme === 'dark' ? '#ffffff' : '#202124')
                                : (theme === 'dark' ? '#d6d6d6' : '#202124'),
                              border: 'none',
                              borderRadius: '6px',
                              cursor: isLoading ? 'not-allowed' : 'pointer',
                              fontSize: '13px',
                              fontWeight: '300',
                              fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                              textAlign: 'left',
                              transition: 'all 0.15s',
                              opacity: isLoading ? 0.5 : 1,
                              width: '100%'
                            }}
                            onMouseEnter={(e) => {
                              if (!isLoading && selectedModel !== 'gemini-3-flash-preview') {
                                e.currentTarget.style.backgroundColor = theme === 'dark' ? '#2a2a2a' : '#f5f5f5'
                              }
                            }}
                            onMouseLeave={(e) => {
                              if (!isLoading && selectedModel !== 'gemini-3-flash-preview') {
                                e.currentTarget.style.backgroundColor = 'transparent'
                              }
                            }}
                          >
                            Gemini 3 Flash
                          </button>
                          
                          <button
                            onClick={() => {
                              setSelectedModel('gemini-2.5-pro')
                              setShowModelDropdown(false)
                            }}
                            disabled={isLoading}
                            style={{
                              padding: '10px 14px',
                              backgroundColor: selectedModel === 'gemini-2.5-pro' 
                                ? (theme === 'dark' ? '#2d2d2d' : '#e8e8e8') 
                                : 'transparent',
                              color: selectedModel === 'gemini-2.5-pro'
                                ? (theme === 'dark' ? '#ffffff' : '#202124')
                                : (theme === 'dark' ? '#d6d6d6' : '#202124'),
                              border: 'none',
                              borderRadius: '6px',
                              cursor: isLoading ? 'not-allowed' : 'pointer',
                              fontSize: '13px',
                              fontWeight: '300',
                              fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                              textAlign: 'left',
                              transition: 'all 0.15s',
                              opacity: isLoading ? 0.5 : 1,
                              width: '100%'
                            }}
                            onMouseEnter={(e) => {
                              if (!isLoading && selectedModel !== 'gemini-2.5-pro') {
                                e.currentTarget.style.backgroundColor = theme === 'dark' ? '#2a2a2a' : '#f5f5f5'
                              }
                            }}
                            onMouseLeave={(e) => {
                              if (!isLoading && selectedModel !== 'gemini-2.5-pro') {
                                e.currentTarget.style.backgroundColor = 'transparent'
                              }
                            }}
                          >
                            Gemini 3 Pro
                          </button>
                        </>
                      )}
                      
                      {/* GPT Models - only show if OpenAI API key is present */}
                      {hasOpenaiKey && (
                        <>
                          {hasGoogleKey && (
                            <div style={{
                              height: '1px',
                              backgroundColor: theme === 'dark' ? '#333' : '#e0e0e0',
                              margin: '6px 0'
                            }} />
                          )}
                          <button
                            onClick={() => {
                              setSelectedModel('gpt-4.1-nano')
                              setShowModelDropdown(false)
                            }}
                            disabled={isLoading}
                            style={{
                              padding: '10px 14px',
                              backgroundColor: selectedModel === 'gpt-4.1-nano' 
                                ? (theme === 'dark' ? '#2d2d2d' : '#e8e8e8') 
                                : 'transparent',
                              color: selectedModel === 'gpt-4.1-nano'
                                ? (theme === 'dark' ? '#ffffff' : '#202124')
                                : (theme === 'dark' ? '#d6d6d6' : '#202124'),
                              border: 'none',
                              borderRadius: '6px',
                              cursor: isLoading ? 'not-allowed' : 'pointer',
                              fontSize: '13px',
                              fontWeight: '300',
                              fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                              textAlign: 'left',
                              transition: 'all 0.15s',
                              opacity: isLoading ? 0.5 : 1,
                              width: '100%'
                            }}
                            onMouseEnter={(e) => {
                              if (!isLoading && selectedModel !== 'gpt-4.1-nano') {
                                e.currentTarget.style.backgroundColor = theme === 'dark' ? '#2a2a2a' : '#f5f5f5'
                              }
                            }}
                            onMouseLeave={(e) => {
                              if (!isLoading && selectedModel !== 'gpt-4.1-nano') {
                                e.currentTarget.style.backgroundColor = 'transparent'
                              }
                            }}
                          >
                            GPT-4.1 Nano
                          </button>
                          
                          <button
                            onClick={() => {
                              setSelectedModel('gpt-5-mini')
                              setShowModelDropdown(false)
                            }}
                            disabled={isLoading}
                            style={{
                              padding: '10px 14px',
                              backgroundColor: selectedModel === 'gpt-5-mini' 
                                ? (theme === 'dark' ? '#2d2d2d' : '#e8e8e8') 
                                : 'transparent',
                              color: selectedModel === 'gpt-5-mini'
                                ? (theme === 'dark' ? '#ffffff' : '#202124')
                                : (theme === 'dark' ? '#d6d6d6' : '#202124'),
                              border: 'none',
                              borderRadius: '6px',
                              cursor: isLoading ? 'not-allowed' : 'pointer',
                              fontSize: '13px',
                              fontWeight: '300',
                              fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                              textAlign: 'left',
                              transition: 'all 0.15s',
                              opacity: isLoading ? 0.5 : 1,
                              width: '100%'
                            }}
                            onMouseEnter={(e) => {
                              if (!isLoading && selectedModel !== 'gpt-5-mini') {
                                e.currentTarget.style.backgroundColor = theme === 'dark' ? '#2a2a2a' : '#f5f5f5'
                              }
                            }}
                            onMouseLeave={(e) => {
                              if (!isLoading && selectedModel !== 'gpt-5-mini') {
                                e.currentTarget.style.backgroundColor = 'transparent'
                              }
                            }}
                          >
                            GPT-5 Mini
                          </button>
                          
                          <button
                            onClick={() => {
                              setSelectedModel('gpt-5.2')
                              setShowModelDropdown(false)
                            }}
                            disabled={isLoading}
                            style={{
                              padding: '10px 14px',
                              backgroundColor: selectedModel === 'gpt-5.2' 
                                ? (theme === 'dark' ? '#2d2d2d' : '#e8e8e8') 
                                : 'transparent',
                              color: selectedModel === 'gpt-5.2'
                                ? (theme === 'dark' ? '#ffffff' : '#202124')
                                : (theme === 'dark' ? '#d6d6d6' : '#202124'),
                              border: 'none',
                              borderRadius: '6px',
                              cursor: isLoading ? 'not-allowed' : 'pointer',
                              fontSize: '13px',
                              fontWeight: '300',
                              fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                              textAlign: 'left',
                              transition: 'all 0.15s',
                              opacity: isLoading ? 0.5 : 1,
                              width: '100%'
                            }}
                            onMouseEnter={(e) => {
                              if (!isLoading && selectedModel !== 'gpt-5.2') {
                                e.currentTarget.style.backgroundColor = theme === 'dark' ? '#2a2a2a' : '#f5f5f5'
                              }
                            }}
                            onMouseLeave={(e) => {
                              if (!isLoading && selectedModel !== 'gpt-5.2') {
                                e.currentTarget.style.backgroundColor = 'transparent'
                              }
                            }}
                          >
                            GPT-5.2
                          </button>
                        </>
                      )}
                  
                      {/* Divider */}
                      <div style={{
                        height: '1px',
                        backgroundColor: theme === 'dark' ? '#333' : '#e0e0e0',
                        margin: '6px 0'
                      }} />
                      
                      {/* API Keys Option */}
                      <button
                        onClick={() => {
                          setShowModelDropdown(false)
                          setShowSettingsModal(true)
                        }}
                        disabled={isLoading}
                        style={{
                          padding: '10px 14px',
                          backgroundColor: 'transparent',
                          color: theme === 'dark' ? '#d6d6d6' : '#202124',
                          border: 'none',
                          borderRadius: '6px',
                          cursor: isLoading ? 'not-allowed' : 'pointer',
                          fontSize: '13px',
                          fontWeight: '300',
                          fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                          textAlign: 'left',
                          transition: 'all 0.15s',
                          opacity: isLoading ? 0.5 : 1,
                          width: '100%'
                        }}
                        onMouseEnter={(e) => {
                          if (!isLoading) {
                            e.currentTarget.style.backgroundColor = theme === 'dark' ? '#2a2a2a' : '#f5f5f5'
                          }
                        }}
                        onMouseLeave={(e) => {
                          if (!isLoading) {
                            e.currentTarget.style.backgroundColor = 'transparent'
                          }
                        }}
                      >
                        API Keys
                      </button>
                    </div>
                  )
                })()}
              </div>
              
              {/* Send/Stop button with grey container */}
              <button
                onClick={handleSend}
                disabled={!isLoading && (!input.trim() && attachments.length === 0)}
                style={{
                  padding: '4px 8px',
                  backgroundColor: isLoading 
                    ? (theme === 'dark' ? '#505050' : '#e8e8e8')
                    : ((!input.trim() && attachments.length === 0) 
                      ? (theme === 'dark' ? '#282828' : '#e0e0e0')
                      : (theme === 'dark' ? '#505050' : '#e8e8e8')),
                  color: isLoading 
                    ? (theme === 'dark' ? '#ffffff' : '#202124')
                    : ((!input.trim() && attachments.length === 0) 
                      ? secondaryTextColor 
                      : (theme === 'dark' ? '#ffffff' : '#202124')),
                  border: 'none',
                  borderRadius: '6px',
                  cursor: (!isLoading && (!input.trim() && attachments.length === 0)) ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  opacity: (!isLoading && (!input.trim() && attachments.length === 0)) ? 0.5 : 1,
                  width: '24px',
                  height: '24px'
                }}
                onMouseEnter={(e) => {
                  if (isLoading) {
                    e.currentTarget.style.backgroundColor = theme === 'dark' ? '#5a5a5a' : '#f0f0f0'
                  } else if (!isLoading && (input.trim() || attachments.length > 0)) {
                    e.currentTarget.style.backgroundColor = theme === 'dark' ? '#5a5a5a' : '#f0f0f0'
                  } else if (!isLoading) {
                    e.currentTarget.style.backgroundColor = theme === 'dark' ? '#282828' : '#e0e0e0'
                  }
                }}
                onMouseLeave={(e) => {
                  if (isLoading) {
                    e.currentTarget.style.backgroundColor = theme === 'dark' ? '#505050' : '#e8e8e8'
                  } else if (!isLoading && (input.trim() || attachments.length > 0)) {
                    e.currentTarget.style.backgroundColor = theme === 'dark' ? '#505050' : '#e8e8e8'
                  } else if (!isLoading) {
                    e.currentTarget.style.backgroundColor = theme === 'dark' ? '#282828' : '#e0e0e0'
                  }
                }}
                title={isLoading ? "Stop generation" : "Send"}
              >
                {isLoading ? (
                  <StopIcon style={{ 
                    fontSize: '19px', 
                    transform: 'translateY(0px)', 
                    color: theme === 'dark' ? '#ffffff' : '#202124'
                  }} />
                ) : (
                  <ArrowUpwardIcon style={{ 
                    fontSize: '19px', 
                    transform: 'translateY(0px)', 
                    color: (!input.trim() && attachments.length === 0) 
                      ? secondaryTextColor 
                      : (theme === 'dark' ? '#ffffff' : '#202124')
                  }} />
                )}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Settings Modal */}
      {showSettingsModal && (
        <div
          ref={modalRef}
          style={{
            position: 'fixed',
            top: `${modalPosition.top}px`,
            ...(modalPosition.right !== undefined 
              ? { right: `${modalPosition.right}px`, left: undefined }
              : { left: `${modalPosition.left || 0}px` }
            ),
            backgroundColor: theme === 'dark' ? '#1e1e1e' : '#ffffff',
            borderRadius: '8px',
            padding: '20px',
            minWidth: '390px',
            maxWidth: '490px',
            boxShadow: theme === 'dark'
              ? '0 8px 32px rgba(0, 0, 0, 0.5), 0 2px 8px rgba(0, 0, 0, 0.3)'
              : '0 8px 32px rgba(0, 0, 0, 0.2), 0 2px 8px rgba(0, 0, 0, 0.1)',
            zIndex: 10000,
            border: `1px solid ${theme === 'dark' ? '#333' : '#e0e0e0'}`,
            fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
            transform: 'translateY(-100%)',
            marginTop: '-8px',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Close button */}
          <button
            onClick={() => setShowSettingsModal(false)}
            style={{
              position: 'absolute',
              top: '8px',
              right: '8px',
              padding: '4px',
              backgroundColor: 'transparent',
              border: 'none',
              color: theme === 'dark' ? '#999' : '#666',
              cursor: 'pointer',
              fontSize: '16px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: '4px',
              width: '24px',
              height: '24px',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = theme === 'dark' ? '#2a2a2a' : '#f1f3f4'
              e.currentTarget.style.color = theme === 'dark' ? '#fff' : '#202124'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent'
              e.currentTarget.style.color = theme === 'dark' ? '#999' : '#666'
            }}
            title="Close"
          >
            ✕
          </button>

          {/* API Keys heading */}
          <h2
            style={{
              fontSize: '14px',
              fontWeight: '500',
              color: theme === 'dark' ? '#e0e0e0' : '#202124',
              margin: '0 0 20px 0',
            }}
          >
            API Keys
          </h2>

          {/* Google API Key section */}
          <div style={{ marginBottom: '20px' }}>
            <label
              style={{
                display: 'block',
                fontSize: '12px',
                fontWeight: '400',
                color: theme === 'dark' ? '#b0b0b0' : '#777',
                marginBottom: '8px',
              }}
            >
              Google API Key
            </label>
            <p
              style={{
                fontSize: '12px',
                color: theme === 'dark' ? '#999' : '#666',
                margin: '0 0 12px 0',
                lineHeight: '1.5',
              }}
            >
              Put your{' '}
              <a
                href="https://aistudio.google.com/app/api-keys"
                onClick={(e) => {
                  e.preventDefault()
                  const url = 'https://aistudio.google.com/app/api-keys'
                  // Check if running in Electron
                  const isElectron = typeof window !== 'undefined' && window.electron !== undefined
                  if (isElectron && window.electron) {
                    // Open in external browser via IPC
                    window.electron.invoke('openExternal', url).catch((error) => {
                      console.error('Failed to open external URL:', error)
                      // Fallback to window.open if IPC fails
                      window.open(url, '_blank')
                    })
                  } else {
                    // Fallback for web
                    window.open(url, '_blank')
                  }
                }}
                style={{
                  color: theme === 'dark' ? '#4a9eff' : '#1a73e8',
                  textDecoration: 'none',
                  cursor: 'pointer',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.textDecoration = 'underline'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.textDecoration = 'none'
                }}
              >
                Google AI Studio
              </a>
              {' '}key here.
            </p>
            <input
              ref={apiKeyInputRef}
              type="password"
              value={googleApiKey}
              onChange={(e) => handleApiKeyChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  // Save the API key (already handled by handleApiKeyChange, but ensure it's saved)
                  handleApiKeyChange(googleApiKey)
                  // Defocus the input
                  apiKeyInputRef.current?.blur()
                }
              }}
              placeholder="Enter your Google API key"
              style={{
                width: '100%',
                padding: '8px 12px',
                border: `1px solid ${theme === 'dark' ? '#333' : '#dadce0'}`,
                borderRadius: '4px',
                backgroundColor: theme === 'dark' ? '#252525' : '#ffffff',
                color: theme === 'dark' ? '#e0e0e0' : '#202124',
                fontSize: '13px',
                outline: 'none',
                fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
                transition: 'border-color 0.2s',
              }}
              onFocus={(e) => {
                e.target.style.borderColor = theme === 'dark' ? '#555' : '#1a73e8'
              }}
              onBlur={(e) => {
                e.target.style.borderColor = theme === 'dark' ? '#333' : '#dadce0'
              }}
            />
          </div>

          {/* OpenAI API Key section */}
          <div style={{ marginBottom: '20px' }}>
            <label
              style={{
                display: 'block',
                fontSize: '12px',
                fontWeight: '400',
                color: theme === 'dark' ? '#b0b0b0' : '#777',
                marginBottom: '8px',
              }}
            >
              OpenAI API Key
            </label>
            <p
              style={{
                fontSize: '12px',
                color: theme === 'dark' ? '#999' : '#666',
                margin: '0 0 12px 0',
                lineHeight: '1.5',
              }}
            >
              Put your{' '}
              <a
                href="https://platform.openai.com/api-keys"
                onClick={(e) => {
                  e.preventDefault()
                  const url = 'https://platform.openai.com/api-keys'
                  // Check if running in Electron
                  const isElectron = typeof window !== 'undefined' && window.electron !== undefined
                  if (isElectron && window.electron) {
                    // Open in external browser via IPC
                    window.electron.invoke('openExternal', url).catch((error) => {
                      console.error('Failed to open external URL:', error)
                      // Fallback to window.open if IPC fails
                      window.open(url, '_blank')
                    })
                  } else {
                    // Fallback for web
                    window.open(url, '_blank')
                  }
                }}
                style={{
                  color: theme === 'dark' ? '#4a9eff' : '#1a73e8',
                  textDecoration: 'none',
                  cursor: 'pointer',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.textDecoration = 'underline'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.textDecoration = 'none'
                }}
              >
                your OpenAI key
              </a>
              {' '}here.
            </p>
            <input
              type="password"
              value={openaiApiKey}
              onChange={(e) => handleOpenaiApiKeyChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  // Save the API key (already handled by handleOpenaiApiKeyChange, but ensure it's saved)
                  handleOpenaiApiKeyChange(openaiApiKey)
                  // Defocus the input
                  e.currentTarget.blur()
                }
              }}
              placeholder="Enter your OpenAI API key"
              style={{
                width: '100%',
                padding: '8px 12px',
                border: `1px solid ${theme === 'dark' ? '#333' : '#dadce0'}`,
                borderRadius: '4px',
                backgroundColor: theme === 'dark' ? '#252525' : '#ffffff',
                color: theme === 'dark' ? '#e0e0e0' : '#202124',
                fontSize: '13px',
                outline: 'none',
                fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
                transition: 'border-color 0.2s',
              }}
              onFocus={(e) => {
                e.target.style.borderColor = theme === 'dark' ? '#555' : '#1a73e8'
              }}
              onBlur={(e) => {
                e.target.style.borderColor = theme === 'dark' ? '#333' : '#dadce0'
              }}
            />
          </div>

          {/* Smart Indexing Option */}
          <div style={{ marginBottom: '20px' }}>
            <label
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                cursor: 'pointer',
                fontSize: '13px',
                color: theme === 'dark' ? '#e0e0e0' : '#202124',
                userSelect: 'none',
                gap: '10px',
              }}
            >
              <div
                style={{
                  position: 'relative',
                  width: '18px',
                  height: '18px',
                  flexShrink: 0,
                  marginTop: '2px',
                }}
              >
                <input
                  type="checkbox"
                  checked={smartIndexing}
                  onChange={async (e) => {
                    const newValue = e.target.checked
                    setSmartIndexing(newValue)
                    try {
                      localStorage.setItem('smartIndexing', String(newValue))
                      await settingsApi.saveSmartIndexing(newValue)
                    } catch (error) {
                      console.error('Failed to save Smart indexing setting:', error)
                    }
                  }}
                  style={{
                    position: 'absolute',
                    width: '18px',
                    height: '18px',
                    margin: 0,
                    cursor: 'pointer',
                    opacity: 0,
                    zIndex: 1,
                  }}
                />
                <div
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '18px',
                    height: '18px',
                    border: `2px solid ${smartIndexing 
                      ? (theme === 'dark' ? '#4a9eff' : '#1a73e8')
                      : (theme === 'dark' ? '#444' : '#dadce0')}`,
                    borderRadius: '4px',
                    backgroundColor: smartIndexing
                      ? (theme === 'dark' ? '#4a9eff' : '#1a73e8')
                      : (theme === 'dark' ? '#252525' : '#ffffff'),
                    transition: 'all 0.2s ease',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  {smartIndexing && (
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 12 12"
                      fill="none"
                      xmlns="http://www.w3.org/2000/svg"
                      style={{
                        transition: 'opacity 0.2s ease',
                      }}
                    >
                      <path
                        d="M2 6L5 9L10 2"
                        stroke={theme === 'dark' ? '#141414' : '#ffffff'}
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  )}
                </div>
              </div>
              <div style={{ flex: 1 }}>
                <div
                  style={{
                    fontSize: '13px',
                    fontWeight: '500',
                    color: theme === 'dark' ? '#e0e0e0' : '#202124',
                    marginBottom: '4px',
                  }}
                >
                  Smart indexing
                </div>
                <p
                  style={{
                    fontSize: '11px',
                    color: theme === 'dark' ? '#999' : '#666',
                    margin: 0,
                    lineHeight: '1.4',
                  }}
                >
                  Use a single API key to ensure stable AI document search.
                </p>
              </div>
            </label>
          </div>
        </div>
      )}
      </div>
    </>
  )
}
