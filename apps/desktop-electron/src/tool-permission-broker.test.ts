import assert from 'node:assert/strict';
import test from 'node:test';
import { ElectronToolPermissionBroker } from './tool-permission-broker.js';

function request(effect: 'read' | 'write' | 'process' | 'external', risk: 'ordinary' | 'high') {
  return {
    toolCallId: 'call-1',
    toolName: 'test_tool',
    args: { command: 'echo ok', apiKey: 'secret' },
    workingDirectory: '/workspace',
    authorization: { effect, risk },
  };
}

test('read tools pass without prompting and ordinary writes follow Ask/Auto/Yolo policy', async () => {
  const prompts: any[] = [];
  const broker = new ElectronToolPermissionBroker((prompt) => {
    prompts.push(prompt);
    return true;
  }, 500);

  assert.deepEqual(await broker.authorize(request('read', 'ordinary')), { allow: true });

  const askDecision = broker.authorize(request('write', 'ordinary'));
  assert.equal(prompts.length, 1);
  assert.equal(prompts[0].args.apiKey, '[REDACTED]');
  assert.equal(broker.resolve(prompts[0].requestId, 'deny'), true);
  assert.equal((await askDecision).allow, false);

  broker.setMode('auto');
  assert.deepEqual(await broker.authorize(request('write', 'ordinary')), { allow: true });
  broker.setMode('yolo');
  assert.deepEqual(await broker.authorize(request('write', 'ordinary')), { allow: true });
});

test('shell and MCP remain one-shot approvals even in Yolo mode', async () => {
  const prompts: any[] = [];
  const broker = new ElectronToolPermissionBroker((prompt) => {
    prompts.push(prompt);
    return true;
  }, 500);
  broker.setMode('yolo');

  const shellDecision = broker.authorize(request('process', 'high'));
  assert.equal(prompts.length, 1);
  assert.equal(broker.resolve(prompts[0].requestId, 'allow_once'), true);
  assert.deepEqual(await shellDecision, { allow: true });

  const mcpDecision = broker.authorize(request('external', 'high'));
  assert.equal(prompts.length, 2);
  assert.equal(broker.resolve(prompts[1].requestId, 'deny'), true);
  assert.equal((await mcpDecision).allow, false);
});

test('invalid modes, stale decisions and missing trusted windows fail closed', async () => {
  const broker = new ElectronToolPermissionBroker(() => false, 500);
  assert.throws(() => broker.setMode('invalid'), /Invalid tool permission mode/);
  assert.equal(broker.resolve('missing', 'allow_once'), false);
  const decision = await broker.authorize(request('process', 'high'));
  assert.equal(decision.allow, false);
  assert.match(decision.reason ?? '', /No trusted Electron window/);
});
