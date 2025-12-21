import { useState, useEffect, useRef } from 'react'
import { useTheme } from '../../contexts/ThemeContext'
import './TopBar.css'
// @ts-ignore
import CheckBoxIcon from '@mui/icons-material/CheckBox'
// @ts-ignore
import CheckBoxOutlineBlankIcon from '@mui/icons-material/CheckBoxOutlineBlank'
import { Document } from '@shared/types'
import { Editor } from '@tiptap/react'

// Check if running in Electron
const isElectron = typeof window !== 'undefined' && window.electron !== undefined

interface MenuItemProps {
  label: string
  shortcut?: string
  onClick: () => void
  disabled?: boolean
  active?: boolean
  theme: 'dark' | 'light'
  dropdownHoverBg: string
  dropdownTextColor: string
}

function MenuItem({ label, shortcut, onClick, disabled = false, active = false, theme, dropdownHoverBg, dropdownTextColor }: MenuItemProps) {
  return (
    <div
      onClick={(e) => {
        e.preventDefault()
        e.stopPropagation()
        console.log('MenuItem clicked:', label, 'disabled:', disabled, 'onClick:', onClick)
        if (!disabled) {
          onClick()
        } else {
          console.log('MenuItem is disabled, not calling onClick')
        }
      }}
      style={{
        padding: '6px 12px',
        cursor: disabled ? 'not-allowed' : 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: active ? dropdownHoverBg : 'transparent',
        opacity: disabled ? 0.5 : 1,
        borderRadius: '4px',
        transition: 'background-color 0.15s',
        userSelect: 'none'
      }}
      onMouseEnter={(e) => {
        if (!disabled) {
          e.currentTarget.style.backgroundColor = dropdownHoverBg
        }
      }}
      onMouseLeave={(e) => {
        if (!active) {
          e.currentTarget.style.backgroundColor = 'transparent'
        }
      }}
    >
      <span style={{
        fontSize: '13px',
        color: dropdownTextColor,
        fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
        fontWeight: active ? 500 : 400
      }}>
        {label}
      </span>
      {shortcut && (
        <span style={{
          fontSize: '11px',
          color: theme === 'dark' ? '#858585' : '#5f6368',
          fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
          marginLeft: '24px'
        }}>
          {shortcut}
        </span>
      )}
    </div>
  )
}

interface TopBarProps {
  onExport?: (format: 'pdf' | 'docx', filename?: string, documentIds?: string[]) => void
  documentTitle?: string
  documentId?: string
  onTitleUpdate?: (title: string) => void
  documents?: Document[]
  projectName?: string
  editor?: Editor | null
  onToggleFileExplorer?: () => void
  onToggleAIPanel?: () => void
  isSearchMode?: boolean
  onToggleSearch?: () => void
}

export default function TopBar({ 
  onExport, 
  documentTitle, 
  documentId: _documentId, 
  onTitleUpdate: _onTitleUpdate, 
  documents = [], 
  projectName = 'LEMONA',
  editor = null,
  onToggleFileExplorer,
  onToggleAIPanel,
  isSearchMode = false,
  onToggleSearch
}: TopBarProps) {
  const { theme, toggleTheme } = useTheme()
  const [showShareMenu, setShowShareMenu] = useState(false)
  const [showFileDropdown, setShowFileDropdown] = useState(false)
  const [downloadFilename, setDownloadFilename] = useState(projectName)
  const [selectedDocumentIds, setSelectedDocumentIds] = useState<Set<string>>(new Set())
  const [openMenu, setOpenMenu] = useState<string | null>(null)
  const fileMenuRef = useRef<HTMLButtonElement>(null)
  const shareMenuRef = useRef<HTMLDivElement>(null)
  const fileDropdownRef = useRef<HTMLDivElement>(null)
  const fileSelectButtonRef = useRef<HTMLButtonElement>(null)
  const editMenuRef = useRef<HTMLButtonElement>(null)
  const formatMenuRef = useRef<HTMLButtonElement>(null)
  const viewMenuRef = useRef<HTMLButtonElement>(null)
  const insertMenuRef = useRef<HTMLButtonElement>(null)
  const toolsMenuRef = useRef<HTMLButtonElement>(null)
  const helpMenuRef = useRef<HTMLButtonElement>(null)

  // Filter documents: only show workspace files (folder === 'project' or undefined/null)
  // This matches the logic in FileExplorer.tsx
  const workspaceDocuments = documents
    .filter(doc => (!doc.folder || doc.folder === 'project') && doc.title !== 'README.md' && doc.title.toLowerCase() !== 'readme.md')
    .sort((a, b) => {
      // Sort by order field if available, otherwise by creation date
      if (a.order !== undefined && b.order !== undefined) {
        return a.order - b.order
      }
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    })

  // Initialize selection with all files by default
  useEffect(() => {
    if (workspaceDocuments.length > 0) {
      setSelectedDocumentIds(new Set(workspaceDocuments.map((doc: Document) => doc.id)))
    }
  }, [workspaceDocuments.length])

  // Select All / Deselect All
  const handleSelectAll = () => {
    if (selectedDocumentIds.size === workspaceDocuments.length) {
      setSelectedDocumentIds(new Set())
    } else {
      setSelectedDocumentIds(new Set(workspaceDocuments.map((doc: Document) => doc.id)))
    }
  }

  // Toggle individual document selection
  const handleToggleDocument = (docId: string) => {
    const newSelection = new Set(selectedDocumentIds)
    if (newSelection.has(docId)) {
      newSelection.delete(docId)
    } else {
      newSelection.add(docId)
    }
    setSelectedDocumentIds(newSelection)
  }

  // Update filename when project name changes
  useEffect(() => {
    if (projectName) {
      setDownloadFilename(projectName)
    }
  }, [projectName])

  // Update filename when user types
  const handleFilenameChange = (newFilename: string) => {
    setDownloadFilename(newFilename)
  }

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node
      const menuRefs = [
        shareMenuRef.current,
        fileMenuRef.current,
        editMenuRef.current,
        formatMenuRef.current,
        viewMenuRef.current,
        insertMenuRef.current,
        toolsMenuRef.current,
        helpMenuRef.current
      ]
      
      const isClickInside = menuRefs.some(ref => ref && ref.contains(target))
      
      if (!isClickInside) {
        setShowShareMenu(false)
        setOpenMenu(null)
      }
    }

    if (showShareMenu || openMenu) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [showShareMenu, openMenu])
  
  const menuItems = [
    'File',
    'Edit',
    'View',
    'Format',
    'Insert',
    'Tools',
    'Help'
  ]

  const handleMenuClick = (menuName: string) => {
    if (menuName === 'File') {
      const newState = !showShareMenu
      setShowShareMenu(newState)
      setShowFileDropdown(false)
      setOpenMenu(newState ? 'File' : null)
      // Reset filename to document title when opening menu
      if (newState && documentTitle) {
        setDownloadFilename(documentTitle)
      }
      // Initialize selection with all files by default
      if (newState && workspaceDocuments.length > 0) {
        setSelectedDocumentIds(new Set(workspaceDocuments.map(doc => doc.id)))
      }
    } else {
      setOpenMenu(openMenu === menuName ? null : menuName)
      setShowShareMenu(false)
      setShowFileDropdown(false)
    }
  }

  // Get display text for file selection dropdown
  const getFileSelectionText = () => {
    if (selectedDocumentIds.size === 0) {
      return 'Select files'
    } else if (selectedDocumentIds.size === workspaceDocuments.length) {
      return `All files (${workspaceDocuments.length})`
    } else {
      return `${selectedDocumentIds.size} file${selectedDocumentIds.size > 1 ? 's' : ''} selected`
    }
  }

  const handleExport = (format: 'pdf' | 'docx') => {
    if (!onExport || selectedDocumentIds.size === 0) return
    
    const selectedIds = Array.from(selectedDocumentIds)
    setShowShareMenu(false)
    onExport(format, downloadFilename, selectedIds)
  }

  const dropdownBg = theme === 'dark' ? '#141414' : '#ffffff'
  const dropdownBorder = '#212121' // Fixed border color
  const dropdownTextColor = theme === 'dark' ? '#D6D6DD' : '#202124'
  const dropdownHoverBg = theme === 'dark' ? '#1f1f1f' : '#f5f5f5'
  const brandBlue = theme === 'dark' ? '#6ba8c7' : '#5a9ec7' // Soft, sophisticated blue
  const separatorColor = '#212121' // Fixed separator line color

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
        
        {/* Menu Items */}
        <div className="topbar-menu">
          {menuItems.map((item) => {
            const isSelected = openMenu === item || (item === 'File' && showShareMenu)
            let menuRef: React.RefObject<HTMLButtonElement> | null = null
            if (item === 'File') menuRef = fileMenuRef
            else if (item === 'Edit') menuRef = editMenuRef
            else if (item === 'View') menuRef = viewMenuRef
            else if (item === 'Format') menuRef = formatMenuRef
            else if (item === 'Insert') menuRef = insertMenuRef
            else if (item === 'Tools') menuRef = toolsMenuRef
            else if (item === 'Help') menuRef = helpMenuRef
            
            return (
              <button
                key={item}
                ref={menuRef}
                className="menu-item"
                onClick={() => handleMenuClick(item)}
                style={isSelected ? {
                  backgroundColor: theme === 'dark' ? '#252525' : '#eaebee',
                  color: theme === 'dark' ? '#d6d6dd' : '#5f6368'
                } : undefined}
              >
                {item}
              </button>
            )
          })}
        </div>
        
        {/* Professional Export Modal */}
        {showShareMenu && (() => {
          const rect = fileMenuRef.current?.getBoundingClientRect()
          const isAllSelected = workspaceDocuments.length > 0 && selectedDocumentIds.size === workspaceDocuments.length
          const hasSelection = selectedDocumentIds.size > 0
          
          return (
            <div 
              ref={shareMenuRef}
              style={{
                position: 'fixed',
                top: rect ? `${rect.bottom + 4}px` : '100%',
                left: rect ? `${rect.left}px` : 0,
                backgroundColor: dropdownBg,
                border: `1px solid ${dropdownBorder}`,
                borderRadius: '12px',
                boxShadow: theme === 'dark' ? '0 8px 24px rgba(0,0,0,0.6)' : '0 8px 24px rgba(0,0,0,0.15)',
                zIndex: 10010,
                width: '380px',
                maxHeight: '600px',
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden'
              }}
            >
              {/* Header */}
              <div style={{
                padding: '16px 20px',
                borderBottom: `1px solid ${dropdownBorder}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between'
              }}>
                <h3 style={{
                  margin: 0,
                  fontSize: '15px',
                  fontWeight: 600,
                  color: dropdownTextColor,
                  fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
                }}>
                  Export Files
                </h3>
              </div>

              {/* Content */}
              <div style={{
                padding: '20px',
                display: 'flex',
                flexDirection: 'column',
                gap: '16px'
              }}>
                {/* Filename Input */}
                <div>
                  <label style={{ 
                    display: 'block', 
                    fontSize: '13px', 
                    color: theme === 'dark' ? '#858585' : '#5f6368', 
                    marginBottom: '8px',
                    fontWeight: 500,
                    fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
                  }}>
                    Filename
                  </label>
                  <input
                    type="text"
                    value={downloadFilename}
                    onChange={(e) => handleFilenameChange(e.target.value)}
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={(e) => e.stopPropagation()}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        e.stopPropagation()
                        e.currentTarget.blur()
                      }
                    }}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      border: `1px solid ${dropdownBorder}`,
                      borderRadius: '6px',
                      fontSize: '14px',
                      color: dropdownTextColor,
                      backgroundColor: dropdownBg,
                      outline: 'none',
                      fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
                      transition: 'border-color 0.15s, box-shadow 0.15s'
                    }}
                    onFocus={(e) => {
                      e.target.style.borderColor = brandBlue
                      e.target.style.boxShadow = `0 0 0 3px ${brandBlue}${theme === 'dark' ? '20' : '15'}`
                    }}
                    onBlur={(e) => {
                      e.target.style.borderColor = dropdownBorder
                      e.target.style.boxShadow = 'none'
                    }}
                    placeholder="Enter export filename"
                  />
                </div>

                {/* Select Files Dropdown */}
                <div style={{ position: 'relative' }}>
                  <label style={{ 
                    display: 'block', 
                    fontSize: '13px', 
                    color: theme === 'dark' ? '#858585' : '#5f6368', 
                    marginBottom: '8px',
                    fontWeight: 500,
                    fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
                  }}>
                    Select files
                  </label>
                  <button
                    ref={fileSelectButtonRef}
                    onClick={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      setShowFileDropdown(!showFileDropdown)
                    }}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      border: `1px solid ${dropdownBorder}`,
                      borderRadius: '6px',
                      fontSize: '14px',
                      color: dropdownTextColor,
                      backgroundColor: dropdownBg,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
                      transition: 'border-color 0.15s, box-shadow 0.15s',
                      textAlign: 'left'
                    }}
                    onFocus={(e) => {
                      e.currentTarget.style.borderColor = brandBlue
                      e.currentTarget.style.boxShadow = `0 0 0 3px ${brandBlue}${theme === 'dark' ? '20' : '15'}`
                    }}
                    onBlur={(e) => {
                      e.currentTarget.style.borderColor = dropdownBorder
                      e.currentTarget.style.boxShadow = 'none'
                    }}
                  >
                    <span>{getFileSelectionText()}</span>
                    <svg 
                      width="12" 
                      height="12" 
                      viewBox="0 0 12 12" 
                      fill="none" 
                      style={{ 
                        transform: showFileDropdown ? 'rotate(180deg)' : 'rotate(0deg)',
                        transition: 'transform 0.2s'
                      }}
                    >
                      <path 
                        d="M3 4.5L6 7.5L9 4.5" 
                        stroke={theme === 'dark' ? '#858585' : '#5f6368'} 
                        strokeWidth="1.5" 
                        strokeLinecap="round" 
                        strokeLinejoin="round"
                      />
                    </svg>
                  </button>

                  {/* Dropdown Menu */}
                  {showFileDropdown && workspaceDocuments.length > 0 && (() => {
                    const buttonRect = fileSelectButtonRef.current?.getBoundingClientRect()
                    return (
                      <div
                        ref={fileDropdownRef}
                        style={{
                          position: 'fixed',
                          top: buttonRect ? `${buttonRect.bottom + 4}px` : '100%',
                          left: buttonRect ? `${buttonRect.left}px` : 0,
                          width: buttonRect ? `${buttonRect.width}px` : '100%',
                          backgroundColor: dropdownBg,
                          border: `1px solid ${dropdownBorder}`,
                          borderRadius: '6px',
                          boxShadow: theme === 'dark' ? '0 4px 12px rgba(0,0,0,0.4)' : '0 4px 12px rgba(0,0,0,0.15)',
                          zIndex: 10030,
                          maxHeight: '300px',
                          overflowY: 'auto',
                          display: 'flex',
                          flexDirection: 'column'
                        }}
                      >
                      {/* Select All */}
                      <div
                        onClick={(e) => {
                          e.preventDefault()
                          e.stopPropagation()
                          handleSelectAll()
                        }}
                        style={{
                          padding: '6px 12px',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                          backgroundColor: 'transparent',
                          transition: 'background-color 0.15s'
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.backgroundColor = dropdownHoverBg
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.backgroundColor = 'transparent'
                        }}
                      >
                        {isAllSelected ? (
                          <CheckBoxIcon className="thin-checkbox" style={{ 
                            fontSize: '16px', 
                            color: theme === 'dark' ? '#6ba8c7' : '#5a9ec7'
                          }} />
                        ) : (
                          <CheckBoxOutlineBlankIcon className="thin-checkbox" style={{ 
                            fontSize: '16px', 
                            color: dropdownTextColor, 
                            opacity: 0.6
                          }} />
                        )}
                        <span style={{
                          fontSize: '13px',
                          fontWeight: 500,
                          color: dropdownTextColor,
                          fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
                          userSelect: 'none'
                        }}>
                          Select All
                        </span>
                      </div>

                      {/* Individual Files */}
                      {workspaceDocuments.map((doc: Document) => {
                        const isSelected = selectedDocumentIds.has(doc.id)
                        return (
                          <div
                            key={doc.id}
                            onClick={(e) => {
                              e.preventDefault()
                              e.stopPropagation()
                              handleToggleDocument(doc.id)
                            }}
                            style={{
                              padding: '10px 12px',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '10px',
                              backgroundColor: 'transparent',
                              transition: 'background-color 0.15s'
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.backgroundColor = dropdownHoverBg
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.backgroundColor = 'transparent'
                            }}
                          >
                            {isSelected ? (
                              <CheckBoxIcon className="thin-checkbox" data-selected="true" style={{ 
                                fontSize: '18px', 
                                color: brandBlue
                              }} />
                            ) : (
                              <CheckBoxOutlineBlankIcon className="thin-checkbox" style={{ 
                                fontSize: '18px', 
                                color: dropdownTextColor, 
                                opacity: 0.3
                              }} />
                            )}
                            <span style={{
                              fontSize: '14px',
                              color: dropdownTextColor,
                              fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
                              flex: 1,
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                              userSelect: 'none'
                            }}>
                              {doc.title}
                            </span>
                            {doc.order !== undefined && (
                              <span style={{
                                fontSize: '11px',
                                color: theme === 'dark' ? '#858585' : '#5f6368',
                                fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
                                opacity: 0.7
                              }}>
                                #{doc.order + 1}
                              </span>
                            )}
                          </div>
                        )
                      })}
                      </div>
                    )
                  })()}
                </div>

                {workspaceDocuments.length === 0 && (
                  <div style={{
                    padding: '20px',
                    textAlign: 'center',
                    color: theme === 'dark' ? '#858585' : '#5f6368',
                    fontSize: '13px',
                    fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
                  }}>
                    No workspace files available
                  </div>
                )}

                {/* Info text */}
                <div style={{
                  fontSize: '12px',
                  color: theme === 'dark' ? '#858585' : '#5f6368',
                  fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
                  padding: '8px 12px',
                  backgroundColor: theme === 'dark' ? '#1e1e1e' : '#f5f5f5',
                  borderRadius: '6px'
                }}>
                  {selectedDocumentIds.size === 1 
                    ? '1 file will be exported'
                    : `${selectedDocumentIds.size} files will be merged into one document`
                  }
                </div>

                {/* Export Buttons */}
                <div style={{
                  display: 'flex',
                  flexDirection: 'row',
                  gap: '8px',
                  paddingTop: '4px'
                }}>
                  <button
                    onClick={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      handleExport('pdf')
                      setShowFileDropdown(false)
                    }}
                    disabled={!hasSelection || !onExport}
                    style={{
                      flex: 1,
                      padding: '10px 16px',
                      border: 'none',
                      borderRadius: '6px',
                      backgroundColor: hasSelection && onExport 
                        ? (theme === 'dark' ? '#d9779f' : '#e8a5b8') // Soft muted rose
                        : (theme === 'dark' ? '#3e3e42' : '#e0e0e0'),
                      color: hasSelection && onExport ? '#ffffff' : (theme === 'dark' ? '#858585' : '#9e9e9e'),
                      cursor: hasSelection && onExport ? 'pointer' : 'not-allowed',
                      fontSize: '13px',
                      fontWeight: 500,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
                      transition: 'background-color 0.2s ease, transform 0.15s ease',
                      boxShadow: hasSelection && onExport 
                        ? (theme === 'dark' ? '0 1px 3px rgba(217, 119, 159, 0.2)' : '0 1px 3px rgba(232, 165, 184, 0.2)')
                        : 'none'
                    }}
                    onMouseEnter={(e) => {
                      if (hasSelection && onExport) {
                        e.currentTarget.style.backgroundColor = theme === 'dark' ? '#c9688a' : '#e095ab'
                        e.currentTarget.style.transform = 'translateY(-1px)'
                        e.currentTarget.style.boxShadow = theme === 'dark' 
                          ? '0 2px 6px rgba(217, 119, 159, 0.3)' 
                          : '0 2px 6px rgba(232, 165, 184, 0.3)'
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (hasSelection && onExport) {
                        e.currentTarget.style.backgroundColor = theme === 'dark' ? '#d9779f' : '#e8a5b8'
                        e.currentTarget.style.transform = 'translateY(0)'
                        e.currentTarget.style.boxShadow = theme === 'dark' 
                          ? '0 1px 3px rgba(217, 119, 159, 0.2)' 
                          : '0 1px 3px rgba(232, 165, 184, 0.2)'
                      }
                    }}
                  >
                    PDF
                  </button>
                  <button
                    onClick={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      handleExport('docx')
                      setShowFileDropdown(false)
                    }}
                    disabled={!hasSelection || !onExport}
                    style={{
                      flex: 1,
                      padding: '10px 16px',
                      border: 'none',
                      borderRadius: '6px',
                      backgroundColor: hasSelection && onExport 
                        ? (theme === 'dark' ? '#7bb3d9' : '#8fc4e8') // Soft muted sky blue
                        : (theme === 'dark' ? '#3e3e42' : '#e0e0e0'),
                      color: hasSelection && onExport ? '#ffffff' : (theme === 'dark' ? '#858585' : '#9e9e9e'),
                      cursor: hasSelection && onExport ? 'pointer' : 'not-allowed',
                      fontSize: '13px',
                      fontWeight: 500,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
                      transition: 'background-color 0.2s ease, transform 0.15s ease',
                      boxShadow: hasSelection && onExport 
                        ? (theme === 'dark' ? '0 1px 3px rgba(123, 179, 217, 0.2)' : '0 1px 3px rgba(143, 196, 232, 0.2)')
                        : 'none'
                    }}
                    onMouseEnter={(e) => {
                      if (hasSelection && onExport) {
                        e.currentTarget.style.backgroundColor = theme === 'dark' ? '#6ba5c9' : '#7fb8de'
                        e.currentTarget.style.transform = 'translateY(-1px)'
                        e.currentTarget.style.boxShadow = theme === 'dark' 
                          ? '0 2px 6px rgba(123, 179, 217, 0.3)' 
                          : '0 2px 6px rgba(143, 196, 232, 0.3)'
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (hasSelection && onExport) {
                        e.currentTarget.style.backgroundColor = theme === 'dark' ? '#7bb3d9' : '#8fc4e8'
                        e.currentTarget.style.transform = 'translateY(0)'
                        e.currentTarget.style.boxShadow = theme === 'dark' 
                          ? '0 1px 3px rgba(123, 179, 217, 0.2)' 
                          : '0 1px 3px rgba(143, 196, 232, 0.2)'
                      }
                    }}
                  >
                    DOCX
                  </button>
                </div>
              </div>
            </div>
          )
        })()}

        {/* Edit Menu */}
        {openMenu === 'Edit' && editMenuRef.current && (() => {
          const rect = editMenuRef.current?.getBoundingClientRect()
          return (
            <div 
              style={{
                position: 'fixed',
                top: rect ? `${rect.bottom + 4}px` : '100%',
                left: rect ? `${rect.left}px` : 0,
                backgroundColor: dropdownBg,
                border: `1px solid ${dropdownBorder}`,
                borderRadius: '8px',
                boxShadow: theme === 'dark' ? '0 8px 24px rgba(0,0,0,0.6)' : '0 8px 24px rgba(0,0,0,0.15)',
                zIndex: 10010,
                minWidth: '200px',
                padding: '4px',
                display: 'flex',
                flexDirection: 'column'
              }}
            >
              <MenuItem 
                label="Undo" 
                shortcut="Ctrl+Z"
                onClick={() => {
                  editor?.chain().focus().undo().run()
                  setOpenMenu(null)
                }}
                disabled={!editor?.can().undo()}
                theme={theme}
                dropdownHoverBg={dropdownHoverBg}
                dropdownTextColor={dropdownTextColor}
              />
              <MenuItem 
                label="Redo" 
                shortcut="Ctrl+Shift+Z"
                onClick={() => {
                  editor?.chain().focus().redo().run()
                  setOpenMenu(null)
                }}
                disabled={!editor?.can().redo()}
                theme={theme}
                dropdownHoverBg={dropdownHoverBg}
                dropdownTextColor={dropdownTextColor}
              />
              <div style={{ height: '1px', backgroundColor: separatorColor, margin: '4px 0', marginLeft: '-4px', marginRight: '-4px', width: 'calc(100% + 8px)' }} />
              <MenuItem 
                label="Cut" 
                shortcut="Ctrl+X"
                onClick={() => {
                  document.execCommand('cut')
                  setOpenMenu(null)
                }}
                theme={theme}
                dropdownHoverBg={dropdownHoverBg}
                dropdownTextColor={dropdownTextColor}
              />
              <MenuItem 
                label="Copy" 
                shortcut="Ctrl+C"
                onClick={() => {
                  document.execCommand('copy')
                  setOpenMenu(null)
                }}
                theme={theme}
                dropdownHoverBg={dropdownHoverBg}
                dropdownTextColor={dropdownTextColor}
              />
              <MenuItem 
                label="Paste" 
                shortcut="Ctrl+V"
                onClick={() => {
                  // Paste is handled by browser default behavior
                  editor?.chain().focus().run()
                  setOpenMenu(null)
                }}
                disabled={!editor}
                theme={theme}
                dropdownHoverBg={dropdownHoverBg}
                dropdownTextColor={dropdownTextColor}
              />
              <div style={{ height: '1px', backgroundColor: separatorColor, margin: '4px 0', marginLeft: '-4px', marginRight: '-4px', width: 'calc(100% + 8px)' }} />
              <MenuItem 
                label="Select All" 
                shortcut="Ctrl+A"
                onClick={() => {
                  editor?.chain().focus().selectAll().run()
                  setOpenMenu(null)
                }}
                disabled={!editor}
                theme={theme}
                dropdownHoverBg={dropdownHoverBg}
                dropdownTextColor={dropdownTextColor}
              />
            </div>
          )
        })()}

        {/* View Menu */}
        {openMenu === 'View' && viewMenuRef.current && (() => {
          const rect = viewMenuRef.current?.getBoundingClientRect()
          return (
            <div 
              style={{
                position: 'fixed',
                top: rect ? `${rect.bottom + 4}px` : '100%',
                left: rect ? `${rect.left}px` : 0,
                backgroundColor: dropdownBg,
                border: `1px solid ${dropdownBorder}`,
                borderRadius: '8px',
                boxShadow: theme === 'dark' ? '0 8px 24px rgba(0,0,0,0.6)' : '0 8px 24px rgba(0,0,0,0.15)',
                zIndex: 10010,
                minWidth: '220px',
                padding: '4px',
                display: 'flex',
                flexDirection: 'column'
              }}
            >
              <MenuItem 
                label={theme === 'dark' ? 'Light Mode' : 'Dark Mode'}
                onClick={() => {
                  toggleTheme()
                  setOpenMenu(null)
                }}
                theme={theme}
                dropdownHoverBg={dropdownHoverBg}
                dropdownTextColor={dropdownTextColor}
              />
              <div style={{ height: '1px', backgroundColor: separatorColor, margin: '4px 0', marginLeft: '-4px', marginRight: '-4px', width: 'calc(100% + 8px)' }} />
              <MenuItem 
                label="File Explorer"
                shortcut="Ctrl+Shift+E"
                onClick={() => {
                  onToggleFileExplorer?.()
                  setOpenMenu(null)
                }}
                theme={theme}
                dropdownHoverBg={dropdownHoverBg}
                dropdownTextColor={dropdownTextColor}
              />
              <MenuItem 
                label="AI Assistant"
                onClick={() => {
                  onToggleAIPanel?.()
                  setOpenMenu(null)
                }}
                theme={theme}
                dropdownHoverBg={dropdownHoverBg}
                dropdownTextColor={dropdownTextColor}
              />
            </div>
          )
        })()}

        {/* Format Menu */}
        {openMenu === 'Format' && formatMenuRef.current && (() => {
          const rect = formatMenuRef.current?.getBoundingClientRect()
          return (
            <div 
              style={{
                position: 'fixed',
                top: rect ? `${rect.bottom + 4}px` : '100%',
                left: rect ? `${rect.left}px` : 0,
                backgroundColor: dropdownBg,
                border: `1px solid ${dropdownBorder}`,
                borderRadius: '8px',
                boxShadow: theme === 'dark' ? '0 8px 24px rgba(0,0,0,0.6)' : '0 8px 24px rgba(0,0,0,0.15)',
                zIndex: 10010,
                minWidth: '200px',
                padding: '4px',
                display: 'flex',
                flexDirection: 'column'
              }}
            >
              <MenuItem 
                label="Bold" 
                shortcut="Ctrl+B"
                onClick={() => {
                  editor?.chain().focus().toggleBold().run()
                  setOpenMenu(null)
                }}
                active={editor?.isActive('bold')}
                disabled={!editor}
                theme={theme}
                dropdownHoverBg={dropdownHoverBg}
                dropdownTextColor={dropdownTextColor}
              />
              <MenuItem 
                label="Italic" 
                shortcut="Ctrl+I"
                onClick={() => {
                  editor?.chain().focus().toggleItalic().run()
                  setOpenMenu(null)
                }}
                active={editor?.isActive('italic')}
                disabled={!editor}
                theme={theme}
                dropdownHoverBg={dropdownHoverBg}
                dropdownTextColor={dropdownTextColor}
              />
              <MenuItem 
                label="Underline" 
                shortcut="Ctrl+U"
                onClick={() => {
                  editor?.chain().focus().toggleUnderline().run()
                  setOpenMenu(null)
                }}
                active={editor?.isActive('underline')}
                disabled={!editor}
                theme={theme}
                dropdownHoverBg={dropdownHoverBg}
                dropdownTextColor={dropdownTextColor}
              />
              <div style={{ height: '1px', backgroundColor: separatorColor, margin: '4px 0', marginLeft: '-4px', marginRight: '-4px', width: 'calc(100% + 8px)' }} />
              <MenuItem 
                label="Clear Formatting" 
                onClick={() => {
                  editor?.chain().focus().clearNodes().unsetAllMarks().run()
                  setOpenMenu(null)
                }}
                disabled={!editor}
                theme={theme}
                dropdownHoverBg={dropdownHoverBg}
                dropdownTextColor={dropdownTextColor}
              />
            </div>
          )
        })()}

        {/* Insert Menu */}
        {openMenu === 'Insert' && insertMenuRef.current && (() => {
          const rect = insertMenuRef.current?.getBoundingClientRect()
          return (
            <div 
              style={{
                position: 'fixed',
                top: rect ? `${rect.bottom + 4}px` : '100%',
                left: rect ? `${rect.left}px` : 0,
                backgroundColor: dropdownBg,
                border: `1px solid ${dropdownBorder}`,
                borderRadius: '8px',
                boxShadow: theme === 'dark' ? '0 8px 24px rgba(0,0,0,0.6)' : '0 8px 24px rgba(0,0,0,0.15)',
                zIndex: 10010,
                minWidth: '200px',
                padding: '4px',
                display: 'flex',
                flexDirection: 'column'
              }}
            >
              <MenuItem 
                label="Image"
                onClick={() => {
                  // TODO: Implement image insertion
                  setOpenMenu(null)
                }}
                disabled={!editor}
                theme={theme}
                dropdownHoverBg={dropdownHoverBg}
                dropdownTextColor={dropdownTextColor}
              />
              <MenuItem 
                label="Link"
                onClick={() => {
                  // TODO: Implement link insertion
                  setOpenMenu(null)
                }}
                disabled={!editor}
                theme={theme}
                dropdownHoverBg={dropdownHoverBg}
                dropdownTextColor={dropdownTextColor}
              />
              <MenuItem 
                label="Table"
                onClick={() => {
                  // TODO: Implement table insertion
                  setOpenMenu(null)
                }}
                disabled={!editor}
                theme={theme}
                dropdownHoverBg={dropdownHoverBg}
                dropdownTextColor={dropdownTextColor}
              />
            </div>
          )
        })()}

        {/* Tools Menu */}
        {openMenu === 'Tools' && toolsMenuRef.current && (() => {
          const rect = toolsMenuRef.current?.getBoundingClientRect()
          const searchMode = isSearchMode ?? false
          const toggleSearch = onToggleSearch
          console.log('Tools menu rendering, isSearchMode:', isSearchMode, 'onToggleSearch:', onToggleSearch)
          return (
            <div 
              style={{
                position: 'fixed',
                top: rect ? `${rect.bottom + 4}px` : '100%',
                left: rect ? `${rect.left}px` : 0,
                backgroundColor: dropdownBg,
                border: `1px solid ${dropdownBorder}`,
                borderRadius: '8px',
                boxShadow: theme === 'dark' ? '0 8px 24px rgba(0,0,0,0.6)' : '0 8px 24px rgba(0,0,0,0.15)',
                zIndex: 10010,
                minWidth: '200px',
                padding: '4px',
                display: 'flex',
                flexDirection: 'column'
              }}
            >
              <MenuItem 
                label="Search"
                shortcut="Ctrl+Shift+F"
                onClick={() => {
                  console.log('Search button clicked, toggleSearch:', toggleSearch, 'current searchMode:', searchMode, 'onToggleSearch prop:', onToggleSearch)
                  if (toggleSearch) {
                    toggleSearch()
                  } else {
                    console.error('toggleSearch is undefined!')
                  }
                  setOpenMenu(null)
                }}
                active={searchMode}
                theme={theme}
                dropdownHoverBg={dropdownHoverBg}
                dropdownTextColor={dropdownTextColor}
              />
              <MenuItem 
                label="AI Assistant"
                onClick={() => {
                  onToggleAIPanel?.()
                  setOpenMenu(null)
                }}
                theme={theme}
                dropdownHoverBg={dropdownHoverBg}
                dropdownTextColor={dropdownTextColor}
              />
            </div>
          )
        })()}

        {/* Help Menu */}
        {openMenu === 'Help' && helpMenuRef.current && (() => {
          const rect = helpMenuRef.current?.getBoundingClientRect()
          return (
            <div 
              style={{
                position: 'fixed',
                top: rect ? `${rect.bottom + 4}px` : '100%',
                left: rect ? `${rect.left}px` : 0,
                backgroundColor: dropdownBg,
                border: `1px solid ${dropdownBorder}`,
                borderRadius: '8px',
                boxShadow: theme === 'dark' ? '0 8px 24px rgba(0,0,0,0.6)' : '0 8px 24px rgba(0,0,0,0.15)',
                zIndex: 10010,
                minWidth: '200px',
                padding: '4px',
                display: 'flex',
                flexDirection: 'column'
              }}
            >
              <MenuItem 
                label="Keyboard Shortcuts"
                onClick={() => {
                  // TODO: Show keyboard shortcuts dialog
                  setOpenMenu(null)
                }}
                theme={theme}
                dropdownHoverBg={dropdownHoverBg}
                dropdownTextColor={dropdownTextColor}
              />
              <MenuItem 
                label="About Lemona"
                onClick={() => {
                  // TODO: Show about dialog
                  setOpenMenu(null)
                }}
                theme={theme}
                dropdownHoverBg={dropdownHoverBg}
                dropdownTextColor={dropdownTextColor}
              />
            </div>
          )
        })()}
        
        {/* Right side - Window controls on Windows/Linux */}
        <div className="topbar-right">
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
