import { Node, mergeAttributes } from '@tiptap/core'
import { ReactNodeViewRenderer, NodeViewWrapper, ReactNodeViewProps } from '@tiptap/react'
import { useState } from 'react'
import { useTheme } from '../../contexts/ThemeContext'

const PDFViewerComponent = ({ node, selected }: ReactNodeViewProps) => {
  const { theme } = useTheme()
  const [error, setError] = useState(false)
  const pdfSrc = (node.attrs.src as string) || ''
  const fileName = (node.attrs.fileName as string) || 'document.pdf'

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
          onError={() => setError(true)}
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

