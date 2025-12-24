import { Node, mergeAttributes } from '@tiptap/core'
import { ReactNodeViewRenderer, NodeViewWrapper, ReactNodeViewProps } from '@tiptap/react'
import { useState, useRef, useEffect, useCallback } from 'react'
import { useTheme } from '../../contexts/ThemeContext'
import { NodeSelection } from 'prosemirror-state'
// @ts-ignore
import AddIcon from '@mui/icons-material/Add'
// @ts-ignore
import DeleteIcon from '@mui/icons-material/Delete'
// @ts-ignore
import HighlightIcon from '@mui/icons-material/Highlight'

const TableComponent = ({ node, updateAttributes, editor, getPos }: ReactNodeViewProps) => {
  const { theme } = useTheme()
  const [isHovered, setIsHovered] = useState(false)
  const [hoveredRow, setHoveredRow] = useState<number | null>(null)
  const [hoveredCol, setHoveredCol] = useState<number | null>(null)
  const [highlightedRows, setHighlightedRows] = useState<Set<number>>(new Set())
  const [highlightedCols, setHighlightedCols] = useState<Set<number>>(new Set())
  const [isHoveringButtons, setIsHoveringButtons] = useState(false)
  const [editingCells, setEditingCells] = useState<Set<string>>(new Set())
  const tableRef = useRef<HTMLTableElement>(null)
  const buttonTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const cellRefs = useRef<Map<string, HTMLDivElement>>(new Map())
  const dragStartRef = useRef<{ x: number; y: number } | null>(null)
  
  // Parse table HTML into a data structure
  const parseTable = (html: string) => {
    const parser = new DOMParser()
    const doc = parser.parseFromString(html, 'text/html')
    const table = doc.querySelector('table')
    if (!table) return { rows: 0, cols: 0, data: [] }
    
    const rows: string[][] = []
    const thead = table.querySelector('thead')
    const tbody = table.querySelector('tbody')
    
    // Parse header row
    if (thead) {
      const headerRow: string[] = []
      thead.querySelectorAll('th').forEach(th => {
        headerRow.push(th.innerHTML || th.textContent || '')
      })
      if (headerRow.length > 0) rows.push(headerRow)
    }
    
    // Parse body rows
    if (tbody) {
      tbody.querySelectorAll('tr').forEach(tr => {
        const row: string[] = []
        tr.querySelectorAll('td').forEach(td => {
          row.push(td.innerHTML || td.textContent || '')
        })
        if (row.length > 0) rows.push(row)
      })
    }
    
    const cols = rows.length > 0 ? Math.max(...rows.map(r => r.length)) : 0
    return { rows: rows.length, cols, data: rows }
  }
  
  const tableData = parseTable(node.attrs.html || '')
  const [data, setData] = useState(tableData.data)
  
  useEffect(() => {
    const newData = parseTable(node.attrs.html || '')
    setData(newData.data)
  }, [node.attrs.html])
  
  // Sync cell content when data changes (but not during editing)
  useEffect(() => {
    data.forEach((row, rowIndex) => {
      row.forEach((cellHtml, colIndex) => {
        const cellKey = `${rowIndex}-${colIndex}`
        const cellEl = cellRefs.current.get(cellKey)
        if (cellEl && !editingCells.has(cellKey)) {
          const currentContent = cellEl.innerHTML.trim()
          const newContent = (cellHtml || '').trim()
          if (currentContent !== newContent) {
            cellEl.innerHTML = cellHtml || ''
          }
        }
      })
    })
  }, [data, editingCells])
  
  const updateCell = (rowIndex: number, colIndex: number, html: string) => {
    const cellKey = `${rowIndex}-${colIndex}`
    setEditingCells(prev => {
      const next = new Set(prev)
      next.delete(cellKey)
      return next
    })
    const newData = [...data]
    if (!newData[rowIndex]) newData[rowIndex] = []
    newData[rowIndex][colIndex] = html
    setData(newData)
    updateTableHTML(newData)
  }
  
  const handleCellFocus = (rowIndex: number, colIndex: number) => {
    const cellKey = `${rowIndex}-${colIndex}`
    setEditingCells(prev => new Set(prev).add(cellKey))
    // Ensure content is set if it's empty
    const cellEl = cellRefs.current.get(cellKey)
    if (cellEl && !cellEl.innerHTML && data[rowIndex] && data[rowIndex][colIndex]) {
      cellEl.innerHTML = data[rowIndex][colIndex] || ''
    }
  }
  
  const handleCellClick = (rowIndex: number, colIndex: number) => {
    const cellKey = `${rowIndex}-${colIndex}`
    const cellEl = cellRefs.current.get(cellKey)
    if (cellEl && !cellEl.innerHTML && data[rowIndex] && data[rowIndex][colIndex]) {
      // Restore content if it was cleared
      cellEl.innerHTML = data[rowIndex][colIndex] || ''
    }
  }
  
  const updateTableHTML = (newData: string[][]) => {
    const cols = newData.length > 0 ? Math.max(...newData.map(r => r.length)) : 3
    
    let html = '<table style="border-collapse: collapse; margin: 16px 0;">'
    
    // Header row
    if (newData.length > 0) {
      html += '<thead><tr>'
      for (let i = 0; i < cols; i++) {
        const value = newData[0][i] || ''
        // First column has no background, others have header background
        const bgColor = i === 0 ? 'transparent' : (theme === 'dark' ? '#2a2a2a' : '#f5f5f5')
        html += `<th style="border: 1px solid ${theme === 'dark' ? '#555' : '#ddd'}; padding: 8px 4px 8px 8px; text-align: left; background-color: ${bgColor};">${value}</th>`
      }
      html += '</tr></thead>'
    }
    
    // Body rows
    html += '<tbody>'
    for (let i = 1; i < newData.length; i++) {
      html += '<tr>'
      for (let j = 0; j < cols; j++) {
        const value = newData[i][j] || ''
        html += `<td style="border: 1px solid ${theme === 'dark' ? '#555' : '#ddd'}; padding: 8px 4px 8px 8px;">${value}</td>`
      }
      html += '</tr>'
    }
    html += '</tbody></table>'
    
    updateAttributes({ html })
  }
  
  
  const addRow = (afterIndex: number) => {
    const cols = data.length > 0 ? Math.max(...data.map(r => r.length)) : 3
    const newRow = Array(cols).fill('')
    const newData = [...data]
    newData.splice(afterIndex + 1, 0, newRow)
    setData(newData)
    updateTableHTML(newData)
  }
  
  const deleteRow = (index: number) => {
    if (data.length <= 1) return
    const newData = [...data]
    newData.splice(index, 1)
    setData(newData)
    updateTableHTML(newData)
  }
  
  const addColumn = (afterIndex: number) => {
    const newData = data.map(row => {
      const newRow = [...row]
      newRow.splice(afterIndex + 1, 0, '')
      return newRow
    })
    setData(newData)
    updateTableHTML(newData)
  }
  
  const deleteColumn = (index: number) => {
    if (data.length > 0 && data[0].length <= 1) return
    const newData = data.map(row => {
      const newRow = [...row]
      newRow.splice(index, 1)
      return newRow
    })
    setData(newData)
    updateTableHTML(newData)
  }
  
  const borderColor = theme === 'dark' ? '#555' : '#ddd'
  const headerBg = theme === 'dark' ? '#2a2a2a' : '#f5f5f5'
  const highlightBg = theme === 'dark' ? '#2A2A2A' : '#e8e8e8'
  const iconColor = theme === 'dark' ? '#b0b0b0' : '#666666'
  
  const toggleRowHighlight = (rowIndex: number) => {
    const newHighlighted = new Set(highlightedRows)
    if (newHighlighted.has(rowIndex)) {
      newHighlighted.delete(rowIndex)
    } else {
      newHighlighted.add(rowIndex)
    }
    setHighlightedRows(newHighlighted)
  }
  
  const toggleColumnHighlight = (colIndex: number) => {
    const newHighlighted = new Set(highlightedCols)
    if (newHighlighted.has(colIndex)) {
      newHighlighted.delete(colIndex)
    } else {
      newHighlighted.add(colIndex)
    }
    setHighlightedCols(newHighlighted)
  }
  
  const handleMouseLeave = () => {
    if (buttonTimeoutRef.current) {
      clearTimeout(buttonTimeoutRef.current)
    }
    buttonTimeoutRef.current = setTimeout(() => {
      if (!isHoveringButtons) {
        setIsHovered(false)
        setHoveredRow(null)
        setHoveredCol(null)
      }
    }, 100)
  }

  // Apply formatting to all cells and update HTML
  const applyFormattingToAllCells = useCallback((formatFn: (cell: HTMLElement) => void) => {
    // Apply formatting to all cells first
    cellRefs.current.forEach((cellEl) => {
      if (cellEl) {
        formatFn(cellEl)
      }
    })
    
    // Then update HTML after a short delay to ensure DOM is updated
    setTimeout(() => {
      const newData = [...data]
      let hasChanges = false
      
      // Extract updated HTML from all cells
      cellRefs.current.forEach((cellEl, cellKey) => {
        if (cellEl) {
          const updatedHtml = cellEl.innerHTML
          // Parse cellKey to get row and col indices
          const [rowStr, colStr] = cellKey.split('-')
          const rowIndex = parseInt(rowStr)
          const colIndex = parseInt(colStr)
          
          if (!isNaN(rowIndex) && !isNaN(colIndex) && newData[rowIndex] && newData[rowIndex][colIndex] !== updatedHtml) {
            newData[rowIndex][colIndex] = updatedHtml
            hasChanges = true
          }
        }
      })
      
      if (hasChanges) {
        setData(newData)
        updateTableHTML(newData)
      }
    }, 100)
  }, [data, theme])

  // Handle drag selection to select entire table
  const handleMouseDown = (e: React.MouseEvent) => {
    if (!editor || typeof getPos !== 'function') return
    
    const target = e.target as HTMLElement
    
    // Check if click is on the table element itself or its children
    const isClickOnTable = target.closest('table') !== null
    const isClickOnTableCell = target.closest('[data-table-cell]') !== null
    
    // If clicking in the padding area (outside the table), prevent text selection
    if (!isClickOnTable && !isClickOnTableCell) {
      e.preventDefault()
      e.stopPropagation()
      return
    }
    
    // Only handle drag selection if clicking on table borders or outside cells
    if (isClickOnTable && !isClickOnTableCell) {
      const tablePos = getPos()
      if (tablePos === undefined || tablePos < 0) return
      
      dragStartRef.current = { x: e.clientX, y: e.clientY }
      
      const handleMouseMove = (moveEvent: MouseEvent) => {
        if (!dragStartRef.current) return
        
        const deltaX = Math.abs(moveEvent.clientX - dragStartRef.current.x)
        const deltaY = Math.abs(moveEvent.clientY - dragStartRef.current.y)
        
        // If moved more than 3px, consider it a drag
        if (deltaX > 3 || deltaY > 3) {
          // Select the entire table node
          try {
            const tr = editor.view.state.tr.setSelection(NodeSelection.create(editor.view.state.doc, tablePos))
            editor.view.dispatch(tr)
          } catch (error) {
            console.error('Error selecting table node:', error)
          }
          dragStartRef.current = null
          document.removeEventListener('mousemove', handleMouseMove)
          document.removeEventListener('mouseup', handleMouseUp)
        }
      }
      
      const handleMouseUp = () => {
        dragStartRef.current = null
        document.removeEventListener('mousemove', handleMouseMove)
        document.removeEventListener('mouseup', handleMouseUp)
      }
      
      document.addEventListener('mousemove', handleMouseMove)
      document.addEventListener('mouseup', handleMouseUp)
    }
  }
  
  // Expose formatting function via ref for toolbar access
  useEffect(() => {
    if (tableRef.current && editor) {
      // Store reference to apply formatting function on the table element
      ;(tableRef.current as any).__applyFormattingToAllCells = applyFormattingToAllCells
    }
    return () => {
      if (tableRef.current) {
        delete (tableRef.current as any).__applyFormattingToAllCells
      }
    }
  }, [editor, applyFormattingToAllCells])

  return (
    <NodeViewWrapper
      style={{ margin: '16px 0', position: 'relative', width: '100%', maxWidth: '100%', overflowX: 'visible', overflowY: 'visible', boxSizing: 'border-box', paddingTop: '40px', paddingLeft: '40px', paddingRight: '50px', userSelect: 'none' }}
      onMouseEnter={() => {
        setIsHovered(true)
        if (buttonTimeoutRef.current) {
          clearTimeout(buttonTimeoutRef.current)
        }
      }}
      onMouseLeave={handleMouseLeave}
      onMouseDown={handleMouseDown}
    >
      {/* Button container for column buttons */}
      {isHovered && hoveredCol !== null && data.length > 0 && (
        <div 
          ref={(el) => {
            if (el && tableRef.current && data.length > 0) {
              const headerCell = tableRef.current.querySelector(`thead th:nth-child(${hoveredCol + 1})`) as HTMLElement
              if (headerCell) {
                const rect = headerCell.getBoundingClientRect()
                const wrapperRect = el.parentElement?.getBoundingClientRect()
                if (wrapperRect) {
                  el.style.left = `${rect.left - wrapperRect.left + rect.width / 2}px`
                  el.style.top = `${rect.top - wrapperRect.top - 32}px`
                }
              }
            }
          }}
          onMouseEnter={() => setIsHoveringButtons(true)}
          onMouseLeave={() => setIsHoveringButtons(false)}
          style={{
            position: 'absolute',
            transform: 'translateX(-50%)',
            display: 'flex',
            gap: '0',
            zIndex: 1000,
            padding: '0',
            pointerEvents: 'auto',
          }}
        >
          <button
            onClick={() => addColumn(hoveredCol)}
            style={{
              padding: '4px',
              backgroundColor: 'transparent',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              fontSize: '14px',
            }}
            title="Add column"
          >
            <AddIcon style={{ fontSize: '16px', color: iconColor }} />
          </button>
          <button
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              toggleColumnHighlight(hoveredCol)
            }}
            onMouseDown={(e) => {
              e.preventDefault()
              e.stopPropagation()
            }}
            style={{
              padding: '4px',
              backgroundColor: 'transparent',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              fontSize: '14px',
              userSelect: 'none',
            }}
            title="Highlight column"
          >
            <HighlightIcon style={{ fontSize: '16px', color: highlightedCols.has(hoveredCol) ? (theme === 'dark' ? '#4fc3f7' : '#1a73e8') : iconColor }} />
          </button>
          {data.length > 0 && data[0].length > 1 && (
            <button
              onClick={() => deleteColumn(hoveredCol)}
              style={{
                padding: '4px',
                backgroundColor: 'transparent',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                fontSize: '13px',
                marginTop: '2px',
              }}
              title="Delete column"
            >
              <DeleteIcon style={{ fontSize: '16px', color: iconColor }} />
            </button>
          )}
        </div>
      )}
      
      {/* Button container for row buttons */}
      {isHovered && hoveredRow !== null && hoveredRow > 0 && (
        <div 
          ref={(el) => {
            if (el && tableRef.current && hoveredRow > 0) {
              const row = tableRef.current.querySelector(`tbody tr:nth-child(${hoveredRow})`) as HTMLElement
              if (row) {
                const rect = row.getBoundingClientRect()
                const wrapperRect = el.parentElement?.getBoundingClientRect()
                const tableRect = tableRef.current.getBoundingClientRect()
                if (wrapperRect && tableRect) {
                  // Position on the right side, always at the rightmost edge of the table
                  el.style.left = `${tableRect.right - wrapperRect.left + 6}px`
                  el.style.top = `${rect.top - wrapperRect.top + rect.height / 2}px`
                }
              }
            }
          }}
          onMouseEnter={() => setIsHoveringButtons(true)}
          onMouseLeave={() => setIsHoveringButtons(false)}
          style={{
            position: 'absolute',
            transform: 'translateY(-50%)',
            display: 'flex',
            flexDirection: 'row',
            gap: '0',
            zIndex: 1000,
            padding: '0',
            pointerEvents: 'auto',
          }}
        >
          <button
            onClick={() => addRow(hoveredRow)}
            style={{
              padding: '4px',
              backgroundColor: 'transparent',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '14px',
            }}
            title="Add row"
          >
            <AddIcon style={{ fontSize: '16px', color: iconColor }} />
          </button>
          <button
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              toggleRowHighlight(hoveredRow)
            }}
            onMouseDown={(e) => {
              e.preventDefault()
              e.stopPropagation()
            }}
            style={{
              padding: '4px',
              backgroundColor: 'transparent',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '14px',
              userSelect: 'none',
            }}
            title="Highlight row"
          >
            <HighlightIcon style={{ fontSize: '16px', color: highlightedRows.has(hoveredRow) ? (theme === 'dark' ? '#4fc3f7' : '#1a73e8') : iconColor }} />
          </button>
          {data.length > 2 && (
            <button
              onClick={() => deleteRow(hoveredRow)}
              style={{
                padding: '4px',
                backgroundColor: 'transparent',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '13px',
                marginTop: '2px',
              }}
              title="Delete row"
            >
              <DeleteIcon style={{ fontSize: '16px', color: iconColor }} />
            </button>
          )}
        </div>
      )}
      
      <div style={{ position: 'relative', display: 'block', paddingRight: '40px', width: '100%', maxWidth: '100%', overflowX: 'hidden', boxSizing: 'border-box', userSelect: 'text' }}>
        <table
          ref={tableRef}
          onMouseDown={(e) => {
            // Prevent text selection when clicking on table borders
            if (e.target === e.currentTarget || (e.target as HTMLElement).tagName === 'TABLE') {
              e.preventDefault()
            }
          }}
          style={{
            borderCollapse: 'collapse',
            borderSpacing: 0,
            margin: 0,
            tableLayout: 'fixed',
            userSelect: 'none',
            width: '100%',
            maxWidth: '100%',
          }}
        >
          <thead>
            <tr>
              {data.length > 0 && data[0].map((_, colIndex) => {
                const isColHighlighted = highlightedCols.has(colIndex)
                const headerCellBg = isColHighlighted ? highlightBg : headerBg
                
                return (
                <th
                  key={colIndex}
                  onMouseEnter={() => setHoveredCol(colIndex)}
                  onMouseDown={(e) => {
                    // Prevent text selection when clicking on cell borders
                    if (e.target === e.currentTarget) {
                      e.preventDefault()
                    }
                  }}
                  style={{
                    border: `1px solid ${borderColor}`,
                    paddingLeft: '8px',
                    paddingRight: '4px',
                    paddingTop: '8px',
                    paddingBottom: '8px',
                    textAlign: 'left',
                    backgroundColor: headerCellBg,
                    position: 'relative',
                    width: `${100 / (data.length > 0 ? data[0].length : 1)}%`,
                    maxWidth: `${100 / (data.length > 0 ? data[0].length : 1)}%`,
                    overflow: 'visible',
                    wordWrap: 'break-word',
                    overflowWrap: 'break-word',
                    userSelect: 'none',
                    fontWeight: 'normal',
                  }}
                >
                  <div
                    ref={(el) => {
                      if (el) {
                        cellRefs.current.set(`0-${colIndex}`, el)
                        el.setAttribute('data-table-cell', 'true')
                      }
                    }}
                    contentEditable
                    suppressContentEditableWarning
                    onFocus={() => handleCellFocus(0, colIndex)}
                    onClick={() => handleCellClick(0, colIndex)}
                    onBlur={(e) => updateCell(0, colIndex, e.currentTarget.innerHTML || '')}
                    onInput={() => {
                      // Prevent React from interfering with contentEditable
                      const cellKey = `0-${colIndex}`
                      setEditingCells(prev => new Set(prev).add(cellKey))
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault()
                        e.currentTarget.blur()
                      }
                    }}
                    style={{
                      outline: 'none',
                      minHeight: '20px',
                      margin: 0,
                      padding: 0,
                      width: '100%',
                      maxWidth: '100%',
                      boxSizing: 'border-box',
                      display: 'block',
                      wordWrap: 'break-word',
                      overflowWrap: 'break-word',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      userSelect: 'text',
                      fontSize: '14px',
                      fontWeight: 'normal',
                    }}
                  />
                </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {data.slice(1).map((row, rowIndex) => (
              <tr
                key={rowIndex}
                onMouseEnter={() => setHoveredRow(rowIndex + 1)}
                style={{
                  backgroundColor: 'transparent',
                  position: 'relative',
                }}
              >
                {row.map((_, colIndex) => {
                  const isRowHighlighted = highlightedRows.has(rowIndex + 1)
                  const isColHighlighted = highlightedCols.has(colIndex)
                  const cellBg = isRowHighlighted || isColHighlighted ? highlightBg : 'transparent'
                  
                  return (
                  <td
                    key={colIndex}
                    onMouseDown={(e) => {
                      // Prevent text selection when clicking on cell borders
                      if (e.target === e.currentTarget) {
                        e.preventDefault()
                      }
                    }}
                    style={{
                      border: `1px solid ${borderColor}`,
                      paddingLeft: '8px',
                      paddingRight: '4px',
                      paddingTop: '8px',
                      paddingBottom: '8px',
                      position: 'relative',
                      width: `${100 / (data.length > 0 && data[0].length > 0 ? data[0].length : 1)}%`,
                      maxWidth: `${100 / (data.length > 0 && data[0].length > 0 ? data[0].length : 1)}%`,
                      overflow: 'visible',
                      wordWrap: 'break-word',
                      overflowWrap: 'break-word',
                      backgroundColor: cellBg,
                      userSelect: 'none',
                    }}
                  >
                    <div
                      ref={(el) => {
                        if (el) {
                          cellRefs.current.set(`${rowIndex + 1}-${colIndex}`, el)
                          el.setAttribute('data-table-cell', 'true')
                        }
                      }}
                      contentEditable
                      suppressContentEditableWarning
                      onFocus={() => handleCellFocus(rowIndex + 1, colIndex)}
                      onClick={() => handleCellClick(rowIndex + 1, colIndex)}
                      onBlur={(e) => updateCell(rowIndex + 1, colIndex, e.currentTarget.innerHTML || '')}
                      onInput={() => {
                        // Prevent React from interfering with contentEditable
                        const cellKey = `${rowIndex + 1}-${colIndex}`
                        setEditingCells(prev => new Set(prev).add(cellKey))
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault()
                          e.currentTarget.blur()
                        }
                      }}
                      style={{
                        outline: 'none',
                        minHeight: '20px',
                        margin: 0,
                        padding: 0,
                        width: '100%',
                        maxWidth: '100%',
                        boxSizing: 'border-box',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        wordWrap: 'break-word',
                        overflowWrap: 'break-word',
                        userSelect: 'text',
                        fontSize: '14px',
                      }}
                    />
                  </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </NodeViewWrapper>
  )
}

export const TableExtension = Node.create({
  name: 'tableBlock',

  group: 'block',

  atom: true,

  addAttributes() {
    return {
      html: {
        default: '',
        parseHTML: (element) => {
          if (typeof element === 'string') return ''
          return element.innerHTML || ''
        },
        renderHTML: (attributes) => {
          if (!attributes.html) {
            return {}
          }
          return {
            'data-table-block': 'true',
          }
        },
      },
    }
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-table-block]',
        getAttrs: (element) => {
          if (typeof element === 'string') return false
          return {
            html: element.innerHTML || '',
          }
        },
      },
    ]
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, { 'data-table-block': 'true' })]
  },

  addNodeView() {
    return ReactNodeViewRenderer(TableComponent)
  },

  addCommands() {
    return {
      insertTableBlock:
        (html: string) =>
        ({ commands }: { commands: any }) => {
          return commands.insertContent({
            type: this.name,
            attrs: { html },
          })
        },
    } as any
  },
})
