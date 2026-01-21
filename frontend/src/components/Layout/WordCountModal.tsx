import { useEffect, useRef } from 'react'
import { useTheme } from '../../contexts/ThemeContext'
import { Editor } from '@tiptap/react'
import { Document } from '@shared/types'
import { useEditorContext } from '../../contexts/EditorContext'

interface WordCountModalProps {
  editor?: Editor | null // Optional prop for backward compatibility, will use EditorContext if not provided
  documents: Document[]
  currentDocument: Document | null
  isOpen: boolean
  onClose: () => void
}

interface WordCountStats {
  pages: number
  words: number
  characters: number
  charactersNoSpaces: number
}

// Extract text from TipTap JSON content
function extractTextFromTipTap(node: any): string {
  if (typeof node === 'string') {
    return node
  }
  
  if (node.type === 'text') {
    return node.text || ''
  }
  
  if (node.content && Array.isArray(node.content)) {
    return node.content.map(extractTextFromTipTap).join('')
  }
  
  return ''
}

// Calculate word count from text string
function calculateWordCountFromText(text: string): Omit<WordCountStats, 'pages'> {
  // Calculate words with Chinese character support
  // Each Chinese character counts as one word
  // English/other text is split by whitespace
  let wordCount = 0
  if (text.trim()) {
    // Regex to match Chinese characters (CJK Unified Ideographs)
    const chineseCharRegex = /[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff]/
    
    // Split text into segments (Chinese chars and non-Chinese text)
    let currentSegment = ''
    let inChinese = false
    
    for (let i = 0; i < text.length; i++) {
      const char = text[i]
      const isChinese = chineseCharRegex.test(char)
      
      if (isChinese) {
        // If we encounter a Chinese character
        // First, process any accumulated non-Chinese segment
        if (currentSegment.trim() && !inChinese) {
          const words = currentSegment.trim().split(/\s+/).filter(w => w.length > 0)
          wordCount += words.length
          currentSegment = ''
        }
        // Count each Chinese character as one word
        wordCount++
        inChinese = true
      } else {
        // Non-Chinese character
        if (inChinese) {
          // Transition from Chinese to non-Chinese
          inChinese = false
          currentSegment = char
        } else {
          // Continue accumulating non-Chinese segment
          currentSegment += char
        }
      }
    }
    
    // Process any remaining non-Chinese segment
    if (currentSegment.trim()) {
      const words = currentSegment.trim().split(/\s+/).filter(w => w.length > 0)
      wordCount += words.length
    }
  }
  
  // Calculate characters
  const characters = text.length
  
  // Calculate characters excluding spaces
  const charactersNoSpaces = text.replace(/\s/g, '').length
  
  return {
    words: wordCount,
    characters: characters,
    charactersNoSpaces: charactersNoSpaces,
  }
}

// Calculate word count statistics from editor
function calculateWordCountFromEditor(editor: Editor | null): WordCountStats {
  if (!editor) {
    return {
      pages: 0,
      words: 0,
      characters: 0,
      charactersNoSpaces: 0,
    }
  }

  // Get text content from editor
  const text = editor.state.doc.textContent
  const stats = calculateWordCountFromText(text)
  
  // Estimate pages (assuming ~500 words per page, similar to Google Docs)
  const estimatedPages = stats.words > 0 ? Math.max(1, Math.ceil(stats.words / 500)) : 0
  
  return {
    ...stats,
    pages: estimatedPages,
  }
}

// Calculate word count from document content (TipTap JSON)
function calculateWordCountFromDocument(doc: Document): Omit<WordCountStats, 'pages'> {
  if (!doc.content) {
    return {
      words: 0,
      characters: 0,
      charactersNoSpaces: 0,
    }
  }

  try {
    const content = typeof doc.content === 'string' ? JSON.parse(doc.content) : doc.content
    const text = extractTextFromTipTap(content)
    return calculateWordCountFromText(text)
  } catch (error) {
    // If parsing fails, try to use content as plain text
    const text = typeof doc.content === 'string' ? doc.content : ''
    return calculateWordCountFromText(text)
  }
}

// Calculate workspace word count (all workspace documents)
function calculateWorkspaceWordCount(documents: Document[] | undefined): WordCountStats {
  // Ensure documents is an array
  if (!documents || !Array.isArray(documents)) {
    return {
      pages: 0,
      words: 0,
      characters: 0,
      charactersNoSpaces: 0,
    }
  }

  // Filter workspace documents (exclude library)
  const workspaceDocs = documents.filter(
    doc => (!doc.folder || doc.folder === 'project') && 
           !doc.title.toLowerCase().endsWith('.pdf') // Exclude PDFs
  )

  let totalWords = 0
  let totalCharacters = 0
  let totalCharactersNoSpaces = 0

  workspaceDocs.forEach(doc => {
    const stats = calculateWordCountFromDocument(doc)
    totalWords += stats.words
    totalCharacters += stats.characters
    totalCharactersNoSpaces += stats.charactersNoSpaces
  })

  // Estimate pages for workspace
  const estimatedPages = totalWords > 0 ? Math.max(1, Math.ceil(totalWords / 500)) : 0

  return {
    pages: estimatedPages,
    words: totalWords,
    characters: totalCharacters,
    charactersNoSpaces: totalCharactersNoSpaces,
  }
}

export default function WordCountModal({ 
  editor: editorProp, 
  documents, 
  currentDocument, 
  isOpen, 
  onClose 
}: WordCountModalProps) {
  const { theme } = useTheme()
  // Use currentEditor from context, fallback to editorProp for backward compatibility
  const { currentEditor } = useEditorContext()
  const editor = currentEditor || editorProp || null
  const modalRef = useRef<HTMLDivElement>(null)

  const currentFileStats = calculateWordCountFromEditor(editor)
  const workspaceStats = calculateWorkspaceWordCount(documents)

  // Handle Escape key to close
  useEffect(() => {
    if (!isOpen) return

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
      }
    }

    document.addEventListener('keydown', handleEscape)
    return () => {
      document.removeEventListener('keydown', handleEscape)
    }
  }, [isOpen, onClose])

  // Focus modal when opened
  useEffect(() => {
    if (isOpen && modalRef.current) {
      setTimeout(() => {
        modalRef.current?.focus()
      }, 100)
    }
  }, [isOpen])

  if (!isOpen) return null

  const dropdownBorder = theme === 'dark' ? '#212121' : '#dadce0'
  const dropdownTextColor = theme === 'dark' ? '#D6D6DD' : '#202124'
  const dropdownBg = theme === 'dark' ? '#181818' : '#ffffff'
  const sectionBg = theme === 'dark' ? '#1f1f1f' : '#f8f9fa'
  const labelColor = theme === 'dark' ? '#858585' : '#5f6368'

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: theme === 'dark' 
          ? 'rgba(0, 0, 0, 0.5)' 
          : 'rgba(0, 0, 0, 0.35)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 10020,
        animation: 'modalBackdropFadeIn 0.2s ease-out',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose()
        }
      }}
    >
      <style>{`
        @keyframes modalBackdropFadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes modalSlideIn {
          from { 
            opacity: 0;
            transform: scale(0.95) translateY(-10px);
          }
          to { 
            opacity: 1;
            transform: scale(1) translateY(0);
          }
        }
        /* Remove focus outlines globally for this modal */
        [tabindex="-1"]:focus {
          outline: none !important;
        }
        button:focus {
          outline: none !important;
        }
        button:focus-visible {
          outline: none !important;
        }
      `}</style>
      <div
        ref={modalRef}
        tabIndex={-1}
        style={{
          backgroundColor: dropdownBg,
          borderRadius: '6px',
          border: `1px solid ${dropdownBorder}`,
          boxShadow: theme === 'dark' 
            ? '0 12px 40px rgba(0,0,0,0.8)' 
            : '0 12px 40px rgba(0,0,0,0.25)',
          width: '420px',
          maxWidth: '90vw',
          maxHeight: '80vh',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
          animation: 'modalSlideIn 0.2s ease-out',
          outline: 'none',
        }}
        onFocus={(e) => {
          // Remove focus outline
          e.currentTarget.style.outline = 'none'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{
          padding: '16px 20px',
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
            Word Count
          </h3>
        </div>

        {/* Content */}
        <div style={{
          paddingTop: '20px',
          paddingRight: '20px',
          paddingBottom: '12px',
          paddingLeft: '20px',
          display: 'flex',
          flexDirection: 'column',
          gap: '20px',
          overflowY: 'auto',
          flex: 1
        }}>
          {/* Current File Section */}
          {currentDocument && !currentDocument.title.toLowerCase().endsWith('.pdf') && (
            <div style={{
              backgroundColor: sectionBg,
              borderRadius: '6px',
              padding: '16px',
              border: `1px solid ${dropdownBorder}`
            }}>
              <div style={{
                fontSize: '13px',
                fontWeight: 600,
                color: theme === 'dark' ? '#B5B5B5' : '#3c4043',
                marginBottom: '12px',
                textTransform: 'uppercase',
                letterSpacing: '0.5px'
              }}>
                Current File
              </div>
              <div style={{
                fontSize: '11px',
                color: labelColor,
                marginBottom: '16px',
                opacity: 0.8
              }}>
                {currentDocument.title}
              </div>
              <div style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '10px'
              }}>
                <StatRow label="Pages" value={currentFileStats.pages} />
                <StatRow label="Words" value={currentFileStats.words} />
                <StatRow label="Characters" value={currentFileStats.characters} />
                <StatRow label="Characters excluding spaces" value={currentFileStats.charactersNoSpaces} />
              </div>
            </div>
          )}

          {/* Workspace Section */}
          <div style={{
            backgroundColor: sectionBg,
            borderRadius: '6px',
            padding: '16px',
            border: `1px solid ${dropdownBorder}`
          }}>
            <div style={{
              fontSize: '13px',
              fontWeight: 600,
              color: theme === 'dark' ? '#B5B5B5' : '#3c4043',
              marginBottom: '12px',
              textTransform: 'uppercase',
              letterSpacing: '0.5px'
            }}>
              Workspace
            </div>
            <div style={{
              fontSize: '11px',
              color: labelColor,
              marginBottom: '16px',
              opacity: 0.8
            }}>
              All files in workspace
            </div>
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '10px'
            }}>
              <StatRow label="Pages" value={workspaceStats.pages} />
              <StatRow label="Words" value={workspaceStats.words} />
              <StatRow label="Characters" value={workspaceStats.characters} />
              <StatRow label="Characters excluding spaces" value={workspaceStats.charactersNoSpaces} />
            </div>
          </div>
        </div>

        {/* Footer */}
        <div style={{
          padding: '12px 20px',
          display: 'flex',
          justifyContent: 'flex-end',
          gap: '8px'
        }}>
          <button
            onClick={onClose}
            style={{
              padding: '8px 16px',
              borderRadius: '6px',
              border: 'none',
              backgroundColor: 'transparent',
              color: theme === 'dark' ? '#6ba8c7' : '#5a9ec7',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: 500,
              fontFamily: 'inherit',
              transition: 'background-color 0.15s',
              outline: 'none',
            }}
            onFocus={(e) => {
              e.currentTarget.style.outline = 'none'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = theme === 'dark' ? 'rgba(107, 168, 199, 0.1)' : 'rgba(90, 158, 199, 0.1)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent'
            }}
          >
            OK
          </button>
        </div>
      </div>
    </div>
  )
}

// Stat Row Component
function StatRow({ label, value }: { label: string; value: number }) {
  const { theme } = useTheme()
  const dropdownTextColor = theme === 'dark' ? '#D6D6DD' : '#202124'
  const labelColor = theme === 'dark' ? '#858585' : '#5f6368'

  return (
    <div style={{
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: '6px 0',
    }}>
      <span style={{ 
        color: labelColor, 
        fontSize: '13px',
        fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
      }}>
        {label}
      </span>
      <span style={{ 
        color: dropdownTextColor, 
        fontSize: '13px', 
        fontWeight: 500,
        fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
      }}>
        {value.toLocaleString()}
      </span>
    </div>
  )
}
