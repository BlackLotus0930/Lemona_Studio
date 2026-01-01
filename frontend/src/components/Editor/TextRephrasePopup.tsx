import { useState, useEffect, useRef, useCallback } from 'react'
import { useTheme } from '../../contexts/ThemeContext'
import { aiApi } from '../../services/api'

interface TextRephrasePopupProps {
  selectedText: string
  position: { x: number; y: number }
  onReplace: (newText: string) => void
  onClose: () => void
  onInputFocus?: (isFocused: boolean) => void
}

type ActionType = 'improve' | 'rephrase' | 'lengthen' | 'shorten' | 'custom'

export default function TextRephrasePopup({ selectedText, position, onReplace, onClose, onInputFocus }: TextRephrasePopupProps) {
  const { theme } = useTheme()
  const [isExpanded, setIsExpanded] = useState(false)
  const [activeAction, setActiveAction] = useState<ActionType>('improve')
  const [customPrompt, setCustomPrompt] = useState('')
  const [improvedText, setImprovedText] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
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
  const buttonHoverBg = theme === 'dark' ? '#2a2a2a' : '#f5f5f5'
  const activeButtonBg = theme === 'dark' ? '#2a2a2a' : '#e8f0fe'
  const activeButtonColor = theme === 'dark' ? '#4a9eff' : '#1a73e8'

  // Adjust position only once when popup first opens (compact state)
  useEffect(() => {
    if (!positionLockedRef.current) {
      const screenWidth = window.innerWidth
      const rightMargin = 25
      const popupWidth = 120 // compact button width
      const maxX = screenWidth - popupWidth - rightMargin
      
      const adjustedX = Math.min(position.x, maxX)
      
      setAdjustedPosition({
        x: adjustedX,
        y: position.y
      })
      
      // Lock position after first calculation
      positionLockedRef.current = true
    }
  }, [position])

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
      let instruction = ''
      switch (action) {
        case 'improve':
          instruction = 'Improve clarity and flow. Use the same language as the original text.'
          break
        case 'rephrase':
          instruction = 'Rephrase this text while keeping the same meaning. Use the same language as the original text.'
          break
        case 'lengthen':
          instruction = 'Make this text longer and more detailed while keeping the same meaning. Use the same language as the original text.'
          break
        case 'shorten':
          instruction = 'Make this text shorter and more concise while keeping the same meaning. Use the same language as the original text.'
          break
        case 'custom':
          instruction = prompt ? `${prompt} Use the same language as the original text.` : ''
          break
      }

      if (!instruction.trim()) return

      const result = await aiApi.rephraseText(selectedText, instruction)
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
  }, [selectedText])

  // Handle expand and improve
  const handleExpandAndImprove = useCallback(() => {
    setIsExpanded(true)
    setImprovedText(null)
    setError(null)
    setActiveAction('improve')
    processText('improve')
  }, [processText])

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey) {
        if (e.key === 'k' || e.key === 'K') {
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
      if (popupRef.current && !popupRef.current.contains(event.target as Node)) {
        onClose()
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [onClose])

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
          padding: '4px 8px',
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
            fontSize: '13px',
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
          <span>Improve</span>
          <span style={{ fontSize: '11px', opacity: 0.6 }}>Ctrl+K</span>
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
        borderRadius: '12px',
        boxShadow: theme === 'dark' 
          ? '0 8px 32px rgba(0, 0, 0, 0.4), 0 4px 16px rgba(0, 0, 0, 0.3)' 
          : '0 8px 32px rgba(0, 0, 0, 0.12), 0 4px 16px rgba(0, 0, 0, 0.08)',
        zIndex: 10000,
        width: '360px',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Action Buttons Row */}
      <div style={{
        padding: '10px 12px',
        borderBottom: `1px solid ${borderColor}`,
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
        backgroundColor: theme === 'dark' ? '#1a1a1a' : '#fafafa',
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
              padding: '6px 14px',
              backgroundColor: activeAction === 'improve' ? activeButtonBg : 'transparent',
              color: activeAction === 'improve' ? activeButtonColor : textColor,
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '13px',
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
              padding: '6px 14px',
              backgroundColor: activeAction === 'rephrase' ? activeButtonBg : 'transparent',
              color: activeAction === 'rephrase' ? activeButtonColor : textColor,
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '13px',
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
              padding: '6px 14px',
              backgroundColor: activeAction === 'lengthen' ? activeButtonBg : 'transparent',
              color: activeAction === 'lengthen' ? activeButtonColor : textColor,
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '13px',
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
              padding: '6px 14px',
              backgroundColor: activeAction === 'shorten' ? activeButtonBg : 'transparent',
              color: activeAction === 'shorten' ? activeButtonColor : textColor,
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '13px',
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
            padding: '6px 10px',
            backgroundColor: inputBg,
            border: `1px solid ${borderColor}`,
            borderRadius: '6px',
            fontSize: '13px',
            color: textColor,
            outline: 'none',
            fontFamily: 'system-ui, -apple-system, sans-serif',
            transition: 'border-color 0.2s ease',
          }}
        />
      </div>

      {/* Results */}
      <div style={{ padding: '14px 12px' }}>
        {isLoading ? (
          <div
            style={{
              padding: '16px',
              textAlign: 'center',
              color: textColor,
              fontSize: '13px',
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
              fontSize: '13px',
              lineHeight: '1.5',
            }}
          >
            <div style={{ fontWeight: '500', marginBottom: '4px' }}>⚠️ Error</div>
            <div>{error}</div>
          </div>
        ) : improvedText ? (
          <div>
            <div
              style={{
                padding: '14px',
                marginBottom: '14px',
                fontSize: '13px',
                color: textColor,
                lineHeight: '1.7',
                minHeight: '50px',
                whiteSpace: 'pre-wrap',
                backgroundColor: theme === 'dark' ? '#252525' : '#f8f9fa',
                borderRadius: '8px',
                border: `1px solid ${theme === 'dark' ? '#333' : '#e8eaed'}`,
              }}
            >
              {improvedText}
            </div>
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button
                onClick={() => {
                  setImprovedText(null)
                  setCustomPrompt('')
                }}
                style={{
                  padding: '7px 18px',
                  backgroundColor: 'transparent',
                  color: textColor,
                  border: `1px solid ${borderColor}`,
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '13px',
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
                  padding: '7px 18px',
                  backgroundColor: theme === 'dark' ? '#4a9eff' : '#1a73e8',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '13px',
                  fontWeight: '500',
                  transition: 'all 0.2s ease',
                  boxShadow: theme === 'dark' 
                    ? '0 2px 4px rgba(74, 158, 255, 0.2)' 
                    : '0 2px 4px rgba(26, 115, 232, 0.2)',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = theme === 'dark' ? '#5aafff' : '#1557b8'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = theme === 'dark' ? '#4a9eff' : '#1a73e8'
                }}
              >
                Accept
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}
