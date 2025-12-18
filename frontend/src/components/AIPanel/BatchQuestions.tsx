import { useState } from 'react'
import { AIQuestion } from '@shared/types'
import { aiApi } from '../../services/api'

interface BatchQuestionsProps {
  documentContent?: string
  documentId?: string
}

export default function BatchQuestions({ documentContent, documentId }: BatchQuestionsProps) {
  const [questions, setQuestions] = useState<string[]>([''])
  const [answers, setAnswers] = useState<AIQuestion[]>([])
  const [isLoading, setIsLoading] = useState(false)

  const handleAddQuestion = () => {
    setQuestions([...questions, ''])
  }

  const handleQuestionChange = (index: number, value: string) => {
    const updated = [...questions]
    updated[index] = value
    setQuestions(updated)
  }

  const handleRemoveQuestion = (index: number) => {
    const updated = questions.filter((_, i) => i !== index)
    setQuestions(updated.length > 0 ? updated : [''])
  }

  const handleSubmit = async () => {
    const validQuestions = questions.filter(q => q.trim())
    if (validQuestions.length === 0) return

    setIsLoading(true)
    try {
      // IPC returns data directly, not wrapped in { data: ... }
      const answers = await aiApi.batchQuestions(validQuestions, documentContent, documentId)
      setAnswers(answers)
    } catch (error) {
      console.error('Batch questions error:', error)
      alert('Failed to process questions. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div style={{
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      padding: '16px',
      overflow: 'hidden',
      backgroundColor: '#1e1e1e'
    }}>
      <h3 style={{ marginBottom: '12px', fontSize: '15px', fontWeight: 600, color: '#cccccc' }}>
        Batch Questions
      </h3>
      <p style={{ 
        marginBottom: '16px', 
        fontSize: '13px', 
        color: '#858585',
        lineHeight: '1.5'
      }}>
        Enter multiple questions at once. The AI will process them all and provide answers.
      </p>
      
      <div style={{
        flex: 1,
        overflowY: 'auto',
        marginBottom: '16px',
        display: 'flex',
        flexDirection: 'column',
        gap: '12px'
      }}>
        {questions.map((question, index) => (
          <div key={index} style={{ display: 'flex', gap: '8px' }}>
            <input
              type="text"
              value={question}
              onChange={(e) => handleQuestionChange(index, e.target.value)}
              placeholder={`Question ${index + 1}`}
              style={{
                flex: 1,
                padding: '10px',
                border: '1px solid #3e3e42',
                borderRadius: '4px',
                fontSize: '13px',
                backgroundColor: '#252526',
                color: '#cccccc',
                outline: 'none'
              }}
            />
            {questions.length > 1 && (
              <button
                onClick={() => handleRemoveQuestion(index)}
                style={{
                  padding: '10px 16px',
                  backgroundColor: '#a1260d',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '13px',
                  transition: 'background-color 0.15s'
                }}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#c72e1a'}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#a1260d'}
              >
                Remove
              </button>
            )}
          </div>
        ))}
        
        <button
          onClick={handleAddQuestion}
          style={{
            padding: '10px',
            border: '1px dashed #3e3e42',
            borderRadius: '4px',
            backgroundColor: 'transparent',
            cursor: 'pointer',
            color: '#858585',
            fontSize: '13px',
            transition: 'border-color 0.15s'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = '#6a6a6a'
            e.currentTarget.style.color = '#cccccc'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = '#3e3e42'
            e.currentTarget.style.color = '#858585'
          }}
        >
          + Add Question
        </button>

        {answers.length > 0 && (
          <div style={{ marginTop: '24px' }}>
            <h4 style={{ marginBottom: '12px', fontSize: '14px', fontWeight: 600, color: '#cccccc' }}>
              Answers:
            </h4>
            {answers.map((answer) => (
              <div
                key={answer.id}
                style={{
                  marginBottom: '16px',
                  padding: '12px',
                  backgroundColor: '#252526',
                  borderRadius: '6px',
                  border: '1px solid #3e3e42'
                }}
              >
                <div style={{
                  fontWeight: 600,
                  marginBottom: '8px',
                  color: '#cccccc',
                  fontSize: '13px'
                }}>
                  Q: {answer.question}
                </div>
                <div style={{
                  color: '#858585',
                  whiteSpace: 'pre-wrap',
                  lineHeight: '1.6',
                  fontSize: '13px'
                }}>
                  A: {answer.answer || 'Processing...'}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <button
        onClick={handleSubmit}
        disabled={isLoading || questions.every(q => !q.trim())}
        style={{
          padding: '12px 24px',
          backgroundColor: '#0e639c',
          color: 'white',
          border: 'none',
          borderRadius: '6px',
          cursor: isLoading || questions.every(q => !q.trim()) ? 'not-allowed' : 'pointer',
          opacity: isLoading || questions.every(q => !q.trim()) ? 0.5 : 1,
          fontSize: '13px',
          fontWeight: 500,
          transition: 'background-color 0.15s'
        }}
        onMouseEnter={(e) => !isLoading && !questions.every(q => !q.trim()) && (e.currentTarget.style.backgroundColor = '#1177bb')}
        onMouseLeave={(e) => !isLoading && !questions.every(q => !q.trim()) && (e.currentTarget.style.backgroundColor = '#0e639c')}
      >
        {isLoading ? 'Processing...' : 'Submit All Questions'}
      </button>
    </div>
  )
}

