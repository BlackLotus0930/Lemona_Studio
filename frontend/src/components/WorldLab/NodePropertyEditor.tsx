import React, { useState, useEffect, useRef } from 'react'
import { useTheme } from '../../contexts/ThemeContext'
import type { Node } from '@xyflow/react'

interface NodePropertyEditorProps {
  nodeId: string
  node: Node | undefined
  onUpdate: (updates: { category?: string; elementName?: string }) => void
  onClose: () => void
}

const CATEGORIES = ['人物', '事件', '地点', '规则', '设定', '概念', '想法']

export default function NodePropertyEditor({
  node,
  onUpdate,
  onClose,
}: NodePropertyEditorProps) {
  const { theme } = useTheme()
  
  // Safely extract category and elementName from node data
  const getCategory = (): string => {
    if (!node?.data) return ''
    const cat = (node.data as any).category
    return typeof cat === 'string' ? cat : ''
  }
  
  const getElementName = (): string => {
    if (!node?.data) return ''
    const name = (node.data as any).elementName
    return typeof name === 'string' ? name : ''
  }
  
  const [category, setCategory] = useState<string>(getCategory())
  const [elementName, setElementName] = useState<string>(getElementName())
  const [isDropdownOpen, setIsDropdownOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Update local state when node changes
  useEffect(() => {
    setCategory(getCategory())
    setElementName(getElementName())
  }, [node])

  // Handle click outside to close dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as HTMLElement)) {
        setIsDropdownOpen(false)
      }
    }

    if (isDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => {
        document.removeEventListener('mousedown', handleClickOutside)
      }
    }
  }, [isDropdownOpen])

  const handleCategoryChange = (newCategory: string) => {
    setCategory(newCategory)
    setIsDropdownOpen(false)
    onUpdate({ category: newCategory })
  }

  const handleElementNameChange = (newElementName: string) => {
    setElementName(newElementName)
  }

  const handleElementNameBlur = () => {
    if (elementName !== node?.data?.elementName) {
      onUpdate({ elementName: elementName || '' })
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleElementNameBlur()
    } else if (e.key === 'Escape') {
      onClose()
    }
  }

  const bgColor = theme === 'dark' ? '#1e1e1e' : '#ffffff'
  const borderColor = theme === 'dark' ? '#333' : '#dadce0'
  const textColor = theme === 'dark' ? '#D6D6DD' : '#202124'
  const inputBg = theme === 'dark' ? '#252525' : '#f8f9fa'
  const inputBorder = theme === 'dark' ? '#333' : '#dadce0'
  const inputBorderFocus = theme === 'dark' ? '#555' : '#4285f4'
  const dropdownBg = theme === 'dark' ? '#252525' : '#ffffff'
  const dropdownHoverBg = theme === 'dark' ? '#3e3e42' : '#f8f9fa'

  if (!node) {
    return null
  }

  return (
    <div
      style={{
        background: bgColor,
        border: `1px solid ${borderColor}`,
        borderRadius: '8px',
        padding: '16px',
        minWidth: '300px',
        boxShadow: theme === 'dark' ? '0 4px 12px rgba(0, 0, 0, 0.3)' : '0 4px 12px rgba(0, 0, 0, 0.1)',
        zIndex: 1000,
      }}
    >
      <div style={{ marginBottom: '12px', fontSize: '12px', color: theme === 'dark' ? '#858585' : '#5f6368' }}>
        编辑节点属性
      </div>

      {/* Category Dropdown */}
      <div style={{ marginBottom: '12px' }}>
        <label
          style={{
            display: 'block',
            fontSize: '12px',
            color: theme === 'dark' ? '#858585' : '#5f6368',
            marginBottom: '4px',
          }}
        >
          类别 (Category)
        </label>
        <div style={{ position: 'relative' }} ref={dropdownRef}>
          <button
            type="button"
            onClick={() => setIsDropdownOpen(!isDropdownOpen)}
            style={{
              width: '100%',
              padding: '8px 12px',
              background: inputBg,
              border: `1px solid ${inputBorder}`,
              borderRadius: '4px',
              color: textColor,
              fontSize: '14px',
              cursor: 'pointer',
              textAlign: 'left',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
            onFocus={(e) => {
              e.currentTarget.style.borderColor = inputBorderFocus
            }}
            onBlur={(e) => {
              e.currentTarget.style.borderColor = inputBorder
            }}
          >
            <span>{category ? category : '选择类别'}</span>
            <span style={{ fontSize: '12px' }}>{isDropdownOpen ? '▲' : '▼'}</span>
          </button>
          {isDropdownOpen && (
            <div
              style={{
                position: 'absolute',
                top: '100%',
                left: 0,
                right: 0,
                marginTop: '4px',
                background: dropdownBg,
                border: `1px solid ${borderColor}`,
                borderRadius: '4px',
                boxShadow: theme === 'dark' ? '0 4px 12px rgba(0, 0, 0, 0.3)' : '0 4px 12px rgba(0, 0, 0, 0.1)',
                zIndex: 1001,
                maxHeight: '200px',
                overflowY: 'auto',
              }}
            >
              {CATEGORIES.map((cat) => (
                <div
                  key={cat}
                  onClick={() => handleCategoryChange(cat)}
                  style={{
                    padding: '8px 12px',
                    cursor: 'pointer',
                    color: textColor,
                    fontSize: '14px',
                    backgroundColor: category === cat ? dropdownHoverBg : 'transparent',
                  }}
                  onMouseEnter={(e) => {
                    if (category !== cat) {
                      e.currentTarget.style.backgroundColor = dropdownHoverBg
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (category !== cat) {
                      e.currentTarget.style.backgroundColor = 'transparent'
                    }
                  }}
                >
                  {cat}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Element Name Input */}
      <div>
        <label
          style={{
            display: 'block',
            fontSize: '12px',
            color: theme === 'dark' ? '#858585' : '#5f6368',
            marginBottom: '4px',
          }}
        >
          元素名称 (Element Name)
        </label>
        <input
          type="text"
          value={elementName}
          onChange={(e) => handleElementNameChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="输入元素名称"
          style={{
            width: '100%',
            padding: '8px 12px',
            background: inputBg,
            border: `1px solid ${inputBorder}`,
            borderRadius: '4px',
            color: textColor,
            fontSize: '14px',
            outline: 'none',
          }}
          onFocus={(e) => {
            e.currentTarget.style.borderColor = inputBorderFocus
          }}
          onBlur={(e) => {
            e.currentTarget.style.borderColor = inputBorder
            handleElementNameBlur()
          }}
        />
      </div>

      {/* Close button */}
      <div style={{ marginTop: '12px', textAlign: 'right' }}>
        <button
          type="button"
          onClick={onClose}
          style={{
            padding: '6px 12px',
            background: 'transparent',
            border: `1px solid ${borderColor}`,
            borderRadius: '4px',
            color: textColor,
            fontSize: '12px',
            cursor: 'pointer',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = dropdownHoverBg
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = 'transparent'
          }}
        >
          关闭
        </button>
      </div>
    </div>
  )
}
