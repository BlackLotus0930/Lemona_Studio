// PDF Text Extraction Service
// Extracts text from PDF files per page/paragraph for search functionality
// Uses pdfjs-dist legacy build for Electron main process compatibility
import fs from 'fs/promises'
import path from 'path'
import { fileURLToPath, pathToFileURL } from 'url'
import { createRequire } from 'module'
import { PDFTextContent, PDFPageText } from '../../../shared/types.js'

// Import pdfjs-dist legacy build - works in Node.js/Electron main process
const require = createRequire(import.meta.url)
const pdfjsLib = require('pdfjs-dist/legacy/build/pdf.mjs')

// Get __dirname equivalent for ES modules
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Set worker source for pdfjs-dist (required for Node.js)
// pdfjs-dist 5.x requires file:// URL format on Windows
const pdfjsWorkerPath = require.resolve('pdfjs-dist/legacy/build/pdf.worker.mjs')
const pdfjsWorkerUrl = pathToFileURL(pdfjsWorkerPath).href
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorkerUrl

// Suppress canvas warnings - we only need text extraction, not rendering
// This prevents warnings about missing canvas.node module
if (typeof process !== 'undefined' && process.env) {
  // Suppress canvas-related warnings by setting environment variable
  process.env.CANVAS_PREBUILT = 'false'
}

// Override console.warn to filter out canvas warnings
const originalWarn = console.warn
console.warn = (...args: any[]) => {
  const message = args.join(' ')
  // Filter out canvas-related warnings
  if (message.includes('Cannot polyfill') && 
      (message.includes('DOMMatrix') || message.includes('Path2D')) &&
      message.includes('canvas.node')) {
    // Suppress this specific warning
    return
  }
  // Call original warn for other messages
  originalWarn.apply(console, args)
}

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
    
    // Check file size first to prevent memory issues
    const stats = await fs.stat(filePath)
    const fileSizeMB = stats.size / (1024 * 1024)
    console.log('[PDF Extraction] File size:', fileSizeMB.toFixed(2), 'MB')
    
    // For very large files (>50MB), use streaming approach
    // Read PDF file - pdfjs-dist can handle streaming with file path
    // Use file path directly instead of loading entire buffer for large files
    const loadingTask = fileSizeMB > 50
      ? pdfjsLib.getDocument({
          url: filePath, // Use file path for large files to avoid loading entire file into memory
          useSystemFonts: true,
          verbosity: 0,
          disableAutoFetch: true, // Disable auto-fetch to reduce memory usage
          disableStream: false, // Enable streaming
        })
      : pdfjsLib.getDocument({
          data: new Uint8Array(await fs.readFile(filePath)), // For smaller files, load into memory
          useSystemFonts: true,
          verbosity: 0,
        })
    
    const pdfDocument = await loadingTask.promise
    console.log('[PDF Extraction] PDF loaded, pages:', pdfDocument.numPages)
    
    const pages: PDFPageText[] = []
    let fullText = ''
    const totalPages = pdfDocument.numPages
    
    // Extract text from each page with memory management
    // Process pages in batches and clear page references to free memory
    const BATCH_SIZE = fileSizeMB > 50 ? 5 : 10 // Smaller batches for large files
    
    for (let batchStart = 1; batchStart <= totalPages; batchStart += BATCH_SIZE) {
      const batchEnd = Math.min(batchStart + BATCH_SIZE - 1, totalPages)
      
      for (let pageNum = batchStart; pageNum <= batchEnd; pageNum++) {
        try {
          console.log(`[PDF Extraction] Extracting text from page ${pageNum}/${totalPages}`)
          
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
          
          // Clean up page reference to free memory
          if (page.cleanup) {
            page.cleanup()
          }
        } catch (pageError) {
          console.error(`[PDF Extraction] Error extracting page ${pageNum}:`, pageError)
          // Continue with next page instead of crashing
          pages.push({
            pageNumber: pageNum,
            paragraphs: [],
            fullText: '',
          })
        }
      }
      
      // Small delay between batches for large PDFs to prevent memory pressure
      if (totalPages > 50 && batchEnd < totalPages) {
        await new Promise(resolve => setTimeout(resolve, 50))
      }
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

// PDF Extraction Queue System
// Limits concurrent PDF extractions to prevent memory issues and crashes
interface ExtractionTask {
  filePath: string
  documentId: string
  updateCallback?: (pdfText: PDFTextContent) => Promise<void>
  resolve: (value: PDFTextContent) => void
  reject: (error: Error) => void
}

const extractionQueue: ExtractionTask[] = []
let activeExtractions = 0
const MAX_CONCURRENT_EXTRACTIONS = 2 // Process max 2 PDFs at a time

async function processExtractionQueue() {
  // Don't start new extractions if we're at the limit
  if (activeExtractions >= MAX_CONCURRENT_EXTRACTIONS || extractionQueue.length === 0) {
    return
  }

  // Get next task from queue
  const task = extractionQueue.shift()
  if (!task) return

  activeExtractions++
  console.log(`[PDF Extraction Queue] Starting extraction (${activeExtractions}/${MAX_CONCURRENT_EXTRACTIONS} active, ${extractionQueue.length} queued):`, task.documentId)

  try {
    // Run extraction
    const pdfText = await extractPDFText(task.filePath, {
      parsePerPage: true,
      extractParagraphs: true,
    })

    console.log('[PDF Extraction] Async extraction complete, pages:', pdfText.pages.length)

    // Call update callback if provided
    if (task.updateCallback) {
      console.log('[PDF Extraction] Calling update callback')
      await task.updateCallback(pdfText)
    }

    task.resolve(pdfText)
  } catch (error) {
    console.error('[PDF Extraction] Error in queue processing:', error)
    task.reject(error instanceof Error ? error : new Error('PDF extraction failed'))
  } finally {
    activeExtractions--
    console.log(`[PDF Extraction Queue] Extraction complete (${activeExtractions}/${MAX_CONCURRENT_EXTRACTIONS} active, ${extractionQueue.length} queued)`)
    
    // Process next task in queue
    processExtractionQueue()
  }
}

/**
 * Extract text from PDF asynchronously (background job) with queue management
 * This function queues extractions to prevent memory issues with multiple PDFs
 * @param filePath Path to the PDF file
 * @param documentId Document ID to update
 * @param updateCallback Optional callback to update document when extraction completes
 */
export async function extractPDFTextAsync(
  filePath: string,
  documentId: string,
  updateCallback?: (pdfText: PDFTextContent) => Promise<void>
): Promise<PDFTextContent> {
  console.log('[PDF Extraction] Queueing extraction for document:', documentId)

  return new Promise<PDFTextContent>((resolve, reject) => {
    extractionQueue.push({
      filePath,
      documentId,
      updateCallback,
      resolve,
      reject,
    })

    // Start processing if not already running
    processExtractionQueue()
  })
}
