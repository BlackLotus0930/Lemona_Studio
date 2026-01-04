import { app } from 'electron';
import fs from 'fs/promises';
import path from 'path';
import { extractPDFTextAsync } from './pdfTextExtractor.js';
import { parseDocx, convertHtmlToTipTap } from './docxParser.js';
import { indexLibraryFile, reindexFile } from './indexingService.js';
import { getVectorStore, getProjectLockManager } from './vectorStore.js';
import { getApiKeys } from './apiKeyStore.js';
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
                        // Filter out logically deleted documents
                        if (doc.deleted === true) {
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
        const wasLibraryFile = document.folder === 'library';
        document.content = content;
        document.updatedAt = new Date().toISOString();
        const filePath = getDocumentPath(id);
        await fs.writeFile(filePath, JSON.stringify(document, null, 2));
        // Re-index library files if content was updated (for incremental updates)
        if (wasLibraryFile) {
            const fileExt = document.title.toLowerCase().split('.').pop() || '';
            // Only re-index if it's a supported file type (PDF/DOCX) or TipTap content
            if (fileExt === 'pdf' || fileExt === 'docx' || (!fileExt || fileExt === 'md')) {
                console.log(`[Auto-Reindexing] Triggering re-index for updated library file: ${document.title} (${id})`);
                // Trigger re-indexing asynchronously (non-blocking)
                reindexFile(id).then((status) => {
                    console.log(`[Auto-Reindexing] Completed re-indexing for ${id}: ${status.status}, ${status.chunksCount || 0} chunks`);
                }).catch((error) => {
                    console.error(`[Auto-Reindexing] Failed to re-index ${id}:`, error);
                    // Don't throw - re-indexing failure shouldn't break update
                });
            }
        }
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
    async updateFolder(id, folder) {
        const document = await this.getById(id);
        if (!document) {
            return null;
        }
        document.folder = folder;
        document.updatedAt = new Date().toISOString();
        const filePath = getDocumentPath(id);
        await fs.writeFile(filePath, JSON.stringify(document, null, 2));
        return document;
    },
    /**
     * Delete a single document
     * For batch deletion, use deleteMany() for better lock efficiency
     */
    async delete(id) {
        const results = await this.deleteMany([id]);
        return results[0] ?? false;
    },
    /**
     * Delete multiple documents efficiently
     * Acquires write lock once per project, processes all deletions, then releases
     *
     * @param ids - Array of document IDs to delete
     * @returns Array of boolean results (true = success, false = failed)
     */
    async deleteMany(ids) {
        if (ids.length === 0) {
            return [];
        }
        // Group documents by projectId for efficient lock management
        const documentsByProject = new Map();
        // First pass: get all documents and group by project
        for (const id of ids) {
            const document = await this.getById(id);
            if (!document) {
                console.log(`[documentService.deleteMany] Document ${id} does not exist, considering already deleted`);
                continue;
            }
            if (document.deleted === true) {
                console.log(`[documentService.deleteMany] Document ${id} is already marked as deleted`);
                continue;
            }
            const projectId = document.folder === 'library' ? 'library' : document.projectId;
            if (!documentsByProject.has(projectId)) {
                documentsByProject.set(projectId, []);
            }
            documentsByProject.get(projectId).push({ id, document });
        }
        const results = new Map();
        const projectLockManager = getProjectLockManager();
        // Process each project group with a single lock acquisition
        for (const [projectId, docs] of documentsByProject.entries()) {
            // Only acquire lock if documents are indexed (library or project files)
            if (projectId === undefined && docs.every(d => !d.document.folder && !d.document.projectId)) {
                // All documents are unindexed, process without lock
                for (const { id, document } of docs) {
                    try {
                        await this.deleteUnsafe(id, document);
                        results.set(id, true);
                    }
                    catch (error) {
                        console.error(`[documentService.deleteMany] Failed to delete document: ${id}`, error);
                        results.set(id, false);
                    }
                }
                continue;
            }
            // Acquire write lock once for this project
            const releaseLock = await projectLockManager.acquireWriteLock(projectId);
            console.log(`[documentService.deleteMany] Acquired write lock for project: ${projectId || 'global'} (${docs.length} documents)`);
            try {
                // Load index once for all deletions in this project
                let vectorStore = null;
                if (docs.some(d => d.document.folder === 'library' || d.document.projectId)) {
                    vectorStore = getVectorStore(projectId);
                    await vectorStore.loadIndexUnsafe();
                }
                // Process all deletions in this project
                for (const { id, document } of docs) {
                    try {
                        // Remove from vector index if indexed
                        if (vectorStore && (document.folder === 'library' || document.projectId)) {
                            await vectorStore.removeChunksByFileUnsafe(id, false); // autoSave=false, save once at end
                        }
                        // Mark document as deleted
                        await this.deleteUnsafe(id, document);
                        results.set(id, true);
                    }
                    catch (error) {
                        console.error(`[documentService.deleteMany] Failed to delete document: ${id}`, error);
                        results.set(id, false);
                    }
                }
                // Save index once after all deletions in this project
                if (vectorStore && docs.some(d => d.document.folder === 'library' || d.document.projectId)) {
                    try {
                        await vectorStore.saveIndexUnsafe();
                        console.log(`[documentService.deleteMany] Saved index after deleting ${docs.length} files from project: ${projectId || 'global'}`);
                    }
                    catch (saveError) {
                        console.error(`[documentService.deleteMany] Failed to save index:`, saveError);
                        // Don't fail the entire operation, but log the error
                    }
                }
            }
            finally {
                releaseLock();
            }
        }
        // Return results in the same order as input
        return ids.map(id => results.get(id) ?? false);
    },
    /**
     * Internal unsafe delete method - assumes caller holds appropriate lock
     * @param id - Document ID
     * @param document - Document object (must be provided to avoid re-fetching)
     */
    async deleteUnsafe(id, document) {
        // Mark document as deleted (logical deletion)
        document.deleted = true;
        document.updatedAt = new Date().toISOString();
        // Save document with deleted flag
        const filePath = getDocumentPath(id);
        await fs.writeFile(filePath, JSON.stringify(document, null, 2));
        console.log(`[documentService.deleteUnsafe] Successfully marked document as deleted: ${id}`);
        // Background async deletion of disk files (non-blocking)
        setImmediate(async () => {
            try {
                const docPath = getDocumentPath(id);
                try {
                    await fs.access(docPath);
                    await fs.unlink(docPath);
                    console.log(`[documentService.deleteUnsafe] Background: Successfully deleted document JSON: ${id}`);
                }
                catch (accessError) {
                    console.log(`[documentService.deleteUnsafe] Background: Document JSON file does not exist: ${docPath}`);
                }
                // Also delete the associated file (PDF, image, etc.) if it exists
                if (document.title) {
                    const associatedFilePath = getFilePath(id, document.title);
                    try {
                        await fs.access(associatedFilePath);
                        await fs.unlink(associatedFilePath);
                        console.log(`[documentService.deleteUnsafe] Background: Successfully deleted associated file: ${associatedFilePath}`);
                    }
                    catch (fileError) {
                        console.log(`[documentService.deleteUnsafe] Background: Associated file does not exist: ${associatedFilePath}`);
                    }
                }
            }
            catch (bgError) {
                console.error(`[documentService.deleteUnsafe] Background: Error deleting files for ${id}:`, bgError);
                // Don't throw - background cleanup failure shouldn't affect deletion
            }
        });
    },
    async uploadFile(sourceFilePath, fileName, folder, projectId) {
        await ensureDocumentsDir();
        await ensureFilesDir();
        // Note: We don't cleanup vector index here to avoid performance impact
        // Cleanup is done on app startup, which should be sufficient
        // File naming is based on documentService.getAll(), not vector index
        // Check for duplicate file names and add number suffix if needed
        // CRITICAL: Only check duplicates within the same scope:
        // - Library files: check against all library files (shared across projects)
        // - Project files: check only against files in the same project (project-specific)
        const allDocs = await this.getAll();
        const baseName = fileName.substring(0, fileName.lastIndexOf('.')) || fileName;
        const ext = fileName.substring(fileName.lastIndexOf('.')) || '';
        let finalFileName = fileName;
        let counter = 1;
        // Filter documents to check based on folder and projectId
        let docsToCheck;
        if (folder === 'library') {
            // Library files: check against all library files
            docsToCheck = allDocs.filter(doc => doc.folder === 'library');
        }
        else {
            // Project files: check only against files in the same project
            if (projectId) {
                docsToCheck = allDocs.filter(doc => doc.folder === 'project' && doc.projectId === projectId);
            }
            else {
                // If no projectId provided, check against all project files (fallback, should not happen)
                console.warn(`[DocumentService] Uploading to project folder without projectId, checking against all project files`);
                docsToCheck = allDocs.filter(doc => doc.folder === 'project');
            }
        }
        // Check if file with same name already exists in the same scope
        while (docsToCheck.some(doc => doc.title === finalFileName)) {
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
        // CRITICAL: If uploading to project folder, set projectId immediately
        // This ensures indexing uses the correct project index
        const document = {
            id,
            title: documentTitle,
            content: JSON.stringify(content),
            createdAt: now,
            updatedAt: now,
            folder,
            ...(folder === 'project' && projectId ? { projectId } : {}), // Set projectId if provided for project files
        };
        // Log projectId assignment for debugging
        if (folder === 'project') {
            console.log(`[DocumentService] Uploading file to project folder with projectId: ${projectId || 'NOT SET (will be set later)'}`);
            if (!projectId) {
                console.warn(`[DocumentService] WARNING: Uploading to project folder without projectId. Document will need projectId set before indexing.`);
            }
        }
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
        // Auto-index library files asynchronously (don't block upload)
        if (folder === 'library') {
            // Check if file type is supported for indexing (PDF or DOCX)
            const fileExt = finalFileName.toLowerCase().split('.').pop() || '';
            if (fileExt === 'pdf' || fileExt === 'docx') {
                console.log(`[Auto-Indexing] Starting indexing for library file: ${finalFileName} (${id})`);
                // Get API keys from store for auto-indexing
                const { geminiApiKey, openaiApiKey } = getApiKeys();
                // Trigger indexing asynchronously (non-blocking) with API keys
                indexLibraryFile(id, geminiApiKey, openaiApiKey).then((status) => {
                    console.log(`[Auto-Indexing] Completed indexing for ${id}: ${status.status}, ${status.chunksCount || 0} chunks`);
                }).catch((error) => {
                    console.error(`[Auto-Indexing] Failed to index ${id}:`, error);
                    // Don't throw - indexing failure shouldn't break upload
                    // The indexing service will handle API key errors gracefully
                });
            }
            else {
                console.log(`[Auto-Indexing] Skipping indexing for ${finalFileName}: unsupported file type (${fileExt})`);
            }
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
            return { removed, errors };
        }
        catch (error) {
            console.error('[cleanupOrphanedFiles] Error during cleanup:', error);
            return { removed: 0, errors: [String(error)] };
        }
    },
    /**
     * Clean up logically deleted documents
     * This removes disk files for documents marked as deleted (deleted=true)
     * Should be called on app startup and periodically
     */
    async cleanupDeletedDocuments() {
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
                        // Check if document is marked as deleted
                        if (doc.deleted === true) {
                            console.log(`[cleanupDeletedDocuments] Cleaning up deleted document: ${doc.id} (${doc.title || 'untitled'})`);
                            // Delete the document JSON file
                            try {
                                await fs.unlink(filePath);
                                removed++;
                                console.log(`[cleanupDeletedDocuments] Removed document JSON: ${filePath}`);
                            }
                            catch (unlinkError) {
                                errors.push(`Failed to remove document JSON ${file}: ${unlinkError.message}`);
                            }
                            // Also delete the associated file (PDF, image, etc.) if it exists
                            if (doc.title) {
                                const associatedFilePath = getFilePath(doc.id, doc.title);
                                try {
                                    await fs.access(associatedFilePath);
                                    await fs.unlink(associatedFilePath);
                                    console.log(`[cleanupDeletedDocuments] Removed associated file: ${associatedFilePath}`);
                                }
                                catch (fileError) {
                                    // File doesn't exist - this is okay, just log
                                    if (fileError.code !== 'ENOENT') {
                                        errors.push(`Failed to remove associated file for ${doc.id}: ${fileError.message}`);
                                    }
                                }
                            }
                        }
                    }
                    catch (fileError) {
                        // File is corrupted or can't be parsed - skip it (handled by cleanupOrphanedFiles)
                        console.warn(`[cleanupDeletedDocuments] Skipping unparseable file: ${file}`);
                    }
                }
            }
            if (removed > 0) {
                console.log(`[cleanupDeletedDocuments] Cleanup complete. Removed ${removed} deleted document(s).`);
            }
            return { removed, errors };
        }
        catch (error) {
            console.error('[cleanupDeletedDocuments] Error during cleanup:', error);
            return { removed: 0, errors: [String(error)] };
        }
    },
};
