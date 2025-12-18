import express from 'express'
import { exportService } from '../services/export.js'

const router = express.Router()

router.post('/:documentId', async (req, res) => {
  try {
    const { documentId } = req.params
    const { format, filename } = req.body

    if (!format || !['pdf', 'docx'].includes(format)) {
      return res.status(400).json({ error: 'Invalid format. Must be pdf or docx' })
    }

    const fileBuffer = await exportService.exportDocument(documentId, format)
    
    const contentType = format === 'pdf' 
      ? 'application/pdf' 
      : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    
    const fileExtension = format === 'pdf' ? 'pdf' : 'docx'
    const downloadFilename = filename || `document.${fileExtension}`

    res.setHeader('Content-Type', contentType)
    res.setHeader('Content-Disposition', `attachment; filename="${downloadFilename}"`)
    res.send(fileBuffer)
  } catch (error) {
    console.error('Export error:', error)
    res.status(500).json({ error: 'Failed to export document' })
  }
})

export default router

