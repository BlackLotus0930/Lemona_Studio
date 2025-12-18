import { Node } from '@tiptap/core'

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    title: {
      setTitle: () => ReturnType
    }
  }
}

export const Title = Node.create({
  name: 'title',

  group: 'block',

  content: 'inline*',

  parseHTML() {
    return [
      {
        tag: 'p[data-type="title"]',
      },
    ]
  },

  renderHTML({ HTMLAttributes }) {
    return ['p', { ...HTMLAttributes, 'data-type': 'title' }, 0]
  },

  addAttributes() {
    return {
      'data-type': {
        default: 'title',
      },
    }
  },

  addCommands() {
    return {
      setTitle: () => ({ commands }) => {
        return commands.setNode(this.name)
      },
    }
  },
})

