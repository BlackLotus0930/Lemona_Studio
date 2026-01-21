import React, { useEffect, useRef } from 'react'
import { useTheme } from '../../contexts/ThemeContext'

interface KeyboardShortcutsModalProps {
  isOpen: boolean
  onClose: () => void
  triggerRef?: React.RefObject<HTMLElement>
}

interface Shortcut {
  category: string
  shortcuts: {
    action: string
    keys: string[]
  }[]
}

export default function KeyboardShortcutsModal({ 
  isOpen, 
  onClose,
  triggerRef
}: KeyboardShortcutsModalProps) {
  const { theme } = useTheme()
  const modalRef = useRef<HTMLDivElement>(null)

  // Close modal when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node
      
      // Check if click is inside the modal
      const isInsideModal = modalRef.current?.contains(target)
      
      // Check if click is on the trigger button
      const isOnTrigger = triggerRef?.current?.contains(target)
      
      // Close if click is outside modal and not on trigger button
      if (!isInsideModal && !isOnTrigger) {
        onClose()
      }
    }

    if (isOpen) {
      // Use a small delay to avoid closing immediately when opening
      const timeoutId = setTimeout(() => {
        document.addEventListener('mousedown', handleClickOutside)
      }, 100)
      
      return () => {
        clearTimeout(timeoutId)
        document.removeEventListener('mousedown', handleClickOutside)
      }
    }
  }, [isOpen, triggerRef, onClose])

  // Close modal on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose()
      }
    }

    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown)
      return () => window.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen, onClose])

  const shortcuts: Shortcut[] = [
    {
      category: 'Navigation',
      shortcuts: [
        { action: 'Toggle File Explorer', keys: ['Ctrl', 'Shift', 'E'] },
        { action: 'Close current tab', keys: ['Ctrl', 'W'] },
        { action: 'Go to Home', keys: ['Ctrl', 'H'] },
      ]
    },
    {
      category: 'Search',
      shortcuts: [
        { action: 'Toggle inline search', keys: ['Ctrl', 'F'] },
        { action: 'Toggle global search', keys: ['Ctrl', 'Shift', 'F'] },
      ]
    },
    {
      category: 'Editor',
      shortcuts: [
        { action: 'Bold', keys: ['Ctrl', 'B'] },
        { action: 'Italic', keys: ['Ctrl', 'I'] },
        { action: 'Underline', keys: ['Ctrl', 'U'] },
        { action: 'Undo', keys: ['Ctrl', 'Z'] },
        { action: 'Redo', keys: ['Ctrl', 'Y'] },
        { action: 'Insert link', keys: ['Ctrl', 'K'] },
      ]
    },
    {
      category: 'Text Selection',
      shortcuts: [
        { action: 'Improve', keys: ['Ctrl', 'K'] },
      ]
    },
    {
      category: 'Document',
      shortcuts: [
        { action: 'Show word count', keys: ['Ctrl', 'Shift', 'C'] },
        { action: 'Export as PDF', keys: ['Ctrl', 'E'] },
      ]
    },
    {
      category: 'PDF Viewer',
      shortcuts: [
        { action: 'Next page', keys: ['Arrow Right'] },
        { action: 'Previous page', keys: ['Arrow Left'] },
        { action: 'Toggle search', keys: ['Ctrl', 'F'] },
      ]
    },
    {
      category: 'Zoom',
      shortcuts: [
        { action: 'Zoom in', keys: ['Ctrl', '+'] },
        { action: 'Zoom out', keys: ['Ctrl', '-'] },
        { action: 'Reset zoom', keys: ['Ctrl', '0'] },
      ]
    },
    {
      category: 'WorldLab',
      shortcuts: [
        { action: 'Undo', keys: ['Ctrl', 'Z'] },
        { action: 'Redo', keys: ['Ctrl', 'Shift', 'Z'] },
        { action: 'Redo', keys: ['Ctrl', 'Y'] },
        { action: 'Copy selected nodes and edges', keys: ['Ctrl', 'C'] },
        { action: 'Paste copied nodes and edges', keys: ['Ctrl', 'V'] },
        { action: 'Draw non-directional edge', keys: ['Left Mouse', '+', 'Drag'] },
        { action: 'Draw directional edge', keys: ['Right Mouse', '+', 'Drag'] },
      ]
    }
  ]

  const dropdownBorder = '#212121'
  const dropdownTextColor = theme === 'dark' ? '#D6D6DD' : '#202124'

  if (!isOpen) return null

  const rect = triggerRef?.current?.getBoundingClientRect()
  const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0

  const formatKey = (key: string): string => {
    // Don't format mouse buttons or special text
    if (key === 'Left Mouse' || key === 'Right Mouse' || key === 'Drag' || key === '+') {
      return key
    }
    if (isMac) {
      if (key === 'Ctrl') return '⌘'
      if (key === 'Shift') return '⇧'
      if (key === 'Alt') return '⌥'
      if (key === 'Arrow Right') return '→'
      if (key === 'Arrow Left') return '←'
      if (key === 'Arrow Up') return '↑'
      if (key === 'Arrow Down') return '↓'
    }
    return key
  }

  return (
    <>
      {/* Backdrop overlay - covers entire screen to catch all clicks */}
      <div
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 10009,
          backgroundColor: 'transparent',
        }}
        onClick={onClose}
      />
      <div 
        ref={modalRef}
        style={{
          position: 'fixed',
          top: rect ? `${rect.bottom + 4}px` : '100%',
          left: '24px',
          backgroundColor: theme === 'dark' ? '#181818' : '#ffffff',
          border: `1px solid ${dropdownBorder}`,
          borderRadius: '6px',
          boxShadow: theme === 'dark' ? '0 12px 40px rgba(0,0,0,0.8)' : '0 12px 40px rgba(0,0,0,0.25)',
          zIndex: 10010,
          width: '500px',
          maxHeight: '600px',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden'
        }}
      >
      {/* Header */}
      <div style={{
        padding: '16px 20px',
        borderBottom: `1px solid ${dropdownBorder}`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between'
      }}>
        <h3 style={{
          margin: 0,
          fontSize: '15px',
          fontWeight: 600,
          color: dropdownTextColor,
          fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
        }}>
          Keyboard Shortcuts
        </h3>
      </div>

      {/* Content */}
      <div style={{
        padding: '20px',
        display: 'flex',
        flexDirection: 'column',
        gap: '24px',
        overflowY: 'auto',
        maxHeight: 'calc(600px - 80px)'
      }}>
        {shortcuts.map((category, categoryIndex) => (
          <div key={categoryIndex}>
            <h4 style={{
              margin: '0 0 12px 0',
              fontSize: '13px',
              fontWeight: 600,
              color: theme === 'dark' ? '#858585' : '#5f6368',
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
              fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
            }}>
              {category.category}
            </h4>
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '8px'
            }}>
              {category.shortcuts.map((shortcut, shortcutIndex) => (
                <div
                  key={shortcutIndex}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '8px 0',
                    borderBottom: shortcutIndex === category.shortcuts.length - 1 
                      ? 'none' 
                      : `1px solid ${theme === 'dark' ? '#252525' : '#e8eaed'}`,
                  }}
                >
                  <span style={{
                    fontSize: '14px',
                    color: dropdownTextColor,
                    fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
                  }}>
                    {shortcut.action}
                  </span>
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px'
                  }}>
                    {shortcut.keys.map((key, keyIndex) => {
                      // Skip rendering "+" as a key badge, treat it as separator only
                      if (key === '+') {
                        return (
                          <span key={keyIndex} style={{
                            color: theme === 'dark' ? '#555' : '#999',
                            fontSize: '12px',
                            margin: '0 2px'
                          }}>
                            +
                          </span>
                        )
                      }
                      return (
                        <React.Fragment key={keyIndex}>
                          <kbd style={{
                            padding: '4px 8px',
                            fontSize: '12px',
                            fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', monospace",
                            backgroundColor: theme === 'dark' ? '#252525' : '#f1f3f4',
                            color: dropdownTextColor,
                            border: `1px solid ${theme === 'dark' ? '#3a3a3a' : '#dadce0'}`,
                            borderRadius: '6px',
                            fontWeight: 500,
                            minWidth: '24px',
                            textAlign: 'center',
                            display: 'inline-block',
                            boxShadow: theme === 'dark' 
                              ? '0 1px 2px rgba(0,0,0,0.3)' 
                              : '0 1px 2px rgba(0,0,0,0.1)'
                          }}>
                            {formatKey(key)}
                          </kbd>
                          {keyIndex < shortcut.keys.length - 1 && shortcut.keys[keyIndex + 1] !== '+' && (
                            <span style={{
                              color: theme === 'dark' ? '#555' : '#999',
                              fontSize: '12px',
                              margin: '0 2px'
                            }}>
                              +
                            </span>
                          )}
                        </React.Fragment>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
    </>
  )
}

