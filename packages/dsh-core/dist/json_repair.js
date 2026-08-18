import { jsonrepair } from 'jsonrepair';
/**
 * Safely parse possibly incomplete or malformed JSON tool arguments.
 * Employs standard jsonrepair to handle unclosed quotes, missing brackets,
 * trailing commas, and escaped markdown code blocks.
 */
export function safeParseJson(input, fallback = {}) {
    if (!input || !input.trim()) {
        return fallback;
    }
    let cleaned = input.trim();
    // Strip markdown code fence if present
    if (cleaned.startsWith('```json')) {
        cleaned = cleaned.slice(7);
    }
    else if (cleaned.startsWith('```')) {
        cleaned = cleaned.slice(3);
    }
    if (cleaned.endsWith('```')) {
        cleaned = cleaned.slice(0, -3);
    }
    cleaned = cleaned.trim();
    try {
        return JSON.parse(cleaned);
    }
    catch {
        try {
            const repaired = jsonrepair(cleaned);
            return JSON.parse(repaired);
        }
        catch {
            return fallback;
        }
    }
}
//# sourceMappingURL=json_repair.js.map