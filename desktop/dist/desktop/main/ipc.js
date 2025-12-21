// IPC Handlers for Desktop App
import { ipcMain, BrowserWindow } from 'electron';
import { documentService } from './services/documentService.js';
import { chatHistoryService } from './services/chatHistoryService.js';
import { geminiService } from './services/geminiService.js';
import { projectService } from './services/projectService.js';
import { exportService } from './services/export.js';
export function setupIPC() {
    // Document operations
    ipcMain.handle('document:getAll', async () => {
        try {
            return await documentService.getAll();
        }
        catch (error) {
            console.error('IPC document:getAll error:', error);
            throw error;
        }
    });
    ipcMain.handle('document:getById', async (_, id) => {
        try {
            return await documentService.getById(id);
        }
        catch (error) {
            console.error('IPC document:getById error:', error);
            throw error;
        }
    });
    ipcMain.handle('document:create', async (_, title, folder) => {
        try {
            console.log('[IPC document:create] Received title:', title, 'folder:', folder);
            const result = await documentService.create(title, folder);
            console.log('[IPC document:create] Returning document:', JSON.stringify(result, null, 2));
            return result;
        }
        catch (error) {
            console.error('IPC document:create error:', error);
            throw error;
        }
    });
    ipcMain.handle('document:uploadFile', async (_, filePath, fileName, folder) => {
        try {
            console.log('[IPC document:uploadFile] Received filePath:', filePath, 'fileName:', fileName, 'folder:', folder);
            const result = await documentService.uploadFile(filePath, fileName, folder);
            console.log('[IPC document:uploadFile] Returning document:', JSON.stringify(result, null, 2));
            return result;
        }
        catch (error) {
            console.error('IPC document:uploadFile error:', error);
            throw error;
        }
    });
    ipcMain.handle('document:update', async (_, id, content) => {
        try {
            return await documentService.update(id, content);
        }
        catch (error) {
            console.error('IPC document:update error:', error);
            throw error;
        }
    });
    ipcMain.handle('document:updateTitle', async (_, id, title) => {
        try {
            return await documentService.updateTitle(id, title);
        }
        catch (error) {
            console.error('IPC document:updateTitle error:', error);
            throw error;
        }
    });
    ipcMain.handle('document:delete', async (_, id) => {
        try {
            return await documentService.delete(id);
        }
        catch (error) {
            console.error('IPC document:delete error:', error);
            throw error;
        }
    });
    ipcMain.handle('document:cleanupOrphaned', async () => {
        try {
            return await documentService.cleanupOrphanedFiles();
        }
        catch (error) {
            console.error('IPC document:cleanupOrphaned error:', error);
            throw error;
        }
    });
    // Chat operations
    ipcMain.handle('chat:getHistory', async (_, documentId) => {
        try {
            return await chatHistoryService.getChatHistory(documentId);
        }
        catch (error) {
            console.error('IPC chat:getHistory error:', error);
            throw error;
        }
    });
    ipcMain.handle('chat:getChat', async (_, documentId, chatId) => {
        try {
            return await chatHistoryService.getChatMessages(documentId, chatId);
        }
        catch (error) {
            console.error('IPC chat:getChat error:', error);
            throw error;
        }
    });
    ipcMain.handle('chat:addMessage', async (_, documentId, chatId, message) => {
        try {
            await chatHistoryService.addMessage(documentId, chatId, message);
            return { success: true };
        }
        catch (error) {
            console.error('IPC chat:addMessage error:', error);
            throw error;
        }
    });
    ipcMain.handle('chat:updateMessage', async (_, documentId, chatId, messageId, content) => {
        try {
            await chatHistoryService.updateMessage(documentId, chatId, messageId, content);
            return { success: true };
        }
        catch (error) {
            console.error('IPC chat:updateMessage error:', error);
            throw error;
        }
    });
    ipcMain.handle('chat:deleteChat', async (_, documentId, chatId) => {
        try {
            await chatHistoryService.deleteChat(documentId, chatId);
            return { success: true };
        }
        catch (error) {
            console.error('IPC chat:deleteChat error:', error);
            throw error;
        }
    });
    // AI operations
    // Chat always uses Gemini (not Ollama)
    ipcMain.handle('ai:chat', async (_, message, documentContent, documentId) => {
        try {
            // Get projectId from document if documentId is provided
            let projectId;
            if (documentId) {
                const document = await documentService.getById(documentId);
                projectId = document?.projectId;
            }
            return await geminiService.chat(message, documentContent, projectId);
        }
        catch (error) {
            console.error('IPC ai:chat error:', error);
            throw error;
        }
    });
    // Stream chat - uses webContents.send to stream chunks
    // Chat always uses Gemini (not Ollama)
    ipcMain.handle('ai:streamChat', async (event, message, documentContent, documentId, chatHistory, useWebSearch, modelName) => {
        const webContents = event.sender;
        const streamId = `stream_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        console.log(`[Stream] Starting stream ${streamId} (model: ${modelName || 'gemini-2.5-flash'}, web search: ${useWebSearch ? 'enabled' : 'disabled'})`);
        try {
            // Get projectId from document if documentId is provided
            let projectId;
            if (documentId) {
                const document = await documentService.getById(documentId);
                projectId = document?.projectId;
            }
            // Start streaming in background
            ;
            (async () => {
                try {
                    console.log(`[Stream] Calling geminiService.streamChat with ${chatHistory?.length || 0} history messages...`);
                    let chunkCount = 0;
                    for await (const chunk of geminiService.streamChat(message, documentContent, projectId, chatHistory, useWebSearch, modelName)) {
                        chunkCount++;
                        webContents.send('ai:streamChunk', streamId, chunk);
                    }
                    console.log(`[Stream] Stream complete, total chunks: ${chunkCount}`);
                    webContents.send('ai:streamEnd', streamId);
                }
                catch (error) {
                    console.error('[Stream] Stream error:', error);
                    webContents.send('ai:streamError', streamId, error instanceof Error ? error.message : 'Unknown error');
                }
            })();
            return { streamId };
        }
        catch (error) {
            console.error('IPC ai:streamChat error:', error);
            throw error;
        }
    });
    // Batch questions always uses Gemini (not Ollama)
    ipcMain.handle('ai:batchQuestions', async (_, questions, documentContent, documentId) => {
        try {
            // Get projectId from document if documentId is provided
            let projectId;
            if (documentId) {
                const document = await documentService.getById(documentId);
                projectId = document?.projectId;
            }
            return await geminiService.batchQuestions(questions, documentContent, projectId);
        }
        catch (error) {
            console.error('IPC ai:batchQuestions error:', error);
            throw error;
        }
    });
    // Autocomplete uses Gemini 2.5 Flash Lite (fast and free)
    ipcMain.handle('ai:autocomplete', async (_, text, cursorPosition, documentContent, documentId) => {
        try {
            // Get projectId from document if documentId is provided
            let projectId;
            if (documentId) {
                const document = await documentService.getById(documentId);
                projectId = document?.projectId;
            }
            return await geminiService.autocomplete(text, cursorPosition, documentContent, projectId, 'gemini-2.5-flash-lite');
        }
        catch (error) {
            console.error('IPC ai:autocomplete error:', error);
            throw error;
        }
    });
    // New AI features: Title generation and rephrase
    // Title generation uses Gemini
    ipcMain.handle('ai:generateTitle', async (_, documentContent) => {
        try {
            // Use Gemini via chat
            const msg = await geminiService.chat(`Generate a short, concise title (max 5 words) for this document: "${documentContent.slice(0, 500)}"`, documentContent);
            return msg.content.trim().slice(0, 100);
        }
        catch (error) {
            console.error('IPC ai:generateTitle error:', error);
            throw error;
        }
    });
    // Rephrase text uses Gemini 2.5 Flash Lite (fast and free)
    ipcMain.handle('ai:rephraseText', async (_, text, instruction) => {
        try {
            console.log('[IPC] Rephrase text request:', { textLength: text.length, instruction });
            // Use Gemini Flash Lite for fast rephrasing
            // Explicitly instruct to only return the rephrased text with no follow-up questions or suggestions
            const prompt = `Rephrase this text according to the instruction. 

CRITICAL: Return ONLY the rephrased text. Do NOT include any follow-up questions, suggestions, "Next step" messages, or any other text. Just the rephrased text.

Original text: "${text}"

Instruction: ${instruction}

Rephrased text:`;
            const msg = await geminiService.chat(prompt, undefined, undefined, undefined, 'gemini-2.5-flash-lite');
            let result = msg.content.trim();
            // Remove any "Next step" or similar follow-up text that might still appear
            const nextStepPatterns = [
                /Next step:.*$/i,
                /Would you like.*$/i,
                /Do you want.*$/i,
                /Can I help.*$/i,
                /Is there anything.*$/i,
                /Let me know.*$/i,
                /Feel free.*$/i,
                /\n\nNext step.*$/i,
                /\n\nWould you.*$/i,
            ];
            for (const pattern of nextStepPatterns) {
                result = result.replace(pattern, '').trim();
            }
            console.log('[IPC] Rephrase result length:', result.length);
            return result;
        }
        catch (error) {
            console.error('[IPC] ai:rephraseText error:', error);
            throw error;
        }
    });
    // Check AI service status
    ipcMain.handle('ai:getStatus', async () => {
        try {
            return {
                gemini: !!process.env.GEMINI_API_KEY
            };
        }
        catch (error) {
            console.error('IPC ai:getStatus error:', error);
            return {
                gemini: !!process.env.GEMINI_API_KEY
            };
        }
    });
    // Window controls
    ipcMain.handle('window:minimize', async (event) => {
        const window = BrowserWindow.fromWebContents(event.sender);
        if (window) {
            window.minimize();
        }
    });
    ipcMain.handle('window:maximize', async (event) => {
        const window = BrowserWindow.fromWebContents(event.sender);
        if (window) {
            if (window.isMaximized()) {
                window.unmaximize();
            }
            else {
                window.maximize();
            }
        }
    });
    ipcMain.handle('window:close', async (event) => {
        const window = BrowserWindow.fromWebContents(event.sender);
        if (window) {
            window.close();
        }
    });
    // Project operations
    ipcMain.handle('project:getAll', async () => {
        try {
            return await projectService.getAll();
        }
        catch (error) {
            console.error('IPC project:getAll error:', error);
            throw error;
        }
    });
    ipcMain.handle('project:getById', async (_, projectId) => {
        try {
            return await projectService.getById(projectId);
        }
        catch (error) {
            console.error('IPC project:getById error:', error);
            throw error;
        }
    });
    ipcMain.handle('project:create', async (_, title, description, intent) => {
        try {
            return await projectService.create(title, description, intent);
        }
        catch (error) {
            console.error('IPC project:create error:', error);
            throw error;
        }
    });
    ipcMain.handle('project:update', async (_, projectId, updates) => {
        try {
            return await projectService.update(projectId, updates);
        }
        catch (error) {
            console.error('IPC project:update error:', error);
            throw error;
        }
    });
    ipcMain.handle('project:updateIntent', async (_, projectId, intent) => {
        try {
            return await projectService.updateIntent(projectId, intent);
        }
        catch (error) {
            console.error('IPC project:updateIntent error:', error);
            throw error;
        }
    });
    ipcMain.handle('project:delete', async (_, projectId) => {
        try {
            const success = await projectService.delete(projectId);
            return { success };
        }
        catch (error) {
            console.error('IPC project:delete error:', error);
            throw error;
        }
    });
    ipcMain.handle('project:addDocument', async (_, projectId, documentId, order) => {
        try {
            return await projectService.addDocument(projectId, documentId, order);
        }
        catch (error) {
            console.error('IPC project:addDocument error:', error);
            throw error;
        }
    });
    ipcMain.handle('project:removeDocument', async (_, projectId, documentId) => {
        try {
            return await projectService.removeDocument(projectId, documentId);
        }
        catch (error) {
            console.error('IPC project:removeDocument error:', error);
            throw error;
        }
    });
    ipcMain.handle('project:reorderDocuments', async (_, projectId, documentIds) => {
        try {
            return await projectService.reorderDocuments(projectId, documentIds);
        }
        catch (error) {
            console.error('IPC project:reorderDocuments error:', error);
            throw error;
        }
    });
    ipcMain.handle('project:getDocuments', async (_, projectId) => {
        try {
            return await projectService.getProjectDocuments(projectId);
        }
        catch (error) {
            console.error('IPC project:getDocuments error:', error);
            throw error;
        }
    });
    // File operations
    ipcMain.handle('file:saveTemp', async (_, buffer, fileName) => {
        try {
            const fs = await import('fs/promises');
            const path = await import('path');
            const os = await import('os');
            const tempDir = os.tmpdir();
            const tempPath = path.join(tempDir, `lemona_${Date.now()}_${fileName}`);
            await fs.writeFile(tempPath, Buffer.from(buffer));
            return tempPath;
        }
        catch (error) {
            console.error('IPC file:saveTemp error:', error);
            throw error;
        }
    });
    // Export operations - WYSIWYG (What You See Is What You Get)
    ipcMain.handle('export:export', async (_, documentId, format, filename) => {
        try {
            if (!format || !['pdf', 'docx'].includes(format)) {
                throw new Error('Invalid format. Must be pdf or docx');
            }
            const fileBuffer = await exportService.exportDocument(documentId, format);
            return Array.from(fileBuffer); // Convert Buffer to array for IPC
        }
        catch (error) {
            console.error('IPC export:export error:', error);
            throw error;
        }
    });
    ipcMain.handle('export:exportMultiple', async (_, documentIds, format, filename) => {
        try {
            if (!format || !['pdf', 'docx'].includes(format)) {
                throw new Error('Invalid format. Must be pdf or docx');
            }
            if (!documentIds || documentIds.length === 0) {
                throw new Error('No documents selected');
            }
            const fileBuffer = await exportService.exportMultipleDocuments(documentIds, format);
            return Array.from(fileBuffer); // Convert Buffer to array for IPC
        }
        catch (error) {
            console.error('IPC export:exportMultiple error:', error);
            throw error;
        }
    });
    console.log('IPC handlers registered');
}
