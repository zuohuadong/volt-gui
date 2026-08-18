import { promises as fs } from 'node:fs';
import { dirname } from 'node:path';
import type { Message } from './types.js';

export interface SessionMeta {
  id: string;
  createdAt: number;
  updatedAt: number;
  model: string;
  totalPromptTokens?: number;
  totalCompletionTokens?: number;
}

export class SessionStore {
  public static async saveJsonl(filePath: string, messages: Message[], meta?: SessionMeta): Promise<void> {
    await fs.mkdir(dirname(filePath), { recursive: true });
    const lines = messages.map((m) => JSON.stringify(m)).join('\n');
    const header = meta ? JSON.stringify({ _type: 'meta', ...meta }) + '\n' : '';
    await fs.writeFile(filePath, header + lines + '\n', 'utf-8');
  }

  public static async loadJsonl(filePath: string): Promise<{ messages: Message[]; meta?: SessionMeta }> {
    const content = await fs.readFile(filePath, 'utf-8');
    const lines = content.split('\n').filter((l) => l.trim().length > 0);
    const messages: Message[] = [];
    let meta: SessionMeta | undefined;

    for (const line of lines) {
      try {
        const obj = JSON.parse(line);
        if (obj._type === 'meta') {
          meta = obj as SessionMeta;
        } else {
          messages.push(obj as Message);
        }
      } catch {
        // Skip malformed line
      }
    }

    return { messages, meta };
  }
}
