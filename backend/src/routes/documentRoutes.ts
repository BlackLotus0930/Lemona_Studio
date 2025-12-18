import express from 'express'
import { Document } from '../../../shared/types.js'
import { documentService } from '../services/document.js'

const router = express.Router()

// Get all documents
router.get('/', async (req, res) => {
  try {
    const documents = await documentService.getAll()
    res.json(documents)
  } catch (error) {
    console.error('Error in GET /documents:', error)
    res.status(500).json({ 
      error: 'Failed to fetch documents',
      details: error instanceof Error ? error.message : 'Unknown error'
    })
  }
})

// Get document by ID
router.get('/:id', async (req, res) => {
  try {
    const document = await documentService.getById(req.params.id)
    if (!document) {
      return res.status(404).json({ error: 'Document not found' })
    }
    res.json(document)
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch document' })
  }
})

// Create new document
router.post('/', async (req, res) => {
  try {
    const { title } = req.body
    const document = await documentService.create(title || 'Untitled Document')
    res.json(document)
  } catch (error) {
    console.error('Error creating document:', error)
    res.status(500).json({ error: 'Failed to create document', details: error instanceof Error ? error.message : 'Unknown error' })
  }
})

// Update document
router.put('/:id', async (req, res) => {
  try {
    const { content, title } = req.body
    let document
    if (title !== undefined) {
      document = await documentService.updateTitle(req.params.id, title)
    } else if (content !== undefined) {
      document = await documentService.update(req.params.id, content)
    } else {
      return res.status(400).json({ error: 'Either content or title must be provided' })
    }
    if (!document) {
      return res.status(404).json({ error: 'Document not found' })
    }
    res.json(document)
  } catch (error) {
    res.status(500).json({ error: 'Failed to update document' })
  }
})

// Delete document
router.delete('/:id', async (req, res) => {
  try {
    await documentService.delete(req.params.id)
    res.json({ success: true })
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete document' })
  }
})

export default router

