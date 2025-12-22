// PDF Text Extraction Service
// Extracts text from PDF files per page/paragraph for search functionality
// Uses pdfjs-dist legacy build for Electron main process compatibility
import fs from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'
import { createRequire } from 'module'
import { PDFTextContent, PDFPageText } from '../../../shared/types.js'

// Import pdfjs-dist legacy build - works in Node.js/Electron main process
const require = createRequire(import.meta.url)
const pdfjsLib = require('pdfjs-dist/legacy/build/pdf.js')

// Get __dirname equivalent for ES modules
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Set worker source for pdfjs-dist (required for Node.js)
const pdfjsWorker = require.resolve('pdfjs-dist/legacy/build/pdf.worker.js')
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker

export interface PDFExtractionOptions {
  parsePerPage?: boolean // Extract text per page (default: true)
  extractParagraphs?: boolean // Extract paragraphs separately (default: true)
}

/**
 * Extract text from a PDF file using pdfjs-dist
 * @param filePath Path to the PDF file
 * @param options Extraction options
 * @returns PDFTextContent with text organized by page/paragraph
 */
export async function extractPDFText(
  filePath: string,
  options: PDFExtractionOptions = {}
): Promise<PDFTextContent> {
  const {
    parsePerPage = true,
    extractParagraphs = true,
  } = options

  try {
    console.log('[PDF Extraction] Starting extraction for:', filePath)
    
    // Read PDF file
    const dataBuffer = await fs.readFile(filePath)
    console.log('[PDF Extraction] File read, size:', dataBuffer.length, 'bytes')
    
    // Load PDF document using pdfjs-dist legacy build
    const loadingTask = pdfjsLib.getDocument({
      data: new Uint8Array(dataBuffer),
      useSystemFonts: true,
      verbosity: 0, // Suppress warnings
    })
    
    const pdfDocument = await loadingTask.promise
    console.log('[PDF Extraction] PDF loaded, pages:', pdfDocument.numPages)
    
    const pages: PDFPageText[] = []
    let fullText = ''
    
    // Extract text from each page
    for (let pageNum = 1; pageNum <= pdfDocument.numPages; pageNum++) {
      console.log(`[PDF Extraction] Extracting text from page ${pageNum}/${pdfDocument.numPages}`)
      
      const page = await pdfDocument.getPage(pageNum)
      const textContent = await page.getTextContent()
      
      // Combine all text items from the page
      let pageText = ''
      if (textContent.items && Array.isArray(textContent.items)) {
        pageText = textContent.items
          .map((item: any) => {
            // Handle different item types
            if (typeof item === 'string') return item
            if (item.str) return item.str
            return ''
          })
          .filter((text: string) => text.length > 0)
          .join(' ')
      }
      
      console.log(`[PDF Extraction] Page ${pageNum} text length:`, pageText.length)
      
      fullText += (fullText ? '\n\n' : '') + pageText
      
      // Split into paragraphs if requested
      const paragraphs = extractParagraphs 
        ? splitIntoParagraphs(pageText)
        : [pageText]
      
      pages.push({
        pageNumber: pageNum,
        paragraphs,
        fullText: pageText,
      })
    }
    
    console.log('[PDF Extraction] Extraction complete, total text length:', fullText.length)
    
    return {
      pages,
      fullText,
      extractedAt: new Date().toISOString(),
    }
  } catch (error) {
    console.error('[PDF Extraction] Error extracting PDF text:', error)
    // Return empty structure on error
    return {
      pages: [],
      fullText: '',
      extractedAt: new Date().toISOString(),
    }
  }
}

/**
 * Split text into paragraphs
 * @param text Text to split
 * @returns Array of paragraphs
 */
function splitIntoParagraphs(text: string): string[] {
  // Split by double newlines or single newlines with spacing
  return text
    .split(/\n\s*\n/)
    .map(p => p.trim())
    .filter(p => p.length > 0)
}

/**
 * Extract text from PDF asynchronously (background job)
 * This function can be called without blocking the main thread
 * @param filePath Path to the PDF file
 * @param documentId Document ID to update
 * @param updateCallback Optional callback to update document when extraction completes
 */
export async function extractPDFTextAsync(
  filePath: string,
  documentId: string,
  updateCallback?: (pdfText: PDFTextContent) => Promise<void>
): Promise<PDFTextContent> {
  console.log('[PDF Extraction] Starting async extraction for document:', documentId)
  
  // Run extraction in background
  const pdfText = await extractPDFText(filePath, {
    parsePerPage: true,
    extractParagraphs: true,
  })
  
  console.log('[PDF Extraction] Async extraction complete, pages:', pdfText.pages.length)
  
  // Call update callback if provided
  if (updateCallback) {
    console.log('[PDF Extraction] Calling update callback')
    await updateCallback(pdfText)
  }
  
  return pdfText
}
