import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { createWorkspacePathPolicy } from '../workspace_path.js';
import { buildMcpEnvironment, discoverWorkspaceMcp } from '../workspace_mcp.js';
const temporaryDirectories = [];
async function temporaryDirectory(prefix) {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
    temporaryDirectories.push(directory);
    return directory;
}
afterEach(async () => {
    await Promise.all(temporaryDirectories.splice(0).map((directory) => fs.rm(directory, { recursive: true, force: true })));
});
describe('workspace path containment', () => {
    it('rejects parent traversal and absolute paths outside the workspace', async () => {
        const root = await temporaryDirectory('dsh-workspace-');
        const outside = await temporaryDirectory('dsh-outside-');
        const policy = await createWorkspacePathPolicy(root);
        await assert.rejects(() => policy.resolveExisting('../secret.txt'), /outside the workspace/i);
        await assert.rejects(() => policy.resolveWritableFile(path.join(outside, 'secret.txt')), /outside the workspace/i);
    });
    it('rejects reads and missing writes through a symlink that escapes the workspace', async (t) => {
        const root = await temporaryDirectory('dsh-workspace-');
        const outside = await temporaryDirectory('dsh-outside-');
        await fs.writeFile(path.join(outside, 'secret.txt'), 'secret');
        try {
            await fs.symlink(outside, path.join(root, 'linked-outside'), process.platform === 'win32' ? 'junction' : 'dir');
        }
        catch (error) {
            if (error?.code === 'EPERM') {
                t.skip('Windows runner does not permit creating test symlinks');
                return;
            }
            throw error;
        }
        const policy = await createWorkspacePathPolicy(root);
        await assert.rejects(() => policy.resolveExisting('linked-outside/secret.txt'), /outside the workspace/i);
        await assert.rejects(() => policy.resolveWritableFile('linked-outside/new.txt'), /outside the workspace/i);
    });
    it('allows an existing target reached through an internal symlink', async (t) => {
        const root = await temporaryDirectory('dsh-workspace-');
        await fs.mkdir(path.join(root, 'real'));
        await fs.writeFile(path.join(root, 'real', 'inside.txt'), 'inside');
        try {
            await fs.symlink(path.join(root, 'real'), path.join(root, 'linked-inside'), process.platform === 'win32' ? 'junction' : 'dir');
        }
        catch (error) {
            if (error?.code === 'EPERM') {
                t.skip('Windows runner does not permit creating test symlinks');
                return;
            }
            throw error;
        }
        const policy = await createWorkspacePathPolicy(root);
        const canonicalRoot = await fs.realpath(root);
        assert.equal(await policy.resolveExisting('linked-inside/inside.txt', 'file'), path.join(canonicalRoot, 'real', 'inside.txt'));
    });
});
describe('workspace MCP discovery and child environment', () => {
    it('fingerprints exact trusted MCP content and changes the fingerprint after edits', async () => {
        const root = await temporaryDirectory('dsh-mcp-');
        await fs.mkdir(path.join(root, '.dsh'));
        const configPath = path.join(root, '.dsh', 'mcp.json');
        await fs.writeFile(configPath, JSON.stringify({ mcpServers: { local: { command: 'node', args: ['server.mjs'] } } }));
        const first = await discoverWorkspaceMcp(root);
        assert.equal(first.servers.length, 1);
        assert.equal(first.servers[0].name, 'local');
        await fs.writeFile(configPath, JSON.stringify({ mcpServers: { local: { command: 'node', args: ['changed.mjs'] } } }));
        const second = await discoverWorkspaceMcp(root);
        assert.notEqual(second.fingerprint, first.fingerprint);
    });
    it('rejects MCP config symlinks that point outside the workspace', async (t) => {
        const root = await temporaryDirectory('dsh-mcp-');
        const outside = await temporaryDirectory('dsh-mcp-outside-');
        await fs.writeFile(path.join(outside, 'mcp.json'), JSON.stringify({ mcpServers: { unsafe: { command: 'node' } } }));
        try {
            await fs.symlink(path.join(outside, 'mcp.json'), path.join(root, '.mcp.json'), process.platform === 'win32' ? 'file' : undefined);
        }
        catch (error) {
            if (error?.code === 'EPERM') {
                t.skip('Windows runner does not permit creating test symlinks');
                return;
            }
            throw error;
        }
        await assert.rejects(() => discoverWorkspaceMcp(root), /outside the workspace/i);
    });
    it('passes only platform variables and trusted non-loader declarations to MCP children', () => {
        const result = buildMcpEnvironment({
            PATH: '/usr/bin',
            HOME: '/home/test',
            DEEPSEEK_API_KEY: 'secret',
            GITHUB_TOKEN: 'secret',
            NODE_OPTIONS: '--require malware.js',
            LD_PRELOAD: '/tmp/inject.so',
        }, {
            SAFE_VALUE: 'ok',
            PATH: '/untrusted/bin',
            NODE_OPTIONS: '--inspect',
            SESSION_TOKEN: 'secret',
        });
        assert.equal(result.PATH, '/usr/bin');
        assert.equal(result.HOME, '/home/test');
        assert.equal(result.SAFE_VALUE, 'ok');
        assert.equal(result.DEEPSEEK_API_KEY, undefined);
        assert.equal(result.GITHUB_TOKEN, undefined);
        assert.equal(result.NODE_OPTIONS, undefined);
        assert.equal(result.LD_PRELOAD, undefined);
        assert.equal(result.SESSION_TOKEN, undefined);
    });
});
//# sourceMappingURL=workspace_security.test.js.map