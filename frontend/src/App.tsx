import { HashRouter, Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom'
import { useEffect, useState, useRef } from 'react'
import DocumentList from './pages/DocumentList'
import Layout from './components/Layout/Layout'
import { EditorProvider } from './contexts/EditorContext'
import { documentApi } from './services/desktop-api'

function AppRouter() {
  const navigate = useNavigate()
  const location = useLocation()
  const [isCheckingLastSession, setIsCheckingLastSession] = useState(true)
  const hasCheckedRef = useRef(false)

  useEffect(() => {
    // Only check on initial load (when path is "/")
    // Use ref to ensure we only check once
    if (hasCheckedRef.current) {
      setIsCheckingLastSession(false)
      return
    }

    if (location.pathname === '/') {
      hasCheckedRef.current = true
      
      // Check for last session on app startup
      const checkLastSession = async () => {
        try {
          const lastProjectId = localStorage.getItem('lastSession_projectId')
          const lastDocumentId = localStorage.getItem('lastSession_documentId')

          if (lastDocumentId) {
            // Verify the document still exists
            try {
              const document = await documentApi.get(lastDocumentId)
              if (document && document.id) {
                // Document exists, navigate to it
                navigate(`/document/${lastDocumentId}`, { replace: true })
                setIsCheckingLastSession(false)
                return
              }
            } catch (error) {
              console.error('Failed to load last document:', error)
              // Document doesn't exist or error occurred, clear saved session
              localStorage.removeItem('lastSession_projectId')
              localStorage.removeItem('lastSession_documentId')
            }
          }
          
          // No valid last session, navigate to documents page
          setIsCheckingLastSession(false)
          navigate('/documents', { replace: true })
        } catch (error) {
          console.error('Error checking last session:', error)
          setIsCheckingLastSession(false)
          navigate('/documents', { replace: true })
        }
      }

      checkLastSession()
    } else {
      // Already on a specific route, don't check
      hasCheckedRef.current = true
      setIsCheckingLastSession(false)
    }
  }, [navigate, location.pathname])

  // Show loading state while checking last session
  if (isCheckingLastSession) {
    return (
      <div style={{ 
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center', 
        height: '100vh',
        backgroundColor: '#141414',
        color: '#D6D6DD'
      }}>
        Loading...
      </div>
    )
  }

  return (
    <Routes>
      <Route path="/" element={<Navigate to="/documents" replace />} />
      <Route path="/documents" element={<DocumentList />} />
      <Route path="/document/:id" element={<Layout />} />
    </Routes>
  )
}

function App() {
  return (
    <HashRouter>
      <EditorProvider>
        <AppRouter />
      </EditorProvider>
    </HashRouter>
  )
}

export default App

