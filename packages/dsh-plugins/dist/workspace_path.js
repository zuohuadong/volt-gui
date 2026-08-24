import { constants, promises as fs } from 'node:fs';
import * as path from 'node:path';
function pathError(input) {
    return new Error(`Path is outside the workspace: ${input}`);
}
function normalizedInput(input) {
    if (!input || input.includes('\0'))
        throw new Error('Workspace path must be a non-empty string without NUL bytes.');
    return input;
}
export function isPathContained(root, candidate) {
    const relative = path.relative(root, candidate);
    return relative === '' || (!path.isAbsolute(relative) && relative !== '..' && !relative.startsWith(`..${path.sep}`));
}
export async function createWorkspacePathPolicy(root) {
    const canonicalRoot = await fs.realpath(path.resolve(root));
    const rootStat = await fs.stat(canonicalRoot);
    if (!rootStat.isDirectory())
        throw new Error(`Workspace root is not a directory: ${root}`);
    const assertContained = (candidate) => {
        if (!isPathContained(canonicalRoot, candidate))
            throw pathError(candidate);
    };
    const lexicalCandidate = (input) => {
        const candidate = path.resolve(canonicalRoot, normalizedInput(input));
        assertContained(candidate);
        return candidate;
    };
    const resolveExisting = async (input, kind) => {
        const candidate = lexicalCandidate(input);
        const canonical = await fs.realpath(candidate);
        assertContained(canonical);
        if (kind) {
            const stat = await fs.stat(canonical);
            if (kind === 'file' && !stat.isFile())
                throw new Error(`Workspace path is not a file: ${input}`);
            if (kind === 'directory' && !stat.isDirectory())
                throw new Error(`Workspace path is not a directory: ${input}`);
        }
        return canonical;
    };
    const resolveWritableFile = async (input) => {
        const candidate = lexicalCandidate(input);
        const relative = path.relative(canonicalRoot, candidate);
        const parts = relative.split(path.sep);
        const fileName = parts.pop();
        if (!fileName || fileName === '.' || fileName === '..')
            throw new Error(`Invalid writable file path: ${input}`);
        let current = canonicalRoot;
        for (const part of parts) {
            if (!part || part === '.')
                continue;
            const next = path.join(current, part);
            try {
                const canonical = await fs.realpath(next);
                assertContained(canonical);
                const stat = await fs.stat(canonical);
                if (!stat.isDirectory())
                    throw new Error(`Writable path parent is not a directory: ${part}`);
                current = canonical;
            }
            catch (error) {
                if (error?.code !== 'ENOENT')
                    throw error;
                await fs.mkdir(next, { mode: 0o700 });
                const canonical = await fs.realpath(next);
                assertContained(canonical);
                current = canonical;
            }
        }
        const target = path.join(current, fileName);
        assertContained(target);
        try {
            const targetStat = await fs.lstat(target);
            if (targetStat.isSymbolicLink())
                throw new Error(`Refusing to write through a symbolic link: ${input}`);
            const canonical = await fs.realpath(target);
            assertContained(canonical);
            if (!(await fs.stat(canonical)).isFile())
                throw new Error(`Writable path is not a file: ${input}`);
            return canonical;
        }
        catch (error) {
            if (error?.code !== 'ENOENT')
                throw error;
        }
        const parent = await fs.realpath(path.dirname(target));
        assertContained(parent);
        return path.join(parent, fileName);
    };
    return {
        root: canonicalRoot,
        resolveExisting,
        resolveWritableFile,
        assertContained,
    };
}
export async function writeWorkspaceFile(filePath, content) {
    try {
        const existing = await fs.lstat(filePath);
        if (existing.isSymbolicLink())
            throw new Error(`Refusing to write through a symbolic link: ${filePath}`);
    }
    catch (error) {
        if (error?.code !== 'ENOENT')
            throw error;
    }
    const noFollow = typeof constants.O_NOFOLLOW === 'number' ? constants.O_NOFOLLOW : 0;
    const handle = await fs.open(filePath, constants.O_WRONLY | constants.O_CREAT | constants.O_TRUNC | noFollow, 0o600);
    try {
        await handle.writeFile(content, 'utf8');
        await handle.sync();
    }
    finally {
        await handle.close();
    }
}
//# sourceMappingURL=workspace_path.js.map