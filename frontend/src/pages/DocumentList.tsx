import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Project, Document } from '@shared/types'
import { documentApi, projectApi } from '../services/api'
import { useTheme } from '../contexts/ThemeContext'
// @ts-ignore
import SearchIcon from '@mui/icons-material/Search'
// @ts-ignore
import AddIcon from '@mui/icons-material/Add'
// @ts-ignore
import MoreVertIcon from '@mui/icons-material/MoreVert'

function DocumentList() {
  const { theme } = useTheme()
  const [projects, setProjects] = useState<Project[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [isCreatingProject, setIsCreatingProject] = useState(false)
  const [newProjectName, setNewProjectName] = useState('')
  const [openMenuId, setOpenMenuId] = useState<string | null>(null)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [deleteConfirmProjectId, setDeleteConfirmProjectId] = useState<string | null>(null)
  const navigate = useNavigate()
  
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
    loadProjects()
  }, [])

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
      
      // Load first document for each project for preview and get actual document count
      const projectsWithPreviews = await Promise.all(
        sortedProjects.map(async (project: any) => {
    try {
            const docs = await projectApi.getDocuments(project.id)
            return { ...project, firstDocument: docs[0] || null, actualDocumentCount: docs.length }
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
    if (!newProjectName.trim()) {
      return
    }
    
    try {
      // Create project
      const project = await projectApi.create(newProjectName.trim())
      
      // Create README.md document as the first document
      const readmeDoc = await documentApi.create('README.md')
      
      // Add README.md to project
      await projectApi.addDocument(project.id, readmeDoc.id, 0)
      
      // Update projects list
      setProjects(prev => [project, ...prev])
      setIsCreatingProject(false)
      setNewProjectName('')
      
      // Navigate to README.md
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

  // Extract text preview from TipTap content
  const extractPreview = (content: string, maxLength: number = 150): string => {
    try {
      const parsed = JSON.parse(content)
      const extractText = (node: any): string => {
        if (typeof node === 'string') return node
        if (node.type === 'text') return node.text || ''
            if (node.content && Array.isArray(node.content)) {
          return node.content.map(extractText).join('')
            }
        return ''
      }
      const text = extractText(parsed)
      return text.length > maxLength ? text.substring(0, maxLength) + '...' : text
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
      await projectApi.update(projectId, { title: newTitle.trim() })
      setProjects(prev => prev.map(p => p.id === projectId ? { ...p, title: newTitle.trim() } : p))
      setRenamingId(null)
      setRenameValue('')
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
              src="/lemonalogo.png" 
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
          padding: '32px 24px',
        }}>
        {/* Header */}
        <div style={{
          marginBottom: '32px',
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
              fontSize: '32px', 
              fontWeight: 700, 
              color: '#FFFFFF',
              margin: 0,
              marginBottom: '4px',
              fontFamily: '"Noto Sans SC", "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
            } as React.CSSProperties}>
              Projects
            </h1>
            <p style={{
              fontSize: '14px',
              color: secondaryTextColor,
              margin: 0,
              fontFamily: '"Noto Sans SC", "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
            }}>
              {filteredProjects.length} {filteredProjects.length === 1 ? 'project' : 'projects'}
            </p>
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
          onClick={() => setIsCreatingProject(true)}
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

        {/* Project creation modal */}
        {isCreatingProject && (
        <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: theme === 'dark'
              ? 'radial-gradient(circle at center, rgba(244, 114, 182, 0.15) 0%, rgba(0, 0, 0, 0.85) 100%)'
              : 'radial-gradient(circle at center, rgba(244, 114, 182, 0.1) 0%, rgba(0, 0, 0, 0.5) 100%)',
            backdropFilter: 'blur(2px)',
            WebkitBackdropFilter: 'blur(2px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
            zIndex: 10000,
            animation: 'modalBackdropFadeIn 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
          }}
          onClick={() => setIsCreatingProject(false)}
          >
          <style>{`
            @keyframes modalBackdropFadeIn {
              from { 
                opacity: 0;
              }
              to { 
                opacity: 1;
              }
            }
            
            @keyframes modalEnter {
              from { 
                opacity: 0;
              }
              to { 
                opacity: 1;
              }
            }
            
            @keyframes shimmer {
              0% {
                background-position: -200% center;
              }
              100% {
                background-position: 200% center;
              }
            }
            
            @keyframes float {
              0%, 100% {
                transform: translateY(0px);
              }
              50% {
                transform: translateY(-10px);
              }
            }
            
            @keyframes sparkle {
              0%, 100% {
                opacity: 0;
                transform: scale(0) rotate(0deg);
              }
              50% {
                opacity: 1;
                transform: scale(1) rotate(180deg);
              }
            }
            
            @keyframes glow-pulse {
              0%, 100% {
                box-shadow: 0 0 20px rgba(244, 114, 182, 0.4),
                            0 0 40px rgba(244, 114, 182, 0.2),
                            0 20px 60px rgba(0, 0, 0, 0.5),
                            0 0 0 1px rgba(255, 255, 255, 0.05) inset;
              }
              50% {
                box-shadow: 0 0 30px rgba(244, 114, 182, 0.6),
                            0 0 60px rgba(244, 114, 182, 0.3),
                            0 20px 80px rgba(0, 0, 0, 0.6),
                            0 0 0 1px rgba(255, 255, 255, 0.08) inset;
              }
            }
          `}</style>
          
          {/* Floating sparkles */}
            <div style={{
            position: 'absolute',
            top: '30%',
            left: '30%',
            width: '8px',
            height: '8px',
            background: 'radial-gradient(circle, #fce7f3 0%, transparent 70%)',
            borderRadius: '50%',
            animation: 'sparkle 2s ease-in-out infinite',
            animationDelay: '0s',
            pointerEvents: 'none',
          }} />
          <div style={{
            position: 'absolute',
            top: '40%',
            right: '25%',
            width: '6px',
            height: '6px',
            background: 'radial-gradient(circle, #fbcfe8 0%, transparent 70%)',
            borderRadius: '50%',
            animation: 'sparkle 2.5s ease-in-out infinite',
            animationDelay: '0.5s',
            pointerEvents: 'none',
          }} />
          <div style={{
            position: 'absolute',
            bottom: '35%',
            left: '35%',
            width: '10px',
            height: '10px',
            background: 'radial-gradient(circle, #f9a8d4 0%, transparent 70%)',
            borderRadius: '50%',
            animation: 'sparkle 3s ease-in-out infinite',
            animationDelay: '1s',
            pointerEvents: 'none',
          }} />
          <div style={{
            position: 'absolute',
            top: '50%',
            left: '20%',
            width: '7px',
            height: '7px',
            background: 'radial-gradient(circle, #f472b6 0%, transparent 70%)',
            borderRadius: '50%',
            animation: 'sparkle 2.8s ease-in-out infinite',
            animationDelay: '1.5s',
            pointerEvents: 'none',
          }} />
          <div style={{
            position: 'absolute',
            bottom: '45%',
            right: '30%',
            width: '9px',
            height: '9px',
            background: 'radial-gradient(circle, #ec4899 0%, transparent 70%)',
            borderRadius: '50%',
            animation: 'sparkle 2.2s ease-in-out infinite',
            animationDelay: '0.8s',
            pointerEvents: 'none',
          }} />
          
            <div style={{
              position: 'relative',
              backgroundColor: bgColor,
              borderRadius: '20px',
              padding: '40px',
              width: '480px',
              maxWidth: '90%',
              border: `2px solid transparent`,
              backgroundImage: theme === 'dark'
                ? `linear-gradient(${bgColor}, ${bgColor}), linear-gradient(90deg, #fce7f3, #fbcfe8, #f9a8d4, #f472b6, #ec4899, #f472b6, #f9a8d4, #fbcfe8, #fce7f3)`
                : `linear-gradient(${bgColor}, ${bgColor}), linear-gradient(90deg, #fce7f3, #fbcfe8, #f9a8d4, #f472b6, #ec4899, #f472b6, #f9a8d4, #fbcfe8, #fce7f3)`,
              backgroundOrigin: 'border-box',
              backgroundClip: 'padding-box, border-box',
              backgroundSize: 'auto, 200% 100%',
              animation: theme === 'dark'
                ? 'modalEnter 0.4s ease-out, shimmer 3s linear infinite, glow-pulse 3s ease-in-out infinite'
                : 'modalEnter 0.4s ease-out, shimmer 3s linear infinite',
              boxShadow: theme === 'dark' 
                ? '0 0 20px rgba(244, 114, 182, 0.4), 0 0 40px rgba(244, 114, 182, 0.2), 0 20px 60px rgba(0, 0, 0, 0.5)' 
                : '0 0 20px rgba(244, 114, 182, 0.3), 0 0 40px rgba(244, 114, 182, 0.15), 0 20px 60px rgba(0, 0, 0, 0.15)',
              transformStyle: 'preserve-3d',
              perspective: '1000px',
            } as React.CSSProperties}
            onClick={(e) => e.stopPropagation()}
            >
              <h2 style={{ 
                fontSize: '28px', 
                fontWeight: 700, 
                background: 'linear-gradient(90deg, #fce7f3 0%, #fbcfe8 30%, #f9a8d4 60%, #fbcfe8 100%)',
                backgroundSize: '200% 200%',
                animation: 'gradient-flow 4s ease infinite',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
                marginBottom: '28px',
                fontFamily: '"Noto Sans SC", "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
                textAlign: 'center',
                letterSpacing: '-0.5px',
                position: 'relative',
                textShadow: '0 0 30px rgba(252, 231, 243, 0.4)',
              } as React.CSSProperties}>
                New Project
              </h2>
              <input
                type="text"
                placeholder="Project name"
                value={newProjectName}
                onChange={(e) => setNewProjectName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleCreateProject()
                  } else if (e.key === 'Escape') {
                    setIsCreatingProject(false)
                    setNewProjectName('')
                  }
                }}
                autoFocus
                style={{
                  width: '100%',
                  padding: '16px 20px',
                  fontSize: '16px',
                  border: `2px solid ${theme === 'dark' ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)'}`,
                  borderRadius: '12px',
                  backgroundColor: brighterBg,
                  color: textColor,
                  outline: 'none',
                  marginBottom: '28px',
                  fontFamily: '"Noto Sans SC", "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
                  transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                  boxShadow: theme === 'dark' 
                    ? '0 2px 8px rgba(0,0,0,0.3)' 
                    : '0 2px 8px rgba(0,0,0,0.08)',
                }}
                onFocus={() => {
                  // Keep the same styling when focused - no pink effects
                }}
                onBlur={() => {
                  // Keep the same styling when blurred
                }}
              />
              <div style={{ display: 'flex', justifyContent: 'center', gap: '16px' }}>
                <button
                  onClick={() => {
                    setIsCreatingProject(false)
                    setNewProjectName('')
                  }}
                  style={{
                    padding: '12px 28px',
                    border: `2px solid ${theme === 'dark' ? 'rgba(255, 255, 255, 0.15)' : 'rgba(0, 0, 0, 0.15)'}`,
                    borderRadius: '12px',
                    backgroundColor: 'transparent',
                    color: textColor,
                    cursor: 'pointer',
                    fontSize: '15px',
                    fontWeight: 600,
                    fontFamily: '"Noto Sans SC", "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
                    transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                    position: 'relative',
                    overflow: 'hidden',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = theme === 'dark' ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.08)'
                    e.currentTarget.style.transform = 'translateY(-2px)'
                    e.currentTarget.style.boxShadow = theme === 'dark' 
                      ? '0 4px 12px rgba(0, 0, 0, 0.3)'
                      : '0 4px 12px rgba(0, 0, 0, 0.1)'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = 'transparent'
                    e.currentTarget.style.transform = 'translateY(0)'
                    e.currentTarget.style.boxShadow = 'none'
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={handleCreateProject}
                  disabled={!newProjectName.trim()}
                  style={{
                    padding: '12px 32px',
                    border: 'none',
                    borderRadius: '12px',
                    background: newProjectName.trim() 
                      ? 'linear-gradient(135deg, #f472b6 0%, #ec4899 50%, #fb7185 100%)'
                      : borderColor,
                    color: 'white',
                    cursor: newProjectName.trim() ? 'pointer' : 'not-allowed',
                    fontSize: '15px',
                    fontWeight: 700,
                    fontFamily: '"Noto Sans SC", "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
                    transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                    boxShadow: newProjectName.trim() 
                      ? theme === 'dark'
                        ? '0 8px 24px rgba(244, 114, 182, 0.5), 0 0 20px rgba(244, 114, 182, 0.3)'
                        : '0 8px 24px rgba(244, 114, 182, 0.4), 0 0 20px rgba(244, 114, 182, 0.2)'
                      : 'none',
                    opacity: newProjectName.trim() ? 1 : 0.5,
                    position: 'relative',
                    overflow: 'hidden',
                  }}
                  onMouseEnter={(e) => {
                    if (newProjectName.trim()) {
                      e.currentTarget.style.transform = 'translateY(-2px) scale(1.05)'
                      e.currentTarget.style.boxShadow = theme === 'dark'
                        ? '0 12px 32px rgba(244, 114, 182, 0.6), 0 0 30px rgba(244, 114, 182, 0.4)'
                        : '0 12px 32px rgba(244, 114, 182, 0.5), 0 0 30px rgba(244, 114, 182, 0.3)'
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (newProjectName.trim()) {
                      e.currentTarget.style.transform = 'translateY(0) scale(1)'
                      e.currentTarget.style.boxShadow = theme === 'dark'
                        ? '0 8px 24px rgba(244, 114, 182, 0.5), 0 0 20px rgba(244, 114, 182, 0.3)'
                        : '0 8px 24px rgba(244, 114, 182, 0.4), 0 0 20px rgba(244, 114, 182, 0.2)'
                    }
                  }}
                >
                  Create
                </button>
              </div>
            </div>
            </div>
          )}

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
          <div style={{
            textAlign: 'center',
            padding: '60px 20px',
            color: secondaryTextColor
          }}>
            <h2 style={{ 
              fontSize: '24px', 
              fontWeight: 600, 
              marginBottom: '12px', 
              color: textColor,
              fontFamily: '"Noto Sans SC", "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
            }}>
              {searchQuery ? 'No projects found' : 'No projects yet'}
            </h2>
            {!searchQuery && (
              <p style={{ 
                fontSize: '15px', 
                color: secondaryTextColor, 
                marginBottom: '32px',
                fontFamily: '"Noto Sans SC", "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
                lineHeight: '1.6',
              }}>
                Click the beautiful pink button below to create your first project
              </p>
            )}
          </div>
        ) : (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
            gap: '20px'
          }}>
            {filteredProjects.map((project: any) => {
              const lastOpened = new Date(project.updatedAt)
              const firstDoc = project.firstDocument
              const preview = firstDoc ? extractPreview(firstDoc.content, 200) : ''
              
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
                  {/* Preview Section - Shows first document content */}
                <div 
                  onClick={() => handleOpenProject(project.id)}
                  style={{
                    height: '180px',
                    background: theme === 'dark' 
                      ? 'linear-gradient(135deg, #1e1e1e 0%, #252525 100%)'
                      : 'linear-gradient(135deg, #f8f9fa 0%, #ffffff 100%)',
                    padding: '16px',
                  overflow: 'hidden',
                  display: 'flex',
                    alignItems: 'flex-start',
                    cursor: 'pointer',
                    position: 'relative',
                    borderTopLeftRadius: '12px',
                    borderTopRightRadius: '12px',
                  }}>
                    {/* Subtle gradient overlay */}
                    <div style={{
                      position: 'absolute',
                      bottom: 0,
                      left: 0,
                      right: 0,
                      height: '40px',
                      background: theme === 'dark'
                        ? 'linear-gradient(to top, rgba(24, 24, 24, 1), transparent)'
                        : 'linear-gradient(to top, rgba(255, 255, 255, 1), transparent)',
                      pointerEvents: 'none',
                    }} />
                    {preview ? (
                      <div style={{
                        fontSize: '13px',
                        color: theme === 'dark' ? '#d1d5db' : '#4b5563',
                        lineHeight: '1.6',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        display: '-webkit-box',
                        WebkitLineClamp: 7,
                        WebkitBoxOrient: 'vertical',
                        wordBreak: 'break-word',
                        fontFamily: '"Noto Sans SC", "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
                        position: 'relative',
                        zIndex: 1,
                }}>
                        {preview}
                      </div>
                    ) : (
                      <div style={{
                        fontSize: '48px',
                        color: secondaryTextColor,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: '100%',
                        height: '100%',
                        opacity: 0.5,
                      }}>📄</div>
                    )}
                </div>

                  {/* Title and Date Section */}
                <div style={{
                    padding: '16px',
                    flex: 1,
                  display: 'flex',
                    flexDirection: 'column',
                    gap: '6px',
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
                      marginTop: '3px',
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

export default DocumentList
