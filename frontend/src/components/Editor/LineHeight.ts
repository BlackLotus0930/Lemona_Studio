import { Extension } from '@tiptap/core'

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    lineHeight: {
      setLineHeight: (lineHeight: string) => ReturnType
      unsetLineHeight: () => ReturnType
    }
  }
}

export const LineHeight = Extension.create({
  name: 'lineHeight',

  addOptions() {
    return {
      types: ['textStyle'],
    }
  },

  addGlobalAttributes() {
    return [
      {
        types: ['paragraph', 'heading', 'title', 'subtitle'],
        attributes: {
          lineHeight: {
            default: null,
            parseHTML: element => {
              const lineHeight = element.style.lineHeight
              if (!lineHeight) return null
              // Parse line-height value (could be "1.5", "1.5em", "150%", etc.)
              const match = lineHeight.match(/(\d+\.?\d*)/)
              return match ? match[1] : null
            },
            renderHTML: attributes => {
              if (!attributes.lineHeight) {
                return {}
              }

              return {
                style: `line-height: ${attributes.lineHeight}`,
              }
            },
          },
        },
      },
    ]
  },

  addCommands() {
    return {
      setLineHeight: (lineHeight: string) => ({ state, dispatch, tr }) => {
        const { selection } = state
        const { $from, $to } = selection

        if (!dispatch) return false

        const tr2 = tr || state.tr
        let modified = false
        const processedPositions = new Set<number>()

        // Find all block nodes (paragraphs, headings, titles, subtitles) in the selection
        state.doc.nodesBetween($from.pos, $to.pos, (node, pos) => {
          // Only process block-level nodes
          const isBlockNode = node.type.name === 'paragraph' || 
                             node.type.name.startsWith('heading') || 
                             node.type.name === 'title' || 
                             node.type.name === 'subtitle'
          if (isBlockNode && !processedPositions.has(pos)) {
            processedPositions.add(pos)
            tr2.setNodeMarkup(pos, undefined, {
              ...node.attrs,
              lineHeight: lineHeight,
            })
            modified = true
          }
        })

        // If no block nodes were found in selection, apply to the current block
        if (!modified) {
          // Find the parent block node
          let depth = $from.depth
          while (depth > 0) {
            const node = $from.node(depth)
            const isBlockNode = node.type.name === 'paragraph' || 
                               node.type.name.startsWith('heading') || 
                               node.type.name === 'title' || 
                               node.type.name === 'subtitle'
            if (isBlockNode) {
              const pos = $from.before(depth)
              tr2.setNodeMarkup(pos, undefined, {
                ...node.attrs,
                lineHeight: lineHeight,
              })
              modified = true
              break
            }
            depth--
          }
        }

        if (modified) {
          dispatch(tr2)
          return true
        }

        return false
      },
      unsetLineHeight: () => ({ state, dispatch, tr }) => {
        const { selection } = state
        const { $from, $to } = selection

        if (!dispatch) return false

        const tr2 = tr || state.tr
        let modified = false
        const processedPositions = new Set<number>()

        state.doc.nodesBetween($from.pos, $to.pos, (node, pos) => {
          const isBlockNode = node.type.name === 'paragraph' || 
                             node.type.name.startsWith('heading') || 
                             node.type.name === 'title' || 
                             node.type.name === 'subtitle'
          if (isBlockNode && !processedPositions.has(pos)) {
            processedPositions.add(pos)
            const attrs = { ...node.attrs }
            delete attrs.lineHeight
            tr2.setNodeMarkup(pos, undefined, attrs)
            modified = true
          }
        })

        if (!modified) {
          let depth = $from.depth
          while (depth > 0) {
            const node = $from.node(depth)
            const isBlockNode = node.type.name === 'paragraph' || 
                               node.type.name.startsWith('heading') || 
                               node.type.name === 'title' || 
                               node.type.name === 'subtitle'
            if (isBlockNode) {
              const pos = $from.before(depth)
              const attrs = { ...node.attrs }
              delete attrs.lineHeight
              tr2.setNodeMarkup(pos, undefined, attrs)
              modified = true
              break
            }
            depth--
          }
        }

        if (modified) {
          dispatch(tr2)
          return true
        }

        return false
      },
    }
  },
})

