/**
 * Safely parse possibly incomplete or malformed JSON tool arguments.
 * Employs standard jsonrepair to handle unclosed quotes, missing brackets,
 * trailing commas, and escaped markdown code blocks.
 */
export declare function safeParseJson<T = Record<string, unknown>>(input: string, fallback?: T): T;
//# sourceMappingURL=json_repair.d.ts.map