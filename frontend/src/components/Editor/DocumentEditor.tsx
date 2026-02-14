import { Editor } from '@tiptap/react'
import { EditorContent } from '@tiptap/react'
import { useNavigate } from 'react-router-dom'
import { useEffect, useRef, useState, useImperativeHandle, forwardRef } from 'react'
import { Document } from '@shared/types'
import Autocomplete from '../Autocomplete/Autocomplete'
import TextRephrasePopup from './TextRephrasePopup'
import SlashCommandMenu from './SlashCommandMenu'
import { documentApi } from '../../services/api'
import { useTheme } from '../../contexts/ThemeContext'
import './EditorStyles.css'

interface DocumentEditorProps {
  document: Document | null
  editor: Editor | null
  onDocumentChange?: (doc: Document | null) => void
  showToolbarOnly?: boolean
  isAIPanelOpen?: boolean
  aiPanelWidth?: number // Percentage width of AI panel
}

interface AgentDiffPatch {
  proposalId: string
  oldText: string
  newText: string
}

interface AgentDiffPreview {
  proposalId: string
  documentId: string
  fileName: string
  oldText: string
  newText: string
  isPatch?: boolean
  patches?: AgentDiffPatch[]
}

type AddToChatReference = {
  mentionToken: string
  fileName: string
  lineRange?: string
  selectedText: string
}

type AddToChatPayload = {
  text: string
  references: AddToChatReference[]
}


export interface DocumentEditorSearchHandle {
  openSearch: () => void
  closeSearch: () => void
  toggleSearch: () => void
  clearSearch: () => void // Clear search highlights and state
}

// DocumentEditor component for multi-editor architecture
// In this architecture:
// - Each document has its own Editor instance (created in DocumentEditorWrapper)
// - Editor content is set when the editor is created, not when switching documents
// - This component handles search, selection, scrolling, and other UI interactions
// - It does NOT handle content initialization or updates (handled by DocumentEditorWrapper)
const DocumentEditor = forwardRef<DocumentEditorSearchHandle, DocumentEditorProps>(
  ({ document, editor, isAIPanelOpen = false, aiPanelWidth = 20 }, ref) => {
  const { theme } = useTheme()
  const navigate = useNavigate()
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const scrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isDraggingRef = useRef(false)
  const mouseDownPosRef = useRef<{ x: number; y: number } | null>(null)
  const initialSelectionPosRef = useRef<number | null>(null)
  const isTextSelectionActiveRef = useRef(false)
  const scrollSaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  
  // Text selection popup state
  // Improve Button: 只看 selection.empty，不缓存，点击时才读取
  const [showRephrasePopup, setShowRephrasePopup] = useState(false)
  const [popupPosition, setPopupPosition] = useState<{ x: number; y: number } | null>(null)
  const suppressRephrasePopupRef = useRef(false)
  
  // Ctrl+K: 唯一允许缓存 selection 的地方
  const ctrlKSelectionRef = useRef<{ 
    text: string
    range: { from: number; to: number }
    contextBefore?: string
    contextAfter?: string
    paragraphCount?: number
  } | null>(null)
  
  const getSelectionContext = (from: number, to: number) => {
    if (!editor || editor.isDestroyed) {
      return { contextBefore: '', contextAfter: '', paragraphCount: 0 }
    }
    
    const blocks: Array<{ from: number; to: number; text: string }> = []
    editor.state.doc.descendants((node, pos) => {
      if (node.isTextblock) {
        const text = node.textBetween(0, node.content.size, '\n').trim()
        if (text) {
          blocks.push({
            from: pos + 1,
            to: pos + node.nodeSize - 1,
            text
          })
        }
      }
    })
    
    const selectedIndexes: number[] = []
    blocks.forEach((block, index) => {
      const overlaps = !(to < block.from || from > block.to)
      if (overlaps) {
        selectedIndexes.push(index)
      }
    })
    
    if (selectedIndexes.length === 0) {
      return { contextBefore: '', contextAfter: '', paragraphCount: 0 }
    }
    
    const firstIndex = selectedIndexes[0]
    const lastIndex = selectedIndexes[selectedIndexes.length - 1]
    const beforeBlocks = blocks.slice(Math.max(0, firstIndex - 2), firstIndex)
    const afterBlocks = blocks.slice(lastIndex + 1, lastIndex + 3)
    
    return {
      contextBefore: beforeBlocks.map((b) => b.text).join('\n\n'),
      contextAfter: afterBlocks.map((b) => b.text).join('\n\n'),
      paragraphCount: selectedIndexes.length
    }
  }

  const buildAddToChatPayload = (selection: {
    text: string
    range: { from: number; to: number } | null
  }): AddToChatPayload | null => {
    if (!editor || editor.isDestroyed) return null
    const selectedText = selection.text?.trim()
    if (!selectedText) return null

    const title = (document?.title || 'Current document').trim()
    let lineLabel = ''

    if (selection.range) {
      const { from, to } = selection.range
      const beforeText = editor.state.doc.textBetween(1, Math.max(1, from), '\n', '\n')
      const selectionText = editor.state.doc.textBetween(from, to, '\n', '\n')
      const startLine = beforeText.length === 0 ? 1 : beforeText.split('\n').length
      const lineSpan = Math.max(1, selectionText.split('\n').length)
      const endLine = startLine + lineSpan - 1
      lineLabel = ` (${startLine}-${endLine})`
    }

    const mentionToken = `@${title}${lineLabel}`
    return {
      text: `${mentionToken} `,
      references: [{
        mentionToken,
        fileName: title,
        lineRange: lineLabel ? lineLabel.trim().replace(/[()]/g, '') : undefined,
        selectedText,
      }],
    }
  }
  
  // Inline search/replace state
  const [showInlineSearch, setShowInlineSearch] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [replaceQuery, setReplaceQuery] = useState('')
  const [matches, setMatches] = useState<Array<{ from: number; to: number; pageNumber?: number }>>([])
  const [currentMatchIndex, setCurrentMatchIndex] = useState(-1)
  const [activeSearchQuery, setActiveSearchQuery] = useState('') // The query that was actually searched
  const inlineSearchInputRef = useRef<HTMLInputElement>(null)
  const inlineReplaceInputRef = useRef<HTMLInputElement>(null)
  const isSearchInputFocusedRef = useRef(false)
  const isReplaceInputFocusedRef = useRef(false)
  const isRephrasePopupInputFocusedRef = useRef(false)
  const editorRef = useRef<Editor | null>(null) // Store editor in ref for reliable access in event handlers
  const [rightOffset, setRightOffset] = useState(20)
  const [agentDiffPreview, setAgentDiffPreview] = useState<AgentDiffPreview | null>(null)
  const [agentDiffButtonPos, setAgentDiffButtonPos] = useState<{ top: number; right: number } | null>(null)
  const previewOriginalDocRef = useRef<any | null>(null)
  const previewActiveProposalIdRef = useRef<string | null>(null)
  const previewAppliedRef = useRef(false)

  const linesToParagraphNodes = (
    lines: string[],
    mode: 'equal' | 'delete' | 'insert'
  ): any[] => {
    return lines.map((line) => {
      if (line.length === 0) {
        return { type: 'paragraph' }
      }
      if (mode === 'equal') {
        return {
          type: 'paragraph',
          content: [{ type: 'text', text: line }],
        }
      }
      if (mode === 'delete') {
        return {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: line,
              marks: [
                { type: 'highlight', attrs: { color: theme === 'dark' ? 'rgba(239,68,68,0.22)' : 'rgba(254,226,226,0.9)' } },
              ],
            },
          ],
        }
      }
      return {
        type: 'paragraph',
        content: [
          {
            type: 'text',
            text: line,
            marks: [
              { type: 'highlight', attrs: { color: theme === 'dark' ? 'rgba(34,197,94,0.22)' : 'rgba(220,252,231,0.95)' } },
            ],
          },
        ],
      }
    })
  }

  const buildInlineDiffPreviewDoc = (oldText: string, newText: string): any => {
    const oldLines = (oldText || '').replace(/\r\n/g, '\n').split('\n')
    const newLines = (newText || '').replace(/\r\n/g, '\n').split('\n')

    let prefix = 0
    const minLen = Math.min(oldLines.length, newLines.length)
    while (prefix < minLen && oldLines[prefix] === newLines[prefix]) {
      prefix += 1
    }

    let suffix = 0
    const oldRemain = oldLines.length - prefix
    const newRemain = newLines.length - prefix
    const maxSuffix = Math.min(oldRemain, newRemain)
    while (
      suffix < maxSuffix &&
      oldLines[oldLines.length - 1 - suffix] === newLines[newLines.length - 1 - suffix]
    ) {
      suffix += 1
    }

    const prefixOld = oldLines.slice(0, prefix)
    const deleted = oldLines.slice(prefix, oldLines.length - suffix)
    const inserted = newLines.slice(prefix, newLines.length - suffix)
    const suffixOld = oldLines.slice(oldLines.length - suffix)

    const content = [
      ...linesToParagraphNodes(prefixOld, 'equal'),
      ...linesToParagraphNodes(deleted, 'delete'),
      ...linesToParagraphNodes(inserted, 'insert'),
      ...linesToParagraphNodes(suffixOld, 'equal'),
    ]

    return { type: 'doc', content }
  }

  const restorePreviewOriginal = () => {
    if (!editor || editor.isDestroyed) return
    if (!previewOriginalDocRef.current) return
    editor.commands.setContent(previewOriginalDocRef.current, { emitUpdate: false })
    editor.setEditable(true)
    previewOriginalDocRef.current = null
    previewActiveProposalIdRef.current = null
    previewAppliedRef.current = false
  }

  const applyAgentTextPatch = (
    oldSegment: string,
    newSegment: string,
    occurrenceIndex: number = 0,
    prefixAnchor: string = '',
    suffixAnchor: string = ''
  ): boolean => {
    if (!editor || editor.isDestroyed) return false
    if (typeof oldSegment !== 'string' || typeof newSegment !== 'string') return false
    if (oldSegment === newSegment) return true

    const needle = oldSegment
    let foundRange: { from: number; to: number } | null = null

    if (needle.length === 0) {
      const { from } = editor.state.selection
      foundRange = { from, to: from }
    } else {
      const candidates: Array<{ from: number; to: number; score: number }> = []
      editor.state.doc.descendants((node, pos) => {
        if (!node.isTextblock) return true
        const blockText = node.textBetween(0, node.content.size, '\n')
        let startAt = 0
        while (true) {
          const index = blockText.indexOf(needle, startAt)
          if (index < 0) break
          const from = pos + 1 + index
          const maxTo = pos + node.nodeSize - 1
          const to = Math.min(from + needle.length, maxTo)
          const leftContext = blockText.slice(Math.max(0, index - 120), index)
          const rightContext = blockText.slice(index + needle.length, Math.min(blockText.length, index + needle.length + 120))
          let score = 0
          if (prefixAnchor && leftContext.endsWith(prefixAnchor.slice(-Math.min(40, prefixAnchor.length)))) {
            score += 2
          }
          if (suffixAnchor && rightContext.startsWith(suffixAnchor.slice(0, Math.min(40, suffixAnchor.length)))) {
            score += 2
          }
          candidates.push({ from, to, score })
          startAt = index + Math.max(1, needle.length)
        }
        return true
      })

      if (candidates.length > 0) {
        const bestScore = Math.max(...candidates.map(c => c.score))
        if (bestScore > 0) {
          const anchored = candidates.filter(c => c.score === bestScore)
          const idx = Math.max(0, Math.min(occurrenceIndex, anchored.length - 1))
          foundRange = { from: anchored[idx].from, to: anchored[idx].to }
        } else {
          const idx = Math.max(0, Math.min(occurrenceIndex, candidates.length - 1))
          foundRange = { from: candidates[idx].from, to: candidates[idx].to }
        }
      }
    }

    if (!foundRange) {
      return false
    }

    editor
      .chain()
      .focus()
      .insertContentAt(foundRange, newSegment)
      .run()

    return true
  }
  
  // Slash command menu state
  const [showSlashMenu, setShowSlashMenu] = useState(false)
  const [slashMenuPosition, setSlashMenuPosition] = useState({ x: 0, y: 0 })
  const [slashFilterText, setSlashFilterText] = useState('')
  const slashCommandStartPosRef = useRef<number | null>(null)
  
  // Keep editor ref in sync with prop
  useEffect(() => {
    editorRef.current = editor
  }, [editor])

  const focusDiffInEditor = (oldText: string, newText: string) => {
    if (!editor || editor.isDestroyed) return

    const candidates = [...oldText.split('\n'), ...newText.split('\n')]
      .map(line => line.trim())
      .filter(line => line.length >= 6)
      .slice(0, 8)

    if (candidates.length === 0) return

    let foundRange: { from: number; to: number } | null = null
    editor.state.doc.descendants((node, pos) => {
      if (foundRange || !node.isTextblock) return false
      const blockText = node.textBetween(0, node.content.size, '\n')
      for (const candidate of candidates) {
        const index = blockText.toLowerCase().indexOf(candidate.toLowerCase())
        if (index >= 0) {
          const from = pos + 1 + index
          const maxTo = pos + node.nodeSize - 1
          const to = Math.min(from + candidate.length, maxTo)
          foundRange = { from, to }
          return false
        }
      }
      return true
    })

    if (foundRange) {
      editor.chain().focus().setTextSelection(foundRange).scrollIntoView().run()
    }
  }

  // Position the Undo/Keep buttons near the first green highlighted paragraph
  const positionDiffButtons = (editorInstance: Editor) => {
    if (!editorInstance?.view?.dom) { setAgentDiffButtonPos(null); return }
    const editorDom = editorInstance.view.dom as HTMLElement
    // Find first <mark> with green background
    const allMarks = editorDom.querySelectorAll('mark[data-color]')
    let greenMark: HTMLElement | null = null
    for (const m of allMarks) {
      const c = (m as HTMLElement).dataset.color || ''
      if (c.includes('34,197,94') || c.includes('34, 197, 94') ||
          c.includes('220,252,231') || c.includes('220, 252, 231')) {
        greenMark = m as HTMLElement
        break
      }
    }
    if (!greenMark) { setAgentDiffButtonPos(null); return }
    // The buttons are inside the position:relative div (the parent of EditorContent's wrapper)
    // Compute mark position relative to that div using getBoundingClientRect
    const relativeContainer = editorDom.parentElement?.parentElement?.parentElement
    if (!relativeContainer) { setAgentDiffButtonPos(null); return }
    const containerRect = relativeContainer.getBoundingClientRect()
    const markRect = greenMark.getBoundingClientRect()
    setAgentDiffButtonPos({
      top: markRect.top - containerRect.top,
      right: 12,
    })
  }

  useEffect(() => {
    const onPreview = (event: Event) => {
      const customEvent = event as CustomEvent<AgentDiffPreview>
      const detail = customEvent.detail
      if (!detail || !document?.id) return
      console.info('[AgentFlow] onPreview_received', {
        docMatch: detail.documentId === document.id,
        patchCount: detail.patches?.length ?? (detail.isPatch ? 1 : 0),
        proposalId: detail.proposalId,
      })
      if (detail.documentId === document.id) {
        if (editor && !editor.isDestroyed) {
          // Save clean original (only once per preview cycle)
          if (!previewOriginalDocRef.current) {
            previewOriginalDocRef.current = editor.getJSON()
          }
          previewActiveProposalIdRef.current = detail.proposalId
          previewAppliedRef.current = false

          // --- Helpers for JSON-based diff preview ---
          const getNodeText = (node: any): string => {
            if (node.type === 'text') return node.text || ''
            if (!node.content) return ''
            return node.content.map((c: any) => getNodeText(c)).join('')
          }

          const stripAllHighlights = (nodes: any[]) => {
            if (!nodes) return
            for (const n of nodes) {
              if (n.marks && Array.isArray(n.marks)) {
                n.marks = n.marks.filter((m: any) => m.type !== 'highlight')
                if (n.marks.length === 0) delete n.marks
              }
              if (n.content && Array.isArray(n.content)) stripAllHighlights(n.content)
            }
          }

          const spliceHighlight = (content: any[], startIdx: number, length: number, mark: any): any[] => {
            const result: any[] = []
            let charPos = 0
            const endIdx = startIdx + length
            for (const item of content) {
              if (item.type !== 'text' || !item.text) { result.push(item); continue }
              const iStart = charPos
              const iEnd = charPos + item.text.length
              charPos = iEnd
              if (iEnd <= startIdx || iStart >= endIdx) {
                result.push(item)
              } else {
                const hlStart = Math.max(0, startIdx - iStart)
                const hlEnd = Math.min(item.text.length, endIdx - iStart)
                if (hlStart > 0) {
                  result.push({ ...item, text: item.text.slice(0, hlStart) })
                }
                const existingMarks = item.marks ? [...item.marks] : []
                result.push({
                  type: 'text',
                  text: item.text.slice(hlStart, hlEnd),
                  marks: [...existingMarks, mark],
                })
                if (hlEnd < item.text.length) {
                  result.push({ ...item, text: item.text.slice(hlEnd) })
                }
              }
            }
            return result
          }

          // Build patches list (multiple or single)
          const patches: AgentDiffPatch[] = detail.patches && detail.patches.length > 0
            ? detail.patches
            : (detail.isPatch && detail.oldText)
              ? [{ proposalId: detail.proposalId, oldText: detail.oldText, newText: detail.newText }]
              : []

          if (patches.length > 0) {
            // JSON-based patch preview: modify a clean clone of the original doc
            const previewJSON = JSON.parse(JSON.stringify(previewOriginalDocRef.current))
            // CRITICAL: strip ALL existing highlight marks to prevent "all red" from stale state
            if (previewJSON.content) stripAllHighlights(previewJSON.content)

            let anyFound = false
            const redMark = {
              type: 'highlight',
              attrs: { color: theme === 'dark' ? 'rgba(239,68,68,0.22)' : 'rgba(254,226,226,0.9)' }
            }
            const greenMark = {
              type: 'highlight',
              attrs: { color: theme === 'dark' ? 'rgba(34,197,94,0.22)' : 'rgba(220,252,231,0.95)' }
            }

            // Process patches from bottom to top so spliced green nodes don't shift indices
            const patchTargets: Array<{ nodeIndex: number; charIdx: number; patch: AgentDiffPatch }> = []
            if (previewJSON.content && Array.isArray(previewJSON.content)) {
              for (const patch of patches) {
                const oldSnippet = (patch.oldText || '').replace(/\r\n/g, '\n')
                for (let i = 0; i < previewJSON.content.length; i++) {
                  const nodeText = getNodeText(previewJSON.content[i])
                  const idx = nodeText.indexOf(oldSnippet)
                  if (idx >= 0) {
                    patchTargets.push({ nodeIndex: i, charIdx: idx, patch })
                    break
                  }
                }
              }
              // Sort by nodeIndex descending so we insert from bottom to top
              patchTargets.sort((a, b) => b.nodeIndex - a.nodeIndex)

              for (const target of patchTargets) {
                const node = previewJSON.content[target.nodeIndex]
                const oldSnippet = (target.patch.oldText || '').replace(/\r\n/g, '\n')
                const newSnippet = (target.patch.newText || '').replace(/\r\n/g, '\n')

                // Add red highlight to matched text
                if (node.content && Array.isArray(node.content)) {
                  node.content = spliceHighlight(node.content, target.charIdx, oldSnippet.length, redMark)
                }
                // Insert green paragraphs right after this node
                if (newSnippet.length > 0) {
                  const greenParas = newSnippet.split('\n').map((line: string) => {
                    if (!line) return { type: 'paragraph' }
                    return {
                      type: 'paragraph',
                      content: [{ type: 'text', text: line, marks: [greenMark] }],
                    }
                  })
                  previewJSON.content.splice(target.nodeIndex + 1, 0, ...greenParas)
                }
                anyFound = true
                console.info('[AgentFlow] patch_preview_applied', {
                  proposalId: target.patch.proposalId,
                  nodeIndex: target.nodeIndex,
                  charIdx: target.charIdx,
                  oldLen: oldSnippet.length,
                })
              }
            }

            if (anyFound) {
              editor.commands.setContent(previewJSON, { emitUpdate: false })
            } else {
              console.warn('[AgentFlow] patch_preview: no patches found in JSON, falling back to full diff')
              const previewDoc = buildInlineDiffPreviewDoc(detail.oldText || '', detail.newText || '')
              editor.commands.setContent(previewDoc, { emitUpdate: false })
            }
            editor.setEditable(false)
            // Position Undo/Accept buttons near the first green block
            requestAnimationFrame(() => {
              positionDiffButtons(editor)
            })
          } else {
            // Full-file diff mode
            const previewDoc = buildInlineDiffPreviewDoc(detail.oldText || '', detail.newText || '')
            editor.commands.setContent(previewDoc, { emitUpdate: false })
            editor.setEditable(false)
            requestAnimationFrame(() => {
              positionDiffButtons(editor)
            })
          }
        }
        setAgentDiffPreview(detail)
      }
    }

    const onClear = (event: Event) => {
      const customEvent = event as CustomEvent<{ proposalId?: string }>
      const proposalId = customEvent.detail?.proposalId
      const isCurrentPreview =
        !proposalId ||
        (previewActiveProposalIdRef.current && previewActiveProposalIdRef.current === proposalId) ||
        (agentDiffPreview && agentDiffPreview.proposalId === proposalId)
      if (isCurrentPreview) {
        if (!previewAppliedRef.current) {
          restorePreviewOriginal()
        } else {
          previewOriginalDocRef.current = null
          previewActiveProposalIdRef.current = null
          previewAppliedRef.current = false
          if (editor && !editor.isDestroyed) {
            editor.setEditable(true)
          }
        }
        setAgentDiffPreview(null)
        setAgentDiffButtonPos(null)
      }
    }

    const onApplyEditorContent = (event: Event) => {
      const customEvent = event as CustomEvent<{ documentId?: string; content?: string }>
      if (!editor || !document?.id) return
      if (customEvent.detail?.documentId !== document.id || !customEvent.detail.content) return
      try {
        previewAppliedRef.current = true
        const parsed = JSON.parse(customEvent.detail.content)
        editor.commands.setContent(parsed, { emitUpdate: false })
        editor.setEditable(true)
        previewOriginalDocRef.current = null
        previewActiveProposalIdRef.current = null
      } catch (error) {
        console.error('[DocumentEditor] Failed to apply agent content:', error)
      }
    }

    const onApplyEditorPatch = (event: Event) => {
      const customEvent = event as CustomEvent<{
        proposalId?: string
        documentId?: string
        oldText?: string
        newText?: string
        occurrenceIndex?: number
        prefixAnchor?: string
        suffixAnchor?: string
      }>
      if (!editor || !document?.id) return
      if (customEvent.detail?.documentId !== document.id) return

      try {
        if (previewOriginalDocRef.current) {
          editor.commands.setContent(previewOriginalDocRef.current, { emitUpdate: false })
          previewOriginalDocRef.current = null
          previewActiveProposalIdRef.current = null
          previewAppliedRef.current = false
        }
        editor.setEditable(true)

        const oldSegment = customEvent.detail?.oldText || ''
        const newSegment = customEvent.detail?.newText || ''
        const applied = applyAgentTextPatch(
          oldSegment,
          newSegment,
          customEvent.detail?.occurrenceIndex ?? 0,
          customEvent.detail?.prefixAnchor || '',
          customEvent.detail?.suffixAnchor || ''
        )

        if (!applied) {
          console.warn('[AgentFlow] editor_patch_apply_failed', {
            documentId: document?.id || null,
            proposalId: customEvent.detail?.proposalId,
            oldChars: oldSegment.length,
            newChars: newSegment.length,
          })
          window.dispatchEvent(new CustomEvent('lemona:agent-patch-failed', {
            detail: {
              proposalId: customEvent.detail?.proposalId,
              message: 'Patch could not be applied safely. Please narrow the edit target and try again.',
            }
          }))
          return
        }

        window.dispatchEvent(new CustomEvent('lemona:agent-patch-applied', {
          detail: { proposalId: customEvent.detail?.proposalId }
        }))
        console.info('[AgentFlow] editor_patch_applied', {
          documentId: document?.id || null,
          proposalId: customEvent.detail?.proposalId,
          oldChars: oldSegment.length,
          newChars: newSegment.length,
        })
      } catch (error) {
        console.error('[DocumentEditor] Failed to apply agent patch:', error)
        window.dispatchEvent(new CustomEvent('lemona:agent-patch-failed', {
          detail: {
            proposalId: customEvent.detail?.proposalId,
            message: error instanceof Error ? error.message : 'Patch apply failed',
          }
        }))
      }
    }

    const onFocusDiff = (event: Event) => {
      const customEvent = event as CustomEvent<{ documentId?: string; oldText?: string; newText?: string }>
      if (!document?.id) return
      if (customEvent.detail?.documentId !== document.id) return
      focusDiffInEditor(customEvent.detail?.oldText || '', customEvent.detail?.newText || '')
    }

    window.addEventListener('lemona:agent-diff-preview', onPreview as EventListener)
    window.addEventListener('lemona:agent-diff-clear', onClear as EventListener)
    window.addEventListener('lemona:agent-apply-editor-content', onApplyEditorContent as EventListener)
    window.addEventListener('lemona:agent-apply-editor-patch', onApplyEditorPatch as EventListener)
    window.addEventListener('lemona:agent-focus-diff', onFocusDiff as EventListener)
    return () => {
      window.removeEventListener('lemona:agent-diff-preview', onPreview as EventListener)
      window.removeEventListener('lemona:agent-diff-clear', onClear as EventListener)
      window.removeEventListener('lemona:agent-apply-editor-content', onApplyEditorContent as EventListener)
      window.removeEventListener('lemona:agent-apply-editor-patch', onApplyEditorPatch as EventListener)
      window.removeEventListener('lemona:agent-focus-diff', onFocusDiff as EventListener)
    }
  }, [document?.id, editor, agentDiffPreview, theme])

  // Handle slash command menu
  useEffect(() => {
    if (!editor) return

    const handleUpdate = () => {
      if (editor.isDestroyed || !editor.view) return

      const { from, to } = editor.state.selection
      
      // Don't show menu if there's a selection
      if (from !== to) {
        setShowSlashMenu(false)
        slashCommandStartPosRef.current = null
        setSlashFilterText('')
        return
      }

      // Don't show menu if other popups are open
      if (showRephrasePopup || showInlineSearch || 
          isSearchInputFocusedRef.current || isReplaceInputFocusedRef.current ||
          isRephrasePopupInputFocusedRef.current) {
        setShowSlashMenu(false)
        slashCommandStartPosRef.current = null
        setSlashFilterText('')
        return
      }

      try {
        // Use ProseMirror's API to check if we're at the start of a block
        const $from = editor.state.selection.$from
        
        // Find the block node (paragraph, heading, etc.)
        // Use $from to navigate up the tree to find the block-level node
        let blockStart = $from.start($from.depth)
        let blockNode = $from.parent
        
        // If we're inside a list item, we need to find the actual paragraph/heading inside it
        if (blockNode.type.name === 'listItem') {
          // Navigate deeper to find the paragraph
          for (let d = $from.depth; d > 0; d--) {
            const nodeAtDepth = $from.node(d)
            if (nodeAtDepth.type.name === 'paragraph' || nodeAtDepth.type.name.startsWith('heading')) {
              blockStart = $from.start(d)
              blockNode = nodeAtDepth
              break
            }
          }
        }
        
        // Check if cursor is at the start of the block
        // $from.parentOffset === 0 means we're at the start of the parent node
        const isAtBlockStart = $from.parentOffset === 0 || from === blockStart

        const blockEnd = blockStart + blockNode.content.size
        
        // Get text from block start to cursor and after cursor
        const textFromBlockStart = editor.state.doc.textBetween(blockStart, from)
        const textAfterCursor = editor.state.doc.textBetween(from, blockEnd)
        
        // Check if "/" exists and is at the start (or only whitespace before it)
        const slashIndex = textFromBlockStart.indexOf('/')
        const hasSlash = slashIndex >= 0
        const onlyWhitespaceBeforeSlash = hasSlash && textFromBlockStart.substring(0, slashIndex).trim() === ''
        
        // Also check the character right before cursor (in case "/" was just typed at block start)
        const charBeforeCursor = from > blockStart ? editor.state.doc.textBetween(Math.max(blockStart, from - 1), from) : ''
        const isSlashAtCursor = charBeforeCursor === '/'
        
        // Only show menu on an empty line (no text after cursor)
        const hasTextAfterCursor = textAfterCursor.trim().length > 0

        // Show menu if:
        // 1. Cursor is at block start and "/" is right before cursor, OR
        // 2. "/" exists at the start of the block (or after whitespace only) and cursor is after it
        // And there is no text after the cursor (line is effectively empty beyond slash/filter)
        const shouldShowMenu = (
          !hasTextAfterCursor &&
          ((isAtBlockStart && isSlashAtCursor) ||
          (hasSlash && onlyWhitespaceBeforeSlash && from > blockStart + slashIndex))
        )
        
        if (shouldShowMenu) {
          // Find the exact position of "/"
          const slashPos = isSlashAtCursor && isAtBlockStart 
            ? from - 1 
            : blockStart + slashIndex
          
          // Get filter text (everything after "/")
          const textAfterSlash = isSlashAtCursor && isAtBlockStart
            ? ''
            : textFromBlockStart.substring(slashIndex + 1)
          const filterText = textAfterSlash.trim()
          
          // Show or update menu
          if (!showSlashMenu) {
            slashCommandStartPosRef.current = slashPos
            setSlashFilterText('')
            
            // Calculate position for menu
            try {
              const coords = editor.view.coordsAtPos(from)
              if (coords) {
                setSlashMenuPosition({ x: coords.left, y: coords.bottom + 4 })
              }
            } catch (error) {
              console.warn('Error calculating slash menu position:', error)
            }
            
            setShowSlashMenu(true)
          } else {
            // Update filter text
            setSlashFilterText(filterText)
            
            // Update menu position
            try {
              const coords = editor.view.coordsAtPos(from)
              if (coords) {
                setSlashMenuPosition({ x: coords.left, y: coords.bottom + 4 })
              }
            } catch (error) {
              // Ignore position errors
            }
          }
        } else {
          // Hide menu if "/" is not at the start of block
          if (showSlashMenu) {
            setShowSlashMenu(false)
            slashCommandStartPosRef.current = null
            setSlashFilterText('')
          }
        }
      } catch (error) {
        // If there's an error, hide the menu and clean up
        console.warn('Error in slash command menu handler:', error)
        if (showSlashMenu) {
          setShowSlashMenu(false)
          slashCommandStartPosRef.current = null
          setSlashFilterText('')
        }
      }
    }

    editor.on('update', handleUpdate)
    editor.on('selectionUpdate', handleUpdate)

    return () => {
      editor.off('update', handleUpdate)
      editor.off('selectionUpdate', handleUpdate)
    }
  }, [editor, showSlashMenu, showRephrasePopup, showInlineSearch])

  // Handle keyboard events for slash menu
  useEffect(() => {
    if (!showSlashMenu || !editor) return

    const handleKeyDown = (e: KeyboardEvent) => {
      // Prevent Enter key from being handled by editor when menu is open
      if (e.key === 'Enter' || e.key === 'Return') {
        // Let SlashCommandMenu handle it, but prevent editor from processing it
        e.preventDefault()
        e.stopPropagation()
        return
      }
      
      // Don't interfere with arrow keys, escape - let SlashCommandMenu handle them
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Escape') {
        return
      }
      
      // If backspace and we're deleting the "/", close the menu
      if (e.key === 'Backspace' && slashCommandStartPosRef.current !== null) {
        const { from } = editor.state.selection
        if (from <= slashCommandStartPosRef.current) {
          setShowSlashMenu(false)
          slashCommandStartPosRef.current = null
          setSlashFilterText('')
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown, { capture: true })
    return () => {
      window.removeEventListener('keydown', handleKeyDown, { capture: true })
    }
  }, [showSlashMenu, editor])

  // Close slash menu when clicking outside
  useEffect(() => {
    if (!showSlashMenu || !editor) return

    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      // Don't close if clicking on the menu itself
      if (target.closest('.slash-command-menu')) {
        return
      }
      // Close the menu but keep "/" as normal text (don't delete it)
      setShowSlashMenu(false)
      slashCommandStartPosRef.current = null
      setSlashFilterText('')
    }

    // Use a small delay to avoid closing immediately when menu opens
    const timeout = setTimeout(() => {
      window.addEventListener('mousedown', handleClickOutside)
    }, 100)

    return () => {
      clearTimeout(timeout)
      window.removeEventListener('mousedown', handleClickOutside)
    }
  }, [showSlashMenu, editor])
  
  // Expose search API to parent (Layout)
  useImperativeHandle(ref, () => ({
    openSearch: () => {
      setShowInlineSearch(true)
      setTimeout(() => {
        inlineSearchInputRef.current?.focus()
        inlineSearchInputRef.current?.select()
      }, 50)
    },
    closeSearch: () => {
      clearInlineSearchHighlights()
      setMatches([])
      setCurrentMatchIndex(-1)
      setActiveSearchQuery('')
      setSearchQuery('')
      setReplaceQuery('')
      setShowInlineSearch(false)
    },
    toggleSearch: () => {
      if (showInlineSearch) {
        clearInlineSearchHighlights()
        setMatches([])
        setCurrentMatchIndex(-1)
        setActiveSearchQuery('')
        setSearchQuery('')
        setReplaceQuery('')
        setShowInlineSearch(false)
      } else {
        setShowInlineSearch(true)
        setTimeout(() => {
          inlineSearchInputRef.current?.focus()
          inlineSearchInputRef.current?.select()
        }, 50)
      }
    },
    clearSearch: () => {
      clearInlineSearchHighlights()
      setMatches([])
      setCurrentMatchIndex(-1)
      setActiveSearchQuery('')
      setSearchQuery('')
      setReplaceQuery('')
      setShowInlineSearch(false)
    },
  }))
  
  const bgColor = theme === 'dark' ? '#181818' : '#ffffff'
  const textColor = theme === 'dark' ? '#FFFFFF' : '#202124'
  
  // Inline search UI colors
  const searchBgColor = theme === 'dark' ? '#1e1e1e' : '#ffffff'
  const searchInputBg = theme === 'dark' ? '#252525' : '#f8f9fa'
  const searchInputBorder = theme === 'dark' ? '#333' : '#dadce0'
  const searchInputBorderFocus = theme === 'dark' ? '#555' : '#4285f4'
  const searchTextColor = theme === 'dark' ? '#e0e0e0' : '#202124'
  const searchLabelColor = theme === 'dark' ? '#e0e0e0' : '#5f6368'
  const searchCloseColor = theme === 'dark' ? '#999' : '#5f6368'
  const searchCloseHoverBg = theme === 'dark' ? '#2a2a2a' : '#f1f3f4'
  const searchCloseHoverColor = theme === 'dark' ? '#fff' : '#202124'
  const searchMatchCountColor = theme === 'dark' ? '#999' : '#5f6368'
  const searchButtonBorder = theme === 'dark' ? '#333' : '#dadce0'
  const searchButtonHoverBg = theme === 'dark' ? '#333' : '#e8eaed'
  const searchButtonHoverBorder = theme === 'dark' ? '#444' : '#c4c7c5'
  const searchButtonDisabledColor = theme === 'dark' ? '#666' : '#9aa0a6'
  const searchButtonDisabledBg = theme === 'dark' ? '#2a2a2a' : '#f1f3f4'
  const exportPdfButtonBg = theme === 'dark' ? '#d9779f' : '#e8a5b8'
  const exportPdfButtonHoverBg = theme === 'dark' ? '#c9688a' : '#e095ab'
  const exportDocxButtonBg = theme === 'dark' ? '#7bb3d9' : '#8fc4e8'
  const exportDocxButtonHoverBg = theme === 'dark' ? '#6ba5c9' : '#7fb8de'
  const searchBoxShadow = theme === 'dark' 
    ? '0 8px 24px rgba(0,0,0,0.5), 0 2px 8px rgba(0,0,0,0.3)'
    : '0 8px 24px rgba(0,0,0,0.15), 0 2px 8px rgba(0,0,0,0.1)'

  // Save scroll position to localStorage
  const saveScrollPosition = (documentId: string, scrollTop: number) => {
    try {
      localStorage.setItem(`documentScroll_${documentId}`, scrollTop.toString())
    } catch (error) {
      console.error('Failed to save scroll position:', error)
    }
  }

  // Note: loadScrollPosition is now handled in Layout.tsx to restore scroll position
  // immediately after setContent, preventing any scrolling animation

  const handleNewDocument = async () => {
    try {
      const newDoc = await documentApi.create('Untitled Document')
      navigate(`/document/${newDoc.data.id}`)
    } catch (error) {
      console.error('Failed to create document:', error)
      alert('Failed to create document. Please try again.')
    }
  }

  // Prevent editor from stealing focus when search inputs are active
  useEffect(() => {
    if (!editor) return
    
    // Check if editor is destroyed or view is not available
    if (editor.isDestroyed || !editor.view) return

    const handleEditorBlur = (event: FocusEvent) => {
      // If focus is moving to search input, prevent editor from regaining focus
      const relatedTarget = event.relatedTarget as HTMLElement
      if (relatedTarget === inlineSearchInputRef.current || relatedTarget === inlineReplaceInputRef.current) {
        // Don't let editor steal focus back
        return
      }
      
      // If search input is focused, prevent editor from regaining focus
      if (isSearchInputFocusedRef.current || isReplaceInputFocusedRef.current) {
        event.preventDefault?.()
        return
      }
    }

    const handleFocusAttempt = (event: FocusEvent) => {
      // Check if editor is still valid before accessing view
      if (editor.isDestroyed || !editor.view) return
      
      // If search input is focused, prevent editor from stealing focus
      if (isSearchInputFocusedRef.current || isReplaceInputFocusedRef.current) {
        const target = event.target as HTMLElement
        if (target === editor.view.dom || editor.view.dom.contains(target)) {
          event.preventDefault()
          event.stopPropagation()
          // Keep focus on the search input
          if (isSearchInputFocusedRef.current && inlineSearchInputRef.current) {
            inlineSearchInputRef.current.focus()
          } else if (isReplaceInputFocusedRef.current && inlineReplaceInputRef.current) {
            inlineReplaceInputRef.current.focus()
          }
        }
      }
    }

    // Check again before accessing view.dom (editor might have been destroyed between checks)
    if (editor.isDestroyed || !editor.view) return
    
    const editorElement = editor.view.dom as HTMLElement
    const globalDoc = window.document
    if (editorElement) {
      editorElement.addEventListener('blur', handleEditorBlur, true)
      // Also listen for focus events to prevent stealing
      globalDoc.addEventListener('focusin', handleFocusAttempt, true)
      return () => {
        // Check if editor is still valid before removing listeners
        if (!editor.isDestroyed && editor.view && editorElement) {
          editorElement.removeEventListener('blur', handleEditorBlur, true)
        }
        globalDoc.removeEventListener('focusin', handleFocusAttempt, true)
      }
    }
  }, [editor])

  // Improve Button: 只跟踪 selection.empty，不缓存，只用于显示/隐藏按钮
  useEffect(() => {
    if (!editor) return

    const updatePopupPosition = () => {
      if (!editor || editor.isDestroyed || !editor.view) return
      
      const { from, to } = editor.state.selection
      if (from === to) return // Empty selection
      
      requestAnimationFrame(() => {
        if (!editor || editor.isDestroyed || !editor.view) return
        
        // Re-read selection positions inside requestAnimationFrame to ensure they're still valid
        const currentSelection = editor.state.selection
        const currentFrom = currentSelection.from
        const currentTo = currentSelection.to
        
        // Validate positions are within document bounds
        const docSize = editor.state.doc.content.size
        if (currentFrom < 0 || currentTo < 0 || currentFrom > docSize || currentTo > docSize) {
          setPopupPosition(null)
          setShowRephrasePopup(false)
          return
        }
        
        if (currentFrom === currentTo) {
          setPopupPosition(null)
          setShowRephrasePopup(false)
          return
        }
        
        try {
          // Use ProseMirror coordinates - simple and reliable
          const startCoords = editor.view.coordsAtPos(currentFrom)
          const endCoords = editor.view.coordsAtPos(currentTo)
          
          if (startCoords && endCoords) {
            // Position popup right next to the selected text (4px gap for visual separation)
            setPopupPosition({ x: endCoords.right + 4, y: startCoords.top - 4 })
          } else {
            setPopupPosition(null)
            setShowRephrasePopup(false)
          }
        } catch (error) {
          console.warn('[DocumentEditor] Error updating popup position:', error)
          setPopupPosition(null)
          setShowRephrasePopup(false)
        }
      })
    }

    // Improve Button: 只看 selection.empty，不缓存，长度>20才显示
    const handleSelectionUpdate = () => {
      // 如果 popup 已打开（通过 Ctrl+K），不处理
      if (showRephrasePopup && ctrlKSelectionRef.current) {
        return
      }
      
      // 如果搜索输入框聚焦，不处理
      if (isSearchInputFocusedRef.current || isReplaceInputFocusedRef.current) {
        return
      }
      
      const { from, to } = editor.state.selection
      const isEmpty = from === to
      
      if (isEmpty) {
        setPopupPosition(null)
        setShowRephrasePopup(false)
        ctrlKSelectionRef.current = null
        suppressRephrasePopupRef.current = false
        return
      }
      
      // 读取 selection 长度，只有 > 20 才显示
      const selected = editor.state.doc.textBetween(from, to)
      if (selected.trim().length > 20) {
        if (suppressRephrasePopupRef.current) {
          suppressRephrasePopupRef.current = false
          setShowRephrasePopup(false)
          return
        }
        if (!showRephrasePopup && !ctrlKSelectionRef.current) {
          const context = getSelectionContext(from, to)
          ctrlKSelectionRef.current = { text: selected, range: { from, to }, ...context }
        }
        updatePopupPosition()
        setShowRephrasePopup(true)
      } else {
        setPopupPosition(null)
        setShowRephrasePopup(false)
        ctrlKSelectionRef.current = null
      }
    }

    editor.on('selectionUpdate', handleSelectionUpdate)
    editor.on('transaction', handleSelectionUpdate)

    // 监听 mouseup 事件，捕获三击选中等操作
    const handleMouseUp = () => {
      // 小延迟确保 ProseMirror 已处理选择
      setTimeout(() => {
        if (editor && !editor.isDestroyed && editor.view) {
          handleSelectionUpdate()
        }
      }, 10)
    }

    // Update position on scroll
    const handleScroll = () => {
      if (showRephrasePopup && !ctrlKSelectionRef.current) {
        updatePopupPosition()
      }
    }

    const scrollContainer = scrollContainerRef.current
    if (scrollContainer) {
      scrollContainer.addEventListener('scroll', handleScroll, { passive: true })
      scrollContainer.addEventListener('mouseup', handleMouseUp, { passive: true })
    }

    return () => {
      editor.off('selectionUpdate', handleSelectionUpdate)
      editor.off('transaction', handleSelectionUpdate)
      if (scrollContainer) {
        scrollContainer.removeEventListener('scroll', handleScroll)
        scrollContainer.removeEventListener('mouseup', handleMouseUp)
      }
    }
  }, [editor, showRephrasePopup])

  // Ctrl+K: 唯一允许缓存 selection 的地方，只缓存一次，缓存后彻底断开 selection 生命周期
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')) {
        // 如果 popup 已打开（通过 Ctrl+K），让 TextRephrasePopup 处理
        if (showRephrasePopup && ctrlKSelectionRef.current) {
          return
        }
        
        e.preventDefault()
        
        const currentEditor = editorRef.current
        if (!currentEditor || currentEditor.isDestroyed || !currentEditor.view) {
          return
        }
        
        // 读取当前 selection
        const { from, to } = currentEditor.state.selection
        if (from === to) {
          return // Empty selection
        }
        
        const selected = currentEditor.state.doc.textBetween(from, to)
        if (selected.trim().length === 0) {
          return
        }
        
        // CRITICAL: 只缓存一次，缓存后彻底断开 selection 生命周期
        const context = getSelectionContext(from, to)
        ctrlKSelectionRef.current = {
          text: selected,
          range: { from, to },
          ...context
        }
        
        // 计算位置 - 验证位置有效性
        try {
          const docSize = currentEditor.state.doc.content.size
          if (from >= 0 && to >= 0 && from <= docSize && to <= docSize) {
            const startCoords = currentEditor.view.coordsAtPos(from)
            const endCoords = currentEditor.view.coordsAtPos(to)
            if (startCoords && endCoords) {
              // Position popup right next to the selected text (4px gap for visual separation)
              setPopupPosition({ x: endCoords.right + 4, y: startCoords.top - 4 })
            }
          }
        } catch (error) {
          console.warn('[DocumentEditor] Error calculating popup position for Ctrl+K:', error)
        }
        
        // 打开 popup
        setShowRephrasePopup(true)
        
        // 触发自动展开
        ;(window as any).__triggerRephraseExpand = true
        requestAnimationFrame(() => {
          window.dispatchEvent(new CustomEvent('rephrase-popup-open'))
        })
      }
    }

    window.addEventListener('keydown', handleKeyDown, { capture: true, passive: false })
    return () => {
      window.removeEventListener('keydown', handleKeyDown, { capture: true })
    }
  }, [showRephrasePopup])

  // Note: Scroll position restoration is now handled in Layout.tsx immediately after setContent
  // to avoid any scrolling animation. This useEffect is kept as a fallback for edge cases.
  // The Layout component restores scroll position using requestAnimationFrame for instant positioning.
  // useEffect(() => {
  //   if (!document?.id || !scrollContainerRef.current) return

  //   const savedScrollTop = loadScrollPosition(document.id)
  //   if (savedScrollTop !== null) {
  //     // Small delay to ensure content is rendered
  //     setTimeout(() => {
  //       if (scrollContainerRef.current) {
  //         scrollContainerRef.current.scrollTop = savedScrollTop
  //       }
  //     }, 100)
  //   }
  // }, [document?.id])

  // Add scroll detection and edge detection to show scrollbar
  useEffect(() => {
    const container = scrollContainerRef.current
    if (!container || !document?.id) return

    const EDGE_DISTANCE = 20 // pixels from edge to show scrollbar

    const handleScroll = () => {
      if (container) {
        container.classList.add('scrolling')
        if (scrollTimeoutRef.current) {
          clearTimeout(scrollTimeoutRef.current)
        }
        scrollTimeoutRef.current = setTimeout(() => {
          if (container) {
            container.classList.remove('scrolling')
          }
        }, 600) // Slightly longer than transition duration (400ms) to allow fade-out

        // Save scroll position with debouncing
        if (scrollSaveTimeoutRef.current) {
          clearTimeout(scrollSaveTimeoutRef.current)
        }
        scrollSaveTimeoutRef.current = setTimeout(() => {
          saveScrollPosition(document.id, container.scrollTop)
        }, 300)
      }
    }

    const handleMouseMove = (e: MouseEvent) => {
      if (!container) return
      const rect = container.getBoundingClientRect()
      const mouseX = e.clientX - rect.left
      const mouseY = e.clientY - rect.top
      const width = rect.width
      const height = rect.height
      
      // Check if mouse is near right edge (for vertical scrollbar) or bottom edge (for horizontal scrollbar)
      const nearRightEdge = mouseX > width - EDGE_DISTANCE
      const nearBottomEdge = mouseY > height - EDGE_DISTANCE
      
      if (nearRightEdge || nearBottomEdge) {
        container.classList.add('show-scrollbar')
      } else {
        container.classList.remove('show-scrollbar')
      }
    }

    const handleMouseLeave = () => {
      if (container) {
        container.classList.remove('show-scrollbar')
      }
    }

    container.addEventListener('scroll', handleScroll, { passive: true })
    container.addEventListener('mousemove', handleMouseMove, { passive: true })
    container.addEventListener('mouseleave', handleMouseLeave)
    
    return () => {
      container.removeEventListener('scroll', handleScroll)
      container.removeEventListener('mousemove', handleMouseMove)
      container.removeEventListener('mouseleave', handleMouseLeave)
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current)
      }
      if (scrollSaveTimeoutRef.current) {
        clearTimeout(scrollSaveTimeoutRef.current)
      }
    }
  }, [document?.id])

  // Clear inline search highlights (both all matches and current match highlights)
  const clearInlineSearchHighlights = () => {
    if (!editor || editor.isDestroyed || !editor.view) return
    
    try {
      const { state, dispatch } = editor.view
      const { tr } = state
      let modified = false
      
      // Find all highlight marks and remove inline search highlights
      state.doc.descendants((node, pos) => {
        if (node.marks) {
          node.marks.forEach((mark) => {
            if (mark.type.name === 'highlight') {
              const color = mark.attrs?.color
              // Use specific colors to identify inline search highlights (distinct from global search)
              // Dark mode: All matches: #6b7280, Current match: #6366f1
              // Light mode: All matches: #93c5fd, Current match: #818cf8
              if (color === '#fde047' || color === '#6b7280' || color === '#6366f1' || color === '#93c5fd' || color === '#818cf8') {
                const from = pos
                const to = pos + node.nodeSize
                tr.removeMark(from, to, mark.type)
                modified = true
              }
            }
          })
        }
      })
      
      if (modified) {
        dispatch(tr)
      }
    } catch (error) {
      console.error('Error clearing inline search highlights:', error)
    }
  }

  // Check if document is a PDF
  const isPDF = document && document.title.toLowerCase().endsWith('.pdf')

  // Find all matches in the document (supports both regular documents and PDFs)
  const findMatches = (query: string, caseSensitive: boolean = false): Array<{ from: number; to: number; pageNumber?: number }> => {
    if (!query.trim()) return []
    
    const matches: Array<{ from: number; to: number; pageNumber?: number }> = []
    const searchText = caseSensitive ? query : query.toLowerCase()
    
    // If PDF, search PDF text
    if (isPDF && document?.pdfText) {
      try {
        const pdfText = document.pdfText
        // Search through all pages
        pdfText.pages.forEach((page) => {
          const pageText = caseSensitive ? page.fullText : page.fullText.toLowerCase()
          let searchIndex = 0
          
          while (true) {
            const index = pageText.indexOf(searchText, searchIndex)
            if (index === -1) break
            
            // For PDFs, we use character positions within the page
            // Store page number for navigation
            matches.push({
              from: index,
              to: index + query.length,
              pageNumber: page.pageNumber,
            })
            searchIndex = index + 1
          }
        })
      } catch (error) {
        console.error('Error finding matches in PDF:', error)
      }
    } else if (editor) {
      // Regular document - search editor content
      try {
        editor.state.doc.descendants((node: any, pos: number) => {
          if (node.isText) {
            const text = node.text || ''
            const textToSearch = caseSensitive ? text : text.toLowerCase()
            let searchIndex = 0
            
            while (true) {
              const index = textToSearch.indexOf(searchText, searchIndex)
              if (index === -1) break
              
              const from = pos + index
              const to = from + query.length
              matches.push({ from, to })
              searchIndex = index + 1
            }
          }
        })
      } catch (error) {
        console.error('Error finding matches:', error)
      }
    }
    
    return matches
  }

  // Perform search manually (called on Enter)
  const performSearch = () => {
    if (!searchQuery.trim()) {
      clearInlineSearchHighlights()
      setMatches([])
      setCurrentMatchIndex(-1)
      setActiveSearchQuery('')
      return
    }
    
    // For non-PDF documents, clear previous highlights
    if (!isPDF && editor) {
      clearInlineSearchHighlights()
    }
    
    const foundMatches = findMatches(searchQuery, false) // Always case-insensitive now
    setMatches(foundMatches)
    setActiveSearchQuery(searchQuery)
    
    if (foundMatches.length > 0) {
      setCurrentMatchIndex(0)
      // Highlight all matches (only for non-PDF documents)
      if (!isPDF && editor) {
        highlightMatches(foundMatches, 0)
        navigateToMatch(0, foundMatches)
      } else if (isPDF) {
        // For PDFs, just navigate to the first match page
        navigateToPDFMatch(0, foundMatches)
      }
    } else {
      setCurrentMatchIndex(-1)
      if (!isPDF && editor) {
        highlightMatches(foundMatches, -1)
      }
    }
  }

  useEffect(() => {
    if (!showInlineSearch) return
    const trimmedQuery = searchQuery.trim()
    if (!trimmedQuery) {
      clearInlineSearchHighlights()
      setMatches([])
      setCurrentMatchIndex(-1)
      setActiveSearchQuery('')
      return
    }
    const debounceId = setTimeout(() => {
      performSearch()
    }, 200)
    return () => clearTimeout(debounceId)
  }, [searchQuery, showInlineSearch, editor, isPDF])

  // Navigate to PDF match (scroll to page in PDF viewer)
  const navigateToPDFMatch = (index: number, matchesToUse?: Array<{ from: number; to: number; pageNumber?: number }>) => {
    const matchesList = matchesToUse || matches
    if (matchesList.length === 0 || index < 0 || index >= matchesList.length) return
    
    const match = matchesList[index]
    if (match && match.pageNumber) {
      // TODO: Implement PDF page navigation
      // For now, we can show a message or try to communicate with the PDF iframe
      // This would require using pdfjs-dist to render PDFs instead of iframe
      // In the future, we can integrate with pdfjs-dist to highlight and navigate
    }
  }

  // Navigate to previous match
  const navigateToPrevious = () => {
    if (matches.length === 0) return
    const prevIndex = currentMatchIndex <= 0 ? matches.length - 1 : currentMatchIndex - 1
    setCurrentMatchIndex(prevIndex)
    
    if (isPDF) {
      navigateToPDFMatch(prevIndex)
    } else if (editor) {
      updateCurrentMatchHighlight(prevIndex)
      navigateToMatch(prevIndex)
    }
  }

  // Navigate to next match
  const navigateToNext = () => {
    if (matches.length === 0) return
    const nextIndex = (currentMatchIndex + 1) % matches.length
    setCurrentMatchIndex(nextIndex)
    
    if (isPDF) {
      navigateToPDFMatch(nextIndex)
    } else if (editor) {
      updateCurrentMatchHighlight(nextIndex)
      navigateToMatch(nextIndex)
    }
  }

  // Highlight all matches (temporary highlights) - all matches get the same color
  const highlightMatches = (matchesToHighlight: Array<{ from: number; to: number }>, currentIndex: number = -1) => {
    if (!editor || editor.isDestroyed || !editor.view || matchesToHighlight.length === 0) {
      // Clear highlights if no matches
      clearInlineSearchHighlights()
      return
    }
    
    try {
      // Always clear existing highlights before adding new ones
      clearInlineSearchHighlights()
      
      const { state, dispatch } = editor.view
      const { tr } = state
      // Use theme-aware colors for matches
      const allMatchesColor = theme === 'dark' ? '#6b7280' : '#93c5fd'
      // Use purple/indigo for current match
      const currentMatchColor = theme === 'dark' ? '#6366f1' : '#818cf8'
      
      matchesToHighlight.forEach(({ from, to }, index) => {
        // Use different color for current match
        const color = index === currentIndex ? currentMatchColor : allMatchesColor
        tr.addMark(from, to, state.schema.marks.highlight.create({ color }))
      })
      
      dispatch(tr)
    } catch (error) {
      console.error('Error highlighting matches:', error)
    }
  }

  // Update current match highlight when navigating
  const updateCurrentMatchHighlight = (newIndex: number) => {
    if (!editor || matches.length === 0 || newIndex < 0 || newIndex >= matches.length) return
    
    try {
      const { state, dispatch } = editor.view
      const { tr } = state
      const allMatchesColor = '#6b7280'
      const currentMatchColor = '#6366f1'
      
      // Remove highlight from previous current match
      if (currentMatchIndex >= 0 && currentMatchIndex < matches.length) {
        const prevMatch = matches[currentMatchIndex]
        tr.removeMark(prevMatch.from, prevMatch.to, state.schema.marks.highlight)
        tr.addMark(prevMatch.from, prevMatch.to, state.schema.marks.highlight.create({ color: allMatchesColor }))
      }
      
      // Add highlight to new current match
      const newMatch = matches[newIndex]
      tr.removeMark(newMatch.from, newMatch.to, state.schema.marks.highlight)
      tr.addMark(newMatch.from, newMatch.to, state.schema.marks.highlight.create({ color: currentMatchColor }))
      
      dispatch(tr)
    } catch (error) {
      console.error('Error updating current match highlight:', error)
    }
  }

  // Navigate to a specific match
  const navigateToMatch = (index: number, matchesToUse?: Array<{ from: number; to: number }>) => {
    const matchesList = matchesToUse || matches
    if (!editor || matchesList.length === 0 || index < 0 || index >= matchesList.length) return
    
    const match = matchesList[index]
    try {
      // Update highlight for current match if navigating within existing matches
      if (!matchesToUse && currentMatchIndex !== index && currentMatchIndex >= 0) {
        updateCurrentMatchHighlight(index)
      }
      
      // Don't set text selection - just scroll to the match
      // The highlight is enough to show which match is current
      
      // Scroll to match
      setTimeout(() => {
        if (editor.isDestroyed || !editor.view) return
        try {
          // Validate position is within document bounds
          const docSize = editor.state.doc.content.size
          if (match.from < 0 || match.from > docSize) {
            console.warn('[DocumentEditor] Match position out of range:', match.from)
            return
          }
          const coords = editor.view.coordsAtPos(match.from)
          if (coords && scrollContainerRef.current) {
            const container = scrollContainerRef.current
            const containerRect = container.getBoundingClientRect()
            const matchY = coords.top - containerRect.top + container.scrollTop
            const viewportHeight = container.clientHeight
            const targetY = matchY - viewportHeight * 0.3 // Position at 30% from top
            
            container.scrollTop = Math.max(0, targetY)
          }
        } catch (error) {
          console.warn('[DocumentEditor] Error scrolling to match:', error)
        }
      }, 50)
    } catch (error) {
      console.error('Error navigating to match:', error)
    }
  }

  // Calculate right offset based on AI panel state
  useEffect(() => {
    const calculateRightOffset = () => {
      if (!isAIPanelOpen) return 20
      // AI panel takes up a percentage of the viewport width
      // FileExplorer typically takes ~14% of width, so AI panel is percentage of remaining 86%
      const viewportWidth = window.innerWidth
      const fileExplorerPercent = 14 // Approximate FileExplorer width
      const remainingWidth = viewportWidth * (1 - fileExplorerPercent / 100)
      const aiPanelPixelWidth = remainingWidth * (aiPanelWidth / 100)
      return aiPanelPixelWidth + 20 // Add 20px margin
    }
    
    setRightOffset(calculateRightOffset())
    
    // Update on window resize
    const handleResize = () => {
      setRightOffset(calculateRightOffset())
    }
    
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [isAIPanelOpen, aiPanelWidth])

  // Clear search when dialog closes - ensure highlights are removed
  useEffect(() => {
    if (!showInlineSearch) {
      // Clear highlights immediately when dialog closes
      clearInlineSearchHighlights()
      setMatches([])
      setCurrentMatchIndex(-1)
      setActiveSearchQuery('')
      setSearchQuery('')
      setReplaceQuery('')
    }
  }, [showInlineSearch, editor])

  // Clear search highlights when document or editor changes
  // In multi-editor architecture, each document has its own editor instance
  // When switching documents, we need to clear search state for the previous document
  const prevDocumentIdRef = useRef<string | undefined>(undefined)
  const prevEditorRef = useRef<Editor | null>(null)
  useEffect(() => {
    // Clear if document changed OR editor instance changed
    const documentChanged = prevDocumentIdRef.current !== undefined && prevDocumentIdRef.current !== document?.id
    const editorChanged = prevEditorRef.current !== null && prevEditorRef.current !== editor
    
    if (documentChanged || editorChanged) {
      // Clear highlights and search state when switching documents or editor changes
      // Note: In multi-editor architecture, each editor maintains its own state
      // We only need to clear the UI state (search highlights, matches, etc.)
      clearInlineSearchHighlights()
      setMatches([])
      setCurrentMatchIndex(-1)
      setActiveSearchQuery('')
      setSearchQuery('')
      setReplaceQuery('')
      setShowInlineSearch(false)
    }
    
    // Update the refs to track current document ID and editor
    prevDocumentIdRef.current = document?.id
    prevEditorRef.current = editor
  }, [document?.id, editor])

  // Handle replace current match
  const handleReplace = () => {
    if (!editor || currentMatchIndex < 0 || currentMatchIndex >= matches.length || !replaceQuery.trim()) return
    
    const match = matches[currentMatchIndex]
    try {
      // Set selection only when replacing (needed for the replace operation)
      editor.chain()
        .focus()
        .setTextSelection(match)
        .deleteSelection()
        .insertContent(replaceQuery)
        .run()
      
      // Re-search to update matches
      const newMatches = findMatches(activeSearchQuery, false)
      setMatches(newMatches)
      
      // Adjust current match index and highlight
      if (currentMatchIndex < newMatches.length) {
        highlightMatches(newMatches, currentMatchIndex)
        navigateToMatch(currentMatchIndex)
      } else if (newMatches.length > 0) {
        const newIndex = newMatches.length - 1
        setCurrentMatchIndex(newIndex)
        highlightMatches(newMatches, newIndex)
        navigateToMatch(newIndex)
      } else {
        setCurrentMatchIndex(-1)
        highlightMatches(newMatches, -1)
      }
      
      // Restore focus to replace input after replace
      requestAnimationFrame(() => {
        inlineReplaceInputRef.current?.focus()
      })
    } catch (error) {
      console.error('Error replacing text:', error)
    }
  }

  // Handle replace all
  const handleReplaceAll = () => {
    if (!editor || matches.length === 0 || !replaceQuery.trim()) return
    
    try {
      // Replace from end to start to preserve positions
      const sortedMatches = [...matches].sort((a, b) => b.from - a.from)
      
      editor.chain().focus().run()
      
      sortedMatches.forEach((match) => {
        editor.chain()
          .setTextSelection(match)
          .deleteSelection()
          .insertContent(replaceQuery)
          .run()
      })
      
      // Clear search
      setSearchQuery('')
      setMatches([])
      setCurrentMatchIndex(-1)
      clearInlineSearchHighlights()
    } catch (error) {
      console.error('Error replacing all:', error)
    }
  }

  // Handle Escape key to close search (when search is open)
  useEffect(() => {
    if (!showInlineSearch) return
    
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't interfere with input fields - input handlers will handle their own keys
      if (e.target instanceof HTMLInputElement) {
        // Let the input's onKeyDown handler handle Enter and Escape
        // This listener only handles Escape when input is not focused
        if (e.key === 'Escape' && e.target !== inlineSearchInputRef.current && e.target !== inlineReplaceInputRef.current) {
          e.preventDefault()
          setShowInlineSearch(false)
          setSearchQuery('')
          setReplaceQuery('')
          clearInlineSearchHighlights()
          editor?.chain().focus().run()
          return
        }
        return
      }
      
      // Handle Escape when search is open but no input is focused
      if (e.key === 'Escape') {
        e.preventDefault()
        setShowInlineSearch(false)
        setSearchQuery('')
        setReplaceQuery('')
        clearInlineSearchHighlights()
        editor?.chain().focus().run()
        return
      }
      
      // Note: Ctrl+F handling is done in Layout.tsx to avoid conflicts
    }
    
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [showInlineSearch, editor])

  // Note: Ctrl+F handling is now done in Layout.tsx to avoid conflicts
  // Layout delegates to the active surface (DocumentEditor or PDFViewer)

  // Focus search input when opening
  useEffect(() => {
    if (showInlineSearch && inlineSearchInputRef.current) {
      setTimeout(() => {
        inlineSearchInputRef.current?.focus()
        inlineSearchInputRef.current?.select()
      }, 50)
    }
  }, [showInlineSearch])

  if (!document) {
    return (
      <div style={{ 
        height: '100%', 
        display: 'flex', 
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
        backgroundColor: bgColor,
        color: textColor
      }}>
        <h2 style={{ marginBottom: '16px', color: textColor }}>No Document Open</h2>
        <button 
          onClick={handleNewDocument}
          style={{
            padding: '12px 24px',
            backgroundColor: theme === 'dark' ? '#1a73e8' : '#1a73e8',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer',
            fontSize: '16px',
            transition: 'background-color 0.2s'
          }}
          onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#1765cc'}
          onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#1a73e8'}
        >
          Create New Document
        </button>
      </div>
    )
  }

  if (!editor) {
    return null
  }

  return (
    <>
      <div style={{ 
        height: '100%', 
        display: 'flex', 
        flexDirection: 'column',
        backgroundColor: bgColor,
      }}>
        <div 
          ref={scrollContainerRef}
          className={`scrollable-container ${theme === 'dark' ? 'dark-theme' : ''}`}
          style={{ 
            flex: 1, 
            overflow: 'auto', 
            paddingTop: '72px',
            paddingBottom: '400px',
            paddingLeft: '120px',
            paddingRight: '120px',
            marginRight: isAIPanelOpen ? '1px' : '0px', // Add margin when AI panel is open to prevent scrollbar overlap with resize handle
            position: 'relative',
            backgroundColor: bgColor,
            cursor: 'text',
            userSelect: 'text',
            WebkitUserSelect: 'text',
            MozUserSelect: 'text',
            msUserSelect: 'text'
          }}
        onMouseDown={(e) => {
          const target = e.target as HTMLElement
          
          // Let ProseMirror handle all clicks inside the content area
          if (target.closest('.ProseMirror')) {
            return
          }
          
          // Track mouse position to detect drag vs click
          isDraggingRef.current = false
          isTextSelectionActiveRef.current = false
          mouseDownPosRef.current = { x: e.clientX, y: e.clientY }
          
          // For clicks in the padding area, find the position at the click coordinates
          if (!editor || !scrollContainerRef.current) return
          
          const editorElement = scrollContainerRef.current.querySelector('.ProseMirror') as HTMLElement
          if (!editorElement) return
          
          const view = editor.view
          const editorRect = editorElement.getBoundingClientRect()
          const clickX = e.clientX
          const clickY = e.clientY
          
          // Determine if click is on left or right padding
          const isLeftPadding = clickX < editorRect.left
          const isRightPadding = clickX > editorRect.right
          
          // Helper function to find horizontal rule at a Y position
          const findHorizontalRule = (yPos: number): { hr: HTMLElement; isBelow: boolean } | null => {
            const horizontalRules = editorElement.querySelectorAll('hr')
            let closest: HTMLElement | null = null
            let minDistance = Infinity
            let isBelow = false
            
            horizontalRules.forEach((hr) => {
              const hrElement = hr as HTMLElement
              const hrRect = hrElement.getBoundingClientRect()
              const hrTop = hrRect.top
              const hrBottom = hrRect.bottom
              
              // Check if click is near the horizontal rule (within 20px)
              if (yPos >= hrTop - 20 && yPos <= hrBottom + 20) {
                const distance = Math.min(Math.abs(yPos - hrTop), Math.abs(yPos - hrBottom))
                if (distance < minDistance) {
                  minDistance = distance
                  closest = hrElement
                  isBelow = yPos > hrBottom
                }
              }
            })
            
            if (closest) {
              return { hr: closest, isBelow }
            }
            return null
          }
          
          // Helper function to find closest paragraph to a Y position
          const findClosestParagraph = (yPos: number): HTMLElement | null => {
            // First try to find paragraphs (p elements) - these are the actual text containers
            const paragraphs = editorElement.querySelectorAll('p, h1, h2, h3, h4, h5, h6')
            let closest: HTMLElement | null = null
            let minDistance = Infinity
            
            paragraphs.forEach((p) => {
              const pElement = p as HTMLElement
              const pRect = pElement.getBoundingClientRect()
              const pTop = pRect.top
              const pBottom = pRect.bottom
              
              let distance: number
              if (yPos >= pTop && yPos <= pBottom) {
                distance = 0
              } else {
                distance = Math.min(Math.abs(yPos - pTop), Math.abs(yPos - pBottom))
              }
              
              if (distance < minDistance) {
                minDistance = distance
                closest = pElement
              }
            })
            
            // If no paragraph found, try list items and find their inner paragraph
            if (!closest) {
              const listItems = editorElement.querySelectorAll('li')
              listItems.forEach((li) => {
                const liElement = li as HTMLElement
                const liRect = liElement.getBoundingClientRect()
                
                let distance: number
                if (yPos >= liRect.top && yPos <= liRect.bottom) {
                  distance = 0
                } else {
                  distance = Math.min(Math.abs(yPos - liRect.top), Math.abs(yPos - liRect.bottom))
                }
                
                if (distance < minDistance) {
                  minDistance = distance
                  // Find the first paragraph inside this list item
                  const innerP = liElement.querySelector(':scope > p')
                  closest = (innerP as HTMLElement) || liElement
                }
              })
            }
            
            return closest
          }
          
          // Helper function to find paragraph after a horizontal rule
          const findParagraphAfterHR = (hrElement: HTMLElement): HTMLElement | null => {
            // Get all block elements (paragraphs, headings, etc.)
            const allBlocks = editorElement.querySelectorAll('p, h1, h2, h3, h4, h5, h6, li, hr')
            
            for (let i = 0; i < allBlocks.length; i++) {
              const block = allBlocks[i] as HTMLElement
              if (block === hrElement) {
                // Find the next paragraph/heading after this hr
                for (let j = i + 1; j < allBlocks.length; j++) {
                  const nextBlock = allBlocks[j] as HTMLElement
                  const tagName = nextBlock.tagName.toLowerCase()
                  
                  if (tagName === 'p' || tagName.startsWith('h')) {
                    return nextBlock
                  } else if (tagName === 'li') {
                    const innerP = nextBlock.querySelector(':scope > p')
                    if (innerP) return innerP as HTMLElement
                    return nextBlock
                  } else if (tagName === 'hr') {
                    // Another hr found, stop searching
                    break
                  }
                }
                break
              }
            }
            
            return null
          }
          
          // Helper function to find paragraph before a horizontal rule
          const findParagraphBeforeHR = (hrElement: HTMLElement): HTMLElement | null => {
            // Get all block elements (paragraphs, headings, etc.)
            const allBlocks = editorElement.querySelectorAll('p, h1, h2, h3, h4, h5, h6, li, hr')
            
            for (let i = 0; i < allBlocks.length; i++) {
              const block = allBlocks[i] as HTMLElement
              if (block === hrElement) {
                // Find the previous paragraph/heading before this hr
                for (let j = i - 1; j >= 0; j--) {
                  const prevBlock = allBlocks[j] as HTMLElement
                  const tagName = prevBlock.tagName.toLowerCase()
                  
                  if (tagName === 'p' || tagName.startsWith('h')) {
                    return prevBlock
                  } else if (tagName === 'li') {
                    const innerP = prevBlock.querySelector(':scope > p')
                    if (innerP) return innerP as HTMLElement
                    return prevBlock
                  } else if (tagName === 'hr') {
                    // Another hr found, stop searching
                    break
                  }
                }
                break
              }
            }
            
            return null
          }
          
          // Find the paragraph/line closest to the click Y position
          const closestParagraph = findClosestParagraph(clickY)
          
          // Helper function to get position at coordinates, with fallback for padding areas
          const getPositionAtCoords = (x: number, y: number): number | null => {
            const paragraph = findClosestParagraph(y)
            if (!paragraph) return null
            
            const pRect = paragraph.getBoundingClientRect()
            const isInLeftPadding = x < editorRect.left
            const isInRightPadding = x > editorRect.right
            
            if (isInLeftPadding) {
              // In left padding - get position at start of line
              const coords = { left: pRect.left, top: y }
              const pos = view.posAtCoords(coords)
              if (pos) return pos.pos
              
              // Fallback: start of paragraph - for list items, get inner paragraph
              let targetElement = paragraph
              if (paragraph.tagName.toLowerCase() === 'li') {
                const innerP = paragraph.querySelector(':scope > p')
                if (innerP) targetElement = innerP as HTMLElement
              }
              const domPos = view.posAtDOM(targetElement, 0)
              return domPos ?? null
            } else if (isInRightPadding) {
              // In right padding - get position at end of line
              const startCoords = { left: pRect.left, top: y }
              const startPos = view.posAtCoords(startCoords)
              
              if (startPos) {
                // For list items, get the inner paragraph
                let targetElement = paragraph
                if (paragraph.tagName.toLowerCase() === 'li') {
                  const innerP = paragraph.querySelector(':scope > p')
                  if (innerP) targetElement = innerP as HTMLElement
                }
                
                const domPos = view.posAtDOM(targetElement, 0)
                const paragraphText = targetElement.textContent || ''
                const paragraphEndPos = domPos !== null && domPos !== undefined ? domPos + paragraphText.length : null
                
                if (paragraphEndPos !== null) {
                  let left = startPos.pos
                  let right = paragraphEndPos
                  let bestPos = startPos.pos
                  const lineYThreshold = 5
                  
                  const startCoordsAtPos = view.coordsAtPos(startPos.pos)
                  const targetY = startCoordsAtPos ? startCoordsAtPos.top : y
                  
                  while (left <= right) {
                    const mid = Math.floor((left + right) / 2)
                    const midCoords = view.coordsAtPos(mid)
                    
                    if (midCoords && Math.abs(midCoords.top - targetY) < lineYThreshold) {
                      bestPos = mid
                      left = mid + 1
                    } else {
                      right = mid - 1
                    }
                  }
                  return bestPos
                }
                return startPos.pos
              }
              
              // Fallback: end of paragraph - for list items, get inner paragraph
              let targetElement = paragraph
              if (paragraph.tagName.toLowerCase() === 'li') {
                const innerP = paragraph.querySelector(':scope > p')
                if (innerP) targetElement = innerP as HTMLElement
              }
              const domPos = view.posAtDOM(targetElement, 0)
              if (domPos !== null && domPos !== undefined) {
                const paragraphText = targetElement.textContent || ''
                return domPos + paragraphText.length
              }
              return null
            } else {
              // Inside content area or top/bottom padding
              const coords = { left: x, top: y }
              const pos = view.posAtCoords(coords)
              if (pos) return pos.pos
              
              // Fallback to paragraph position
              const domPos = view.posAtDOM(paragraph, 0)
              return domPos ?? null
            }
          }
          
          // Define function to get cursor position at click coordinates
          const getCursorPosition = (): number | null => {
            // First check if click is near a horizontal rule
            const hrInfo = findHorizontalRule(clickY)
            if (hrInfo) {
              const { hr, isBelow } = hrInfo
              
              if (isBelow) {
                // Click is below the horizontal rule - place cursor at start of next paragraph
                const nextParagraph = findParagraphAfterHR(hr)
                if (nextParagraph) {
                  let targetElement = nextParagraph
                  if (nextParagraph.tagName.toLowerCase() === 'li') {
                    const innerP = nextParagraph.querySelector(':scope > p')
                    if (innerP) targetElement = innerP as HTMLElement
                  }
                  
                  const domPos = view.posAtDOM(targetElement, 0)
                  if (domPos !== null && domPos !== undefined) {
                    return domPos
                  }
                } else {
                  // No paragraph after hr, create position after the hr
                  const hrPos = view.posAtDOM(hr, 0)
                  if (hrPos !== null && hrPos !== undefined) {
                    // Get the hr node size and place cursor after it
                    const hrNode = view.state.doc.nodeAt(hrPos)
                    if (hrNode) {
                      return hrPos + hrNode.nodeSize
                    }
                    return hrPos + 1
                  }
                }
              } else {
                // Click is above the horizontal rule - place cursor at end of previous paragraph
                const prevParagraph = findParagraphBeforeHR(hr)
                if (prevParagraph) {
                  let targetElement = prevParagraph
                  if (prevParagraph.tagName.toLowerCase() === 'li') {
                    const innerP = prevParagraph.querySelector(':scope > p')
                    if (innerP) targetElement = innerP as HTMLElement
                  }
                  
                  const domPos = view.posAtDOM(targetElement, 0)
                  if (domPos !== null && domPos !== undefined) {
                    // Find the paragraph node in the document structure
                    const $pos = view.state.doc.resolve(domPos)
                    
                    // Find the paragraph node depth
                    let paragraphDepth = -1
                    let paragraphNode = null
                    for (let d = $pos.depth; d > 0; d--) {
                      const node = $pos.node(d)
                      if (node.type.name === 'paragraph' || 
                          node.type.name.startsWith('heading') ||
                          node.type.name === 'title' ||
                          node.type.name === 'subtitle') {
                        paragraphNode = node
                        paragraphDepth = d
                        break
                      }
                    }
                    
                    if (paragraphNode && paragraphDepth >= 0) {
                      const paragraphStart = $pos.start(paragraphDepth)
                      const paragraphEnd = paragraphStart + paragraphNode.content.size
                      return paragraphEnd
                    }
                    
                    // Fallback: use text content length
                    const paragraphText = targetElement.textContent || ''
                    return domPos + paragraphText.length
                  }
                } else {
                  // No paragraph before hr, create position before the hr
                  const hrPos = view.posAtDOM(hr, 0)
                  if (hrPos !== null && hrPos !== undefined) {
                    return hrPos
                  }
                }
              }
            }
            
            if (!closestParagraph) {
              return null
            }
            
            const paragraph: HTMLElement = closestParagraph
            
            if (isLeftPadding) {
              // Click on left padding: place cursor at the START of the line (left side)
              // For list items, find the inner paragraph
              let targetElement = paragraph
              if (paragraph.tagName.toLowerCase() === 'li') {
                const innerP = paragraph.querySelector(':scope > p')
                if (innerP) targetElement = innerP as HTMLElement
              }
              
              // Use coordinates at the left edge of the element, at the click Y position
              const pRect = targetElement.getBoundingClientRect()
              const coords = { left: pRect.left, top: clickY }
              const pos = view.posAtCoords(coords)
              if (pos) {
                return pos.pos
              } else {
                // Fallback: get start position of paragraph
                const domPos = view.posAtDOM(targetElement, 0)
                if (domPos !== null && domPos !== undefined) {
                  return domPos
                }
              }
              } else if (isRightPadding) {
                // Click on right padding: place cursor at the absolute END of the paragraph (ignoring marks)
                // For list items, find the inner paragraph
                let targetElement = paragraph
                if (paragraph.tagName.toLowerCase() === 'li') {
                  const innerP = paragraph.querySelector(':scope > p')
                  if (innerP) targetElement = innerP as HTMLElement
                }
                
                // Get the paragraph node position in the document
                const domPos = view.posAtDOM(targetElement, 0)
                if (domPos !== null && domPos !== undefined) {
                  // Find the paragraph node in the document structure
                  const $pos = view.state.doc.resolve(domPos)
                  
                  // Find the paragraph node depth
                  let paragraphDepth = -1
                  let paragraphNode = null
                  for (let d = $pos.depth; d > 0; d--) {
                    const node = $pos.node(d)
                    if (node.type.name === 'paragraph' || 
                        node.type.name.startsWith('heading') ||
                        node.type.name === 'title' ||
                        node.type.name === 'subtitle') {
                      paragraphNode = node
                      paragraphDepth = d
                      break
                    }
                  }
                  
                  if (paragraphNode && paragraphDepth >= 0) {
                    // Calculate the absolute end of the paragraph (ignoring all marks)
                    // This is the position after all content in the paragraph
                    const paragraphStart = $pos.start(paragraphDepth)
                    const paragraphEnd = paragraphStart + paragraphNode.content.size
                    
                    // Check if paragraph end is on the same line as the click
                    const startCoords = { left: targetElement.getBoundingClientRect().left, top: clickY }
                    const startPos = view.posAtCoords(startCoords)
                    
                    if (startPos) {
                      const startCoordsAtPos = view.coordsAtPos(startPos.pos)
                      const endCoords = view.coordsAtPos(paragraphEnd)
                      const lineYThreshold = 10 // pixels tolerance for same line
                      
                      // If paragraph end is on the same line, use it directly
                      if (endCoords && startCoordsAtPos && 
                          Math.abs(endCoords.top - startCoordsAtPos.top) < lineYThreshold) {
                        return paragraphEnd
                      }
                      
                      // Different line: find end of current line using binary search
                      // But still ensure we're at the absolute end of content on that line
                      const targetY = startCoordsAtPos ? startCoordsAtPos.top : clickY
                      let left = startPos.pos
                      let right = paragraphEnd
                      let bestPos = startPos.pos
                      
                      while (left <= right) {
                        const mid = Math.floor((left + right) / 2)
                        const midCoords = view.coordsAtPos(mid)
                        
                        if (midCoords && Math.abs(midCoords.top - targetY) < lineYThreshold) {
                          bestPos = mid
                          left = mid + 1
                        } else {
                          right = mid - 1
                        }
                      }
                      
                      // Ensure we're at the absolute end of content on this line
                      // Check for images or other block nodes on the same line
                      const lineYThreshold2 = 5
                      let imageAfterPos = -1
                      view.state.doc.nodesBetween(startPos.pos, paragraphEnd, (node, nodePos) => {
                        if (node.type.name === 'image') {
                          const imageCoords = view.coordsAtPos(nodePos)
                          if (imageCoords && Math.abs(imageCoords.top - targetY) < lineYThreshold2) {
                            const afterImagePos = nodePos + node.nodeSize
                            if (afterImagePos > imageAfterPos && afterImagePos <= paragraphEnd) {
                              imageAfterPos = afterImagePos
                            }
                          }
                        }
                      })
                      
                      if (imageAfterPos > 0 && imageAfterPos > bestPos) {
                        return imageAfterPos
                      }
                      
                      return bestPos
                    } else {
                      // Fallback: use paragraph absolute end
                      return paragraphEnd
                    }
                  }
                  
                  // Fallback: try to get paragraph end using node size
                  const paragraphNodeAtPos = view.state.doc.nodeAt(domPos)
                  if (paragraphNodeAtPos) {
                    return domPos + paragraphNodeAtPos.content.size
                  }
                }
                
                // Final fallback: try coordinate at right edge
                const pRect = targetElement.getBoundingClientRect()
                const contentMaxWidth = 816
                const editorContainerRect = scrollContainerRef.current?.getBoundingClientRect()
                const contentRight = editorContainerRect ? editorContainerRect.left + 120 + contentMaxWidth : pRect.right
                const coords = { left: contentRight, top: clickY }
                const pos = view.posAtCoords(coords)
                if (pos) {
                  return pos.pos
                }
                
                // Last resort: use text content length
                const fallbackDomPos = view.posAtDOM(targetElement, 0)
                if (fallbackDomPos !== null && fallbackDomPos !== undefined) {
                  const paragraphText = targetElement.textContent || ''
                  return fallbackDomPos + paragraphText.length
                }
            } else {
              // Click is somewhere else (top/bottom padding), use coordinate-based positioning
              const coords = { left: e.clientX, top: e.clientY }
              const pos = view.posAtCoords(coords)
              if (pos) {
                return pos.pos
              } else {
                // Check if click is below the last paragraph (bottom padding)
                const paragraphRect = paragraph.getBoundingClientRect()
                const isBelowContent = clickY > paragraphRect.bottom
                
                if (isBelowContent) {
                  // Click is below content - place cursor at the END of the last paragraph
                  let targetElement = paragraph
                  if (paragraph.tagName.toLowerCase() === 'li') {
                    const innerP = paragraph.querySelector(':scope > p')
                    if (innerP) targetElement = innerP as HTMLElement
                  }
                  
                  const domPos = view.posAtDOM(targetElement, 0)
                  if (domPos !== null && domPos !== undefined) {
                    // Find the paragraph node in the document structure
                    const $pos = view.state.doc.resolve(domPos)
                    
                    // Find the paragraph node depth
                    let paragraphDepth = -1
                    let paragraphNode = null
                    for (let d = $pos.depth; d > 0; d--) {
                      const node = $pos.node(d)
                      if (node.type.name === 'paragraph' || 
                          node.type.name.startsWith('heading') ||
                          node.type.name === 'title' ||
                          node.type.name === 'subtitle') {
                        paragraphNode = node
                        paragraphDepth = d
                        break
                      }
                    }
                    
                    if (paragraphNode && paragraphDepth >= 0) {
                      // Calculate the absolute end of the paragraph
                      const paragraphStart = $pos.start(paragraphDepth)
                      const paragraphEnd = paragraphStart + paragraphNode.content.size
                      return paragraphEnd
                    }
                    
                    // Fallback: use text content length
                    const paragraphText = targetElement.textContent || ''
                    return domPos + paragraphText.length
                  }
                } else {
                  // Fallback to start of closest paragraph (for top padding)
                  const domPos = view.posAtDOM(paragraph, 0)
                  if (domPos !== null && domPos !== undefined) {
                    return domPos
                  }
                }
              }
            }
            return null
          }
          
          // Store initial position for text selection
          const initialPos = getCursorPosition()
          initialSelectionPosRef.current = initialPos
          
          // Define function to set cursor position
          const setCursorPosition = () => {
            if (initialPos !== null) {
              editor.chain().focus().setTextSelection(initialPos).run()
            } else {
              editor.chain().focus().run()
            }
          }
          
          // Set up mouse move listener to detect dragging and handle text selection
          const handleMouseMove = (moveEvent: MouseEvent) => {
            if (mouseDownPosRef.current && editor && scrollContainerRef.current) {
              const deltaX = Math.abs(moveEvent.clientX - mouseDownPosRef.current.x)
              const deltaY = Math.abs(moveEvent.clientY - mouseDownPosRef.current.y)
              const totalDistance = Math.sqrt(deltaX * deltaX + deltaY * deltaY)
              
              if (totalDistance > 5) { // Threshold for movement detection
                // Enable text selection for any drag when we have an initial position
                if (initialSelectionPosRef.current !== null) {
                  isDraggingRef.current = false // Don't treat as drag, allow selection
                  isTextSelectionActiveRef.current = true // Mark that we're doing text selection
                  
                  // Get the current position at the mouse coordinates (handles padding areas)
                  const currentPos = getPositionAtCoords(moveEvent.clientX, moveEvent.clientY)
                  
                  if (currentPos !== null && initialSelectionPosRef.current !== null) {
                    // Validate positions to ensure they point to inline content
                    const { state } = editor.view
                    const { doc } = state
                    const docSize = doc.content.size
                    
                    // Skip if document is empty
                    if (docSize === 0) {
                      return
                    }
                    
                    // Clamp positions to valid document bounds
                    let from = Math.max(0, Math.min(initialSelectionPosRef.current, docSize))
                    let to = Math.max(0, Math.min(currentPos, docSize))
                    
                    // Ensure positions are different
                    if (from === to) {
                      // If positions are the same, try to adjust slightly
                      if (to < docSize) {
                        to = Math.min(to + 1, docSize)
                      } else if (from > 0) {
                        from = Math.max(from - 1, 0)
                      } else {
                        // Can't create selection, skip
                        return
                      }
                    }
                    
                    // Validate positions point to valid inline content
                    try {
                      const { state } = editor.view
                      const { listItem } = state.schema.nodes
                      
                      // Helper function to adjust position if it points to a listItem
                      const adjustPositionForListItem = (pos: number): number | null => {
                        try {
                          const $pos = doc.resolve(pos)
                          
                          // Check if we're inside a listItem at any depth
                          let listItemDepth = -1
                          for (let d = $pos.depth; d > 0; d--) {
                            if ($pos.node(d).type === listItem) {
                              listItemDepth = d
                              break
                            }
                          }
                          
                          // If we're in a listItem, check if parent has inline content
                          if (listItemDepth >= 0) {
                            // Check if parent node can contain inline content
                            // If parent is listItem itself, we need to find the paragraph within it
                            if ($pos.parent.type === listItem || $pos.parent.type.name === 'listItem') {
                              // Find the paragraph within the listItem
                              const listItemPos = $pos.before(listItemDepth)
                              
                              try {
                                const resolvedPos = state.doc.resolve(listItemPos + 1)
                                // Look for paragraph/heading/title/subtitle within the listItem
                                for (let childD = resolvedPos.depth; childD > 0 && childD <= resolvedPos.depth + 2; childD++) {
                                  const childNode = resolvedPos.node(childD)
                                  if (childNode.type.name === 'paragraph' || 
                                      childNode.type.name.startsWith('heading') || 
                                      childNode.type.name === 'title' || 
                                      childNode.type.name === 'subtitle') {
                                    // Found the paragraph - adjust position to point to valid inline content
                                    const paragraphStart = resolvedPos.before(childD) + 1
                                    const paragraphEnd = resolvedPos.after(childD) - 1
                                    
                                    // Ensure we have valid inline content
                                    if (paragraphStart < paragraphEnd) {
                                      // Clamp position to paragraph bounds, ensuring it's within inline content
                                      const adjustedPos = Math.max(paragraphStart, Math.min(pos, paragraphEnd))
                                      // Verify the adjusted position points to inline content
                                      const $adjusted = doc.resolve(adjustedPos)
                                      if ($adjusted.parent.inlineContent) {
                                        return adjustedPos
                                      }
                                    }
                                    // If paragraph is empty, use start position
                                    return paragraphStart
                                  }
                                }
                              } catch (e) {
                                // If resolution fails, return null
                                return null
                              }
                              
                              // No paragraph found in listItem
                              return null
                            }
                            
                            // If parent is not listItem but we're inside one, check if parent has inline content
                            if (!$pos.parent.inlineContent) {
                              // Parent doesn't have inline content, try to find a valid position
                              return null
                            }
                          }
                          
                          // Verify the position points to inline content
                          if (!$pos.parent.inlineContent) {
                            return null
                          }
                          
                          // Position is valid, return original
                          return pos
                        } catch (e) {
                          return null
                        }
                      }
                      
                      // Adjust positions if they point to listItems
                      const adjustedFrom = adjustPositionForListItem(from)
                      const adjustedTo = adjustPositionForListItem(to)
                      
                      // If either position couldn't be adjusted, skip selection
                      if (adjustedFrom === null || adjustedTo === null) {
                        return
                      }
                      
                      const $from = doc.resolve(adjustedFrom)
                      const $to = doc.resolve(adjustedTo)
                      
                      // Ensure positions are within valid nodes that can contain text
                      // Check if we're at a valid selection boundary
                      if ($from.parent.content.size === 0 && $from.parentOffset === 0) {
                        // At start of empty block - skip selection
                        return
                      }
                      if ($to.parent.content.size === 0 && $to.parentOffset === 0) {
                        // At start of empty block - skip selection
                        return
                      }
                      
                      // Ensure positions are still different after adjustment
                      if (adjustedFrom === adjustedTo) {
                        return
                      }
                      
                      // Set text selection from initial position to current position
                      // Use adjusted positions - this preserves selection direction
                      editor.chain().focus().setTextSelection({ 
                        from: adjustedFrom, 
                        to: adjustedTo 
                      }).run()
                    } catch (error) {
                      // Silently ignore selection errors (e.g., invalid positions)
                      // This can happen when positions point to block boundaries without inline content
                      console.debug('Text selection error (ignored):', error)
                    }
                  }
                } else {
                  // No initial position, treat as drag
                  isDraggingRef.current = true
                  isTextSelectionActiveRef.current = false
                }
              }
            }
          }
          
          const handleMouseUp = () => {
            window.document.removeEventListener('mousemove', handleMouseMove)
            window.document.removeEventListener('mouseup', handleMouseUp)
            
            // If we were doing text selection (vertical drag), keep the selection - don't clear it
            // The selection will persist until the next mouse down
            if (isTextSelectionActiveRef.current) {
              // Text selection was active, keep it - don't do anything
              // The selection is already set and will persist
            } else if (!isDraggingRef.current) {
              // It was just a click (not a drag, not a text selection)
              setCursorPosition()
            }
            // Otherwise it was a horizontal drag, don't change anything
            
            mouseDownPosRef.current = null
            // Don't clear initialSelectionPosRef or isTextSelectionActiveRef here
            // They will be cleared on the next mouse down
          }
          
          window.document.addEventListener('mousemove', handleMouseMove)
          window.document.addEventListener('mouseup', handleMouseUp)
        }}
        onDoubleClick={(e) => {
          // Only handle double-click in padding area (outside ProseMirror content)
          const target = e.target as HTMLElement
          if (target.closest('.ProseMirror')) {
            return // Let ProseMirror handle it
          }
          
          if (!editor || !scrollContainerRef.current) return
          
          const editorElement = scrollContainerRef.current.querySelector('.ProseMirror') as HTMLElement
          if (!editorElement) return
          
          const view = editor.view
          const clickY = e.clientY
          
          // Find closest paragraph
          const paragraphs = editorElement.querySelectorAll('p, h1, h2, h3, h4, h5, h6')
          let closestElement: HTMLElement | null = null
          let minDist = Infinity
          
          paragraphs.forEach((p) => {
            const rect = (p as HTMLElement).getBoundingClientRect()
            const dist = clickY >= rect.top && clickY <= rect.bottom 
              ? 0 
              : Math.min(Math.abs(clickY - rect.top), Math.abs(clickY - rect.bottom))
            if (dist < minDist) {
              minDist = dist
              closestElement = p as HTMLElement
            }
          })
          
          if (!closestElement) return
          
          const closestPara = closestElement as HTMLElement
          
          // Get position and select first/last word
          const coords = { left: closestPara.getBoundingClientRect().left, top: clickY }
          const posResult = view.posAtCoords(coords)
          if (!posResult) return
          
          const pos = posResult.pos
          const $pos = editor.state.doc.resolve(pos)
          const parent = $pos.parent
          const text = parent.textContent || ''
          
          // Select first or last word depending on click position
          const editorRect = editorElement.getBoundingClientRect()
          const isLeftPadding = e.clientX < editorRect.left
          
          if (isLeftPadding) {
            // Select first word
            const match = text.match(/^\s*(\S+)/)
            if (match) {
              const wordEnd = (match.index || 0) + match[0].length
              editor.chain().focus().setTextSelection({ 
                from: $pos.start(), 
                to: $pos.start() + wordEnd 
              }).run()
            }
          } else {
            // Select last word
            const match = text.match(/(\S+)\s*$/)
            if (match) {
              const wordStart = match.index || 0
              editor.chain().focus().setTextSelection({ 
                from: $pos.start() + wordStart, 
                to: $pos.start() + text.length 
              }).run()
            }
          }
        }}
        onClick={(e) => {
          // Handle Ctrl+Click on links to open in default browser
          if (e.ctrlKey || e.metaKey) {
            const target = e.target as HTMLElement
            // Find the closest link element (could be the target itself or a parent)
            const linkElement = target.closest('a.editor-link') as HTMLAnchorElement | null
            
            if (linkElement && linkElement.href) {
              e.preventDefault()
              e.stopPropagation()
              
              const url = linkElement.href
              
              // Check if running in Electron
              const isElectron = typeof window !== 'undefined' && window.electron !== undefined
              
              if (isElectron && window.electron) {
                // Open in external browser via IPC
                window.electron.invoke('openExternal', url).catch((error) => {
                  console.error('Failed to open external URL:', error)
                  // Fallback to window.open if IPC fails
                  window.open(url, '_blank')
                })
              } else {
                // Fallback for web
                window.open(url, '_blank')
              }
            }
          }
        }}
        onClickCapture={(e) => {
          // Only handle triple-click in padding area
          if (e.detail !== 3) return
          
          const target = e.target as HTMLElement
          if (target.closest('.ProseMirror')) {
            return // Let ProseMirror handle it
          }
          
          if (!editor || !scrollContainerRef.current) return
          
          const editorElement = scrollContainerRef.current.querySelector('.ProseMirror') as HTMLElement
          if (!editorElement) return
          
          const view = editor.view
          const clickY = e.clientY
          
          // Find closest paragraph
          const tripleClickParagraphs = editorElement.querySelectorAll('p, h1, h2, h3, h4, h5, h6')
          let tripleClickClosest: HTMLElement | null = null
          let tripleClickMinDist = Infinity
          
          tripleClickParagraphs.forEach((p) => {
            const rect = (p as HTMLElement).getBoundingClientRect()
            const dist = clickY >= rect.top && clickY <= rect.bottom 
              ? 0 
              : Math.min(Math.abs(clickY - rect.top), Math.abs(clickY - rect.bottom))
            if (dist < tripleClickMinDist) {
              tripleClickMinDist = dist
              tripleClickClosest = p as HTMLElement
            }
          })
          
          if (!tripleClickClosest) return
          
          const tripleClickPara = tripleClickClosest as HTMLElement
          
          // Select entire paragraph
          const domPos = view.posAtDOM(tripleClickPara, 0)
          if (domPos !== null && domPos !== undefined) {
            const text = tripleClickPara.textContent || ''
            editor.chain().focus().setTextSelection({ 
              from: domPos, 
              to: domPos + text.length 
            }).run()
          }
        }}
        onDragOver={(e) => {
          // Allow drop by preventing default
          e.preventDefault()
          e.stopPropagation()
          
          // Add visual feedback (optional - can add a class for styling)
          if (e.dataTransfer) {
            e.dataTransfer.dropEffect = 'copy'
          }
        }}
        onDragLeave={(e) => {
          // Remove visual feedback when leaving drop zone
          e.preventDefault()
          e.stopPropagation()
        }}
        onDrop={(e) => {
          e.preventDefault()
          e.stopPropagation()
          
          if (!editor || editor.isDestroyed || !editor.view) return
          
          const files = e.dataTransfer.files
          if (!files || files.length === 0) return
          
          // Filter for image files
          const imageFiles = Array.from(files).filter(file => file.type.startsWith('image/'))
          if (imageFiles.length === 0) return
          
          // Get cursor position at drop coordinates
          const dropX = e.clientX
          const dropY = e.clientY
          
          try {
            // Get position at drop coordinates
            const coords = { left: dropX, top: dropY }
            const posResult = editor.view.posAtCoords(coords)
            
            // If we can't get position from coordinates, use current selection
            const insertPos = posResult ? posResult.pos : editor.state.selection.from
            
            // Set cursor position first
            editor.chain().focus().setTextSelection(insertPos).run()
            
            // Process images sequentially to insert them one after another
            let processedCount = 0
            const processNextImage = () => {
              if (processedCount >= imageFiles.length) {
                // All images processed, add a paragraph at the end for cursor placement
                editor.chain().focus().insertContent('<p></p>').run()
                return
              }
              
              const file = imageFiles[processedCount]
              const reader = new FileReader()
              reader.onload = (event) => {
                const dataUrl = event.target?.result as string
                if (dataUrl) {
                  // Insert image at current cursor position
                  editor.chain()
                    .focus()
                    .setImage({ src: dataUrl })
                    .run()
                  
                  // Move cursor after the inserted image and process next image
                  processedCount++
                  // Small delay to ensure the image is inserted before processing next
                  setTimeout(() => {
                    processNextImage()
                  }, 50)
                } else {
                  processedCount++
                  processNextImage()
                }
              }
              reader.onerror = (error) => {
                console.error('Error reading image file:', error)
                processedCount++
                processNextImage()
              }
              reader.readAsDataURL(file)
            }
            
            // Start processing images
            processNextImage()
          } catch (error) {
            console.error('Error handling image drop:', error)
          }
        }}
      >
        <div className={theme === 'dark' ? 'dark-theme' : ''} style={{ 
          maxWidth: '816px',
          margin: '0 auto',
          minHeight: '100%',
          position: 'relative'
        }}>
          {agentDiffPreview && agentDiffButtonPos && (
            <div style={{
              position: 'absolute',
              top: `${agentDiffButtonPos.top}px`,
              right: `${agentDiffButtonPos.right}px`,
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              zIndex: 20,
              pointerEvents: 'auto',
            }}>
              <button
                onClick={() => {
                  window.dispatchEvent(new CustomEvent('lemona:agent-diff-reject', { detail: { proposalId: agentDiffPreview.proposalId } }))
                  setAgentDiffPreview(null)
                  setAgentDiffButtonPos(null)
                }}
                style={{
                  borderRadius: '4px',
                  border: `1px solid ${theme === 'dark' ? '#3a3a3a' : '#d0d7de'}`,
                  background: theme === 'dark' ? '#1a1a1a' : '#fff',
                  color: textColor,
                  padding: '2px 8px',
                  fontSize: '11px',
                  cursor: 'pointer',
                  lineHeight: 1.4,
                  boxShadow: '0 1px 3px rgba(0,0,0,0.15)'
                }}
              >
                Undo
              </button>
              <button
                onClick={() => {
                  window.dispatchEvent(new CustomEvent('lemona:agent-diff-accept', { detail: { proposalId: agentDiffPreview.proposalId } }))
                  setAgentDiffPreview(null)
                  setAgentDiffButtonPos(null)
                }}
                style={{
                  borderRadius: '4px',
                  border: `1px solid ${theme === 'dark' ? '#2e6a46' : '#86d0a0'}`,
                  background: theme === 'dark' ? 'rgba(34,197,94,0.15)' : 'rgba(220,252,231,0.95)',
                  color: theme === 'dark' ? '#86efac' : '#166534',
                  padding: '2px 8px',
                  fontSize: '11px',
                  cursor: 'pointer',
                  fontWeight: 500,
                  lineHeight: 1.4,
                  boxShadow: '0 1px 3px rgba(0,0,0,0.15)'
                }}
              >
                Keep
              </button>
            </div>
          )}
          <EditorContent key={document?.id} editor={editor} />
          <Autocomplete editor={editor} documentContent={document?.content} documentId={document?.id} />
          
          {/* Inline Search/Replace Bar - Dark Mode */}
          {showInlineSearch && (
            <div
              style={{
                position: 'fixed',
                top: '92px', // TopBar (32px) + Toolbar container padding (8px top) + Toolbar content (~32px) + margin (20px) = 92px to match right margin
                right: `${rightOffset}px`,
                backgroundColor: searchBgColor,
                borderRadius: '6px',
                padding: '12px',
                boxShadow: searchBoxShadow,
                zIndex: 1000,
                display: 'flex',
                flexDirection: 'column',
                gap: '12px', // Increased from 10px for more spacing
                minWidth: '280px',
                maxWidth: '300px',
              fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
              fontWeight: '400', // Apply to whole modal
              transition: 'right 0.3s ease',
                border: theme === 'light' ? '1px solid #dadce0' : 'none',
              }}
              onMouseDown={(e) => {
                // Prevent editor from intercepting clicks on the search dialog
                e.stopPropagation()
              }}
              onClick={(e) => {
                // Prevent editor from intercepting clicks on the search dialog
                e.stopPropagation()
              }}
            >
              {/* Close button */}
              <button
                onClick={() => {
                  setShowInlineSearch(false)
                  setSearchQuery('')
                  setReplaceQuery('')
                  clearInlineSearchHighlights()
                  editor?.chain().focus().run()
                }}
                style={{
                  position: 'absolute',
                  top: '8px',
                  right: '8px',
                  padding: '2px',
                  backgroundColor: 'transparent',
                  border: 'none',
                  color: searchCloseColor,
                  cursor: 'pointer',
                  fontSize: '14px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: '6px',
                  width: '18px',
                  height: '18px',
                  fontWeight: '400',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = searchCloseHoverBg
                  e.currentTarget.style.color = searchCloseHoverColor
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'transparent'
                  e.currentTarget.style.color = searchCloseColor
                }}
                title="Close (Esc)"
              >
                ✕
              </button>

              {/* Find section */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontWeight: '400', width: '100%' }}>
                <label style={{
                  fontSize: '11px',
                  fontWeight: '400',
                  color: searchLabelColor,
                  margin: 0,
                }}>
                  Find
                </label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', width: '100%' }}>
                  <input
                    ref={inlineSearchInputRef}
                    data-search-input="true"
                    type="text"
                    placeholder=""
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    style={{
                      flex: 1,
                      minWidth: 0, // Allow flex item to shrink below content size
                      padding: '6px 10px',
                      border: `1px solid ${searchInputBorder}`,
                      borderRadius: '6px',
                      backgroundColor: searchInputBg,
                      color: searchTextColor,
                      fontSize: '13px',
                      outline: 'none',
                      fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
                      fontWeight: '400',
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        e.stopPropagation() // Prevent window-level listener from also handling this
                        // If search query hasn't changed, navigate to next match
                        // Otherwise, perform a new search (goes to first match)
                        if (searchQuery === activeSearchQuery && matches.length > 0) {
                          navigateToNext()
                        } else {
                          performSearch()
                        }
                      } else if (e.key === 'Escape') {
                        e.preventDefault()
                        e.stopPropagation() // Prevent window-level listener from also handling this
                        setShowInlineSearch(false)
                        setSearchQuery('')
                        setReplaceQuery('')
                        clearInlineSearchHighlights()
                        editor?.chain().focus().run()
                      }
                    }}
                    onFocus={(e) => {
                      e.target.style.borderColor = searchInputBorderFocus
                      isSearchInputFocusedRef.current = true
                    }}
                    onBlur={(e) => {
                      e.target.style.borderColor = searchInputBorder
                      // Use setTimeout to check if focus moved to replace input
                      setTimeout(() => {
                        if (window.document.activeElement !== inlineReplaceInputRef.current) {
                          isSearchInputFocusedRef.current = false
                        }
                      }, 0)
                    }}
                    onMouseDown={(e) => {
                      // Prevent editor from intercepting the click
                      e.stopPropagation()
                      isSearchInputFocusedRef.current = true
                    }}
                  />
                  {activeSearchQuery && matches.length > 0 && (
                    <>
                      <div style={{
                        fontSize: '11px',
                        color: searchMatchCountColor,
                        minWidth: '35px',
                        textAlign: 'center',
                        fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
                        fontWeight: '400',
                      }}>
                        {currentMatchIndex + 1}/{matches.length}
                      </div>
                      <button
                        onClick={navigateToPrevious}
                        disabled={matches.length === 0}
                        style={{
                          padding: '4px 6px',
                          backgroundColor: 'transparent',
                          border: `1px solid ${searchButtonBorder}`,
                          borderRadius: '6px',
                          color: matches.length > 0 ? searchTextColor : searchButtonDisabledColor,
                          cursor: matches.length > 0 ? 'pointer' : 'not-allowed',
                          fontSize: '12px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          minWidth: '24px',
                          height: '24px',
                        }}
                        onMouseEnter={(e) => {
                          if (matches.length > 0) {
                            e.currentTarget.style.backgroundColor = searchButtonHoverBg
                            e.currentTarget.style.borderColor = searchButtonHoverBorder
                          }
                        }}
                        onMouseLeave={(e) => {
                          if (matches.length > 0) {
                            e.currentTarget.style.backgroundColor = 'transparent'
                            e.currentTarget.style.borderColor = searchButtonBorder
                          }
                        }}
                        title="Previous match"
                      >
                        ‹
                      </button>
                      <button
                        onClick={navigateToNext}
                        disabled={matches.length === 0}
                        style={{
                          padding: '4px 6px',
                          backgroundColor: 'transparent',
                          border: `1px solid ${searchButtonBorder}`,
                          borderRadius: '6px',
                          color: matches.length > 0 ? searchTextColor : searchButtonDisabledColor,
                          cursor: matches.length > 0 ? 'pointer' : 'not-allowed',
                          fontSize: '12px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          minWidth: '24px',
                          height: '24px',
                        }}
                        onMouseEnter={(e) => {
                          if (matches.length > 0) {
                            e.currentTarget.style.backgroundColor = searchButtonHoverBg
                            e.currentTarget.style.borderColor = searchButtonHoverBorder
                          }
                        }}
                        onMouseLeave={(e) => {
                          if (matches.length > 0) {
                            e.currentTarget.style.backgroundColor = 'transparent'
                            e.currentTarget.style.borderColor = searchButtonBorder
                          }
                        }}
                        title="Next match"
                      >
                        ›
                      </button>
                    </>
                  )}
                </div>
              </div>
              
              {/* Replace with section */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontWeight: '400', width: '100%' }}>
                <label style={{
                  fontSize: '11px',
                  fontWeight: '400',
                  color: searchLabelColor,
                  margin: 0,
                }}>
                  Replace with
                </label>
                <input
                  ref={inlineReplaceInputRef}
                  type="text"
                  placeholder=""
                  value={replaceQuery}
                  onChange={(e) => setReplaceQuery(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '6px 10px',
                    border: `1px solid ${searchInputBorder}`,
                    borderRadius: '6px',
                    backgroundColor: searchInputBg,
                    color: searchTextColor,
                    fontSize: '13px',
                    outline: 'none',
                    fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
                    fontWeight: '400',
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') {
                      e.preventDefault()
                      setShowInlineSearch(false)
                      setSearchQuery('')
                      setReplaceQuery('')
                      clearInlineSearchHighlights()
                      editor?.chain().focus().run()
                    }
                  }}
                  onFocus={(e) => {
                    e.target.style.borderColor = searchInputBorderFocus
                    isReplaceInputFocusedRef.current = true
                  }}
                  onBlur={(e) => {
                    e.target.style.borderColor = searchInputBorder
                    // Use setTimeout to check if focus moved to search input
                    setTimeout(() => {
                      if (window.document.activeElement !== inlineSearchInputRef.current) {
                        isReplaceInputFocusedRef.current = false
                      }
                    }, 0)
                  }}
                  onMouseDown={(e) => {
                    // Prevent editor from intercepting the click
                    e.stopPropagation()
                    isReplaceInputFocusedRef.current = true
                  }}
                />
              </div>
              
              {/* Action buttons */}
              <div style={{ display: 'flex', gap: '6px', marginTop: '2px' }}>
                <button
                  onClick={handleReplaceAll}
                  disabled={matches.length === 0 || !replaceQuery.trim()}
                  style={{
                    flex: 1,
                    padding: '6px 12px',
                    backgroundColor: matches.length > 0 && replaceQuery.trim()
                      ? exportPdfButtonBg
                      : searchButtonDisabledBg,
                    border: 'none',
                    borderRadius: '6px',
                    color: matches.length > 0 && replaceQuery.trim() ? '#ffffff' : searchButtonDisabledColor,
                    cursor: matches.length > 0 && replaceQuery.trim() ? 'pointer' : 'not-allowed',
                    fontSize: '12px',
                    fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
                    fontWeight: '400',
                    transition: 'all 0.2s',
                  }}
                  onMouseEnter={(e) => {
                    if (matches.length > 0 && replaceQuery.trim()) {
                      e.currentTarget.style.backgroundColor = exportPdfButtonHoverBg
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (matches.length > 0 && replaceQuery.trim()) {
                      e.currentTarget.style.backgroundColor = exportPdfButtonBg
                    }
                  }}
                  title="Replace All"
                >
                  Replace all
                </button>
                <button
                  onClick={handleReplace}
                  disabled={currentMatchIndex < 0 || !replaceQuery.trim()}
                  style={{
                    flex: 1,
                    padding: '6px 12px',
                    backgroundColor: currentMatchIndex >= 0 && replaceQuery.trim()
                      ? exportDocxButtonBg
                      : searchButtonDisabledBg,
                    border: 'none',
                    borderRadius: '6px',
                    color: currentMatchIndex >= 0 && replaceQuery.trim() ? '#ffffff' : searchButtonDisabledColor,
                    cursor: currentMatchIndex >= 0 && replaceQuery.trim() ? 'pointer' : 'not-allowed',
                    fontSize: '12px',
                    fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
                    fontWeight: '400',
                    transition: 'background-color 0.2s',
                  }}
                  onMouseEnter={(e) => {
                    if (currentMatchIndex >= 0 && replaceQuery.trim()) {
                      e.currentTarget.style.backgroundColor = exportDocxButtonHoverBg
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (currentMatchIndex >= 0 && replaceQuery.trim()) {
                      e.currentTarget.style.backgroundColor = exportDocxButtonBg
                    }
                  }}
                  title="Replace"
                >
                  Replace
                </button>
              </div>
            </div>
          )}
        </div>
        
      </div>
      
      {/* Text Rephrase Popup */}
      {showRephrasePopup && popupPosition && (
        <TextRephrasePopup
          selectedText={ctrlKSelectionRef.current?.text || ''}
          position={popupPosition}
          onInputFocus={(isFocused) => {
            isRephrasePopupInputFocusedRef.current = isFocused
          }}
          onReplace={(newText) => {
            const rangeToUse = ctrlKSelectionRef.current?.range
            if (editor && rangeToUse) {
              try {
                editor.chain()
                  .focus()
                  .setTextSelection(rangeToUse)
                  .deleteSelection()
                  .insertContent(newText)
                  .run()
              } catch (error) {
                console.error('Error replacing text:', error)
              }
            }
            // 清理 Ctrl+K 缓存
            ctrlKSelectionRef.current = null
            setPopupPosition(null)
            setShowRephrasePopup(false)
            isRephrasePopupInputFocusedRef.current = false
          }}
          onClose={() => {
            // 清理 Ctrl+K 缓存
            ctrlKSelectionRef.current = null
            suppressRephrasePopupRef.current = true
            setPopupPosition(null)
            setShowRephrasePopup(false)
            isRephrasePopupInputFocusedRef.current = false
          }}
          onAddToChat={(selection) => {
            const payload = buildAddToChatPayload(selection)
            if (!payload) return
            window.dispatchEvent(new CustomEvent('addToChat', { detail: payload }))
          }}
          onReadSelection={() => {
            // Improve Button 点击时读取当前 selection（确保拿到最新拖选范围）
            if (!editor || editor.isDestroyed || !editor.view) {
              return { text: '', range: null }
            }
            const { from, to } = editor.state.selection
            if (from === to) {
              return { text: '', range: null }
            }
            const selected = editor.state.doc.textBetween(from, to)
            if (selected.trim().length === 0) {
              return { text: '', range: null }
            }
            const context = getSelectionContext(from, to)
            const selection = { 
              text: selected, 
              range: { from, to },
              contextBefore: context.contextBefore,
              contextAfter: context.contextAfter,
              paragraphCount: context.paragraphCount
            }
            ctrlKSelectionRef.current = selection
            return selection
          }}
        />
      )}

      {/* Slash Command Menu */}
      {showSlashMenu && editor && (
        <SlashCommandMenu
          editor={editor}
          position={slashMenuPosition}
          filterText={slashFilterText}
          commandStartPos={slashCommandStartPosRef.current}
          onClose={(shouldDelete = false) => {
            setShowSlashMenu(false)
            // Only delete the "/" and filter text when Escape is pressed or command is executed
            // When clicking outside, keep "/" as normal text
            if (shouldDelete && slashCommandStartPosRef.current !== null) {
              const { from } = editor.state.selection
              try {
                // Helper to adjust position for inline content
                const adjustPosition = (pos: number): number | null => {
                  try {
                    const $pos = editor.state.doc.resolve(pos)
                    if ($pos.parent.inlineContent) return pos
                    
                    // If in listItem, find paragraph inside
                    for (let d = $pos.depth; d > 0; d--) {
                      const node = $pos.node(d)
                      if (node.type.name === 'listItem') {
                        const listItemPos = $pos.before(d)
                        const resolvedPos = editor.state.doc.resolve(listItemPos + 1)
                        for (let childD = resolvedPos.depth; childD <= resolvedPos.depth + 2; childD++) {
                          const childNode = resolvedPos.node(childD)
                          if (childNode.type.name === 'paragraph' || childNode.type.name.startsWith('heading')) {
                            return resolvedPos.before(childD) + 1
                          }
                        }
                      }
                    }
                    return null
                  } catch (e) {
                    return null
                  }
                }
                
                const adjustedStart = adjustPosition(slashCommandStartPosRef.current) ?? slashCommandStartPosRef.current
                const adjustedEnd = adjustPosition(from) ?? from
                
                editor.chain()
                  .focus()
                  .deleteRange({ from: adjustedStart, to: adjustedEnd })
                  .run()
              } catch (error) {
                console.warn('Error cleaning up slash command:', error)
              }
            }
            slashCommandStartPosRef.current = null
            setSlashFilterText('')
          }}
        />
      )}
      </div>
    </>
  )
})

DocumentEditor.displayName = 'DocumentEditor'

export default DocumentEditor


