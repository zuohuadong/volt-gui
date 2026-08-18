import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { exec } from 'node:child_process';
import fg from 'fast-glob';
const MAX_OUTPUT_CHARS = 32 * 1024; // 32KB max output cap
export class BuiltinCodingPlugin {
    name = 'dsh-builtin-coding';
    description = 'Standard filesystem, search, and execution tools for DSH';
    workingDir = process.cwd();
    init(context) {
        this.workingDir = context.workingDirectory;
    }
    getTools() {
        return [
            this.createReadFileTool(),
            this.createWriteFileTool(),
            this.createEditFileTool(),
            this.createListDirTool(),
            this.createGrepTool(),
            this.createGlobTool(),
            this.createBashTool(),
        ];
    }
    resolvePath(targetPath) {
        return path.isAbsolute(targetPath) ? targetPath : path.resolve(this.workingDir, targetPath);
    }
    createReadFileTool() {
        return {
            schema: {
                name: 'read_file',
                description: 'Reads the content of a file with line numbers and optional range offset/limit.',
                parameters: {
                    type: 'object',
                    properties: {
                        path: { type: 'string', description: 'Target file path' },
                        offset: { type: 'number', description: 'Line number to start reading from (1-based)' },
                        limit: { type: 'number', description: 'Maximum number of lines to read' },
                    },
                    required: ['path'],
                },
            },
            execute: async (args) => {
                const filePath = this.resolvePath(String(args.path));
                try {
                    const content = await fs.readFile(filePath, 'utf-8');
                    const lines = content.split('\n');
                    const offset = Math.max(1, typeof args.offset === 'number' ? args.offset : 1);
                    const limit = typeof args.limit === 'number' ? args.limit : lines.length;
                    const selected = lines.slice(offset - 1, offset - 1 + limit);
                    const numbered = selected.map((line, idx) => `${offset + idx} | ${line}`).join('\n');
                    if (numbered.length > MAX_OUTPUT_CHARS) {
                        return numbered.slice(0, MAX_OUTPUT_CHARS) + '\n...[Output truncated due to size limit]';
                    }
                    return numbered;
                }
                catch (err) {
                    return { output: `Error reading file ${filePath}: ${err.message}`, isError: true };
                }
            },
        };
    }
    createWriteFileTool() {
        return {
            schema: {
                name: 'write_file',
                description: 'Writes complete content to a file, creating parent directories automatically.',
                parameters: {
                    type: 'object',
                    properties: {
                        path: { type: 'string', description: 'Target file path' },
                        content: { type: 'string', description: 'Content to write' },
                    },
                    required: ['path', 'content'],
                },
            },
            execute: async (args) => {
                const filePath = this.resolvePath(String(args.path));
                const content = String(args.content ?? '');
                try {
                    await fs.mkdir(path.dirname(filePath), { recursive: true });
                    await fs.writeFile(filePath, content, 'utf-8');
                    return `Successfully wrote ${content.length} bytes to ${filePath}`;
                }
                catch (err) {
                    return { output: `Error writing file ${filePath}: ${err.message}`, isError: true };
                }
            },
        };
    }
    createEditFileTool() {
        return {
            schema: {
                name: 'edit_file',
                description: 'Surgically replaces an exact unique string (old_str) with new content (new_str).',
                parameters: {
                    type: 'object',
                    properties: {
                        path: { type: 'string', description: 'Target file path' },
                        old_str: { type: 'string', description: 'Exact string to be replaced' },
                        new_str: { type: 'string', description: 'Replacement string' },
                    },
                    required: ['path', 'old_str', 'new_str'],
                },
            },
            execute: async (args) => {
                const filePath = this.resolvePath(String(args.path));
                const oldStr = String(args.old_str ?? '');
                const newStr = String(args.new_str ?? '');
                try {
                    const content = await fs.readFile(filePath, 'utf-8');
                    const occurrences = content.split(oldStr).length - 1;
                    if (occurrences === 0) {
                        return {
                            output: `Error: 'old_str' was not found in ${filePath}. Verify exact characters, whitespace and indentation.`,
                            isError: true,
                        };
                    }
                    if (occurrences > 1) {
                        return {
                            output: `Error: 'old_str' occurred ${occurrences} times in ${filePath}. Provide more surrounding context to make it unique.`,
                            isError: true,
                        };
                    }
                    const updated = content.replace(oldStr, newStr);
                    await fs.writeFile(filePath, updated, 'utf-8');
                    return `Successfully replaced target section in ${filePath}`;
                }
                catch (err) {
                    return { output: `Error editing file ${filePath}: ${err.message}`, isError: true };
                }
            },
        };
    }
    createListDirTool() {
        return {
            schema: {
                name: 'list_dir',
                description: 'Lists files and folders in a directory.',
                parameters: {
                    type: 'object',
                    properties: {
                        path: { type: 'string', description: 'Directory path (defaults to current working directory)' },
                        recursive: { type: 'boolean', description: 'Whether to list subdirectories recursively (max depth 3)' },
                    },
                },
            },
            execute: async (args) => {
                const targetDir = this.resolvePath(String(args.path || '.'));
                const recursive = Boolean(args.recursive);
                try {
                    if (recursive) {
                        const entries = await fg(['**/*'], {
                            cwd: targetDir,
                            deep: 3,
                            dot: false,
                            onlyFiles: false,
                            ignore: ['**/node_modules/**', '**/.git/**', '**/dist/**'],
                        });
                        return entries.slice(0, 200).join('\n') || '(Empty directory)';
                    }
                    const items = await fs.readdir(targetDir, { withFileTypes: true });
                    const formatted = items.map((item) => `${item.isDirectory() ? '[DIR] ' : '[FILE]'} ${item.name}`);
                    return formatted.join('\n') || '(Empty directory)';
                }
                catch (err) {
                    return { output: `Error listing directory ${targetDir}: ${err.message}`, isError: true };
                }
            },
        };
    }
    createGrepTool() {
        return {
            schema: {
                name: 'grep',
                description: 'Searches for text or regex pattern across files in the workspace.',
                parameters: {
                    type: 'object',
                    properties: {
                        pattern: { type: 'string', description: 'Search pattern / regex' },
                        path: { type: 'string', description: 'Subdirectory or file path to search inside' },
                    },
                    required: ['pattern'],
                },
            },
            execute: async (args) => {
                const pattern = String(args.pattern);
                const searchPath = this.resolvePath(String(args.path || '.'));
                try {
                    const files = await fg(['**/*'], {
                        cwd: searchPath,
                        onlyFiles: true,
                        dot: false,
                        ignore: ['**/node_modules/**', '**/.git/**', '**/dist/**', '**/*.lock', '**/*.png', '**/*.jpg'],
                    });
                    const regex = new RegExp(pattern, 'i');
                    const matches = [];
                    for (const file of files) {
                        if (matches.length >= 100)
                            break;
                        const fullPath = path.join(searchPath, file);
                        try {
                            const content = await fs.readFile(fullPath, 'utf-8');
                            const lines = content.split('\n');
                            for (let i = 0; i < lines.length; i++) {
                                if (regex.test(lines[i])) {
                                    matches.push(`${file}:${i + 1}: ${lines[i].trim()}`);
                                    if (matches.length >= 100)
                                        break;
                                }
                            }
                        }
                        catch {
                            // Ignore unreadable files
                        }
                    }
                    if (matches.length === 0) {
                        return `No matches found for pattern: ${pattern}`;
                    }
                    return matches.join('\n');
                }
                catch (err) {
                    return { output: `Grep search failed: ${err.message}`, isError: true };
                }
            },
        };
    }
    createGlobTool() {
        return {
            schema: {
                name: 'glob',
                description: 'Fast file search matching glob patterns (e.g. "**/*.ts", "src/components/*.svelte").',
                parameters: {
                    type: 'object',
                    properties: {
                        pattern: { type: 'string', description: 'Glob pattern' },
                    },
                    required: ['pattern'],
                },
            },
            execute: async (args) => {
                const pattern = String(args.pattern);
                try {
                    const matches = await fg([pattern], {
                        cwd: this.workingDir,
                        ignore: ['**/node_modules/**', '**/.git/**', '**/dist/**'],
                    });
                    return matches.slice(0, 150).join('\n') || 'No matching files found.';
                }
                catch (err) {
                    return { output: `Glob pattern error: ${err.message}`, isError: true };
                }
            },
        };
    }
    createBashTool() {
        return {
            schema: {
                name: 'bash',
                description: 'Executes a shell command in the workspace directory with timeout and output capture.',
                parameters: {
                    type: 'object',
                    properties: {
                        command: { type: 'string', description: 'Shell command to execute' },
                        timeout: { type: 'number', description: 'Timeout in milliseconds (defaults to 60000)' },
                    },
                    required: ['command'],
                },
            },
            execute: async (args, context) => {
                const command = String(args.command);
                const timeout = typeof args.timeout === 'number' ? args.timeout : 60000;
                const cwd = context.workingDirectory || this.workingDir;
                return new Promise((resolve) => {
                    exec(command, {
                        cwd,
                        timeout,
                        maxBuffer: 1024 * 1024 * 5,
                        signal: context.signal,
                    }, (error, stdout, stderr) => {
                        const combined = (stdout + (stderr ? `\nSTDERR:\n${stderr}` : '')).trim();
                        let truncated = combined;
                        if (truncated.length > MAX_OUTPUT_CHARS) {
                            truncated = truncated.slice(0, MAX_OUTPUT_CHARS) + '\n...[Output truncated due to 32KB limit]';
                        }
                        if (error) {
                            resolve({
                                output: truncated || `Command exited with code ${error.code}: ${error.message}`,
                                isError: true,
                            });
                        }
                        else {
                            resolve({
                                output: truncated || '(Command completed with no output)',
                                isError: false,
                            });
                        }
                    });
                });
            },
        };
    }
}
//# sourceMappingURL=builtin_coding.js.map