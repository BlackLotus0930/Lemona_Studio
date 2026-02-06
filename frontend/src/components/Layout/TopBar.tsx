import React from 'react'
import { useNavigate } from 'react-router-dom'
import { useTheme } from '../../contexts/ThemeContext'
import './TopBar.css'
import Tab from './Tab'
import logoImage from '../../assets/lemonalogo.png'
import KeyboardShortcutsModal from './KeyboardShortcutsModal'
// @ts-ignore
import SettingsIcon from '@mui/icons-material/Settings'
// @ts-ignore
import DarkModeIcon from '@mui/icons-material/DarkMode'
// @ts-ignore
import LightModeIcon from '@mui/icons-material/LightMode'
// @ts-ignore
import KeyboardIcon from '@mui/icons-material/Keyboard'

// Check if running in Electron
const isElectron = typeof window !== 'undefined' && window.electron !== undefined

interface TopBarProps {
  openTabs?: Array<{ id: string; title: string }>
  activeTabId?: string | null
  onTabClick?: (docId: string) => void
  onTabClose?: (e: React.MouseEvent, docId: string) => void
  onTabReorder?: (draggedId: string, targetId: string, position: 'left' | 'right') => void
}

function TopBar({ 
  openTabs = [],
  activeTabId,
  onTabClick,
  onTabClose,
  onTabReorder
}: TopBarProps) {
  const navigate = useNavigate()
  const { theme, toggleTheme } = useTheme()
  const [draggedTabId, setDraggedTabId] = React.useState<string | null>(null)
  const [dropTargetId, setDropTargetId] = React.useState<string | null>(null)
  const [dropPosition, setDropPosition] = React.useState<'left' | 'right' | null>(null)
  const isWindows = isElectron && window.electron?.platform === 'win32'
  const [showSettingsMenu, setShowSettingsMenu] = React.useState(false)
  const [showKeyboardShortcutsModal, setShowKeyboardShortcutsModal] = React.useState(false)
  const settingsButtonRef = React.useRef<HTMLButtonElement>(null)
  const settingsMenuRef = React.useRef<HTMLDivElement>(null)
  const keyboardShortcutsButtonRef = React.useRef<HTMLButtonElement>(null)

  const indicatorColor = theme === 'dark' ? '#999999' : '#c0c0c0' // Light grey color for drop indicator
  const dropdownBg = theme === 'dark' ? '#1f1f1f' : '#ffffff'
  const dropdownBorder = theme === 'dark' ? '#2f2f2f' : '#e0e0e0'
  const dropdownShadow = theme === 'dark'
    ? '0 12px 32px rgba(0, 0, 0, 0.6)'
    : '0 12px 32px rgba(0, 0, 0, 0.16)'
  const dropdownText = theme === 'dark' ? '#e0e0e0' : '#202124'
  const dropdownMuted = theme === 'dark' ? '#a0a0a0' : '#5f6368'
  const dropdownHover = theme === 'dark' ? '#2b2b2b' : '#f3f4f6'

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

  React.useEffect(() => {
    if (!showSettingsMenu) return

    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node
      if (settingsMenuRef.current?.contains(target) || settingsButtonRef.current?.contains(target)) {
        return
      }
      setShowSettingsMenu(false)
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [showSettingsMenu])

  return (
    <div className={`topbar ${theme === 'dark' ? 'topbar-dark' : 'topbar-light'} ${isWindows ? 'topbar-native-controls' : ''}`}>
      <div className="topbar-content">
        {/* Logo */}
        <div
          className="topbar-logo"
          onClick={() => navigate('/documents')}
          title="Home"
        >
          <img 
            src={logoImage} 
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
            {openTabs.map((tab, index) => {
              const nextTab = openTabs[index + 1]
              const nextTabIsActive = nextTab ? activeTabId === nextTab.id : false
              return (
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
                  nextTabIsActive={nextTabIsActive}
                />
              )
            })}
              </div>
                </div>

        <div className="topbar-right">
          <div style={{ position: 'relative' }}>
            <button
              ref={settingsButtonRef}
              className="window-control-btn settings-btn"
              title="Settings"
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                setShowSettingsMenu((prev) => !prev)
              }}
            >
              <SettingsIcon style={{ fontSize: '18px' }} />
            </button>
            {showSettingsMenu && (() => {
              const rect = settingsButtonRef.current?.getBoundingClientRect()
              return (
                <div
                  ref={settingsMenuRef}
                  style={{
                    position: 'fixed',
                    top: rect ? `${rect.bottom + 8}px` : '100%',
                    right: rect ? `${Math.max(8, window.innerWidth - rect.right)}px` : '8px',
                    backgroundColor: dropdownBg,
                    border: `1px solid ${dropdownBorder}`,
                    borderRadius: '10px',
                    boxShadow: dropdownShadow,
                    zIndex: 10020,
                    minWidth: '200px',
                    padding: '6px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '2px'
                  }}
                >
                  <button
                    ref={keyboardShortcutsButtonRef}
                    onClick={() => {
                      setShowKeyboardShortcutsModal(true)
                      setShowSettingsMenu(false)
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      width: '100%',
                      padding: '8px 10px',
                      border: 'none',
                      background: 'transparent',
                      color: dropdownText,
                      fontSize: '12px',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      textAlign: 'left'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = dropdownHover
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = 'transparent'
                    }}
                  >
                    <KeyboardIcon style={{ fontSize: '16px', color: dropdownMuted }} />
                    Keyboard shortcuts
                  </button>
                  <button
                    onClick={() => {
                      toggleTheme()
                      setShowSettingsMenu(false)
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      width: '100%',
                      padding: '8px 10px',
                      border: 'none',
                      background: 'transparent',
                      color: dropdownText,
                      fontSize: '12px',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      textAlign: 'left'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = dropdownHover
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = 'transparent'
                    }}
                  >
                    {theme === 'light' ? (
                      <DarkModeIcon style={{ fontSize: '16px', color: dropdownMuted }} />
                    ) : (
                      <LightModeIcon style={{ fontSize: '16px', color: dropdownMuted }} />
                    )}
                    Theme: {theme === 'light' ? 'Dark' : 'Light'}
                  </button>
                </div>
              )
            })()}
          </div>
          <KeyboardShortcutsModal
            isOpen={showKeyboardShortcutsModal}
            onClose={() => setShowKeyboardShortcutsModal(false)}
            triggerRef={settingsButtonRef}
          />
        </div>
      </div>
    </div>
  )
}

export default TopBar
