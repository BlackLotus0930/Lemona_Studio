import { useState, useEffect } from 'react'
import { useTheme } from '../../contexts/ThemeContext'
import { Document } from '@shared/types'

interface FullScreenPDFViewerProps {
  document: Document | null
}

export default function FullScreenPDFViewer({ document }: FullScreenPDFViewerProps) {
  const { theme } = useTheme()
  const [pdfSrc, setPdfSrc] = useState<string | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    if (!document) {
      setPdfSrc(null)
      setError(false)
      return
    }

    // Check if document is a PDF by filename
    const isPDF = document.title.toLowerCase().endsWith('.pdf')
    
    if (!isPDF) {
      setPdfSrc(null)
      setError(false)
      return
    }

    // Parse document content to extract PDF data URL
    try {
      const content = JSON.parse(document.content)
      
      // Look for pdfViewer node in content
      const findPDFSrc = (node: any): string | null => {
        if (node.type === 'pdfViewer' && node.attrs?.src) {
          return node.attrs.src
        }
        if (node.content && Array.isArray(node.content)) {
          for (const child of node.content) {
            const result = findPDFSrc(child)
            if (result) return result
          }
        }
        return null
      }

      const src = findPDFSrc(content)
      if (src) {
        setPdfSrc(src)
        setError(false)
      } else {
        setError(true)
      }
    } catch (e) {
      console.error('Failed to parse document content:', e)
      setError(true)
    }
  }, [document])

  if (!document) {
    return null
  }

  // Check if document is a PDF
  const isPDF = document.title.toLowerCase().endsWith('.pdf')
  if (!isPDF) {
    return null
  }

  // Show loading state while extracting PDF src
  if (!pdfSrc && !error) {
    return (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: theme === 'dark' ? '#141414' : '#ffffff',
          color: theme === 'dark' ? '#858585' : '#5f6368',
        }}
      >
        <p>Loading PDF...</p>
      </div>
    )
  }

  const bgColor = theme === 'dark' ? '#141414' : '#ffffff'

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        backgroundColor: bgColor,
        overflow: 'hidden',
      }}
    >
      {!error ? (
        <iframe
          src={pdfSrc ?? undefined}
          style={{
            width: '100%',
            height: '100%',
            border: 'none',
            display: 'block',
            backgroundColor: bgColor,
          }}
          onError={() => setError(true)}
          title={document.title}
        />
      ) : (
        <div
          style={{
            width: '100%',
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '40px',
            backgroundColor: bgColor,
            color: theme === 'dark' ? '#858585' : '#5f6368',
          }}
        >
          <p style={{ fontSize: '16px', marginBottom: '8px' }}>Unable to display PDF.</p>
          <p style={{ fontSize: '12px' }}>
            The PDF file is available in the file explorer.
          </p>
        </div>
      )}
    </div>
  )
}

