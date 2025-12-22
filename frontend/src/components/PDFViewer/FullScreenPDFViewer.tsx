import { useState, useEffect, useRef, useImperativeHandle, forwardRef } from 'react'
import { useTheme } from '../../contexts/ThemeContext'
import { Document } from '@shared/types'

interface FullScreenPDFViewerProps {
  document: Document | null
}

export interface PDFViewerSearchHandle {
  openSearch: () => void
  closeSearch: () => void
  toggleSearch: () => void
}

const FullScreenPDFViewer = forwardRef<PDFViewerSearchHandle, FullScreenPDFViewerProps>(
  ({ document }, ref) => {
    const { theme } = useTheme()
    const [pdfSrc, setPdfSrc] = useState<string | null>(null)
    const [basePdfSrc, setBasePdfSrc] = useState<string | null>(null) // Store base URL without page anchor
    const [error, setError] = useState(false)
    const iframeRef = useRef<HTMLIFrameElement>(null)
    const [iframeKey, setIframeKey] = useState(0) // Force iframe reload by changing key
    
    // Inline search state
    const [showInlineSearch, setShowInlineSearch] = useState(false)
    const [searchQuery, setSearchQuery] = useState('')
    const [matches, setMatches] = useState<Array<{ pageNumber: number; from: number; to: number }>>([])
    const [currentMatchIndex, setCurrentMatchIndex] = useState(-1)
    const [activeSearchQuery, setActiveSearchQuery] = useState('') // The query that was actually searched
    const inlineSearchInputRef = useRef<HTMLInputElement>(null)
    const containerRef = useRef<HTMLDivElement>(null)
    const rightOffset = 20 // Fixed offset for search modal
    
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
        setShowInlineSearch(false)
        setSearchQuery('')
        setMatches([])
        setCurrentMatchIndex(-1)
        setActiveSearchQuery('')
      },
      toggleSearch: () => {
        if (showInlineSearch) {
          setShowInlineSearch(false)
          setSearchQuery('')
          setMatches([])
          setCurrentMatchIndex(-1)
          setActiveSearchQuery('')
        } else {
          setShowInlineSearch(true)
          setTimeout(() => {
            inlineSearchInputRef.current?.focus()
            inlineSearchInputRef.current?.select()
          }, 50)
        }
      },
    }))

  // Find matches in PDF text
  const findMatches = (query: string): Array<{ pageNumber: number; from: number; to: number }> => {
    if (!query.trim()) {
      return []
    }
    
    if (!document?.pdfText) {
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
  
  // Get context text around a match for display
  const getMatchContext = (match: { pageNumber: number; from: number; to: number }, contextLength: number = 50): string => {
    if (!document?.pdfText) return ''
    
    const page = document.pdfText.pages.find(p => p.pageNumber === match.pageNumber)
    if (!page) return ''
    
    const pageText = page.fullText
    const start = Math.max(0, match.from - contextLength)
    const end = Math.min(pageText.length, match.to + contextLength)
    const context = pageText.substring(start, end)
    
    // Highlight the match in the context
    const matchText = pageText.substring(match.from, match.to)
    const beforeMatch = context.substring(0, match.from - start)
    const afterMatch = context.substring(match.to - start)
    
    return `${beforeMatch}[${matchText}]${afterMatch}`
  }
  
  // Navigate to a specific page in the PDF and try to highlight text
  const navigateToPage = (pageNumber: number, match?: { pageNumber: number; from: number; to: number }) => {
    if (!basePdfSrc) {
      return
    }
    
    // Append page anchor to PDF URL
    // Most PDF viewers support #page=N format
    let pageAnchor = `#page=${pageNumber}`
    
    // Try to add text search parameter if match is provided
    // Some PDF viewers support #search=text or #text=search
    if (match && searchQuery.trim()) {
      // Try different formats for text highlighting
      pageAnchor += `&search=${encodeURIComponent(searchQuery)}`
      // Also try alternative formats
      // pageAnchor += `&text=${encodeURIComponent(searchQuery)}`
    }
    
    const newSrc = basePdfSrc.includes('#') 
      ? basePdfSrc.replace(/#.*$/, pageAnchor) 
      : basePdfSrc + pageAnchor
    
    // Force iframe reload by updating key
    setIframeKey(prev => prev + 1)
    
    // Set the new src
    setPdfSrc(newSrc)
    
    // Also try to communicate with iframe if it's a PDF.js viewer
    // This is a fallback for PDF.js-based viewers
    setTimeout(() => {
      if (iframeRef.current?.contentWindow) {
        try {
          // Try multiple postMessage formats that different PDF viewers might use
          const messages: any[] = [
            { type: 'goToPage', page: pageNumber },
            { type: 'navigate', page: pageNumber },
            { type: 'page', page: pageNumber },
            { action: 'goToPage', page: pageNumber },
          ]
          
          // If we have a match, try to highlight the text
          if (match && searchQuery.trim()) {
            messages.push(
              { type: 'highlight', page: pageNumber, text: searchQuery },
              { type: 'search', page: pageNumber, query: searchQuery },
              { action: 'highlight', page: pageNumber, text: searchQuery },
            )
          }
          
          messages.forEach((msg) => {
            try {
              iframeRef.current?.contentWindow?.postMessage(msg, '*')
            } catch (e) {
              // Ignore errors
            }
          })
        } catch (e) {
          // Ignore errors
        }
      }
    }, 100) // Small delay to ensure iframe has reloaded
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
      navigateToPage(firstMatch.pageNumber, firstMatch)
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
    if (match && match.pageNumber) {
      navigateToPage(match.pageNumber)
    }
  }
  
  // Navigate to next match
  const navigateToNext = () => {
    if (matches.length === 0) return
    const nextIndex = (currentMatchIndex + 1) % matches.length
    setCurrentMatchIndex(nextIndex)
    const match = matches[nextIndex]
    if (match && match.pageNumber) {
      navigateToPage(match.pageNumber, match)
    }
  }

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
        // Store base URL without page anchor
        const baseSrc = src.split('#')[0]
        setBasePdfSrc(baseSrc)
        setPdfSrc(src) // Keep original src with any existing anchor
        setError(false)
      } else {
        setError(true)
      }
    } catch (e) {
      setError(true)
    }
  }, [document])
  
  // Handle Escape key to close search (when search is open)
  useEffect(() => {
    if (!showInlineSearch) return
    
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't interfere with input fields - input handlers will handle their own keys
      if (e.target instanceof HTMLInputElement) {
        // Let the input's onKeyDown handler handle Enter and Escape
        // This listener only handles Escape when input is not focused
        if (e.key === 'Escape' && e.target !== inlineSearchInputRef.current) {
          e.preventDefault()
          setShowInlineSearch(false)
          setSearchQuery('')
          setMatches([])
          setCurrentMatchIndex(-1)
          setActiveSearchQuery('')
          return
        }
        return
      }
      
      // Handle Escape when search is open but no input is focused
      if (e.key === 'Escape') {
        e.preventDefault()
        setShowInlineSearch(false)
        setSearchQuery('')
        setMatches([])
        setCurrentMatchIndex(-1)
        setActiveSearchQuery('')
        return
      }
    }
    
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [showInlineSearch])
  
  // Focus search input when opening
  useEffect(() => {
    if (showInlineSearch && inlineSearchInputRef.current) {
      setTimeout(() => {
        inlineSearchInputRef.current?.focus()
        inlineSearchInputRef.current?.select()
      }, 50)
    }
  }, [showInlineSearch])
  
  // Perform search when query changes (debounced) - 混合模式：实时高亮，不自动导航
  useEffect(() => {
    if (!searchQuery.trim()) {
      setMatches([])
      setCurrentMatchIndex(-1)
      return
    }
    
    const timeoutId = setTimeout(() => {
      if (!searchQuery.trim()) {
        setMatches([])
        setCurrentMatchIndex(-1)
        return
      }
      
      if (!document?.pdfText) {
        setMatches([])
        setCurrentMatchIndex(-1)
        return
      }
      
      const foundMatches = findMatches(searchQuery)
      
      // 实时高亮：更新匹配结果，但不自动导航
      setMatches(foundMatches)
      
      if (foundMatches.length > 0) {
        // 设置当前匹配索引为0（用于显示 "1/N"），但不导航
        setCurrentMatchIndex(0)
      } else {
        setCurrentMatchIndex(-1)
      }
    }, 300) // 300ms 防抖延迟
    
    return () => {
      clearTimeout(timeoutId)
    }
  }, [searchQuery, document])

  // Early returns AFTER all hooks
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
      ref={containerRef}
      style={{
        width: '100%',
        height: '100%',
        backgroundColor: bgColor,
        overflow: 'hidden',
        position: 'relative',
      }}
      onKeyDown={(e) => {
        // Handle Ctrl+F on the container div
        if ((e.ctrlKey || e.metaKey) && (e.key === 'f' || e.key === 'F') && !e.shiftKey) {
          e.preventDefault()
          e.stopPropagation()
          if (showInlineSearch) {
            setShowInlineSearch(false)
            setSearchQuery('')
            setMatches([])
            setCurrentMatchIndex(-1)
            setActiveSearchQuery('')
          } else {
            setShowInlineSearch(true)
            setTimeout(() => {
              inlineSearchInputRef.current?.focus()
              inlineSearchInputRef.current?.select()
            }, 50)
          }
        }
      }}
      onClick={(e) => {
        // If clicking on the container (not the iframe), focus it so keyboard events work
        if (e.target === containerRef.current) {
          containerRef.current?.focus()
        }
      }}
      tabIndex={-1}
    >
      {!error ? (
        <iframe
          key={iframeKey}
          ref={iframeRef}
          src={pdfSrc ?? undefined}
          style={{
            width: '100%',
            height: '100%',
            border: 'none',
            display: 'block',
            backgroundColor: bgColor,
          }}
          onError={() => setError(true)}
          onLoad={() => {
            // Try postMessage again after iframe loads
            if (pdfSrc && pdfSrc.includes('#page=')) {
              const pageMatch = pdfSrc.match(/#page=(\d+)/)
              if (pageMatch && iframeRef.current?.contentWindow) {
                const pageNum = parseInt(pageMatch[1], 10)
                setTimeout(() => {
                  try {
                    iframeRef.current?.contentWindow?.postMessage({
                      type: 'goToPage',
                      page: pageNum
                    }, '*')
                  } catch (e) {
                  }
                }, 500)
              }
            }
          }}
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
      
      {/* Inline Search Bar for PDF */}
      {showInlineSearch && (
        <div
          style={{
            position: 'fixed',
            top: '92px',
            right: `${rightOffset}px`,
            backgroundColor: '#1e1e1e',
            borderRadius: '8px',
            padding: '12px',
            boxShadow: '0 8px 24px rgba(0,0,0,0.5), 0 2px 8px rgba(0,0,0,0.3)',
            zIndex: 1000,
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
            minWidth: '280px',
            maxWidth: '300px',
            fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
            fontWeight: '300',
            transition: 'right 0.3s ease',
          }}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Show message if PDF text is not available */}
          {!document?.pdfText && (
            <div style={{
              padding: '8px 12px',
              backgroundColor: '#2a2a2a',
              borderRadius: '4px',
              fontSize: '12px',
              color: '#999',
              marginBottom: '8px',
            }}>
              PDF text is being extracted... Search will be available shortly.
            </div>
          )}
          {/* Close button */}
          <button
            onClick={() => {
              setShowInlineSearch(false)
              setSearchQuery('')
              setMatches([])
              setCurrentMatchIndex(-1)
              setActiveSearchQuery('')
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
              Find in PDF
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
                  minWidth: 0,
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
                    setMatches([])
                    setCurrentMatchIndex(-1)
                    setActiveSearchQuery('')
                  }
                }}
                onFocus={(e) => {
                  e.target.style.borderColor = '#555'
                }}
                onBlur={(e) => {
                  e.target.style.borderColor = '#333'
                }}
                onMouseDown={(e) => e.stopPropagation()}
              />
              {matches.length > 0 && (
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
                  {/* Show match context and page info */}
                  {currentMatchIndex >= 0 && matches[currentMatchIndex] && (
                    <div 
                      style={{
                        fontSize: '10px',
                        color: '#666',
                        padding: '2px 6px',
                        backgroundColor: '#2a2a2a',
                        borderRadius: '3px',
                        fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
                        fontWeight: '300',
                        maxWidth: '120px',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                      title={`Page ${matches[currentMatchIndex].pageNumber}: ${getMatchContext(matches[currentMatchIndex], 30)}`}
                    >
                      Page {matches[currentMatchIndex].pageNumber}
                    </div>
                  )}
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
        </div>
      )}
    </div>
  )
})

FullScreenPDFViewer.displayName = 'FullScreenPDFViewer'

export default FullScreenPDFViewer

