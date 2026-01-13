import { Editor } from '@tiptap/react'
import { useState, useEffect, useRef } from 'react'
import { useTheme } from '../../contexts/ThemeContext'
import './SlashCommandMenu.css'

interface SlashCommandMenuProps {
  editor: Editor
  position: { x: number; y: number }
  onClose: (shouldDelete?: boolean) => void
  filterText: string
  commandStartPos: number | null
}

interface CommandItem {
  id: string
  label: string
  icon: string
  keywords: string[] // Keywords for filtering
  action: (editor: Editor) => void
}

export default function SlashCommandMenu({ editor, position, onClose, filterText, commandStartPos }: SlashCommandMenuProps) {
  const { theme } = useTheme()
  const [selectedIndex, setSelectedIndex] = useState(0)
  const menuRef = useRef<HTMLDivElement>(null)
  const itemRefs = useRef<(HTMLDivElement | null)[]>([])

  // Helper function to adjust position to point to inline content (not listItem)
  const adjustPositionForInlineContent = (pos: number): number | null => {
    try {
      const { state } = editor
      const $pos = state.doc.resolve(pos)
      
      // If position points to inline content, return as is
      if ($pos.parent.inlineContent) {
        return pos
      }
      
      // If we're in a listItem, find the paragraph inside it
      for (let d = $pos.depth; d > 0; d--) {
        const node = $pos.node(d)
        if (node.type.name === 'listItem') {
          // Find the paragraph inside the listItem
          const listItemPos = $pos.before(d)
          try {
            const resolvedPos = state.doc.resolve(listItemPos + 1)
            for (let childD = resolvedPos.depth; childD > 0 && childD <= resolvedPos.depth + 2; childD++) {
              const childNode = resolvedPos.node(childD)
              if (childNode.type.name === 'paragraph' || childNode.type.name.startsWith('heading')) {
                const paragraphStart = resolvedPos.before(childD) + 1
                // Adjust position to be within the paragraph
                const adjustedPos = Math.max(paragraphStart, Math.min(pos, paragraphStart + childNode.content.size))
                const $adjusted = state.doc.resolve(adjustedPos)
                if ($adjusted.parent.inlineContent) {
                  return adjustedPos
                }
                return paragraphStart
              }
            }
          } catch (e) {
            return null
          }
        }
      }
      
      return null
    } catch (e) {
      return null
    }
  }

  // Helper function to apply font size to current block after style change
  const applyFontSizeToBlock = (editor: Editor, fontSize: string) => {
    try {
      const { from } = editor.state.selection
      const $from = editor.state.doc.resolve(from)
      
      // Find the current block node (paragraph, heading, title, subtitle)
      let blockStart = from
      let blockEnd = from
      for (let depth = $from.depth; depth > 0; depth--) {
        const node = $from.node(depth)
        if (node.type.name === 'paragraph' || 
            node.type.name === 'heading' || 
            node.type.name === 'title' || 
            node.type.name === 'subtitle') {
          blockStart = $from.start(depth)
          // Use content size to get correct end position (excluding closing token)
          blockEnd = blockStart + node.content.size
          break
        }
      }
      
      // Get the textStyle mark type from editor schema
      const textStyleMark = editor.schema.marks.textStyle
      if (textStyleMark && blockStart !== blockEnd) {
        // Select all text in the current block and apply font size
        editor.chain()
          .focus()
          .setTextSelection({ from: blockStart, to: blockEnd })
          .setMark('textStyle', { fontSize })
          .run()
      }
    } catch (error) {
      console.warn('Error applying font size:', error)
    }
  }

  // Helper function to delete the command text and execute action
  const executeCommand = (action: (editor: Editor) => void, fontSize?: string) => {
    if (commandStartPos !== null) {
      const { from } = editor.state.selection
      try {
        // Adjust positions to ensure they point to inline content
        const adjustedStart = adjustPositionForInlineContent(commandStartPos)
        const adjustedEnd = adjustPositionForInlineContent(from)
        
        if (adjustedStart !== null && adjustedEnd !== null) {
          // Delete from command start to current cursor position
          editor.chain()
            .focus()
            .setTextSelection({ from: adjustedStart, to: adjustedEnd })
            .deleteSelection()
            .run()
        } else {
          // Fallback: use deleteRange if setTextSelection fails
          const start = adjustedStart ?? commandStartPos
          const end = adjustedEnd ?? from
          editor.chain()
            .focus()
            .deleteRange({ from: start, to: end })
            .run()
        }
        
        // Execute the command action
        action(editor)
        
        // Apply font size if provided
        if (fontSize) {
          // Use setTimeout to ensure the style change is applied first
          setTimeout(() => {
            applyFontSizeToBlock(editor, fontSize)
          }, 0)
        }
      } catch (error) {
        console.warn('Error executing slash command:', error)
        // Fallback: try to delete using deleteRange
        try {
          const { from } = editor.state.selection
          editor.chain()
            .focus()
            .deleteRange({ from: commandStartPos, to: from })
            .run()
          action(editor)
          if (fontSize) {
            setTimeout(() => {
              applyFontSizeToBlock(editor, fontSize)
            }, 0)
          }
        } catch (fallbackError) {
          console.warn('Fallback delete also failed:', fallbackError)
          // Last resort: just execute the action without deleting
          action(editor)
          if (fontSize) {
            setTimeout(() => {
              applyFontSizeToBlock(editor, fontSize)
            }, 0)
          }
        }
      }
    } else {
      // Fallback: just execute the action
      action(editor)
      if (fontSize) {
        setTimeout(() => {
          applyFontSizeToBlock(editor, fontSize)
        }, 0)
      }
    }
    // Call onClose without deleting (we already deleted above)
    onClose(false)
  }

  // Style definitions matching Toolbar
  const styleFontSizes: Record<string, string> = {
    'title': '24',
    'subtitle': '18',
    'normal': '16',
    'h1': '20',
    'h2': '18',
    'h3': '16',
  }

  const commands: CommandItem[] = [
    {
      id: 'heading1',
      label: 'Heading 1',
      icon: 'H1',
      keywords: ['heading', 'h1', 'heading1'],
      action: (editor: Editor) => {
        executeCommand(() => {
          const { from } = editor.state.selection
          const $from = editor.state.doc.resolve(from)
          
          // Check if already the target heading level - if so, don't toggle
          let isCurrentHeading = false
          for (let depth = $from.depth; depth > 0; depth--) {
            const node = $from.node(depth)
            if (node.type.name === 'heading' && node.attrs?.level === 1) {
              isCurrentHeading = true
              break
            }
          }
          
          if (!isCurrentHeading) {
            editor.chain().focus().toggleHeading({ level: 1 }).run()
          }
        }, styleFontSizes['h1'])
      },
    },
    {
      id: 'heading2',
      label: 'Heading 2',
      icon: 'H2',
      keywords: ['heading', 'h2', 'heading2'],
      action: (editor: Editor) => {
        executeCommand(() => {
          const { from } = editor.state.selection
          const $from = editor.state.doc.resolve(from)
          
          // Check if already the target heading level - if so, don't toggle
          let isCurrentHeading = false
          for (let depth = $from.depth; depth > 0; depth--) {
            const node = $from.node(depth)
            if (node.type.name === 'heading' && node.attrs?.level === 2) {
              isCurrentHeading = true
              break
            }
          }
          
          if (!isCurrentHeading) {
            editor.chain().focus().toggleHeading({ level: 2 }).run()
          }
        }, styleFontSizes['h2'])
      },
    },
    {
      id: 'heading3',
      label: 'Heading 3',
      icon: 'H3',
      keywords: ['heading', 'h3', 'heading3'],
      action: (editor: Editor) => {
        executeCommand(() => {
          const { from } = editor.state.selection
          const $from = editor.state.doc.resolve(from)
          
          // Check if already the target heading level - if so, don't toggle
          let isCurrentHeading = false
          for (let depth = $from.depth; depth > 0; depth--) {
            const node = $from.node(depth)
            if (node.type.name === 'heading' && node.attrs?.level === 3) {
              isCurrentHeading = true
              break
            }
          }
          
          if (!isCurrentHeading) {
            editor.chain().focus().toggleHeading({ level: 3 }).run()
          }
        }, styleFontSizes['h3'])
      },
    },
    {
      id: 'text',
      label: 'Text',
      icon: 'A',
      keywords: ['text', 'paragraph', 'para'],
      action: (editor: Editor) => {
        executeCommand(() => {
          editor.chain().focus().setParagraph().run()
        }, styleFontSizes['normal'])
      },
    },
    {
      id: 'title',
      label: 'Title',
      icon: 'T',
      keywords: ['title', 'heading'],
      action: (editor: Editor) => {
        executeCommand(() => {
          // @ts-ignore - Title extension command
          editor.chain().focus().setTitle().run()
        }, styleFontSizes['title'])
      },
    },
    {
      id: 'callout',
      label: 'Callout',
      icon: '📝',
      keywords: ['callout', 'note', 'tip', 'info'],
      action: (editor: Editor) => {
        executeCommand(() => {
          // @ts-ignore - Callout extension command
          editor.chain().focus().setCallout().run()
        })
      },
    },
    {
      id: 'quote',
      label: 'Quote',
      icon: '❝',
      keywords: ['quote', 'citation', 'blockquote'],
      action: (editor: Editor) => {
        executeCommand(() => {
          // @ts-ignore - Quote extension command
          editor.chain().focus().setQuote().run()
        })
      },
    },
  ]

  // Filter commands based on filterText
  const filteredCommands = commands.filter((cmd) => {
    if (!filterText.trim()) return true
    const searchText = filterText.toLowerCase()
    return cmd.keywords.some((keyword) => keyword.toLowerCase().includes(searchText)) ||
           cmd.label.toLowerCase().includes(searchText)
  })

  // Reset selected index when filter changes
  useEffect(() => {
    setSelectedIndex(0)
  }, [filterText])

  // Handle keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        e.stopPropagation()
        setSelectedIndex((prev) => (prev + 1) % filteredCommands.length)
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        e.stopPropagation()
        setSelectedIndex((prev) => (prev - 1 + filteredCommands.length) % filteredCommands.length)
      } else if (e.key === 'Enter' || e.key === 'Return') {
        e.preventDefault()
        e.stopPropagation()
        e.stopImmediatePropagation()
        if (filteredCommands[selectedIndex]) {
          filteredCommands[selectedIndex].action(editor)
        }
      } else if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        onClose(true) // Delete text when Escape is pressed
      }
    }

    // Use capture phase to intercept events before they reach the editor
    window.addEventListener('keydown', handleKeyDown, { capture: true })
    return () => window.removeEventListener('keydown', handleKeyDown, { capture: true })
  }, [selectedIndex, filteredCommands, editor, onClose])

  // Don't scroll - keep menu at its natural position

  const bgColor = theme === 'dark' ? '#1e1e1e' : '#ffffff'
  const textColor = theme === 'dark' ? '#e0e0e0' : '#202124'
  const hoverBg = theme === 'dark' ? '#2a2a2a' : '#f5f5f5'
  const borderColor = theme === 'dark' ? '#333' : '#ddd'

  if (filteredCommands.length === 0) {
    return null
  }

  return (
    <div
      ref={menuRef}
      className="slash-command-menu"
      style={{
        position: 'fixed',
        left: `${position.x}px`,
        top: `${position.y}px`,
        backgroundColor: bgColor,
        border: `1px solid ${borderColor}`,
        borderRadius: '8px',
        boxShadow: theme === 'dark' 
          ? '0 8px 24px rgba(0,0,0,0.5), 0 2px 8px rgba(0,0,0,0.3)' 
          : '0 8px 24px rgba(0,0,0,0.15), 0 2px 8px rgba(0,0,0,0.1)',
        zIndex: 10000,
        minWidth: '200px',
        maxWidth: '260px',
        maxHeight: '280px',
        overflowY: 'auto',
        padding: '6px',
        fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      }}
      onMouseDown={(e) => {
        // Prevent editor from losing focus
        e.preventDefault()
      }}
    >
      <div
        style={{
          fontSize: '10px',
          fontWeight: '500',
          color: theme === 'dark' ? '#999' : '#666',
          padding: '6px 10px 2px 10px',
          textTransform: 'uppercase',
          letterSpacing: '0.5px',
        }}
      >
        Basic blocks
      </div>
      {filteredCommands.map((cmd, index) => (
        <div
          key={cmd.id}
          ref={(el) => {
            itemRefs.current[index] = el
          }}
          onClick={() => cmd.action(editor)}
          style={{
            display: 'flex',
            alignItems: 'center',
            padding: '6px 10px',
            cursor: 'pointer',
            backgroundColor: index === selectedIndex ? hoverBg : 'transparent',
            borderRadius: '4px',
            marginTop: '1px',
            transition: 'background-color 0.15s',
          }}
          onMouseEnter={() => setSelectedIndex(index)}
        >
          <div
            style={{
              width: '24px',
              height: '24px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: theme === 'dark' ? '#2a2a2a' : '#f5f5f5',
              borderRadius: '4px',
              marginRight: '10px',
              fontSize: '12px',
              fontWeight: '600',
              color: textColor,
            }}
          >
            {cmd.icon}
          </div>
          <div style={{ flex: 1 }}>
            <div
              style={{
                fontSize: '12px',
                fontWeight: '400',
                color: textColor,
              }}
            >
              {cmd.label}
            </div>
          </div>
        </div>
      ))}
      <div
        style={{
          fontSize: '9px',
          fontWeight: '400',
          color: theme === 'dark' ? '#666' : '#999',
          padding: '6px 10px 2px 10px',
          marginTop: '6px',
          borderTop: `1px solid ${borderColor}`,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <span>Type '/' on the page</span>
        <span style={{ fontSize: '9px' }}>esc</span>
      </div>
    </div>
  )
}

