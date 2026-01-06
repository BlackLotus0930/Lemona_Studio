import { useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { Project, Document } from '@shared/types'
import { documentApi, projectApi } from '../services/api'
import { indexingApi, settingsApi } from '../services/desktop-api'
import { useTheme } from '../contexts/ThemeContext'
// @ts-ignore
import SearchIcon from '@mui/icons-material/Search'
// @ts-ignore
import AddIcon from '@mui/icons-material/Add'
// @ts-ignore
import MoreVertIcon from '@mui/icons-material/MoreVert'
import logoImage from '../assets/lemonalogo.png'
import thinkingMemeImage from '../assets/thinkingmeme.png'

export default function DocumentList() {
  const { theme } = useTheme()
  const [projects, setProjects] = useState<Project[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [openMenuId, setOpenMenuId] = useState<string | null>(null)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [deleteConfirmProjectId, setDeleteConfirmProjectId] = useState<string | null>(null)
  const navigate = useNavigate()
  const location = useLocation()
  
  const bgColor = theme === 'dark' ? '#070707' : '#ffffff'
  const brighterBg = theme === 'dark' ? '#181818' : '#f1f3f4'
  const borderColor = theme === 'dark' ? '#2d2d2d' : '#dadce0'
  const textColor = theme === 'dark' ? '#D6D6DD' : '#202124'
  const secondaryTextColor = theme === 'dark' ? '#858585' : '#5f6368'
  
  // Dropdown menu colors (matching FileExplorer)
  const dropdownBg = theme === 'dark' ? '#1a1a1a' : '#ffffff'
  const dropdownBorder = theme === 'dark' ? '#2d2d2d' : '#dadce0'
  const dropdownTextColor = theme === 'dark' ? '#D6D6DD' : '#202124'
  const dropdownHoverBg = theme === 'dark' ? '#3e3e42' : '#f8f9fa'

  useEffect(() => {
    // Always load fresh data from API when component mounts or location changes
    // This ensures we have the latest project names when user navigates back to home page
    loadProjects()
    
    // Listen for project rename events to refresh projects list
    const handleProjectRenameEvent = () => {
      // Reload projects to ensure we have the latest data
      loadProjects()
    }
    
    window.addEventListener('projectRenamed', handleProjectRenameEvent as EventListener)
    
    return () => {
      window.removeEventListener('projectRenamed', handleProjectRenameEvent as EventListener)
    }
  }, [location.pathname]) // Reload when navigating to /documents

  const loadProjects = async () => {
    try {
      const loadedProjects = await projectApi.getAll()
      // Projects are already sorted by updatedAt (most recent first) from the backend
      // But ensure they're sorted correctly in case backend doesn't sort
      const sortedProjects = Array.isArray(loadedProjects) ? loadedProjects.sort((a: any, b: any) => {
        const dateA = new Date(a.updatedAt || a.createdAt || 0).getTime()
        const dateB = new Date(b.updatedAt || b.createdAt || 0).getTime()
        return dateB - dateA // Most recent first
      }) : []
      
      setProjects(sortedProjects)
      
      // Load first workspace document (excluding README.md) for each project for preview and get actual document count
      const projectsWithPreviews = await Promise.all(
        sortedProjects.map(async (project: any) => {
    try {
            const docs = await projectApi.getDocuments(project.id)
            // Filter to get first workspace file (exclude README.md)
            const workspaceDocs = docs.filter((doc: any) => 
              (!doc.folder || doc.folder === 'project') && 
              doc.title !== 'README.md' && 
              doc.title.toLowerCase() !== 'readme.md'
            )
            const firstWorkspaceDoc = workspaceDocs.length > 0 ? workspaceDocs[0] : (docs[0] || null)
            return { ...project, firstDocument: firstWorkspaceDoc, actualDocumentCount: docs.length }
          } catch {
            return { ...project, firstDocument: null, actualDocumentCount: 0 }
          }
        })
      )
      // Maintain sort order after loading previews
      const sortedWithPreviews = projectsWithPreviews.sort((a: any, b: any) => {
        const dateA = new Date(a.updatedAt || a.createdAt || 0).getTime()
        const dateB = new Date(b.updatedAt || b.createdAt || 0).getTime()
        return dateB - dateA // Most recent first
      })
      setProjects(sortedWithPreviews as any)
    } catch (error) {
      console.error('Failed to load projects:', error)
      setProjects([])
    } finally {
      setIsLoading(false)
    }
  }

  const handleCreateProject = async () => {
    try {
      // Generate default name "Untitled (X)" based on existing projects
      const untitledPattern = /^Untitled \((\d+)\)$/
      const existingUntitledNumbers = projects
        .map(p => {
          const match = p.title.match(untitledPattern)
          return match ? parseInt(match[1], 10) : 0
        })
        .filter(num => num > 0)
      
      const nextNumber = existingUntitledNumbers.length > 0 
        ? Math.max(...existingUntitledNumbers) + 1 
        : 1
      
      const defaultName = `Untitled (${nextNumber})`
      const project = await projectApi.create(defaultName.trim())
      
      // Create README.md document as the first document
      const readmeDoc = await documentApi.create('README.md')
      
      // Add README.md to project
      await projectApi.addDocument(project.id, readmeDoc.id, 0)
      
      // Update projects list
      setProjects(prev => [project, ...prev])
      
      // Navigate to the README document (same as handleOpenProject)
      navigate(`/document/${readmeDoc.id}`)
    } catch (error) {
      console.error('Failed to create project:', error)
      alert('Failed to create project. Please try again.')
    }
  }

  const handleOpenProject = async (projectId: string) => {
    try {
      // Update project's updatedAt timestamp to mark it as recently opened
      try {
        await projectApi.update(projectId, {})
      } catch (updateError) {
        // If update fails, continue anyway - not critical
        console.warn('Failed to update project timestamp:', updateError)
      }
      
      // Trigger indexing for this project's library files (async, non-blocking)
      // This happens in the background and doesn't block project opening
      settingsApi.getApiKeys().then((keys) => {
        const hasApiKey = (keys.geminiApiKey && keys.geminiApiKey.trim().length > 0) ||
                         (keys.openaiApiKey && keys.openaiApiKey.trim().length > 0)
        
        if (hasApiKey) {
          console.log(`[Auto-Indexing] Project ${projectId} opened, starting library file indexing...`)
          indexingApi.indexProjectLibraryFiles(
            projectId,
            keys.geminiApiKey,
            keys.openaiApiKey,
            true // onlyUnindexed = true
          ).then((results) => {
            const successCount = results.filter(r => r.status.status === 'completed').length
            const errorCount = results.filter(r => r.status.status === 'error').length
            if (successCount > 0 || errorCount > 0) {
              console.log(`[Auto-Indexing] Completed indexing for project ${projectId}: ${successCount} succeeded, ${errorCount} errors`)
            }
          }).catch((error) => {
            // Don't show error to user - indexing failures shouldn't interrupt workflow
            console.warn(`[Auto-Indexing] Failed to index project ${projectId}:`, error)
          })
        }
      }).catch((error) => {
        console.warn('[Auto-Indexing] Failed to get API keys:', error)
      })
      
      // Get documents in project
      const documents = await projectApi.getDocuments(projectId)
      if (documents.length > 0) {
        // Try to restore last opened document
        let documentToOpen = documents[0] // Default to first document
        
        try {
          const lastDocumentId = localStorage.getItem(`lastDocument_${projectId}`)
          if (lastDocumentId) {
            // Check if the last document still exists in the project
            const lastDocument = documents.find((doc: Document) => doc.id === lastDocumentId)
            if (lastDocument) {
              documentToOpen = lastDocument
            }
          }
        } catch (error) {
          console.error('Failed to load last document:', error)
          // Fall back to first document
        }
        
        navigate(`/document/${documentToOpen.id}`)
      } else {
        // No documents, create Section 1
        const document = await documentApi.create('Section 1')
        await projectApi.addDocument(projectId, document.id, 0)
        navigate(`/document/${document.id}`)
      }
      
      // Reload projects to reflect new order
      loadProjects()
    } catch (error) {
      console.error('Failed to open project:', error)
      alert('Failed to open project. Please try again.')
    }
  }

  // Extract text preview from TipTap content with better handling
  const extractPreview = (content: string, maxLength: number = 200): string => {
    try {
      const parsed = JSON.parse(content)
      const extractText = (node: any): string => {
        if (typeof node === 'string') return node
        if (node.type === 'text') return node.text || ''
        if (node.content && Array.isArray(node.content)) {
          // Join with spaces for better readability
          return node.content.map(extractText).filter((t: string) => t.trim()).join(' ')
        }
        return ''
      }
      const text = extractText(parsed).trim()
      if (!text) return ''
      // Clean up multiple spaces
      const cleanedText = text.replace(/\s+/g, ' ')
      return cleanedText.length > maxLength ? cleanedText.substring(0, maxLength) + '...' : cleanedText
    } catch {
      return ''
    }
  }

  // Filter projects
  const filteredProjects = projects.filter(project =>
    project.title.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const handleRenameProject = async (projectId: string, newTitle: string) => {
    if (!newTitle.trim()) return
    
    try {
      // Update project via API
      await projectApi.update(projectId, { title: newTitle.trim() })
      
      // Reload project from API to ensure we have the latest data
      const updatedProject = await projectApi.getById(projectId)
      if (updatedProject) {
        // Update local state with fresh data from API
        setProjects(prev => prev.map(p => p.id === projectId ? updatedProject : p))
      } else {
        // Fallback: update with new title if API call fails
        setProjects(prev => prev.map(p => p.id === projectId ? { ...p, title: newTitle.trim() } : p))
      }
      
      setRenamingId(null)
      setRenameValue('')
      
      // Notify Layout to refresh project name if it's currently viewing this project
      window.dispatchEvent(new CustomEvent('projectRenamed', { detail: { projectId } }))
    } catch (error) {
      console.error('Failed to rename project:', error)
      alert('Failed to rename project. Please try again.')
    }
  }

  const handleDeleteProject = (projectId: string) => {
    setDeleteConfirmProjectId(projectId)
    setOpenMenuId(null)
  }

  const confirmDeleteProject = async () => {
    if (!deleteConfirmProjectId) return
    
    try {
      await projectApi.delete(deleteConfirmProjectId)
      setProjects(prev => prev.filter(p => p.id !== deleteConfirmProjectId))
      setDeleteConfirmProjectId(null)
    } catch (error) {
      console.error('Failed to delete project:', error)
      alert('Failed to delete project. Please try again.')
      setDeleteConfirmProjectId(null)
    }
  }

  const cancelDeleteProject = () => {
    setDeleteConfirmProjectId(null)
  }

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = () => {
      if (openMenuId) {
        setOpenMenuId(null)
      }
    }
    
    if (openMenuId) {
      document.addEventListener('click', handleClickOutside)
      return () => document.removeEventListener('click', handleClickOutside)
    }
  }, [openMenuId])

  return (
    <div style={{
      height: '100vh',
      display: 'flex',
      flexDirection: 'column',
      backgroundColor: bgColor,
      overflow: 'hidden'
    }}>
      {/* Top Navigation Bar */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        height: '40px',
        padding: '0 16px',
        borderBottom: `1px solid ${borderColor}`,
        backgroundColor: bgColor,
        userSelect: 'none',
        flexShrink: 0,
        // @ts-ignore - WebkitAppRegion is a valid Electron CSS property
        WebkitAppRegion: 'drag'
      } as React.CSSProperties}>
        {/* Left side */}
        {/* @ts-ignore */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, WebkitAppRegion: 'no-drag' }}>
          <button
            onClick={() => navigate('/documents')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              border: 'none',
              background: 'transparent',
              cursor: 'pointer',
              padding: '2px 4px',
              borderRadius: '4px'
            }}
          >
            <img 
              src={logoImage} 
              alt="Lemona Logo" 
              style={{
                width: '18px',
                height: '18px',
                objectFit: 'contain'
              }}
            />
            <span style={{ 
              fontSize: '13px', 
              color: theme === 'dark' ? '#9E9E9E' : '#5f6368', 
              fontWeight: 500, 
              fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
              transform: 'translateY(-1px)',
              display: 'inline-block'
            }}>Lemona</span>
          </button>

          {/* Search Bar */}
          <div style={{
            flex: 1,
            maxWidth: '480px',
            margin: '0 auto',
            position: 'relative'
          }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              backgroundColor: brighterBg,
              borderRadius: '8px',
              padding: '4px 10px',
              gap: '6px',
              height: '24px',
              border: `1px solid ${theme === 'dark' ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.05)'}`,
              transition: 'all 0.2s ease',
              boxShadow: theme === 'dark' 
                ? '0 1px 3px rgba(0, 0, 0, 0.2)' 
                : '0 1px 2px rgba(0, 0, 0, 0.05)',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = theme === 'dark' ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)'
              e.currentTarget.style.boxShadow = theme === 'dark' 
                ? '0 2px 6px rgba(0, 0, 0, 0.3)' 
                : '0 2px 4px rgba(0, 0, 0, 0.1)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = theme === 'dark' ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.05)'
              e.currentTarget.style.boxShadow = theme === 'dark' 
                ? '0 1px 3px rgba(0, 0, 0, 0.2)' 
                : '0 1px 2px rgba(0, 0, 0, 0.05)'
            }}
            >
              <SearchIcon style={{ fontSize: '14px', color: secondaryTextColor }} />
              <input
                type="text"
                placeholder="Search projects"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{
                  border: 'none',
                  background: 'transparent',
                  outline: 'none',
                  flex: 1,
                  fontSize: '12px',
                  color: textColor,
                  fontFamily: '"Noto Sans SC", "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
                }}
              />
            </div>
          </div>
        </div>

        {/* Right side - Window Controls */}
        {/* @ts-ignore */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0', WebkitAppRegion: 'no-drag' }}>
          {typeof window !== 'undefined' && window.electron && window.electron.platform !== 'darwin' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0', marginRight: '-8px' }}>
              <button
                onClick={() => {
                  if (window.electron) {
                    window.electron.invoke('window:minimize')
                  }
                }}
                style={{
                  width: '46px',
                  height: '32px',
                  border: 'none',
                  background: 'transparent',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'background-color 0.15s',
                  color: theme === 'dark' ? '#9E9E9E' : '#5f6368'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = theme === 'dark' ? '#2d2d2d' : '#f1f3f4'
                  e.currentTarget.style.color = theme === 'dark' ? '#ffffff' : '#202124'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'transparent'
                  e.currentTarget.style.color = theme === 'dark' ? '#9E9E9E' : '#5f6368'
                }}
                title="Minimize"
              >
                <svg width="12" height="12" viewBox="0 0 12 12">
                  <rect x="0" y="5" width="12" height="0.75" fill="currentColor" />
                </svg>
              </button>
              <button
                onClick={() => {
                  if (window.electron) {
                    window.electron.invoke('window:maximize')
                  }
                }}
                style={{
                  width: '46px',
                  height: '32px',
                  border: 'none',
                  background: 'transparent',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'background-color 0.15s',
                  color: theme === 'dark' ? '#9E9E9E' : '#5f6368'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = theme === 'dark' ? '#2d2d2d' : '#f1f3f4'
                  e.currentTarget.style.color = theme === 'dark' ? '#ffffff' : '#202124'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'transparent'
                  e.currentTarget.style.color = theme === 'dark' ? '#9E9E9E' : '#5f6368'
                }}
                title="Maximize / Restore"
              >
                <svg width="12" height="12" viewBox="0 0 12 12">
                  <rect x="1" y="1" width="10" height="10" fill="none" stroke="currentColor" strokeWidth="0.75" />
                </svg>
              </button>
              <button
                onClick={() => {
                  if (window.electron) {
                    window.electron.invoke('window:close')
                  }
                }}
                style={{
                  width: '46px',
                  height: '32px',
                  border: 'none',
                  background: 'transparent',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'background-color 0.15s',
                  color: theme === 'dark' ? '#9E9E9E' : '#5f6368'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = '#e81123'
                  e.currentTarget.style.color = '#ffffff'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'transparent'
                  e.currentTarget.style.color = theme === 'dark' ? '#9E9E9E' : '#5f6368'
                }}
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

      {/* Main Content */}
      <div style={{
        flex: 1,
        overflowY: 'auto',
        overflowX: 'hidden',
      }}>
        <div style={{
          maxWidth: '1200px',
          margin: '0 auto',
          padding: '28px 24px',
        }}>
        {/* Header */}
        <div style={{
          marginBottom: '28px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}>
          <div>
            <style>{`
              @keyframes gradient-flow {
                0% {
                  background-position: 0% 50%;
                }
                50% {
                  background-position: 100% 50%;
                }
                100% {
                  background-position: 0% 50%;
                }
              }
            `}</style>
            <h1 style={{ 
              fontSize: '26px', 
              fontWeight: 600, 
              color: textColor,
              margin: 0,
              marginBottom: '4px',
              fontFamily: '"Noto Sans SC", "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
            } as React.CSSProperties}>
              Projects
            </h1>
          </div>
        </div>

        {/* Floating + button at bottom-right */}
        <div style={{ position: 'fixed', bottom: '32px', right: '32px', zIndex: 1000 }}>
          {/* Pulsing ring effect */}
          <div
            style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              width: '64px',
              height: '64px',
              borderRadius: '50%',
              background: 'linear-gradient(135deg, rgba(244, 114, 182, 0.3) 0%, rgba(236, 72, 153, 0.3) 50%, rgba(251, 113, 133, 0.3) 100%)',
              animation: 'pulse-ring 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
              pointerEvents: 'none',
            }}
          />
          <style>{`
            @keyframes pulse-ring {
              0% {
                transform: translate(-50%, -50%) scale(1);
                opacity: 0.8;
              }
              50% {
                transform: translate(-50%, -50%) scale(1.3);
                opacity: 0.4;
              }
              100% {
                transform: translate(-50%, -50%) scale(1.6);
                opacity: 0;
              }
            }
          `}</style>
        <button
          onClick={handleCreateProject}
          style={{
              position: 'relative',
              width: '64px',
              height: '64px',
            borderRadius: '50%',
            border: 'none',
              background: theme === 'dark' 
                ? 'linear-gradient(135deg, #f585b8 0%, #f05ba3 50%, #fc7f95 100%)'
                : 'linear-gradient(135deg, #f585b8 0%, #f05ba3 50%, #fc7f95 100%)',
            color: 'white',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
              boxShadow: theme === 'dark'
                ? '0 8px 32px rgba(244, 114, 182, 0.4), 0 0 0 1px rgba(255, 255, 255, 0.1) inset'
                : '0 8px 32px rgba(244, 114, 182, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.2) inset',
              transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
              overflow: 'hidden',
            } as React.CSSProperties}
          onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'scale(1.15) rotate(90deg)'
              e.currentTarget.style.boxShadow = theme === 'dark'
                ? '0 12px 48px rgba(244, 114, 182, 0.6), 0 0 0 1px rgba(255, 255, 255, 0.15) inset'
                : '0 12px 48px rgba(244, 114, 182, 0.7), 0 0 0 1px rgba(255, 255, 255, 0.25) inset'
          }}
          onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'scale(1) rotate(0deg)'
              e.currentTarget.style.boxShadow = theme === 'dark'
                ? '0 8px 32px rgba(244, 114, 182, 0.4), 0 0 0 1px rgba(255, 255, 255, 0.1) inset'
                : '0 8px 32px rgba(244, 114, 182, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.2) inset'
            }}
          >
            {/* Animated gradient overlay */}
            <div
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.2) 0%, rgba(255, 255, 255, 0) 100%)',
                borderRadius: '50%',
                pointerEvents: 'none',
              }}
            />
            {/* Icon with glow effect */}
            <AddIcon 
              style={{ 
                fontSize: '32px',
                filter: 'drop-shadow(0 2px 4px rgba(0, 0, 0, 0.2))',
                transition: 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                position: 'relative',
                zIndex: 1,
              }} 
            />
        </button>
        </div>


        {isLoading ? (
          <div style={{ 
            textAlign: 'center', 
            padding: '80px 20px', 
            color: secondaryTextColor 
          }}>
            <p style={{
              fontSize: '14px',
              fontFamily: '"Noto Sans SC", "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
            }}>
            Loading projects...
            </p>
            <style>{`
              @keyframes pulse {
                0%, 100% { opacity: 1; }
                50% { opacity: 0.5; }
              }
            `}</style>
          </div>
        ) : filteredProjects.length === 0 ? (
          !searchQuery && (
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '90px 20px 60px 20px',
              minHeight: '400px'
            }}>
              <img 
                src={thinkingMemeImage} 
                alt="Thinking meme"
                style={{
                  width: '200px',
                  height: 'auto',
                  marginBottom: '24px',
                  filter: theme === 'dark' 
                    ? 'invert(1) grayscale(1) brightness(0.4)' 
                    : 'grayscale(1) brightness(0.6)',
                  transition: 'filter 0.3s ease'
                }}
              />
              <p style={{ 
                fontSize: '16px', 
                color: '#666666',
                fontWeight: 400,
                fontFamily: '"Noto Sans SC", "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
                lineHeight: '1.6',
                textAlign: 'center',
                margin: 0
              }}>
                "Hmm... that pink button must be important..."
              </p>
            </div>
          )
        ) : (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
            gap: '20px'
          }}>
            {filteredProjects.map((project: any) => {
              const lastOpened = new Date(project.updatedAt)
              const firstDoc = project.firstDocument
              const preview = firstDoc && firstDoc.content ? extractPreview(firstDoc.content, 250) : ''
              
              const formatDate = (date: Date): string => {
                const now = new Date()
                const diffMs = now.getTime() - date.getTime()
                const diffMins = Math.floor(diffMs / 60000)
                const diffHours = Math.floor(diffMs / 3600000)
                const diffDays = Math.floor(diffMs / 86400000)
                
                if (diffMins < 1) return 'Just now'
                if (diffMins < 60) return `${diffMins}m ago`
                if (diffHours < 24) return `${diffHours}h ago`
                if (diffDays === 1) return 'Yesterday'
                if (diffDays < 7) return `${diffDays}d ago`
                return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined })
              }
              
              return (
              <div
                  key={project.id}
                  style={{
                  border: `1px solid ${theme === 'dark' ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.08)'}`,
                  borderRadius: '12px',
                    overflow: 'visible',
                  transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                    backgroundColor: theme === 'dark' ? '#0a0a0a' : '#ffffff',
                    boxShadow: theme === 'dark' 
                      ? '0 2px 8px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.05) inset' 
                      : '0 2px 8px rgba(0,0,0,0.08), 0 0 0 1px rgba(0,0,0,0.04) inset',
                    display: 'flex',
                    flexDirection: 'column',
                    position: 'relative',
                    cursor: 'pointer',
                    zIndex: openMenuId === project.id ? 10000 : 1,
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.boxShadow = theme === 'dark' 
                    ? '0 8px 32px rgba(244, 114, 182, 0.12), 0 8px 24px rgba(0,0,0,0.6), 0 0 0 1px rgba(244, 114, 182, 0.2) inset' 
                    : '0 8px 32px rgba(244, 114, 182, 0.1), 0 8px 24px rgba(0,0,0,0.12), 0 0 0 1px rgba(244, 114, 182, 0.15) inset'
                  e.currentTarget.style.transform = 'translateY(-4px)'
                  e.currentTarget.style.borderColor = theme === 'dark' 
                    ? 'rgba(244, 114, 182, 0.3)' 
                    : 'rgba(244, 114, 182, 0.25)'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.boxShadow = theme === 'dark' 
                    ? '0 2px 8px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.05) inset' 
                    : '0 2px 8px rgba(0,0,0,0.08), 0 0 0 1px rgba(0,0,0,0.04) inset'
                  e.currentTarget.style.transform = 'translateY(0)'
                  e.currentTarget.style.borderColor = theme === 'dark' ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.08)'
                }}
              >
                  {/* Preview Section - Google Docs-like aesthetic */}
                <div 
                  onClick={() => handleOpenProject(project.id)}
                  style={{
                    height: '200px',
                    background: theme === 'dark' 
                      ? '#1a1a1a'
                      : '#ffffff',
                    padding: '10px 20px 20px 20px',
                    overflow: 'hidden',
                    display: 'flex',
                    flexDirection: 'column',
                    cursor: 'pointer',
                    position: 'relative',
                    borderTopLeftRadius: '12px',
                    borderTopRightRadius: '12px',
                    borderBottom: `1px solid ${theme === 'dark' ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.05)'}`,
                  }}>
                    {/* Google Docs-like paper effect */}
                    <div style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      right: 0,
                      bottom: 0,
                      background: theme === 'dark'
                        ? 'repeating-linear-gradient(transparent, transparent 31px, rgba(255, 255, 255, 0.03) 31px, rgba(255, 255, 255, 0.03) 32px)'
                        : 'repeating-linear-gradient(transparent, transparent 31px, rgba(0, 0, 0, 0.02) 31px, rgba(0, 0, 0, 0.02) 32px)',
                      pointerEvents: 'none',
                    }} />
                    
                    {/* Document header */}
                    {firstDoc && (
                      <div style={{
                        marginBottom: '8px',
                        position: 'relative',
                        zIndex: 1,
                      }}>
                        <span style={{
                          fontSize: '12px',
                          fontWeight: 500,
                          color: theme === 'dark' ? '#9aa0a6' : '#5f6368',
                          fontFamily: '"Noto Sans SC", "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
                        }}>{firstDoc.title}</span>
                      </div>
                    )}
                    
                    {/* Text preview */}
                    {preview ? (
                      <div style={{
                        fontSize: '13px',
                        color: theme === 'dark' ? '#e8eaed' : '#202124',
                        lineHeight: '1.8',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        display: '-webkit-box',
                        WebkitLineClamp: 8,
                        WebkitBoxOrient: 'vertical',
                        wordBreak: 'break-word',
                        fontFamily: '"Noto Sans SC", "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
                        position: 'relative',
                        zIndex: 1,
                        paddingLeft: '0px',
                        letterSpacing: '0.01em',
                      }}>
                        {preview}
                      </div>
                    ) : (
                      <div style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: '100%',
                        height: '100%',
                        opacity: 0.4,
                        position: 'relative',
                        zIndex: 1,
                      }}>
                        <div style={{
                          fontSize: '48px',
                          marginBottom: '8px',
                        }}>📄</div>
                        <div style={{
                          fontSize: '13px',
                          color: secondaryTextColor,
                          fontFamily: '"Noto Sans SC", "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
                        }}>No content yet</div>
                      </div>
                    )}
                    
                    {/* Fade gradient at bottom */}
                    <div style={{
                      position: 'absolute',
                      bottom: 0,
                      left: 0,
                      right: 0,
                      height: '50px',
                      background: theme === 'dark'
                        ? 'linear-gradient(to top, rgba(26, 26, 26, 1), transparent)'
                        : 'linear-gradient(to top, rgba(255, 255, 255, 1), transparent)',
                      pointerEvents: 'none',
                    }} />
                </div>

                  {/* Title and Date Section */}
                <div style={{
                    padding: '12px 16px',
                    flex: 1,
                  display: 'flex',
                    flexDirection: 'column',
                    gap: '4px',
                    position: 'relative',
                    background: theme === 'dark' ? '#0a0a0a' : '#ffffff',
                    borderBottomLeftRadius: '12px',
                    borderBottomRightRadius: '12px',
                  }}>
                    {/* Title row with three-dot menu */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', position: 'relative' }}>
                      {renamingId === project.id ? (
                        <input
                          type="text"
                          value={renameValue}
                          onChange={(e) => setRenameValue(e.target.value)}
                          onBlur={() => {
                            if (renameValue.trim()) {
                              handleRenameProject(project.id, renameValue)
                            } else {
                              setRenamingId(null)
                              setRenameValue('')
                            }
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              if (renameValue.trim()) {
                                handleRenameProject(project.id, renameValue)
                              }
                            } else if (e.key === 'Escape') {
                              setRenamingId(null)
                              setRenameValue('')
                            }
                          }}
                          autoFocus
                          style={{
                            fontSize: '16px',
                            fontWeight: 600,
                            color: textColor,
                            border: `1px solid ${borderColor}`,
                            borderRadius: '4px',
                            padding: '4px 8px',
                            backgroundColor: brighterBg,
                            outline: 'none',
                            width: 'auto',
                            minWidth: '100px',
                            maxWidth: 'calc(100% - 40px)'
                          }}
                          onClick={(e) => e.stopPropagation()}
                        />
                      ) : (
                        <div 
                          onClick={() => handleOpenProject(project.id)}
                          style={{
                            fontSize: '17px',
                            fontWeight: 600,
                            color: textColor,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            cursor: 'pointer',
                            flex: 1,
                            fontFamily: '"Noto Sans SC", "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
                            transition: 'color 0.2s ease',
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.color = theme === 'dark' ? '#f472b6' : '#ec4899'
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.color = textColor
                          }}
                        >
                          {project.title}
                        </div>
                      )}
                      
                      {/* Three-dot menu button */}
                      <div style={{ position: 'relative', flexShrink: 0, zIndex: openMenuId === project.id ? 10010 : 1 }}>
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            setOpenMenuId(openMenuId === project.id ? null : project.id)
                          }}
                          style={{
                            padding: '4px',
                            border: 'none',
                            backgroundColor: 'transparent',
                            cursor: 'pointer',
                            borderRadius: '6px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: secondaryTextColor,
                            transition: 'all 0.2s ease',
                            width: '28px',
                            height: '28px',
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.backgroundColor = theme === 'dark' ? 'rgba(255, 255, 255, 0.1)' : '#f1f3f4'
                            e.currentTarget.style.color = theme === 'dark' ? '#ffffff' : '#202124'
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.backgroundColor = 'transparent'
                            e.currentTarget.style.color = secondaryTextColor
                          }}
                        >
                          <MoreVertIcon style={{ fontSize: '18px' }} />
                        </button>
                        
                         {/* Dropdown menu */}
                         {openMenuId === project.id && (
                           <div
                             style={{
                               position: 'absolute',
                               top: 'calc(100% + 8px)',
                               left: '50%',
                               transform: 'translateX(-50%)',
                               backgroundColor: dropdownBg,
                               border: `1px solid ${theme === 'dark' ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)'}`,
                               borderRadius: '12px',
                               boxShadow: theme === 'dark' 
                                 ? '0 8px 32px rgba(0,0,0,0.8), 0 0 0 1px rgba(255,255,255,0.05) inset' 
                                 : '0 8px 32px rgba(0,0,0,0.15), 0 0 0 1px rgba(0,0,0,0.05) inset',
                               zIndex: 10010,
                               minWidth: '160px',
                               overflow: 'hidden',
                               padding: '4px',
                               backdropFilter: theme === 'dark' ? 'blur(20px)' : 'blur(10px)',
                               WebkitBackdropFilter: theme === 'dark' ? 'blur(20px)' : 'blur(10px)',
                             }}
                             onClick={(e) => e.stopPropagation()}
                           >
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              setRenamingId(project.id)
                              setRenameValue(project.title)
                              setOpenMenuId(null)
                            }}
                            style={{
                              width: '100%',
                              padding: '10px 16px',
                              border: 'none',
                              background: 'transparent',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              fontSize: '14px',
                              fontFamily: '"Noto Sans SC", "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
                              color: dropdownTextColor,
                              textAlign: 'left',
                              transition: 'all 0.2s ease',
                              borderRadius: '8px',
                              fontWeight: 500,
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.backgroundColor = theme === 'dark' 
                                ? 'rgba(244, 114, 182, 0.15)' 
                                : 'rgba(244, 114, 182, 0.08)'
                              e.currentTarget.style.color = theme === 'dark' ? '#f472b6' : '#ec4899'
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.backgroundColor = 'transparent'
                              e.currentTarget.style.color = dropdownTextColor
                            }}
                          >
                            Rename
                          </button>
                          <div style={{
                            height: '1px',
                            backgroundColor: theme === 'dark' ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)',
                            margin: '4px 8px',
                          }} />
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              handleDeleteProject(project.id)
                            }}
                            style={{
                              width: '100%',
                              padding: '10px 16px',
                              border: 'none',
                              background: 'transparent',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              fontSize: '14px',
                              fontFamily: '"Noto Sans SC", "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
                              color: '#ef4444',
                              textAlign: 'left',
                              transition: 'all 0.2s ease',
                              borderRadius: '8px',
                              fontWeight: 500,
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.backgroundColor = theme === 'dark' 
                                ? 'rgba(239, 68, 68, 0.15)' 
                                : 'rgba(239, 68, 68, 0.08)'
                              e.currentTarget.style.color = '#dc2626'
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.backgroundColor = 'transparent'
                              e.currentTarget.style.color = '#ef4444'
                            }}
                          >
                            Delete
                          </button>
                        </div>
                      )}
                      </div>
                    </div>
                    {project.description && (
                      <div 
                        onClick={() => handleOpenProject(project.id)}
                        style={{
                          fontSize: '13px',
                          color: secondaryTextColor,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          cursor: 'pointer'
                        }}>
                        {project.description}
                      </div>
                    )}
                <div 
                  onClick={() => handleOpenProject(project.id)}
                  style={{
                  fontSize: '13px',
                  color: secondaryTextColor,
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      marginTop: '2px',
                      cursor: 'pointer',
                      fontFamily: '"Noto Sans SC", "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
                }}>
                      <span style={{ fontWeight: 500 }}>{project.actualDocumentCount ?? project.documentIds?.length ?? 0} {project.actualDocumentCount === 1 ? 'file' : 'files'}</span>
                      <span style={{ opacity: 0.5 }}>•</span>
                      <span>{formatDate(lastOpened)}</span>
                    </div>
                </div>
              </div>
              )
            })}
          </div>
        )}
        </div>
      </div>

      {/* Delete Confirmation Dialog */}
      {deleteConfirmProjectId && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10000,
          }}
          onClick={cancelDeleteProject}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              backgroundColor: dropdownBg,
              border: `1px solid ${dropdownBorder}`,
              borderRadius: '8px',
              padding: '24px',
              minWidth: '400px',
              maxWidth: '500px',
              boxShadow: theme === 'dark' ? '0 4px 20px rgba(0,0,0,0.5)' : '0 4px 20px rgba(0,0,0,0.15)',
            }}
          >
            <h2
              style={{
                margin: '0 0 12px 0',
                fontSize: '18px',
                fontWeight: 500,
                color: textColor,
                fontFamily: '"Noto Sans SC", "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
              }}
            >
              Delete Project
            </h2>
            <p
              style={{
                margin: '0 0 24px 0',
                fontSize: '14px',
                color: secondaryTextColor,
                lineHeight: '1.5',
                fontFamily: '"Noto Sans SC", "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
              }}
            >
              Are you sure you want to delete this project? This action cannot be undone.
            </p>
            <div
              style={{
                display: 'flex',
                gap: '8px',
                justifyContent: 'flex-end',
              }}
            >
              <button
                onClick={cancelDeleteProject}
                style={{
                  padding: '8px 16px',
                  border: `1px solid ${dropdownBorder}`,
                  borderRadius: '4px',
                  backgroundColor: 'transparent',
                  color: dropdownTextColor,
                  cursor: 'pointer',
                  fontSize: '13px',
                  fontFamily: '"Noto Sans SC", "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
                  transition: 'background-color 0.15s',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = dropdownHoverBg
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'transparent'
                }}
              >
                Cancel
              </button>
              <button
                onClick={confirmDeleteProject}
                style={{
                  padding: '8px 16px',
                  border: 'none',
                  borderRadius: '4px',
                  backgroundColor: '#d32f2f',
                  color: '#ffffff',
                  cursor: 'pointer',
                  fontSize: '13px',
                  fontFamily: '"Noto Sans SC", "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
                  transition: 'background-color 0.15s',
                  fontWeight: 500,
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = '#b71c1c'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = '#d32f2f'
                }}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
