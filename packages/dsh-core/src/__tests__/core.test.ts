import { describe, it } from 'node:test';
import assert from 'node:assert';
import { PrefixCachePipeline, normalizeToolSchemas } from '../prefix_cache.js';
import { ThinkSplitter } from '../think_splitter.js';
import { DegenerationGuard } from '../degeneration_guard.js';
import { safeParseJson } from '../json_repair.js';
import { StreamDecoder } from '../stream_decoder.js';
import type { ToolSchema } from '../types.js';

describe('DSH Core Engine Tests', () => {
  it('should normalize and deterministically sort tool schemas for 64-token prefix cache stability', () => {
    const tools: ToolSchema[] = [
      {
        name: 'write_file',
        description: 'Write file to disk',
        parameters: {
          type: 'object',
          properties: {
            content: { type: 'string' },
            path: { type: 'string' },
          },
          required: ['path', 'content'],
        },
      },
      {
        name: 'bash',
        description: 'Run bash command',
        parameters: {
          type: 'object',
          properties: {
            command: { type: 'string' },
          },
        },
      },
    ];

    const normalized = normalizeToolSchemas(tools);
    assert.strictEqual(normalized[0].name, 'bash');
    assert.strictEqual(normalized[1].name, 'write_file');

    const pipeline = new PrefixCachePipeline('You are an expert coder.', tools);
    const hash1 = pipeline.getStaticHash();
    pipeline.updateStaticRoot('You are an expert coder.', tools);
    const hash2 = pipeline.getStaticHash();

    assert.strictEqual(hash1, hash2);
    assert.strictEqual(hash1.length, 12);
  });

  it('should cleanly split inline <think> tags while streaming reasoning in real-time', () => {
    const splitter = new ThinkSplitter();
    const chunk1 = '<think>I need to search';
    const chunk2 = ' for files</think>Hello world!';

    const res1 = splitter.push(chunk1);
    assert.strictEqual(res1.reasoning, 'I need to search');
    assert.strictEqual(res1.content, '');

    const res2 = splitter.push(chunk2);
    assert.strictEqual(res2.reasoning, ' for files');
    assert.strictEqual(res2.content, 'Hello world!');
  });

  it('should detect single-character CJK degeneration loops', () => {
    const guard = new DegenerationGuard();
    let degenerated = false;

    for (let i = 0; i < 35; i++) {
      const check = guard.observe('啊');
      if (check.degenerated) {
        degenerated = true;
        break;
      }
    }
    assert.strictEqual(degenerated, true);
  });

  it('should detect multi-token phrase repetition loops', () => {
    const guard = new DegenerationGuard();
    let degenerated = false;

    for (let i = 0; i < 100; i++) {
      const check = guard.observe('循环测试重复语句');
      if (check.degenerated) {
        degenerated = true;
        break;
      }
    }
    assert.strictEqual(degenerated, true);
  });

  it('should repair broken tool argument JSON', () => {
    const malformed = '{"command": "echo \\"hello\\", "timeout": 30';
    const parsed = safeParseJson<any>(malformed);
    assert.strictEqual(parsed.timeout, 30);
  });

  it('should decode dual-track SSE stream with reasoning and tool_calls', () => {
    const decoder = new StreamDecoder();
    const events: any[] = [];

    // Stream reasoning
    decoder.processChunk(
      { choices: [{ delta: { reasoning_content: 'Let me think...' } }] },
      { onEvent: (e) => events.push(e) }
    );

    // Stream content
    decoder.processChunk(
      { choices: [{ delta: { content: 'Starting execution.' } }] },
      { onEvent: (e) => events.push(e) }
    );

    // Stream tool call
    decoder.processChunk(
      {
        choices: [
          {
            delta: {
              tool_calls: [
                {
                  index: 0,
                  id: 'call_123',
                  function: { name: 'read_file', arguments: '{"path": "package.json"}' },
                },
              ],
            },
          },
        ],
      },
      { onEvent: (e) => events.push(e) }
    );

    const finalized = decoder.finalize({ onEvent: (e) => events.push(e) });

    assert.strictEqual(finalized.reasoningContent, 'Let me think...');
    assert.strictEqual(finalized.content, 'Starting execution.');
    assert.strictEqual(finalized.toolCalls.length, 1);
    assert.strictEqual(finalized.toolCalls[0].function.name, 'read_file');
  });
});
