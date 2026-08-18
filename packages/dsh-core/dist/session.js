import { promises as fs } from 'node:fs';
import { dirname } from 'node:path';
export class SessionStore {
    static async saveJsonl(filePath, messages, meta) {
        await fs.mkdir(dirname(filePath), { recursive: true });
        const lines = messages.map((m) => JSON.stringify(m)).join('\n');
        const header = meta ? JSON.stringify({ _type: 'meta', ...meta }) + '\n' : '';
        await fs.writeFile(filePath, header + lines + '\n', 'utf-8');
    }
    static async loadJsonl(filePath) {
        const content = await fs.readFile(filePath, 'utf-8');
        const lines = content.split('\n').filter((l) => l.trim().length > 0);
        const messages = [];
        let meta;
        for (const line of lines) {
            try {
                const obj = JSON.parse(line);
                if (obj._type === 'meta') {
                    meta = obj;
                }
                else {
                    messages.push(obj);
                }
            }
            catch {
                // Skip malformed line
            }
        }
        return { messages, meta };
    }
}
//# sourceMappingURL=session.js.map