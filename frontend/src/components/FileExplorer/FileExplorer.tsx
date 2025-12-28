import { useState, useEffect, useRef } from 'react'
import { Document } from '@shared/types'
import { useTheme } from '../../contexts/ThemeContext'
import { documentApi } from '../../services/api'
import { memo } from 'react'
// @ts-ignore
import ChevronRightIcon from '@mui/icons-material/ChevronRight'
// @ts-ignore
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
// @ts-ignore
import AddIcon from '@mui/icons-material/Add'
// @ts-ignore
import AutorenewIcon from '@mui/icons-material/Autorenew'

interface FileExplorerProps {
  documents: Document[]
  currentDocumentId?: string | null
  onDocumentClick: (docId: string, searchQuery?: string, matchPosition?: number) => void
  onDocumentRename?: (docId: string, newTitle: string) => void
  onDocumentDelete?: (docId: string) => void
  onReorderDocuments?: (documentIds: string[]) => void
  projectName?: string // Project name for the ProjectName folder
  onSelectedFolderChange?: (folderId: 'library' | 'project' | null) => void // Callback when folder selection changes
  onFileUploaded?: (document: Document, isBatchUpload?: boolean) => void // Callback when a file is uploaded, isBatchUpload indicates if multiple files are being uploaded
  isSearchMode?: boolean // Whether search mode is active
  onSearchModeChange?: (isSearchMode: boolean) => void // Callback to toggle search mode
  onSearchQueryChange?: (query: string) => void // Callback when search query changes
  searchQueryProp?: string // External search query to sync with local state
  onDocumentsUpdated?: () => void // Callback when documents are updated (e.g., after replace all)
  onDocumentChange?: (doc: Document | null) => void // Callback to update current document in editor
  onDocumentFolderChange?: (documentId: string, folder: 'library' | 'project') => void // Callback for optimistic folder updates
}

interface FileItem {
  id: string
  name: string
  type: 'file' | 'folder'
  children?: FileItem[]
  document?: Document
}

function FileExplorer({
  documents,
  currentDocumentId,
  onDocumentClick,
  onDocumentRename,
  onDocumentDelete,
  onReorderDocuments,
  projectName: _projectName = 'LEMONA',
  onSelectedFolderChange,
  onFileUploaded,
  isSearchMode = false,
  onSearchModeChange,
  onSearchQueryChange,
  searchQueryProp,
  onDocumentsUpdated,
  onDocumentChange,
  onDocumentFolderChange,
}: FileExplorerProps) {
  const { theme } = useTheme()
  
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [_selectedFolderId, setSelectedFolderId] = useState<'library' | 'project' | null>(null)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [contextMenuPos, setContextMenuPos] = useState<{ x: number; y: number; item: FileItem } | null>(null)
  const [draggedItemId, setDraggedItemId] = useState<string | null>(null)
  const [dragOverItemId, setDragOverItemId] = useState<string | null>(null)
  const [dragOverFileItemId, setDragOverFileItemId] = useState<string | null>(null) // Track which file item is being dragged over for external files
  const [dragOverEndZone, setDragOverEndZone] = useState<boolean>(false) // Track if dragging over the end drop zone of project folder
  const [dropPosition, setDropPosition] = useState<'above' | 'below' | null>(null) // Track drop position relative to item
  const [dropTargetId, setDropTargetId] = useState<string | null>(null) // Track which item we're dropping relative to
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set(['library', 'project'])) // Default both folders expanded
  
  // Upload queue state - use ref to avoid re-renders and manage queue properly
  const uploadQueueRef = useRef<Array<{ file: File; folderId: 'library' | 'project' }>>([])
  const [uploadProgress, setUploadProgress] = useState<{ current: number; total: number; currentFile: string } | null>(null)
  const [uploadQueueTrigger, setUploadQueueTrigger] = useState(0) // Trigger to re-run useEffect when queue changes
  const processingRef = useRef(false)
  const MAX_CONCURRENT_UPLOADS = 3 // Process max 3 files at a time
  
  // Search state
  const [searchQuery, setSearchQuery] = useState('')
  const [replaceQuery, setReplaceQuery] = useState('')
  const [searchResults, setSearchResults] = useState<Array<{
    documentId: string
    documentTitle: string
    matches: Array<{ line: string; index: number; charPosition: number }>
  }>>([])
  const [expandedSearchFiles, setExpandedSearchFiles] = useState<Set<string>>(new Set()) // Track which search result files are expanded
  const searchInputRef = useRef<HTMLInputElement>(null)
  const isNavigatingFromSearch = useRef(false) // Track if we're navigating from search results to prevent auto-focus
  
  // Sync local searchQuery with prop from parent (Layout)
  useEffect(() => {
    if (searchQueryProp !== undefined && searchQueryProp !== searchQuery) {
      setSearchQuery(searchQueryProp)
    }
  }, [searchQueryProp])
  
  // Extract text from TipTap JSON content
  const extractTextFromTipTap = (node: any): string => {
    if (typeof node === 'string') return node
    if (Array.isArray(node)) {
      return node.map(extractTextFromTipTap).join('')
    }
    if (node && typeof node === 'object') {
      if (node.text) return node.text
      if (node.content) return extractTextFromTipTap(node.content)
      return ''
    }
    return ''
  }
  
  // Highlight search query in text
  const highlightText = (text: string, query: string): React.ReactNode => {
    if (!query.trim()) return text
    
    const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi')
    const parts = text.split(regex)
    
    return parts.map((part, index) => {
      if (part.toLowerCase() === query.toLowerCase()) {
        return (
          <mark
            key={index}
            style={{
              backgroundColor: theme === 'dark' ? '#4a5568' : '#fde047',
              color: 'inherit',
              padding: '0 2px',
              borderRadius: '2px'
            }}
          >
            {part}
          </mark>
        )
      }
      return <span key={index}>{part}</span>
    })
  }
  
  // Perform search across all documents
  useEffect(() => {
    if (!isSearchMode || !searchQuery.trim()) {
      setSearchResults([])
      return
    }
    
    const performSearch = async () => {
      const results: Array<{
        documentId: string
        documentTitle: string
        matches: Array<{ line: string; index: number; charPosition: number }>
      }> = []
      
      const query = searchQuery.toLowerCase()
      
      for (const doc of documents) {
        // Skip documents in the library folder - only search workspace files
        if (doc.folder === 'library') {
          continue
        }
        
        try {
          let textContent = ''
          const isPDF = doc.title.toLowerCase().endsWith('.pdf')
          
          // For PDFs, search PDF text if available
          if (isPDF && doc.pdfText) {
            textContent = doc.pdfText.fullText || ''
            // Also search per-page if needed for better context
            if (!textContent && doc.pdfText.pages) {
              textContent = doc.pdfText.pages.map(p => p.fullText).join('\n\n')
            }
          } else if (doc.content) {
            // Regular document - extract text from TipTap content
            try {
              const content = JSON.parse(doc.content)
              textContent = extractTextFromTipTap(content)
            } catch {
              textContent = doc.content
            }
          }
          
          if (textContent.toLowerCase().includes(query)) {
            const lines = textContent.split('\n')
            const matches: Array<{ line: string; index: number; charPosition: number; pageNumber?: number }> = []
            let charOffset = 0 // Track character position in full text
            
            // For PDFs, track which page each line belongs to
            if (isPDF && doc.pdfText) {
              // Map lines to pages
              let pageCharOffset = 0
              doc.pdfText.pages.forEach((page) => {
                const pageLines = page.fullText.split('\n')
                pageLines.forEach((line, lineIndex) => {
                  const lineLower = line.toLowerCase()
                  
                  // Find ALL occurrences of the query in this line
                  let searchStart = 0
                  while (true) {
                    const matchIndex = lineLower.indexOf(query, searchStart)
                    if (matchIndex === -1) break
                    
                    const charPosition = pageCharOffset + matchIndex
                    
                    // Truncate line if too long
                    let displayLine = line
                    if (line.length > 50) {
                      const contextBefore = 9
                      const contextAfter = 15
                      const start = Math.max(0, matchIndex - contextBefore)
                      const end = Math.min(line.length, matchIndex + query.length + contextAfter)
                      displayLine = (start > 0 ? '...' : '') + line.substring(start, end) + (end < line.length ? '...' : '')
                    }
                    
                    // Add page number prefix for PDFs
                    const displayLineWithPage = isPDF 
                      ? `[Page ${page.pageNumber}] ${displayLine}`
                      : displayLine
                    
                    matches.push({ 
                      line: displayLineWithPage, 
                      index: lineIndex, 
                      charPosition,
                      pageNumber: page.pageNumber
                    })
                    
                    searchStart = matchIndex + 1
                  }
                  
                  pageCharOffset += line.length + 1
                })
              })
            } else {
              // Regular document search
              lines.forEach((line, lineIndex) => {
                const lineLower = line.toLowerCase()
                
                // Find ALL occurrences of the query in this line (not just the first one)
                let searchStart = 0
                while (true) {
                  const matchIndex = lineLower.indexOf(query, searchStart)
                  if (matchIndex === -1) break // No more matches in this line
                  
                  const charPosition = charOffset + matchIndex
                  
                  // Truncate line if too long (show context around each match)
                  // Show more context before the match so it appears earlier in narrow panels
                  let displayLine = line
                  if (line.length > 50) {
                    // Show more context before match (30 chars) and less after (10 chars)
                    // This ensures the search word appears early in the displayed text
                    const contextBefore = 9
                    const contextAfter = 15
                    const start = Math.max(0, matchIndex - contextBefore)
                    const end = Math.min(line.length, matchIndex + query.length + contextAfter)
                    displayLine = (start > 0 ? '...' : '') + line.substring(start, end) + (end < line.length ? '...' : '')
                  }
                  
                  matches.push({ line: displayLine, index: lineIndex, charPosition })
                  
                  // Move search start position to find next occurrence
                  searchStart = matchIndex + 1
                }
                
                // Add line length + 1 for newline character
                charOffset += line.length + 1
              })
            }
            
            if (matches.length > 0) {
              results.push({
                documentId: doc.id,
                documentTitle: doc.title,
                matches: matches // Show all matches, not limited to 3
              })
            }
          }
        } catch (error) {
          console.error(`Error searching in document ${doc.id}:`, error)
        }
      }
      
      setSearchResults(results)
      
      // Auto-expand all files when search results change (optional - you can remove this if you want files collapsed by default)
      if (results.length > 0) {
        setExpandedSearchFiles(new Set(results.map(r => r.documentId)))
      } else {
        setExpandedSearchFiles(new Set())
      }
    }
    
    performSearch()
  }, [searchQuery, documents, isSearchMode])
  
  // Focus search input when search mode is activated
  // BUT NOT when navigating to a search result
  useEffect(() => {
    if (isSearchMode && searchInputRef.current && !isNavigatingFromSearch.current) {
      setTimeout(() => {
        searchInputRef.current?.focus()
      }, 100)
    }
  }, [isSearchMode])
  
  // Replace text in TipTap JSON structure while preserving formatting
  const replaceTextInTipTap = (node: any, searchText: string, replaceText: string): any => {
    if (typeof node === 'string') {
      // Replace in string
      return node.replace(new RegExp(searchText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), replaceText)
    }
    
    if (Array.isArray(node)) {
      // Recursively process array items
      return node.map(item => replaceTextInTipTap(item, searchText, replaceText))
    }
    
    if (node && typeof node === 'object') {
      // Clone the object to avoid mutating the original
      const newNode = { ...node }
      
      // If this is a text node, replace the text
      if (node.type === 'text' && node.text) {
        newNode.text = node.text.replace(
          new RegExp(searchText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'),
          replaceText
        )
      }
      
      // Recursively process content
      if (node.content) {
        newNode.content = replaceTextInTipTap(node.content, searchText, replaceText)
      }
      
      return newNode
    }
    
    return node
  }

  // Handle replace all
  const handleReplaceAll = async () => {
    if (!searchQuery.trim() || !replaceQuery.trim()) return
    
    try {
      // Get all documents that match the search query
      const documentsToUpdate: Document[] = []
      
      for (const doc of documents) {
        try {
          let textContent = ''
          if (doc.content) {
            try {
              const content = JSON.parse(doc.content)
              textContent = extractTextFromTipTap(content)
            } catch {
              textContent = doc.content
            }
          }
          
          // Check if document contains the search query
          if (textContent.toLowerCase().includes(searchQuery.toLowerCase())) {
            documentsToUpdate.push(doc)
          }
        } catch (error) {
          console.error(`Error checking document ${doc.id}:`, error)
        }
      }
      
      if (documentsToUpdate.length === 0) {
        return
      }
      
      // Update each document
      let successCount = 0
      let errorCount = 0
      
      for (const doc of documentsToUpdate) {
        try {
          if (!doc.content) {
            console.warn(`[FileExplorer] Document ${doc.id} has no content, skipping`)
            continue
          }
          
          // Parse the TipTap JSON content
          let content: any
          try {
            content = JSON.parse(doc.content)
          } catch (parseError) {
            console.error(`[FileExplorer] Failed to parse content for document ${doc.id}:`, parseError)
            errorCount++
            continue
          }
          
          // Replace text in the TipTap structure
          const updatedContent = replaceTextInTipTap(content, searchQuery, replaceQuery)
          
          // Convert back to JSON string
          const updatedContentString = JSON.stringify(updatedContent)
          
          // Update the document
          await documentApi.update(doc.id, updatedContentString)
          successCount++
        } catch (error) {
          console.error(`[FileExplorer] Failed to update document ${doc.id}:`, error)
          errorCount++
        }
      }
      
      // Reload documents and update current document if it was modified
      if (successCount > 0) {
        // Check if current document was updated
        const currentDocWasUpdated = documentsToUpdate.some(doc => doc.id === currentDocumentId)
        
        // Notify parent to reload documents so search results update
        if (onDocumentsUpdated) {
          onDocumentsUpdated()
        }
        
        // If current document was updated, reload it to refresh the editor
        if (currentDocWasUpdated && currentDocumentId && onDocumentChange) {
          setTimeout(async () => {
            try {
              const updatedDoc = await documentApi.get(currentDocumentId)
              if (updatedDoc) {
                onDocumentChange(updatedDoc)
              }
            } catch (error) {
              console.error('[FileExplorer] Failed to reload current document:', error)
            }
          }, 100)
        }
      }
      
    } catch (error) {
      console.error('[FileExplorer] Error in replace all:', error)
    }
  }

  // Sync selectedId with currentDocumentId
  useEffect(() => {
    if (currentDocumentId) {
      setSelectedId(currentDocumentId)
    }
  }, [currentDocumentId])

  const bgColor = theme === 'dark' ? '#141414' : '#ffffff'
  const hoverBg = theme === 'dark' ? '#1e1e1e' : '#f1f3f4'
  const selectedBg = theme === 'dark' ? '#1e1e1e' : '#f1f3f4'
  const textColor = theme === 'dark' ? '#cccccc' : '#202124'
  const indicatorColor = theme === 'dark' ? '#999999' : '#c0c0c0' // Light grey color for drop indicator
  
  // Dropdown menu colors (matching Toolbar.tsx)
  const dropdownBg = theme === 'dark' ? '#141414' : '#ffffff'
  const dropdownBorder = theme === 'dark' ? '#202020' : '#dadce0'
  const dropdownTextColor = theme === 'dark' ? '#D6D6DD' : '#202124'
  const dropdownHoverBg = theme === 'dark' ? '#3e3e42' : '#f8f9fa'

  // Helper function to format display name - remove .md from README.md
  const formatDisplayName = (title: string): string => {
    if (title.toLowerCase() === 'readme.md') {
      return 'README'
    }
    return title
  }

  // Build folder structure: Library and ProjectName folders
  // Extract README.md separately - it will be shown as a standalone file at the top
  const readmeDoc = documents.find(doc => doc.title === 'README.md' || doc.title.toLowerCase() === 'readme.md')
  const libraryDocs = documents.filter(doc => doc.folder === 'library' && doc.title !== 'README.md' && doc.title.toLowerCase() !== 'readme.md')
  const projectDocs = documents.filter(doc => (!doc.folder || doc.folder === 'project') && doc.title !== 'README.md' && doc.title.toLowerCase() !== 'readme.md')
  
  // Sort documents by order if available, otherwise by creation time
  const sortDocuments = (docs: Document[]) => {
    return [...docs].sort((a, b) => {
      if (a.order !== undefined && b.order !== undefined) {
        return a.order - b.order
      }
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    })
  }

  const libraryFiles: FileItem[] = sortDocuments(libraryDocs).map(doc => ({
    id: doc.id,
    name: doc.title,
    type: 'file' as const,
    document: doc,
  }))

  const projectFiles: FileItem[] = sortDocuments(projectDocs).map(doc => ({
    id: doc.id,
    name: doc.title,
    type: 'file' as const,
    document: doc,
  }))

  const fileTree: FileItem[] = [
    {
      id: 'library',
      name: 'Library',
      type: 'folder',
      children: libraryFiles,
    },
    {
      id: 'project',
      name: 'Workspace',
      type: 'folder',
      children: projectFiles,
    },
  ]


  const toggleFolder = (folderId: string) => {
    setExpandedFolders(prev => {
      const newSet = new Set(prev)
      if (newSet.has(folderId)) {
        newSet.delete(folderId)
      } else {
        newSet.add(folderId)
      }
      return newSet
    })
  }

  const handleItemClick = (item: FileItem) => {
    if (item.type === 'folder') {
      // Select folder when clicking on folder name
      const folderId = item.id === 'library' ? 'library' : 'project'
      setSelectedFolderId(folderId)
      setSelectedId(item.id) // Also set selectedId for visual feedback
      if (onSelectedFolderChange) {
        onSelectedFolderChange(folderId)
      }
    } else if (item.document) {
      setSelectedId(item.id)
      // Determine which folder this file belongs to and set it as selected folder
      const fileFolderId = item.document.folder === 'library' ? 'library' : 'project'
      setSelectedFolderId(fileFolderId)
      if (onSelectedFolderChange) {
        onSelectedFolderChange(fileFolderId)
      }
      onDocumentClick(item.document.id)
    }
  }
  
  const handleArrowClick = (e: React.MouseEvent, folderId: string) => {
    e.stopPropagation() // Prevent folder selection when clicking arrow
    toggleFolder(folderId)
  }

  const handleDoubleClick = (item: FileItem) => {
    // Only allow renaming files, not folders
    if (item.type === 'file' && item.document && onDocumentRename) {
      // Enable rename on double-click
      setRenamingId(item.id)
      setRenameValue(item.name)
    }
  }

  // Rename is handled via context menu or double-click in FileExplorer
  // For now, we'll support it through the onDocumentRename prop

  const handleRenameSubmit = (item: FileItem) => {
    if (renamingId === item.id && renameValue.trim()) {
      if (item.document && onDocumentRename) {
      onDocumentRename(item.document.id, renameValue.trim())
      }
      setRenamingId(null)
      setRenameValue('')
    }
  }

  const handleRenameCancel = () => {
    setRenamingId(null)
    setRenameValue('')
  }

  // Check if file extension is supported
  const isSupportedFileType = (fileName: string): boolean => {
    const ext = fileName.toLowerCase().split('.').pop()
    return ['pdf', 'png', 'docx', 'xlsx'].includes(ext || '')
  }

  // Process upload queue
  useEffect(() => {
    if (uploadQueueRef.current.length === 0 || processingRef.current) return

    const processUploads = async () => {
      processingRef.current = true
      
      const totalFiles = uploadQueueRef.current.length
      let processedCount = 0

      while (uploadQueueRef.current.length > 0) {
        const batch = uploadQueueRef.current.splice(0, MAX_CONCURRENT_UPLOADS)

        // Process batch in parallel
        const uploadPromises = batch.map(async (item) => {
          const { file, folderId } = item
          processedCount++

          try {
            setUploadProgress({
              current: processedCount,
              total: totalFiles,
              currentFile: file.name,
            })

            if (!isSupportedFileType(file.name)) {
              console.warn(`File type not supported: ${file.name}`)
              return { success: false, error: `File type not supported: ${file.name}` }
            }

            // In Electron, when dragging from file system, file.path should be available
            const filePath = (file as any).path

            let finalFilePath = filePath

            if (!finalFilePath) {
              // If no path, try to read file and save temporarily
              // This handles files dragged from browser or other sources
              const arrayBuffer = await file.arrayBuffer()
              const uint8Array = new Uint8Array(arrayBuffer)

              // Use Electron IPC to save temp file
              if ((window as any).electron) {
                const tempPath = await (window as any).electron.invoke('file:saveTemp', Array.from(uint8Array), file.name)
                if (tempPath) {
                  finalFilePath = tempPath
                } else {
                  throw new Error('Failed to save temporary file')
                }
              } else {
                throw new Error('File path not available and Electron API not accessible')
              }
            }

            // Upload file normally (including DOCX files)
            const document = await documentApi.uploadFile(finalFilePath, file.name, folderId)
            if (document && onFileUploaded) {
              const isBatchUpload = totalFiles > 1
              onFileUploaded(document, isBatchUpload)
            }
            return { success: true, document }
          } catch (error) {
            console.error('Failed to upload file:', error)
            return {
              success: false,
              error: `Failed to upload ${file.name}: ${error instanceof Error ? error.message : 'Unknown error'}`,
            }
          }
        })

        // Wait for batch to complete
        const results = await Promise.allSettled(uploadPromises)

        // Log errors but don't stop processing
        results.forEach((result, index) => {
          if (result.status === 'rejected') {
            console.error(`Upload failed for ${batch[index].file.name}:`, result.reason)
          } else if (result.value && !result.value.success) {
            console.error(result.value.error)
          }
        })

        // Small delay between batches to prevent overwhelming the system
        if (uploadQueueRef.current.length > 0) {
          await new Promise(resolve => setTimeout(resolve, 100))
        }
      }

      processingRef.current = false
      setUploadProgress(null)
    }

    processUploads()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uploadQueueTrigger, onFileUploaded])

  // Handle file drop on folder
  const handleFolderDrop = async (e: React.DragEvent, folderId: 'library' | 'project') => {
    e.preventDefault()
    e.stopPropagation()
    setDragOverFileItemId(null)

    const files = Array.from(e.dataTransfer.files)
    if (files.length === 0) return

    // Filter supported files
    const supportedFiles = files.filter(file => {
      if (!isSupportedFileType(file.name)) {
        return false
      }
      return true
    })

    if (supportedFiles.length === 0) {
      alert('No supported files found. Supported formats: .pdf, .png, .docx, .xlsx')
      return
    }

    // Add files to upload queue
    supportedFiles.forEach(file => {
      uploadQueueRef.current.push({ file, folderId })
    })
    
    // Trigger processing by updating trigger state
    setUploadQueueTrigger(prev => prev + 1)
  }

  // Handle drag over folder
  const handleFolderDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    
    // Check if dragging files (not internal items)
    if (e.dataTransfer.types.includes('Files')) {
      e.dataTransfer.dropEffect = 'copy'
    }
  }

  // Handle drag leave folder
  const handleFolderDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
  }

  // Helper function to get folder ID for a file item
  const getFolderIdForFileItem = (fileItemId: string): 'library' | 'project' | null => {
    // Check if file belongs to library folder
    if (libraryFiles.some(f => f.id === fileItemId)) {
      return 'library'
    }
    // Check if file belongs to project folder
    if (projectFiles.some(f => f.id === fileItemId)) {
      return 'project'
    }
    return null
  }

  const renderFileItem = (item: FileItem, indentLevel: number = 0): JSX.Element => {
    const isSelected = selectedId === item.id
    const isRenaming = renamingId === item.id
    const isFolder = item.type === 'folder'
    const isExpanded = isFolder && expandedFolders.has(item.id)
    // Folders have 12px padding, files inside folders have 32px (12 + 20 for arrow/indent)
    const paddingLeft = isFolder ? 12 : 32
    // File items have different text color (#818181), folders keep original color
    const itemTextColor = isFolder ? textColor : '#818181'
    // Check if this item has the context menu open
    const hasContextMenu = contextMenuPos && contextMenuPos.item.id === item.id
    
    // Determine if we should show drop indicator above or below this item
    const showIndicatorAbove = !isFolder && draggedItemId && dropTargetId === item.id && dropPosition === 'above'
    const showIndicatorBelow = !isFolder && draggedItemId && dropTargetId === item.id && dropPosition === 'below'

    return (
      <div key={item.id} style={{ position: 'relative', width: '100%', boxSizing: 'border-box', margin: 0, padding: 0 }}>
        {/* Drop indicator line above */}
        {showIndicatorAbove && (
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              height: '2px',
              backgroundColor: indicatorColor,
              zIndex: 1000,
              pointerEvents: 'none',
            }}
          />
        )}
        <div
          draggable={!isFolder}
          onDragStart={(e) => {
            if (!isFolder) {
              setDraggedItemId(item.id)
              setDragOverEndZone(false)
              setDropTargetId(null)
              setDropPosition(null)
              e.dataTransfer.effectAllowed = 'move'
            }
          }}
          onDragEnd={() => {
            // Clear all drag states when drag ends
            setDraggedItemId(null)
            setDragOverItemId(null)
            setDropTargetId(null)
            setDropPosition(null)
            setDragOverEndZone(false)
          }}
          onDragOver={(e) => {
            if (isFolder) {
              // Handle drag over folder (both external files and internal files)
              if (e.dataTransfer.types.includes('Files')) {
                // External file drag over folder
                handleFolderDragOver(e)
              } else if (draggedItemId) {
                // Internal file drag over folder - allow drop
                e.preventDefault()
                e.stopPropagation()
                e.dataTransfer.dropEffect = 'move'
              }
            } else {
              // Check if dragging external files
              if (e.dataTransfer.types.includes('Files')) {
                // Handle external file drag over file item
                e.preventDefault()
                e.stopPropagation()
                setDragOverFileItemId(item.id)
                e.dataTransfer.dropEffect = 'copy'
              } else if (draggedItemId) {
                // Handle internal item drag over file
                e.preventDefault()
                e.stopPropagation()
                e.dataTransfer.dropEffect = 'move'
                if (item.id !== draggedItemId) {
                  setDragOverItemId(item.id)
                  
                  // Calculate if cursor is in top or bottom half of the item
                  const rect = e.currentTarget.getBoundingClientRect()
                  const y = e.clientY - rect.top
                  const height = rect.height
                  const isTopHalf = y < height / 2
                  
                  setDropTargetId(item.id)
                  setDropPosition(isTopHalf ? 'above' : 'below')
                } else {
                  setDropTargetId(null)
                  setDropPosition(null)
                }
              }
            }
          }}
          onDragLeave={(e) => {
            if (isFolder) {
              // Only clear drag over state if we're not moving to a child element
              const relatedTarget = e.relatedTarget as Node | null
              if (!e.currentTarget.contains(relatedTarget)) {
                handleFolderDragLeave(e)
              }
            } else {
              // Only clear drag over state if we're not moving to a child element
              const relatedTarget = e.relatedTarget as Node | null
              if (!e.currentTarget.contains(relatedTarget)) {
                setDragOverItemId(null)
                setDragOverFileItemId(null)
                setDragOverEndZone(false)
                setDropTargetId(null)
                setDropPosition(null)
              }
            }
          }}
          onDrop={(e) => {
            e.preventDefault()
            e.stopPropagation()
            if (isFolder) {
              // Handle drop on folder
              const folderId = item.id === 'library' ? 'library' : 'project'
              
              // Check if dropping external files
              if (e.dataTransfer.types.includes('Files')) {
                // Handle external file drop on folder
                handleFolderDrop(e, folderId)
              } else if (draggedItemId) {
                // Handle internal file drop on folder - move file to this folder
                const draggedItem = fileTree.flatMap(f => f.children || []).find(f => f.id === draggedItemId)
                if (draggedItem && draggedItem.document) {
                  const currentFolder = draggedItem.document.folder || 'project'
                  const documentId = draggedItem.document.id
                  // Only move if folder is different
                  if (currentFolder !== folderId) {
                    // Optimistically update UI first
                    if (onDocumentFolderChange) {
                      onDocumentFolderChange(documentId, folderId)
                    }
                    
                    // Then update backend
                    documentApi.updateFolder(documentId, folderId)
                      .catch((error) => {
                        console.error('Failed to move document to folder:', error)
                        alert('Failed to move file to folder')
                        // Revert optimistic update on error
                        if (onDocumentFolderChange) {
                          onDocumentFolderChange(documentId, currentFolder)
                        }
                      })
                  }
                }
              }
            } else if (!isFolder) {
              // Check if dropping external files
              if (e.dataTransfer.types.includes('Files')) {
                // Handle external file drop on file item - add to same folder as the file item
                const folderId = getFolderIdForFileItem(item.id)
                if (folderId) {
                  handleFolderDrop(e, folderId)
                }
                setDragOverFileItemId(null)
              } else if (draggedItemId && draggedItemId !== item.id) {
                // Handle internal item drop on file
                const draggedItem = fileTree.flatMap(f => f.children || []).find(f => f.id === draggedItemId)
                const dropItem = fileTree.flatMap(f => f.children || []).find(f => f.id === item.id)
                
                if (draggedItem && dropItem && draggedItem.document && dropItem.document) {
                  const draggedFolder = draggedItem.document.folder || 'project'
                  const dropFolder = dropItem.document.folder || 'project'
                  const draggedDocumentId = draggedItem.document.id
                  
                  // Check if moving between folders
                  if (draggedFolder !== dropFolder) {
                    // Move to target folder
                    if (onDocumentFolderChange) {
                      onDocumentFolderChange(draggedDocumentId, dropFolder)
                    }
                    
                    documentApi.updateFolder(draggedDocumentId, dropFolder)
                      .catch((error) => {
                        console.error('Failed to move document to folder:', error)
                        alert('Failed to move file to folder')
                        // Revert optimistic update on error
                        if (onDocumentFolderChange) {
                          onDocumentFolderChange(draggedDocumentId, draggedFolder)
                        }
                      })
                  } else if (onReorderDocuments) {
                    // Same folder - handle reorder
                    const folder = fileTree.find(f => f.children?.some(c => c.id === item.id))
                    if (folder && folder.children) {
                      const folderFiles = [...folder.children]
                      const draggedIndex = folderFiles.findIndex(f => f.id === draggedItemId)
                      const dropIndex = folderFiles.findIndex(f => f.id === item.id)
                      
                      if (draggedIndex !== -1 && dropIndex !== -1) {
                        const newOrder = [...folderFiles]
                        const [draggedItem] = newOrder.splice(draggedIndex, 1)
                        newOrder.splice(dropIndex, 0, draggedItem)
                        
                        const documentIds = newOrder.map(f => f.id).filter(id => {
                          const fileItem = folderFiles.find(f => f.id === id)
                          return fileItem?.document
                        })
                        
                        onReorderDocuments(documentIds)
                      }
                    }
                  }
                }
              }
            }
            setDraggedItemId(null)
            setDragOverItemId(null)
            setDropTargetId(null)
            setDropPosition(null)
          }}
          style={{
            display: 'flex',
            alignItems: 'center',
            paddingLeft: `${paddingLeft}px`,
            paddingRight: '0px',
            paddingTop: '4px',
            paddingBottom: '4px',
            cursor: 'pointer',
            backgroundColor: isSelected ? selectedBg : 
              (!isFolder && dragOverFileItemId === item.id) ? hoverBg :
              dragOverItemId === item.id ? hoverBg : 'transparent',
            color: itemTextColor,
            fontSize: '13px',
            fontFamily: '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Noto Sans SC", "Helvetica Neue", Arial, sans-serif',
            userSelect: 'none',
            minHeight: '22px',
            width: '100%',
            boxSizing: 'border-box',
            borderRadius: '0',
            marginLeft: '0',
            marginRight: '0',
            marginBottom: '0',
            opacity: draggedItemId === item.id ? 0.5 : 1,
            border: hasContextMenu ? `1px solid ${theme === 'dark' ? '#444444' : '#909090'}` : '1px solid transparent',
          }}
          onClick={() => handleItemClick(item)}
          onDoubleClick={() => handleDoubleClick(item)}
          onContextMenu={(e) => {
            e.preventDefault()
            setContextMenuPos({ x: e.clientX, y: e.clientY, item })
          }}
          onMouseEnter={(e) => {
            if (!isSelected && draggedItemId !== item.id) {
              e.currentTarget.style.backgroundColor = hoverBg
              e.currentTarget.style.borderRadius = '0'
              e.currentTarget.style.marginRight = '0'
            }
          }}
          onMouseLeave={(e) => {
            if (!isSelected && dragOverItemId !== item.id && dragOverFileItemId !== item.id) {
              e.currentTarget.style.backgroundColor = 'transparent'
              e.currentTarget.style.borderRadius = '0'
              e.currentTarget.style.marginRight = '0'
            }
          }}
        >
          {/* Folder expand/collapse arrow */}
          {isFolder && (
            <span
              style={{
                display: 'flex',
                alignItems: 'center',
                marginRight: '4px',
                width: '16px',
                height: '16px',
                flexShrink: 0,
              }}
            >
              {isExpanded ? (
                <ExpandMoreIcon 
                  style={{ fontSize: '16px', color: textColor, cursor: 'pointer' }}
                  onClick={(e) => handleArrowClick(e, item.id)}
                />
              ) : (
                <ChevronRightIcon 
                  style={{ fontSize: '16px', color: textColor, cursor: 'pointer' }}
                  onClick={(e) => handleArrowClick(e, item.id)}
                />
              )}
            </span>
          )}
          
          {/* File Name */}
          {isRenaming ? (
            <input
              type="text"
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onBlur={() => handleRenameSubmit(item)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleRenameSubmit(item)
                } else if (e.key === 'Escape') {
                  handleRenameCancel()
                }
              }}
              onClick={(e) => e.stopPropagation()}
              style={{
                width: 'auto',
                minWidth: '60px',
                maxWidth: 'calc(100% - 20px)',
                border: `1px solid ${selectedBg}`,
                borderRadius: '2px',
                padding: '2px 4px',
                fontSize: '13px',
                fontFamily: 'inherit',
                backgroundColor: bgColor,
                color: textColor,
                outline: 'none',
              }}
              autoFocus
            />
          ) : (
            <span
              style={{
                flex: 1,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {formatDisplayName(item.name)}
            </span>
          )}
        </div>
        
        {/* Drop indicator line below */}
        {showIndicatorBelow && (
          <div
            style={{
              position: 'absolute',
              bottom: isFolder && isExpanded ? 'auto' : 0,
              top: isFolder && isExpanded ? '100%' : 'auto',
              left: 0,
              right: 0,
              height: '2px',
              backgroundColor: indicatorColor,
              zIndex: 1000,
              pointerEvents: 'none',
            }}
          />
        )}
        
        {/* Render children if folder is expanded */}
        {isFolder && isExpanded && item.children && (
          <div
            onDragOver={(e) => {
              // Allow dropping files anywhere in the folder area
              if (draggedItemId) {
                e.preventDefault()
                e.stopPropagation()
                e.dataTransfer.dropEffect = 'move'
              } else if (e.dataTransfer.types.includes('Files')) {
                // External files
                e.preventDefault()
                e.stopPropagation()
                e.dataTransfer.dropEffect = 'copy'
              }
            }}
            onDragLeave={() => {
              // Allow drag leave to propagate naturally
            }}
            onDrop={(e) => {
              e.preventDefault()
              e.stopPropagation()
              const folderId = item.id === 'library' ? 'library' : 'project'
              
              // Check if dropping external files
              if (e.dataTransfer.types.includes('Files')) {
                // Handle external file drop in folder area
                handleFolderDrop(e, folderId)
              } else if (draggedItemId) {
                // Handle internal file drop in folder area - move file to this folder
                const draggedItem = fileTree.flatMap(f => f.children || []).find(f => f.id === draggedItemId)
                if (draggedItem && draggedItem.document) {
                  const currentFolder = draggedItem.document.folder || 'project'
                  const documentId = draggedItem.document.id
                  // Only move if folder is different
                  if (currentFolder !== folderId) {
                    // Optimistically update UI first
                    if (onDocumentFolderChange) {
                      onDocumentFolderChange(documentId, folderId)
                    }
                    
                    // Then update backend
                    documentApi.updateFolder(documentId, folderId)
                      .catch((error) => {
                        console.error('Failed to move document to folder:', error)
                        alert('Failed to move file to folder')
                        // Revert optimistic update on error
                        if (onDocumentFolderChange) {
                          onDocumentFolderChange(documentId, currentFolder)
                        }
                      })
                  }
                }
              }
            }}
            style={{
              backgroundColor: 'transparent',
            }}
          >
            {item.children.map(child => renderFileItem(child, indentLevel + 1))}
            
            {/* End drop zone for project folder only - allows dropping at the end */}
            {item.id === 'project' && (
              <div
                onDragOver={(e) => {
                  if (draggedItemId) {
                    // Check if dragged item is from project folder
                    const projectFolder = fileTree.find(f => f.id === 'project')
                    const isFromProjectFolder = projectFolder?.children?.some(child => child.id === draggedItemId)
                    
                    if (isFromProjectFolder) {
                      e.preventDefault()
                      e.stopPropagation()
                      e.dataTransfer.dropEffect = 'move'
                      setDragOverEndZone(true)
                    }
                  }
                }}
                onDragLeave={(e) => {
                  const relatedTarget = e.relatedTarget as Node | null
                  if (!e.currentTarget.contains(relatedTarget)) {
                    setDragOverEndZone(false)
                  }
                }}
                onDrop={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  setDragOverEndZone(false)
                  
                  if (draggedItemId && onReorderDocuments) {
                    // Handle internal item reorder - move to end
                    // Get all files from the project folder
                    const projectFolder = fileTree.find(f => f.id === 'project')
                    if (projectFolder && projectFolder.children) {
                      const projectFiles = [...projectFolder.children]
                      const draggedIndex = projectFiles.findIndex(f => f.id === draggedItemId)
                      
                      if (draggedIndex !== -1) {
                        // Remove from current position and add to end
                        const newOrder = [...projectFiles]
                        const [draggedItem] = newOrder.splice(draggedIndex, 1)
                        newOrder.push(draggedItem)
                        
                        const documentIds = newOrder.map(f => f.id).filter(id => {
                          const fileItem = projectFiles.find(f => f.id === id)
                          return fileItem?.document
                        })
                        
                        onReorderDocuments(documentIds)
                      }
                    }
                  }
                  
                  setDraggedItemId(null)
                }}
                style={{
                  position: 'relative',
                  minHeight: '40px',
                  paddingLeft: '32px',
                  backgroundColor: dragOverEndZone ? hoverBg : 'transparent',
                  transition: 'background-color 0.15s',
                }}
              >
                {/* Drop indicator line at the top of end zone */}
                {dragOverEndZone && (
                  <div
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      right: 0,
                      height: '2px',
                      backgroundColor: indicatorColor,
                      zIndex: 1000,
                      pointerEvents: 'none',
                    }}
                  />
                )}
              </div>
            )}
          </div>
        )}
      </div>
    )
  }

  // Close context menu when clicking outside
  useEffect(() => {
    const handleClickOutside = () => {
      if (contextMenuPos) {
        setContextMenuPos(null)
      }
    }
    
    if (contextMenuPos) {
      document.addEventListener('click', handleClickOutside)
      return () => document.removeEventListener('click', handleClickOutside)
    }
  }, [contextMenuPos])

  // Upload progress indicator
  const uploadProgressIndicator = uploadProgress ? (
    <div
      style={{
        position: 'fixed',
        bottom: '20px',
        left: '50%',
        transform: 'translateX(-50%)',
        backgroundColor: theme === 'dark' ? '#1e1e1e' : '#ffffff',
        border: `1px solid ${theme === 'dark' ? '#333' : '#e0e0e0'}`,
        borderRadius: '8px',
        padding: '12px 20px',
        boxShadow: theme === 'dark'
          ? '0 8px 32px rgba(0, 0, 0, 0.5), 0 2px 8px rgba(0, 0, 0, 0.3)'
          : '0 8px 32px rgba(0, 0, 0, 0.2), 0 2px 8px rgba(0, 0, 0, 0.1)',
        zIndex: 10001,
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
        minWidth: '300px',
      }}
    >
      <div
        style={{
          width: '16px',
          height: '16px',
          border: `2px solid ${theme === 'dark' ? '#555' : '#ccc'}`,
          borderTopColor: theme === 'dark' ? '#858585' : '#666',
          borderRadius: '50%',
          animation: 'spin 1s linear infinite',
        }}
      />
      <div style={{ flex: 1 }}>
        <div
          style={{
            fontSize: '13px',
            fontWeight: '500',
            color: theme === 'dark' ? '#ffffff' : '#202124',
            marginBottom: '4px',
          }}
        >
          Uploading files... ({uploadProgress.current}/{uploadProgress.total})
        </div>
        <div
          style={{
            fontSize: '11px',
            color: theme === 'dark' ? '#999' : '#666',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
          title={uploadProgress.currentFile}
        >
          {uploadProgress.currentFile}
        </div>
      </div>
      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  ) : null

  // Render README.md as a standalone file item with outlined info icon
  const renderReadmeItem = () => {
    if (!readmeDoc) return null
    
    const isSelected = selectedId === readmeDoc.id
    const isRenaming = renamingId === readmeDoc.id
    const hasContextMenu = contextMenuPos && contextMenuPos.item.id === readmeDoc.id
    
    return (
      <div key={readmeDoc.id} style={{ position: 'relative', width: '100%', boxSizing: 'border-box', margin: 0, padding: 0 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            paddingLeft: '32px',
            paddingRight: '0px',
            paddingTop: '4px',
            paddingBottom: '4px',
            cursor: 'pointer',
            backgroundColor: isSelected ? selectedBg : 'transparent',
            color: '#818181',
            fontSize: '13px',
            fontFamily: '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Noto Sans SC", "Helvetica Neue", Arial, sans-serif',
            userSelect: 'none',
            minHeight: '22px',
            width: '100%',
            boxSizing: 'border-box',
            borderRadius: '0',
            marginLeft: '0',
            marginRight: '0',
            marginBottom: '0',
            border: hasContextMenu ? `1px solid ${theme === 'dark' ? '#555555' : '#909090'}` : '1px solid transparent',
          }}
          onClick={() => {
            setSelectedId(readmeDoc.id)
            onDocumentClick(readmeDoc.id)
          }}
          onDoubleClick={() => {
            if (onDocumentRename) {
              setRenamingId(readmeDoc.id)
              setRenameValue(readmeDoc.title)
            }
          }}
          onContextMenu={(e) => {
            e.preventDefault()
            const readmeItem: FileItem = {
              id: readmeDoc.id,
              name: readmeDoc.title,
              type: 'file',
              document: readmeDoc,
            }
            setContextMenuPos({ x: e.clientX, y: e.clientY, item: readmeItem })
          }}
          onMouseEnter={(e) => {
            if (!isSelected) {
              e.currentTarget.style.backgroundColor = hoverBg
            }
          }}
          onMouseLeave={(e) => {
            if (!isSelected) {
              e.currentTarget.style.backgroundColor = 'transparent'
            }
          }}
        >
          {/* File Name */}
          {isRenaming ? (
            <input
              type="text"
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onBlur={() => {
                if (renameValue.trim() && onDocumentRename) {
                  onDocumentRename(readmeDoc.id, renameValue.trim())
                }
                setRenamingId(null)
                setRenameValue('')
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  if (renameValue.trim() && onDocumentRename) {
                    onDocumentRename(readmeDoc.id, renameValue.trim())
                  }
                  setRenamingId(null)
                  setRenameValue('')
                } else if (e.key === 'Escape') {
                  setRenamingId(null)
                  setRenameValue('')
                }
              }}
              onClick={(e) => e.stopPropagation()}
              style={{
                width: 'auto',
                minWidth: '60px',
                maxWidth: 'calc(100% - 20px)',
                border: `1px solid ${selectedBg}`,
                borderRadius: '2px',
                padding: '2px 4px',
                fontSize: '13px',
                fontFamily: 'inherit',
                backgroundColor: bgColor,
                color: textColor,
                outline: 'none',
              }}
              autoFocus
            />
          ) : (
            <span
              style={{
                flex: 1,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {isSearchMode && searchQuery.trim() 
                ? highlightText(formatDisplayName(readmeDoc.title), searchQuery)
                : formatDisplayName(readmeDoc.title)}
            </span>
          )}
        </div>
      </div>
    )
  }

  // Render search UI
  const renderSearchUI = () => {
    const inputBorder = theme === 'dark' ? '#232323' : '#e0e0e0'
    const inputBg = theme === 'dark' ? '#1e1e1e' : '#ffffff'
    const inputTextColor = theme === 'dark' ? '#d6d6dd' : '#202124'
    const placeholderColor = theme === 'dark' ? '#858585' : '#9e9e9e'
    
    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        backgroundColor: bgColor
      }}>
        {/* Search input */}
        <div style={{ padding: '2px 12px 8px 12px' }}>
          <input
            ref={searchInputRef}
            type="text"
            value={searchQuery}
            onChange={(e) => {
              const newQuery = e.target.value
              setSearchQuery(newQuery)
              onSearchQueryChange?.(newQuery)
              // Update sessionStorage when user types/clears search
              try {
                if (newQuery.trim()) {
                  sessionStorage.setItem('searchQuery', newQuery)
                } else {
                  // User cleared the search - remove from sessionStorage but keep search mode on
                  sessionStorage.removeItem('searchQuery')
                }
              } catch (err) {
                console.warn('Failed to update search query in sessionStorage:', err)
              }
            }}
            placeholder=""
            style={{
              width: '100%',
              padding: '4px 8px',
              border: `1px solid ${inputBorder}`,
              borderRadius: '4px',
              backgroundColor: inputBg,
              color: inputTextColor,
              fontSize: '12px',
              fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
              outline: 'none',
              boxSizing: 'border-box',
              height: '28px'
            }}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                onSearchModeChange?.(false)
              }
            }}
          />
        </div>
        
        {/* Replace input */}
        <div style={{ padding: '0 12px 8px 12px', display: 'flex', gap: '4px', alignItems: 'flex-start' }}>
          <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0 }}>
            <label style={{
              fontSize: '11px',
              color: placeholderColor,
              marginBottom: '4px',
              paddingLeft: '0px',
              fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
              fontWeight: 500
            }}>
              Replace with
            </label>
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
              <input
                type="text"
                value={replaceQuery}
                onChange={(e) => setReplaceQuery(e.target.value)}
                placeholder=""
                style={{
                  width: '100%',
                  padding: '4px 32px 4px 8px',
                  border: `1px solid ${inputBorder}`,
                  borderRadius: '4px',
                  backgroundColor: inputBg,
                  color: inputTextColor,
                  fontSize: '12px',
                  fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
                  outline: 'none',
                  boxSizing: 'border-box',
                  height: '28px'
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    onSearchModeChange?.(false)
                  }
                }}
              />
              <button
                onClick={handleReplaceAll}
                disabled={!searchQuery.trim() || !replaceQuery.trim()}
                style={{
                  position: 'absolute',
                  right: '4px',
                  padding: '4px',
                  border: 'none',
                  backgroundColor: 'transparent',
                  color: (!searchQuery.trim() || !replaceQuery.trim())
                    ? placeholderColor
                    : inputTextColor,
                  cursor: (!searchQuery.trim() || !replaceQuery.trim()) ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '16px',
                  transition: 'color 0.15s',
                  width: '24px',
                  height: '24px'
                }}
                onMouseEnter={(e) => {
                  if (searchQuery.trim() && replaceQuery.trim()) {
                    e.currentTarget.style.color = theme === 'dark' ? '#6ba8c7' : '#5a9ec7'
                  }
                }}
                onMouseLeave={(e) => {
                  if (searchQuery.trim() && replaceQuery.trim()) {
                    e.currentTarget.style.color = inputTextColor
                  }
                }}
                title="Replace All"
              >
                <AutorenewIcon style={{ fontSize: '16px' }} />
              </button>
            </div>
          </div>
        </div>
        
        {/* Search results */}
        <div style={{
          flex: 1,
          overflowY: 'auto',
          padding: '4px 0'
        }}>
          {searchResults.length === 0 && searchQuery.trim() ? (
            <div style={{
              padding: '20px',
              textAlign: 'center',
              color: placeholderColor,
              fontSize: '12px'
            }}>
              No results found
            </div>
          ) : searchResults.length > 0 ? (
            searchResults.map((result) => {
              const isExpanded = expandedSearchFiles.has(result.documentId)
              const matchCount = result.matches.length
              
              const toggleFileExpansion = (e: React.MouseEvent) => {
                e.stopPropagation()
                setExpandedSearchFiles(prev => {
                  const newSet = new Set(prev)
                  if (newSet.has(result.documentId)) {
                    newSet.delete(result.documentId)
                  } else {
                    newSet.add(result.documentId)
                  }
                  return newSet
                })
              }
              
              const handleMatchClick = (e: React.MouseEvent, match: { line: string; index: number; charPosition: number }) => {
                e.stopPropagation()
                
                // Set flag to prevent auto-focus during navigation
                isNavigatingFromSearch.current = true
                
                onDocumentClick(result.documentId, searchQuery, match.charPosition)
                
                // Reset flag after navigation completes
                setTimeout(() => {
                  isNavigatingFromSearch.current = false
                }, 1000)
              }
              
              return (
                <div
                  key={result.documentId}
                  style={{
                    borderBottom: `1px solid ${inputBorder}`
                  }}
                >
                  {/* File header - collapsible folder style */}
                  <div
                    onClick={toggleFileExpansion}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      padding: '6px 12px',
                      cursor: 'pointer',
                      transition: 'background-color 0.15s',
                      userSelect: 'none'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = hoverBg
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = 'transparent'
                    }}
                  >
                    {/* Chevron arrow */}
                    <span
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        marginRight: '4px',
                        width: '16px',
                        height: '16px',
                        flexShrink: 0,
                      }}
                    >
                      {isExpanded ? (
                        <ExpandMoreIcon 
                          style={{ fontSize: '16px', color: textColor, cursor: 'pointer' }}
                        />
                      ) : (
                        <ChevronRightIcon 
                          style={{ fontSize: '16px', color: textColor, cursor: 'pointer' }}
                        />
                      )}
                    </span>
                    
                    {/* File name */}
                    <span
                      style={{
                        fontSize: '12px',
                        fontWeight: 500,
                        color: textColor,
                        flex: 1,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
                      }}
                    >
                      {highlightText(result.documentTitle, searchQuery)}
                    </span>
                    
                    {/* Match count badge */}
                    <span
                      style={{
                        fontSize: '11px',
                        fontWeight: 500,
                        color: theme === 'dark' ? '#4fc3f7' : '#1976d2',
                        backgroundColor: theme === 'dark' ? 'rgba(79, 195, 247, 0.15)' : 'rgba(25, 118, 210, 0.1)',
                        padding: '2px 6px',
                        borderRadius: '10px',
                        marginLeft: '8px',
                        flexShrink: 0,
                        fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
                      }}
                    >
                      {matchCount}
                    </span>
                  </div>
                  
                  {/* Individual search results - shown when expanded */}
                  {isExpanded && (
                    <div>
                      {result.matches.map((match, idx) => (
                        <div
                          key={idx}
                          onClick={(e) => handleMatchClick(e, match)}
                          style={{
                            padding: '4px 12px 4px 32px', // Indented under file name
                            fontSize: '11px',
                            color: placeholderColor,
                            fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
                            cursor: 'pointer',
                            transition: 'background-color 0.15s',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap'
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.backgroundColor = hoverBg
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.backgroundColor = 'transparent'
                          }}
                        >
                          {highlightText(match.line, searchQuery)}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })
          ) : null}
        </div>
      </div>
    )
  }

  return (
    <div
      className="scrollable-container no-gutter"
      style={{
        width: '100%',
        height: '100%',
        backgroundColor: bgColor,
        overflowY: 'auto',
        overflowX: 'hidden',
        padding: 0,
        margin: 0,
        boxSizing: 'border-box',
        position: 'relative',
      }}
      onClick={() => {
        // Only handle context menu closing if not in search mode
        // In search mode, let search results handle their own clicks
        if (!isSearchMode) {
          setContextMenuPos(null)
        }
      }}
    >
      {(() => {
        return isSearchMode ? (
          renderSearchUI()
        ) : (
          <>
            {/* Render README.md at the top */}
            {renderReadmeItem()}
            {fileTree.map(item => renderFileItem(item, 0))}
          </>
        )
      })()}
      
      {/* Context Menu */}
      {contextMenuPos && (
        <div
          style={{
            position: 'fixed',
            left: contextMenuPos.x,
            top: contextMenuPos.y,
            backgroundColor: dropdownBg,
            border: `1px solid ${dropdownBorder}`,
            borderRadius: '4px',
            boxShadow: theme === 'dark' ? '0 2px 10px rgba(0,0,0,0.5)' : '0 2px 10px rgba(0,0,0,0.15)',
            zIndex: 10000,
            minWidth: '140px',
            overflow: 'hidden',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Only show rename for files, not folders */}
          {contextMenuPos.item.type === 'file' && contextMenuPos.item.document && (
            <button
              onClick={(e) => {
                if (contextMenuPos.item.document) {
                  setRenamingId(contextMenuPos.item.id)
                  setRenameValue(contextMenuPos.item.name)
                }
                setContextMenuPos(null)
                // Blur the button to prevent focus outline flash
                e.currentTarget.blur()
              }}
            style={{
              width: '100%',
              padding: '8px 16px',
              border: 'none',
              background: 'transparent',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              fontSize: '13px',
              fontFamily: '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Noto Sans SC", "Helvetica Neue", Arial, sans-serif',
              color: dropdownTextColor,
              textAlign: 'left',
              transition: 'background-color 0.15s',
              outline: 'none',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = dropdownHoverBg
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent'
            }}
          >
            Rename
          </button>
          )}
          {(contextMenuPos.item.document || contextMenuPos.item.type === 'file') && onDocumentDelete && (
            <button
              onClick={(e) => {
                if (contextMenuPos.item.document && onDocumentDelete) {
                  onDocumentDelete(contextMenuPos.item.document.id)
                }
                setContextMenuPos(null)
                // Blur the button to prevent focus outline flash
                e.currentTarget.blur()
              }}
              style={{
                width: '100%',
                padding: '8px 16px',
                border: 'none',
                background: 'transparent',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
                gap: '8px',
                fontSize: '13px',
                fontFamily: '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Noto Sans SC", "Helvetica Neue", Arial, sans-serif',
                color: dropdownTextColor,
                textAlign: 'left',
                transition: 'background-color 0.15s',
                outline: 'none',
            }}
            onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = dropdownHoverBg
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent'
            }}
          >
              Delete
          </button>
          )}
        </div>
      )}

      {/* Upload progress indicator */}
      {uploadProgressIndicator}
    </div>
  )
}

export default memo(FileExplorer)

