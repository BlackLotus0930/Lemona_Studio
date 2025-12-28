import { useState, useEffect, useRef, useImperativeHandle, forwardRef, useLayoutEffect, useCallback } from 'react'
import { useTheme } from '../../contexts/ThemeContext'
import { Document } from '@shared/types'
import * as pdfjsLib from 'pdfjs-dist'
// Import worker URL using Vite's ?url suffix - this only imports the URL string, not the worker code
// This is the recommended way for Vite and ensures proper worker initialization
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { documentApi } from '../../services/desktop-api'
import UnfoldMoreIcon from '@mui/icons-material/UnfoldMore'

// Polyfill for URL.parse if it doesn't exist (PDF.js may try to use it)
// URL.parse is not a standard Web API, but PDF.js might expect it in some contexts
// This polyfill provides a compatible interface for PDF.js annotation parsing
if (typeof URL !== 'undefined' && !(URL as any).parse) {
  (URL as any).parse = (url: string, parseQueryString?: boolean) => {
    try {
      const urlObj = new URL(url, window.location.href)
      // Return an object that mimics Node.js url.parse format for compatibility
      return {
        href: urlObj.href,
        protocol: urlObj.protocol,
        host: urlObj.host,
        hostname: urlObj.hostname,
        port: urlObj.port,
        pathname: urlObj.pathname,
        search: urlObj.search,
        hash: urlObj.hash,
        // Additional properties that PDF.js might expect
        query: parseQueryString ? Object.fromEntries(urlObj.searchParams) : urlObj.search,
        path: urlObj.pathname + urlObj.search,
      }
    } catch {
      // If URL parsing fails, return a minimal object with the original URL
      return {
        href: url,
        protocol: '',
        host: '',
        hostname: '',
        port: '',
        pathname: url,
        search: '',
        hash: '',
        query: parseQueryString ? {} : '',
        path: url,
      }
    }
  }
}

// Set worker source for pdf.js - use local worker file
// This avoids CSP violations and works offline
// Using ?url import ensures Vite properly handles the worker file
pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl

interface FullScreenPDFViewerProps {
  document: Document | null
  isAIPanelOpen?: boolean
  aiPanelWidth?: number // Percentage width of AI panel
}

export interface PDFViewerSearchHandle {
  openSearch: () => void
  closeSearch: () => void
  toggleSearch: () => void
  clearSearch: () => void // Clear search highlights and state
}

const FullScreenPDFViewer = forwardRef<PDFViewerSearchHandle, FullScreenPDFViewerProps>(
  ({ document, isAIPanelOpen = false, aiPanelWidth = 20 }, ref) => {
    const { theme } = useTheme()
    
    // PDF state
    const [pdfDocument, setPdfDocument] = useState<pdfjsLib.PDFDocumentProxy | null>(null)
    const [currentPage, setCurrentPage] = useState(1)
    const [totalPages, setTotalPages] = useState(0)
    const [scale, setScale] = useState(1.25)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState(false)
    const [isPageInputOpen, setIsPageInputOpen] = useState(false)
    const [pageInputValue, setPageInputValue] = useState('')
    const pageInputRef = useRef<HTMLInputElement>(null)
    const [isScrollMode, setIsScrollMode] = useState(false)
    
    // Canvas refs
    const canvasRef = useRef<HTMLCanvasElement>(null)
    const containerRef = useRef<HTMLDivElement>(null)
    const scrollCanvasRefs = useRef<Map<number, HTMLCanvasElement>>(new Map())
    const [navBarLeft, setNavBarLeft] = useState<string | null>(null)
    const navBarLeftRef = useRef<string | null>(null) // Track previous position to avoid unnecessary updates
    const renderTaskRef = useRef<any>(null) // Track current render task to cancel if needed
    
    // Inline search state
    const [showInlineSearch, setShowInlineSearch] = useState(false)
    const [searchQuery, setSearchQuery] = useState('')
    const [matches, setMatches] = useState<Array<{ pageNumber: number; from: number; to: number }>>([])
    const [currentMatchIndex, setCurrentMatchIndex] = useState(-1)
    const [activeSearchQuery, setActiveSearchQuery] = useState('')
    const inlineSearchInputRef = useRef<HTMLInputElement>(null)
    const [rightOffset, setRightOffset] = useState(20)
    
    // Page position tracking
    const previousDocIdRef = useRef<string | null>(null)
    
    // Clear search state
    const clearSearchState = () => {
      setShowInlineSearch(false)
      setSearchQuery('')
      setMatches([])
      setCurrentMatchIndex(-1)
      setActiveSearchQuery('')
    }

    // Expose search API to parent
    useImperativeHandle(ref, () => ({
      openSearch: () => {
        setShowInlineSearch(true)
        setTimeout(() => {
          inlineSearchInputRef.current?.focus()
          inlineSearchInputRef.current?.select()
        }, 50)
      },
      closeSearch: () => {
        clearSearchState()
      },
      toggleSearch: () => {
        if (showInlineSearch) {
          clearSearchState()
        } else {
          setShowInlineSearch(true)
          setTimeout(() => {
            inlineSearchInputRef.current?.focus()
            inlineSearchInputRef.current?.select()
          }, 50)
        }
      },
      clearSearch: () => {
        clearSearchState()
      },
    }))

    // Find matches in PDF text
    const findMatches = (query: string): Array<{ pageNumber: number; from: number; to: number }> => {
      if (!query.trim() || !document?.pdfText) {
        return []
      }
      
      const matches: Array<{ pageNumber: number; from: number; to: number }> = []
      const searchText = query.toLowerCase()
      
      document.pdfText.pages.forEach((page) => {
        const pageText = page.fullText.toLowerCase()
        let searchIndex = 0
        
        while (true) {
          const index = pageText.indexOf(searchText, searchIndex)
          if (index === -1) break
          
          matches.push({
            pageNumber: page.pageNumber,
            from: index,
            to: index + query.length,
          })
          searchIndex = index + 1
        }
      })
      
      return matches
    }

    // Save page position to localStorage
    const savePagePosition = (docId: string, pageNumber: number) => {
      try {
        localStorage.setItem(`pdfPage_${docId}`, pageNumber.toString())
      } catch (error) {
      }
    }

    // Load page position from localStorage
    const loadPagePosition = (docId: string): number | null => {
      try {
        const saved = localStorage.getItem(`pdfPage_${docId}`)
        return saved ? parseInt(saved, 10) : null
      } catch (error) {
        return null
      }
    }

    // Render PDF page to canvas
    const renderPage = async (pageNum: number) => {
      if (!pdfDocument || !canvasRef.current) return

      try {
        // Cancel any ongoing render task to prevent canvas conflicts
        if (renderTaskRef.current) {
          try {
            renderTaskRef.current.cancel()
          } catch (cancelError) {
            // Ignore cancellation errors
          }
          renderTaskRef.current = null
        }

        setLoading(true)
        const page = await pdfDocument.getPage(pageNum)
        const canvas = canvasRef.current
        const context = canvas.getContext('2d', { alpha: false })
        
        if (!context) {
          setLoading(false)
          return
        }

        // Get device pixel ratio for high DPI displays (improves clarity on retina screens)
        const devicePixelRatio = window.devicePixelRatio || 1
        
        // Calculate viewport at the desired scale (for display size)
        const viewport = page.getViewport({ scale })
        
        // Set canvas display size (CSS pixels) - this is what users see
        canvas.style.width = viewport.width + 'px'
        canvas.style.height = viewport.height + 'px'
        
        // Set canvas internal size (actual pixels) - multiply by devicePixelRatio for sharper rendering
        canvas.width = viewport.width * devicePixelRatio
        canvas.height = viewport.height * devicePixelRatio
        
        // Scale the context to account for device pixel ratio
        // This ensures the rendering matches the higher resolution canvas
        context.scale(devicePixelRatio, devicePixelRatio)
        
        // Render PDF page at the display scale (context.scale handles the pixel ratio)
        const renderContext = {
          canvasContext: context,
          viewport: viewport,
        }
        
        // Store render task and wait for it to complete
        const renderTask = page.render(renderContext as any)
        renderTaskRef.current = renderTask
        
        await renderTask.promise
        
        // Only update state if this render task is still the current one
        // (prevents race conditions if user navigated away)
        if (renderTaskRef.current === renderTask) {
          setCurrentPage(pageNum)
          setLoading(false)
          renderTaskRef.current = null
          
          // Save page position
          if (document?.id) {
            savePagePosition(document.id, pageNum)
          }
        }
      } catch (err) {
        // Ignore cancellation errors (they're expected when navigating quickly)
        const errorMessage = err instanceof Error ? err.message : String(err)
        if (errorMessage.includes('cancelled') || errorMessage.includes('cancel')) {
          return
        }
        
        setError(true)
        setLoading(false)
        renderTaskRef.current = null
      }
    }

    // Render all pages for scroll mode
    const renderAllPages = useCallback(async () => {
      if (!pdfDocument || totalPages === 0) {
        setLoading(false)
        return
      }

      // Check if all canvases are available
      let allCanvasesReady = true
      for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
        if (!scrollCanvasRefs.current.get(pageNum)) {
          allCanvasesReady = false
          break
        }
      }

      // If canvases aren't ready yet, don't set loading (they'll render when ready)
      if (!allCanvasesReady) {
        return
      }

      setLoading(true)
      try {
        const devicePixelRatio = window.devicePixelRatio || 1
        
        for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
          const canvas = scrollCanvasRefs.current.get(pageNum)
          if (!canvas) continue

          const page = await pdfDocument.getPage(pageNum)
          const context = canvas.getContext('2d', { alpha: false })
          
          if (!context) continue

          const viewport = page.getViewport({ scale })
          
          canvas.style.width = viewport.width + 'px'
          canvas.style.height = viewport.height + 'px'
          canvas.width = viewport.width * devicePixelRatio
          canvas.height = viewport.height * devicePixelRatio
          
          context.scale(devicePixelRatio, devicePixelRatio)
          
          const renderContext = {
            canvasContext: context,
            viewport: viewport,
          }
          
          await page.render(renderContext as any).promise
        }
        
        setLoading(false)
      } catch (err) {
        setError(true)
        setLoading(false)
      }
    }, [pdfDocument, totalPages, scale])

    // Cleanup: Cancel any ongoing render tasks on unmount
    useEffect(() => {
      return () => {
        if (renderTaskRef.current) {
          try {
            renderTaskRef.current.cancel()
          } catch (cancelError) {
            // Ignore cancellation errors
          }
          renderTaskRef.current = null
        }
      }
    }, [])

    // Load PDF document
    useEffect(() => {
      if (!document) {
        // Cancel any ongoing render when document changes
        if (renderTaskRef.current) {
          try {
            renderTaskRef.current.cancel()
          } catch (cancelError) {
            // Ignore cancellation errors
          }
          renderTaskRef.current = null
        }
        setPdfDocument(null)
        setError(false)
        previousDocIdRef.current = null
        return
      }

      const isPDF = document.title.toLowerCase().endsWith('.pdf')
      if (!isPDF) {
        // Cancel any ongoing render when document changes
        if (renderTaskRef.current) {
          try {
            renderTaskRef.current.cancel()
          } catch (cancelError) {
            // Ignore cancellation errors
          }
          renderTaskRef.current = null
        }
        setPdfDocument(null)
        setError(false)
        previousDocIdRef.current = null
        return
      }

      // Check if same document
      const isSameDocument = previousDocIdRef.current === document.id
      
      // Parse document content to extract PDF data URL
      try {
        const content = JSON.parse(document.content)
        
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
        if (!src) {
          setError(true)
          return
        }

        // Convert data URL or document reference to Uint8Array
        const loadPDF = async () => {
          try {
            setLoading(true)
            setError(false)
            
            let pdfData: Uint8Array
            
            if (src.startsWith('document://')) {
              // Load PDF file content via IPC (for large PDFs not stored in JSON)
              // This is done asynchronously to avoid blocking the UI
              const documentId = src.replace('document://', '')
              
              // Verify document exists before trying to load
              // This handles cases where PDFs were deleted but references remain
              try {
                const docCheck = await documentApi.get(documentId)
                if (!docCheck) {
                  // Silently fail - this is a stale reference from a deleted PDF
                  setError(true)
                  setLoading(false)
                  setPdfDocument(null)
                  setTotalPages(0)
                  return
                }
              } catch (checkError) {
                // Silently fail - this is a stale reference from a deleted PDF
                setError(true)
                setLoading(false)
                setPdfDocument(null)
                setTotalPages(0)
                return
              }
              
              // Show loading state immediately
              setLoading(true)
              
              // Load PDF content asynchronously
              const pdfDataUrl = await documentApi.getPDFFileContent(documentId)
              
              // Extract base64 data from data URL
              const base64Data = pdfDataUrl.split(',')[1]
              if (!base64Data) {
                throw new Error('No base64 data found')
              }
              
              // Convert base64 to binary asynchronously using chunked processing
              // This prevents blocking the main thread for large files
              const binaryString = atob(base64Data)
              const bytes = new Uint8Array(binaryString.length)
              
              // Process in chunks to avoid blocking UI
              const chunkSize = 1024 * 1024 // 1MB chunks
              for (let i = 0; i < binaryString.length; i += chunkSize) {
                const end = Math.min(i + chunkSize, binaryString.length)
                for (let j = i; j < end; j++) {
                  bytes[j] = binaryString.charCodeAt(j)
                }
                // Yield to browser to keep UI responsive
                if (i % (chunkSize * 10) === 0) {
                  await new Promise(resolve => setTimeout(resolve, 0))
                }
              }
              pdfData = bytes
            } else if (src.startsWith('data:application/pdf')) {
              // Extract base64 data from data URL (for small PDFs stored in JSON)
              const base64Data = src.split(',')[1]
              if (!base64Data) {
                throw new Error('No base64 data found')
              }
              
              // Convert base64 to binary
              const binaryString = atob(base64Data)
              const bytes = new Uint8Array(binaryString.length)
              for (let i = 0; i < binaryString.length; i++) {
                bytes[i] = binaryString.charCodeAt(i)
              }
              pdfData = bytes
            } else if (src.startsWith('blob:')) {
              // Fetch blob URL
              const response = await fetch(src)
              const arrayBuffer = await response.arrayBuffer()
              pdfData = new Uint8Array(arrayBuffer)
            } else {
              throw new Error('Unsupported PDF source format')
            }

            // Load PDF document
            // Configure PDF.js to reduce console output
            const loadingTask = pdfjsLib.getDocument({
              data: pdfData,
              useSystemFonts: true,
              verbosity: 0, // Reduce console output
            })
            
            const pdf = await loadingTask.promise
            setPdfDocument(pdf)
            setTotalPages(pdf.numPages)
            
            // Restore page position if same document
            if (isSameDocument) {
              const savedPage = loadPagePosition(document.id)
              if (savedPage !== null && savedPage > 0 && savedPage <= pdf.numPages) {
                setCurrentPage(savedPage)
                await renderPage(savedPage)
              } else {
                await renderPage(1)
              }
            } else {
              // New document - restore saved page or start at page 1
              const savedPage = loadPagePosition(document.id)
              if (savedPage !== null && savedPage > 0 && savedPage <= pdf.numPages) {
                setCurrentPage(savedPage)
                await renderPage(savedPage)
              } else {
                await renderPage(1)
              }
            }
            
            previousDocIdRef.current = document.id
            setLoading(false)
          } catch (err) {
            const errorMessage = err instanceof Error ? err.message : String(err)
            
            // Check if it's a "not found" error (deleted PDF reference)
            if (errorMessage.includes('not found') || errorMessage.includes('Document')) {
              // Silently handle deleted PDF references - this is expected behavior
              setError(true)
              setLoading(false)
              // Clear the document reference to prevent retry loops
              setPdfDocument(null)
              setTotalPages(0)
            } else {
              setError(true)
              setLoading(false)
            }
          }
        }

        loadPDF()
      } catch (e) {
        setError(true)
      }
    }, [document?.id, document?.content])

    // Render page when currentPage or scale changes (only in page mode)
    useEffect(() => {
      if (pdfDocument && currentPage > 0 && !isScrollMode) {
        renderPage(currentPage)
      }
    }, [currentPage, scale, pdfDocument, isScrollMode])

    // Render all pages when scroll mode is enabled or scale changes in scroll mode
    useEffect(() => {
      if (pdfDocument && totalPages > 0 && isScrollMode) {
        // Small delay to ensure canvases are mounted
        const timer = setTimeout(() => {
          renderAllPages()
        }, 100)
        return () => {
          clearTimeout(timer)
          setLoading(false)
        }
      } else if (!isScrollMode) {
        // Clear loading when switching back to page mode
        setLoading(false)
      }
    }, [isScrollMode, renderAllPages])

    // Navigate to page
    const navigateToPage = (pageNumber: number) => {
      if (!pdfDocument || pageNumber < 1 || pageNumber > totalPages) return
      setCurrentPage(pageNumber)
    }

    // Handle page input
    const handlePageInputClick = () => {
      setIsPageInputOpen(true)
      setPageInputValue(currentPage.toString())
      setTimeout(() => {
        pageInputRef.current?.focus()
        pageInputRef.current?.select()
      }, 50)
    }

    const handlePageInputSubmit = () => {
      const pageNum = parseInt(pageInputValue, 10)
      if (!isNaN(pageNum) && pageNum >= 1 && pageNum <= totalPages) {
        navigateToPage(pageNum)
      }
      setIsPageInputOpen(false)
      setPageInputValue('')
    }

    const handlePageInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        e.preventDefault()
        handlePageInputSubmit()
      } else if (e.key === 'Escape') {
        e.preventDefault()
        setIsPageInputOpen(false)
        setPageInputValue('')
      }
    }

    // Navigate to previous page
    const goToPreviousPage = () => {
      if (currentPage > 1) {
        navigateToPage(currentPage - 1)
      }
    }

    // Navigate to next page
    const goToNextPage = () => {
      if (currentPage < totalPages) {
        navigateToPage(currentPage + 1)
      }
    }

    // Perform search
    const performSearch = () => {
      if (!searchQuery.trim()) {
        setMatches([])
        setCurrentMatchIndex(-1)
        setActiveSearchQuery('')
        return
      }
      
      const foundMatches = findMatches(searchQuery)
      setMatches(foundMatches)
      setActiveSearchQuery(searchQuery)
      
      if (foundMatches.length > 0) {
        setCurrentMatchIndex(0)
        const firstMatch = foundMatches[0]
        navigateToPage(firstMatch.pageNumber)
      } else {
        setCurrentMatchIndex(-1)
      }
    }

    // Navigate to previous match
    const navigateToPrevious = () => {
      if (matches.length === 0) return
      const prevIndex = currentMatchIndex <= 0 ? matches.length - 1 : currentMatchIndex - 1
      setCurrentMatchIndex(prevIndex)
      const match = matches[prevIndex]
      if (match) {
        navigateToPage(match.pageNumber)
      }
    }

    // Navigate to next match
    const navigateToNext = () => {
      if (matches.length === 0) return
      const nextIndex = (currentMatchIndex + 1) % matches.length
      setCurrentMatchIndex(nextIndex)
      const match = matches[nextIndex]
      if (match) {
        navigateToPage(match.pageNumber)
      }
    }

    // Handle keyboard shortcuts
    useEffect(() => {
      const handleKeyDown = (e: KeyboardEvent) => {
        // Only handle keyboard shortcuts when PDF viewer is active
        // Check if the event target is within the PDF viewer container
        const target = e.target as HTMLElement
        const isInPDFViewer = containerRef.current?.contains(target) || false
        
        // Don't handle keyboard shortcuts if:
        // 1. Target is an input element (including search inputs)
        // 2. Target is in a contentEditable element (TipTap editor)
        // 3. Target is in a textarea
        // 4. Event is not within PDF viewer container
        if (
          target instanceof HTMLInputElement ||
          target instanceof HTMLTextAreaElement ||
          target.isContentEditable ||
          target.closest('[contenteditable="true"]') !== null ||
          !isInPDFViewer
        ) {
          return
        }
        
        // Ctrl+F or Cmd+F to toggle search
        if ((e.ctrlKey || e.metaKey) && e.key === 'f' && !e.shiftKey) {
          e.preventDefault()
          if (showInlineSearch) {
            clearSearchState()
          } else {
            setShowInlineSearch(true)
            setTimeout(() => {
              inlineSearchInputRef.current?.focus()
              inlineSearchInputRef.current?.select()
            }, 50)
          }
          return
        }
        
        // Arrow keys for navigation (only when PDF viewer is focused)
        if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
          e.preventDefault()
          goToPreviousPage()
        } else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
          e.preventDefault()
          goToNextPage()
        }
      }

      window.addEventListener('keydown', handleKeyDown)
      return () => window.removeEventListener('keydown', handleKeyDown)
    }, [showInlineSearch, currentPage, totalPages])

    // Calculate right offset for search bar
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

    // Update navigation bar position based on container width
    // Use useLayoutEffect to calculate position synchronously before paint to prevent flashing
    useLayoutEffect(() => {
      // Don't update position while loading or if PDF isn't loaded yet
      if (loading || !pdfDocument || totalPages === 0) {
        return
      }

      const updateNavBarPosition = () => {
        if (!containerRef.current) {
          return
        }

        const rect = containerRef.current.getBoundingClientRect()
        const centerX = rect.left + rect.width / 2
        
        // Validate that we have valid dimensions before setting position
        // Container must have a width > 0 and be visible (not collapsed)
        const isValid = rect.width > 0 && rect.height > 0 && centerX > 0
        
        if (isValid) {
          const newPosition = `${centerX}px`
          // Only update if position actually changed to avoid unnecessary re-renders
          if (navBarLeftRef.current !== newPosition) {
            navBarLeftRef.current = newPosition
            setNavBarLeft(newPosition)
          }
        }
      }

      // Update immediately before paint
      updateNavBarPosition()

      const handleResize = () => {
        updateNavBarPosition()
      }

      window.addEventListener('resize', handleResize)
      
      // Also update when AI panel opens/closes
      const container = containerRef.current
      if (container) {
        // Use ResizeObserver to detect container size changes
        const observer = new ResizeObserver(() => {
          // Use requestAnimationFrame to ensure DOM has updated
          requestAnimationFrame(() => {
            updateNavBarPosition()
          })
        })
        observer.observe(container)
        
        return () => {
          window.removeEventListener('resize', handleResize)
          observer.disconnect()
        }
      }

      return () => {
        window.removeEventListener('resize', handleResize)
      }
    }, [isAIPanelOpen, aiPanelWidth, loading, pdfDocument, totalPages])

    // Early returns
    if (!document) {
      return null
    }

    const isPDF = document.title.toLowerCase().endsWith('.pdf')
    if (!isPDF) {
      return null
    }

    const bgColor = theme === 'dark' ? '#141414' : '#ffffff'

    return (
      <div
        ref={containerRef}
        style={{
          width: '100%',
          height: '100%',
          backgroundColor: bgColor,
          overflow: 'auto',
          position: 'relative',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          padding: '20px',
        }}
      >
        {/* PDF Canvas */}
        {!error ? (
          isScrollMode ? (
            <div style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '20px' }}>
              {Array.from({ length: totalPages }, (_, i) => i + 1).map((pageNum) => (
                <canvas
                  key={pageNum}
                  ref={(el) => {
                    if (el) {
                      scrollCanvasRefs.current.set(pageNum, el)
                    } else {
                      scrollCanvasRefs.current.delete(pageNum)
                    }
                  }}
                  style={{
                    display: 'block',
                    boxShadow: theme === 'dark' 
                      ? '0 4px 12px rgba(0, 0, 0, 0.5)' 
                      : '0 4px 16px rgba(0, 0, 0, 0.25)',
                    backgroundColor: theme === 'dark' ? '#1a1a1a' : '#fff',
                    filter: theme === 'dark' ? 'brightness(0.85)' : 'none',
                  }}
                />
              ))}
            </div>
          ) : (
            <div style={{ position: 'relative' }}>
              {loading && (
                <div
                  style={{
                    position: 'absolute',
                    top: '50%',
                    left: '50%',
                    transform: 'translate(-50%, -50%)',
                    color: theme === 'dark' ? '#D6D6DD' : '#5f6368',
                  }}
                >
                  Loading PDF...
                </div>
              )}
              <canvas
                ref={canvasRef}
                style={{
                  display: 'block',
                  boxShadow: theme === 'dark' 
                    ? '0 4px 12px rgba(0, 0, 0, 0.5)' 
                    : '0 4px 16px rgba(0, 0, 0, 0.25)',
                  backgroundColor: theme === 'dark' ? '#1a1a1a' : '#fff',
                  filter: theme === 'dark' ? 'brightness(0.85)' : 'none',
                }}
              />
            </div>
          )
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
              color: theme === 'dark' ? '#858585' : '#5f6368',
            }}
          >
            <p style={{ fontSize: '16px', marginBottom: '8px' }}>Unable to display PDF.</p>
            <p style={{ fontSize: '12px' }}>
              The PDF file is available in the file explorer.
            </p>
          </div>
        )}

        {/* Page Navigation Controls */}
        {!error && totalPages > 0 && navBarLeft !== null && (
          <div
              style={{
                position: 'fixed',
                bottom: '16px',
                left: navBarLeft,
                transform: 'translateX(-50%)',
                backgroundColor: theme === 'dark' ? 'rgba(30, 30, 30, 0.30)' : 'rgba(255, 255, 255, 0.90)',
                borderRadius: '12px',
                padding: '4px 8px',
                boxShadow: theme === 'dark' ? 'none' : '0 2px 8px rgba(0, 0, 0, 0.15)',
                border: theme === 'dark' ? 'none' : '1px solid rgba(0, 0, 0, 0.1)',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                zIndex: 100,
                fontFamily: "'Noto Sans SC', 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif",
                backdropFilter: 'blur(10px)',
              }}
          >
            {/* Previous Page Button */}
            <button
              onClick={goToPreviousPage}
              disabled={currentPage <= 1}
              style={{
                padding: '4px 6px',
                backgroundColor: 'transparent',
                color: currentPage <= 1 
                  ? (theme === 'dark' ? '#4a4a4a' : '#c0c0c0')
                  : (theme === 'dark' ? '#D6D6DD' : '#202124'),
                border: 'none',
                borderRadius: '8px',
                cursor: currentPage <= 1 ? 'not-allowed' : 'pointer',
                fontSize: '16px',
                fontWeight: 400,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '24px',
                height: '24px',
                transition: 'all 0.15s ease',
                opacity: currentPage <= 1 ? 0.5 : 1,
                outline: 'none',
              }}
              onFocus={(e) => {
                e.currentTarget.style.outline = 'none'
              }}
              onMouseEnter={(e) => {
                if (currentPage > 1) {
                  e.currentTarget.style.backgroundColor = theme === 'dark' ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.05)'
                }
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'transparent'
              }}
            >
              <span style={{ fontSize: '18px', lineHeight: 1, opacity: 1 }}>←</span>
            </button>

            {/* Page Info - Clickable to input page number */}
            {isPageInputOpen ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <input
                  ref={pageInputRef}
                  type="number"
                  min="1"
                  max={totalPages}
                  value={pageInputValue}
                  onChange={(e) => setPageInputValue(e.target.value)}
                  onKeyDown={handlePageInputKeyDown}
                  onBlur={handlePageInputSubmit}
                  style={{
                    width: '60px',
                    padding: '4px 8px',
                    backgroundColor: theme === 'dark' ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.03)',
                    borderRadius: '6px',
                    color: theme === 'dark' ? '#D6D6DD' : '#202124',
                    fontSize: '12px',
                    fontWeight: 500,
                    textAlign: 'center',
                    border: `1px solid ${theme === 'dark' ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)'}`,
                    outline: 'none',
                  }}
                />
                <span style={{ 
                  color: theme === 'dark' ? '#858585' : '#5f6368', 
                  fontSize: '12px' 
                }}>
                  / {totalPages}
                </span>
              </div>
            ) : (
              <div
                onClick={handlePageInputClick}
                style={{
                  color: theme === 'dark' ? '#D6D6DD' : '#202124',
                  fontSize: '12px',
                  fontWeight: 500,
                  cursor: 'pointer',
                  opacity: 1,
                }}
              >
                {currentPage} of {totalPages}
              </div>
            )}

            {/* Next Page Button */}
            <button
              onClick={goToNextPage}
              disabled={currentPage >= totalPages}
              style={{
                padding: '4px 6px',
                backgroundColor: 'transparent',
                color: currentPage >= totalPages
                  ? (theme === 'dark' ? '#4a4a4a' : '#c0c0c0')
                  : (theme === 'dark' ? '#D6D6DD' : '#202124'),
                border: 'none',
                borderRadius: '8px',
                cursor: currentPage >= totalPages ? 'not-allowed' : 'pointer',
                fontSize: '16px',
                fontWeight: 400,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '24px',
                height: '24px',
                transition: 'all 0.15s ease',
                opacity: currentPage >= totalPages ? 0.5 : 1,
                outline: 'none',
              }}
              onFocus={(e) => {
                e.currentTarget.style.outline = 'none'
              }}
              onMouseEnter={(e) => {
                if (currentPage < totalPages) {
                  e.currentTarget.style.backgroundColor = theme === 'dark' ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.05)'
                }
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'transparent'
              }}
            >
              <span style={{ fontSize: '18px', lineHeight: 1, opacity: 1 }}>→</span>
            </button>

            {/* Divider */}
            <div 
              style={{ 
                width: '0.8px', 
                height: '16px', 
                backgroundColor: theme === 'dark' ? 'rgba(45, 45, 45, 0.1)' : 'rgba(218, 220, 224, 0.4)',
                margin: '0 4px',
              }} 
            />

            {/* Zoom Out Button */}
            <button
              onClick={() => setScale(Math.max(0.5, scale - 0.25))}
              style={{
                padding: '4px 6px',
                backgroundColor: 'transparent',
                color: theme === 'dark' ? '#D6D6DD' : '#202124',
                border: 'none',
                borderRadius: '8px',
                cursor: 'pointer',
                fontSize: '16px',
                fontWeight: 400,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '24px',
                height: '24px',
                transition: 'all 0.15s ease',
                outline: 'none',
              }}
              onFocus={(e) => {
                e.currentTarget.style.outline = 'none'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = theme === 'dark' ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.05)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'transparent'
              }}
            >
              <span style={{ opacity: 1 }}>−</span>
            </button>

            {/* Zoom Percentage */}
            <div
              style={{
                color: theme === 'dark' ? '#D6D6DD' : '#202124',
                fontSize: '12px',
                fontWeight: 500,
                textAlign: 'center',
                opacity: 1,
              }}
            >
              {Math.round(scale * 100)}%
            </div>

            {/* Zoom In Button */}
            <button
              onClick={() => setScale(Math.min(3, scale + 0.25))}
              style={{
                padding: '4px 6px',
                backgroundColor: 'transparent',
                color: theme === 'dark' ? '#D6D6DD' : '#202124',
                border: 'none',
                borderRadius: '8px',
                cursor: 'pointer',
                fontSize: '16px',
                fontWeight: 400,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '24px',
                height: '24px',
                transition: 'all 0.15s ease',
                outline: 'none',
              }}
              onFocus={(e) => {
                e.currentTarget.style.outline = 'none'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = theme === 'dark' ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.05)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'transparent'
              }}
            >
              <span style={{ opacity: 1 }}>+</span>
            </button>

            {/* Divider */}
            <div 
              style={{ 
                width: '0.8px', 
                height: '16px', 
                backgroundColor: theme === 'dark' ? 'rgba(45, 45, 45, 0.1)' : 'rgba(218, 220, 224, 0.4)',
                margin: '0 4px',
              }} 
            />

            {/* Scroll Mode Toggle Button */}
            <button
              onClick={() => {
                setIsScrollMode(!isScrollMode)
                setLoading(false)
              }}
              style={{
                padding: '4px 6px',
                backgroundColor: isScrollMode 
                  ? (theme === 'dark' ? 'rgba(255, 255, 255, 0.15)' : 'rgba(0, 0, 0, 0.1)')
                  : 'transparent',
                color: theme === 'dark' ? '#D6D6DD' : '#202124',
                border: 'none',
                borderRadius: '8px',
                cursor: 'pointer',
                fontSize: '16px',
                fontWeight: 400,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '24px',
                height: '24px',
                transition: 'all 0.15s ease',
                outline: 'none',
              }}
              onFocus={(e) => {
                e.currentTarget.style.outline = 'none'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = theme === 'dark' ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.05)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = isScrollMode 
                  ? (theme === 'dark' ? 'rgba(255, 255, 255, 0.15)' : 'rgba(0, 0, 0, 0.1)')
                  : 'transparent'
              }}
              title={isScrollMode ? 'Switch to page mode' : 'Switch to scroll mode'}
            >
              <UnfoldMoreIcon style={{ fontSize: '18px', opacity: 1 }} />
            </button>
          </div>
        )}

        {/* Inline Search Bar */}
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
              // Prevent PDF viewer from intercepting clicks on the search dialog
              e.stopPropagation()
            }}
            onClick={(e) => {
              // Prevent PDF viewer from intercepting clicks on the search dialog
              e.stopPropagation()
            }}
          >
            {/* Close button */}
            <button
              onClick={() => {
                clearSearchState()
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
                      clearSearchState()
                    } else if (e.key === 'ArrowUp' && (e.ctrlKey || e.metaKey)) {
                      e.preventDefault()
                      navigateToPrevious()
                    } else if (e.key === 'ArrowDown' && (e.ctrlKey || e.metaKey)) {
                      e.preventDefault()
                      navigateToNext()
                    }
                  }}
                  onFocus={(e) => {
                    e.target.style.borderColor = '#555' // Darker gray on focus
                  }}
                  onBlur={(e) => {
                    e.target.style.borderColor = '#333'
                  }}
                  onMouseDown={(e) => {
                    // Prevent PDF viewer from intercepting the click
                    e.stopPropagation()
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
            
            {/* Match status */}
            {activeSearchQuery && (
              <div style={{ 
                fontSize: '11px', 
                color: '#999',
                fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
                fontWeight: '300',
              }}>
                {matches.length > 0
                  ? `${matches.length} match${matches.length !== 1 ? 'es' : ''} found`
                  : 'No matches found'}
              </div>
            )}
          </div>
        )}
      </div>
    )
  }
)

FullScreenPDFViewer.displayName = 'FullScreenPDFViewer'

export default FullScreenPDFViewer
