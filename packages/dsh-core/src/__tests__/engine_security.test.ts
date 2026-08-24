import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { DshEngine } from '../engine.js';
import type { DshTurnEvent, ToolAuthorizationBroker, ToolHandler } from '../types.js';

function completionStream(chunks: unknown[]) {
  return {
    async *[Symbol.asyncIterator]() {
      for (const chunk of chunks) yield chunk;
    },
  };
}

function toolCallStream(name: string, args = '{}') {
  return completionStream([
    {
      choices: [
        {
          delta: {
            tool_calls: [
              {
                index: 0,
                id: 'call-1',
                type: 'function',
                function: { name, arguments: args },
              },
            ],
          },
          finish_reason: 'tool_calls',
        },
      ],
    },
  ]);
}

function textStream(content: string) {
  return completionStream([
    {
      choices: [{ delta: { content }, finish_reason: 'stop' }],
    },
  ]);
}

function stubCompletions(engine: DshEngine, responses: Array<unknown | Error>): void {
  (engine as any).client = {
    chat: {
      completions: {
        create: async () => {
          const response = responses.shift();
          if (response instanceof Error) throw response;
          return response;
        },
      },
    },
  };
}

async function collectTurn(engine: DshEngine, prompt: string, maxSteps?: number): Promise<DshTurnEvent[]> {
  const events: DshTurnEvent[] = [];
  for await (const event of engine.runTurn(prompt, { maxSteps })) events.push(event);
  return events;
}

describe('DSH tool authorization and turn transactions', () => {
  it('denies a write tool before execution when the broker rejects it', async () => {
    let executions = 0;
    const broker: ToolAuthorizationBroker = {
      authorize: async () => ({ allow: false, reason: 'user denied' }),
    };
    const engine = new DshEngine({ model: 'test', authorizationBroker: broker });
    const handler: ToolHandler = {
      schema: {
        name: 'write_file',
        description: 'test',
        parameters: { type: 'object', properties: {} },
      },
      authorization: { effect: 'write', risk: 'ordinary' },
      execute: async () => {
        executions += 1;
        return 'should not run';
      },
    };
    engine.registerTool(handler);
    stubCompletions(engine, [toolCallStream('write_file'), textStream('done')]);

    const events = await collectTurn(engine, 'change the file');

    assert.equal(executions, 0);
    const denial = events.find((event) => event.type === 'tool_exec_result');
    assert.ok(denial && denial.type === 'tool_exec_result');
    assert.equal(denial.isError, true);
    assert.match(denial.output, /user denied/);
    assert.deepEqual(engine.getHistory().map((message) => message.role), [
      'user',
      'assistant',
      'tool',
      'assistant',
    ]);
  });

  it('fails closed for mutating tools when no broker is installed', async () => {
    let executions = 0;
    const engine = new DshEngine({ model: 'test' });
    engine.registerTool({
      schema: {
        name: 'write_file',
        description: 'test',
        parameters: { type: 'object', properties: {} },
      },
      authorization: { effect: 'write', risk: 'ordinary' },
      execute: async () => {
        executions += 1;
        return 'should not run';
      },
    });
    stubCompletions(engine, [toolCallStream('write_file'), textStream('done')]);

    const events = await collectTurn(engine, 'change the file');

    assert.equal(executions, 0);
    const denial = events.find((event) => event.type === 'tool_exec_result');
    assert.ok(denial && denial.type === 'tool_exec_result');
    assert.match(denial.output, /authorization broker is unavailable/i);
  });

  it('allows ordinary read tools without an authorization broker', async () => {
    let executions = 0;
    const engine = new DshEngine({ model: 'test' });
    engine.registerTool({
      schema: {
        name: 'read_file',
        description: 'test',
        parameters: { type: 'object', properties: {} },
      },
      authorization: { effect: 'read', risk: 'ordinary' },
      execute: async () => {
        executions += 1;
        return 'contents';
      },
    });
    stubCompletions(engine, [toolCallStream('read_file'), textStream('done')]);

    await collectTurn(engine, 'read the file');
    assert.equal(executions, 1);
  });

  it('rolls back the user message when the model request fails', async () => {
    const engine = new DshEngine({ model: 'test' });
    engine.setHistory([{ role: 'assistant', content: 'existing' }]);
    stubCompletions(engine, [new Error('gateway unavailable')]);

    await assert.rejects(() => collectTurn(engine, 'new prompt'), /gateway unavailable/);
    assert.deepEqual(engine.getHistory(), [{ role: 'assistant', content: 'existing' }]);
  });

  it('rolls back the whole turn when the maximum step count is exceeded', async () => {
    const engine = new DshEngine({ model: 'test' });
    engine.registerTool({
      schema: {
        name: 'read_file',
        description: 'test',
        parameters: { type: 'object', properties: {} },
      },
      authorization: { effect: 'read', risk: 'ordinary' },
      execute: async () => 'contents',
    });
    stubCompletions(engine, [toolCallStream('read_file')]);

    await assert.rejects(() => collectTurn(engine, 'loop', 1), /maximum allowed steps/);
    assert.deepEqual(engine.getHistory(), []);
  });
});
