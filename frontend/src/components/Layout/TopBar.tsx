import React from 'react'
import { useTheme } from '../../contexts/ThemeContext'
import './TopBar.css'
import Tab from './Tab'
import { Document } from '@shared/types'

// Check if running in Electron
const isElectron = typeof window !== 'undefined' && window.electron !== undefined

interface TopBarProps {
  onExport?: (format: 'pdf' | 'docx', filename?: string, documentIds?: string[]) => void
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
  onNewTab?: () => void
  onShareClick?: () => void
  shareButtonRef?: React.RefObject<HTMLButtonElement>
}

export default function TopBar({ 
  openTabs = [],
  activeTabId,
  onTabClick,
  onTabClose
}: TopBarProps) {
  const { theme } = useTheme()

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
          <div style={{
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
          }}>
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
              />
            ))}
          </div>
        </div>
        
        {/* Right side - Window controls */}
        <div className="topbar-right" style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          flexShrink: 0 // Don't shrink, only take necessary space
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
                  <rect x="0" y="5" width="12" height="1" fill="currentColor" />
                </svg>
              </button>
              <button 
                className="window-control-btn maximize-btn"
                onClick={handleMaximize}
                title="Maximize / Restore"
              >
                <svg width="12" height="12" viewBox="0 0 12 12">
                  <rect x="1" y="1" width="10" height="10" fill="none" stroke="currentColor" strokeWidth="1" />
                </svg>
              </button>
              <button 
                className="window-control-btn close-btn"
                onClick={handleClose}
                title="Close"
              >
                <svg width="12" height="12" viewBox="0 0 12 12">
                  <path d="M1 1 L11 11 M11 1 L1 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
