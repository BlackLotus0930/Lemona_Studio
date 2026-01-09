import Image from '@tiptap/extension-image'
import { NodeViewWrapper, ReactNodeViewRenderer, ReactNodeViewProps } from '@tiptap/react'
import { NodeSelection } from 'prosemirror-state'
import React, { useEffect, useRef, useState } from 'react'
import { documentApi } from '../../services/desktop-api'

const ResizableImageComponent = ({ node, updateAttributes, selected, editor, getPos }: ReactNodeViewProps) => {
  const imgRef = useRef<HTMLImageElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [isResizing, setIsResizing] = useState(false)
  const [resizeHandle, setResizeHandle] = useState<string | null>(null)
  const [startPos, setStartPos] = useState({ x: 0, y: 0 })
  const [startSize, setStartSize] = useState({ width: 0, height: 0 })
  const [aspectRatio, setAspectRatio] = useState(1)
  const [imageSrc, setImageSrc] = useState<string>('')
  const [isLoading, setIsLoading] = useState(false)

  // Load image from document:// reference if needed
  useEffect(() => {
    const src = node.attrs.src || ''
    // Also check for data-document-src attribute (set by renderHTML when filtering document:// URLs)
    const documentSrc = (node.attrs as any)['data-document-src'] || ''
    const actualSrc = documentSrc || src
    
    // Don't set document:// URLs directly - they violate CSP
    if (actualSrc.startsWith('document://')) {
      setIsLoading(true)
      // Parse document://documentId/image/imageId
      const match = actualSrc.match(/^document:\/\/([^/]+)\/image\/(.+)$/)
      if (match) {
        const documentId = match[1]
        const imageId = match[2]
        
        // Load image content asynchronously and convert to blob URL
        documentApi.getImageFileContent(documentId, imageId)
          .then((dataUrl) => {
            // Convert data URL to blob URL for better performance and CSP compliance
            try {
              const base64Data = dataUrl.split(',')[1]
              if (!base64Data) {
                throw new Error('Invalid data URL')
              }
              
              // Extract content type
              const contentTypeMatch = dataUrl.match(/data:([^;]+);base64/)
              const contentType = contentTypeMatch ? contentTypeMatch[1] : 'image/png'
              
              // Convert base64 to binary
              const binaryString = atob(base64Data)
              const bytes = new Uint8Array(binaryString.length)
              for (let i = 0; i < binaryString.length; i++) {
                bytes[i] = binaryString.charCodeAt(i)
              }
              
              // Create blob and blob URL
              const blob = new Blob([bytes], { type: contentType })
              const blobUrl = URL.createObjectURL(blob)
              setImageSrc(blobUrl)
              setIsLoading(false)
            } catch (error) {
              // Fallback to data URL if blob conversion fails
              setImageSrc(dataUrl)
              setIsLoading(false)
            }
          })
          .catch(() => {
            // If loading fails, set empty to show broken image
            setImageSrc('')
            setIsLoading(false)
          })
      } else {
        setImageSrc('')
        setIsLoading(false)
      }
    } else if (src.startsWith('data:') || src.startsWith('blob:') || src.startsWith('http')) {
      // Direct data/blob/http URLs are fine
      // Skip placeholder SVG if we have a document:// URL stored in data-document-src
      if (!documentSrc || !src.includes('data:image/svg+xml')) {
        setImageSrc(src)
        setIsLoading(false)
      }
    } else {
      // Empty or invalid URL
      setImageSrc('')
      setIsLoading(false)
    }
  }, [node.attrs.src, (node.attrs as any)['data-document-src']])

  // Cleanup blob URL on unmount
  useEffect(() => {
    return () => {
      if (imageSrc.startsWith('blob:')) {
        URL.revokeObjectURL(imageSrc)
      }
    }
  }, [imageSrc])

  useEffect(() => {
    if (imgRef.current && imgRef.current.complete) {
      const img = imgRef.current
      const naturalWidth = img.naturalWidth
      const naturalHeight = img.naturalHeight
      if (naturalWidth > 0 && naturalHeight > 0) {
        setAspectRatio(naturalWidth / naturalHeight)
      }
    }
  }, [imageSrc])

  const handleImageLoad = () => {
    if (imgRef.current) {
      const img = imgRef.current
      const naturalWidth = img.naturalWidth
      const naturalHeight = img.naturalHeight
      if (naturalWidth > 0 && naturalHeight > 0) {
        setAspectRatio(naturalWidth / naturalHeight)
        // Set initial dimensions if not set
        if (!node.attrs.width && !node.attrs.height) {
          updateAttributes({
            width: Math.min(naturalWidth, 600),
            height: Math.min(naturalHeight, (naturalHeight / naturalWidth) * 600),
          })
        }
      }
    }
  }

  const currentWidth = node.attrs.width || (imgRef.current?.naturalWidth || 400)
  const currentHeight = node.attrs.height || (imgRef.current?.naturalHeight || 300)

  const handleMouseDown = (e: React.MouseEvent, handle: string) => {
    e.preventDefault()
    e.stopPropagation()
    setIsResizing(true)
    setResizeHandle(handle)
    setStartPos({ x: e.clientX, y: e.clientY })
    setStartSize({ width: currentWidth, height: currentHeight })
  }

  useEffect(() => {
    if (!isResizing) return

    const handleMouseMove = (e: MouseEvent) => {
      if (!resizeHandle) return

      const deltaX = e.clientX - startPos.x
      const deltaY = e.clientY - startPos.y

      let newWidth = startSize.width
      let newHeight = startSize.height

      switch (resizeHandle) {
        case 'se': // Southeast (bottom-right)
          newWidth = Math.max(50, startSize.width + deltaX)
          newHeight = Math.max(50, startSize.height + deltaY)
          // Maintain aspect ratio
          const ratio = newWidth / newHeight
          if (Math.abs(ratio - aspectRatio) > 0.1) {
            newHeight = newWidth / aspectRatio
          }
          break
        case 'sw': // Southwest (bottom-left)
          newWidth = Math.max(50, startSize.width - deltaX)
          newHeight = Math.max(50, startSize.height + deltaY)
          const ratioSW = newWidth / newHeight
          if (Math.abs(ratioSW - aspectRatio) > 0.1) {
            newHeight = newWidth / aspectRatio
          }
          break
        case 'ne': // Northeast (top-right)
          newWidth = Math.max(50, startSize.width + deltaX)
          newHeight = Math.max(50, startSize.height - deltaY)
          const ratioNE = newWidth / newHeight
          if (Math.abs(ratioNE - aspectRatio) > 0.1) {
            newHeight = newWidth / aspectRatio
          }
          break
        case 'nw': // Northwest (top-left)
          newWidth = Math.max(50, startSize.width - deltaX)
          newHeight = Math.max(50, startSize.height - deltaY)
          const ratioNW = newWidth / newHeight
          if (Math.abs(ratioNW - aspectRatio) > 0.1) {
            newHeight = newWidth / aspectRatio
          }
          break
      }

      updateAttributes({
        width: Math.round(newWidth),
        height: Math.round(newHeight),
      })
    }

    const handleMouseUp = () => {
      setIsResizing(false)
      setResizeHandle(null)
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)

    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [isResizing, resizeHandle, startPos, startSize, aspectRatio, updateAttributes])

  const handleImageClick = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    
    if (typeof getPos !== 'function') return
    
    const imgElement = e.currentTarget as HTMLImageElement
    const rect = imgElement.getBoundingClientRect()
    const clickX = e.clientX
    
    // Determine if click was on the right or left half of the image
    const imageCenterX = rect.left + rect.width / 2
    const clickedOnRightSide = clickX > imageCenterX
    
    const imagePos = getPos()
    
    // Handle undefined case (Tiptap 3.x breaking change)
    if (imagePos === undefined || imagePos < 0) return
    
    if (clickedOnRightSide) {
      // Place cursor after the image
      const afterImagePos = imagePos + node.nodeSize
      editor.commands.setTextSelection(afterImagePos)
      editor.commands.focus()
    } else {
      // Select the image node when clicked on left side
      const tr = editor.view.state.tr.setSelection(NodeSelection.create(editor.view.state.doc, imagePos))
      editor.view.dispatch(tr)
    }
  }

  const handleImageDoubleClick = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    
    if (typeof getPos !== 'function') return
    
    const imagePos = getPos()
    
    // Handle undefined case (Tiptap 3.x breaking change)
    if (imagePos === undefined || imagePos < 0) return
    
    // Always select the image on double-click
    const tr = editor.view.state.tr.setSelection(NodeSelection.create(editor.view.state.doc, imagePos))
    editor.view.dispatch(tr)
    editor.commands.focus()
  }

  return (
    <NodeViewWrapper
      ref={containerRef}
      className={`resizable-image-wrapper ${selected ? 'selected' : ''}`}
      style={{
        display: 'inline-block',
        position: 'relative',
        margin: '8px 0',
        maxWidth: '100%',
      }}
    >
      {isLoading ? (
        <div style={{
          width: currentWidth ? `${currentWidth}px` : '400px',
          height: currentHeight ? `${currentHeight}px` : '300px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#f5f5f5',
          color: '#999',
          fontSize: '14px',
        }}>
          Loading image...
        </div>
      ) : imageSrc ? (
        <img
          ref={imgRef}
          src={imageSrc}
          alt=""
          onLoad={handleImageLoad}
          style={{
            width: currentWidth ? `${currentWidth}px` : 'auto',
            height: currentHeight ? `${currentHeight}px` : 'auto',
            maxWidth: '100%',
            display: 'block',
            cursor: selected ? 'move' : 'pointer',
            userSelect: 'none',
            margin: 0,
            padding: 0,
            verticalAlign: 'bottom',
          }}
          onClick={handleImageClick}
          onDoubleClick={handleImageDoubleClick}
          draggable={false}
        />
      ) : (
        <div style={{
          width: currentWidth ? `${currentWidth}px` : '400px',
          height: currentHeight ? `${currentHeight}px` : '300px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#f5f5f5',
          color: '#999',
          fontSize: '14px',
          border: '1px dashed #ddd',
        }}>
          Image not available
        </div>
      )}
      {selected && (
        <>
          {/* Resize handles */}
          <div
            className="resize-handle resize-handle-se"
            onMouseDown={(e) => handleMouseDown(e, 'se')}
            style={{
              position: 'absolute',
              bottom: '-4px',
              right: '-4px',
              width: '12px',
              height: '12px',
              backgroundColor: '#1a73e8',
              border: '2px solid white',
              borderRadius: '50%',
              cursor: 'se-resize',
              zIndex: 10,
            }}
          />
          <div
            className="resize-handle resize-handle-sw"
            onMouseDown={(e) => handleMouseDown(e, 'sw')}
            style={{
              position: 'absolute',
              bottom: '-4px',
              left: '-4px',
              width: '12px',
              height: '12px',
              backgroundColor: '#1a73e8',
              border: '2px solid white',
              borderRadius: '50%',
              cursor: 'sw-resize',
              zIndex: 10,
            }}
          />
          <div
            className="resize-handle resize-handle-ne"
            onMouseDown={(e) => handleMouseDown(e, 'ne')}
            style={{
              position: 'absolute',
              top: '-4px',
              right: '-4px',
              width: '12px',
              height: '12px',
              backgroundColor: '#1a73e8',
              border: '2px solid white',
              borderRadius: '50%',
              cursor: 'ne-resize',
              zIndex: 10,
            }}
          />
          <div
            className="resize-handle resize-handle-nw"
            onMouseDown={(e) => handleMouseDown(e, 'nw')}
            style={{
              position: 'absolute',
              top: '-4px',
              left: '-4px',
              width: '12px',
              height: '12px',
              backgroundColor: '#1a73e8',
              border: '2px solid white',
              borderRadius: '50%',
              cursor: 'nw-resize',
              zIndex: 10,
            }}
          />
          {/* Selection border */}
          <div
            style={{
              position: 'absolute',
              top: '-2px',
              left: '-2px',
              right: '-2px',
              bottom: '-2px',
              border: '2px solid #1a73e8',
              borderRadius: '6px',
              pointerEvents: 'none',
              zIndex: 9,
            }}
          />
        </>
      )}
    </NodeViewWrapper>
  )
}

export const ResizableImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      width: {
        default: null,
        parseHTML: (element) => {
          const width = element.getAttribute('width')
          return width ? parseInt(width, 10) : null
        },
        renderHTML: (attributes) => {
          if (!attributes.width) {
            return {}
          }
          return {
            width: attributes.width,
          }
        },
      },
      height: {
        default: null,
        parseHTML: (element) => {
          const height = element.getAttribute('height')
          return height ? parseInt(height, 10) : null
        },
        renderHTML: (attributes) => {
          if (!attributes.height) {
            return {}
          }
          return {
            height: attributes.height,
          }
        },
      },
    }
  },

  renderHTML({ HTMLAttributes }) {
    // Filter out document:// URLs to prevent CSP violations
    // These URLs are handled by ReactNodeViewRenderer in the component
    const src = HTMLAttributes.src || ''
    if (src.startsWith('document://')) {
      // Return a placeholder data URL instead of document:// URL
      // This prevents CSP violations when TipTap renders HTML (e.g., copy/paste, export)
      return [
        'img',
        {
          ...HTMLAttributes,
          src: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCIgZmlsbD0iI2Y1ZjVmNSIvPjx0ZXh0IHg9IjUwJSIgeT0iNTAlIiBmb250LWZhbWlseT0iQXJpYWwiIGZvbnQtc2l6ZT0iMTQiIGZpbGw9IiM5OTk5OTkiIHRleHQtYW5jaG9yPSJtaWRkbGUiIGR5PSIuM2VtIj5JbWFnZTwvdGV4dD48L3N2Zz4=',
          'data-document-src': src, // Store original URL as data attribute for component to use
        },
      ]
    }
    // For other URLs (data:, blob:, http:, https:), use parent's renderHTML
    return ['img', HTMLAttributes]
  },

  addNodeView() {
    return ReactNodeViewRenderer(ResizableImageComponent)
  },
})

