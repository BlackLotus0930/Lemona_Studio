import { createContext, useContext, useState, ReactNode } from 'react'
import { Editor } from '@tiptap/react'

interface EditorContextType {
  currentEditor: Editor | null
  setCurrentEditor: (editor: Editor | null) => void
}

const EditorContext = createContext<EditorContextType | undefined>(undefined)

export function EditorProvider({ children }: { children: ReactNode }) {
  const [currentEditor, setCurrentEditor] = useState<Editor | null>(null)

  return (
    <EditorContext.Provider value={{ currentEditor, setCurrentEditor }}>
      {children}
    </EditorContext.Provider>
  )
}

export function useEditorContext() {
  const context = useContext(EditorContext)
  if (context === undefined) {
    throw new Error('useEditorContext must be used within an EditorProvider')
  }
  return context
}


