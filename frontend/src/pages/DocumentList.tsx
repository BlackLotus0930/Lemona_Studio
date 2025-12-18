import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Project } from '@shared/types'
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
  const navigate = useNavigate()
  
  const bgColor = theme === 'dark' ? '#141414' : '#ffffff'
  const brighterBg = theme === 'dark' ? '#181818' : '#f1f3f4'
  const borderColor = theme === 'dark' ? '#2d2d2d' : '#dadce0'
  const textColor = theme === 'dark' ? '#D6D6DD' : '#202124'
  const secondaryTextColor = theme === 'dark' ? '#858585' : '#5f6368'
  
  // Dropdown menu colors (matching FileExplorer)
  const dropdownBg = theme === 'dark' ? '#141414' : '#ffffff'
  const dropdownBorder = theme === 'dark' ? '#202020' : '#dadce0'
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
      
      // Load first document for each project for preview
      const projectsWithPreviews = await Promise.all(
        sortedProjects.map(async (project: any) => {
    try {
            const docs = await projectApi.getDocuments(project.id)
            return { ...project, firstDocument: docs[0] || null }
          } catch {
            return { ...project, firstDocument: null }
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
      
      // Get first document in project
      const documents = await projectApi.getDocuments(projectId)
      if (documents.length > 0) {
        navigate(`/document/${documents[0].id}`)
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

  const handleDeleteProject = async (projectId: string) => {
    if (!confirm('Are you sure you want to delete this project? This action cannot be undone.')) {
      return
    }
    
    try {
      await projectApi.delete(projectId)
      setProjects(prev => prev.filter(p => p.id !== projectId))
      setOpenMenuId(null)
    } catch (error) {
      console.error('Failed to delete project:', error)
      alert('Failed to delete project. Please try again.')
    }
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
      minHeight: '100vh',
      backgroundColor: bgColor
    }}>
      {/* Top Navigation Bar */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        height: '32px',
        padding: '0 8px',
        borderBottom: `1px solid ${borderColor}`,
        backgroundColor: bgColor,
        userSelect: 'none',
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
              fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif"
            }}>Lemona</span>
          </button>

          {/* Search Bar */}
          <div style={{
            flex: 1,
            maxWidth: '720px',
            margin: '0 auto',
            position: 'relative'
          }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              backgroundColor: brighterBg,
              borderRadius: '4px',
              padding: '4px 8px',
              gap: '8px',
              height: '24px'
            }}>
              <SearchIcon style={{ fontSize: '14px', color: secondaryTextColor }} />
              <input
                type="text"
                placeholder="Search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{
                  border: 'none',
                  background: 'transparent',
                  outline: 'none',
                  flex: 1,
                  fontSize: '13px',
                  color: textColor
                }}
              />
            </div>
          </div>
        </div>

        {/* Right side - Window Controls */}
        {/* @ts-ignore */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0', WebkitAppRegion: 'no-drag' }}>
          {typeof window !== 'undefined' && window.electron && window.electron.platform !== 'darwin' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0', marginRight: '4px' }}>
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
                  <rect x="0" y="5" width="12" height="1" fill="currentColor" />
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
                  <rect x="1" y="1" width="10" height="10" fill="none" stroke="currentColor" strokeWidth="1" />
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
                  <path d="M1 1 L11 11 M11 1 L1 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Main Content */}
      <div style={{
        maxWidth: '1200px',
        margin: '0 auto',
        padding: '32px 24px',
        minHeight: 'calc(100vh - 60px)'
      }}>
        {/* Header */}
        <div style={{
          marginBottom: '24px'
        }}>
          <h1 style={{ fontSize: '24px', fontWeight: 600, color: textColor, margin: 0 }}>
            Projects
          </h1>
        </div>

        {/* Floating + button at bottom-right */}
        <button
          onClick={() => setIsCreatingProject(true)}
          style={{
            position: 'fixed',
            bottom: '32px',
            right: '32px',
            width: '56px',
            height: '56px',
            borderRadius: '50%',
            border: 'none',
            backgroundColor: '#1a73e8',
            color: 'white',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 4px 12px rgba(26, 115, 232, 0.4)',
            transition: 'all 0.2s ease',
            zIndex: 1000
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = 'scale(1.1)'
            e.currentTarget.style.boxShadow = '0 6px 16px rgba(26, 115, 232, 0.5)'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'scale(1)'
            e.currentTarget.style.boxShadow = '0 4px 12px rgba(26, 115, 232, 0.4)'
          }}
        >
          <AddIcon style={{ fontSize: '32px' }} />
        </button>

        {/* Project creation modal */}
        {isCreatingProject && (
        <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
            zIndex: 10000
          }}
          onClick={() => setIsCreatingProject(false)}
          >
            <div style={{
              backgroundColor: bgColor,
              borderRadius: '8px',
              padding: '24px',
              width: '400px',
              maxWidth: '90%',
              border: `1px solid ${borderColor}`
            }}
            onClick={(e) => e.stopPropagation()}
            >
              <h2 style={{ fontSize: '18px', fontWeight: 600, color: textColor, marginBottom: '16px' }}>
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
                  padding: '12px',
                  fontSize: '14px',
                  border: `1px solid ${borderColor}`,
                  borderRadius: '4px',
                  backgroundColor: brighterBg,
                  color: textColor,
                  outline: 'none',
                  marginBottom: '16px'
                }}
              />
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                <button
                  onClick={() => {
                    setIsCreatingProject(false)
                    setNewProjectName('')
                  }}
                  style={{
                    padding: '8px 16px',
                    border: `1px solid ${borderColor}`,
                    borderRadius: '4px',
                    backgroundColor: 'transparent',
                    color: textColor,
                    cursor: 'pointer',
                    fontSize: '14px'
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={handleCreateProject}
                  disabled={!newProjectName.trim()}
                  style={{
                    padding: '8px 16px',
                    border: 'none',
                    borderRadius: '4px',
                    backgroundColor: newProjectName.trim() ? '#1a73e8' : borderColor,
                    color: 'white',
                    cursor: newProjectName.trim() ? 'pointer' : 'not-allowed',
                    fontSize: '14px',
                    fontWeight: 500
                  }}
                >
                  Create
                </button>
              </div>
            </div>
            </div>
          )}

        {isLoading ? (
          <div style={{ textAlign: 'center', padding: '40px', color: secondaryTextColor }}>
            Loading projects...
          </div>
        ) : filteredProjects.length === 0 ? (
          <div style={{
            textAlign: 'center',
            padding: '80px 20px',
            color: secondaryTextColor
          }}>
            <div style={{
              fontSize: '48px',
              marginBottom: '16px'
            }}>📁</div>
            <h2 style={{ fontSize: '18px', fontWeight: 400, marginBottom: '8px', color: textColor }}>
              {searchQuery ? 'No projects found' : 'No projects yet'}
            </h2>
            {!searchQuery && (
              <p style={{ fontSize: '14px', color: secondaryTextColor, marginBottom: '24px' }}>
                Click the + button to create your first project
              </p>
            )}
          </div>
        ) : (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
            gap: '16px'
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
                  border: `1px solid ${borderColor}`,
                  borderRadius: '4px',
                    overflow: 'visible',
                  transition: 'all 0.2s ease',
                    backgroundColor: theme === 'dark' ? '#181818' : '#ffffff',
                    boxShadow: theme === 'dark' ? '0 1px 3px rgba(0,0,0,0.3)' : '0 1px 2px rgba(60,64,67,0.08)',
                    display: 'flex',
                    flexDirection: 'column',
                    position: 'relative'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.boxShadow = theme === 'dark' ? '0 4px 12px rgba(0,0,0,0.6)' : '0 4px 12px rgba(60,64,67,0.15)'
                  e.currentTarget.style.transform = 'translateY(-2px)'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.boxShadow = theme === 'dark' ? '0 1px 3px rgba(0,0,0,0.3)' : '0 1px 2px rgba(60,64,67,0.08)'
                  e.currentTarget.style.transform = 'translateY(0)'
                }}
              >
                  {/* Preview Section - Shows first document content */}
                <div 
                  onClick={() => handleOpenProject(project.id)}
                  style={{
                    height: '200px',
                    backgroundColor: theme === 'dark' ? '#1e1e1e' : '#f8f9fa',
                    padding: '12px',
                  overflow: 'hidden',
                  display: 'flex',
                    alignItems: 'flex-start',
                    cursor: 'pointer'
                  }}>
                    {preview ? (
                      <div style={{
                        fontSize: '12px',
                        color: theme === 'dark' ? '#cccccc' : '#5f6368',
                        lineHeight: '1.4',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        display: '-webkit-box',
                        WebkitLineClamp: 6,
                        WebkitBoxOrient: 'vertical',
                        wordBreak: 'break-word'
                }}>
                        {preview}
                      </div>
                    ) : (
                      <div style={{
                        fontSize: '32px',
                        color: secondaryTextColor,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: '100%',
                        height: '100%'
                      }}>📄</div>
                    )}
                </div>

                  {/* Title and Date Section */}
                <div style={{
                    padding: '16px',
                    flex: 1,
                  display: 'flex',
                    flexDirection: 'column',
                    gap: '8px',
                    position: 'relative'
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
                            flex: 1
                          }}
                          onClick={(e) => e.stopPropagation()}
                        />
                      ) : (
                        <div 
                          onClick={() => handleOpenProject(project.id)}
                          style={{
                            fontSize: '16px',
                            fontWeight: 600,
                            color: textColor,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            cursor: 'pointer',
                            flex: 1
                          }}>
                          {project.title}
                        </div>
                      )}
                      
                      {/* Three-dot menu button */}
                      <div style={{ position: 'relative', flexShrink: 0 }}>
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            setOpenMenuId(openMenuId === project.id ? null : project.id)
                          }}
                          style={{
                            padding: '2px',
                            border: 'none',
                            backgroundColor: 'transparent',
                            cursor: 'pointer',
                            borderRadius: '4px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: secondaryTextColor,
                            transition: 'background-color 0.15s'
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.backgroundColor = theme === 'dark' ? '#2d2d2d' : '#f1f3f4'
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.backgroundColor = 'transparent'
                          }}
                        >
                          <MoreVertIcon style={{ fontSize: '18px' }} />
                        </button>
                        
                         {/* Dropdown menu */}
                         {openMenuId === project.id && (
                           <div
                             style={{
                               position: 'absolute',
                               top: 'calc(100% + 4px)',
                               right: '0',
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
                            onClick={(e) => {
                              e.stopPropagation()
                              setRenamingId(project.id)
                              setRenameValue(project.title)
                              setOpenMenuId(null)
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
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              handleDeleteProject(project.id)
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
                  fontSize: '12px',
                  color: secondaryTextColor,
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      marginTop: 'auto',
                      cursor: 'pointer'
                }}>
                      <span>📄</span>
                      <span>{project.documentIds.length} files</span>
                      <span>•</span>
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
  )
}

export default DocumentList
