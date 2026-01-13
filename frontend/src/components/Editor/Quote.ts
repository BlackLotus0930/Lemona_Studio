import { Node } from '@tiptap/core'

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    quote: {
      setQuote: () => ReturnType
    }
  }
}

export const Quote = Node.create({
  name: 'quote',

  group: 'block',

  content: 'block+',

  parseHTML() {
    return [
      {
        tag: 'div[data-type="quote"]',
      },
    ]
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', { ...HTMLAttributes, 'data-type': 'quote' }, 0]
  },

  addCommands() {
    return {
      setQuote: () => ({ state, chain }) => {
        const { selection } = state
        const { $from, $to } = selection
        
        // Find the current block node
        let blockStart = $from.start($from.depth)
        let blockEnd = $to.end($from.depth)
        let blockNode = $from.parent
        
        // If we're in a paragraph or heading, wrap it
        if (blockNode.type.name === 'paragraph' || blockNode.type.name.startsWith('heading')) {
          // Check if we're already in a quote
          for (let d = $from.depth; d > 0; d--) {
            const node = $from.node(d)
            if (node.type.name === 'quote') {
              return false // Already in a quote
            }
          }
          
          // Wrap the current block
          return chain()
            .focus()
            .setTextSelection({ from: blockStart, to: blockEnd })
            .wrapIn(this.name)
            .run()
        }
        
        // If we're at an empty block, create a new quote with a paragraph inside
        if (blockNode.content.size === 0) {
          return chain()
            .focus()
            .insertContent({
              type: this.name,
              content: [
                {
                  type: 'paragraph',
                },
              ],
            })
            .run()
        }
        
        return false
      },
    }
  },
})
