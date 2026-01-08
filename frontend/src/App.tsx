import { HashRouter, Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom'
import DocumentList from './pages/DocumentList'
import Layout from './components/Layout/Layout'
import { EditorProvider } from './contexts/EditorContext'
import { useEffect, useState } from 'react'
import { documentApi } from './services/api'

// Component to restore last opened document on app startup
function RouteRestorer() {
  const navigate = useNavigate()
  const location = useLocation()
  const [hasRestored, setHasRestored] = useState(false)

  useEffect(() => {
    // Check if we've already restored in this session
    const sessionRestoredKey = 'routeRestorer_hasRestored'
    const hasRestoredThisSession = sessionStorage.getItem(sessionRestoredKey) === 'true'
    
    // Only restore on initial app load (when at root), not when user navigates to /documents
    // This prevents restoring when user clicks Home button
    if (hasRestored || hasRestoredThisSession || location.pathname !== '/') {
      return
    }

    const restoreLastDocument = async () => {
      try {
        const lastDocumentId = localStorage.getItem('lastOpenedDocument')
        if (lastDocumentId) {
          // Verify the document still exists
          const document = await documentApi.get(lastDocumentId)
          if (document && document.id) {
            // Navigate to the last opened document
            navigate(`/document/${lastDocumentId}`, { replace: true })
            setHasRestored(true)
            sessionStorage.setItem(sessionRestoredKey, 'true')
            return
          } else {
            // Document doesn't exist anymore, clear the saved ID
            localStorage.removeItem('lastOpenedDocument')
          }
        }
      } catch (error) {
        console.error('Failed to restore last document:', error)
        // Clear invalid saved document ID
        localStorage.removeItem('lastOpenedDocument')
      }
      setHasRestored(true)
      sessionStorage.setItem(sessionRestoredKey, 'true')
    }

    restoreLastDocument()
  }, [navigate, location.pathname, hasRestored])

  return null
}

function AppRoutes() {
  return (
    <>
      <RouteRestorer />
      <Routes>
        <Route path="/" element={<Navigate to="/documents" replace />} />
        <Route path="/documents" element={<DocumentList />} />
        <Route path="/document/:id" element={<Layout />} />
      </Routes>
    </>
  )
}

function App() {
  return (
    <HashRouter>
      <EditorProvider>
        <AppRoutes />
      </EditorProvider>
    </HashRouter>
  )
}

export default App

