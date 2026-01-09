import { useState, useEffect, useRef } from 'react'
import { useTheme } from '../../contexts/ThemeContext'
import { Document } from '@shared/types'
// @ts-ignore
import CheckBoxIcon from '@mui/icons-material/CheckBox'
// @ts-ignore
import CheckBoxOutlineBlankIcon from '@mui/icons-material/CheckBoxOutlineBlank'

interface ExportModalProps {
  onExport: (format: 'pdf' | 'docx', filename?: string, documentIds?: string[], usePageBreaks?: boolean) => void
  documents: Document[]
  projectName: string
  documentTitle?: string
  triggerRef?: React.RefObject<HTMLElement>
  isOpen: boolean
  onClose: () => void
}

export default function ExportModal({ 
  onExport, 
  documents, 
  projectName, 
  triggerRef,
  isOpen,
  onClose
}: ExportModalProps) {
  const { theme } = useTheme()
  const [showFileDropdown, setShowFileDropdown] = useState(false)
  const [downloadFilename, setDownloadFilename] = useState(projectName)
  const [selectedDocumentIds, setSelectedDocumentIds] = useState<Set<string>>(new Set())
  const [usePageBreaks, setUsePageBreaks] = useState(true) // Default to true to maintain current behavior
  const shareMenuRef = useRef<HTMLDivElement>(null)
  const fileDropdownRef = useRef<HTMLDivElement>(null)
  const fileSelectButtonRef = useRef<HTMLButtonElement>(null)

  // Filter documents: only show workspace files (folder === 'project' or undefined/null)
  const workspaceDocuments = documents
    .filter(doc => (!doc.folder || doc.folder === 'project') && doc.title !== 'README.md' && doc.title.toLowerCase() !== 'readme.md')
    .sort((a, b) => {
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

  // Update filename when project name changes
  useEffect(() => {
    if (projectName) {
      setDownloadFilename(projectName)
    }
  }, [projectName])

  // Reset filename to projectName when modal opens
  useEffect(() => {
    if (isOpen && projectName) {
      setDownloadFilename(projectName)
    }
  }, [isOpen, projectName])

  // Reset usePageBreaks to default when modal opens
  useEffect(() => {
    if (isOpen) {
      setUsePageBreaks(true) // Reset to default (true) when modal opens
    }
  }, [isOpen])

  // Close dropdown when clicking outside of it
  useEffect(() => {
    const handleClickOutsideDropdown = (event: MouseEvent) => {
      if (!showFileDropdown) return
      
      const target = event.target as Node
      
      // Check if click is inside the dropdown or the button that opens it
      const isInsideDropdown = fileDropdownRef.current?.contains(target) ||
                              fileSelectButtonRef.current?.contains(target)
      
      // Close dropdown if click is outside
      if (!isInsideDropdown) {
        setShowFileDropdown(false)
      }
    }

    if (showFileDropdown) {
      // Use a small delay to avoid closing immediately when opening
      const timeoutId = setTimeout(() => {
        document.addEventListener('mousedown', handleClickOutsideDropdown)
      }, 100)
      
      return () => {
        clearTimeout(timeoutId)
        document.removeEventListener('mousedown', handleClickOutsideDropdown)
      }
    }
  }, [showFileDropdown])

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node
      
      // Check if click is inside the modal or its dropdowns
      const isInsideModal = shareMenuRef.current?.contains(target) || 
                           fileDropdownRef.current?.contains(target) ||
                           fileSelectButtonRef.current?.contains(target)
      
      // Check if click is on the trigger button (share button)
      const isOnTrigger = triggerRef?.current?.contains(target)
      
      // Close if click is outside modal and not on trigger button
      if (!isInsideModal && !isOnTrigger) {
        onClose()
        setShowFileDropdown(false)
      }
    }

    if (isOpen) {
      // Use capture phase to catch events before they're stopped by other components (e.g., AI panel)
      // Use a small delay to avoid closing immediately when opening
      const timeoutId = setTimeout(() => {
        document.addEventListener('mousedown', handleClickOutside, true)
      }, 100)
      
      return () => {
        clearTimeout(timeoutId)
        document.removeEventListener('mousedown', handleClickOutside, true)
      }
    }
  }, [isOpen, triggerRef, onClose])

  const handleSelectAll = () => {
    if (selectedDocumentIds.size === workspaceDocuments.length) {
      setSelectedDocumentIds(new Set())
    } else {
      setSelectedDocumentIds(new Set(workspaceDocuments.map((doc: Document) => doc.id)))
    }
  }

  const handleToggleDocument = (docId: string) => {
    const newSelection = new Set(selectedDocumentIds)
    if (newSelection.has(docId)) {
      newSelection.delete(docId)
    } else {
      newSelection.add(docId)
    }
    setSelectedDocumentIds(newSelection)
  }

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
    if (selectedDocumentIds.size === 0) return
    
    const selectedIds = Array.from(selectedDocumentIds)
    console.log('[ExportModal] Exporting with usePageBreaks:', usePageBreaks, 'type:', typeof usePageBreaks)
    onClose()
    setShowFileDropdown(false)
    onExport(format, downloadFilename, selectedIds, usePageBreaks)
  }

  const dropdownBg = theme === 'dark' ? '#181818' : '#ffffff'
  const dropdownBorder = theme === 'dark' ? '#212121' : '#dadce0'
  const dropdownTextColor = theme === 'dark' ? '#D6D6DD' : '#202124'
  const dropdownHoverBg = theme === 'dark' ? '#1f1f1f' : '#f5f5f5'
  const brandBlue = theme === 'dark' ? '#6ba8c7' : '#5a9ec7'
  const isAllSelected = workspaceDocuments.length > 0 && selectedDocumentIds.size === workspaceDocuments.length
  const hasSelection = selectedDocumentIds.size > 0

  if (!isOpen) return null

  const rect = triggerRef?.current?.getBoundingClientRect()

  return (
    <div 
      ref={shareMenuRef}
      style={{
        position: 'fixed',
        top: rect ? `${rect.bottom + 4}px` : '100%',
        right: rect ? `${window.innerWidth - rect.right}px` : '24px',
        backgroundColor: dropdownBg,
        border: `1px solid ${dropdownBorder}`,
        borderRadius: '6px',
        boxShadow: theme === 'dark' ? '0 12px 40px rgba(0,0,0,0.8)' : '0 12px 40px rgba(0,0,0,0.25)',
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
            onChange={(e) => setDownloadFilename(e.target.value)}
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

        {/* Page Break Option - only show when multiple files are selected */}
        {selectedDocumentIds.size > 1 && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            padding: '8px 0'
          }}>
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                setUsePageBreaks(!usePageBreaks)
              }}
              style={{
                width: '18px',
                height: '18px',
                border: `1px solid ${dropdownBorder}`,
                borderRadius: '6px',
                backgroundColor: usePageBreaks ? brandBlue : 'transparent',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: 0,
                outline: 'none',
                transition: 'background-color 0.15s, border-color 0.15s'
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
              {usePageBreaks && (
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <path d="M2 6L5 9L10 3" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              )}
            </button>
            <label style={{
              fontSize: '13px',
              color: dropdownTextColor,
              fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
              cursor: 'pointer',
              userSelect: 'none'
            }}
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              setUsePageBreaks(!usePageBreaks)
            }}>
              Use page breaks between files
            </label>
          </div>
        )}

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
            }}
            disabled={!hasSelection}
            style={{
              flex: 1,
              padding: '10px 16px',
              border: 'none',
              borderRadius: '6px',
              backgroundColor: hasSelection
                ? (theme === 'dark' ? '#d9779f' : '#e8a5b8')
                : (theme === 'dark' ? '#3e3e42' : '#e0e0e0'),
              color: hasSelection ? '#ffffff' : (theme === 'dark' ? '#858585' : '#9e9e9e'),
              cursor: hasSelection ? 'pointer' : 'not-allowed',
              fontSize: '13px',
              fontWeight: 500,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
              transition: 'background-color 0.2s ease, transform 0.15s ease',
              boxShadow: hasSelection
                ? (theme === 'dark' ? '0 1px 3px rgba(217, 119, 159, 0.2)' : '0 1px 3px rgba(232, 165, 184, 0.2)')
                : 'none'
            }}
            onMouseEnter={(e) => {
              if (hasSelection) {
                e.currentTarget.style.backgroundColor = theme === 'dark' ? '#c9688a' : '#e095ab'
                e.currentTarget.style.transform = 'translateY(-1px)'
                e.currentTarget.style.boxShadow = theme === 'dark' 
                  ? '0 2px 6px rgba(217, 119, 159, 0.3)' 
                  : '0 2px 6px rgba(232, 165, 184, 0.3)'
              }
            }}
            onMouseLeave={(e) => {
              if (hasSelection) {
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
            }}
            disabled={!hasSelection}
            style={{
              flex: 1,
              padding: '10px 16px',
              border: 'none',
              borderRadius: '6px',
              backgroundColor: hasSelection
                ? (theme === 'dark' ? '#7bb3d9' : '#8fc4e8')
                : (theme === 'dark' ? '#3e3e42' : '#e0e0e0'),
              color: hasSelection ? '#ffffff' : (theme === 'dark' ? '#858585' : '#9e9e9e'),
              cursor: hasSelection ? 'pointer' : 'not-allowed',
              fontSize: '13px',
              fontWeight: 500,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
              transition: 'background-color 0.2s ease, transform 0.15s ease',
              boxShadow: hasSelection
                ? (theme === 'dark' ? '0 1px 3px rgba(123, 179, 217, 0.2)' : '0 1px 3px rgba(143, 196, 232, 0.2)')
                : 'none'
            }}
            onMouseEnter={(e) => {
              if (hasSelection) {
                e.currentTarget.style.backgroundColor = theme === 'dark' ? '#6ba5c9' : '#7fb8de'
                e.currentTarget.style.transform = 'translateY(-1px)'
                e.currentTarget.style.boxShadow = theme === 'dark' 
                  ? '0 2px 6px rgba(123, 179, 217, 0.3)' 
                  : '0 2px 6px rgba(143, 196, 232, 0.3)'
              }
            }}
            onMouseLeave={(e) => {
              if (hasSelection) {
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
}


