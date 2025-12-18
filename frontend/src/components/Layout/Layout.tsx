import { Panel, PanelGroup, PanelResizeHandle, ImperativePanelHandle } from 'react-resizable-panels'
import { useEditor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { Extension } from '@tiptap/core'
import TextAlign from '@tiptap/extension-text-align'
import Placeholder from '@tiptap/extension-placeholder'
import Underline from '@tiptap/extension-underline'
import Color from '@tiptap/extension-color'
import TextStyle from '@tiptap/extension-text-style'
import Link from '@tiptap/extension-link'
import { ResizableImage } from '../Editor/ResizableImage'
import Highlight from '@tiptap/extension-highlight'
import { MathExtension } from '../Editor/MathExtension'
import { useEffect, useRef, useState } from 'react'
import DocumentEditor from '../Editor/DocumentEditor'
import Toolbar from '../Editor/Toolbar'
import AIPanel from '../AIPanel/AIPanel'
import FileExplorer from '../FileExplorer/FileExplorer'
import { Document } from '@shared/types'
import { documentApi, exportApi, projectApi } from '../../services/api'
import { FontSize } from '../Editor/FontSize'
import { FontFamily } from '../Editor/FontFamily'
import { LineHeight } from '../Editor/LineHeight'
import { Title } from '../Editor/Title'
import { Subtitle } from '../Editor/Subtitle'
import { useTheme } from '../../contexts/ThemeContext'
import BulletList from '@tiptap/extension-bullet-list'
import OrderedList from '@tiptap/extension-ordered-list'
import ListItem from '@tiptap/extension-list-item'
import { TextSelection } from 'prosemirror-state'
// @ts-ignore
import ChatIcon from '@mui/icons-material/Chat'
// @ts-ignore
import AddIcon from '@mui/icons-material/Add'
// @ts-ignore
import CreateNewFolderIcon from '@mui/icons-material/CreateNewFolder'
import TopBar from './TopBar'
import { useNavigate } from 'react-router-dom'

interface LayoutProps {
  document: Document | null
  onDocumentChange: (doc: Document | null) => void
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

export default function Layout({ document, onDocumentChange }: LayoutProps) {
  const { theme } = useTheme()
  const navigate = useNavigate()
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
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
  const editorPanelRef = useRef<ImperativePanelHandle>(null)
  const aiPanelRef = useRef<ImperativePanelHandle>(null)
  const fileExplorerPanelRef = useRef<ImperativePanelHandle>(null)
  const resizeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  
  const bgColor = theme === 'dark' ? '#141414' : '#ffffff'
  const borderColor = theme === 'dark' ? '#232323' : '#dadce0'
  const secondaryTextColor = theme === 'dark' ? '#858585' : '#5f6368'

  // Load all documents for FileExplorer
  useEffect(() => {
    loadDocuments()
  }, [])

  // Keyboard shortcut: Ctrl+Shift+E to toggle FileExplorer
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Check if Ctrl+Shift+E (or Cmd+Shift+E on Mac)
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'E' || e.key === 'e')) {
        // Don't prevent default if typing in an input field
        if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
          return
        }
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
  }, [])

  const loadDocuments = async () => {
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

  const handleDocumentClick = (docId: string) => {
    navigate(`/document/${docId}`)
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
        onDocumentChange(updatedDoc)
      }
    } catch (error) {
      console.error('Failed to rename document:', error)
      alert('Failed to rename document. Please try again.')
    }
  }

  const handleDocumentDelete = async (docId: string) => {
    if (!confirm('Are you sure you want to delete this document?')) {
      return
    }
    try {
      await documentApi.delete(docId)
      
      // If current document was deleted, find next file to navigate to
      if (document?.id === docId) {
        // Find the index of the deleted document
        const deletedIndex = documents.findIndex(doc => doc.id === docId)
        const updatedDocuments = documents.filter(doc => doc.id !== docId)
        setDocuments(updatedDocuments)
        
        if (updatedDocuments.length > 0) {
          // Navigate to the next file (or previous if it was the last one)
          const nextIndex = deletedIndex < updatedDocuments.length ? deletedIndex : updatedDocuments.length - 1
          navigate(`/document/${updatedDocuments[nextIndex].id}`)
        } else {
          // No more documents in project, go to home
          setDocuments([])
          navigate('/documents')
        }
      } else {
        // Just update the documents list
        setDocuments(docs => docs.filter(doc => doc.id !== docId))
      }
    } catch (error) {
      console.error('Failed to delete document:', error)
      alert('Failed to delete document. Please try again.')
    }
  }

  const handleReorderDocuments = async (documentIds: string[]) => {
    if (!document?.projectId) return
    
    try {
      await projectApi.reorderDocuments(document.projectId, documentIds)
      // Reload documents to reflect new order
      await loadDocuments()
    } catch (error) {
      console.error('Failed to reorder documents:', error)
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
      const newDoc = await documentApi.create(newTitle)
      
      // If current document has projectId, add new doc to same project
      if (document?.projectId) {
        await projectApi.addDocument(document.projectId, newDoc.id, documents.length)
      }
      
      // Update documents state immediately so FileExplorer shows it
      setDocuments(prev => [...prev, newDoc])
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
        placeholder: 'Start writing...',
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
    ],
    content: document?.content ? JSON.parse(document.content) : '',
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

  // Update editor content when document changes
  useEffect(() => {
    if (editor && document) {
      const content = JSON.parse(document.content)
      editor.commands.setContent(content)
    }
  }, [document?.id, editor])

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

  // Restore panel sizes when panel is opened
  useEffect(() => {
    if (isAIPanelOpen && aiPanelRef.current) {
      // Small delay to ensure panels are mounted
      // FileExplorer takes 14%, so remaining space is 86%
      // AI panel width is percentage of remaining space (86%)
      const remainingSpace = 86
      const aiPanelSize = (aiPanelWidth / 100) * remainingSpace
      const editorSize = remainingSpace - aiPanelSize
      setTimeout(() => {
        aiPanelRef.current?.resize(aiPanelSize)
        editorPanelRef.current?.resize(editorSize)
      }, 0)
    }
  }, [isAIPanelOpen])

  const handleAIPanelClose = () => {
    setIsAIPanelOpen(false)
  }

  const handleAIPanelOpen = () => {
    setIsAIPanelOpen(true)
  }

  const handleAIPanelResize = (size: number) => {
    if (isAIPanelOpen) {
      // size is percentage of remaining space (after FileExplorer's 14%)
      // Convert back to percentage of total for storage
      const remainingSpace = 86
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
      }, 300)
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

  const handleExport = async (format: 'pdf' | 'docx', filename?: string) => {
    if (!document) return
    
    try {
      const exportFilename = filename || document.title || 'document'
      // IPC returns data directly, not wrapped in { data: ... }
      const exportData = await exportApi.export(document.id, format, exportFilename)
      const blob = new Blob([exportData], { 
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
      onDocumentChange(updatedDocument)
    } catch (error) {
      console.error('Failed to update document title:', error)
    }
  }

  return (
    <div style={{ 
      height: '100vh', 
      display: 'flex', 
      flexDirection: 'column',
      backgroundColor: bgColor
    }}>
      {/* Top Bar - Logo + Menu */}
      <TopBar />
      
      {/* Toolbar - Independent, full width */}
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
          documentTitle={document?.title}
          documentId={document?.id}
          onTitleUpdate={handleTitleUpdate}
        />
      </div>
      
      {/* Separator line */}
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
          defaultSize={14} 
          minSize={0}
          maxSize={30}
          collapsible={true}
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
              fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between'
            }}>
              <span>{projectName}</span>
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
          defaultSize={isAIPanelOpen ? (86 - (aiPanelWidth / 100) * 86) : 86} 
          minSize={40}
        >
          <DocumentEditor 
            document={document}
            editor={editor}
            onDocumentChange={onDocumentChange}
            showToolbarOnly={false}
          />
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
              defaultSize={(aiPanelWidth / 100) * 86} 
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
              backgroundColor: theme === 'dark' ? '#2d2d2d' : '#f1f3f4',
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
              e.currentTarget.style.backgroundColor = theme === 'dark' ? '#3e3e42' : '#e8eaed'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'scale(1)'
              e.currentTarget.style.backgroundColor = theme === 'dark' ? '#2d2d2d' : '#f1f3f4'
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

