import { Node, mergeAttributes } from '@tiptap/core'
import { ReactNodeViewRenderer, NodeViewWrapper, ReactNodeViewProps } from '@tiptap/react'
import { useState, useEffect, useRef } from 'react'
import { useTheme } from '../../contexts/ThemeContext'
// @ts-ignore
import EditIcon from '@mui/icons-material/Edit'
// @ts-ignore
import DeleteIcon from '@mui/icons-material/Delete'
// @ts-ignore
import CheckIcon from '@mui/icons-material/Check'
// @ts-ignore
import CloseIcon from '@mui/icons-material/Close'

const ChartComponent = ({ node, updateAttributes, editor, selected, getPos }: ReactNodeViewProps) => {
  const { theme } = useTheme()
  const [isEditing, setIsEditing] = useState(false)
  const [isClicked, setIsClicked] = useState(false)
  const chartType = node.attrs.chartType || 'column'
  const chartName = node.attrs.chartName || ''
  const defaultData = {
    labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May'],
    datasets: [{ label: 'Data', values: [10, 20, 15, 25, 30] }]
  }
  
  const [chartData, setChartData] = useState(() => {
    try {
      return node.attrs.chartData ? JSON.parse(node.attrs.chartData) : defaultData
    } catch {
      return defaultData
    }
  })
  
  const [localChartType, setLocalChartType] = useState(chartType)
  const [localChartName, setLocalChartName] = useState(chartName)
  const [localData, setLocalData] = useState(chartData)
  const labelRefs = useRef<Map<number, HTMLDivElement>>(new Map())
  const valueRefs = useRef<Map<number, HTMLDivElement>>(new Map())

  useEffect(() => {
    try {
      const parsed = node.attrs.chartData ? JSON.parse(node.attrs.chartData) : defaultData
      setChartData(parsed)
      setLocalData(parsed)
    } catch {
      setChartData(defaultData)
      setLocalData(defaultData)
    }
    setLocalChartType(chartType)
    setLocalChartName(chartName)
  }, [node.attrs.chartData, chartType, chartName])

  const handleSave = () => {
    // Use editor chain to update attributes so the transaction is tracked by History extension
    if (typeof getPos === 'function' && editor) {
      const pos = getPos()
      if (pos !== undefined && pos !== null) {
        // Create a transaction that updates the node attributes
        // This ensures the change is tracked by the History extension
        const { state, dispatch } = editor.view
        const { tr } = state
        const node = state.doc.nodeAt(pos)
        if (node) {
          tr.setNodeMarkup(pos, undefined, {
            ...node.attrs,
            chartType: localChartType,
            chartName: localChartName,
            chartData: JSON.stringify(localData),
          })
          dispatch(tr)
          setIsEditing(false)
          return
        }
      }
    }
    // Fallback to updateAttributes if getPos is not available
    updateAttributes({
      chartType: localChartType,
      chartName: localChartName,
      chartData: JSON.stringify(localData),
    })
    setIsEditing(false)
  }

  const handleDelete = () => {
    editor.chain().focus().deleteSelection().run()
  }

  const updateLabel = (index: number, html: string) => {
    const newData = { ...localData }
    // Extract text content from HTML
    const tempDiv = document.createElement('div')
    tempDiv.innerHTML = html
    const textContent = tempDiv.textContent || tempDiv.innerText || ''
    newData.labels[index] = textContent.trim()
    setLocalData(newData)
  }

  const updateValue = (index: number, html: string) => {
    const newData = { ...localData }
    // Extract text content from HTML and parse as number
    const tempDiv = document.createElement('div')
    tempDiv.innerHTML = html
    const textContent = tempDiv.textContent || tempDiv.innerText || ''
    const numValue = parseFloat(textContent.trim()) || 0
    newData.datasets[0].values[index] = numValue
    setLocalData(newData)
  }
  
  // Sync contentEditable divs with data
  useEffect(() => {
    if (isEditing) {
      localData.labels.forEach((label: string, index: number) => {
        const labelEl = labelRefs.current.get(index)
        if (labelEl && labelEl.textContent?.trim() !== label.trim()) {
          labelEl.textContent = label
        }
        const valueEl = valueRefs.current.get(index)
        const value = localData.datasets[0].values[index]
        if (valueEl && valueEl.textContent?.trim() !== String(value)) {
          valueEl.textContent = String(value)
        }
      })
    }
  }, [localData, isEditing])

  const addDataPoint = () => {
    const newData = { ...localData }
    newData.labels.push(`Item ${newData.labels.length + 1}`)
    newData.datasets[0].values.push(0)
    setLocalData(newData)
  }

  const removeDataPoint = (index: number) => {
    if (localData.labels.length <= 1) return
    const newData = { ...localData }
    newData.labels.splice(index, 1)
    newData.datasets[0].values.splice(index, 1)
    setLocalData(newData)
  }

  const renderChartSVG = (type: string, data: any) => {
    const values = data.datasets[0].values
    const labels = data.labels || []
    const maxValue = Math.max(...values, 1)
    
    // Calculate nice round numbers for Y-axis
    const niceMax = Math.ceil(maxValue / 10) * 10 || 10
    const niceStep = niceMax / 4
    const yTicks = [0, niceStep, niceStep * 2, niceStep * 3, niceMax]
    
    const width = 600
    const height = 350
    const leftPadding = 60
    const rightPadding = 40
    const topPadding = 40
    const bottomPadding = 60
    const chartWidth = width - leftPadding - rightPadding
    const chartHeight = height - topPadding - bottomPadding
    
    const axisColor = theme === 'dark' ? '#666666' : '#cccccc'
    const gridColor = theme === 'dark' ? '#333333' : '#e0e0e0'
    const textColor = theme === 'dark' ? '#b0b0b0' : '#666666'
    const strokeColor = theme === 'dark' ? '#4fc3f7' : '#1a73e8'
    const fillColor = theme === 'dark' ? '#4fc3f7' : '#1a73e8'
    const fontSize = '12px'
    const fontFamily = 'Arial, sans-serif'

    let svg = `<defs>
      <style>
        .chart-text { font-family: ${fontFamily}; font-size: ${fontSize}; fill: ${textColor}; }
        .chart-axis { stroke: ${axisColor}; stroke-width: 1; }
        .chart-grid { stroke: ${gridColor}; stroke-width: 1; stroke-dasharray: 2,2; }
      </style>
    </defs>`

    // Only draw grid lines and axes for column and line charts (not pie)
    if (type !== 'pie') {
      // Draw grid lines and Y-axis labels
      yTicks.forEach((tick) => {
        const y = topPadding + chartHeight - ((tick / niceMax) * chartHeight)
        // Grid line
        svg += `<line x1="${leftPadding}" y1="${y}" x2="${leftPadding + chartWidth}" y2="${y}" class="chart-grid"/>`
        // Y-axis label
        svg += `<text x="${leftPadding - 10}" y="${y + 4}" text-anchor="end" class="chart-text">${Math.round(tick)}</text>`
      })

      // Draw X and Y axes
      svg += `<line x1="${leftPadding}" y1="${topPadding}" x2="${leftPadding}" y2="${topPadding + chartHeight}" class="chart-axis"/>`
      svg += `<line x1="${leftPadding}" y1="${topPadding + chartHeight}" x2="${leftPadding + chartWidth}" y2="${topPadding + chartHeight}" class="chart-axis"/>`
    }

    if (type === 'column') {
      // Column = vertical bars
      const barSpacing = 8
      const barWidth = (chartWidth / values.length) - barSpacing
      
      // Color palette for different bars
      const colors = [
        theme === 'dark' ? '#4fc3f7' : '#1a73e8',
        theme === 'dark' ? '#66bb6a' : '#34a853',
        theme === 'dark' ? '#ffa726' : '#fbbc04',
        theme === 'dark' ? '#ef5350' : '#ea4335',
        theme === 'dark' ? '#ab47bc' : '#9c27b0',
        theme === 'dark' ? '#26c6da' : '#00acc1',
        theme === 'dark' ? '#ffca28' : '#ffc107',
        theme === 'dark' ? '#78909c' : '#607d8b',
      ]

      values.forEach((value: number, index: number) => {
        const color = colors[index % colors.length]
        const barLength = (value / niceMax) * chartHeight
        
        // Vertical bars (Column chart)
        const x = leftPadding + (index * (chartWidth / values.length)) + (barSpacing / 2)
        const y = topPadding + chartHeight - barLength
        svg += `<rect x="${x}" y="${y}" width="${barWidth}" height="${barLength}" fill="${color}" rx="2"/>`
        // Value label on top of bar
        if (barLength > 15) {
          svg += `<text x="${x + barWidth / 2}" y="${y - 5}" text-anchor="middle" class="chart-text">${value}</text>`
        }
        // X-axis label (category name)
        const labelY = topPadding + chartHeight + 20
        svg += `<text x="${x + barWidth / 2}" y="${labelY}" text-anchor="middle" class="chart-text">${labels[index] || `Item ${index + 1}`}</text>`
      })
    } else if (type === 'line') {
      const points = values.map((value: number, index: number) => {
        const x = leftPadding + (index * (chartWidth / (values.length - 1 || 1)))
        const y = topPadding + chartHeight - ((value / niceMax) * chartHeight)
        return { x, y, value }
      })

      // Draw line
      const pathData = points.map((p: { x: number; y: number }, i: number) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ')
      svg += `<path d="${pathData}" fill="none" stroke="${strokeColor}" stroke-width="2"/>`

      // Draw points and labels
      points.forEach((point: { x: number; y: number; value: number }, index: number) => {
        svg += `<circle cx="${point.x}" cy="${point.y}" r="4" fill="${fillColor}" stroke="${theme === 'dark' ? '#1e1e1e' : '#ffffff'}" stroke-width="2"/>`
        // X-axis label
        const labelY = topPadding + chartHeight + 20
        svg += `<text x="${point.x}" y="${labelY}" text-anchor="middle" class="chart-text">${labels[index] || `Item ${index + 1}`}</text>`
      })
    } else if (type === 'pie') {
      // Pie chart - no axes or grid lines, centered
      const centerX = width / 2
      const centerY = height / 2
      const radius = Math.min(width, height) / 2 - 40
      let currentAngle = -Math.PI / 2
      const total = values.reduce((sum: number, val: number) => sum + val, 0) || 1

      // Color palette for pie slices
      const colors = [
        theme === 'dark' ? '#4fc3f7' : '#1a73e8',
        theme === 'dark' ? '#66bb6a' : '#34a853',
        theme === 'dark' ? '#ffa726' : '#fbbc04',
        theme === 'dark' ? '#ef5350' : '#ea4335',
        theme === 'dark' ? '#ab47bc' : '#9c27b0',
        theme === 'dark' ? '#26c6da' : '#00acc1',
        theme === 'dark' ? '#ffca28' : '#ffc107',
        theme === 'dark' ? '#78909c' : '#607d8b',
      ]

      // Draw pie slices
      values.forEach((value: number, index: number) => {
        const sliceAngle = (value / total) * 2 * Math.PI
        const x1 = centerX + radius * Math.cos(currentAngle)
        const y1 = centerY + radius * Math.sin(currentAngle)
        const x2 = centerX + radius * Math.cos(currentAngle + sliceAngle)
        const y2 = centerY + radius * Math.sin(currentAngle + sliceAngle)
        const largeArc = sliceAngle > Math.PI ? 1 : 0

        const path = `M ${centerX} ${centerY} L ${x1} ${y1} A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2} Z`
        const color = colors[index % colors.length]

        svg += `<path d="${path}" fill="${color}" stroke="${theme === 'dark' ? '#1e1e1e' : '#ffffff'}" stroke-width="2"/>`

        // Label for pie slice
        const labelAngle = currentAngle + sliceAngle / 2
        const labelRadius = radius * 0.7
        const labelX = centerX + labelRadius * Math.cos(labelAngle)
        const labelY = centerY + labelRadius * Math.sin(labelAngle)
        const percentage = ((value / total) * 100).toFixed(0)
        
        svg += `<text x="${labelX}" y="${labelY}" text-anchor="middle" font-weight="bold" fill="#ffffff" font-family="${fontFamily}" font-size="${fontSize}">${percentage}%</text>`

        currentAngle += sliceAngle
      })

      // Legend for pie chart (positioned to the right, centered vertically)
      const legendX = width - 120
      const legendY = height / 2 - (values.length * 20) / 2
      values.forEach((_value: number, index: number) => {
        const color = colors[index % colors.length]
        const legendItemY = legendY + (index * 20)
        
        svg += `<rect x="${legendX}" y="${legendItemY - 8}" width="12" height="12" fill="${color}"/>`
        svg += `<text x="${legendX + 18}" y="${legendItemY}" class="chart-text">${labels[index] || `Item ${index + 1}`}</text>`
      })
    }

    return `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">${svg}</svg>`
  }

  const borderColor = theme === 'dark' ? '#404040' : '#ddd'
  const bgColor = theme === 'dark' ? '#1e1e1e' : '#ffffff'
  const textColor = theme === 'dark' ? '#e0e0e0' : '#202124'
  const inputBg = theme === 'dark' ? '#2d2d2d' : '#f9f9f9'
  const buttonBg = theme === 'dark' ? '#2d2d2d' : '#f5f5f5'
  const buttonHoverBg = theme === 'dark' ? '#3d3d3d' : '#e0e0e0'
  const tableHeaderBg = theme === 'dark' ? '#252525' : '#f5f5f5'
  const previewBg = theme === 'dark' ? '#141414' : '#fafafa'

  const showContainer = isEditing || isClicked || selected

  const containerRef = useRef<HTMLDivElement>(null)

  // Handle click outside to hide container
  useEffect(() => {
    if (isClicked && !isEditing) {
      const handleClickOutside = (e: MouseEvent) => {
        const target = e.target as HTMLElement
        if (containerRef.current && !containerRef.current.contains(target)) {
          setIsClicked(false)
        }
      }
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isClicked, isEditing])

  return (
    <NodeViewWrapper style={{ margin: '16px 0', position: 'relative' }}>
      <div
        ref={containerRef}
        onClick={(e) => {
          if (!isEditing) {
            e.stopPropagation()
            setIsClicked(true)
          }
        }}
        style={{
          position: 'relative',
          cursor: isEditing ? 'default' : 'pointer',
          outline: 'none',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          width: '100%',
        }}
        tabIndex={0}
      >
        {/* Chart Title - always show above chart */}
        {chartName && !isEditing && (
          <div style={{
            fontSize: '18px',
            fontWeight: 'bold',
            color: textColor,
            marginBottom: '8px',
            textAlign: 'center',
            width: '100%',
          }}>
            {chartName}
          </div>
        )}
        {/* Container overlay - doesn't affect layout */}
        {showContainer && (
          <div style={{
            position: 'absolute',
            top: '-16px',
            left: '-16px',
            right: '-16px',
            bottom: '-16px',
            border: `1px solid ${borderColor}`,
            borderRadius: '8px',
            backgroundColor: bgColor,
            zIndex: -1,
            pointerEvents: 'none',
          }} />
        )}

        {/* Control buttons */}
        {showContainer && (
          <div style={{
            position: 'absolute',
            top: '-8px',
            right: '-8px',
            display: 'flex',
            gap: '4px',
            zIndex: 10,
          }}>
            {!isEditing && (
            <>
              <button
                onClick={() => setIsEditing(true)}
                style={{
                  padding: '6px',
                  backgroundColor: buttonBg,
                  border: `1px solid ${borderColor}`,
                  borderRadius: '4px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  color: textColor,
                }}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = buttonHoverBg}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = buttonBg}
                title="Edit chart"
              >
                <EditIcon style={{ fontSize: '18px' }} />
              </button>
              <button
                onClick={handleDelete}
                style={{
                  padding: '6px',
                  backgroundColor: buttonBg,
                  border: `1px solid ${borderColor}`,
                  borderRadius: '4px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  color: textColor,
                }}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = buttonHoverBg}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = buttonBg}
                title="Delete chart"
              >
                <DeleteIcon style={{ fontSize: '18px' }} />
              </button>
            </>
            )}
          </div>
        )}

        {isEditing ? (
          <div style={{ width: '100%', maxWidth: '600px' }}>
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', marginBottom: '8px', color: textColor, fontSize: '14px' }}>
                Chart Name:
              </label>
              <input
                type="text"
                value={localChartName}
                onChange={(e) => setLocalChartName(e.target.value)}
                placeholder="Enter chart name..."
                style={{
                  width: '100%',
                  padding: '8px',
                  backgroundColor: inputBg,
                  border: `1px solid ${borderColor}`,
                  borderRadius: '4px',
                  color: textColor,
                  fontSize: '14px',
                  outline: 'none',
                }}
                onFocus={(e) => e.target.style.borderColor = theme === 'dark' ? '#4fc3f7' : '#1a73e8'}
                onBlur={(e) => e.target.style.borderColor = borderColor}
              />
            </div>

            <div style={{ marginBottom: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <label style={{ color: textColor, fontSize: '14px' }}>Data:</label>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <button
                    onClick={addDataPoint}
                    style={{
                      padding: '4px 8px',
                      backgroundColor: buttonBg,
                      border: `1px solid ${borderColor}`,
                      borderRadius: '4px',
                      cursor: 'pointer',
                      color: textColor,
                      fontSize: '12px',
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = buttonHoverBg}
                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = buttonBg}
                  >
                    + Add
                  </button>
                  <button
                    onClick={handleSave}
                    style={{
                      padding: '4px 8px',
                      backgroundColor: theme === 'dark' ? '#4fc3f7' : '#1a73e8',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      color: '#ffffff',
                      fontSize: '12px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = theme === 'dark' ? '#5fd3ff' : '#1765cc'}
                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = theme === 'dark' ? '#4fc3f7' : '#1a73e8'}
                  >
                    <CheckIcon style={{ fontSize: '14px' }} />
                    Save
                  </button>
                </div>
              </div>
              <div style={{
                border: `1px solid ${borderColor}`,
                borderRadius: '4px',
                overflow: 'hidden',
              }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ backgroundColor: tableHeaderBg }}>
                      <th style={{ padding: '8px', textAlign: 'left', borderBottom: `1px solid ${borderColor}`, color: textColor, fontSize: '12px' }}>Label</th>
                      <th style={{ padding: '8px', textAlign: 'left', borderBottom: `1px solid ${borderColor}`, color: textColor, fontSize: '12px' }}>Value</th>
                      <th style={{ padding: '8px', width: '40px', borderBottom: `1px solid ${borderColor}` }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {localData.labels.map((label: string, index: number) => (
                      <tr key={index}>
                        <td style={{ 
                          padding: '8px 4px 8px 8px', 
                          borderBottom: `1px solid ${borderColor}`,
                          borderRight: `1px solid ${borderColor}`,
                        }}>
                          <div
                            ref={(el) => {
                              if (el) {
                                labelRefs.current.set(index, el)
                                if (el.textContent !== label) {
                                  el.textContent = label
                                }
                              }
                            }}
                            contentEditable
                            suppressContentEditableWarning
                            onBlur={(e) => updateLabel(index, e.currentTarget.innerHTML || '')}
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
                              boxSizing: 'border-box',
                              display: 'block',
                              wordWrap: 'break-word',
                              overflowWrap: 'break-word',
                              userSelect: 'text',
                              fontSize: '14px',
                              fontWeight: 'normal',
                              color: textColor,
                            }}
                          />
                        </td>
                        <td style={{ 
                          padding: '8px 4px 8px 8px', 
                          borderBottom: `1px solid ${borderColor}`,
                          borderRight: `1px solid ${borderColor}`,
                        }}>
                          <div
                            ref={(el) => {
                              if (el) {
                                valueRefs.current.set(index, el)
                                const value = localData.datasets[0].values[index]
                                if (el.textContent !== String(value)) {
                                  el.textContent = String(value)
                                }
                              }
                            }}
                            contentEditable
                            suppressContentEditableWarning
                            onBlur={(e) => updateValue(index, e.currentTarget.innerHTML || '')}
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
                              boxSizing: 'border-box',
                              display: 'block',
                              wordWrap: 'break-word',
                              overflowWrap: 'break-word',
                              userSelect: 'text',
                              fontSize: '14px',
                              fontWeight: 'normal',
                              color: textColor,
                            }}
                          />
                        </td>
                        <td style={{ padding: '8px', borderBottom: `1px solid ${borderColor}` }}>
                          {localData.labels.length > 1 && (
                            <button
                              onClick={() => removeDataPoint(index)}
                              style={{
                                padding: '4px',
                                backgroundColor: 'transparent',
                                border: 'none',
                                cursor: 'pointer',
                                color: textColor,
                              }}
                              title="Remove"
                            >
                              <DeleteIcon style={{ fontSize: '16px' }} />
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Preview */}
            <div style={{ marginBottom: '16px', padding: '16px', backgroundColor: previewBg, borderRadius: '4px', overflowX: 'hidden', overflowY: 'auto' }}>
              <div style={{ fontSize: '14px', color: theme === 'dark' ? '#b0b0b0' : '#666', marginBottom: '8px' }}>
                Preview:
              </div>
              <div style={{ overflowX: 'hidden', width: '100%' }} dangerouslySetInnerHTML={{ __html: renderChartSVG(localChartType, localData) }} />
            </div>

          </div>
        ) : (
          <div style={{ 
            overflowX: 'hidden',
            overflowY: 'visible', 
            width: '100%',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            marginTop: chartName ? '0' : '0',
          }} dangerouslySetInnerHTML={{ __html: renderChartSVG(chartType, chartData) }} />
        )}
      </div>
    </NodeViewWrapper>
  )
}

export const ChartExtension = Node.create({
  name: 'chart',

  group: 'block',

  atom: true,

  addAttributes() {
    return {
      chartType: {
        default: 'column',
        parseHTML: (element) => element.getAttribute('data-chart-type'),
        renderHTML: (attributes) => {
          if (!attributes.chartType) {
            return {}
          }
          return {
            'data-chart-type': attributes.chartType,
          }
        },
      },
      chartName: {
        default: '',
        parseHTML: (element) => element.getAttribute('data-chart-name') || '',
        renderHTML: (attributes) => {
          if (!attributes.chartName) {
            return {}
          }
          return {
            'data-chart-name': attributes.chartName,
          }
        },
      },
      chartData: {
        default: JSON.stringify({
          labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May'],
          datasets: [{ label: 'Data', values: [10, 20, 15, 25, 30] }]
        }),
        parseHTML: (element) => element.getAttribute('data-chart-data'),
        renderHTML: (attributes) => {
          if (!attributes.chartData) {
            return {}
          }
          return {
            'data-chart-data': attributes.chartData,
          }
        },
      },
    }
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-chart-type]',
      },
    ]
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(this.options.HTMLAttributes, HTMLAttributes)]
  },

  addNodeView() {
    return ReactNodeViewRenderer(ChartComponent)
  },

  addCommands() {
    return {
      setChart:
        (chartType: string, chartData?: any, chartName?: string) =>
        ({ commands }: { commands: any }) => {
          const defaultData = {
            labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May'],
            datasets: [{ label: 'Data', values: [10, 20, 15, 25, 30] }]
          }
          return commands.insertContent({
            type: this.name,
            attrs: {
              chartType,
              chartName: chartName || '',
              chartData: JSON.stringify(chartData || defaultData),
            },
          })
        },
    } as any
  },
})
