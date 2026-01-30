import { useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { Project, Document, IndexingStatus } from '@shared/types'
import { documentApi, projectApi } from '../services/api'
import { indexingApi, settingsApi } from '../services/desktop-api'
import { useTheme } from '../contexts/ThemeContext'
// @ts-ignore
import SearchIcon from '@mui/icons-material/Search'
// @ts-ignore
import MoreHorizIcon from '@mui/icons-material/MoreHoriz'
// @ts-ignore
import ImageOutlinedIcon from '@mui/icons-material/ImageOutlined'
// @ts-ignore
import ImageNotSupportedOutlinedIcon from '@mui/icons-material/ImageNotSupportedOutlined'
// @ts-ignore
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline'
import logoImage from '../assets/lemonalogo.png'

const FIRST_PROJECT_DOC_TITLE = 'Lemona'
const FIRST_PROJECT_WORLDLAB_TITLE = 'New world 1.lab'
const FIRST_PROJECT_WELCOME_CONTENT = {
  type: 'doc',
  content: [
    {
      type: 'heading',
      attrs: { level: 1 },
      content: [{ type: 'text', text: 'Welcome to Lemona' }],
    },
    {
      type: 'paragraph',
      content: [{ type: 'text', text: 'Three spaces' }],
    },
    {
      type: 'orderedList',
      content: [
        {
          type: 'listItem',
          content: [
            { 
              type: 'paragraph', 
              content: [
                { type: 'text', text: '🌍 World Lab' }
              ] 
            },
            {
              type: 'bulletList',
              content: [
                {
                  type: 'listItem',
                  content: [
                    { 
                      type: 'paragraph', 
                      content: [
                        { type: 'text', text: 'A playground for exploring and developing your ideas.' }
                      ] 
                    },
                  ],
                },
              ],
            },
          ],
        },
        {
          type: 'listItem',
          content: [
            { 
              type: 'paragraph', 
              content: [
                { type: 'text', text: '📚 Library' }
              ] 
            },
            {
              type: 'bulletList',
              content: [
                {
                  type: 'listItem',
                  content: [
                    { 
                      type: 'paragraph', 
                      content: [
                        { type: 'text', text: 'Store and organize your reference files (PDF, DOCX, and more).' }
                      ] 
                    },
                  ],
                },
              ],
            },
          ],
        },
        {
          type: 'listItem',
          content: [
            { 
              type: 'paragraph', 
              content: [
                { type: 'text', text: '📝 Workspace' }
              ] 
            },
            {
              type: 'bulletList',
              content: [
                {
                  type: 'listItem',
                  content: [
                    { 
                      type: 'paragraph', 
                      content: [
                        { type: 'text', text: 'Write and edit your documents. You can also upload DOCX files here to continue working on them.' }
                      ] 
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    },
    {
      type: 'horizontalRule',
    },
    {
      type: 'heading',
      attrs: { level: 3 },
      content: [{ type: 'text', text: 'Quick ways to get started' }],
    },
    {
      type: 'bulletList',
      content: [
        {
          type: 'listItem',
          content: [
            { type: 'paragraph', content: [{ type: 'text', text: 'Type / to open commands and formatting options' }] },
          ],
        },
        {
          type: 'listItem',
          content: [
            { type: 'paragraph', content: [{ type: 'text', text: 'Select text to improve or rewrite it' }] },
          ],
        },
        {
          type: 'listItem',
          content: [
            { type: 'paragraph', content: [{ type: 'text', text: 'Press Ctrl + Shift + E to toggle the file explorer' }] },
          ],
        },
        {
          type: 'listItem',
          content: [
            { type: 'paragraph', content: [{ type: 'text', text: 'Press Ctrl + S to save and index all Workspace files' }] },
          ],
        },
      ],
    },
    {
      type: 'paragraph',
      content: [{ type: 'text', text: 'You are all set up! Hope you enjoy!' }],
    },
  ],
}

export default function DocumentList() {
  const { theme } = useTheme()
  const [projects, setProjects] = useState<Project[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [openMenuId, setOpenMenuId] = useState<string | null>(null)
  const [hoveredProjectId, setHoveredProjectId] = useState<string | null>(null)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [deleteConfirmProjectId, setDeleteConfirmProjectId] = useState<string | null>(null)
  const navigate = useNavigate()
  const location = useLocation()
  
  const bgColor = theme === 'dark' ? '#141414' : '#ffffff'
  const brighterBg = theme === 'dark' ? '#1c1c1c' : '#f1f3f4'
  const borderColor = theme === 'dark' ? '#2a2a2a' : '#dadce0'
  const textColor = theme === 'dark' ? '#e6e6e6' : '#202124'
  const secondaryTextColor = theme === 'dark' ? '#9aa0a6' : '#5f6368'
  
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

  // Clear last opened document when user is on home page and app closes
  // This ensures that if user quits from home page, app won't auto-open project on next launch
  useEffect(() => {
    const handleWindowWillClose = () => {
      // Clear last opened document so app starts at home page next time
      try {
        localStorage.removeItem('lastOpenedDocument')
      } catch (error) {
        console.error('Failed to clear last opened document:', error)
      }
    }

    // Listen for window-will-close event from Electron main process
    if (window.electron) {
      const unsubscribe = window.electron.on('window-will-close', handleWindowWillClose)
      return () => {
        if (unsubscribe) unsubscribe()
      }
    }
    
    // Fallback to beforeunload for non-Electron environments (e.g., web)
    const handleBeforeUnload = () => {
      try {
        localStorage.removeItem('lastOpenedDocument')
      } catch (error) {
        console.error('Failed to clear last opened document:', error)
      }
    }
    
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload)
    }
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
      
      // Load first workspace document for each project for preview and get actual document count
      const projectsWithPreviews = await Promise.all(
        sortedProjects.map(async (project: any) => {
    try {
            const docs = await projectApi.getDocuments(project.id)
            // Filter to get first workspace file
            const workspaceDocs = docs.filter((doc: any) => 
              (!doc.folder || doc.folder === 'project')
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
      const isFirstProject = projects.length === 0
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
      
      // Create a new file in workspace folder (project folder)
      // Generate unique name "Chapter X" based on existing workspace documents in this project
      // Get documents for this project to check for existing "Chapter X" names
      const projectDocs = await projectApi.getDocuments(project.id)
      const workspaceDocs = projectDocs.filter((doc: Document) => 
        (!doc.folder || doc.folder === 'project')
      )
      
      // Check existing titles to find next available "Chapter X" number
      const existingTitles = workspaceDocs.map((doc: Document) => doc.title.toLowerCase())
      let chapterNumber = 1
      while (existingTitles.includes(`chapter ${chapterNumber}`)) {
        chapterNumber++
      }
      
      const newFileName = isFirstProject ? FIRST_PROJECT_DOC_TITLE : `Chapter ${chapterNumber}`
      const workspaceDoc = await documentApi.create(newFileName, 'project')

      if (isFirstProject) {
        await documentApi.update(workspaceDoc.id, JSON.stringify(FIRST_PROJECT_WELCOME_CONTENT))
        const worldLabDoc = await documentApi.create(FIRST_PROJECT_WORLDLAB_TITLE, 'worldlab')
        await projectApi.addDocument(project.id, worldLabDoc.id, 1)
      }
      
      // Add workspace file to project
      await projectApi.addDocument(project.id, workspaceDoc.id, 0)
      
      // Update projects list
      setProjects(prev => [project, ...prev])
      
      // Navigate to the workspace document
      navigate(`/document/${workspaceDoc.id}`)
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
      settingsApi.getSmartIndexing().then((smartIndexingEnabled) => {
        if (!smartIndexingEnabled) {
          console.log(`[Auto-Indexing] Smart indexing is disabled, skipping automatic indexing for project ${projectId}`)
          return
        }
        
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
            ).then((results: Array<{ documentId: string; status: IndexingStatus }>) => {
              const successCount = results.filter((r: { documentId: string; status: IndexingStatus }) => r.status.status === 'completed').length
              const errorCount = results.filter((r: { documentId: string; status: IndexingStatus }) => r.status.status === 'error').length
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
      }).catch((error) => {
        console.warn('[Auto-Indexing] Failed to get Smart indexing setting:', error)
        // If we can't get the setting, skip indexing (default is disabled)
        console.log(`[Auto-Indexing] Smart indexing setting unavailable, skipping automatic indexing for project ${projectId}`)
      })
      
      // Get documents in project
      const documents = await projectApi.getDocuments(projectId)
      if (documents.length > 0) {
        // Priority: 1. Last opened document, 2. First document
        let documentToOpen: Document | null = null
        
        // First, try to restore last opened document
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
        }
        
        // Fall back to first document if last opened document was not found
        if (!documentToOpen) {
          documentToOpen = documents[0]
        }
        
        if (documentToOpen) {
          navigate(`/document/${documentToOpen.id}`)
        }
      } else {
        // No documents, create a new file in workspace folder (project folder)
        // Generate unique name "Chapter X" based on existing workspace documents in this project
        const projectDocs = await projectApi.getDocuments(projectId)
        const workspaceDocs = projectDocs.filter((doc: Document) => 
          (!doc.folder || doc.folder === 'project')
        )
        
        // Check existing titles to find next available "Chapter X" number
        const existingTitles = workspaceDocs.map((doc: Document) => doc.title.toLowerCase())
        let chapterNumber = 1
        while (existingTitles.includes(`chapter ${chapterNumber}`)) {
          chapterNumber++
        }
        
        const isFirstProject = projects.length === 1 && projects[0]?.id === projectId
        const newFileName = isFirstProject ? FIRST_PROJECT_DOC_TITLE : `Chapter ${chapterNumber}`
        const document = await documentApi.create(newFileName, 'project')
        if (isFirstProject) {
          await documentApi.update(document.id, JSON.stringify(FIRST_PROJECT_WELCOME_CONTENT))
          const worldLabDoc = await documentApi.create(FIRST_PROJECT_WORLDLAB_TITLE, 'worldlab')
          await projectApi.addDocument(projectId, worldLabDoc.id, 1)
        }
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

  const handleChangeCover = async (projectId: string) => {
    try {
      const result = await projectApi.setCover(projectId)
      if (result?.canceled) return
      if (result?.project?.coverImageData !== undefined) {
        setProjects(prev => prev.map((project: any) =>
          project.id === projectId
            ? { ...project, coverImageData: result.project.coverImageData }
            : project
        ))
      } else {
        await loadProjects()
      }
    } catch (error) {
      console.error('Failed to change cover:', error)
      alert('Failed to change cover. Please try again.')
    }
  }

  const handleRemoveCover = async (projectId: string) => {
    try {
      await projectApi.update(projectId, { coverImageData: '' })
      setProjects(prev => prev.map((project: any) =>
        project.id === projectId
          ? { ...project, coverImageData: '' }
          : project
      ))
    } catch (error) {
      console.error('Failed to remove cover:', error)
      alert('Failed to remove cover. Please try again.')
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
        borderBottom: `1px solid ${theme === 'dark' ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.05)'}`,
        backgroundColor: theme === 'dark' ? '#121212' : bgColor,
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
                height: '20px',
                objectFit: 'contain',
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
              backgroundColor: theme === 'dark' ? 'rgba(255, 255, 255, 0.03)' : 'rgba(0, 0, 0, 0.02)',
              borderRadius: '4px',
              padding: '4px 10px',
              gap: '6px',
              height: '24px',
              border: `1px solid ${theme === 'dark' ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.05)'}`,
              transition: 'all 0.2s ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = theme === 'dark' ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.03)'
              e.currentTarget.style.borderColor = theme === 'dark' ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = theme === 'dark' ? 'rgba(255, 255, 255, 0.03)' : 'rgba(0, 0, 0, 0.02)'
              e.currentTarget.style.borderColor = theme === 'dark' ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.05)'
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
                  fontSize: '11px',
                  color: textColor,
                  fontFamily: '"Noto Sans SC", "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
                }}
              />
            </div>
          </div>
        </div>

        {/* Right side - Window Controls */}
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
          padding: '44px 24px 28px 24px',
        }}>
        {/* Header */}
        <div style={{
          marginBottom: '28px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}>
          <div>
            <h1 style={{ 
              fontSize: '20px', 
              fontWeight: 500, 
              color: textColor,
              margin: 0,
              marginBottom: '6px',
              fontFamily: '"Noto Sans SC", "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
            } as React.CSSProperties}>
              Workspace
            </h1>
            <div style={{
              fontSize: '12px',
              color: secondaryTextColor,
              fontFamily: '"Noto Sans SC", "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
            }}>
              Manage and access your writing projects
            </div>
          </div>
          <button
            onClick={handleCreateProject}
            style={{
              height: '34px',
              padding: '0 14px',
              marginTop: '6px',
              borderRadius: '4px',
              border: 'none',
              backgroundColor: 'transparent',
              color: theme === 'dark' ? '#d8d8d8' : '#1f2937',
              fontSize: '13px',
              fontWeight: 500,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              fontFamily: '"Noto Sans SC", "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
              boxShadow: `inset 0 -1px 0 ${theme === 'dark' ? 'rgba(255, 255, 255, 0.18)' : 'rgba(0, 0, 0, 0.18)'}`,
              transition: 'background-color 0.15s, box-shadow 0.15s',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = theme === 'dark' ? 'rgba(255, 255, 255, 0.04)' : 'rgba(0, 0, 0, 0.04)'
              e.currentTarget.style.boxShadow = `inset 0 -2px 0 ${theme === 'dark' ? 'rgba(255, 255, 255, 0.35)' : 'rgba(0, 0, 0, 0.35)'}`
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent'
              e.currentTarget.style.boxShadow = `inset 0 -1px 0 ${theme === 'dark' ? 'rgba(255, 255, 255, 0.18)' : 'rgba(0, 0, 0, 0.18)'}`
            }}
          >
            Create project
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
              padding: '150px 20px 60px 20px',
              minHeight: '400px'
            }}>
              <p style={{ 
                fontSize: '14px', 
                color: secondaryTextColor,
                fontWeight: 500,
                fontFamily: '"Noto Sans SC", "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
                lineHeight: '1.6',
                textAlign: 'center',
                margin: 0,
                transition: 'color 0.2s ease'
              }}>
                No projects yet. Create one to get started.
              </p>
            </div>
          )
        ) : (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))',
            gap: '18px'
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
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '3px',
                  position: 'relative',
                }}
                onMouseEnter={() => setHoveredProjectId(project.id)}
                onMouseLeave={() => setHoveredProjectId(prev => prev === project.id ? null : prev)}
              >
                <div
                  style={{
                    border: `1px solid ${theme === 'dark' ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.08)'}`,
                    borderRadius: '6px',
                    overflow: 'hidden',
                    transition: 'border-color 0.15s, box-shadow 0.15s',
                    backgroundColor: theme === 'dark' ? '#151515' : '#ffffff',
                    boxShadow: theme === 'dark' 
                      ? '0 2px 8px rgba(0,0,0,0.4), inset 0 0 0 1px rgba(255,255,255,0.04)' 
                      : '0 2px 8px rgba(0,0,0,0.08), 0 0 0 1px rgba(0,0,0,0.04) inset',
                    position: 'relative',
                    zIndex: openMenuId === project.id ? 10000 : 1,
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.boxShadow = theme === 'dark' 
                      ? '0 6px 16px rgba(0,0,0,0.5)' 
                      : '0 6px 16px rgba(0,0,0,0.14)'
                    e.currentTarget.style.borderColor = theme === 'dark' 
                      ? 'rgba(255, 255, 255, 0.12)' 
                      : 'rgba(0, 0, 0, 0.12)'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.boxShadow = theme === 'dark' 
                      ? '0 2px 8px rgba(0,0,0,0.4), inset 0 0 0 1px rgba(255,255,255,0.04)' 
                      : '0 2px 8px rgba(0,0,0,0.08), 0 0 0 1px rgba(0,0,0,0.04) inset'
                    e.currentTarget.style.borderColor = theme === 'dark' ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.08)'
                  }}
                >
                  {/* Preview Section - Google Docs-like aesthetic */}
                  <div 
                    onClick={() => handleOpenProject(project.id)}
                    style={{
                      height: '180px',
                      background: theme === 'dark' 
                        ? '#121212'
                        : '#ffffff',
                      padding: project.coverImageData ? '0' : '10px 20px 20px 20px',
                      overflow: 'hidden',
                      display: 'flex',
                      flexDirection: 'column',
                      cursor: 'pointer',
                      position: 'relative',
                    }}>
                    {/* Google Docs-like paper effect */}
                    <div style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      right: 0,
                      bottom: 0,
                      background: 'none',
                      pointerEvents: 'none',
                    }} />
                    
                    {/* Cover image */}
                    {project.coverImageData ? (
                      <img
                        src={project.coverImageData}
                        alt=""
                        style={{
                          position: 'absolute',
                          inset: 0,
                          width: '100%',
                          height: '100%',
                          objectFit: 'cover',
                        }}
                      />
                    ) : firstDoc && (
                      <div style={{
                        marginBottom: '8px',
                        position: 'relative',
                        zIndex: 1,
                      }}>
                        <span style={{
                          fontSize: '11px',
                          fontWeight: 500,
                          color: theme === 'dark' ? '#9aa0a6' : '#5f6368',
                          fontFamily: '"Noto Sans SC", "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
                        }}>{firstDoc.title}</span>
                      </div>
                    )}
                    
                    {/* Text preview */}
                    {!project.coverImageData && preview ? (
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
                    ) : !project.coverImageData && (
                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: '100%',
                        height: '100%',
                        position: 'relative',
                        zIndex: 1,
                      }}>
                        <div style={{
                          fontSize: '12px',
                          color: secondaryTextColor,
                          fontFamily: '"Noto Sans SC", "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
                          letterSpacing: '0.02em',
                          textTransform: 'uppercase',
                        }}>No preview</div>
                      </div>
                    )}
                    
                    {/* Fade gradient at bottom */}
                    {!project.coverImageData && (
                      <div style={{
                        position: 'absolute',
                        bottom: 0,
                        left: 0,
                        right: 0,
                        height: '50px',
                        background: theme === 'dark'
                          ? 'linear-gradient(to top, rgba(18, 18, 18, 1), transparent)'
                          : 'linear-gradient(to top, rgba(255, 255, 255, 1), transparent)',
                        pointerEvents: 'none',
                      }} />
                    )}
                </div>
                </div>
                {/* Three-dot menu button */}
                <div
                  style={{
                    position: 'absolute',
                    top: '8px',
                    right: '8px',
                    zIndex: openMenuId === project.id ? 10010 : 1,
                    opacity: hoveredProjectId === project.id || openMenuId === project.id ? 1 : 0,
                    pointerEvents: hoveredProjectId === project.id || openMenuId === project.id ? 'auto' : 'none',
                    transition: 'opacity 0.15s ease',
                  }}
                >
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
                      borderRadius: '4px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: secondaryTextColor,
                      transition: 'all 0.2s ease',
                      width: '28px',
                      height: '28px',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.opacity = '0.85'
                      e.currentTarget.style.backgroundColor = theme === 'dark' ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.04)'
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.opacity = '1'
                      e.currentTarget.style.backgroundColor = 'transparent'
                    }}
                  >
                    <MoreHorizIcon style={{ fontSize: '18px' }} />
                  </button>
                  
                  {/* Dropdown menu */}
                  {openMenuId === project.id && (
                    <div
                      style={{
                        position: 'absolute',
                        top: 0,
                        left: 'calc(100% + 8px)',
                        backgroundColor: dropdownBg,
                        border: `1px solid ${theme === 'dark' ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)'}`,
                        borderRadius: '4px',
                        boxShadow: theme === 'dark' 
                          ? '0 8px 32px rgba(0,0,0,0.8), 0 0 0 1px rgba(255,255,255,0.05) inset' 
                          : '0 8px 32px rgba(0,0,0,0.15), 0 0 0 1px rgba(0,0,0,0.05) inset',
                        zIndex: 10010,
                        minWidth: '150px',
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
                          handleChangeCover(project.id)
                          setOpenMenuId(null)
                        }}
                        style={{
                          width: '100%',
                          padding: '6px 12px',
                          border: 'none',
                          background: 'transparent',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          fontSize: '12px',
                          fontFamily: '"Noto Sans SC", "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
                          color: dropdownTextColor,
                          textAlign: 'left',
                          transition: 'all 0.2s ease',
                          borderRadius: '4px',
                          fontWeight: 400,
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.backgroundColor = theme === 'dark' 
                            ? 'rgba(255, 255, 255, 0.08)' 
                            : 'rgba(0, 0, 0, 0.06)'
                          e.currentTarget.style.color = dropdownTextColor
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.backgroundColor = 'transparent'
                          e.currentTarget.style.color = dropdownTextColor
                        }}
                      >
                        <ImageOutlinedIcon style={{ fontSize: '14px', marginRight: '8px', opacity: 0.7 }} />
                        Change cover
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          handleRemoveCover(project.id)
                          setOpenMenuId(null)
                        }}
                        style={{
                          width: '100%',
                          padding: '6px 12px',
                          border: 'none',
                          background: 'transparent',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          fontSize: '12px',
                          fontFamily: '"Noto Sans SC", "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
                          color: dropdownTextColor,
                          textAlign: 'left',
                          transition: 'all 0.2s ease',
                          borderRadius: '4px',
                          fontWeight: 400,
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.backgroundColor = theme === 'dark' 
                            ? 'rgba(255, 255, 255, 0.08)' 
                            : 'rgba(0, 0, 0, 0.06)'
                          e.currentTarget.style.color = dropdownTextColor
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.backgroundColor = 'transparent'
                          e.currentTarget.style.color = dropdownTextColor
                        }}
                      >
                        <ImageNotSupportedOutlinedIcon style={{ fontSize: '14px', marginRight: '8px', opacity: 0.7 }} />
                        Remove cover
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          handleDeleteProject(project.id)
                        }}
                        style={{
                          width: '100%',
                          padding: '6px 12px',
                          border: 'none',
                          background: 'transparent',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          fontSize: '12px',
                          fontFamily: '"Noto Sans SC", "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
                          color: dropdownTextColor,
                          textAlign: 'left',
                          transition: 'all 0.2s ease',
                          borderRadius: '4px',
                          fontWeight: 400,
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.backgroundColor = theme === 'dark' 
                            ? 'rgba(255, 255, 255, 0.08)' 
                            : 'rgba(0, 0, 0, 0.06)'
                          e.currentTarget.style.color = dropdownTextColor
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.backgroundColor = 'transparent'
                          e.currentTarget.style.color = dropdownTextColor
                        }}
                      >
                        <DeleteOutlineIcon style={{ fontSize: '14px', marginRight: '8px', opacity: 0.7 }} />
                        Delete
                      </button>
                    </div>
                  )}
                </div>

                  {/* Title and Date Section */}
                  {/* Title row with three-dot menu */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px', position: 'relative', margin: '6px 0 2px 0' }}>
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
                          onClick={(e) => {
                            e.stopPropagation()
                            setRenamingId(project.id)
                            setRenameValue(project.title)
                          }}
                          style={{
                            fontSize: '13px',
                            fontWeight: 500,
                            color: textColor,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            cursor: 'text',
                            flex: 1,
                            fontFamily: '"Noto Sans SC", "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
                            transition: 'color 0.2s ease',
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.color = theme === 'dark' ? '#f0f0f0' : '#1f2937'
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.color = textColor
                          }}
                        >
                          {project.title}
                        </div>
                      )}
                      
                    </div>
                  {project.description && (
                    <div 
                      style={{
                        fontSize: '12px',
                        color: secondaryTextColor,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        cursor: 'default',
                        margin: '0 0 2px 0',
                      }}>
                      {project.description}
                    </div>
                  )}
                  <div 
                    style={{
                      fontSize: '10px',
                      color: secondaryTextColor,
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      margin: '0 0 6px 0',
                      cursor: 'default',
                      fontFamily: '"Noto Sans SC", "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
                    }}>
                    <span style={{ fontWeight: 400 }}>{project.actualDocumentCount ?? project.documentIds?.length ?? 0} {project.actualDocumentCount === 1 ? 'file' : 'files'}</span>
                    <span style={{ opacity: 0.5 }}>•</span>
                    <span>{formatDate(lastOpened)}</span>
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
              borderRadius: '4px',
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
