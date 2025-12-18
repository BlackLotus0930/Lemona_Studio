import { useState } from 'react'
import { aiApi } from '../../services/api'

interface ReasoningModeProps {
  documentContent?: string
  documentId?: string
}

export default function ReasoningMode({ documentContent, documentId }: ReasoningModeProps) {
  const [prompt, setPrompt] = useState('')
  const [reasoning, setReasoning] = useState<string[]>([])
  const [isLoading, setIsLoading] = useState(false)

  const handleReason = async () => {
    if (!prompt.trim() || isLoading) return

    setIsLoading(true)
    setReasoning([])

    try {
      const reasoningPrompt = `Please provide step-by-step reasoning for the following request. Break down your thinking process clearly:\n\n${prompt}\n\nReasoning:`
      
      const response = await aiApi.streamChat(reasoningPrompt, documentContent, documentId)
      const reader = response.body?.getReader()
      const decoder = new TextDecoder()

      if (reader) {
        let currentStep = ''
        const steps: string[] = []

        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          const chunk = decoder.decode(value)
          const lines = chunk.split('\n')

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const data = JSON.parse(line.slice(6))
                if (data.chunk) {
                  currentStep += data.chunk
                  
                  // Try to detect step boundaries (numbered steps, new paragraphs, etc.)
                  if (currentStep.includes('\n\n') || currentStep.match(/^\d+\./)) {
                    const parts = currentStep.split(/\n\n/)
                    if (parts.length > 1) {
                      steps.push(...parts.slice(0, -1))
                      currentStep = parts[parts.length - 1]
                    }
                  }
                  
                  setReasoning([...steps, currentStep])
                }
              } catch (e) {
                // Ignore parse errors
              }
            }
          }
        }

        if (currentStep.trim()) {
          setReasoning([...steps, currentStep])
        }
      }
    } catch (error) {
      console.error('Reasoning error:', error)
      setReasoning(['Error: Failed to generate reasoning. Please try again.'])
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
      <h3 style={{ marginBottom: '8px', fontSize: '15px', fontWeight: 600, color: '#cccccc' }}>
        Reasoning Mode
      </h3>
      <p style={{ 
        marginBottom: '16px', 
        fontSize: '13px', 
        color: '#858585',
        lineHeight: '1.5'
      }}>
        Ask the AI to think through a problem step-by-step. The reasoning process will be displayed here without modifying your document.
      </p>

      <div style={{ marginBottom: '16px' }}>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="What would you like the AI to reason about?"
          rows={4}
          style={{
            width: '100%',
            padding: '12px',
            border: '1px solid #3e3e42',
            borderRadius: '6px',
            fontSize: '13px',
            fontFamily: 'inherit',
            resize: 'vertical',
            backgroundColor: '#252526',
            color: '#cccccc',
            outline: 'none'
          }}
        />
        <button
          onClick={handleReason}
          disabled={isLoading || !prompt.trim()}
          style={{
            marginTop: '12px',
            padding: '10px 24px',
            backgroundColor: '#0e639c',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            cursor: isLoading || !prompt.trim() ? 'not-allowed' : 'pointer',
            opacity: isLoading || !prompt.trim() ? 0.5 : 1,
            fontSize: '13px',
            transition: 'background-color 0.15s'
          }}
          onMouseEnter={(e) => !isLoading && prompt.trim() && (e.currentTarget.style.backgroundColor = '#1177bb')}
          onMouseLeave={(e) => !isLoading && prompt.trim() && (e.currentTarget.style.backgroundColor = '#0e639c')}
        >
          {isLoading ? 'Reasoning...' : 'Start Reasoning'}
        </button>
      </div>

      <div style={{
        flex: 1,
        overflowY: 'auto',
        padding: '16px',
        backgroundColor: '#252526',
        borderRadius: '6px',
        border: '1px solid #3e3e42'
      }}>
        {reasoning.length === 0 && !isLoading && (
          <div style={{
            textAlign: 'center',
            color: '#6a6a6a',
            padding: '40px 20px',
            fontSize: '13px'
          }}>
            Enter a prompt above to see step-by-step reasoning
          </div>
        )}
        {reasoning.map((step, index) => (
          <div
            key={index}
            style={{
              marginBottom: '16px',
              padding: '12px',
              backgroundColor: '#1e1e1e',
              borderRadius: '6px',
              borderLeft: '3px solid #0e639c'
            }}
          >
            <div style={{
              fontWeight: 600,
              marginBottom: '4px',
              color: '#4fc3f7',
              fontSize: '13px'
            }}>
              Step {index + 1}
            </div>
            <div style={{
              color: '#cccccc',
              whiteSpace: 'pre-wrap',
              lineHeight: '1.6',
              fontSize: '13px'
            }}>
              {step}
            </div>
          </div>
        ))}
        {isLoading && reasoning.length === 0 && (
          <div style={{
            textAlign: 'center',
            color: '#858585',
            padding: '20px',
            fontStyle: 'italic',
            fontSize: '13px'
          }}>
            Thinking...
          </div>
        )}
      </div>
    </div>
  )
}

