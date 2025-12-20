import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import Layout from '../components/Layout/Layout'
import { Document } from '@shared/types'
import { documentApi } from '../services/api'
import { useTheme } from '../contexts/ThemeContext'

export default function DocumentEditorPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { theme } = useTheme()
  const [currentDocument, setCurrentDocument] = useState<Document | null>(null)
  const [documents, setDocuments] = useState<Document[]>([])
  const [isLoading, setIsLoading] = useState(true)
  
  const bgColor = theme === 'dark' ? '#141414' : '#ffffff'
  const textColor = theme === 'dark' ? '#D6D6DD' : '#202124'

  // Track previous ID to detect navigation
  const prevIdRef = useRef<string | undefined>(undefined)
  
  useEffect(() => {
    if (id) {
      // If ID changed (navigating to different document), clear state and show loading
      if (prevIdRef.current !== id) {
        setIsLoading(true)
        setCurrentDocument(null) // Clear old document to prevent stale state
        prevIdRef.current = id
      }
      loadDocument(id)
    } else {
      // If no ID, redirect to document list
      navigate('/documents')
    }
  }, [id])

  const loadDocument = async (docId: string) => {
    try {
      // IPC returns data directly, not wrapped in { data: ... }
      const document = await documentApi.get(docId)
      
      // Check if document exists and is valid
      if (!document || !document.id) {
        console.error('Document not found or invalid:', docId)
        setCurrentDocument(null)
        navigate('/documents')
        return
      }
      
      setCurrentDocument(document)
      
      // Save last opened document ID per project
      if (document?.projectId) {
        try {
          localStorage.setItem(`lastDocument_${document.projectId}`, docId)
        } catch (error) {
          console.error('Failed to save last document:', error)
        }
      }
    } catch (error) {
      console.error('Failed to load document:', error)
      setCurrentDocument(null)
      navigate('/documents')
    } finally {
      setIsLoading(false)
    }
  }

  const handleDocumentChange = (doc: Document | null) => {
    setCurrentDocument(doc)
    if (doc) {
      const index = documents.findIndex(d => d.id === doc.id)
      if (index >= 0) {
        const updated = [...documents]
        updated[index] = doc
        setDocuments(updated)
      } else {
        setDocuments([doc, ...documents])
      }
    }
  }

  if (isLoading) {
    return (
      <div style={{
        height: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: bgColor,
        color: textColor
      }}>
        <div>Loading...</div>
      </div>
    )
  }

  return (
    <Layout 
      document={currentDocument}
      onDocumentChange={handleDocumentChange}
    />
  )
}

