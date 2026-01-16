import { useState, useEffect, useRef } from 'react'
import { useTheme } from '../../contexts/ThemeContext'
import { Commit } from '@shared/types'
import { versionApi } from '../../services/desktop-api'

interface CommitHistoryModalProps {
  projectId: string
  triggerRef?: React.RefObject<HTMLElement>
  isOpen: boolean
  onClose: () => void
  onRestore?: (commitId: string) => void // Callback to set restored commit parent in Layout
  onDocumentsReload?: () => void // Callback to reload documents after restore
}

export default function CommitHistoryModal({ 
  projectId,
  triggerRef,
  isOpen,
  onClose,
  onRestore,
  onDocumentsReload
}: CommitHistoryModalProps) {
  const { theme } = useTheme()
  const [commits, setCommits] = useState<Commit[]>([])
  const [headCommitId, setHeadCommitId] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [restoringCommitId, setRestoringCommitId] = useState<string | null>(null)
  const [showConfirmDialog, setShowConfirmDialog] = useState<string | null>(null) // Commit ID to restore
  const [renamingCommitId, setRenamingCommitId] = useState<string | null>(null) // Commit ID being renamed
  const [commitNames, setCommitNames] = useState<Map<string, string>>(new Map()) // Custom names for commits
  const [showSuccessNotification, setShowSuccessNotification] = useState<{ message: string; fileCount: number } | null>(null)
  const modalRef = useRef<HTMLDivElement>(null)
  const confirmDialogRef = useRef<HTMLDivElement>(null)
  const renameInputRef = useRef<HTMLInputElement>(null)

  // Load commit names from localStorage when modal opens
  useEffect(() => {
    if (isOpen && projectId) {
      try {
        const stored = localStorage.getItem(`commitNames_${projectId}`)
        if (stored) {
          const namesMap = new Map<string, string>(JSON.parse(stored))
          setCommitNames(namesMap)
        }
      } catch (error) {
        console.error('[CommitHistoryModal] Failed to load commit names:', error)
      }
    }
  }, [isOpen, projectId])

  // Save commit names to localStorage when they change
  useEffect(() => {
    if (projectId && commitNames.size > 0) {
      try {
        localStorage.setItem(`commitNames_${projectId}`, JSON.stringify(Array.from(commitNames.entries())))
      } catch (error) {
        console.error('[CommitHistoryModal] Failed to save commit names:', error)
      }
    }
  }, [commitNames, projectId])

  // Focus rename input when renaming starts
  useEffect(() => {
    if (renamingCommitId && renameInputRef.current) {
      renameInputRef.current.focus()
      renameInputRef.current.select()
    }
  }, [renamingCommitId])


  const handleRenameCommit = (commitId: string, newName: string) => {
    if (newName.trim()) {
      setCommitNames(prev => {
        const updated = new Map(prev)
        updated.set(commitId, newName.trim())
        return updated
      })
    } else {
      // Remove name if empty
      setCommitNames(prev => {
        const updated = new Map(prev)
        updated.delete(commitId)
        return updated
      })
    }
    setRenamingCommitId(null)
  }

  const handleCancelRename = () => {
    setRenamingCommitId(null)
  }

  // Load commits when modal opens
  useEffect(() => {
    if (isOpen && projectId) {
      loadCommits()
    } else {
      setCommits([])
      setHeadCommitId(null)
      setShowConfirmDialog(null)
    }
  }, [isOpen, projectId])

  const loadCommits = async () => {
    if (!projectId || projectId.trim() === '') {
      setIsLoading(false)
      return
    }
    
    setIsLoading(true)
    try {
      const [commitsList, headCommit] = await Promise.all([
        versionApi.getCommits(projectId),
        versionApi.getHeadCommit(projectId)
      ])
      setCommits(commitsList || [])
      setHeadCommitId(headCommit?.id ?? null)
    } catch (error: any) {
      // Set empty state on error
      setCommits([])
      setHeadCommitId(null)
    } finally {
      setIsLoading(false)
    }
  }

  const handleRestore = async (commitId: string) => {
    if (!projectId) {
      return
    }
    
    setRestoringCommitId(commitId)
    try {
      // Restore commit (restores documents)
      const restoredCommit = await versionApi.restoreCommit(projectId, commitId)
      
      // Notify parent component to reload documents (so editor content updates)
      if (onDocumentsReload) {
        await onDocumentsReload()
      }
      
      // Notify parent component to set this commit as parent for next Ctrl+S
      if (onRestore) {
        onRestore(restoredCommit.id)
      }
      
      // Show success notification BEFORE closing modal
      setShowSuccessNotification({
        message: 'Version restored successfully',
        fileCount: restoredCommit.documentSnapshots.length
      })
      
      // Auto-hide notification after 3 seconds
      setTimeout(() => {
        setShowSuccessNotification(null)
      }, 3000)
      
      // Close modal
      onClose()
      
      // Reload commits to refresh HEAD indicator
      await loadCommits()
    } catch (error: any) {
      alert(`Failed to restore commit: ${error.message || 'Unknown error'}`)
    } finally {
      setRestoringCommitId(null)
      setShowConfirmDialog(null)
    }
  }

  // Close modal when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node
      
      // Check if click is inside the modal
      const isInsideModal = modalRef.current?.contains(target)
      
      // Check if click is inside the confirmation dialog
      const isInsideConfirmDialog = confirmDialogRef.current?.contains(target)
      
      // Check if click is on the trigger button
      const isOnTrigger = triggerRef?.current?.contains(target)
      
      // If confirmation dialog is open, only close it if clicking outside both modal and dialog
      if (showConfirmDialog) {
        if (!isInsideModal && !isInsideConfirmDialog && !isOnTrigger) {
          setShowConfirmDialog(null)
        }
      } else {
        // If modal is open but no confirmation dialog, close modal if clicking outside
        if (!isInsideModal && !isOnTrigger) {
          onClose()
        }
      }
    }

    if (isOpen) {
      // Use a small delay to avoid closing immediately when opening
      const timeoutId = setTimeout(() => {
        document.addEventListener('mousedown', handleClickOutside, true)
      }, 100)
      
      return () => {
        clearTimeout(timeoutId)
        document.removeEventListener('mousedown', handleClickOutside, true)
      }
    }
  }, [isOpen, triggerRef, onClose, showConfirmDialog])

  // Close modal on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        if (showConfirmDialog) {
          setShowConfirmDialog(null)
        } else {
          onClose()
        }
      }
    }

    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown)
      return () => window.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen, onClose, showConfirmDialog])

  const formatTimestamp = (timestamp: string): { time: string; date: string } => {
    try {
      const date = new Date(timestamp)
      // Format time as HH:mm AM/PM (12-hour format)
      const timeStr = date.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
      })
      // Format date as MM/DD (without year)
      const dateStr = date.toLocaleDateString('en-US', {
        month: '2-digit',
        day: '2-digit'
      })
      return { time: timeStr, date: dateStr }
    } catch {
      return { time: timestamp, date: '' }
    }
  }

  const dropdownBg = theme === 'dark' ? '#1a1a1a' : '#ffffff'
  const dropdownBorder = theme === 'dark' ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.08)'
  const dropdownTextColor = theme === 'dark' ? '#D6D6DD' : '#202124'
  const dropdownHoverBg = theme === 'dark' ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.04)'
  const brandBlue = theme === 'dark' ? '#6ba8c7' : '#5a9ec7'

  const rect = triggerRef?.current?.getBoundingClientRect()

  return (
    <>
      {isOpen && (
        <div 
          ref={modalRef}
          style={{
            position: 'fixed',
            top: rect ? `${rect.bottom + 8}px` : '100%',
            right: rect ? `${window.innerWidth - rect.right}px` : '24px',
            backgroundColor: dropdownBg,
            border: `1px solid ${dropdownBorder}`,
            borderRadius: '8px',
            boxShadow: theme === 'dark' 
              ? '0 8px 32px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(255, 255, 255, 0.05)' 
              : '0 8px 32px rgba(0, 0, 0, 0.12), 0 0 0 1px rgba(0, 0, 0, 0.04)',
            zIndex: 10010,
            width: '380px',
            maxHeight: '400px',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            backdropFilter: 'blur(20px)',
            transition: 'opacity 0.2s ease, transform 0.2s ease'
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
            Version History
          </h3>
        </div>

        {/* Content */}
        <div style={{
          padding: '8px',
          display: 'flex',
          flexDirection: 'column',
          overflowY: 'auto',
          overflowX: 'hidden',
          maxHeight: 'calc(400px - 60px)',
          flex: 1,
          minHeight: 0
        }}>
          {isLoading ? (
            <div style={{
              padding: '40px 20px',
              textAlign: 'center',
              color: theme === 'dark' ? '#858585' : '#5f6368',
              fontSize: '14px',
              fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
            }}>
              Loading commits...
            </div>
          ) : commits.length === 0 ? (
            <div style={{
              padding: '40px 20px',
              textAlign: 'center',
              color: theme === 'dark' ? '#858585' : '#5f6368',
              fontSize: '14px',
              fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
            }}>
              No commits yet. Press Ctrl+S to create your first commit.
            </div>
          ) : (
            commits.map((commit, index) => {
              const isHead = commit.id === headCommitId
              const isRestoring = restoringCommitId === commit.id
              const isLast = index === commits.length - 1
              
              return (
                <div
                  key={commit.id}
                  style={{
                    padding: '12px 16px',
                    borderBottom: isLast ? 'none' : `1px solid ${theme === 'dark' ? '#252525' : '#e8eaed'}`,
                    display: 'flex',
                    flexDirection: 'column',
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
                  {/* Commit Header */}
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '12px'
                  }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      {renamingCommitId === commit.id ? (
                        <div style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          marginBottom: '4px'
                        }}>
                          <input
                            ref={renameInputRef}
                            type="text"
                            defaultValue={commitNames.get(commit.id) || `${formatTimestamp(commit.timestamp).time} ${formatTimestamp(commit.timestamp).date}`}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                handleRenameCommit(commit.id, e.currentTarget.value)
                              } else if (e.key === 'Escape') {
                                handleCancelRename()
                              }
                            }}
                            onBlur={(e) => {
                              handleRenameCommit(commit.id, e.currentTarget.value)
                            }}
                            style={{
                              flex: 1,
                              padding: '4px 8px',
                              fontSize: '13px',
                              fontWeight: 500,
                              color: dropdownTextColor,
                              backgroundColor: theme === 'dark' ? '#2a2a2a' : '#f5f5f5',
                              border: `1px solid ${brandBlue}`,
                              borderRadius: '4px',
                              fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
                              outline: 'none'
                            }}
                          />
                        </div>
                      ) : (
                        <div style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                          marginBottom: '4px'
                        }}>
                          <span style={{
                            fontSize: '13px',
                            fontWeight: 500,
                            color: dropdownTextColor,
                            fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
                          }}>
                            {commitNames.get(commit.id) || formatTimestamp(commit.timestamp).time}
                          </span>
                          {!commitNames.get(commit.id) && (
                            <span style={{
                              fontSize: '11px',
                              fontWeight: 400,
                              color: theme === 'dark' ? '#6a6a6a' : '#9aa0a6',
                              fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
                            }}>
                              {formatTimestamp(commit.timestamp).date}
                            </span>
                          )}
                          {isHead && (
                            <span style={{
                              fontSize: '11px',
                              fontWeight: 600,
                              color: brandBlue,
                              backgroundColor: theme === 'dark' ? `${brandBlue}20` : `${brandBlue}15`,
                              padding: '2px 6px',
                              borderRadius: '4px',
                              fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
                              textTransform: 'uppercase',
                              letterSpacing: '0.5px'
                            }}>
                              HEAD
                            </span>
                          )}
                        </div>
                      )}
                      <div style={{
                        fontSize: '12px',
                        color: theme === 'dark' ? '#858585' : '#5f6368',
                        fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
                      }}>
                        {commit.documentSnapshots.length} file{commit.documentSnapshots.length !== 1 ? 's' : ''}
                      </div>
                    </div>
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px'
                    }}>
                      <button
                        onClick={(e) => {
                          e.preventDefault()
                          e.stopPropagation()
                          setRenamingCommitId(commit.id)
                        }}
                        disabled={isRestoring || renamingCommitId === commit.id}
                        style={{
                          padding: '6px',
                          border: `1px solid ${dropdownBorder}`,
                          borderRadius: '8px',
                          backgroundColor: 'transparent',
                          color: dropdownTextColor,
                          cursor: (isRestoring || renamingCommitId === commit.id) ? 'not-allowed' : 'pointer',
                          fontSize: '12px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
                          transition: 'background-color 0.15s, border-color 0.15s',
                          opacity: (isRestoring || renamingCommitId === commit.id) ? 0.5 : 1,
                          width: '28px',
                          height: '28px'
                        }}
                        onMouseEnter={(e) => {
                          if (!isRestoring && renamingCommitId !== commit.id) {
                            e.currentTarget.style.backgroundColor = dropdownHoverBg
                            e.currentTarget.style.borderColor = brandBlue
                          }
                        }}
                        onMouseLeave={(e) => {
                          if (!isRestoring && renamingCommitId !== commit.id) {
                            e.currentTarget.style.backgroundColor = 'transparent'
                            e.currentTarget.style.borderColor = dropdownBorder
                          }
                        }}
                        title="Rename commit"
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                        </svg>
                      </button>
                      <button
                      onClick={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        setShowConfirmDialog(commit.id)
                      }}
                        disabled={isRestoring}
                        style={{
                          padding: '6px 12px',
                          border: `1px solid ${dropdownBorder}`,
                          borderRadius: '8px',
                          backgroundColor: 'transparent',
                          color: dropdownTextColor,
                          cursor: isRestoring ? 'not-allowed' : 'pointer',
                          fontSize: '12px',
                          fontWeight: 500,
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
                          transition: 'background-color 0.15s, border-color 0.15s',
                          opacity: isRestoring ? 0.5 : 1
                        }}
                        onMouseEnter={(e) => {
                          if (!isRestoring) {
                            e.currentTarget.style.backgroundColor = dropdownHoverBg
                            e.currentTarget.style.borderColor = brandBlue
                          }
                        }}
                        onMouseLeave={(e) => {
                          if (!isRestoring) {
                            e.currentTarget.style.backgroundColor = 'transparent'
                            e.currentTarget.style.borderColor = dropdownBorder
                          }
                        }}
                      >
                        <span>Restore</span>
                      </button>
                    </div>
                  </div>
                </div>
              )
            })
          )}
        </div>
        </div>
      )}

      {/* Confirmation Dialog */}
      {showConfirmDialog && (
        <div
          ref={confirmDialogRef}
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: theme === 'dark' ? 'rgba(0, 0, 0, 0.7)' : 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10020,
            pointerEvents: 'auto'
          }}
          onClick={() => {
            setShowConfirmDialog(null)
          }}
        >
          <div
            style={{
              backgroundColor: dropdownBg,
              borderRadius: '8px',
              padding: '24px',
              minWidth: '400px',
              maxWidth: '500px',
              border: `1px solid ${dropdownBorder}`,
              boxShadow: theme === 'dark' 
                ? '0 8px 32px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(255, 255, 255, 0.05)' 
                : '0 8px 32px rgba(0, 0, 0, 0.12), 0 0 0 1px rgba(0, 0, 0, 0.04)',
              backdropFilter: 'blur(20px)',
              transition: 'opacity 0.2s ease, transform 0.2s ease',
              pointerEvents: 'auto',
              position: 'relative',
              zIndex: 10025
            }}
            onClick={(e) => {
              // Stop propagation to prevent backdrop click from closing dialog
              e.stopPropagation()
            }}
          >
            <div style={{ 
              marginBottom: '16px', 
              fontSize: '16px', 
              fontWeight: 500, 
              color: dropdownTextColor,
              fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
            }}>
              Restore Commit?
            </div>
            <div style={{
              marginBottom: '20px',
              fontSize: '14px',
              color: theme === 'dark' ? '#858585' : '#5f6368',
              fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
              lineHeight: '1.5'
            }}>
              This will restore files from this commit. After making changes, press Ctrl+S to create a new commit.
            </div>
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button
                onClick={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  setShowConfirmDialog(null)
                }}
                style={{
                  padding: '8px 16px',
                  fontSize: '14px',
                  border: `1px solid ${dropdownBorder}`,
                  borderRadius: '8px',
                  backgroundColor: 'transparent',
                  color: dropdownTextColor,
                  cursor: 'pointer',
                  fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
                  transition: 'background-color 0.15s'
                }}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = dropdownHoverBg}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  
                  const commitIdToRestore = showConfirmDialog
                  
                  if (!commitIdToRestore || !projectId) {
                    return
                  }
                  
                  handleRestore(commitIdToRestore)
                }}
                style={{
                  padding: '8px 16px',
                  fontSize: '14px',
                  border: 'none',
                  borderRadius: '8px',
                  backgroundColor: brandBlue,
                  color: '#ffffff',
                  cursor: 'pointer',
                  fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
                  transition: 'background-color 0.15s'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = theme === 'dark' ? '#5a9ab7' : '#4a8db7'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = brandBlue
                }}
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Success Notification */}
      {showSuccessNotification && (
        <div
          style={{
            position: 'fixed',
            bottom: '20px',
            left: '50%',
            transform: 'translateX(-50%)',
            backgroundColor: theme === 'dark' ? '#1e1e1e' : '#ffffff',
            border: `1px solid ${theme === 'dark' ? '#333' : '#e0e0e0'}`,
            borderRadius: '6px',
            padding: '12px 20px',
            boxShadow: theme === 'dark'
              ? '0 8px 32px rgba(0, 0, 0, 0.5), 0 2px 8px rgba(0, 0, 0, 0.3)'
              : '0 8px 32px rgba(0, 0, 0, 0.2), 0 2px 8px rgba(0, 0, 0, 0.1)',
            zIndex: 10030,
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
            minWidth: '300px',
            animation: 'slideUp 0.3s ease-out'
          }}
        >
          <div
            style={{
              width: '20px',
              height: '20px',
              borderRadius: '50%',
              backgroundColor: theme === 'dark' ? '#4caf50' : '#34a853',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0
            }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
          </div>
          <div style={{ flex: 1 }}>
            <div
              style={{
                fontSize: '13px',
                fontWeight: '500',
                color: theme === 'dark' ? '#ffffff' : '#202124',
                marginBottom: '2px',
              }}
            >
              {showSuccessNotification.message}
            </div>
            <div
              style={{
                fontSize: '11px',
                color: theme === 'dark' ? '#999' : '#666',
              }}
            >
              {showSuccessNotification.fileCount} file{showSuccessNotification.fileCount !== 1 ? 's' : ''} restored
            </div>
          </div>
          <style>{`
            @keyframes slideUp {
              from {
                transform: translateX(-50%) translateY(20px);
                opacity: 0;
              }
              to {
                transform: translateX(-50%) translateY(0);
                opacity: 1;
              }
            }
          `}</style>
        </div>
      )}
    </>
  )
}

