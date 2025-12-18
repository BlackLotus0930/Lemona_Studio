import { Document, AIChatMessage } from '../../../shared/types.js'
import { documentService } from './document.js'
import fs from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const backendRoot = path.resolve(__dirname, '../..')
const DOCUMENTS_DIR = path.join(backendRoot, 'data', 'documents')

function getDocumentPath(id: string): string {
  return path.join(DOCUMENTS_DIR, `${id}.json`)
}

export const chatHistoryService = {
  /**
   * Get all chat history for a document
   */
  async getChatHistory(documentId: string): Promise<{ [chatId: string]: AIChatMessage[] }> {
    const document = await documentService.getById(documentId)
    if (!document) {
      throw new Error('Document not found')
    }
    return document.chatHistory || {}
  },

  /**
   * Get messages for a specific chat thread
   */
  async getChatMessages(documentId: string, chatId: string): Promise<AIChatMessage[]> {
    const chatHistory = await this.getChatHistory(documentId)
    return chatHistory[chatId] || []
  },

  /**
   * Add a new message to a chat thread
   */
  async addMessage(documentId: string, chatId: string, message: AIChatMessage): Promise<void> {
    const document = await documentService.getById(documentId)
    if (!document) {
      throw new Error('Document not found')
    }

    // Initialize chatHistory if it doesn't exist
    if (!document.chatHistory) {
      document.chatHistory = {}
    }

    // Initialize chat thread if it doesn't exist
    if (!document.chatHistory[chatId]) {
      document.chatHistory[chatId] = []
    }

    // Add the message
    document.chatHistory[chatId].push(message)

    // Update the document
    await this.saveChatHistory(documentId, document.chatHistory)
  },

  /**
   * Update an existing message (useful for streaming updates)
   */
  async updateMessage(
    documentId: string,
    chatId: string,
    messageId: string,
    content: string
  ): Promise<void> {
    const document = await documentService.getById(documentId)
    if (!document) {
      throw new Error('Document not found')
    }

    if (!document.chatHistory || !document.chatHistory[chatId]) {
      throw new Error('Chat thread not found')
    }

    const messages = document.chatHistory[chatId]
    const messageIndex = messages.findIndex(msg => msg.id === messageId)

    if (messageIndex === -1) {
      throw new Error('Message not found')
    }

    // Update the message content
    messages[messageIndex].content = content
    messages[messageIndex].timestamp = new Date().toISOString()

    // Save the updated chat history
    await this.saveChatHistory(documentId, document.chatHistory)
  },

  /**
   * Delete a chat thread
   */
  async deleteChat(documentId: string, chatId: string): Promise<void> {
    const document = await documentService.getById(documentId)
    if (!document) {
      throw new Error('Document not found')
    }

    if (!document.chatHistory || !document.chatHistory[chatId]) {
      // Chat doesn't exist, nothing to delete
      return
    }

    // Delete the chat thread
    delete document.chatHistory[chatId]

    // Save the updated chat history
    await this.saveChatHistory(documentId, document.chatHistory)
  },

  /**
   * Save chat history to document (internal helper)
   */
  async saveChatHistory(
    documentId: string,
    chatHistory: { [chatId: string]: AIChatMessage[] }
  ): Promise<void> {
    const document = await documentService.getById(documentId)
    if (!document) {
      throw new Error('Document not found')
    }

    // Update the document with new chat history
    document.chatHistory = chatHistory
    document.updatedAt = new Date().toISOString()

    // Save the document - write the full document to preserve all fields
    const filePath = getDocumentPath(documentId)
    await fs.writeFile(filePath, JSON.stringify(document, null, 2))
  },
}

