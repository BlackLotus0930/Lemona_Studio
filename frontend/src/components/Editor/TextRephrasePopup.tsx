import { useState, useEffect, useRef, useCallback } from 'react'
import { useTheme } from '../../contexts/ThemeContext'
import { aiApi } from '../../services/api'

interface TextRephrasePopupProps {
  selectedText: string
  position: { x: number; y: number }
  onReplace: (newText: string) => void
  onClose: () => void
  onInputFocus?: (isFocused: boolean) => void
  onReadSelection?: () => { 
    text: string
    range: { from: number; to: number } | null
    contextBefore?: string
    contextAfter?: string
    paragraphCount?: number
  }
}

type ActionType = 'improve' | 'rephrase' | 'lengthen' | 'shorten' | 'custom'

export default function TextRephrasePopup({ selectedText, position, onReplace, onClose, onInputFocus, onReadSelection }: TextRephrasePopupProps) {
  const { theme } = useTheme()
  const [isExpanded, setIsExpanded] = useState(false)
  const [activeAction, setActiveAction] = useState<ActionType>('improve')
  const [customPrompt, setCustomPrompt] = useState('')
  const [improvedText, setImprovedText] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const cachedSelectionRef = useRef<{ 
    text: string
    contextBefore?: string
    contextAfter?: string
    paragraphCount?: number
  } | null>(null)
  const popupRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const positionLockedRef = useRef(false) // Track if position has been locked
  const expandedPositionLockedRef = useRef(false) // Track if expanded position has been locked
  const [adjustedPosition, setAdjustedPosition] = useState(() => {
    // Initialize with adjusted position for compact state
    const screenWidth = window.innerWidth
    const rightMargin = 25
    const estimatedWidth = 120 // Start with compact button width
    const maxX = screenWidth - estimatedWidth - rightMargin
    return {
      x: Math.min(position.x, maxX),
      y: position.y
    }
  })

  const bgColor = theme === 'dark' ? '#1e1e1e' : '#ffffff'
  const textColor = theme === 'dark' ? '#D6D6DD' : '#202124'
  const borderColor = theme === 'dark' ? '#313131' : '#dadce0'
  const inputBg = theme === 'dark' ? '#1d1d1d' : '#ffffff'
  const buttonHoverBg = theme === 'dark' ? '#262626' : '#f1f4f7'
  const activeButtonBg = theme === 'dark' ? '#262626' : '#e7eef5'
  const accentBlue = theme === 'dark' ? '#2f6c8f' : '#6b9fcb'
  const activeButtonColor = accentBlue

  // Adjust position when popup opens and update Y coordinate during drag selection
  useEffect(() => {
    const screenWidth = window.innerWidth
    const rightMargin = 25
    const popupWidth = 120 // compact button width
    const maxX = screenWidth - popupWidth - rightMargin
    
    if (!positionLockedRef.current) {
      // First time: lock X position (right side) and set Y
      const adjustedX = Math.min(position.x, maxX)
      
      setAdjustedPosition({
        x: adjustedX,
        y: position.y
      })
      
      // Lock X position after first calculation
      positionLockedRef.current = true
    } else {
      // After locked: keep X position but update Y to follow selection during drag
      setAdjustedPosition(prev => ({
        x: prev.x, // Keep X locked to right side
        y: position.y // Update Y to follow selection
      }))
    }
  }, [position])

  // Cache selection text as soon as we receive it
  useEffect(() => {
    if (selectedText && selectedText.trim().length > 0) {
      cachedSelectionRef.current = { 
        text: selectedText,
        contextBefore: cachedSelectionRef.current?.contextBefore,
        contextAfter: cachedSelectionRef.current?.contextAfter,
        paragraphCount: cachedSelectionRef.current?.paragraphCount,
      }
    }
  }, [selectedText])

  // Adjust position once when expanding, then lock it
  useEffect(() => {
    if (isExpanded && !expandedPositionLockedRef.current) {
      const screenWidth = window.innerWidth
      const rightMargin = 25
      const popupWidth = 360 // expanded modal width
      const maxX = screenWidth - popupWidth - rightMargin
      
      // Adjust position to account for expanded width, but keep it close to original
      setAdjustedPosition(prev => ({
        x: Math.min(prev.x, maxX),
        y: prev.y
      }))
      
      // Lock expanded position
      expandedPositionLockedRef.current = true
    }
  }, [isExpanded])

  // Only adjust position on window resize (but keep it locked relative to screen)
  useEffect(() => {
    const adjustPositionOnResize = () => {
      if (positionLockedRef.current) {
        const screenWidth = window.innerWidth
        const rightMargin = 25
        const popupWidth = isExpanded ? 360 : 120
        const maxX = screenWidth - popupWidth - rightMargin
        
        // Keep the relative position, but ensure it doesn't go off screen
        setAdjustedPosition(prev => ({
          x: Math.min(prev.x, maxX),
          y: prev.y
        }))
      }
    }

    window.addEventListener('resize', adjustPositionOnResize)
    
    return () => {
      window.removeEventListener('resize', adjustPositionOnResize)
    }
  }, [isExpanded])


  // Reset position locks when popup closes
  useEffect(() => {
    return () => {
      positionLockedRef.current = false
      expandedPositionLockedRef.current = false
    }
  }, [])

  const handleReplace = useCallback(() => {
    if (improvedText) {
      onReplace(improvedText)
      onClose()
    }
  }, [improvedText, onReplace, onClose])

  // Helper function to format error messages in a user-friendly way
  const formatErrorMessage = (error: any): string => {
    const errorMessage = error instanceof Error ? error.message : String(error)
    
    // API key errors
    if (errorMessage.includes('API key') || errorMessage.includes('not configured')) {
      if (errorMessage.includes('OpenAI')) {
        return 'OpenAI API key is required. Please add your OpenAI API key in Settings > API Keys.'
      }
      if (errorMessage.includes('Google')) {
        return 'Google API key is required. Please add your Google API key in Settings > API Keys.'
      }
      return 'API key is required. Please add your API key in Settings > API Keys.'
    }
    
    // Network/connection errors
    if (errorMessage.includes('network') || errorMessage.includes('fetch') || errorMessage.includes('ECONNREFUSED')) {
      return 'Connection error. Please check your internet connection and try again.'
    }
    
    // Rate limit errors
    if (errorMessage.includes('rate limit') || errorMessage.includes('429')) {
      return 'Rate limit exceeded. Please wait a moment and try again.'
    }
    
    // Authentication errors
    if (errorMessage.includes('401') || errorMessage.includes('unauthorized') || errorMessage.includes('invalid')) {
      return 'Invalid API key. Please check your API key in Settings > API Keys.'
    }
    
    // Quota/billing errors
    if (errorMessage.includes('quota') || errorMessage.includes('billing') || errorMessage.includes('insufficient')) {
      return 'API quota exceeded. Please check your API account billing or usage limits.'
    }
    
    // Generic error
    return 'Unable to process your request. Please try again or check your API keys.'
  }

  const processText = useCallback(async (action: ActionType, prompt?: string) => {
    setIsLoading(true)
    setError(null)
    setImprovedText(null)

    try {
      const languageInstruction = 'Use the same language as the original text.'
      const paragraphCount = cachedSelectionRef.current?.paragraphCount
      const paragraphInstruction = paragraphCount
        ? `Preserve paragraph breaks and output exactly ${paragraphCount} paragraph(s).`
        : 'Preserve paragraph breaks exactly; do not merge paragraphs.'
      const structureInstruction = `CRITICAL: Preserve the original structure including titles, headings, bullet points, numbered lists, line breaks, paragraphs, and formatting. Do not change the structure or convert lists to paragraphs. ${paragraphInstruction} Output plain text only (no Markdown, no headings syntax, no list markers added).`
      const contextBefore = cachedSelectionRef.current?.contextBefore
      const contextAfter = cachedSelectionRef.current?.contextAfter
      const contextInstruction = (contextBefore || contextAfter)
        ? `Context (do not edit or include in output):\n[Before]\n${contextBefore || ''}\n\n[After]\n${contextAfter || ''}\n\nOnly rewrite the selected text.`
        : ''
      
      let instruction = ''
      switch (action) {
        case 'improve':
          instruction = `Substantially improve clarity, grammar, and flow. Rewrite awkward phrasing, remove redundancy, and tighten sentences while preserving meaning and tone. ${languageInstruction} ${structureInstruction} ${contextInstruction}`
          break
        case 'rephrase':
          instruction = `Rephrase this text with noticeably different wording while keeping the exact same meaning and tone. ${languageInstruction} ${structureInstruction} ${contextInstruction}`
          break
        case 'lengthen':
          instruction = `Expand this text by roughly 30–60% with additional detail and examples while keeping the original meaning. ${languageInstruction} ${structureInstruction} ${contextInstruction}`
          break
        case 'shorten':
          instruction = `Shorten this text by roughly 40–60% while preserving key points and meaning. ${languageInstruction} ${structureInstruction} ${contextInstruction}`
          break
        case 'custom':
          instruction = prompt
            ? `USER INSTRUCTION (follow exactly unless it conflicts with the rules): ${prompt}\n\n${languageInstruction} ${structureInstruction} ${contextInstruction}`
            : ''
          break
      }

      if (!instruction.trim()) return

      // Always read the latest selection when possible
      let textToProcess = cachedSelectionRef.current?.text || selectedText
      if (onReadSelection) {
        const selection = onReadSelection()
        if (selection.text && selection.text.trim().length > 0) {
          textToProcess = selection.text
          cachedSelectionRef.current = { 
            text: selection.text,
            contextBefore: selection.contextBefore,
            contextAfter: selection.contextAfter,
            paragraphCount: selection.paragraphCount,
          }
        }
      }
      
      if (!textToProcess || textToProcess.trim().length === 0) {
        setError('No text selected')
        setIsLoading(false)
        return
      }

      const result = await aiApi.rephraseText(textToProcess, instruction)
      let improved = typeof result === 'string' ? result : (result.data || result)
      
      // Remove any "Next step" or follow-up text that might still appear
      const nextStepPatterns = [
        /Next step:.*$/i,
        /Would you like.*$/i,
        /Do you want.*$/i,
        /Can I help.*$/i,
        /Is there anything.*$/i,
        /Let me know.*$/i,
        /Feel free.*$/i,
        /\n\nNext step.*$/i,
        /\n\nWould you.*$/i,
      ]
      
      for (const pattern of nextStepPatterns) {
        improved = improved.replace(pattern, '').trim()
      }
      
      setImprovedText(improved)
    } catch (err) {
      console.error('Text improvement error:', err)
      const friendlyError = formatErrorMessage(err)
      setError(friendlyError)
    } finally {
      setIsLoading(false)
    }
  }, [selectedText, onReadSelection])

  // Handle expand and improve
  const handleExpandAndImprove = useCallback(() => {
    setIsExpanded(true)
    setImprovedText(null)
    setError(null)
    setActiveAction('improve')
    processText('improve')
  }, [processText])

  // Listen for popup open event to auto-expand when opened via Ctrl+K
  useEffect(() => {
    const handlePopupOpen = () => {
      // Check if we should auto-expand (triggered by Ctrl+K)
      if ((window as any).__triggerRephraseExpand && !isExpanded) {
        ;(window as any).__triggerRephraseExpand = false
        handleExpandAndImprove()
      }
    }

    window.addEventListener('rephrase-popup-open', handlePopupOpen)
    return () => window.removeEventListener('rephrase-popup-open', handlePopupOpen)
  }, [isExpanded, handleExpandAndImprove])

  // 调整 popup 位置，防止被屏幕下缘遮挡（距离底部 30px）
  const adjustPositionForBottom = useCallback(() => {
    if (!popupRef.current || !isExpanded) {
      return
    }

    requestAnimationFrame(() => {
      if (!popupRef.current) return

      const rect = popupRef.current.getBoundingClientRect()
      const windowHeight = window.innerHeight
      const bottomMargin = 30 // 距离下屏幕 30px

      // 如果 popup 底部超出屏幕，向上调整
      if (rect.bottom > windowHeight - bottomMargin) {
        const overflow = rect.bottom - (windowHeight - bottomMargin)
        setAdjustedPosition(prev => ({
          ...prev,
          y: prev.y - overflow
        }))
      }
    })
  }, [isExpanded])

  // 展开时检查位置（还没生成）
  useEffect(() => {
    if (isExpanded && !improvedText && !isLoading) {
      adjustPositionForBottom()
    }
  }, [isExpanded, improvedText, isLoading, adjustPositionForBottom])

  // 生成完成后再次检查位置
  useEffect(() => {
    if (improvedText && isExpanded) {
      // 等待内容渲染完成
      setTimeout(() => {
        adjustPositionForBottom()
      }, 100)
    }
  }, [improvedText, isExpanded, adjustPositionForBottom])

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey) {
        if (e.key === 'k' || e.key === 'K') {
          // CRITICAL: Mark the time when Ctrl+K is pressed to prevent click-outside handler from closing popup
          // Use window object to share with DocumentEditor
          ;(window as any).__lastCtrlKTime = Date.now()
          e.preventDefault()
          // Cancel any pending autocomplete requests
          if (typeof (window as any).__cancelAutocomplete === 'function') {
            (window as any).__cancelAutocomplete()
          }
          if (!isExpanded) {
            handleExpandAndImprove()
          } else {
            setImprovedText(null)
            setError(null)
            setActiveAction('improve')
            processText('improve')
          }
        } else if ((e.key === 'Enter' || e.key === 'Return') && improvedText) {
          e.preventDefault()
          handleReplace()
        }
      }
      if (e.key === 'Escape') {
        onClose()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isExpanded, improvedText, isLoading, handleReplace, onClose, handleExpandAndImprove, processText])

  // Handle Enter key in custom input
  const handleCustomInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !isLoading && customPrompt.trim()) {
      e.preventDefault()
      setActiveAction('custom')
      processText('custom', customPrompt)
    }
  }

  // Close popup when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      // CRITICAL: Ignore clicks that happen shortly after Ctrl+K to prevent accidental close
      // Ctrl+K might trigger focus changes that cause mousedown events
      // Check both window global (set by DocumentEditor) and local ref (set by this component)
      const lastCtrlKTime = (window as any).__lastCtrlKTime || 0
      const timeSinceCtrlK = Date.now() - lastCtrlKTime
      const CTRL_K_COOLDOWN_MS = 300 // Ignore clicks within 300ms of Ctrl+K
      
      if (timeSinceCtrlK < CTRL_K_COOLDOWN_MS) {
        return
      }
      
      if (popupRef.current && !popupRef.current.contains(event.target as Node)) {
        onClose()
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [onClose, isExpanded])

  // Show compact button initially
  if (!isExpanded) {
    return (
      <div
        ref={popupRef}
        style={{
          position: 'fixed',
          left: `${adjustedPosition.x}px`,
          top: `${adjustedPosition.y}px`,
          backgroundColor: bgColor,
          border: `1px solid ${borderColor}`,
          borderRadius: '6px',
          boxShadow: '0 2px 8px rgba(0, 0, 0, 0.15)',
          zIndex: 10000,
          fontFamily: 'system-ui, -apple-system, sans-serif',
          padding: '3px 6px',
          display: 'flex',
          gap: '12px',
          alignItems: 'center',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={handleExpandAndImprove}
          style={{
            padding: 0,
            backgroundColor: 'transparent',
            color: textColor,
            border: 'none',
            cursor: 'pointer',
            fontSize: '12px',
            fontWeight: '400',
            transition: 'opacity 0.15s',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.opacity = '0.7'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.opacity = '1'
          }}
        >
          <span>Quick Edit</span>
          <span style={{ fontSize: '10px', opacity: 0.6 }}>Ctrl+K</span>
        </button>
      </div>
    )
  }

  // Show expanded modal
  return (
    <div
      ref={popupRef}
      style={{
        position: 'fixed',
        left: `${adjustedPosition.x}px`,
        top: `${adjustedPosition.y}px`,
        backgroundColor: bgColor,
        border: `1px solid ${borderColor}`,
        borderRadius: '6px',
        boxShadow: theme === 'dark' 
          ? '0 8px 32px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(255, 255, 255, 0.05)' 
          : '0 8px 32px rgba(0, 0, 0, 0.12), 0 0 0 1px rgba(0, 0, 0, 0.04)',
        zIndex: 10000,
        width: '360px',
        maxHeight: '500px',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Action Buttons Row */}
      <div style={{
        padding: '8px 10px',
        borderBottom: `1px solid ${borderColor}`,
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
        backgroundColor: bgColor,
        flexShrink: 0,
      }}>
        {/* Four action buttons in a row */}
        <div style={{
          display: 'flex',
          gap: '4px',
          alignItems: 'center',
          flexWrap: 'wrap',
        }}>
          <button
            onClick={() => {
              setImprovedText(null)
              setError(null)
              setActiveAction('improve')
              processText('improve')
            }}
            style={{
              padding: '5px 12px',
              backgroundColor: activeAction === 'improve' ? activeButtonBg : 'transparent',
              color: activeAction === 'improve' ? activeButtonColor : textColor,
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '12px',
              fontWeight: activeAction === 'improve' ? '500' : '400',
              transition: 'all 0.2s ease',
            }}
            onMouseEnter={(e) => {
              if (activeAction !== 'improve') {
                e.currentTarget.style.backgroundColor = buttonHoverBg
              }
            }}
            onMouseLeave={(e) => {
              if (activeAction !== 'improve') {
                e.currentTarget.style.backgroundColor = 'transparent'
              }
            }}
          >
            Improve
          </button>
          <button
            onClick={() => {
              setActiveAction('rephrase')
              processText('rephrase')
            }}
            style={{
              padding: '5px 12px',
              backgroundColor: activeAction === 'rephrase' ? activeButtonBg : 'transparent',
              color: activeAction === 'rephrase' ? activeButtonColor : textColor,
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '12px',
              fontWeight: activeAction === 'rephrase' ? '500' : '400',
              transition: 'all 0.2s ease',
            }}
            onMouseEnter={(e) => {
              if (activeAction !== 'rephrase') {
                e.currentTarget.style.backgroundColor = buttonHoverBg
              }
            }}
            onMouseLeave={(e) => {
              if (activeAction !== 'rephrase') {
                e.currentTarget.style.backgroundColor = 'transparent'
              }
            }}
          >
            Rephrase
          </button>
          <button
            onClick={() => {
              setActiveAction('lengthen')
              processText('lengthen')
            }}
            style={{
              padding: '5px 12px',
              backgroundColor: activeAction === 'lengthen' ? activeButtonBg : 'transparent',
              color: activeAction === 'lengthen' ? activeButtonColor : textColor,
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '12px',
              fontWeight: activeAction === 'lengthen' ? '500' : '400',
              transition: 'all 0.2s ease',
            }}
            onMouseEnter={(e) => {
              if (activeAction !== 'lengthen') {
                e.currentTarget.style.backgroundColor = buttonHoverBg
              }
            }}
            onMouseLeave={(e) => {
              if (activeAction !== 'lengthen') {
                e.currentTarget.style.backgroundColor = 'transparent'
              }
            }}
          >
            Lengthen
          </button>
          <button
            onClick={() => {
              setActiveAction('shorten')
              processText('shorten')
            }}
            style={{
              padding: '5px 12px',
              backgroundColor: activeAction === 'shorten' ? activeButtonBg : 'transparent',
              color: activeAction === 'shorten' ? activeButtonColor : textColor,
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '12px',
              fontWeight: activeAction === 'shorten' ? '500' : '400',
              transition: 'all 0.2s ease',
            }}
            onMouseEnter={(e) => {
              if (activeAction !== 'shorten') {
                e.currentTarget.style.backgroundColor = buttonHoverBg
              }
            }}
            onMouseLeave={(e) => {
              if (activeAction !== 'shorten') {
                e.currentTarget.style.backgroundColor = 'transparent'
              }
            }}
          >
            Shorten
          </button>
        </div>
        {/* Custom input below buttons */}
        <input
          ref={inputRef}
          type="text"
          value={customPrompt}
          onChange={(e) => {
            setCustomPrompt(e.target.value)
            setActiveAction('custom')
          }}
          onKeyDown={handleCustomInputKeyDown}
          onFocus={() => {
            if (onInputFocus) {
              onInputFocus(true)
            }
          }}
          onBlur={() => {
            if (onInputFocus) {
              onInputFocus(false)
            }
          }}
          placeholder="Enter your own..."
          disabled={isLoading}
          style={{
            width: '100%',
            padding: '5px 9px',
            backgroundColor: inputBg,
            border: `1px solid ${borderColor}`,
            borderRadius: '6px',
            fontSize: '12px',
            color: textColor,
            outline: 'none',
            fontFamily: 'system-ui, -apple-system, sans-serif',
            transition: 'border-color 0.2s ease',
          }}
        />
      </div>

      {/* Results */}
      <div style={{ 
        padding: '14px 12px 14px 18px',
        overflowY: 'auto',
        flex: 1,
        minHeight: 0,
      }}>
        {isLoading ? (
          <div
            style={{
              padding: '16px',
              textAlign: 'center',
              color: textColor,
              fontSize: '12px',
            }}
          >
            Generating...
          </div>
        ) : error ? (
          <div
            style={{
              padding: '12px 14px',
              backgroundColor: theme === 'dark' ? '#3a1f1f' : '#fce8e6',
              borderRadius: '6px',
              border: `1px solid ${theme === 'dark' ? '#5a2f2f' : '#f28b82'}`,
              color: theme === 'dark' ? '#ff6b6b' : '#c5221f',
              fontSize: '12px',
              lineHeight: '1.5',
            }}
          >
            <div style={{ fontWeight: '500', marginBottom: '4px', fontSize: '12px' }}>Error</div>
            <div>{error}</div>
          </div>
        ) : improvedText ? (
          <div>
            <div
              style={{
                marginBottom: '14px',
                fontSize: '13px',
                color: textColor,
                lineHeight: '1.7',
                whiteSpace: 'pre-wrap',
              }}
            >
              {improvedText}
            </div>
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button
                onClick={onClose}
                style={{
                  padding: '6px 14px',
                  backgroundColor: 'transparent',
                  color: textColor,
                  border: `1px solid ${borderColor}`,
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '12px',
                  fontWeight: '500',
                  transition: 'all 0.2s ease',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = buttonHoverBg
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'transparent'
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleReplace}
                style={{
                  padding: '6px 14px',
                  backgroundColor: accentBlue,
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '12px',
                  fontWeight: '500',
                  transition: 'all 0.2s ease',
                  boxShadow: theme === 'dark' 
                    ? '0 2px 4px rgba(95, 168, 217, 0.2)' 
                    : '0 2px 4px rgba(107, 184, 232, 0.2)',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = accentBlue
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = accentBlue
                }}
              >
                <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: '8px' }}>
                  <span>Accept</span>
                  <span style={{ fontSize: '10px', opacity: 0.7 }}>Ctrl+Enter</span>
                </span>
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}
