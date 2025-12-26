// Desktop Gemini Service - Uses Google Generative AI
import { GoogleGenerativeAI } from '@google/generative-ai';
import { projectService } from './projectService.js';
// Store API key instances per API key to allow multiple users
const genAICache = new Map();
function getModel(apiKey, modelName = 'gemini-2.5-flash') {
    if (!apiKey) {
        throw new Error('Google API key is not configured. Please set it in Settings > API Keys.');
    }
    // Use cached instance if available, otherwise create new one
    if (!genAICache.has(apiKey)) {
        genAICache.set(apiKey, new GoogleGenerativeAI(apiKey));
    }
    const genAI = genAICache.get(apiKey);
    return genAI.getGenerativeModel({ model: modelName });
}
const SYSTEM_PROMPT = `You are a reliable, focused assistant for Lemona.

You must always:

- Understand user intent and ask follow-up questions if the request is ambiguous.

- Prioritize safe, accurate, verifiable information.

- Follow the output contract defined later for each task.

- Never hallucinate facts; if you cannot answer confidently, say "INSUFFICIENT_DATA".

General rules:

1. Respond concisely and clearly unless the user requests depth.

2. Provide structured outputs in the requested format (JSON, steps, table, etc.).

3. Cite sources when available (URL or named source).

4. Abide by safety policies: avoid harmful advice, personal data exposure, and disallowed content.

When responding in JSON:

- Output only valid JSON (no extra commentary outside the JSON object).

- Follow the exact schema from the user request.

If the request is incomplete:

- Ask the user a clarifying question before answering.

End every answer with a clear "Next step" suggestion if relevant.`;
async function getReadmeContent(projectId) {
    try {
        const documents = await projectService.getProjectDocuments(projectId);
        const readmeDoc = documents.find(doc => doc.title === 'README.md');
        if (readmeDoc) {
            const content = JSON.parse(readmeDoc.content);
            return extractTextFromTipTap(content);
        }
        return null;
    }
    catch (error) {
        return null;
    }
}
async function buildContext(documentContent, projectId, chatHistory) {
    let systemInstruction = SYSTEM_PROMPT;
    if (projectId) {
        const readmeContent = await getReadmeContent(projectId);
        if (readmeContent && readmeContent.trim()) {
            systemInstruction += `\n\n## PROJECT INSTRUCTIONS (README.md)\n\n${readmeContent}\n`;
        }
    }
    if (documentContent) {
        try {
            const content = JSON.parse(documentContent);
            const textContent = extractTextFromTipTap(content);
            if (textContent && textContent.trim()) {
                const truncatedContent = textContent.length > 5000
                    ? textContent.substring(0, 5000) + '\n\n[... document continues ...]'
                    : textContent;
                systemInstruction += `\n\n## CURRENT DOCUMENT CONTENT\n\n${truncatedContent}\n`;
            }
        }
        catch (error) {
            // Ignore
        }
    }
    return { systemInstruction, chatHistory: chatHistory || [] };
}
function extractTextFromTipTap(node) {
    if (typeof node === 'string')
        return node;
    if (node.type === 'text')
        return node.text || '';
    if (node.content && Array.isArray(node.content)) {
        return node.content.map(extractTextFromTipTap).join('');
    }
    return '';
}
export const geminiService = {
    async chat(apiKey, message, documentContent, projectId, chatHistory, modelName) {
        const aiModel = getModel(apiKey, modelName || 'gemini-2.5-flash');
        const { systemInstruction, chatHistory: history } = await buildContext(documentContent, projectId, chatHistory);
        const conversationHistory = [...(history || [])];
        conversationHistory.push({
            id: `msg_${Date.now()}`,
            role: 'user',
            content: message,
            timestamp: new Date().toISOString()
        });
        try {
            const chat = aiModel.startChat({
                systemInstruction: {
                    parts: [{ text: systemInstruction }],
                    role: "user"
                },
                history: conversationHistory.slice(0, -1).map(msg => ({
                    role: msg.role === 'user' ? 'user' : 'model',
                    parts: [{ text: msg.content }]
                }))
            });
            const result = await chat.sendMessage(message);
            const text = result.response.text();
            return {
                id: `msg_${Date.now()}`,
                role: 'assistant',
                content: text,
                timestamp: new Date().toISOString(),
            };
        }
        catch (error) {
            console.error('Gemini API error:', error);
            throw new Error(`Failed to generate response: ${error.message || 'Unknown error'}`);
        }
    },
    async *streamChat(apiKey, message, documentContent, projectId, chatHistory, useWebSearch, modelName, attachments) {
        const aiModel = getModel(apiKey, modelName || 'gemini-2.5-flash');
        const { systemInstruction, chatHistory: history } = await buildContext(documentContent, projectId, chatHistory);
        const conversationHistory = [...(history || [])];
        conversationHistory.push({
            id: `msg_${Date.now()}`,
            role: 'user',
            content: message,
            timestamp: new Date().toISOString(),
            attachments: attachments
        });
        // Build parts array for the current message
        const parts = [];
        // Add attachments first (images and PDFs)
        if (attachments && attachments.length > 0) {
            for (const attachment of attachments) {
                if (attachment.type === 'image') {
                    parts.push({
                        inlineData: {
                            data: attachment.data,
                            mimeType: attachment.mimeType || 'image/png'
                        }
                    });
                }
                else if (attachment.type === 'pdf') {
                    // For PDFs, Gemini API supports file data
                    parts.push({
                        inlineData: {
                            data: attachment.data,
                            mimeType: 'application/pdf'
                        }
                    });
                }
            }
        }
        // Add text message (even if empty, we need at least one part)
        parts.push({ text: message || '' });
        try {
            const chatConfig = {
                systemInstruction: {
                    parts: [{ text: systemInstruction }],
                    role: "user"
                },
                history: conversationHistory.slice(0, -1).map(msg => {
                    const msgParts = [];
                    // Add attachments from history
                    if (msg.attachments && msg.attachments.length > 0) {
                        for (const attachment of msg.attachments) {
                            if (attachment.type === 'image') {
                                msgParts.push({
                                    inlineData: {
                                        data: attachment.data,
                                        mimeType: attachment.mimeType || 'image/png'
                                    }
                                });
                            }
                            else if (attachment.type === 'pdf') {
                                msgParts.push({
                                    inlineData: {
                                        data: attachment.data,
                                        mimeType: 'application/pdf'
                                    }
                                });
                            }
                        }
                    }
                    // Add text content (always add, even if empty, to ensure at least one part)
                    msgParts.push({ text: msg.content || '' });
                    return {
                        role: msg.role === 'user' ? 'user' : 'model',
                        parts: msgParts
                    };
                })
            };
            // Add Google Search tool if enabled
            if (useWebSearch) {
                chatConfig.tools = [{
                        googleSearch: {}
                    }];
            }
            const chat = aiModel.startChat(chatConfig);
            const result = await chat.sendMessageStream(parts);
            for await (const chunk of result.stream) {
                try {
                    const chunkText = chunk.text();
                    if (chunkText) {
                        yield chunkText;
                    }
                }
                catch (chunkError) {
                    // Continue
                }
            }
        }
        catch (error) {
            console.error('[Gemini] Streaming error:', error);
            throw new Error(`Failed to stream response: ${error.message || 'Unknown error'}`);
        }
    },
    async batchQuestions(apiKey, questions, documentContent, projectId, modelName) {
        const aiModel = getModel(apiKey, modelName || 'gemini-2.5-flash');
        const { systemInstruction } = await buildContext(documentContent, projectId);
        const questionsText = questions.map((q, i) => `${i + 1}. ${q}`).join('\n');
        const prompt = `${systemInstruction}\n\nUser has the following questions. Please answer each one:\n\n${questionsText}\n\nPlease provide answers in a numbered list format.`;
        try {
            const result = await aiModel.generateContent(prompt);
            const response = result.response.text();
            const answers = response.split(/\d+\./).filter(a => a.trim()).map(a => a.trim());
            return questions.map((question, index) => ({
                id: `q_${Date.now()}_${index}`,
                question,
                answer: answers[index] || 'Answer not available',
                status: 'completed',
            }));
        }
        catch (error) {
            console.error('Gemini batch questions error:', error);
            throw new Error(`Failed to process batch questions: ${error.message || 'Unknown error'}`);
        }
    },
    async autocomplete(apiKey, text, cursorPosition, documentContent, projectId, modelName) {
        const aiModel = getModel(apiKey, modelName || 'gemini-2.5-flash');
        const { systemInstruction } = await buildContext(documentContent, projectId);
        const beforeCursor = text.slice(0, cursorPosition);
        const afterCursor = text.slice(cursorPosition);
        const prompt = `${systemInstruction}\n\nUser is typing: "${beforeCursor}|${afterCursor}"\n\nPlease suggest the next few words or sentence to complete their thought. Only provide the continuation text, nothing else.`;
        try {
            const result = await aiModel.generateContent(prompt);
            const suggestion = result.response.text().trim();
            return {
                text: suggestion,
                start: cursorPosition,
                end: cursorPosition + suggestion.length,
            };
        }
        catch (error) {
            console.error('Gemini autocomplete error:', error);
            throw new Error(`Failed to generate autocomplete: ${error.message || 'Unknown error'}`);
        }
    },
};
