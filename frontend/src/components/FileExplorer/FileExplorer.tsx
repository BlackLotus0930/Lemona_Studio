import { useState, useEffect } from 'react'
import { Document } from '@shared/types'
import { useTheme } from '../../contexts/ThemeContext'
import { documentApi } from '../../services/api'
// @ts-ignore
import ChevronRightIcon from '@mui/icons-material/ChevronRight'
// @ts-ignore
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
// @ts-ignore
import AddIcon from '@mui/icons-material/Add'
// @ts-ignore
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined'

interface FileExplorerProps {
  documents: Document[]
  currentDocumentId?: string | null
  onDocumentClick: (docId: string) => void
  onDocumentRename?: (docId: string, newTitle: string) => void
  onDocumentDelete?: (docId: string) => void
  onReorderDocuments?: (documentIds: string[]) => void
  projectName?: string // Project name for the ProjectName folder
  onSelectedFolderChange?: (folderId: 'library' | 'project' | null) => void // Callback when folder selection changes
  onFileUploaded?: (document: Document) => void // Callback when a file is uploaded
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
}: FileExplorerProps) {
  const { theme } = useTheme()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [_selectedFolderId, setSelectedFolderId] = useState<'library' | 'project' | null>(null)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [contextMenuPos, setContextMenuPos] = useState<{ x: number; y: number; item: FileItem } | null>(null)
  const [draggedItemId, setDraggedItemId] = useState<string | null>(null)
  const [dragOverItemId, setDragOverItemId] = useState<string | null>(null)
  const [dragOverFolderId, setDragOverFolderId] = useState<string | null>(null) // Track which folder is being dragged over
  const [dragOverFileItemId, setDragOverFileItemId] = useState<string | null>(null) // Track which file item is being dragged over for external files
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set(['library', 'project'])) // Default both folders expanded

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
      console.log('[FileExplorer] Selecting folder:', folderId, 'item.id:', item.id)
      setSelectedFolderId(folderId)
      setSelectedId(item.id) // Also set selectedId for visual feedback
      if (onSelectedFolderChange) {
        console.log('[FileExplorer] Calling onSelectedFolderChange with:', folderId)
        onSelectedFolderChange(folderId)
      }
    } else if (item.document) {
      setSelectedId(item.id)
      // Don't clear folder selection when selecting a file - keep it for creating new files
      // setSelectedFolderId(null) // Keep folder selection
      // if (onSelectedFolderChange) {
      //   onSelectedFolderChange(null)
      // }
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

  // Handle file drop on folder
  const handleFolderDrop = async (e: React.DragEvent, folderId: 'library' | 'project') => {
    e.preventDefault()
    e.stopPropagation()
    setDragOverFolderId(null)
    setDragOverFileItemId(null)

    const files = Array.from(e.dataTransfer.files)
    if (files.length === 0) return

    for (const file of files) {
      if (!isSupportedFileType(file.name)) {
        alert(`File type not supported: ${file.name}. Supported formats: .pdf, .png, .docx, .xlsx`)
        continue
      }

      try {
        // In Electron, when dragging from file system, file.path should be available
        const filePath = (file as any).path
        
        if (!filePath) {
          // If no path, try to read file and save temporarily
          // This handles files dragged from browser or other sources
          const arrayBuffer = await file.arrayBuffer()
          const uint8Array = new Uint8Array(arrayBuffer)
          
          // Use Electron IPC to save temp file
          if ((window as any).electron) {
            const tempPath = await (window as any).electron.invoke('file:saveTemp', Array.from(uint8Array), file.name)
            if (tempPath) {
              const document = await documentApi.uploadFile(tempPath, file.name, folderId)
              if (onFileUploaded) {
                onFileUploaded(document)
              }
            } else {
              throw new Error('Failed to save temporary file')
            }
          } else {
            throw new Error('File path not available and Electron API not accessible')
          }
        } else {
          // File has a path (dragged from file system)
          const document = await documentApi.uploadFile(filePath, file.name, folderId)
          
          if (onFileUploaded) {
            onFileUploaded(document)
          }
        }
      } catch (error) {
        console.error('Failed to upload file:', error)
        alert(`Failed to upload file: ${file.name}. ${error instanceof Error ? error.message : 'Unknown error'}`)
      }
    }
  }

  // Handle drag over folder
  const handleFolderDragOver = (e: React.DragEvent, folderId: string) => {
    e.preventDefault()
    e.stopPropagation()
    
    // Check if dragging files (not internal items)
    if (e.dataTransfer.types.includes('Files')) {
      setDragOverFolderId(folderId)
      e.dataTransfer.dropEffect = 'copy'
    }
  }

  // Handle drag leave folder
  const handleFolderDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragOverFolderId(null)
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

    return (
      <div key={item.id} style={{ position: 'relative', width: '100%', boxSizing: 'border-box', margin: 0, padding: 0 }}>
        <div
          draggable={!isFolder}
          onDragStart={(e) => {
            if (!isFolder) {
              setDraggedItemId(item.id)
              e.dataTransfer.effectAllowed = 'move'
            }
          }}
          onDragOver={(e) => {
            if (isFolder) {
              // Handle external file drag over folder
              handleFolderDragOver(e, item.id)
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
                e.dataTransfer.dropEffect = 'move'
                if (item.id !== draggedItemId) {
                  setDragOverItemId(item.id)
                }
              }
            }
          }}
          onDragLeave={(e) => {
            if (isFolder) {
              handleFolderDragLeave(e)
            } else {
              // Only clear drag over state if we're not moving to a child element
              const relatedTarget = e.relatedTarget as Node | null
              if (!e.currentTarget.contains(relatedTarget)) {
                setDragOverItemId(null)
                setDragOverFileItemId(null)
              }
            }
          }}
          onDrop={(e) => {
            e.preventDefault()
            e.stopPropagation()
            if (isFolder) {
              // Handle external file drop on folder
              const folderId = item.id === 'library' ? 'library' : 'project'
              handleFolderDrop(e, folderId)
            } else if (!isFolder) {
              // Check if dropping external files
              if (e.dataTransfer.types.includes('Files')) {
                // Handle external file drop on file item - add to same folder as the file item
                const folderId = getFolderIdForFileItem(item.id)
                if (folderId) {
                  handleFolderDrop(e, folderId)
                }
                setDragOverFileItemId(null)
              } else if (draggedItemId && draggedItemId !== item.id && onReorderDocuments) {
                // Handle internal item reorder
                const draggedItem = fileTree.flatMap(f => f.children || []).find(f => f.id === draggedItemId)
                const dropItem = fileTree.flatMap(f => f.children || []).find(f => f.id === item.id)
                
                if (draggedItem && dropItem) {
                  // Get all files from the same folder as drop target
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
            setDraggedItemId(null)
            setDragOverItemId(null)
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
              (isFolder && dragOverFolderId === item.id) ? hoverBg :
              (!isFolder && dragOverFileItemId === item.id) ? hoverBg :
              dragOverItemId === item.id ? hoverBg : 'transparent',
            color: itemTextColor,
            fontSize: '13px',
            fontFamily: '"Noto Sans SC", "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
            userSelect: 'none',
            minHeight: '22px',
            width: '100%',
            boxSizing: 'border-box',
            borderRadius: '0',
            marginLeft: '0',
            marginRight: '0',
            marginBottom: '0',
            opacity: draggedItemId === item.id ? 0.5 : 1,
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
        
        {/* Render children if folder is expanded */}
        {isFolder && isExpanded && item.children && (
          <div>
            {item.children.map(child => renderFileItem(child, indentLevel + 1))}
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

  // Render README.md as a standalone file item with outlined info icon
  const renderReadmeItem = () => {
    if (!readmeDoc) return null
    
    const isSelected = selectedId === readmeDoc.id
    const isRenaming = renamingId === readmeDoc.id
    
    return (
      <div key={readmeDoc.id} style={{ position: 'relative', width: '100%', boxSizing: 'border-box', margin: 0, padding: 0 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            paddingLeft: '12px',
            paddingRight: '0px',
            paddingTop: '4px',
            paddingBottom: '4px',
            cursor: 'pointer',
            backgroundColor: isSelected ? selectedBg : 'transparent',
            color: '#818181',
            fontSize: '13px',
            fontFamily: '"Noto Sans SC", "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
            userSelect: 'none',
            minHeight: '22px',
            width: '100%',
            boxSizing: 'border-box',
            borderRadius: '0',
            marginLeft: '0',
            marginRight: '0',
            marginBottom: '0',
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
          {/* Outlined Information icon */}
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
            <InfoOutlinedIcon 
              style={{ fontSize: '15px', color: '#818181', marginTop: '1px' }}
            />
          </span>
          
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
              {formatDisplayName(readmeDoc.title)}
            </span>
          )}
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
      onClick={() => setContextMenuPos(null)}
    >
      {/* Render README.md at the top */}
      {renderReadmeItem()}
      {fileTree.map(item => renderFileItem(item, 0))}
      
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
              fontFamily: '"Noto Sans SC", "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
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
                fontFamily: '"Noto Sans SC", "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
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
    </div>
  )
}

export default FileExplorer

