import { documentService } from './documentService.js';
import { projectService } from './projectService.js';
import fs from 'fs/promises';
import path from 'path';
import { app } from 'electron';
export const chatHistoryService = {
    /**
     * Get projectId from documentId
     */
    async getProjectIdFromDocument(documentId) {
        const document = await documentService.getById(documentId);
        if (!document) {
            throw new Error('Document not found');
        }
        return document.projectId || null;
    },
    /**
     * Get all chat history for a project (via documentId)
     */
    async getChatHistory(documentId) {
        const projectId = await this.getProjectIdFromDocument(documentId);
        if (!projectId) {
            // Document has no project, return empty history
            return {};
        }
        const project = await projectService.getById(projectId);
        if (!project) {
            throw new Error('Project not found');
        }
        return project.chatHistory || {};
    },
    /**
     * Get messages for a specific chat thread
     */
    async getChatMessages(documentId, chatId) {
        const chatHistory = await this.getChatHistory(documentId);
        return chatHistory[chatId] || [];
    },
    /**
     * Add a new message to a chat thread
     */
    async addMessage(documentId, chatId, message) {
        const projectId = await this.getProjectIdFromDocument(documentId);
        if (!projectId) {
            throw new Error('Document must belong to a project to save chat history');
        }
        const project = await projectService.getById(projectId);
        if (!project) {
            throw new Error('Project not found');
        }
        // Initialize chatHistory if it doesn't exist
        if (!project.chatHistory) {
            project.chatHistory = {};
        }
        // Initialize chat thread if it doesn't exist
        if (!project.chatHistory[chatId]) {
            project.chatHistory[chatId] = [];
        }
        // Add the message
        project.chatHistory[chatId].push(message);
        // Save the project
        await this.saveChatHistory(projectId, project.chatHistory);
    },
    /**
     * Update an existing message (useful for streaming updates)
     */
    async updateMessage(documentId, chatId, messageId, content, reasoningMetadata) {
        const projectId = await this.getProjectIdFromDocument(documentId);
        if (!projectId) {
            throw new Error('Document must belong to a project to update chat history');
        }
        const project = await projectService.getById(projectId);
        if (!project) {
            throw new Error('Project not found');
        }
        if (!project.chatHistory || !project.chatHistory[chatId]) {
            throw new Error('Chat thread not found');
        }
        const messages = project.chatHistory[chatId];
        const messageIndex = messages.findIndex(msg => msg.id === messageId);
        if (messageIndex === -1) {
            throw new Error('Message not found');
        }
        // Update the message content
        messages[messageIndex].content = content;
        messages[messageIndex].timestamp = new Date().toISOString();
        // Preserve reasoningMetadata if provided, or keep existing if not provided
        if (reasoningMetadata !== undefined) {
            messages[messageIndex].reasoningMetadata = reasoningMetadata;
        }
        // Save the updated chat history
        await this.saveChatHistory(projectId, project.chatHistory);
    },
    /**
     * Delete a chat thread
     */
    async deleteChat(documentId, chatId) {
        const projectId = await this.getProjectIdFromDocument(documentId);
        if (!projectId) {
            // No project, nothing to delete
            return;
        }
        const project = await projectService.getById(projectId);
        if (!project) {
            throw new Error('Project not found');
        }
        if (!project.chatHistory || !project.chatHistory[chatId]) {
            // Chat doesn't exist, nothing to delete
            return;
        }
        // Delete the chat thread
        delete project.chatHistory[chatId];
        // Save the updated chat history
        await this.saveChatHistory(projectId, project.chatHistory);
    },
    /**
     * Save chat history to project (internal helper)
     */
    async saveChatHistory(projectId, chatHistory) {
        const project = await projectService.getById(projectId);
        if (!project) {
            throw new Error('Project not found');
        }
        // Update the project with new chat history
        project.chatHistory = chatHistory;
        project.updatedAt = new Date().toISOString();
        // Save the project directly
        const PROJECTS_DIR = path.join(app.getPath('userData'), 'projects');
        const filePath = path.join(PROJECTS_DIR, `${projectId}.json`);
        await fs.writeFile(filePath, JSON.stringify(project, null, 2));
    },
};
