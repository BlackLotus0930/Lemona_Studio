import { useEffect, useState, useCallback } from 'react'
import { Editor } from '@tiptap/react'
import { aiApi } from '../../services/api'
import { AutocompleteSuggestion } from '@shared/types'

interface AutocompleteProps {
  editor: Editor | null
  documentContent?: string
  documentId?: string
  enabled?: boolean
}

export default function Autocomplete({ editor, documentContent, documentId, enabled = true }: AutocompleteProps) {
  const [suggestion, setSuggestion] = useState<AutocompleteSuggestion | null>(null)
  const [, setIsLoading] = useState(false)
  const [showSuggestion, setShowSuggestion] = useState(false)

  const fetchSuggestion = useCallback(async (text: string, cursorPosition: number) => {
    if (!enabled || !editor || text.length < 10) {
      setSuggestion(null)
      setShowSuggestion(false)
      return
    }

    setIsLoading(true)
    try {
      const response = await aiApi.autocomplete(text, cursorPosition, documentContent, documentId)
      if (response.data && response.data.text) {
        setSuggestion(response.data)
        setShowSuggestion(true)
      }
    } catch (error) {
      console.error('Autocomplete error:', error)
      setSuggestion(null)
      setShowSuggestion(false)
    } finally {
      setIsLoading(false)
    }
  }, [editor, documentContent, documentId, enabled])

  useEffect(() => {
    if (!editor) return

    let debounceTimer: NodeJS.Timeout | null = null

    const handleUpdate = () => {
      if (debounceTimer) {
        clearTimeout(debounceTimer)
      }

      const { from } = editor.state.selection
      const text = editor.state.doc.textContent
      
      const textBeforeCursor = text.slice(0, from)
      const lastChar = textBeforeCursor[textBeforeCursor.length - 1]
      
      if (lastChar === '.' || lastChar === '!' || lastChar === '?' || 
          (textBeforeCursor.length > 20 && textBeforeCursor.length % 50 === 0)) {
        
        debounceTimer = setTimeout(() => {
          fetchSuggestion(text, from)
        }, 1000)
      } else {
        setShowSuggestion(false)
        setSuggestion(null)
      }
    }

    editor.on('update', handleUpdate)
    editor.on('selectionUpdate', handleUpdate)

    return () => {
      if (debounceTimer) {
        clearTimeout(debounceTimer)
      }
      editor.off('update', handleUpdate)
      editor.off('selectionUpdate', handleUpdate)
    }
  }, [editor, fetchSuggestion])

  const acceptSuggestion = useCallback(() => {
    if (!editor || !suggestion) return

    editor.chain()
      .focus()
      .insertContent(suggestion.text)
      .run()

    setSuggestion(null)
    setShowSuggestion(false)
  }, [editor, suggestion])

  const rejectSuggestion = useCallback(() => {
    setSuggestion(null)
    setShowSuggestion(false)
  }, [])

  if (!showSuggestion || !suggestion) {
    return null
  }

  return (
    <div
      style={{
        position: 'absolute',
        bottom: '100%',
        left: '0',
        marginBottom: '8px',
        padding: '12px',
        backgroundColor: '#ffffff',
        border: '1px solid #dadce0',
        borderRadius: '6px',
        boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
        zIndex: 1000,
        maxWidth: '400px',
        fontSize: '13px'
      }}
    >
      <div style={{ marginBottom: '8px', color: '#5f6368', fontSize: '12px' }}>
        Suggestion:
      </div>
      <div style={{ 
        marginBottom: '12px', 
        color: '#202124',
        lineHeight: '1.5',
        padding: '8px',
        backgroundColor: '#f8f9fa',
        borderRadius: '4px',
        fontSize: '13px'
      }}>
        {suggestion.text}
      </div>
      <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
        <button
          onClick={rejectSuggestion}
          style={{
            padding: '6px 12px',
            border: '1px solid #dadce0',
            borderRadius: '4px',
            backgroundColor: 'transparent',
            color: '#202124',
            cursor: 'pointer',
            fontSize: '12px',
            transition: 'background-color 0.15s'
          }}
          onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f1f3f4'}
          onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
        >
          Dismiss
        </button>
        <button
          onClick={acceptSuggestion}
          style={{
            padding: '6px 12px',
            border: 'none',
            borderRadius: '4px',
            backgroundColor: '#1a73e8',
            color: 'white',
            cursor: 'pointer',
            fontSize: '12px',
            transition: 'background-color 0.15s'
          }}
          onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#1967d2'}
          onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#1a73e8'}
        >
          Accept
        </button>
      </div>
    </div>
  )
}
