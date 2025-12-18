import { Editor } from '@tiptap/react'
import { useMemo } from 'react'

interface OutlineViewProps {
  editor: Editor | null
}

interface Heading {
  level: number
  text: string
  id: string
}

export default function OutlineView({ editor }: OutlineViewProps) {
  const headings = useMemo(() => {
    if (!editor) return []
    
    const content = editor.getJSON()
    const headingsList: Heading[] = []
    let idCounter = 0

    function traverse(node: any) {
      if (node.type === 'heading') {
        const text = extractText(node)
        if (text.trim()) {
          headingsList.push({
            level: node.attrs?.level || 1,
            text,
            id: `heading_${idCounter++}`,
          })
        }
      }
      
      if (node.content && Array.isArray(node.content)) {
        node.content.forEach(traverse)
      }
    }

    traverse(content)
    return headingsList
  }, [editor?.getJSON()])

  const scrollToHeading = (headingId: string) => {
    console.log('Scroll to heading:', headingId)
  }

  if (headings.length === 0) {
    return null
  }

  return (
    <div style={{
      width: '200px',
      borderLeft: '1px solid #dadce0',
      padding: '16px',
      backgroundColor: '#ffffff',
      overflowY: 'auto',
      fontSize: '13px'
    }}>
      <h3 style={{ 
        fontSize: '13px', 
        fontWeight: 600, 
        marginBottom: '12px',
        color: '#202124',
        textTransform: 'uppercase',
        letterSpacing: '0.5px'
      }}>
        Outline
      </h3>
      {headings.map((heading) => (
        <div
          key={heading.id}
          onClick={() => scrollToHeading(heading.id)}
          style={{
            padding: '4px 8px',
            marginLeft: `${(heading.level - 1) * 12}px`,
            cursor: 'pointer',
            borderRadius: '3px',
            fontSize: heading.level === 1 ? '13px' : heading.level === 2 ? '12px' : '11px',
            fontWeight: heading.level === 1 ? 600 : heading.level === 2 ? 500 : 400,
            color: '#202124',
            transition: 'background-color 0.15s'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = '#f1f3f4'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = 'transparent'
          }}
        >
          {heading.text}
        </div>
      ))}
    </div>
  )
}

function extractText(node: any): string {
  if (typeof node === 'string') {
    return node
  }
  
  if (node.type === 'text') {
    return node.text || ''
  }
  
  if (node.content && Array.isArray(node.content)) {
    return node.content.map(extractText).join('')
  }
  
  return ''
}
