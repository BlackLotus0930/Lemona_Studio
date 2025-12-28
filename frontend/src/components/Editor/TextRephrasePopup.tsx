import { useState, useEffect, useRef, useCallback } from 'react'
import { useTheme } from '../../contexts/ThemeContext'
import { aiApi } from '../../services/api'
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward'

interface TextRephrasePopupProps {
  selectedText: string
  position: { x: number; y: number }
  onReplace: (newText: string) => void
  onClose: () => void
  onAddToChat?: (text: string) => void
}

type Mode = 'buttons' | 'quick-edit'

export default function TextRephrasePopup({ selectedText, position, onReplace, onClose, onAddToChat }: TextRephrasePopupProps) {
  const { theme } = useTheme()
  const [mode, setMode] = useState<Mode>('buttons')
  const [customPrompt, setCustomPrompt] = useState('')
  const [rephrasedText, setRephrasedText] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const popupRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const bgColor = theme === 'dark' ? '#1e1e1e' : '#ffffff'
  const textColor = theme === 'dark' ? '#D6D6DD' : '#202124'
  const borderColor = theme === 'dark' ? '#313131' : '#dadce0'
  const inputBg = theme === 'dark' ? '#1d1d1d' : '#ffffff'
  const [isInputFocused, setIsInputFocused] = useState(false)

  const handleAddToChat = useCallback(() => {
    if (onAddToChat) {
      onAddToChat(selectedText)
    }
    onClose()
  }, [onAddToChat, selectedText, onClose])

  const handleReplace = useCallback(() => {
    if (rephrasedText) {
      onReplace(rephrasedText)
      onClose()
    }
  }, [rephrasedText, onReplace, onClose])

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey) {
        if (e.key === 'l' || e.key === 'L') {
          e.preventDefault()
          handleAddToChat()
        } else if (e.key === 'k' || e.key === 'K') {
          e.preventDefault()
          setMode('quick-edit')
          setTimeout(() => inputRef.current?.focus(), 10)
        } else if ((e.key === 'Enter' || e.key === 'Return') && rephrasedText) {
          e.preventDefault()
          handleReplace()
        }
      }
      if (e.key === 'Escape') {
        if (mode === 'quick-edit' && !rephrasedText) {
          setMode('buttons')
        } else {
          onClose()
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [mode, rephrasedText, handleAddToChat, handleReplace, onClose])

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

  // Focus input when switching to quick-edit mode
  useEffect(() => {
    if (mode === 'quick-edit' && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 10)
    }
  }, [mode])

  const handleQuickEdit = async () => {
    if (!customPrompt.trim()) return

    setIsLoading(true)
    setError(null)
    setRephrasedText(null)

    try {
      const result = await aiApi.rephraseText(selectedText, customPrompt)
      let rephrased = typeof result === 'string' ? result : (result.data || result)
      
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
        rephrased = rephrased.replace(pattern, '').trim()
      }
      
      setRephrasedText(rephrased)
    } catch (err) {
      console.error('Rephrase error:', err)
      setError(err instanceof Error ? err.message : 'Failed to rephrase text')
    } finally {
      setIsLoading(false)
    }
  }

  // Initial mode: show small buttons
  if (mode === 'buttons') {
    return (
      <div
        ref={popupRef}
        style={{
          position: 'fixed',
          left: `${position.x}px`,
          top: `${position.y}px`,
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
          onClick={handleAddToChat}
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
          <span>Add to Chat</span>
          <span style={{ fontSize: '11px', opacity: 0.6 }}>Ctrl+L</span>
        </button>
        <button
          onClick={() => {
            setMode('quick-edit')
            setTimeout(() => inputRef.current?.focus(), 10)
          }}
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
          <span>Quick Edit</span>
          <span style={{ fontSize: '11px', opacity: 0.6 }}>Ctrl+K</span>
        </button>
      </div>
    )
  }

  // Quick Edit mode: show input box and results
  return (
    <div
      ref={popupRef}
      style={{
        position: 'fixed',
        left: `${position.x}px`,
        top: `${position.y}px`,
        backgroundColor: bgColor,
        border: `1px solid ${borderColor}`,
        borderRadius: '8px',
        boxShadow: '0 4px 16px rgba(0, 0, 0, 0.2), 0 2px 8px rgba(0, 0, 0, 0.15)',
        zIndex: 10000,
        minWidth: '320px',
        maxWidth: '480px',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        display: 'flex',
        flexDirection: 'column',
      }}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Input Container - Same as ChatInterface */}
      <div style={{ 
        padding: rephrasedText ? '8px' : '10px',
        backgroundColor: bgColor
      }}>
        {/* Unified Container - Text input and button on same line */}
        <div style={{
          padding: '4px 6px',
          backgroundColor: inputBg,
          borderRadius: '6px',
          border: `1px solid ${isInputFocused ? (theme === 'dark' ? '#3e3e42' : '#bdc1c6') : borderColor}`,
          display: 'flex',
          flexDirection: 'row',
          alignItems: 'center',
          gap: '6px',
          transition: 'border-color 0.2s'
        }}>
          {/* Text Input Section */}
          <textarea
            ref={inputRef}
            value={customPrompt}
            onChange={(e) => setCustomPrompt(e.target.value)}
            onFocus={() => setIsInputFocused(true)}
            onBlur={() => setIsInputFocused(false)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && !isLoading && customPrompt.trim()) {
                e.preventDefault()
                handleQuickEdit()
              } else if (e.key === 'Escape') {
                if (rephrasedText) {
                  setRephrasedText(null)
                  setCustomPrompt('')
                } else {
                  setMode('buttons')
                }
              }
            }}
            placeholder="Type your prompt..."
            disabled={isLoading}
            rows={1}
            style={{
              flex: 1,
              padding: '2px 2px',
              border: 'none',
              backgroundColor: 'transparent',
              fontSize: '12px',
              outline: 'none',
              color: textColor,
              resize: 'none',
              overflowY: 'hidden',
              overflowX: 'hidden',
              fontFamily: '"Noto Sans SC", "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
              lineHeight: '1.6',
              minHeight: '24px',
              maxHeight: '200px'
            }}
            onInput={(e) => {
              const target = e.target as HTMLTextAreaElement
              target.style.height = 'auto'
              const scrollHeight = target.scrollHeight
              const newHeight = Math.min(scrollHeight, 200)
              target.style.height = `${newHeight}px`
              // Only show scrollbar when content exceeds maxHeight
              if (scrollHeight > 200) {
                target.style.overflowY = 'auto'
              } else {
                target.style.overflowY = 'hidden'
              }
            }}
          />
      
          {/* Send button - round with light circle and black arrow */}
          <button
            onClick={() => {
              if (!isLoading && customPrompt.trim()) {
                handleQuickEdit()
              }
            }}
            disabled={isLoading || !customPrompt.trim()}
            style={{
              width: '20px',
              height: '20px',
              padding: 0,
              backgroundColor: isLoading || !customPrompt.trim() 
                ? (theme === 'dark' ? '#2a2a2a' : '#e0e0e0')
                : (theme === 'dark' ? '#AEAEAE' : '#9e9e9e'),
              border: 'none',
              borderRadius: '50%',
              cursor: isLoading || !customPrompt.trim() ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              transition: 'all 0.15s',
            }}
            onMouseEnter={(e) => {
              if (!isLoading && customPrompt.trim()) {
                e.currentTarget.style.backgroundColor = theme === 'dark' ? '#C0C0C0' : '#808080'
              } else if (!isLoading) {
                e.currentTarget.style.backgroundColor = theme === 'dark' ? '#353535' : '#d0d0d0'
              }
            }}
            onMouseLeave={(e) => {
              if (!isLoading && customPrompt.trim()) {
                e.currentTarget.style.backgroundColor = theme === 'dark' ? '#AEAEAE' : '#9e9e9e'
              } else if (!isLoading) {
                e.currentTarget.style.backgroundColor = theme === 'dark' ? '#2a2a2a' : '#e0e0e0'
              }
            }}
            title="Send"
          >
            <ArrowUpwardIcon style={{ 
              fontSize: '12px',
              color: isLoading || !customPrompt.trim() 
                ? (theme === 'dark' ? '#1D1D1D' : '#9e9e9e')
                : (theme === 'dark' ? inputBg : '#ffffff')
            }} />
          </button>
        </div>
      </div>

      {/* Results */}
      <div style={{ padding: '0 10px 10px 10px' }}>
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
              padding: '10px',
              backgroundColor: theme === 'dark' ? '#3a1f1f' : '#fce8e6',
              borderRadius: '6px',
              color: theme === 'dark' ? '#ff6b6b' : '#c5221f',
              fontSize: '13px',
            }}
          >
            {error}
          </div>
        ) : rephrasedText ? (
          <div>
            <div
              style={{
                padding: '10px 0',
                marginBottom: '10px',
                fontSize: '14px',
                color: textColor,
                lineHeight: '1.6',
                minHeight: '50px',
                whiteSpace: 'pre-wrap',
              }}
            >
              {rephrasedText}
            </div>
            <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
              <button
                onClick={() => {
                  setRephrasedText(null)
                  setCustomPrompt('')
                }}
                style={{
                  padding: '4px 10px',
                  backgroundColor: 'transparent',
                  color: textColor,
                  border: `1px solid ${borderColor}`,
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '12px',
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleReplace}
                style={{
                  padding: '4px 10px',
                  backgroundColor: theme === 'dark' ? '#4a9eff' : '#1a73e8',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '12px',
                  fontWeight: '500',
                }}
              >
                Apply
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}
