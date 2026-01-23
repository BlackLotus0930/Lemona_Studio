import { Panel, PanelGroup, PanelResizeHandle, ImperativePanelHandle } from 'react-resizable-panels'
import { useEditor, Editor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { Extension } from '@tiptap/core'
import TextAlign from '@tiptap/extension-text-align'
import Placeholder from '@tiptap/extension-placeholder'
import Underline from '@tiptap/extension-underline'
import Color from '@tiptap/extension-color'
import { TextStyle } from '@tiptap/extension-text-style'
import Link from '@tiptap/extension-link'
import { ResizableImage } from '../Editor/ResizableImage'
import Highlight from '@tiptap/extension-highlight'
import { MathExtension } from '../Editor/MathExtension'
import { PDFViewerExtension } from '../Editor/PDFViewer'
import { TableExtension } from '../Editor/TableExtension'
import { ChartExtension } from '../Editor/ChartExtension'
import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react'
import DocumentEditor, { DocumentEditorSearchHandle } from '../Editor/DocumentEditor'
import Toolbar from '../Editor/Toolbar'
import AIPanel from '../AIPanel/AIPanel'
import FileExplorer from '../FileExplorer/FileExplorer'
import { DocumentEditorSkeleton } from '../Editor/DocumentEditorSkeleton'
import FullScreenPDFViewer, { PDFViewerSearchHandle } from '../PDFViewer/FullScreenPDFViewer'
import { Document, IndexingStatus, DocumentSnapshot, WorldLab } from '@shared/types'
import { documentApi, exportApi, projectApi } from '../../services/api'
import { indexingApi, versionApi, worldLabApi } from '../../services/desktop-api'
import { settingsApi } from '../../services/desktop-api'
import WorldLabCanvas from '../WorldLab/WorldLabCanvas'
import WorldLabTerminal from '../WorldLab/WorldLabTerminal'
import { FontSize } from '../Editor/FontSize'
import { FontFamily } from '../Editor/FontFamily'
import { LineHeight } from '../Editor/LineHeight'
import { Title } from '../Editor/Title'
import { Subtitle } from '../Editor/Subtitle'
import { Callout } from '../Editor/Callout'
import { Quote } from '../Editor/Quote'
import { useTheme } from '../../contexts/ThemeContext'
import { useEditorContext } from '../../contexts/EditorContext'
import { BulletList, OrderedList, ListItem } from '@tiptap/extension-list'
import { IndentExtension } from '../Editor/IndentExtension'
import { TextSelection } from 'prosemirror-state'
// @ts-ignore
import ChatIcon from '@mui/icons-material/Chat'
// @ts-ignore
import TerminalIcon from '@mui/icons-material/Terminal'
// @ts-ignore
import AddIcon from '@mui/icons-material/Add'
// @ts-ignore
import CreateNewFolderIcon from '@mui/icons-material/CreateNewFolder'
import TopBar from './TopBar'
import { useNavigate, useParams } from 'react-router-dom'
import WordCountModal from './WordCountModal'

const AI_PANEL_STORAGE_KEY = 'aiPanelState'
const FILE_EXPLORER_SIZE_STORAGE_KEY = 'fileExplorerSize'
const FILE_EXPLORER_LAST_OPEN_SIZE_KEY = 'fileExplorerLastOpenSize'

interface AIPanelState {
  isOpen: boolean
  width: number // Percentage width of the AI panel
}

function loadAIPanelState(): AIPanelState {
  try {
    const stored = localStorage.getItem(AI_PANEL_STORAGE_KEY)
    if (stored) {
      const parsed = JSON.parse(stored)
      return {
        isOpen: parsed.isOpen ?? true,
        width: parsed.width ?? 35
      }
    }
    // First-time user: default to open
    return { isOpen: true, width: 35 }
  } catch (error) {
    console.error('Failed to load AI panel state:', error)
    // First-time user or error: default to open
    return { isOpen: true, width: 35 }
  }
}

function saveAIPanelState(state: AIPanelState) {
  try {
    localStorage.setItem(AI_PANEL_STORAGE_KEY, JSON.stringify(state))
  } catch (error) {
    console.error('Failed to save AI panel state:', error)
  }
}

function loadFileExplorerSize(): number {
  try {
    const stored = localStorage.getItem(FILE_EXPLORER_SIZE_STORAGE_KEY)
    if (stored) {
      const parsed = parseFloat(stored)
      if (!isNaN(parsed) && parsed >= 0 && parsed <= 30) {
        return parsed
      }
    }
  } catch (error) {
    console.error('Failed to load FileExplorer size:', error)
  }
  return 14 // Default size
}

function saveFileExplorerSize(size: number) {
  try {
    localStorage.setItem(FILE_EXPLORER_SIZE_STORAGE_KEY, size.toString())
  } catch (error) {
    console.error('Failed to save FileExplorer size:', error)
  }
}

function loadFileExplorerLastOpenSize(): number {
  try {
    const stored = localStorage.getItem(FILE_EXPLORER_LAST_OPEN_SIZE_KEY)
    if (stored) {
      const parsed = parseFloat(stored)
      if (!isNaN(parsed) && parsed > 0 && parsed <= 30) {
        return parsed
      }
    }
  } catch (error) {
    console.error('Failed to load FileExplorer last open size:', error)
  }
  return 14 // Default size
}

function saveFileExplorerLastOpenSize(size: number) {
  try {
    localStorage.setItem(FILE_EXPLORER_LAST_OPEN_SIZE_KEY, size.toString())
  } catch (error) {
    console.error('Failed to save FileExplorer last open size:', error)
  }
}

// Internal component to manage a single document's editor instance
// This component uses useEditor hook to create the editor instance
function DocumentEditorWrapper({
  document,
  isActive,
  onEditorCreated,
  onDocumentChange,
  isAIPanelOpen,
  aiPanelWidth,
  createEditorConfigFn,
  editorRef,
  onUpdate,
}: {
  document: Document
  isActive: boolean
  onEditorCreated: (docId: string, editor: Editor) => void
  onDocumentChange?: (doc: Document | null) => void
  isAIPanelOpen?: boolean
  aiPanelWidth?: number
  createEditorConfigFn: (content: any) => any
  editorRef: React.MutableRefObject<DocumentEditorSearchHandle | null>
  onUpdate?: (editor: Editor, docId: string) => void
}) {
  
  // Parse content and create stable config
  const editorConfig = useMemo(() => {
    let parsedContent: any = ''
    try {
      if (document.content) {
        parsedContent = JSON.parse(document.content)
      }
    } catch (error) {
      console.error('Failed to parse document content:', error)
      parsedContent = ''
    }
    return createEditorConfigFn(parsedContent)
  }, [document.content, createEditorConfigFn])

  // Create editor instance using useEditor hook with config from parent
  const editor = useEditor(editorConfig)

  // Set up onUpdate callback
  useEffect(() => {
    if (!editor || !onUpdate) return
    
    const handleUpdate = () => {
      onUpdate(editor, document.id)
    }
    
    editor.on('update', handleUpdate)
    
    return () => {
      editor.off('update', handleUpdate)
    }
  }, [editor, document.id, onUpdate])

  // Notify parent when editor is created
  useEffect(() => {
    if (editor && !editor.isDestroyed) {
      onEditorCreated(document.id, editor)
    }
  }, [editor, document.id, onEditorCreated])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (editor && !editor.isDestroyed) {
        editor.destroy()
      }
    }
  }, [editor])

  if (!editor) {
    return null
  }

  return (
    <div
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        display: isActive ? 'block' : 'none',
        pointerEvents: isActive ? 'auto' : 'none',
      }}
    >
      <DocumentEditor
        ref={editorRef}
        document={document}
        editor={editor}
        onDocumentChange={onDocumentChange}
        showToolbarOnly={false}
        isAIPanelOpen={isAIPanelOpen}
        aiPanelWidth={aiPanelWidth}
      />
    </div>
  )
}

export default function Layout(): JSX.Element {
  // Add error boundary for component errors
  useEffect(() => {
    const handleError = (error: ErrorEvent) => {
      console.error('[Layout] Global error caught:', error.error)
    }
    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      console.error('[Layout] Unhandled promise rejection:', event.reason)
    }
    
    window.addEventListener('error', handleError)
    window.addEventListener('unhandledrejection', handleUnhandledRejection)
    
    return () => {
      window.removeEventListener('error', handleError)
      window.removeEventListener('unhandledrejection', handleUnhandledRejection)
    }
  }, [])

  // Cleanup notification timeout on unmount
  useEffect(() => {
    return () => {
      if (commitNotificationTimeoutRef.current) {
        clearTimeout(commitNotificationTimeoutRef.current)
        commitNotificationTimeoutRef.current = null
      }
    }
  }, [])

  // Auto-update notifications (Electron)
  useEffect(() => {
    if (typeof window === 'undefined' || !window.electron) {
      return
    }
    const electron = window.electron

    const unsubscribeAvailable = electron.on('update-available', (info: { version?: string }) => {
      if (info?.version && ignoredUpdateVersionRef.current === info.version) {
        return
      }
      setUpdateNotification({ version: info?.version, downloaded: false })
    })

    const unsubscribeDownloaded = electron.on('update-downloaded', (info: { version?: string }) => {
      if (info?.version && ignoredUpdateVersionRef.current === info.version) {
        return
      }
      setUpdateNotification({ version: info?.version, downloaded: true })
      if (installOnDownloadRef.current) {
        installOnDownloadRef.current = false
        electron.invoke('update:install')
        setUpdateNotification(null)
      }
    })

    return () => {
      if (unsubscribeAvailable) {
        unsubscribeAvailable()
      }
      if (unsubscribeDownloaded) {
        unsubscribeDownloaded()
      }
    }
  }, [])

  const handleUpdateNow = () => {
    if (typeof window === 'undefined' || !window.electron || !updateNotification) {
      return
    }
    const electron = window.electron
    if (updateNotification.downloaded) {
      electron.invoke('update:install')
      setUpdateNotification(null)
      return
    }
    installOnDownloadRef.current = true
    electron.invoke('update:download')
  }

  const handleAskLater = () => {
    if (updateNotification?.version) {
      ignoredUpdateVersionRef.current = updateNotification.version
      try {
        localStorage.setItem('lemona:ignored-update-version', updateNotification.version)
      } catch {
        // Ignore storage errors
      }
    }
    setUpdateNotification(null)
  }
  
  const { theme } = useTheme()
  const navigate = useNavigate()
  const { id } = useParams<{ id: string }>()
  const [document, setDocument] = useState<Document | null>(null)
  const [isLoadingDocument, setIsLoadingDocument] = useState(true)
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const titleUpdateTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const titleUpdatedRef = useRef<Set<string>>(new Set()) // Track which documents have had their title auto-updated
  // Map to store DocumentEditor refs for each document (keep them mounted)
  const documentEditorRefsMap = useRef<Map<string, React.MutableRefObject<DocumentEditorSearchHandle | null>>>(new Map())
  
  // Helper to get or create a ref for a document editor
  const getDocumentEditorRef = (docId: string): React.MutableRefObject<DocumentEditorSearchHandle | null> => {
    if (!documentEditorRefsMap.current.has(docId)) {
      documentEditorRefsMap.current.set(docId, { current: null })
    }
    return documentEditorRefsMap.current.get(docId)!
  }
  // Use a mutable ref object for PDF viewer to allow reassignment
  const pdfViewerRef = useRef<PDFViewerSearchHandle | null>(null) as React.MutableRefObject<PDFViewerSearchHandle | null>
  // Map to store PDF Viewer refs for each PDF document (keep them mounted)
  const pdfViewerRefsMap = useRef<Map<string, React.MutableRefObject<PDFViewerSearchHandle | null>>>(new Map())
  
  // Helper to get or create a ref for a PDF document
  const getPdfViewerRef = (docId: string): React.MutableRefObject<PDFViewerSearchHandle | null> => {
    if (!pdfViewerRefsMap.current.has(docId)) {
      pdfViewerRefsMap.current.set(docId, { current: null })
    }
    return pdfViewerRefsMap.current.get(docId)!
  }
  const [isAIPanelOpen, setIsAIPanelOpen] = useState(() => {
    const savedState = loadAIPanelState()
    return savedState.isOpen
  })
  const [aiPanelWidth, setAiPanelWidth] = useState(() => {
    const savedState = loadAIPanelState()
    return savedState.width
  })
  const [documents, setDocuments] = useState<Document[]>([])
  const documentsRef = useRef<Document[]>([]) // Ref to store latest documents for use in callbacks
  const [isLoadingDocuments, setIsLoadingDocuments] = useState(true)
  const [projectName, setProjectName] = useState<string>('LEMONA')
  const [isRenamingProject, setIsRenamingProject] = useState(false)
  const [projectRenameValue, setProjectRenameValue] = useState('')
  
  // Sync documentsRef with documents state
  useEffect(() => {
    documentsRef.current = documents
  }, [documents])
  
  // Load tabs from localStorage on mount
  const [openTabs, setOpenTabs] = useState<Document[]>(() => {
    try {
      const saved = localStorage.getItem('openTabs')
      if (saved) {
        const parsed = JSON.parse(saved)
        return Array.isArray(parsed) ? parsed : []
      }
    } catch (error) {
      console.error('Failed to load tabs from localStorage:', error)
    }
    return []
  })
  const [activeTabId, setActiveTabId] = useState<string | null>(() => {
    try {
      const saved = localStorage.getItem('activeTabId')
      return saved || null
    } catch (error) {
      console.error('Failed to load activeTabId from localStorage:', error)
      return null
    }
  })
  
  // Get setCurrentEditor from EditorContext
  const { setCurrentEditor } = useEditorContext()
  
  // Update EditorContext with current active editor when activeTabId changes
  useEffect(() => {
    if (activeTabId) {
      const currentEditor = getEditor(activeTabId)
      setCurrentEditor(currentEditor)
    } else {
      setCurrentEditor(null)
    }
  }, [activeTabId, setCurrentEditor])
  
  const editorPanelRef = useRef<ImperativePanelHandle>(null)
  const aiPanelRef = useRef<ImperativePanelHandle>(null)
  const fileExplorerPanelRef = useRef<ImperativePanelHandle>(null)
  const resizeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isUserResizingRef = useRef<boolean>(false) // Track if user is actively resizing AI panel
  const isFileExplorerResizingRef = useRef<boolean>(false) // Track if user is actively resizing File Explorer
  const fileExplorerResizeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [fileExplorerSize, setFileExplorerSize] = useState<number>(() => loadFileExplorerSize()) // Track File Explorer size as state
  const [selectedFolder, setSelectedFolder] = useState<'library' | 'project' | 'worldlab' | null>(null) // Track selected folder
  const [isSearchMode, setIsSearchMode] = useState(() => {
    // Restore search mode from sessionStorage if available (persists across navigation)
    try {
      const saved = sessionStorage.getItem('isSearchMode')
      return saved === 'true'
    } catch {
      return false
    }
  }) // Track search mode state
  const [searchQuery, setSearchQuery] = useState(() => {
    // Restore search query from sessionStorage if available (persists across navigation)
    try {
      const saved = sessionStorage.getItem('searchQuery')
      return saved || ''
    } catch {
      return ''
    }
  }) // Track search query for highlighting
  const [showWordCountModal, setShowWordCountModal] = useState(false) // Track word count modal visibility
  const [isExporting, setIsExporting] = useState(false) // Track export loading state
  const [exportFormat, setExportFormat] = useState<'pdf' | 'docx' | null>(null) // Track export format
  const [showCommitSuccessNotification, setShowCommitSuccessNotification] = useState<{ fileCount: number; isIndexing?: boolean } | null>(null) // Track commit success notification
  const commitNotificationTimeoutRef = useRef<NodeJS.Timeout | null>(null) // Track notification auto-hide timeout
  const initialIgnoredUpdateVersion = (() => {
    try {
      return localStorage.getItem('lemona:ignored-update-version')
    } catch {
      return null
    }
  })()
  const [updateNotification, setUpdateNotification] = useState<{ version?: string; downloaded?: boolean } | null>(null)
  const ignoredUpdateVersionRef = useRef<string | null>(initialIgnoredUpdateVersion)
  const installOnDownloadRef = useRef<boolean>(false)
  const [restoredCommitParentId, setRestoredCommitParentId] = useState<string | null>(null) // Track restored commit ID for branch creation
  const [indexingCompletionNotifications, setIndexingCompletionNotifications] = useState<Map<string, { fileName: string; completedAt: number }>>(new Map()) // Track indexing completion notifications
  const [isSeparatorHovered, setIsSeparatorHovered] = useState(false) // Track AI panel separator hover state
  const [isFileExplorerSeparatorHovered, setIsFileExplorerSeparatorHovered] = useState(false) // Track file explorer separator hover state
  // WorldLab state
  const [isWorldLabMode, setIsWorldLabMode] = useState(false) // Track if current document is a WorldLab
  const [worldLabData, setWorldLabData] = useState<WorldLab | null>(null) // WorldLab data
  const [_editingNodeId, setEditingNodeId] = useState<string | null>(null) // Node ID currently being edited (setter used by WorldLabCanvas)
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null) // Currently selected node ID for Terminal
  const [nodeDocumentContent, setNodeDocumentContent] = useState<string | null>(null) // Content for the floating node editor
  const lastContentRef = useRef<string>('') // Track last set content to avoid unnecessary updates
  const currentDocIdRef = useRef<string | null>(null) // Track current document ID
  const [worldLabUndoRedo, setWorldLabUndoRedo] = useState<{
    undo: () => void
    redo: () => void
    canUndo: () => boolean
    canRedo: () => boolean
  } | null>(null) // WorldLab undo/redo handlers
  const currentDocTitleRef = useRef<string | null>(null) // Track current document title for placeholder
  const isLoadingDocumentRef = useRef<boolean>(true) // Track loading state for placeholder
  const isNewlyCreatedDocRef = useRef<boolean>(false) // Track if document was just created (for auto-focus)
  const pendingSearchNavRef = useRef<{ query: string; position: number } | null>(null) // Track pending search navigation
  const isNavigatingFromSearchRef = useRef<boolean>(false) // Track if we're navigating from search results
  const lastRestoredDocIdRef = useRef<string | null>(null) // Track last document ID we restored search state for
  // Store Editor instances for each document (multi-editor architecture)
  const editorsMapRef = useRef<Map<string, Editor>>(new Map())
  
  // Open AI panel by default for first-time users when entering WorldLab mode
  useEffect(() => {
    if (isWorldLabMode && !isAIPanelOpen) {
      // Check if this is a first-time user (no stored AI panel state)
      const stored = localStorage.getItem(AI_PANEL_STORAGE_KEY)
      if (!stored) {
        // First-time user: open the panel
        setIsAIPanelOpen(true)
      }
    }
  }, [isWorldLabMode]) // Only run when WorldLab mode changes
  
  // Helper function to check if document content is empty
  const isDocumentEmpty = (content: any): boolean => {
    if (!content || typeof content !== 'object') return true
    if (!content.content || !Array.isArray(content.content)) return true
    if (content.content.length === 0) return true
    
    // Check if content only has empty paragraphs
    const hasNonEmptyContent = content.content.some((node: any) => {
      if (node.type === 'paragraph') {
        // Paragraph is empty if it has no content or only empty text nodes
        if (!node.content || node.content.length === 0) return false
        return node.content.some((child: any) => {
          if (child.type === 'text') {
            return child.text && child.text.trim().length > 0
          }
          return true // Non-text nodes are considered content
        })
      }
      return true // Non-paragraph nodes are considered content
    })
    
    return !hasNonEmptyContent
  }
  
  // Get editor instance from map (if exists)
  const getEditor = (docId: string): Editor | null => {
    const editor = editorsMapRef.current.get(docId)
    if (editor && !editor.isDestroyed) {
      return editor
    }
    // Remove destroyed editor from map
    if (editor) {
      editorsMapRef.current.delete(docId)
    }
    return null
  }

  // Track last checked document to avoid duplicate logs
  const lastCheckedDocRef = useRef<{ id: string; result: boolean } | null>(null)
  
  // Check if a document is a WorldLab file
  const isWorldLabFile = useCallback((doc: Document | null): boolean => {
    if (!doc) {
      return false
    }
    
    // Check if we already checked this document (avoid duplicate logs)
    if (lastCheckedDocRef.current?.id === doc.id) {
      return lastCheckedDocRef.current.result
    }
    
    let result = false
    
    // Check if folder is 'worldlab'
    if (doc.folder === 'worldlab') {
      result = true
    }
    // Check if title ends with .worldlab or .lab extension
    else if (doc.title.toLowerCase().endsWith('.worldlab') || doc.title.toLowerCase().endsWith('.lab')) {
      result = true
    }
    
    // Cache result and log only once per document
    lastCheckedDocRef.current = { id: doc.id, result }
    
    if (result) {
      console.log(`[WorldLab] ✓ Detected WorldLab file: id=${doc.id}, title="${doc.title}", folder=${doc.folder}`)
    }
    
    return result
  }, [])

  // Extract lab name from document title
  const extractLabName = useCallback((doc: Document): string => {
    if (doc.title.toLowerCase().endsWith('.lab')) {
      return doc.title.slice(0, -4) // Remove .lab extension
    }
    if (doc.title.toLowerCase().endsWith('.worldlab')) {
      return doc.title.slice(0, -10) // Remove .worldlab extension (backward compatibility)
    }
    // If no extension, use title as-is (for folder-based detection)
    return doc.title
  }, [])
  
  // Clear all search highlights (temporary highlights, not saved to document)
  const clearSearchHighlights = (editor: Editor) => {
    if (!editor) return
    
    try {
      const { state, dispatch } = editor.view
      const { tr, doc } = state
      const searchHighlightColors = ['#FFEB3B', '#FDD835', '#fef08a', '#4a5568', '#e3f2fd', '#5a6b7d', '#90caf9']
      const highlightMarkType = state.schema.marks.highlight
      
      if (!highlightMarkType) return
      
      let modified = false
      
      // Iterate through all nodes and remove search highlight marks
      doc.descendants((node, pos) => {
        if (node.marks && node.marks.length > 0) {
          node.marks.forEach(mark => {
            if (mark.type.name === 'highlight') {
              const color = mark.attrs?.color
              if (color && searchHighlightColors.includes(color)) {
                // Remove this specific mark from this node's range
                tr.removeMark(pos, pos + node.nodeSize, mark.type)
                modified = true
              }
            }
          })
        }
      })
      
      if (modified) {
        dispatch(tr)
      }
    } catch (error) {
      console.error('Error clearing search highlights:', error)
    }
  }
  
  // Track manually renamed documents (persisted in localStorage)
  const [manuallyRenamedDocs, setManuallyRenamedDocs] = useState<Set<string>>(() => {
    try {
      const saved = localStorage.getItem('manuallyRenamedDocs')
      if (saved) {
        const parsed = JSON.parse(saved)
        return new Set(Array.isArray(parsed) ? parsed : [])
      }
    } catch (error) {
      console.error('Failed to load manually renamed docs from localStorage:', error)
    }
    return new Set<string>()
  })
  
  // Save manually renamed docs to localStorage whenever it changes
  useEffect(() => {
    try {
      localStorage.setItem('manuallyRenamedDocs', JSON.stringify(Array.from(manuallyRenamedDocs)))
    } catch (error) {
      console.error('Failed to save manually renamed docs to localStorage:', error)
    }
  }, [manuallyRenamedDocs])
  
  const bgColor = theme === 'dark' ? '#141414' : '#ffffff'
  const borderColor = theme === 'dark' ? '#232323' : '#e8eaed'
  const secondaryTextColor = theme === 'dark' ? '#858585' : '#5f6368'

  // Sync loading state ref for placeholder
  useEffect(() => {
    isLoadingDocumentRef.current = isLoadingDocument
  }, [isLoadingDocument])

  // Restore search mode and query from sessionStorage when document changes (after navigation)
  useEffect(() => {
    // Only restore once per document change
    if (document?.id === lastRestoredDocIdRef.current) {
      return
    }
    
    // Check sessionStorage for persisted search mode state
    try {
      const savedSearchMode = sessionStorage.getItem('isSearchMode')
      const savedQuery = sessionStorage.getItem('searchQuery')
      
      // Use functional updates to avoid dependency issues
      if (savedSearchMode === 'true') {
        setIsSearchMode((prev) => {
          if (!prev) {
            return true
          }
          return prev
        })
        if (savedQuery) {
          setSearchQuery((prev) => {
            if (prev !== savedQuery) {
              return savedQuery
            }
            return prev
          })
        }
      } else if (savedSearchMode === 'false') {
        setIsSearchMode((prev) => {
          if (prev) {
            return false
          }
          return prev
        })
        setSearchQuery((prev) => {
          if (prev) {
            return ''
          }
          return prev
        })
        try {
          sessionStorage.removeItem('searchQuery')
        } catch (e) {
          console.warn('Failed to clear search query from sessionStorage:', e)
        }
      }
      
      lastRestoredDocIdRef.current = document?.id || null
    } catch (e) {
      console.warn('Failed to restore search mode:', e)
    }
  }, [document?.id]) // Run when document changes (navigation)

  // Save document immediately (used when switching documents or leaving page)
  // Must be defined before useEffect hooks that use it
  const saveDocumentImmediately = useCallback(async (docId: string) => {
    const editor = getEditor(docId)
    if (!editor || editor.isDestroyed) return
    
    try {
      const content = editor.getJSON()
      const contentString = JSON.stringify(content)
      
      // Update document in backend
      await documentApi.update(docId, contentString)
      
      // Update local documents state
      setDocuments(prevDocs => {
        return prevDocs.map(doc => 
          doc.id === docId 
            ? { ...doc, content: contentString, updatedAt: new Date().toISOString() }
            : doc
        )
      })
      
      // Update open tabs
      setOpenTabs(prevTabs => {
        return prevTabs.map(tab => 
          tab.id === docId 
            ? { ...tab, content: contentString, updatedAt: new Date().toISOString() }
            : tab
        )
      })
      
    } catch (error) {
      console.error('[Layout] Failed to save document:', error)
    }
  }, [])

  // Load document when route parameter changes
  useEffect(() => {
    if (id) {
      // When switching documents, keep the UI visible for smooth transition
      // Only set loading state if we're switching to a different document
      // Also check if we're already loading this document to prevent duplicate calls
      if ((!document || document.id !== id) && isLoadingDocRef.current !== id) {
        
        // Save current document before switching
        if (document?.id) {
          // Clear any pending debounced saves and save immediately
          if (saveTimeoutRef.current) {
            clearTimeout(saveTimeoutRef.current)
            saveTimeoutRef.current = null
          }
          
          // Save WorldLab changes if in WorldLab mode
          if (isWorldLabMode && worldLabData) {
            saveWorldLabChangesImmediately(worldLabData)
          } else {
            saveDocumentImmediately(document.id)
          }
        }
        
        // Clear search state in current editor before switching tabs
        const isPDF = document?.title.toLowerCase().endsWith('.pdf')
        if (isPDF && pdfViewerRef.current) {
          pdfViewerRef.current.clearSearch()
        } else if (!isPDF && document) {
          const docEditorRef = getDocumentEditorRef(document.id)
          if (docEditorRef.current) {
            docEditorRef.current.clearSearch()
          }
        }
        
        // Clear newly created flag when switching to a different document
        // (unless this is the newly created document itself)
        if (document && document.id !== id) {
          isNewlyCreatedDocRef.current = false
        }
        
        setIsLoadingDocument(true)
        loadDocument(id).catch((error) => {
          console.error('Error loading document:', error)
          // Ensure loading state is cleared even on error
          setIsLoadingDocument(false)
        })
      }
      // Update active tab when route changes
      setActiveTabId(id)
    } else {
      // Save current document before leaving
      if (document?.id) {
        // Clear any pending debounced saves and save immediately
        if (saveTimeoutRef.current) {
          clearTimeout(saveTimeoutRef.current)
          saveTimeoutRef.current = null
        }
        
        // Save WorldLab changes if in WorldLab mode
        if (isWorldLabMode && worldLabData) {
          saveWorldLabChangesImmediately(worldLabData)
        } else {
          saveDocumentImmediately(document.id)
        }
      }
      
      // Clear search state when closing all tabs
      if (document) {
        const isPDF = document.title.toLowerCase().endsWith('.pdf')
        if (isPDF && pdfViewerRef.current) {
          pdfViewerRef.current.clearSearch()
        } else if (!isPDF) {
          const docEditorRef = getDocumentEditorRef(document.id)
          if (docEditorRef.current) {
            docEditorRef.current.clearSearch()
          }
        }
      }
      setDocument(null)
      setIsLoadingDocument(false)
      setActiveTabId(null)
    }
  }, [id, saveDocumentImmediately])

  // Add document to tabs when it loads
  useEffect(() => {
    if (document && !openTabs.find(tab => tab.id === document.id)) {
      setOpenTabs(prevTabs => [...prevTabs, document])
      setActiveTabId(document.id)
    } else if (document) {
      // Update tab if document changes (e.g., title update)
      setOpenTabs(prevTabs => 
        prevTabs.map(tab => tab.id === document.id ? document : tab)
      )
    }
  }, [document])

  // Track last loaded document to avoid duplicate loads
  const lastLoadedDocIdRef = useRef<string | null>(null)
  const isLoadingDocRef = useRef<string | null>(null)
  
  const loadDocument = async (docId: string) => {
    // Prevent duplicate loads - check if we're already loading or just loaded this document
    if (isLoadingDocRef.current === docId) {
      return // Already loading this document
    }
    
    // Only skip if we just loaded this exact document (allow reload if document changed)
    if (lastLoadedDocIdRef.current === docId && document?.id === docId) {
      return // Already loaded and document state matches
    }
    
    isLoadingDocRef.current = docId
    
    try {
      console.log(`[Layout] → Loading document: ${docId}`)
      // Retry logic for newly created documents (increased retries and delay for file system sync)
      let doc = await documentApi.get(docId)
      let retries = 5 // Increased from 3 to 5
      
      while (!doc && retries > 0) {
        // Increased delay from 200ms to 300ms for better file system sync
        await new Promise(resolve => setTimeout(resolve, 300))
        doc = await documentApi.get(docId)
        retries--
      }
      
      if (!doc || !doc.id) {
        console.error('[Layout] ✗ Document not found or invalid:', docId)
        isLoadingDocRef.current = null
        // Don't navigate away immediately - let the fallback useEffect try to load documents
        // This allows the file explorer to show other documents in the project
        setDocument(null)
        setIsLoadingDocument(false)
        // Only navigate away if we can't determine the project from open tabs
        const matchingTab = openTabs.find(tab => tab.id === docId)
        if (!matchingTab?.projectId) {
          // No project context available, navigate away
        navigate('/documents')
        }
        return
      }
      
      console.log(`[Layout] ✓ Loaded: "${doc.title}" (${doc.folder || 'project'})`)
      
      // Mark as loaded only after successful load
      lastLoadedDocIdRef.current = docId
      
      // Check if PDF needs text extraction
      const isPDF = doc.title.toLowerCase().endsWith('.pdf')
      if (isPDF && !doc.pdfText) {
        // Set document first so PDF viewer can render
        if (id === docId) {
          setDocument(doc)
          setIsWorldLabMode(false)
          setWorldLabUndoRedo(null)
        }
        
        try {
          // Trigger PDF text extraction (this will update the document file)
          await documentApi.extractPDFText(docId)
          
          // Reload document to get updated version with pdfText
          // Wait a moment for file write to complete
          await new Promise(resolve => setTimeout(resolve, 200))
          const updatedDoc = await documentApi.get(docId)
          
          if (updatedDoc && id === docId) {
            setDocument(updatedDoc)
          }
        } catch (extractionError) {
          console.error('[PDF] Failed to extract PDF text:', extractionError)
          // Document is already set, extraction will retry on next load if needed
        }
      } else if (isWorldLabFile(doc)) {
        // WorldLab file - load Lab data
        if (id === docId) {
          setDocument(doc)
          setIsWorldLabMode(true)
          setEditingNodeId(null)
          setNodeDocumentContent(null)
          
          try {
            const labName = extractLabName(doc)
            const projectId = doc.projectId || ''
            console.log(`[WorldLab] → Loading Lab: "${labName}" in project: ${projectId}`)
            
            if (!projectId) {
              console.warn(`[WorldLab] ⚠ No projectId for WorldLab file, cannot load`)
              if (id === docId) {
                setIsWorldLabMode(false)
              }
              return
            }
            
            const worldLab = await worldLabApi.load(labName, projectId)
            
            if (worldLab && id === docId) {
              setWorldLabData(worldLab)
              console.log(`[WorldLab] ✓ Loaded: ${worldLab.nodes.length} nodes, ${worldLab.edges.length} edges`)
            } else if (!worldLab && id === docId) {
              console.warn(`[WorldLab] ⚠ Lab not found, using empty structure: ${labName}`)
              // Even if Lab doesn't exist, we can still show empty canvas
              // Create empty WorldLab data structure
              const emptyWorldLab: WorldLab = {
                labPath: '',
                labName,
                metadata: {
                  createdAt: new Date().toISOString(),
                  updatedAt: new Date().toISOString(),
                },
                nodes: [],
                edges: [],
              }
              setWorldLabData(emptyWorldLab)
            }
          } catch (error) {
            console.error('[WorldLab] ✗ Error loading Lab:', error)
            if (id === docId) {
              setIsWorldLabMode(false)
            }
          }
        }
      } else {
        // Not a PDF or WorldLab - regular document
        // Only update document if this is still the current route
        // This prevents race conditions when rapidly switching files
        if (id === docId) {
          setDocument(doc)
          setIsWorldLabMode(false)
          setWorldLabUndoRedo(null)
          setEditingNodeId(null)
          setNodeDocumentContent(null)
        }
      }
      
      // Save last opened document ID per project
      if (doc?.projectId) {
        try {
          localStorage.setItem(`lastDocument_${doc.projectId}`, docId)
        } catch (error) {
          console.error('Failed to save last document:', error)
        }
      }
    } catch (error) {
      console.error('[Layout] ✗ Failed to load document:', error)
      isLoadingDocRef.current = null
      // Only clear document if this is still the current route
      if (id === docId) {
        setDocument(null)
        navigate('/documents')
      }
    } finally {
      // Clear loading flag
      if (isLoadingDocRef.current === docId) {
        isLoadingDocRef.current = null
      }
      // Only clear loading state if this is still the current route
      if (id === docId) {
        setIsLoadingDocument(false)
      }
    }
  }

  // Track previous projectId to detect changes
  const previousProjectIdRef = useRef<string | undefined>(undefined)
  
  // Load project name immediately for shell UI, then load documents
  useEffect(() => {
    const currentProjectId = document?.projectId
    
    // Function to load project name from API (always fresh)
    const loadProjectName = () => {
      if (currentProjectId) {
        projectApi.getById(currentProjectId)
          .then(project => {
            if (project) {
              setProjectName(project.title)
            } else {
              setProjectName('LEMONA')
            }
          })
          .catch(() => {
            setProjectName('LEMONA')
          })
      } else {
        setProjectName('LEMONA')
      }
    }
    
    // Only clear and reload if projectId actually changed
    if (previousProjectIdRef.current !== currentProjectId) {
      // Clear documents immediately when project changes to prevent showing stale data
      setDocuments([])
      setIsLoadingDocuments(true)
      
      // Load project name immediately for instant shell UI
      loadProjectName()
      
      // Clear tabs that don't belong to the current project
      setOpenTabs(prevTabs => {
        if (currentProjectId) {
          // Filter out tabs that don't belong to the current project
          const filteredTabs = prevTabs.filter(tab => tab.projectId === currentProjectId)
          
          // If active tab doesn't belong to current project, clear it
          if (activeTabId && !filteredTabs.find(tab => tab.id === activeTabId)) {
            setActiveTabId(null)
          }
          
          return filteredTabs
        } else {
          // No project selected, clear all tabs
          setActiveTabId(null)
          return []
        }
      })
      
      previousProjectIdRef.current = currentProjectId
      // Pass the projectId explicitly to ensure we load the correct project's documents
      loadDocuments(currentProjectId)
      
      // Auto-index library files for this project when project changes
      // This happens asynchronously and doesn't block UI
      if (currentProjectId) {
        // Check if Smart indexing is enabled
        settingsApi.getSmartIndexing().then((smartIndexingEnabled) => {
          if (!smartIndexingEnabled) {
            console.log(`[Auto-Indexing] Smart indexing is disabled, skipping automatic indexing for project ${currentProjectId}`)
            return
          }
          
          // Get API keys and trigger indexing
          settingsApi.getApiKeys().then((keys) => {
            const hasApiKey = (keys.geminiApiKey && keys.geminiApiKey.trim().length > 0) ||
                             (keys.openaiApiKey && keys.openaiApiKey.trim().length > 0)
            
            if (hasApiKey) {
              console.log(`[Auto-Indexing] Project ${currentProjectId} opened, starting library file indexing...`)
              indexingApi.indexProjectLibraryFiles(
                currentProjectId,
                keys.geminiApiKey,
                keys.openaiApiKey,
                true // onlyUnindexed = true
              ).then((results: Array<{ documentId: string; status: IndexingStatus }>) => {
                const successCount = results.filter((r: { documentId: string; status: IndexingStatus }) => r.status.status === 'completed').length
                const errorCount = results.filter((r: { documentId: string; status: IndexingStatus }) => r.status.status === 'error').length
                if (successCount > 0 || errorCount > 0) {
                  console.log(`[Auto-Indexing] Completed indexing for project ${currentProjectId}: ${successCount} succeeded, ${errorCount} errors`)
                }
              }).catch((error) => {
                // Don't show error to user - indexing failures shouldn't interrupt workflow
                console.warn(`[Auto-Indexing] Failed to index project ${currentProjectId}:`, error)
              })
            }
          }).catch((error) => {
            console.warn('[Auto-Indexing] Failed to get API keys:', error)
          })
        }).catch((error) => {
          console.warn('[Auto-Indexing] Failed to get Smart indexing setting:', error)
          // If we can't get the setting, skip indexing (default is disabled)
          console.log(`[Auto-Indexing] Smart indexing setting unavailable, skipping automatic indexing for project ${currentProjectId}`)
        })
      }
    } else {
      // Even if projectId didn't change, reload project name to catch any updates
      loadProjectName()
    }
    
    // Listen for project rename events to refresh project name
    const handleProjectRenameEvent = (event: CustomEvent) => {
      if (event.detail?.projectId === currentProjectId) {
        loadProjectName()
      }
    }
    
    window.addEventListener('projectRenamed', handleProjectRenameEvent as EventListener)
    
    return () => {
      window.removeEventListener('projectRenamed', handleProjectRenameEvent as EventListener)
    }
  }, [document?.projectId, activeTabId]) // Reload when project changes

  // Also try to load documents when we have an id but no document yet (e.g., document failed to load)
  // This ensures the file explorer shows documents even if the current document doesn't load
  useEffect(() => {
    // Only run if we have an id but no document, and documents haven't been loaded yet
    if (id && !document && documents.length === 0 && !isLoadingDocuments) {
      // Try to get projectId from open tabs that match this id
      const matchingTab = openTabs.find(tab => tab.id === id)
      if (matchingTab?.projectId) {
        // Load documents for this project
        loadDocuments(matchingTab.projectId)
      } else {
        // Fallback: load all documents if we can't determine the project
        loadDocuments(undefined)
      }
    }
  }, [id, document, documents.length, isLoadingDocuments, openTabs])

  // Set selected folder based on current document's folder
  useEffect(() => {
    if (document?.folder === 'library') {
      setSelectedFolder('library')
    } else if (document?.folder === 'worldlab') {
      setSelectedFolder('worldlab')
    } else if (document && (!document.folder || document.folder === 'project')) {
      setSelectedFolder('project')
    }
    // Don't clear selectedFolder if document is null - keep it for creating new files
  }, [document?.folder])

  // Keyboard shortcuts: Ctrl+F for inline search, Ctrl+Shift+F for global search, Ctrl+Shift+E to toggle FileExplorer
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Check if Ctrl+F (or Cmd+F on Mac) - toggle inline search in active surface
      // Handle this even when input is focused (to allow closing search with Ctrl+F)
      if ((e.ctrlKey || e.metaKey) && (e.key === 'f' || e.key === 'F') && !e.shiftKey) {
        // Check if target is a search input - if so, allow closing with Ctrl+F
        const target = e.target as HTMLElement
        const isSearchInput = target.closest('[data-search-input]') !== null
        
        // Check if event is from an iframe (PDF viewer) - handle it
        const isFromIframe = target.tagName === 'IFRAME' || target.closest('iframe') !== null
        // Also check if active element is an iframe (when iframe content has focus)
        // Use window.document to access the DOM document (not the component's document state)
        const activeElementIsIframe = window.document.activeElement?.tagName === 'IFRAME'
        
        // Check if target is contentEditable (TipTap editor)
        const isContentEditable = target.isContentEditable || target.closest('[contenteditable="true"]') !== null
        
        // Check if target is a regular input/textarea (not contentEditable, not search input)
        const isRegularInput = (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) && !isSearchInput
        
        // Only handle Ctrl+F if:
        // 1. It's a search input (to allow closing)
        // 2. It's from/active in iframe (PDF viewer)
        // 3. It's contentEditable (TipTap editor) - ALWAYS handle for editor
        // 4. It's NOT a regular input/textarea (unless it's a search input)
        if (isSearchInput || isFromIframe || activeElementIsIframe || isContentEditable || !isRegularInput) {
          e.preventDefault()
          e.stopPropagation()
          
          // Determine active surface and delegate
          const isPDF = document && document.title.toLowerCase().endsWith('.pdf')
          if (isPDF && pdfViewerRef.current) {
            pdfViewerRef.current.toggleSearch()
          } else if (!isPDF && document) {
            // Use getDocumentEditorRef for multi-editor architecture
            const docEditorRef = getDocumentEditorRef(document.id)
            if (docEditorRef.current) {
              docEditorRef.current.toggleSearch()
            }
          }
        }
        return
      }
      
      // Check if Ctrl+Shift+E (or Cmd+Shift+E on Mac) - toggle FileExplorer
      // Handle this even when input/textarea is focused (to allow toggling from anywhere)
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'E' || e.key === 'e')) {
        e.preventDefault()
        e.stopPropagation()
        if (fileExplorerPanelRef.current) {
          const currentSize = fileExplorerPanelRef.current.getSize()
          if (currentSize > 0) {
            // Closing: save current size for next time
            saveFileExplorerLastOpenSize(currentSize)
            fileExplorerPanelRef.current.resize(0)
          } else {
            // Opening: restore last open size
            const lastOpenSize = loadFileExplorerLastOpenSize()
            fileExplorerPanelRef.current.resize(lastOpenSize)
          }
        }
        return
      }
      
      // Don't prevent default for other shortcuts if typing in an input field or textarea
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return
      }
      
      // Check if Ctrl+Shift+F (or Cmd+Shift+F on Mac) - activate global search mode
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'f' || e.key === 'F')) {
        e.preventDefault()
        e.stopPropagation()
        setIsSearchMode((prev) => {
          const newValue = !prev
          // Persist search mode state
          try {
            if (newValue) {
              sessionStorage.setItem('isSearchMode', 'true')
              // Keep existing search query if there is one
              if (searchQuery) {
                sessionStorage.setItem('searchQuery', searchQuery)
              }
            } else {
              // User explicitly turned off search mode - clear everything
              sessionStorage.setItem('isSearchMode', 'false')
              sessionStorage.removeItem('searchQuery')
              setSearchQuery('') // Clear the query state
              // Clear highlights immediately when search mode is turned off
              if (document?.id) {
                const currentEditor = getEditor(document.id)
                if (currentEditor && !currentEditor.isDestroyed) {
                  clearSearchHighlights(currentEditor)
                }
              }
            }
          } catch (e) {
            console.warn('Failed to persist search mode:', e)
          }
          // Ensure FileExplorer is visible when entering search mode
          if (newValue && fileExplorerPanelRef.current) {
            const currentSize = fileExplorerPanelRef.current.getSize()
            if (currentSize === 0) {
              // Restore last open size when opening for search mode
              const lastOpenSize = loadFileExplorerLastOpenSize()
              fileExplorerPanelRef.current.resize(lastOpenSize)
            }
          }
          return newValue
        })
        return
      }
      
      // Check if Ctrl+Shift+C (or Cmd+Shift+C on Mac) - show word count modal
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'c' || e.key === 'C')) {
        // Don't show if typing in an input field or textarea
        if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
          return
        }
        // Only show word count for text documents (not PDFs)
        const isPDF = document && document.title.toLowerCase().endsWith('.pdf')
        if (!isPDF && document?.id) {
          const currentEditor = getEditor(document.id)
          if (currentEditor) {
          e.preventDefault()
          e.stopPropagation()
          setShowWordCountModal(true)
          }
        }
        return
      }
      
      // Check if Ctrl+S (or Cmd+S on Mac) - create commit
      if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'S') && !e.shiftKey) {
        // Don't create commit if typing in an input field or textarea (unless it's contentEditable)
        const target = e.target as HTMLElement
        const isContentEditable = target.isContentEditable || target.closest('[contenteditable="true"]') !== null
        const isRegularInput = (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) && !isContentEditable
        
        if (isRegularInput) {
          return // Allow default browser save for regular inputs
        }
        
        e.preventDefault()
        e.stopPropagation()
        
        // Only create commit if we have a project
        const currentProjectId = document?.projectId
        if (!currentProjectId) {
          return // No project, skip commit creation
        }
        
        // Get all workspace documents (exclude library and worldlab files)
        // Workspace files are those with folder === 'project' or folder === undefined/null
        const workspaceDocs = documents.filter(doc => 
          doc.projectId === currentProjectId && 
          (doc.folder === 'project' || doc.folder === undefined || doc.folder === null)
        )
        
        if (workspaceDocs.length === 0) {
          return // No workspace documents to commit
        }
        
        // Capture current content for all workspace documents
        const documentSnapshots: DocumentSnapshot[] = []
        
        for (const doc of workspaceDocs) {
          // Try to get content from editor first (most up-to-date)
          const editor = getEditor(doc.id)
          let content: string
          
          if (editor && !editor.isDestroyed) {
            // Get content from editor
            const editorContent = editor.getJSON()
            content = JSON.stringify(editorContent)
          } else {
            // Fallback to document content from state
            content = doc.content || JSON.stringify({ type: 'doc', content: [] })
          }
          
          documentSnapshots.push({
            documentId: doc.id,
            title: doc.title,
            content: content,
          })
        }
        
        // Create commit asynchronously
        ;(async () => {
          try {
            // Determine parent commit ID
            let parentId: string | null = null
            
            if (restoredCommitParentId) {
              // Use restored commit as parent (branch creation)
              parentId = restoredCommitParentId
            } else {
              // Get HEAD commit as parent
              const headCommit = await versionApi.getHeadCommit(currentProjectId)
              parentId = headCommit?.id ?? null
            }
            
            // Filter out documents that haven't changed compared to parent commit
            let filteredSnapshots: DocumentSnapshot[] = documentSnapshots
            
            if (parentId) {
              try {
                const parentCommit = await versionApi.getCommit(currentProjectId, parentId)
                
                if (parentCommit && parentCommit.documentSnapshots.length > 0) {
                  // Create a map of parent commit snapshots by document ID
                  const parentSnapshotsMap = new Map<string, DocumentSnapshot>()
                  parentCommit.documentSnapshots.forEach((snapshot: DocumentSnapshot) => {
                    parentSnapshotsMap.set(snapshot.documentId, snapshot)
                  })
                  
                  // Filter out snapshots that are identical to parent commit
                  filteredSnapshots = documentSnapshots.filter(snapshot => {
                    const parentSnapshot = parentSnapshotsMap.get(snapshot.documentId)
                    
                    if (!parentSnapshot) {
                      // Document not in parent commit, include it
                      return true
                    }
                    
                    // Compare content
                    const currentContent = snapshot.content || ''
                    const parentContent = parentSnapshot.content || ''
                    
                    if (currentContent === parentContent) {
                      // Content unchanged, exclude from commit
                      return false
                    } else {
                      // Content changed, include in commit
                      return true
                    }
                  })
                }
              } catch (error) {
                // If we can't load parent commit, include all documents to be safe
              }
            }
            
            // Only create commit if there are changed documents
            if (filteredSnapshots.length === 0) {
              return
            }
            
            // Create commit with filtered snapshots
            await versionApi.createCommit(currentProjectId, filteredSnapshots, parentId)
            
            // Clear restored commit parent after successful commit
            setRestoredCommitParentId(null)
            
            // Trigger incremental indexing for workspace documents (async, non-blocking)
            // Only index documents that were included in the commit (filteredSnapshots)
            const workspaceDocumentIds = filteredSnapshots
              .map(snapshot => {
                const doc = documents.find(d => d.id === snapshot.documentId)
                return doc && doc.folder === 'project' ? doc.id : null
              })
              .filter((id): id is string => id !== null)

            // Check if indexing will happen
            let willIndex = false
            if (workspaceDocumentIds.length > 0) {
              try {
                const keys = await settingsApi.getApiKeys()
                const geminiApiKey = keys.geminiApiKey || undefined
                const openaiApiKey = keys.openaiApiKey || undefined
                willIndex = !!(geminiApiKey || openaiApiKey)
              } catch (error) {
                willIndex = false
              }
            }

            // Clear any existing notification timeout
            if (commitNotificationTimeoutRef.current) {
              clearTimeout(commitNotificationTimeoutRef.current)
              commitNotificationTimeoutRef.current = null
            }

            // Show success notification
            // If indexing will happen, show "Indexing..." state, otherwise show with 0 files
            setShowCommitSuccessNotification({ 
              fileCount: 0, 
              isIndexing: willIndex && workspaceDocumentIds.length > 0 
            })
            
            // Only set auto-hide timer if indexing won't happen
            // If indexing will happen, the timer will be set after indexing completes
            if (!willIndex || workspaceDocumentIds.length === 0) {
              commitNotificationTimeoutRef.current = setTimeout(() => {
                setShowCommitSuccessNotification(null)
                commitNotificationTimeoutRef.current = null
              }, 3000)
            }

            if (workspaceDocumentIds.length > 0 && willIndex) {
              // Get API keys for indexing
              try {
                const keys = await settingsApi.getApiKeys()
                const geminiApiKey = keys.geminiApiKey || undefined
                const openaiApiKey = keys.openaiApiKey || undefined

                // Trigger incremental indexing asynchronously (don't await, don't block UI)
                indexingApi.incrementalIndexProjectFiles(
                  currentProjectId,
                  workspaceDocumentIds,
                  geminiApiKey,
                  openaiApiKey
                ).then((results: Array<{ documentId: string; status: IndexingStatus }>) => {
                  const successCount = results.filter((r: { documentId: string; status: IndexingStatus }) => r.status.status === 'completed').length
                  const errorCount = results.filter((r: { documentId: string; status: IndexingStatus }) => r.status.status === 'error').length
                  
                  // Clear any existing timeout before updating notification
                  if (commitNotificationTimeoutRef.current) {
                    clearTimeout(commitNotificationTimeoutRef.current)
                    commitNotificationTimeoutRef.current = null
                  }
                  
                  if (successCount > 0) {
                    console.log(`[Indexing] Incrementally indexed ${successCount} workspace document(s)`)
                    // Update notification with actual indexed count (no longer indexing)
                    setShowCommitSuccessNotification({ fileCount: successCount, isIndexing: false })
                    // Set auto-hide timer after indexing completes
                    commitNotificationTimeoutRef.current = setTimeout(() => {
                      setShowCommitSuccessNotification(null)
                      commitNotificationTimeoutRef.current = null
                    }, 3000)
                  } else {
                    // No files indexed successfully, hide notification after a short delay
                    setShowCommitSuccessNotification({ fileCount: 0, isIndexing: false })
                    commitNotificationTimeoutRef.current = setTimeout(() => {
                      setShowCommitSuccessNotification(null)
                      commitNotificationTimeoutRef.current = null
                    }, 2000)
                  }
                  
                  if (errorCount > 0) {
                    console.warn(`[Indexing] Failed to index ${errorCount} workspace document(s)`)
                  }
                }).catch((error) => {
                  // Don't show error to user - indexing failure shouldn't affect commit
                  console.warn('[Indexing] Incremental indexing failed (non-blocking):', error)
                  
                  // Clear indexing state and hide notification after a short delay
                  if (commitNotificationTimeoutRef.current) {
                    clearTimeout(commitNotificationTimeoutRef.current)
                    commitNotificationTimeoutRef.current = null
                  }
                  setShowCommitSuccessNotification({ fileCount: 0, isIndexing: false })
                  commitNotificationTimeoutRef.current = setTimeout(() => {
                    setShowCommitSuccessNotification(null)
                    commitNotificationTimeoutRef.current = null
                  }, 2000)
                })
              } catch (error) {
                // Silently fail - API key retrieval failure shouldn't affect commit
                console.warn('[Indexing] Failed to get API keys for incremental indexing:', error)
                
                // Clear indexing state and hide notification
                if (commitNotificationTimeoutRef.current) {
                  clearTimeout(commitNotificationTimeoutRef.current)
                  commitNotificationTimeoutRef.current = null
                }
                setShowCommitSuccessNotification({ fileCount: 0, isIndexing: false })
                commitNotificationTimeoutRef.current = setTimeout(() => {
                  setShowCommitSuccessNotification(null)
                  commitNotificationTimeoutRef.current = null
                }, 2000)
              }
            }
          } catch (error) {
            // Could show error notification here
          }
        })()
        
        return
      }
      
      // Check if Ctrl+W (or Cmd+W on Mac) - close current tab
      if ((e.ctrlKey || e.metaKey) && (e.key === 'w' || e.key === 'W') && !e.shiftKey) {
        // Don't close if typing in an input field or textarea
        if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
          return
        }
        
        e.preventDefault()
        e.stopPropagation()
        
        // Close the active tab if there is one and there's more than one tab
        if (activeTabId && openTabs.length > 1) {
          const docIdToClose = activeTabId
          
          setOpenTabs(prevTabs => {
            const newTabs = prevTabs.filter(tab => tab.id !== docIdToClose)
            
            // Clear scroll position for the closed tab
            try {
              localStorage.removeItem(`documentScroll_${docIdToClose}`)
              localStorage.removeItem(`pdfPage_${docIdToClose}`)
            } catch (error) {
              console.error('Failed to clear scroll position:', error)
            }
            
            // Remove PDF Viewer ref when tab is closed
            pdfViewerRefsMap.current.delete(docIdToClose)
            
            // Switch to another tab
            if (newTabs.length > 0) {
              const closedIndex = prevTabs.findIndex(tab => tab.id === docIdToClose)
              const targetIndex = closedIndex > 0 ? closedIndex - 1 : 0
              const targetTab = newTabs[targetIndex] || newTabs[0]
              setActiveTabId(targetTab.id)
              navigate(`/document/${targetTab.id}`)
            } else {
              // No tabs left, navigate to document list
              setActiveTabId(null)
              navigate('/documents')
            }
            
            return newTabs
          })
        }
        return
      }
    }

    // Use capture phase to catch events before they reach the editor
    window.addEventListener('keydown', handleKeyDown, true)
    return () => window.removeEventListener('keydown', handleKeyDown, true)
  }, [searchQuery, document, activeTabId, openTabs])

  const loadDocuments = async (projectId?: string) => {
    // Note: documents are already cleared in useEffect when projectId changes
    // Note: project name is already loaded in useEffect for instant shell UI
    // Set loading state
    setIsLoadingDocuments(true)
    
    try {
      // Use provided projectId or fall back to current document's projectId
      const targetProjectId = projectId ?? document?.projectId
      
      // If we have a projectId, load project's documents
      if (targetProjectId) {
        const docs = await projectApi.getDocuments(targetProjectId)
        // Sort by order (creation order) instead of updatedAt
        const sortedDocs = docs.sort((a: any, b: any) => {
          if (a.order !== undefined && b.order !== undefined) {
            return a.order - b.order
          }
          // Fallback to creation time if no order
          return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
        })
        const docsToSet = Array.isArray(sortedDocs) ? sortedDocs : []
        setDocuments(docsToSet)
      } else {
        // No project, show all documents
        const docs = await documentApi.list()
        setDocuments(Array.isArray(docs) ? docs : [])
      }
    } catch (error) {
      console.error('[Layout] Failed to load documents:', error)
      setDocuments([])
    } finally {
      setIsLoadingDocuments(false)
    }
  }

  const handleDocumentClick = (docId: string, searchQueryParam?: string, matchPosition?: number) => {
    try {
    // If called from search results, ensure search mode stays active
    const wasCalledFromSearch = !!searchQueryParam
    
    if (searchQueryParam) {
      // Mark that we're navigating from search results BEFORE loading doc
      // This prevents focus attempts from interrupting navigation
      isNavigatingFromSearchRef.current = true
      
      // Use the query from the clicked result, but prefer current query if it exists and is different
      // This ensures we preserve the user's search query when clicking results
      const queryToUse = searchQuery && searchQuery.trim() ? searchQuery : searchQueryParam
      
      // Update query if it's different from current
      if (queryToUse !== searchQuery) {
        setSearchQuery(queryToUse)
      }
      
      // Persist search mode to sessionStorage so it survives navigation/remount
      try {
        sessionStorage.setItem('isSearchMode', 'true')
        // Always persist the current query (either from state or from clicked result)
        sessionStorage.setItem('searchQuery', queryToUse)
      } catch (e) {
        // Silently fail
      }
      
      // Update searchQueryParam to use the preserved query for navigation
      searchQueryParam = queryToUse
    }
    
    // Store match position for navigation after document loads
    if (matchPosition !== undefined && searchQueryParam) {
      pendingSearchNavRef.current = { query: searchQueryParam, position: matchPosition }
      
      // ALSO store in sessionStorage as backup (survives re-renders)
      try {
        sessionStorage.setItem('pendingSearchNav', JSON.stringify({
          query: searchQueryParam,
          position: matchPosition,
          targetDocId: docId
        }))
      } catch (e) {
        // Silently fail
      }
      
      // If clicking on same document, navigate immediately without waiting for document load
      if (document?.id === docId) {
        const currentEditor = getEditor(docId)
        if (currentEditor && !currentEditor.isDestroyed) {
        setTimeout(() => {
            const editorInstance = getEditor(docId)
            if (editorInstance && !editorInstance.isDestroyed && searchQueryParam) {
              navigateToMatch(editorInstance, searchQueryParam, matchPosition)
            // Clear pending nav since we've used it
            pendingSearchNavRef.current = null
            try {
              sessionStorage.removeItem('pendingSearchNav')
            } catch (e) {
              // Silently fail
            }
          }
        }, 100)
        }
        // Don't navigate() since we're already on this document
        // But still ensure search mode is active
        if (wasCalledFromSearch) {
          setIsSearchMode(true)
        }
        return
      }
    }
    
    // Ensure search mode stays active when clicking search results
    if (wasCalledFromSearch) {
      setIsSearchMode(true)
    }
    
    // Add or update tab when opening a document
    const clickedDoc = documents.find(doc => doc.id === docId)
    if (clickedDoc) {
      setOpenTabs(prevTabs => {
        // Check if tab already exists
        const existingTabIndex = prevTabs.findIndex(tab => tab.id === docId)
        if (existingTabIndex >= 0) {
          // Tab exists, just set it as active
          setActiveTabId(docId)
          return prevTabs
        } else {
          // Add new tab
          const newTabs = [...prevTabs, clickedDoc]
          setActiveTabId(docId)
          return newTabs
        }
      })
    }
    
    // Always navigate, even if it's the current document (for different document case)
    try {
    navigate(`/document/${docId}`)
    } catch (error) {
      console.error('[Layout] Error navigating to document:', error)
    }
    } catch (error) {
      console.error('[Layout] Error in handleDocumentClick:', error)
    }
  }

  // Handle tab click (switch to tab)
  const handleTabClick = (docId: string) => {
    setActiveTabId(docId)
    navigate(`/document/${docId}`)
  }

  // Handle tab close
  const handleTabClose = (e: React.MouseEvent, docId: string) => {
    e.stopPropagation()
    
    setOpenTabs(prevTabs => {
      // Prevent closing if it's the only tab
      if (prevTabs.length <= 1) {
        return prevTabs
      }
      
      const newTabs = prevTabs.filter(tab => tab.id !== docId)
      
      // Clear scroll position for the closed tab
      // This ensures that when the file is reopened, it shows at the top instead of the previous position
      try {
        localStorage.removeItem(`documentScroll_${docId}`)
        localStorage.removeItem(`pdfPage_${docId}`)
      } catch (error) {
        console.error('Failed to clear scroll position:', error)
      }
      
      // Remove PDF Viewer ref when tab is closed
      pdfViewerRefsMap.current.delete(docId)
      
      // If closing the active tab, switch to another tab or navigate away
      if (activeTabId === docId) {
        if (newTabs.length > 0) {
          // Switch to the last tab, or the one before if closing the last one
          const closedIndex = prevTabs.findIndex(tab => tab.id === docId)
          const targetIndex = closedIndex > 0 ? closedIndex - 1 : 0
          const targetTab = newTabs[targetIndex] || newTabs[0]
          setActiveTabId(targetTab.id)
          navigate(`/document/${targetTab.id}`)
        } else {
          // No tabs left, navigate to document list
          setActiveTabId(null)
          navigate('/documents')
        }
      }
      
      return newTabs
    })
  }

  // Handle tab reorder (drag and drop)
  const handleTabReorder = (draggedId: string, targetId: string, position: 'left' | 'right') => {
    setOpenTabs(prevTabs => {
      const draggedIndex = prevTabs.findIndex(tab => tab.id === draggedId)
      const targetIndex = prevTabs.findIndex(tab => tab.id === targetId)
      
      if (draggedIndex === -1 || targetIndex === -1 || draggedIndex === targetIndex) {
        return prevTabs
      }
      
      const newTabs = [...prevTabs]
      const [draggedTab] = newTabs.splice(draggedIndex, 1)
      
      // Calculate insertion index based on position
      // If position is 'left', insert before target
      // If position is 'right', insert after target
      const insertIndex = position === 'left' ? targetIndex : targetIndex + 1
      // Adjust for the fact that we already removed the dragged item
      const adjustedIndex = draggedIndex < targetIndex ? insertIndex - 1 : insertIndex
      
      newTabs.splice(adjustedIndex, 0, draggedTab)
      
      return newTabs
    })
  }

  // Save WorldLab changes immediately (no debounce)
  const saveWorldLabChangesImmediately = useCallback(async (labData: WorldLab) => {
    if (!labData) return
    
    try {
      // Convert nodes to positions and metadata maps
      const nodePositions: Record<string, { x: number; y: number }> = {}
      const nodeMetadata: Record<string, { label?: string; category?: string; elementName?: string }> = {}
      
      labData.nodes.forEach(node => {
        nodePositions[node.id] = node.position
        nodeMetadata[node.id] = {
          label: node.label,
          category: node.category,
          elementName: node.elementName,
        }
      })
      
      // Save edges with current node positions and metadata
      const projectId = document?.projectId || ''
      if (projectId) {
        await worldLabApi.saveEdges(labData.labName, labData.edges, projectId, nodePositions, nodeMetadata)
      }
      console.log('[WorldLab] ✓ Saved changes before switching')
    } catch (error) {
      console.error('[WorldLab] ✗ Failed to save changes:', error)
    }
  }, [])

  // WorldLab node interaction handlers
  const handleNodeSingleClick = useCallback((nodeId: string) => {
    // Single click - update selected node for Terminal
    setSelectedNodeId(nodeId)
    console.log('[WorldLab] Node clicked:', nodeId)
  }, [])

  // Handle node selection from Terminal (focus on canvas)
  const handleTerminalNodeSelect = useCallback((nodeId: string | null) => {
    setSelectedNodeId(nodeId)
    // TODO: Focus on the node in canvas (can be enhanced later)
  }, [])

  // Helper function to convert markdown text to TipTap JSON
  const markdownToTipTap = (markdown: string): any => {
    if (!markdown || !markdown.trim()) {
      return {
        type: 'doc',
        content: [{ type: 'paragraph', content: [] }],
      }
    }

    const lines = markdown.split('\n')
    const content: any[] = []

    for (const line of lines) {
      if (line.trim() === '') {
        content.push({ type: 'paragraph', content: [] })
      } else if (line.startsWith('# ')) {
        content.push({
          type: 'heading',
          attrs: { level: 1 },
          content: [{ type: 'text', text: line.slice(2) }],
        })
      } else if (line.startsWith('## ')) {
        content.push({
          type: 'heading',
          attrs: { level: 2 },
          content: [{ type: 'text', text: line.slice(3) }],
        })
      } else if (line.startsWith('### ')) {
        content.push({
          type: 'heading',
          attrs: { level: 3 },
          content: [{ type: 'text', text: line.slice(4) }],
        })
      } else {
        // Regular paragraph
        const textNodes: any[] = []
        let currentText = line
        let pos = 0

        // Simple markdown parsing for bold and italic
        while (pos < currentText.length) {
          if (currentText.slice(pos, pos + 3) === '***') {
            // Bold italic
            const end = currentText.indexOf('***', pos + 3)
            if (end !== -1) {
              const text = currentText.slice(pos + 3, end)
              textNodes.push({
                type: 'text',
                text,
                marks: [{ type: 'bold' }, { type: 'italic' }],
              })
              pos = end + 3
            } else {
              textNodes.push({ type: 'text', text: currentText.slice(pos) })
              break
            }
          } else if (currentText.slice(pos, pos + 2) === '**') {
            // Bold
            const end = currentText.indexOf('**', pos + 2)
            if (end !== -1) {
              const text = currentText.slice(pos + 2, end)
              textNodes.push({
                type: 'text',
                text,
                marks: [{ type: 'bold' }],
              })
              pos = end + 2
            } else {
              textNodes.push({ type: 'text', text: currentText.slice(pos) })
              break
            }
          } else if (currentText[pos] === '*' && pos + 1 < currentText.length && currentText[pos + 1] !== '*') {
            // Italic
            const end = currentText.indexOf('*', pos + 1)
            if (end !== -1) {
              const text = currentText.slice(pos + 1, end)
              textNodes.push({
                type: 'text',
                text,
                marks: [{ type: 'italic' }],
              })
              pos = end + 1
            } else {
              textNodes.push({ type: 'text', text: currentText.slice(pos) })
              break
            }
          } else {
            const nextBold = currentText.indexOf('**', pos)
            const nextItalic = currentText.indexOf('*', pos)
            let nextPos = currentText.length

            if (nextBold !== -1 && nextBold < nextPos) nextPos = nextBold
            if (nextItalic !== -1 && nextItalic < nextPos && (nextItalic === pos || currentText[nextItalic - 1] !== '*')) {
              nextPos = nextItalic
            }

            if (nextPos < currentText.length) {
              textNodes.push({ type: 'text', text: currentText.slice(pos, nextPos) })
              pos = nextPos
            } else {
              textNodes.push({ type: 'text', text: currentText.slice(pos) })
              break
            }
          }
        }

        content.push({
          type: 'paragraph',
          content: textNodes.length > 0 ? textNodes : [],
        })
      }
    }

    return {
      type: 'doc',
      content: content.length > 0 ? content : [{ type: 'paragraph', content: [] }],
    }
  }

  const handleNodeDoubleClick = useCallback(async (nodeId: string) => {
    // Double click - load node content for floating editor
    if (!worldLabData) return

    try {
      const labName = worldLabData.labName
      setEditingNodeId(nodeId)

      // Load node.md file content
      const projectId = document?.projectId || ''
      if (!projectId) {
        console.error('[WorldLab] No projectId available')
        setEditingNodeId(null)
        setNodeDocumentContent(null)
        return
      }
      const nodeMarkdown = await worldLabApi.loadNodeContent(labName, nodeId, projectId)
      const nodeContent = JSON.stringify(markdownToTipTap(nodeMarkdown || ''))
      setNodeDocumentContent(nodeContent)
    } catch (error) {
      console.error('[WorldLab] Failed to load node content:', error)
      setEditingNodeId(null)
      setNodeDocumentContent(null)
    }
  }, [worldLabData])

  // Handle closing Node Editor
  const handleCloseNodeEditor = useCallback(() => {
    setEditingNodeId(null)
    setNodeDocumentContent(null)
  }, [])
  
  // Handle saving node document content
  const handleNodeDocumentSave = useCallback(async (nodeId: string, content: string) => {
    if (!worldLabData) return
    
    try {
      const labName = worldLabData.labName
      // Convert TipTap JSON to markdown
      const parsedContent = JSON.parse(content)
      const markdown = tipTapToMarkdown(parsedContent)
      const projectId = document?.projectId || ''
      if (!projectId) {
        console.error('[WorldLab] No projectId available')
        return
      }
      await worldLabApi.saveNode(labName, nodeId, markdown, projectId)
    } catch (error) {
      console.error('[WorldLab] Failed to save node content:', error)
    }
  }, [worldLabData])

  // Convert TipTap JSON to markdown
  const tipTapToMarkdown = (node: any): string => {
    if (!node || !node.content) return ''

    const lines: string[] = []

    const processNode = (n: any, indent: number = 0): void => {
      if (!n) return

      switch (n.type) {
        case 'heading':
          const level = n.attrs?.level || 1
          const headingText = extractTextFromNode(n)
          lines.push(`${'#'.repeat(level)} ${headingText}`)
          break

        case 'paragraph':
          const paraText = extractTextFromNode(n)
          if (paraText.trim()) {
            lines.push(paraText)
          } else {
            lines.push('')
          }
          break

        case 'codeBlock':
          const codeText = extractTextFromNode(n)
          const language = n.attrs?.language || ''
          lines.push('```' + language)
          lines.push(codeText)
          lines.push('```')
          break

        case 'bulletList':
        case 'orderedList':
          if (n.content) {
            n.content.forEach((item: any) => {
              processNode(item, indent)
            })
          }
          break

        case 'listItem':
          const itemText = extractTextFromNode(n)
          if (itemText.trim()) {
            lines.push(`${'  '.repeat(indent)}- ${itemText}`)
          }
          if (n.content) {
            n.content.forEach((child: any) => {
              if (child.type !== 'paragraph') {
                processNode(child, indent + 1)
              }
            })
          }
          break

        case 'blockquote':
          const quoteText = extractTextFromNode(n)
          quoteText.split('\n').forEach((line: string) => {
            lines.push(`> ${line}`)
          })
          break

        default:
          if (n.content && Array.isArray(n.content)) {
            n.content.forEach((child: any) => processNode(child, indent))
          }
      }
    }

    const extractTextFromNode = (n: any): string => {
      if (n.type === 'text') {
        let text = n.text || ''
        // Apply marks
        if (n.marks) {
          n.marks.forEach((mark: any) => {
            if (mark.type === 'bold') {
              text = `**${text}**`
            } else if (mark.type === 'italic') {
              text = `*${text}*`
            } else if (mark.type === 'code') {
              text = `\`${text}\``
            }
          })
        }
        return text
      }
      if (n.content && Array.isArray(n.content)) {
        return n.content.map(extractTextFromNode).join('')
      }
      return ''
    }

    if (node.content) {
      node.content.forEach((n: any) => processNode(n))
    }

    return lines.join('\n')
  }


  // Save tabs to localStorage whenever they change
  useEffect(() => {
    try {
      localStorage.setItem('openTabs', JSON.stringify(openTabs))
    } catch (error) {
      console.error('Failed to save tabs to localStorage:', error)
    }
  }, [openTabs])

  // Save activeTabId to localStorage whenever it changes
  useEffect(() => {
    try {
      if (activeTabId) {
        localStorage.setItem('activeTabId', activeTabId)
      } else {
        localStorage.removeItem('activeTabId')
      }
    } catch (error) {
      console.error('Failed to save activeTabId to localStorage:', error)
    }
  }, [activeTabId])

  // Update the active PDF viewer ref for backward compatibility when document changes
  useEffect(() => {
    if (document && document.title.toLowerCase().endsWith('.pdf')) {
      const activeRef = pdfViewerRefsMap.current.get(document.id)
      if (activeRef && activeRef.current) {
        // Update the ref to point to the active PDF viewer
        pdfViewerRef.current = activeRef.current
      } else {
        pdfViewerRef.current = null
      }
    } else {
      pdfViewerRef.current = null
    }
  }, [document?.id])

  // Restore tabs and navigate to active tab on mount if tabs were saved
  const hasRestoredTabsRef = useRef(false)
  useEffect(() => {
    if (!hasRestoredTabsRef.current && openTabs.length > 0 && activeTabId && !id) {
      // Only restore if we're not already on a document page
      hasRestoredTabsRef.current = true
      // Check if the active tab still exists in the restored tabs
      const activeTabExists = openTabs.some(tab => tab.id === activeTabId)
      if (activeTabExists) {
        // Navigate to the active tab
        navigate(`/document/${activeTabId}`)
      } else if (openTabs.length > 0) {
        // If active tab doesn't exist, navigate to the first tab
        setActiveTabId(openTabs[0].id)
        navigate(`/document/${openTabs[0].id}`)
      }
    }
  }, [openTabs, activeTabId, navigate, id])
  
  // Highlight all matches in the document (Chrome-style temporary highlights)
  const highlightAllMatches = (editor: Editor, query: string) => {
    if (!editor || !query.trim()) return
    
    try {
      // First clear existing search highlights
      clearSearchHighlights(editor)
      
      const { state, dispatch } = editor.view
      const { tr } = state
      const queryLower = query.toLowerCase()
      const matches: Array<{ from: number; to: number }> = []
      
      // Find all matches
      state.doc.descendants((node: any, pos: number) => {
        if (node.isText) {
          const text = node.text || ''
          const textLower = text.toLowerCase()
          let searchIndex = 0
          
          while (true) {
            const index = textLower.indexOf(queryLower, searchIndex)
            if (index === -1) break
            
            const from = pos + index
            const to = from + query.length
            matches.push({ from, to })
            searchIndex = index + 1
          }
        }
      })
      
      // Apply highlight marks to all matches
      // Use a distinct color for search highlights (slightly bluish yellow for light mode, bluish gray for dark mode)
      const highlightColor = theme === 'dark' ? '#5a6b7d' : '#90caf9'
      
      matches.forEach(({ from, to }) => {
        tr.addMark(from, to, state.schema.marks.highlight.create({ color: highlightColor }))
      })
      
      if (matches.length > 0) {
        dispatch(tr)
        
        // Scroll to first match
        if (matches[0]) {
          setTimeout(() => {
            try {
              const editorElement = editor.view.dom.closest('.editor-container') || editor.view.dom
              const editorRect = editorElement.getBoundingClientRect()
              const viewportHeight = window.innerHeight
              const targetY = viewportHeight * 0.15 // Top 15% of screen
              
              const coords = editor.view.coordsAtPos(matches[0].from)
              
              if (coords) {
                const currentScrollTop = editorElement.scrollTop || 0
                const scrollOffset = coords.top - editorRect.top - targetY + currentScrollTop
                
                editorElement.scrollTop = Math.max(0, scrollOffset)
              }
            } catch (error) {
              console.error('Error scrolling to first match:', error)
            }
          }, 100)
        }
      }
    } catch (error) {
      console.error('Error highlighting matches:', error)
    }
  }
  
  // Navigate to specific match position and scroll to it (no selection, just scroll)
  const navigateToMatch = (editor: Editor, query: string, charPosition: number) => {
    if (!editor || !query.trim()) {
      return
    }
    
    try {
      const { state } = editor
      const { doc } = state
      const queryLower = query.toLowerCase()
      
      // Convert character position to TipTap position
      let currentCharPos = 0
      let matchFound: { from: number; to: number } | null = null
      
      doc.descendants((node: any, pos: number) => {
        if (node.isText && !matchFound) {
          const text = node.text || ''
          const textLower = text.toLowerCase()
          
          const nodeStart = currentCharPos
          const nodeEnd = currentCharPos + text.length
          
          if (charPosition >= nodeStart && charPosition < nodeEnd) {
            const offsetInNode = charPosition - nodeStart
            const searchStart = Math.max(0, offsetInNode - query.length)
            const searchIndex = textLower.indexOf(queryLower, searchStart)
            
            if (searchIndex !== -1 && searchIndex <= offsetInNode + query.length) {
              const from = pos + searchIndex
              const to = from + query.length
              matchFound = { from, to }
            }
          }
          
          currentCharPos += text.length
        }
        return !matchFound
      })
      
      // If exact position not found, find closest match
      if (!matchFound) {
        currentCharPos = 0
        let closestMatch: { from: number; to: number; distance: number } | null = null
        
        doc.descendants((node: any, pos: number) => {
          if (node.isText) {
            const text = node.text || ''
            const textLower = text.toLowerCase()
            const searchIndex = textLower.indexOf(queryLower)
            
            if (searchIndex !== -1) {
              const matchCharPos = currentCharPos + searchIndex
              const distance = Math.abs(matchCharPos - charPosition)
              
              if (!closestMatch || distance < closestMatch.distance) {
                const from = pos + searchIndex
                const to = from + query.length
                closestMatch = { from, to, distance }
              }
            }
            
            currentCharPos += text.length
          }
          return true
        })
        
        if (closestMatch !== null) {
          matchFound = { 
            from: (closestMatch as { from: number; to: number; distance: number }).from, 
            to: (closestMatch as { from: number; to: number; distance: number }).to 
          }
        }
      }
      
      // Scroll to match
      if (matchFound) {
        try {
          const scrollContainer = editor.view.dom.closest('.scrollable-container') as HTMLElement
          if (!scrollContainer) {
            // Use direct scroll instead of scrollIntoView to avoid animation
            const coords = editor.view.coordsAtPos(matchFound.from)
            if (coords) {
              const editorElement = editor.view.dom as HTMLElement
              const editorRect = editorElement.getBoundingClientRect()
              const matchY = coords.top - editorRect.top + (editorElement.scrollTop || 0)
              const viewportHeight = editorElement.clientHeight
              const targetY = matchY - viewportHeight * 0.4
              editorElement.scrollTop = Math.max(0, targetY)
            }
            return
          }
          
          const coords = editor.view.coordsAtPos(matchFound.from)
          
          if (coords) {
            const containerRect = scrollContainer.getBoundingClientRect()
            const matchY = coords.top - containerRect.top + scrollContainer.scrollTop
            const viewportHeight = scrollContainer.clientHeight
            const targetY = matchY - viewportHeight * 0.4
            
            scrollContainer.scrollTop = Math.max(0, targetY)
          }
        } catch (error) {
          // Fallback: use direct scroll instead of scrollIntoView
          const coords = editor.view.coordsAtPos(matchFound.from)
          if (coords) {
            const scrollContainer = editor.view.dom.closest('.scrollable-container') as HTMLElement
            if (scrollContainer) {
              const containerRect = scrollContainer.getBoundingClientRect()
              const matchY = coords.top - containerRect.top + scrollContainer.scrollTop
              const viewportHeight = scrollContainer.clientHeight
              const targetY = matchY - viewportHeight * 0.4
              scrollContainer.scrollTop = Math.max(0, targetY)
            }
          }
        }
      }
    } catch (error) {
      // Silently fail
    }
  }
  
  const handleDocumentRename = async (docId: string, newTitle: string) => {
    try {
      await documentApi.updateTitle(docId, newTitle)
      setDocuments(docs => docs.map(doc => 
        doc.id === docId ? { ...doc, title: newTitle } : doc
      ))
      // Mark document as manually renamed
      setManuallyRenamedDocs(prev => new Set(prev).add(docId))
      // Update current document if it's the one being renamed
      if (document?.id === docId) {
        const updatedDoc = await documentApi.get(docId)
        setDocument(updatedDoc)
      }
    } catch (error) {
      console.error('Failed to rename document:', error)
      alert('Failed to rename document. Please try again.')
    }
  }

  const handleProjectRename = async (newTitle: string) => {
    const projectId = document?.projectId
    
    if (!projectId || !newTitle.trim()) {
      setIsRenamingProject(false)
      setProjectRenameValue(projectName)
      return
    }
    
    try {
      // Update project via API
      await projectApi.update(projectId, { title: newTitle.trim() })
      
      // Reload project from API to ensure we have the latest data
      const updatedProject = await projectApi.getById(projectId)
      if (updatedProject) {
        setProjectName(updatedProject.title)
      } else {
        setProjectName(newTitle.trim())
      }
      
      setIsRenamingProject(false)
      
      // Notify DocumentList to refresh projects list
      window.dispatchEvent(new CustomEvent('projectRenamed', { detail: { projectId } }))
    } catch (error) {
      console.error('Failed to rename project:', error)
      alert('Failed to rename project. Please try again.')
      setIsRenamingProject(false)
      setProjectRenameValue(projectName)
    }
  }

  const handleDocumentDelete = async (docId: string) => {
    try {
      // Get the document before deleting to check if it belongs to a project
      const docToDelete = document?.id === docId ? document : documents.find(doc => doc.id === docId)
      const projectId = docToDelete?.projectId
      
      await documentApi.delete(docId)
      
      // Remove document from project if it belongs to one
      if (projectId) {
        try {
          await projectApi.removeDocument(projectId, docId)
        } catch (error) {
          console.error('Failed to remove document from project:', error)
          // Continue even if this fails - document is already deleted
        }
      }
      
      // Remove document from tabs if it's open
      const wasActiveTab = activeTabId === docId
      const isCurrentDocument = document?.id === docId
      
      setOpenTabs(prevTabs => {
        const tabExists = prevTabs.find(tab => tab.id === docId)
        if (!tabExists) {
          return prevTabs // Tab not open, nothing to do
        }
        
        const newTabs = prevTabs.filter(tab => tab.id !== docId)
        
        // Clear scroll position for the deleted document
        try {
          localStorage.removeItem(`documentScroll_${docId}`)
          localStorage.removeItem(`pdfPage_${docId}`)
        } catch (error) {
          console.error('Failed to clear scroll position:', error)
        }
        
        // Remove PDF Viewer ref when tab is closed
        pdfViewerRefsMap.current.delete(docId)
        
        // If the deleted document was the active tab but NOT the current document,
        // navigate to another tab (if it's the current document, navigation is handled below)
        if (wasActiveTab && !isCurrentDocument) {
          if (newTabs.length > 0) {
            // Switch to the last tab, or the one before if closing the last one
            const closedIndex = prevTabs.findIndex(tab => tab.id === docId)
            const targetIndex = closedIndex > 0 ? closedIndex - 1 : 0
            const targetTab = newTabs[targetIndex] || newTabs[0]
            setActiveTabId(targetTab.id)
            navigate(`/document/${targetTab.id}`)
          } else {
            // No tabs left, navigate to document list
            setActiveTabId(null)
            navigate('/documents')
          }
        }
        
        return newTabs
      })
      
      // Cleanup for documents that weren't in tabs (e.g., deleted from file explorer without being opened)
      if (!openTabs.find(tab => tab.id === docId)) {
        try {
          localStorage.removeItem(`documentScroll_${docId}`)
          localStorage.removeItem(`pdfPage_${docId}`)
        } catch (error) {
          console.error('Failed to clear scroll position:', error)
        }
        pdfViewerRefsMap.current.delete(docId)
      }
      
      // If current document was deleted, find next file to navigate to
      if (isCurrentDocument) {
        // Helper function to get documents in file explorer order:
        // 1. Library files (sorted by order or createdAt)
        // 2. WorldLab files (sorted by order or createdAt)
        // 3. Project files (sorted by order or createdAt)
        const getDocumentsInFileExplorerOrder = (docs: Document[]): Document[] => {
          const libraryDocs = docs.filter(doc => doc.folder === 'library')
          const worldLabDocs = docs.filter(doc => doc.folder === 'worldlab')
          const projectDocs = docs.filter(doc => (!doc.folder || doc.folder === 'project'))
          
          // Sort documents by order if available, otherwise by creation time
          const sortDocuments = (docsToSort: Document[]) => {
            return [...docsToSort].sort((a, b) => {
              if (a.order !== undefined && b.order !== undefined) {
                return a.order - b.order
              }
              return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
            })
          }
          
          const orderedDocs: Document[] = []
          orderedDocs.push(...sortDocuments(libraryDocs))
          orderedDocs.push(...sortDocuments(worldLabDocs))
          orderedDocs.push(...sortDocuments(projectDocs))
          
          return orderedDocs
        }
        
        // Get documents in file explorer order
        const orderedDocuments = getDocumentsInFileExplorerOrder(documents)
        const deletedIndex = orderedDocuments.findIndex(doc => doc.id === docId)
        const updatedDocuments = documents.filter(doc => doc.id !== docId)
        
        // Update documents list first (without clearing document state to avoid triggering project change detection)
        setDocuments(updatedDocuments)
        
        // Clear refs to prevent stale state
        lastContentRef.current = ''
        currentDocIdRef.current = null
        
        if (updatedDocuments.length > 0) {
          // Get updated documents in file explorer order
          const updatedOrderedDocuments = getDocumentsInFileExplorerOrder(updatedDocuments)
          
          // Determine which folder the deleted file belongs to (using original documents)
          const deletedDoc = orderedDocuments[deletedIndex]
          const deletedFolder = deletedDoc?.folder || 'project'
          
          // Get folder boundaries in the ORIGINAL ordered list to determine position
          const originalLibraryDocs = documents.filter(doc => doc.folder === 'library')
          const originalWorldLabDocs = documents.filter(doc => doc.folder === 'worldlab')
          
          const sortDocuments = (docsToSort: Document[]) => {
            return [...docsToSort].sort((a, b) => {
              if (a.order !== undefined && b.order !== undefined) {
                return a.order - b.order
              }
              return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
            })
          }
          
          const originalSortedLibraryDocs = sortDocuments(originalLibraryDocs)
          const originalSortedWorldLabDocs = sortDocuments(originalWorldLabDocs)
          
          // Calculate folder start indices in the ORIGINAL ordered list
          const originalLibraryStartIndex = 0
          const originalWorldLabStartIndex = originalLibraryStartIndex + originalSortedLibraryDocs.length
          const originalProjectStartIndex = originalWorldLabStartIndex + originalSortedWorldLabDocs.length
          
          // Get folder boundaries in the UPDATED ordered list
          const updatedLibraryDocs = updatedDocuments.filter(doc => doc.folder === 'library')
          const updatedWorldLabDocs = updatedDocuments.filter(doc => doc.folder === 'worldlab')
          const updatedProjectDocs = updatedDocuments.filter(doc => (!doc.folder || doc.folder === 'project'))
          
          const updatedSortedLibraryDocs = sortDocuments(updatedLibraryDocs)
          const updatedSortedWorldLabDocs = sortDocuments(updatedWorldLabDocs)
          const updatedSortedProjectDocs = sortDocuments(updatedProjectDocs)
          
          const updatedLibraryStartIndex = 0
          const updatedWorldLabStartIndex = updatedLibraryStartIndex + updatedSortedLibraryDocs.length
          const updatedProjectStartIndex = updatedWorldLabStartIndex + updatedSortedWorldLabDocs.length
          
          let targetIndex: number
          
          if (deletedFolder === 'library') {
            // Check if this was the first file in the library folder (in original list)
            const isFirstInLibrary = deletedIndex === originalLibraryStartIndex
            
            if (isFirstInLibrary) {
              // If there's another file in the library folder after deletion, go to it
              if (updatedSortedLibraryDocs.length > 0) {
                // Go to the first library file in the updated list
                targetIndex = updatedLibraryStartIndex
              } else {
                // No more files in library, go to the file above
                targetIndex = deletedIndex > 0 ? deletedIndex - 1 : 0
              }
            } else {
              // Not the first file, go to the file above
              targetIndex = deletedIndex - 1
            }
          } else if (deletedFolder === 'worldlab') {
            // Check if this was the first file in the worldlab folder (in original list)
            const isFirstInWorldLab = deletedIndex === originalWorldLabStartIndex
            
            if (isFirstInWorldLab) {
              // If there's another file in the worldlab folder after deletion, go to it
              if (updatedSortedWorldLabDocs.length > 0) {
                // Go to the first worldlab file in the updated list
                targetIndex = updatedWorldLabStartIndex
              } else {
                // No more files in worldlab, go to the file above (last library file)
                targetIndex = deletedIndex > 0 ? deletedIndex - 1 : 0
              }
            } else {
              // Not the first file, go to the file above
              targetIndex = deletedIndex - 1
            }
          } else {
            // Project folder
            // Check if this was the first file in the project folder (in original list)
            const isFirstInProject = deletedIndex === originalProjectStartIndex
            
            if (isFirstInProject) {
              // If there's another file in the project folder after deletion, go to it
              if (updatedSortedProjectDocs.length > 0) {
                // Go to the first project file in the updated list
                targetIndex = updatedProjectStartIndex
              } else {
                // No more files in project, go to the file above (last worldlab file or library file)
                targetIndex = deletedIndex > 0 ? deletedIndex - 1 : 0
              }
            } else {
              // Not the first file, go to the file above
              targetIndex = deletedIndex - 1
            }
          }
          
          // Ensure targetIndex is valid
          if (targetIndex < 0) {
            targetIndex = 0
          }
          if (targetIndex >= updatedOrderedDocuments.length) {
            targetIndex = updatedOrderedDocuments.length - 1
          }
          
          if (targetIndex >= 0 && targetIndex < updatedOrderedDocuments.length) {
            // Navigate directly - this will trigger loadDocument which will set the new document
            // Don't call setDocument(null) here to avoid triggering project change detection
            setActiveTabId(updatedOrderedDocuments[targetIndex].id)
            navigate(`/document/${updatedOrderedDocuments[targetIndex].id}`)
          } else {
            // Fallback: navigate to first file if index is out of bounds
            setActiveTabId(updatedOrderedDocuments[0].id)
            navigate(`/document/${updatedOrderedDocuments[0].id}`)
          }
        } else {
          // No more documents in project, go to home
          setDocuments([])
          setActiveTabId(null)
          // Only clear document state when navigating away from project
          setDocument(null)
          navigate('/documents')
        }
      } else {
        // Just update the documents list
        setDocuments(docs => docs.filter(doc => doc.id !== docId))
        // Also update activeTabId if the deleted document was the active tab
        if (activeTabId === docId) {
          setActiveTabId(null)
        }
        // Don't reload here - the useEffect watching document?.projectId will handle reloading
        // when the project changes, and the local state update is sufficient for immediate UI update
      }
    } catch (error) {
      console.error('Failed to delete document:', error)
      alert('Failed to delete document. Please try again.')
    }
  }

  const handleReorderDocuments = async (documentIds: string[]) => {
    if (!document?.projectId) return
    
    // Create a map of documents by ID for quick lookup
    const documentsMap = new Map(documents.map(doc => [doc.id, doc]))
    
    // Find the minimum order value among documents being reordered to preserve relative ordering
    const documentsBeingReordered = documentIds.map(id => documentsMap.get(id)).filter(Boolean) as Document[]
    const minOrder = documentsBeingReordered.length > 0 
      ? Math.min(...documentsBeingReordered.map(doc => doc.order ?? 0))
      : 0
    
    // Reorder documents according to the new order and update their order property
    const reorderedDocuments: Document[] = []
    const processedIds = new Set<string>()
    
    // Add documents in the new order with updated order property
    documentIds.forEach((docId, index) => {
      const doc = documentsMap.get(docId)
      if (doc) {
        // Update order property based on position in the new order
        reorderedDocuments.push({
          ...doc,
          order: minOrder + index
        })
        processedIds.add(docId)
      }
    })
    
    // Add any remaining documents that weren't in the reorder list (preserve their original order)
    documents.forEach(doc => {
      if (!processedIds.has(doc.id)) {
        reorderedDocuments.push(doc)
      }
    })
    
    // Optimistically update the documents list immediately for smooth UI
    // This avoids the loading state that causes glitching
    setDocuments(reorderedDocuments)
    
    try {
      await projectApi.reorderDocuments(document.projectId, documentIds)
      // Don't reload - we've already updated the UI optimistically
      // The backend will update the order property, but our optimistic update is sufficient
    } catch (error) {
      console.error('Failed to reorder documents:', error)
      // On error, reload to get the correct state from server
      await loadDocuments(document?.projectId)
      alert('Failed to reorder documents. Please try again.')
    }
  }

  const handleCreateDocument = async () => {
    try {
      // Use selected folder if available, otherwise check current document's folder or isWorldLabMode
      // If still not determined, default to 'project'
      let folder: 'library' | 'project' | 'worldlab' = 'project'
      if (selectedFolder === 'library' || selectedFolder === 'worldlab') {
        folder = selectedFolder
      } else if (isWorldLabMode || document?.folder === 'worldlab') {
        folder = 'worldlab'
      } else if (document?.folder === 'library') {
        folder = 'library'
      } else if (selectedFolder === 'project' || (!document?.folder || document?.folder === 'project')) {
        folder = 'project'
      }
      
      // Generate name based on folder: "Chapter X" for workspace, "Doc X" for library, "New world X.lab" for worldlab
      const namePrefix = folder === 'library' ? 'Doc' : folder === 'worldlab' ? 'New world' : 'Chapter'
      const folderDocs = documents.filter(doc => 
        (folder === 'library' && doc.folder === 'library') ||
        (folder === 'worldlab' && doc.folder === 'worldlab') ||
        (folder === 'project' && (!doc.folder || doc.folder === 'project'))
      )
      // For WorldLab, check titles without .lab extension to avoid duplicates
      const existingTitles = folderDocs.map(doc => {
        if (folder === 'worldlab' && (doc.title.toLowerCase().endsWith('.lab') || doc.title.toLowerCase().endsWith('.worldlab'))) {
          // Handle both .lab and .worldlab extensions for backward compatibility
          if (doc.title.toLowerCase().endsWith('.lab')) {
            return doc.title.slice(0, -4).toLowerCase() // Remove .lab extension and normalize to lowercase for comparison
          }
          return doc.title.slice(0, -10).toLowerCase() // Remove .worldlab extension and normalize to lowercase for comparison
        }
        return doc.title.toLowerCase()
      })
      let number = 1
      while (existingTitles.includes(`${namePrefix.toLowerCase()} ${number}`)) {
        number++
      }
      // For WorldLab files, add .lab extension to title
      const baseTitle = `${namePrefix} ${number}`
      const newTitle = folder === 'worldlab' ? `${baseTitle}.lab` : baseTitle
      
      console.log(`[WorldLab] Creating new document: folder=${folder}, title=${newTitle}`)
      const newDoc = await documentApi.create(newTitle, folder)
      
      // Small delay to ensure file is fully written to disk before proceeding
      await new Promise(resolve => setTimeout(resolve, 100))
      
      // If current document has projectId, add new doc to same project
      if (document?.projectId) {
        // Calculate order based on documents in the same folder
        const folderDocs = documents.filter(doc => 
          (folder === 'library' && doc.folder === 'library') ||
          (folder === 'worldlab' && doc.folder === 'worldlab') ||
          (folder === 'project' && (!doc.folder || doc.folder === 'project'))
        )
        // Find the maximum order in the folder, or use folderDocs.length as fallback
        const maxOrder = folderDocs.length > 0
          ? Math.max(...folderDocs.map(doc => doc.order ?? 0), -1) + 1
          : 0
        
        // Add document to project BEFORE navigating (await to ensure it's saved)
        try {
          await projectApi.addDocument(document.projectId, newDoc.id, maxOrder)
          // Update document with projectId and order
          const newDocWithOrder = { ...newDoc, order: maxOrder, projectId: document.projectId }
          
          // Update documents state after successful project addition
          setDocuments(prev => [...prev, newDocWithOrder])
        } catch (error) {
          console.error('Failed to add document to project:', error)
          // Still add to local state so user can see it, but reload to sync
          const newDocWithOrder = { ...newDoc, order: maxOrder, projectId: document.projectId }
          setDocuments(prev => [...prev, newDocWithOrder])
          // Reload to sync with backend
          loadDocuments(document.projectId).catch(err => {
            console.error('Failed to reload documents:', err)
          })
        }
      } else {
        // Update documents state immediately so FileExplorer shows it
        setDocuments(prev => [...prev, newDoc])
      }
      
      // Verify document exists before navigating (safeguard)
      try {
        const verifyDoc = await documentApi.get(newDoc.id)
        if (!verifyDoc) {
          throw new Error('Document not found after creation')
        }
      } catch (verifyError) {
        console.error('Failed to verify document after creation:', verifyError)
        // Wait a bit more and try once more
        await new Promise(resolve => setTimeout(resolve, 200))
        const verifyDocRetry = await documentApi.get(newDoc.id)
        if (!verifyDocRetry) {
          alert('Document was created but could not be verified. Please refresh and try again.')
          return
        }
      }
      
      // Mark as newly created document for auto-focus and placeholder hiding
      isNewlyCreatedDocRef.current = true
      
      try {
      navigate(`/document/${newDoc.id}`)
      } catch (navError) {
        console.error('[Layout] Error navigating to new document:', navError)
        throw navError
      }
    } catch (error) {
      console.error('[Layout] Failed to create document:', error)
      alert('Failed to create document. Please try again.')
      isNewlyCreatedDocRef.current = false
    }
  }


  // Custom extension to handle Ctrl+Shift+E for FileExplorer toggle
  const FileExplorerToggleExtension = Extension.create({
    name: 'fileExplorerToggle',
    addKeyboardShortcuts() {
      return {
        'Mod-Shift-e': () => {
          if (fileExplorerPanelRef.current) {
            const currentSize = fileExplorerPanelRef.current.getSize()
            const newSize = currentSize > 0 ? 0 : 14
            fileExplorerPanelRef.current.resize(newSize)
          }
          return true // Prevent default behavior
        },
      }
    },
  })

  // Helper function to create editor configuration
  // This extracts the editor config so it can be reused for multiple editors
  const createEditorConfig = (initialContent: string = '') => {
    return {
      extensions: [
        // StarterKit without list extensions and link/underline (we'll configure them separately)
        StarterKit.configure({
          bulletList: false,
          orderedList: false,
          listItem: false,
          link: false,
          underline: false,
        }),
        FileExplorerToggleExtension,
        // Custom list configuration with better keyboard shortcuts
        ListItem.extend({
          addKeyboardShortcuts() {
            // Helper function to safely lift only the current list item by exactly one level
            const safeLiftCurrentListItem = () => {
              const { state } = this.editor
              const { $from } = state.selection
              const { listItem } = state.schema.nodes
              
              // Find the current list item that contains the cursor
              let currentListItemDepth = -1
              for (let d = $from.depth; d > 0; d--) {
                const node = $from.node(d)
                if (node.type === listItem || node.type.name === 'listItem') {
                  currentListItemDepth = d
                  break
                }
              }
              
              // If not in a list item, return false
              if (currentListItemDepth === -1) {
                return false
              }
              
              // Check if we can lift (must have a parent list)
              if (currentListItemDepth <= 1) {
                // Already at top level, can't lift
                return false
              }
              
              // Find the parent list node
              const parentListDepth = currentListItemDepth - 1
              const parentList = $from.node(parentListDepth)
              
              // Only lift if parent is actually a list (bulletList or orderedList)
              if (parentList.type.name !== 'bulletList' && parentList.type.name !== 'orderedList') {
                return false
              }
              
              // Store the current depth before lifting
              const depthBeforeLift = currentListItemDepth
              
              // Use liftListItem - TipTap's liftListItem only lifts one level by default
              // But we ensure it only affects the current item by checking the selection is collapsed
              const liftResult = this.editor.commands.liftListItem('listItem')
              
              if (liftResult) {
                // Verify that we only lifted one level
                const newState = this.editor.state
                const new$from = newState.selection.$from
                
                // Find the new list item depth
                let newListItemDepth = -1
                for (let d = new$from.depth; d > 0; d--) {
                  const node = new$from.node(d)
                  if (node.type === listItem || node.type.name === 'listItem') {
                    newListItemDepth = d
                    break
                  }
                }
                
                // If we're no longer in a list item, the lift was successful (lifted out of list)
                if (newListItemDepth === -1) {
                  return true
                }
                
                // If the depth decreased by exactly 1, the lift was successful and limited to one level
                if (newListItemDepth === depthBeforeLift - 1) {
                  return true
                }
                
                // If depth didn't change or changed incorrectly, something went wrong
                // But we'll still return true since liftListItem succeeded
                return true
              }
              
              return false
            }
            
            return {
              // Tab to indent
              Tab: () => {
                if (this.editor.isActive('listItem')) {
                  const { state } = this.editor
                  const { $from, $to } = state.selection
                  const { listItem } = state.schema.nodes
                  
                  // Try to sink the list item (works for nested lists)
                  // sinkListItem can handle multiple selected items
                  const sinkResult = this.editor.commands.sinkListItem('listItem')
                  if (sinkResult) {
                    return true
                  }
                  
                  // If sinkListItem fails (e.g., first item in list), indent all selected listItems
                  // Find all listItem nodes in the selection
                  const listItemNodes: Array<{ pos: number; node: any }> = []
                  
                  state.doc.nodesBetween($from.pos, $to.pos, (node, pos) => {
                    if (node.type === listItem || node.type.name === 'listItem') {
                      listItemNodes.push({ pos, node })
                    }
                  })
                  
                  // If no listItems found in selection, try to find the current one
                  if (listItemNodes.length === 0) {
                    for (let d = $from.depth; d > 0; d--) {
                      const node = $from.node(d)
                      if (node.type === listItem || node.type.name === 'listItem') {
                        listItemNodes.push({ pos: $from.before(d), node })
                        break
                      }
                    }
                  }
                  
                  if (listItemNodes.length > 0) {
                    const { tr } = state
                    listItemNodes.forEach(({ pos, node }) => {
                      const currentIndent = node.attrs.indent || 0
                      const newIndent = Math.min(currentIndent + 1, 10) // Max 10 levels
                      
                      tr.setNodeMarkup(pos, undefined, {
                        ...node.attrs,
                        indent: newIndent,
                      })
                    })
                    this.editor.view.dispatch(tr)
                    return true
                  }
                  
                  return false
                }
                return false
              },
              // Shift+Tab to outdent
              'Shift-Tab': () => {
                if (this.editor.isActive('listItem')) {
                  // Use safe lift function to only lift current item by one level
                  const liftResult = safeLiftCurrentListItem()
                  if (liftResult) {
                    return true
                  }
                  
                  const { state } = this.editor
                  const { $from, $to } = state.selection
                  const { listItem } = state.schema.nodes
                  
                  // If liftListItem fails, manually outdent all selected listItems
                  const listItemNodes: Array<{ pos: number; node: any }> = []
                  
                  state.doc.nodesBetween($from.pos, $to.pos, (node, pos) => {
                    if (node.type === listItem || node.type.name === 'listItem') {
                      listItemNodes.push({ pos, node })
                    }
                  })
                  
                  // If no listItems found in selection, try to find the current one
                  if (listItemNodes.length === 0) {
                    for (let d = $from.depth; d > 0; d--) {
                      const node = $from.node(d)
                      if (node.type === listItem || node.type.name === 'listItem') {
                        listItemNodes.push({ pos: $from.before(d), node })
                        break
                      }
                    }
                  }
                  
                  if (listItemNodes.length > 0) {
                    const { tr } = state
                    listItemNodes.forEach(({ pos, node }) => {
                      const currentIndent = node.attrs.indent || 0
                      const newIndent = Math.max(currentIndent - 1, 0)
                      
                      tr.setNodeMarkup(pos, undefined, {
                        ...node.attrs,
                        indent: newIndent,
                      })
                    })
                    this.editor.view.dispatch(tr)
                    return true
                  }
                  
                  return false
                }
                return false
              },
              // Ctrl+Tab (or Cmd+Tab on Mac) to outdent
              'Mod-Tab': () => {
                if (this.editor.isActive('listItem')) {
                  return safeLiftCurrentListItem()
                }
                return false
              },
              // Backspace at the start of a list item - lift it out
              Backspace: () => {
                const { state } = this.editor
                const { $from, $to } = state.selection
                
                // If there's a selection, let default delete behavior handle it
                // Don't lift the list item when content is selected
                if ($from.pos !== $to.pos) {
                  return false
                }
                
                // Check if we're at the start of a list item (no selection, cursor only)
                if ($from.parentOffset === 0 && this.editor.isActive('listItem')) {
                  const { listItem } = state.schema.nodes
                  
                  // Find the innermost list item (the one we're directly in)
                  // Walk up from the current position to find list items
                  let innermostListItemDepth = -1
                  let parentListItemDepth = -1
                  
                  for (let d = $from.depth; d > 0; d--) {
                    const node = $from.node(d)
                    if (node.type === listItem) {
                      if (innermostListItemDepth === -1) {
                        innermostListItemDepth = d
                      } else {
                        parentListItemDepth = d
                        break
                      }
                    }
                  }
                  
                  // If we're in a nested list (we found both an innermost and parent list item)
                  // we should only lift the innermost one, not the parent
                  if (innermostListItemDepth >= 0 && parentListItemDepth >= 0) {
                    // We're in a nested list structure
                    // Check if we're at the start of the innermost list item's content
                    const innermostListItem = $from.node(innermostListItemDepth)
                    
                    // Check if cursor is at the start of the innermost list item's content
                    // We need to check the paragraph inside the list item
                    let isAtInnermostStart = false
                    
                    if (innermostListItem.content.size === 0) {
                      // Empty list item - we're at the start
                      isAtInnermostStart = true
                    } else {
                      // Find the first paragraph/heading inside the list item
                      // and check if cursor is at its start
                      for (let d = innermostListItemDepth + 1; d <= $from.depth; d++) {
                        const node = $from.node(d)
                        if (node.type.name === 'paragraph' || node.type.name.startsWith('heading')) {
                          const nodeStart = $from.start(d)
                          // Check if we're at the very start of this node
                          if ($from.pos === nodeStart) {
                            isAtInnermostStart = true
                            break
                          }
                        }
                      }
                    }
                    
                    if (isAtInnermostStart) {
                      // Only lift the innermost list item, not the parent
                      return safeLiftCurrentListItem()
                    }
                  } else {
                    // Not in a nested list, use safe lift function
                    return safeLiftCurrentListItem()
                  }
                }
                
                return false
              },
              // Enter to create new list item or exit list
              Enter: () => {
                const { state } = this.editor
                const { $from } = state.selection
                
                // Only handle if we're in a list item
                if (!this.editor.isActive('listItem')) {
                  return false
                }
                
                const listItemNode = $from.node($from.depth)
                
                // If the list item is empty, lift it out (exit the list)
                if (listItemNode.content.size === 0) {
                  return safeLiftCurrentListItem()
                }
                
                // If list item has content, split it to create a new list item
                return this.editor.commands.splitListItem('listItem')
              },
            }
          },
        }),
        BulletList.configure({
          HTMLAttributes: {
            class: 'editor-bullet-list',
          },
        }),
        OrderedList.configure({
          HTMLAttributes: {
            class: 'editor-ordered-list',
          },
        }),
        TextAlign.configure({
          types: ['heading', 'paragraph', 'title', 'subtitle'],
        }),
        Placeholder.configure({
          placeholder: () => {
            // Hide placeholder when document is loading or when it's a newly created document
            if (isLoadingDocumentRef.current || isNewlyCreatedDocRef.current) {
              return ''
            }
            // No placeholder for documents
            return ''
          },
        }),
        Underline,
        Color,
        TextStyle,
        FontSize,
        FontFamily,
        LineHeight,
        Title,
        Subtitle,
        Callout,
        Quote,
        Highlight.configure({
          multicolor: true,
        }),
        Link.configure({
          openOnClick: false,
          HTMLAttributes: {
            class: 'editor-link',
          },
        }),
        ResizableImage.configure({
          inline: true,
          allowBase64: true,
        }),
        MathExtension,
        PDFViewerExtension,
        TableExtension,
        ChartExtension,
        IndentExtension,
      ],
      content: initialContent,
      editorProps: {
        transformPastedText(text: string) {
          // Preserve line breaks when pasting - convert double line breaks to paragraph breaks
          // This helps maintain spacing when pasting from GPT or other markdown sources
          return text
        },
        transformPastedHTML(html: string) {
          // Process pasted HTML to normalize fonts and colors
          if (!html) return html

          // Available fonts in the editor
          const availableFonts = ['Noto Sans SC', 'Inter', 'Open Sans', 'Roboto', 'Montserrat', 'Poppins']
          
          // Default text colors for each theme
          const defaultTextColor = theme === 'dark' ? '#D6D6DD' : '#202124'
          
          // Parse the HTML
          const parser = new DOMParser()
          const doc = parser.parseFromString(html, 'text/html')
          
          // Helper function to check if a color is dark (for dark theme) or light (for light theme)
          const isDarkColor = (color: string): boolean => {
            if (!color) return false
            
            // Remove # if present
            let hex = color.replace('#', '').trim()
            
            // Handle rgb/rgba
            if (color.startsWith('rgb')) {
              const match = color.match(/\d+/g)
              if (match && match.length >= 3) {
                const r = parseInt(match[0])
                const g = parseInt(match[1])
                const b = parseInt(match[2])
                // Calculate luminance
                const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255
                return luminance < 0.5
              }
              return false
            }
            
            // Handle hex colors
            if (hex.length === 3) {
              hex = hex.split('').map(c => c + c).join('')
            }
            
            if (hex.length !== 6) return false
            
            const r = parseInt(hex.substr(0, 2), 16)
            const g = parseInt(hex.substr(2, 2), 16)
            const b = parseInt(hex.substr(4, 2), 16)
            
            // Calculate relative luminance
            const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255
            return luminance < 0.5
          }
          
          // Helper function to normalize font family
          const normalizeFontFamily = (fontFamily: string | null): string | null => {
            if (!fontFamily) return null
            
            // Remove quotes and get first font
            const font = fontFamily.replace(/['"]/g, '').split(',')[0].trim()
            
            // Check if it's one of our available fonts
            const matchedFont = availableFonts.find(af => 
              font.toLowerCase() === af.toLowerCase()
            )
            
            // If not available, return null to use default
            return matchedFont || null
          }
          
          // Process all elements in the document
          const processElement = (element: Element) => {
            // Process style attribute
            if (element.hasAttribute('style')) {
              const style = element.getAttribute('style') || ''
              const styleObj: Record<string, string> = {}
              
              // Parse style string
              style.split(';').forEach(declaration => {
                const [property, value] = declaration.split(':').map(s => s.trim())
                if (property && value) {
                  styleObj[property] = value
                }
              })
              
              // Remove or normalize font-family
              if (styleObj['font-family']) {
                const normalizedFont = normalizeFontFamily(styleObj['font-family'])
                if (normalizedFont) {
                  styleObj['font-family'] = normalizedFont
                } else {
                  delete styleObj['font-family']
                }
              }
              
              // Handle color
              if (styleObj.color) {
                // In dark theme, if color is dark (like black), convert to light
                // In light theme, if color is light (like white), convert to dark
                if (theme === 'dark' && isDarkColor(styleObj.color)) {
                  styleObj.color = defaultTextColor
                } else if (theme === 'light' && !isDarkColor(styleObj.color)) {
                  // Check if it's a very light color (like white)
                  const isVeryLight = styleObj.color.toLowerCase().includes('fff') || 
                                     styleObj.color.toLowerCase() === 'white'
                  if (isVeryLight) {
                    styleObj.color = defaultTextColor
                  }
                }
              }
              
              // Rebuild style string
              const newStyle = Object.entries(styleObj)
                .map(([prop, val]) => `${prop}: ${val}`)
                .join('; ')
              
              if (newStyle) {
                element.setAttribute('style', newStyle)
              } else {
                element.removeAttribute('style')
              }
            }
            
            // Process font-family attribute if present
            if (element.hasAttribute('font-family')) {
              const fontFamily = element.getAttribute('font-family')
              const normalizedFont = normalizeFontFamily(fontFamily)
              if (normalizedFont) {
                element.setAttribute('font-family', normalizedFont)
              } else {
                element.removeAttribute('font-family')
              }
            }
            
            // Process color attribute if present
            if (element.hasAttribute('color')) {
              const color = element.getAttribute('color')
              if (color && theme === 'dark' && isDarkColor(color)) {
                element.setAttribute('color', defaultTextColor)
              } else if (color && theme === 'light') {
                const isVeryLight = color.toLowerCase().includes('fff') || 
                                   color.toLowerCase() === 'white'
                if (isVeryLight) {
                  element.setAttribute('color', defaultTextColor)
                }
              }
            }
            
            // Handle old <font> tags with face attribute
            if (element.tagName.toLowerCase() === 'font' && element.hasAttribute('face')) {
              const fontFamily = element.getAttribute('face')
              const normalizedFont = normalizeFontFamily(fontFamily)
              if (normalizedFont) {
                element.setAttribute('face', normalizedFont)
              } else {
                element.removeAttribute('face')
              }
            }
            
            // Recursively process children
            Array.from(element.children).forEach((child: Element) => {
              processElement(child)
            })
          }
          
          // Process body content (or the root element if it's a fragment)
          const body = doc.body || doc.documentElement
          
          // Process the body element and all its descendants recursively
          if (body) {
            processElement(body)
          }
          
          // Return the processed HTML
          return body.innerHTML || html
        },
        // Fix cursor jumping to beginning of list items when clicking on right side
        // This is a known issue with ProseMirror's hit testing on complex nested DOM structures
        handleClick: (view: any, pos: number, event: MouseEvent) => {
          const { state } = view
          const $pos = state.doc.resolve(pos)
          const { listItem, paragraph } = state.schema.nodes
          
          // Find paragraph node (could be inside list item or standalone)
          let paragraphNode = null
          let paragraphDepth = -1
          let inListItem = false
          let listItemDepth = -1
          
          for (let d = $pos.depth; d > 0; d--) {
            const node = $pos.node(d)
            if (node.type === listItem) {
              inListItem = true
              listItemDepth = d
            }
            // Check for paragraph, heading, title, subtitle
            if (node.type === paragraph || 
                node.type.name === 'paragraph' ||
                node.type.name.startsWith('heading') ||
                node.type.name === 'title' ||
                node.type.name === 'subtitle') {
              paragraphNode = node
              paragraphDepth = d
              // Don't break here - we want the innermost paragraph
            }
          }
          
          // Handle list items without paragraphs
          if (inListItem && listItemDepth >= 0) {
            const listItemNode = $pos.node(listItemDepth)
            let hasParagraph = false
            listItemNode.forEach((child: any) => {
              if (child.type === paragraph || child.type.name === 'paragraph') {
                hasParagraph = true
              }
            })
            
            // If no paragraph found, create one and place cursor at end
            if (!hasParagraph) {
              const listItemStart = $pos.start(listItemDepth)
              const tr = state.tr
              const newParagraph = state.schema.nodes.paragraph.create()
              tr.insert(listItemStart + 1, newParagraph)
              // Place cursor at the end of the new paragraph
              const paragraphEnd = listItemStart + 1 + newParagraph.nodeSize - 1
              tr.setSelection(TextSelection.create(tr.doc, paragraphEnd))
              view.dispatch(tr)
              return true
            }
          }
          
          // Handle clicking on right side (blank area) ONLY for list items
          // This fixes cursor jumping in list items but should not interfere with regular paragraphs
          // (especially for Chinese text where clicking at end of line should work normally)
          if (paragraphNode && paragraphDepth >= 0 && inListItem && listItemDepth >= 0) {
            // Get click X coordinate and cursor position coordinates
            const clickX = event.clientX
            const posCoords = view.coordsAtPos(pos)
            if (!posCoords) return false
            
            // Calculate distance from click to cursor position
            const clickDistanceFromCursor = clickX - posCoords.left
            
            // If click is significantly to the right of where cursor landed,
            // user intended to click at the end of the line/paragraph
            if (clickDistanceFromCursor > 20) {
              // Force cursor to the absolute end of the paragraph (ignoring mark boundaries)
              const paragraphStart = $pos.start(paragraphDepth)
              const paragraphEnd = paragraphStart + paragraphNode.content.size
              
              // Check if paragraph end is on the same line as the click
              const endCoords = view.coordsAtPos(paragraphEnd)
              if (endCoords && Math.abs(endCoords.top - posCoords.top) < 10) {
                // Same line: force move cursor to paragraph end (ignoring marks)
                const tr = state.tr.setSelection(TextSelection.create(state.doc, paragraphEnd))
                view.dispatch(tr)
                return true // We handled the click
              } else {
                // Different line: find end of current line using binary search
                const lineYThreshold = 5
                let left = pos
                let right = paragraphEnd
                let bestPos = pos
                
                while (left <= right) {
                  const mid = Math.floor((left + right) / 2)
                  const midCoords = view.coordsAtPos(mid)
                  
                  if (midCoords && Math.abs(midCoords.top - posCoords.top) < lineYThreshold) {
                    bestPos = mid
                    left = mid + 1
                  } else {
                    right = mid - 1
                  }
                }
                
                // Force cursor to end of line (ignoring mark boundaries)
                if (bestPos !== pos) {
                  const tr = state.tr.setSelection(TextSelection.create(state.doc, bestPos))
                  view.dispatch(tr)
                  return true // We handled the click
                }
              }
            }
          }
          
          return false // Let default handling proceed
        },
        handleKeyDown: (view: any, event: KeyboardEvent) => {
          // Handle Backspace on empty paragraph after a list or horizontal rule
          // Based on: https://discuss.prosemirror.net/t/backspace-inside-empty-paragraph-creates-a-new-list-node/3784
          if (event.key === 'Backspace') {
            const { state, dispatch } = view
            const { $from } = state.selection
            const { paragraph, bulletList, orderedList, horizontalRule } = state.schema.nodes
            
            // Check if we're at the start of an empty paragraph
            if ($from.parent.type === paragraph && 
                $from.parent.content.size === 0 &&
                $from.parentOffset === 0) {
              
              // Get position just before the paragraph
              const beforePos = $from.before($from.depth)
              if (beforePos <= 0) return false
              
              // Resolve position before paragraph to see what's there
              const $before = state.doc.resolve(beforePos)
              const nodeBefore = $before.nodeBefore
              
              // Check if node before is a horizontal rule
              if (nodeBefore && nodeBefore.type === horizontalRule) {
                // Delete the horizontal rule and the empty paragraph, place cursor after the hr's previous sibling
                const tr = state.tr
                const hrStart = beforePos - nodeBefore.nodeSize
                const paragraphEnd = $from.after($from.depth)
                
                // Delete both the hr and the empty paragraph
                tr.delete(hrStart, paragraphEnd)
                
                // Place cursor at the end of the node before the hr (if exists)
                if (hrStart > 0) {
                  const $beforeHR = state.doc.resolve(hrStart)
                  const nodeBeforeHR = $beforeHR.nodeBefore
                  
                  if (nodeBeforeHR) {
                    // Find the end position of the node before hr
                    let cursorPos = hrStart - 1
                    
                    // If it's a paragraph or heading, place cursor at its end
                    if (nodeBeforeHR.type === paragraph || 
                        nodeBeforeHR.type.name?.startsWith('heading') ||
                        nodeBeforeHR.type.name === 'title' ||
                        nodeBeforeHR.type.name === 'subtitle') {
                      cursorPos = hrStart - nodeBeforeHR.nodeSize
                      // Find the actual end of content in this node
                      const $nodePos = state.doc.resolve(cursorPos)
                      for (let d = $nodePos.depth; d > 0; d--) {
                        const nodeAtDepth = $nodePos.node(d)
                        if (nodeAtDepth.type === paragraph || 
                            nodeAtDepth.type.name?.startsWith('heading') ||
                            nodeAtDepth.type.name === 'title' ||
                            nodeAtDepth.type.name === 'subtitle') {
                          cursorPos = $nodePos.start(d) + nodeAtDepth.content.size
                          break
                        }
                      }
                    } else {
                      // For other node types, place cursor right after the node
                      cursorPos = hrStart
                    }
                    
                    // Adjust cursor position after deletion
                    const adjustedCursorPos = Math.max(0, cursorPos - nodeBefore.nodeSize)
                    tr.setSelection(TextSelection.create(tr.doc, adjustedCursorPos))
                  } else {
                    // No node before hr, place cursor at document start
                    tr.setSelection(TextSelection.create(tr.doc, 1))
                  }
                } else {
                  // hr is at document start, place cursor at start
                  tr.setSelection(TextSelection.create(tr.doc, 1))
                }
                
                dispatch(tr.scrollIntoView())
                return true
              }
              
              // Check if node before is a list
              if (nodeBefore && 
                  (nodeBefore.type === bulletList || nodeBefore.type === orderedList)) {
                
                // Find the last paragraph in the list by walking backwards
                let $lastNode = state.doc.resolve(beforePos - 1)
                while ($lastNode.parent.type !== paragraph && $lastNode.pos > 0) {
                  $lastNode = state.doc.resolve($lastNode.pos - 1)
                }
                
                if ($lastNode.parent.type === paragraph) {
                  // The cursor should go to the end of this paragraph
                  const cursorPos = $lastNode.end()
                  
                  // Delete the empty paragraph
                  const tr = state.tr
                  const paragraphStart = $from.before($from.depth)
                  const paragraphEnd = $from.after($from.depth)
                  
                  tr.delete(paragraphStart, paragraphEnd)
                  
                  // Set cursor to end of last paragraph in list
                  // cursorPos is still valid since we're deleting content AFTER it
                  tr.setSelection(TextSelection.create(tr.doc, cursorPos))
                  
                  dispatch(tr.scrollIntoView())
                  return true
                }
              }
            }
          }
          
          return false
        },
      },
    }
  }

  // Store editor instance in map
  const setEditor = (docId: string, editor: Editor): void => {
    editorsMapRef.current.set(docId, editor)
    // If this is the active editor, update EditorContext using requestAnimationFrame
    // This ensures toolbar gets the editor smoothly without flash when a new file is created
    if (activeTabId === docId) {
      // Use requestAnimationFrame to batch the update with React's render cycle
      // This prevents the flash effect when toolbar transitions from null to editor
      requestAnimationFrame(() => {
        setCurrentEditor(editor)
      })
    }
  }

  // Helper function to extract first line text from TipTap JSON content
  const extractFirstLineText = (content: any): string => {
    if (!content || !content.content || !Array.isArray(content.content)) {
      return ''
    }
    
    // Find first non-empty paragraph or heading
    for (const node of content.content) {
      if (node.type === 'paragraph' || node.type === 'heading') {
        const extractText = (n: any): string => {
          if (typeof n === 'string') return n
          if (n.type === 'text') return n.text || ''
          if (n.content && Array.isArray(n.content)) {
            return n.content.map(extractText).join('')
          }
          return ''
        }
        const text = extractText(node).trim()
        if (text) {
          return text
        }
      }
    }
    
    return ''
  }

  // Helper function to check if user has multiple paragraphs (has pressed Enter/newline)
  const hasMultipleParagraphs = (content: any): boolean => {
    if (!content || !content.content || !Array.isArray(content.content)) {
      return false
    }
    
    let paragraphCount = 0
    const extractText = (n: any): string => {
      if (typeof n === 'string') return n
      if (n.type === 'text') return n.text || ''
      if (n.content && Array.isArray(n.content)) {
        return n.content.map(extractText).join('')
      }
      return ''
    }
    
    // Count non-empty paragraphs and headings
    for (const node of content.content) {
      if (node.type === 'paragraph' || node.type === 'heading') {
        const text = extractText(node).trim()
        if (text) {
          paragraphCount++
          if (paragraphCount >= 2) {
            return true // User has at least 2 paragraphs, meaning they've pressed Enter
          }
        }
      }
    }
    
    return false
  }

  // Helper function to check if title is default format (Doc X, Section X, or Chapter X)
  const isDefaultTitle = (title: string): boolean => {
    // Check for "Doc X", "Section X", or "Chapter X" format (case-insensitive)
    const docPattern = /^Doc \d+$/i
    const sectionPattern = /^Section \d+$/i
    const chapterPattern = /^Chapter \d+$/i
    return docPattern.test(title) || sectionPattern.test(title) || chapterPattern.test(title)
  }

  // Handle editor content updates with debounced auto-save
  const handleEditorUpdate = useCallback((editor: Editor, docId: string) => {
    if (!editor || editor.isDestroyed) return
    
    // Clear existing timeout for content save
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current)
    }
    
    // Clear existing timeout for title update
    if (titleUpdateTimeoutRef.current) {
      clearTimeout(titleUpdateTimeoutRef.current)
    }
    
    // Debounce save operation (save after 1 second of inactivity)
    saveTimeoutRef.current = setTimeout(async () => {
      try {
        const content = editor.getJSON()
        const contentString = JSON.stringify(content)
        
        // Update document in backend
        await documentApi.update(docId, contentString)
        
        // Update local documents state
        setDocuments(prevDocs => {
          return prevDocs.map(doc => 
            doc.id === docId 
              ? { ...doc, content: contentString, updatedAt: new Date().toISOString() }
              : doc
          )
        })
        
        // Update open tabs
        setOpenTabs(prevTabs => {
          return prevTabs.map(tab => 
            tab.id === docId 
              ? { ...tab, content: contentString, updatedAt: new Date().toISOString() }
              : tab
          )
        })
        
      } catch (error) {
        console.error('[Layout] Failed to save document:', error)
      }
    }, 1000) // 1 second debounce for content save
    
    // Check for title update when user presses Enter (has multiple paragraphs)
    // Only check if title hasn't been auto-updated yet for this document
    if (!titleUpdatedRef.current.has(docId)) {
      const content = editor.getJSON()
      const currentDoc = documentsRef.current.find(doc => doc.id === docId)
      
      // Only update title if:
      // 1. Title is default format (Doc X, Section X, or Chapter X)
      // 2. User has pressed Enter (has multiple paragraphs)
      // 3. First line has content
      if (currentDoc && isDefaultTitle(currentDoc.title) && hasMultipleParagraphs(content)) {
        const firstLineText = extractFirstLineText(content)
        if (firstLineText) {
          // Clear any pending title update timeout
          if (titleUpdateTimeoutRef.current) {
            clearTimeout(titleUpdateTimeoutRef.current)
          }
          
          // Update title immediately when user presses Enter (with short delay)
          titleUpdateTimeoutRef.current = setTimeout(async () => {
            try {
              // Take first 50 characters as new title
              const titleCandidate = firstLineText.length > 50 
                ? firstLineText.substring(0, 50).trim() 
                : firstLineText.trim()
              
              if (titleCandidate && titleCandidate !== currentDoc.title) {
                await documentApi.updateTitle(docId, titleCandidate)
                
                // Mark as updated to prevent future auto-updates
                titleUpdatedRef.current.add(docId)
                
                // Update local documents state with new title
                setDocuments(prevDocs => {
                  return prevDocs.map(doc => 
                    doc.id === docId 
                      ? { ...doc, title: titleCandidate, updatedAt: new Date().toISOString() }
                      : doc
                  )
                })
                
                // Update open tabs with new title
                setOpenTabs(prevTabs => {
                  return prevTabs.map(tab => 
                    tab.id === docId 
                      ? { ...tab, title: titleCandidate, updatedAt: new Date().toISOString() }
                      : tab
                  )
                })
                
                // Update current document if it's the active one
                // IMPORTANT: Preserve the current document's content to avoid overwriting unsaved changes
                // Only update the title, not the entire document object
                setDocument(prevDoc => {
                  if (prevDoc?.id === docId) {
                    // Preserve current content to avoid overwriting editor content that hasn't been saved yet
                    return {
                      ...prevDoc,
                      title: titleCandidate,
                      updatedAt: new Date().toISOString()
                    }
                  }
                  return prevDoc
                })
                
              }
            } catch (titleError) {
              console.error('[Layout] Failed to auto-update document title:', titleError)
            }
          }, 500) // Short delay after detecting newline (500ms)
        }
      }
    }
  }, [])


  // OLD SINGLE EDITOR INSTANCE - REMOVED
  // In multi-editor architecture, each document has its own editor instance
  // created in DocumentEditorWrapper component

  // Handle app close: restore documents to last saved state
  useEffect(() => {
    const handleWindowWillClose = async () => {
      
      // Save current document ID for restoration on next app launch
      if (document?.id) {
        try {
          localStorage.setItem('lastOpenedDocument', document.id)
        } catch (error) {
          console.error('Failed to save last opened document:', error)
        }
      }
      
      // Save WorldLab changes if in WorldLab mode before closing
      if (isWorldLabMode && worldLabData) {
        await saveWorldLabChangesImmediately(worldLabData)
      }
      
      // Reload current document from backend to restore to last saved state
      if (document?.id) {
        const editor = getEditor(document.id)
        if (editor && !editor.isDestroyed) {
          try {
            // Reload document from backend
            const savedDoc = await documentApi.get(document.id)
            if (savedDoc && editor && !editor.isDestroyed) {
              // Update editor content to match saved state (this discards unsaved changes)
              editor.commands.setContent(savedDoc.content || '')
      }
    } catch (error) {
            console.error('Failed to restore document on close:', error)
          }
        }
      }
    }

    // Listen for window-will-close event from Electron main process
    if (window.electron) {
      const unsubscribe = window.electron.on('window-will-close', handleWindowWillClose)
      return () => {
        if (unsubscribe) unsubscribe()
      }
    }
    
    // Fallback to beforeunload for non-Electron environments (e.g., web)
    const handleBeforeUnload = async () => {
      // Save current document ID for restoration on next app launch
      if (document?.id) {
        try {
          localStorage.setItem('lastOpenedDocument', document.id)
        } catch (error) {
          console.error('Failed to save last opened document:', error)
        }
      }
      
      // Save current document before leaving
      if (document?.id) {
        // Clear any pending debounced saves and save immediately
        if (saveTimeoutRef.current) {
          clearTimeout(saveTimeoutRef.current)
          saveTimeoutRef.current = null
        }
        
        // Save WorldLab changes if in WorldLab mode
        if (isWorldLabMode && worldLabData) {
          await saveWorldLabChangesImmediately(worldLabData)
        } else {
          await saveDocumentImmediately(document.id)
        }
      }
    }
    
    window.addEventListener('beforeunload', handleBeforeUnload)
    
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload)
    }
  }, [document?.id, isWorldLabMode, worldLabData, saveDocumentImmediately, saveWorldLabChangesImmediately])

  // Search results use temporary highlights (Chrome-style) that are not saved to the document

  // Update editor content when document changes
  useEffect(() => {
    if (!document) {
      lastContentRef.current = ''
      currentDocIdRef.current = null
      currentDocTitleRef.current = null
      return
    }
    
    // Get the editor instance for this document
    const editor = getEditor(document.id)
    if (!editor) return
    
    // Note: In multi-editor architecture, each document has its own editor instance
    // Content is set when the editor is created, not when switching documents
    // This effect is kept for backward compatibility but may not be needed in the new architecture
    
    // Skip if content hasn't changed AND document ID is the same
    const documentChanged = currentDocIdRef.current !== document.id
    const contentChanged = lastContentRef.current !== document.content
    
    // If only title changed (not content or ID), skip editor update
    if (!documentChanged && !contentChanged) {
      currentDocTitleRef.current = document.title
      return
    }
    
    // Update current doc ID and title refs
    currentDocIdRef.current = document.id
    currentDocTitleRef.current = document.title
    
    // Capture current document in closure to avoid stale reference
    const docContent = document.content
    
    let timeoutId: ReturnType<typeof setTimeout> | null = null
    let focusTimeoutId: ReturnType<typeof setTimeout> | null = null
    let isCancelled = false
    
    // Use queueMicrotask + setTimeout to ensure we're completely outside React's render
    queueMicrotask(() => {
      if (isCancelled) return
      
      // Additional delay to ensure DOM is ready and React has finished
      timeoutId = setTimeout(() => {
        if (isCancelled) return
        
         try {
          const content = JSON.parse(docContent)
          
            // Get the editor instance for this document
            // In multi-editor architecture, we get the editor from the map
            const currentEditor = getEditor(document.id)
            if (!currentEditor || currentEditor.isDestroyed || !currentEditor.view) {
              return
            }
            
            // Always clear search highlights before setting new content
            // This ensures highlights don't persist when navigating between documents
            clearSearchHighlights(currentEditor)
            
            // Check if this is a new tab (document not in openTabs before)
            const isNewTab = !openTabs.some(tab => tab.id === document.id)
            
            // If this is a newly created document, focus immediately before setting content
            // This prevents placeholder from showing
            if (isNewlyCreatedDocRef.current && currentEditor && !currentEditor.isDestroyed && currentEditor.view) {
              try {
                const editorElement = currentEditor.view.dom as HTMLElement
                if (editorElement) {
                  editorElement.focus()
                  currentEditor.commands.focus('start')
                }
              } catch (e) {
                // Ignore focus errors
              }
            }
            
            // Restore scroll position BEFORE setting content to prevent any scrolling animation
            // Only restore scroll position if this is NOT a new tab (i.e., switching to existing tab)
            // If it's a new tab, show top of document instead
            const savedScrollTop = (() => {
              // If it's a new tab, don't restore scroll position - show top instead
              if (isNewTab) {
                return null
              }
              try {
                const saved = localStorage.getItem(`documentScroll_${document.id}`)
                return saved ? parseFloat(saved) : null
              } catch {
                return null
              }
            })()
            
            // Get scroll container and disable scroll behavior temporarily to prevent animation
            const scrollContainer = currentEditor.view.dom.closest('.scrollable-container') as HTMLElement
            let originalScrollBehavior: string | null = null
            
            if (scrollContainer) {
              // Save original scroll-behavior and set to 'auto' to disable smooth scrolling
              originalScrollBehavior = scrollContainer.style.scrollBehavior || ''
              scrollContainer.style.scrollBehavior = 'auto'
              
              // Set scroll position BEFORE setting content to prevent any scroll animation
              if (savedScrollTop !== null && savedScrollTop > 0) {
                scrollContainer.scrollTop = savedScrollTop
              } else if (isNewTab) {
                scrollContainer.scrollTop = 0
              }
            }
            
            // Note: In multi-editor architecture, each editor instance has its own content
            // Content is set when the editor is created in DocumentEditorWrapper
            // This setContent call is only needed if document content is updated from server
            // and the editor already exists
            if (contentChanged) {
              // Only update content if it changed from server
              currentEditor.commands.setContent(content, { emitUpdate: false })
            }
            
            lastContentRef.current = docContent
            
            // Clear search highlights after setting content (in case they were preserved)
            // This ensures that when switching back to a document, old highlights are cleared
            const docEditorRef = getDocumentEditorRef(document.id)
            if (docEditorRef.current) {
              docEditorRef.current.clearSearch()
            }
            
            // Auto-focus editor if document is empty (newly created or empty existing document)
            // This provides better UX - user can immediately start typing
            const isEmpty = isDocumentEmpty(content)
            if (isEmpty && currentEditor && !currentEditor.isDestroyed && currentEditor.view) {
              // Use requestAnimationFrame to ensure content is fully rendered before focusing
              requestAnimationFrame(() => {
                if (isCancelled) return
                const focusEditor = getEditor(document.id)
                if (focusEditor && !focusEditor.isDestroyed && focusEditor.view) {
                  try {
                    const editorElement = focusEditor.view.dom as HTMLElement
                    if (editorElement) {
                      editorElement.focus()
                      focusEditor.commands.focus('start')
                    }
                  } catch (e) {
                    // Ignore focus errors
                  }
                }
              })
            }
            
            // Restore scroll position immediately after content is set (synchronously, no animation)
            if (scrollContainer) {
              // Set scroll position synchronously immediately after setContent
              if (savedScrollTop !== null && savedScrollTop > 0) {
                scrollContainer.scrollTop = savedScrollTop
              } else if (isNewTab) {
                scrollContainer.scrollTop = 0
              }
              
              // Use requestAnimationFrame to ensure DOM layout is complete, then set scroll again
              // This ensures scroll position is correct even if content layout changed
              // Keep scroll-behavior as 'auto' during this to prevent any animation
              requestAnimationFrame(() => {
                if (isCancelled || !currentEditor || currentEditor.isDestroyed || !scrollContainer) {
                  // Restore scroll-behavior even if cancelled
                  if (originalScrollBehavior !== null) {
                    scrollContainer.style.scrollBehavior = originalScrollBehavior || ''
                  }
                  return
                }
                
                // Ensure scroll-behavior is still 'auto' before setting scroll
                scrollContainer.style.scrollBehavior = 'auto'
                
                // Set scroll position synchronously (no animation)
                if (savedScrollTop !== null && savedScrollTop > 0) {
                  scrollContainer.scrollTop = savedScrollTop
                } else if (isNewTab) {
                  scrollContainer.scrollTop = 0
                }
                
                // Restore original scroll-behavior after setting scroll position
                // Use a tiny delay to ensure scroll position is applied
                setTimeout(() => {
                  if (scrollContainer && originalScrollBehavior !== null) {
                    scrollContainer.style.scrollBehavior = originalScrollBehavior || ''
                  }
                }, 0)
              })
            }
            
            // After content is set, clear highlights again if search mode is off
            // This handles cases where content from server might have highlights
            if (!isSearchMode || !searchQuery.trim()) {
              setTimeout(() => {
                if (currentEditor && !currentEditor.isDestroyed) {
                  clearSearchHighlights(currentEditor)
                }
              }, 50)
            }
            
            // Check if we have a pending search navigation
            // First check the ref
            let pendingNav = pendingSearchNavRef.current
            
            // If ref is null, try to restore from sessionStorage (backup)
            if (!pendingNav) {
              try {
                const stored = sessionStorage.getItem('pendingSearchNav')
                if (stored) {
                  const parsed = JSON.parse(stored)
                  
                  // Only use if it matches current document
                  if (parsed.targetDocId === document.id) {
                    pendingNav = { query: parsed.query, position: parsed.position }
                    // Also restore to ref for consistency
                    pendingSearchNavRef.current = pendingNav
                  } else {
                    // Clear stale sessionStorage entry
                    sessionStorage.removeItem('pendingSearchNav')
                  }
                }
              } catch (e) {
                // Silently fail
              }
            }
            
            // If we have pending navigation, execute it after content is set
            if (pendingNav && pendingNav.query && pendingNav.position !== undefined) {
              // Use a small delay to ensure editor is ready
              setTimeout(() => {
                const navEditor = getEditor(document.id)
                if (navEditor && !navEditor.isDestroyed) {
                  navigateToMatch(navEditor, pendingNav!.query, pendingNav!.position)
                  // Clear pending nav since we've used it
                  pendingSearchNavRef.current = null
                  try {
                    sessionStorage.removeItem('pendingSearchNav')
                  } catch (e) {
                    // Silently fail
                  }
                }
              }, 200)
            }
            
            // Restore focus if this is a newly created document
            // Only focus if we're navigating from search (not from clicking in file explorer)
            if (isNewlyCreatedDocRef.current && !isNavigatingFromSearchRef.current) {
              // Focus after a delay to ensure editor is ready
              focusTimeoutId = setTimeout(() => {
                if (isCancelled) return
                const focusEditor = getEditor(document.id)
                if (focusEditor && !focusEditor.isDestroyed && focusEditor.view) {
                  try {
                    const editorElement = focusEditor.view.dom as HTMLElement
                    if (editorElement) {
                      editorElement.focus()
                      focusEditor.commands.focus('start')
                    }
                  } catch (e) {
                    // Ignore focus errors
                  }
                }
                // Clear the flag after focusing
                isNewlyCreatedDocRef.current = false
              }, 100)
            } else if (isNewlyCreatedDocRef.current) {
              // Clear flag even if we're not focusing (navigating from search)
              isNewlyCreatedDocRef.current = false
            }
            
            // Clear navigating flag after handling
            isNavigatingFromSearchRef.current = false
            
            // If search mode is active and we have a query, highlight matches
            if (isSearchMode && searchQuery.trim()) {
              setTimeout(() => {
                const highlightEditor = getEditor(document.id)
                if (highlightEditor && !highlightEditor.isDestroyed) {
                  highlightAllMatches(highlightEditor, searchQuery)
                }
              }, 300)
            }
          } catch (error) {
            console.error('Failed to parse document content:', error)
          }
        }, 100) // Increased delay to ensure full render cycle completion
      })
    
    return () => {
      isCancelled = true
      if (timeoutId) clearTimeout(timeoutId)
      if (focusTimeoutId) clearTimeout(focusTimeoutId)
    }
  }, [document?.id, document?.content, searchQuery, openTabs])

  // Automatically highlight all matches when search query changes and search mode is active
  // Also clear highlights when search mode is turned off
  useEffect(() => {
    if (!document) return
    const currentEditor = getEditor(document.id)
    if (!currentEditor) return
    
    if (isSearchMode && searchQuery.trim()) {
      // Wait a bit for editor to be ready, then highlight all matches
      const timeoutId = setTimeout(() => {
        if (currentEditor && !currentEditor.isDestroyed) {
          highlightAllMatches(currentEditor, searchQuery)
        }
      }, 300)
      
      return () => clearTimeout(timeoutId)
    } else {
      // Clear highlights when search mode is off or query is empty
      // This ensures ALL temporary highlights are cleared, not just in current document
      // Use a small delay to ensure editor is ready
      const clearTimeoutId = setTimeout(() => {
        if (currentEditor && !currentEditor.isDestroyed) {
          clearSearchHighlights(currentEditor)
        }
      }, 100)
      
      return () => clearTimeout(clearTimeoutId)
    }
  }, [searchQuery, isSearchMode, document?.id, theme])
  
  // Additional effect: Clear highlights whenever search mode is turned off
  // This ensures highlights are cleared even when switching documents
  useEffect(() => {
    if (!document) return
    const currentEditor = getEditor(document.id)
    if (!currentEditor) return
    
    if (!isSearchMode) {
      // Search mode is off - clear highlights immediately
      const clearTimeoutId = setTimeout(() => {
        if (currentEditor && !currentEditor.isDestroyed) {
          clearSearchHighlights(currentEditor)
        }
      }, 50)
      
      return () => clearTimeout(clearTimeoutId)
    }
  }, [isSearchMode, document?.id])

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current)
      }
    }
  }, [])

  // Save AI panel state to localStorage when open/close state changes
  // (width changes are handled in handlePanelResize with debouncing)
  useEffect(() => {
    saveAIPanelState({
      isOpen: isAIPanelOpen,
      width: aiPanelWidth
    })
  }, [isAIPanelOpen])

  // Restore panel sizes when AI panel state changes
  // Note: This should NOT run when fileExplorerSize changes (user resizing file explorer)
  useEffect(() => {
    // Don't interfere if user is actively resizing either panel
    if (isUserResizingRef.current || isFileExplorerResizingRef.current) return
    
    const timer = setTimeout(() => {
      if (isAIPanelOpen && aiPanelRef.current && editorPanelRef.current && fileExplorerPanelRef.current) {
        // AI panel is opening
        // Ensure File Explorer keeps its size
        const currentFileExplorerSize = fileExplorerPanelRef.current.getSize()
        if (Math.abs(currentFileExplorerSize - fileExplorerSize) > 0.1) {
          fileExplorerPanelRef.current.resize(fileExplorerSize)
        }
      }
    }, 100)
    
    return () => clearTimeout(timer)
  }, [isAIPanelOpen, fileExplorerSize])

  // Handle app close: restore documents to last saved state
  useEffect(() => {
    const handleWindowWillClose = async () => {
      
      // Save current document ID for restoration on next app launch
      if (document?.id) {
        try {
          localStorage.setItem('lastOpenedDocument', document.id)
        } catch (error) {
          console.error('Failed to save last opened document:', error)
        }
      }
      
      // Reload current document from backend to restore to last saved state
      if (document?.id) {
        const editor = getEditor(document.id)
        if (editor && !editor.isDestroyed) {
          try {
            // Reload document from backend
            const savedDoc = await documentApi.get(document.id)
            if (savedDoc && editor && !editor.isDestroyed) {
              // Update editor content to match saved state (this discards unsaved changes)
              editor.commands.setContent(savedDoc.content || '')
            }
          } catch (error) {
            console.error('Failed to restore document on close:', error)
          }
        }
      }
    }

    // Listen for window-will-close event from Electron main process
    if (window.electron) {
      const unsubscribe = window.electron.on('window-will-close', handleWindowWillClose)
      return () => {
        if (unsubscribe) unsubscribe()
      }
    }
    
    // Fallback to beforeunload for non-Electron environments (e.g., web)
    const handleBeforeUnload = async () => {
      // Save current document ID for restoration on next app launch
      if (document?.id) {
        try {
          localStorage.setItem('lastOpenedDocument', document.id)
        } catch (error) {
          console.error('Failed to save last opened document:', error)
        }
      }
      
      // Save current document before leaving
      if (document?.id) {
        // Clear any pending debounced saves and save immediately
        if (saveTimeoutRef.current) {
          clearTimeout(saveTimeoutRef.current)
          saveTimeoutRef.current = null
        }
        await saveDocumentImmediately(document.id)
      }
    }
    
    window.addEventListener('beforeunload', handleBeforeUnload)
    
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload)
    }
  }, [document?.id, saveDocumentImmediately])

  // Search results use temporary highlights (Chrome-style) that are not saved to the document

  // Update editor content when document changes
  useEffect(() => {
    if (!document) {
      lastContentRef.current = ''
      currentDocIdRef.current = null
      currentDocTitleRef.current = null
      return
    }
    
    // Get the editor instance for this document
    const editor = getEditor(document.id)
    if (!editor) return
    
    // Note: In multi-editor architecture, each document has its own editor instance
    // Content is set when the editor is created, not when switching documents
    // This effect is kept for backward compatibility but may not be needed in the new architecture
    
    // Skip if content hasn't changed AND document ID is the same
    const documentChanged = currentDocIdRef.current !== document.id
    const contentChanged = lastContentRef.current !== document.content
    
    // If only title changed (not content or ID), skip editor update
    if (!documentChanged && !contentChanged) {
      currentDocTitleRef.current = document.title
      return
    }
    
    // Update current doc ID and title refs
    currentDocIdRef.current = document.id
    currentDocTitleRef.current = document.title
    
    // Capture current document in closure to avoid stale reference
    const docContent = document.content
    
    let timeoutId: ReturnType<typeof setTimeout> | null = null
    let focusTimeoutId: ReturnType<typeof setTimeout> | null = null
    let isCancelled = false
    
    // Use queueMicrotask + setTimeout to ensure we're completely outside React's render
    queueMicrotask(() => {
      if (isCancelled) return
      
      // Additional delay to ensure DOM is ready and React has finished
      timeoutId = setTimeout(() => {
        if (isCancelled) return
        
         try {
          const content = JSON.parse(docContent)
          
            // Get the editor instance for this document
            // In multi-editor architecture, we get the editor from the map
            const currentEditor = getEditor(document.id)
            if (!currentEditor || currentEditor.isDestroyed || !currentEditor.view) {
              return
            }
            
            // Always clear search highlights before setting new content
            // This ensures highlights don't persist when navigating between documents
            clearSearchHighlights(currentEditor)
            
            // Check if this is a new tab (document not in openTabs before)
            const isNewTab = !openTabs.some(tab => tab.id === document.id)
            
            // If this is a newly created document, focus immediately before setting content
            // This prevents placeholder from showing
            if (isNewlyCreatedDocRef.current && currentEditor && !currentEditor.isDestroyed && currentEditor.view) {
              try {
                const editorElement = currentEditor.view.dom as HTMLElement
                if (editorElement) {
                  editorElement.focus()
                  currentEditor.commands.focus('start')
                }
              } catch (e) {
                // Ignore focus errors
              }
            }
            
            // Restore scroll position BEFORE setting content to prevent any scrolling animation
            // Only restore scroll position if this is NOT a new tab (i.e., switching to existing tab)
            // If it's a new tab, show top of document instead
            const savedScrollTop = (() => {
              // If it's a new tab, don't restore scroll position - show top instead
              if (isNewTab) {
                return null
              }
              try {
                const saved = localStorage.getItem(`documentScroll_${document.id}`)
                return saved ? parseFloat(saved) : null
              } catch {
                return null
              }
            })()
            
            // Get scroll container and disable scroll behavior temporarily to prevent animation
            const scrollContainer = currentEditor.view.dom.closest('.scrollable-container') as HTMLElement
            let originalScrollBehavior: string | null = null
            
            if (scrollContainer) {
              // Save original scroll-behavior and set to 'auto' to disable smooth scrolling
              originalScrollBehavior = scrollContainer.style.scrollBehavior || ''
              scrollContainer.style.scrollBehavior = 'auto'
              
              // Set scroll position BEFORE setting content to prevent any scroll animation
              if (savedScrollTop !== null && savedScrollTop > 0) {
                scrollContainer.scrollTop = savedScrollTop
              } else if (isNewTab) {
                scrollContainer.scrollTop = 0
              }
            }
            
            // Note: In multi-editor architecture, each editor instance has its own content
            // Content is set when the editor is created in DocumentEditorWrapper
            // This setContent call is only needed if document content is updated from server
            // and the editor already exists
            if (contentChanged) {
              // Only update content if it changed from server
              currentEditor.commands.setContent(content, { emitUpdate: false })
            }
            
            lastContentRef.current = docContent
            
            // Clear search highlights after setting content (in case they were preserved)
            // This ensures that when switching back to a document, old highlights are cleared
            const docEditorRef = getDocumentEditorRef(document.id)
            if (docEditorRef.current) {
              docEditorRef.current.clearSearch()
            }
            
            // Auto-focus editor if document is empty (newly created or empty existing document)
            // This provides better UX - user can immediately start typing
            const isEmpty = isDocumentEmpty(content)
            if (isEmpty && currentEditor && !currentEditor.isDestroyed && currentEditor.view) {
              // Use requestAnimationFrame to ensure content is fully rendered before focusing
              requestAnimationFrame(() => {
                if (isCancelled) return
                const focusEditor = getEditor(document.id)
                if (focusEditor && !focusEditor.isDestroyed && focusEditor.view) {
                  try {
                    const editorElement = focusEditor.view.dom as HTMLElement
                    if (editorElement) {
                      editorElement.focus()
                      focusEditor.commands.focus('start')
                    }
                  } catch (e) {
                    // Ignore focus errors
                  }
                }
              })
            }
            
            // Restore scroll position immediately after content is set (synchronously, no animation)
            if (scrollContainer) {
              // Set scroll position synchronously immediately after setContent
              if (savedScrollTop !== null && savedScrollTop > 0) {
                scrollContainer.scrollTop = savedScrollTop
              } else if (isNewTab) {
                scrollContainer.scrollTop = 0
              }
              
              // Use requestAnimationFrame to ensure DOM layout is complete, then set scroll again
              // This ensures scroll position is correct even if content layout changed
              // Keep scroll-behavior as 'auto' during this to prevent any animation
              requestAnimationFrame(() => {
                if (isCancelled || !currentEditor || currentEditor.isDestroyed || !scrollContainer) {
                  // Restore scroll-behavior even if cancelled
                  if (originalScrollBehavior !== null) {
                    scrollContainer.style.scrollBehavior = originalScrollBehavior || ''
                  }
                  return
                }
                
                // Ensure scroll-behavior is still 'auto' before setting scroll
                scrollContainer.style.scrollBehavior = 'auto'
                
                // Set scroll position synchronously (no animation)
                if (savedScrollTop !== null && savedScrollTop > 0) {
                  scrollContainer.scrollTop = savedScrollTop
                } else if (isNewTab) {
                  scrollContainer.scrollTop = 0
                }
                
                // Restore original scroll-behavior after setting scroll position
                // Use a tiny delay to ensure scroll position is applied
                setTimeout(() => {
                  if (scrollContainer && originalScrollBehavior !== null) {
                    scrollContainer.style.scrollBehavior = originalScrollBehavior || ''
                  }
                }, 0)
              })
            }
            
            // After content is set, clear highlights again if search mode is off
            // This handles cases where content from server might have highlights
            if (!isSearchMode || !searchQuery.trim()) {
              setTimeout(() => {
                if (currentEditor && !currentEditor.isDestroyed) {
                  clearSearchHighlights(currentEditor)
                }
              }, 50)
            }
            
            // Check if we have a pending search navigation
            // First check the ref
            let pendingNav = pendingSearchNavRef.current
            
            // If ref is null, try to restore from sessionStorage (backup)
            if (!pendingNav) {
              try {
                const stored = sessionStorage.getItem('pendingSearchNav')
                if (stored) {
                  const parsed = JSON.parse(stored)
                  
                  // Only use if it matches current document
                  if (parsed.targetDocId === document.id) {
                    pendingNav = { query: parsed.query, position: parsed.position }
                    // Also restore to ref for consistency
                    pendingSearchNavRef.current = pendingNav
                  } else {
                    // Clear stale sessionStorage entry
                    sessionStorage.removeItem('pendingSearchNav')
                  }
                }
              } catch (e) {
                // Silently fail
              }
            }
            
            // If we have pending navigation, execute it after content is set
            if (pendingNav && pendingNav.query && pendingNav.position !== undefined) {
              // Use a small delay to ensure editor is ready
              setTimeout(() => {
                const navEditor = getEditor(document.id)
                if (navEditor && !navEditor.isDestroyed) {
                  navigateToMatch(navEditor, pendingNav!.query, pendingNav!.position)
                  // Clear pending nav since we've used it
                  pendingSearchNavRef.current = null
                  try {
                    sessionStorage.removeItem('pendingSearchNav')
                  } catch (e) {
                    // Silently fail
                  }
                }
              }, 200)
            }
            
            // Restore focus if this is a newly created document
            // Only focus if we're navigating from search (not from clicking in file explorer)
            if (isNewlyCreatedDocRef.current && !isNavigatingFromSearchRef.current) {
              // Focus after a delay to ensure editor is ready
              focusTimeoutId = setTimeout(() => {
                if (isCancelled) return
                const focusEditor = getEditor(document.id)
                if (focusEditor && !focusEditor.isDestroyed && focusEditor.view) {
                  try {
                    const editorElement = focusEditor.view.dom as HTMLElement
                    if (editorElement) {
                      editorElement.focus()
                      focusEditor.commands.focus('start')
                    }
                  } catch (e) {
                    // Ignore focus errors
                  }
                }
                // Clear the flag after focusing
                isNewlyCreatedDocRef.current = false
              }, 100)
            } else if (isNewlyCreatedDocRef.current) {
              // Clear flag even if we're not focusing (navigating from search)
              isNewlyCreatedDocRef.current = false
            }
            
            // Clear navigating flag after handling
            isNavigatingFromSearchRef.current = false
            
            // If search mode is active and we have a query, highlight matches
            if (isSearchMode && searchQuery.trim()) {
              setTimeout(() => {
                const highlightEditor = getEditor(document.id)
                if (highlightEditor && !highlightEditor.isDestroyed) {
                  highlightAllMatches(highlightEditor, searchQuery)
                }
              }, 300)
            }
          } catch (error) {
            console.error('Failed to parse document content:', error)
          }
        }, 100) // Increased delay to ensure full render cycle completion
      })
    
    return () => {
      isCancelled = true
      if (timeoutId) clearTimeout(timeoutId)
      if (focusTimeoutId) clearTimeout(focusTimeoutId)
    }
  }, [document?.id, document?.content, searchQuery, openTabs])

  // Automatically highlight all matches when search query changes and search mode is active
  // Also clear highlights when search mode is turned off
  useEffect(() => {
    if (!document) return
    const currentEditor = getEditor(document.id)
    if (!currentEditor) return
    
    if (isSearchMode && searchQuery.trim()) {
      // Wait a bit for editor to be ready, then highlight all matches
      const timeoutId = setTimeout(() => {
        if (currentEditor && !currentEditor.isDestroyed) {
          highlightAllMatches(currentEditor, searchQuery)
        }
      }, 300)
      
      return () => clearTimeout(timeoutId)
    } else {
      // Clear highlights when search mode is off or query is empty
      // This ensures ALL temporary highlights are cleared, not just in current document
      // Use a small delay to ensure editor is ready
      const clearTimeoutId = setTimeout(() => {
        if (currentEditor && !currentEditor.isDestroyed) {
          clearSearchHighlights(currentEditor)
        }
      }, 100)
      
      return () => clearTimeout(clearTimeoutId)
    }
  }, [searchQuery, isSearchMode, document?.id, theme])
  
  // Additional effect: Clear highlights whenever search mode is turned off
  // This ensures highlights are cleared even when switching documents
  useEffect(() => {
    if (!document) return
    const currentEditor = getEditor(document.id)
    if (!currentEditor) return
    
    if (!isSearchMode) {
      // Search mode is off - clear highlights immediately
      const clearTimeoutId = setTimeout(() => {
        if (currentEditor && !currentEditor.isDestroyed) {
          clearSearchHighlights(currentEditor)
        }
      }, 50)
      
      return () => clearTimeout(clearTimeoutId)
    }
  }, [isSearchMode, document?.id])

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current)
      }
    }
  }, [])

  // Save AI panel state to localStorage when open/close state changes
  // (width changes are handled in handlePanelResize with debouncing)
  useEffect(() => {
    saveAIPanelState({
      isOpen: isAIPanelOpen,
      width: aiPanelWidth
    })
  }, [isAIPanelOpen])

  // Restore panel sizes when AI panel state changes
  // Note: This should NOT run when fileExplorerSize changes (user resizing file explorer)
  useEffect(() => {
    // Don't interfere if user is actively resizing either panel
    if (isUserResizingRef.current || isFileExplorerResizingRef.current) return
    
    const timer = setTimeout(() => {
      if (isAIPanelOpen && aiPanelRef.current && editorPanelRef.current && fileExplorerPanelRef.current) {
        // AI panel is opening
        // Ensure File Explorer keeps its size
        const currentFileExplorerSize = fileExplorerPanelRef.current.getSize()
        if (Math.abs(currentFileExplorerSize - fileExplorerSize) > 0.1) {
          fileExplorerPanelRef.current.resize(fileExplorerSize)
        }
      }
    }, 100)
    
    return () => clearTimeout(timer)
  }, [isAIPanelOpen, fileExplorerSize])
  
  // Handle app close: restore documents to last saved state
  useEffect(() => {
    const handleWindowWillClose = async () => {
      
      // Reload current document from backend to restore to last saved state
      if (document?.id) {
        const editor = getEditor(document.id)
        if (editor && !editor.isDestroyed) {
        try {
          // Reload document from backend
          const savedDoc = await documentApi.get(document.id)
          if (savedDoc && editor && !editor.isDestroyed) {
            // Update editor content to match saved state (this discards unsaved changes)
            editor.commands.setContent(savedDoc.content || '')
          }
        } catch (error) {
          console.error('Failed to restore document on close:', error)
          }
        }
      }
    }

    // Listen for window-will-close event from Electron main process
    if (window.electron) {
      const unsubscribe = window.electron.on('window-will-close', handleWindowWillClose)
      return () => {
        if (unsubscribe) unsubscribe()
      }
    }
    
    // Fallback to beforeunload for non-Electron environments (e.g., web)
    const handleBeforeUnload = async () => {
      // Save current document ID for restoration on next app launch
      if (document?.id) {
        try {
          localStorage.setItem('lastOpenedDocument', document.id)
        } catch (error) {
          console.error('Failed to save last opened document:', error)
        }
      }
      
      // Save current document before leaving
      if (document?.id) {
        // Clear any pending debounced saves and save immediately
        if (saveTimeoutRef.current) {
          clearTimeout(saveTimeoutRef.current)
          saveTimeoutRef.current = null
        }
        await saveDocumentImmediately(document.id)
      }
    }
    
    window.addEventListener('beforeunload', handleBeforeUnload)
    
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload)
    }
  }, [document?.id, saveDocumentImmediately])

  // Search results use temporary highlights (Chrome-style) that are not saved to the document

  // Update editor content when document changes
  useEffect(() => {
    if (!document) {
      lastContentRef.current = ''
      currentDocIdRef.current = null
      currentDocTitleRef.current = null
      return
    }
    
    // Get the editor instance for this document
    const editor = getEditor(document.id)
    if (!editor) return
    
    // Note: In multi-editor architecture, each document has its own editor instance
    // Content is set when the editor is created, not when switching documents
    // This effect is kept for backward compatibility but may not be needed in the new architecture
    
    // Skip if content hasn't changed AND document ID is the same
    const documentChanged = currentDocIdRef.current !== document.id
    const contentChanged = lastContentRef.current !== document.content
    
    // If only title changed (not content or ID), skip editor update
    if (!documentChanged && !contentChanged) {
      currentDocTitleRef.current = document.title
      return
    }
    
    // Update current doc ID and title refs
    currentDocIdRef.current = document.id
    currentDocTitleRef.current = document.title
    
    // Capture current document in closure to avoid stale reference
    const docContent = document.content
    
    let timeoutId: ReturnType<typeof setTimeout> | null = null
    let focusTimeoutId: ReturnType<typeof setTimeout> | null = null
    let isCancelled = false
    
    // Use queueMicrotask + setTimeout to ensure we're completely outside React's render
    queueMicrotask(() => {
      if (isCancelled) return
      
      // Additional delay to ensure DOM is ready and React has finished
      timeoutId = setTimeout(() => {
        if (isCancelled) return
        
         try {
          const content = JSON.parse(docContent)
          
            // Get the editor instance for this document
            // In multi-editor architecture, we get the editor from the map
            const currentEditor = getEditor(document.id)
            if (!currentEditor || currentEditor.isDestroyed || !currentEditor.view) {
              return
            }
            
            // Always clear search highlights before setting new content
            // This ensures highlights don't persist when navigating between documents
            clearSearchHighlights(currentEditor)
            
            // Check if this is a new tab (document not in openTabs before)
            const isNewTab = !openTabs.some(tab => tab.id === document.id)
            
            // If this is a newly created document, focus immediately before setting content
            // This prevents placeholder from showing
            if (isNewlyCreatedDocRef.current && currentEditor && !currentEditor.isDestroyed && currentEditor.view) {
              try {
                const editorElement = currentEditor.view.dom as HTMLElement
                if (editorElement) {
                  editorElement.focus()
                  currentEditor.commands.focus('start')
                }
              } catch (e) {
                // Ignore focus errors
              }
            }
            
            // Restore scroll position BEFORE setting content to prevent any scrolling animation
            // Only restore scroll position if this is NOT a new tab (i.e., switching to existing tab)
            // If it's a new tab, show top of document instead
            const savedScrollTop = (() => {
              // If it's a new tab, don't restore scroll position - show top instead
              if (isNewTab) {
                return null
              }
              try {
                const saved = localStorage.getItem(`documentScroll_${document.id}`)
                return saved ? parseFloat(saved) : null
              } catch {
                return null
              }
            })()
            
            // Get scroll container and disable scroll behavior temporarily to prevent animation
            const scrollContainer = currentEditor.view.dom.closest('.scrollable-container') as HTMLElement
            let originalScrollBehavior: string | null = null
            
            if (scrollContainer) {
              // Save original scroll-behavior and set to 'auto' to disable smooth scrolling
              originalScrollBehavior = scrollContainer.style.scrollBehavior || ''
              scrollContainer.style.scrollBehavior = 'auto'
              
              // Set scroll position BEFORE setting content to prevent any scroll animation
              if (savedScrollTop !== null && savedScrollTop > 0) {
                scrollContainer.scrollTop = savedScrollTop
              } else if (isNewTab) {
                scrollContainer.scrollTop = 0
              }
            }
            
            // Note: In multi-editor architecture, each editor instance has its own content
            // Content is set when the editor is created in DocumentEditorWrapper
            // This setContent call is only needed if document content is updated from server
            // and the editor already exists
            if (contentChanged) {
              // Only update content if it changed from server
              currentEditor.commands.setContent(content, { emitUpdate: false })
            }
            
            lastContentRef.current = docContent
            
            // Clear search highlights after setting content (in case they were preserved)
            // This ensures that when switching back to a document, old highlights are cleared
            const docEditorRef = getDocumentEditorRef(document.id)
            if (docEditorRef.current) {
              docEditorRef.current.clearSearch()
            }
            
            // Auto-focus editor if document is empty (newly created or empty existing document)
            // This provides better UX - user can immediately start typing
            const isEmpty = isDocumentEmpty(content)
            if (isEmpty && currentEditor && !currentEditor.isDestroyed && currentEditor.view) {
              // Use requestAnimationFrame to ensure content is fully rendered before focusing
              requestAnimationFrame(() => {
                if (isCancelled) return
                const focusEditor = getEditor(document.id)
                if (focusEditor && !focusEditor.isDestroyed && focusEditor.view) {
                  try {
                    const editorElement = focusEditor.view.dom as HTMLElement
                    if (editorElement) {
                      editorElement.focus()
                      focusEditor.commands.focus('start')
                    }
                  } catch (e) {
                    // Ignore focus errors
                  }
                }
              })
            }
            
            // Restore scroll position immediately after content is set (synchronously, no animation)
            if (scrollContainer) {
              // Set scroll position synchronously immediately after setContent
              if (savedScrollTop !== null && savedScrollTop > 0) {
                scrollContainer.scrollTop = savedScrollTop
              } else if (isNewTab) {
                scrollContainer.scrollTop = 0
              }
              
              // Use requestAnimationFrame to ensure DOM layout is complete, then set scroll again
              // This ensures scroll position is correct even if content layout changed
              // Keep scroll-behavior as 'auto' during this to prevent any animation
              requestAnimationFrame(() => {
                if (isCancelled || !currentEditor || currentEditor.isDestroyed || !scrollContainer) {
                  // Restore scroll-behavior even if cancelled
                  if (originalScrollBehavior !== null) {
                    scrollContainer.style.scrollBehavior = originalScrollBehavior || ''
                  }
                  return
                }
                
                // Ensure scroll-behavior is still 'auto' before setting scroll
                scrollContainer.style.scrollBehavior = 'auto'
                
                // Set scroll position synchronously (no animation)
                if (savedScrollTop !== null && savedScrollTop > 0) {
                  scrollContainer.scrollTop = savedScrollTop
                } else if (isNewTab) {
                  scrollContainer.scrollTop = 0
                }
                
                // Restore original scroll-behavior after setting scroll position
                // Use a tiny delay to ensure scroll position is applied
                setTimeout(() => {
                  if (scrollContainer && originalScrollBehavior !== null) {
                    scrollContainer.style.scrollBehavior = originalScrollBehavior || ''
                  }
                }, 0)
              })
            }
            
            // After content is set, clear highlights again if search mode is off
            // This handles cases where content from server might have highlights
            if (!isSearchMode || !searchQuery.trim()) {
              setTimeout(() => {
                if (currentEditor && !currentEditor.isDestroyed) {
                  clearSearchHighlights(currentEditor)
                }
              }, 50)
            }
            
            // Check if we have a pending search navigation
            // First check the ref
            let pendingNav = pendingSearchNavRef.current
            
            // If ref is null, try to restore from sessionStorage (backup)
            if (!pendingNav) {
              try {
                const stored = sessionStorage.getItem('pendingSearchNav')
                if (stored) {
                  const parsed = JSON.parse(stored)
                  
                  // Only use if it matches current document
                  if (parsed.targetDocId === document.id) {
                    pendingNav = { query: parsed.query, position: parsed.position }
                    // Also restore to ref for consistency
                    pendingSearchNavRef.current = pendingNav
                  } else {
                    // Clear stale sessionStorage entry
                      sessionStorage.removeItem('pendingSearchNav')
                  }
                }
              } catch (e) {
                // Silently fail
              }
            }
            
            // If we have pending navigation, execute it after content is set
            if (pendingNav && pendingNav.query && pendingNav.position !== undefined) {
              // Use a small delay to ensure editor is ready
              setTimeout(() => {
                const navEditor = getEditor(document.id)
                if (navEditor && !navEditor.isDestroyed) {
                  navigateToMatch(navEditor, pendingNav!.query, pendingNav!.position)
                  // Clear pending nav since we've used it
              pendingSearchNavRef.current = null
              try {
                sessionStorage.removeItem('pendingSearchNav')
              } catch (e) {
                // Silently fail
                  }
                }
              }, 200)
            }
            
            // Restore focus if this is a newly created document
            // Only focus if we're navigating from search (not from clicking in file explorer)
            if (isNewlyCreatedDocRef.current && !isNavigatingFromSearchRef.current) {
              // Focus after a delay to ensure editor is ready
              focusTimeoutId = setTimeout(() => {
                if (isCancelled) return
                const focusEditor = getEditor(document.id)
                if (focusEditor && !focusEditor.isDestroyed && focusEditor.view) {
                  try {
                    const editorElement = focusEditor.view.dom as HTMLElement
                    if (editorElement) {
                      editorElement.focus()
                      focusEditor.commands.focus('start')
                    }
                  } catch (e) {
                    // Ignore focus errors
                  }
                }
                // Clear the flag after focusing
                isNewlyCreatedDocRef.current = false
              }, 100)
            } else if (isNewlyCreatedDocRef.current) {
              // Clear flag even if we're not focusing (navigating from search)
              isNewlyCreatedDocRef.current = false
            }
            
            // Clear navigating flag after handling
              isNavigatingFromSearchRef.current = false
              
            // If search mode is active and we have a query, highlight matches
            if (isSearchMode && searchQuery.trim()) {
                setTimeout(() => {
                  const highlightEditor = getEditor(document.id)
                  if (highlightEditor && !highlightEditor.isDestroyed) {
                    highlightAllMatches(highlightEditor, searchQuery)
                  }
              }, 300)
            }
          } catch (error) {
            console.error('Failed to parse document content:', error)
          }
        }, 100) // Increased delay to ensure full render cycle completion
      })
    
    return () => {
      isCancelled = true
      if (timeoutId) clearTimeout(timeoutId)
      if (focusTimeoutId) clearTimeout(focusTimeoutId)
    }
  }, [document?.id, document?.content, searchQuery, openTabs])

  // Automatically highlight all matches when search query changes and search mode is active
  // Also clear highlights when search mode is turned off
  useEffect(() => {
    if (!document) return
    const currentEditor = getEditor(document.id)
    if (!currentEditor) return
    
    if (isSearchMode && searchQuery.trim()) {
      // Wait a bit for editor to be ready, then highlight all matches
      const timeoutId = setTimeout(() => {
        if (currentEditor && !currentEditor.isDestroyed) {
          highlightAllMatches(currentEditor, searchQuery)
        }
      }, 300)
      
      return () => clearTimeout(timeoutId)
    } else {
      // Clear highlights when search mode is off or query is empty
      // This ensures ALL temporary highlights are cleared, not just in current document
      // Use a small delay to ensure editor is ready
      const clearTimeoutId = setTimeout(() => {
        if (currentEditor && !currentEditor.isDestroyed) {
          clearSearchHighlights(currentEditor)
        }
      }, 100)
      
      return () => clearTimeout(clearTimeoutId)
    }
  }, [searchQuery, isSearchMode, document?.id, theme])
  
  // Additional effect: Clear highlights whenever search mode is turned off
  // This ensures highlights are cleared even when switching documents
  useEffect(() => {
    if (!document) return
    const currentEditor = getEditor(document.id)
    if (!currentEditor) return
    
    if (!isSearchMode) {
      // Search mode is off - clear highlights immediately
      const clearTimeoutId = setTimeout(() => {
        if (currentEditor && !currentEditor.isDestroyed) {
          clearSearchHighlights(currentEditor)
        }
      }, 50)
      
      return () => clearTimeout(clearTimeoutId)
    }
  }, [isSearchMode, document?.id])

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current)
      }
    }
  }, [])

  // Save AI panel state to localStorage when open/close state changes
  // (width changes are handled in handlePanelResize with debouncing)
  useEffect(() => {
    saveAIPanelState({
      isOpen: isAIPanelOpen,
      width: aiPanelWidth
    })
  }, [isAIPanelOpen])

  // Restore panel sizes when AI panel state changes
  // Note: This should NOT run when fileExplorerSize changes (user resizing file explorer)
  useEffect(() => {
    // Don't interfere if user is actively resizing either panel
    if (isUserResizingRef.current || isFileExplorerResizingRef.current) return
    
    const timer = setTimeout(() => {
      if (isAIPanelOpen && aiPanelRef.current && editorPanelRef.current && fileExplorerPanelRef.current) {
        // AI panel is opening
        // Ensure File Explorer keeps its size
        const currentFileExplorerSize = fileExplorerPanelRef.current.getSize()
        if (Math.abs(currentFileExplorerSize - fileExplorerSize) > 0.1) {
          fileExplorerPanelRef.current.resize(fileExplorerSize)
        }
      }
    }, 100)
    
    return () => clearTimeout(timer)
  }, [isAIPanelOpen, fileExplorerSize])

  // Handle app close: restore documents to last saved state
  useEffect(() => {
    const handleWindowWillClose = async () => {
      
      // Save current document ID for restoration on next app launch
      if (document?.id) {
        try {
          localStorage.setItem('lastOpenedDocument', document.id)
        } catch (error) {
          console.error('Failed to save last opened document:', error)
        }
      }
      
      // Reload current document from backend to restore to last saved state
      if (document?.id) {
        const editor = getEditor(document.id)
        if (editor && !editor.isDestroyed) {
          try {
            // Reload document from backend
            const savedDoc = await documentApi.get(document.id)
            if (savedDoc && editor && !editor.isDestroyed) {
              // Update editor content to match saved state (this discards unsaved changes)
              editor.commands.setContent(savedDoc.content || '')
            }
          } catch (error) {
            console.error('Failed to restore document on close:', error)
          }
        }
      }
    }

    // Listen for window-will-close event from Electron main process
    if (window.electron) {
      const unsubscribe = window.electron.on('window-will-close', handleWindowWillClose)
      return () => {
        if (unsubscribe) unsubscribe()
      }
    }
    
    // Fallback to beforeunload for non-Electron environments (e.g., web)
    const handleBeforeUnload = async () => {
      // Save current document ID for restoration on next app launch
      if (document?.id) {
        try {
          localStorage.setItem('lastOpenedDocument', document.id)
        } catch (error) {
          console.error('Failed to save last opened document:', error)
        }
      }
      
      // Save current document before leaving
      if (document?.id) {
        // Clear any pending debounced saves and save immediately
        if (saveTimeoutRef.current) {
          clearTimeout(saveTimeoutRef.current)
          saveTimeoutRef.current = null
        }
        await saveDocumentImmediately(document.id)
      }
    }
    
    window.addEventListener('beforeunload', handleBeforeUnload)
    
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload)
    }
  }, [document?.id, saveDocumentImmediately])

  // Search results use temporary highlights (Chrome-style) that are not saved to the document

  // Update editor content when document changes
  useEffect(() => {
    if (!document) {
      lastContentRef.current = ''
      currentDocIdRef.current = null
      currentDocTitleRef.current = null
                    return
                  }
                  
    // Get the editor instance for this document
    const editor = getEditor(document.id)
    if (!editor) return
    
    // Note: In multi-editor architecture, each document has its own editor instance
    // Content is set when the editor is created, not when switching documents
    // This effect is kept for backward compatibility but may not be needed in the new architecture
    
    // Skip if content hasn't changed AND document ID is the same
    const documentChanged = currentDocIdRef.current !== document.id
    const contentChanged = lastContentRef.current !== document.content
    
    // If only title changed (not content or ID), skip editor update
    if (!documentChanged && !contentChanged) {
      currentDocTitleRef.current = document.title
      return
    }
    
    // Update current doc ID and title refs
    currentDocIdRef.current = document.id
    currentDocTitleRef.current = document.title
    
    // Capture current document in closure to avoid stale reference
    const docContent = document.content
    
    let timeoutId: ReturnType<typeof setTimeout> | null = null
    let focusTimeoutId: ReturnType<typeof setTimeout> | null = null
    let isCancelled = false
    
    // Use queueMicrotask + setTimeout to ensure we're completely outside React's render
    queueMicrotask(() => {
      if (isCancelled) return
      
      // Additional delay to ensure DOM is ready and React has finished
      timeoutId = setTimeout(() => {
        if (isCancelled) return
        
         try {
          const content = JSON.parse(docContent)
          
            // Get the editor instance for this document
            // In multi-editor architecture, we get the editor from the map
            const currentEditor = getEditor(document.id)
            if (!currentEditor || currentEditor.isDestroyed || !currentEditor.view) {
              return
            }
            
            // Always clear search highlights before setting new content
            // This ensures highlights don't persist when navigating between documents
            clearSearchHighlights(currentEditor)
            
            // Check if this is a new tab (document not in openTabs before)
            const isNewTab = !openTabs.some(tab => tab.id === document.id)
            
            // If this is a newly created document, focus immediately before setting content
            // This prevents placeholder from showing
            if (isNewlyCreatedDocRef.current && currentEditor && !currentEditor.isDestroyed && currentEditor.view) {
              try {
                const editorElement = currentEditor.view.dom as HTMLElement
                if (editorElement) {
                  editorElement.focus()
                  currentEditor.commands.focus('start')
                }
                      } catch (e) {
                // Ignore focus errors
              }
            }
            
            // Restore scroll position BEFORE setting content to prevent any scrolling animation
            // Only restore scroll position if this is NOT a new tab (i.e., switching to existing tab)
            // If it's a new tab, show top of document instead
            const savedScrollTop = (() => {
              // If it's a new tab, don't restore scroll position - show top instead
              if (isNewTab) {
                return null
              }
              try {
                const saved = localStorage.getItem(`documentScroll_${document.id}`)
                return saved ? parseFloat(saved) : null
              } catch {
                return null
              }
            })()
            
            // Get scroll container and disable scroll behavior temporarily to prevent animation
            const scrollContainer = currentEditor.view.dom.closest('.scrollable-container') as HTMLElement
            let originalScrollBehavior: string | null = null
            
            if (scrollContainer) {
              // Save original scroll-behavior and set to 'auto' to disable smooth scrolling
              originalScrollBehavior = scrollContainer.style.scrollBehavior || ''
              scrollContainer.style.scrollBehavior = 'auto'
              
              // Set scroll position BEFORE setting content to prevent any scroll animation
              if (savedScrollTop !== null && savedScrollTop > 0) {
                scrollContainer.scrollTop = savedScrollTop
              } else if (isNewTab) {
                scrollContainer.scrollTop = 0
              }
            }
            
            // Note: In multi-editor architecture, each editor instance has its own content
            // Content is set when the editor is created in DocumentEditorWrapper
            // This setContent call is only needed if document content is updated from server
            // and the editor already exists
            if (contentChanged) {
              // Only update content if it changed from server
              currentEditor.commands.setContent(content, { emitUpdate: false })
            }
            
            lastContentRef.current = docContent
            
            // Clear search highlights after setting content (in case they were preserved)
            // This ensures that when switching back to a document, old highlights are cleared
            const docEditorRef = getDocumentEditorRef(document.id)
            if (docEditorRef.current) {
              docEditorRef.current.clearSearch()
            }
            
            // Auto-focus editor if document is empty (newly created or empty existing document)
            // This provides better UX - user can immediately start typing
            const isEmpty = isDocumentEmpty(content)
            if (isEmpty && currentEditor && !currentEditor.isDestroyed && currentEditor.view) {
              // Use requestAnimationFrame to ensure content is fully rendered before focusing
              requestAnimationFrame(() => {
                if (isCancelled) return
                const focusEditor = getEditor(document.id)
                if (focusEditor && !focusEditor.isDestroyed && focusEditor.view) {
                  try {
                    const editorElement = focusEditor.view.dom as HTMLElement
                    if (editorElement) {
                      editorElement.focus()
                      focusEditor.commands.focus('start')
                    }
                  } catch (e) {
                    // Ignore focus errors
                  }
                }
              })
            }
            
            // Restore scroll position immediately after content is set (synchronously, no animation)
            if (scrollContainer) {
              // Set scroll position synchronously immediately after setContent
              if (savedScrollTop !== null && savedScrollTop > 0) {
                scrollContainer.scrollTop = savedScrollTop
              } else if (isNewTab) {
                scrollContainer.scrollTop = 0
              }
              
              // Use requestAnimationFrame to ensure DOM layout is complete, then set scroll again
              // This ensures scroll position is correct even if content layout changed
              // Keep scroll-behavior as 'auto' during this to prevent any animation
                requestAnimationFrame(() => {
                if (isCancelled || !currentEditor || currentEditor.isDestroyed || !scrollContainer) {
                  // Restore scroll-behavior even if cancelled
                  if (originalScrollBehavior !== null) {
                    scrollContainer.style.scrollBehavior = originalScrollBehavior || ''
                  }
                  return
                }
                
                // Ensure scroll-behavior is still 'auto' before setting scroll
                scrollContainer.style.scrollBehavior = 'auto'
                
                // Set scroll position synchronously (no animation)
                if (savedScrollTop !== null && savedScrollTop > 0) {
                  scrollContainer.scrollTop = savedScrollTop
              } else if (isNewTab) {
                  scrollContainer.scrollTop = 0
                }
                
                // Restore original scroll-behavior after setting scroll position
                // Use a tiny delay to ensure scroll position is applied
                setTimeout(() => {
                  if (scrollContainer && originalScrollBehavior !== null) {
                    scrollContainer.style.scrollBehavior = originalScrollBehavior || ''
                  }
                }, 0)
              })
            }
            
            // After content is set, clear highlights again if search mode is off
            // This handles cases where content from server might have highlights
            if (!isSearchMode || !searchQuery.trim()) {
              setTimeout(() => {
                if (currentEditor && !currentEditor.isDestroyed) {
                  clearSearchHighlights(currentEditor)
                }
              }, 50)
            }
            
            // Check if we have a pending search navigation
            // First check the ref
            let pendingNav = pendingSearchNavRef.current
            
            // If ref is null, try to restore from sessionStorage (backup)
            if (!pendingNav) {
              try {
                const stored = sessionStorage.getItem('pendingSearchNav')
                if (stored) {
                  const parsed = JSON.parse(stored)
                  
                  // Only use if it matches current document
                  if (parsed.targetDocId === document.id) {
                    pendingNav = { query: parsed.query, position: parsed.position }
                    // Also restore to ref for consistency
                    pendingSearchNavRef.current = pendingNav
              } else {
                    // Clear stale sessionStorage entry
                    sessionStorage.removeItem('pendingSearchNav')
                  }
                }
              } catch (e) {
                // Silently fail
              }
            }
            
            // If we have pending navigation, execute it after content is set
            if (pendingNav && pendingNav.query && pendingNav.position !== undefined) {
              // Use a small delay to ensure editor is ready
              setTimeout(() => {
                const navEditor = getEditor(document.id)
                if (navEditor && !navEditor.isDestroyed) {
                  navigateToMatch(navEditor, pendingNav!.query, pendingNav!.position)
                  // Clear pending nav since we've used it
                  pendingSearchNavRef.current = null
                  try {
                    sessionStorage.removeItem('pendingSearchNav')
                  } catch (e) {
                    // Silently fail
                  }
                }
              }, 200)
            }
            
            // Restore focus if this is a newly created document
            // Only focus if we're navigating from search (not from clicking in file explorer)
            if (isNewlyCreatedDocRef.current && !isNavigatingFromSearchRef.current) {
              // Focus after a delay to ensure editor is ready
              focusTimeoutId = setTimeout(() => {
                if (isCancelled) return
                const focusEditor = getEditor(document.id)
                if (focusEditor && !focusEditor.isDestroyed && focusEditor.view) {
                  try {
                    const editorElement = focusEditor.view.dom as HTMLElement
                    if (editorElement) {
                      editorElement.focus()
                      focusEditor.commands.focus('start')
                    }
                  } catch (e) {
                    // Ignore focus errors
                  }
                }
                // Clear the flag after focusing
                isNewlyCreatedDocRef.current = false
              }, 100)
            } else if (isNewlyCreatedDocRef.current) {
              // Clear flag even if we're not focusing (navigating from search)
              isNewlyCreatedDocRef.current = false
            }
            
            // Clear navigating flag after handling
            isNavigatingFromSearchRef.current = false
            
            // If search mode is active and we have a query, highlight matches
            if (isSearchMode && searchQuery.trim()) {
              setTimeout(() => {
                const highlightEditor = getEditor(document.id)
                if (highlightEditor && !highlightEditor.isDestroyed) {
                  highlightAllMatches(highlightEditor, searchQuery)
                }
              }, 300)
          }
        } catch (error) {
          console.error('Failed to parse document content:', error)
        }
      }, 100) // Increased delay to ensure full render cycle completion
    })
    
    return () => {
      isCancelled = true
      if (timeoutId) clearTimeout(timeoutId)
      if (focusTimeoutId) clearTimeout(focusTimeoutId)
    }
  }, [document?.id, document?.content, searchQuery, openTabs])

  // Automatically highlight all matches when search query changes and search mode is active
  // Also clear highlights when search mode is turned off
  useEffect(() => {
    if (!document) return
    const currentEditor = getEditor(document.id)
    if (!currentEditor) return
    
    if (isSearchMode && searchQuery.trim()) {
      // Wait a bit for editor to be ready, then highlight all matches
      const timeoutId = setTimeout(() => {
        if (currentEditor && !currentEditor.isDestroyed) {
          highlightAllMatches(currentEditor, searchQuery)
        }
      }, 300)
      
      return () => clearTimeout(timeoutId)
    } else {
      // Clear highlights when search mode is off or query is empty
      // This ensures ALL temporary highlights are cleared, not just in current document
      // Use a small delay to ensure editor is ready
      const clearTimeoutId = setTimeout(() => {
        if (currentEditor && !currentEditor.isDestroyed) {
          clearSearchHighlights(currentEditor)
        }
      }, 100)
      
      return () => clearTimeout(clearTimeoutId)
    }
  }, [searchQuery, isSearchMode, document?.id, theme])
  
  // Additional effect: Clear highlights whenever search mode is turned off
  // This ensures highlights are cleared even when switching documents
  useEffect(() => {
    if (!document) return
    const currentEditor = getEditor(document.id)
    if (!currentEditor) return
    
    if (!isSearchMode) {
      // Search mode is off - clear highlights immediately
      const clearTimeoutId = setTimeout(() => {
        if (currentEditor && !currentEditor.isDestroyed) {
          clearSearchHighlights(currentEditor)
        }
      }, 50)
      
      return () => clearTimeout(clearTimeoutId)
    }
  }, [isSearchMode, document?.id])

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current)
      }
    }
  }, [])

  // Save AI panel state to localStorage when open/close state changes
  // (width changes are handled in handlePanelResize with debouncing)
  useEffect(() => {
    saveAIPanelState({
      isOpen: isAIPanelOpen,
      width: aiPanelWidth
    })
  }, [isAIPanelOpen])

  // Restore panel sizes when AI panel state changes
  // Note: This should NOT run when fileExplorerSize changes (user resizing file explorer)
  useEffect(() => {
    // Don't interfere if user is actively resizing either panel
    if (isUserResizingRef.current || isFileExplorerResizingRef.current) return
    
    const timer = setTimeout(() => {
      if (isAIPanelOpen && aiPanelRef.current && editorPanelRef.current && fileExplorerPanelRef.current) {
        // AI panel is opening
        // Ensure File Explorer keeps its size
        const currentFileExplorerSize = fileExplorerPanelRef.current.getSize()
        if (Math.abs(currentFileExplorerSize - fileExplorerSize) > 0.1) {
          fileExplorerPanelRef.current.resize(fileExplorerSize)
        }
      }
    }, 100)
    
    return () => clearTimeout(timer)
  }, [isAIPanelOpen, fileExplorerSize])

  // Handle keyboard shortcuts and other effects
  // Keyboard shortcuts are handled in the keyboard event handler below

  // Render the layout

  // Automatically highlight all matches when search query changes and search mode is active
  // Also clear highlights when search mode is turned off
  useEffect(() => {
    if (!document?.id) return
    const currentEditor = getEditor(document.id)
    if (!currentEditor) return
    
    if (isSearchMode && searchQuery.trim()) {
      // Wait a bit for editor to be ready, then highlight all matches
      const timeoutId = setTimeout(() => {
        const editorInstance = getEditor(document.id)
        if (editorInstance && !editorInstance.isDestroyed) {
          highlightAllMatches(editorInstance, searchQuery)
        }
      }, 300)
      
      return () => clearTimeout(timeoutId)
    } else {
      // Clear highlights when search mode is off or query is empty
      // This ensures ALL temporary highlights are cleared, not just in current document
      // Use a small delay to ensure editor is ready
      const clearTimeoutId = setTimeout(() => {
        const editorInstance = getEditor(document.id)
        if (editorInstance && !editorInstance.isDestroyed) {
          clearSearchHighlights(editorInstance)
        }
      }, 100)
      
      return () => clearTimeout(clearTimeoutId)
    }
  }, [searchQuery, isSearchMode, document?.id, theme])
  
  // Additional effect: Clear highlights whenever search mode is turned off
  // This ensures highlights are cleared even when switching documents
  useEffect(() => {
    if (!document) return
    const currentEditor = getEditor(document.id)
    if (!currentEditor) return
    
    if (!isSearchMode) {
      // Search mode is off - clear highlights immediately
      const clearTimeoutId = setTimeout(() => {
        if (currentEditor && !currentEditor.isDestroyed) {
          clearSearchHighlights(currentEditor)
        }
      }, 50)
      
      return () => clearTimeout(clearTimeoutId)
    }
  }, [isSearchMode, document?.id])

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current)
      }
    }
  }, [])

  // Save AI panel state to localStorage when open/close state changes
  // (width changes are handled in handlePanelResize with debouncing)
  useEffect(() => {
    saveAIPanelState({
      isOpen: isAIPanelOpen,
      width: aiPanelWidth
    })
  }, [isAIPanelOpen])

  // Restore panel sizes when AI panel state changes
  // Note: This should NOT run when fileExplorerSize changes (user resizing file explorer)
  useEffect(() => {
    // Don't interfere if user is actively resizing either panel
    if (isUserResizingRef.current || isFileExplorerResizingRef.current) return
    
    const timer = setTimeout(() => {
      if (isAIPanelOpen && aiPanelRef.current && editorPanelRef.current && fileExplorerPanelRef.current) {
        // AI panel is opening
        // Ensure File Explorer keeps its size
        const currentFileExplorerSize = fileExplorerPanelRef.current.getSize()
        if (Math.abs(currentFileExplorerSize - fileExplorerSize) > 0.1) {
          fileExplorerPanelRef.current.resize(fileExplorerSize)
        }
        
        // Calculate remaining space after file explorer
        const remainingSpace = 100 - fileExplorerSize
        const aiSize = (aiPanelWidth / 100) * remainingSpace
        const editorSize = remainingSpace - aiSize
        
        aiPanelRef.current.resize(aiSize)
        editorPanelRef.current.resize(editorSize)
      } else if (!isAIPanelOpen && editorPanelRef.current && fileExplorerPanelRef.current) {
        // AI panel is closing - restore File Explorer and Editor sizes
        const currentFileExplorerSize = fileExplorerPanelRef.current.getSize()
        if (Math.abs(currentFileExplorerSize - fileExplorerSize) > 0.1) {
          fileExplorerPanelRef.current.resize(fileExplorerSize)
        }
        editorPanelRef.current.resize(100 - fileExplorerSize)
      }
    }, 50) // Increased delay to ensure DOM is ready
    
    return () => clearTimeout(timer)
  }, [isAIPanelOpen, aiPanelWidth]) // Removed fileExplorerSize from dependencies

  const handleAIPanelClose = () => {
    // Save current File Explorer size before closing AI panel
    if (fileExplorerPanelRef.current) {
      const currentSize = fileExplorerPanelRef.current.getSize()
      setFileExplorerSize(currentSize)
    }
    setIsAIPanelOpen(false)
  }

  const handleAIPanelOpen = () => {
    // Save current File Explorer size before opening AI panel
    if (fileExplorerPanelRef.current) {
      const currentSize = fileExplorerPanelRef.current.getSize()
      setFileExplorerSize(currentSize)
    }
    setIsAIPanelOpen(true)
  }

  const handleAIPanelResize = (size: number) => {
    if (isAIPanelOpen && fileExplorerPanelRef.current) {
      // Mark that user is actively resizing
      isUserResizingRef.current = true
      
      // size is percentage of remaining space (after FileExplorer)
      // Convert back to percentage of remaining space for storage
      const currentFileExplorerSize = fileExplorerPanelRef.current.getSize()
      const remainingSpace = 100 - currentFileExplorerSize
      const totalPercentage = (size / remainingSpace) * 100
      setAiPanelWidth(totalPercentage)
      
      // Debounce the save operation to avoid too many localStorage writes during dragging
      if (resizeTimeoutRef.current) {
        clearTimeout(resizeTimeoutRef.current)
      }
      resizeTimeoutRef.current = setTimeout(() => {
        saveAIPanelState({
          isOpen: isAIPanelOpen,
          width: totalPercentage
        })
        // User finished resizing
        isUserResizingRef.current = false
      }, 500) // Increased timeout to ensure user is done resizing
    }
  }

  // Cleanup resize timeouts on unmount
  useEffect(() => {
    return () => {
      if (resizeTimeoutRef.current) {
        clearTimeout(resizeTimeoutRef.current)
      }
      if (fileExplorerResizeTimeoutRef.current) {
        clearTimeout(fileExplorerResizeTimeoutRef.current)
      }
    }
  }, [])

  const handleExport = async (format: 'pdf' | 'docx', filename?: string, documentIds?: string[], usePageBreaks?: boolean) => {
    // If documentIds provided, use them; otherwise fall back to current document
    const idsToExport = documentIds && documentIds.length > 0 ? documentIds : (document ? [document.id] : [])
    
    if (idsToExport.length === 0) {
      alert('Please select at least one document to export.')
      return
    }
    
    // Set loading state
    setIsExporting(true)
    setExportFormat(format)
    
    try {
      const exportFilename = filename || projectName || 'document'
      
      // Use exportMultiple for multiple documents (merges into one file)
      // Use export for single document
      let exportData: number[]
      if (idsToExport.length === 1) {
        exportData = await exportApi.export(idsToExport[0], format, exportFilename)
      } else {
        // Multiple documents - merge into one file (WYSIWYG)
        exportData = await exportApi.exportMultiple(idsToExport, format, exportFilename, usePageBreaks)
      }
      
      // Convert array back to Buffer/Blob
      const blob = new Blob([new Uint8Array(exportData)], { 
        type: format === 'pdf' ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' 
      })
      const url = window.URL.createObjectURL(blob)
      const a = window.document.createElement('a')
      a.href = url
      a.download = `${exportFilename}.${format}`
      window.document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      window.document.body.removeChild(a)
    } catch (error) {
      console.error('Export failed:', error)
      alert('Failed to export document. Please make sure the backend is running and the document has content.')
    } finally {
      // Clear loading state
      setIsExporting(false)
      setExportFormat(null)
    }
  }

  const handleTitleUpdate = async (newTitle: string) => {
    if (!document || !newTitle.trim() || newTitle === document.title) return
    
    try {
      // IPC returns data directly, not wrapped in { data: ... }
      const updatedDocument = await documentApi.updateTitle(document.id, newTitle.trim())
      setDocument(updatedDocument)
    } catch (error) {
      console.error('Failed to update document title:', error)
    }
  }

  // Show shell UI immediately - no full-screen loading blocker
  // Skeletons will handle loading states for progressive reveal

  return (
    <>
      <style dangerouslySetInnerHTML={{__html: `
        @keyframes fadeInScale {
          from {
            opacity: 0;
            transform: scale(0.95);
          }
          to {
            opacity: 1;
            transform: scale(1);
          }
        }
      `}} />
      <div style={{ 
        height: '100vh', 
        display: 'flex', 
        flexDirection: 'column',
        backgroundColor: bgColor
      }}>
        {/* Top Bar - Logo + Tabs */}
      <TopBar 
        onExport={handleExport}
        documentTitle={document?.title}
        documentId={document?.id}
        onTitleUpdate={handleTitleUpdate}
        documents={documents}
        projectName={projectName}
        editor={document?.id ? getEditor(document.id) : null}
        onToggleFileExplorer={() => {
          if (fileExplorerPanelRef.current) {
            const currentSize = fileExplorerPanelRef.current.getSize()
            if (currentSize > 0) {
              // Closing: save current size for next time
              saveFileExplorerLastOpenSize(currentSize)
              fileExplorerPanelRef.current.resize(0)
            } else {
              // Opening: restore last open size
              const lastOpenSize = loadFileExplorerLastOpenSize()
              fileExplorerPanelRef.current.resize(lastOpenSize)
            }
          }
        }}
        onToggleAIPanel={() => {
          setIsAIPanelOpen(!isAIPanelOpen)
        }}
        openTabs={openTabs}
        activeTabId={activeTabId}
        onTabClick={handleTabClick}
        onTabClose={handleTabClose}
        onTabReorder={handleTabReorder}
      />
      
      {/* Separator line between topbar and toolbar */}
      <div style={{
        width: '100%',
        height: 0,
        borderTop: `1px solid ${borderColor}`,
        margin: 0,
        padding: 0,
        flexShrink: 0,
        boxSizing: 'border-box'
      }} />
      
      {/* Toolbar - Independent, full width - Always visible */}
      <div style={{ 
        width: '100%',
        backgroundColor: bgColor,
        padding: '8px 16px',
        zIndex: 10003,
        position: 'relative',
        overflow: 'visible'
      }}>
        <Toolbar 
          editor={document?.id ? getEditor(document.id) : null}
          onExport={handleExport}
          documents={documents}
          projectName={projectName}
          documentTitle={document?.title}
          onRestoreCommit={(commitId: string) => {
            setRestoredCommitParentId(commitId)
          }}
          customUndoRedo={isWorldLabMode && worldLabUndoRedo ? worldLabUndoRedo : undefined}
          onDocumentsReload={async () => {
            // Reload documents to refresh editor content after restore
            const currentProjectId = document?.projectId
            const currentDocId = document?.id
            
            await loadDocuments(currentProjectId)
            
            // Also reload current document if it exists and update editor content
            if (currentDocId) {
              try {
                const updatedDoc = await documentApi.get(currentDocId)
                
                if (!updatedDoc) {
                  return
                }
                
                // Parse content for editor
                let parsedContent: any = ''
                try {
                  if (updatedDoc.content) {
                    parsedContent = JSON.parse(updatedDoc.content)
                  }
                } catch (parseError: any) {
                  return
                }
                
                // Update document state to trigger editor refresh
                setDocument(updatedDoc)
                
                // Also update in documents array
                setDocuments(prevDocs => {
                  return prevDocs.map(doc => doc.id === updatedDoc.id ? updatedDoc : doc)
                })
                
                // Update in open tabs
                setOpenTabs(prevTabs => {
                  return prevTabs.map(tab => tab.id === updatedDoc.id ? updatedDoc : tab)
                })
                
                // Manually update editor content
                const editor = getEditor(currentDocId)
                
                if (!editor || editor.isDestroyed) {
                  return
                }
                
                editor.commands.setContent(parsedContent, { emitUpdate: false })
              } catch (error: any) {
                // Silent error handling
              }
            }
          }}
          onToggleSearch={() => {
            setIsSearchMode((prev) => {
              const newValue = !prev
              // Persist search mode state
              try {
                if (newValue) {
                  sessionStorage.setItem('isSearchMode', 'true')
                  // Keep existing search query if there is one
                  if (searchQuery) {
                    sessionStorage.setItem('searchQuery', searchQuery)
                  }
                } else {
                  // User explicitly turned off search mode - clear everything
                  sessionStorage.setItem('isSearchMode', 'false')
                  sessionStorage.removeItem('searchQuery')
                  setSearchQuery('') // Clear the query state
                  // Clear highlights immediately when search mode is turned off
                  if (document?.id) {
                    const currentEditor = getEditor(document.id)
                    if (currentEditor && !currentEditor.isDestroyed) {
                      clearSearchHighlights(currentEditor)
                    }
                  }
                }
              } catch (e) {
                console.warn('Failed to persist search mode:', e)
              }
              // Ensure FileExplorer is visible when entering search mode
              if (newValue && fileExplorerPanelRef.current) {
                const currentSize = fileExplorerPanelRef.current.getSize()
                if (currentSize === 0) {
                  fileExplorerPanelRef.current.resize(14)
                }
              }
              return newValue
            })
          }}
          isSearchActive={isSearchMode}
        />
      </div>
      
      {/* Separator line between toolbar and editor */}
      <div style={{
        width: '100%',
        height: 0,
        borderTop: `1px solid ${borderColor}`,
        margin: 0,
        padding: 0,
        flexShrink: 0,
        boxSizing: 'border-box'
      }} />
      
      {/* Content Area - Horizontal split with FileExplorer sidebar */}
      <PanelGroup 
        direction="horizontal" 
        style={{ flex: 1, overflow: 'hidden' }}
      >
        {/* File Explorer Sidebar */}
        <Panel 
          id="file-explorer"
          order={1}
          ref={fileExplorerPanelRef}
          defaultSize={fileExplorerSize} 
          minSize={0}
          maxSize={30}
          collapsible={true}
          onResize={(size) => {
            // Mark that user is actively resizing File Explorer
            isFileExplorerResizingRef.current = true
            
            // Track File Explorer size changes
            setFileExplorerSize(size)
            
            // Save to localStorage
            saveFileExplorerSize(size)
            
            // If size > 0, also save as last open size for restoration
            if (size > 0) {
              saveFileExplorerLastOpenSize(size)
            }
            
            // Debounce clearing the resizing flag
            if (fileExplorerResizeTimeoutRef.current) {
              clearTimeout(fileExplorerResizeTimeoutRef.current)
            }
            fileExplorerResizeTimeoutRef.current = setTimeout(() => {
              // User finished resizing File Explorer
              isFileExplorerResizingRef.current = false
            }, 500) // Same timeout as AI panel resize
          }}
        >
          <div style={{
            width: '100%',
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            backgroundColor: bgColor
          }}>
            {/* File Explorer Header */}
            <div style={{
              padding: '8px 12px',
              fontSize: '11px',
              fontWeight: 600,
              color: secondaryTextColor,
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
              fontFamily: '"Noto Sans SC", "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              backgroundColor: theme === 'dark' ? '#141414' : '#fafafa'
            }}>
              {isSearchMode ? (
                <span>SEARCH</span>
              ) : isRenamingProject ? (
                <input
                  value={projectRenameValue}
                  onChange={(e) => setProjectRenameValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      if (projectRenameValue.trim()) {
                        handleProjectRename(projectRenameValue)
                      }
                    } else if (e.key === 'Escape') {
                      setIsRenamingProject(false)
                      setProjectRenameValue(projectName)
                    }
                  }}
                  autoFocus
                  style={{
                    fontSize: '11px',
                    fontWeight: 600,
                    color: theme === 'dark' ? '#D6D6DD' : '#202124',
                    backgroundColor: theme === 'dark' ? '#1a1a1a' : '#ffffff',
                    border: `1px solid ${borderColor}`,
                    borderRadius: '3px',
                    padding: '2px 4px',
                    outline: 'none',
                    textTransform: 'uppercase',
                    fontFamily: 'inherit',
                    flex: 1,
                    minWidth: 0,
                    maxWidth: 'calc(100% - 30px)',
                    letterSpacing: '0.5px',
                    transition: 'all 0.2s ease',
                    animation: 'fadeInScale 0.15s ease-out'
                  }}
                  onFocus={(e) => {
                    e.target.style.borderColor = borderColor
                    e.target.style.backgroundColor = theme === 'dark' ? '#1f1f1f' : '#ffffff'
                  }}
                  onBlur={(e) => {
                    e.target.style.borderColor = borderColor
                    e.target.style.backgroundColor = theme === 'dark' ? '#1a1a1a' : '#ffffff'
                    if (projectRenameValue.trim()) {
                      handleProjectRename(projectRenameValue)
                    } else {
                      setIsRenamingProject(false)
                      setProjectRenameValue(projectName)
                    }
                  }}
                  onClick={(e) => e.stopPropagation()}
                />
              ) : (
                <span 
                  onDoubleClick={() => {
                    const projectId = document?.projectId
                    if (projectId) {
                      setIsRenamingProject(true)
                      setProjectRenameValue(projectName)
                    }
                  }}
                  style={{ 
                    cursor: document?.projectId ? 'pointer' : 'default',
                    userSelect: 'none'
                  }}
                  title={document?.projectId ? "Double-click to rename project" : undefined}
                >
                  {projectName.toUpperCase()}
                </span>
              )}
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <button
                  onClick={handleCreateDocument}
                  style={{
                    border: 'none',
                    background: 'transparent',
                    cursor: 'pointer',
                    padding: '2px 4px',
                    borderRadius: '2px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    opacity: 0.7,
                    transition: 'opacity 0.2s'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.opacity = '1'
                    e.currentTarget.style.backgroundColor = theme === 'dark' ? '#2a2d2e' : '#e8e8e8'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.opacity = '0.7'
                    e.currentTarget.style.backgroundColor = 'transparent'
                  }}
                  title="New File"
                >
                  {/* @ts-ignore */}
                  <AddIcon style={{ fontSize: '14px', color: secondaryTextColor }} />
                </button>
              </div>
            </div>
            
            {/* File Explorer Content */}
            <div style={{ flex: 1, overflow: 'hidden', backgroundColor: bgColor, padding: 0, margin: 0 }}>
              <FileExplorer
                  documents={documents}
                  currentDocumentId={document?.id || null}
                  onDocumentClick={handleDocumentClick}
                  onDocumentRename={handleDocumentRename}
                  onDocumentDelete={handleDocumentDelete}
                  onReorderDocuments={handleReorderDocuments}
                  projectName={projectName}
                  isSearchMode={isSearchMode}
                  onSearchModeChange={setIsSearchMode}
                  onSearchQueryChange={setSearchQuery}
                  searchQueryProp={searchQuery}
                  onDocumentsUpdated={loadDocuments}
                  onDocumentChange={setDocument}
                  onDocumentFolderChange={(documentId, folder) => {
                    // Optimistically update document folder without full refresh
                    setDocuments((prevDocs) => 
                      prevDocs.map(doc => 
                        doc.id === documentId ? { ...doc, folder, updatedAt: new Date().toISOString() } : doc
                      )
                    )
                  }}
                  onSelectedFolderChange={(folder) => {
                    try {
                      setSelectedFolder(folder)
                    } catch (error) {
                      console.error('[Layout] Error setting selectedFolder:', error)
                    }
                  }}
                  onFileUploaded={async (newDoc, isBatchUpload = false) => {
                    // Optimistically add the new document to the list without full reload
                    // This avoids re-rendering the entire file explorer and prevents deleted files from reappearing
                    setDocuments((prevDocs) => {
                      // Check if document already exists to avoid duplicates
                      if (prevDocs.some(doc => doc.id === newDoc.id)) {
                        return prevDocs
                      }
                      // Add new document to the list
                      return [...prevDocs, newDoc]
                    })
                    
                    // If current document has projectId, add new doc to same project
                    if (document?.projectId) {
                      // Calculate order based on documents in the same folder
                      const folder = newDoc.folder || 'project'
                      const folderDocs = documents.filter(doc => 
                        (folder === 'library' && doc.folder === 'library') ||
                        (folder === 'project' && (!doc.folder || doc.folder === 'project'))
                      )
                      // Find the maximum order in the folder, or use folderDocs.length as fallback
                      const maxOrder = folderDocs.length > 0
                        ? Math.max(...folderDocs.map(doc => doc.order ?? 0), -1) + 1
                        : 0
                      
                      // Add to project in background (don't wait for it)
                      projectApi.addDocument(document.projectId, newDoc.id, maxOrder).catch(err => {
                        console.error('Failed to add document to project:', err)
                        // Update optimistically instead of reloading to prevent deleted files from reappearing
                        // Only reload if absolutely necessary (e.g., order conflict)
                        if (err.message?.includes('order') || err.message?.includes('duplicate')) {
                          loadDocuments(document.projectId)
                        }
                      })
                    }
                    
                    // Monitor indexing status for library files
                    if (newDoc.folder === 'library') {
                      // Check if file type supports indexing (PDF or DOCX)
                      const fileExt = newDoc.title.toLowerCase().split('.').pop() || ''
                      if (fileExt === 'pdf' || fileExt === 'docx') {
                        // Start monitoring indexing status
                        const checkIndexingStatus = async () => {
                          try {
                            // Wait a bit for indexing to start
                            await new Promise(resolve => setTimeout(resolve, 1000))
                            
                            let status = await indexingApi.getIndexingStatus(newDoc.id)
                            let checkCount = 0
                            const maxChecks = 300 // Check for up to 10 minutes (300 * 2 seconds)
                            
                            // Poll until indexing completes or times out
                            while (checkCount < maxChecks) {
                              if (status?.status === 'completed') {
                                // Show notification when indexing completes
                                setIndexingCompletionNotifications(prev => {
                                  const newMap = new Map(prev)
                                  newMap.set(newDoc.id, {
                                    fileName: newDoc.title,
                                    completedAt: Date.now()
                                  })
                                  return newMap
                                })
                                
                                // Auto-remove notification after 3 seconds
                                setTimeout(() => {
                                  setIndexingCompletionNotifications(prev => {
                                    const newMap = new Map(prev)
                                    newMap.delete(newDoc.id)
                                    return newMap
                                  })
                                }, 3000)
                                break
                              } else if (status?.status === 'error') {
                                // Don't show notification for errors, just log
                                console.error(`Indexing failed for ${newDoc.title}:`, status.error)
                                break
                              }
                              
                              // Wait 2 seconds before next check
                              await new Promise(resolve => setTimeout(resolve, 2000))
                              status = await indexingApi.getIndexingStatus(newDoc.id)
                              checkCount++
                            }
                          } catch (error) {
                            console.error(`Failed to check indexing status for ${newDoc.title}:`, error)
                          }
                        }
                        
                        // Start monitoring in background (don't await)
                        checkIndexingStatus()
                      }
                    }
                    
                    // Only navigate to the newly uploaded file if it's a single file upload
                    // This prevents flashing when uploading multiple PDFs
                    if (!isBatchUpload) {
                      // Wait a bit to ensure document is fully saved before navigating
                      // Retry getting the document to ensure it exists
                      let retries = 3
                      let docExists = false
                      
                      while (retries > 0 && !docExists) {
                        try {
                          await new Promise(resolve => setTimeout(resolve, 100))
                          const verifyDoc = await documentApi.get(newDoc.id)
                          if (verifyDoc && verifyDoc.id) {
                            docExists = true
                          }
                        } catch (error) {
                          console.warn('Document not ready yet, retrying...', error)
                        }
                        retries--
                      }
                      
                      if (docExists) {
                        navigate(`/document/${newDoc.id}`)
                      } else {
                        console.warn('Document not found after upload, navigating anyway:', newDoc.id)
                        // Navigate anyway - loadDocument will handle the error
                        navigate(`/document/${newDoc.id}`)
                      }
                    }
                  }}
                />
            </div>
          </div>
        </Panel>
        
        <div
          style={{
            position: 'relative',
            width: '8px',
            marginLeft: '-4px',
            marginRight: '-4px',
            cursor: 'ew-resize',
            display: 'flex',
            alignItems: 'stretch',
            justifyContent: 'center',
            zIndex: 10
          }}
          onMouseEnter={() => setIsFileExplorerSeparatorHovered(true)}
          onMouseLeave={() => setIsFileExplorerSeparatorHovered(false)}
        >
          <div
            style={{
              width: '1px',
              borderLeft: `1px solid ${isFileExplorerSeparatorHovered ? (theme === 'dark' ? '#4a4a4a' : '#c0c0c0') : borderColor}`,
              backgroundColor: isFileExplorerSeparatorHovered ? (theme === 'dark' ? 'rgba(74, 74, 74, 0.3)' : 'rgba(192, 192, 192, 0.2)') : 'transparent',
              transition: 'all 0.2s ease',
              boxSizing: 'border-box',
              alignSelf: 'stretch',
              cursor: 'ew-resize',
              pointerEvents: 'none'
            }}
          />
          <PanelResizeHandle 
            id="file-explorer-resize-handle"
            style={{ 
              position: 'absolute',
              left: 0,
              right: 0,
              top: 0,
              bottom: 0,
              width: '100%',
              cursor: 'ew-resize',
              border: 'none',
              backgroundColor: 'transparent'
            }} 
          />
        </div>
        
        {/* Editor Panel */}
        <Panel 
          id="editor"
          order={2}
          ref={editorPanelRef}
          defaultSize={isAIPanelOpen 
            ? ((100 - fileExplorerSize) - ((aiPanelWidth / 100) * (100 - fileExplorerSize))) 
            : (100 - fileExplorerSize)
          } 
          minSize={40}
        >
          {isLoadingDocument && !document ? (
            // Show skeleton in editor area when loading first document
            <DocumentEditorSkeleton />
          ) : isWorldLabMode && worldLabData ? (
            // WorldLab mode - render Canvas with floating editor
            <WorldLabCanvas
              labName={worldLabData.labName}
              projectId={document?.projectId || ''}
              initialNodes={worldLabData.nodes}
              initialEdges={worldLabData.edges}
              onNodeDoubleClick={handleNodeDoubleClick}
              onNodeClick={handleNodeSingleClick}
              onNodesChange={(nodes) => {
                setWorldLabData(prev => (prev ? { ...prev, nodes } : prev))
              }}
              onEdgesChange={(edges) => {
                setWorldLabData(prev => (prev ? { ...prev, edges } : prev))
              }}
              onCloseNodeEditor={handleCloseNodeEditor}
              onUndoRedoReady={setWorldLabUndoRedo}
              nodeDocumentContent={nodeDocumentContent || undefined}
              onNodeDocumentSave={handleNodeDocumentSave}
              onBeforeExternalChange={() => {
                // Called by Canvas when external changes (from Terminal) are detected
                // Canvas will automatically save current state to history before applying changes
              }}
            />
          ) : (
            <div style={{ width: '100%', height: '100%', position: 'relative' }}>
              {/* Render all PDF Viewers for open PDF tabs, but only show the active one */}
              {openTabs
                .filter(tab => tab.title.toLowerCase().endsWith('.pdf'))
                .map(tab => {
                  const tabPdfViewerRef = getPdfViewerRef(tab.id)
                  
                  // Find the document for this tab (use current document if it's the active one)
                  const tabDocument = document?.id === tab.id ? document : (documents.find(doc => doc.id === tab.id) || tab)
                  const isActive = document?.id === tab.id
                  
                  return (
                    <div
                      key={tab.id}
                      style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        width: '100%',
                        height: '100%',
                        display: isActive ? 'block' : 'none', // Hide inactive PDF viewers
                        pointerEvents: isActive ? 'auto' : 'none', // Disable pointer events for hidden viewers
                      }}
                    >
                      <FullScreenPDFViewer 
                        ref={tabPdfViewerRef} 
                        document={tabDocument}
                        isAIPanelOpen={isAIPanelOpen}
                        aiPanelWidth={aiPanelWidth}
                      />
                    </div>
                  )
                })}
              
              {/* Render DocumentEditor for non-PDF documents - one for each open tab */}
              {openTabs
                .filter(tab => !tab.title.toLowerCase().endsWith('.pdf'))
                .map(tab => {
                  // Find the document for this tab (use current document if it's the active one)
                  const tabDocument = document?.id === tab.id ? document : (documents.find(doc => doc.id === tab.id) || tab)
                  const isActive = activeTabId === tab.id
                  
                  const tabDocumentEditorRef = getDocumentEditorRef(tab.id)
                  
                  return (
                    <DocumentEditorWrapper
                      key={tab.id}
                      document={tabDocument}
                      isActive={isActive}
                      onEditorCreated={(docId, editor) => {
                        setEditor(docId, editor)
                      }}
                      onDocumentChange={setDocument}
                      isAIPanelOpen={isAIPanelOpen}
                      aiPanelWidth={aiPanelWidth}
                      createEditorConfigFn={createEditorConfig}
                      editorRef={tabDocumentEditorRef}
                      onUpdate={handleEditorUpdate}
                    />
                  )
                })}
              
            </div>
          )}
        </Panel>
        {isAIPanelOpen && (
          <>
            <div
              style={{
                position: 'relative',
                width: '8px',
                marginLeft: '-4px',
                marginRight: '-4px',
                cursor: 'ew-resize',
                display: 'flex',
                alignItems: 'stretch',
                justifyContent: 'center',
                zIndex: 10
              }}
              onMouseEnter={() => setIsSeparatorHovered(true)}
              onMouseLeave={() => setIsSeparatorHovered(false)}
            >
              <div
                style={{
                  width: '1px',
                  borderRight: `1px solid ${isSeparatorHovered ? (theme === 'dark' ? '#4a4a4a' : '#c0c0c0') : borderColor}`,
                  backgroundColor: isSeparatorHovered ? (theme === 'dark' ? 'rgba(74, 74, 74, 0.3)' : 'rgba(192, 192, 192, 0.2)') : 'transparent',
                  transition: 'all 0.2s ease',
                  boxSizing: 'border-box',
                  alignSelf: 'stretch',
                  cursor: 'ew-resize',
                  pointerEvents: 'none'
                }}
              />
              <PanelResizeHandle 
                style={{ 
                  position: 'absolute',
                  left: 0,
                  right: 0,
                  top: 0,
                  bottom: 0,
                  width: '100%',
                  cursor: 'ew-resize',
                  border: 'none',
                  backgroundColor: 'transparent',
                  pointerEvents: 'auto'
                }} 
              />
            </div>
            <Panel 
              id="ai-panel"
              order={3}
              ref={aiPanelRef} 
              defaultSize={(aiPanelWidth / 100) * (100 - fileExplorerSize)} 
              minSize={15}
              onResize={handleAIPanelResize}
            >
              {isWorldLabMode && worldLabData ? (
                <WorldLabTerminal
                  key={worldLabData.labName}
                  labName={worldLabData.labName}
                  worldLabData={worldLabData}
                  selectedNodeId={selectedNodeId}
                  onNodeSelect={handleTerminalNodeSelect}
                  onNodesChange={(nodes) => {
                    setWorldLabData(prev => (prev ? { ...prev, nodes } : prev))
                  }}
                  onEdgesChange={(edges) => {
                    setWorldLabData(prev => (prev ? { ...prev, edges } : prev))
                  }}
                  projectId={document?.projectId}
                  onClose={handleAIPanelClose}
                  onBeforeOperation={() => {
                    // Called before Terminal operations that modify nodes/edges
                    // Canvas will automatically detect the change via useEffect and save history
                    // before applying the external changes
                  }}
                  undoRedoHandlers={worldLabUndoRedo}
                />
              ) : (
                <AIPanel document={document} onClose={handleAIPanelClose} />
              )}
            </Panel>
          </>
        )}
        {!isAIPanelOpen && (
          <button
            onClick={handleAIPanelOpen}
            style={{
              position: 'fixed',
              bottom: '24px',
              right: '24px',
              width: '48px',
              height: '48px',
              borderRadius: '50%',
              backgroundColor: theme === 'dark' ? '#252525' : '#e8e8e8',
              border: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: theme === 'dark' ? '0 2px 8px rgba(0,0,0,0.4)' : 'none',
              transition: 'all 0.2s',
              zIndex: 1000
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'scale(1.05)'
              e.currentTarget.style.backgroundColor = theme === 'dark' ? '#353535' : '#d8d8d8'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'scale(1)'
              e.currentTarget.style.backgroundColor = theme === 'dark' ? '#252525' : '#e8e8e8'
            }}
            title={isWorldLabMode ? "Open Terminal" : "Open AI Chat"}
          >
            {isWorldLabMode ? (
              <TerminalIcon style={{ fontSize: '24px', color: theme === 'dark' ? '#ffffff' : '#5f6368' }} />
            ) : (
              <ChatIcon style={{ fontSize: '24px', color: theme === 'dark' ? '#ffffff' : '#5f6368' }} />
            )}
          </button>
        )}
      </PanelGroup>
      
      {/* Word Count Modal */}
      <WordCountModal
        documents={documents}
        currentDocument={document}
        isOpen={showWordCountModal}
        onClose={() => setShowWordCountModal(false)}
      />
      
      {/* Export Loading Indicator */}
      {isExporting && (
        <div
          style={{
            position: 'fixed',
            bottom: '20px',
            left: '50%',
            transform: 'translateX(-50%)',
            backgroundColor: theme === 'dark' ? '#1e1e1e' : '#ffffff',
            border: `1px solid ${theme === 'dark' ? '#333' : '#e0e0e0'}`,
            borderRadius: '12px',
            padding: '14px 24px',
            boxShadow: theme === 'dark'
              ? '0 8px 32px rgba(0, 0, 0, 0.5), 0 2px 8px rgba(0, 0, 0, 0.3)'
              : '0 8px 32px rgba(0, 0, 0, 0.2), 0 2px 8px rgba(0, 0, 0, 0.1)',
            zIndex: 10001,
            display: 'flex',
            alignItems: 'center',
            gap: '14px',
            fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
            minWidth: '280px',
            animation: 'slideUpFadeIn 0.3s ease-out'
          }}
        >
          <div
            style={{
              width: '20px',
              height: '20px',
              border: `3px solid ${theme === 'dark' ? '#333' : '#e0e0e0'}`,
              borderTopColor: exportFormat === 'pdf' 
                ? (theme === 'dark' ? '#d9779f' : '#e8a5b8')
                : (theme === 'dark' ? '#7bb3d9' : '#8fc4e8'),
              borderRadius: '50%',
              animation: 'spin 0.8s linear infinite',
            }}
          />
          <div style={{ flex: 1 }}>
            <div
              style={{
                fontSize: '14px',
                fontWeight: '500',
                color: theme === 'dark' ? '#ffffff' : '#202124',
                marginBottom: '2px',
              }}
            >
              Exporting {exportFormat?.toUpperCase()}...
            </div>
            <div
              style={{
                fontSize: '12px',
                color: theme === 'dark' ? '#999' : '#666',
              }}
            >
              Please wait while we prepare your file
            </div>
          </div>
          <style>{`
            @keyframes spin {
              to { transform: rotate(360deg); }
            }
            @keyframes slideUpFadeIn {
              from {
                opacity: 0;
                transform: translateX(-50%) translateY(10px);
              }
              to {
                opacity: 1;
                transform: translateX(-50%) translateY(0);
              }
            }
          `}</style>
        </div>
      )}

      {/* Update Notification */}
      {updateNotification && (
        <div
          style={{
            position: 'fixed',
            left: '20px',
            bottom: '20px',
            backgroundColor: theme === 'dark' ? '#1e1e1e' : '#ffffff',
            border: `1px solid ${theme === 'dark' ? '#333' : '#e0e0e0'}`,
            borderRadius: '6px',
            padding: '12px 16px',
            boxShadow: theme === 'dark'
              ? '0 8px 32px rgba(0, 0, 0, 0.5), 0 2px 8px rgba(0, 0, 0, 0.3)'
              : '0 8px 32px rgba(0, 0, 0, 0.2), 0 2px 8px rgba(0, 0, 0, 0.1)',
            zIndex: 10030,
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
            minWidth: '260px',
            maxWidth: '320px',
            animation: 'slideInUp 0.3s ease-out'
          }}
        >
          <div style={{ flex: 1 }}>
            <div
              style={{
                fontSize: '13px',
                fontWeight: '500',
                color: theme === 'dark' ? '#ffffff' : '#202124',
                marginBottom: '2px',
              }}
            >
              New version{updateNotification.version ? ` ${updateNotification.version}` : ''} available
            </div>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={handleUpdateNow}
              style={{
                backgroundColor: theme === 'dark' ? '#242424' : '#f5f5f5',
                color: theme === 'dark' ? '#e0e0e0' : '#202124',
                border: `1px solid ${theme === 'dark' ? '#3a3a3a' : '#e0e0e0'}`,
                borderRadius: '5px',
                padding: '6px 10px',
                fontSize: '12px',
                cursor: 'pointer',
              }}
            >
              Update
            </button>
            <button
              onClick={handleAskLater}
              style={{
                backgroundColor: 'transparent',
                color: theme === 'dark' ? '#999' : '#666',
                border: `1px solid ${theme === 'dark' ? '#333' : '#e0e0e0'}`,
                borderRadius: '5px',
                padding: '6px 10px',
                fontSize: '12px',
                cursor: 'pointer',
              }}
            >
              Ask later
            </button>
          </div>
          <style>{`
            @keyframes slideInUp {
              from {
                transform: translateY(12px);
                opacity: 0;
              }
              to {
                transform: translateY(0);
                opacity: 1;
              }
            }
          `}</style>
        </div>
      )}

      {/* Commit Success Notification */}
      {showCommitSuccessNotification && (
        <div
          style={{
            position: 'fixed',
            bottom: '20px',
            left: '50%',
            transform: 'translateX(-50%)',
            backgroundColor: theme === 'dark' ? '#1e1e1e' : '#ffffff',
            border: `1px solid ${theme === 'dark' ? '#333' : '#e0e0e0'}`,
            borderRadius: '6px',
            padding: '12px 20px',
            boxShadow: theme === 'dark'
              ? '0 8px 32px rgba(0, 0, 0, 0.5), 0 2px 8px rgba(0, 0, 0, 0.3)'
              : '0 8px 32px rgba(0, 0, 0, 0.2), 0 2px 8px rgba(0, 0, 0, 0.1)',
            zIndex: 10030,
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
            minWidth: '300px',
            animation: 'slideUp 0.3s ease-out'
          }}
        >
          <div
            style={{
              width: '20px',
              height: '20px',
              borderRadius: '50%',
              backgroundColor: theme === 'dark' ? '#4caf50' : '#34a853',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0
            }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
          </div>
          <div style={{ flex: 1 }}>
            <div
              style={{
                fontSize: '13px',
                fontWeight: '500',
                color: theme === 'dark' ? '#ffffff' : '#202124',
                marginBottom: '2px',
              }}
            >
              Version created
            </div>
            {showCommitSuccessNotification.isIndexing ? (
              <div
                style={{
                  fontSize: '11px',
                  color: theme === 'dark' ? '#999' : '#666',
                }}
              >
                Indexing...
              </div>
            ) : showCommitSuccessNotification.fileCount > 0 ? (
              <div
                style={{
                  fontSize: '11px',
                  color: theme === 'dark' ? '#999' : '#666',
                }}
              >
                {showCommitSuccessNotification.fileCount} file{showCommitSuccessNotification.fileCount !== 1 ? 's' : ''} indexed
              </div>
            ) : null}
          </div>
          <style>{`
            @keyframes slideUp {
              from {
                transform: translateX(-50%) translateY(20px);
                opacity: 0;
              }
              to {
                transform: translateX(-50%) translateY(0);
                opacity: 1;
              }
            }
          `}</style>
        </div>
      )}

      {/* Indexing Completion Notifications */}
      {Array.from(indexingCompletionNotifications.entries()).map(([docId, notification], index) => (
        <div
          key={docId}
          style={{
            position: 'fixed',
            bottom: `${20 + index * 80}px`,
            left: '50%',
            transform: 'translateX(-50%)',
            backgroundColor: theme === 'dark' ? '#1e1e1e' : '#ffffff',
            border: `1px solid ${theme === 'dark' ? '#333' : '#e0e0e0'}`,
            borderRadius: '6px',
            padding: '12px 20px',
            boxShadow: theme === 'dark'
              ? '0 8px 32px rgba(0, 0, 0, 0.5), 0 2px 8px rgba(0, 0, 0, 0.3)'
              : '0 8px 32px rgba(0, 0, 0, 0.2), 0 2px 8px rgba(0, 0, 0, 0.1)',
            zIndex: 10030,
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
            minWidth: '300px',
            animation: 'slideUp 0.3s ease-out'
          }}
        >
          <div
            style={{
              width: '20px',
              height: '20px',
              borderRadius: '50%',
              backgroundColor: theme === 'dark' ? '#4caf50' : '#34a853',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0
            }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
          </div>
          <div style={{ flex: 1 }}>
            <div
              style={{
                fontSize: '13px',
                fontWeight: '500',
                color: theme === 'dark' ? '#ffffff' : '#202124',
                marginBottom: '2px',
              }}
            >
              File indexed successfully
            </div>
            <div
              style={{
                fontSize: '11px',
                color: theme === 'dark' ? '#999' : '#666',
              }}
            >
              {notification.fileName}
            </div>
          </div>
          <style>{`
            @keyframes slideUp {
              from {
                transform: translateX(-50%) translateY(20px);
                opacity: 0;
              }
              to {
                transform: translateX(-50%) translateY(0);
                opacity: 1;
              }
            }
          `}</style>
        </div>
      ))}
      </div>
    </>
  )
}


