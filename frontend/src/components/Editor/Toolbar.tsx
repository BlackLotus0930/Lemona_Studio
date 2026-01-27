import { Editor } from '@tiptap/react'
import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTheme } from '../../contexts/ThemeContext'
import { useEditorContext } from '../../contexts/EditorContext'
import ExportModal from '../Layout/ExportModal'
import KeyboardShortcutsModal from '../Layout/KeyboardShortcutsModal'
import CommitHistoryModal from '../Layout/CommitHistoryModal'
import { Document } from '@shared/types'
// @ts-ignore
import ShareIcon from '@mui/icons-material/Share'
// @ts-ignore - Material UI icons
import SearchIcon from '@mui/icons-material/Search'
// @ts-ignore
import HomeIcon from '@mui/icons-material/Home'
// @ts-ignore
import DarkModeIcon from '@mui/icons-material/DarkMode'
// @ts-ignore
import LightModeIcon from '@mui/icons-material/LightMode'
// @ts-ignore
import KeyboardIcon from '@mui/icons-material/Keyboard'
// @ts-ignore
import UndoIcon from '@mui/icons-material/Undo'
// @ts-ignore
import RedoIcon from '@mui/icons-material/Redo'
// @ts-ignore
import FormatBoldIcon from '@mui/icons-material/FormatBold'
// @ts-ignore
import FormatItalicIcon from '@mui/icons-material/FormatItalic'
// @ts-ignore
import FormatUnderlinedIcon from '@mui/icons-material/FormatUnderlined'
// @ts-ignore
import FormatColorTextIcon from '@mui/icons-material/FormatColorText'
// @ts-ignore
import LinkIcon from '@mui/icons-material/Link'
// @ts-ignore
import ImageIcon from '@mui/icons-material/Image'
// @ts-ignore
import FunctionsIcon from '@mui/icons-material/Functions'
// @ts-ignore
import FormatAlignLeftIcon from '@mui/icons-material/FormatAlignLeft'
// @ts-ignore
import FormatAlignCenterIcon from '@mui/icons-material/FormatAlignCenter'
// @ts-ignore
import FormatAlignRightIcon from '@mui/icons-material/FormatAlignRight'
// @ts-ignore
import FormatAlignJustifyIcon from '@mui/icons-material/FormatAlignJustify'
// @ts-ignore
import FormatListBulletedIcon from '@mui/icons-material/FormatListBulleted'
// @ts-ignore
import FormatListNumberedIcon from '@mui/icons-material/FormatListNumbered'
// @ts-ignore
import FormatIndentDecreaseIcon from '@mui/icons-material/FormatIndentDecrease'
// @ts-ignore
import FormatIndentIncreaseIcon from '@mui/icons-material/FormatIndentIncrease'
// @ts-ignore
import ArrowDropDownIcon from '@mui/icons-material/ArrowDropDown'
// @ts-ignore
import AddIcon from '@mui/icons-material/Add'
// @ts-ignore
import RemoveIcon from '@mui/icons-material/Remove'
// @ts-ignore
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf'
// @ts-ignore
import DescriptionIcon from '@mui/icons-material/Description'
// @ts-ignore
import FormatLineSpacingIcon from '@mui/icons-material/FormatLineSpacing'
// @ts-ignore
import BarChartIcon from '@mui/icons-material/BarChart'
// @ts-ignore
import TableChartIcon from '@mui/icons-material/TableChart'
// @ts-ignore
import ShowChartIcon from '@mui/icons-material/ShowChart'
// @ts-ignore
import PieChartIcon from '@mui/icons-material/PieChart'
// @ts-ignore
import TimelineIcon from '@mui/icons-material/Timeline'
// @ts-ignore
import TurnedInNotOutlinedIcon from '@mui/icons-material/TurnedInNotOutlined'

interface ToolbarProps {
  editor: Editor | null
  onToggleSearch?: () => void
  isSearchActive?: boolean
  onExport?: (format: 'pdf' | 'docx', filename?: string, documentIds?: string[], usePageBreaks?: boolean) => void
  documents?: Document[]
  projectName?: string
  documentTitle?: string
  onRestoreCommit?: (commitId: string) => void // Callback to set restored commit parent
  onDocumentsReload?: () => void // Callback to reload documents after restore
  customUndoRedo?: {
    undo: () => void
    redo: () => void
    canUndo: () => boolean
    canRedo: () => boolean
  }
}

export default function Toolbar({ 
  editor: editorProp, 
  onToggleSearch, 
  isSearchActive = false,
  onExport,
  documents = [],
  projectName = 'LEMONA',
  documentTitle,
  onRestoreCommit,
  onDocumentsReload,
  customUndoRedo
}: ToolbarProps) {
  const navigate = useNavigate()
  const { theme, toggleTheme } = useTheme()
  const { currentEditor } = useEditorContext()
  // Use currentEditor from context, fallback to editorProp for backward compatibility
  const editor = currentEditor || editorProp
  // Use ref to preserve editor during transitions to prevent flash
  const editorRef = useRef<Editor | null>(editor)
  // Update ref when editor changes, but keep previous value if new editor is null or destroyed
  useEffect(() => {
    if (editor && !editor.isDestroyed) {
      editorRef.current = editor
    }
  }, [editor])
  // Use ref value for rendering to prevent flash when editor temporarily becomes null
  // Only use stable editor if current editor is null/destroyed, otherwise use current editor
  const stableEditor = (editor && !editor.isDestroyed) ? editor : editorRef.current

  // Helper function to safely lift only the current list item by exactly one level
  const safeLiftCurrentListItem = (editor: Editor) => {
    if (!editor || editor.isDestroyed) return false
    
    const { state } = editor
    const { $from } = state.selection
    const { listItem } = state.schema.nodes
    
    // Find the current list item that contains the cursor
    let currentListItemDepth = -1
    for (let d = $from.depth; d > 0; d--) {
      const node = $from.node(d)
      if (node.type === listItem || node.type.name === 'listItem') {
        currentListItemDepth = d
        break
      }
    }
    
    // If not in a list item, return false
    if (currentListItemDepth === -1) {
      return false
    }
    
    // Check if we can lift (must have a parent list)
    if (currentListItemDepth <= 1) {
      // Already at top level, can't lift
      return false
    }
    
    // Find the parent list node
    const parentListDepth = currentListItemDepth - 1
    const parentList = $from.node(parentListDepth)
    
    // Only lift if parent is actually a list (bulletList or orderedList)
    if (parentList.type.name !== 'bulletList' && parentList.type.name !== 'orderedList') {
      return false
    }
    
    // Store the current depth before lifting
    const depthBeforeLift = currentListItemDepth
    
    // Use liftListItem - TipTap's liftListItem only lifts one level by default
    const liftResult = editor.commands.liftListItem('listItem')
    
    if (liftResult) {
      // Verify that we only lifted one level
      const newState = editor.state
      const new$from = newState.selection.$from
      
      // Find the new list item depth
      let newListItemDepth = -1
      for (let d = new$from.depth; d > 0; d--) {
        const node = new$from.node(d)
        if (node.type === listItem || node.type.name === 'listItem') {
          newListItemDepth = d
          break
        }
      }
      
      // If we're no longer in a list item, the lift was successful (lifted out of list)
      if (newListItemDepth === -1) {
        return true
      }
      
      // If the depth decreased by exactly 1, the lift was successful and limited to one level
      if (newListItemDepth === depthBeforeLift - 1) {
        return true
      }
      
      // If depth didn't change or changed incorrectly, something went wrong
      // But we'll still return true since liftListItem succeeded
      return true
    }
    
    return false
  }
  
  // Check if current document is a PDF (PDFs don't have TipTap editor)
  const isPDF = documentTitle?.toLowerCase().endsWith('.pdf')
  const [fontSize, setFontSize] = useState(14)
  const [showStyleMenu, setShowStyleMenu] = useState(false)
  const storedSelectionRef = useRef<{ range: Range; cell: HTMLElement } | null>(null)
  
  // Store selection when it's in a table cell
  useEffect(() => {
    const handleSelectionChange = () => {
      const selection = window.getSelection()
      if (selection && selection.rangeCount > 0) {
        const range = selection.getRangeAt(0)
        let node: Node | null = range.commonAncestorContainer
        
        // Walk up the DOM tree to find a table cell
        while (node) {
          if (node.nodeType === Node.ELEMENT_NODE) {
            const element = node as HTMLElement
            if (element.hasAttribute && element.hasAttribute('data-table-cell')) {
              // Store the selection
              storedSelectionRef.current = {
                range: range.cloneRange(),
                cell: element
              }
              return
            }
          }
          node = node.parentNode
        }
      }
      // Clear stored selection if not in table cell
      storedSelectionRef.current = null
    }
    
    document.addEventListener('selectionchange', handleSelectionChange)
    return () => {
      document.removeEventListener('selectionchange', handleSelectionChange)
    }
  }, [])
  
  // Helper function to check if table node is selected
  const isTableNodeSelected = () => {
    if (!stableEditor || stableEditor.isDestroyed) return false
    const { selection } = stableEditor.state
    if (selection.empty) return false
    
    // Check if it's a NodeSelection and the node is a tableBlock
    if (selection.constructor.name === 'NodeSelection' || (selection as any).node) {
      const selectedNode = (selection as any).node
      if (selectedNode && selectedNode.type && selectedNode.type.name === 'tableBlock') {
        return true
      }
    }
    
    // Check if selection spans a table block
    const { from, to } = selection
    let foundTable = false
    stableEditor.state.doc.nodesBetween(from, to, (node) => {
      if (node.type.name === 'tableBlock') {
        foundTable = true
        return false // Stop traversing
      }
    })
    return foundTable
  }
  
  // Helper function to get all table cells from selected table
  const getAllTableCells = () => {
    if (!stableEditor || stableEditor.isDestroyed) return []
    const { selection } = stableEditor.state
    const cells: HTMLElement[] = []
    
    if (selection.constructor.name === 'NodeSelection' || (selection as any).node) {
      const selectedNode = (selection as any).node
      if (selectedNode && selectedNode.type && selectedNode.type.name === 'tableBlock') {
        // Find the table element in the DOM
        const allTableWrappers = document.querySelectorAll('[data-table-block]')
        
        // Get cells from all table wrappers
        allTableWrappers.forEach((wrapper) => {
          const tableElement = wrapper.querySelector('table')
          if (tableElement) {
            const allCells = tableElement.querySelectorAll('[data-table-cell]')
            allCells.forEach(cell => cells.push(cell as HTMLElement))
          }
        })
      }
    }
    
    return cells
  }
  
  // Helper function to get the applyFormattingToAllCells function from the selected table
  const getTableFormattingFunction = () => {
    if (!stableEditor || stableEditor.isDestroyed) return null
    const { selection } = stableEditor.state
    
    if (selection.constructor.name === 'NodeSelection' || (selection as any).node) {
      const selectedNode = (selection as any).node
      if (selectedNode && selectedNode.type && selectedNode.type.name === 'tableBlock') {
        // Find the table element
        const tableElement = document.querySelector('[data-table-block] table')
        if (tableElement && (tableElement as any).__applyFormattingToAllCells) {
          return (tableElement as any).__applyFormattingToAllCells
        }
      }
    }
    return null
  }
  
  // Helper function to check if selection is within a table cell
  const isSelectionInTableCell = () => {
    // First check stored selection
    if (storedSelectionRef.current) {
      return storedSelectionRef.current.cell
    }
    
    const selection = window.getSelection()
    if (!selection || selection.rangeCount === 0) return false
    
    const range = selection.getRangeAt(0)
    let node: Node | null = range.commonAncestorContainer
    
    // Walk up the DOM tree to find a table cell
    while (node) {
      if (node.nodeType === Node.ELEMENT_NODE) {
        const element = node as HTMLElement
        if (element.hasAttribute && element.hasAttribute('data-table-cell')) {
          return element
        }
      }
      node = node.parentNode
    }
    return false
  }
  
  // Helper function to apply formatting to table cell using document.execCommand
  const applyTableCellFormatting = (command: string, value?: string) => {
    // Check if entire table is selected
    if (isTableNodeSelected()) {
      const formatFn = getTableFormattingFunction()
      if (formatFn) {
        // Use the table's formatting function which will update HTML
        formatFn((cell: HTMLElement) => {
          const range = document.createRange()
          range.selectNodeContents(cell)
          const selection = window.getSelection()
          selection?.removeAllRanges()
          selection?.addRange(range)
          cell.focus()
          requestAnimationFrame(() => {
            document.execCommand(command, false, value)
          })
        })
        return true
      }
      
      // Fallback: apply to all cells directly
      const allCells = getAllTableCells()
      if (allCells.length > 0) {
        allCells.forEach(cell => {
          const range = document.createRange()
          range.selectNodeContents(cell)
          const selection = window.getSelection()
          selection?.removeAllRanges()
          selection?.addRange(range)
          cell.focus()
          requestAnimationFrame(() => {
            document.execCommand(command, false, value)
            // Trigger blur to save changes
            cell.blur()
            cell.focus()
            cell.blur()
          })
        })
        return true
      }
    }
    
    // Otherwise, apply to single cell
    const tableCell = isSelectionInTableCell()
    if (tableCell) {
      const cellElement = tableCell as HTMLElement
      const selection = window.getSelection()
      
      // Restore stored selection if available
      if (storedSelectionRef.current) {
        const stored = storedSelectionRef.current
        selection?.removeAllRanges()
        selection?.addRange(stored.range)
        cellElement.focus()
      }
      
      if (selection && selection.rangeCount > 0) {
        const range = selection.getRangeAt(0)
        // Ensure the range is within the table cell
        if (cellElement.contains(range.commonAncestorContainer)) {
          // Restore focus to the table cell to maintain selection
          cellElement.focus()
          // Use requestAnimationFrame to ensure focus is restored before execCommand
          requestAnimationFrame(() => {
            document.execCommand(command, false, value)
            // Update stored selection after formatting
            if (selection.rangeCount > 0) {
              storedSelectionRef.current = {
                range: selection.getRangeAt(0).cloneRange(),
                cell: cellElement
              }
            }
          })
          return true
        }
      }
      // If no selection, select all in the cell
      const range = document.createRange()
      range.selectNodeContents(cellElement)
      selection?.removeAllRanges()
      selection?.addRange(range)
      cellElement.focus()
      requestAnimationFrame(() => {
        document.execCommand(command, false, value)
      })
      return true
    }
    return false
  }
  const [showFontMenu, setShowFontMenu] = useState(false)
  const [showFontSizeMenu, setShowFontSizeMenu] = useState(false)
  const [showColorMenu, setShowColorMenu] = useState(false)
  const [showHighlightMenu, setShowHighlightMenu] = useState(false)
  const [showAlignMenu, setShowAlignMenu] = useState(false)
  const [showSpacingMenu, setShowSpacingMenu] = useState(false)
  const [showGraphMenu, setShowGraphMenu] = useState(false)
  const [, forceUpdate] = useState({})
  const toolbarRef = useRef<HTMLDivElement>(null)
  const [showExportModal, setShowExportModal] = useState(false)
  const [showKeyboardShortcutsModal, setShowKeyboardShortcutsModal] = useState(false)
  const [showCommitHistoryModal, setShowCommitHistoryModal] = useState(false)
  const keyboardShortcutsButtonRef = useRef<HTMLButtonElement>(null)
  const commitHistoryButtonRef = useRef<HTMLButtonElement>(null)
  const [showMathMenu, setShowMathMenu] = useState(false)
  const [showLinkDialog, setShowLinkDialog] = useState(false)
  const [mathFormula, setMathFormula] = useState('')
  const [linkUrl, setLinkUrl] = useState('')
  const shareButtonRef = useRef<HTMLButtonElement>(null)
  const mathInputRef = useRef<HTMLInputElement>(null)
  const linkInputRef = useRef<HTMLInputElement>(null)
  const styleMenuRef = useRef<HTMLDivElement>(null)
  const fontMenuRef = useRef<HTMLDivElement>(null)
  const colorMenuRef = useRef<HTMLDivElement>(null)
  const highlightMenuRef = useRef<HTMLDivElement>(null)
  const alignMenuRef = useRef<HTMLDivElement>(null)
  const spacingMenuRef = useRef<HTMLDivElement>(null)
  const graphMenuRef = useRef<HTMLDivElement>(null)
  const mathMenuRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const fontSizeMenuRef = useRef<HTMLDivElement>(null)
  // Refs for dropdown menu divs (not buttons)
  const styleDropdownRef = useRef<HTMLDivElement>(null)
  const fontDropdownRef = useRef<HTMLDivElement>(null)
  const fontSizeDropdownRef = useRef<HTMLDivElement>(null)
  const colorDropdownRef = useRef<HTMLDivElement>(null)
  const highlightDropdownRef = useRef<HTMLDivElement>(null)
  const alignDropdownRef = useRef<HTMLDivElement>(null)
  const spacingDropdownRef = useRef<HTMLDivElement>(null)
  const graphDropdownRef = useRef<HTMLDivElement>(null)
  const mathDropdownRef = useRef<HTMLDivElement>(null)

  // Function to close all menus except the one specified
  const closeAllMenusExcept = (except: string | null) => {
    if (except !== 'style') setShowStyleMenu(false)
    if (except !== 'font') setShowFontMenu(false)
    if (except !== 'fontSize') setShowFontSizeMenu(false)
    if (except !== 'color') setShowColorMenu(false)
    if (except !== 'highlight') setShowHighlightMenu(false)
    if (except !== 'align') setShowAlignMenu(false)
    if (except !== 'spacing') setShowSpacingMenu(false)
    if (except !== 'graph') setShowGraphMenu(false)
    if (except !== 'math') setShowMathMenu(false)
  }

  // Update toolbar when editor selection changes
  useEffect(() => {
    if (!stableEditor || stableEditor.isDestroyed) return

    const getFontSizeFromDOM = (): number | null => {
      try {
        const { from } = stableEditor.state.selection
        const view = stableEditor.view
        
        // Get the DOM node at the cursor/selection position
        const domPos = view.domAtPos(from)
        let domNode: Node | null = domPos.node
        
        if (!domNode) return null
        
        // Find the actual text element (could be a text node or an element with text)
        let element: HTMLElement | null = null
        
        if (domNode.nodeType === Node.TEXT_NODE) {
          element = domNode.parentElement
        } else if (domNode.nodeType === Node.ELEMENT_NODE) {
          element = domNode as HTMLElement
          // If it's an element but not a text container, find the first text node or text container
          if (element && !element.textContent?.trim()) {
            // Try to find a child element that contains text
            const textContainer = element.querySelector('p, span, div, h1, h2, h3, h4, h5, h6, li')
            if (textContainer) {
              element = textContainer as HTMLElement
            }
          }
        }
        
        if (!element) return null
        
        // Get computed font size
        const computedStyle = window.getComputedStyle(element)
        const fontSize = computedStyle.fontSize
        
        if (fontSize) {
          // Parse fontSize (e.g., "18px" -> 18)
          const size = parseFloat(fontSize)
          if (!isNaN(size) && size > 0) {
            return Math.round(size)
          }
        }
        
        return null
      } catch (error) {
        console.error('Error getting font size from DOM:', error)
        return null
      }
    }

    const handleUpdate = () => {
      if (!stableEditor || stableEditor.isDestroyed) return
      forceUpdate({})
      
      // First, try to get fontSize from TipTap marks
      const attrs = stableEditor.getAttributes('textStyle')
      if (attrs.fontSize) {
        const size = parseInt(attrs.fontSize)
        if (!isNaN(size) && size > 0) {
          setFontSize(size)
          return
        }
      }
      
      // If no fontSize mark found, check if there's text selected and try to get fontSize from the selection range
      const { from, to } = stableEditor.state.selection
      if (from !== to) {
        // Text is selected - check marks in the selection range
        let foundSize: number | null = null
        stableEditor.state.doc.nodesBetween(from, to, (node) => {
          if (node.marks) {
            node.marks.forEach(mark => {
              if (mark.type.name === 'textStyle' && mark.attrs.fontSize) {
                const size = parseInt(mark.attrs.fontSize)
                if (!isNaN(size) && size > 0) {
                  foundSize = size
                }
              }
            })
          }
        })
        
        if (foundSize !== null) {
          setFontSize(foundSize)
          return
        }
      }
      
      // If no fontSize mark found, get the computed font size from the DOM
      const domFontSize = getFontSizeFromDOM()
      if (domFontSize !== null) {
        setFontSize(domFontSize)
        return
      }
      
      // Default font size if nothing found
      setFontSize(14)
    }

    stableEditor.on('selectionUpdate', handleUpdate)
    stableEditor.on('transaction', handleUpdate)
    stableEditor.on('update', handleUpdate)
    stableEditor.on('focus', handleUpdate)

    return () => {
      if (stableEditor && !stableEditor.isDestroyed) {
        stableEditor.off('selectionUpdate', handleUpdate)
        stableEditor.off('transaction', handleUpdate)
        stableEditor.off('update', handleUpdate)
        stableEditor.off('focus', handleUpdate)
      }
    }
  }, [stableEditor])

  // Close menus when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node
      
      // Check if click is inside toolbar or any dropdown menu
      const isInsideToolbar = toolbarRef.current?.contains(target)
      const isInsideStyleMenu = styleMenuRef.current?.contains(target) || styleDropdownRef.current?.contains(target)
      const isInsideFontMenu = fontMenuRef.current?.contains(target) || fontDropdownRef.current?.contains(target)
      const isInsideFontSizeMenu = fontSizeMenuRef.current?.contains(target) || fontSizeDropdownRef.current?.contains(target)
      const isInsideColorMenu = colorMenuRef.current?.contains(target) || colorDropdownRef.current?.contains(target)
      const isInsideHighlightMenu = highlightMenuRef.current?.contains(target) || highlightDropdownRef.current?.contains(target)
      const isInsideAlignMenu = alignMenuRef.current?.contains(target) || alignDropdownRef.current?.contains(target)
      const isInsideSpacingMenu = spacingMenuRef.current?.contains(target) || spacingDropdownRef.current?.contains(target)
      const isInsideGraphMenu = graphMenuRef.current?.contains(target) || graphDropdownRef.current?.contains(target)
      const isInsideMathMenu = mathMenuRef.current?.contains(target) || mathDropdownRef.current?.contains(target)
      
      // Close menus if click is outside all menus and toolbar
      if (!isInsideToolbar && !isInsideStyleMenu && !isInsideFontMenu && 
          !isInsideFontSizeMenu && !isInsideColorMenu && !isInsideHighlightMenu &&
          !isInsideAlignMenu && !isInsideSpacingMenu && !isInsideGraphMenu && !isInsideMathMenu) {
        closeAllMenusExcept(null)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Focus input when menu opens
  useEffect(() => {
    if (showMathMenu && mathInputRef.current) {
      setTimeout(() => mathInputRef.current?.focus(), 100)
    }
  }, [showMathMenu])

  useEffect(() => {
    if (showLinkDialog && linkInputRef.current) {
      setTimeout(() => linkInputRef.current?.focus(), 100)
    }
  }, [showLinkDialog])

  // Use stableEditor to prevent flash when editor temporarily becomes null
  // CRITICAL: Always show toolbar, even for PDF files (which don't have TipTap editor)
  // Toolbar has useful features like search and export that work for all document types
  // Only hide toolbar if we're in initial state (no document loaded yet and not a PDF)
  if (!stableEditor && !isPDF && !documentTitle) {
    // Only hide if no editor, not a PDF, and no document title (initial state)
    return <div style={{ display: 'none' }} />
  }
  
  // Helper function to safely check if editor can be used (not null, not PDF, not destroyed)
  const canUseEditor = (): boolean => {
    return !!(stableEditor && !isPDF && !stableEditor.isDestroyed)
  }

  const toolbarBgColor = theme === 'dark' ? '#141414' : '#ffffff'
  const toolbarTextColor = theme === 'dark' ? '#D6D6DD' : '#5f6368'
  const toolbarHoverBg = theme === 'dark' ? '#1f1f1f' : '#f5f5f5'
  const dropdownBg = theme === 'dark' ? '#1a1a1a' : '#ffffff'
  const dropdownBorder = theme === 'dark' ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.08)'
  const dropdownTextColor = theme === 'dark' ? '#D6D6DD' : '#202124'
  const dropdownHoverBg = theme === 'dark' ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.04)'
  const dropdownActiveBg = theme === 'dark' ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.06)'
  const dropdownActiveColor = theme === 'dark' ? '#9e9e9e' : '#757575'

  const buttonStyle: React.CSSProperties = {
    padding: '4px 6px',
    margin: '0 1px',
    border: 'none',
    borderRadius: '6px',
    backgroundColor: 'transparent',
    color: toolbarTextColor,
    cursor: 'pointer',
    fontSize: '14px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: '28px',
    height: '28px',
    transition: 'background-color 0.15s',
    position: 'relative',
    userSelect: 'none'
  }

  const activeButtonStyle: React.CSSProperties = {
    ...buttonStyle,
    backgroundColor: theme === 'dark' ? '#2d2d2d' : '#f0f0f0',
    color: theme === 'dark' ? '#D6D6DD' : '#616161',
  }

  const dividerStyle: React.CSSProperties = {
    width: 0,
    height: '20px',
    borderLeft: `1px solid ${theme === 'dark' ? '#2d2d2d' : '#e3e3e3'}`,
    margin: '0 4px',
    flexShrink: 0,
    boxSizing: 'border-box',
    padding: 0,
    display: 'block',
    borderRadius: '1px'
  }

  const dropdownStyle: React.CSSProperties = {
    ...buttonStyle,
    padding: '6px 8px 6px 12px',
    minWidth: 'auto',
    fontSize: '13px',
    fontFamily: "'Inter', 'Noto Sans SC', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif"
  }

  const styleDropdownStyle: React.CSSProperties = {
    ...dropdownStyle,
    minWidth: '120px',
    maxWidth: '120px',
    justifyContent: 'space-between'
  }

  const fontDropdownStyle: React.CSSProperties = {
    ...dropdownStyle,
    minWidth: '130px',
    maxWidth: '130px',
    justifyContent: 'space-between'
  }

  const handleFontSizeSelect = (size: number) => {
    const newSize = Math.max(8, Math.min(400, size))
    setFontSize(newSize)
    
    // Check if entire table is selected
    if (isTableNodeSelected()) {
      const formatFn = getTableFormattingFunction()
      if (formatFn) {
        // Use the table's formatting function which will update HTML
        formatFn((cell: HTMLElement) => {
          const range = document.createRange()
          range.selectNodeContents(cell)
          const selection = window.getSelection()
          selection?.removeAllRanges()
          selection?.addRange(range)
          cell.focus()
          requestAnimationFrame(() => {
            try {
              const span = document.createElement('span')
              span.style.fontSize = `${newSize}px`
              const textContent = cell.textContent || ''
              if (textContent) {
                span.textContent = textContent
                range.deleteContents()
                range.insertNode(span)
              } else {
                cell.style.fontSize = `${newSize}px`
              }
            } catch {
              cell.style.fontSize = `${newSize}px`
            }
          })
        })
        setShowFontSizeMenu(false)
        return
      }
      
      // Fallback
      const allCells = getAllTableCells()
      if (allCells.length > 0) {
        allCells.forEach(cell => {
          const range = document.createRange()
          range.selectNodeContents(cell)
          const selection = window.getSelection()
          selection?.removeAllRanges()
          selection?.addRange(range)
          cell.focus()
          requestAnimationFrame(() => {
            try {
              const span = document.createElement('span')
              span.style.fontSize = `${newSize}px`
              const textContent = cell.textContent || ''
              if (textContent) {
                span.textContent = textContent
                range.deleteContents()
                range.insertNode(span)
              } else {
                cell.style.fontSize = `${newSize}px`
              }
              // Trigger update by blurring and refocusing
              setTimeout(() => {
                cell.blur()
                cell.focus()
                cell.blur()
              }, 50)
            } catch {
              cell.style.fontSize = `${newSize}px`
              setTimeout(() => {
                cell.blur()
                cell.focus()
                cell.blur()
              }, 50)
            }
          })
        })
        setShowFontSizeMenu(false)
        return
      }
    }
    
    // Check if we're in a table cell
    const tableCell = isSelectionInTableCell()
    if (tableCell) {
      const cellElement = tableCell as HTMLElement
      const selection = window.getSelection()
      if (selection && selection.rangeCount > 0) {
        const range = selection.getRangeAt(0)
        if (cellElement.contains(range.commonAncestorContainer)) {
          // Restore focus and selection
          cellElement.focus()
          // Apply font size using inline style
          if (selection.toString()) {
            // Text is selected, wrap in span
            try {
              const span = document.createElement('span')
              span.style.fontSize = `${newSize}px`
              span.textContent = selection.toString()
              range.deleteContents()
              range.insertNode(span)
              // Move cursor after the span
              range.setStartAfter(span)
              range.collapse(true)
              selection.removeAllRanges()
              selection.addRange(range)
            } catch (e) {
              // Fallback: use execCommand
              cellElement.focus()
              setTimeout(() => {
                document.execCommand('fontSize', false, '7')
                const fontElements = cellElement.querySelectorAll('font[size="7"]')
                fontElements.forEach(el => {
                  const span = document.createElement('span')
                  span.style.fontSize = `${newSize}px`
                  el.replaceWith(span)
                })
              }, 0)
            }
          } else {
            // No selection, apply to cell
            cellElement.style.fontSize = `${newSize}px`
          }
          setShowFontSizeMenu(false)
          return
        }
      }
    }
    // Apply font size to selected text
    if (!stableEditor || stableEditor.isDestroyed) return
    stableEditor.chain().focus().setMark('textStyle', { fontSize: newSize.toString() }).run()
    setShowFontSizeMenu(false)
  }

  const handleFontSizeChange = (delta: number) => {
    const newSize = Math.max(8, Math.min(400, fontSize + delta))
    setFontSize(newSize)
    
    // Check if entire table is selected
    if (isTableNodeSelected()) {
      const formatFn = getTableFormattingFunction()
      if (formatFn) {
        formatFn((cell: HTMLElement) => {
          const range = document.createRange()
          range.selectNodeContents(cell)
          const selection = window.getSelection()
          selection?.removeAllRanges()
          selection?.addRange(range)
          cell.focus()
          requestAnimationFrame(() => {
            try {
              const span = document.createElement('span')
              span.style.fontSize = `${newSize}px`
              const textContent = cell.textContent || ''
              if (textContent) {
                span.textContent = textContent
                range.deleteContents()
                range.insertNode(span)
              } else {
                cell.style.fontSize = `${newSize}px`
              }
            } catch {
              cell.style.fontSize = `${newSize}px`
            }
          })
        })
        return
      }
      
      // Fallback
      const allCells = getAllTableCells()
      if (allCells.length > 0) {
        allCells.forEach(cell => {
          const range = document.createRange()
          range.selectNodeContents(cell)
          const selection = window.getSelection()
          selection?.removeAllRanges()
          selection?.addRange(range)
          cell.focus()
          requestAnimationFrame(() => {
            try {
              const span = document.createElement('span')
              span.style.fontSize = `${newSize}px`
              const textContent = cell.textContent || ''
              if (textContent) {
                span.textContent = textContent
                range.deleteContents()
                range.insertNode(span)
              } else {
                cell.style.fontSize = `${newSize}px`
              }
              setTimeout(() => {
                cell.blur()
                cell.focus()
                cell.blur()
              }, 50)
            } catch {
              cell.style.fontSize = `${newSize}px`
              setTimeout(() => {
                cell.blur()
                cell.focus()
                cell.blur()
              }, 50)
            }
          })
        })
        return
      }
    }
    
    // Check if we're in a table cell
    const tableCell = isSelectionInTableCell()
    if (tableCell) {
      const cellElement = tableCell as HTMLElement
      const selection = window.getSelection()
      if (selection && selection.rangeCount > 0) {
        const range = selection.getRangeAt(0)
        if (cellElement.contains(range.commonAncestorContainer) && selection.toString()) {
          cellElement.focus()
          setTimeout(() => {
            try {
              const span = document.createElement('span')
              span.style.fontSize = `${newSize}px`
              span.textContent = selection.toString()
              range.deleteContents()
              range.insertNode(span)
              range.setStartAfter(span)
              range.collapse(true)
              selection.removeAllRanges()
              selection.addRange(range)
            } catch {
              document.execCommand('fontSize', false, '7')
              const fontElements = cellElement.querySelectorAll('font[size="7"]')
              fontElements.forEach(el => {
                const span = document.createElement('span')
                span.style.fontSize = `${newSize}px`
                el.replaceWith(span)
              })
            }
          }, 0)
          return
        }
      }
      cellElement.style.fontSize = `${newSize}px`
      return
    }
    // Apply font size to selected text using TextStyle extension
    if (canUseEditor()) {
      stableEditor!.chain().focus().setMark('textStyle', { fontSize: newSize.toString() }).run()
    }
  }

  const handleInsertLink = () => {
    setLinkUrl('')
    setShowLinkDialog(true)
  }

  const handleLinkSubmit = (): void => {
    if (!stableEditor || stableEditor.isDestroyed) return
    if (!linkUrl.trim()) {
      setShowLinkDialog(false)
      setLinkUrl('')
      return
    }
    
    if (!canUseEditor()) return
    const url = linkUrl.trim()
    const { from, to } = stableEditor!.state.selection
    
    // If text is selected, apply link to selected text
    if (from !== to) {
      stableEditor!.chain().focus().setLink({ href: url }).run()
    } else {
      // No text selected - insert URL as clickable link
      // Use insertContent with HTML to create a link directly
      stableEditor.chain()
        .focus()
        .insertContent(`<a href="${url}">${url}</a>`)
        .run()
    }
    
    setShowLinkDialog(false)
    setLinkUrl('')
  }

  const handleLinkCancel = (): void => {
    setShowLinkDialog(false)
    setLinkUrl('')
  }

  const handleInsertImage = () => {
    fileInputRef.current?.click()
  }

  const handleInsertGraph = (graphType: 'table' | 'column' | 'line' | 'pie') => {
    if (!stableEditor || stableEditor.isDestroyed) return
    
    if (graphType === 'table') {
      // Insert a 3x3 table using TableExtension
      const tableHtml = `<table style="border-collapse: collapse; width: 100%; margin: 16px 0;">
        <thead>
          <tr>
            <th style="border: 1px solid ${theme === 'dark' ? '#555' : '#ddd'}; padding: 8px; text-align: left; background-color: ${theme === 'dark' ? '#2a2a2a' : '#f5f5f5'};">Header 1</th>
            <th style="border: 1px solid ${theme === 'dark' ? '#555' : '#ddd'}; padding: 8px; text-align: left; background-color: ${theme === 'dark' ? '#2a2a2a' : '#f5f5f5'};">Header 2</th>
            <th style="border: 1px solid ${theme === 'dark' ? '#555' : '#ddd'}; padding: 8px; text-align: left; background-color: ${theme === 'dark' ? '#2a2a2a' : '#f5f5f5'};">Header 3</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style="border: 1px solid ${theme === 'dark' ? '#555' : '#ddd'}; padding: 8px;">Cell 1</td>
            <td style="border: 1px solid ${theme === 'dark' ? '#555' : '#ddd'}; padding: 8px;">Cell 2</td>
            <td style="border: 1px solid ${theme === 'dark' ? '#555' : '#ddd'}; padding: 8px;">Cell 3</td>
          </tr>
          <tr>
            <td style="border: 1px solid ${theme === 'dark' ? '#555' : '#ddd'}; padding: 8px;">Cell 4</td>
            <td style="border: 1px solid ${theme === 'dark' ? '#555' : '#ddd'}; padding: 8px;">Cell 5</td>
            <td style="border: 1px solid ${theme === 'dark' ? '#555' : '#ddd'}; padding: 8px;">Cell 6</td>
          </tr>
        </tbody>
      </table>`
      // @ts-ignore - TableExtension command (custom extension method)
      if (canUseEditor()) {
        (stableEditor!.chain().focus() as any).insertTableBlock(tableHtml).run()
      }
    } else {
      // Insert chart using ChartExtension
      if (canUseEditor()) {
        const chartData = {
          labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May'],
          datasets: [{
            label: 'Data',
            values: [10, 20, 15, 25, 30]
          }]
        }
        // @ts-ignore - ChartExtension command
        stableEditor!.chain().focus().setChart(graphType, chartData, '').run()
      }
    }
    
    setShowGraphMenu(false)
  }


  const handleImageFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file && file.type.startsWith('image/')) {
      const reader = new FileReader()
      reader.onload = (e) => {
        const dataUrl = e.target?.result as string
        if (dataUrl && canUseEditor()) {
          // Insert image and then add a paragraph after it so cursor can be placed
          stableEditor!.chain().focus().setImage({ src: dataUrl }).insertContent('<p></p>').run()
        }
      }
      reader.readAsDataURL(file)
    }
    // Reset the input so the same file can be selected again
    if (event.target) {
      event.target.value = ''
    }
  }

  const handleInsertMath = () => {
    const newState = !showMathMenu
    closeAllMenusExcept(newState ? 'math' : null)
    setShowMathMenu(newState)
    if (newState) {
      setMathFormula('')
    }
  }

  const handleMathSubmit = () => {
    if (mathFormula.trim() && canUseEditor()) {
      // @ts-ignore - Math extension command
      stableEditor!.chain().focus().setMath(mathFormula.trim(), false).run()
    }
    setShowMathMenu(false)
  }

  const styles = [
    { label: 'Title', value: 'title', fontSize: '24px', fontWeight: 600 },
    { label: 'Subtitle', value: 'subtitle', fontSize: '18px', fontWeight: 500 },
    { label: 'Normal text', value: 'normal', fontSize: '16px', fontWeight: 400 },
    { label: 'Heading 1', value: 'h1', fontSize: '26px', fontWeight: 600 },
    { label: 'Heading 2', value: 'h2', fontSize: '22px', fontWeight: 600 },
    { label: 'Heading 3', value: 'h3', fontSize: '19px', fontWeight: 600 },
  ]

  const fontOptions = [
    { label: 'Source Sans', value: 'Source Sans 3' },
    { label: 'Inter', value: 'Inter' },
    { label: 'Noto Sans SC', value: 'Noto Sans SC' },
    { label: 'EB Garamond', value: 'EB Garamond' },
    { label: 'Liberation Serif', value: 'Liberation Serif' },
    { label: 'Open Sans', value: 'Open Sans' },
    { label: 'Roboto', value: 'Roboto' },
    { label: 'Montserrat', value: 'Montserrat' },
    { label: 'Courier Prime', value: 'Courier Prime' },
  ]

  // Get current style label
  const getCurrentStyle = () => {
    if (!stableEditor || stableEditor.isDestroyed) return 'Normal text'
    if (stableEditor.isActive('title')) return 'Title'
    if (stableEditor.isActive('subtitle')) return 'Subtitle'
    if (stableEditor.isActive('heading', { level: 1 })) return 'Heading 1'
    if (stableEditor.isActive('heading', { level: 2 })) return 'Heading 2'
    if (stableEditor.isActive('heading', { level: 3 })) return 'Heading 3'
    return 'Normal text'
  }

  // Get current font family
  const getCurrentFontFamily = () => {
    if (!stableEditor || stableEditor.isDestroyed) return 'Source Sans 3'
    const attrs = stableEditor.getAttributes('textStyle')
    return attrs.fontFamily || 'Source Sans 3'
  }

  const getCurrentFontLabel = () => {
    const currentValue = getCurrentFontFamily()
    const match = fontOptions.find((font) => font.value === currentValue)
    return match ? match.label : currentValue
  }

  // Normalize color for comparison (handles different formats)
  const normalizeColor = (color: string | null | undefined): string | null => {
    if (!color) return null
    // Convert to lowercase and ensure it starts with #
    const normalized = color.toLowerCase().trim()
    return normalized.startsWith('#') ? normalized : `#${normalized}`
  }

  // Get current text color
  const getCurrentColor = () => {
    if (!stableEditor || stableEditor.isDestroyed) return null
    const attrs = stableEditor.getAttributes('textStyle')
    return normalizeColor(attrs.color)
  }

  // Get current highlight color
  const getCurrentHighlightColor = () => {
    if (!stableEditor || stableEditor.isDestroyed) return null
    const attrs = stableEditor.getAttributes('highlight')
    return normalizeColor(attrs?.color)
  }

  // Check if a style is currently active
  const isStyleActive = (styleValue: string) => {
    if (!stableEditor || stableEditor.isDestroyed) return false
    if (styleValue === 'title') {
      return stableEditor.isActive('title')
    }
    if (styleValue === 'subtitle') {
      return stableEditor.isActive('subtitle')
    }
    if (styleValue === 'normal') {
      // Normal text is active when it's a paragraph AND not title/subtitle/heading
      return stableEditor.isActive('paragraph') && 
             !stableEditor.isActive('title') && 
             !stableEditor.isActive('subtitle') &&
             !stableEditor.isActive('heading')
    }
    if (styleValue.startsWith('h')) {
      const level = parseInt(styleValue.slice(1)) as 1 | 2 | 3
      return stableEditor.isActive('heading', { level })
    }
    return false
  }

  return (
    <div 
      ref={toolbarRef}
      className="toolbar-container"
      style={{
        padding: '2px 6px 2px 0px',
        display: 'flex',
        gap: '2px',
        alignItems: 'center',
        backgroundColor: toolbarBgColor,
        width: '100%',
        overflowX: 'auto',
        overflowY: 'visible',
        position: 'relative',
        zIndex: 10005
      }}
    >
      {/* Home Icon */}
      <button 
        style={buttonStyle}
        title="Home"
        onMouseDown={(e) => {
          e.preventDefault()
          navigate('/documents')
        }}
        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = toolbarHoverBg}
        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
      >
        <HomeIcon style={{ fontSize: '19px' }} />
      </button>

      {/* Search */}
      <button 
        style={isSearchActive ? activeButtonStyle : buttonStyle}
        title="Search"
        onMouseDown={(e) => {
          e.preventDefault()
          onToggleSearch?.()
        }}
        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = toolbarHoverBg}
        onMouseLeave={(e) => {
          if (!isSearchActive) {
            e.currentTarget.style.backgroundColor = 'transparent'
          }
        }}
      >
        <SearchIcon style={{ fontSize: '18px', transform: 'translateY(1px)' }} />
      </button>

      {/* Undo/Redo - Use custom handlers if provided, otherwise use editor's undo/redo */}
      <button
        onMouseDown={(e) => {
          e.preventDefault()
          if (customUndoRedo) {
            customUndoRedo.undo()
          } else if (stableEditor && !isPDF) {
            stableEditor.chain().focus().undo().run()
          }
        }}
        disabled={customUndoRedo ? !customUndoRedo.canUndo() : (!stableEditor || isPDF || !stableEditor.can().undo())}
        style={{ 
          ...buttonStyle, 
          opacity: customUndoRedo 
            ? (customUndoRedo.canUndo() ? 1 : 0.3)
            : (stableEditor && !isPDF && stableEditor.can().undo()) ? 1 : 0.3 
        }}
        title="Undo"
        onMouseEnter={(e) => {
          const canUndo = customUndoRedo ? customUndoRedo.canUndo() : (stableEditor && !isPDF && stableEditor.can().undo())
          if (canUndo) {
            e.currentTarget.style.backgroundColor = toolbarHoverBg
          }
        }}
        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
      >
        <UndoIcon style={{ fontSize: '20px' }} />
      </button>
      <button
        onMouseDown={(e) => {
          e.preventDefault()
          if (customUndoRedo) {
            customUndoRedo.redo()
          } else if (stableEditor && !isPDF) {
            stableEditor.chain().focus().redo().run()
          }
        }}
        disabled={customUndoRedo ? !customUndoRedo.canRedo() : (!stableEditor || isPDF || !stableEditor.can().redo())}
        style={{ 
          ...buttonStyle, 
          opacity: customUndoRedo 
            ? (customUndoRedo.canRedo() ? 1 : 0.3)
            : (stableEditor && !isPDF && stableEditor.can().redo()) ? 1 : 0.3 
        }}
        title="Redo"
        onMouseEnter={(e) => {
          const canRedo = customUndoRedo ? customUndoRedo.canRedo() : (stableEditor && !isPDF && stableEditor.can().redo())
          if (canRedo) {
            e.currentTarget.style.backgroundColor = toolbarHoverBg
          }
        }}
        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
      >
        <RedoIcon style={{ fontSize: '20px' }} />
      </button>

      {/* Theme Toggle */}
      <button 
        style={buttonStyle}
        title={theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}
        onClick={toggleTheme}
        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = toolbarHoverBg}
        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
      >
        {theme === 'light' ? (
          <DarkModeIcon style={{ fontSize: '17px', transform: 'translateY(0.5px)' }} />
        ) : (
          <LightModeIcon style={{ fontSize: '17px', transform: 'translateY(0.5px)' }} />
        )}
      </button>

      {/* Keyboard Shortcuts */}
      <button
        ref={keyboardShortcutsButtonRef}
        style={showKeyboardShortcutsModal ? activeButtonStyle : buttonStyle}
        title="Keyboard shortcuts"
        onClick={() => setShowKeyboardShortcutsModal(!showKeyboardShortcutsModal)}
        onMouseEnter={(e) => {
          if (!showKeyboardShortcutsModal) {
            e.currentTarget.style.backgroundColor = toolbarHoverBg
          }
        }}
        onMouseLeave={(e) => {
          if (!showKeyboardShortcutsModal) {
            e.currentTarget.style.backgroundColor = 'transparent'
          }
        }}
      >
        <KeyboardIcon style={{ fontSize: '19px' }} />
      </button>

      <div style={{ ...dividerStyle, marginLeft: '7px' }} />

      {/* Style Dropdown */}
      <div ref={styleMenuRef} style={{ position: 'relative' }}>
        <button
          onMouseDown={(e) => {
            e.preventDefault()
            const newState = !showStyleMenu
            closeAllMenusExcept(newState ? 'style' : null)
            setShowStyleMenu(newState)
          }}
          style={styleDropdownStyle}
          title="Paragraph styles"
          onMouseEnter={(e) => e.currentTarget.style.backgroundColor = toolbarHoverBg}
          onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
        >
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, textAlign: 'left' }}>
            {getCurrentStyle()}
          </span>
          <ArrowDropDownIcon style={{ fontSize: '20px', marginLeft: '4px', flexShrink: 0 }} />
        </button>
        {showStyleMenu && (() => {
          const rect = styleMenuRef.current?.getBoundingClientRect()
          return (
            <div ref={styleDropdownRef} style={{
              position: 'fixed',
              top: rect ? `${rect.bottom + 8}px` : '100%',
              left: rect ? `${rect.left}px` : 0,
              backgroundColor: dropdownBg,
              border: `1px solid ${dropdownBorder}`,
              borderRadius: '8px',
              boxShadow: theme === 'dark' 
                ? '0 8px 32px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(255, 255, 255, 0.05)' 
                : '0 8px 32px rgba(0, 0, 0, 0.12), 0 0 0 1px rgba(0, 0, 0, 0.04)',
              zIndex: 10010,
              minWidth: '200px',
              maxWidth: '200px',
              padding: '4px',
              backdropFilter: 'blur(20px)',
              transition: 'opacity 0.2s ease, transform 0.2s ease'
            }}>
            {styles.map((style) => {
              const isActive = isStyleActive(style.value)
              return (
                <div
                  key={style.value}
                  onMouseDown={(e) => {
                    e.preventDefault()
                    if (!canUseEditor()) return
                    
                    // Extract font size from style (e.g., '24px' -> 24 as string)
                    const fontSizeMatch = style.fontSize.match(/(\d+)/)
                    const fontSize = fontSizeMatch ? fontSizeMatch[1] : null
                    
                    // Get current selection
                    const { from } = stableEditor!.state.selection
                    const $from = stableEditor!.state.doc.resolve(from)
                    
                    // Find the current block node (paragraph, heading, title, subtitle)
                    let blockNode: any = null
                    let blockStart = from
                    let blockEnd = from
                    for (let depth = $from.depth; depth > 0; depth--) {
                      const node = $from.node(depth)
                      if (node.type.name === 'paragraph' || 
                          node.type.name === 'heading' || 
                          node.type.name === 'title' || 
                          node.type.name === 'subtitle') {
                        blockNode = node
                        blockStart = $from.start(depth)
                        // Use content size to get correct end position (excluding closing token)
                        blockEnd = blockStart + node.content.size
                        break
                      }
                    }
                    
                    // Apply paragraph style
                    if (style.value === 'title') {
                      // @ts-ignore - Title extension command
                      stableEditor!.chain().focus().setTitle().run()
                    } else if (style.value === 'subtitle') {
                      // @ts-ignore - Subtitle extension command
                      stableEditor!.chain().focus().setSubtitle().run()
                    } else if (style.value.startsWith('h')) {
                      const level = parseInt(style.value.slice(1)) as 1 | 2 | 3
                      // Check if already the target heading level - if so, don't toggle
                      const isCurrentHeading = blockNode && 
                        blockNode.type.name === 'heading' && 
                        blockNode.attrs?.level === level
                      if (!isCurrentHeading) {
                        stableEditor!.chain().focus().toggleHeading({ level }).run()
                      }
                    } else {
                      // Normal text
                      stableEditor!.chain().focus().setParagraph().run()
                    }
                    
                    // Apply font size to all text in the paragraph after setting the style
                    if (fontSize) {
                      // Get the textStyle mark type from editor schema
                      const textStyleMark = stableEditor!.schema.marks.textStyle
                      if (textStyleMark) {
                        // Select all text in the current block and apply font size
                        stableEditor!.chain()
                          .focus()
                          .setTextSelection({ from: blockStart, to: blockEnd })
                          .setMark('textStyle', { fontSize })
                          .run()
                      }
                    }
                    
                    setShowStyleMenu(false)
                  }}
                  style={{
                    padding: '10px 14px',
                    cursor: 'pointer',
                    color: dropdownTextColor,
                    backgroundColor: isActive ? dropdownActiveBg : 'transparent',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    borderRadius: '6px',
                    transition: 'background-color 0.15s ease, color 0.15s ease',
                    margin: '2px 0'
                  }}
                  onMouseEnter={(e) => {
                    if (!isActive) {
                      e.currentTarget.style.backgroundColor = dropdownHoverBg
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isActive) {
                      e.currentTarget.style.backgroundColor = 'transparent'
                    } else {
                      e.currentTarget.style.backgroundColor = dropdownActiveBg
                    }
                  }}
                >
                  <span style={{
                    fontSize: style.fontSize,
                    fontWeight: style.fontWeight,
                    fontFamily: "'Inter', 'Noto Sans SC', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif",
                    lineHeight: '1.3'
                  }}>{style.label}</span>
                </div>
              )
            })}
            </div>
          )
        })()}
      </div>

      <div style={dividerStyle} />

      {/* Font Dropdown */}
      <div ref={fontMenuRef} style={{ position: 'relative' }}>
        <button
          onMouseDown={(e) => {
            e.preventDefault()
            const newState = !showFontMenu
            closeAllMenusExcept(newState ? 'font' : null)
            setShowFontMenu(newState)
          }}
          style={fontDropdownStyle}
          title={getCurrentFontLabel()}
          onMouseEnter={(e) => e.currentTarget.style.backgroundColor = toolbarHoverBg}
          onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
        >
          <span style={{ overflow: 'hidden', textOverflow: 'clip', whiteSpace: 'nowrap', flex: 1, textAlign: 'left' }}>
            {getCurrentFontLabel()}
          </span>
          <ArrowDropDownIcon style={{ fontSize: '20px', marginLeft: '2px', flexShrink: 0 }} />
        </button>
        {showFontMenu && (() => {
          const rect = fontMenuRef.current?.getBoundingClientRect()
          return (
            <div ref={fontDropdownRef} style={{
              position: 'fixed',
              top: rect ? `${rect.bottom + 8}px` : '100%',
              left: rect ? `${rect.left}px` : 0,
              backgroundColor: dropdownBg,
              border: `1px solid ${dropdownBorder}`,
              borderRadius: '8px',
              boxShadow: theme === 'dark' 
                ? '0 8px 32px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(255, 255, 255, 0.05)' 
                : '0 8px 32px rgba(0, 0, 0, 0.12), 0 0 0 1px rgba(0, 0, 0, 0.04)',
              zIndex: 10010,
              minWidth: '170px',
              maxWidth: '170px',
              maxHeight: '220px',
              overflowY: 'scroll',
              scrollbarWidth: 'thin',
              scrollbarColor: 'var(--scrollbar-color-thumb) transparent',
              padding: '4px',
              backdropFilter: 'blur(20px)',
              transition: 'opacity 0.2s ease, transform 0.2s ease'
            }}>
            {fontOptions.map((font) => {
              const isActive = getCurrentFontFamily() === font.value
              return (
                <div
                  key={font.value}
                  onMouseDown={(e) => {
                    e.preventDefault()
                    if (canUseEditor()) {
                      stableEditor!.chain().focus().setMark('textStyle', { fontFamily: font.value }).run()
                      setShowFontMenu(false)
                    }
                  }}
                  style={{
                    padding: '10px 14px',
                    cursor: 'pointer',
                    fontSize: '13px',
                    color: dropdownTextColor,
                    fontFamily: font.value,
                    backgroundColor: isActive ? dropdownActiveBg : 'transparent',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    borderRadius: '6px',
                    transition: 'background-color 0.15s ease, color 0.15s ease',
                    margin: '2px 0'
                  }}
                  onMouseEnter={(e) => {
                    if (!isActive) {
                      e.currentTarget.style.backgroundColor = dropdownHoverBg
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isActive) {
                      e.currentTarget.style.backgroundColor = 'transparent'
                    } else {
                      e.currentTarget.style.backgroundColor = dropdownActiveBg
                    }
                  }}
                >
                  <span>{font.label}</span>
                </div>
              )
            })}
            </div>
          )
        })()}
      </div>

      <div style={dividerStyle} />

      {/* Font Size */}
      <button
        onMouseDown={(e) => {
          e.preventDefault()
          handleFontSizeChange(-1)
        }}
        style={buttonStyle}
        title="Decrease font size"
        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = toolbarHoverBg}
        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
      >
        <RemoveIcon style={{ fontSize: '18px' }} />
      </button>
      {/* Font Size Dropdown */}
      <div ref={fontSizeMenuRef} style={{ position: 'relative' }}>
        <button
          onMouseDown={(e) => {
            e.preventDefault()
            const newState = !showFontSizeMenu
            closeAllMenusExcept(newState ? 'fontSize' : null)
            setShowFontSizeMenu(newState)
          }}
          style={{
            ...buttonStyle,
            padding: '6px 12px',
            minWidth: 'auto',
            fontSize: '13px',
            fontFamily: "'Inter', 'Noto Sans SC', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif",
            justifyContent: 'center'
          }}
          title="Font size"
          onMouseEnter={(e) => e.currentTarget.style.backgroundColor = toolbarHoverBg}
          onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
        >
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textAlign: 'center' }}>
            {fontSize}
          </span>
        </button>
        {showFontSizeMenu && (() => {
          const rect = fontSizeMenuRef.current?.getBoundingClientRect()
          const fontSizes = [8, 9, 10, 11, 12, 14, 18, 24, 30, 36, 48, 60, 72, 96]
          return (
            <div ref={fontSizeDropdownRef} style={{
              position: 'fixed',
              top: rect ? `${rect.bottom + 8}px` : '100%',
              left: rect ? `${rect.left}px` : 0,
              backgroundColor: dropdownBg,
              border: `1px solid ${dropdownBorder}`,
              borderRadius: '8px',
              boxShadow: theme === 'dark' 
                ? '0 8px 32px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(255, 255, 255, 0.05)' 
                : '0 8px 32px rgba(0, 0, 0, 0.12), 0 0 0 1px rgba(0, 0, 0, 0.04)',
              zIndex: 10010,
              minWidth: '70px',
              maxHeight: '300px',
              overflowY: 'auto',
              padding: '4px',
              backdropFilter: 'blur(20px)',
              transition: 'opacity 0.2s ease, transform 0.2s ease'
            }}>
            {fontSizes.map((size) => {
              const isActive = fontSize === size
              return (
                <div
                  key={size}
                  onMouseDown={(e) => {
                    e.preventDefault()
                    handleFontSizeSelect(size)
                  }}
                  style={{
                    padding: '10px 14px',
                    cursor: 'pointer',
                    fontSize: '13px',
                    color: dropdownTextColor,
                    borderRadius: '6px',
                    transition: 'background-color 0.15s ease, color 0.15s ease',
                    margin: '2px 0',
                    backgroundColor: isActive 
                      ? (theme === 'dark' ? '#2a2a2a' : '#f0f0f0')
                      : 'transparent',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}
                  onMouseEnter={(e) => {
                    if (!isActive) {
                      e.currentTarget.style.backgroundColor = dropdownHoverBg
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isActive) {
                      e.currentTarget.style.backgroundColor = 'transparent'
                    } else {
                      e.currentTarget.style.backgroundColor = theme === 'dark' ? '#2a2a2a' : '#f0f0f0'
                    }
                  }}
                >
                  <span>{size}</span>
                </div>
              )
            })}
            </div>
          )
        })()}
      </div>
      <button
        onMouseDown={(e) => {
          e.preventDefault()
          handleFontSizeChange(1)
        }}
        style={buttonStyle}
        title="Increase font size"
        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = toolbarHoverBg}
        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
      >
        <AddIcon style={{ fontSize: '18px' }} />
      </button>

      <div style={dividerStyle} />

      {/* Bold, Italic, Underline - Disabled for PDF files */}
      <button
        onMouseDown={(e) => {
          e.preventDefault()
          if (canUseEditor()) {
            if (isTableNodeSelected() || isSelectionInTableCell()) {
              applyTableCellFormatting('bold')
            } else {
              stableEditor!.chain().focus().toggleBold().run()
            }
          }
        }}
        disabled={!canUseEditor()}
        style={(canUseEditor() && (stableEditor!.isActive('bold') || (isTableNodeSelected() || isSelectionInTableCell()) && document.queryCommandState('bold'))) ? activeButtonStyle : buttonStyle}
        title="Bold"
        onMouseEnter={(e) => {
          if (canUseEditor() && !stableEditor!.isActive('bold')) {
            e.currentTarget.style.backgroundColor = toolbarHoverBg
          }
        }}
        onMouseLeave={(e) => {
          if (canUseEditor() && !stableEditor!.isActive('bold')) {
            e.currentTarget.style.backgroundColor = 'transparent'
          }
        }}
      >
        <FormatBoldIcon style={{ fontSize: '20px' }} />
      </button>
      <button
        onMouseDown={(e) => {
          e.preventDefault()
          if (canUseEditor()) {
            if (isTableNodeSelected() || isSelectionInTableCell()) {
              applyTableCellFormatting('italic')
            } else {
              stableEditor!.chain().focus().toggleItalic().run()
            }
          }
        }}
        disabled={!canUseEditor()}
        style={(canUseEditor() && (stableEditor!.isActive('italic') || ((isTableNodeSelected() || isSelectionInTableCell()) && document.queryCommandState('italic')))) ? activeButtonStyle : buttonStyle}
        title="Italic"
        onMouseEnter={(e) => {
          if (canUseEditor() && !stableEditor!.isActive('italic')) {
            e.currentTarget.style.backgroundColor = toolbarHoverBg
          }
        }}
        onMouseLeave={(e) => {
          if (canUseEditor() && !stableEditor!.isActive('italic')) {
            e.currentTarget.style.backgroundColor = 'transparent'
          }
        }}
      >
        <FormatItalicIcon style={{ fontSize: '20px' }} />
      </button>
      <button
        onMouseDown={(e) => {
          e.preventDefault()
          if (canUseEditor()) {
            if (isTableNodeSelected() || isSelectionInTableCell()) {
              applyTableCellFormatting('underline')
            } else {
              stableEditor!.chain().focus().toggleUnderline().run()
            }
          }
        }}
        style={stableEditor?.isActive('underline') || ((isTableNodeSelected() || isSelectionInTableCell()) && document.queryCommandState('underline')) ? activeButtonStyle : buttonStyle}
        title="Underline"
        onMouseEnter={(e) => {
          if (!stableEditor?.isActive('underline')) {
            e.currentTarget.style.backgroundColor = toolbarHoverBg
          }
        }}
        onMouseLeave={(e) => {
          if (!stableEditor?.isActive('underline')) {
            e.currentTarget.style.backgroundColor = 'transparent'
          }
        }}
      >
        <FormatUnderlinedIcon style={{ fontSize: '20px' }} />
      </button>

      {/* Text Color */}
      <div ref={colorMenuRef} style={{ position: 'relative' }}>
        <button
          onMouseDown={(e) => {
            e.preventDefault()
            const newState = !showColorMenu
            closeAllMenusExcept(newState ? 'color' : null)
            setShowColorMenu(newState)
          }}
          style={showColorMenu ? activeButtonStyle : buttonStyle}
          title="Text color"
          onMouseEnter={(e) => {
            if (!showColorMenu) {
              e.currentTarget.style.backgroundColor = toolbarHoverBg
            }
          }}
          onMouseLeave={(e) => {
            if (!showColorMenu) {
              e.currentTarget.style.backgroundColor = 'transparent'
            }
          }}
        >
          <FormatColorTextIcon style={{ fontSize: '20px' }} />
        </button>
        {showColorMenu && (() => {
          const rect = colorMenuRef.current?.getBoundingClientRect()
          return (
            <div ref={colorDropdownRef} style={{
              position: 'fixed',
              top: rect ? `${rect.bottom + 8}px` : '100%',
              left: rect ? `${rect.left}px` : 0,
              backgroundColor: dropdownBg,
              border: `1px solid ${dropdownBorder}`,
              borderRadius: '8px',
              boxShadow: theme === 'dark' 
                ? '0 8px 32px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(255, 255, 255, 0.05)' 
                : '0 8px 32px rgba(0, 0, 0, 0.12), 0 0 0 1px rgba(0, 0, 0, 0.04)',
              zIndex: 10010,
              padding: '10px',
              display: 'grid',
              gridTemplateColumns: 'repeat(5, 1fr)',
              gap: '6px',
              backdropFilter: 'blur(20px)',
              transition: 'opacity 0.2s ease, transform 0.2s ease'
            }}>
            {(theme === 'dark' 
              ? ['#FFFFFF', '#B0B0B0', '#FF6B6B', '#FF8E53', '#FFB84D', '#51CF66', '#4DABF7', '#748FFC', '#B197FC', '#F783AC']
              : ['#202124', '#6B7280', '#EF4444', '#F97316', '#F59E0B', '#10B981', '#3B82F6', '#6366F1', '#8B5CF6', '#EC4899']
            ).map((color, index) => {
              const currentColor = getCurrentColor()
              // Check if this is the first color (default text color) - should unset color instead
              const isDefaultColor = index === 0
              // For default colors, show as active when no color is set (null) or matches default colors
              // For other colors, show as active when they match the current color
              const isActive = isDefaultColor 
                ? (currentColor === null || currentColor === '#000000' || currentColor === '#ffffff' || currentColor === '#202124')
                : (currentColor === color.toLowerCase())
              return (
                <div
                  key={color}
                  onMouseDown={(e) => {
                    e.preventDefault()
                    if (!canUseEditor()) return
                    if (isDefaultColor) {
                      // For black/white, unset color to use theme's default text color
                      stableEditor!.chain().focus().unsetColor().run()
                    } else {
                      // For other colors, set them normally
                      stableEditor!.chain().focus().setColor(color).run()
                    }
                    setShowColorMenu(false)
                  }}
                  style={{
                    width: '28px',
                    height: '28px',
                    backgroundColor: color,
                    border: isActive 
                      ? `2.5px solid ${dropdownActiveColor}` 
                      : `1.5px solid ${dropdownBorder}`,
                    borderRadius: '50%',
                    cursor: 'pointer',
                    transition: 'transform 0.2s ease, box-shadow 0.2s ease, border 0.2s ease',
                    boxShadow: isActive 
                      ? theme === 'dark' 
                        ? `0 0 0 3px ${dropdownActiveColor}30, 0 2px 8px rgba(0, 0, 0, 0.3)` 
                        : `0 0 0 3px ${dropdownActiveColor}30, 0 2px 8px rgba(0, 0, 0, 0.15)`
                      : 'none',
                    position: 'relative'
                  }}
                  onMouseEnter={(e) => {
                    if (!isActive) {
                      e.currentTarget.style.transform = 'scale(1.15)'
                      e.currentTarget.style.boxShadow = theme === 'dark' 
                        ? '0 0 0 3px rgba(158, 158, 158, 0.25), 0 4px 12px rgba(0, 0, 0, 0.4)' 
                        : '0 0 0 3px rgba(117, 117, 117, 0.25), 0 4px 12px rgba(0, 0, 0, 0.2)'
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isActive) {
                      e.currentTarget.style.transform = 'scale(1)'
                      e.currentTarget.style.boxShadow = 'none'
                    }
                  }}
                />
              )
            })}
            </div>
          )
        })()}
      </div>

      {/* Highlight */}
      <div ref={highlightMenuRef} style={{ position: 'relative' }}>
        <button
          onMouseDown={(e) => {
            e.preventDefault()
            const newState = !showHighlightMenu
            closeAllMenusExcept(newState ? 'highlight' : null)
            setShowHighlightMenu(newState)
          }}
          style={showHighlightMenu ? activeButtonStyle : buttonStyle}
          title="Highlight color"
          onMouseEnter={(e) => {
            if (!showHighlightMenu) {
              e.currentTarget.style.backgroundColor = toolbarHoverBg
            }
          }}
          onMouseLeave={(e) => {
            if (!showHighlightMenu) {
              e.currentTarget.style.backgroundColor = 'transparent'
            }
          }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>ink_highlighter</span>
        </button>
        {showHighlightMenu && (() => {
          const rect = highlightMenuRef.current?.getBoundingClientRect()
          return (
            <div ref={highlightDropdownRef} style={{
              position: 'fixed',
              top: rect ? `${rect.bottom + 8}px` : '100%',
              left: rect ? `${rect.left}px` : 0,
              backgroundColor: dropdownBg,
              border: `1px solid ${dropdownBorder}`,
              borderRadius: '8px',
              boxShadow: theme === 'dark' 
                ? '0 8px 32px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(255, 255, 255, 0.05)' 
                : '0 8px 32px rgba(0, 0, 0, 0.12), 0 0 0 1px rgba(0, 0, 0, 0.04)',
              zIndex: 10010,
              padding: '10px',
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
              backdropFilter: 'blur(20px)',
              transition: 'opacity 0.2s ease, transform 0.2s ease'
            }}>
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(6, 1fr)',
                gap: '4px'
              }}>
                {(theme === 'dark'
                  ? ['#FFE5E5', '#FFE5F1', '#F3E5F5', '#E5E7FF', '#E5F2FF', '#E5F9F0', '#FFF4E5', '#2D3748', '#2D1B2E', '#1A202C', '#1A2E1A', '#2D2D1A']
                  : ['#FEE2E2', '#FCE7F3', '#F3E8FF', '#E0E7FF', '#DBEAFE', '#D1FAE5', '#FEF3C7', '#1E293B', '#581C87', '#1E1B4B', '#064E3B', '#78350F']
                ).map((color) => {
                  const isActive = getCurrentHighlightColor() === color.toLowerCase()
                  return (
                    <div
                      key={color}
                      onMouseDown={(e) => {
                        e.preventDefault()
                        if (!canUseEditor()) return
                        stableEditor!.chain().focus().toggleHighlight({ color }).run()
                        setShowHighlightMenu(false)
                      }}
                      style={{
                        width: '28px',
                        height: '28px',
                        backgroundColor: color,
                        border: isActive 
                          ? `2.5px solid ${dropdownActiveColor}` 
                          : `1.5px solid ${dropdownBorder}`,
                        borderRadius: '50%',
                        cursor: 'pointer',
                        transition: 'transform 0.2s ease, box-shadow 0.2s ease, border 0.2s ease',
                        boxShadow: isActive 
                          ? theme === 'dark' 
                            ? `0 0 0 3px ${dropdownActiveColor}30, 0 2px 8px rgba(0, 0, 0, 0.3)` 
                            : `0 0 0 3px ${dropdownActiveColor}30, 0 2px 8px rgba(0, 0, 0, 0.15)`
                          : 'none',
                        position: 'relative'
                      }}
                      onMouseEnter={(e) => {
                        if (!isActive) {
                          e.currentTarget.style.transform = 'scale(1.15)'
                          e.currentTarget.style.boxShadow = theme === 'dark' 
                            ? '0 0 0 3px rgba(158, 158, 158, 0.25), 0 4px 12px rgba(0, 0, 0, 0.4)' 
                            : '0 0 0 3px rgba(117, 117, 117, 0.25), 0 4px 12px rgba(0, 0, 0, 0.2)'
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (!isActive) {
                          e.currentTarget.style.transform = 'scale(1)'
                          e.currentTarget.style.boxShadow = 'none'
                        }
                      }}
                    />
                  )
                })}
              </div>
              <div style={{
                paddingTop: '4px'
              }}>
                <button
                  onMouseDown={(e) => {
                    e.preventDefault()
                    if (!canUseEditor()) return
                    stableEditor!.chain().focus().unsetHighlight().run()
                    setShowHighlightMenu(false)
                  }}
                  disabled={!canUseEditor()}
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    backgroundColor: 'transparent',
                    border: 'none',
                    borderRadius: '6px',
                    color: dropdownTextColor,
                    cursor: 'pointer',
                    fontSize: '13px',
                    textAlign: 'left',
                    fontFamily: "'Inter', 'Noto Sans SC', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif",
                    transition: 'background-color 0.15s ease, color 0.15s ease',
                    marginTop: '4px'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = dropdownHoverBg
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = 'transparent'
                  }}
                >
                  Remove Highlight
                </button>
              </div>
            </div>
          )
        })()}
      </div>

      <div style={dividerStyle} />

      {/* Insert Link */}
      <button
        onMouseDown={(e) => {
          e.preventDefault()
          handleInsertLink()
        }}
        style={buttonStyle}
        title="Insert link"
        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = toolbarHoverBg}
        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
      >
        <LinkIcon style={{ fontSize: '20px' }} />
      </button>

      {/* Insert Image */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={handleImageFileSelect}
      />
      <button
        onMouseDown={(e) => {
          e.preventDefault()
          handleInsertImage()
        }}
        style={buttonStyle}
        title="Insert image"
        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = toolbarHoverBg}
        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
      >
        <ImageIcon style={{ fontSize: '20px' }} />
      </button>

      {/* Insert Graph */}
      <div ref={graphMenuRef} style={{ position: 'relative' }}>
        <button
          onMouseDown={(e) => {
            e.preventDefault()
            const newState = !showGraphMenu
            closeAllMenusExcept(newState ? 'graph' : null)
            setShowGraphMenu(newState)
          }}
          style={showGraphMenu ? activeButtonStyle : buttonStyle}
          title="Insert graph"
          onMouseEnter={(e) => {
            if (!showGraphMenu) {
              e.currentTarget.style.backgroundColor = toolbarHoverBg
            }
          }}
          onMouseLeave={(e) => {
            if (!showGraphMenu) {
              e.currentTarget.style.backgroundColor = 'transparent'
            }
          }}
        >
          <BarChartIcon style={{ fontSize: '20px' }} />
        </button>
        {showGraphMenu && (() => {
          const rect = graphMenuRef.current?.getBoundingClientRect()
          const graphTypes = [
            { label: 'Table', value: 'table' as const, icon: TableChartIcon },
            { label: 'Column', value: 'column' as const, icon: BarChartIcon },
            { label: 'Line', value: 'line' as const, icon: TimelineIcon },
            { label: 'Pie', value: 'pie' as const, icon: PieChartIcon },
          ]
          return (
            <div ref={graphDropdownRef} style={{
              position: 'fixed',
              top: rect ? `${rect.bottom + 8}px` : '100%',
              left: rect ? `${rect.left}px` : 0,
              backgroundColor: dropdownBg,
              border: `1px solid ${dropdownBorder}`,
              borderRadius: '8px',
              boxShadow: theme === 'dark' 
                ? '0 8px 32px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(255, 255, 255, 0.05)' 
                : '0 8px 32px rgba(0, 0, 0, 0.12), 0 0 0 1px rgba(0, 0, 0, 0.04)',
              zIndex: 10010,
              minWidth: '150px',
              maxWidth: '150px',
              padding: '4px',
              backdropFilter: 'blur(20px)',
              transition: 'opacity 0.2s ease, transform 0.2s ease'
            }}>
            {graphTypes.map((graphType) => {
              const IconComponent = graphType.icon
              return (
                <div
                  key={graphType.value}
                  onMouseDown={(e) => {
                    e.preventDefault()
                    handleInsertGraph(graphType.value)
                  }}
                  style={{
                    padding: '10px 14px',
                    cursor: 'pointer',
                    fontSize: '13px',
                    color: dropdownTextColor,
                    backgroundColor: 'transparent',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    borderRadius: '6px',
                    transition: 'background-color 0.15s ease, color 0.15s ease',
                    margin: '2px 0'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = dropdownHoverBg
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = 'transparent'
                  }}
                >
                  <IconComponent style={{ fontSize: '18px', color: dropdownTextColor }} />
                  <span>{graphType.label}</span>
                </div>
              )
            })}
            </div>
          )
        })()}
      </div>

      {/* Insert Math Formula */}
      <div ref={mathMenuRef} style={{ position: 'relative' }}>
        <button
          onMouseDown={(e) => {
            e.preventDefault()
            handleInsertMath()
          }}
          style={showMathMenu ? activeButtonStyle : buttonStyle}
          title="Insert math formula (inline)"
          onMouseEnter={(e) => {
            if (!showMathMenu) {
              e.currentTarget.style.backgroundColor = toolbarHoverBg
            }
          }}
          onMouseLeave={(e) => {
            if (!showMathMenu) {
              e.currentTarget.style.backgroundColor = 'transparent'
            }
          }}
        >
          <FunctionsIcon style={{ fontSize: '20px' }} />
        </button>
        {showMathMenu && (() => {
          const rect = mathMenuRef.current?.getBoundingClientRect()
          const dropdownWidth = 300
          const buttonCenter = rect ? rect.left + rect.width / 2 : 0
          return (
            <div ref={mathDropdownRef} style={{
              position: 'fixed',
              top: rect ? `${rect.bottom + 8}px` : '100%',
              left: rect ? `${buttonCenter - dropdownWidth / 2}px` : 0,
              backgroundColor: dropdownBg,
              border: `1px solid ${dropdownBorder}`,
              borderRadius: '8px',
              boxShadow: theme === 'dark' 
                ? '0 8px 32px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(255, 255, 255, 0.05)' 
                : '0 8px 32px rgba(0, 0, 0, 0.12), 0 0 0 1px rgba(0, 0, 0, 0.04)',
              zIndex: 10010,
              padding: '16px',
              width: `${dropdownWidth}px`,
              backdropFilter: 'blur(20px)',
              transition: 'opacity 0.2s ease, transform 0.2s ease'
            }}>
              <div style={{ marginBottom: '8px', fontSize: '13px', fontWeight: 500, color: dropdownTextColor }}>
                Enter LaTeX Formula
              </div>
              <input
                ref={mathInputRef}
                type="text"
                value={mathFormula}
                onChange={(e) => setMathFormula(e.target.value)}
                placeholder="E=mc^2"
                style={{
                  width: '100%',
                  padding: '8px 10px',
                  fontSize: '13px',
                  border: `1px solid ${dropdownBorder}`,
                  borderRadius: '6px',
                  backgroundColor: theme === 'dark' ? '#2a2a2a' : '#ffffff',
                  color: dropdownTextColor,
                  outline: 'none',
                  fontFamily: 'monospace',
                  marginBottom: '8px',
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleMathSubmit()
                  } else if (e.key === 'Escape') {
                    setShowMathMenu(false)
                  }
                }}
              />
              <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                <button
                  onClick={() => setShowMathMenu(false)}
                  style={{
                    padding: '6px 12px',
                    fontSize: '13px',
                    border: `1px solid ${dropdownBorder}`,
                    borderRadius: '6px',
                    backgroundColor: 'transparent',
                    color: dropdownTextColor,
                    cursor: 'pointer',
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.backgroundColor = dropdownHoverBg}
                  onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                >
                  Cancel
                </button>
                <button
                  onClick={handleMathSubmit}
                  style={{
                    padding: '6px 12px',
                    fontSize: '13px',
                    border: 'none',
                    borderRadius: '6px',
                    backgroundColor: theme === 'dark' ? '#7bb3d9' : '#8fc4e8',
                    color: '#ffffff',
                    cursor: 'pointer',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = theme === 'dark' ? '#6ba5c9' : '#7fb8de'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = theme === 'dark' ? '#7bb3d9' : '#8fc4e8'
                  }}
                >
                  Insert
                </button>
              </div>
            </div>
          )
        })()}
      </div>

      <div style={dividerStyle} />

      {/* Align & Indent */}
      <div ref={alignMenuRef} style={{ position: 'relative' }}>
        <button
          onMouseDown={(e) => {
            e.preventDefault()
            const newState = !showAlignMenu
            closeAllMenusExcept(newState ? 'align' : null)
            setShowAlignMenu(newState)
          }}
          style={{ ...buttonStyle, padding: '4px 4px 4px 4px' }}
          title="Align & indent"
          onMouseEnter={(e) => e.currentTarget.style.backgroundColor = toolbarHoverBg}
          onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
        >
          <FormatAlignLeftIcon style={{ fontSize: '20px' }} />
          <ArrowDropDownIcon style={{ fontSize: '16px', marginLeft: '0px' }} />
        </button>
        {showAlignMenu && (() => {
          const rect = alignMenuRef.current?.getBoundingClientRect()
          return (
            <div ref={alignDropdownRef} style={{
              position: 'fixed',
              top: rect ? `${rect.bottom + 8}px` : '100%',
              left: rect ? `${rect.left}px` : 0,
              backgroundColor: dropdownBg,
              border: `1px solid ${dropdownBorder}`,
              borderRadius: '6px',
              boxShadow: theme === 'dark' ? '0 2px 10px rgba(0,0,0,0.5)' : '0 2px 10px rgba(0,0,0,0.2)',
              zIndex: 10010,
              padding: '8px',
              minWidth: '200px'
            }}>
            <div style={{ padding: '4px 0', borderBottom: `1px solid ${dropdownBorder}`, marginBottom: '4px' }}>
              <div style={{ fontSize: '12px', color: theme === 'dark' ? '#858585' : '#5f6368', padding: '4px 8px' }}>Align</div>
              <div style={{ display: 'flex', gap: '4px', padding: '4px' }}>
                <button
                onMouseDown={(e) => {
                  e.preventDefault()
                  if (!canUseEditor()) return
                  stableEditor!.chain().focus().setTextAlign('left').run()
                  setShowAlignMenu(false)
                }}
                style={{ ...buttonStyle, minWidth: '36px' }}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = toolbarHoverBg}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
              >
                <FormatAlignLeftIcon style={{ fontSize: '20px' }} />
              </button>
              <button
                onMouseDown={(e) => {
                  e.preventDefault()
                  if (!canUseEditor()) return
                  stableEditor!.chain().focus().setTextAlign('center').run()
                  setShowAlignMenu(false)
                }}
                style={{ ...buttonStyle, minWidth: '36px' }}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = toolbarHoverBg}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
              >
                <FormatAlignCenterIcon style={{ fontSize: '20px' }} />
              </button>
              <button
                onMouseDown={(e) => {
                  e.preventDefault()
                  if (!canUseEditor()) return
                  stableEditor!.chain().focus().setTextAlign('right').run()
                  setShowAlignMenu(false)
                }}
                style={{ ...buttonStyle, minWidth: '36px' }}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = toolbarHoverBg}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
              >
                <FormatAlignRightIcon style={{ fontSize: '20px' }} />
              </button>
              <button
                onMouseDown={(e) => {
                  e.preventDefault()
                  if (!canUseEditor()) return
                  stableEditor!.chain().focus().setTextAlign('justify').run()
                  setShowAlignMenu(false)
                }}
                style={{ ...buttonStyle, minWidth: '36px' }}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = toolbarHoverBg}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
              >
                <FormatAlignJustifyIcon style={{ fontSize: '20px' }} />
              </button>
              </div>
            </div>
            <div style={{ padding: '4px 0' }}>
              <div style={{ fontSize: '12px', color: theme === 'dark' ? '#858585' : '#5f6368', padding: '4px 8px' }}>Indent</div>
              <div style={{ display: 'flex', gap: '4px', padding: '4px' }}>
                <button
                  onMouseDown={(e) => {
                    e.preventDefault()
                    if (!canUseEditor()) return
                    safeLiftCurrentListItem(stableEditor!)
                    setShowAlignMenu(false)
                  }}
                  style={{ ...buttonStyle, minWidth: '36px' }}
                  onMouseEnter={(e) => e.currentTarget.style.backgroundColor = toolbarHoverBg}
                  onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                >
                  <FormatIndentDecreaseIcon style={{ fontSize: '20px' }} />
                </button>
                <button
                  onMouseDown={(e) => {
                    e.preventDefault()
                    if (!canUseEditor()) return
                    stableEditor!.chain().focus().sinkListItem('listItem').run()
                    setShowAlignMenu(false)
                  }}
                  style={{ ...buttonStyle, minWidth: '36px' }}
                  onMouseEnter={(e) => e.currentTarget.style.backgroundColor = toolbarHoverBg}
                  onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                >
                  <FormatIndentIncreaseIcon style={{ fontSize: '20px' }} />
                </button>
              </div>
            </div>
            </div>
          )
        })()}
      </div>

      {/* Line & Paragraph Spacing */}
      <div ref={spacingMenuRef} style={{ position: 'relative' }}>
        <button
          onMouseDown={(e) => {
            e.preventDefault()
            const newState = !showSpacingMenu
            closeAllMenusExcept(newState ? 'spacing' : null)
            setShowSpacingMenu(newState)
          }}
          style={{ ...buttonStyle, padding: '4px 4px 4px 2px' }}
          title="Line & paragraph spacing"
          onMouseEnter={(e) => e.currentTarget.style.backgroundColor = toolbarHoverBg}
          onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
        >
          <FormatLineSpacingIcon style={{ fontSize: '20px' }} />
          <ArrowDropDownIcon style={{ fontSize: '16px', marginLeft: '0px' }} />
        </button>
        {showSpacingMenu && (() => {
          const rect = spacingMenuRef.current?.getBoundingClientRect()
          return (
            <div ref={spacingDropdownRef} style={{
              position: 'fixed',
              top: rect ? `${rect.bottom + 8}px` : '100%',
              left: rect ? `${rect.left}px` : 0,
              backgroundColor: dropdownBg,
              border: `1px solid ${dropdownBorder}`,
              borderRadius: '8px',
              boxShadow: theme === 'dark' 
                ? '0 8px 32px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(255, 255, 255, 0.05)' 
                : '0 8px 32px rgba(0, 0, 0, 0.12), 0 0 0 1px rgba(0, 0, 0, 0.04)',
              zIndex: 10010,
              minWidth: '180px',
              padding: '4px',
              backdropFilter: 'blur(20px)',
              transition: 'opacity 0.2s ease, transform 0.2s ease'
            }}>
            {[1.0, 1.15, 1.5, 1.75, 2.0, 2.5, 3.0].map((spacing) => (
              <div
                key={spacing}
                onMouseDown={(e) => {
                  e.preventDefault()
                  if (!canUseEditor()) return
                  stableEditor!.chain().focus().setLineHeight(spacing.toString()).run()
                  setShowSpacingMenu(false)
                }}
                style={{
                  padding: '8px 16px',
                  cursor: 'pointer',
                  fontSize: '13px',
                  color: dropdownTextColor
                }}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = dropdownHoverBg}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
              >
                {spacing}
              </div>
            ))}
            </div>
          )
        })()}
      </div>

      {/* Bulleted List - Disabled for PDF files */}
      <button
        onMouseDown={(e) => {
          e.preventDefault()
          if (canUseEditor()) {
            stableEditor!.chain().focus().toggleBulletList().run()
          }
        }}
        disabled={!canUseEditor()}
        style={(canUseEditor() && stableEditor!.isActive('bulletList')) ? activeButtonStyle : buttonStyle}
        title="Bulleted list"
        onMouseEnter={(e) => {
          if (canUseEditor() && !stableEditor!.isActive('bulletList')) {
            e.currentTarget.style.backgroundColor = toolbarHoverBg
          }
        }}
        onMouseLeave={(e) => {
          if (canUseEditor() && !stableEditor!.isActive('bulletList')) {
            e.currentTarget.style.backgroundColor = 'transparent'
          }
        }}
      >
        <FormatListBulletedIcon style={{ fontSize: '20px' }} />
      </button>

      {/* Numbered List - Disabled for PDF files */}
      <button
        onMouseDown={(e) => {
          e.preventDefault()
          if (canUseEditor()) {
            stableEditor!.chain().focus().toggleOrderedList().run()
          }
        }}
        disabled={!canUseEditor()}
        style={(canUseEditor() && stableEditor!.isActive('orderedList')) ? activeButtonStyle : buttonStyle}
        title="Numbered list"
        onMouseEnter={(e) => {
          if (canUseEditor() && !stableEditor!.isActive('orderedList')) {
            e.currentTarget.style.backgroundColor = toolbarHoverBg
          }
        }}
        onMouseLeave={(e) => {
          if (canUseEditor() && !stableEditor!.isActive('orderedList')) {
            e.currentTarget.style.backgroundColor = 'transparent'
          }
        }}
      >
        <FormatListNumberedIcon style={{ fontSize: '20px' }} />
      </button>

      {/* Increase Indent - Disabled for PDF files */}
      <button
        onMouseDown={(e) => {
          e.preventDefault()
          if (canUseEditor()) {
            stableEditor!.chain().focus().sinkListItem('listItem').run()
          }
        }}
        disabled={!canUseEditor()}
        style={buttonStyle}
        title="Increase indent"
        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = toolbarHoverBg}
        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
      >
        <FormatIndentIncreaseIcon style={{ fontSize: '20px' }} />
      </button>

      {/* Decrease Indent - Disabled for PDF files */}
      <button
        onMouseDown={(e) => {
          e.preventDefault()
          if (canUseEditor()) {
            safeLiftCurrentListItem(stableEditor!)
          }
        }}
        disabled={!canUseEditor()}
        style={buttonStyle}
        title="Decrease indent"
        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = toolbarHoverBg}
        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
      >
        <FormatIndentDecreaseIcon style={{ fontSize: '20px' }} />
      </button>

      <div style={{ flex: 1 }} />

      {/* Commit History Button */}
      {(() => {
        // Get projectId from documents (use first document's projectId)
        // Find first document with a valid projectId
        const docWithProject = documents.find(doc => doc.projectId && typeof doc.projectId === 'string' && doc.projectId.trim() !== '')
        const projectId = docWithProject?.projectId || null
        
        if (!projectId || projectId.trim() === '') return null // Don't show button if no valid project
        
        return (
          <>
            <button
              ref={commitHistoryButtonRef}
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                setShowCommitHistoryModal((prev: boolean) => !prev)
              }}
              style={showCommitHistoryModal ? activeButtonStyle : buttonStyle}
              title="Version History"
              onMouseEnter={(e) => {
                if (!showCommitHistoryModal) {
                  e.currentTarget.style.backgroundColor = toolbarHoverBg
                }
              }}
              onMouseLeave={(e) => {
                if (!showCommitHistoryModal) {
                  e.currentTarget.style.backgroundColor = 'transparent'
                }
              }}
            >
              <TurnedInNotOutlinedIcon style={{ fontSize: '19px' }} />
            </button>
            <CommitHistoryModal
              projectId={projectId}
              isOpen={showCommitHistoryModal}
              onClose={() => setShowCommitHistoryModal(false)}
              triggerRef={commitHistoryButtonRef}
              onRestore={onRestoreCommit}
              onDocumentsReload={onDocumentsReload}
            />
          </>
        )
      })()}

      {/* Share Button */}
      {onExport && (
        <>
          <button
            ref={shareButtonRef}
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              setShowExportModal((prev: boolean) => !prev)
            }}
            style={showExportModal ? activeButtonStyle : buttonStyle}
            title="Export"
            onMouseEnter={(e) => {
              if (!showExportModal) {
                e.currentTarget.style.backgroundColor = toolbarHoverBg
              }
            }}
            onMouseLeave={(e) => {
              if (!showExportModal) {
                e.currentTarget.style.backgroundColor = 'transparent'
              }
            }}
          >
            <ShareIcon style={{ fontSize: '19px' }} />
          </button>
          <ExportModal
            isOpen={showExportModal}
            onClose={() => setShowExportModal(false)}
            onExport={onExport}
            documents={documents}
            projectName={projectName}
            documentTitle={documentTitle}
            triggerRef={shareButtonRef}
          />
        </>
      )}

      {/* Link URL Input Dialog */}
      {showLinkDialog && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: theme === 'dark' ? 'rgba(0, 0, 0, 0.7)' : 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10000,
          }}
          onClick={handleLinkCancel}
        >
          <div
            style={{
              backgroundColor: theme === 'dark' ? '#1e1e1e' : '#ffffff',
              borderRadius: '6px',
              padding: '24px',
              minWidth: '400px',
              maxWidth: '500px',
              boxShadow: theme === 'dark' 
                ? '0 8px 32px rgba(0, 0, 0, 0.5)' 
                : '0 8px 32px rgba(0, 0, 0, 0.2)',
            }}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                handleLinkCancel()
              } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                handleLinkSubmit()
              }
            }}
          >
            <div style={{ marginBottom: '16px', fontSize: '16px', fontWeight: 500, color: theme === 'dark' ? '#ffffff' : '#202124' }}>
              Enter URL
            </div>
            <input
              ref={linkInputRef}
              type="text"
              value={linkUrl}
              onChange={(e) => setLinkUrl(e.target.value)}
              placeholder="https://example.com"
              style={{
                width: '100%',
                padding: '10px 12px',
                fontSize: '14px',
                border: `1px solid ${theme === 'dark' ? '#333' : '#dadce0'}`,
                borderRadius: '6px',
                backgroundColor: theme === 'dark' ? '#2a2a2a' : '#ffffff',
                color: theme === 'dark' ? '#ffffff' : '#202124',
                outline: 'none',
                marginBottom: '16px',
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleLinkSubmit()
                } else if (e.key === 'Escape') {
                  handleLinkCancel()
                }
              }}
            />
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button
                onClick={handleLinkCancel}
                style={{
                  padding: '8px 16px',
                  fontSize: '14px',
                  border: `1px solid ${theme === 'dark' ? '#333' : '#dadce0'}`,
                  borderRadius: '6px',
                  backgroundColor: 'transparent',
                  color: theme === 'dark' ? '#cccccc' : '#202124',
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleLinkSubmit}
                style={{
                  padding: '8px 16px',
                  fontSize: '14px',
                  border: 'none',
                  borderRadius: '6px',
                  backgroundColor: '#1a73e8',
                  color: '#ffffff',
                  cursor: 'pointer',
                }}
              >
                Insert
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Keyboard Shortcuts Modal */}
      <KeyboardShortcutsModal
        isOpen={showKeyboardShortcutsModal}
        onClose={() => setShowKeyboardShortcutsModal(false)}
        triggerRef={keyboardShortcutsButtonRef}
      />
    </div>
  )
}
