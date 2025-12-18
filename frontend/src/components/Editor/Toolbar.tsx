import { Editor } from '@tiptap/react'
import { useState, useEffect, useRef } from 'react'
import { useTheme } from '../../contexts/ThemeContext'
// @ts-ignore - Material UI icons
import SearchIcon from '@mui/icons-material/Search'
// @ts-ignore
import HomeIcon from '@mui/icons-material/Home'
// @ts-ignore
import DarkModeIcon from '@mui/icons-material/DarkMode'
// @ts-ignore
import LightModeIcon from '@mui/icons-material/LightMode'
// @ts-ignore
import UndoIcon from '@mui/icons-material/Undo'
// @ts-ignore
import RedoIcon from '@mui/icons-material/Redo'
// @ts-ignore
import PrintIcon from '@mui/icons-material/Print'
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
import UploadIcon from '@mui/icons-material/Upload'
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

interface ToolbarProps {
  editor: Editor | null
  onExport: (format: 'pdf' | 'docx', filename?: string) => void
  documentTitle?: string
  documentId?: string
  onTitleUpdate?: (title: string) => void
}

export default function Toolbar({ editor, onExport, documentTitle, documentId, onTitleUpdate }: ToolbarProps) {
  const { theme, toggleTheme } = useTheme()
  const [showShareMenu, setShowShareMenu] = useState(false)
  const [downloadFilename, setDownloadFilename] = useState(documentTitle || 'document')
  const titleUpdateTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Update filename when document title changes
  useEffect(() => {
    if (documentTitle) {
      setDownloadFilename(documentTitle)
    }
  }, [documentTitle])

  // Save title when filename changes (debounced)
  const handleFilenameChange = (newFilename: string) => {
    setDownloadFilename(newFilename)
    
    // Clear existing timeout
    if (titleUpdateTimeoutRef.current) {
      clearTimeout(titleUpdateTimeoutRef.current)
    }
    
    // Update title after user stops typing (1 second delay)
    if (newFilename.trim() && newFilename !== documentTitle && documentId && onTitleUpdate) {
      titleUpdateTimeoutRef.current = setTimeout(() => {
        onTitleUpdate(newFilename.trim())
      }, 1000)
    }
  }

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (titleUpdateTimeoutRef.current) {
        clearTimeout(titleUpdateTimeoutRef.current)
      }
    }
  }, [])
  const [fontSize, setFontSize] = useState(14)
  const [showStyleMenu, setShowStyleMenu] = useState(false)
  const [showFontMenu, setShowFontMenu] = useState(false)
  const [showColorMenu, setShowColorMenu] = useState(false)
  const [showHighlightMenu, setShowHighlightMenu] = useState(false)
  const [showAlignMenu, setShowAlignMenu] = useState(false)
  const [showSpacingMenu, setShowSpacingMenu] = useState(false)
  const [, forceUpdate] = useState({})
  const toolbarRef = useRef<HTMLDivElement>(null)
  const styleMenuRef = useRef<HTMLDivElement>(null)
  const fontMenuRef = useRef<HTMLDivElement>(null)
  const colorMenuRef = useRef<HTMLDivElement>(null)
  const highlightMenuRef = useRef<HTMLDivElement>(null)
  const alignMenuRef = useRef<HTMLDivElement>(null)
  const spacingMenuRef = useRef<HTMLDivElement>(null)
  const shareMenuRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Function to close all menus except the one specified
  const closeAllMenusExcept = (except: string | null) => {
    if (except !== 'style') setShowStyleMenu(false)
    if (except !== 'font') setShowFontMenu(false)
    if (except !== 'color') setShowColorMenu(false)
    if (except !== 'highlight') setShowHighlightMenu(false)
    if (except !== 'align') setShowAlignMenu(false)
    if (except !== 'spacing') setShowSpacingMenu(false)
    if (except !== 'share') setShowShareMenu(false)
  }

  // Update toolbar when editor selection changes
  useEffect(() => {
    if (!editor) return

    const handleUpdate = () => {
      forceUpdate({})
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
      if (toolbarRef.current && !toolbarRef.current.contains(event.target as Node)) {
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
  const toolbarHoverBg = theme === 'dark' ? '#181818' : '#f1f3f4'
  const dropdownBg = theme === 'dark' ? '#141414' : '#ffffff'
  const dropdownBorder = theme === 'dark' ? '#202020' : '#c0c0c0'
  const dropdownTextColor = theme === 'dark' ? '#D6D6DD' : '#202124'
  const dropdownHoverBg = theme === 'dark' ? '#3e3e42' : '#f8f9fa'
  const dropdownActiveBg = theme === 'dark' ? '#181818' : '#f1f3f4'
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
    backgroundColor: theme === 'dark' ? '#2d2d2d' : '#e8f0fe',
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
    fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif"
  }

  const styleDropdownStyle: React.CSSProperties = {
    ...dropdownStyle,
    minWidth: '140px',
    maxWidth: '140px',
    justifyContent: 'space-between'
  }

  const fontDropdownStyle: React.CSSProperties = {
    ...dropdownStyle,
    minWidth: '120px',
    maxWidth: '120px',
    justifyContent: 'space-between'
  }

  const handleFontSizeChange = (delta: number) => {
    const newSize = Math.max(8, Math.min(400, fontSize + delta))
    setFontSize(newSize)
    // Apply font size to selected text using TextStyle extension
    editor.chain().focus().setMark('textStyle', { fontSize: newSize.toString() }).run()
  }

  const handleFontSizeInput = (size: number) => {
    const newSize = Math.max(8, Math.min(400, size))
    setFontSize(newSize)
    // Apply font size to selected text
    editor.chain().focus().setMark('textStyle', { fontSize: newSize.toString() }).run()
  }

  const handleInsertLink = () => {
    const url = window.prompt('Enter URL:')
    if (url) {
      editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run()
    }
  }

  const handleInsertImage = () => {
    fileInputRef.current?.click()
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
    const formula = window.prompt('Enter LaTeX formula (e.g., E=mc^2, \\frac{a}{b}):', 'E=mc^2')
    if (formula) {
      // @ts-ignore - Math extension command
      editor.chain().focus().setMath(formula.trim(), false).run()
    }
  }

  const handleShare = (e: React.MouseEvent) => {
    e.preventDefault()
    const newState = !showShareMenu
    closeAllMenusExcept(newState ? 'share' : null)
    setShowShareMenu(newState)
    // Reset filename to document title when opening menu
    if (newState && documentTitle) {
      setDownloadFilename(documentTitle)
    }
  }

  const styles = [
    { label: 'Title', value: 'title' },
    { label: 'Subtitle', value: 'subtitle' },
    { label: 'Normal text', value: 'normal' },
    { label: 'Heading 1', value: 'h1' },
    { label: 'Heading 2', value: 'h2' },
    { label: 'Heading 3', value: 'h3' },
  ]

  const fonts = ['Inter', 'Open Sans', 'Roboto', 'Arial', 'Times New Roman', 'Courier New', 'Georgia', 'Verdana']

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
    return attrs.fontFamily || 'Inter'
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
        padding: '2px 8px',
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

      {/* Search */}
      <button 
        style={buttonStyle}
        title="Search"
        onMouseDown={(e) => e.preventDefault()}
        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = toolbarHoverBg}
        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
      >
        <SearchIcon style={{ fontSize: '20px' }} />
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

      {/* Print */}
      <button
        onMouseDown={(e) => {
          e.preventDefault()
          window.print()
        }}
        style={buttonStyle}
        title="Print"
        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = toolbarHoverBg}
        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
      >
        <PrintIcon style={{ fontSize: '20px' }} />
      </button>

      <div style={dividerStyle} />

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
            <div style={{
              position: 'fixed',
              top: rect ? `${rect.bottom + 4}px` : '100%',
              left: rect ? `${rect.left}px` : 0,
              backgroundColor: dropdownBg,
              border: `1px solid ${dropdownBorder}`,
              borderRadius: '12px',
              boxShadow: theme === 'dark' ? '0 2px 10px rgba(0,0,0,0.5)' : '0 2px 10px rgba(0,0,0,0.2)',
              zIndex: 10010,
              minWidth: '200px'
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
                    fontSize: '13px',
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
                      display: 'inline-block'
                    }}>✓</span>
                  )}
                  {!isActive && <span style={{ width: '16px', display: 'inline-block' }}></span>}
                  <span>{style.label}</span>
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
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, textAlign: 'left' }}>
            {getCurrentFontFamily()}
          </span>
          <ArrowDropDownIcon style={{ fontSize: '20px', marginLeft: '4px', flexShrink: 0 }} />
        </button>
        {showFontMenu && (() => {
          const rect = fontMenuRef.current?.getBoundingClientRect()
          return (
            <div style={{
              position: 'fixed',
              top: rect ? `${rect.bottom + 4}px` : '100%',
              left: rect ? `${rect.left}px` : 0,
              backgroundColor: dropdownBg,
              border: `1px solid ${dropdownBorder}`,
              borderRadius: '12px',
              boxShadow: theme === 'dark' ? '0 2px 10px rgba(0,0,0,0.5)' : '0 2px 10px rgba(0,0,0,0.2)',
              zIndex: 10010,
              minWidth: '150px',
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
      <input
        type="number"
        value={fontSize}
        onChange={(e) => {
          const newSize = parseInt(e.target.value) || 12
          handleFontSizeInput(newSize)
        }}
        onMouseDown={(e) => e.stopPropagation()}
        onBlur={(e) => {
          const newSize = parseInt(e.target.value) || 12
          handleFontSizeInput(newSize)
        }}
        style={{
          width: '40px',
          height: '24px',
          border: `1px solid ${theme === 'dark' ? '#2d2d2d' : '#dadce0'}`,
          borderRadius: '4px',
          textAlign: 'center',
          fontSize: '13px',
          padding: '2px 4px',
          backgroundColor: theme === 'dark' ? '#181818' : '#ffffff',
          color: theme === 'dark' ? '#a0a0a0' : '#5f6368'
        }}
        min="8"
        max="400"
      />
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
          editor.chain().focus().toggleBold().run()
        }}
        style={editor.isActive('bold') ? activeButtonStyle : buttonStyle}
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
          editor.chain().focus().toggleItalic().run()
        }}
        style={editor.isActive('italic') ? activeButtonStyle : buttonStyle}
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
          editor.chain().focus().toggleUnderline().run()
        }}
        style={editor.isActive('underline') ? activeButtonStyle : buttonStyle}
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
            <div style={{
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
              const isActive = getCurrentColor() === color.toLowerCase()
              return (
                <div
                  key={color}
                  onMouseDown={(e) => {
                    e.preventDefault()
                    editor.chain().focus().setColor(color).run()
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
            <div style={{
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
                    fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif",
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

      {/* Insert Math Formula */}
      <button
        onMouseDown={(e) => {
          e.preventDefault()
          handleInsertMath()
        }}
        style={buttonStyle}
        title="Insert math formula (inline)"
        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = toolbarHoverBg}
        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
      >
        <FunctionsIcon style={{ fontSize: '20px' }} />
      </button>

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
          style={buttonStyle}
          title="Align & indent"
          onMouseEnter={(e) => e.currentTarget.style.backgroundColor = toolbarHoverBg}
          onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
        >
          <FormatAlignLeftIcon style={{ fontSize: '20px' }} />
          <ArrowDropDownIcon style={{ fontSize: '16px', marginLeft: '2px' }} />
        </button>
        {showAlignMenu && (() => {
          const rect = alignMenuRef.current?.getBoundingClientRect()
          return (
            <div style={{
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
          style={buttonStyle}
          title="Line & paragraph spacing"
          onMouseEnter={(e) => e.currentTarget.style.backgroundColor = toolbarHoverBg}
          onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
        >
          <div style={{ fontSize: '18px', lineHeight: '1' }}>≡</div>
          <ArrowDropDownIcon style={{ fontSize: '16px', marginLeft: '2px' }} />
        </button>
        {showSpacingMenu && (() => {
          const rect = spacingMenuRef.current?.getBoundingClientRect()
          return (
            <div style={{
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
      <div ref={shareMenuRef} style={{ position: 'relative' }}>
        <button
          onMouseDown={handleShare}
          style={{
            ...buttonStyle,
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            padding: '6px 12px'
          }}
          title="Share"
          onMouseEnter={(e) => e.currentTarget.style.backgroundColor = toolbarHoverBg}
          onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
        >
          <UploadIcon style={{ fontSize: '20px' }} />
          <span>Share</span>
        </button>
        {showShareMenu && (() => {
          const rect = shareMenuRef.current?.getBoundingClientRect()
          return (
            <div style={{
              position: 'fixed',
              top: rect ? `${rect.bottom + 8}px` : '100%',
              right: rect ? `${window.innerWidth - rect.right}px` : 0,
              backgroundColor: dropdownBg,
              border: `1px solid ${dropdownBorder}`,
              borderRadius: '12px',
              boxShadow: theme === 'dark' ? '0 4px 16px rgba(0,0,0,0.5)' : '0 4px 16px rgba(0,0,0,0.2)',
              zIndex: 10010,
              minWidth: '200px',
              padding: '8px 0'
            }}>
            <div style={{ padding: '16px 16px 12px 16px' }}>
              <label style={{ 
                display: 'block', 
                fontSize: '12px', 
                color: theme === 'dark' ? '#858585' : '#5f6368', 
                marginBottom: '6px',
                fontWeight: 500
              }}>
                File name
              </label>
            <input
              type="text"
                value={downloadFilename}
                onChange={(e) => handleFilenameChange(e.target.value)}
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(e) => e.stopPropagation()}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    e.stopPropagation()
                    // Save immediately if changed
                    const newFilename = e.currentTarget.value.trim()
                    if (newFilename && newFilename !== documentTitle && documentId && onTitleUpdate) {
                      if (titleUpdateTimeoutRef.current) {
                        clearTimeout(titleUpdateTimeoutRef.current)
                      }
                      onTitleUpdate(newFilename)
                    }
                    // Blur the input to remove focus, but keep menu open
                    e.currentTarget.blur()
                  }
                }}
              style={{
                width: '100%',
                padding: '8px 12px',
                border: `1px solid ${dropdownBorder}`,
                borderRadius: '4px',
                fontSize: '14px',
                  color: dropdownTextColor,
                  backgroundColor: dropdownBg,
                  outline: 'none'
                }}
                onFocus={(e) => {
                  e.target.style.borderColor = theme === 'dark' ? '#4fc3f7' : '#1a73e8'
                  e.target.style.boxShadow = theme === 'dark' ? '0 0 0 1px #4fc3f7' : '0 0 0 1px #1a73e8'
              }}
                onBlur={(e) => {
                  e.target.style.borderColor = dropdownBorder
                  e.target.style.boxShadow = 'none'
                  // Save immediately on blur if changed
                  if (e.target.value.trim() && e.target.value !== documentTitle && documentId && onTitleUpdate) {
                    if (titleUpdateTimeoutRef.current) {
                      clearTimeout(titleUpdateTimeoutRef.current)
                    }
                    onTitleUpdate(e.target.value.trim())
                  }
                }}
                placeholder="Enter file name"
              />
            </div>
              <button
              onMouseDown={(e) => {
                e.preventDefault()
                setShowShareMenu(false)
                onExport('pdf', downloadFilename)
              }}
                style={{
                width: '100%',
                padding: '12px 16px',
                  border: 'none',
                backgroundColor: 'transparent',
                  color: dropdownTextColor,
                  cursor: 'pointer',
                fontSize: '14px',
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                textAlign: 'left'
              }}
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = dropdownHoverBg}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
            >
              <PictureAsPdfIcon style={{ fontSize: '20px', color: '#d32f2f' }} />
              <span>Download as PDF</span>
              </button>
              <button
              onMouseDown={(e) => {
                e.preventDefault()
                  setShowShareMenu(false)
                onExport('docx', downloadFilename)
                }}
                style={{
                width: '100%',
                padding: '12px 16px',
                  border: 'none',
                backgroundColor: 'transparent',
                color: dropdownTextColor,
                  cursor: 'pointer',
                fontSize: '14px',
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                textAlign: 'left'
              }}
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = dropdownHoverBg}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
            >
              <DescriptionIcon style={{ fontSize: '20px', color: '#1976d2' }} />
              <span>Download as DOCX</span>
              </button>
            </div>
          )
        })()}
      </div>
    </div>
  )
}
