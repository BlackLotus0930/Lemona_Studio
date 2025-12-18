// Desktop Gemini Service - Uses Google Generative AI
import { GoogleGenerativeAI } from '@google/generative-ai';
import { projectService } from './projectService.js';
let genAI = null;
let initialized = false;
function getModel(modelName = 'gemini-2.5-flash') {
    if (!initialized) {
        initialized = true;
        const apiKey = process.env.GEMINI_API_KEY || '';
        if (!apiKey) {
            console.warn('WARNING: GEMINI_API_KEY is not set. AI features will not work.');
            throw new Error('GEMINI_API_KEY is not configured. Please set it in your .env file.');
        }
        genAI = new GoogleGenerativeAI(apiKey);
    }
    if (!genAI) {
        throw new Error('GEMINI_API_KEY is not configured. Please set it in your .env file.');
    }
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
    async chat(message, documentContent, projectId, chatHistory, modelName) {
        const aiModel = getModel(modelName || 'gemini-2.5-flash');
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
    async *streamChat(message, documentContent, projectId, chatHistory, useWebSearch, modelName) {
        const aiModel = getModel(modelName || 'gemini-2.5-flash');
        const { systemInstruction, chatHistory: history } = await buildContext(documentContent, projectId, chatHistory);
        const conversationHistory = [...(history || [])];
        conversationHistory.push({
            id: `msg_${Date.now()}`,
            role: 'user',
            content: message,
            timestamp: new Date().toISOString()
        });
        try {
            const chatConfig = {
                systemInstruction: {
                    parts: [{ text: systemInstruction }],
                    role: "user"
                },
                history: conversationHistory.slice(0, -1).map(msg => ({
                    role: msg.role === 'user' ? 'user' : 'model',
                    parts: [{ text: msg.content }]
                }))
            };
            // Add Google Search tool if enabled
            if (useWebSearch) {
                chatConfig.tools = [{
                        googleSearch: {}
                    }];
            }
            const chat = aiModel.startChat(chatConfig);
            const result = await chat.sendMessageStream(message);
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
    async batchQuestions(questions, documentContent, projectId, modelName) {
        const aiModel = getModel(modelName || 'gemini-2.5-flash');
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
    async autocomplete(text, cursorPosition, documentContent, projectId, modelName) {
        const aiModel = getModel(modelName || 'gemini-2.5-flash');
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
