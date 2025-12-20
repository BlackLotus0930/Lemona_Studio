import { app } from 'electron';
import fs from 'fs/promises';
import path from 'path';
// Use Electron's userData directory for documents
const DOCUMENTS_DIR = path.join(app.getPath('userData'), 'documents');
console.log('Desktop Document service initialized:');
console.log('  DOCUMENTS_DIR:', DOCUMENTS_DIR);
// Ensure documents directory exists
async function ensureDocumentsDir() {
    try {
        await fs.mkdir(DOCUMENTS_DIR, { recursive: true });
    }
    catch (error) {
        console.error('Error creating documents directory:', error);
    }
}
// Initialize on import
ensureDocumentsDir();
function getDocumentPath(id) {
    return path.join(DOCUMENTS_DIR, `${id}.json`);
}
// Files directory for uploaded files
const FILES_DIR = path.join(app.getPath('userData'), 'files');
async function ensureFilesDir() {
    try {
        await fs.mkdir(FILES_DIR, { recursive: true });
    }
    catch (error) {
        console.error('Error creating files directory:', error);
    }
}
// Initialize files directory
ensureFilesDir();
function getFilePath(fileId, fileName) {
    return path.join(FILES_DIR, `${fileId}_${fileName}`);
}
export const documentService = {
    async getAll() {
        try {
            await ensureDocumentsDir();
            const files = await fs.readdir(DOCUMENTS_DIR);
            const documents = [];
            for (const file of files) {
                if (file.endsWith('.json')) {
                    try {
                        const filePath = path.join(DOCUMENTS_DIR, file);
                        const content = await fs.readFile(filePath, 'utf-8');
                        documents.push(JSON.parse(content));
                    }
                    catch (fileError) {
                        console.error(`Error reading file ${file}:`, fileError);
                    }
                }
            }
            return documents.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
        }
        catch (error) {
            console.error('Error in getAll():', error);
            return [];
        }
    },
    async getById(id) {
        try {
            const filePath = getDocumentPath(id);
            const content = await fs.readFile(filePath, 'utf-8');
            return JSON.parse(content);
        }
        catch (error) {
            return null;
        }
    },
    async create(title, folder) {
        await ensureDocumentsDir();
        const id = `doc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const now = new Date().toISOString();
        console.log('[documentService.create] Creating document with folder:', folder, 'title:', title);
        const document = {
            id,
            title,
            content: JSON.stringify({
                type: 'doc',
                content: []
            }),
            createdAt: now,
            updatedAt: now,
            folder,
        };
        console.log('[documentService.create] Document object before save:', JSON.stringify(document, null, 2));
        const filePath = getDocumentPath(id);
        await fs.writeFile(filePath, JSON.stringify(document, null, 2));
        console.log('[documentService.create] Document saved, returning:', JSON.stringify(document, null, 2));
        return document;
    },
    async update(id, content) {
        const document = await this.getById(id);
        if (!document) {
            return null;
        }
        document.content = content;
        document.updatedAt = new Date().toISOString();
        const filePath = getDocumentPath(id);
        await fs.writeFile(filePath, JSON.stringify(document, null, 2));
        return document;
    },
    async updateTitle(id, title) {
        const document = await this.getById(id);
        if (!document) {
            return null;
        }
        document.title = title;
        document.updatedAt = new Date().toISOString();
        const filePath = getDocumentPath(id);
        await fs.writeFile(filePath, JSON.stringify(document, null, 2));
        return document;
    },
    async delete(id) {
        try {
            const filePath = getDocumentPath(id);
            await fs.unlink(filePath);
            return true;
        }
        catch (error) {
            return false;
        }
    },
    async uploadFile(sourceFilePath, fileName, folder) {
        await ensureDocumentsDir();
        await ensureFilesDir();
        // Read the source file
        const fileBuffer = await fs.readFile(sourceFilePath);
        // Generate document ID
        const id = `doc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const now = new Date().toISOString();
        // Copy file to files directory
        const targetFilePath = getFilePath(id, fileName);
        await fs.writeFile(targetFilePath, fileBuffer);
        // Determine file type and create appropriate content
        const ext = fileName.toLowerCase().split('.').pop() || '';
        let content;
        if (ext === 'png' || ext === 'jpg' || ext === 'jpeg' || ext === 'gif' || ext === 'webp') {
            // Image file - convert to base64 and embed as image
            const base64 = fileBuffer.toString('base64');
            const mimeType = ext === 'png' ? 'image/png' :
                ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' :
                    ext === 'gif' ? 'image/gif' : 'image/webp';
            const dataUrl = `data:${mimeType};base64,${base64}`;
            content = {
                type: 'doc',
                content: [
                    {
                        type: 'image',
                        attrs: {
                            src: dataUrl,
                            alt: fileName,
                        }
                    },
                    {
                        type: 'paragraph',
                        content: []
                    }
                ]
            };
        }
        else if (ext === 'pdf') {
            // PDF file - create a PDF viewer node
            const base64 = fileBuffer.toString('base64');
            const pdfDataUrl = `data:application/pdf;base64,${base64}`;
            content = {
                type: 'doc',
                content: [
                    {
                        type: 'pdfViewer',
                        attrs: {
                            src: pdfDataUrl,
                            fileName: fileName,
                        }
                    },
                    {
                        type: 'paragraph',
                        content: []
                    }
                ]
            };
        }
        else if (ext === 'docx' || ext === 'xlsx') {
            // Office files - show file info and download option
            content = {
                type: 'doc',
                content: [
                    {
                        type: 'paragraph',
                        content: [
                            {
                                type: 'text',
                                text: `📄 ${fileName}`,
                                marks: [{ type: 'bold' }]
                            }
                        ]
                    },
                    {
                        type: 'paragraph',
                        content: [
                            {
                                type: 'text',
                                text: `File type: ${ext.toUpperCase()}\nUploaded to: ${folder === 'library' ? 'Library' : 'Workspace'}\n\nThis file can be downloaded from the file explorer.`
                            }
                        ]
                    },
                    {
                        type: 'paragraph',
                        content: []
                    }
                ]
            };
        }
        else {
            // Unknown file type - just show file name
            content = {
                type: 'doc',
                content: [
                    {
                        type: 'paragraph',
                        content: [
                            {
                                type: 'text',
                                text: `📄 ${fileName}`
                            }
                        ]
                    },
                    {
                        type: 'paragraph',
                        content: []
                    }
                ]
            };
        }
        // Create document entry
        const document = {
            id,
            title: fileName,
            content: JSON.stringify(content),
            createdAt: now,
            updatedAt: now,
            folder,
        };
        // Save document metadata
        const docPath = getDocumentPath(id);
        await fs.writeFile(docPath, JSON.stringify(document, null, 2));
        return document;
    },
};
