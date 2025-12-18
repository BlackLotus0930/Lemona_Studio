import { Editor } from '@tiptap/react'
import { EditorContent } from '@tiptap/react'
import { useNavigate } from 'react-router-dom'
import { useEffect, useRef } from 'react'
import { Document } from '@shared/types'
import Autocomplete from '../Autocomplete/Autocomplete'
import { documentApi } from '../../services/api'
import { useTheme } from '../../contexts/ThemeContext'
import './EditorStyles.css'

interface DocumentEditorProps {
  document: Document | null
  editor: Editor | null
  onDocumentChange?: (doc: Document | null) => void
  showToolbarOnly?: boolean
}

export default function DocumentEditor({ document, editor }: DocumentEditorProps) {
  const { theme } = useTheme()
  const navigate = useNavigate()
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const scrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isDraggingRef = useRef(false)
  const mouseDownPosRef = useRef<{ x: number; y: number } | null>(null)
  const initialSelectionPosRef = useRef<number | null>(null)
  const isTextSelectionActiveRef = useRef(false)
  const scrollSaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  
  const bgColor = theme === 'dark' ? '#181818' : '#ffffff'
  const textColor = theme === 'dark' ? '#F3F3F3' : '#202124'

  // Save scroll position to localStorage
  const saveScrollPosition = (documentId: string, scrollTop: number) => {
    try {
      localStorage.setItem(`documentScroll_${documentId}`, scrollTop.toString())
    } catch (error) {
      console.error('Failed to save scroll position:', error)
    }
  }

  // Load scroll position from localStorage
  const loadScrollPosition = (documentId: string): number | null => {
    try {
      const saved = localStorage.getItem(`documentScroll_${documentId}`)
      return saved ? parseFloat(saved) : null
    } catch (error) {
      console.error('Failed to load scroll position:', error)
      return null
    }
  }

  const handleNewDocument = async () => {
    try {
      const newDoc = await documentApi.create('Untitled Document')
      navigate(`/document/${newDoc.data.id}`)
    } catch (error) {
      console.error('Failed to create document:', error)
      alert('Failed to create document. Please try again.')
    }
  }

  // Restore scroll position when document changes
  useEffect(() => {
    if (!document?.id || !scrollContainerRef.current) return

    const savedScrollTop = loadScrollPosition(document.id)
    if (savedScrollTop !== null) {
      // Small delay to ensure content is rendered
      setTimeout(() => {
        if (scrollContainerRef.current) {
          scrollContainerRef.current.scrollTop = savedScrollTop
        }
      }, 100)
    }
  }, [document?.id])

  // Add scroll detection and edge detection to show scrollbar
  useEffect(() => {
    const container = scrollContainerRef.current
    if (!container || !document?.id) return

    const EDGE_DISTANCE = 20 // pixels from edge to show scrollbar

    const handleScroll = () => {
      if (container) {
        container.classList.add('scrolling')
        if (scrollTimeoutRef.current) {
          clearTimeout(scrollTimeoutRef.current)
        }
        scrollTimeoutRef.current = setTimeout(() => {
          if (container) {
            container.classList.remove('scrolling')
          }
        }, 600) // Slightly longer than transition duration (400ms) to allow fade-out

        // Save scroll position with debouncing
        if (scrollSaveTimeoutRef.current) {
          clearTimeout(scrollSaveTimeoutRef.current)
        }
        scrollSaveTimeoutRef.current = setTimeout(() => {
          saveScrollPosition(document.id, container.scrollTop)
        }, 300)
      }
    }

    const handleMouseMove = (e: MouseEvent) => {
      if (!container) return
      const rect = container.getBoundingClientRect()
      const mouseX = e.clientX - rect.left
      const mouseY = e.clientY - rect.top
      const width = rect.width
      const height = rect.height
      
      // Check if mouse is near right edge (for vertical scrollbar) or bottom edge (for horizontal scrollbar)
      const nearRightEdge = mouseX > width - EDGE_DISTANCE
      const nearBottomEdge = mouseY > height - EDGE_DISTANCE
      
      if (nearRightEdge || nearBottomEdge) {
        container.classList.add('show-scrollbar')
      } else {
        container.classList.remove('show-scrollbar')
      }
    }

    const handleMouseLeave = () => {
      if (container) {
        container.classList.remove('show-scrollbar')
      }
    }

    container.addEventListener('scroll', handleScroll, { passive: true })
    container.addEventListener('mousemove', handleMouseMove, { passive: true })
    container.addEventListener('mouseleave', handleMouseLeave)
    
    return () => {
      container.removeEventListener('scroll', handleScroll)
      container.removeEventListener('mousemove', handleMouseMove)
      container.removeEventListener('mouseleave', handleMouseLeave)
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current)
      }
      if (scrollSaveTimeoutRef.current) {
        clearTimeout(scrollSaveTimeoutRef.current)
      }
    }
  }, [document?.id])

  if (!document) {
    return (
      <div style={{ 
        height: '100%', 
        display: 'flex', 
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
        backgroundColor: bgColor,
        color: textColor
      }}>
        <h2 style={{ marginBottom: '16px', color: textColor }}>No Document Open</h2>
        <button 
          onClick={handleNewDocument}
          style={{
            padding: '12px 24px',
            backgroundColor: theme === 'dark' ? '#1a73e8' : '#1a73e8',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '16px',
            transition: 'background-color 0.2s'
          }}
          onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#1765cc'}
          onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#1a73e8'}
        >
          Create New Document
        </button>
      </div>
    )
  }

  if (!editor) {
    return null
  }

  return (
    <div style={{ 
      height: '100%', 
      display: 'flex', 
      flexDirection: 'column',
      backgroundColor: bgColor
    }}>
      <div 
        ref={scrollContainerRef}
        className={`scrollable-container ${theme === 'dark' ? 'dark-theme' : ''}`}
        style={{ 
          flex: 1, 
          overflow: 'auto', 
          paddingTop: '72px',
          paddingBottom: '72px',
          paddingLeft: '120px',
          paddingRight: '120px',
          position: 'relative',
          backgroundColor: bgColor,
          cursor: 'text',
          userSelect: 'text',
          WebkitUserSelect: 'text',
          MozUserSelect: 'text',
          msUserSelect: 'text'
        }}
        onMouseDown={(e) => {
          const target = e.target as HTMLElement
          
          // Let ProseMirror handle all clicks inside the content area
          if (target.closest('.ProseMirror')) {
            return
          }
          
          // Track mouse position to detect drag vs click
          isDraggingRef.current = false
          isTextSelectionActiveRef.current = false
          mouseDownPosRef.current = { x: e.clientX, y: e.clientY }
          
          // For clicks in the padding area, find the position at the click coordinates
          if (!editor || !scrollContainerRef.current) return
          
          const editorElement = scrollContainerRef.current.querySelector('.ProseMirror') as HTMLElement
          if (!editorElement) return
          
          const view = editor.view
          const editorRect = editorElement.getBoundingClientRect()
          const clickX = e.clientX
          const clickY = e.clientY
          
          // Determine if click is on left or right padding
          const isLeftPadding = clickX < editorRect.left
          const isRightPadding = clickX > editorRect.right
          
          // Helper function to find closest paragraph to a Y position
          const findClosestParagraph = (yPos: number): HTMLElement | null => {
            // First try to find paragraphs (p elements) - these are the actual text containers
            const paragraphs = editorElement.querySelectorAll('p, h1, h2, h3, h4, h5, h6')
            let closest: HTMLElement | null = null
            let minDistance = Infinity
            
            paragraphs.forEach((p) => {
              const pElement = p as HTMLElement
              const pRect = pElement.getBoundingClientRect()
              const pTop = pRect.top
              const pBottom = pRect.bottom
              
              let distance: number
              if (yPos >= pTop && yPos <= pBottom) {
                distance = 0
              } else {
                distance = Math.min(Math.abs(yPos - pTop), Math.abs(yPos - pBottom))
              }
              
              if (distance < minDistance) {
                minDistance = distance
                closest = pElement
              }
            })
            
            // If no paragraph found, try list items and find their inner paragraph
            if (!closest) {
              const listItems = editorElement.querySelectorAll('li')
              listItems.forEach((li) => {
                const liElement = li as HTMLElement
                const liRect = liElement.getBoundingClientRect()
                
                let distance: number
                if (yPos >= liRect.top && yPos <= liRect.bottom) {
                  distance = 0
                } else {
                  distance = Math.min(Math.abs(yPos - liRect.top), Math.abs(yPos - liRect.bottom))
                }
                
                if (distance < minDistance) {
                  minDistance = distance
                  // Find the first paragraph inside this list item
                  const innerP = liElement.querySelector(':scope > p')
                  closest = (innerP as HTMLElement) || liElement
                }
              })
            }
            
            return closest
          }
          
          // Find the paragraph/line closest to the click Y position
          const closestParagraph = findClosestParagraph(clickY)
          
          // Helper function to get position at coordinates, with fallback for padding areas
          const getPositionAtCoords = (x: number, y: number): number | null => {
            const paragraph = findClosestParagraph(y)
            if (!paragraph) return null
            
            const pRect = paragraph.getBoundingClientRect()
            const isInLeftPadding = x < editorRect.left
            const isInRightPadding = x > editorRect.right
            
            if (isInLeftPadding) {
              // In left padding - get position at start of line
              const coords = { left: pRect.left, top: y }
              const pos = view.posAtCoords(coords)
              if (pos) return pos.pos
              
              // Fallback: start of paragraph - for list items, get inner paragraph
              let targetElement = paragraph
              if (paragraph.tagName.toLowerCase() === 'li') {
                const innerP = paragraph.querySelector(':scope > p')
                if (innerP) targetElement = innerP as HTMLElement
              }
              const domPos = view.posAtDOM(targetElement, 0)
              return domPos ?? null
            } else if (isInRightPadding) {
              // In right padding - get position at end of line
              const startCoords = { left: pRect.left, top: y }
              const startPos = view.posAtCoords(startCoords)
              
              if (startPos) {
                // For list items, get the inner paragraph
                let targetElement = paragraph
                if (paragraph.tagName.toLowerCase() === 'li') {
                  const innerP = paragraph.querySelector(':scope > p')
                  if (innerP) targetElement = innerP as HTMLElement
                }
                
                const domPos = view.posAtDOM(targetElement, 0)
                const paragraphText = targetElement.textContent || ''
                const paragraphEndPos = domPos !== null && domPos !== undefined ? domPos + paragraphText.length : null
                
                if (paragraphEndPos !== null) {
                  let left = startPos.pos
                  let right = paragraphEndPos
                  let bestPos = startPos.pos
                  const lineYThreshold = 5
                  
                  const startCoordsAtPos = view.coordsAtPos(startPos.pos)
                  const targetY = startCoordsAtPos ? startCoordsAtPos.top : y
                  
                  while (left <= right) {
                    const mid = Math.floor((left + right) / 2)
                    const midCoords = view.coordsAtPos(mid)
                    
                    if (midCoords && Math.abs(midCoords.top - targetY) < lineYThreshold) {
                      bestPos = mid
                      left = mid + 1
                    } else {
                      right = mid - 1
                    }
                  }
                  return bestPos
                }
                return startPos.pos
              }
              
              // Fallback: end of paragraph - for list items, get inner paragraph
              let targetElement = paragraph
              if (paragraph.tagName.toLowerCase() === 'li') {
                const innerP = paragraph.querySelector(':scope > p')
                if (innerP) targetElement = innerP as HTMLElement
              }
              const domPos = view.posAtDOM(targetElement, 0)
              if (domPos !== null && domPos !== undefined) {
                const paragraphText = targetElement.textContent || ''
                return domPos + paragraphText.length
              }
              return null
            } else {
              // Inside content area or top/bottom padding
              const coords = { left: x, top: y }
              const pos = view.posAtCoords(coords)
              if (pos) return pos.pos
              
              // Fallback to paragraph position
              const domPos = view.posAtDOM(paragraph, 0)
              return domPos ?? null
            }
          }
          
          // Define function to get cursor position at click coordinates
          const getCursorPosition = (): number | null => {
            if (!closestParagraph) {
              return null
            }
            
            const paragraph: HTMLElement = closestParagraph
            
            if (isLeftPadding) {
              // Click on left padding: place cursor at the START of the line (left side)
              // For list items, find the inner paragraph
              let targetElement = paragraph
              if (paragraph.tagName.toLowerCase() === 'li') {
                const innerP = paragraph.querySelector(':scope > p')
                if (innerP) targetElement = innerP as HTMLElement
              }
              
              // Use coordinates at the left edge of the element, at the click Y position
              const pRect = targetElement.getBoundingClientRect()
              const coords = { left: pRect.left, top: clickY }
              const pos = view.posAtCoords(coords)
              if (pos) {
                return pos.pos
              } else {
                // Fallback: get start position of paragraph
                const domPos = view.posAtDOM(targetElement, 0)
                if (domPos !== null && domPos !== undefined) {
                  return domPos
                }
              }
              } else if (isRightPadding) {
                // Click on right padding: place cursor at the END of the line (right side)
                // For list items, find the inner paragraph
                let targetElement = paragraph
                if (paragraph.tagName.toLowerCase() === 'li') {
                  const innerP = paragraph.querySelector(':scope > p')
                  if (innerP) targetElement = innerP as HTMLElement
                }
                
                // We need to find the end of the specific line at the click Y position, not the end of the paragraph
                const pRect = targetElement.getBoundingClientRect()
                const contentMaxWidth = 816 // Max width of editor content
                const editorContainerRect = scrollContainerRef.current?.getBoundingClientRect()
                const contentLeft = editorContainerRect ? editorContainerRect.left + 120 : pRect.left // paddingLeft is 120px
                const contentRight = contentLeft + contentMaxWidth
                
                // First, find the start of the line at this Y position (left edge of element)
                const startCoords = { left: pRect.left, top: clickY }
                const startPos = view.posAtCoords(startCoords)
                
                if (startPos) {
                  // Get the paragraph node and its actual end position (including images)
                  const domPos = view.posAtDOM(targetElement, 0)
                  if (domPos !== null && domPos !== undefined) {
                    // Find the actual end of the paragraph node (not just text content)
                    const paragraphNode = view.state.doc.nodeAt(domPos)
                    if (paragraphNode) {
                      const paragraphEndPos = domPos + paragraphNode.nodeSize
                      
                      // Check for images on the same line
                      const lineYThreshold = 5 // pixels tolerance for same line
                      const startCoordsAtPos = view.coordsAtPos(startPos.pos)
                      const targetY = startCoordsAtPos ? startCoordsAtPos.top : clickY
                      
                      // Look for image nodes in the paragraph that are on the same line
                      let imageAfterPos = -1
                      view.state.doc.nodesBetween(domPos, paragraphEndPos, (node, nodePos) => {
                        if (node.type.name === 'image') {
                          const imageCoords = view.coordsAtPos(nodePos)
                          if (imageCoords && Math.abs(imageCoords.top - targetY) < lineYThreshold) {
                            // This image is on the same line
                            const afterImagePos = nodePos + node.nodeSize
                            if (afterImagePos > imageAfterPos) {
                              imageAfterPos = afterImagePos
                            }
                          }
                        }
                      })
                      
                      if (imageAfterPos > 0) {
                        // There's an image on this line, place cursor after it
                        return imageAfterPos
                      }
                      
                      // No image on this line, find the rightmost text position on the same line
                      const paragraphText = targetElement.textContent || ''
                      const textEndPos = domPos + paragraphText.length
                      
                      // Find the rightmost position on the same line (same Y coordinate)
                      // Use binary search to find the end of the line
                      let left = startPos.pos
                      let right = Math.min(textEndPos, paragraphEndPos)
                      let bestPos = startPos.pos
                      
                      // Binary search for the rightmost position on the same line
                      while (left <= right) {
                        const mid = Math.floor((left + right) / 2)
                        const midCoords = view.coordsAtPos(mid)
                        
                        if (midCoords && Math.abs(midCoords.top - targetY) < lineYThreshold) {
                          // This position is on the same line
                          bestPos = mid
                          left = mid + 1 // Try to go further right
                        } else {
                          right = mid - 1 // This position is on a different line, go left
                        }
                      }
                      
                      return bestPos
                    }
                  }
                  
                  return startPos.pos
                } else {
                  // Fallback: try coordinate at right edge
                  const coords = { left: contentRight, top: clickY }
                  const pos = view.posAtCoords(coords)
                  if (pos) {
                    return pos.pos
                  } else {
                    // Fallback: end of paragraph (including images)
                    const domPos = view.posAtDOM(targetElement, 0)
                    if (domPos !== null && domPos !== undefined) {
                      const paragraphNode = view.state.doc.nodeAt(domPos)
                      if (paragraphNode) {
                        return domPos + paragraphNode.nodeSize
                      }
                      const paragraphText = targetElement.textContent || ''
                      return domPos + paragraphText.length
                    }
                  }
                }
            } else {
              // Click is somewhere else (top/bottom padding), use coordinate-based positioning
              const coords = { left: e.clientX, top: e.clientY }
              const pos = view.posAtCoords(coords)
              if (pos) {
                return pos.pos
              } else {
                // Fallback to start of closest paragraph
                const domPos = view.posAtDOM(paragraph, 0)
                if (domPos !== null && domPos !== undefined) {
                  return domPos
                }
              }
            }
            return null
          }
          
          // Store initial position for text selection
          const initialPos = getCursorPosition()
          initialSelectionPosRef.current = initialPos
          
          // Define function to set cursor position
          const setCursorPosition = () => {
            if (initialPos !== null) {
              editor.chain().focus().setTextSelection(initialPos).run()
            } else {
              editor.chain().focus().run()
            }
          }
          
          // Set up mouse move listener to detect dragging and handle text selection
          const handleMouseMove = (moveEvent: MouseEvent) => {
            if (mouseDownPosRef.current && editor && scrollContainerRef.current) {
              const deltaX = Math.abs(moveEvent.clientX - mouseDownPosRef.current.x)
              const deltaY = Math.abs(moveEvent.clientY - mouseDownPosRef.current.y)
              const totalDistance = Math.sqrt(deltaX * deltaX + deltaY * deltaY)
              
              if (totalDistance > 5) { // Threshold for movement detection
                // Enable text selection for any drag when we have an initial position
                if (initialSelectionPosRef.current !== null) {
                  isDraggingRef.current = false // Don't treat as drag, allow selection
                  isTextSelectionActiveRef.current = true // Mark that we're doing text selection
                  
                  // Get the current position at the mouse coordinates (handles padding areas)
                  const currentPos = getPositionAtCoords(moveEvent.clientX, moveEvent.clientY)
                  
                  if (currentPos !== null && initialSelectionPosRef.current !== null) {
                    // Set text selection from initial position to current position
                    // Use from/to directly without sorting - this preserves selection direction
                    editor.chain().focus().setTextSelection({ 
                      from: initialSelectionPosRef.current, 
                      to: currentPos 
                    }).run()
                  }
                } else {
                  // No initial position, treat as drag
                  isDraggingRef.current = true
                  isTextSelectionActiveRef.current = false
                }
              }
            }
          }
          
          const handleMouseUp = () => {
            window.document.removeEventListener('mousemove', handleMouseMove)
            window.document.removeEventListener('mouseup', handleMouseUp)
            
            // If we were doing text selection (vertical drag), keep the selection - don't clear it
            // The selection will persist until the next mouse down
            if (isTextSelectionActiveRef.current) {
              // Text selection was active, keep it - don't do anything
              // The selection is already set and will persist
            } else if (!isDraggingRef.current) {
              // It was just a click (not a drag, not a text selection)
              setCursorPosition()
            }
            // Otherwise it was a horizontal drag, don't change anything
            
            mouseDownPosRef.current = null
            // Don't clear initialSelectionPosRef or isTextSelectionActiveRef here
            // They will be cleared on the next mouse down
          }
          
          window.document.addEventListener('mousemove', handleMouseMove)
          window.document.addEventListener('mouseup', handleMouseUp)
        }}
        onDoubleClick={(e) => {
          // Only handle double-click in padding area (outside ProseMirror content)
          const target = e.target as HTMLElement
          if (target.closest('.ProseMirror')) {
            return // Let ProseMirror handle it
          }
          
          if (!editor || !scrollContainerRef.current) return
          
          const editorElement = scrollContainerRef.current.querySelector('.ProseMirror') as HTMLElement
          if (!editorElement) return
          
          const view = editor.view
          const clickY = e.clientY
          
          // Find closest paragraph
          const paragraphs = editorElement.querySelectorAll('p, h1, h2, h3, h4, h5, h6')
          let closestElement: HTMLElement | null = null
          let minDist = Infinity
          
          paragraphs.forEach((p) => {
            const rect = (p as HTMLElement).getBoundingClientRect()
            const dist = clickY >= rect.top && clickY <= rect.bottom 
              ? 0 
              : Math.min(Math.abs(clickY - rect.top), Math.abs(clickY - rect.bottom))
            if (dist < minDist) {
              minDist = dist
              closestElement = p as HTMLElement
            }
          })
          
          if (!closestElement) return
          
          const closestPara = closestElement as HTMLElement
          
          // Get position and select first/last word
          const coords = { left: closestPara.getBoundingClientRect().left, top: clickY }
          const posResult = view.posAtCoords(coords)
          if (!posResult) return
          
          const pos = posResult.pos
          const $pos = editor.state.doc.resolve(pos)
          const parent = $pos.parent
          const text = parent.textContent || ''
          
          // Select first or last word depending on click position
          const editorRect = editorElement.getBoundingClientRect()
          const isLeftPadding = e.clientX < editorRect.left
          
          if (isLeftPadding) {
            // Select first word
            const match = text.match(/^\s*(\S+)/)
            if (match) {
              const wordEnd = (match.index || 0) + match[0].length
              editor.chain().focus().setTextSelection({ 
                from: $pos.start(), 
                to: $pos.start() + wordEnd 
              }).run()
            }
          } else {
            // Select last word
            const match = text.match(/(\S+)\s*$/)
            if (match) {
              const wordStart = match.index || 0
              editor.chain().focus().setTextSelection({ 
                from: $pos.start() + wordStart, 
                to: $pos.start() + text.length 
              }).run()
            }
          }
        }}
        onClickCapture={(e) => {
          // Only handle triple-click in padding area
          if (e.detail !== 3) return
          
          const target = e.target as HTMLElement
          if (target.closest('.ProseMirror')) {
            return // Let ProseMirror handle it
          }
          
          if (!editor || !scrollContainerRef.current) return
          
          const editorElement = scrollContainerRef.current.querySelector('.ProseMirror') as HTMLElement
          if (!editorElement) return
          
          const view = editor.view
          const clickY = e.clientY
          
          // Find closest paragraph
          const tripleClickParagraphs = editorElement.querySelectorAll('p, h1, h2, h3, h4, h5, h6')
          let tripleClickClosest: HTMLElement | null = null
          let tripleClickMinDist = Infinity
          
          tripleClickParagraphs.forEach((p) => {
            const rect = (p as HTMLElement).getBoundingClientRect()
            const dist = clickY >= rect.top && clickY <= rect.bottom 
              ? 0 
              : Math.min(Math.abs(clickY - rect.top), Math.abs(clickY - rect.bottom))
            if (dist < tripleClickMinDist) {
              tripleClickMinDist = dist
              tripleClickClosest = p as HTMLElement
            }
          })
          
          if (!tripleClickClosest) return
          
          const tripleClickPara = tripleClickClosest as HTMLElement
          
          // Select entire paragraph
          const domPos = view.posAtDOM(tripleClickPara, 0)
          if (domPos !== null && domPos !== undefined) {
            const text = tripleClickPara.textContent || ''
            editor.chain().focus().setTextSelection({ 
              from: domPos, 
              to: domPos + text.length 
            }).run()
          }
        }}
      >
        <div className={theme === 'dark' ? 'dark-theme' : ''} style={{ 
          maxWidth: '816px',
          margin: '0 auto',
          minHeight: '100%'
        }}>
          <EditorContent editor={editor} />
          <Autocomplete editor={editor} documentContent={document?.content} documentId={document?.id} />
        </div>
      </div>
    </div>
  )
}

