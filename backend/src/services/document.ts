import { Document } from '../../../shared/types.js'
import fs from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
// Resolve path: from src/services or dist/services -> backend root -> data/documents
const backendRoot = path.resolve(__dirname, '../..')
const DOCUMENTS_DIR = path.join(backendRoot, 'data', 'documents')

console.log('Document service initialized:')
console.log('  __dirname:', __dirname)
console.log('  backendRoot:', backendRoot)
console.log('  DOCUMENTS_DIR:', DOCUMENTS_DIR)

// Ensure documents directory exists
async function ensureDocumentsDir() {
  try {
    await fs.mkdir(DOCUMENTS_DIR, { recursive: true })
  } catch (error) {
    console.error('Error creating documents directory:', error)
    // Don't throw - directory might already exist
  }
}

ensureDocumentsDir()

function getDocumentPath(id: string): string {
  return path.join(DOCUMENTS_DIR, `${id}.json`)
}

export const documentService = {
  async getAll(): Promise<Document[]> {
    try {
      // Ensure directory exists before reading
      await ensureDocumentsDir()
      
      // Check if directory exists
      try {
        await fs.access(DOCUMENTS_DIR)
      } catch {
        console.log('Documents directory does not exist, creating...')
        await ensureDocumentsDir()
      }
      
      const files = await fs.readdir(DOCUMENTS_DIR)
      const documents: Document[] = []
      
      for (const file of files) {
        if (file.endsWith('.json')) {
          try {
            const filePath = path.join(DOCUMENTS_DIR, file)
            const content = await fs.readFile(filePath, 'utf-8')
            documents.push(JSON.parse(content))
          } catch (fileError) {
            console.error(`Error reading file ${file}:`, fileError)
            // Continue with other files
          }
        }
      }
      
      return documents.sort((a, b) => 
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      )
    } catch (error) {
      console.error('Error in getAll():', error)
      console.error('Error details:', error instanceof Error ? error.stack : error)
      // If directory doesn't exist, return empty array
      return []
    }
  },

  async getById(id: string): Promise<Document | null> {
    try {
      const filePath = getDocumentPath(id)
      const content = await fs.readFile(filePath, 'utf-8')
      return JSON.parse(content)
    } catch (error) {
      return null
    }
  },

  async create(title: string): Promise<Document> {
    try {
      // Ensure directory exists before creating
      await ensureDocumentsDir()
      
      // Verify directory exists
      try {
        await fs.access(DOCUMENTS_DIR)
      } catch {
        console.log('Documents directory does not exist, creating...')
        await ensureDocumentsDir()
      }
      
      const id = `doc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
      const now = new Date().toISOString()
      
      const document: Document = {
        id,
        title,
        content: JSON.stringify({
          type: 'doc',
          content: []
        }),
        createdAt: now,
        updatedAt: now,
      }

      const filePath = getDocumentPath(id)
      console.log('Creating document at:', filePath)
      await fs.writeFile(filePath, JSON.stringify(document, null, 2))
      
      return document
    } catch (error) {
      console.error('Error in create():', error)
      console.error('Error details:', error instanceof Error ? error.stack : error)
      throw error
    }
  },

  async update(id: string, content: string): Promise<Document | null> {
    const document = await this.getById(id)
    if (!document) {
      return null
    }

    document.content = content
    document.updatedAt = new Date().toISOString()

    const filePath = getDocumentPath(id)
    await fs.writeFile(filePath, JSON.stringify(document, null, 2))
    
    return document
  },

  async updateTitle(id: string, title: string): Promise<Document | null> {
    const document = await this.getById(id)
    if (!document) {
      return null
    }

    document.title = title
    document.updatedAt = new Date().toISOString()

    const filePath = getDocumentPath(id)
    await fs.writeFile(filePath, JSON.stringify(document, null, 2))
    
    return document
  },

  async delete(id: string): Promise<boolean> {
    try {
      // Get document first to check if it exists
      const document = await this.getById(id)
      if (!document) {
        // Document doesn't exist - consider it already deleted
        return true
      }
      
      const filePath = getDocumentPath(id)
      await fs.unlink(filePath)
      console.log(`[Backend documentService] Deleted document ${id} and its PDF text`)
      return true
    } catch (error) {
      console.error(`[Backend documentService] Failed to delete document ${id}:`, error)
      return false
    }
  },
}

