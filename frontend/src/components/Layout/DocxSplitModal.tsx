import { useState, useEffect } from 'react'
import { useTheme } from '../../contexts/ThemeContext'
import { Document } from '@shared/types'
// @ts-ignore
import CheckBoxIcon from '@mui/icons-material/CheckBox'
// @ts-ignore
import CheckBoxOutlineBlankIcon from '@mui/icons-material/CheckBoxOutlineBlank'

interface Chapter {
  title: string
  content: string
  startIndex: number
  endIndex: number
  level: number
}

interface StructuralBoundary {
  index: number
  text: string
  signals: string[]
  confidence: number
}

interface DocxSplitModalProps {
  fileName: string
  chapters: Chapter[]
  isOpen: boolean
  onClose: () => void
  onConfirm: (split: boolean) => Promise<void>
}

function DocxSplitModal({
  fileName,
  chapters,
  isOpen,
  onClose,
  onConfirm,
}: DocxSplitModalProps) {
  const { theme } = useTheme()
  const [split, setSplit] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setSplit(false)
      setIsProcessing(false)
    }
  }, [isOpen])

  const handleConfirm = async () => {
    setIsProcessing(true)
    try {
      await onConfirm(split)
      onClose()
    } catch (error) {
      alert('导入失败，请重试')
    } finally {
      setIsProcessing(false)
    }
  }

  if (!isOpen) return null

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: theme === 'dark' ? 'rgba(0, 0, 0, 0.8)' : 'rgba(0, 0, 0, 0.6)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 10000,
        backdropFilter: 'blur(4px)',
      }}
      onClick={onClose}
    >
      <div
        style={{
          backgroundColor: theme === 'dark' ? '#1e1e1e' : '#ffffff',
          borderRadius: '12px',
          padding: '24px',
          minWidth: '500px',
          maxWidth: '700px',
          maxHeight: '80vh',
          boxShadow: theme === 'dark'
            ? '0 8px 32px rgba(0, 0, 0, 0.5), 0 2px 8px rgba(0, 0, 0, 0.3)'
            : '0 8px 32px rgba(0, 0, 0, 0.2), 0 2px 8px rgba(0, 0, 0, 0.1)',
          border: `1px solid ${theme === 'dark' ? '#333' : '#e0e0e0'}`,
          fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ marginBottom: '20px' }}>
          <h2
            style={{
              fontSize: '20px',
              fontWeight: 600,
              color: theme === 'dark' ? '#ffffff' : '#202124',
              margin: 0,
              marginBottom: '8px',
            }}
          >
            DOCX 导入确认
          </h2>
          <p
            style={{
              fontSize: '14px',
              color: theme === 'dark' ? '#b0b0b0' : '#666',
              margin: 0,
            }}
          >
            {fileName}
          </p>
        </div>

        {/* Chapters List */}
        {chapters.length > 0 ? (
          <div
            style={{
              flex: 1,
              overflowY: 'auto',
              marginBottom: '20px',
              padding: '12px',
              backgroundColor: theme === 'dark' ? '#161616' : '#f5f5f5',
              borderRadius: '8px',
              maxHeight: '400px',
            }}
          >
            <div
              style={{
                fontSize: '13px',
                color: theme === 'dark' ? '#b0b0b0' : '#666',
                marginBottom: '12px',
                fontWeight: 500,
              }}
            >
              检测到 {chapters.length} 个章节：
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {chapters.map((chapter, index) => {
                // Check if chapter has boundary info (from new detector)
                const chapterWithBoundary = chapter as any
                const confidence = chapterWithBoundary.confidence
                const signals = chapterWithBoundary.signals || []
                
                return (
                  <div
                    key={index}
                    style={{
                      padding: '10px 12px',
                      backgroundColor: theme === 'dark' ? '#252525' : '#ffffff',
                      borderRadius: '6px',
                      border: `1px solid ${theme === 'dark' ? '#333' : '#e0e0e0'}`,
                      fontSize: '13px',
                      color: theme === 'dark' ? '#e0e0e0' : '#202124',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '4px' }}>
                      <div
                        style={{
                          fontWeight: 500,
                          color: theme === 'dark' ? '#ffffff' : '#202124',
                          flex: 1,
                        }}
                      >
                        {chapter.title}
                      </div>
                      {confidence !== undefined && (
                        <div
                          style={{
                            fontSize: '11px',
                            padding: '2px 6px',
                            borderRadius: '4px',
                            backgroundColor: confidence > 0.6 
                              ? theme === 'dark' ? 'rgba(76, 175, 80, 0.2)' : 'rgba(76, 175, 80, 0.1)'
                              : theme === 'dark' ? 'rgba(255, 193, 7, 0.2)' : 'rgba(255, 193, 7, 0.1)',
                            color: confidence > 0.6 
                              ? theme === 'dark' ? '#81c784' : '#4caf50'
                              : theme === 'dark' ? '#ffb74d' : '#ff9800',
                            marginLeft: '8px',
                          }}
                        >
                          {(confidence * 100).toFixed(0)}%
                        </div>
                      )}
                    </div>
                    {signals.length > 0 && (
                      <div
                        style={{
                          fontSize: '11px',
                          color: theme === 'dark' ? '#999' : '#666',
                          marginBottom: '4px',
                          display: 'flex',
                          flexWrap: 'wrap',
                          gap: '4px',
                        }}
                      >
                        {signals.slice(0, 5).map((signal: string, i: number) => (
                          <span
                            key={i}
                            style={{
                              padding: '1px 4px',
                              borderRadius: '3px',
                              backgroundColor: theme === 'dark' ? '#333' : '#f0f0f0',
                              fontSize: '10px',
                            }}
                          >
                            {signal}
                          </span>
                        ))}
                      </div>
                    )}
                    <div
                      style={{
                        fontSize: '12px',
                        color: theme === 'dark' ? '#999' : '#666',
                      }}
                    >
                      {chapter.content.substring(0, 100)}
                      {chapter.content.length > 100 ? '...' : ''}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        ) : (
          <div
            style={{
              padding: '20px',
              backgroundColor: theme === 'dark' ? '#161616' : '#f5f5f5',
              borderRadius: '8px',
              marginBottom: '20px',
              textAlign: 'center',
              color: theme === 'dark' ? '#b0b0b0' : '#666',
              fontSize: '14px',
            }}
          >
            未检测到章节结构，将作为单个文件导入
          </div>
        )}

        {/* Split Option */}
        {chapters.length > 0 && (
          <div
            style={{
              marginBottom: '20px',
              padding: '16px',
              backgroundColor: theme === 'dark' ? '#161616' : '#f9f9f9',
              borderRadius: '8px',
              border: `1px solid ${theme === 'dark' ? '#333' : '#e0e0e0'}`,
            }}
          >
            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                cursor: 'pointer',
                userSelect: 'none',
              }}
              onClick={() => setSplit(!split)}
            >
              {split ? (
                <CheckBoxIcon
                  style={{
                    color: theme === 'dark' ? '#f472b6' : '#d946ef',
                    marginRight: '12px',
                    fontSize: '24px',
                  }}
                />
              ) : (
                <CheckBoxOutlineBlankIcon
                  style={{
                    color: theme === 'dark' ? '#666' : '#999',
                    marginRight: '12px',
                    fontSize: '24px',
                  }}
                />
              )}
              <div>
                <div
                  style={{
                    fontSize: '14px',
                    fontWeight: 500,
                    color: theme === 'dark' ? '#ffffff' : '#202124',
                    marginBottom: '4px',
                  }}
                >
                  拆分章节
                </div>
                <div
                  style={{
                    fontSize: '12px',
                    color: theme === 'dark' ? '#b0b0b0' : '#666',
                  }}
                >
                  {split
                    ? `将创建 ${chapters.length} 个文件到工作区，原文件保存到库中`
                    : '将作为单个文件导入到工作区'}
                </div>
              </div>
            </label>
          </div>
        )}

        {/* Actions */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            gap: '12px',
          }}
        >
          <button
            onClick={onClose}
            disabled={isProcessing}
            style={{
              padding: '10px 20px',
              fontSize: '14px',
              fontWeight: 500,
              color: theme === 'dark' ? '#e0e0e0' : '#666',
              backgroundColor: 'transparent',
              border: `1px solid ${theme === 'dark' ? '#333' : '#e0e0e0'}`,
              borderRadius: '6px',
              cursor: isProcessing ? 'not-allowed' : 'pointer',
              opacity: isProcessing ? 0.5 : 1,
              transition: 'all 0.2s',
            }}
            onMouseEnter={(e) => {
              if (!isProcessing) {
                e.currentTarget.style.backgroundColor = theme === 'dark' ? '#252525' : '#f5f5f5'
              }
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent'
            }}
          >
            取消
          </button>
          <button
            onClick={handleConfirm}
            disabled={isProcessing}
            style={{
              padding: '10px 20px',
              fontSize: '14px',
              fontWeight: 500,
              color: '#ffffff',
              backgroundColor: isProcessing
                ? theme === 'dark' ? '#555' : '#999'
                : theme === 'dark'
                ? '#f472b6'
                : '#d946ef',
              border: 'none',
              borderRadius: '6px',
              cursor: isProcessing ? 'not-allowed' : 'pointer',
              transition: 'all 0.2s',
            }}
            onMouseEnter={(e) => {
              if (!isProcessing) {
                e.currentTarget.style.opacity = '0.9'
              }
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.opacity = '1'
            }}
          >
            {isProcessing ? '处理中...' : '确认导入'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default DocxSplitModal