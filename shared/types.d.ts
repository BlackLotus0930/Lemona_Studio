export interface Document {
    id: string;
    title: string;
    content: string;
    createdAt: string;
    updatedAt: string;
}
export interface Section {
    id: string;
    title: string;
    content: string;
    order: number;
}
export interface AIChatMessage {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    timestamp: string;
}
export interface AIQuestion {
    id: string;
    question: string;
    answer?: string;
    status: 'pending' | 'answering' | 'completed';
}
export interface AutocompleteSuggestion {
    text: string;
    start: number;
    end: number;
}
export interface ExportOptions {
    format: 'pdf' | 'docx';
    filename?: string;
}
//# sourceMappingURL=types.d.ts.map