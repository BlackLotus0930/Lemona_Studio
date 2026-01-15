import React, { useState, useEffect, useRef } from 'react'
import { useTheme } from '../../contexts/ThemeContext'
import type { Node } from '@xyflow/react'

interface NodePropertyEditorProps {
  nodeId: string
  node: Node | undefined
  onUpdate: (updates: { category?: string; elementName?: string }) => void
  onClose: () => void
}

const CATEGORIES = ['concept', 'event', 'character', 'custom']

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

  // Get category icon
  const getCategoryIcon = (cat: string): string => {
    const icons: Record<string, string> = {
      concept: '💡',
      event: '⚡',
      character: '👤',
      custom: '⭐',
    }
    return icons[cat.toLowerCase()] || '●'
  }

  // Get category colors for styling
  const getCategoryColor = (cat: string): { primary: string; badgeBg: string } => {
    const categoryKey = cat.charAt(0).toUpperCase() + cat.slice(1).toLowerCase()
    const colors: Record<string, { dark: any; light: any }> = {
      Character: {
        dark: { primary: '#5BA3FF', badgeBg: 'rgba(91, 163, 255, 0.15)' },
        light: { primary: '#1976D2', badgeBg: 'rgba(25, 118, 210, 0.1)' },
      },
      Event: {
        dark: { primary: '#FF6B9D', badgeBg: 'rgba(255, 107, 157, 0.15)' },
        light: { primary: '#D32F2F', badgeBg: 'rgba(211, 47, 47, 0.1)' },
      },
      Concept: {
        dark: { primary: '#9C88FF', badgeBg: 'rgba(156, 136, 255, 0.15)' },
        light: { primary: '#6A4C93', badgeBg: 'rgba(106, 76, 147, 0.1)' },
      },
      Custom: {
        dark: { primary: '#FFB84D', badgeBg: 'rgba(255, 184, 77, 0.15)' },
        light: { primary: '#F57C00', badgeBg: 'rgba(245, 124, 0, 0.1)' },
      },
    }
    const catColors = colors[categoryKey] || colors[cat] || {
      dark: { primary: '#858585', badgeBg: 'rgba(133, 133, 133, 0.1)' },
      light: { primary: '#5F6368', badgeBg: 'rgba(95, 99, 104, 0.08)' },
    }
    return theme === 'dark' ? catColors.dark : catColors.light
  }

  const categoryColors = category ? getCategoryColor(category) : getCategoryColor('')
  const bgColor = theme === 'dark'
    ? 'linear-gradient(135deg, rgba(30, 30, 30, 0.98) 0%, rgba(25, 25, 25, 0.98) 100%)'
    : 'linear-gradient(135deg, rgba(255, 255, 255, 0.98) 0%, rgba(250, 250, 250, 0.98) 100%)'
  const borderColor = theme === 'dark' ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.08)'
  const textColor = theme === 'dark' ? '#E8E8E8' : '#1A1A1A'
  const secondaryTextColor = theme === 'dark' ? '#9E9E9E' : '#6B6B6B'
  const inputBg = theme === 'dark' ? 'rgba(40, 40, 40, 0.6)' : 'rgba(248, 249, 250, 0.8)'
  const inputBorder = theme === 'dark' ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)'
  const inputBorderFocus = categoryColors.primary
  const dropdownBg = theme === 'dark' ? 'rgba(30, 30, 30, 0.98)' : 'rgba(255, 255, 255, 0.98)'
  const dropdownHoverBg = theme === 'dark' ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.05)'

  if (!node) {
    return null
  }

  return (
    <div
      style={{
        background: bgColor,
        border: `1.5px solid ${borderColor}`,
        borderRadius: '16px',
        padding: '24px',
        minWidth: '320px',
        maxWidth: '400px',
        boxShadow: theme === 'dark'
          ? '0 12px 48px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(255, 255, 255, 0.05)'
          : '0 12px 48px rgba(0, 0, 0, 0.12), 0 0 0 1px rgba(0, 0, 0, 0.05)',
        zIndex: 1000,
        backdropFilter: 'blur(20px)',
        fontFamily: "'Inter', 'Noto Sans SC', -apple-system, BlinkMacSystemFont, sans-serif",
        transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
      }}
    >
      <div
        style={{
          marginBottom: '20px',
          fontSize: '13px',
          fontWeight: 600,
          color: secondaryTextColor,
          letterSpacing: '0.3px',
          textTransform: 'uppercase',
        }}
      >
        编辑世界元素
      </div>

      {/* Category Dropdown */}
      <div style={{ marginBottom: '20px' }}>
        <label
          style={{
            display: 'block',
            fontSize: '12px',
            fontWeight: 500,
            color: secondaryTextColor,
            marginBottom: '8px',
            letterSpacing: '0.2px',
          }}
        >
          类别
        </label>
        <div style={{ position: 'relative' }} ref={dropdownRef}>
          <button
            type="button"
            onClick={() => setIsDropdownOpen(!isDropdownOpen)}
            style={{
              width: '100%',
              padding: '12px 16px',
              background: inputBg,
              border: `1.5px solid ${isDropdownOpen ? inputBorderFocus : inputBorder}`,
              borderRadius: '10px',
              color: textColor,
              fontSize: '14px',
              fontWeight: 500,
              cursor: 'pointer',
              textAlign: 'left',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              transition: 'all 0.2s ease',
              backdropFilter: 'blur(10px)',
            }}
            onFocus={(e) => {
              e.currentTarget.style.borderColor = inputBorderFocus
              e.currentTarget.style.boxShadow = `0 0 0 3px ${categoryColors.primary}20`
            }}
            onBlur={(e) => {
              e.currentTarget.style.borderColor = inputBorder
              e.currentTarget.style.boxShadow = 'none'
            }}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              {category && (
                <span
                  style={{
                    fontSize: '14px',
                    lineHeight: '1',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  {getCategoryIcon(category)}
                </span>
              )}
              <span>{category ? category : '选择类别'}</span>
            </span>
            <span style={{ fontSize: '10px', opacity: 0.6 }}>
              {isDropdownOpen ? '▲' : '▼'}
            </span>
          </button>
          {isDropdownOpen && (
            <div
              style={{
                position: 'absolute',
                top: '100%',
                left: 0,
                right: 0,
                marginTop: '8px',
                background: dropdownBg,
                border: `1.5px solid ${borderColor}`,
                borderRadius: '12px',
                boxShadow: theme === 'dark'
                  ? '0 8px 32px rgba(0, 0, 0, 0.4)'
                  : '0 8px 32px rgba(0, 0, 0, 0.15)',
                zIndex: 1001,
                maxHeight: '240px',
                overflowY: 'auto',
                backdropFilter: 'blur(20px)',
                padding: '4px',
              }}
            >
              {CATEGORIES.map((cat) => {
                const catColors = getCategoryColor(cat)
                return (
                  <div
                    key={cat}
                    onClick={() => handleCategoryChange(cat)}
                    style={{
                      padding: '10px 14px',
                      cursor: 'pointer',
                      color: textColor,
                      fontSize: '14px',
                      fontWeight: category === cat ? 600 : 400,
                      backgroundColor: category === cat ? catColors.badgeBg : 'transparent',
                      borderRadius: '8px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px',
                      transition: 'all 0.15s ease',
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
                    <span
                      style={{
                        fontSize: '14px',
                        lineHeight: '1',
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      {getCategoryIcon(cat)}
                    </span>
                    <span>{cat}</span>
                  </div>
                )
              })}
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
            fontWeight: 500,
            color: secondaryTextColor,
            marginBottom: '8px',
            letterSpacing: '0.2px',
          }}
        >
          元素名称
        </label>
        <input
          type="text"
          value={elementName}
          onChange={(e) => handleElementNameChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="输入元素名称..."
          style={{
            width: '100%',
            padding: '12px 16px',
            background: inputBg,
            border: `1.5px solid ${inputBorder}`,
            borderRadius: '10px',
            color: textColor,
            fontSize: '14px',
            fontWeight: 500,
            outline: 'none',
            transition: 'all 0.2s ease',
            backdropFilter: 'blur(10px)',
          }}
          onFocus={(e) => {
            e.currentTarget.style.borderColor = inputBorderFocus
            e.currentTarget.style.boxShadow = `0 0 0 3px ${categoryColors.primary}20`
          }}
          onBlur={(e) => {
            e.currentTarget.style.borderColor = inputBorder
            e.currentTarget.style.boxShadow = 'none'
            handleElementNameBlur()
          }}
        />
      </div>

      {/* Close button */}
      <div style={{ marginTop: '20px', display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
        <button
          type="button"
          onClick={onClose}
          style={{
            padding: '10px 20px',
            background: 'transparent',
            border: `1.5px solid ${borderColor}`,
            borderRadius: '10px',
            color: textColor,
            fontSize: '13px',
            fontWeight: 500,
            cursor: 'pointer',
            transition: 'all 0.2s ease',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = dropdownHoverBg
            e.currentTarget.style.borderColor = inputBorderFocus
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = 'transparent'
            e.currentTarget.style.borderColor = borderColor
          }}
        >
          完成
        </button>
      </div>
    </div>
  )
}
