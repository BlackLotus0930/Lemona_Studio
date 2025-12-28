import { Editor } from '@tiptap/react'
import { useState, useEffect, useRef } from 'react'
import { useTheme } from '../../contexts/ThemeContext'
import ExportModal from '../Layout/ExportModal'
import KeyboardShortcutsModal from '../Layout/KeyboardShortcutsModal'
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

interface ToolbarProps {
  editor: Editor | null
  onToggleSearch?: () => void
  isSearchActive?: boolean
  onExport?: (format: 'pdf' | 'docx', filename?: string, documentIds?: string[], usePageBreaks?: boolean) => void
  documents?: Document[]
  projectName?: string
  documentTitle?: string
}

export default function Toolbar({ 
  editor, 
  onToggleSearch, 
  isSearchActive = false,
  onExport,
  documents = [],
  projectName = 'LEMONA',
  documentTitle
}: ToolbarProps) {
  const { theme, toggleTheme } = useTheme()
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
    if (!editor) return false
    const { selection } = editor.state
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
    editor.state.doc.nodesBetween(from, to, (node) => {
      if (node.type.name === 'tableBlock') {
        foundTable = true
        return false // Stop traversing
      }
    })
    return foundTable
  }
  
  // Helper function to get all table cells from selected table
  const getAllTableCells = () => {
    if (!editor) return []
    const { selection } = editor.state
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
    if (!editor) return null
    const { selection } = editor.state
    
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
  const keyboardShortcutsButtonRef = useRef<HTMLButtonElement>(null)
  const [showMathMenu, setShowMathMenu] = useState(false)
  const [showLinkDialog, setShowLinkDialog] = useState(false)
  const [mathFormula, setMathFormula] = useState('E=mc^2')
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
    if (!editor) return

    const getFontSizeFromDOM = (): number | null => {
      try {
        const { from } = editor.state.selection
        const view = editor.view
        
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
      forceUpdate({})
      
      // First, try to get fontSize from TipTap marks
      const attrs = editor.getAttributes('textStyle')
      if (attrs.fontSize) {
        const size = parseInt(attrs.fontSize)
        if (!isNaN(size) && size > 0) {
          setFontSize(size)
          return
        }
      }
      
      // If no fontSize mark found, check if there's text selected and try to get fontSize from the selection range
      const { from, to } = editor.state.selection
      if (from !== to) {
        // Text is selected - check marks in the selection range
        let foundSize: number | null = null
        editor.state.doc.nodesBetween(from, to, (node) => {
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

    editor.on('selectionUpdate', handleUpdate)
    editor.on('transaction', handleUpdate)
    editor.on('update', handleUpdate)
    editor.on('focus', handleUpdate)

    return () => {
      editor.off('selectionUpdate', handleUpdate)
      editor.off('transaction', handleUpdate)
      editor.off('update', handleUpdate)
      editor.off('focus', handleUpdate)
    }
  }, [editor])

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

  if (!editor) {
    return null
  }

  const toolbarBgColor = theme === 'dark' ? '#141414' : '#ffffff'
  const toolbarTextColor = theme === 'dark' ? '#D6D6DD' : '#5f6368'
  const toolbarHoverBg = theme === 'dark' ? '#1f1f1f' : '#f5f5f5'
  const dropdownBg = theme === 'dark' ? '#141414' : '#ffffff'
  const dropdownBorder = theme === 'dark' ? '#202020' : '#c0c0c0'
  const dropdownTextColor = theme === 'dark' ? '#D6D6DD' : '#202124'
  const dropdownHoverBg = theme === 'dark' ? '#3e3e42' : '#f8f9fa'
  const dropdownActiveBg = theme === 'dark' ? '#1f1f1f' : '#e8eaed'
  const dropdownActiveColor = theme === 'dark' ? '#4fc3f7' : '#1a73e8'

  const buttonStyle: React.CSSProperties = {
    padding: '4px 6px',
    margin: '0 1px',
    border: 'none',
    borderRadius: '4px',
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
    backgroundColor: theme === 'dark' ? '#252525' : '#e0e8f5',
    color: theme === 'dark' ? '#D6D6DD' : '#1967d2',
  }

  const dividerStyle: React.CSSProperties = {
    width: '1px',
    height: '24px',
    backgroundColor: theme === 'dark' ? '#2d2d2d' : '#dadce0',
    margin: '0 4px'
  }

  const dropdownStyle: React.CSSProperties = {
    ...buttonStyle,
    padding: '6px 8px 6px 12px',
    minWidth: 'auto',
    fontSize: '13px',
    fontFamily: "'Noto Sans SC', 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif"
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
    editor.chain().focus().setMark('textStyle', { fontSize: newSize.toString() }).run()
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
    editor.chain().focus().setMark('textStyle', { fontSize: newSize.toString() }).run()
  }

  const handleInsertLink = () => {
    setLinkUrl('')
    setShowLinkDialog(true)
  }

  const handleLinkSubmit = (): void => {
    if (!editor) return
    if (!linkUrl.trim()) {
      setShowLinkDialog(false)
      setLinkUrl('')
      return
    }
    
    const url = linkUrl.trim()
    const { from, to } = editor.state.selection
    
    // If text is selected, apply link to selected text
    if (from !== to) {
      editor.chain().focus().setLink({ href: url }).run()
    } else {
      // No text selected - insert URL as clickable link
      // Use insertContent with HTML to create a link directly
      editor.chain()
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
    if (!editor) return
    
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
      // @ts-ignore - TableExtension command
      editor.chain().focus().insertTableBlock(tableHtml).run()
    } else {
      // Insert chart using ChartExtension
      const chartData = {
        labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May'],
        datasets: [{
          label: 'Data',
          values: [10, 20, 15, 25, 30]
        }]
      }
      // @ts-ignore - ChartExtension command
      editor.chain().focus().setChart(graphType, chartData, '').run()
    }
    
    setShowGraphMenu(false)
  }


  const handleImageFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file && file.type.startsWith('image/')) {
      const reader = new FileReader()
      reader.onload = (e) => {
        const dataUrl = e.target?.result as string
        if (dataUrl) {
          // Insert image and then add a paragraph after it so cursor can be placed
          editor.chain().focus().setImage({ src: dataUrl }).insertContent('<p></p>').run()
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
      setMathFormula('E=mc^2')
    }
  }

  const handleMathSubmit = () => {
    if (mathFormula.trim()) {
      // @ts-ignore - Math extension command
      editor.chain().focus().setMath(mathFormula.trim(), false).run()
    }
    setShowMathMenu(false)
  }

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

  const styles = [
    { label: 'Title', value: 'title', fontSize: '24px', fontWeight: 600 },
    { label: 'Subtitle', value: 'subtitle', fontSize: '18px', fontWeight: 500 },
    { label: 'Normal text', value: 'normal', fontSize: '14px', fontWeight: 400 },
    { label: 'Heading 1', value: 'h1', fontSize: '20px', fontWeight: 600 },
    { label: 'Heading 2', value: 'h2', fontSize: '18px', fontWeight: 600 },
    { label: 'Heading 3', value: 'h3', fontSize: '16px', fontWeight: 600 },
  ]

  const fonts = ['Noto Sans SC', 'Inter', 'Open Sans', 'Roboto', 'Montserrat', 'Poppins']

  // Get current style label
  const getCurrentStyle = () => {
    if (editor.isActive('title')) return 'Title'
    if (editor.isActive('subtitle')) return 'Subtitle'
    if (editor.isActive('heading', { level: 1 })) return 'Heading 1'
    if (editor.isActive('heading', { level: 2 })) return 'Heading 2'
    if (editor.isActive('heading', { level: 3 })) return 'Heading 3'
    return 'Normal text'
  }

  // Get current font family
  const getCurrentFontFamily = () => {
    const attrs = editor.getAttributes('textStyle')
    return attrs.fontFamily || 'Noto Sans SC'
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
    const attrs = editor.getAttributes('textStyle')
    return normalizeColor(attrs.color)
  }

  // Get current highlight color
  const getCurrentHighlightColor = () => {
    const attrs = editor.getAttributes('highlight')
    return normalizeColor(attrs?.color)
  }

  // Check if a style is currently active
  const isStyleActive = (styleValue: string) => {
    if (styleValue === 'title') {
      return editor.isActive('title')
    }
    if (styleValue === 'subtitle') {
      return editor.isActive('subtitle')
    }
    if (styleValue === 'normal') {
      // Normal text is active when it's a paragraph AND not title/subtitle/heading
      return editor.isActive('paragraph') && 
             !editor.isActive('title') && 
             !editor.isActive('subtitle') &&
             !editor.isActive('heading')
    }
    if (styleValue.startsWith('h')) {
      const level = parseInt(styleValue.slice(1)) as 1 | 2 | 3
      return editor.isActive('heading', { level })
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
          window.location.href = '/documents'
        }}
        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = toolbarHoverBg}
        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
      >
        <HomeIcon style={{ fontSize: '20px' }} />
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
        <SearchIcon style={{ fontSize: '19px', transform: 'translateY(1px)' }} />
      </button>

      {/* Undo/Redo */}
      <button
        onMouseDown={(e) => {
          e.preventDefault()
          editor.chain().focus().undo().run()
        }}
        disabled={!editor.can().undo()}
        style={{ ...buttonStyle, opacity: editor.can().undo() ? 1 : 0.3 }}
        title="Undo"
        onMouseEnter={(e) => {
          if (editor.can().undo()) {
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
          editor.chain().focus().redo().run()
        }}
        disabled={!editor.can().redo()}
        style={{ ...buttonStyle, opacity: editor.can().redo() ? 1 : 0.3 }}
        title="Redo"
        onMouseEnter={(e) => {
          if (editor.can().redo()) {
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
          <DarkModeIcon style={{ fontSize: '18px' }} />
        ) : (
          <LightModeIcon style={{ fontSize: '18px' }} />
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
        <KeyboardIcon style={{ fontSize: '18px' }} />
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
              top: rect ? `${rect.bottom + 4}px` : '100%',
              left: rect ? `${rect.left}px` : 0,
              backgroundColor: dropdownBg,
              border: `1px solid ${dropdownBorder}`,
              borderRadius: '12px',
              boxShadow: theme === 'dark' ? '0 2px 10px rgba(0,0,0,0.5)' : '0 2px 10px rgba(0,0,0,0.2)',
              zIndex: 10010,
              minWidth: '200px',
              maxWidth: '200px',
              padding: '4px 0'
            }}>
            {styles.map((style) => {
              const isActive = isStyleActive(style.value)
              return (
                <div
                  key={style.value}
                  onMouseDown={(e) => {
                    e.preventDefault()
                    if (style.value === 'title') {
                      // @ts-ignore - Title extension command
                      editor.chain().focus().setTitle().run()
                    } else if (style.value === 'subtitle') {
                      // @ts-ignore - Subtitle extension command
                      editor.chain().focus().setSubtitle().run()
                    } else if (style.value.startsWith('h')) {
                      const level = parseInt(style.value.slice(1)) as 1 | 2 | 3
                      editor.chain().focus().toggleHeading({ level }).run()
                    } else {
                      // Normal text
                      editor.chain().focus().setParagraph().run()
                    }
                    setShowStyleMenu(false)
                  }}
                  style={{
                    padding: '8px 16px',
                    cursor: 'pointer',
                    color: dropdownTextColor,
                    backgroundColor: isActive ? dropdownActiveBg : 'transparent',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px'
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
                  {isActive && (
                    <span style={{ 
                      color: dropdownActiveColor,
                      fontSize: '16px',
                      fontWeight: 'bold',
                      width: '16px',
                      display: 'inline-block',
                      flexShrink: 0
                    }}>✓</span>
                  )}
                  {!isActive && <span style={{ width: '16px', display: 'inline-block', flexShrink: 0 }}></span>}
                  <span style={{
                    fontSize: style.fontSize,
                    fontWeight: style.fontWeight,
                    fontFamily: "'Noto Sans SC', 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif",
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
          title={getCurrentFontFamily()}
          onMouseEnter={(e) => e.currentTarget.style.backgroundColor = toolbarHoverBg}
          onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
        >
          <span style={{ overflow: 'hidden', textOverflow: 'clip', whiteSpace: 'nowrap', flex: 1, textAlign: 'left' }}>
            {getCurrentFontFamily()}
          </span>
          <ArrowDropDownIcon style={{ fontSize: '20px', marginLeft: '2px', flexShrink: 0 }} />
        </button>
        {showFontMenu && (() => {
          const rect = fontMenuRef.current?.getBoundingClientRect()
          return (
            <div ref={fontDropdownRef} style={{
              position: 'fixed',
              top: rect ? `${rect.bottom + 4}px` : '100%',
              left: rect ? `${rect.left}px` : 0,
              backgroundColor: dropdownBg,
              border: `1px solid ${dropdownBorder}`,
              borderRadius: '12px',
              boxShadow: theme === 'dark' ? '0 2px 10px rgba(0,0,0,0.5)' : '0 2px 10px rgba(0,0,0,0.2)',
              zIndex: 10010,
              minWidth: '170px',
              maxWidth: '170px',
              maxHeight: '300px',
              overflowY: 'auto'
            }}>
            {fonts.map((font) => {
              const isActive = getCurrentFontFamily() === font
              return (
                <div
                  key={font}
                  onMouseDown={(e) => {
                    e.preventDefault()
                    editor.chain().focus().setMark('textStyle', { fontFamily: font }).run()
                    setShowFontMenu(false)
                  }}
                  style={{
                    padding: '8px 16px',
                    cursor: 'pointer',
                    fontSize: '13px',
                    color: dropdownTextColor,
                    fontFamily: font,
                    backgroundColor: isActive ? dropdownActiveBg : 'transparent',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px'
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
                  {isActive && (
                    <span style={{ 
                      color: dropdownActiveColor,
                      fontSize: '16px',
                      fontWeight: 'bold',
                      width: '16px',
                      display: 'inline-block'
                    }}>✓</span>
                  )}
                  {!isActive && <span style={{ width: '16px', display: 'inline-block' }}></span>}
                  <span>{font}</span>
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
            fontFamily: "'Noto Sans SC', 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif",
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
              top: rect ? `${rect.bottom + 4}px` : '100%',
              left: rect ? `${rect.left}px` : 0,
              backgroundColor: dropdownBg,
              border: `1px solid ${dropdownBorder}`,
              borderRadius: '12px',
              boxShadow: theme === 'dark' ? '0 2px 10px rgba(0,0,0,0.5)' : '0 2px 10px rgba(0,0,0,0.2)',
              zIndex: 10010,
              minWidth: '70px',
              maxHeight: '300px',
              overflowY: 'auto'
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
                    padding: '8px 16px',
                    cursor: 'pointer',
                    fontSize: '13px',
                    color: dropdownTextColor,
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

      {/* Bold, Italic, Underline */}
      <button
        onMouseDown={(e) => {
          e.preventDefault()
          if (isTableNodeSelected() || isSelectionInTableCell()) {
            applyTableCellFormatting('bold')
          } else {
            editor.chain().focus().toggleBold().run()
          }
        }}
        style={editor.isActive('bold') || (isTableNodeSelected() || isSelectionInTableCell()) && document.queryCommandState('bold') ? activeButtonStyle : buttonStyle}
        title="Bold"
        onMouseEnter={(e) => {
          if (!editor.isActive('bold')) {
            e.currentTarget.style.backgroundColor = toolbarHoverBg
          }
        }}
        onMouseLeave={(e) => {
          if (!editor.isActive('bold')) {
            e.currentTarget.style.backgroundColor = 'transparent'
          }
        }}
      >
        <FormatBoldIcon style={{ fontSize: '20px' }} />
      </button>
      <button
        onMouseDown={(e) => {
          e.preventDefault()
          if (isTableNodeSelected() || isSelectionInTableCell()) {
            applyTableCellFormatting('italic')
          } else {
            editor.chain().focus().toggleItalic().run()
          }
        }}
        style={editor.isActive('italic') || ((isTableNodeSelected() || isSelectionInTableCell()) && document.queryCommandState('italic')) ? activeButtonStyle : buttonStyle}
        title="Italic"
        onMouseEnter={(e) => {
          if (!editor.isActive('italic')) {
            e.currentTarget.style.backgroundColor = toolbarHoverBg
          }
        }}
        onMouseLeave={(e) => {
          if (!editor.isActive('italic')) {
            e.currentTarget.style.backgroundColor = 'transparent'
          }
        }}
      >
        <FormatItalicIcon style={{ fontSize: '20px' }} />
      </button>
      <button
        onMouseDown={(e) => {
          e.preventDefault()
          if (isTableNodeSelected() || isSelectionInTableCell()) {
            applyTableCellFormatting('underline')
          } else {
            editor.chain().focus().toggleUnderline().run()
          }
        }}
        style={editor.isActive('underline') || ((isTableNodeSelected() || isSelectionInTableCell()) && document.queryCommandState('underline')) ? activeButtonStyle : buttonStyle}
        title="Underline"
        onMouseEnter={(e) => {
          if (!editor.isActive('underline')) {
            e.currentTarget.style.backgroundColor = toolbarHoverBg
          }
        }}
        onMouseLeave={(e) => {
          if (!editor.isActive('underline')) {
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
              top: rect ? `${rect.bottom + 4}px` : '100%',
              left: rect ? `${rect.left}px` : 0,
              backgroundColor: dropdownBg,
              border: `1px solid ${dropdownBorder}`,
              borderRadius: '12px',
              boxShadow: theme === 'dark' ? '0 2px 10px rgba(0,0,0,0.5)' : '0 2px 10px rgba(0,0,0,0.2)',
              zIndex: 10010,
              padding: '8px',
              display: 'grid',
              gridTemplateColumns: 'repeat(6, 1fr)',
              gap: '4px'
            }}>
            {['#000000', '#434343', '#666666', '#999999', '#b7b7b7', '#cccccc', '#d9d9d9', '#efefef', '#f3f3f3', '#ffffff', '#980000', '#ff0000', '#ff9900', '#ffff00', '#00ff00', '#00ffff', '#4a86e8', '#0000ff', '#9900ff', '#ff00ff'].map((color) => {
              const currentColor = getCurrentColor()
              // Check if this is "default" color (black or white) - should unset color instead
              const isDefaultColor = color === '#000000' || color === '#ffffff'
              // For default colors, show as active when no color is set (null)
              // For other colors, show as active when they match the current color
              const isActive = isDefaultColor 
                ? (currentColor === null || currentColor === '#000000' || currentColor === '#ffffff')
                : (currentColor === color.toLowerCase())
              return (
                <div
                  key={color}
                  onMouseDown={(e) => {
                    e.preventDefault()
                    if (isDefaultColor) {
                      // For black/white, unset color to use theme's default text color
                      editor.chain().focus().unsetColor().run()
                    } else {
                      // For other colors, set them normally
                      editor.chain().focus().setColor(color).run()
                    }
                    setShowColorMenu(false)
                  }}
                  style={{
                    width: '24px',
                    height: '24px',
                    backgroundColor: color,
                    border: isActive 
                      ? `2px solid ${dropdownActiveColor}` 
                      : `1px solid ${dropdownBorder}`,
                    borderRadius: '50%',
                    cursor: 'pointer',
                    transition: 'transform 0.1s, box-shadow 0.1s, border 0.1s',
                    boxShadow: isActive 
                      ? theme === 'dark' 
                        ? `0 0 0 2px ${dropdownActiveColor}40` 
                        : `0 0 0 2px ${dropdownActiveColor}40`
                      : 'none',
                    position: 'relative'
                  }}
                  onMouseEnter={(e) => {
                    if (!isActive) {
                      e.currentTarget.style.transform = 'scale(1.1)'
                      e.currentTarget.style.boxShadow = theme === 'dark' ? '0 0 0 2px rgba(79, 195, 247, 0.3)' : '0 0 0 2px rgba(26, 115, 232, 0.3)'
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
              top: rect ? `${rect.bottom + 4}px` : '100%',
              left: rect ? `${rect.left}px` : 0,
              backgroundColor: dropdownBg,
              border: `1px solid ${dropdownBorder}`,
              borderRadius: '12px',
              boxShadow: theme === 'dark' ? '0 2px 10px rgba(0,0,0,0.5)' : '0 2px 10px rgba(0,0,0,0.2)',
              zIndex: 10010,
              padding: '8px',
              display: 'flex',
              flexDirection: 'column',
              gap: '4px'
            }}>
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(6, 1fr)',
                gap: '4px'
              }}>
                {['#ffff00', '#00ff00', '#00ffff', '#ff00ff', '#ff0000', '#0000ff', '#ffffff', '#000000'].map((color) => {
                  const isActive = getCurrentHighlightColor() === color.toLowerCase()
                  return (
                    <div
                      key={color}
                      onMouseDown={(e) => {
                        e.preventDefault()
                        editor.chain().focus().toggleHighlight({ color }).run()
                        setShowHighlightMenu(false)
                      }}
                      style={{
                        width: '24px',
                        height: '24px',
                        backgroundColor: color,
                        border: isActive 
                          ? `2px solid ${dropdownActiveColor}` 
                          : `1px solid ${dropdownBorder}`,
                        borderRadius: '50%',
                        cursor: 'pointer',
                        transition: 'transform 0.1s, box-shadow 0.1s, border 0.1s',
                        boxShadow: isActive 
                          ? theme === 'dark' 
                            ? `0 0 0 2px ${dropdownActiveColor}40` 
                            : `0 0 0 2px ${dropdownActiveColor}40`
                          : 'none',
                        position: 'relative'
                      }}
                      onMouseEnter={(e) => {
                        if (!isActive) {
                          e.currentTarget.style.transform = 'scale(1.1)'
                          e.currentTarget.style.boxShadow = theme === 'dark' ? '0 0 0 2px rgba(79, 195, 247, 0.3)' : '0 0 0 2px rgba(26, 115, 232, 0.3)'
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
                    editor.chain().focus().unsetHighlight().run()
                    setShowHighlightMenu(false)
                  }}
                  style={{
                    width: '100%',
                    padding: '6px 12px',
                    backgroundColor: 'transparent',
                    border: 'none',
                    borderRadius: '4px',
                    color: dropdownTextColor,
                    cursor: 'pointer',
                    fontSize: '13px',
                    textAlign: 'left',
                    fontFamily: "'Noto Sans SC', 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif",
                    transition: 'background-color 0.15s'
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
              top: rect ? `${rect.bottom + 4}px` : '100%',
              left: rect ? `${rect.left}px` : 0,
              backgroundColor: dropdownBg,
              border: `1px solid ${dropdownBorder}`,
              borderRadius: '12px',
              boxShadow: theme === 'dark' ? '0 2px 10px rgba(0,0,0,0.5)' : '0 2px 10px rgba(0,0,0,0.2)',
              zIndex: 10010,
              minWidth: '150px',
              maxWidth: '150px'
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
                    padding: '8px 16px',
                    cursor: 'pointer',
                    fontSize: '13px',
                    color: dropdownTextColor,
                    backgroundColor: 'transparent',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px'
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
              top: rect ? `${rect.bottom + 4}px` : '100%',
              left: rect ? `${buttonCenter - dropdownWidth / 2}px` : 0,
              backgroundColor: dropdownBg,
              border: `1px solid ${dropdownBorder}`,
              borderRadius: '12px',
              boxShadow: theme === 'dark' ? '0 2px 10px rgba(0,0,0,0.5)' : '0 2px 10px rgba(0,0,0,0.2)',
              zIndex: 10010,
              padding: '12px',
              width: `${dropdownWidth}px`,
            }}>
              <div style={{ marginBottom: '8px', fontSize: '13px', fontWeight: 500, color: dropdownTextColor }}>
                Enter LaTeX Formula
              </div>
              <input
                ref={mathInputRef}
                type="text"
                value={mathFormula}
                onChange={(e) => setMathFormula(e.target.value)}
                placeholder="E.g., E=mc^2, \\frac{a}{b}"
                style={{
                  width: '100%',
                  padding: '8px 10px',
                  fontSize: '13px',
                  border: `1px solid ${dropdownBorder}`,
                  borderRadius: '4px',
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
                    borderRadius: '4px',
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
                    borderRadius: '4px',
                    backgroundColor: '#1a73e8',
                    color: '#ffffff',
                    cursor: 'pointer',
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#1557b0'}
                  onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#1a73e8'}
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
              top: rect ? `${rect.bottom + 4}px` : '100%',
              left: rect ? `${rect.left}px` : 0,
              backgroundColor: dropdownBg,
              border: `1px solid ${dropdownBorder}`,
              borderRadius: '12px',
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
                  editor.chain().focus().setTextAlign('left').run()
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
                  editor.chain().focus().setTextAlign('center').run()
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
                  editor.chain().focus().setTextAlign('right').run()
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
                  editor.chain().focus().setTextAlign('justify').run()
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
                    editor.chain().focus().liftListItem('listItem').run()
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
                    editor.chain().focus().sinkListItem('listItem').run()
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
              top: rect ? `${rect.bottom + 4}px` : '100%',
              left: rect ? `${rect.left}px` : 0,
              backgroundColor: dropdownBg,
              border: `1px solid ${dropdownBorder}`,
              borderRadius: '12px',
              boxShadow: theme === 'dark' ? '0 2px 10px rgba(0,0,0,0.5)' : '0 2px 10px rgba(0,0,0,0.2)',
              zIndex: 10010,
              minWidth: '180px',
              padding: '8px 0'
            }}>
            {[1.0, 1.15, 1.5, 2.0, 2.5, 3.0].map((spacing) => (
              <div
                key={spacing}
                onMouseDown={(e) => {
                  e.preventDefault()
                  editor.chain().focus().setLineHeight(spacing.toString()).run()
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

      {/* Bulleted List */}
      <button
        onMouseDown={(e) => {
          e.preventDefault()
          editor.chain().focus().toggleBulletList().run()
        }}
        style={editor.isActive('bulletList') ? activeButtonStyle : buttonStyle}
        title="Bulleted list"
        onMouseEnter={(e) => {
          if (!editor.isActive('bulletList')) {
            e.currentTarget.style.backgroundColor = toolbarHoverBg
          }
        }}
        onMouseLeave={(e) => {
          if (!editor.isActive('bulletList')) {
            e.currentTarget.style.backgroundColor = 'transparent'
          }
        }}
      >
        <FormatListBulletedIcon style={{ fontSize: '20px' }} />
      </button>

      {/* Numbered List */}
      <button
        onMouseDown={(e) => {
          e.preventDefault()
          editor.chain().focus().toggleOrderedList().run()
        }}
        style={editor.isActive('orderedList') ? activeButtonStyle : buttonStyle}
        title="Numbered list"
        onMouseEnter={(e) => {
          if (!editor.isActive('orderedList')) {
            e.currentTarget.style.backgroundColor = toolbarHoverBg
          }
        }}
        onMouseLeave={(e) => {
          if (!editor.isActive('orderedList')) {
            e.currentTarget.style.backgroundColor = 'transparent'
          }
        }}
      >
        <FormatListNumberedIcon style={{ fontSize: '20px' }} />
      </button>

      {/* Increase Indent */}
      <button
        onMouseDown={(e) => {
          e.preventDefault()
          editor.chain().focus().sinkListItem('listItem').run()
        }}
        style={buttonStyle}
        title="Increase indent"
        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = toolbarHoverBg}
        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
      >
        <FormatIndentIncreaseIcon style={{ fontSize: '20px' }} />
      </button>

      {/* Decrease Indent */}
      <button
        onMouseDown={(e) => {
          e.preventDefault()
          editor.chain().focus().liftListItem('listItem').run()
        }}
        style={buttonStyle}
        title="Decrease indent"
        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = toolbarHoverBg}
        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
      >
        <FormatIndentDecreaseIcon style={{ fontSize: '20px' }} />
      </button>

      <div style={{ flex: 1 }} />

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
            style={buttonStyle}
            title="Export"
            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = toolbarHoverBg}
            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
          >
            <ShareIcon style={{ fontSize: '20px', color: theme === 'dark' ? '#B5B5B5' : '#4d4d4d' }} />
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
              borderRadius: '8px',
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
                borderRadius: '4px',
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
                  borderRadius: '4px',
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
                  borderRadius: '4px',
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
