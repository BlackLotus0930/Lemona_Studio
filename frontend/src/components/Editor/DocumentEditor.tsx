import { Editor } from '@tiptap/react'
import { EditorContent } from '@tiptap/react'
import { useNavigate } from 'react-router-dom'
import { useEffect, useRef, useState, useImperativeHandle, forwardRef } from 'react'
import { Document } from '@shared/types'
import Autocomplete from '../Autocomplete/Autocomplete'
import TextRephrasePopup from './TextRephrasePopup'
import { documentApi } from '../../services/api'
import { useTheme } from '../../contexts/ThemeContext'
import './EditorStyles.css'

interface DocumentEditorProps {
  document: Document | null
  editor: Editor | null
  onDocumentChange?: (doc: Document | null) => void
  showToolbarOnly?: boolean
  isAIPanelOpen?: boolean
  aiPanelWidth?: number // Percentage width of AI panel
}

export interface DocumentEditorSearchHandle {
  openSearch: () => void
  closeSearch: () => void
  toggleSearch: () => void
  clearSearch: () => void // Clear search highlights and state
}

// DocumentEditor component for multi-editor architecture
// In this architecture:
// - Each document has its own Editor instance (created in DocumentEditorWrapper)
// - Editor content is set when the editor is created, not when switching documents
// - This component handles search, selection, scrolling, and other UI interactions
// - It does NOT handle content initialization or updates (handled by DocumentEditorWrapper)
const DocumentEditor = forwardRef<DocumentEditorSearchHandle, DocumentEditorProps>(
  ({ document, editor, isAIPanelOpen = false, aiPanelWidth = 20 }, ref) => {
  const { theme } = useTheme()
  const navigate = useNavigate()
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const scrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isDraggingRef = useRef(false)
  const mouseDownPosRef = useRef<{ x: number; y: number } | null>(null)
  const initialSelectionPosRef = useRef<number | null>(null)
  const isTextSelectionActiveRef = useRef(false)
  const scrollSaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  
  // Text selection popup state
  const [selectedText, setSelectedText] = useState<string>('')
  const [selectedRange, setSelectedRange] = useState<{ from: number; to: number } | null>(null)
  const selectedRangeRef = useRef<{ from: number; to: number } | null>(null) // Use ref for reliable access in event handlers
  const selectedTextRef = useRef<string>('') // Use ref for reliable access in event handlers
  const [showRephrasePopup, setShowRephrasePopup] = useState(false)
  const [popupPosition, setPopupPosition] = useState({ x: 0, y: 0 })
  
  // Inline search/replace state
  const [showInlineSearch, setShowInlineSearch] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [replaceQuery, setReplaceQuery] = useState('')
  const [matches, setMatches] = useState<Array<{ from: number; to: number; pageNumber?: number }>>([])
  const [currentMatchIndex, setCurrentMatchIndex] = useState(-1)
  const [activeSearchQuery, setActiveSearchQuery] = useState('') // The query that was actually searched
  const inlineSearchInputRef = useRef<HTMLInputElement>(null)
  const inlineReplaceInputRef = useRef<HTMLInputElement>(null)
  const isSearchInputFocusedRef = useRef(false)
  const isReplaceInputFocusedRef = useRef(false)
  const isRephrasePopupInputFocusedRef = useRef(false)
  const isCtrlKProcessingRef = useRef(false)
  const isRephrasePopupOpenRef = useRef(false) // Track if popup is open to prevent selection updates
  const editorRef = useRef<Editor | null>(null) // Store editor in ref for reliable access in event handlers
  const [rightOffset, setRightOffset] = useState(20)
  
  // Keep editor ref in sync with prop
  useEffect(() => {
    editorRef.current = editor
  }, [editor])
  
  // Expose search API to parent (Layout)
  useImperativeHandle(ref, () => ({
    openSearch: () => {
      setShowInlineSearch(true)
      setTimeout(() => {
        inlineSearchInputRef.current?.focus()
        inlineSearchInputRef.current?.select()
      }, 50)
    },
    closeSearch: () => {
      clearInlineSearchHighlights()
      setMatches([])
      setCurrentMatchIndex(-1)
      setActiveSearchQuery('')
      setSearchQuery('')
      setReplaceQuery('')
      setShowInlineSearch(false)
    },
    toggleSearch: () => {
      if (showInlineSearch) {
        clearInlineSearchHighlights()
        setMatches([])
        setCurrentMatchIndex(-1)
        setActiveSearchQuery('')
        setSearchQuery('')
        setReplaceQuery('')
        setShowInlineSearch(false)
      } else {
        setShowInlineSearch(true)
        setTimeout(() => {
          inlineSearchInputRef.current?.focus()
          inlineSearchInputRef.current?.select()
        }, 50)
      }
    },
    clearSearch: () => {
      clearInlineSearchHighlights()
      setMatches([])
      setCurrentMatchIndex(-1)
      setActiveSearchQuery('')
      setSearchQuery('')
      setReplaceQuery('')
      setShowInlineSearch(false)
    },
  }))
  
  const bgColor = theme === 'dark' ? '#181818' : '#ffffff'
  const textColor = theme === 'dark' ? '#FFFFFF' : '#202124'

  // Save scroll position to localStorage
  const saveScrollPosition = (documentId: string, scrollTop: number) => {
    try {
      localStorage.setItem(`documentScroll_${documentId}`, scrollTop.toString())
    } catch (error) {
      console.error('Failed to save scroll position:', error)
    }
  }

  // Note: loadScrollPosition is now handled in Layout.tsx to restore scroll position
  // immediately after setContent, preventing any scrolling animation

  const handleNewDocument = async () => {
    try {
      const newDoc = await documentApi.create('Untitled Document')
      navigate(`/document/${newDoc.data.id}`)
    } catch (error) {
      console.error('Failed to create document:', error)
      alert('Failed to create document. Please try again.')
    }
  }

  // Prevent editor from stealing focus when search inputs are active
  useEffect(() => {
    if (!editor) return
    
    // Check if editor is destroyed or view is not available
    if (editor.isDestroyed || !editor.view) return

    const handleEditorBlur = (event: FocusEvent) => {
      // If focus is moving to search input, prevent editor from regaining focus
      const relatedTarget = event.relatedTarget as HTMLElement
      if (relatedTarget === inlineSearchInputRef.current || relatedTarget === inlineReplaceInputRef.current) {
        // Don't let editor steal focus back
        return
      }
      
      // If search input is focused, prevent editor from regaining focus
      if (isSearchInputFocusedRef.current || isReplaceInputFocusedRef.current) {
        event.preventDefault?.()
        return
      }
    }

    const handleFocusAttempt = (event: FocusEvent) => {
      // Check if editor is still valid before accessing view
      if (editor.isDestroyed || !editor.view) return
      
      // If search input is focused, prevent editor from stealing focus
      if (isSearchInputFocusedRef.current || isReplaceInputFocusedRef.current) {
        const target = event.target as HTMLElement
        if (target === editor.view.dom || editor.view.dom.contains(target)) {
          event.preventDefault()
          event.stopPropagation()
          // Keep focus on the search input
          if (isSearchInputFocusedRef.current && inlineSearchInputRef.current) {
            inlineSearchInputRef.current.focus()
          } else if (isReplaceInputFocusedRef.current && inlineReplaceInputRef.current) {
            inlineReplaceInputRef.current.focus()
          }
        }
      }
    }

    // Check again before accessing view.dom (editor might have been destroyed between checks)
    if (editor.isDestroyed || !editor.view) return
    
    const editorElement = editor.view.dom as HTMLElement
    const globalDoc = window.document
    if (editorElement) {
      editorElement.addEventListener('blur', handleEditorBlur, true)
      // Also listen for focus events to prevent stealing
      globalDoc.addEventListener('focusin', handleFocusAttempt, true)
      return () => {
        // Check if editor is still valid before removing listeners
        if (!editor.isDestroyed && editor.view && editorElement) {
          editorElement.removeEventListener('blur', handleEditorBlur, true)
        }
        globalDoc.removeEventListener('focusin', handleFocusAttempt, true)
      }
    }
  }, [editor])

  // Track text selection for rephrase popup
  useEffect(() => {
    if (!editor) return

    const updatePopupPosition = (range?: { from: number; to: number }) => {
      const rangeToUse = range || selectedRange
      if (!rangeToUse || !scrollContainerRef.current || !editor) return
      
      // Use requestAnimationFrame to ensure DOM has updated
      requestAnimationFrame(() => {
        if (!rangeToUse || !scrollContainerRef.current || !editor) return
        
        const { from, to } = rangeToUse
        
        // Try to get the DOM selection first (more reliable for paragraph selections)
        const domSelection = window.getSelection()
        if (domSelection && domSelection.rangeCount > 0) {
          const domRange = domSelection.getRangeAt(0)
          const rect = domRange.getBoundingClientRect()
          
          if (rect.width > 0 || rect.height > 0) {
            // Use the right edge and top of the selection bounding box
            const x = rect.right + 8 // 8px after the end of selection
            const y = rect.top - 4 // Slightly above the selection line
            
            setPopupPosition({ x, y })
            return
          }
        }
        
        // Fallback to ProseMirror coordinates if DOM selection doesn't work
        if (editor.isDestroyed || !editor.view) return
        
        // Validate positions are within document bounds
        const docSize = editor.state.doc.content.size
        if (from < 0 || from > docSize || to < 0 || to > docSize) {
          // Invalid range, but don't close if Ctrl+K is being processed or popup is showing
          if (!isCtrlKProcessingRef.current && !showRephrasePopup) {
            setShowRephrasePopup(false)
            isRephrasePopupOpenRef.current = false
            setSelectedRange(null)
            setSelectedText('')
          }
          return
        }
        
        const startCoords = editor.view.coordsAtPos(from)
        const endCoords = editor.view.coordsAtPos(to)
        
        if (startCoords && endCoords) {
          // Use the rightmost X coordinate (from end position)
          const x = endCoords.right + 8 // 8px after the end of selection
          
          // Use the topmost Y coordinate (from start position) for better positioning
          // This ensures the popup appears at the top-right of the selection, not at the bottom
          const y = startCoords.top - 4 // Slightly above the selection line
          
          setPopupPosition({ x, y })
        }
      })
    }

    const handleSelectionUpdate = () => {
      // CRITICAL: Don't close popup if Ctrl+K is being processed (prevents race condition)
      // Check this FIRST before any other logic
      if (isCtrlKProcessingRef.current) {
        // If we have a stored range, ensure popup stays open and update position
        // Don't update position if rephrase popup input is focused (prevents popup from moving when input is clicked)
        if (selectedRangeRef.current && !isRephrasePopupInputFocusedRef.current) {
          updatePopupPosition(selectedRangeRef.current)
        }
        if (selectedRangeRef.current) {
          if (!isRephrasePopupOpenRef.current) {
            isRephrasePopupOpenRef.current = true
          }
          if (!showRephrasePopup) {
            setShowRephrasePopup(true)
          }
        }
        return
      }
      
      // CRITICAL: If popup is open, don't update selectedText/selectedRange
      // This prevents selection from being reset when editor loses focus due to popup interaction
      if (isRephrasePopupOpenRef.current && selectedRangeRef.current) {
        // Don't update position if rephrase popup input is focused (prevents popup from moving when input is clicked)
        if (!isRephrasePopupInputFocusedRef.current) {
          // Only update position if needed, but keep the stored text and range
          updatePopupPosition(selectedRangeRef.current)
        }
        return
      }
      
      // Don't update selection popup if search input or rephrase popup input is focused
      if (isSearchInputFocusedRef.current || isReplaceInputFocusedRef.current || isRephrasePopupInputFocusedRef.current) {
        return
      }
      
      const { from, to } = editor.state.selection
      const isEmpty = from === to
      
      // CRITICAL: If we have a stored range, NEVER close the popup on selection collapse
      // This prevents the popup from disappearing when Ctrl+K is pressed (which may temporarily collapse selection)
      // Use selectedRangeRef as source of truth (more reliable than state)
      if (selectedRangeRef.current) {
        // Always keep popup open if we have a stored range, even if selection temporarily collapses
        // Only update position, don't close it
        updatePopupPosition(selectedRangeRef.current)
        // Ensure popup stays visible and is marked as open
        if (!isRephrasePopupOpenRef.current) {
          isRephrasePopupOpenRef.current = true
        }
        if (!showRephrasePopup) {
          setShowRephrasePopup(true)
        }
        return
      }
      
      if (isEmpty) {
        setSelectedText('')
        setSelectedRange(null)
        selectedTextRef.current = ''
        selectedRangeRef.current = null
        setShowRephrasePopup(false)
        isRephrasePopupOpenRef.current = false
        return
      }

      const selected = editor.state.doc.textBetween(from, to)
      
      if (selected.trim().length > 0) {
        const range = { from, to }
        // CRITICAL: Save text and range IMMEDIATELY to refs BEFORE showing popup to prevent race conditions
        // This ensures we capture the full text even if editor loses focus immediately after
        selectedTextRef.current = selected
        selectedRangeRef.current = range
        
        // Also update state for React rendering
        setSelectedText(selected)
        setSelectedRange(range)
        // Update position immediately with the new range
        updatePopupPosition(range)
        // Mark popup as open AFTER setting text and range
        isRephrasePopupOpenRef.current = true
        setShowRephrasePopup(true)
      } else {
        setSelectedText('')
        setSelectedRange(null)
        selectedTextRef.current = ''
        selectedRangeRef.current = null
        setShowRephrasePopup(false)
        isRephrasePopupOpenRef.current = false
      }
    }

    editor.on('selectionUpdate', handleSelectionUpdate)
    editor.on('transaction', handleSelectionUpdate)

    // Also check selection on mouseup to catch double-click selections
    const handleMouseUp = () => {
      // Small delay to ensure ProseMirror has processed the selection
      setTimeout(() => {
        if (editor) {
          handleSelectionUpdate()
        }
      }, 10)
    }

    // Update popup position on scroll
    const handleScroll = () => {
      // Don't update position if rephrase popup input is focused (prevents popup from moving when input is clicked)
      if (showRephrasePopup && selectedRange && !isRephrasePopupInputFocusedRef.current) {
        updatePopupPosition(selectedRange)
      }
    }

    const scrollContainer = scrollContainerRef.current
    if (scrollContainer) {
      scrollContainer.addEventListener('scroll', handleScroll, { passive: true })
      scrollContainer.addEventListener('mouseup', handleMouseUp, { passive: true })
    }

    return () => {
      editor.off('selectionUpdate', handleSelectionUpdate)
      editor.off('transaction', handleSelectionUpdate)
      if (scrollContainer) {
        scrollContainer.removeEventListener('scroll', handleScroll)
        scrollContainer.removeEventListener('mouseup', handleMouseUp)
      }
    }
  }, [editor, showRephrasePopup, selectedRange])

  // Handle Ctrl+K - MUST intercept 100% in capture phase before ProseMirror/browser
  // Register IMMEDIATELY on mount, don't wait for editor to be ready
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Handle Ctrl+K or Cmd+K
      if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')) {
        // Check if popup is already showing - if so, let TextRephrasePopup handle it
        // This allows Ctrl+K to expand the popup if it's showing but not expanded yet
        const isPopupShowing = showRephrasePopup && isRephrasePopupOpenRef.current
        
        // If popup is showing (whether expanded or not), don't intercept (let TextRephrasePopup handle)
        // This ensures Ctrl+K expands the popup and executes improve when text is selected
        if (isPopupShowing) {
          return
        }
        
        // Check for text selection using multiple strategies (don't depend on editor being ready)
        let hasSelection = false
        let selectionRange: { from: number; to: number } | null = null
        let selectionText = ''
        
        // Strategy 1: Check ref (most reliable, set by selection update handler)
        if (selectedRangeRef.current) {
          hasSelection = true
          selectionRange = selectedRangeRef.current
          selectionText = selectedTextRef.current
        }
        
        // Strategy 2: Check DOM selection (works even if editor not ready)
        if (!hasSelection) {
          try {
            const domSelection = window.getSelection()
            if (domSelection && domSelection.rangeCount > 0) {
              const domRange = domSelection.getRangeAt(0)
              const selected = domRange.toString().trim()
              
              if (selected.length > 0) {
                // Try to convert DOM selection to ProseMirror positions if editor is ready
                const currentEditor = editorRef.current
                if (currentEditor && !currentEditor.isDestroyed && currentEditor.view) {
                  try {
                    // Try to find positions using DOM range
                    const startPos = currentEditor.view.posAtCoords({
                      left: domRange.getBoundingClientRect().left,
                      top: domRange.getBoundingClientRect().top
                    })
                    const endPos = currentEditor.view.posAtCoords({
                      left: domRange.getBoundingClientRect().right,
                      top: domRange.getBoundingClientRect().bottom
                    })
                    
                    if (startPos && endPos && startPos.pos !== endPos.pos) {
                      selectionRange = { from: startPos.pos, to: endPos.pos }
                      selectionText = selected
                      hasSelection = true
                    }
                  } catch (error) {
                    // If conversion fails, we still have DOM selection
                    // We'll use it but might need to handle differently
                    console.debug('DOM to ProseMirror conversion failed:', error)
                  }
                }
                
                // If editor not ready or conversion failed, check editor selection directly
                if (!hasSelection && currentEditor && !currentEditor.isDestroyed && currentEditor.view) {
                  try {
                    const { from, to } = currentEditor.state.selection
                    if (from !== to) {
                      const editorSelected = currentEditor.state.doc.textBetween(from, to)
                      if (editorSelected.trim().length > 0) {
                        selectionRange = { from, to }
                        selectionText = editorSelected
                        hasSelection = true
                      }
                    }
                  } catch (error) {
                    console.debug('Editor selection check failed:', error)
                  }
                }
                
                // If we have DOM selection but couldn't convert, still proceed
                // The popup will work, but we might need to handle replacement differently
                if (!hasSelection && selected.length > 0) {
                  // Use a placeholder range - will be updated when editor is ready
                  hasSelection = true
                  selectionText = selected
                  // Mark that we need to resolve the range later
                  // For now, we'll open the popup and let selection update handler set the range
                }
              }
            }
          } catch (error) {
            console.debug('DOM selection check failed:', error)
          }
        }
        
        // If there's a selection, open popup and let TextRephrasePopup handle expansion
        if (hasSelection) {
          // CRITICAL: Set flag FIRST before any other operations
          // This prevents selection update handlers from closing popup
          isCtrlKProcessingRef.current = true
          
          // CRITICAL: Mark the time when Ctrl+K is pressed to prevent click-outside handler from closing popup
          // Store in window object so TextRephrasePopup can also access it
          ;(window as any).__lastCtrlKTime = Date.now()
          
          // CRITICAL: Prevent default to prevent browser/ProseMirror default behavior
          // But DON'T stop propagation - let TextRephrasePopup handle the expansion
          e.preventDefault()
          
          // Cancel any pending autocomplete requests
          if (typeof (window as any).__cancelAutocomplete === 'function') {
            (window as any).__cancelAutocomplete()
          }
          
          // Save selection to refs if we have valid range
          if (selectionRange) {
            selectedRangeRef.current = selectionRange
            selectedTextRef.current = selectionText
            setSelectedRange(selectionRange)
            setSelectedText(selectionText)
          } else if (selectionText) {
            // We have text but no range yet - save text, range will be resolved by selection handler
            selectedTextRef.current = selectionText
            setSelectedText(selectionText)
          }
          
          // Ensure popup is marked as open and shown
          isRephrasePopupOpenRef.current = true
          const wasPopupHidden = !showRephrasePopup
          if (wasPopupHidden) {
            setShowRephrasePopup(true)
          }
          
          // If popup was just opened, trigger expansion via window signal
          // This ensures TextRephrasePopup expands even if it hasn't registered event listener yet
          if (wasPopupHidden) {
            // Set a flag that TextRephrasePopup can check
            ;(window as any).__triggerRephraseExpand = true
            // Use requestAnimationFrame to ensure popup has rendered
            requestAnimationFrame(() => {
              // Trigger a custom event that TextRephrasePopup can listen to
              window.dispatchEvent(new CustomEvent('rephrase-popup-open'))
            })
          }
          
          // Don't stop propagation - let the event continue to TextRephrasePopup
          // TextRephrasePopup will handle expanding the popup and executing improve
          // Clear flag after a delay to allow popup to expand and stabilize
          setTimeout(() => {
            isCtrlKProcessingRef.current = false
          }, 1500) // Longer delay to ensure popup is fully stable and selection updates have settled
          
          // Return without stopping propagation so TextRephrasePopup can handle it
          return
        }
      }
    }

    // Use capture phase at the earliest possible stage
    // This MUST be before ProseMirror's keymap handlers
    // Register IMMEDIATELY - don't wait for editor or any other dependencies
    window.addEventListener('keydown', handleKeyDown, { capture: true, passive: false })
    
    return () => {
      window.removeEventListener('keydown', handleKeyDown, { capture: true })
    }
  }, [showRephrasePopup]) // Only depend on showRephrasePopup, not editor

  // Note: Scroll position restoration is now handled in Layout.tsx immediately after setContent
  // to avoid any scrolling animation. This useEffect is kept as a fallback for edge cases.
  // The Layout component restores scroll position using requestAnimationFrame for instant positioning.
  // useEffect(() => {
  //   if (!document?.id || !scrollContainerRef.current) return

  //   const savedScrollTop = loadScrollPosition(document.id)
  //   if (savedScrollTop !== null) {
  //     // Small delay to ensure content is rendered
  //     setTimeout(() => {
  //       if (scrollContainerRef.current) {
  //         scrollContainerRef.current.scrollTop = savedScrollTop
  //       }
  //     }, 100)
  //   }
  // }, [document?.id])

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

  // Clear inline search highlights (both all matches and current match highlights)
  const clearInlineSearchHighlights = () => {
    if (!editor || editor.isDestroyed || !editor.view) return
    
    try {
      const { state, dispatch } = editor.view
      const { tr } = state
      let modified = false
      
      // Find all highlight marks and remove inline search highlights
      state.doc.descendants((node, pos) => {
        if (node.marks) {
          node.marks.forEach((mark) => {
            if (mark.type.name === 'highlight') {
              const color = mark.attrs?.color
              // Use specific colors to identify inline search highlights (distinct from global search)
              // Dark mode: All matches: #6b7280, Current match: #6366f1
              // Light mode: All matches: #93c5fd, Current match: #818cf8
              if (color === '#fde047' || color === '#6b7280' || color === '#6366f1' || color === '#93c5fd' || color === '#818cf8') {
                const from = pos
                const to = pos + node.nodeSize
                tr.removeMark(from, to, mark.type)
                modified = true
              }
            }
          })
        }
      })
      
      if (modified) {
        dispatch(tr)
      }
    } catch (error) {
      console.error('Error clearing inline search highlights:', error)
    }
  }

  // Check if document is a PDF
  const isPDF = document && document.title.toLowerCase().endsWith('.pdf')

  // Find all matches in the document (supports both regular documents and PDFs)
  const findMatches = (query: string, caseSensitive: boolean = false): Array<{ from: number; to: number; pageNumber?: number }> => {
    if (!query.trim()) return []
    
    const matches: Array<{ from: number; to: number; pageNumber?: number }> = []
    const searchText = caseSensitive ? query : query.toLowerCase()
    
    // If PDF, search PDF text
    if (isPDF && document?.pdfText) {
      try {
        const pdfText = document.pdfText
        // Search through all pages
        pdfText.pages.forEach((page) => {
          const pageText = caseSensitive ? page.fullText : page.fullText.toLowerCase()
          let searchIndex = 0
          
          while (true) {
            const index = pageText.indexOf(searchText, searchIndex)
            if (index === -1) break
            
            // For PDFs, we use character positions within the page
            // Store page number for navigation
            matches.push({
              from: index,
              to: index + query.length,
              pageNumber: page.pageNumber,
            })
            searchIndex = index + 1
          }
        })
      } catch (error) {
        console.error('Error finding matches in PDF:', error)
      }
    } else if (editor) {
      // Regular document - search editor content
      try {
        editor.state.doc.descendants((node: any, pos: number) => {
          if (node.isText) {
            const text = node.text || ''
            const textToSearch = caseSensitive ? text : text.toLowerCase()
            let searchIndex = 0
            
            while (true) {
              const index = textToSearch.indexOf(searchText, searchIndex)
              if (index === -1) break
              
              const from = pos + index
              const to = from + query.length
              matches.push({ from, to })
              searchIndex = index + 1
            }
          }
        })
      } catch (error) {
        console.error('Error finding matches:', error)
      }
    }
    
    return matches
  }

  // Perform search manually (called on Enter)
  const performSearch = () => {
    if (!searchQuery.trim()) {
      clearInlineSearchHighlights()
      setMatches([])
      setCurrentMatchIndex(-1)
      setActiveSearchQuery('')
      return
    }
    
    // For non-PDF documents, clear previous highlights
    if (!isPDF && editor) {
      clearInlineSearchHighlights()
    }
    
    const foundMatches = findMatches(searchQuery, false) // Always case-insensitive now
    setMatches(foundMatches)
    setActiveSearchQuery(searchQuery)
    
    if (foundMatches.length > 0) {
      setCurrentMatchIndex(0)
      // Highlight all matches (only for non-PDF documents)
      if (!isPDF && editor) {
        highlightMatches(foundMatches, 0)
        navigateToMatch(0, foundMatches)
      } else if (isPDF) {
        // For PDFs, just navigate to the first match page
        navigateToPDFMatch(0, foundMatches)
      }
    } else {
      setCurrentMatchIndex(-1)
      if (!isPDF && editor) {
        highlightMatches(foundMatches, -1)
      }
    }
  }

  // Navigate to PDF match (scroll to page in PDF viewer)
  const navigateToPDFMatch = (index: number, matchesToUse?: Array<{ from: number; to: number; pageNumber?: number }>) => {
    const matchesList = matchesToUse || matches
    if (matchesList.length === 0 || index < 0 || index >= matchesList.length) return
    
    const match = matchesList[index]
    if (match && match.pageNumber) {
      // TODO: Implement PDF page navigation
      // For now, we can show a message or try to communicate with the PDF iframe
      // This would require using pdfjs-dist to render PDFs instead of iframe
      // In the future, we can integrate with pdfjs-dist to highlight and navigate
    }
  }

  // Navigate to previous match
  const navigateToPrevious = () => {
    if (matches.length === 0) return
    const prevIndex = currentMatchIndex <= 0 ? matches.length - 1 : currentMatchIndex - 1
    setCurrentMatchIndex(prevIndex)
    
    if (isPDF) {
      navigateToPDFMatch(prevIndex)
    } else if (editor) {
      updateCurrentMatchHighlight(prevIndex)
      navigateToMatch(prevIndex)
    }
  }

  // Navigate to next match
  const navigateToNext = () => {
    if (matches.length === 0) return
    const nextIndex = (currentMatchIndex + 1) % matches.length
    setCurrentMatchIndex(nextIndex)
    
    if (isPDF) {
      navigateToPDFMatch(nextIndex)
    } else if (editor) {
      updateCurrentMatchHighlight(nextIndex)
      navigateToMatch(nextIndex)
    }
  }

  // Highlight all matches (temporary highlights) - all matches get the same color
  const highlightMatches = (matchesToHighlight: Array<{ from: number; to: number }>, currentIndex: number = -1) => {
    if (!editor || editor.isDestroyed || !editor.view || matchesToHighlight.length === 0) {
      // Clear highlights if no matches
      clearInlineSearchHighlights()
      return
    }
    
    try {
      // Always clear existing highlights before adding new ones
      clearInlineSearchHighlights()
      
      const { state, dispatch } = editor.view
      const { tr } = state
      // Use theme-aware colors for matches
      const allMatchesColor = theme === 'dark' ? '#6b7280' : '#93c5fd'
      // Use purple/indigo for current match
      const currentMatchColor = theme === 'dark' ? '#6366f1' : '#818cf8'
      
      matchesToHighlight.forEach(({ from, to }, index) => {
        // Use different color for current match
        const color = index === currentIndex ? currentMatchColor : allMatchesColor
        tr.addMark(from, to, state.schema.marks.highlight.create({ color }))
      })
      
      dispatch(tr)
    } catch (error) {
      console.error('Error highlighting matches:', error)
    }
  }

  // Update current match highlight when navigating
  const updateCurrentMatchHighlight = (newIndex: number) => {
    if (!editor || matches.length === 0 || newIndex < 0 || newIndex >= matches.length) return
    
    try {
      const { state, dispatch } = editor.view
      const { tr } = state
      const allMatchesColor = '#6b7280'
      const currentMatchColor = '#6366f1'
      
      // Remove highlight from previous current match
      if (currentMatchIndex >= 0 && currentMatchIndex < matches.length) {
        const prevMatch = matches[currentMatchIndex]
        tr.removeMark(prevMatch.from, prevMatch.to, state.schema.marks.highlight)
        tr.addMark(prevMatch.from, prevMatch.to, state.schema.marks.highlight.create({ color: allMatchesColor }))
      }
      
      // Add highlight to new current match
      const newMatch = matches[newIndex]
      tr.removeMark(newMatch.from, newMatch.to, state.schema.marks.highlight)
      tr.addMark(newMatch.from, newMatch.to, state.schema.marks.highlight.create({ color: currentMatchColor }))
      
      dispatch(tr)
    } catch (error) {
      console.error('Error updating current match highlight:', error)
    }
  }

  // Navigate to a specific match
  const navigateToMatch = (index: number, matchesToUse?: Array<{ from: number; to: number }>) => {
    const matchesList = matchesToUse || matches
    if (!editor || matchesList.length === 0 || index < 0 || index >= matchesList.length) return
    
    const match = matchesList[index]
    try {
      // Update highlight for current match if navigating within existing matches
      if (!matchesToUse && currentMatchIndex !== index && currentMatchIndex >= 0) {
        updateCurrentMatchHighlight(index)
      }
      
      // Don't set text selection - just scroll to the match
      // The highlight is enough to show which match is current
      
      // Scroll to match
      setTimeout(() => {
        if (editor.isDestroyed || !editor.view) return
        const coords = editor.view.coordsAtPos(match.from)
        if (coords && scrollContainerRef.current) {
          const container = scrollContainerRef.current
          const containerRect = container.getBoundingClientRect()
          const matchY = coords.top - containerRect.top + container.scrollTop
          const viewportHeight = container.clientHeight
          const targetY = matchY - viewportHeight * 0.3 // Position at 30% from top
          
          container.scrollTop = Math.max(0, targetY)
        }
      }, 50)
    } catch (error) {
      console.error('Error navigating to match:', error)
    }
  }

  // Calculate right offset based on AI panel state
  useEffect(() => {
    const calculateRightOffset = () => {
      if (!isAIPanelOpen) return 20
      // AI panel takes up a percentage of the viewport width
      // FileExplorer typically takes ~14% of width, so AI panel is percentage of remaining 86%
      const viewportWidth = window.innerWidth
      const fileExplorerPercent = 14 // Approximate FileExplorer width
      const remainingWidth = viewportWidth * (1 - fileExplorerPercent / 100)
      const aiPanelPixelWidth = remainingWidth * (aiPanelWidth / 100)
      return aiPanelPixelWidth + 20 // Add 20px margin
    }
    
    setRightOffset(calculateRightOffset())
    
    // Update on window resize
    const handleResize = () => {
      setRightOffset(calculateRightOffset())
    }
    
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [isAIPanelOpen, aiPanelWidth])

  // Clear search when dialog closes - ensure highlights are removed
  useEffect(() => {
    if (!showInlineSearch) {
      // Clear highlights immediately when dialog closes
      clearInlineSearchHighlights()
      setMatches([])
      setCurrentMatchIndex(-1)
      setActiveSearchQuery('')
      setSearchQuery('')
      setReplaceQuery('')
    }
  }, [showInlineSearch, editor])

  // Clear search highlights when document or editor changes
  // In multi-editor architecture, each document has its own editor instance
  // When switching documents, we need to clear search state for the previous document
  const prevDocumentIdRef = useRef<string | undefined>(undefined)
  const prevEditorRef = useRef<Editor | null>(null)
  useEffect(() => {
    // Clear if document changed OR editor instance changed
    const documentChanged = prevDocumentIdRef.current !== undefined && prevDocumentIdRef.current !== document?.id
    const editorChanged = prevEditorRef.current !== null && prevEditorRef.current !== editor
    
    if (documentChanged || editorChanged) {
      // Clear highlights and search state when switching documents or editor changes
      // Note: In multi-editor architecture, each editor maintains its own state
      // We only need to clear the UI state (search highlights, matches, etc.)
      clearInlineSearchHighlights()
      setMatches([])
      setCurrentMatchIndex(-1)
      setActiveSearchQuery('')
      setSearchQuery('')
      setReplaceQuery('')
      setShowInlineSearch(false)
    }
    
    // Update the refs to track current document ID and editor
    prevDocumentIdRef.current = document?.id
    prevEditorRef.current = editor
  }, [document?.id, editor])

  // Handle replace current match
  const handleReplace = () => {
    if (!editor || currentMatchIndex < 0 || currentMatchIndex >= matches.length || !replaceQuery.trim()) return
    
    const match = matches[currentMatchIndex]
    try {
      // Set selection only when replacing (needed for the replace operation)
      editor.chain()
        .focus()
        .setTextSelection(match)
        .deleteSelection()
        .insertContent(replaceQuery)
        .run()
      
      // Re-search to update matches
      const newMatches = findMatches(activeSearchQuery, false)
      setMatches(newMatches)
      
      // Adjust current match index and highlight
      if (currentMatchIndex < newMatches.length) {
        highlightMatches(newMatches, currentMatchIndex)
        navigateToMatch(currentMatchIndex)
      } else if (newMatches.length > 0) {
        const newIndex = newMatches.length - 1
        setCurrentMatchIndex(newIndex)
        highlightMatches(newMatches, newIndex)
        navigateToMatch(newIndex)
      } else {
        setCurrentMatchIndex(-1)
        highlightMatches(newMatches, -1)
      }
      
      // Restore focus to replace input after replace
      requestAnimationFrame(() => {
        inlineReplaceInputRef.current?.focus()
      })
    } catch (error) {
      console.error('Error replacing text:', error)
    }
  }

  // Handle replace all
  const handleReplaceAll = () => {
    if (!editor || matches.length === 0 || !replaceQuery.trim()) return
    
    try {
      // Replace from end to start to preserve positions
      const sortedMatches = [...matches].sort((a, b) => b.from - a.from)
      
      editor.chain().focus().run()
      
      sortedMatches.forEach((match) => {
        editor.chain()
          .setTextSelection(match)
          .deleteSelection()
          .insertContent(replaceQuery)
          .run()
      })
      
      // Clear search
      setSearchQuery('')
      setMatches([])
      setCurrentMatchIndex(-1)
      clearInlineSearchHighlights()
    } catch (error) {
      console.error('Error replacing all:', error)
    }
  }

  // Handle Escape key to close search (when search is open)
  useEffect(() => {
    if (!showInlineSearch) return
    
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't interfere with input fields - input handlers will handle their own keys
      if (e.target instanceof HTMLInputElement) {
        // Let the input's onKeyDown handler handle Enter and Escape
        // This listener only handles Escape when input is not focused
        if (e.key === 'Escape' && e.target !== inlineSearchInputRef.current && e.target !== inlineReplaceInputRef.current) {
          e.preventDefault()
          setShowInlineSearch(false)
          setSearchQuery('')
          setReplaceQuery('')
          clearInlineSearchHighlights()
          editor?.chain().focus().run()
          return
        }
        return
      }
      
      // Handle Escape when search is open but no input is focused
      if (e.key === 'Escape') {
        e.preventDefault()
        setShowInlineSearch(false)
        setSearchQuery('')
        setReplaceQuery('')
        clearInlineSearchHighlights()
        editor?.chain().focus().run()
        return
      }
      
      // Note: Ctrl+F handling is done in Layout.tsx to avoid conflicts
    }
    
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [showInlineSearch, editor])

  // Note: Ctrl+F handling is now done in Layout.tsx to avoid conflicts
  // Layout delegates to the active surface (DocumentEditor or PDFViewer)

  // Focus search input when opening
  useEffect(() => {
    if (showInlineSearch && inlineSearchInputRef.current) {
      setTimeout(() => {
        inlineSearchInputRef.current?.focus()
        inlineSearchInputRef.current?.select()
      }, 50)
    }
  }, [showInlineSearch])

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
                    // Validate positions to ensure they point to inline content
                    const { state } = editor.view
                    const { doc } = state
                    const docSize = doc.content.size
                    
                    // Skip if document is empty
                    if (docSize === 0) {
                      return
                    }
                    
                    // Clamp positions to valid document bounds
                    let from = Math.max(0, Math.min(initialSelectionPosRef.current, docSize))
                    let to = Math.max(0, Math.min(currentPos, docSize))
                    
                    // Ensure positions are different
                    if (from === to) {
                      // If positions are the same, try to adjust slightly
                      if (to < docSize) {
                        to = Math.min(to + 1, docSize)
                      } else if (from > 0) {
                        from = Math.max(from - 1, 0)
                      } else {
                        // Can't create selection, skip
                        return
                      }
                    }
                    
                    // Validate positions point to valid inline content
                    try {
                      const { state } = editor.view
                      const { listItem } = state.schema.nodes
                      
                      // Helper function to adjust position if it points to a listItem
                      const adjustPositionForListItem = (pos: number): number | null => {
                        try {
                          const $pos = doc.resolve(pos)
                          
                          // Check if we're inside a listItem at any depth
                          let listItemDepth = -1
                          for (let d = $pos.depth; d > 0; d--) {
                            if ($pos.node(d).type === listItem) {
                              listItemDepth = d
                              break
                            }
                          }
                          
                          // If we're in a listItem, check if parent has inline content
                          if (listItemDepth >= 0) {
                            // Check if parent node can contain inline content
                            // If parent is listItem itself, we need to find the paragraph within it
                            if ($pos.parent.type === listItem || $pos.parent.type.name === 'listItem') {
                              // Find the paragraph within the listItem
                              const listItemPos = $pos.before(listItemDepth)
                              
                              try {
                                const resolvedPos = state.doc.resolve(listItemPos + 1)
                                // Look for paragraph/heading/title/subtitle within the listItem
                                for (let childD = resolvedPos.depth; childD > 0 && childD <= resolvedPos.depth + 2; childD++) {
                                  const childNode = resolvedPos.node(childD)
                                  if (childNode.type.name === 'paragraph' || 
                                      childNode.type.name.startsWith('heading') || 
                                      childNode.type.name === 'title' || 
                                      childNode.type.name === 'subtitle') {
                                    // Found the paragraph - adjust position to point to valid inline content
                                    const paragraphStart = resolvedPos.before(childD) + 1
                                    const paragraphEnd = resolvedPos.after(childD) - 1
                                    
                                    // Ensure we have valid inline content
                                    if (paragraphStart < paragraphEnd) {
                                      // Clamp position to paragraph bounds, ensuring it's within inline content
                                      const adjustedPos = Math.max(paragraphStart, Math.min(pos, paragraphEnd))
                                      // Verify the adjusted position points to inline content
                                      const $adjusted = doc.resolve(adjustedPos)
                                      if ($adjusted.parent.inlineContent) {
                                        return adjustedPos
                                      }
                                    }
                                    // If paragraph is empty, use start position
                                    return paragraphStart
                                  }
                                }
                              } catch (e) {
                                // If resolution fails, return null
                                return null
                              }
                              
                              // No paragraph found in listItem
                              return null
                            }
                            
                            // If parent is not listItem but we're inside one, check if parent has inline content
                            if (!$pos.parent.inlineContent) {
                              // Parent doesn't have inline content, try to find a valid position
                              return null
                            }
                          }
                          
                          // Verify the position points to inline content
                          if (!$pos.parent.inlineContent) {
                            return null
                          }
                          
                          // Position is valid, return original
                          return pos
                        } catch (e) {
                          return null
                        }
                      }
                      
                      // Adjust positions if they point to listItems
                      const adjustedFrom = adjustPositionForListItem(from)
                      const adjustedTo = adjustPositionForListItem(to)
                      
                      // If either position couldn't be adjusted, skip selection
                      if (adjustedFrom === null || adjustedTo === null) {
                        return
                      }
                      
                      const $from = doc.resolve(adjustedFrom)
                      const $to = doc.resolve(adjustedTo)
                      
                      // Ensure positions are within valid nodes that can contain text
                      // Check if we're at a valid selection boundary
                      if ($from.parent.content.size === 0 && $from.parentOffset === 0) {
                        // At start of empty block - skip selection
                        return
                      }
                      if ($to.parent.content.size === 0 && $to.parentOffset === 0) {
                        // At start of empty block - skip selection
                        return
                      }
                      
                      // Ensure positions are still different after adjustment
                      if (adjustedFrom === adjustedTo) {
                        return
                      }
                      
                      // Set text selection from initial position to current position
                      // Use adjusted positions - this preserves selection direction
                      editor.chain().focus().setTextSelection({ 
                        from: adjustedFrom, 
                        to: adjustedTo 
                      }).run()
                    } catch (error) {
                      // Silently ignore selection errors (e.g., invalid positions)
                      // This can happen when positions point to block boundaries without inline content
                      console.debug('Text selection error (ignored):', error)
                    }
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
        onClick={(e) => {
          // Handle Ctrl+Click on links to open in default browser
          if (e.ctrlKey || e.metaKey) {
            const target = e.target as HTMLElement
            // Find the closest link element (could be the target itself or a parent)
            const linkElement = target.closest('a.editor-link') as HTMLAnchorElement | null
            
            if (linkElement && linkElement.href) {
              e.preventDefault()
              e.stopPropagation()
              
              const url = linkElement.href
              
              // Check if running in Electron
              const isElectron = typeof window !== 'undefined' && window.electron !== undefined
              
              if (isElectron && window.electron) {
                // Open in external browser via IPC
                window.electron.invoke('openExternal', url).catch((error) => {
                  console.error('Failed to open external URL:', error)
                  // Fallback to window.open if IPC fails
                  window.open(url, '_blank')
                })
              } else {
                // Fallback for web
                window.open(url, '_blank')
              }
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
          minHeight: '100%',
          position: 'relative'
        }}>
          <EditorContent key={document?.id} editor={editor} />
          <Autocomplete editor={editor} documentContent={document?.content} documentId={document?.id} />
          
          {/* Inline Search/Replace Bar - Dark Mode */}
          {showInlineSearch && (
            <div
              style={{
                position: 'fixed',
                top: '92px', // TopBar (32px) + Toolbar container padding (8px top) + Toolbar content (~32px) + margin (20px) = 92px to match right margin
                right: `${rightOffset}px`,
                backgroundColor: '#1e1e1e',
                borderRadius: '8px',
                padding: '12px',
                boxShadow: '0 8px 24px rgba(0,0,0,0.5), 0 2px 8px rgba(0,0,0,0.3)',
                zIndex: 1000,
                display: 'flex',
                flexDirection: 'column',
                gap: '12px', // Increased from 10px for more spacing
                minWidth: '280px',
                maxWidth: '300px',
                fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
                fontWeight: '300', // Apply to whole modal
                transition: 'right 0.3s ease',
              }}
              onMouseDown={(e) => {
                // Prevent editor from intercepting clicks on the search dialog
                e.stopPropagation()
              }}
              onClick={(e) => {
                // Prevent editor from intercepting clicks on the search dialog
                e.stopPropagation()
              }}
            >
              {/* Close button */}
              <button
                onClick={() => {
                  setShowInlineSearch(false)
                  setSearchQuery('')
                  setReplaceQuery('')
                  clearInlineSearchHighlights()
                  editor?.chain().focus().run()
                }}
                style={{
                  position: 'absolute',
                  top: '8px',
                  right: '8px',
                  padding: '2px',
                  backgroundColor: 'transparent',
                  border: 'none',
                  color: '#999',
                  cursor: 'pointer',
                  fontSize: '14px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: '4px',
                  width: '18px',
                  height: '18px',
                  fontWeight: '300',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = '#2a2a2a'
                  e.currentTarget.style.color = '#fff'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'transparent'
                  e.currentTarget.style.color = '#999'
                }}
                title="Close (Esc)"
              >
                ✕
              </button>

              {/* Find section */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontWeight: '300', width: '100%' }}>
                <label style={{
                  fontSize: '11px',
                  fontWeight: '300',
                  color: '#e0e0e0',
                  margin: 0,
                }}>
                  Find
                </label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', width: '100%' }}>
                  <input
                    ref={inlineSearchInputRef}
                    data-search-input="true"
                    type="text"
                    placeholder=""
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    style={{
                      flex: 1,
                      minWidth: 0, // Allow flex item to shrink below content size
                      padding: '6px 10px',
                      border: '1px solid #333',
                      borderRadius: '4px',
                      backgroundColor: '#252525',
                      color: '#e0e0e0',
                      fontSize: '13px',
                      outline: 'none',
                      fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
                      fontWeight: '300',
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        e.stopPropagation() // Prevent window-level listener from also handling this
                        // If search query hasn't changed, navigate to next match
                        // Otherwise, perform a new search (goes to first match)
                        if (searchQuery === activeSearchQuery && matches.length > 0) {
                          navigateToNext()
                        } else {
                          performSearch()
                        }
                      } else if (e.key === 'Escape') {
                        e.preventDefault()
                        e.stopPropagation() // Prevent window-level listener from also handling this
                        setShowInlineSearch(false)
                        setSearchQuery('')
                        setReplaceQuery('')
                        clearInlineSearchHighlights()
                        editor?.chain().focus().run()
                      }
                    }}
                    onFocus={(e) => {
                      e.target.style.borderColor = '#555' // Darker gray on focus
                      isSearchInputFocusedRef.current = true
                    }}
                    onBlur={(e) => {
                      e.target.style.borderColor = '#333'
                      // Use setTimeout to check if focus moved to replace input
                      setTimeout(() => {
                        if (window.document.activeElement !== inlineReplaceInputRef.current) {
                          isSearchInputFocusedRef.current = false
                        }
                      }, 0)
                    }}
                    onMouseDown={(e) => {
                      // Prevent editor from intercepting the click
                      e.stopPropagation()
                      isSearchInputFocusedRef.current = true
                    }}
                  />
                  {activeSearchQuery && matches.length > 0 && (
                    <>
                      <div style={{
                        fontSize: '11px',
                        color: '#999',
                        minWidth: '35px',
                        textAlign: 'center',
                        fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
                        fontWeight: '300',
                      }}>
                        {currentMatchIndex + 1}/{matches.length}
                      </div>
                      <button
                        onClick={navigateToPrevious}
                        disabled={matches.length === 0}
                        style={{
                          padding: '4px 6px',
                          backgroundColor: 'transparent',
                          border: '1px solid #333',
                          borderRadius: '4px',
                          color: matches.length > 0 ? '#e0e0e0' : '#666',
                          cursor: matches.length > 0 ? 'pointer' : 'not-allowed',
                          fontSize: '12px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          minWidth: '24px',
                          height: '24px',
                        }}
                        onMouseEnter={(e) => {
                          if (matches.length > 0) {
                            e.currentTarget.style.backgroundColor = '#333'
                            e.currentTarget.style.borderColor = '#444'
                          }
                        }}
                        onMouseLeave={(e) => {
                          if (matches.length > 0) {
                            e.currentTarget.style.backgroundColor = 'transparent'
                            e.currentTarget.style.borderColor = '#333'
                          }
                        }}
                        title="Previous match"
                      >
                        ‹
                      </button>
                      <button
                        onClick={navigateToNext}
                        disabled={matches.length === 0}
                        style={{
                          padding: '4px 6px',
                          backgroundColor: 'transparent',
                          border: '1px solid #333',
                          borderRadius: '4px',
                          color: matches.length > 0 ? '#e0e0e0' : '#666',
                          cursor: matches.length > 0 ? 'pointer' : 'not-allowed',
                          fontSize: '12px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          minWidth: '24px',
                          height: '24px',
                        }}
                        onMouseEnter={(e) => {
                          if (matches.length > 0) {
                            e.currentTarget.style.backgroundColor = '#333'
                            e.currentTarget.style.borderColor = '#444'
                          }
                        }}
                        onMouseLeave={(e) => {
                          if (matches.length > 0) {
                            e.currentTarget.style.backgroundColor = 'transparent'
                            e.currentTarget.style.borderColor = '#333'
                          }
                        }}
                        title="Next match"
                      >
                        ›
                      </button>
                    </>
                  )}
                </div>
              </div>
              
              {/* Replace with section */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontWeight: '300', width: '100%' }}>
                <label style={{
                  fontSize: '11px',
                  fontWeight: '300',
                  color: '#e0e0e0',
                  margin: 0,
                }}>
                  Replace with
                </label>
                <input
                  ref={inlineReplaceInputRef}
                  type="text"
                  placeholder=""
                  value={replaceQuery}
                  onChange={(e) => setReplaceQuery(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '6px 10px',
                    border: '1px solid #333',
                    borderRadius: '4px',
                    backgroundColor: '#252525',
                    color: '#e0e0e0',
                    fontSize: '13px',
                    outline: 'none',
                    fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
                    fontWeight: '300',
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') {
                      e.preventDefault()
                      setShowInlineSearch(false)
                      setSearchQuery('')
                      setReplaceQuery('')
                      clearInlineSearchHighlights()
                      editor?.chain().focus().run()
                    }
                  }}
                  onFocus={(e) => {
                    e.target.style.borderColor = '#555' // Darker gray on focus
                    isReplaceInputFocusedRef.current = true
                  }}
                  onBlur={(e) => {
                    e.target.style.borderColor = '#333'
                    // Use setTimeout to check if focus moved to search input
                    setTimeout(() => {
                      if (window.document.activeElement !== inlineSearchInputRef.current) {
                        isReplaceInputFocusedRef.current = false
                      }
                    }, 0)
                  }}
                  onMouseDown={(e) => {
                    // Prevent editor from intercepting the click
                    e.stopPropagation()
                    isReplaceInputFocusedRef.current = true
                  }}
                />
              </div>
              
              {/* Action buttons */}
              <div style={{ display: 'flex', gap: '6px', marginTop: '2px' }}>
                <button
                  onClick={handleReplaceAll}
                  disabled={matches.length === 0 || !replaceQuery.trim()}
                  style={{
                    flex: 1,
                    padding: '6px 12px',
                    backgroundColor: '#2a2a2a',
                    border: '1px solid #333',
                    borderRadius: '6px',
                    color: matches.length > 0 && replaceQuery.trim() ? '#e0e0e0' : '#666',
                    cursor: matches.length > 0 && replaceQuery.trim() ? 'pointer' : 'not-allowed',
                    fontSize: '12px',
                    fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
                    fontWeight: '300',
                    transition: 'all 0.2s',
                  }}
                  onMouseEnter={(e) => {
                    if (matches.length > 0 && replaceQuery.trim()) {
                      e.currentTarget.style.backgroundColor = '#333'
                      e.currentTarget.style.borderColor = '#444'
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (matches.length > 0 && replaceQuery.trim()) {
                      e.currentTarget.style.backgroundColor = '#2a2a2a'
                      e.currentTarget.style.borderColor = '#333'
                    }
                  }}
                  title="Replace All"
                >
                  Replace all
                </button>
                <button
                  onClick={handleReplace}
                  disabled={currentMatchIndex < 0 || !replaceQuery.trim()}
                  style={{
                    flex: 1,
                    padding: '6px 12px',
                    backgroundColor: currentMatchIndex >= 0 && replaceQuery.trim() ? '#6366f1' : '#333',
                    border: 'none',
                    borderRadius: '6px',
                    color: currentMatchIndex >= 0 && replaceQuery.trim() ? '#ffffff' : '#666',
                    cursor: currentMatchIndex >= 0 && replaceQuery.trim() ? 'pointer' : 'not-allowed',
                    fontSize: '12px',
                    fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
                    fontWeight: '300',
                    transition: 'background-color 0.2s',
                  }}
                  onMouseEnter={(e) => {
                    if (currentMatchIndex >= 0 && replaceQuery.trim()) {
                      e.currentTarget.style.backgroundColor = '#4f46e5'
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (currentMatchIndex >= 0 && replaceQuery.trim()) {
                      e.currentTarget.style.backgroundColor = '#6366f1'
                    }
                  }}
                  title="Replace"
                >
                  Replace
                </button>
              </div>
            </div>
          )}
        </div>
        
      </div>
      
      {/* Text Rephrase Popup */}
      {showRephrasePopup && (selectedTextRef.current || selectedText) && (selectedRangeRef.current || selectedRange) && (
        <TextRephrasePopup
          selectedText={selectedTextRef.current || selectedText}
          position={popupPosition}
          onInputFocus={(isFocused) => {
            isRephrasePopupInputFocusedRef.current = isFocused
          }}
          onReplace={(newText) => {
            const rangeToUse = selectedRangeRef.current || selectedRange
            if (editor && rangeToUse) {
              // Validate positions are within document bounds
              const docSize = editor.state.doc.content.size
              const { from, to } = rangeToUse
              
              if (from < 0 || from > docSize || to < 0 || to > docSize) {
                // Invalid range, use current selection or insert at cursor
                try {
                  const currentSelection = editor.state.selection
                  if (currentSelection.from !== currentSelection.to) {
                    editor.chain()
                      .focus()
                      .setTextSelection({ from: currentSelection.from, to: currentSelection.to })
                      .deleteSelection()
                      .insertContent(newText)
                      .run()
                  } else {
                    editor.chain()
                      .focus()
                      .insertContent(newText)
                      .run()
                  }
                } catch (fallbackError) {
                  console.error('Fallback replace failed:', fallbackError)
                }
                setShowRephrasePopup(false)
                isRephrasePopupOpenRef.current = false
                setSelectedText('')
                setSelectedRange(null)
                return
              }
              
              try {
                // Use the stored selection range
                const rangeToUse = selectedRangeRef.current || selectedRange
                if (!rangeToUse) return
                editor.chain()
                  .focus()
                  .setTextSelection(rangeToUse)
                  .deleteSelection()
                  .insertContent(newText)
                  .run()
              } catch (error) {
                console.error('Error replacing text:', error)
                // Fallback: try to find the text and replace it
                try {
                  const { from, to } = editor.state.selection
                  if (from !== to) {
                    editor.chain()
                      .focus()
                      .setTextSelection({ from, to })
                      .deleteSelection()
                      .insertContent(newText)
                      .run()
                  } else {
                    // Last resort: insert at cursor
                    editor.chain()
                      .focus()
                      .insertContent(newText)
                      .run()
                  }
                } catch (fallbackError) {
                  console.error('Fallback replace also failed:', fallbackError)
                }
              }
            }
            setShowRephrasePopup(false)
            isRephrasePopupOpenRef.current = false
            isRephrasePopupInputFocusedRef.current = false // Reset input focus state when popup closes
            setSelectedText('')
            setSelectedRange(null)
            selectedTextRef.current = ''
            selectedRangeRef.current = null
          }}
          onClose={() => {
            setShowRephrasePopup(false)
            isRephrasePopupOpenRef.current = false
            isRephrasePopupInputFocusedRef.current = false // Reset input focus state when popup closes
            setSelectedText('')
            setSelectedRange(null)
            selectedTextRef.current = ''
            selectedRangeRef.current = null
          }}
        />
      )}
    </div>
  )
})

DocumentEditor.displayName = 'DocumentEditor'

export default DocumentEditor


