import { useState, useEffect, useRef } from 'react'
import { useTheme } from '../../contexts/ThemeContext'
import { Commit } from '@shared/types'
import { versionApi } from '../../services/desktop-api'

interface VersionControlPanelProps {
  projectId: string
  onRestore?: (commitId: string) => void
  onDocumentsReload?: () => Promise<void>
  refreshTrigger?: number
}

function formatTimestamp(timestamp: string): { time: string; date: string } {
  try {
    const date = new Date(timestamp)
    const timeStr = date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    })
    const dateStr = date.toLocaleDateString('en-US', {
      month: '2-digit',
      day: '2-digit'
    })
    return { time: timeStr, date: dateStr }
  } catch {
    return { time: timestamp, date: '' }
  }
}

export default function VersionControlPanel({
  projectId,
  onRestore,
  onDocumentsReload,
  refreshTrigger
}: VersionControlPanelProps) {
  const { theme } = useTheme()
  const [commits, setCommits] = useState<Commit[]>([])
  const [headCommitId, setHeadCommitId] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [restoringCommitId, setRestoringCommitId] = useState<string | null>(null)
  const [confirmCommitId, setConfirmCommitId] = useState<string | null>(null)
  const [renamingCommitId, setRenamingCommitId] = useState<string | null>(null)
  const [commitNames, setCommitNames] = useState<Map<string, string>>(new Map())
  const [showSuccess, setShowSuccess] = useState<{ fileCount: number } | null>(null)
  const renameInputRef = useRef<HTMLInputElement>(null)

  const textColor = theme === 'dark' ? '#d6d6dd' : '#202124'
  const commitNameColor = theme === 'dark' ? '#b8b8bd' : '#505356'
  const mutedColor = theme === 'dark' ? '#858585' : '#5f6368'
  const borderColor = theme === 'dark' ? '#252525' : '#e8eaed'
  const accentColor = theme === 'dark' ? '#6ba8c7' : '#5a9ec7'

  useEffect(() => {
    if (projectId) {
      try {
        const stored = localStorage.getItem(`commitNames_${projectId}`)
        if (stored) {
          setCommitNames(new Map(JSON.parse(stored)))
        }
      } catch {
        // ignore
      }
    }
  }, [projectId])

  useEffect(() => {
    if (projectId && commitNames.size > 0) {
      try {
        localStorage.setItem(`commitNames_${projectId}`, JSON.stringify(Array.from(commitNames.entries())))
      } catch {
        // ignore
      }
    }
  }, [commitNames, projectId])

  useEffect(() => {
    if (renamingCommitId && renameInputRef.current) {
      renameInputRef.current.focus()
      renameInputRef.current.select()
    }
  }, [renamingCommitId])

  useEffect(() => {
    if (!projectId || projectId.trim() === '') return
    let cancelled = false
    setIsLoading(true)
    versionApi.getCommits(projectId)
      .then((list) => {
        if (cancelled) return
        setCommits(list || [])
      })
      .catch(() => {
        if (!cancelled) setCommits([])
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false)
      })
    versionApi.getHeadCommit(projectId)
      .then((head) => {
        if (!cancelled) setHeadCommitId(head?.id ?? null)
      })
      .catch(() => {
        if (!cancelled) setHeadCommitId(null)
      })
    return () => { cancelled = true }
  }, [projectId, refreshTrigger])

  const handleRename = (commitId: string, value: string) => {
    if (value.trim()) {
      setCommitNames((prev) => {
        const next = new Map(prev)
        next.set(commitId, value.trim())
        return next
      })
    } else {
      setCommitNames((prev) => {
        const next = new Map(prev)
        next.delete(commitId)
        return next
      })
    }
    setRenamingCommitId(null)
  }

  const handleRestore = async (commitId: string) => {
    if (!projectId) return
    setRestoringCommitId(commitId)
    setConfirmCommitId(null)
    try {
      const restored = await versionApi.restoreCommit(projectId, commitId)
      if (onDocumentsReload) await onDocumentsReload()
      if (onRestore) onRestore(restored.id)
      setShowSuccess({ fileCount: restored.documentSnapshots.length })
      setTimeout(() => setShowSuccess(null), 3000)
      const [list, head] = await Promise.all([
        versionApi.getCommits(projectId),
        versionApi.getHeadCommit(projectId)
      ])
      setCommits(list || [])
      setHeadCommitId(head?.id ?? null)
    } catch (e: any) {
      alert(`Failed to restore: ${e?.message || 'Unknown error'}`)
    } finally {
      setRestoringCommitId(null)
    }
  }

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden'
      }}
    >
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '8px'
        }}
      >
        {isLoading ? (
          <div style={{
            padding: '24px',
            textAlign: 'center',
            color: mutedColor,
            fontSize: '12px'
          }}>
            Loading...
          </div>
        ) : commits.length === 0 ? (
          <div style={{
            padding: '24px',
            textAlign: 'center',
            color: mutedColor,
            fontSize: '12px',
            lineHeight: 1.5
          }}>
            Press Ctrl+S to create your first version.
          </div>
        ) : (
          commits.map((commit, index) => {
            const isHead = commit.id === headCommitId
            const isRestoring = restoringCommitId === commit.id
            const isConfirming = confirmCommitId === commit.id
            const isLast = index === commits.length - 1
            const { time, date } = formatTimestamp(commit.timestamp)
            const displayName = commitNames.get(commit.id) || time

            return (
              <div
                key={commit.id}
                style={{
                  padding: '8px 10px',
                  borderBottom: (isLast || isHead) ? 'none' : `1px solid ${borderColor}`,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '6px',
                  backgroundColor: isHead ? (theme === 'dark' ? `${accentColor}15` : `${accentColor}12`) : 'transparent'
                }}
              >
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '8px'
                }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    {renamingCommitId === commit.id ? (
                      <input
                        ref={renameInputRef}
                        type="text"
                        defaultValue={commitNames.get(commit.id) || `${time} ${date}`}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleRename(commit.id, e.currentTarget.value)
                          if (e.key === 'Escape') setRenamingCommitId(null)
                        }}
                        onBlur={(e) => handleRename(commit.id, e.currentTarget.value)}
                        style={{
                          width: '100%',
                          padding: '4px 6px',
                          fontSize: '12px',
                          border: `1px solid ${accentColor}`,
                          borderRadius: '4px',
                          backgroundColor: theme === 'dark' ? '#2a2a2a' : '#f5f5f5',
                          color: textColor,
                          outline: 'none'
                        }}
                      />
                    ) : (
                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        flexWrap: 'wrap'
                      }}>
                        <span style={{ fontSize: '11px', fontWeight: 500, color: commitNameColor }}>
                          {displayName}
                        </span>
                        {!commitNames.get(commit.id) && (
                          <span style={{ fontSize: '10px', color: mutedColor }}>{date}</span>
                        )}
                      </div>
                    )}
                    <div style={{ fontSize: '10px', color: mutedColor, marginTop: '2px' }}>
                      {commit.documentSnapshots.length} file{commit.documentSnapshots.length !== 1 ? 's' : ''}
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <button
                      onClick={() => setRenamingCommitId(commit.id)}
                      disabled={isRestoring}
                      title="Rename"
                      style={{
                        padding: '4px',
                        border: 'none',
                        borderRadius: '4px',
                        background: 'transparent',
                        color: textColor,
                        cursor: isRestoring ? 'not-allowed' : 'pointer',
                        opacity: isRestoring ? 0.5 : 1
                      }}
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                      </svg>
                    </button>
                    <button
                      onClick={() => setConfirmCommitId(commit.id)}
                      disabled={isRestoring}
                      title="Restore"
                      style={{
                        padding: '4px',
                        border: 'none',
                        borderRadius: '4px',
                        background: 'transparent',
                        color: textColor,
                        cursor: isRestoring ? 'not-allowed' : 'pointer',
                        opacity: isRestoring ? 0.5 : 1
                      }}
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                        <path d="M3 3v5h5" />
                      </svg>
                    </button>
                  </div>
                </div>
                {isConfirming && (
                  <div
                    style={{
                      padding: '8px',
                      backgroundColor: theme === 'dark' ? '#1a1a1a' : '#f5f5f5',
                      borderRadius: '6px',
                      border: `1px solid ${borderColor}`
                    }}
                  >
                    <div style={{ fontSize: '11px', color: mutedColor, marginBottom: '8px' }}>
                      Restore files from this version? Press Ctrl+S after to create a new commit.
                    </div>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <button
                        onClick={() => handleRestore(commit.id)}
                        style={{
                          padding: '4px 10px',
                          fontSize: '11px',
                          border: 'none',
                          borderRadius: '4px',
                          background: accentColor,
                          color: '#fff',
                          cursor: 'pointer'
                        }}
                      >
                        Yes
                      </button>
                      <button
                        onClick={() => setConfirmCommitId(null)}
                        style={{
                          padding: '4px 10px',
                          fontSize: '11px',
                          border: `1px solid ${borderColor}`,
                          borderRadius: '4px',
                          background: 'transparent',
                          color: textColor,
                          cursor: 'pointer'
                        }}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>

      {showSuccess && (
        <div
          style={{
            padding: '8px 12px',
            margin: '8px',
            fontSize: '12px',
            color: theme === 'dark' ? '#4caf50' : '#34a853',
            backgroundColor: theme === 'dark' ? 'rgba(76, 175, 80, 0.15)' : 'rgba(52, 168, 83, 0.12)',
            borderRadius: '6px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}
        >
          <span>Restored {showSuccess.fileCount} file{showSuccess.fileCount !== 1 ? 's' : ''}</span>
        </div>
      )}
    </div>
  )
}
