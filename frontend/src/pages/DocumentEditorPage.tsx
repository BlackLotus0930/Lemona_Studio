import { useState, useEffect } from 'react'
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

  useEffect(() => {
    if (id) {
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
      setCurrentDocument(document)
    } catch (error) {
      console.error('Failed to load document:', error)
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

