import { Extension } from '@tiptap/core'

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    indent: {
      /**
       * Set the indent level for the current paragraph/heading
       */
      setIndent: (level: number) => ReturnType
      /**
       * Increase indent by one level
       */
      increaseIndent: () => ReturnType
      /**
       * Decrease indent by one level
       */
      decreaseIndent: () => ReturnType
      /**
       * Increase first-line indent (for Tab without selection)
       */
      increaseFirstLineIndent: () => ReturnType
      /**
       * Decrease first-line indent
       */
      decreaseFirstLineIndent: () => ReturnType
    }
  }
}

const INDENT_LEVELS = 10 // Maximum indent levels
// Use 1.75em (28px at 16px font size) to match CSS list indentation
// This is the professional standard distance for list indentation
const INDENT_SIZE = 28 // Pixels per indent level (matches 1.75em)

export const IndentExtension = Extension.create({
  name: 'indent',

  addOptions() {
    return {
      types: ['paragraph', 'heading', 'listItem', 'title', 'subtitle'],
      indentSize: INDENT_SIZE,
      maxIndent: INDENT_LEVELS,
    }
  },

  addGlobalAttributes() {
    return [
      {
        types: this.options.types,
        attributes: {
          indent: {
            default: 0,
            parseHTML: element => {
              const marginLeft = element.style.marginLeft || element.style.paddingLeft
              if (marginLeft) {
                const pixels = parseInt(marginLeft.replace('px', ''))
                return Math.min(Math.floor(pixels / this.options.indentSize), this.options.maxIndent)
              }
              return 0
            },
            renderHTML: attributes => {
              if (!attributes.indent || attributes.indent === 0) {
                return {}
              }
              const indentPx = attributes.indent * this.options.indentSize
              return {
                style: `margin-left: ${indentPx}px`,
              }
            },
          },
          firstLineIndent: {
            default: 0,
            parseHTML: element => {
              const textIndent = element.style.textIndent
              if (textIndent) {
                const pixels = parseInt(textIndent.replace('px', ''))
                return Math.min(Math.floor(pixels / this.options.indentSize), this.options.maxIndent)
              }
              return 0
            },
            renderHTML: attributes => {
              if (!attributes.firstLineIndent || attributes.firstLineIndent === 0) {
                return {}
              }
              const indentPx = attributes.firstLineIndent * this.options.indentSize
              return {
                style: `text-indent: ${indentPx}px`,
              }
            },
          },
        },
      },
    ]
  },

  addCommands() {
    return {
      setIndent: (level: number) => ({ tr, state, dispatch }) => {
        const { selection } = state
        const { $from, $to } = selection

        // Clamp indent level
        const indentLevel = Math.max(0, Math.min(level, this.options.maxIndent))

        // Get all selected paragraphs/headings/list items/titles/subtitles
        const nodes: Array<{ pos: number; node: any }> = []
        state.doc.nodesBetween($from.pos, $to.pos, (node, pos) => {
          if (node.type.name === 'paragraph' || node.type.name.startsWith('heading') || node.type.name === 'listItem' || node.type.name === 'title' || node.type.name === 'subtitle') {
            nodes.push({ pos, node })
          }
        })

        if (nodes.length === 0) {
          // If no paragraph found, get the current paragraph
          const $pos = selection.$anchor
          let paragraphPos = $pos.pos
          let paragraphNode = $pos.parent

          // Find the paragraph/heading/listItem/title/subtitle node
          for (let d = $pos.depth; d > 0; d--) {
            const node = $pos.node(d)
            if (node.type.name === 'paragraph' || node.type.name.startsWith('heading') || node.type.name === 'listItem' || node.type.name === 'title' || node.type.name === 'subtitle') {
              paragraphNode = node
              paragraphPos = $pos.start(d)
              break
            }
          }

          if (paragraphNode && (paragraphNode.type.name === 'paragraph' || paragraphNode.type.name.startsWith('heading') || paragraphNode.type.name === 'listItem' || paragraphNode.type.name === 'title' || paragraphNode.type.name === 'subtitle')) {
            nodes.push({ pos: paragraphPos, node: paragraphNode })
          }
        }

        if (nodes.length === 0) {
          return false
        }

        if (dispatch) {
          nodes.forEach(({ pos, node }) => {
            tr.setNodeMarkup(pos, undefined, {
              ...node.attrs,
              indent: indentLevel,
            })
          })
          dispatch(tr)
        }

        return true
      },

      increaseIndent: () => ({ tr, state, dispatch }) => {
        const { selection } = state
        const { $from, $to } = selection

        // Get all selected paragraphs/headings/listItems/titles/subtitles
        // But skip paragraphs that are inside listItems to avoid double indentation
        const nodes: Array<{ pos: number; node: any; currentIndent: number }> = []
        state.doc.nodesBetween($from.pos, $to.pos, (node, pos) => {
          // Skip paragraphs that are inside a listItem
          if (node.type.name === 'paragraph') {
            // Check if parent is a listItem by resolving position and checking parent chain
            try {
              const $pos = state.doc.resolve(pos)
              for (let d = $pos.depth; d > 0; d--) {
                const parentNode = $pos.node(d)
                if (parentNode.type.name === 'listItem') {
                  return // Skip this paragraph, it's inside a listItem
                }
              }
            } catch (e) {
              // If resolution fails, continue
            }
          }
          
          if (node.type.name === 'paragraph' || node.type.name.startsWith('heading') || node.type.name === 'listItem' || node.type.name === 'title' || node.type.name === 'subtitle') {
            const currentIndent = node.attrs.indent || 0
            nodes.push({ pos, node, currentIndent })
          }
        })

        if (nodes.length === 0) {
          // If no paragraph found, get the current paragraph
          const $pos = selection.$anchor
          let paragraphPos = $pos.pos
          let paragraphNode = $pos.parent

          // Find the paragraph/heading/listItem/title/subtitle node
          for (let d = $pos.depth; d > 0; d--) {
            const node = $pos.node(d)
            if (node.type.name === 'paragraph' || node.type.name.startsWith('heading') || node.type.name === 'listItem' || node.type.name === 'title' || node.type.name === 'subtitle') {
              paragraphNode = node
              paragraphPos = $pos.start(d)
              break
            }
          }

          if (paragraphNode && (paragraphNode.type.name === 'paragraph' || paragraphNode.type.name.startsWith('heading') || paragraphNode.type.name === 'listItem' || paragraphNode.type.name === 'title' || paragraphNode.type.name === 'subtitle')) {
            const currentIndent = paragraphNode.attrs.indent || 0
            nodes.push({ pos: paragraphPos, node: paragraphNode, currentIndent })
          }
        }

        if (nodes.length === 0) {
          return false
        }

        if (dispatch) {
          nodes.forEach(({ pos, node, currentIndent }) => {
            const newIndent = Math.min(currentIndent + 1, this.options.maxIndent)
            tr.setNodeMarkup(pos, undefined, {
              ...node.attrs,
              indent: newIndent,
            })
          })
          dispatch(tr)
        }

        return true
      },

      decreaseIndent: () => ({ tr, state, dispatch }) => {
        const { selection } = state
        const { $from, $to } = selection

        // Get all selected paragraphs/headings/list items/titles/subtitles
        const nodes: Array<{ pos: number; node: any; currentIndent: number }> = []
        state.doc.nodesBetween($from.pos, $to.pos, (node, pos) => {
          if (node.type.name === 'paragraph' || node.type.name.startsWith('heading') || node.type.name === 'listItem' || node.type.name === 'title' || node.type.name === 'subtitle') {
            const currentIndent = node.attrs.indent || 0
            nodes.push({ pos, node, currentIndent })
          }
        })

        if (nodes.length === 0) {
          // If no paragraph found, get the current paragraph
          const $pos = selection.$anchor
          let paragraphPos = $pos.pos
          let paragraphNode = $pos.parent

          // Find the paragraph/heading/listItem/title/subtitle node
          for (let d = $pos.depth; d > 0; d--) {
            const node = $pos.node(d)
            if (node.type.name === 'paragraph' || node.type.name.startsWith('heading') || node.type.name === 'listItem' || node.type.name === 'title' || node.type.name === 'subtitle') {
              paragraphNode = node
              paragraphPos = $pos.start(d)
              break
            }
          }

          if (paragraphNode && (paragraphNode.type.name === 'paragraph' || paragraphNode.type.name.startsWith('heading') || paragraphNode.type.name === 'listItem' || paragraphNode.type.name === 'title' || paragraphNode.type.name === 'subtitle')) {
            const currentIndent = paragraphNode.attrs.indent || 0
            nodes.push({ pos: paragraphPos, node: paragraphNode, currentIndent })
          }
        }

        if (nodes.length === 0) {
          return false
        }

        if (dispatch) {
          nodes.forEach(({ pos, node, currentIndent }) => {
            const newIndent = Math.max(currentIndent - 1, 0)
            tr.setNodeMarkup(pos, undefined, {
              ...node.attrs,
              indent: newIndent,
            })
          })
          dispatch(tr)
        }

        return true
      },

      increaseFirstLineIndent: () => ({ tr, state, dispatch }) => {
        const { selection } = state
        const { $from } = selection

        // Find the paragraph/heading/title/subtitle block node (prefer paragraph over listItem)
        let blockNode = null
        let blockPos = null
        
        // First, try to find a paragraph, heading, title, or subtitle directly
        for (let d = $from.depth; d > 0; d--) {
          const node = $from.node(d)
          if (node.type.name === 'paragraph' || node.type.name.startsWith('heading') || node.type.name === 'title' || node.type.name === 'subtitle') {
            blockNode = node
            blockPos = $from.before(d)
            break
          }
        }

        // If no paragraph/heading/title/subtitle found, check if we're in a list item
        if (!blockNode) {
          for (let d = $from.depth; d > 0; d--) {
            const node = $from.node(d)
            if (node.type.name === 'listItem') {
              // Look for paragraph inside the list item
              const listItemPos = $from.before(d)
              
              // Try to find paragraph by resolving position after the list item start
              try {
                const resolvedPos = state.doc.resolve(listItemPos + 1)
                for (let childD = resolvedPos.depth; childD > 0 && childD <= resolvedPos.depth + 2; childD++) {
                  const childNode = resolvedPos.node(childD)
                  if (childNode.type.name === 'paragraph' || childNode.type.name.startsWith('heading') || childNode.type.name === 'title' || childNode.type.name === 'subtitle') {
                    blockNode = childNode
                    blockPos = resolvedPos.before(childD)
                    break
                  }
                }
              } catch (e) {
                // If resolution fails, skip
              }
              
              // If still no paragraph found, we can't apply first-line indent to list item
              if (!blockNode) {
                return false
              }
              break
            }
          }
        }

        if (!blockNode || blockPos === null) {
          return false
        }

        const currentIndent = blockNode.attrs.firstLineIndent || 0
        const newIndent = Math.min(currentIndent + 1, this.options.maxIndent)

        if (dispatch) {
          tr.setNodeMarkup(blockPos, undefined, {
            ...blockNode.attrs,
            firstLineIndent: newIndent,
          })
          dispatch(tr)
        }

        return true
      },

      decreaseFirstLineIndent: () => ({ tr, state, dispatch }) => {
        const { selection } = state
        const { $from } = selection

        // Find the paragraph/heading/title/subtitle block node (prefer paragraph over listItem)
        let blockNode = null
        let blockPos = null
        
        // First, try to find a paragraph, heading, title, or subtitle directly
        for (let d = $from.depth; d > 0; d--) {
          const node = $from.node(d)
          if (node.type.name === 'paragraph' || node.type.name.startsWith('heading') || node.type.name === 'title' || node.type.name === 'subtitle') {
            blockNode = node
            blockPos = $from.before(d)
            break
          }
        }

        // If no paragraph/heading/title/subtitle found, check if we're in a list item
        if (!blockNode) {
          for (let d = $from.depth; d > 0; d--) {
            const node = $from.node(d)
            if (node.type.name === 'listItem') {
              // Look for paragraph inside the list item
              const listItemPos = $from.before(d)
              
              // Try to find paragraph by resolving position after the list item start
              try {
                const resolvedPos = state.doc.resolve(listItemPos + 1)
                for (let childD = resolvedPos.depth; childD > 0 && childD <= resolvedPos.depth + 2; childD++) {
                  const childNode = resolvedPos.node(childD)
                  if (childNode.type.name === 'paragraph' || childNode.type.name.startsWith('heading') || childNode.type.name === 'title' || childNode.type.name === 'subtitle') {
                    blockNode = childNode
                    blockPos = resolvedPos.before(childD)
                    break
                  }
                }
              } catch (e) {
                // If resolution fails, skip
              }
              
              // If still no paragraph found, we can't apply first-line indent to list item
              if (!blockNode) {
                return false
              }
              break
            }
          }
        }

        if (!blockNode || blockPos === null) {
          return false
        }

        const currentIndent = blockNode.attrs.firstLineIndent || 0
        const newIndent = Math.max(currentIndent - 1, 0)

        if (dispatch) {
          tr.setNodeMarkup(blockPos, undefined, {
            ...blockNode.attrs,
            firstLineIndent: newIndent,
          })
          dispatch(tr)
        }

        return true
      },
    }
  },

  addKeyboardShortcuts() {
    return {
      Tab: () => {
        const { state } = this.editor
        const { $from, $to } = state.selection
        const hasSelection = $from.pos !== $to.pos

        // Don't handle Tab in list items - let ListItem extension handle it
        // This ensures proper nested list structure instead of text indentation
        if (this.editor.isActive('listItem')) {
          return false
        }

        // Check if we're in a paragraph, heading, title, or subtitle
        const node = $from.parent
        if (node.type.name === 'paragraph' || node.type.name.startsWith('heading') || node.type.name === 'title' || node.type.name === 'subtitle') {
          if (hasSelection) {
            // With selection: indent whole paragraph(s)
            return this.editor.commands.increaseIndent()
          } else {
            // Without selection: indent only first line
            return this.editor.commands.increaseFirstLineIndent()
          }
        }

        return false
      },

      'Shift-Tab': () => {
        const { state } = this.editor
        const { $from, $to } = state.selection
        const hasSelection = $from.pos !== $to.pos

        // Don't handle Shift-Tab in list items - let ListItem extension handle it
        // This ensures proper nested list structure instead of text outdentation
        if (this.editor.isActive('listItem')) {
          return false
        }

        // Check if we're in a paragraph, heading, title, or subtitle
        const node = $from.parent
        if (node.type.name === 'paragraph' || node.type.name.startsWith('heading') || node.type.name === 'title' || node.type.name === 'subtitle') {
          if (hasSelection) {
            // With selection: outdent whole paragraph(s)
            return this.editor.commands.decreaseIndent()
          } else {
            // Without selection: outdent only first line
            return this.editor.commands.decreaseFirstLineIndent()
          }
        }

        return false
      },

      Backspace: () => {
        const { state } = this.editor
        const { $from, $to } = state.selection

        // Don't handle Backspace in list items - let ListItem extension handle it
        if (this.editor.isActive('listItem')) {
          return false
        }

        // If there's a selection, let default delete behavior handle it
        // Don't outdent when content is selected
        if ($from.pos !== $to.pos) {
          return false
        }

        // Check if cursor is at the start of a paragraph/heading/title/subtitle (no selection, cursor only)
        const node = $from.parent
        const isAtStart = $from.parentOffset === 0

        if (isAtStart && (node.type.name === 'paragraph' || node.type.name.startsWith('heading') || node.type.name === 'title' || node.type.name === 'subtitle')) {
          // Check if the node has indent
          const hasIndent = (node.attrs.indent || 0) > 0
          const hasFirstLineIndent = (node.attrs.firstLineIndent || 0) > 0

          if (hasIndent || hasFirstLineIndent) {
            // Outdent instead of deleting or joining with previous line
            if (hasIndent) {
              return this.editor.commands.decreaseIndent()
            } else if (hasFirstLineIndent) {
              return this.editor.commands.decreaseFirstLineIndent()
            }
          }
        }

        return false
      },
    }
  },
})

