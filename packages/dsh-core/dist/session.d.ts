import type { Message } from './types.js';
export interface SessionMeta {
    id: string;
    createdAt: number;
    updatedAt: number;
    model: string;
    totalPromptTokens?: number;
    totalCompletionTokens?: number;
}
export declare class SessionStore {
    static saveJsonl(filePath: string, messages: Message[], meta?: SessionMeta): Promise<void>;
    static loadJsonl(filePath: string): Promise<{
        messages: Message[];
        meta?: SessionMeta;
    }>;
}
//# sourceMappingURL=session.d.ts.map