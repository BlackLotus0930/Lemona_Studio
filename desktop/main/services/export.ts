// Desktop Export Service - WYSIWYG (What You See Is What You Get)
// Uses Puppeteer (browser engine) for true WYSIWYG rendering with Variable Fonts
import puppeteer from 'puppeteer'
import { documentService } from './documentService.js'
import { 
  Document as DocxDocument, 
  Packer, 
  Paragraph, 
  TextRun, 
  HeadingLevel, 
  PageBreak, 
  AlignmentType,
  ImageRun,
  Table,
  TableRow,
  TableCell,
  WidthType,
  ExternalHyperlink,
  InternalHyperlink,
} from 'docx'
import fs from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'
import { existsSync } from 'fs'
import http from 'http'
import https from 'https'
import { Document } from '../../../shared/types.js'
import { app } from 'electron'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Get fonts directory - use fonts from frontend/src/assets/fonts/
const isCompiled = __dirname.includes('dist')
const projectRoot = isCompiled 
  ? path.resolve(__dirname, '../../../../..')
  : path.resolve(__dirname, '../../../..')
const fontsDir = path.join(projectRoot, 'frontend', 'src', 'assets', 'fonts')

const IMAGE_FETCH_TIMEOUT_MS = 15000

function guessImageMimeType(url: string): string | null {
  const lower = url.toLowerCase()
  if (lower.endsWith('.png')) return 'image/png'
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg'
  if (lower.endsWith('.gif')) return 'image/gif'
  if (lower.endsWith('.webp')) return 'image/webp'
  if (lower.endsWith('.svg')) return 'image/svg+xml'
  return null
}

async function fetchImageAsDataUrl(url: string, timeoutMs: number = IMAGE_FETCH_TIMEOUT_MS): Promise<string | null> {
  return new Promise((resolve) => {
    try {
      const client = url.startsWith('https') ? https : http
      const req = client.get(url, { timeout: timeoutMs }, (res) => {
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.resume()
          const redirectUrl = new URL(res.headers.location, url).toString()
          fetchImageAsDataUrl(redirectUrl, timeoutMs).then(resolve)
          return
        }

        if (!res.statusCode || res.statusCode >= 400) {
          res.resume()
          resolve(null)
          return
        }

        const chunks: Buffer[] = []
        res.on('data', (chunk) => chunks.push(chunk as Buffer))
        res.on('end', () => {
          const buffer = Buffer.concat(chunks)
          const contentType = typeof res.headers['content-type'] === 'string'
            ? res.headers['content-type'].split(';')[0]
            : guessImageMimeType(url)
          if (!contentType || buffer.length === 0) {
            resolve(null)
            return
          }
          resolve(`data:${contentType};base64,${buffer.toString('base64')}`)
        })
      })

      req.on('timeout', () => {
        req.destroy()
        resolve(null)
      })
      req.on('error', () => resolve(null))
    } catch {
      resolve(null)
    }
  })
}

async function inlineExternalImages(html: string): Promise<string> {
  const imgSrcRegex = /<img\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi
  const sources = new Set<string>()
  let match: RegExpExecArray | null = null
  while ((match = imgSrcRegex.exec(html)) !== null) {
    const src = match[1]
    if (src && /^https?:\/\//i.test(src)) {
      sources.add(src)
    }
  }

  for (const src of sources) {
    const dataUrl = await fetchImageAsDataUrl(src)
    if (dataUrl) {
      html = html.split(src).join(dataUrl)
    }
  }
  return html
}

// Font mapping: Editor font name -> Font file name
const FONT_FILES: Record<string, { regular: string; italic?: string; bold?: string; boldItalic?: string }> = {
  'Noto Sans SC': { regular: 'NotoSansSC-VariableFont_wght.ttf' },
  'Inter': { regular: 'Inter-VariableFont_opsz,wght.ttf', italic: 'Inter-Italic-VariableFont_opsz,wght.ttf' },
  'Open Sans': { regular: 'OpenSans-VariableFont_wdth,wght.ttf', italic: 'OpenSans-Italic-VariableFont_wdth,wght.ttf' },
  'Roboto': { regular: 'Roboto-VariableFont_wdth,wght.ttf', italic: 'Roboto-Italic-VariableFont_wdth,wght.ttf' },
  'Montserrat': { regular: 'Montserrat-VariableFont_wght.ttf', italic: 'Montserrat-Italic-VariableFont_wght.ttf' },
  'Source Sans 3': { regular: 'SourceSans3-VariableFont_wght.ttf', italic: 'SourceSans3-Italic-VariableFont_wght.ttf' },
  'Liberation Serif': { 
    regular: 'LiberationSerif-Regular.ttf', 
    italic: 'LiberationSerif-Italic.ttf',
    bold: 'LiberationSerif-Bold.ttf',
    boldItalic: 'LiberationSerif-BoldItalic.ttf'
  },
  'EB Garamond': { regular: 'EBGaramond-VariableFont_wght.ttf', italic: 'EBGaramond-Italic-VariableFont_wght.ttf' },
  'Courier Prime': { 
    regular: 'CourierPrime-Regular.ttf', 
    italic: 'CourierPrime-Italic.ttf',
    bold: 'CourierPrime-Bold.ttf',
    boldItalic: 'CourierPrime-BoldItalic.ttf'
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

// Helper function to load image from document:// URL
async function loadDocumentImage(src: string): Promise<string | null> {
  if (!src.startsWith('document://')) {
    return null
  }
  
  try {
    // Parse document://documentId/image/imageId
    const match = src.match(/^document:\/\/([^/]+)\/image\/(.+)$/)
    if (!match) {
      return null
    }
    
    const documentId = match[1]
    const imageId = match[2]
    
    // Get file path - images are stored as documentId_imageId.ext
    const FILES_DIR = path.join(app.getPath('userData'), 'files')
    const files = await fs.readdir(FILES_DIR)
    const imageFile = files.find((f: string) => f.startsWith(`${documentId}_img_`) && f.includes(imageId))
    
    if (!imageFile) {
      return null
    }
    
    const imagePath = path.join(FILES_DIR, imageFile)
    const fileBuffer = await fs.readFile(imagePath)
    
    // Determine content type from file extension
    const ext = imageFile.split('.').pop()?.toLowerCase() || 'png'
    const contentType = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : 
                       ext === 'gif' ? 'image/gif' : 
                       ext === 'webp' ? 'image/webp' : 'image/png'
    
    const base64 = fileBuffer.toString('base64')
    return `data:${contentType};base64,${base64}`
  } catch (error) {
    console.error('[Export] Failed to load document image:', error)
    return null
  }
}

// Preprocess TipTap content to convert document:// URLs to data URLs
async function preprocessContentForExport(content: any): Promise<any> {
  if (!content || !content.content) {
    return content
  }
  
  async function processNode(node: any): Promise<any> {
    if (!node || !node.type) {
      return node
    }
    
    // Process image nodes
    if (node.type === 'image' && node.attrs?.src) {
      const src = node.attrs.src
      const documentSrc = node.attrs['data-document-src'] || ''
      const actualSrc = documentSrc || src
      
      // If it's a document:// URL, load it and convert to data URL
      if (actualSrc.startsWith('document://')) {
        const dataUrl = await loadDocumentImage(actualSrc)
        if (dataUrl) {
          return {
            ...node,
            attrs: {
              ...node.attrs,
              src: dataUrl,
              'data-document-src': undefined, // Remove data-document-src after conversion
            }
          }
        }
      }
    }
    
    // Recursively process children
    if (node.content && Array.isArray(node.content)) {
      const processedContent = await Promise.all(node.content.map(processNode))
      return {
        ...node,
        content: processedContent
      }
    }
    
    return node
  }
  
  const processedContent = await Promise.all(content.content.map(processNode))
  return {
    ...content,
    content: processedContent
  }
}

// Convert TipTap JSON to HTML with inline styles (WYSIWYG)
function tipTapToHTML(content: any): string {
  if (!content || !content.content) {
    return ''
  }

  function renderNode(node: any): string {
    if (!node || !node.type) {
      return ''
    }
    
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
        if (isBold) styles.push('font-weight: 600')
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
      return `<p style="text-align: ${align}; margin-top: 0; margin-bottom: 0.75em; line-height: 1.75; font-size: 16px;">${content || '<br/>'}</p>`
    }

    if (node.type === 'heading') {
      const level = node.attrs?.level || 1
      const align = node.attrs?.textAlign || 'left'
      const content = node.content ? node.content.map(renderNode).join('') : ''
      // Font sizes: h1=26px, h2=22px, h3=19px (matching editor)
      const fontSize = level === 1 ? '26px' : level === 2 ? '22px' : level === 3 ? '19px' : '14px'
      const marginBottom = (level === 2 || level === 3) ? '0.65em' : '0.5em'
      return `<h${level} style="text-align: ${align}; margin-top: 1em; margin-bottom: ${marginBottom}; line-height: 1.3; font-weight: 600; font-size: ${fontSize};">${content}</h${level}>`
    }

    if (node.type === 'title') {
      const align = node.attrs?.textAlign || 'left'
      const content = node.content ? node.content.map(renderNode).join('') : ''
      return `<h1 style="text-align: ${align}; font-size: 24px; font-weight: 600; margin-bottom: 1.5em;">${content}</h1>`
    }

    if (node.type === 'subtitle') {
      const align = node.attrs?.textAlign || 'left'
      const content = node.content ? node.content.map(renderNode).join('') : ''
      return `<h2 style="text-align: ${align}; font-size: 20px; font-weight: 500; margin-bottom: 1em;">${content}</h2>`
    }

    if (node.type === 'bulletList') {
      const items = node.content ? node.content.map(renderNode).join('') : ''
      return `<ul style="padding-left: 1.75em; margin: 0.4em 0; list-style-type: disc;">${items}</ul>`
    }

    if (node.type === 'orderedList') {
      const items = node.content ? node.content.map(renderNode).join('') : ''
      return `<ol style="padding-left: 1.75em; margin: 0.4em 0; list-style-type: decimal;">${items}</ol>`
    }

    if (node.type === 'listItem') {
      const content = node.content ? node.content.map(renderNode).join('') : ''
      return `<li style="margin: 0.25em 0; padding-left: 0.25em;">${content}</li>`
    }

    if (node.type === 'horizontalRule') {
      return `<hr style="border: none; border-top: 1px solid #E6E5E3; margin-top: 0.75em; margin-bottom: 0.75em; height: 0;" />`
    }

    if (node.type === 'image') {
      let src = node.attrs?.src || ''
      // Check for data-document-src attribute (set by ResizableImage renderHTML)
      const documentSrc = node.attrs?.['data-document-src'] || ''
      const actualSrc = documentSrc || src
      const alt = node.attrs?.alt || ''
      const width = node.attrs?.width
      const height = node.attrs?.height
      
      // Check image source type
      const srcType = actualSrc.startsWith('data:') ? 'data-url' :
                     actualSrc.startsWith('blob:') ? 'blob-url' :
                     actualSrc.startsWith('http://') || actualSrc.startsWith('https://') ? 'http-url' :
                     actualSrc.startsWith('file://') ? 'file-url' :
                     actualSrc.startsWith('document://') ? 'document-url' : 'unknown'
      
      // For document:// URLs, we'll keep them as-is in HTML
      // They will be handled by preprocessing before export or by the browser
      // Note: Puppeteer won't be able to load document:// URLs, so preprocessing is needed
      
      // Build style attributes for responsive image display
      const imgStyles: string[] = []
      if (width) imgStyles.push(`width: ${width}px`)
      if (height) imgStyles.push(`height: ${height}px`)
      imgStyles.push('max-width: 100%')
      imgStyles.push('height: auto')
      imgStyles.push('display: block')
      imgStyles.push('margin: 1em auto')
      
      const styleAttr = imgStyles.length > 0 ? ` style="${imgStyles.join('; ')}"` : ''
      const widthAttr = width ? ` width="${width}"` : ''
      const heightAttr = height ? ` height="${height}"` : ''
      const altAttr = alt ? ` alt="${escapeHTML(alt)}"` : ''
      
      // Add data attribute to track image loading
      const dataTypeAttr = ` data-img-type="${srcType}"`
      // Store document:// URL in data attribute if present
      const dataDocumentSrcAttr = actualSrc.startsWith('document://') ? ` data-document-src="${escapeHTML(actualSrc)}"` : ''
      
      return `<img src="${src}"${altAttr}${widthAttr}${heightAttr}${styleAttr}${dataTypeAttr}${dataDocumentSrcAttr} />`
    }

    if (node.type === 'chart') {
      const chartType = node.attrs?.chartType || 'column'
      const chartName = node.attrs?.chartName || ''
      const chartDataStr = node.attrs?.chartData || ''
      
      let chartData: any = {
        labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May'],
        datasets: [{ label: 'Data', values: [10, 20, 15, 25, 30] }]
      }
      
      try {
        if (chartDataStr) {
          chartData = JSON.parse(chartDataStr)
        }
      } catch (e) {
        // Use default data if parsing fails
      }
      
      const svg = renderChartSVG(chartType, chartData)
      const titleHTML = chartName ? `<div style="font-size: 18px; font-weight: 600; margin-bottom: 8px; text-align: center;">${escapeHTML(chartName)}</div>` : ''
      
      return `<div style="margin: 1em 0; display: flex; flex-direction: column; align-items: center;">${titleHTML}${svg}</div>`
    }

    if (node.type === 'tableBlock') {
      const html = node.attrs?.html || ''
      if (html) {
        // Clean HTML to remove highlight/selection styles
        const cleanedHTML = cleanTableHTML(html)
        // Add page-break-inside: avoid to prevent table from being split across pages
        return `<div style="margin: 1em 0; page-break-inside: avoid; break-inside: avoid;">${cleanedHTML}</div>`
      }
      return ''
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

// Clean table HTML to remove highlight/selection styles and normalize for PDF
function cleanTableHTML(html: string): string {
  if (!html) return html
  
  // Normalize table styles for PDF export (light theme, proper borders, consistent padding)
  let cleaned = html
    // Replace dark theme border colors with light theme colors
    .replace(/border:\s*0\.5px\s+solid\s+#555/gi, 'border: 1px solid #ddd')
    .replace(/border:\s*0\.5px\s+solid\s+#ddd/gi, 'border: 1px solid #ddd')
    .replace(/border:\s*1px\s+solid\s+#555/gi, 'border: 1px solid #ddd')
    // Normalize border styles to be consistent and visible
    .replace(/border:\s*([^;]+);/gi, (match: string) => {
      // Ensure borders are at least 1px for visibility in PDF
      if (match.includes('0.5px')) {
        return match.replace(/0\.5px/g, '1px')
      }
      return match
    })
  
  // Clean up style attributes - remove highlights and normalize colors
  cleaned = cleaned.replace(/style="([^"]*)"/gi, (match: string, styleContent: string) => {
    let cleanedStyle = styleContent
    
    // Remove dark background-color values (highlights/selections)
    cleanedStyle = cleanedStyle.replace(/background-color:\s*[^;]+;?/gi, (bgMatch: string) => {
      const color = bgMatch.toLowerCase()
      // Keep transparent, white, or very light gray backgrounds
      if (color.includes('transparent') || 
          color.includes('#fff') || 
          color.includes('#ffffff') ||
          color.includes('rgb(255') ||
          color.includes('rgba(255, 255, 255') ||
          color.includes('#f5f5f5') ||
          color.includes('#f8f9fa')) {
        return bgMatch
      }
      // Remove dark backgrounds (highlights/selections)
      return ''
    })
    
    // Normalize border colors to light theme
    cleanedStyle = cleanedStyle.replace(/border[^:]*:\s*[^;]*#555[^;]*;?/gi, (borderMatch: string) => {
      return borderMatch.replace(/#555/g, '#ddd')
    })
    
    // Ensure borders are visible (at least 1px)
    cleanedStyle = cleanedStyle.replace(/border[^:]*:\s*0\.5px/gi, (borderMatch: string) => {
      return borderMatch.replace(/0\.5px/g, '1px')
    })
    
    // Normalize padding for better appearance
    cleanedStyle = cleanedStyle.replace(/padding:\s*8px\s+4px\s+8px\s+8px/gi, 'padding: 10px 12px')
    
    // Clean up empty style attributes or trailing semicolons
    const finalStyle = cleanedStyle.trim().replace(/;\s*;/g, ';').replace(/;\s*$/, '').trim()
    
    // If style is empty, remove the entire style attribute
    if (!finalStyle) {
      return ''
    }
    
    return `style="${finalStyle}"`
  })
  
  // Normalize table element styles
  cleaned = cleaned.replace(/<table\s+style="([^"]*)"/gi, (match: string, styleContent: string) => {
    // Ensure table has proper border-collapse and spacing
    let tableStyle = styleContent
    if (!tableStyle.includes('border-collapse')) {
      tableStyle += '; border-collapse: collapse'
    }
    if (!tableStyle.includes('width')) {
      tableStyle += '; width: 100%'
    }
    // Normalize margin
    tableStyle = tableStyle.replace(/margin:\s*[^;]+/gi, 'margin: 16px 0')
    return `<table style="${tableStyle}"`
  })
  
  // Remove any selection-related classes or data attributes
  cleaned = cleaned.replace(/\s*class="[^"]*selected[^"]*"/gi, '')
  cleaned = cleaned.replace(/\s*data-selected="[^"]*"/gi, '')
  cleaned = cleaned.replace(/\s*data-highlight="[^"]*"/gi, '')
  
  // Clean up any double spaces
  cleaned = cleaned.replace(/\s{2,}/g, ' ')
  
  return cleaned
}

// Render chart as SVG (similar to ChartExtension's renderChartSVG)
function renderChartSVG(type: string, data: any): string {
  const values = data.datasets[0]?.values || []
  const labels = data.labels || []
  const maxValue = Math.max(...values, 1)
  
  // Calculate nice round numbers for Y-axis
  const niceMax = Math.ceil(maxValue / 10) * 10 || 10
  const niceStep = niceMax / 4
  const yTicks = [0, niceStep, niceStep * 2, niceStep * 3, niceMax]
  
  const width = 600
  const height = 350
  const leftPadding = 60
  const rightPadding = 40
  const topPadding = 40
  const bottomPadding = 60
  const chartWidth = width - leftPadding - rightPadding
  const chartHeight = height - topPadding - bottomPadding
  
  // Use light theme colors for PDF export
  const axisColor = '#cccccc'
  const gridColor = '#e0e0e0'
  const textColor = '#666666'
  const strokeColor = '#1a73e8'
  const fillColor = '#1a73e8'
  const fontSize = '12px'
  const fontFamily = 'Arial, sans-serif'

  let svg = `<defs>
    <style>
      .chart-text { font-family: ${fontFamily}; font-size: ${fontSize}; fill: ${textColor}; }
      .chart-axis { stroke: ${axisColor}; stroke-width: 1; }
      .chart-grid { stroke: ${gridColor}; stroke-width: 1; stroke-dasharray: 2,2; }
    </style>
  </defs>`

  // Only draw grid lines and axes for column and line charts (not pie)
  if (type !== 'pie') {
    // Draw grid lines and Y-axis labels
    yTicks.forEach((tick) => {
      const y = topPadding + chartHeight - ((tick / niceMax) * chartHeight)
      // Grid line
      svg += `<line x1="${leftPadding}" y1="${y}" x2="${leftPadding + chartWidth}" y2="${y}" class="chart-grid"/>`
      // Y-axis label
      svg += `<text x="${leftPadding - 10}" y="${y + 4}" text-anchor="end" class="chart-text">${Math.round(tick)}</text>`
    })

    // Draw X and Y axes
    svg += `<line x1="${leftPadding}" y1="${topPadding}" x2="${leftPadding}" y2="${topPadding + chartHeight}" class="chart-axis"/>`
    svg += `<line x1="${leftPadding}" y1="${topPadding + chartHeight}" x2="${leftPadding + chartWidth}" y2="${topPadding + chartHeight}" class="chart-axis"/>`
  }

  if (type === 'column') {
    // Column = vertical bars
    const barSpacing = 8
    const barWidth = (chartWidth / values.length) - barSpacing
    
    // Color palette for different bars
    const colors = [
      '#1a73e8', '#34a853', '#fbbc04', '#ea4335',
      '#9c27b0', '#00acc1', '#ffc107', '#607d8b',
    ]

    values.forEach((value: number, index: number) => {
      const color = colors[index % colors.length]
      const barLength = (value / niceMax) * chartHeight
      
      // Vertical bars (Column chart)
      const x = leftPadding + (index * (chartWidth / values.length)) + (barSpacing / 2)
      const y = topPadding + chartHeight - barLength
      svg += `<rect x="${x}" y="${y}" width="${barWidth}" height="${barLength}" fill="${color}" rx="2"/>`
      // Value label on top of bar
      if (barLength > 15) {
        svg += `<text x="${x + barWidth / 2}" y="${y - 5}" text-anchor="middle" class="chart-text">${value}</text>`
      }
      // X-axis label (category name)
      const labelY = topPadding + chartHeight + 20
      svg += `<text x="${x + barWidth / 2}" y="${labelY}" text-anchor="middle" class="chart-text">${escapeHTML(labels[index] || `Item ${index + 1}`)}</text>`
    })
  } else if (type === 'line') {
    const points = values.map((value: number, index: number) => {
      const x = leftPadding + (index * (chartWidth / (values.length - 1 || 1)))
      const y = topPadding + chartHeight - ((value / niceMax) * chartHeight)
      return { x, y, value }
    })

    // Draw line
    const pathData = points.map((p: { x: number; y: number }, i: number) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ')
    svg += `<path d="${pathData}" fill="none" stroke="${strokeColor}" stroke-width="2"/>`

    // Draw points and labels
    points.forEach((point: { x: number; y: number; value: number }, index: number) => {
      svg += `<circle cx="${point.x}" cy="${point.y}" r="4" fill="${fillColor}" stroke="#ffffff" stroke-width="2"/>`
      // X-axis label
      const labelY = topPadding + chartHeight + 20
      svg += `<text x="${point.x}" y="${labelY}" text-anchor="middle" class="chart-text">${escapeHTML(labels[index] || `Item ${index + 1}`)}</text>`
    })
  } else if (type === 'pie') {
    // Pie chart - no axes or grid lines, centered
    const centerX = width / 2
    const centerY = height / 2
    const radius = Math.min(width, height) / 2 - 40
    let currentAngle = -Math.PI / 2
    const total = values.reduce((sum: number, val: number) => sum + val, 0) || 1

    // Color palette for pie slices
    const colors = [
      '#1a73e8', '#34a853', '#fbbc04', '#ea4335',
      '#9c27b0', '#00acc1', '#ffc107', '#607d8b',
    ]

    // Draw pie slices
    values.forEach((value: number, index: number) => {
      const sliceAngle = (value / total) * 2 * Math.PI
      const x1 = centerX + radius * Math.cos(currentAngle)
      const y1 = centerY + radius * Math.sin(currentAngle)
      const x2 = centerX + radius * Math.cos(currentAngle + sliceAngle)
      const y2 = centerY + radius * Math.sin(currentAngle + sliceAngle)
      const largeArc = sliceAngle > Math.PI ? 1 : 0

      const path = `M ${centerX} ${centerY} L ${x1} ${y1} A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2} Z`
      const color = colors[index % colors.length]

      svg += `<path d="${path}" fill="${color}" stroke="#ffffff" stroke-width="2"/>`

      // Label for pie slice
      const labelAngle = currentAngle + sliceAngle / 2
      const labelRadius = radius * 0.7
      const labelX = centerX + labelRadius * Math.cos(labelAngle)
      const labelY = centerY + labelRadius * Math.sin(labelAngle)
      const percentage = ((value / total) * 100).toFixed(0)
      
      svg += `<text x="${labelX}" y="${labelY}" text-anchor="middle" font-weight="bold" fill="#ffffff" font-family="${fontFamily}" font-size="${fontSize}">${percentage}%</text>`

      currentAngle += sliceAngle
    })

    // Legend for pie chart (positioned to the right, centered vertically)
    const legendX = width - 120
    const legendY = height / 2 - (values.length * 20) / 2
    values.forEach((_value: number, index: number) => {
      const color = colors[index % colors.length]
      const legendItemY = legendY + (index * 20)
      
      svg += `<rect x="${legendX}" y="${legendItemY - 8}" width="12" height="12" fill="${color}"/>`
      svg += `<text x="${legendX + 18}" y="${legendItemY}" class="chart-text">${escapeHTML(labels[index] || `Item ${index + 1}`)}</text>`
    })
  }

  return `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">${svg}</svg>`
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
      font-family: 'Source Sans 3', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif;
      font-size: 16px;
      line-height: 1.75;
      color: #202124;
      padding: 0 50px 50px 50px;
      background: white;
    }
    
    body > *:first-child {
      margin-top: 0 !important;
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
      line-height: 1.75;
    }
    
    p:last-child {
      margin-bottom: 0;
    }
    
    hr {
      border: none;
      border-top: 1px solid #E6E5E3;
      margin-top: 0.75em;
      margin-bottom: 0.75em;
      height: 0;
    }
    
    strong, b, [style*="font-weight: bold"], [style*="font-weight:bold"], [style*="font-weight: 700"], [style*="font-weight:700"] {
      font-weight: 600 !important;
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
    
    /* Table styling for PDF export */
    table {
      border-collapse: collapse;
      width: 100%;
      margin: 16px 0;
      page-break-inside: avoid;
      break-inside: avoid;
      font-size: 14px;
    }
    
    table th {
      border: 1px solid #ddd;
      padding: 10px 12px;
      text-align: left;
      background-color: transparent;
      font-weight: 600;
    }
    
    table td {
      border: 1px solid #ddd;
      padding: 10px 12px;
      text-align: left;
    }
    
    table thead {
      background-color: transparent;
    }
    
    table tbody tr {
      background-color: transparent;
    }
    
    div[data-table-block],
    div:has(table) {
      page-break-inside: avoid;
      break-inside: avoid;
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

    let content = JSON.parse(document.content)
    
    // Preprocess content to convert document:// URLs to data URLs
    content = await preprocessContentForExport(content)

    if (format === 'pdf') {
      return this.exportToPDF(document.title, content)
    } else {
      return this.exportToDOCX(document.title, content)
    }
  },

  async exportMultipleDocuments(documentIds: string[], format: 'pdf' | 'docx', usePageBreaks: boolean = true): Promise<Buffer> {
    console.log('[Export Service] exportMultipleDocuments - usePageBreaks:', usePageBreaks, 'type:', typeof usePageBreaks)
    if (documentIds.length === 0) {
      throw new Error('No documents selected')
    }

    // Load all documents and preprocess content
    const documents: Document[] = []
    for (const id of documentIds) {
      const doc = await documentService.getById(id)
      if (!doc) {
        throw new Error(`Document not found: ${id}`)
      }
      // Preprocess content to convert document:// URLs to data URLs
      const content = JSON.parse(doc.content)
      const processedContent = await preprocessContentForExport(content)
      documents.push({
        ...doc,
        content: JSON.stringify(processedContent)
      })
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
      return this.exportMultipleToPDF(documents, usePageBreaks)
    } else {
      return this.exportMultipleToDOCX(documents, usePageBreaks)
    }
  },

  async exportToPDF(title: string, content: any): Promise<Buffer> {
    const browser = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox', 
        '--disable-setuid-sandbox',
        '--disable-web-security', // Allow cross-origin images
        '--allow-file-access-from-files', // Allow local file access
        '--disable-features=VizDisplayCompositor' // Improve compatibility
      ]
    })

    try {
      const page = await browser.newPage()
      // Large documents can take a long time to render
      page.setDefaultNavigationTimeout(600000)
      
      // Convert TipTap JSON to HTML
      const bodyHTML = tipTapToHTML(content)
      let html = generateHTMLDocument(bodyHTML)
      html = await inlineExternalImages(html)
      
      // Set content with timeout
      await page.setContent(html, { 
        waitUntil: 'load',
        timeout: 120000 // 2 minutes timeout
      })
      
      // Wait for all images to load
      await page.evaluate(() => {
        // This code runs in browser context, so document is available
        // @ts-ignore - document is available in browser context
        const doc: any = document
        return Promise.all(
          Array.from(doc.images).map((img: any, index: number) => {
            return new Promise<void>((resolve) => {
              // If image is already loaded, resolve immediately
              if (img.complete && img.naturalHeight !== 0) {
                console.log(`Image ${index} already loaded: ${img.src.substring(0, 50)}`)
                resolve()
                return
              }
              
              // Set timeout to prevent hanging
              const timeout = setTimeout(() => {
                console.warn(`Image ${index} load timeout: ${img.src.substring(0, 50)}`)
                resolve() // Continue even if image fails
              }, 10000) // 10 second timeout per image
              
              img.onload = () => {
                clearTimeout(timeout)
                resolve()
              }
              
              img.onerror = () => {
                clearTimeout(timeout)
                resolve() // Continue even if image fails
              }
            })
          })
        )
      })
      
      // Generate PDF
      const pdfBuffer = await page.pdf({
        format: 'A4',
        printBackground: true,
        margin: {
          top: '70px',
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

  async exportMultipleToPDF(documents: Document[], usePageBreaks: boolean = true): Promise<Buffer> {
    const browser = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox', 
        '--disable-setuid-sandbox',
        '--disable-web-security', // Allow cross-origin images
        '--allow-file-access-from-files', // Allow local file access
        '--disable-features=VizDisplayCompositor' // Improve compatibility
      ]
    })

    try {
      const page = await browser.newPage()
      
      // Combine all documents into one HTML
      let combinedHTML = ''
      documents.forEach((doc, index) => {
        const content = JSON.parse(doc.content)
        const bodyHTML = tipTapToHTML(content)
        
        // Add separator between documents (except before the first)
        if (index > 0) {
          if (usePageBreaks) {
            console.log('[Export Service] Adding page break between documents')
            combinedHTML += '<div class="page-break"></div>'
          } else {
            console.log('[Export Service] Adding spacing instead of page break')
            // Add spacing instead of page break (total ~2em spacing)
            combinedHTML += '<div style="margin-top: 1em; margin-bottom: 1em;"></div>'
          }
        }
        
        combinedHTML += bodyHTML
      })
      
      let html = generateHTMLDocument(combinedHTML)
      html = await inlineExternalImages(html)
      
      // Set content with timeout
      await page.setContent(html, { 
        waitUntil: 'load',
        timeout: 600000 // 10 minutes timeout
      })
      
      // Wait for all images to load
      await page.evaluate(() => {
        // This code runs in browser context, so document is available
        // @ts-ignore - document is available in browser context
        const doc: any = document
        return Promise.all(
          Array.from(doc.images).map((img: any, index: number) => {
            return new Promise<void>((resolve) => {
              // If image is already loaded, resolve immediately
              if (img.complete && img.naturalHeight !== 0) {
                resolve()
                return
              }
              
              // Set timeout to prevent hanging
              const timeout = setTimeout(() => {
                resolve() // Continue even if image fails
              }, 10000) // 10 second timeout per image
              
              img.onload = () => {
                clearTimeout(timeout)
                resolve()
              }
              
              img.onerror = () => {
                clearTimeout(timeout)
                resolve() // Continue even if image fails
              }
            })
          })
        )
      })
      
      // Generate PDF
      const pdfBuffer = await page.pdf({
        format: 'A4',
        printBackground: true,
        margin: {
          top: '70px',
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
    const docxElements: (Paragraph | Table)[] = []

    // Helper function to convert base64 data URL to Buffer
    const base64ToBuffer = (dataUrl: string): { buffer: Buffer; width: number; height: number } | null => {
      try {
        const matches = dataUrl.match(/^data:image\/(\w+);base64,(.+)$/)
        if (!matches) return null
        
        const base64Data = matches[2]
        const buffer = Buffer.from(base64Data, 'base64')
        
        // For DOCX, we'll use default dimensions if not provided
        // In a real implementation, you might want to parse image dimensions
        return { buffer, width: 400, height: 300 }
      } catch (e) {
        return null
      }
    }

    // Helper function to process TipTap nodes recursively
    const processNode = (node: any): void => {
      if (!node || !node.type) return

      if (node.type === 'paragraph') {
        const runs: (TextRun | ImageRun)[] = []
        
        if (node.content && Array.isArray(node.content)) {
          for (const child of node.content) {
            if (child.type === 'text') {
              let textRun: TextRun = new TextRun({
                text: child.text || '',
              })

              // Apply marks
              if (child.marks && Array.isArray(child.marks)) {
                const attrs: any = {}
                child.marks.forEach((mark: any) => {
                  if (mark.type === 'bold') attrs.bold = true
                  if (mark.type === 'italic') attrs.italics = true
                  if (mark.type === 'underline') attrs.underline = {}
                  if (mark.type === 'textStyle' && mark.attrs) {
                    if (mark.attrs.color) attrs.color = mark.attrs.color.replace('#', '')
                    if (mark.attrs.fontSize) attrs.size = mark.attrs.fontSize * 2 // half-points
                    if (mark.attrs.fontFamily) attrs.font = mark.attrs.fontFamily
                  }
                })
                textRun = new TextRun({ text: child.text || '', ...attrs })
              }
              
              runs.push(textRun)
            } else if (child.type === 'image') {
              // Handle image node
              const src = child.attrs?.src || ''
              if (src.startsWith('data:image/')) {
                const imageData = base64ToBuffer(src)
                if (imageData) {
                  const width = child.attrs?.width || imageData.width
                  const height = child.attrs?.height || imageData.height
                  try {
                    runs.push(
                      new ImageRun({
                        data: imageData.buffer,
                        transformation: {
                          width: Math.min(width, 600), // Max 600px width
                          height: Math.min(height, (height / width) * 600),
                        },
                        type: 'png', // Default to PNG, will be detected from data if possible
                      })
                    )
                  } catch (e) {
                    // If image fails, add placeholder text
                    runs.push(new TextRun({ text: '[Image]', italics: true }))
                  }
                }
              }
            }
          }
        }

        const alignment = 
          node.attrs?.textAlign === 'center' ? AlignmentType.CENTER :
          node.attrs?.textAlign === 'right' ? AlignmentType.RIGHT :
          node.attrs?.textAlign === 'justify' ? AlignmentType.JUSTIFIED :
          AlignmentType.LEFT

        if (runs.length > 0) {
          docxElements.push(
            new Paragraph({
              children: runs,
              alignment,
              spacing: { after: 200 },
            })
          )
        } else {
          // Empty paragraph
          docxElements.push(
            new Paragraph({
              children: [new TextRun('')],
              spacing: { after: 200 },
            })
          )
        }
      } else if (node.type === 'heading') {
        const runs: TextRun[] = []
        
        if (node.content && Array.isArray(node.content)) {
          for (const child of node.content) {
            if (child.type === 'text') {
              let textRun: TextRun = new TextRun({
                text: child.text || '',
              })

              if (child.marks && Array.isArray(child.marks)) {
                const attrs: any = {}
                child.marks.forEach((mark: any) => {
                  if (mark.type === 'bold') attrs.bold = true
                  if (mark.type === 'italic') attrs.italics = true
                  if (mark.type === 'textStyle' && mark.attrs) {
                    if (mark.attrs.color) attrs.color = mark.attrs.color.replace('#', '')
                    if (mark.attrs.fontSize) attrs.size = mark.attrs.fontSize * 2
                    if (mark.attrs.fontFamily) attrs.font = mark.attrs.fontFamily
                  }
                })
                textRun = new TextRun({ text: child.text || '', ...attrs })
              }
              
              runs.push(textRun)
            }
          }
        }

        const level = node.attrs?.level || 1
        const headingLevel =
          level === 1 ? HeadingLevel.HEADING_1 :
          level === 2 ? HeadingLevel.HEADING_2 :
          level === 3 ? HeadingLevel.HEADING_3 :
          HeadingLevel.HEADING_1

        const alignment = 
          node.attrs?.textAlign === 'center' ? AlignmentType.CENTER :
          node.attrs?.textAlign === 'right' ? AlignmentType.RIGHT :
          node.attrs?.textAlign === 'justify' ? AlignmentType.JUSTIFIED :
          AlignmentType.LEFT

        if (runs.length > 0) {
          docxElements.push(
            new Paragraph({
              children: runs,
              heading: headingLevel,
              alignment,
              spacing: { after: 240, before: 240 },
            })
          )
        }
      } else if (node.type === 'title') {
        const runs: TextRun[] = []
        
        if (node.content && Array.isArray(node.content)) {
          for (const child of node.content) {
            if (child.type === 'text') {
              runs.push(new TextRun({ text: child.text || '', bold: true, size: 32 }))
            }
          }
        }

        if (runs.length > 0) {
          docxElements.push(
            new Paragraph({
              children: runs,
              heading: HeadingLevel.TITLE,
              alignment: AlignmentType.CENTER,
              spacing: { after: 300 },
            })
          )
        }
      } else if (node.type === 'subtitle') {
        const runs: TextRun[] = []
        
        if (node.content && Array.isArray(node.content)) {
          for (const child of node.content) {
            if (child.type === 'text') {
              runs.push(new TextRun({ text: child.text || '', size: 24 }))
            }
          }
        }

        if (runs.length > 0) {
          docxElements.push(
            new Paragraph({
              children: runs,
              heading: HeadingLevel.HEADING_2,
              spacing: { after: 200 },
            })
          )
        }
      } else if (node.type === 'image') {
        // Standalone image node
        const src = node.attrs?.src || ''
        // After preprocessing, document:// URLs should be converted to data URLs
        // But we also check for data-document-src as fallback
        const documentSrc = node.attrs?.['data-document-src'] || ''
        const actualSrc = documentSrc || src
        
        // Handle data URLs (including converted document:// URLs)
        if (actualSrc.startsWith('data:image/') || src.startsWith('data:image/')) {
          const imageSrcToUse = actualSrc.startsWith('data:image/') ? actualSrc : src
          const imageData = base64ToBuffer(imageSrcToUse)
          if (imageData) {
            const width = node.attrs?.width || imageData.width
            const height = node.attrs?.height || imageData.height
            try {
              docxElements.push(
                new Paragraph({
                  children: [
                    new ImageRun({
                      data: imageData.buffer,
                      transformation: {
                        width: Math.min(width, 600),
                        height: Math.min(height, (height / width) * 600),
                      },
                      type: 'png', // Default to PNG
                    })
                  ],
                  alignment: AlignmentType.CENTER,
                  spacing: { after: 200 },
                })
              )
            } catch (e) {
              // If image fails, add placeholder
              docxElements.push(
                new Paragraph({
                  children: [new TextRun({ text: '[Image]', italics: true })],
                  alignment: AlignmentType.CENTER,
                  spacing: { after: 200 },
                })
              )
            }
          }
        }
      } else if (node.type === 'chart') {
        // Chart node - convert to description text for now
        // In a full implementation, you might want to render chart as image
        const chartType = node.attrs?.chartType || 'chart'
        const chartName = node.attrs?.chartName || ''
        const chartText = chartName ? `${chartName} (${chartType} chart)` : `${chartType} chart`
        
        docxElements.push(
          new Paragraph({
            children: [new TextRun({ text: chartText, italics: true })],
            spacing: { after: 200 },
          })
        )
      } else if (node.type === 'horizontalRule') {
        // Horizontal rule - add a paragraph with spacing to represent separator
        // DOCX doesn't have native horizontal rule, so we use spacing
        docxElements.push(
          new Paragraph({
            children: [new TextRun('')],
            spacing: { after: 300, before: 300 },
          })
        )
      } else if (node.type === 'tableBlock') {
        // Table node - parse HTML and convert to DOCX table
        const html = node.attrs?.html || ''
        if (html) {
          try {
            // Simple HTML table parser
            const tableMatch = html.match(/<table[^>]*>([\s\S]*?)<\/table>/i)
            if (tableMatch) {
              const tableContent = tableMatch[1]
              const rows: TableRow[] = []
              
              // Extract rows
              const rowMatches = tableContent.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)
              for (const rowMatch of rowMatches) {
                const rowContent = rowMatch[1]
                const cells: TableCell[] = []
                
                // Extract cells (handle both th and td)
                const cellMatches = rowContent.matchAll(/<(th|td)[^>]*>([\s\S]*?)<\/(th|td)>/gi)
                for (const cellMatch of cellMatches) {
                  const cellText = cellMatch[2].replace(/<[^>]+>/g, '').trim()
                  cells.push(
                    new TableCell({
                      children: [
                        new Paragraph({
                          children: [new TextRun(cellText || ' ')],
                        })
                      ],
                      margins: {
                        top: 100,
                        bottom: 100,
                        left: 100,
                        right: 100,
                      },
                    })
                  )
                }
                
                if (cells.length > 0) {
                  rows.push(new TableRow({ children: cells }))
                }
              }
              
              if (rows.length > 0) {
                docxElements.push(
                  new Table({
                    rows,
                    width: {
                      size: 100,
                      type: WidthType.PERCENTAGE,
                    },
                  })
                )
                // Add spacing after table
                docxElements.push(
                  new Paragraph({
                    children: [new TextRun('')],
                    spacing: { after: 200 },
                  })
                )
              }
            }
          } catch (e) {
            // If table parsing fails, add a placeholder
            docxElements.push(
              new Paragraph({
                children: [new TextRun({ text: '[Table]', italics: true })],
                spacing: { after: 200 },
              })
            )
          }
        }
      } else if (node.type === 'bulletList' || node.type === 'orderedList') {
        // Handle lists
        if (node.content && Array.isArray(node.content)) {
          node.content.forEach((listItem: any) => {
            if (listItem.type === 'listItem' && listItem.content) {
              const runs: TextRun[] = []
              listItem.content.forEach((itemChild: any) => {
                if (itemChild.type === 'paragraph' && itemChild.content) {
                  itemChild.content.forEach((textNode: any) => {
                    if (textNode.type === 'text') {
                      runs.push(new TextRun({ text: textNode.text || '' }))
                    }
                  })
                }
              })
              
              if (runs.length > 0) {
                docxElements.push(
                  new Paragraph({
                    children: runs,
                    bullet: { level: 0 },
                    spacing: { after: 100 },
                  })
                )
              }
            }
          })
        }
      } else if (node.content && Array.isArray(node.content)) {
        // Recursively process children
        node.content.forEach(processNode)
      }
    }

    // Process all nodes
    if (content.content && Array.isArray(content.content)) {
      content.content.forEach(processNode)
    }

    // Create document with proper metadata for Google Docs compatibility
    const doc = new DocxDocument({
      creator: 'Lemona',
      title: title,
      description: `Document exported from Lemona: ${title}`,
      sections: [
        {
          properties: {
            page: {
              size: {
                width: 12240, // A4 width in twips (20th of a point)
                height: 15840, // A4 height in twips
              },
              margin: {
                top: 1440, // 1 inch = 1440 twips
                right: 1440,
                bottom: 1440,
                left: 1440,
              },
            },
          },
          children: docxElements.length > 0 ? docxElements : [
            new Paragraph({
              children: [new TextRun('')],
            })
          ],
        },
      ],
    })

    return await Packer.toBuffer(doc)
  },

  async exportMultipleToDOCX(documents: Document[], usePageBreaks: boolean = true): Promise<Buffer> {
    // Combine all documents into one
    const allElements: (Paragraph | Table)[] = []

    // Helper function to convert base64 data URL to Buffer
    const base64ToBuffer = (dataUrl: string): { buffer: Buffer; width: number; height: number } | null => {
      try {
        const matches = dataUrl.match(/^data:image\/(\w+);base64,(.+)$/)
        if (!matches) return null
        
        const base64Data = matches[2]
        const buffer = Buffer.from(base64Data, 'base64')
        return { buffer, width: 400, height: 300 }
      } catch (e) {
        return null
      }
    }

    // Helper function to process TipTap nodes recursively
    const processNode = (node: any): void => {
      if (!node || !node.type) return

      if (node.type === 'paragraph') {
        const runs: (TextRun | ImageRun)[] = []
        
        if (node.content && Array.isArray(node.content)) {
          for (const child of node.content) {
            if (child.type === 'text') {
              let textRun: TextRun = new TextRun({ text: child.text || '' })
              if (child.marks && Array.isArray(child.marks)) {
                const attrs: any = {}
                child.marks.forEach((mark: any) => {
                  if (mark.type === 'bold') attrs.bold = true
                  if (mark.type === 'italic') attrs.italics = true
                  if (mark.type === 'underline') attrs.underline = {}
                  if (mark.type === 'textStyle' && mark.attrs) {
                    if (mark.attrs.color) attrs.color = mark.attrs.color.replace('#', '')
                    if (mark.attrs.fontSize) attrs.size = mark.attrs.fontSize * 2
                    if (mark.attrs.fontFamily) attrs.font = mark.attrs.fontFamily
                  }
                })
                textRun = new TextRun({ text: child.text || '', ...attrs })
              }
              runs.push(textRun)
            } else if (child.type === 'image') {
              const src = child.attrs?.src || ''
              if (src.startsWith('data:image/')) {
                const imageData = base64ToBuffer(src)
                if (imageData) {
                  const width = child.attrs?.width || imageData.width
                  const height = child.attrs?.height || imageData.height
                  try {
                    runs.push(
                      new ImageRun({
                        data: imageData.buffer,
                        transformation: {
                          width: Math.min(width, 600),
                          height: Math.min(height, (height / width) * 600),
                        },
                        type: 'png',
                      })
                    )
                  } catch (e) {
                    runs.push(new TextRun({ text: '[Image]', italics: true }))
                  }
                }
              }
            }
          }
        }

        const alignment = 
          node.attrs?.textAlign === 'center' ? AlignmentType.CENTER :
          node.attrs?.textAlign === 'right' ? AlignmentType.RIGHT :
          node.attrs?.textAlign === 'justify' ? AlignmentType.JUSTIFIED :
          AlignmentType.LEFT

        allElements.push(
          new Paragraph({
            children: runs.length > 0 ? runs : [new TextRun('')],
            alignment,
            spacing: { after: 200 },
          })
        )
      } else if (node.type === 'heading') {
        const runs: TextRun[] = []
        if (node.content && Array.isArray(node.content)) {
          for (const child of node.content) {
            if (child.type === 'text') {
              let textRun: TextRun = new TextRun({ text: child.text || '' })
              if (child.marks && Array.isArray(child.marks)) {
                const attrs: any = {}
                child.marks.forEach((mark: any) => {
                  if (mark.type === 'bold') attrs.bold = true
                  if (mark.type === 'italic') attrs.italics = true
                  if (mark.type === 'textStyle' && mark.attrs) {
                    if (mark.attrs.color) attrs.color = mark.attrs.color.replace('#', '')
                    if (mark.attrs.fontSize) attrs.size = mark.attrs.fontSize * 2
                    if (mark.attrs.fontFamily) attrs.font = mark.attrs.fontFamily
                  }
                })
                textRun = new TextRun({ text: child.text || '', ...attrs })
              }
              runs.push(textRun)
            }
          }
        }

        const level = node.attrs?.level || 1
        const headingLevel =
          level === 1 ? HeadingLevel.HEADING_1 :
          level === 2 ? HeadingLevel.HEADING_2 :
          level === 3 ? HeadingLevel.HEADING_3 :
          HeadingLevel.HEADING_1

        const alignment = 
          node.attrs?.textAlign === 'center' ? AlignmentType.CENTER :
          node.attrs?.textAlign === 'right' ? AlignmentType.RIGHT :
          node.attrs?.textAlign === 'justify' ? AlignmentType.JUSTIFIED :
          AlignmentType.LEFT

        if (runs.length > 0) {
          allElements.push(
            new Paragraph({
              children: runs,
              heading: headingLevel,
              alignment,
              spacing: { after: 240, before: 240 },
            })
          )
        }
      } else if (node.type === 'title') {
        const runs: TextRun[] = []
        if (node.content && Array.isArray(node.content)) {
          for (const child of node.content) {
            if (child.type === 'text') {
              runs.push(new TextRun({ text: child.text || '', bold: true, size: 32 }))
            }
          }
        }
        if (runs.length > 0) {
          allElements.push(
            new Paragraph({
              children: runs,
              heading: HeadingLevel.TITLE,
              alignment: AlignmentType.CENTER,
              spacing: { after: 300 },
            })
          )
        }
      } else if (node.type === 'image') {
        const src = node.attrs?.src || ''
        if (src.startsWith('data:image/')) {
          const imageData = base64ToBuffer(src)
          if (imageData) {
            const width = node.attrs?.width || imageData.width
            const height = node.attrs?.height || imageData.height
            try {
              allElements.push(
                new Paragraph({
                  children: [
                    new ImageRun({
                      data: imageData.buffer,
                      transformation: {
                        width: Math.min(width, 600),
                        height: Math.min(height, (height / width) * 600),
                      },
                      type: 'png',
                    })
                  ],
                  alignment: AlignmentType.CENTER,
                  spacing: { after: 200 },
                })
              )
            } catch (e) {
              allElements.push(
                new Paragraph({
                  children: [new TextRun({ text: '[Image]', italics: true })],
                  spacing: { after: 200 },
                })
              )
            }
          }
        }
      } else if (node.type === 'chart') {
        const chartType = node.attrs?.chartType || 'chart'
        const chartName = node.attrs?.chartName || ''
        const chartText = chartName ? `${chartName} (${chartType} chart)` : `${chartType} chart`
        allElements.push(
          new Paragraph({
            children: [new TextRun({ text: chartText, italics: true })],
            spacing: { after: 200 },
          })
        )
      } else if (node.type === 'horizontalRule') {
        // Horizontal rule - add a paragraph with spacing to represent separator
        allElements.push(
          new Paragraph({
            children: [new TextRun('')],
            spacing: { after: 300, before: 300 },
          })
        )
      } else if (node.type === 'tableBlock') {
        const html = node.attrs?.html || ''
        if (html) {
          try {
            const tableMatch = html.match(/<table[^>]*>([\s\S]*?)<\/table>/i)
            if (tableMatch) {
              const tableContent = tableMatch[1]
              const rows: TableRow[] = []
              const rowMatches = tableContent.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)
              for (const rowMatch of rowMatches) {
                const rowContent = rowMatch[1]
                const cells: TableCell[] = []
                const cellMatches = rowContent.matchAll(/<(th|td)[^>]*>([\s\S]*?)<\/(th|td)>/gi)
                for (const cellMatch of cellMatches) {
                  const cellText = cellMatch[2].replace(/<[^>]+>/g, '').trim()
                  cells.push(
                    new TableCell({
                      children: [
                        new Paragraph({
                          children: [new TextRun(cellText || ' ')],
                        })
                      ],
                      margins: { top: 100, bottom: 100, left: 100, right: 100 },
                    })
                  )
                }
                if (cells.length > 0) {
                  rows.push(new TableRow({ children: cells }))
                }
              }
              if (rows.length > 0) {
                allElements.push(
                  new Table({
                    rows,
                    width: { size: 100, type: WidthType.PERCENTAGE },
                  })
                )
                allElements.push(
                  new Paragraph({
                    children: [new TextRun('')],
                    spacing: { after: 200 },
                  })
                )
              }
            }
          } catch (e) {
            allElements.push(
              new Paragraph({
                children: [new TextRun({ text: '[Table]', italics: true })],
                spacing: { after: 200 },
              })
            )
          }
        }
      } else if (node.content && Array.isArray(node.content)) {
        node.content.forEach(processNode)
      }
    }

    // Process each document
    documents.forEach((document, index) => {
      if (index > 0) {
        if (usePageBreaks) {
          allElements.push(
            new Paragraph({
              children: [new PageBreak()],
            })
          )
        } else {
          // Add spacing paragraph instead of page break (total ~400 twips spacing)
          allElements.push(
            new Paragraph({
              children: [new TextRun('')],
              spacing: { after: 400 },
            })
          )
        }
      }

      const content = JSON.parse(document.content)
      if (content.content && Array.isArray(content.content)) {
        content.content.forEach(processNode)
      }
    })

    // Create document with proper metadata
    const doc = new DocxDocument({
      creator: 'Lemona',
      title: documents.length === 1 ? documents[0].title : 'Multiple Documents',
      description: `Document exported from Lemona`,
      sections: [
        {
          properties: {
            page: {
              size: {
                width: 12240, // A4 width in twips
                height: 15840, // A4 height in twips
              },
              margin: {
                top: 1440,
                right: 1440,
                bottom: 1440,
                left: 1440,
              },
            },
          },
          children: allElements.length > 0 ? allElements : [
            new Paragraph({
              children: [new TextRun('')],
            })
          ],
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
