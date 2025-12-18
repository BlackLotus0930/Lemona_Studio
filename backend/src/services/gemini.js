"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.geminiService = void 0;
const generative_ai_1 = require("@google/generative-ai");
const API_KEY = process.env.GEMINI_API_KEY || '';
if (!API_KEY) {
    console.warn('WARNING: GEMINI_API_KEY is not set. AI features will not work.');
}
const genAI = API_KEY ? new generative_ai_1.GoogleGenerativeAI(API_KEY) : null;
const model = genAI ? genAI.getGenerativeModel({ model: 'gemini-2.5-pro' }) : null;
// Helper to check if API is available
function checkApiAvailable() {
    if (!API_KEY || !model) {
        throw new Error('GEMINI_API_KEY is not configured. Please set it in your .env file.');
    }
}
function buildContext(documentContent) {
    if (!documentContent) {
        return 'You are a helpful AI assistant for writing and learning.';
    }
    try {
        const content = JSON.parse(documentContent);
        const textContent = extractTextFromTipTap(content);
        return `You are a helpful AI assistant. The user is working on a document with the following content:\n\n${textContent}\n\nPlease provide helpful suggestions and answers based on this context.`;
    }
    catch (error) {
        return `You are a helpful AI assistant. The user is working on a document.`;
    }
}
function extractTextFromTipTap(node) {
    if (typeof node === 'string') {
        return node;
    }
    if (node.type === 'text') {
        return node.text || '';
    }
    if (node.content && Array.isArray(node.content)) {
        return node.content.map(extractTextFromTipTap).join('');
    }
    return '';
}
exports.geminiService = {
    async chat(message, documentContent) {
        checkApiAvailable();
        if (!model)
            throw new Error('AI model not available');
        const context = buildContext(documentContent);
        const prompt = `${context}\n\nUser: ${message}\n\nAssistant:`;
        try {
            const result = await model.generateContent(prompt);
            const response = result.response;
            const text = response.text();
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
    async *streamChat(message, documentContent) {
        checkApiAvailable();
        if (!model)
            throw new Error('AI model not available');
        const context = buildContext(documentContent);
        const prompt = `${context}\n\nUser: ${message}\n\nAssistant:`;
        try {
            const result = await model.generateContentStream(prompt);
            for await (const chunk of result.stream) {
                try {
                    const chunkText = chunk.text();
                    if (chunkText) {
                        yield chunkText;
                    }
                }
                catch (chunkError) {
                    console.error('Error processing chunk:', chunkError);
                    // Continue with next chunk instead of failing completely
                }
            }
        }
        catch (error) {
            console.error('Gemini streaming error:', error);
            throw new Error(`Failed to stream response: ${error.message || 'Unknown error'}`);
        }
    },
    async batchQuestions(questions, documentContent) {
        checkApiAvailable();
        if (!model)
            throw new Error('AI model not available');
        const context = buildContext(documentContent);
        const questionsText = questions.map((q, i) => `${i + 1}. ${q}`).join('\n');
        const prompt = `${context}\n\nUser has the following questions. Please answer each one:\n\n${questionsText}\n\nPlease provide answers in a numbered list format.`;
        try {
            const result = await model.generateContent(prompt);
            const response = result.response.text();
            // Parse the response into individual answers
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
    async autocomplete(text, cursorPosition, documentContent) {
        checkApiAvailable();
        if (!model)
            throw new Error('AI model not available');
        const context = buildContext(documentContent);
        const beforeCursor = text.slice(0, cursorPosition);
        const afterCursor = text.slice(cursorPosition);
        const prompt = `${context}\n\nUser is typing: "${beforeCursor}|${afterCursor}"\n\nPlease suggest the next few words or sentence to complete their thought. Only provide the continuation text, nothing else.`;
        try {
            const result = await model.generateContent(prompt);
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
