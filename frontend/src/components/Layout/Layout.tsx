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
import { useEffect, useRef, useState } from 'react'
import DocumentEditor, { DocumentEditorSearchHandle } from '../Editor/DocumentEditor'
import Toolbar from '../Editor/Toolbar'
import AIPanel from '../AIPanel/AIPanel'
import FileExplorer from '../FileExplorer/FileExplorer'
import FullScreenPDFViewer, { PDFViewerSearchHandle } from '../PDFViewer/FullScreenPDFViewer'
import { Document } from '@shared/types'
import { documentApi, exportApi, projectApi } from '../../services/api'
import { FontSize } from '../Editor/FontSize'
import { FontFamily } from '../Editor/FontFamily'
import { LineHeight } from '../Editor/LineHeight'
import { Title } from '../Editor/Title'
import { Subtitle } from '../Editor/Subtitle'
import { useTheme } from '../../contexts/ThemeContext'
import { BulletList, OrderedList, ListItem } from '@tiptap/extension-list'
import { TextSelection } from 'prosemirror-state'
// @ts-ignore
import ChatIcon from '@mui/icons-material/Chat'
// @ts-ignore
import AddIcon from '@mui/icons-material/Add'
// @ts-ignore
import CreateNewFolderIcon from '@mui/icons-material/CreateNewFolder'
import TopBar from './TopBar'
import { useNavigate, useParams } from 'react-router-dom'

interface LayoutProps {
  // No longer needed - Layout will load document internally based on route
}

const AI_PANEL_STORAGE_KEY = 'aiPanelState'

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
        width: parsed.width ?? 20
      }
    }
  } catch (error) {
    console.error('Failed to load AI panel state:', error)
  }
  return { isOpen: true, width: 20 }
}

function saveAIPanelState(state: AIPanelState) {
  try {
    localStorage.setItem(AI_PANEL_STORAGE_KEY, JSON.stringify(state))
  } catch (error) {
    console.error('Failed to save AI panel state:', error)
  }
}

export default function Layout({}: LayoutProps) {
  const { theme } = useTheme()
  const navigate = useNavigate()
  const { id } = useParams<{ id: string }>()
  const [document, setDocument] = useState<Document | null>(null)
  const [isLoadingDocument, setIsLoadingDocument] = useState(true)
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const documentEditorRef = useRef<DocumentEditorSearchHandle>(null)
  const pdfViewerRef = useRef<PDFViewerSearchHandle>(null)
  const [isAIPanelOpen, setIsAIPanelOpen] = useState(() => {
    const savedState = loadAIPanelState()
    return savedState.isOpen
  })
  const [aiPanelWidth, setAiPanelWidth] = useState(() => {
    const savedState = loadAIPanelState()
    return savedState.width
  })
  const [documents, setDocuments] = useState<Document[]>([])
  const [isLoadingDocuments, setIsLoadingDocuments] = useState(true)
  const [projectName, setProjectName] = useState<string>('LEMONA')
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
  const editorPanelRef = useRef<ImperativePanelHandle>(null)
  const aiPanelRef = useRef<ImperativePanelHandle>(null)
  const fileExplorerPanelRef = useRef<ImperativePanelHandle>(null)
  const resizeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isUserResizingRef = useRef<boolean>(false) // Track if user is actively resizing
  const [fileExplorerSize, setFileExplorerSize] = useState<number>(14) // Track File Explorer size as state
  const [selectedFolder, setSelectedFolder] = useState<'library' | 'project' | null>(null) // Track selected folder
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
  const lastContentRef = useRef<string>('') // Track last set content to avoid unnecessary updates
  const currentDocIdRef = useRef<string | null>(null) // Track current document ID
  const currentDocTitleRef = useRef<string | null>(null) // Track current document title for placeholder
  const pendingSearchNavRef = useRef<{ query: string; position: number } | null>(null) // Track pending search navigation
  const isNavigatingFromSearchRef = useRef<boolean>(false) // Track if we're navigating from search results
  const lastRestoredDocIdRef = useRef<string | null>(null) // Track last document ID we restored search state for
  
  const bgColor = theme === 'dark' ? '#141414' : '#ffffff'
  const borderColor = theme === 'dark' ? '#232323' : '#dadce0'
  const secondaryTextColor = theme === 'dark' ? '#858585' : '#5f6368'

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

  // Load document when route parameter changes
  useEffect(() => {
    if (id) {
      // When switching documents, keep the UI visible for smooth transition
      // Only set loading state if we're switching to a different document
      if (!document || document.id !== id) {
        setIsLoadingDocument(true)
        loadDocument(id)
      }
      // Update active tab when route changes
      setActiveTabId(id)
    } else {
      setDocument(null)
      setIsLoadingDocument(false)
      setActiveTabId(null)
    }
  }, [id])

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

  const loadDocument = async (docId: string) => {
    try {
      const doc = await documentApi.get(docId)
      if (!doc || !doc.id) {
        console.error('Document not found or invalid:', docId)
        setDocument(null)
        navigate('/documents')
        return
      }
      
      // Check if PDF needs text extraction
      const isPDF = doc.title.toLowerCase().endsWith('.pdf')
      if (isPDF && !doc.pdfText) {
        console.log('[PDF] PDF text not available, triggering extraction for:', doc.title)
        // Set document first so PDF viewer can render
        if (id === docId) {
          setDocument(doc)
        }
        
        try {
          // Trigger PDF text extraction (this will update the document file)
          const pdfText = await documentApi.extractPDFText(docId)
          console.log('[PDF] PDF text extraction completed, pdfText:', pdfText ? 'available' : 'missing')
          
          // Reload document to get updated version with pdfText
          // Wait a moment for file write to complete
          await new Promise(resolve => setTimeout(resolve, 200))
          const updatedDoc = await documentApi.get(docId)
          
          if (updatedDoc && id === docId) {
            console.log('[PDF] Reloaded document with pdfText:', updatedDoc.pdfText ? 'available' : 'missing')
            setDocument(updatedDoc)
          }
        } catch (extractionError) {
          console.error('[PDF] Failed to extract PDF text:', extractionError)
          // Document is already set, extraction will retry on next load if needed
        }
      } else {
        // Not a PDF or PDF text already available
        // Only update document if this is still the current route
        // This prevents race conditions when rapidly switching files
        if (id === docId) {
          setDocument(doc)
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
      console.error('Failed to load document:', error)
      // Only clear document if this is still the current route
      if (id === docId) {
        setDocument(null)
        navigate('/documents')
      }
    } finally {
      // Only clear loading state if this is still the current route
      if (id === docId) {
        setIsLoadingDocument(false)
      }
    }
  }

  // Track previous projectId to detect changes
  const previousProjectIdRef = useRef<string | undefined>(undefined)
  
  // Load all documents for FileExplorer and TopBar
  useEffect(() => {
    const currentProjectId = document?.projectId
    
    // Only clear and reload if projectId actually changed
    if (previousProjectIdRef.current !== currentProjectId) {
      // Clear documents immediately when project changes to prevent showing stale data
      setDocuments([])
      setIsLoadingDocuments(true)
      
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
      loadDocuments()
    }
  }, [document?.projectId, activeTabId]) // Reload when project changes

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
        
        // Only handle Ctrl+F if it's the search input, from iframe, active element is iframe, or not an input field
        if (isSearchInput || isFromIframe || activeElementIsIframe || !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)) {
          e.preventDefault()
          e.stopPropagation()
          
          // Determine active surface and delegate
          const isPDF = document && document.title.toLowerCase().endsWith('.pdf')
          if (isPDF && pdfViewerRef.current) {
            pdfViewerRef.current.toggleSearch()
          } else if (!isPDF && documentEditorRef.current) {
            documentEditorRef.current.toggleSearch()
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
              if (editor && !editor.isDestroyed) {
                clearSearchHighlights(editor)
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
        return
      }
      
      // Check if Ctrl+Shift+E (or Cmd+Shift+E on Mac) - toggle FileExplorer
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'E' || e.key === 'e')) {
        e.preventDefault()
        e.stopPropagation()
        if (fileExplorerPanelRef.current) {
          // Toggle between visible (14%) and hidden (0%)
          const currentSize = fileExplorerPanelRef.current.getSize()
          const newSize = currentSize > 0 ? 0 : 14
          fileExplorerPanelRef.current.resize(newSize)
        }
      }
    }

    // Use capture phase to catch events before they reach the editor
    window.addEventListener('keydown', handleKeyDown, true)
    return () => window.removeEventListener('keydown', handleKeyDown, true)
  }, [searchQuery, document])

  const loadDocuments = async () => {
    // Note: documents are already cleared in useEffect when projectId changes
    // Set loading state
    setIsLoadingDocuments(true)
    
    try {
      // If document has projectId, load project's documents
      if (document?.projectId) {
        // Load project to get its name
        const project = await projectApi.getById(document.projectId)
        if (project) {
          setProjectName(project.title.toUpperCase())
        } else {
          setProjectName('LEMONA')
        }
        
        const docs = await projectApi.getDocuments(document.projectId)
        // Sort by order (creation order) instead of updatedAt
        const sortedDocs = docs.sort((a: any, b: any) => {
          if (a.order !== undefined && b.order !== undefined) {
            return a.order - b.order
          }
          // Fallback to creation time if no order
          return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
        })
        setDocuments(Array.isArray(sortedDocs) ? sortedDocs : [])
      } else {
        // No project, show all documents
        setProjectName('LEMONA')
        const docs = await documentApi.list()
        setDocuments(Array.isArray(docs) ? docs : [])
      }
    } catch (error) {
      console.error('Failed to load documents:', error)
      setDocuments([])
      setProjectName('LEMONA')
    } finally {
      setIsLoadingDocuments(false)
    }
  }

  const handleDocumentClick = (docId: string, searchQueryParam?: string, matchPosition?: number) => {
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
      if (document?.id === docId && editor && !editor.isDestroyed) {
        setTimeout(() => {
          if (editor && !editor.isDestroyed) {
            navigateToMatch(editor, searchQueryParam, matchPosition)
            // Clear pending nav since we've used it
            pendingSearchNavRef.current = null
            try {
              sessionStorage.removeItem('pendingSearchNav')
            } catch (e) {
              // Silently fail
            }
          }
        }, 100)
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
    navigate(`/document/${docId}`)
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
      } catch (error) {
        console.error('Failed to clear scroll position:', error)
      }
      
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

  
  // Clear all search highlights (temporary highlights, not saved to document)
  const clearSearchHighlights = (editor: Editor) => {
    if (!editor) return
    
    try {
      const { state, dispatch } = editor.view
      const { tr, doc } = state
      const searchHighlightColors = ['#FFEB3B', '#FDD835', '#fef08a', '#4a5568', '#e3f2fd', '#5a6b7d']
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
      const highlightColor = theme === 'dark' ? '#5a6b7d' : '#e3f2fd'
      
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
      setOpenTabs(prevTabs => prevTabs.filter(tab => tab.id !== docId))
      
      // Clear scroll position for the deleted document
      try {
        localStorage.removeItem(`documentScroll_${docId}`)
      } catch (error) {
        console.error('Failed to clear scroll position:', error)
      }
      
      // If current document was deleted, find next file to navigate to
      if (document?.id === docId) {
        // Helper function to get documents in file explorer order:
        // 1. README.md (if exists)
        // 2. Library files (sorted by order or createdAt)
        // 3. Project files (sorted by order or createdAt)
        const getDocumentsInFileExplorerOrder = (docs: Document[]): Document[] => {
          const readmeDoc = docs.find(doc => doc.title === 'README.md' || doc.title.toLowerCase() === 'readme.md')
          const libraryDocs = docs.filter(doc => doc.folder === 'library' && doc.title !== 'README.md' && doc.title.toLowerCase() !== 'readme.md')
          const projectDocs = docs.filter(doc => (!doc.folder || doc.folder === 'project') && doc.title !== 'README.md' && doc.title.toLowerCase() !== 'readme.md')
          
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
          if (readmeDoc) {
            orderedDocs.push(readmeDoc)
          }
          orderedDocs.push(...sortDocuments(libraryDocs))
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
          const originalReadmeDoc = documents.find(doc => doc.title === 'README.md' || doc.title.toLowerCase() === 'readme.md')
          const originalLibraryDocs = documents.filter(doc => doc.folder === 'library' && doc.title !== 'README.md' && doc.title.toLowerCase() !== 'readme.md')
          
          const sortDocuments = (docsToSort: Document[]) => {
            return [...docsToSort].sort((a, b) => {
              if (a.order !== undefined && b.order !== undefined) {
                return a.order - b.order
              }
              return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
            })
          }
          
          const originalSortedLibraryDocs = sortDocuments(originalLibraryDocs)
          
          // Calculate folder start indices in the ORIGINAL ordered list
          const originalLibraryStartIndex = originalReadmeDoc ? 1 : 0
          const originalProjectStartIndex = originalLibraryStartIndex + originalSortedLibraryDocs.length
          
          // Get folder boundaries in the UPDATED ordered list
          const updatedReadmeDoc = updatedDocuments.find(doc => doc.title === 'README.md' || doc.title.toLowerCase() === 'readme.md')
          const updatedLibraryDocs = updatedDocuments.filter(doc => doc.folder === 'library' && doc.title !== 'README.md' && doc.title.toLowerCase() !== 'readme.md')
          const updatedProjectDocs = updatedDocuments.filter(doc => (!doc.folder || doc.folder === 'project') && doc.title !== 'README.md' && doc.title.toLowerCase() !== 'readme.md')
          
          const updatedSortedLibraryDocs = sortDocuments(updatedLibraryDocs)
          const updatedSortedProjectDocs = sortDocuments(updatedProjectDocs)
          
          const updatedLibraryStartIndex = updatedReadmeDoc ? 1 : 0
          const updatedProjectStartIndex = updatedLibraryStartIndex + updatedSortedLibraryDocs.length
          
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
                // No more files in library, go to the file above (README)
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
                // No more files in project, go to the file above (last library file or README)
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
      await loadDocuments()
      alert('Failed to reorder documents. Please try again.')
    }
  }

  const handleCreateDocument = async () => {
    try {
      // Generate "Section 1", "Section 2", etc. based on existing documents in project
      const existingTitles = documents.map(doc => doc.title)
      let sectionNumber = 1
      while (existingTitles.includes(`Section ${sectionNumber}`)) {
        sectionNumber++
      }
      const newTitle = `Section ${sectionNumber}`
      
      // Use selected folder if available, otherwise default to 'project'
      const folder = selectedFolder || 'project'
      const newDoc = await documentApi.create(newTitle, folder)
      
      // If current document has projectId, add new doc to same project
      if (document?.projectId) {
        await projectApi.addDocument(document.projectId, newDoc.id, documents.length)
        // Reload documents to ensure folder is correctly set and document appears in right folder
        await loadDocuments()
      } else {
        // Update documents state immediately so FileExplorer shows it
        setDocuments(prev => [...prev, newDoc])
      }
      
      navigate(`/document/${newDoc.id}`)
    } catch (error) {
      console.error('Failed to create document:', error)
      alert('Failed to create document. Please try again.')
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

  // Create ONE shared editor instance
  const editor = useEditor({
    extensions: [
      // StarterKit without list extensions (we'll configure them separately)
      StarterKit.configure({
        bulletList: false,
        orderedList: false,
        listItem: false,
      }),
      FileExplorerToggleExtension,
      // Custom list configuration with better keyboard shortcuts
      ListItem.extend({
        addKeyboardShortcuts() {
          return {
            // Tab to indent
            Tab: () => {
              if (this.editor.isActive('listItem')) {
                return this.editor.commands.sinkListItem('listItem')
              }
              return false
            },
            // Shift+Tab to outdent
            'Shift-Tab': () => {
              if (this.editor.isActive('listItem')) {
                return this.editor.commands.liftListItem('listItem')
              }
              return false
            },
            // Backspace at the start of a list item - lift it out
            Backspace: () => {
              const { state } = this.editor
              const { $from } = state.selection
              
              // Check if we're at the start of a list item
              if ($from.parentOffset === 0 && this.editor.isActive('listItem')) {
                // If the list item is empty, lift it out
                const listItemNode = $from.node($from.depth)
                if (listItemNode.content.size === 0) {
                  return this.editor.commands.liftListItem('listItem')
                }
                
                // If at the start of a non-empty list item, lift it out
                return this.editor.commands.liftListItem('listItem')
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
                return this.editor.commands.liftListItem('listItem')
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
        types: ['heading', 'paragraph'],
      }),
      Placeholder.configure({
        placeholder: () => {
          // Check if the current document is README.md using ref to get latest value
          const docTitle = currentDocTitleRef.current
          const isReadme = docTitle?.toLowerCase() === 'readme.md' || 
                          docTitle?.toLowerCase() === 'readme'
          return isReadme 
            ? 'This README helps the AI learn about the project...'
            : 'Start writing...'
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
    ],
    content: '', // Initialize with empty content, set it asynchronously after mount
    editorProps: {
      transformPastedText(text) {
        // Preserve line breaks when pasting - convert double line breaks to paragraph breaks
        // This helps maintain spacing when pasting from GPT or other markdown sources
        return text
      },
      transformPastedHTML(html) {
        // Preserve HTML structure when pasting
        return html
      },
      // Fix cursor jumping to beginning of nested list items when clicking
      // This is a known issue with ProseMirror's hit testing on complex nested DOM structures
      handleClick: (view, pos, event) => {
        const { state } = view
        const $pos = state.doc.resolve(pos)
        const { listItem } = state.schema.nodes
        
        // Check if we're inside a list item
        let inListItem = false
        let listItemDepth = -1
        for (let d = $pos.depth; d > 0; d--) {
          if ($pos.node(d).type === listItem) {
            inListItem = true
            listItemDepth = d
            break
          }
        }
        
        if (!inListItem || listItemDepth < 0) return false
        
        // Check if this list item has nested lists (sub-bullets)
        const listItemNode = $pos.node(listItemDepth)
        let hasNestedList = false
        listItemNode.forEach((child) => {
          if (child.type.name === 'bulletList' || child.type.name === 'orderedList') {
            hasNestedList = true
          }
        })
        
        if (!hasNestedList) return false
        
        // Check if cursor ended up at the beginning of a paragraph (position 0)
        // This is the buggy behavior we want to fix
        if ($pos.parentOffset !== 0) return false
        
        // Get click X coordinate
        const clickX = event.clientX
        
        // Get the coordinates of the cursor position
        const posCoords = view.coordsAtPos(pos)
        if (!posCoords) return false
        
        // If click X is significantly to the right of where cursor landed, 
        // the user probably intended to click at the end of the line
        const clickDistanceFromCursor = clickX - posCoords.left
        
        if (clickDistanceFromCursor > 30) {
          // Find the end of the current line
          const parent = $pos.parent
          const endOfParent = pos + parent.content.size
          
          // Binary search for end of line (same Y coordinate)
          const lineYThreshold = 5
          let left = pos
          let right = endOfParent
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
          
          // Set cursor to the correct position
          if (bestPos !== pos) {
            const tr = state.tr.setSelection(TextSelection.create(state.doc, bestPos))
            view.dispatch(tr)
            return true // We handled the click
          }
        }
        
        return false // Let default handling proceed
      },
      handleKeyDown: (view, event) => {
        // Handle Backspace on empty paragraph after a list
        // Based on: https://discuss.prosemirror.net/t/backspace-inside-empty-paragraph-creates-a-new-list-node/3784
        if (event.key === 'Backspace') {
          const { state, dispatch } = view
          const { $from } = state.selection
          const { paragraph, bulletList, orderedList } = state.schema.nodes
          
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
    onUpdate: ({ editor }) => {
      if (document) {
        if (saveTimeoutRef.current) {
          clearTimeout(saveTimeoutRef.current)
        }
        saveTimeoutRef.current = setTimeout(() => {
          const content = JSON.stringify(editor.getJSON())
          documentApi.update(document.id, content).catch((error: unknown) => {
            console.error('Failed to save document:', error)
          })
        }, 1000)
      }
    },
  })
  

  // Search results use temporary highlights (Chrome-style) that are not saved to the document

  // Update editor content when document changes
  useEffect(() => {
    if (!editor) return
    
    // If document is null, just reset the ref and don't touch the editor
    // The navigation will handle loading the new document
    if (!document) {
      lastContentRef.current = ''
      currentDocIdRef.current = null
      currentDocTitleRef.current = null
      return
    }
    
    // Skip if content hasn't changed AND document ID is the same
    const documentChanged = currentDocIdRef.current !== document.id
    const contentChanged = lastContentRef.current !== document.content
    
    if (!documentChanged && !contentChanged) {
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
          
          // Check if editor is still mounted and ready
          if (editor && !editor.isDestroyed && editor.view) {
            // Always clear search highlights before setting new content
            // This ensures highlights don't persist when navigating between documents
            clearSearchHighlights(editor)
            
            // Check if this is a new tab (document not in openTabs before)
            const isNewTab = !openTabs.some(tab => tab.id === document.id)
            
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
            
            // Set scroll position BEFORE setting content to prevent any scroll animation
            // This ensures the scroll is already at the correct position when content loads
            if (savedScrollTop !== null && savedScrollTop > 0) {
              const scrollContainer = editor.view.dom.closest('.scrollable-container') as HTMLElement
              if (scrollContainer) {
                scrollContainer.scrollTop = savedScrollTop
              }
            } else if (isNewTab) {
              // For new tabs, set scroll to top
              const scrollContainer = editor.view.dom.closest('.scrollable-container') as HTMLElement
              if (scrollContainer) {
                scrollContainer.scrollTop = 0
              }
            }
            
            // Set content
            editor.commands.setContent(content)
            lastContentRef.current = docContent
            
            // Restore scroll position again immediately after content is set to ensure it stays correct
            // Use requestAnimationFrame to ensure DOM is updated, then immediately set scroll
            if (savedScrollTop !== null && savedScrollTop > 0) {
              // Use requestAnimationFrame to ensure DOM is ready, then immediately set scroll
              // Double RAF ensures we're after the browser's layout pass
              requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                  if (isCancelled || !editor || editor.isDestroyed) return
                  const scrollContainer = editor.view.dom.closest('.scrollable-container') as HTMLElement
                  if (scrollContainer) {
                    // Set scroll position directly without any animation
                    scrollContainer.scrollTop = savedScrollTop
                  }
                })
              })
            } else if (isNewTab) {
              // For new tabs, ensure scroll stays at top after content is set
              requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                  if (isCancelled || !editor || editor.isDestroyed) return
                  const scrollContainer = editor.view.dom.closest('.scrollable-container') as HTMLElement
                  if (scrollContainer) {
                    scrollContainer.scrollTop = 0
                  }
                })
              })
            }
            
            // After content is set, clear highlights again if search mode is off
            // This handles cases where content from server might have highlights
            if (!isSearchMode || !searchQuery.trim()) {
              setTimeout(() => {
                if (editor && !editor.isDestroyed) {
                  clearSearchHighlights(editor)
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
                    try {
                      sessionStorage.removeItem('pendingSearchNav')
                    } catch (e) {
                      // Silently fail
                    }
                  }
                }
              } catch (e) {
                // Silently fail
              }
            }
            
            if (pendingNav) {
              const { query, position } = pendingNav
              
              // Clear both ref and sessionStorage immediately (before setTimeout)
              // This prevents it from being used again if component re-renders
              pendingSearchNavRef.current = null
              try {
                sessionStorage.removeItem('pendingSearchNav')
              } catch (e) {
                // Silently fail
              }
              
              setTimeout(() => {
                if (editor && !editor.isDestroyed) {
                  navigateToMatch(editor, query, position)
                  
                  // Clear flag AFTER navigation completes (with small delay to ensure scroll completes)
                  setTimeout(() => {
                    isNavigatingFromSearchRef.current = false
                  }, 100) // Small delay to ensure scroll completes
                }
              }, 300)
            } else {
              // No pending navigation - reset the flag
              isNavigatingFromSearchRef.current = false
              
              if (searchQuery.trim() && isSearchMode) {
                // Highlight all matches if search query is present but no specific position
                setTimeout(() => {
                  if (editor && !editor.isDestroyed) {
                    highlightAllMatches(editor, searchQuery)
                  }
                }, 200)
              }
            }
            
            // Handle focus and cursor position based on scenario
            // Skip focus if we're navigating from search results OR have pending search navigation
            if (!isNavigatingFromSearchRef.current && !pendingNav) {
              // Check if document is empty (new file)
              const isEmpty = !content || 
                             (typeof content === 'object' && 
                              (!content.content || 
                               (Array.isArray(content.content) && content.content.length === 0) ||
                               (Array.isArray(content.content) && content.content.length === 1 && 
                                content.content[0]?.type === 'paragraph' && 
                                (!content.content[0]?.content || content.content[0]?.content.length === 0))))
              
              // Check if this is a new tab (document not in openTabs before)
              const isNewTab = !openTabs.some(tab => tab.id === document.id)
              
              if (isEmpty) {
                // Scenario 1: New file - autofocus at top
                const focusEditor = (attempt: number = 0) => {
                  if (isCancelled || attempt > 5) return
                  
                  if (editor && !editor.isDestroyed && editor.view) {
                    const editorElement = editor.view.dom as HTMLElement
                    
                    if (editorElement) {
                      editorElement.focus()
                      
                      if (!editorElement.isContentEditable) {
                        editorElement.contentEditable = 'true'
                      }
                      
                      // Focus at the beginning (top)
                      try {
                        editor.commands.focus('start')
                      } catch (e) {
                        // Ignore focus errors
                      }
                    }
                  }
                }
                
                requestAnimationFrame(() => {
                  if (isCancelled) return
                  setTimeout(() => focusEditor(0), 50)
                })
              } else if (isNewTab) {
                // Scenario 2: Opening existing file (no tab) - show top, no autofocus
                // Scroll position is already set to 0 before and after setContent above
                // Don't focus - let user click to focus
              } else {
                // Scenario 3: Switching to existing tab - restore scroll position, no autofocus
                // Scroll position is already restored before and after setContent above
                // Don't focus - let user click to focus
              }
            }
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
  }, [document?.id, document?.content, editor, searchQuery, openTabs])

  // Automatically highlight all matches when search query changes and search mode is active
  // Also clear highlights when search mode is turned off
  useEffect(() => {
    if (!editor || !document) return
    
    if (isSearchMode && searchQuery.trim()) {
      // Wait a bit for editor to be ready, then highlight all matches
      const timeoutId = setTimeout(() => {
        if (editor && !editor.isDestroyed) {
          highlightAllMatches(editor, searchQuery)
        }
      }, 300)
      
      return () => clearTimeout(timeoutId)
    } else {
      // Clear highlights when search mode is off or query is empty
      // This ensures ALL temporary highlights are cleared, not just in current document
      // Use a small delay to ensure editor is ready
      const clearTimeoutId = setTimeout(() => {
        if (editor && !editor.isDestroyed) {
          clearSearchHighlights(editor)
        }
      }, 100)
      
      return () => clearTimeout(clearTimeoutId)
    }
  }, [searchQuery, isSearchMode, editor, document?.id, theme])
  
  // Additional effect: Clear highlights whenever search mode is turned off
  // This ensures highlights are cleared even when switching documents
  useEffect(() => {
    if (!editor || !document) return
    
    if (!isSearchMode) {
      // Search mode is off - clear highlights immediately
      const clearTimeoutId = setTimeout(() => {
        if (editor && !editor.isDestroyed) {
          clearSearchHighlights(editor)
        }
      }, 50)
      
      return () => clearTimeout(clearTimeoutId)
    }
  }, [isSearchMode, editor, document?.id])

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
  useEffect(() => {
    // Don't interfere if user is actively resizing
    if (isUserResizingRef.current) return
    
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
  }, [isAIPanelOpen, aiPanelWidth, fileExplorerSize])

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

  // Cleanup resize timeout on unmount
  useEffect(() => {
    return () => {
      if (resizeTimeoutRef.current) {
        clearTimeout(resizeTimeoutRef.current)
      }
    }
  }, [])

  const handleExport = async (format: 'pdf' | 'docx', filename?: string, documentIds?: string[]) => {
    // If documentIds provided, use them; otherwise fall back to current document
    const idsToExport = documentIds && documentIds.length > 0 ? documentIds : (document ? [document.id] : [])
    
    if (idsToExport.length === 0) {
      alert('Please select at least one document to export.')
      return
    }
    
    try {
      const exportFilename = filename || document?.title || 'document'
      
      // Use exportMultiple for multiple documents (merges into one file)
      // Use export for single document
      let exportData: number[]
      if (idsToExport.length === 1) {
        exportData = await exportApi.export(idsToExport[0], format, exportFilename)
      } else {
        // Multiple documents - merge into one file (WYSIWYG)
        exportData = await exportApi.exportMultiple(idsToExport, format, exportFilename)
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

  // Only show full-screen loading on initial load when there's no document yet
  // When switching documents, keep the UI visible for smooth transition
  if (isLoadingDocument && id && !document) {
    return (
      <div style={{
        height: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: bgColor,
        color: secondaryTextColor
      }}>
        <div>Loading...</div>
      </div>
    )
  }

  return (
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
        editor={editor}
        onToggleFileExplorer={() => {
          if (fileExplorerPanelRef.current) {
            const currentSize = fileExplorerPanelRef.current.getSize()
            const newSize = currentSize > 0 ? 0 : 14
            fileExplorerPanelRef.current.resize(newSize)
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
        height: '1px',
        backgroundColor: borderColor
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
          editor={editor}
          onExport={handleExport}
          documents={documents}
          projectName={projectName}
          documentTitle={document?.title}
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
                  if (editor && !editor.isDestroyed) {
                    clearSearchHighlights(editor)
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
        height: '1px',
        backgroundColor: borderColor
      }} />
      
      {/* Content Area - Horizontal split with FileExplorer sidebar */}
      <PanelGroup 
        direction="horizontal" 
        style={{ flex: 1, overflow: 'hidden' }}
      >
        {/* File Explorer Sidebar */}
        <Panel 
          ref={fileExplorerPanelRef}
          defaultSize={fileExplorerSize} 
          minSize={0}
          maxSize={30}
          collapsible={true}
          onResize={(size) => {
            // Track File Explorer size changes
            setFileExplorerSize(size)
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
              justifyContent: 'space-between'
            }}>
              <span>{isSearchMode ? 'SEARCH' : projectName}</span>
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
              {isLoadingDocuments ? (
                <div style={{ 
                  padding: '20px', 
                  textAlign: 'center', 
                  color: secondaryTextColor,
                  fontSize: '13px'
                }}>
                  Loading...
                </div>
              ) : (
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
                  onSelectedFolderChange={setSelectedFolder}
                  onFileUploaded={async (newDoc) => {
                    // Reload documents to show the new file
                    await loadDocuments()
                    // If current document has projectId, add new doc to same project
                    if (document?.projectId) {
                      await projectApi.addDocument(document.projectId, newDoc.id, documents.length)
                      await loadDocuments()
                    }
                    // Navigate to the newly uploaded file
                    navigate(`/document/${newDoc.id}`)
                  }}
                />
              )}
            </div>
          </div>
        </Panel>
        
        <PanelResizeHandle style={{ 
          width: '1px', 
          backgroundColor: borderColor,
          cursor: 'col-resize',
          transition: 'background-color 0.2s',
          flexShrink: 0
        }} />
        
        {/* Editor Panel */}
        <Panel 
          ref={editorPanelRef}
          defaultSize={isAIPanelOpen 
            ? ((100 - fileExplorerSize) - ((aiPanelWidth / 100) * (100 - fileExplorerSize))) 
            : (100 - fileExplorerSize)
          } 
          minSize={40}
        >
          {isLoadingDocument && !document ? (
            // Show loading state in editor area only when loading first document
            <div style={{
              height: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: bgColor,
              color: secondaryTextColor
            }}>
              <div>Loading...</div>
            </div>
          ) : document && document.title.toLowerCase().endsWith('.pdf') ? (
            // PDF file - show full screen PDF viewer
            <FullScreenPDFViewer ref={pdfViewerRef} document={document} />
          ) : (
            // Regular document - show document editor
            <DocumentEditor 
              ref={documentEditorRef}
              document={document}
              editor={editor}
              onDocumentChange={setDocument}
              showToolbarOnly={false}
              isAIPanelOpen={isAIPanelOpen}
              aiPanelWidth={aiPanelWidth}
            />
          )}
        </Panel>
        {isAIPanelOpen && (
          <>
            <PanelResizeHandle style={{ 
              width: '1px', 
              backgroundColor: borderColor,
              cursor: 'col-resize',
              transition: 'background-color 0.2s'
            }} />
            <Panel 
              ref={aiPanelRef} 
              defaultSize={(aiPanelWidth / 100) * (100 - fileExplorerSize)} 
              minSize={15}
              onResize={handleAIPanelResize}
            >
              <AIPanel document={document} onClose={handleAIPanelClose} />
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
            title="Open AI Chat"
          >
            <ChatIcon style={{ fontSize: '24px', color: theme === 'dark' ? '#ffffff' : '#5f6368' }} />
          </button>
        )}
      </PanelGroup>
    </div>
  )
}
