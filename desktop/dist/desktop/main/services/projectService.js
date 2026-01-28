import { app } from 'electron';
import fs from 'fs/promises';
import path from 'path';
import { documentService } from './documentService.js';
// Use Electron's userData directory for projects
const PROJECTS_DIR = path.join(app.getPath('userData'), 'projects');
console.log('Desktop Project service initialized:');
console.log('  PROJECTS_DIR:', PROJECTS_DIR);
// Ensure projects directory exists
async function ensureProjectsDir() {
    try {
        await fs.mkdir(PROJECTS_DIR, { recursive: true });
    }
    catch (error) {
        console.error('Error creating projects directory:', error);
    }
}
// Initialize on import
ensureProjectsDir();
function getProjectPath(id) {
    return path.join(PROJECTS_DIR, `${id}.json`);
}
export const projectService = {
    /**
     * Get all projects
     */
    async getAll() {
        try {
            await ensureProjectsDir();
            const files = await fs.readdir(PROJECTS_DIR);
            const projects = [];
            for (const file of files) {
                if (file.endsWith('.json')) {
                    try {
                        const filePath = path.join(PROJECTS_DIR, file);
                        const content = await fs.readFile(filePath, 'utf-8');
                        projects.push(JSON.parse(content));
                    }
                    catch (fileError) {
                        console.error(`Error reading project file ${file}:`, fileError);
                    }
                }
            }
            return projects.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
        }
        catch (error) {
            console.error('Error in getAll():', error);
            return [];
        }
    },
    /**
     * Get project by ID
     */
    async getById(id) {
        try {
            const filePath = getProjectPath(id);
            const content = await fs.readFile(filePath, 'utf-8');
            return JSON.parse(content);
        }
        catch (error) {
            return null;
        }
    },
    /**
     * Create a new project
     */
    async create(title, description, intent) {
        await ensureProjectsDir();
        const id = `proj_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const now = new Date().toISOString();
        const project = {
            id,
            title,
            description,
            intent,
            createdAt: now,
            updatedAt: now,
            documentIds: [],
        };
        const filePath = getProjectPath(id);
        await fs.writeFile(filePath, JSON.stringify(project, null, 2));
        return project;
    },
    /**
     * Update project basic info
     */
    async update(id, updates) {
        const project = await this.getById(id);
        if (!project) {
            return null;
        }
        if (updates.title !== undefined)
            project.title = updates.title;
        if (updates.description !== undefined)
            project.description = updates.description;
        if (updates.intent !== undefined)
            project.intent = updates.intent;
        if (updates.coverImageData !== undefined)
            project.coverImageData = updates.coverImageData;
        project.updatedAt = new Date().toISOString();
        const filePath = getProjectPath(id);
        await fs.writeFile(filePath, JSON.stringify(project, null, 2));
        return project;
    },
    /**
     * Update project intent/README
     */
    async updateIntent(id, intent) {
        return this.update(id, { intent });
    },
    /**
     * Add a document to the project
     */
    async addDocument(projectId, documentId, order) {
        const project = await this.getById(projectId);
        if (!project) {
            return null;
        }
        // Check if document already in project
        if (project.documentIds.includes(documentId)) {
            return project; // Already added
        }
        // Update document's projectId
        const document = await documentService.getById(documentId);
        if (document) {
            console.log('[projectService.addDocument] Document before update:', JSON.stringify(document, null, 2));
            // Preserve all existing fields (including folder)
            document.projectId = projectId;
            if (order !== undefined) {
                document.order = order;
            }
            document.updatedAt = new Date().toISOString();
            // Save updated document directly without calling update() to preserve all fields
            const docPath = path.join(app.getPath('userData'), 'documents', `${documentId}.json`);
            try {
                console.log('[projectService.addDocument] Saving document with folder:', document.folder);
                await fs.writeFile(docPath, JSON.stringify(document, null, 2));
                console.log('[projectService.addDocument] Document saved:', JSON.stringify(document, null, 2));
            }
            catch (error) {
                console.error('Error updating document projectId:', error);
            }
        }
        // Add to project's document list
        if (order !== undefined && order >= 0 && order < project.documentIds.length) {
            project.documentIds.splice(order, 0, documentId);
        }
        else {
            project.documentIds.push(documentId);
        }
        project.updatedAt = new Date().toISOString();
        const filePath = getProjectPath(projectId);
        await fs.writeFile(filePath, JSON.stringify(project, null, 2));
        return project;
    },
    /**
     * Remove a document from the project
     */
    async removeDocument(projectId, documentId) {
        const project = await this.getById(projectId);
        if (!project) {
            return null;
        }
        // Remove from project's document list
        project.documentIds = project.documentIds.filter(id => id !== documentId);
        // Clear document's projectId
        const document = await documentService.getById(documentId);
        if (document) {
            document.projectId = undefined;
            document.order = undefined;
            // Update document file directly
            const docPath = path.join(app.getPath('userData'), 'documents', `${documentId}.json`);
            try {
                await fs.writeFile(docPath, JSON.stringify(document, null, 2));
            }
            catch (error) {
                console.error('Error clearing document projectId:', error);
            }
        }
        project.updatedAt = new Date().toISOString();
        const filePath = getProjectPath(projectId);
        await fs.writeFile(filePath, JSON.stringify(project, null, 2));
        return project;
    },
    /**
     * Reorder documents in the project
     */
    async reorderDocuments(projectId, documentIds) {
        const project = await this.getById(projectId);
        if (!project) {
            return null;
        }
        // Validate that all provided IDs exist in the project
        const validIds = documentIds.filter(id => project.documentIds.includes(id));
        const remainingIds = project.documentIds.filter(id => !validIds.includes(id));
        // Update project's document order
        project.documentIds = [...validIds, ...remainingIds];
        // Update document order fields
        for (let i = 0; i < project.documentIds.length; i++) {
            const docId = project.documentIds[i];
            const document = await documentService.getById(docId);
            if (document) {
                document.order = i;
                const docPath = path.join(app.getPath('userData'), 'documents', `${docId}.json`);
                try {
                    await fs.writeFile(docPath, JSON.stringify(document, null, 2));
                }
                catch (error) {
                    console.error(`Error updating document order for ${docId}:`, error);
                }
            }
        }
        project.updatedAt = new Date().toISOString();
        const filePath = getProjectPath(projectId);
        await fs.writeFile(filePath, JSON.stringify(project, null, 2));
        return project;
    },
    /**
     * Get all documents in a project
     */
    async getProjectDocuments(projectId) {
        const project = await this.getById(projectId);
        if (!project) {
            return [];
        }
        const documents = [];
        for (const docId of project.documentIds) {
            const document = await documentService.getById(docId);
            if (document) {
                documents.push(document);
            }
        }
        // Sort by order if available, otherwise by updatedAt
        return documents.sort((a, b) => {
            if (a.order !== undefined && b.order !== undefined) {
                return a.order - b.order;
            }
            return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
        });
    },
    /**
     * Delete a project
     */
    async delete(id) {
        try {
            const project = await this.getById(id);
            if (!project) {
                return false;
            }
            // Clear projectId from all documents in this project
            for (const docId of project.documentIds) {
                const document = await documentService.getById(docId);
                if (document && document.projectId === id) {
                    document.projectId = undefined;
                    document.order = undefined;
                    const docPath = path.join(app.getPath('userData'), 'documents', `${docId}.json`);
                    try {
                        await fs.writeFile(docPath, JSON.stringify(document, null, 2));
                    }
                    catch (error) {
                        console.error(`Error clearing projectId from document ${docId}:`, error);
                    }
                }
            }
            // Delete project file
            const filePath = getProjectPath(id);
            await fs.unlink(filePath);
            return true;
        }
        catch (error) {
            console.error('Error deleting project:', error);
            return false;
        }
    },
};
