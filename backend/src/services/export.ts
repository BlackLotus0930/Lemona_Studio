import PDFDocument from 'pdfkit'
import { Document } from '../../../shared/types.js'
import { documentService } from './document.js'
import { Document as DocxDocument, Packer, Paragraph, TextRun, HeadingLevel } from 'docx'

function extractTextFromTipTap(node: any): string {
  if (typeof node === 'string') {
    return node
  }
  
  if (node.type === 'text') {
    return node.text || ''
  }
  
  if (node.content && Array.isArray(node.content)) {
    return node.content.map(extractTextFromTipTap).join('')
  }
  
  return ''
}

function parseTipTapToParagraphs(node: any): Array<{ type: string; text: string; level?: number }> {
  const paragraphs: Array<{ type: string; text: string; level?: number }> = []
  
  if (!node || !node.content) {
    return paragraphs
  }
  
  function traverse(currentNode: any) {
    if (currentNode.type === 'paragraph') {
      const text = extractTextFromTipTap(currentNode)
      if (text.trim()) {
        paragraphs.push({ type: 'paragraph', text })
      }
    } else if (currentNode.type === 'heading') {
      const text = extractTextFromTipTap(currentNode)
      const level = currentNode.attrs?.level || 1
      if (text.trim()) {
        paragraphs.push({ type: 'heading', text, level })
      }
    } else if (currentNode.content && Array.isArray(currentNode.content)) {
      currentNode.content.forEach(traverse)
    }
  }
  
  traverse(node)
  return paragraphs
}

export const exportService = {
  async exportDocument(documentId: string, format: 'pdf' | 'docx'): Promise<Buffer> {
    const document = await documentService.getById(documentId)
    if (!document) {
      throw new Error('Document not found')
    }

    const content = JSON.parse(document.content)
    const paragraphs = parseTipTapToParagraphs(content)

    if (format === 'pdf') {
      return this.exportToPDF(document.title, paragraphs)
    } else {
      return this.exportToDOCX(document.title, paragraphs)
    }
  },

  async exportToPDF(title: string, paragraphs: Array<{ type: string; text: string; level?: number }>): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ margin: 50 })
      const chunks: Buffer[] = []

      doc.on('data', (chunk) => chunks.push(chunk))
      doc.on('end', () => resolve(Buffer.concat(chunks)))
      doc.on('error', reject)

      // Add title
      doc.fontSize(20).font('Helvetica-Bold').text(title, { align: 'center' })
      doc.moveDown(2)

      // Add content
      paragraphs.forEach((para) => {
        if (para.type === 'heading') {
          const fontSize = 24 - (para.level || 1) * 2
          doc.fontSize(fontSize).font('Helvetica-Bold').text(para.text)
          doc.moveDown(1)
        } else {
          doc.fontSize(12).font('Helvetica').text(para.text)
          doc.moveDown(1)
        }
      })

      doc.end()
    })
  },

  async exportToDOCX(title: string, paragraphs: Array<{ type: string; text: string; level?: number }>): Promise<Buffer> {
    const docxParagraphs: Paragraph[] = []

    // Add title
    docxParagraphs.push(
      new Paragraph({
        text: title,
        heading: HeadingLevel.TITLE,
        spacing: { after: 200 },
      })
    )

    // Add content
    paragraphs.forEach((para) => {
      if (para.type === 'heading') {
        const headingLevel = para.level === 1 ? HeadingLevel.HEADING_1 :
                           para.level === 2 ? HeadingLevel.HEADING_2 :
                           para.level === 3 ? HeadingLevel.HEADING_3 :
                           HeadingLevel.HEADING_1
        docxParagraphs.push(
          new Paragraph({
            text: para.text,
            heading: headingLevel,
            spacing: { after: 120 },
          })
        )
      } else {
        docxParagraphs.push(
          new Paragraph({
            text: para.text,
            spacing: { after: 100 },
          })
        )
      }
    })

    const doc = new DocxDocument({
      sections: [{
        children: docxParagraphs,
      }],
    })

    return await Packer.toBuffer(doc)
  },
}

