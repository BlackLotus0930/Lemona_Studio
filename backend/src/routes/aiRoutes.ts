import express from 'express'
import { geminiService } from '../services/gemini.js'

const router = express.Router()

// Chat endpoint
router.post('/chat', async (req, res) => {
  try {
    const { message, documentContent } = req.body
    const response = await geminiService.chat(message, documentContent)
    res.json(response)
  } catch (error) {
    console.error('Chat error:', error)
    res.status(500).json({ error: 'Failed to process chat message' })
  }
})

// Streaming chat endpoint
router.post('/chat/stream', async (req, res) => {
  try {
    const { message, documentContent } = req.body
    
    // Validate input
    if (!message || typeof message !== 'string') {
      return res.status(400).json({ error: 'Message is required' })
    }
    
    // Set headers before starting stream
    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('Connection', 'keep-alive')
    res.setHeader('X-Accel-Buffering', 'no') // Disable buffering for nginx

    try {
      const stream = geminiService.streamChat(message, documentContent)
      
      for await (const chunk of stream) {
        res.write(`data: ${JSON.stringify({ chunk })}\n\n`)
      }
      
      res.write('data: [DONE]\n\n')
      res.end()
    } catch (streamError: any) {
      console.error('Stream error:', streamError)
      // If headers are already sent, we can't send JSON, so send error as SSE
      if (!res.headersSent) {
        res.status(500).json({ error: 'Failed to stream response', details: streamError.message })
      } else {
        res.write(`data: ${JSON.stringify({ error: 'Stream error', details: streamError.message })}\n\n`)
        res.end()
      }
    }
  } catch (error: any) {
    console.error('Stream endpoint error:', error)
    // Only send JSON error if headers haven't been sent yet
    if (!res.headersSent) {
      res.status(500).json({ error: 'Failed to process stream request', details: error.message })
    }
  }
})

// Batch questions endpoint
router.post('/batch-questions', async (req, res) => {
  try {
    const { questions, documentContent } = req.body
    const responses = await geminiService.batchQuestions(questions, documentContent)
    res.json(responses)
  } catch (error) {
    console.error('Batch questions error:', error)
    res.status(500).json({ error: 'Failed to process batch questions' })
  }
})

// Autocomplete endpoint
router.post('/autocomplete', async (req, res) => {
  try {
    const { text, cursorPosition, documentContent } = req.body
    const suggestion = await geminiService.autocomplete(
      text, 
      cursorPosition, 
      documentContent
    )
    res.json(suggestion)
  } catch (error) {
    console.error('Autocomplete error:', error)
    res.status(500).json({ error: 'Failed to generate autocomplete' })
  }
})

export default router

