import { Node } from '@tiptap/core'

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    subtitle: {
      setSubtitle: () => ReturnType
    }
  }
}

export const Subtitle = Node.create({
  name: 'subtitle',

  group: 'block',

  content: 'inline*',

  parseHTML() {
    return [
      {
        tag: 'p[data-type="subtitle"]',
      },
    ]
  },

  renderHTML({ HTMLAttributes }) {
    return ['p', { ...HTMLAttributes, 'data-type': 'subtitle' }, 0]
  },

  addAttributes() {
    return {
      'data-type': {
        default: 'subtitle',
      },
    }
  },

  addCommands() {
    return {
      setSubtitle: () => ({ commands }) => {
        return commands.setNode(this.name)
      },
    }
  },
})

