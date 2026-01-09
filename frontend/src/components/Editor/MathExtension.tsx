import { Node, mergeAttributes } from '@tiptap/core'
import { ReactNodeViewRenderer, NodeViewWrapper, ReactNodeViewProps } from '@tiptap/react'
import React, { useState, useEffect, useRef } from 'react'
import katex from 'katex'
import 'katex/dist/katex.min.css'

const MathComponent = ({ node, updateAttributes, selected, editor }: ReactNodeViewProps) => {
  const [isEditing, setIsEditing] = useState(false)
  const [formulaState, setFormulaState] = useState((node.attrs.formula as string) || '')
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const display = (node.attrs.display as boolean) ?? false

  useEffect(() => {
    const newFormula = (node.attrs.formula as string) || ''
    setFormulaState(newFormula)
  }, [node.attrs.formula])

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [isEditing])

  const handleDoubleClick = () => {
    setIsEditing(true)
    setError(null)
  }

  const handleBlur = () => {
    if (formulaState.trim()) {
      try {
        // Validate the formula by trying to render it
        katex.renderToString(formulaState, { throwOnError: true, displayMode: display })
        updateAttributes({ formula: formulaState.trim() })
        setError(null)
      } catch (err) {
        setError('Invalid LaTeX formula')
        // Still update to show the error state
        updateAttributes({ formula: formulaState.trim() })
      }
    } else {
      // If empty, remove the math node
      editor.chain().focus().deleteSelection().run()
    }
    setIsEditing(false)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleBlur()
    } else if (e.key === 'Escape') {
      const currentFormula = (node.attrs.formula as string) || ''
      setFormulaState(currentFormula)
      setIsEditing(false)
      setError(null)
    }
  }

  const renderFormula = () => {
    const currentFormula = (node.attrs.formula as string) || ''
    if (!currentFormula.trim()) {
      return <span style={{ color: '#999', fontStyle: 'italic' }}>Double-click to edit formula</span>
    }

    try {
      const html = katex.renderToString(currentFormula, {
        throwOnError: false,
        displayMode: display,
        errorColor: '#cc0000',
      })
      return <span dangerouslySetInnerHTML={{ __html: html }} />
    } catch (err) {
      return <span style={{ color: '#cc0000' }}>Invalid formula: {currentFormula}</span>
    }
  }

  return (
    <NodeViewWrapper
      ref={containerRef}
      className={`math-node ${display ? 'math-display' : 'math-inline'} ${selected ? 'selected' : ''} ${error ? 'error' : ''}`}
      style={{
        display: display ? 'block' : 'inline-block',
        margin: display ? '16px 0' : '0 2px',
        padding: isEditing ? '4px 8px' : '2px 4px',
        backgroundColor: isEditing ? '#f5f5f5' : 'transparent',
        border: selected ? '2px solid #1a73e8' : '1px solid transparent',
        borderRadius: '6px',
        cursor: 'pointer',
        minWidth: display ? '100%' : 'auto',
        textAlign: display ? 'center' : 'left',
      }}
      onDoubleClick={handleDoubleClick}
    >
      {isEditing ? (
        <input
          ref={inputRef}
          type="text"
          value={formulaState}
          onChange={(e) => setFormulaState(e.target.value)}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          placeholder="Enter LaTeX formula (e.g., E=mc^2)"
          style={{
            width: '100%',
            border: 'none',
            outline: 'none',
            background: 'transparent',
            fontFamily: 'monospace',
            fontSize: '14px',
          }}
        />
      ) : (
        renderFormula()
      )}
      {error && (
        <div style={{ fontSize: '12px', color: '#cc0000', marginTop: '4px' }}>
          {error}
        </div>
      )}
    </NodeViewWrapper>
  )
}

export const MathExtension = Node.create({
  name: 'math',

  addOptions() {
    return {
      HTMLAttributes: {},
    }
  },

  group: 'inline',

  inline: true,

  atom: true,

  addAttributes() {
    return {
      formula: {
        default: '',
        parseHTML: (element) => element.getAttribute('data-formula'),
        renderHTML: (attributes) => {
          if (!attributes.formula) {
            return {}
          }
          return {
            'data-formula': attributes.formula,
          }
        },
      },
      display: {
        default: false,
        parseHTML: (element) => element.hasAttribute('data-display'),
        renderHTML: (attributes) => {
          if (!attributes.display) {
            return {}
          }
          return {
            'data-display': attributes.display,
          }
        },
      },
    }
  },

  parseHTML() {
    return [
      {
        tag: 'span[data-formula]',
      },
    ]
  },

  renderHTML({ HTMLAttributes }) {
    return ['span', mergeAttributes(this.options.HTMLAttributes, HTMLAttributes)]
  },

  addNodeView() {
    return ReactNodeViewRenderer(MathComponent)
  },

  addCommands() {
    return {
      setMath:
        (formula: string, display: boolean = false) =>
        ({ commands }: { commands: any }) => {
          return commands.insertContent({
            type: this.name,
            attrs: { formula, display },
          })
        },
    } as any
  },
})

