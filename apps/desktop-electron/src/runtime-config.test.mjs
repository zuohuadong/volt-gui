import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, test } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { build } from 'esbuild';

const buildDirectory = await mkdtemp(path.join(tmpdir(), 'voltui-runtime-config-'));
const outputPath = path.join(buildDirectory, 'runtime-config.mjs');
after(() => rm(buildDirectory, { recursive: true, force: true }));
await build({
  entryPoints: [fileURLToPath(new URL('./runtime-config.ts', import.meta.url))],
  outfile: outputPath,
  bundle: true,
  platform: 'node',
  format: 'esm',
});
const { normalizedConfigPatch } = await import(pathToFileURL(outputPath).href);

const currentConfig = {
  model: 'deepseek-chat',
  apiKey: 'existing-secret',
  baseURL: 'https://api.deepseek.com',
  port: 3210,
  host: '127.0.0.1',
  compactReasoning: true,
  degenerationGuard: true,
};

test('changing endpoint authority cannot reuse the existing API key', () => {
  assert.throws(
    () => normalizedConfigPatch(currentConfig, { baseURL: 'https://example.invalid/v1' }),
    /必须重新输入 API 密钥或明确清除旧密钥/,
  );
});

test('changing endpoint authority accepts a replacement or explicit key removal', () => {
  const replaced = normalizedConfigPatch(currentConfig, {
    baseURL: 'https://example.invalid/v1',
    apiKey: 'replacement-secret',
  });
  assert.equal(replaced.baseURL, 'https://example.invalid/v1');
  assert.equal(replaced.apiKey, 'replacement-secret');

  const cleared = normalizedConfigPatch(currentConfig, {
    baseURL: 'http://127.0.0.1:11434/v1',
    clearApiKey: true,
  });
  assert.equal(cleared.apiKey, '');
});

test('same-origin paths may retain the key and embedded URL credentials are rejected', () => {
  const sameOrigin = normalizedConfigPatch(currentConfig, { baseURL: 'https://api.deepseek.com/v1/' });
  assert.equal(sameOrigin.baseURL, 'https://api.deepseek.com/v1');
  assert.equal(sameOrigin.apiKey, 'existing-secret');
  assert.throws(
    () => normalizedConfigPatch(currentConfig, { baseURL: 'https://user:pass@api.deepseek.com' }),
    /不能包含用户名或密码/,
  );
});

test('invalid IPC option types fail instead of being ignored', () => {
  assert.throws(() => normalizedConfigPatch(currentConfig, 'invalid'), /运行配置格式无效/);
  assert.throws(() => normalizedConfigPatch(currentConfig, { clearApiKey: 'yes' }), /密钥清除选项格式无效/);
  assert.throws(() => normalizedConfigPatch(currentConfig, { compactReasoning: 1 }), /推理压缩选项格式无效/);
});
