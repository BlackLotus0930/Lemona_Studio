// IPC Handlers for Desktop App
import { ipcMain, BrowserWindow, shell, dialog } from 'electron';
import updater from 'electron-updater';
import { documentService } from './services/documentService.js';
import { chatHistoryService } from './services/chatHistoryService.js';
import { geminiService } from './services/geminiService.js';
import { openaiService } from './services/openaiService.js';
import { projectService } from './services/projectService.js';
import { indexingService } from './services/indexingService.js';
import { semanticSearchService } from './services/semanticSearchService.js';
import { exportService } from './services/export.js';
import { versionService } from './services/versionService.js';
import { extractPDFTextAsync } from './services/pdfTextExtractor.js';
import { parseDocx, splitDocxIntoChapters } from './services/docxParser.js';
import { saveApiKeys, getApiKeys } from './services/apiKeyStore.js';
import { aiProviderStore } from './services/aiProviderStore.js';
import { modelGatewayService } from './services/modelGatewayService.js';
import { integrationService } from './services/integrationService.js';
import { runEvidenceQuery } from './services/evidenceQueryService.js';
import path from 'path';
import { app } from 'electron';
import fs from 'fs/promises';
const { autoUpdater } = updater;
const ZOOM_LEVEL_FILE = path.join(app.getPath('userData'), 'zoom-level.json');
const AGENT_ACTION_BLOCK_NAME = 'lemona-actions';
const MAX_AGENT_STREAM_BUFFER_CHARS = 240000;
const MAX_AGENT_STREAM_ACTIONS_PER_RESPONSE = 60;
function hasUsableKey(value) {
    return !!(value && value.trim().length > 0);
}
function extractActionBlocks(content) {
    if (!content || content.length === 0) {
        return [];
    }
    const regex = new RegExp(`\\\`\\\`\\\`${AGENT_ACTION_BLOCK_NAME}\\s*([\\s\\S]*?)\\\`\\\`\\\``, 'gi');
    const blocks = [];
    let match;
    while ((match = regex.exec(content)) !== null) {
        if (match[1]) {
            blocks.push(match[1].trim());
        }
    }
    return blocks;
}
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
            const result = await documentService.create(title, folder);
            return result;
        }
        catch (error) {
            console.error('IPC document:create error:', error);
            throw error;
        }
    });
    ipcMain.handle('document:uploadFile', async (_, filePath, fileName, folder, projectId) => {
        try {
            const result = await documentService.uploadFile(filePath, fileName, folder, projectId);
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
    ipcMain.handle('document:updateFolder', async (_, id, folder) => {
        try {
            return await documentService.updateFolder(id, folder);
        }
        catch (error) {
            console.error('IPC document:updateFolder error:', error);
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
    ipcMain.handle('chat:updateMessage', async (_, documentId, chatId, messageId, content, reasoningMetadata, edits) => {
        try {
            await chatHistoryService.updateMessage(documentId, chatId, messageId, content, reasoningMetadata, edits);
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
    ipcMain.handle('chat:truncateChatAfterIndex', async (_, documentId, chatId, messageIndex) => {
        try {
            await chatHistoryService.truncateChatAfterIndex(documentId, chatId, messageIndex);
            return { success: true };
        }
        catch (error) {
            console.error('IPC chat:truncateChatAfterIndex error:', error);
            throw error;
        }
    });
    // AI operations
    // Chat always uses Gemini (not Ollama)
    ipcMain.handle('ai:chat', async (_, apiKey, message, documentContent, documentId, openaiApiKey) => {
        try {
            // Get projectId from document if documentId is provided
            let projectId;
            if (documentId) {
                const document = await documentService.getById(documentId);
                projectId = document?.projectId;
            }
            return await geminiService.chat(apiKey, message, documentContent, projectId, undefined, undefined, openaiApiKey);
        }
        catch (error) {
            console.error('IPC ai:chat error:', error);
            throw error;
        }
    });
    // Stream chat - uses webContents.send to stream chunks
    // Chat always uses Gemini (not Ollama)
    ipcMain.handle('ai:streamChat', async (event, googleApiKey, openaiApiKey, message, documentContent, documentId, chatHistory, useWebSearch, modelName, attachments, style, projectId, sourceTypes) => {
        const webContents = event.sender;
        const streamId = `stream_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        try {
            // Use provided projectId, or get from document if documentId is provided and projectId not set
            let finalProjectId = projectId;
            if (!finalProjectId && documentId) {
                const document = await documentService.getById(documentId);
                finalProjectId = document?.projectId;
            }
            // Start streaming in background
            ;
            (async () => {
                try {
                    let streamTextBuffer = '';
                    let emittedActionBlocks = 0;
                    let emittedPatchActions = 0;
                    const stream = await modelGatewayService.streamChat(googleApiKey, openaiApiKey, message, documentContent, finalProjectId, chatHistory, useWebSearch, modelName, attachments, style, sourceTypes, (progressEvent) => {
                        webContents.send('ai:streamEvent', streamId, progressEvent);
                    });
                    for await (const chunk of stream) {
                        webContents.send('ai:streamChunk', streamId, chunk);
                        // Incremental agent patch events: emit as soon as a fenced lemona-actions block closes.
                        if (typeof chunk === 'string' && chunk.length > 0 && !chunk.includes('__METADATA__')) {
                            streamTextBuffer += chunk;
                            if (streamTextBuffer.length > MAX_AGENT_STREAM_BUFFER_CHARS) {
                                streamTextBuffer = streamTextBuffer.slice(-MAX_AGENT_STREAM_BUFFER_CHARS);
                            }
                            const actionBlocks = extractActionBlocks(streamTextBuffer);
                            if (actionBlocks.length > emittedActionBlocks) {
                                const newBlocks = actionBlocks.slice(emittedActionBlocks);
                                for (let blockOffset = 0; blockOffset < newBlocks.length; blockOffset++) {
                                    const blockContent = newBlocks[blockOffset];
                                    const blockIndex = emittedActionBlocks + blockOffset;
                                    const blockStepId = `patch_block_${blockIndex}`;
                                    webContents.send('ai:streamEvent', streamId, {
                                        type: 'agent_patch_started',
                                        stepId: blockStepId,
                                        action: 'patch',
                                        status: 'started',
                                        label: `Patch block ${blockIndex + 1}`,
                                        timestamp: new Date().toISOString(),
                                    });
                                    try {
                                        const parsed = JSON.parse(blockContent);
                                        const actions = Array.isArray(parsed.actions) ? parsed.actions : [];
                                        for (let i = 0; i < actions.length; i++) {
                                            if (emittedPatchActions >= MAX_AGENT_STREAM_ACTIONS_PER_RESPONSE) {
                                                webContents.send('ai:streamEvent', streamId, {
                                                    type: 'agent_patch_error',
                                                    stepId: `${blockStepId}_limit`,
                                                    action: 'patch',
                                                    status: 'failed',
                                                    label: 'Patch action limit reached',
                                                    summary: `Reached max ${MAX_AGENT_STREAM_ACTIONS_PER_RESPONSE} actions for one response`,
                                                    timestamp: new Date().toISOString(),
                                                });
                                                break;
                                            }
                                            const action = actions[i];
                                            const patchId = `${streamId}_patch_${blockIndex}_${i}`;
                                            webContents.send('ai:streamEvent', streamId, {
                                                type: 'agent_patch_chunk',
                                                stepId: patchId,
                                                action: 'patch',
                                                status: 'note',
                                                label: `Patch ${emittedPatchActions + 1}`,
                                                summary: typeof action?.type === 'string' ? action.type : 'action',
                                                timestamp: new Date().toISOString(),
                                                meta: {
                                                    patchId,
                                                    actionIndex: i,
                                                    blockIndex,
                                                    action,
                                                },
                                            });
                                            webContents.send('ai:streamEvent', streamId, {
                                                type: 'agent_patch_finished',
                                                stepId: patchId,
                                                action: 'patch',
                                                status: 'finished',
                                                label: `Patch ${emittedPatchActions + 1} ready`,
                                                timestamp: new Date().toISOString(),
                                                meta: {
                                                    patchId,
                                                    actionIndex: i,
                                                    blockIndex,
                                                    action,
                                                },
                                            });
                                            emittedPatchActions += 1;
                                        }
                                    }
                                    catch (parseError) {
                                        webContents.send('ai:streamEvent', streamId, {
                                            type: 'agent_patch_error',
                                            stepId: `${blockStepId}_parse`,
                                            action: 'patch',
                                            status: 'failed',
                                            label: `Patch block ${blockIndex + 1} parse failed`,
                                            summary: parseError?.message || 'Invalid action block JSON',
                                            timestamp: new Date().toISOString(),
                                        });
                                    }
                                }
                                emittedActionBlocks = actionBlocks.length;
                            }
                        }
                    }
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
    ipcMain.handle('ai:batchQuestions', async (_, apiKey, questions, documentContent, documentId) => {
        try {
            // Get projectId from document if documentId is provided
            let projectId;
            if (documentId) {
                const document = await documentService.getById(documentId);
                projectId = document?.projectId;
            }
            return await geminiService.batchQuestions(apiKey, questions, documentContent, projectId);
        }
        catch (error) {
            console.error('IPC ai:batchQuestions error:', error);
            throw error;
        }
    });
    // Autocomplete: uses Gemini if available, otherwise falls back to OpenAI GPT-5 Nano
    ipcMain.handle('ai:autocomplete', async (_, googleApiKey, openaiApiKey, text, cursorPosition, documentContent, documentId) => {
        try {
            // Get projectId from document if documentId is provided
            let projectId;
            if (documentId) {
                const document = await documentService.getById(documentId);
                projectId = document?.projectId;
            }
            // Use Gemini if available (default), otherwise fall back to OpenAI GPT-5 Nano
            if (googleApiKey) {
                return await geminiService.autocomplete(googleApiKey, text, cursorPosition, documentContent, projectId, 'gemini-2.5-flash-lite');
            }
            else if (openaiApiKey) {
                return await openaiService.autocomplete(openaiApiKey, text, cursorPosition, documentContent, projectId, 'gpt-4.1-nano');
            }
            else {
                throw new Error('No API key configured. Please add an API key in Settings > API Keys.');
            }
        }
        catch (error) {
            console.error('IPC ai:autocomplete error:', error);
            throw error;
        }
    });
    // New AI features: Title generation and rephrase
    // Title generation uses Gemini
    ipcMain.handle('ai:generateTitle', async (_, apiKey, documentContent) => {
        try {
            // Use Gemini via chat
            const msg = await geminiService.chat(apiKey, `Generate a short, concise title (max 5 words) for this document: "${documentContent.slice(0, 500)}"`, documentContent);
            return msg.content.trim().slice(0, 100);
        }
        catch (error) {
            console.error('IPC ai:generateTitle error:', error);
            throw error;
        }
    });
    // Rephrase text follows active chat provider, including custom OpenAI profiles.
    ipcMain.handle('ai:rephraseText', async (_, googleApiKey, openaiApiKey, text, instruction) => {
        try {
            // Explicitly instruct to only return the rephrased text with no follow-up questions or suggestions
            const systemInstruction = `You are a rewriting engine for a writing editor.
Return ONLY the rewritten text.
No markdown, no titles/section headers, no extra bullets or numbering, no quotes, no explanations, no extra text.
Preserve meaning, tone, person, and language.
Preserve structure: line breaks, paragraphs, list numbering, and punctuation style.
Keep names, terms, numbers, and units unchanged.
Do not add new facts or opinions.
If the instruction conflicts with these rules, follow these rules.
If a USER INSTRUCTION is provided, follow it exactly as long as it does not conflict with these rules.`;
            const prompt = `${systemInstruction}

Original text: "${text}"

Instruction: ${instruction}

Rewritten text:`;
            let result;
            // Prefer active provider profile so quick-edit matches app-level AI provider selection.
            const activeProfile = await aiProviderStore.getActiveChatProfile().catch(() => null);
            if (activeProfile?.type === 'custom-openai') {
                const apiKey = activeProfile.apiKey || openaiApiKey;
                if (!hasUsableKey(apiKey)) {
                    throw new Error('Custom AI provider requires an API key. Please set it in Settings > AI Providers.');
                }
                const msg = await openaiService.chat(apiKey, prompt, undefined, undefined, undefined, activeProfile.chatModel || 'gpt-4.1-nano', undefined, undefined, googleApiKey, activeProfile.baseUrl);
                result = msg.content.trim();
            }
            else if (activeProfile?.type === 'builtin-openai') {
                const apiKey = activeProfile.apiKey || openaiApiKey;
                if (!hasUsableKey(apiKey)) {
                    throw new Error('OpenAI API key is required for the active provider. Please set it in Settings > API Keys.');
                }
                const msg = await openaiService.chat(apiKey, prompt, undefined, undefined, undefined, activeProfile.chatModel || 'gpt-4.1-nano');
                result = msg.content.trim();
            }
            else if (activeProfile?.type === 'builtin-gemini') {
                const apiKey = activeProfile.apiKey || googleApiKey;
                if (!hasUsableKey(apiKey)) {
                    throw new Error('Google API key is required for the active provider. Please set it in Settings > API Keys.');
                }
                const msg = await geminiService.chat(apiKey, prompt, undefined, undefined, undefined, activeProfile.chatModel || 'gemini-2.5-flash-lite');
                result = msg.content.trim();
            }
            else if (openaiApiKey && !googleApiKey) {
                // Legacy fallback when provider state is unavailable.
                const msg = await openaiService.chat(openaiApiKey, prompt, undefined, undefined, undefined, 'gpt-4.1-nano');
                result = msg.content.trim();
            }
            else if (googleApiKey) {
                // Legacy fallback when provider state is unavailable.
                const msg = await geminiService.chat(googleApiKey, prompt, undefined, undefined, undefined, 'gemini-2.5-flash-lite');
                result = msg.content.trim();
            }
            else {
                throw new Error('No API key configured. Please add an API key in Settings > API Keys.');
            }
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
            // API key is now stored in localStorage on the frontend
            // This endpoint is kept for compatibility but always returns true for gemini
            return {
                gemini: true
            };
        }
        catch (error) {
            console.error('IPC ai:getStatus error:', error);
            return {
                gemini: true
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
    ipcMain.handle('window:setTitleBarOverlay', async (event, theme) => {
        const window = BrowserWindow.fromWebContents(event.sender);
        if (window?.setTitleBarOverlay) {
            const isLight = theme === 'light';
            window.setTitleBarOverlay({
                color: isLight ? '#ffffff' : '#141414',
                symbolColor: isLight ? '#000000' : '#bcbcbc',
                height: 36
            });
        }
    });
    ipcMain.handle('zoom:get', async () => {
        try {
            const data = await fs.readFile(ZOOM_LEVEL_FILE, 'utf-8');
            const parsed = JSON.parse(data);
            return typeof parsed.zoomLevel === 'number' ? parsed.zoomLevel : null;
        }
        catch {
            return null;
        }
    });
    ipcMain.handle('app:getVersion', () => app.getVersion());
    // Auto-update controls
    ipcMain.handle('update:download', async () => {
        try {
            await autoUpdater.downloadUpdate();
            return { success: true };
        }
        catch (error) {
            console.error('IPC update:download error:', error);
            return { success: false, error: error?.message ?? 'download failed' };
        }
    });
    ipcMain.handle('update:install', async () => {
        try {
            autoUpdater.quitAndInstall(false, true);
            return { success: true };
        }
        catch (error) {
            console.error('IPC update:install error:', error);
            return { success: false, error: error?.message ?? 'install failed' };
        }
    });
    // Open external URL in default browser
    ipcMain.handle('openExternal', async (_, url) => {
        try {
            await shell.openExternal(url);
        }
        catch (error) {
            console.error('IPC openExternal error:', error);
            throw error;
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
    ipcMain.handle('project:setCover', async (_, projectId) => {
        try {
            const result = await dialog.showOpenDialog({
                title: 'Select cover image',
                properties: ['openFile'],
                filters: [
                    { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp'] },
                ],
            });
            if (result.canceled || result.filePaths.length === 0) {
                return { success: false, canceled: true };
            }
            const filePath = result.filePaths[0];
            const ext = path.extname(filePath).toLowerCase();
            const mimeType = ext === '.png' ? 'image/png' :
                ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' :
                    ext === '.webp' ? 'image/webp' :
                        'application/octet-stream';
            const fileBuffer = await fs.readFile(filePath);
            const base64 = fileBuffer.toString('base64');
            const dataUrl = `data:${mimeType};base64,${base64}`;
            const updated = await projectService.update(projectId, { coverImageData: dataUrl });
            return { success: true, project: updated };
        }
        catch (error) {
            console.error('IPC project:setCover error:', error);
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
    ipcMain.handle('export:exportMultiple', async (_, documentIds, format, filename, usePageBreaks) => {
        try {
            if (!format || !['pdf', 'docx'].includes(format)) {
                throw new Error('Invalid format. Must be pdf or docx');
            }
            if (!documentIds || documentIds.length === 0) {
                throw new Error('No documents selected');
            }
            // Ensure usePageBreaks is explicitly boolean (default to true if undefined)
            const shouldUsePageBreaks = usePageBreaks !== undefined ? usePageBreaks : true;
            const fileBuffer = await exportService.exportMultipleDocuments(documentIds, format, shouldUsePageBreaks);
            return Array.from(fileBuffer); // Convert Buffer to array for IPC
        }
        catch (error) {
            console.error('IPC export:exportMultiple error:', error);
            throw error;
        }
    });
    // Get PDF file content as base64 (for loading large PDFs without storing in JSON)
    // Uses streaming for better memory efficiency with large files
    ipcMain.handle('pdf:getFileContent', async (_, documentId) => {
        try {
            const document = await documentService.getById(documentId);
            if (!document) {
                const error = new Error(`Document ${documentId} not found`);
                console.error('IPC pdf:getFileContent error:', error.message);
                throw error;
            }
            // Check if document is a PDF
            const storedFileName = document.metadata?.fileName || document.title;
            let contentIsPdf = false;
            if (!storedFileName.toLowerCase().endsWith('.pdf')) {
                try {
                    const content = JSON.parse(document.content);
                    const findPdfNode = (node) => {
                        if (node?.type === 'pdfViewer')
                            return true;
                        if (Array.isArray(node?.content)) {
                            return node.content.some(findPdfNode);
                        }
                        return false;
                    };
                    contentIsPdf = findPdfNode(content);
                }
                catch {
                    contentIsPdf = false;
                }
            }
            if (!storedFileName.toLowerCase().endsWith('.pdf') && !contentIsPdf) {
                const error = new Error('Document is not a PDF');
                console.error('IPC pdf:getFileContent error:', error.message);
                throw error;
            }
            // Get file path
            const FILES_DIR = path.join(app.getPath('userData'), 'files');
            const fileName = storedFileName;
            let filePath = path.join(FILES_DIR, `${documentId}_${fileName}`);
            // Check if file exists before trying to read it
            const fs = await import('fs/promises');
            try {
                await fs.access(filePath);
            }
            catch (accessError) {
                // Fallback for older documents where title may be missing .pdf
                const normalizedTitle = fileName.toLowerCase();
                if (!normalizedTitle.endsWith('.pdf')) {
                    const fallbackName = `${documentId}_${fileName}.pdf`;
                    const fallbackPath = path.join(FILES_DIR, fallbackName);
                    try {
                        await fs.access(fallbackPath);
                        filePath = fallbackPath;
                    }
                    catch {
                        // Continue to broader search below
                    }
                }
                // Broader fallback: find any PDF file that matches documentId prefix
                if (filePath === path.join(FILES_DIR, `${documentId}_${fileName}`)) {
                    try {
                        const files = await fs.readdir(FILES_DIR);
                        const match = files.find((f) => {
                            const lower = f.toLowerCase();
                            return lower.startsWith(`${documentId}_`.toLowerCase()) && lower.endsWith('.pdf');
                        });
                        if (match) {
                            filePath = path.join(FILES_DIR, match);
                        }
                    }
                    catch {
                        // Ignore directory read errors - will throw below
                    }
                }
                try {
                    await fs.access(filePath);
                }
                catch {
                    const error = new Error(`PDF file not found at path: ${filePath}`);
                    console.error('IPC pdf:getFileContent error:', error.message);
                    throw error;
                }
            }
            // Read file asynchronously - this doesn't block the main process
            // The conversion to base64 happens in chunks to keep the event loop responsive
            const fileBuffer = await fs.readFile(filePath);
            // Convert to base64 - this is CPU intensive but necessary for PDF.js
            // The frontend will handle this conversion in chunks to keep UI responsive
            const base64 = fileBuffer.toString('base64');
            const pdfDataUrl = `data:application/pdf;base64,${base64}`;
            return pdfDataUrl;
        }
        catch (error) {
            console.error('IPC pdf:getFileContent error:', error);
            throw error;
        }
    });
    // Get image file content as base64 (for loading images stored separately from DOCX)
    ipcMain.handle('image:getFileContent', async (_, documentId, imageId) => {
        try {
            const document = await documentService.getById(documentId);
            if (!document) {
                throw new Error(`Document ${documentId} not found`);
            }
            // Get file path - images are stored as documentId_imageId.ext
            const FILES_DIR = path.join(app.getPath('userData'), 'files');
            // Find the image file - it should match pattern: documentId_img_*.ext
            const fs = await import('fs/promises');
            const files = await fs.readdir(FILES_DIR);
            const imageFile = files.find((f) => f.startsWith(`${documentId}_img_`) && f.includes(imageId));
            if (!imageFile) {
                throw new Error(`Image file not found for imageId: ${imageId}`);
            }
            const imagePath = path.join(FILES_DIR, imageFile);
            const fileBuffer = await fs.readFile(imagePath);
            // Determine content type from file extension
            const ext = imageFile.split('.').pop()?.toLowerCase() || 'png';
            const contentType = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' :
                ext === 'gif' ? 'image/gif' :
                    ext === 'webp' ? 'image/webp' : 'image/png';
            const base64 = fileBuffer.toString('base64');
            return `data:${contentType};base64,${base64}`;
        }
        catch (error) {
            throw error;
        }
    });
    // PDF text extraction handler
    ipcMain.handle('pdf:extractText', async (_, documentId) => {
        try {
            const document = await documentService.getById(documentId);
            if (!document) {
                throw new Error(`Document ${documentId} not found`);
            }
            // Check if document is a PDF
            const storedFileName = document.metadata?.fileName || document.title;
            let contentIsPdf = false;
            if (!storedFileName.toLowerCase().endsWith('.pdf')) {
                try {
                    const content = JSON.parse(document.content);
                    const findPdfNode = (node) => {
                        if (node?.type === 'pdfViewer')
                            return true;
                        if (Array.isArray(node?.content)) {
                            return node.content.some(findPdfNode);
                        }
                        return false;
                    };
                    contentIsPdf = findPdfNode(content);
                }
                catch {
                    contentIsPdf = false;
                }
            }
            if (!storedFileName.toLowerCase().endsWith('.pdf') && !contentIsPdf) {
                throw new Error('Document is not a PDF');
            }
            // Get file path
            const FILES_DIR = path.join(app.getPath('userData'), 'files');
            const fileName = storedFileName;
            let filePath = path.join(FILES_DIR, `${documentId}_${fileName}`);
            const fs = await import('fs/promises');
            try {
                await fs.access(filePath);
            }
            catch {
                // Fallback: find any PDF file that matches documentId prefix
                try {
                    const files = await fs.readdir(FILES_DIR);
                    const match = files.find((f) => {
                        const lower = f.toLowerCase();
                        return lower.startsWith(`${documentId}_`.toLowerCase()) && lower.endsWith('.pdf');
                    });
                    if (match) {
                        filePath = path.join(FILES_DIR, match);
                    }
                }
                catch {
                    // Ignore directory read errors - will throw below
                }
                await fs.access(filePath);
            }
            // Extract text and wait for document update to complete
            const pdfText = await extractPDFTextAsync(filePath, documentId, async (extractedText) => {
                // Update document with extracted text
                const updatedDoc = await documentService.getById(documentId);
                if (updatedDoc) {
                    updatedDoc.pdfText = extractedText;
                    updatedDoc.updatedAt = new Date().toISOString();
                    const docPath = path.join(app.getPath('userData'), 'documents', `${documentId}.json`);
                    await fs.writeFile(docPath, JSON.stringify(updatedDoc, null, 2));
                    console.log(`[IPC pdf:extractText] Document ${documentId} updated with PDF text`);
                }
            });
            // Wait a bit to ensure file write is complete
            await new Promise(resolve => setTimeout(resolve, 100));
            return pdfText;
        }
        catch (error) {
            console.error('IPC pdf:extractText error:', error);
            throw error;
        }
    });
    // DOCX parsing and splitting
    ipcMain.handle('docx:parse', async (_, filePath) => {
        try {
            const result = await parseDocx(filePath);
            return result;
        }
        catch (error) {
            throw error;
        }
    });
    ipcMain.handle('docx:splitAndImport', async (_, filePath, fileName, chapters, split) => {
        try {
            if (split && chapters.length > 0) {
                // Split into multiple files
                const baseFileName = fileName.replace(/\.docx$/i, '');
                const chapterDocs = await splitDocxIntoChapters(filePath, chapters, baseFileName);
                // Create documents for each chapter in workspace
                const createdDocuments = [];
                for (const chapterDoc of chapterDocs) {
                    const doc = await documentService.create(chapterDoc.title, 'project');
                    await documentService.update(doc.id, chapterDoc.content);
                    createdDocuments.push(doc);
                }
                // Save original file to library
                const originalDoc = await documentService.uploadFile(filePath, fileName, 'library');
                return {
                    success: true,
                    split: true,
                    documents: createdDocuments,
                    originalDocument: originalDoc,
                };
            }
            else {
                // Import as single file to workspace
                const doc = await documentService.uploadFile(filePath, fileName, 'project');
                return {
                    success: true,
                    split: false,
                    documents: [doc],
                    originalDocument: null,
                };
            }
        }
        catch (error) {
            throw error;
        }
    });
    // Library indexing operations
    ipcMain.handle('library:indexFile', async (_, documentId, geminiApiKey, openaiApiKey) => {
        try {
            const status = await indexingService.indexLibraryFile(documentId, geminiApiKey, openaiApiKey);
            return status;
        }
        catch (error) {
            console.error('IPC library:indexFile error:', error);
            throw error;
        }
    });
    ipcMain.handle('library:getIndexingStatus', async (_, documentId) => {
        try {
            const status = await indexingService.getIndexingStatus(documentId);
            return status;
        }
        catch (error) {
            console.error('IPC library:getIndexingStatus error:', error);
            throw error;
        }
    });
    ipcMain.handle('library:reindexFile', async (_, documentId, geminiApiKey, openaiApiKey) => {
        try {
            const status = await indexingService.reindexFile(documentId, geminiApiKey, openaiApiKey);
            return status;
        }
        catch (error) {
            console.error('IPC library:reindexFile error:', error);
            throw error;
        }
    });
    ipcMain.handle('library:indexAll', async (_, geminiApiKey, openaiApiKey, onlyUnindexed) => {
        try {
            const results = await indexingService.indexAllLibraryFiles(geminiApiKey, openaiApiKey, onlyUnindexed);
            return results;
        }
        catch (error) {
            console.error('IPC library:indexAll error:', error);
            throw error;
        }
    });
    ipcMain.handle('library:indexProject', async (_, projectId, geminiApiKey, openaiApiKey, onlyUnindexed) => {
        try {
            const results = await indexingService.indexProjectLibraryFiles(projectId, geminiApiKey, openaiApiKey, onlyUnindexed ?? true);
            return results;
        }
        catch (error) {
            console.error('IPC library:indexProject error:', error);
            throw error;
        }
    });
    ipcMain.handle('library:removeFromIndex', async (_, documentId) => {
        try {
            await indexingService.removeFromIndex(documentId);
            return { success: true };
        }
        catch (error) {
            console.error('IPC library:removeFromIndex error:', error);
            throw error;
        }
    });
    ipcMain.handle('library:isIndexValid', async (_, projectId) => {
        try {
            const isValid = await indexingService.isIndexValid(projectId, 'library');
            return isValid;
        }
        catch (error) {
            console.error('IPC library:isIndexValid error:', error);
            throw error;
        }
    });
    // Incremental indexing for project files (Workspace folder)
    ipcMain.handle('indexing:incrementalIndexProjectFiles', async (_, projectId, documentIds, geminiApiKey, openaiApiKey) => {
        try {
            if (!projectId || typeof projectId !== 'string') {
                throw new Error('Invalid projectId provided');
            }
            if (!Array.isArray(documentIds)) {
                throw new Error('documentIds must be an array');
            }
            const results = [];
            for (const documentId of documentIds) {
                try {
                    const status = await indexingService.incrementalIndexProjectFile(documentId, geminiApiKey, openaiApiKey);
                    results.push({ documentId, status });
                }
                catch (error) {
                    // If quota error, stop processing remaining files
                    if (error.message?.includes('quota') || error.message?.includes('Quota')) {
                        console.error(`[IPC] Quota error detected while indexing ${documentId}, stopping:`, error.message);
                        results.push({
                            documentId,
                            status: {
                                documentId,
                                status: 'error',
                                error: `API quota exceeded: ${error.message}`,
                            },
                        });
                        break;
                    }
                    // For other errors, continue with next file
                    console.error(`[IPC] Failed to incrementally index ${documentId}:`, error.message);
                    results.push({
                        documentId,
                        status: {
                            documentId,
                            status: 'error',
                            error: error.message || 'Unknown error',
                        },
                    });
                }
            }
            return results;
        }
        catch (error) {
            console.error('IPC indexing:incrementalIndexProjectFiles error:', error);
            throw error;
        }
    });
    // Integration operations
    ipcMain.handle('integration:selectDbSchemaFolder', async () => {
        try {
            const result = await dialog.showOpenDialog({
                title: 'Select project folder for DB Schema',
                properties: ['openDirectory'],
            });
            if (result.canceled || result.filePaths.length === 0) {
                return { canceled: true, path: null };
            }
            return { canceled: false, path: result.filePaths[0] };
        }
        catch (error) {
            console.error('IPC integration:selectDbSchemaFolder error:', error);
            throw error;
        }
    });
    ipcMain.handle('integration:addSource', async (_, projectId, sourceType, config, displayName) => {
        try {
            return await integrationService.addSource(projectId, sourceType, config, displayName);
        }
        catch (error) {
            console.error('IPC integration:addSource error:', error);
            throw error;
        }
    });
    ipcMain.handle('integration:startOAuth', async (event, projectId, sourceType) => {
        try {
            const parentWindow = BrowserWindow.fromWebContents(event.sender);
            return await integrationService.startOAuth(projectId, sourceType, parentWindow);
        }
        catch (error) {
            console.error('IPC integration:startOAuth error:', error);
            throw error;
        }
    });
    ipcMain.handle('integration:getOAuthConfigStatus', async (_, sourceType) => {
        try {
            return await integrationService.getOAuthConfigStatus(sourceType);
        }
        catch (error) {
            console.error('IPC integration:getOAuthConfigStatus error:', error);
            throw error;
        }
    });
    ipcMain.handle('integration:saveOAuthConfig', async (_, sourceType, config) => {
        try {
            return await integrationService.saveOAuthConfig(sourceType, config);
        }
        catch (error) {
            console.error('IPC integration:saveOAuthConfig error:', error);
            throw error;
        }
    });
    ipcMain.handle('integration:listGithubRepos', async (_, projectId, sourceId) => {
        try {
            return await integrationService.listGithubRepos(projectId, sourceId);
        }
        catch (error) {
            console.error('IPC integration:listGithubRepos error:', error);
            throw error;
        }
    });
    ipcMain.handle('integration:getIndexedGithubRepos', async (_, projectId, sourceId) => {
        try {
            return await integrationService.getIndexedGithubRepos(projectId, sourceId);
        }
        catch (error) {
            console.error('IPC integration:getIndexedGithubRepos error:', error);
            return [];
        }
    });
    ipcMain.handle('integration:updateGithubRepos', async (_, projectId, sourceId, repos) => {
        try {
            return await integrationService.updateGithubRepos(projectId, sourceId, repos);
        }
        catch (error) {
            console.error('IPC integration:updateGithubRepos error:', error);
            throw error;
        }
    });
    ipcMain.handle('integration:listGitlabRepos', async (_, projectId, sourceId) => {
        try {
            return await integrationService.listGitlabRepos(projectId, sourceId);
        }
        catch (error) {
            console.error('IPC integration:listGitlabRepos error:', error);
            throw error;
        }
    });
    ipcMain.handle('integration:getIndexedGitlabRepos', async (_, projectId, sourceId) => {
        try {
            return await integrationService.getIndexedGitlabRepos(projectId, sourceId);
        }
        catch (error) {
            console.error('IPC integration:getIndexedGitlabRepos error:', error);
            return [];
        }
    });
    ipcMain.handle('integration:updateGitlabRepos', async (_, projectId, sourceId, repos) => {
        try {
            return await integrationService.updateGitlabRepos(projectId, sourceId, repos);
        }
        catch (error) {
            console.error('IPC integration:updateGitlabRepos error:', error);
            throw error;
        }
    });
    ipcMain.handle('integration:listSlackChannels', async (_, projectId, sourceId) => {
        try {
            return await integrationService.listSlackChannels(projectId, sourceId);
        }
        catch (error) {
            console.error('IPC integration:listSlackChannels error:', error);
            throw error;
        }
    });
    ipcMain.handle('integration:getIndexedSlackChannels', async (_, projectId, sourceId) => {
        try {
            return await integrationService.getIndexedSlackChannels(projectId, sourceId);
        }
        catch (error) {
            console.error('IPC integration:getIndexedSlackChannels error:', error);
            return [];
        }
    });
    ipcMain.handle('integration:updateSlackChannels', async (_, projectId, sourceId, channels) => {
        try {
            return await integrationService.updateSlackChannels(projectId, sourceId, channels);
        }
        catch (error) {
            console.error('IPC integration:updateSlackChannels error:', error);
            throw error;
        }
    });
    ipcMain.handle('integration:listNotionPages', async (_, projectId, sourceId) => {
        try {
            return await integrationService.listNotionPages(projectId, sourceId);
        }
        catch (error) {
            console.error('IPC integration:listNotionPages error:', error);
            throw error;
        }
    });
    ipcMain.handle('integration:getIndexedNotionPages', async (_, projectId, sourceId) => {
        try {
            return await integrationService.getIndexedNotionPages(projectId, sourceId);
        }
        catch (error) {
            console.error('IPC integration:getIndexedNotionPages error:', error);
            return [];
        }
    });
    ipcMain.handle('integration:updateNotionPages', async (_, projectId, sourceId, pageIds) => {
        try {
            return await integrationService.updateNotionPages(projectId, sourceId, pageIds);
        }
        catch (error) {
            console.error('IPC integration:updateNotionPages error:', error);
            throw error;
        }
    });
    ipcMain.handle('integration:removeSource', async (_, projectId, sourceId) => {
        try {
            return await integrationService.removeSource(projectId, sourceId);
        }
        catch (error) {
            console.error('IPC integration:removeSource error:', error);
            throw error;
        }
    });
    ipcMain.handle('integration:getSources', async (_, projectId) => {
        try {
            return await integrationService.getSources(projectId);
        }
        catch (error) {
            console.error('IPC integration:getSources error:', error);
            throw error;
        }
    });
    ipcMain.handle('integration:syncSource', async (_, projectId, sourceId, geminiApiKey, openaiApiKey) => {
        try {
            return await integrationService.syncSource(projectId, sourceId, geminiApiKey, openaiApiKey);
        }
        catch (error) {
            console.error('IPC integration:syncSource error:', error);
            throw error;
        }
    });
    ipcMain.handle('integration:syncAll', async (_, projectId, geminiApiKey, openaiApiKey) => {
        try {
            return await integrationService.syncAll(projectId, geminiApiKey, openaiApiKey);
        }
        catch (error) {
            console.error('IPC integration:syncAll error:', error);
            throw error;
        }
    });
    // Library search operations (for testing/debugging)
    ipcMain.handle('library:search', async (_, query, projectId, geminiApiKey, openaiApiKey, fileIds, k) => {
        try {
            const { searchLibrary } = await import('./services/semanticSearchService.js');
            // Search in project's library index
            if (!projectId) {
                throw new Error('Project ID is required for library search');
            }
            const results = await searchLibrary(query, projectId, 'library', geminiApiKey, openaiApiKey, fileIds, k || 3);
            return results;
        }
        catch (error) {
            console.error('IPC library:search error:', error);
            throw error;
        }
    });
    ipcMain.handle('library:getFiles', async () => {
        try {
            const files = await semanticSearchService.getLibraryFiles();
            return files;
        }
        catch (error) {
            console.error('IPC library:getFiles error:', error);
            throw error;
        }
    });
    // Library index migration handlers
    ipcMain.handle('library:checkMigration', async () => {
        try {
            const { app } = await import('electron');
            const fs = await import('fs/promises');
            const path = await import('path');
            const BASE_VECTOR_INDEX_DIR = path.join(app.getPath('userData'), 'vectorIndex');
            const oldLibraryIndexDir = path.join(BASE_VECTOR_INDEX_DIR, 'library');
            const oldMetadataFile = path.join(oldLibraryIndexDir, 'metadata.json');
            const oldIndexFile = path.join(oldLibraryIndexDir, 'index.bin');
            const deprecatedMarker = path.join(oldLibraryIndexDir, '.deprecated');
            const migrationStateFile = path.join(BASE_VECTOR_INDEX_DIR, '.migration-pending.json');
            // Check if old index exists
            let oldIndexExists = false;
            let isDeprecated = false;
            let migrationPending = false;
            try {
                await fs.access(oldMetadataFile);
                await fs.access(oldIndexFile);
                oldIndexExists = true;
                // Check if deprecated
                try {
                    await fs.access(deprecatedMarker);
                    isDeprecated = true;
                }
                catch {
                    isDeprecated = false;
                }
                // Check if migration is pending
                try {
                    await fs.access(migrationStateFile);
                    migrationPending = true;
                }
                catch {
                    migrationPending = false;
                }
            }
            catch {
                oldIndexExists = false;
            }
            return {
                oldIndexExists,
                isDeprecated,
                migrationPending,
            };
        }
        catch (error) {
            console.error('IPC library:checkMigration error:', error);
            throw error;
        }
    });
    ipcMain.handle('library:migrate', async (_, geminiApiKey, openaiApiKey) => {
        try {
            const { indexingService } = await import('./services/indexingService.js');
            const result = await indexingService.migrateLibraryIndex(geminiApiKey, openaiApiKey);
            return result;
        }
        catch (error) {
            console.error('IPC library:migrate error:', error);
            throw error;
        }
    });
    ipcMain.handle('library:skipMigration', async () => {
        try {
            const { app } = await import('electron');
            const fs = await import('fs/promises');
            const path = await import('path');
            const BASE_VECTOR_INDEX_DIR = path.join(app.getPath('userData'), 'vectorIndex');
            const oldLibraryIndexDir = path.join(BASE_VECTOR_INDEX_DIR, 'library');
            const deprecatedMarker = path.join(oldLibraryIndexDir, '.deprecated');
            const migrationStateFile = path.join(BASE_VECTOR_INDEX_DIR, '.migration-pending.json');
            // Mark old index as deprecated
            await fs.writeFile(deprecatedMarker, JSON.stringify({
                deprecatedAt: new Date().toISOString(),
                reason: 'User skipped migration',
                note: 'Old index is deprecated. Please re-index files manually if needed.',
            }), 'utf-8');
            // Remove migration pending marker
            try {
                await fs.unlink(migrationStateFile);
            }
            catch {
                // Ignore if file doesn't exist
            }
            return { success: true };
        }
        catch (error) {
            console.error('IPC library:skipMigration error:', error);
            throw error;
        }
    });
    // API Key storage handlers
    ipcMain.handle('settings:saveApiKeys', async (_, geminiApiKey, openaiApiKey) => {
        try {
            const previousKeys = getApiKeys();
            const changed = saveApiKeys(geminiApiKey, openaiApiKey);
            await aiProviderStore.bootstrapFromLegacyKeys(geminiApiKey, openaiApiKey);
            const newKeys = getApiKeys();
            // Check if a new API key was added (previously no key, now has key)
            const hadKeyBefore = (previousKeys.geminiApiKey && previousKeys.geminiApiKey.trim().length > 0) ||
                (previousKeys.openaiApiKey && previousKeys.openaiApiKey.trim().length > 0);
            const hasKeyNow = (newKeys.geminiApiKey && newKeys.geminiApiKey.trim().length > 0) ||
                (newKeys.openaiApiKey && newKeys.openaiApiKey.trim().length > 0);
            // Note: We no longer auto-index all projects when API key is added
            // Instead, indexing happens on-demand when user opens a project
            // This prevents quota exhaustion from indexing all projects at once
            if (changed && !hadKeyBefore && hasKeyNow) {
                console.log('[Auto-Indexing] API key was just added. Indexing will happen automatically when you open a project.');
            }
            return { success: true };
        }
        catch (error) {
            console.error('IPC settings:saveApiKeys error:', error);
            throw error;
        }
    });
    ipcMain.handle('settings:getApiKeys', async () => {
        try {
            const keys = getApiKeys();
            return {
                geminiApiKey: keys.geminiApiKey || '',
                openaiApiKey: keys.openaiApiKey || '',
            };
        }
        catch (error) {
            console.error('IPC settings:getApiKeys error:', error);
            throw error;
        }
    });
    ipcMain.handle('settings:saveSmartIndexing', async (_, enabled) => {
        try {
            const { saveSmartIndexing } = await import('./services/apiKeyStore.js');
            saveSmartIndexing(enabled);
            return { success: true };
        }
        catch (error) {
            console.error('IPC settings:saveSmartIndexing error:', error);
            throw error;
        }
    });
    ipcMain.handle('settings:getSmartIndexing', async () => {
        try {
            const { getSmartIndexing } = await import('./services/apiKeyStore.js');
            return { enabled: getSmartIndexing() };
        }
        catch (error) {
            console.error('IPC settings:getSmartIndexing error:', error);
            throw error;
        }
    });
    ipcMain.handle('settings:getAiProviderState', async () => {
        try {
            return await aiProviderStore.getState();
        }
        catch (error) {
            console.error('IPC settings:getAiProviderState error:', error);
            throw error;
        }
    });
    ipcMain.handle('settings:saveAiProviderProfile', async (_, profile) => {
        try {
            return await aiProviderStore.saveProfile(profile);
        }
        catch (error) {
            console.error('IPC settings:saveAiProviderProfile error:', error);
            throw error;
        }
    });
    ipcMain.handle('settings:removeAiProviderProfile', async (_, profileId) => {
        try {
            return { success: await aiProviderStore.removeProfile(profileId) };
        }
        catch (error) {
            console.error('IPC settings:removeAiProviderProfile error:', error);
            throw error;
        }
    });
    ipcMain.handle('settings:setActiveAiProviders', async (_, active) => {
        try {
            return await aiProviderStore.setActiveProviders(active);
        }
        catch (error) {
            console.error('IPC settings:setActiveAiProviders error:', error);
            throw error;
        }
    });
    // Version control operations
    ipcMain.handle('version:createCommit', async (_, projectId, documentSnapshots, parentId) => {
        try {
            return await versionService.createCommit(projectId, documentSnapshots, parentId);
        }
        catch (error) {
            console.error('IPC version:createCommit error:', error);
            throw error;
        }
    });
    ipcMain.handle('version:getCommits', async (_, projectId) => {
        try {
            if (!projectId || typeof projectId !== 'string') {
                throw new Error('Invalid projectId provided');
            }
            return await versionService.getCommits(projectId);
        }
        catch (error) {
            console.error('IPC version:getCommits error:', error);
            throw error;
        }
    });
    ipcMain.handle('version:getCommit', async (_, projectId, commitId) => {
        try {
            return await versionService.getCommit(projectId, commitId);
        }
        catch (error) {
            console.error('IPC version:getCommit error:', error);
            throw error;
        }
    });
    ipcMain.handle('version:getHeadCommit', async (_, projectId) => {
        try {
            if (!projectId || typeof projectId !== 'string') {
                throw new Error('Invalid projectId provided');
            }
            return await versionService.getHeadCommit(projectId);
        }
        catch (error) {
            console.error('IPC version:getHeadCommit error:', error);
            throw error;
        }
    });
    ipcMain.handle('version:restoreCommit', async (_, projectId, commitId) => {
        try {
            return await versionService.restoreCommit(projectId, commitId);
        }
        catch (error) {
            console.error('IPC version:restoreCommit error:', error);
            throw error;
        }
    });
    ipcMain.handle('evidence:runQuery', async (_, projectId, queryText, sourceTypes, geminiApiKey, openaiApiKey) => {
        try {
            const keys = getApiKeys();
            const gemini = geminiApiKey || keys.geminiApiKey;
            const openai = openaiApiKey || keys.openaiApiKey;
            return await runEvidenceQuery(projectId, { text: queryText, sourceTypes: sourceTypes }, gemini, openai);
        }
        catch (error) {
            console.error('IPC evidence:runQuery error:', error);
            throw error;
        }
    });
    ipcMain.handle('evidence:runEvidenceQuery', async (_, projectId, queryParams, geminiApiKey, openaiApiKey) => {
        try {
            const keys = getApiKeys();
            const gemini = geminiApiKey || keys.geminiApiKey;
            const openai = openaiApiKey || keys.openaiApiKey;
            return await runEvidenceQuery(projectId, queryParams, gemini, openai);
        }
        catch (error) {
            console.error('IPC evidence:runEvidenceQuery error:', error);
            throw error;
        }
    });
}
