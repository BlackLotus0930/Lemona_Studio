// DOCX Parser Service - Parse DOCX files and detect chapters
// Simple and effective: Only detects headings (h1-h6) using Mammoth
import mammoth from 'mammoth'
import fs from 'fs/promises'
import path from 'path'
import { generateJSON } from '@tiptap/html'
import StarterKit from '@tiptap/starter-kit'
import Image from '@tiptap/extension-image'
import Link from '@tiptap/extension-link'
import { TextStyle } from '@tiptap/extension-text-style'
import Underline from '@tiptap/extension-underline'
import TextAlign from '@tiptap/extension-text-align'
import { app } from 'electron'

export interface Chapter {
  title: string
  content: string // HTML content of the chapter
  startIndex: number // Start index in the document
  endIndex: number // End index in the document
  level: number // Heading level (1, 2, etc.)
}

export interface DocxParseResult {
  chapters: Chapter[]
  fullContent: string // Full HTML content
  hasChapters: boolean // Whether chapters were detected
}

/**
 * Parse DOCX file and detect chapters
 * Only detects headings (h1-h6) using Mammoth's style mapping
 */
export async function parseDocx(filePath: string): Promise<DocxParseResult> {
  try {
    const fileBuffer = await fs.readFile(filePath)
    
    // Convert DOCX to HTML with heading style mapping and image extraction
    const result = await mammoth.convertToHtml(
      { buffer: fileBuffer },
      {
        styleMap: [
          "p[style-name='Heading 1'] => h1:fresh",
          "p[style-name='Heading 2'] => h2:fresh",
          "p[style-name='Heading 3'] => h3:fresh",
          "p[style-name='Heading 4'] => h4:fresh",
          "p[style-name='Heading 5'] => h5:fresh",
          "p[style-name='Heading 6'] => h6:fresh",
        ],
        convertImage: mammoth.images.imgElement((image: any) => {
          // Convert images to base64 - we'll optimize large ones during post-processing
          return image.read('base64').then((imageBuffer: Buffer) => {
            if (imageBuffer && imageBuffer.length > 0) {
              const base64 = imageBuffer.toString('base64')
              const contentType = image.contentType || 'image/png'
              return {
                src: `data:${contentType};base64,${base64}`
              }
            }
            return { src: '' }
          }).catch((err: any) => {
            return { src: '' }
          })
        })
      }
    )
    const html = result.value
    
    // Detect chapters from headings only
    const chapters = detectChapters(html)
    
    return {
      chapters,
      fullContent: html,
      hasChapters: chapters.length > 0,
    }
  } catch (error) {
    throw error
  }
}

/**
 * Detect chapters from HTML content - only looks for heading tags (h1-h6)
 */
function detectChapters(html: string): Chapter[] {
  const chapters: Chapter[] = []
  const lines = html.split(/\r?\n/)
  
  let currentChapter: { title?: string; startIndex?: number; level?: number } | null = null
  let currentContent: string[] = []
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()
    
    // Check if line is a heading tag (h1, h2, etc.)
    const headingMatch = line.match(/^<h([1-6])[^>]*>(.+?)<\/h[1-6]>$/i)
    
    if (headingMatch) {
      const level = parseInt(headingMatch[1])
      const headingText = extractTextFromHtml(headingMatch[2])
      
      // Save previous chapter if exists
      if (currentChapter && currentChapter.title) {
        chapters.push({
          title: currentChapter.title,
          content: currentContent.join('\n'),
          startIndex: currentChapter.startIndex || 0,
          endIndex: i - 1,
          level: currentChapter.level || 1,
        })
      }
      
      // Start new chapter
      currentChapter = {
        title: headingText,
        startIndex: i,
        level: level,
      }
      currentContent = [line]
    } else {
      // Regular content line - add to current chapter if exists
      if (currentChapter) {
        currentContent.push(line)
      }
    }
  }
  
  // Add final chapter if exists
  if (currentChapter && currentChapter.title) {
    chapters.push({
      title: currentChapter.title,
      content: currentContent.join('\n'),
      startIndex: currentChapter.startIndex || 0,
      endIndex: lines.length - 1,
      level: currentChapter.level || 1,
    })
  }
  
  return chapters
}

/**
 * Extract plain text from HTML
 */
function extractTextFromHtml(html: string): string {
  // Remove HTML tags
  let text = html.replace(/<[^>]+>/g, '')
  // Decode HTML entities
  text = text
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
  return text.trim()
}

/**
 * Split DOCX content into separate chapter documents
 * Note: This function is called after parsing, so we use the already parsed chapters
 */
export async function splitDocxIntoChapters(
  filePath: string,
  chapters: Chapter[],
  baseFileName: string
): Promise<{ title: string; content: string }[]> {
  const result: { title: string; content: string }[] = []
  
  // Re-parse the file to get full content for each chapter
  const parseResult = await parseDocx(filePath)
  const allChapters = parseResult.chapters
  
  for (const chapter of allChapters) {
    // Create a document content from chapter HTML
    // Convert HTML to TipTap JSON format
    // Note: For split chapters, we don't have documentId yet, so images stay as base64
    const tipTapContent = await convertHtmlToTipTap(chapter.content)
    
    // Clean chapter title for filename
    const cleanTitle = chapter.title.replace(/[<>:"/\\|?*]/g, '').trim()
    const chapterTitle = cleanTitle || `Chapter ${result.length + 1}`
    
    result.push({
      title: `${baseFileName} - ${chapterTitle}`,
      content: JSON.stringify(tipTapContent),
    })
  }
  
  return result
}

/**
 * Extract images from TipTap JSON and store them as separate files
 * Returns the modified JSON with image references instead of base64
 */
async function extractAndStoreImages(tipTapContent: any, documentId: string): Promise<any> {
  if (!tipTapContent || !tipTapContent.content) {
    return tipTapContent
  }

  const FILES_DIR = path.join(app.getPath('userData'), 'files')
  await fs.mkdir(FILES_DIR, { recursive: true })

  // Recursively process nodes to find and replace images
  function processNode(node: any): any {
    if (!node) return node

    // If this is an image node with base64 data
    if (node.type === 'image' && node.attrs?.src) {
      const src = node.attrs.src
      
      // Check if it's a base64 data URL and if it's large (>100KB base64 = ~75KB image)
      if (src.startsWith('data:image/') && src.length > 100000) {
        try {
          // Extract base64 data
          const matches = src.match(/^data:image\/(\w+);base64,(.+)$/)
          if (matches) {
            const imageType = matches[1] || 'png'
            const base64Data = matches[2]
            
            // Convert base64 to buffer
            const imageBuffer = Buffer.from(base64Data, 'base64')
            
            // Generate unique image ID
            const imageId = `img_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
            const imageFileName = `${imageId}.${imageType}`
            const imagePath = path.join(FILES_DIR, `${documentId}_${imageFileName}`)
            
            // Save image file
            fs.writeFile(imagePath, imageBuffer).catch(() => {
              // Silently fail - if image save fails, keep base64
            })
            
            // Replace with document reference
            return {
              ...node,
              attrs: {
                ...node.attrs,
                src: `document://${documentId}/image/${imageId}`,
                fileName: imageFileName,
              }
            }
          }
        } catch (error) {
          // If extraction fails, keep original base64
        }
      }
    }

    // Recursively process children
    if (node.content && Array.isArray(node.content)) {
      return {
        ...node,
        content: node.content.map(processNode)
      }
    }

    return node
  }

  return {
    ...tipTapContent,
    content: tipTapContent.content.map(processNode)
  }
}

/**
 * Convert HTML content to TipTap JSON format using TipTap's official HTML parser
 * This uses @tiptap/html which properly handles all HTML structures
 * For large files, images are extracted and stored separately
 */
export async function convertHtmlToTipTap(html: string, documentId?: string): Promise<any> {
  if (!html || !html.trim()) {
    return {
      type: 'doc',
      content: [{ type: 'paragraph', content: [] }],
    }
  }
  
  try {
    // Use TipTap's official HTML parser with extensions that match the frontend
    // StarterKit includes: paragraph, heading, blockquote, codeBlock, horizontalRule, hardBreak, bold, italic, strike, code, bulletList, orderedList, listItem
    const extensions = [
      StarterKit.configure({
        // Keep all default extensions
      }),
      Image.configure({
        inline: true,
        allowBase64: true,
      }),
      Link.configure({
        openOnClick: false,
      }),
      TextStyle,
      Underline,
      TextAlign.configure({
        types: ['heading', 'paragraph'],
      }),
    ]
    
    const result = generateJSON(html, extensions)
    
    // If documentId is provided and content is large, extract images to separate files
    if (documentId && result.content) {
      // Estimate content size (rough approximation)
      const contentSize = JSON.stringify(result).length
      // If content is larger than 5MB, extract large images
      if (contentSize > 5 * 1024 * 1024) {
        return await extractAndStoreImages(result, documentId)
      }
    }
    
    return result
  } catch (error) {
    // Fallback to empty document
    return {
      type: 'doc',
      content: [{ type: 'paragraph', content: [] }],
    }
  }
}
