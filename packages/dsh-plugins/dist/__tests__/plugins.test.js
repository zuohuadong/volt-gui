import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { BuiltinCodingPlugin } from '../builtin_coding.js';
describe('DSH Builtin Coding Tools Tests', () => {
    let tmpDir;
    let plugin;
    let toolsMap;
    before(async () => {
        tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'dsh-test-'));
        plugin = new BuiltinCodingPlugin();
        await plugin.init({
            workingDirectory: tmpDir,
            log: () => { },
        });
        const tools = plugin.getTools();
        toolsMap = new Map(tools.map((t) => [t.schema.name, t]));
    });
    after(async () => {
        await fs.rm(tmpDir, { recursive: true, force: true });
    });
    it('should write and read files with line numbers', async () => {
        const writeTool = toolsMap.get('write_file');
        const readTool = toolsMap.get('read_file');
        const filePath = 'hello.txt';
        const content = 'Line 1\nLine 2\nLine 3';
        const writeRes = await writeTool.execute({ path: filePath, content }, { workingDirectory: tmpDir });
        assert.match(String(writeRes), /Successfully wrote/);
        const readRes = await readTool.execute({ path: filePath, offset: 1, limit: 2 }, { workingDirectory: tmpDir });
        assert.strictEqual(readRes, '1 | Line 1\n2 | Line 2');
    });
    it('should surgically edit file content using unique string replacement', async () => {
        const editTool = toolsMap.get('edit_file');
        const readTool = toolsMap.get('read_file');
        const filePath = 'hello.txt';
        const editRes = await editTool.execute({ path: filePath, old_str: 'Line 2', new_str: 'Line 2 - Modified' }, { workingDirectory: tmpDir });
        assert.match(String(editRes), /Successfully replaced/);
        const readRes = await readTool.execute({ path: filePath }, { workingDirectory: tmpDir });
        assert.strictEqual(readRes, '1 | Line 1\n2 | Line 2 - Modified\n3 | Line 3');
    });
    it('should search with grep', async () => {
        const grepTool = toolsMap.get('grep');
        const res = await grepTool.execute({ pattern: 'Modified' }, { workingDirectory: tmpDir });
        assert.match(String(res), /hello.txt:2: Line 2 - Modified/);
    });
    it('does not let brace or extglob expansion traverse outside the workspace', async () => {
        const globTool = toolsMap.get('glob');
        for (const pattern of [
            '{hello.txt,../outside/secret.txt}',
            '@(../outside)/secret.txt',
        ]) {
            const result = await globTool.execute({ pattern }, { workingDirectory: tmpDir });
            assert.equal(result.isError, true);
            assert.match(result.output, /workspace-relative/);
        }
    });
    it('should execute bash commands safely with timeout and output capture', async () => {
        const bashTool = toolsMap.get('bash');
        const res = await bashTool.execute({ command: 'echo dsh test' }, { workingDirectory: tmpDir });
        assert.match(res.output, /dsh test/);
        assert.strictEqual(res.isError, false);
    });
    it('should execute pwsh commands safely with timeout and output capture', async (t) => {
        const pwshTool = toolsMap.get('pwsh');
        assert.ok(pwshTool, 'pwsh tool should be registered');
        const res = await pwshTool.execute({ command: 'Write-Output "dsh pwsh test"' }, { workingDirectory: tmpDir });
        if (res.isError && /ENOENT/.test(res.output)) {
            t.skip("pwsh is unavailable on this host");
            return;
        }
        assert.strictEqual(res.output, 'dsh pwsh test');
        assert.strictEqual(res.isError, false);
    });
});
//# sourceMappingURL=plugins.test.js.map