// Agent Tools - Functions that the AI agent can use
import { projectService } from './projectService.js';
import { documentService } from './documentService.js';
// Tool definitions for Gemini function calling
export const toolDeclarations = [
    {
        name: 'list_project_files',
        description: 'List all files/documents in the current project. Returns a list of document titles and their IDs.',
        parameters: {
            type: 'object',
            properties: {},
            required: []
        }
    },
    {
        name: 'read_file',
        description: 'Read the content of a specific file/document in the project by its title or ID.',
        parameters: {
            type: 'object',
            properties: {
                identifier: {
                    type: 'string',
                    description: 'The title or ID of the document to read'
                }
            },
            required: ['identifier']
        }
    },
    {
        name: 'write_file',
        description: 'Write or update content to a file/document in the project. Can create new files or update existing ones.',
        parameters: {
            type: 'object',
            properties: {
                title: {
                    type: 'string',
                    description: 'The title of the document to write to'
                },
                content: {
                    type: 'string',
                    description: 'The text content to write to the file'
                },
                mode: {
                    type: 'string',
                    enum: ['overwrite', 'append'],
                    description: 'Whether to overwrite the file or append to it. Default is overwrite.'
                }
            },
            required: ['title', 'content']
        }
    },
    {
        name: 'search_in_project',
        description: 'Search for text patterns across all documents in the project using regex or plain text search.',
        parameters: {
            type: 'object',
            properties: {
                pattern: {
                    type: 'string',
                    description: 'The search pattern (text or regex) to look for'
                },
                isRegex: {
                    type: 'boolean',
                    description: 'Whether the pattern is a regex (true) or plain text (false). Default is false.'
                },
                caseSensitive: {
                    type: 'boolean',
                    description: 'Whether the search should be case sensitive. Default is false.'
                }
            },
            required: ['pattern']
        }
    },
    {
        name: 'web_search',
        description: 'Search the web for information. Returns relevant search results with titles, snippets, and URLs.',
        parameters: {
            type: 'object',
            properties: {
                query: {
                    type: 'string',
                    description: 'The search query to look up on the web'
                }
            },
            required: ['query']
        }
    },
    {
        name: 'create_file',
        description: 'Create a new file/document in the current project.',
        parameters: {
            type: 'object',
            properties: {
                title: {
                    type: 'string',
                    description: 'The title/name of the new document'
                },
                content: {
                    type: 'string',
                    description: 'The initial content for the new document (optional)'
                }
            },
            required: ['title']
        }
    },
    {
        name: 'delete_file',
        description: 'Delete a file/document from the current project.',
        parameters: {
            type: 'object',
            properties: {
                identifier: {
                    type: 'string',
                    description: 'The title or ID of the document to delete'
                }
            },
            required: ['identifier']
        }
    }
];
// Helper function to extract text from TipTap JSON content
function extractTextFromTipTap(node) {
    if (typeof node === 'string') {
        return node;
    }
    if (node.type === 'text') {
        return node.text || '';
    }
    if (node.content && Array.isArray(node.content)) {
        return node.content.map(extractTextFromTipTap).join('\n');
    }
    return '';
}
// Helper function to convert plain text to TipTap JSON format
function textToTipTap(text) {
    const paragraphs = text.split('\n').filter(p => p.trim() || true);
    const content = paragraphs.map(p => ({
        type: 'paragraph',
        content: p ? [{ type: 'text', text: p }] : []
    }));
    return JSON.stringify({
        type: 'doc',
        content
    });
}
// Tool implementations
export const toolImplementations = {
    async list_project_files(context) {
        try {
            const documents = await projectService.getProjectDocuments(context.projectId);
            const fileList = documents.map(doc => ({
                id: doc.id,
                title: doc.title,
                updatedAt: doc.updatedAt
            }));
            return {
                success: true,
                result: {
                    files: fileList,
                    count: fileList.length
                }
            };
        }
        catch (error) {
            return {
                success: false,
                error: `Failed to list files: ${error.message}`
            };
        }
    },
    async read_file(context, args) {
        try {
            const documents = await projectService.getProjectDocuments(context.projectId);
            // Find document by title or ID
            const doc = documents.find(d => d.title.toLowerCase() === args.identifier.toLowerCase() ||
                d.id === args.identifier);
            if (!doc) {
                return {
                    success: false,
                    error: `File not found: ${args.identifier}`
                };
            }
            // Parse TipTap content and extract text
            let textContent = '';
            try {
                const content = JSON.parse(doc.content);
                textContent = extractTextFromTipTap(content);
            }
            catch {
                textContent = doc.content;
            }
            return {
                success: true,
                result: {
                    title: doc.title,
                    id: doc.id,
                    content: textContent,
                    updatedAt: doc.updatedAt
                }
            };
        }
        catch (error) {
            return {
                success: false,
                error: `Failed to read file: ${error.message}`
            };
        }
    },
    async write_file(context, args) {
        try {
            const documents = await projectService.getProjectDocuments(context.projectId);
            // Find existing document by title
            const existingDoc = documents.find(d => d.title.toLowerCase() === args.title.toLowerCase());
            if (existingDoc) {
                // Update existing document
                let newContent;
                if (args.mode === 'append') {
                    // Append to existing content
                    let existingText = '';
                    try {
                        const parsed = JSON.parse(existingDoc.content);
                        existingText = extractTextFromTipTap(parsed);
                    }
                    catch {
                        existingText = existingDoc.content;
                    }
                    newContent = textToTipTap(existingText + '\n' + args.content);
                }
                else {
                    // Overwrite
                    newContent = textToTipTap(args.content);
                }
                await documentService.update(existingDoc.id, newContent);
                return {
                    success: true,
                    result: {
                        action: 'updated',
                        title: existingDoc.title,
                        id: existingDoc.id
                    }
                };
            }
            else {
                // Create new document
                const newDoc = await documentService.create(args.title);
                const content = textToTipTap(args.content);
                await documentService.update(newDoc.id, content);
                await projectService.addDocument(context.projectId, newDoc.id);
                return {
                    success: true,
                    result: {
                        action: 'created',
                        title: args.title,
                        id: newDoc.id
                    }
                };
            }
        }
        catch (error) {
            return {
                success: false,
                error: `Failed to write file: ${error.message}`
            };
        }
    },
    async search_in_project(context, args) {
        try {
            const documents = await projectService.getProjectDocuments(context.projectId);
            const results = [];
            const flags = args.caseSensitive ? 'g' : 'gi';
            let regex;
            try {
                regex = args.isRegex
                    ? new RegExp(args.pattern, flags)
                    : new RegExp(args.pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), flags);
            }
            catch (e) {
                return {
                    success: false,
                    error: `Invalid regex pattern: ${e.message}`
                };
            }
            for (const doc of documents) {
                let textContent = '';
                try {
                    const content = JSON.parse(doc.content);
                    textContent = extractTextFromTipTap(content);
                }
                catch {
                    textContent = doc.content;
                }
                const lines = textContent.split('\n');
                const fileMatches = [];
                lines.forEach((line, index) => {
                    const matches = line.match(regex);
                    if (matches) {
                        fileMatches.push({
                            line: index + 1,
                            text: line.trim().substring(0, 200), // Truncate long lines
                            match: matches[0]
                        });
                    }
                });
                if (fileMatches.length > 0) {
                    results.push({
                        file: doc.title,
                        id: doc.id,
                        matches: fileMatches
                    });
                }
            }
            return {
                success: true,
                result: {
                    pattern: args.pattern,
                    totalMatches: results.reduce((sum, r) => sum + r.matches.length, 0),
                    filesWithMatches: results.length,
                    results
                }
            };
        }
        catch (error) {
            return {
                success: false,
                error: `Failed to search: ${error.message}`
            };
        }
    },
    async web_search(context, args) {
        try {
            // Use DuckDuckGo HTML scraping (free, no API key needed)
            // This works independently as a function tool, avoiding conflicts with function calling
            const encodedQuery = encodeURIComponent(args.query);
            const searchUrl = `https://html.duckduckgo.com/html/?q=${encodedQuery}`;
            const response = await fetch(searchUrl, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                }
            });
            if (!response.ok) {
                throw new Error(`HTTP error: ${response.status}`);
            }
            const html = await response.text();
            // Parse DuckDuckGo HTML results
            const results = [];
            // DuckDuckGo HTML structure: results are in <div class="result">
            // More robust regex to match various DuckDuckGo HTML structures
            const titleRegex = /<a[^>]*class="result__a"[^>]*href="([^"]+)"[^>]*>([^<]+)<\/a>/g;
            const snippetRegex = /<a[^>]*class="result__snippet"[^>]*>([^<]+)<\/a>/g;
            let titleMatch;
            const titles = [];
            // Extract all titles and URLs
            while ((titleMatch = titleRegex.exec(html)) !== null && titles.length < 10) {
                const url = titleMatch[1];
                const title = titleMatch[2].trim();
                if (url && title) {
                    titles.push({
                        url: url.startsWith('http') ? url : `https:${url}`,
                        title
                    });
                }
            }
            // Extract snippets
            let snippetMatch;
            const snippets = [];
            while ((snippetMatch = snippetRegex.exec(html)) !== null && snippets.length < 10) {
                snippets.push(snippetMatch[1].trim());
            }
            // Combine titles and snippets
            for (let i = 0; i < Math.min(titles.length, snippets.length, 5); i++) {
                results.push({
                    title: titles[i].title,
                    snippet: snippets[i].substring(0, 200), // Limit snippet length
                    url: titles[i].url
                });
            }
            // If we have titles but no snippets, still return titles
            if (results.length === 0 && titles.length > 0) {
                for (let i = 0; i < Math.min(titles.length, 5); i++) {
                    results.push({
                        title: titles[i].title,
                        snippet: 'No snippet available',
                        url: titles[i].url
                    });
                }
            }
            if (results.length === 0) {
                return {
                    success: true,
                    result: {
                        query: args.query,
                        message: 'No results found. Try rephrasing your query.',
                        results: []
                    }
                };
            }
            return {
                success: true,
                result: {
                    query: args.query,
                    results
                }
            };
        }
        catch (error) {
            return {
                success: false,
                error: `Web search failed: ${error.message}`
            };
        }
    },
    async create_file(context, args) {
        try {
            const documents = await projectService.getProjectDocuments(context.projectId);
            // Check if file already exists
            const existing = documents.find(d => d.title.toLowerCase() === args.title.toLowerCase());
            if (existing) {
                return {
                    success: false,
                    error: `File already exists: ${args.title}`
                };
            }
            // Create new document
            const newDoc = await documentService.create(args.title);
            // Set initial content if provided
            if (args.content) {
                const content = textToTipTap(args.content);
                await documentService.update(newDoc.id, content);
            }
            // Add to project
            await projectService.addDocument(context.projectId, newDoc.id);
            return {
                success: true,
                result: {
                    title: args.title,
                    id: newDoc.id,
                    message: `File "${args.title}" created successfully`
                }
            };
        }
        catch (error) {
            return {
                success: false,
                error: `Failed to create file: ${error.message}`
            };
        }
    },
    async delete_file(context, args) {
        try {
            const documents = await projectService.getProjectDocuments(context.projectId);
            // Find document by title or ID
            const doc = documents.find(d => d.title.toLowerCase() === args.identifier.toLowerCase() ||
                d.id === args.identifier);
            if (!doc) {
                return {
                    success: false,
                    error: `File not found: ${args.identifier}`
                };
            }
            // Remove from project first
            await projectService.removeDocument(context.projectId, doc.id);
            // Delete the document
            await documentService.delete(doc.id);
            return {
                success: true,
                result: {
                    title: doc.title,
                    id: doc.id,
                    message: `File "${doc.title}" deleted successfully`
                }
            };
        }
        catch (error) {
            return {
                success: false,
                error: `Failed to delete file: ${error.message}`
            };
        }
    }
};
// Execute a tool by name
export async function executeTool(toolName, args, context) {
    switch (toolName) {
        case 'list_project_files':
            return toolImplementations.list_project_files(context);
        case 'read_file':
            return toolImplementations.read_file(context, args);
        case 'write_file':
            return toolImplementations.write_file(context, args);
        case 'search_in_project':
            return toolImplementations.search_in_project(context, args);
        case 'web_search':
            return toolImplementations.web_search(context, args);
        case 'create_file':
            return toolImplementations.create_file(context, args);
        case 'delete_file':
            return toolImplementations.delete_file(context, args);
        default:
            return {
                success: false,
                error: `Unknown tool: ${toolName}`
            };
    }
}
