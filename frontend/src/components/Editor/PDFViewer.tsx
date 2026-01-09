import { Node, mergeAttributes } from '@tiptap/core'
import { ReactNodeViewRenderer, NodeViewWrapper, ReactNodeViewProps } from '@tiptap/react'
import { useState, useEffect, useMemo } from 'react'
import { useTheme } from '../../contexts/ThemeContext'

const PDFViewerComponent = ({ node, selected }: ReactNodeViewProps) => {
  const { theme } = useTheme()
  const [error, setError] = useState(false)
  const originalSrc = (node.attrs.src as string) || ''
  const fileName = (node.attrs.fileName as string) || 'document.pdf'
  
  // Convert data URL to blob URL for better iframe compatibility
  const pdfSrc = useMemo(() => {
    if (!originalSrc || originalSrc.trim() === '') {
      return null
    }
    
    // If it's already a blob URL or file URL, use it as-is
    if (originalSrc.startsWith('blob:') || originalSrc.startsWith('file://')) {
      return originalSrc
    }
    
    // If it's a data URL, convert to blob URL
    if (originalSrc.startsWith('data:application/pdf')) {
      try {
        // Extract base64 data
        const base64Data = originalSrc.split(',')[1]
        if (!base64Data) {
          // Invalid data URL format, return null to prevent CSP violation
          return null
        }
        
        // Convert base64 to binary
        const binaryString = atob(base64Data)
        const bytes = new Uint8Array(binaryString.length)
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i)
        }
        
        // Create blob and blob URL
        const blob = new Blob([bytes], { type: 'application/pdf' })
        const blobUrl = URL.createObjectURL(blob)
        return blobUrl
      } catch (e) {
        // Conversion failed, return null to prevent CSP violation
        return null
      }
    }
    
    // For other URLs, validate they're safe for iframe
    // Only allow blob:, data:, or relative URLs
    if (originalSrc.startsWith('data:') || originalSrc.startsWith('blob:') || originalSrc.startsWith('/')) {
      return originalSrc
    }
    
    // Unknown URL format, return null to prevent CSP violation
    return null
  }, [originalSrc])
  
  // Cleanup blob URL on unmount
  useEffect(() => {
    return () => {
      if (pdfSrc && typeof pdfSrc === 'string' && pdfSrc.startsWith('blob:')) {
        URL.revokeObjectURL(pdfSrc)
      }
    }
  }, [pdfSrc])

  // Don't render anything if there's no valid PDF source
  if (!pdfSrc || typeof pdfSrc !== 'string' || pdfSrc.trim() === '' || error) {
    return null
  }

  return (
    <NodeViewWrapper
      className={`pdf-viewer-wrapper ${selected ? 'selected' : ''}`}
      style={{
        display: 'block',
        margin: '16px 0',
        border: `1px solid ${theme === 'dark' ? '#333' : '#dadce0'}`,
        borderRadius: '6px',
        overflow: 'hidden',
        backgroundColor: theme === 'dark' ? '#1e1e1e' : '#f8f9fa',
      }}
    >
      <div
        style={{
          padding: '12px 16px',
          backgroundColor: theme === 'dark' ? '#2a2a2a' : '#ffffff',
          borderBottom: `1px solid ${theme === 'dark' ? '#333' : '#dadce0'}`,
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          fontSize: '14px',
          fontWeight: 500,
          color: theme === 'dark' ? '#cccccc' : '#202124',
        }}
      >
        <span>📄</span>
        <span>{fileName}</span>
      </div>
      <iframe
        src={pdfSrc}
        style={{
          width: '100%',
          height: '600px',
          border: 'none',
          display: 'block',
        }}
        onError={() => {
          setError(true)
        }}
        title={fileName}
      />
    </NodeViewWrapper>
  )
}

export const PDFViewerExtension = Node.create({
  name: 'pdfViewer',

  group: 'block',

  atom: true,

  addAttributes() {
    return {
      src: {
        default: '',
        parseHTML: (element) => element.getAttribute('data-pdf-src'),
        renderHTML: (attributes) => {
          if (!attributes.src) {
            return {}
          }
          return {
            'data-pdf-src': attributes.src,
          }
        },
      },
      fileName: {
        default: '',
        parseHTML: (element) => element.getAttribute('data-file-name'),
        renderHTML: (attributes) => {
          if (!attributes.fileName) {
            return {}
          }
          return {
            'data-file-name': attributes.fileName,
          }
        },
      },
    }
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-pdf-src]',
        getAttrs: (element) => {
          if (typeof element === 'string') return false
          return {
            src: element.getAttribute('data-pdf-src'),
            fileName: element.getAttribute('data-file-name') || '',
          }
        },
      },
      {
        tag: 'p[data-pdf-src]',
        getAttrs: (element) => {
          if (typeof element === 'string') return false
          return {
            src: element.getAttribute('data-pdf-src'),
            fileName: element.getAttribute('data-file-name') || '',
          }
        },
      },
    ]
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(this.options.HTMLAttributes, HTMLAttributes)]
  },

  addNodeView() {
    return ReactNodeViewRenderer(PDFViewerComponent)
  },
})

