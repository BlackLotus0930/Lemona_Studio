import { Node, mergeAttributes } from '@tiptap/core'
import { ReactNodeViewRenderer, NodeViewWrapper, ReactNodeViewProps } from '@tiptap/react'
import { useState, useEffect, useMemo } from 'react'
import { useTheme } from '../../contexts/ThemeContext'

const PDFViewerComponent = ({ node, selected }: ReactNodeViewProps) => {
  const { theme } = useTheme()
  const [error, setError] = useState(false)
  const originalSrc = (node.attrs.src as string) || ''
  const fileName = (node.attrs.fileName as string) || 'document.pdf'
  
  console.log('[PDFViewer] Component rendered:', {
    fileName,
    hasSrc: !!originalSrc,
    srcLength: originalSrc.length,
    srcPrefix: originalSrc.substring(0, 50) || 'empty',
    nodeAttrs: node.attrs,
  })
  
  // Convert data URL to blob URL for better iframe compatibility
  const pdfSrc = useMemo(() => {
    console.log('[PDFViewer] useMemo: Converting PDF source', {
      originalSrcLength: originalSrc.length,
      originalSrcPrefix: originalSrc.substring(0, 50) || 'empty',
    })
    
    if (!originalSrc) {
      console.warn('[PDFViewer] ISSUE B: Empty originalSrc!')
      return ''
    }
    
    // If it's already a blob URL or file URL, use it as-is
    if (originalSrc.startsWith('blob:') || originalSrc.startsWith('file://')) {
      console.log('[PDFViewer] Already blob/file URL, using as-is')
      return originalSrc
    }
    
    // If it's a data URL, convert to blob URL
    if (originalSrc.startsWith('data:application/pdf')) {
      try {
        console.log('[PDFViewer] Converting data URL to blob URL')
        // Extract base64 data
        const base64Data = originalSrc.split(',')[1]
        if (!base64Data) {
          console.error('[PDFViewer] ISSUE C: No base64 data found after comma in data URL')
          return originalSrc
        }
        
        console.log('[PDFViewer] Base64 data length:', base64Data.length)
        
        // Convert base64 to binary
        const binaryString = atob(base64Data)
        const bytes = new Uint8Array(binaryString.length)
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i)
        }
        
        console.log('[PDFViewer] Created binary array, size:', bytes.length)
        
        // PDF validation - check if bytes are valid PDF format
        console.log('[PDF VALIDATION] First 5 bytes:', bytes[0], bytes[1], bytes[2], bytes[3], bytes[4])
        console.log('[PDF VALIDATION] First 10 chars:', String.fromCharCode(...bytes.slice(0, 10)))
        
        // Create blob and blob URL
        const blob = new Blob([bytes], { type: 'application/pdf' })
        console.log('[PDF VALIDATION] Blob size:', blob.size)
        const blobUrl = URL.createObjectURL(blob)
        console.log('[PDFViewer] Successfully created blob URL:', blobUrl.substring(0, 50))
        return blobUrl
      } catch (e) {
        console.error('[PDFViewer] ISSUE C: Failed to convert data URL to blob URL:', e, {
          originalSrcPrefix: originalSrc.substring(0, 100),
        })
        return originalSrc
      }
    }
    
    console.log('[PDFViewer] Not a data URL, returning as-is')
    return originalSrc
  }, [originalSrc])
  
  console.log('[PDFViewer] Final pdfSrc:', {
    pdfSrcLength: pdfSrc.length,
    pdfSrcPrefix: pdfSrc.substring(0, 50) || 'empty',
    isBlobUrl: pdfSrc.startsWith('blob:'),
  })
  
  // Cleanup blob URL on unmount
  useEffect(() => {
    return () => {
      if (pdfSrc && pdfSrc.startsWith('blob:')) {
        URL.revokeObjectURL(pdfSrc)
      }
    }
  }, [pdfSrc])

  return (
    <NodeViewWrapper
      className={`pdf-viewer-wrapper ${selected ? 'selected' : ''}`}
      style={{
        display: 'block',
        margin: '16px 0',
        border: `1px solid ${theme === 'dark' ? '#333' : '#dadce0'}`,
        borderRadius: '8px',
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
      {!error ? (
        <iframe
          src={pdfSrc}
          style={{
            width: '100%',
            height: '600px',
            border: 'none',
            display: 'block',
          }}
          onError={(e) => {
            console.error('[PDFViewer] Iframe error loading PDF:', e, {
              pdfSrc: pdfSrc?.substring(0, 100),
              fileName,
            })
            setError(true)
          }}
          title={fileName}
        />
      ) : (
        <div
          style={{
            padding: '40px',
            textAlign: 'center',
            color: theme === 'dark' ? '#858585' : '#5f6368',
          }}
        >
          <p>Unable to display PDF preview.</p>
          <p style={{ fontSize: '12px', marginTop: '8px' }}>
            The PDF file is available in the file explorer.
          </p>
        </div>
      )}
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

