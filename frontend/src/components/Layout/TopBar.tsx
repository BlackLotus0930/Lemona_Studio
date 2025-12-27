import React from 'react'
import { useTheme } from '../../contexts/ThemeContext'
import './TopBar.css'
import Tab from './Tab'
import { Document } from '@shared/types'

// Check if running in Electron
const isElectron = typeof window !== 'undefined' && window.electron !== undefined

interface TopBarProps {
  onExport?: (format: 'pdf' | 'docx', filename?: string, documentIds?: string[], usePageBreaks?: boolean) => void
  documentTitle?: string
  documentId?: string
  onTitleUpdate?: (title: string) => void
  documents?: Document[]
  projectName?: string
  editor?: any
  onToggleFileExplorer?: () => void
  onToggleAIPanel?: () => void
  isSearchMode?: boolean
  onToggleSearch?: () => void
  openTabs?: Document[]
  activeTabId?: string | null
  onTabClick?: (docId: string) => void
  onTabClose?: (e: React.MouseEvent, docId: string) => void
  onTabReorder?: (draggedId: string, targetId: string, position: 'left' | 'right') => void
  onNewTab?: () => void
  onShareClick?: () => void
  shareButtonRef?: React.RefObject<HTMLButtonElement>
}

function TopBar({ 
  openTabs = [],
  activeTabId,
  onTabClick,
  onTabClose,
  onTabReorder
}: TopBarProps) {
  const { theme } = useTheme()
  const [draggedTabId, setDraggedTabId] = React.useState<string | null>(null)
  const [dropTargetId, setDropTargetId] = React.useState<string | null>(null)
  const [dropPosition, setDropPosition] = React.useState<'left' | 'right' | null>(null)

  const indicatorColor = theme === 'dark' ? '#999999' : '#c0c0c0' // Light grey color for drop indicator

  const handleDragStart = (_e: React.DragEvent, documentId: string) => {
    setDraggedTabId(documentId)
    setDropTargetId(null)
    setDropPosition(null)
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    // Allow drop on container
  }

  const handleTabDragOver = (e: React.DragEvent, targetDocumentId: string) => {
    e.preventDefault()
    e.stopPropagation()
    e.dataTransfer.dropEffect = 'move'
    
    if (draggedTabId && draggedTabId !== targetDocumentId) {
      // Calculate drop position based on mouse position within the tab
      const rect = e.currentTarget.getBoundingClientRect()
      const mouseX = e.clientX - rect.left
      const tabWidth = rect.width
      const dropSide = mouseX < tabWidth / 2 ? 'left' : 'right'
      
      setDropTargetId(targetDocumentId)
      setDropPosition(dropSide)
    }
  }

  const handleTabDragLeave = () => {
    setDropTargetId(null)
    setDropPosition(null)
  }

  const handleDrop = (e: React.DragEvent, targetDocumentId: string) => {
    e.preventDefault()
    e.stopPropagation()
    if (draggedTabId && draggedTabId !== targetDocumentId && onTabReorder && dropPosition) {
      onTabReorder(draggedTabId, targetDocumentId, dropPosition)
    }
    setDraggedTabId(null)
    setDropTargetId(null)
    setDropPosition(null)
  }

  const handleDragEnd = () => {
    setDraggedTabId(null)
    setDropTargetId(null)
    setDropPosition(null)
  }

  const handleMinimize = () => {
    if (isElectron && window.electron) {
      window.electron.invoke('window:minimize')
    }
  }

  const handleMaximize = () => {
    if (isElectron && window.electron) {
      window.electron.invoke('window:maximize')
    }
  }

  const handleClose = () => {
    if (isElectron && window.electron) {
      window.electron.invoke('window:close')
    }
  }

  return (
    <div className={`topbar ${theme === 'dark' ? 'topbar-dark' : 'topbar-light'}`}>
      <div className="topbar-content">
        {/* Logo */}
        <div className="topbar-logo">
          <img 
            src="/lemonalogo.png" 
            alt="Lemona" 
            className="logo-image"
          />
        </div>
        
        {/* Tab Bar - extends to near window controls */}
        <div className="topbar-menu" style={{
                display: 'flex',
          alignItems: 'center', // Center tabs vertically
          gap: 0,
          flex: 1, // Take up remaining space
          overflow: 'hidden',
          minWidth: 0,
          marginRight: '8px' // Add some space before window controls
        }}>
          {/* Tabs Container - Scrollable */}
              <div 
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 0,
                  width: '100%',
                  overflowX: 'auto',
                  overflowY: 'hidden',
                  minWidth: 0,
                  scrollbarWidth: 'none', // Firefox
                  msOverflowStyle: 'none', // IE/Edge
                  marginLeft: '8px' // Move tabs to the right
                }}
                onDragOver={handleDragOver}
              >
            {openTabs.map((tab, index) => (
              <Tab
                key={tab.id}
                documentId={tab.id}
                title={tab.title}
                isActive={activeTabId === tab.id}
                onClick={() => onTabClick?.(tab.id)}
                onClose={(e) => onTabClose?.(e, tab.id)}
                isFirst={index === 0}
                isLast={index === openTabs.length - 1}
                canClose={openTabs.length > 1} // Can only close if more than one tab
                onDragStart={(e) => handleDragStart(e, tab.id)}
                onDragOver={(e) => handleTabDragOver(e, tab.id)}
                onDragLeave={handleTabDragLeave}
                onDrop={(e) => handleDrop(e, tab.id)}
                onDragEnd={handleDragEnd}
                showDropIndicator={dropTargetId === tab.id && draggedTabId !== tab.id}
                dropPosition={dropTargetId === tab.id ? dropPosition : null}
                indicatorColor={indicatorColor}
              />
            ))}
              </div>
                </div>

        {/* Right side - Window controls */}
        <div className="topbar-right" style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
          flexShrink: 0, // Don't shrink, only take necessary space
          marginRight: '0px' // Move closer to right border
        }}>
          {/* Window controls on Windows/Linux */}
          {isElectron && window.electron && window.electron.platform !== 'darwin' && (
            <div className="window-controls">
              <button 
                className="window-control-btn minimize-btn"
                onClick={handleMinimize}
                title="Minimize"
              >
                <svg width="12" height="12" viewBox="0 0 12 12">
                  <rect x="0" y="5" width="12" height="0.75" fill="currentColor" />
                </svg>
              </button>
              <button 
                className="window-control-btn maximize-btn"
                onClick={handleMaximize}
                title="Maximize / Restore"
              >
                <svg width="12" height="12" viewBox="0 0 12 12">
                  <rect x="1" y="1" width="10" height="10" fill="none" stroke="currentColor" strokeWidth="0.75" />
                </svg>
              </button>
              <button 
                className="window-control-btn close-btn"
                onClick={handleClose}
                title="Close"
              >
                <svg width="12" height="12" viewBox="0 0 12 12">
                  <path d="M1 1 L11 11 M11 1 L1 11" stroke="currentColor" strokeWidth="0.75" strokeLinecap="round" />
                </svg>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default TopBar
