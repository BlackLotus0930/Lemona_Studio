import { Node } from '@tiptap/core'

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    callout: {
      setCallout: () => ReturnType
    }
  }
}

export const Callout = Node.create({
  name: 'callout',

  group: 'block',

  content: 'block+',

  parseHTML() {
    return [
      {
        tag: 'div[data-type="callout"]',
      },
    ]
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'div',
      { ...HTMLAttributes, 'data-type': 'callout' },
      0,
    ]
  },

  addCommands() {
    return {
      setCallout: () => ({ state, chain }) => {
        const { selection } = state
        const { $from, $to } = selection
        
        // Find the current block node
        let blockStart = $from.start($from.depth)
        let blockEnd = $to.end($from.depth)
        let blockNode = $from.parent
        
        // If we're in a paragraph or heading, wrap it
        if (blockNode.type.name === 'paragraph' || blockNode.type.name.startsWith('heading')) {
          // Check if we're already in a callout
          for (let d = $from.depth; d > 0; d--) {
            const node = $from.node(d)
            if (node.type.name === 'callout') {
              return false // Already in a callout
            }
          }
          
          // Wrap the current block
          return chain()
            .focus()
            .setTextSelection({ from: blockStart, to: blockEnd })
            .wrapIn(this.name)
            .run()
        }
        
        // If we're at an empty block, create a new callout with a paragraph inside
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
