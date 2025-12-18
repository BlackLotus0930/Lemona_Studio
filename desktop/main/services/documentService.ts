// Desktop Document Service - Uses Electron userData directory
import { Document } from '../../../shared/types.js'
import { app } from 'electron'
import fs from 'fs/promises'
import path from 'path'

// Use Electron's userData directory for documents
const DOCUMENTS_DIR = path.join(app.getPath('userData'), 'documents')

console.log('Desktop Document service initialized:')
console.log('  DOCUMENTS_DIR:', DOCUMENTS_DIR)

// Ensure documents directory exists
async function ensureDocumentsDir() {
  try {
    await fs.mkdir(DOCUMENTS_DIR, { recursive: true })
  } catch (error) {
    console.error('Error creating documents directory:', error)
  }
}

// Initialize on import
ensureDocumentsDir()

function getDocumentPath(id: string): string {
  return path.join(DOCUMENTS_DIR, `${id}.json`)
}

export const documentService = {
  async getAll(): Promise<Document[]> {
    try {
      await ensureDocumentsDir()
      
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
          }
        }
      }
      
      return documents.sort((a, b) => 
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      )
    } catch (error) {
      console.error('Error in getAll():', error)
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
    await ensureDocumentsDir()
    
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
    await fs.writeFile(filePath, JSON.stringify(document, null, 2))
    
    return document
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
      const filePath = getDocumentPath(id)
      await fs.unlink(filePath)
      return true
    } catch (error) {
      return false
    }
  },
}

