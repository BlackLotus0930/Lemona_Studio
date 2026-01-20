// Chunking Service - Split text into chunks for embedding
import { PDFTextContent } from '../../../shared/types.js'
import { estimateTokens } from './embeddingService.js'
import crypto from 'crypto'

// Chunking parameters
// Library folder uses larger chunks, workspace/project folder uses smaller chunks for better precision
export const DEFAULT_CHUNK_SIZE = 512 // tokens per chunk (library)
export const DEFAULT_CHUNK_OVERLAP = 100 // tokens overlap between chunks (library, ~19.5%)
export const WORKSPACE_CHUNK_SIZE = 384 // tokens per chunk (workspace/project)
export const WORKSPACE_CHUNK_OVERLAP = 75 // tokens overlap between chunks (workspace/project)

/**
 * Chunk metadata
 */
export interface Chunk {
  id: string // Unique chunk ID: fileId_chunkIndex
  fileId: string // Document ID
  chunkIndex: number // Index of chunk in file (0-based)
  text: string // Chunk text content
  hash: string // SHA-256 hash of chunk text (for change detection)
  startChar: number // Start character position in original text
  endChar: number // End character position in original text
  tokenCount: number // Estimated token count
}

/**
 * Generate SHA-256 hash for text
 */
function generateHash(text: string): string {
  return crypto.createHash('sha256').update(text, 'utf8').digest('hex')
}

/**
 * Split text into chunks with overlap
 * @param text Full text to chunk
 * @param chunkSize Target tokens per chunk (default: 500)
 * @param overlap Overlap tokens between chunks (default: 75)
 * @returns Array of chunk text segments with metadata
 */
function splitTextIntoChunks(
  text: string,
  chunkSize: number = DEFAULT_CHUNK_SIZE,
  overlap: number = DEFAULT_CHUNK_OVERLAP
): Array<{ text: string; startChar: number; endChar: number }> {
  if (!text || text.trim().length === 0) {
    return []
  }

  const chunks: Array<{ text: string; startChar: number; endChar: number }> = []
  
  // Estimate characters per token (rough: 4 chars = 1 token)
  const charsPerToken = 4
  const chunkSizeChars = chunkSize * charsPerToken
  const overlapChars = overlap * charsPerToken
  
  let startChar = 0
  const textLength = text.length
  
  while (startChar < textLength) {
    // Calculate end position
    let endChar = Math.min(startChar + chunkSizeChars, textLength)
    
    // Extract chunk text
    let chunkText = text.slice(startChar, endChar)
    
    // Try to break at sentence boundaries for better chunk quality
    // If not at the end of text, try to extend to next sentence boundary
    if (endChar < textLength) {
      // Look for sentence endings within the next 200 characters
      const lookahead = text.slice(endChar, Math.min(endChar + 200, textLength))
      const sentenceEnd = lookahead.search(/[.!?]\s+/)
      
      if (sentenceEnd >= 0) {
        endChar = endChar + sentenceEnd + 1
        chunkText = text.slice(startChar, endChar).trim()
      }
    }
    
    // Only add non-empty chunks
    if (chunkText.trim().length > 0) {
      chunks.push({
        text: chunkText.trim(),
        startChar,
        endChar,
      })
    }
    
    // Move start position with overlap
    // If this is the last chunk, break
    if (endChar >= textLength) {
      break
    }
    
    // Move start back by overlap amount
    startChar = endChar - overlapChars
    
    // Ensure we don't go backwards
    if (startChar <= chunks[chunks.length - 1]?.startChar || startChar < 0) {
      startChar = endChar
    }
  }
  
  return chunks
}

/**
 * Chunk plain text
 */
export function chunkText(
  text: string,
  fileId: string,
  chunkSize: number = DEFAULT_CHUNK_SIZE,
  overlap: number = DEFAULT_CHUNK_OVERLAP
): Chunk[] {
  if (!text || text.trim().length === 0) {
    return []
  }

  const textChunks = splitTextIntoChunks(text, chunkSize, overlap)
  
  return textChunks.map((chunk, index) => {
    const hash = generateHash(chunk.text)
    const tokenCount = estimateTokens(chunk.text)
    
    return {
      id: `${fileId}_chunk_${index}`,
      fileId,
      chunkIndex: index,
      text: chunk.text,
      hash,
      startChar: chunk.startChar,
      endChar: chunk.endChar,
      tokenCount,
    }
  })
}

/**
 * Chunk PDF text content
 * Uses fullText from PDFTextContent
 */
export function chunkPDF(
  pdfText: PDFTextContent,
  fileId: string,
  chunkSize: number = DEFAULT_CHUNK_SIZE,
  overlap: number = DEFAULT_CHUNK_OVERLAP
): Chunk[] {
  if (!pdfText || !pdfText.fullText) {
    return []
  }

  return chunkText(pdfText.fullText, fileId, chunkSize, overlap)
}

/**
 * Extract plain text from HTML (for DOCX)
 * Removes HTML tags and decodes entities
 */
function extractTextFromHtml(html: string): string {
  // Remove HTML tags
  let text = html.replace(/<[^>]+>/g, ' ')
  
  // Decode common HTML entities
  text = text
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&mdash;/g, '—')
    .replace(/&ndash;/g, '–')
    .replace(/&hellip;/g, '…')
  
  // Normalize whitespace
  text = text.replace(/\s+/g, ' ').trim()
  
  return text
}

/**
 * Chunk DOCX content (HTML format)
 * Extracts plain text from HTML and chunks it
 */
export function chunkDocx(
  docxHtml: string,
  fileId: string,
  chunkSize: number = DEFAULT_CHUNK_SIZE,
  overlap: number = DEFAULT_CHUNK_OVERLAP
): Chunk[] {
  if (!docxHtml || docxHtml.trim().length === 0) {
    return []
  }

  // Extract plain text from HTML
  const plainText = extractTextFromHtml(docxHtml)
  
  return chunkText(plainText, fileId, chunkSize, overlap)
}

/**
 * Chunk TipTap JSON content
 * Extracts plain text from TipTap document structure
 */
function extractTextFromTipTap(node: any): string {
  if (typeof node === 'string') {
    return node
  }
  
  if (node.type === 'text') {
    return node.text || ''
  }
  
  if (node.content && Array.isArray(node.content)) {
    return node.content.map(extractTextFromTipTap).join(' ')
  }
  
  return ''
}

/**
 * Chunk TipTap JSON document content
 */
export function chunkTipTap(
  tipTapContent: any,
  fileId: string,
  chunkSize: number = DEFAULT_CHUNK_SIZE,
  overlap: number = DEFAULT_CHUNK_OVERLAP
): Chunk[] {
  if (!tipTapContent) {
    return []
  }

  // Extract plain text from TipTap JSON
  const plainText = extractTextFromTipTap(tipTapContent)
  
  if (!plainText || plainText.trim().length === 0) {
    return []
  }

  return chunkText(plainText, fileId, chunkSize, overlap)
}

/**
 * Get chunk statistics
 */
export function getChunkStats(chunks: Chunk[]): {
  totalChunks: number
  totalTokens: number
  totalChars: number
  avgChunkSize: number
} {
  if (chunks.length === 0) {
    return {
      totalChunks: 0,
      totalTokens: 0,
      totalChars: 0,
      avgChunkSize: 0,
    }
  }

  const totalTokens = chunks.reduce((sum, chunk) => sum + chunk.tokenCount, 0)
  const totalChars = chunks.reduce((sum, chunk) => sum + chunk.text.length, 0)
  const avgChunkSize = totalTokens / chunks.length

  return {
    totalChunks: chunks.length,
    totalTokens,
    totalChars,
    avgChunkSize: Math.round(avgChunkSize),
  }
}

/**
 * Semantic block for Workspace documents (paragraph-level indexing)
 * Represents a heading + following paragraphs until next heading
 */
export interface SemanticBlock {
  paragraphId: string // UUID, unique identifier (identity)
  fileId: string // Document ID
  text: string // Semantic block text content (heading + paragraphs combined)
  hash: string // SHA-256 hash of block text (for change detection)
  paragraphIndex: number // Position index in document (attribute, not identity)
  headingText?: string // Heading text (if has heading)
  headingLevel?: number // Heading level (if has heading)
  paragraphCount: number // Number of paragraph nodes in this block
  tokenCount: number // Estimated token count
}

/**
 * Extract text from TipTap node (for semantic blocks)
 */
function extractTextFromTipTapNode(node: any): string {
  if (typeof node === 'string') {
    return node
  }
  
  if (node.type === 'text') {
    return node.text || ''
  }
  
  if (node.content && Array.isArray(node.content)) {
    return node.content.map(extractTextFromTipTapNode).join(' ')
  }
  
  return ''
}

/**
 * Chunk TipTap JSON content into semantic blocks
 * Semantic block = heading + following paragraphs (until next heading)
 * 
 * This function is specifically for Workspace documents (folder === 'project')
 * Library documents continue to use token-based chunking (chunkTipTap)
 * 
 * @param tipTapContent - TipTap JSON document content
 * @param fileId - Document ID
 * @returns Array of semantic blocks
 */
export function chunkTipTapToSemanticBlocks(
  tipTapContent: any,
  fileId: string
): SemanticBlock[] {
  if (!tipTapContent || !tipTapContent.content || !Array.isArray(tipTapContent.content)) {
    return []
  }

  const blocks: SemanticBlock[] = []
  interface CurrentBlockType {
    headingText?: string
    headingLevel?: number
    paragraphs: string[]
    paragraphCount: number
  }
  let currentBlock: CurrentBlockType | null = null
  let paragraphIndex = 0
  
  function pushSemanticBlock(
    blockText: string,
    headingText: string | undefined,
    headingLevel: number | undefined,
    paragraphCount: number
  ) {
    const splitBlocks = splitTextIntoChunks(
      blockText,
      WORKSPACE_CHUNK_SIZE,
      WORKSPACE_CHUNK_OVERLAP
    )

    for (const splitBlock of splitBlocks) {
      const text = splitBlock.text
      if (!text.trim()) {
        continue
      }

      const hash = generateHash(text)
      const tokenCount = estimateTokens(text)

      blocks.push({
        paragraphId: crypto.randomUUID(),
        fileId,
        text,
        hash,
        paragraphIndex: paragraphIndex++,
        headingText,
        headingLevel,
        paragraphCount,
        tokenCount,
      })
    }
  }

  /**
   * Traverse TipTap nodes and group into semantic blocks
   */
  function traverse(nodes: any[]) {
    for (const node of nodes) {
      if (node.type === 'heading') {
        // Save current block if exists
        if (currentBlock !== null && currentBlock.paragraphs.length > 0) {
          const block: CurrentBlockType = currentBlock // Type assertion for clarity
          const blockText = [
            block.headingText ? `#${'#'.repeat((block.headingLevel || 1) - 1)} ${block.headingText}` : '',
            ...block.paragraphs
          ].filter(Boolean).join('\n\n')
          
          if (blockText.trim()) {
            pushSemanticBlock(
              blockText,
              block.headingText,
              block.headingLevel,
              block.paragraphCount
            )
          }
        }
        
        // Start new block with heading
        const headingText = extractTextFromTipTapNode(node)
        const headingLevel = node.attrs?.level || 1
        
        if (headingText.trim()) {
          currentBlock = {
            headingText: headingText.trim(),
            headingLevel,
            paragraphs: [],
            paragraphCount: 0,
          }
        } else {
          currentBlock = {
            paragraphs: [],
            paragraphCount: 0,
          }
        }
      } else if (node.type === 'paragraph') {
        const paragraphText = extractTextFromTipTapNode(node)
        
        if (paragraphText.trim()) {
          // Initialize current block if doesn't exist (document starts with paragraphs)
          if (!currentBlock) {
            currentBlock = {
              paragraphs: [],
              paragraphCount: 0,
            }
          }
          
          currentBlock.paragraphs.push(paragraphText.trim())
          currentBlock.paragraphCount++
        }
      } else if (node.content && Array.isArray(node.content)) {
        // Recursively traverse nested content
        traverse(node.content)
      }
    }
  }

  // Start traversal
  traverse(tipTapContent.content)

  // Save last block if exists
  if (currentBlock !== null) {
    const block: CurrentBlockType = currentBlock
    if (block.paragraphs.length > 0) {
      const blockText = [
        block.headingText ? `#${'#'.repeat((block.headingLevel || 1) - 1)} ${block.headingText}` : '',
        ...block.paragraphs
      ].filter(Boolean).join('\n\n')
      
      if (blockText.trim()) {
        pushSemanticBlock(
          blockText,
          block.headingText,
          block.headingLevel,
          block.paragraphCount
        )
      }
    }
  }

  return blocks
}

export const chunkingService = {
  chunkText,
  chunkPDF,
  chunkDocx,
  chunkTipTap,
  chunkTipTapToSemanticBlocks,
  getChunkStats,
  DEFAULT_CHUNK_SIZE,
  DEFAULT_CHUNK_OVERLAP,
  WORKSPACE_CHUNK_SIZE,
  WORKSPACE_CHUNK_OVERLAP,
}

