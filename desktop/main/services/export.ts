// Desktop Export Service - WYSIWYG (What You See Is What You Get)
// Uses Puppeteer (browser engine) for true WYSIWYG rendering with Variable Fonts
import puppeteer from 'puppeteer'
import { documentService } from './documentService.js'
import { Document as DocxDocument, Packer, Paragraph, TextRun, HeadingLevel, PageBreak, AlignmentType } from 'docx'
import fs from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'
import { existsSync } from 'fs'
import { Document } from '../../../shared/types.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Get fonts directory - use fonts from frontend/src/assets/fonts/
const isCompiled = __dirname.includes('dist')
const projectRoot = isCompiled 
  ? path.resolve(__dirname, '../../../../..')
  : path.resolve(__dirname, '../../../..')
const fontsDir = path.join(projectRoot, 'frontend', 'src', 'assets', 'fonts')

console.log(`[Export Service] Fonts directory: ${fontsDir}`)
console.log(`[Export Service] Fonts directory exists: ${existsSync(fontsDir)}`)

// Font mapping: Editor font name -> Font file name
const FONT_FILES: Record<string, { regular: string; italic?: string; bold?: string; boldItalic?: string }> = {
  'Noto Sans SC': { regular: 'NotoSansSC-VariableFont_wght.ttf' },
  'Inter': { regular: 'Inter-VariableFont_opsz,wght.ttf', italic: 'Inter-Italic-VariableFont_opsz,wght.ttf' },
  'Open Sans': { regular: 'OpenSans-VariableFont_wdth,wght.ttf', italic: 'OpenSans-Italic-VariableFont_wdth,wght.ttf' },
  'Roboto': { regular: 'Roboto-VariableFont_wdth,wght.ttf', italic: 'Roboto-Italic-VariableFont_wdth,wght.ttf' },
  'Montserrat': { regular: 'Montserrat-VariableFont_wght.ttf', italic: 'Montserrat-Italic-VariableFont_wght.ttf' },
  'Poppins': { 
    regular: 'Poppins-Regular.ttf', 
    italic: 'Poppins-Italic.ttf',
    bold: 'Poppins-Bold.ttf',
    boldItalic: 'Poppins-BoldItalic.ttf'
  },
}

// Generate CSS with @font-face rules for all fonts
function generateFontFaceCSS(): string {
  let css = ''
  
  for (const [fontFamily, files] of Object.entries(FONT_FILES)) {
    const fontPath = (fileName: string) => path.join(fontsDir, fileName).replace(/\\/g, '/')
    
    // Regular
    css += `
@font-face {
  font-family: '${fontFamily}';
  src: url('file://${fontPath(files.regular)}') format('truetype');
  font-weight: 100 900;
  font-style: normal;
}
`
    // Italic
    if (files.italic) {
      css += `
@font-face {
  font-family: '${fontFamily}';
  src: url('file://${fontPath(files.italic)}') format('truetype');
  font-weight: 100 900;
  font-style: italic;
}
`
    }
    
    // Bold (for non-variable fonts like Poppins)
    if (files.bold) {
      css += `
@font-face {
  font-family: '${fontFamily}';
  src: url('file://${fontPath(files.bold)}') format('truetype');
  font-weight: 700;
  font-style: normal;
}
`
    }
    
    // Bold Italic
    if (files.boldItalic) {
      css += `
@font-face {
  font-family: '${fontFamily}';
  src: url('file://${fontPath(files.boldItalic)}') format('truetype');
  font-weight: 700;
  font-style: italic;
}
`
    }
  }
  
  return css
}

// Convert TipTap JSON to HTML with inline styles (WYSIWYG)
function tipTapToHTML(content: any): string {
  if (!content || !content.content) return ''

  function renderNode(node: any): string {
    if (node.type === 'text') {
      let text = node.text || ''
      let style = ''
      let isHighlighted = false
      let highlightColor = ''

      // Apply marks (formatting)
      if (node.marks && Array.isArray(node.marks)) {
        let isBold = false
        let isItalic = false
        let isUnderline = false
        let color = ''
        let fontSize = ''
        let fontFamily = ''

        node.marks.forEach((mark: any) => {
          if (mark.type === 'bold') isBold = true
          if (mark.type === 'italic') isItalic = true
          if (mark.type === 'underline') isUnderline = true
          if (mark.type === 'textStyle' && mark.attrs) {
            if (mark.attrs.color) color = mark.attrs.color
            if (mark.attrs.fontSize) {
              const size = typeof mark.attrs.fontSize === 'string' 
                ? mark.attrs.fontSize.replace('px', '')
                : mark.attrs.fontSize
              fontSize = `${size}px`
            }
            if (mark.attrs.fontFamily) fontFamily = mark.attrs.fontFamily
          }
          if (mark.type === 'highlight' && mark.attrs?.color) {
            isHighlighted = true
            highlightColor = mark.attrs.color
          }
        })

        // Build inline style
        const styles: string[] = []
        if (fontFamily) styles.push(`font-family: '${fontFamily}', sans-serif`)
        if (fontSize) styles.push(`font-size: ${fontSize}`)
        if (color) styles.push(`color: ${color}`)
        if (isBold) styles.push('font-weight: bold')
        if (isItalic) styles.push('font-style: italic')
        if (isUnderline) styles.push('text-decoration: underline')
        if (isHighlighted) styles.push(`background-color: ${highlightColor}; padding: 0 2px; border-radius: 2px`)
        
        if (styles.length > 0) {
          style = ` style="${styles.join('; ')}"`
        }
      }

      if (style) {
        return `<span${style}>${escapeHTML(text)}</span>`
      }
      return escapeHTML(text)
    }

    if (node.type === 'paragraph') {
      const align = node.attrs?.textAlign || 'left'
      const content = node.content ? node.content.map(renderNode).join('') : ''
      return `<p style="text-align: ${align}; margin-top: 0; margin-bottom: 0.75em; line-height: 1.7; font-size: 14px;">${content || '<br/>'}</p>`
    }

    if (node.type === 'heading') {
      const level = node.attrs?.level || 1
      const align = node.attrs?.textAlign || 'left'
      const content = node.content ? node.content.map(renderNode).join('') : ''
      return `<h${level} style="text-align: ${align}; margin-top: 1em; margin-bottom: 0.5em; line-height: 1.3; font-weight: 600;">${content}</h${level}>`
    }

    if (node.type === 'title') {
      const align = node.attrs?.textAlign || 'left'
      const content = node.content ? node.content.map(renderNode).join('') : ''
      return `<h1 style="text-align: ${align}; font-size: 24px; font-weight: 600; margin-bottom: 1.5em;">${content}</h1>`
    }

    if (node.type === 'subtitle') {
      const align = node.attrs?.textAlign || 'left'
      const content = node.content ? node.content.map(renderNode).join('') : ''
      return `<h2 style="text-align: ${align}; font-size: 18px; font-weight: 500; margin-bottom: 1em;">${content}</h2>`
    }

    if (node.type === 'bulletList') {
      const items = node.content ? node.content.map(renderNode).join('') : ''
      return `<ul style="padding-left: 1.75em; margin: 0.5em 0; list-style-type: disc;">${items}</ul>`
    }

    if (node.type === 'orderedList') {
      const items = node.content ? node.content.map(renderNode).join('') : ''
      return `<ol style="padding-left: 1.75em; margin: 0.5em 0; list-style-type: decimal;">${items}</ol>`
    }

    if (node.type === 'listItem') {
      const content = node.content ? node.content.map(renderNode).join('') : ''
      return `<li style="margin: 0.25em 0; padding-left: 0.25em;">${content}</li>`
    }

    if (node.content && Array.isArray(node.content)) {
      return node.content.map(renderNode).join('')
    }

    return ''
  }

  if (content.content && Array.isArray(content.content)) {
    return content.content.map(renderNode).join('')
  }

  return ''
}

// Escape HTML special characters
function escapeHTML(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

// Generate complete HTML document for PDF generation
function generateHTMLDocument(bodyHTML: string): string {
  const fontFaceCSS = generateFontFaceCSS()
  
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    ${fontFaceCSS}
    
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    
    body {
      font-family: 'Noto Sans SC', 'Inter', sans-serif;
      font-size: 14px;
      line-height: 1.7;
      color: #202124;
      padding: 50px;
      background: white;
    }
    
    h1, h2, h3, h4, h5, h6 {
      margin-top: 1em;
      margin-bottom: 0.5em;
      line-height: 1.3;
      font-weight: 600;
    }
    
    h1:first-child,
    h2:first-child,
    h3:first-child {
      margin-top: 0;
    }
    
    p {
      margin-top: 0;
      margin-bottom: 0.75em;
      line-height: 1.7;
    }
    
    p:last-child {
      margin-bottom: 0;
    }
    
    ul, ol {
      padding-left: 1.75em;
      margin: 0.5em 0;
    }
    
    li {
      margin: 0.25em 0;
      padding-left: 0.25em;
    }
    
    .page-break {
      page-break-after: always;
    }
  </style>
</head>
<body>
  ${bodyHTML}
</body>
</html>
`
}

export const exportService = {
  async exportDocument(documentId: string, format: 'pdf' | 'docx'): Promise<Buffer> {
    const document = await documentService.getById(documentId)
    if (!document) {
      throw new Error('Document not found')
    }

    const content = JSON.parse(document.content)

    if (format === 'pdf') {
      return this.exportToPDF(document.title, content)
    } else {
      return this.exportToDOCX(document.title, content)
    }
  },

  async exportMultipleDocuments(documentIds: string[], format: 'pdf' | 'docx'): Promise<Buffer> {
    if (documentIds.length === 0) {
      throw new Error('No documents selected')
    }

    // Load all documents
    const documents: Document[] = []
    for (const id of documentIds) {
      const doc = await documentService.getById(id)
      if (!doc) {
        throw new Error(`Document not found: ${id}`)
      }
      documents.push(doc)
    }

    // Sort by order field
    documents.sort((a, b) => {
      if (a.order !== undefined && b.order !== undefined) {
        return a.order - b.order
      }
      if (a.order !== undefined) return -1
      if (b.order !== undefined) return 1
      return documentIds.indexOf(a.id) - documentIds.indexOf(b.id)
    })

    if (format === 'pdf') {
      return this.exportMultipleToPDF(documents)
    } else {
      return this.exportMultipleToDOCX(documents)
    }
  },

  async exportToPDF(title: string, content: any): Promise<Buffer> {
    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    })

    try {
      const page = await browser.newPage()
      
      // Convert TipTap JSON to HTML
      const bodyHTML = tipTapToHTML(content)
      const html = generateHTMLDocument(bodyHTML)
      
      // Set content
      await page.setContent(html, { waitUntil: 'networkidle0' })
      
      // Generate PDF
      const pdfBuffer = await page.pdf({
        format: 'A4',
        printBackground: true,
        margin: {
          top: '50px',
          right: '50px',
          bottom: '50px',
          left: '50px'
        }
      })
      
      return Buffer.from(pdfBuffer)
    } finally {
      await browser.close()
    }
  },

  async exportMultipleToPDF(documents: Document[]): Promise<Buffer> {
    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    })

    try {
      const page = await browser.newPage()
      
      // Combine all documents into one HTML
      let combinedHTML = ''
      documents.forEach((doc, index) => {
        const content = JSON.parse(doc.content)
        const bodyHTML = tipTapToHTML(content)
        
        // Add page break between documents (except before the first)
        if (index > 0) {
          combinedHTML += '<div class="page-break"></div>'
        }
        
        combinedHTML += bodyHTML
      })
      
      const html = generateHTMLDocument(combinedHTML)
      
      // Set content
      await page.setContent(html, { waitUntil: 'networkidle0' })
      
      // Generate PDF
      const pdfBuffer = await page.pdf({
        format: 'A4',
        printBackground: true,
        margin: {
          top: '50px',
          right: '50px',
          bottom: '50px',
          left: '50px'
        }
      })
      
      return Buffer.from(pdfBuffer)
    } finally {
      await browser.close()
    }
  },

  async exportToDOCX(title: string, content: any): Promise<Buffer> {
    const blocks = parseTipTapToFormattedBlocks(content)
    const docxParagraphs: Paragraph[] = []

    // Convert blocks to DOCX paragraphs
    blocks.forEach((block) => {
      const runs = block.segments.map(segment => {
        return new TextRun({
          text: segment.text,
          bold: segment.bold,
          italics: segment.italic,
          underline: segment.underline ? {} : undefined,
          color: segment.color?.replace('#', ''),
          size: segment.fontSize ? segment.fontSize * 2 : undefined, // DOCX uses half-points
          font: segment.fontFamily,
        })
      })

      if (block.type === 'heading') {
        const headingLevel =
          block.level === 1 ? HeadingLevel.HEADING_1 :
          block.level === 2 ? HeadingLevel.HEADING_2 :
          block.level === 3 ? HeadingLevel.HEADING_3 :
          HeadingLevel.HEADING_1
        
        const alignment = 
          block.textAlign === 'center' ? AlignmentType.CENTER :
          block.textAlign === 'right' ? AlignmentType.RIGHT :
          block.textAlign === 'justify' ? AlignmentType.JUSTIFIED :
          AlignmentType.LEFT

        docxParagraphs.push(
          new Paragraph({
            children: runs,
            heading: headingLevel,
            alignment,
            spacing: { after: 240 },
          })
        )
      } else {
        const alignment = 
          block.textAlign === 'center' ? AlignmentType.CENTER :
          block.textAlign === 'right' ? AlignmentType.RIGHT :
          block.textAlign === 'justify' ? AlignmentType.JUSTIFIED :
          AlignmentType.LEFT

        docxParagraphs.push(
          new Paragraph({
            children: runs,
            alignment,
            spacing: { after: 150 },
          })
        )
      }
    })

    const doc = new DocxDocument({
      sections: [
        {
          children: docxParagraphs,
        },
      ],
    })

    return await Packer.toBuffer(doc)
  },

  async exportMultipleToDOCX(documents: Document[]): Promise<Buffer> {
    const docxChildren: Paragraph[] = []

    // Process each document
    documents.forEach((document, index) => {
      // Add page break before each document (except the first)
      if (index > 0) {
        docxChildren.push(
          new Paragraph({
            children: [new PageBreak()],
          })
        )
      }

      // Parse and add content
      const content = JSON.parse(document.content)
      const blocks = parseTipTapToFormattedBlocks(content)
      
      blocks.forEach((block) => {
        const runs = block.segments.map(segment => {
          return new TextRun({
            text: segment.text,
            bold: segment.bold,
            italics: segment.italic,
            underline: segment.underline ? {} : undefined,
            color: segment.color?.replace('#', ''),
            size: segment.fontSize ? segment.fontSize * 2 : undefined,
            font: segment.fontFamily,
          })
        })

        if (block.type === 'heading') {
          const headingLevel =
            block.level === 1 ? HeadingLevel.HEADING_1 :
            block.level === 2 ? HeadingLevel.HEADING_2 :
            block.level === 3 ? HeadingLevel.HEADING_3 :
            HeadingLevel.HEADING_1
          
          const alignment = 
            block.textAlign === 'center' ? AlignmentType.CENTER :
            block.textAlign === 'right' ? AlignmentType.RIGHT :
            block.textAlign === 'justify' ? AlignmentType.JUSTIFIED :
            AlignmentType.LEFT

          docxChildren.push(
            new Paragraph({
              children: runs,
              heading: headingLevel,
              alignment,
              spacing: { after: 240 },
            })
          )
        } else {
          const alignment = 
            block.textAlign === 'center' ? AlignmentType.CENTER :
            block.textAlign === 'right' ? AlignmentType.RIGHT :
            block.textAlign === 'justify' ? AlignmentType.JUSTIFIED :
            AlignmentType.LEFT

          docxChildren.push(
            new Paragraph({
              children: runs,
              alignment,
              spacing: { after: 150 },
            })
          )
        }
      })
    })

    const doc = new DocxDocument({
      sections: [
        {
          children: docxChildren,
        },
      ],
    })

    return await Packer.toBuffer(doc)
  },
}

// Helper types and functions for DOCX export
interface FormattedSegment {
  text: string
  fontFamily?: string
  fontSize?: number
  color?: string
  bold?: boolean
  italic?: boolean
  underline?: boolean
  highlightColor?: string
}

interface FormattedBlock {
  type: string
  level?: number
  textAlign?: string
  segments: FormattedSegment[]
  children?: FormattedBlock[]
}

function extractFormattedSegments(node: any): FormattedSegment[] {
  const segments: FormattedSegment[] = []

  function processTextNode(textNode: any) {
    if (textNode.type === 'text' && textNode.text) {
      const segment: FormattedSegment = {
        text: textNode.text,
      }

      if (textNode.marks && Array.isArray(textNode.marks)) {
        textNode.marks.forEach((mark: any) => {
          if (mark.type === 'bold') {
            segment.bold = true
          } else if (mark.type === 'italic') {
            segment.italic = true
          } else if (mark.type === 'underline') {
            segment.underline = true
          } else if (mark.type === 'textStyle' && mark.attrs) {
            if (mark.attrs.fontFamily) {
              segment.fontFamily = mark.attrs.fontFamily
            }
            if (mark.attrs.fontSize) {
              const size =
                typeof mark.attrs.fontSize === 'string'
                  ? parseInt(mark.attrs.fontSize.replace('px', ''))
                  : mark.attrs.fontSize
              if (!isNaN(size) && size > 0) {
                segment.fontSize = size
              }
            }
            if (mark.attrs.color) {
              segment.color = mark.attrs.color
            }
          } else if (mark.type === 'highlight' && mark.attrs?.color) {
            segment.highlightColor = mark.attrs.color
          }
        })
      }

      if (segment.text) {
        segments.push(segment)
      }
    } else if (textNode.content && Array.isArray(textNode.content)) {
      textNode.content.forEach(processTextNode)
    }
  }

  processTextNode(node)
  return segments
}

function parseTipTapToFormattedBlocks(node: any): FormattedBlock[] {
  const blocks: FormattedBlock[] = []

  function traverse(currentNode: any): FormattedBlock | null {
    if (currentNode.type === 'paragraph') {
      const segments = extractFormattedSegments(currentNode)
      if (segments.length > 0 || segments.some((s) => s.text.trim())) {
        return {
          type: 'paragraph',
          textAlign: currentNode.attrs?.textAlign || 'left',
          segments: segments.filter((s) => s.text.trim() || s.text === ' '),
        }
      }
    } else if (currentNode.type === 'heading') {
      const segments = extractFormattedSegments(currentNode)
      if (segments.length > 0 || segments.some((s) => s.text.trim())) {
        return {
          type: 'heading',
          level: currentNode.attrs?.level || 1,
          textAlign: currentNode.attrs?.textAlign || 'left',
          segments: segments.filter((s) => s.text.trim() || s.text === ' '),
        }
      }
    } else if (currentNode.type === 'title') {
      const segments = extractFormattedSegments(currentNode)
      if (segments.length > 0 || segments.some((s) => s.text.trim())) {
        return {
          type: 'title',
          textAlign: currentNode.attrs?.textAlign || 'left',
          segments: segments.filter((s) => s.text.trim() || s.text === ' '),
        }
      }
    } else if (currentNode.type === 'subtitle') {
      const segments = extractFormattedSegments(currentNode)
      if (segments.length > 0 || segments.some((s) => s.text.trim())) {
        return {
          type: 'subtitle',
          textAlign: currentNode.attrs?.textAlign || 'left',
          segments: segments.filter((s) => s.text.trim() || s.text === ' '),
        }
      }
    } else if (currentNode.type === 'bulletList' || currentNode.type === 'orderedList') {
      const children: FormattedBlock[] = []
      if (currentNode.content) {
        currentNode.content.forEach((child: any) => {
          const childBlock = traverse(child)
          if (childBlock) {
            children.push(childBlock)
          }
        })
      }
      if (children.length > 0) {
        return {
          type: currentNode.type,
          segments: [],
          children,
        }
      }
    } else if (currentNode.type === 'listItem') {
      const children: FormattedBlock[] = []
      if (currentNode.content) {
        currentNode.content.forEach((child: any) => {
          const childBlock = traverse(child)
          if (childBlock) {
            children.push(childBlock)
          }
        })
      }
      if (children.length > 0) {
        return {
          type: 'listItem',
          segments: [],
          children,
        }
      }
    } else if (currentNode.content && Array.isArray(currentNode.content)) {
      currentNode.content.forEach((child: any) => {
        const block = traverse(child)
        if (block) {
          blocks.push(block)
        }
      })
    }
    return null
  }

  if (node.content) {
    node.content.forEach((child: any) => {
      const block = traverse(child)
      if (block) {
        blocks.push(block)
      }
    })
  }
  return blocks
}
