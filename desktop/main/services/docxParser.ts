// DOCX Parser Service - Parse DOCX files and detect chapters
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
import { GenericStructuralBoundaryDetector, Paragraph, StructuralBoundary } from './structuralBoundaryDetector.js'

export interface Chapter {
  title: string
  content: string // HTML content of the chapter
  startIndex: number // Start index in the document
  endIndex: number // End index in the document
  level: number // Heading level (1, 2, etc.)
  confidence?: number // Detection confidence (0~1)
  signals?: string[] // Detection signals
}

export interface DocxParseResult {
  chapters: Chapter[]
  fullContent: string // Full HTML content
  hasChapters: boolean // Whether chapters were detected
  boundaries?: StructuralBoundary[] // Structural boundaries detected
  paragraphs?: Paragraph[] // Paragraph AST
}

/**
 * Parse DOCX file and detect chapters
 * Chapters are detected by:
 * 1. Heading styles (Heading 1, Heading 2, etc.)
 * 2. Text patterns (e.g., "第 X 章", "Chapter X", etc.)
 */
export async function parseDocx(filePath: string): Promise<DocxParseResult> {
  try {
    const fileBuffer = await fs.readFile(filePath)
    
    // Convert DOCX to HTML with style information and image extraction
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
          // Convert images to base64 data URLs
          return image.read('base64').then((imageBuffer: Buffer) => {
            if (imageBuffer) {
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
    
    // Extract paragraphs with style information
    const paragraphs = extractParagraphs(html, result.messages)
    
    // Use GenericStructuralBoundaryDetector to detect boundaries
    const detector = new GenericStructuralBoundaryDetector(paragraphs)
    const boundaries = detector.detect()
    
    // Parse HTML to detect chapters (legacy method, can be enhanced with boundaries)
    const chapters = detectChapters(html, boundaries)
    
    return {
      chapters,
      fullContent: html,
      hasChapters: chapters.length > 0,
      boundaries,
      paragraphs,
    }
  } catch (error) {
    throw error
  }
}

/**
 * Extract paragraphs with style information from HTML
 */
function extractParagraphs(html: string, messages: any[]): Paragraph[] {
  const paragraphs: Paragraph[] = []
  const lines = html.split(/\r?\n/)
  
  let index = 0
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) continue
    
    // Extract text
    const text = extractTextFromHtml(trimmed)
    if (!text) continue
    
    // Detect heading level
    const headingMatch = trimmed.match(/^<h([1-6])[^>]*>/i)
    const level = headingMatch ? parseInt(headingMatch[1]) : 0
    
    // Detect style from HTML attributes or tags
    let style = 'Normal'
    if (level > 0) {
      style = `Heading${level}`
    } else if (trimmed.match(/<p[^>]*class=["']heading/i)) {
      style = 'Heading'
    }
    
    // Detect formatting
    const bold = /<strong|<b[^>]*>/i.test(trimmed) || /font-weight:\s*bold/i.test(trimmed)
    const italic = /<em|<i[^>]*>/i.test(trimmed) || /font-style:\s*italic/i.test(trimmed)
    const centered = /text-align:\s*center/i.test(trimmed) || /align=["']center["']/i.test(trimmed)
    
    // Extract font size (default 12pt)
    const fontSizeMatch = trimmed.match(/font-size:\s*(\d+(?:\.\d+)?)pt/i)
    const fontSize = fontSizeMatch ? parseFloat(fontSizeMatch[1]) : (level > 0 ? 14 + (6 - level) * 2 : 12)
    
    // Extract spacing (default 0)
    const spacingBeforeMatch = trimmed.match(/margin-top|padding-top:\s*(\d+(?:\.\d+)?)pt/i)
    const spacingAfterMatch = trimmed.match(/margin-bottom|padding-bottom:\s*(\d+(?:\.\d+)?)pt/i)
    const spacingBefore = spacingBeforeMatch ? parseFloat(spacingBeforeMatch[1]) : (level > 0 ? 12 : 0)
    const spacingAfter = spacingAfterMatch ? parseFloat(spacingAfterMatch[1]) : (level > 0 ? 6 : 0)
    
    paragraphs.push({
      text,
      style,
      bold,
      italic,
      centered,
      fontSize,
      spacingBefore,
      spacingAfter,
      index: index++,
    })
  }
  
  return paragraphs
}

/**
 * Detect chapters from HTML content (enhanced with boundaries)
 */
function detectChapters(html: string, boundaries?: StructuralBoundary[]): Chapter[] {
  const chapters: Chapter[] = []
  
  // If boundaries are provided, use them to detect chapters
  if (boundaries && boundaries.length > 0) {
    // Filter boundaries with high confidence (>0.4) or specific signals
    const highConfidenceBoundaries = boundaries.filter(b => 
      b.confidence > 0.4 || 
      b.signals.some(s => s.includes('chapter') || s.includes('heading-1') || s.includes('heading-2'))
    )
    
    const lines = html.split(/\r?\n/)
    
    for (let i = 0; i < highConfidenceBoundaries.length; i++) {
      const boundary = highConfidenceBoundaries[i]
      const nextBoundary = highConfidenceBoundaries[i + 1]
      
      // Extract content between boundaries
      const startIndex = boundary.index
      const endIndex = nextBoundary ? nextBoundary.index - 1 : lines.length - 1
      
      const content = lines.slice(startIndex, endIndex + 1).join('\n')
      
      // Determine level based on signals
      let level = 1
      if (boundary.signals.includes('heading-1') || boundary.signals.includes('chapter-en') || boundary.signals.includes('chapter-zh')) {
        level = 1
      } else if (boundary.signals.includes('heading-2') || boundary.signals.includes('part-en')) {
        level = 2
      } else if (boundary.signals.includes('heading-3') || boundary.signals.includes('section-en')) {
        level = 3
      }
      
      chapters.push({
        title: boundary.text,
        content,
        startIndex,
        endIndex,
        level,
        confidence: boundary.confidence,
        signals: boundary.signals,
      })
    }
    
    return chapters
  }
  
  // Fallback to original detection method
  // Regular expressions for chapter patterns
  const chapterPatterns = [
    /^第[一二三四五六七八九十\d]+章[：:：]?\s*(.+)$/i, // 第 X 章
    /^Chapter\s+[\dIVX]+[：:：]?\s*(.+)$/i, // Chapter X
    /^第[一二三四五六七八九十\d]+节[：:：]?\s*(.+)$/i, // 第 X 节
    /^Section\s+[\dIVX]+[：:：]?\s*(.+)$/i, // Section X
  ]
  
  // Split HTML into lines for processing
  const lines = html.split(/\r?\n/)
  let currentChapter: { title?: string; startIndex?: number; level?: number } | null = null
  let currentContent: string[] = []
  let chapterIndex = 0
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()
    
    // Check if line is a heading tag (h1, h2, etc.)
    const headingMatch = line.match(/^<h([1-6])[^>]*>(.+?)<\/h[1-6]>$/i)
    
    if (headingMatch) {
      const level = parseInt(headingMatch[1])
      const headingText = extractTextFromHtml(headingMatch[2])
      
      // Check if it matches chapter patterns or is a top-level heading
      const isChapter = level <= 2 || chapterPatterns.some(pattern => pattern.test(headingText))
      
      if (isChapter) {
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
        chapterIndex++
      } else {
        // Regular content, add to current chapter
        if (currentChapter) {
          currentContent.push(line)
        }
      }
    } else {
      // Regular content line
      if (currentChapter) {
        currentContent.push(line)
      } else {
        // Check if line matches chapter pattern (even without heading tag)
        const matchedPattern = chapterPatterns.find(pattern => pattern.test(line))
        if (matchedPattern) {
          const match = line.match(matchedPattern)
          if (match) {
            // Note: currentChapter is null here (we're in the else branch)
            // So we don't need to save a previous chapter
            
            // Start new chapter
            currentChapter = {
              title: match[1] || match[0],
              startIndex: i,
              level: 1,
            }
            currentContent = [line]
            chapterIndex++
          }
        }
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
  
  // If no chapters detected but document has content, treat entire document as one chapter
  if (chapters.length === 0 && html.trim().length > 0) {
    // This will be handled by the caller - no chapters means single file
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
    const tipTapContent = convertHtmlToTipTap(chapter.content)
    
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
 * Convert HTML content to TipTap JSON format using TipTap's official HTML parser
 * This uses @tiptap/html which properly handles all HTML structures
 */
export function convertHtmlToTipTap(html: string): any {
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
    
    return result
  } catch (error) {
    // Fallback to empty document
    return {
      type: 'doc',
      content: [{ type: 'paragraph', content: [] }],
    }
  }
}
