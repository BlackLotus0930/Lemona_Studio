import { app } from 'electron';
import fs from 'fs/promises';
import path from 'path';
import { extractPDFTextAsync } from './pdfTextExtractor.js';
import { parseDocx, convertHtmlToTipTap } from './docxParser.js';
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
                        // Check if file still exists (may have been deleted)
                        try {
                            await fs.access(filePath);
                        }
                        catch {
                            // File doesn't exist, skip it
                            console.log(`[getAll] Skipping deleted file: ${file}`);
                            continue;
                        }
                        const content = await fs.readFile(filePath, 'utf-8');
                        const doc = JSON.parse(content);
                        // Validate document has required fields
                        if (!doc.id || !doc.title) {
                            console.warn(`[getAll] Skipping invalid document: ${file}`);
                            continue;
                        }
                        documents.push(doc);
                    }
                    catch (fileError) {
                        console.error(`Error reading file ${file}:`, fileError);
                        // Continue with other files instead of crashing
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
            // First, get the document to find associated file
            const document = await this.getById(id);
            const filePath = getDocumentPath(id);
            console.log('[documentService.delete] Attempting to delete document:', id, 'at path:', filePath);
            // Delete the document JSON file
            try {
                await fs.access(filePath);
                await fs.unlink(filePath);
                console.log('[documentService.delete] Successfully deleted document JSON:', id);
            }
            catch (accessError) {
                console.log('[documentService.delete] Document JSON file does not exist (may have been already deleted):', filePath);
            }
            // Also delete the associated file (PDF, image, etc.) if it exists
            if (document && document.title) {
                const associatedFilePath = getFilePath(id, document.title);
                try {
                    await fs.access(associatedFilePath);
                    await fs.unlink(associatedFilePath);
                    console.log('[documentService.delete] Successfully deleted associated file:', associatedFilePath);
                }
                catch (fileError) {
                    // File doesn't exist or already deleted - this is okay
                    console.log('[documentService.delete] Associated file does not exist (may have been already deleted):', associatedFilePath);
                }
            }
            return true;
        }
        catch (error) {
            console.error('[documentService.delete] Failed to delete document:', id, error);
            return false;
        }
    },
    async uploadFile(sourceFilePath, fileName, folder) {
        await ensureDocumentsDir();
        await ensureFilesDir();
        // Check for duplicate file names and add number suffix if needed
        const allDocs = await this.getAll();
        const baseName = fileName.substring(0, fileName.lastIndexOf('.')) || fileName;
        const ext = fileName.substring(fileName.lastIndexOf('.')) || '';
        let finalFileName = fileName;
        let counter = 1;
        // Check if file with same name already exists
        while (allDocs.some(doc => doc.title === finalFileName)) {
            finalFileName = `${baseName} (${counter})${ext}`;
            counter++;
        }
        // Read the source file
        const fileBuffer = await fs.readFile(sourceFilePath);
        // Generate document ID
        const id = `doc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const now = new Date().toISOString();
        // Copy file to files directory
        const targetFilePath = getFilePath(id, finalFileName);
        await fs.writeFile(targetFilePath, fileBuffer);
        // Determine file type and create appropriate content
        const fileExt = finalFileName.toLowerCase().split('.').pop() || '';
        let content;
        if (fileExt === 'png' || fileExt === 'jpg' || fileExt === 'jpeg' || fileExt === 'gif' || fileExt === 'webp') {
            // Image file - convert to base64 and embed as image
            const base64 = fileBuffer.toString('base64');
            const mimeType = fileExt === 'png' ? 'image/png' :
                fileExt === 'jpg' || fileExt === 'jpeg' ? 'image/jpeg' :
                    fileExt === 'gif' ? 'image/gif' : 'image/webp';
            const dataUrl = `data:${mimeType};base64,${base64}`;
            content = {
                type: 'doc',
                content: [
                    {
                        type: 'image',
                        attrs: {
                            src: dataUrl,
                            alt: finalFileName,
                        }
                    },
                    {
                        type: 'paragraph',
                        content: []
                    }
                ]
            };
        }
        else if (fileExt === 'pdf') {
            // PDF file - create a PDF viewer node
            // For large PDFs, don't store base64 in JSON - use document ID reference instead
            // The frontend will load the PDF file content on demand via IPC
            content = {
                type: 'doc',
                content: [
                    {
                        type: 'pdfViewer',
                        attrs: {
                            src: `document://${id}`, // Use document ID reference instead of base64
                            fileName: finalFileName,
                        }
                    },
                    {
                        type: 'paragraph',
                        content: []
                    }
                ]
            };
        }
        else if (fileExt === 'docx') {
            // DOCX file - parse and convert to TipTap format
            try {
                const parseResult = await parseDocx(sourceFilePath);
                // Convert HTML to TipTap JSON format
                // Pass document ID to optimize large images by storing them separately
                content = await convertHtmlToTipTap(parseResult.fullContent, id);
            }
            catch (error) {
                // Fallback to file info if parsing fails
                content = {
                    type: 'doc',
                    content: [
                        {
                            type: 'paragraph',
                            content: [
                                {
                                    type: 'text',
                                    text: `📄 ${finalFileName}`,
                                    marks: [{ type: 'bold' }]
                                }
                            ]
                        },
                        {
                            type: 'paragraph',
                            content: [
                                {
                                    type: 'text',
                                    text: `File type: DOCX\nUploaded to: ${folder === 'library' ? 'Library' : 'Workspace'}\n\nFailed to parse DOCX content. This file can be downloaded from the file explorer.`
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
        }
        else if (fileExt === 'xlsx') {
            // Excel files - show file info and download option
            content = {
                type: 'doc',
                content: [
                    {
                        type: 'paragraph',
                        content: [
                            {
                                type: 'text',
                                text: `📄 ${finalFileName}`,
                                marks: [{ type: 'bold' }]
                            }
                        ]
                    },
                    {
                        type: 'paragraph',
                        content: [
                            {
                                type: 'text',
                                text: `File type: ${fileExt.toUpperCase()}\nUploaded to: ${folder === 'library' ? 'Library' : 'Workspace'}\n\nThis file can be downloaded from the file explorer.`
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
                                text: `📄 ${finalFileName}`
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
        // Remove .docx extension from title if it's a DOCX file
        const documentTitle = fileExt === 'docx'
            ? finalFileName.replace(/\.docx$/i, '')
            : finalFileName;
        // Create document entry
        const document = {
            id,
            title: documentTitle,
            content: JSON.stringify(content),
            createdAt: now,
            updatedAt: now,
            folder,
        };
        // Save document metadata
        const docPath = getDocumentPath(id);
        await fs.writeFile(docPath, JSON.stringify(document, null, 2));
        // If PDF, extract text asynchronously in the background
        if (ext === 'pdf') {
            // Start PDF text extraction in background (non-blocking)
            extractPDFTextAsync(targetFilePath, id, async (pdfText) => {
                try {
                    // Update document with extracted text
                    const updatedDoc = await this.getById(id);
                    if (updatedDoc) {
                        updatedDoc.pdfText = pdfText;
                        updatedDoc.updatedAt = new Date().toISOString();
                        await fs.writeFile(docPath, JSON.stringify(updatedDoc, null, 2));
                        console.log(`[PDF Text Extraction] Completed for document ${id}`);
                    }
                }
                catch (error) {
                    console.error(`[PDF Text Extraction] Failed to update document ${id}:`, error);
                }
            }).catch((error) => {
                console.error(`[PDF Text Extraction] Failed for document ${id}:`, error);
                // Don't throw - extraction failure shouldn't break upload
            });
        }
        return document;
    },
    /**
     * Clean up orphaned or corrupted document files
     * This removes any .json files that can't be parsed or are missing required fields
     */
    async cleanupOrphanedFiles() {
        try {
            await ensureDocumentsDir();
            const files = await fs.readdir(DOCUMENTS_DIR);
            let removed = 0;
            const errors = [];
            for (const file of files) {
                if (file.endsWith('.json')) {
                    try {
                        const filePath = path.join(DOCUMENTS_DIR, file);
                        const content = await fs.readFile(filePath, 'utf-8');
                        const doc = JSON.parse(content);
                        // Check if document has required fields
                        if (!doc.id || !doc.title || !doc.content || !doc.createdAt) {
                            console.log(`[cleanupOrphanedFiles] Removing corrupted document: ${file}`);
                            await fs.unlink(filePath);
                            removed++;
                        }
                    }
                    catch (fileError) {
                        // File is corrupted or can't be parsed - remove it
                        console.log(`[cleanupOrphanedFiles] Removing unparseable file: ${file}`);
                        try {
                            const filePath = path.join(DOCUMENTS_DIR, file);
                            await fs.unlink(filePath);
                            removed++;
                        }
                        catch (unlinkError) {
                            errors.push(`Failed to remove ${file}: ${unlinkError}`);
                        }
                    }
                }
            }
            console.log(`[cleanupOrphanedFiles] Cleanup complete. Removed ${removed} files.`);
            return { removed, errors };
        }
        catch (error) {
            console.error('[cleanupOrphanedFiles] Error during cleanup:', error);
            return { removed: 0, errors: [String(error)] };
        }
    },
};
