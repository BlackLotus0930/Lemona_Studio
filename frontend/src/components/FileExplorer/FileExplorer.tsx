import { useState, useEffect } from 'react'
import { Document } from '@shared/types'
import { useTheme } from '../../contexts/ThemeContext'
// @ts-ignore
import ChevronRightIcon from '@mui/icons-material/ChevronRight'
// @ts-ignore
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
// @ts-ignore
import AddIcon from '@mui/icons-material/Add'

interface FileExplorerProps {
  documents: Document[]
  currentDocumentId?: string | null
  onDocumentClick: (docId: string) => void
  onDocumentRename?: (docId: string, newTitle: string) => void
  onDocumentDelete?: (docId: string) => void
  onReorderDocuments?: (documentIds: string[]) => void
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
}: FileExplorerProps) {
  const { theme } = useTheme()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [contextMenuPos, setContextMenuPos] = useState<{ x: number; y: number; item: FileItem } | null>(null)
  const [draggedItemId, setDraggedItemId] = useState<string | null>(null)
  const [dragOverItemId, setDragOverItemId] = useState<string | null>(null)

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

  // Show documents as flat list (no folders)
  const fileTree: FileItem[] = documents.map(doc => ({
        id: doc.id,
        name: doc.title,
        type: 'file' as const,
        document: doc,
  }))


  const handleItemClick = (item: FileItem) => {
    if (item.document) {
      setSelectedId(item.id)
      onDocumentClick(item.document.id)
    }
  }

  const handleDoubleClick = (item: FileItem) => {
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

  const renderFileItem = (item: FileItem): JSX.Element => {
    const isSelected = selectedId === item.id
    const isRenaming = renamingId === item.id

    return (
      <div key={item.id} style={{ position: 'relative', width: '100%', boxSizing: 'border-box', margin: 0, padding: 0 }}>
        <div
          draggable
          onDragStart={(e) => {
            setDraggedItemId(item.id)
            e.dataTransfer.effectAllowed = 'move'
          }}
          onDragOver={(e) => {
            e.preventDefault()
            e.dataTransfer.dropEffect = 'move'
            if (item.id !== draggedItemId) {
              setDragOverItemId(item.id)
            }
          }}
          onDragLeave={() => {
            setDragOverItemId(null)
          }}
          onDrop={(e) => {
            e.preventDefault()
            if (draggedItemId && draggedItemId !== item.id && onReorderDocuments) {
              const draggedIndex = fileTree.findIndex(f => f.id === draggedItemId)
              const dropIndex = fileTree.findIndex(f => f.id === item.id)
              
              if (draggedIndex !== -1 && dropIndex !== -1) {
                const newOrder = [...fileTree]
                const [draggedItem] = newOrder.splice(draggedIndex, 1)
                newOrder.splice(dropIndex, 0, draggedItem)
                
                const documentIds = newOrder.map(f => f.id).filter(id => {
                  const fileItem = fileTree.find(f => f.id === id)
                  return fileItem?.document
                })
                
                onReorderDocuments(documentIds)
              }
            }
            setDraggedItemId(null)
            setDragOverItemId(null)
          }}
          style={{
            display: 'flex',
            alignItems: 'center',
            paddingLeft: '20px', // Indent files to show they're within project
            paddingRight: '0px', // No right padding - full width to edge
            paddingTop: '4px',
            paddingBottom: '4px',
            cursor: 'pointer',
            backgroundColor: isSelected ? selectedBg : dragOverItemId === item.id ? hoverBg : 'transparent',
            color: textColor,
            fontSize: '13px',
            fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
            userSelect: 'none',
            minHeight: '22px',
            width: '100%', // Full width rectangle
            boxSizing: 'border-box', // Include padding in width
            borderRadius: '0', // No rounded corners for full-width rectangle
            marginLeft: '0', // No left margin - full width
            marginRight: '0', // No right margin - full width
            marginBottom: '0', // No gap - items touch each other
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
            if (!isSelected && dragOverItemId !== item.id) {
              e.currentTarget.style.backgroundColor = 'transparent'
              e.currentTarget.style.borderRadius = '0'
              e.currentTarget.style.marginRight = '0'
            }
          }}
        >
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
                flex: 1,
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
              {item.name}
            </span>
          )}

          </div>
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
      {fileTree.map(item => renderFileItem(item))}
      
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
          <button
            onClick={() => {
              if (contextMenuPos.item.document) {
                setRenamingId(contextMenuPos.item.id)
                setRenameValue(contextMenuPos.item.name)
              } else if (contextMenuPos.item.type === 'folder') {
                setRenamingId(contextMenuPos.item.id)
                setRenameValue(contextMenuPos.item.name)
              }
              setContextMenuPos(null)
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
              fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
              color: dropdownTextColor,
              textAlign: 'left',
              transition: 'background-color 0.15s',
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
          {(contextMenuPos.item.document || contextMenuPos.item.type === 'file') && onDocumentDelete && (
            <button
              onClick={() => {
                if (contextMenuPos.item.document && onDocumentDelete) {
                  onDocumentDelete(contextMenuPos.item.document.id)
                }
                setContextMenuPos(null)
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
                fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
                color: dropdownTextColor,
                textAlign: 'left',
                transition: 'background-color 0.15s',
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

