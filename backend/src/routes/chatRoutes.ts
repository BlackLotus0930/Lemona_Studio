import express from 'express'
import { AIChatMessage } from '../../../shared/types.js'
import { chatHistoryService } from '../services/chatHistory.js'

const router = express.Router()

// Get all chat history for a document
router.get('/:documentId', async (req, res) => {
  try {
    const { documentId } = req.params
    const chatHistory = await chatHistoryService.getChatHistory(documentId)
    res.json(chatHistory)
  } catch (error) {
    console.error('Error getting chat history:', error)
    if (error instanceof Error && error.message === 'Document not found') {
      return res.status(404).json({ error: 'Document not found' })
    }
    res.status(500).json({ error: 'Failed to get chat history' })
  }
})

// Get messages for a specific chat thread
router.get('/:documentId/:chatId', async (req, res) => {
  try {
    const { documentId, chatId } = req.params
    const messages = await chatHistoryService.getChatMessages(documentId, chatId)
    res.json(messages)
  } catch (error) {
    console.error('Error getting chat messages:', error)
    if (error instanceof Error && error.message === 'Document not found') {
      return res.status(404).json({ error: 'Document not found' })
    }
    res.status(500).json({ error: 'Failed to get chat messages' })
  }
})

// Add a new message to a chat thread
router.post('/:documentId/:chatId', async (req, res) => {
  try {
    const { documentId, chatId } = req.params
    const message: AIChatMessage = req.body

    // Validate message structure
    if (!message.id || !message.role || !message.content || !message.timestamp) {
      return res.status(400).json({ error: 'Invalid message format' })
    }

    await chatHistoryService.addMessage(documentId, chatId, message)
    res.json({ success: true })
  } catch (error) {
    console.error('Error adding message:', error)
    if (error instanceof Error && error.message === 'Document not found') {
      return res.status(404).json({ error: 'Document not found' })
    }
    res.status(500).json({ error: 'Failed to add message' })
  }
})

// Update an existing message (for streaming updates)
router.put('/:documentId/:chatId/:messageId', async (req, res) => {
  try {
    const { documentId, chatId, messageId } = req.params
    const { content } = req.body

    if (!content || typeof content !== 'string') {
      return res.status(400).json({ error: 'Content is required' })
    }

    await chatHistoryService.updateMessage(documentId, chatId, messageId, content)
    res.json({ success: true })
  } catch (error) {
    console.error('Error updating message:', error)
    if (error instanceof Error) {
      if (error.message === 'Document not found') {
        return res.status(404).json({ error: 'Document not found' })
      }
      if (error.message === 'Chat thread not found') {
        return res.status(404).json({ error: 'Chat thread not found' })
      }
      if (error.message === 'Message not found') {
        return res.status(404).json({ error: 'Message not found' })
      }
    }
    res.status(500).json({ error: 'Failed to update message' })
  }
})

// Delete a chat thread
router.delete('/:documentId/:chatId', async (req, res) => {
  try {
    const { documentId, chatId } = req.params
    await chatHistoryService.deleteChat(documentId, chatId)
    res.json({ success: true })
  } catch (error) {
    console.error('Error deleting chat:', error)
    if (error instanceof Error && error.message === 'Document not found') {
      return res.status(404).json({ error: 'Document not found' })
    }
    res.status(500).json({ error: 'Failed to delete chat' })
  }
})

export default router

