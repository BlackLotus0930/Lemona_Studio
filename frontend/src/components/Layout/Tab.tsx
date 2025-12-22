import { useState } from 'react'
import { useTheme } from '../../contexts/ThemeContext'
// @ts-ignore
import CloseIcon from '@mui/icons-material/Close'

interface TabProps {
  documentId: string
  title: string
  isActive: boolean
  onClick: () => void
  onClose: (e: React.MouseEvent) => void
  isFirst?: boolean
  isLast?: boolean
  canClose?: boolean // Whether this tab can be closed (false if it's the only tab)
}

export default function Tab({ title, isActive, onClick, onClose, isLast = false, canClose = true }: TabProps) {
  const { theme } = useTheme()
  const [isHovered, setIsHovered] = useState(false)

  const tabBg = isActive 
    ? (theme === 'dark' ? '#1e1e1e' : '#ffffff')
    : (theme === 'dark' ? '#141414' : '#f5f5f5')
  const tabTextColor = isActive
    ? (theme === 'dark' ? '#D6D6DD' : '#202124')
    : (theme === 'dark' ? '#858585' : '#5f6368')
  // Hover color same as selection color
  const tabHoverBg = theme === 'dark' ? '#1e1e1e' : '#ffffff'
  const separatorColor = '#1E1E1E' // Fixed color for separator lines
  const showCloseButton = canClose && (isActive || isHovered)

  return (
    <div
      onClick={onClick}
      onMouseEnter={(e) => {
        setIsHovered(true)
        if (!isActive) {
          e.currentTarget.style.backgroundColor = tabHoverBg
        }
      }}
      onMouseLeave={(e) => {
        setIsHovered(false)
        if (!isActive) {
          e.currentTarget.style.backgroundColor = tabBg
        }
      }}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        padding: '0 12px 0 18px', // Left padding slightly reduced
        height: '36px', // Match topbar height exactly
        backgroundColor: tabBg,
        color: tabTextColor,
        cursor: 'pointer',
        borderTop: 'none', // Remove blue indicator
        borderLeft: 'none', // Remove left border - will use pseudo-element for shorter separator
        borderRight: 'none', // Remove right border - will use pseudo-element for shorter separator
        borderBottom: 'none',
        fontSize: '13px',
        fontFamily: "'Noto Sans SC', 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
        minWidth: '120px',
        maxWidth: '240px',
        position: 'relative',
        transition: 'background-color 0.15s',
        userSelect: 'none',
        ...({ WebkitAppRegion: 'no-drag' } as any)
      }}
    >
      {/* Tab Title */}
      <span style={{
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
        flex: 1,
        minWidth: 0
      }}>
        {title}
      </span>
      
      {/* Close Button - always reserve space, but only visible when active or hovered */}
      <button
        onClick={(e) => {
          if (showCloseButton) {
            e.stopPropagation()
            onClose(e)
          }
        }}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '18px',
          height: '18px',
          border: 'none',
          backgroundColor: 'transparent',
          color: tabTextColor,
          cursor: showCloseButton ? 'pointer' : 'default',
          borderRadius: '2px',
          padding: 0,
          marginLeft: '2px', // Move button slightly to the right
          flexShrink: 0,
          opacity: showCloseButton ? 0.7 : 0, // Hide but reserve space
          pointerEvents: showCloseButton ? 'auto' : 'none', // Prevent clicks when hidden
          transition: 'opacity 0.15s, background-color 0.15s'
        }}
        onMouseEnter={(e) => {
          if (showCloseButton) {
            e.currentTarget.style.opacity = '1'
            e.currentTarget.style.backgroundColor = theme === 'dark' ? '#2d2d2d' : '#e8e8e8' // Less bright hover color
          }
        }}
        onMouseLeave={(e) => {
          if (showCloseButton) {
            e.currentTarget.style.opacity = '0.7'
            e.currentTarget.style.backgroundColor = 'transparent'
          }
        }}
      >
        <CloseIcon style={{ fontSize: '14px' }} />
      </button>
      
      {/* Right separator line - height 20px (not shown for last tab) */}
      {!isLast && (
        <div style={{
          position: 'absolute',
          right: 0,
          top: '50%',
          transform: 'translateY(-50%)',
          height: '20px',
          width: '1px',
          backgroundColor: separatorColor
        }} />
      )}
    </div>
  )
}

