import assert from 'node:assert/strict';
import * as http from 'node:http';
import test from 'node:test';
import { DshServer } from './server.js';

const authToken = 'desktop-session-token';
const allowedOrigin = 'null';

async function startServer(options: { auth?: boolean; maxRequestBodyBytes?: number } = {}) {
  const server = new DshServer({
    port: 0,
    config: { model: 'deepseek-chat', workingDirectory: process.cwd() },
    authToken: options.auth === false ? undefined : authToken,
    allowedOrigins: options.auth === false ? undefined : [allowedOrigin],
    maxRequestBodyBytes: options.maxRequestBodyBytes,
  });
  return { server, url: await server.start() };
}

async function waitFor(predicate: () => boolean, timeoutMs = 1000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() >= deadline) throw new Error('Timed out waiting for server state');
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

function startPartialTurn(url: string, bodyPrefix: string): {
  request: http.ClientRequest;
  response: Promise<{ statusCode: number; body: string }>;
} {
  let partialRequest: http.ClientRequest | undefined;
  const response = new Promise<{ statusCode: number; body: string }>((resolve, reject) => {
    const request = http.request(new URL('/api/turn', url), {
      method: 'POST',
      headers: {
        Origin: allowedOrigin,
        Authorization: `Bearer ${authToken}`,
        'Content-Type': 'application/json',
        Connection: 'close',
      },
    });
    request.once('error', reject);
    request.once('response', (incoming) => {
      const chunks: Buffer[] = [];
      incoming.on('data', (chunk: Buffer) => chunks.push(chunk));
      incoming.once('error', reject);
      incoming.once('end', () => resolve({
        statusCode: incoming.statusCode ?? 0,
        body: Buffer.concat(chunks).toString('utf8'),
      }));
    });
    request.write(bodyPrefix);
    partialRequest = request;
  });

  if (!partialRequest) throw new Error('Partial request was not created');
  return { request: partialRequest, response };
}

test('Electron server rejects untrusted origins and missing bearer tokens', async (t) => {
  const { server, url } = await startServer();
  t.after(() => server.stop());

  const untrusted = await fetch(`${url}/api/health`, { headers: { Origin: 'https://malicious.example', Connection: 'close' } });
  assert.equal(untrusted.status, 403);

  const unauthorized = await fetch(`${url}/api/health`, { headers: { Origin: allowedOrigin, Connection: 'close' } });
  assert.equal(unauthorized.status, 401);

  const authorized = await fetch(`${url}/api/health`, {
    headers: { Origin: allowedOrigin, Authorization: `Bearer ${authToken}`, Connection: 'close' },
  });
  assert.equal(authorized.status, 200);
  assert.equal(authorized.headers.get('access-control-allow-origin'), allowedOrigin);
});

test('Electron server validates preflight origins and request size', async (t) => {
  const { server, url } = await startServer({ maxRequestBodyBytes: 32 });
  t.after(() => server.stop());

  const preflight = await fetch(`${url}/api/turn`, { method: 'OPTIONS', headers: { Origin: allowedOrigin, Connection: 'close' } });
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get('access-control-allow-origin'), allowedOrigin);

  const oversized = await fetch(`${url}/api/model`, {
    method: 'POST',
    headers: {
      Origin: allowedOrigin,
      Authorization: `Bearer ${authToken}`,
      'Content-Type': 'application/json',
      Connection: 'close',
    },
    body: JSON.stringify({ model: 'x'.repeat(64) }),
  });
  assert.equal(oversized.status, 413);
});

test('CLI server remains available to non-browser local clients', async (t) => {
  const { server, url } = await startServer({ auth: false });
  t.after(() => server.stop());

  const response = await fetch(`${url}/api/health`, { headers: { Connection: 'close' } });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('access-control-allow-origin'), null);
});

test('runtime suspension rejects new turns before a configuration swap', async (t) => {
  const { server, url } = await startServer();
  t.after(() => server.stop());

  assert.equal(server.suspendNewTurns(), true);
  const response = await fetch(`${url}/api/turn`, {
    method: 'POST',
    headers: {
      Origin: allowedOrigin,
      Authorization: `Bearer ${authToken}`,
      'Content-Type': 'application/json',
      Connection: 'close',
    },
    body: JSON.stringify({ prompt: 'must not start' }),
  });
  assert.equal(response.status, 409);
  assert.deepEqual(await response.json(), { error: 'The runtime is changing configuration' });
});

test('slow request bodies reserve the turn and rejected requests cannot mutate the model', async (t) => {
  const { server, url } = await startServer();
  t.after(() => server.stop());

  const initialModel = server.getEngine().getModel();
  const slowTurn = startPartialTurn(url, '{"prompt":');
  await waitFor(() => server.hasActiveTurn());

  assert.equal(server.suspendNewTurns(), false);
  const concurrent = await fetch(`${url}/api/turn`, {
    method: 'POST',
    headers: {
      Origin: allowedOrigin,
      Authorization: `Bearer ${authToken}`,
      'Content-Type': 'application/json',
      Connection: 'close',
    },
    body: JSON.stringify({ prompt: 'must not start', model: 'race-model' }),
  });
  assert.equal(concurrent.status, 409);
  assert.equal(server.getEngine().getModel(), initialModel);

  slowTurn.request.end('}');
  const invalid = await slowTurn.response;
  assert.equal(invalid.statusCode, 400);
  assert.deepEqual(JSON.parse(invalid.body), { error: 'Request body must be valid JSON' });
  await waitFor(() => !server.hasActiveTurn());
});

test('failed turns restore request-scoped model changes', async (t) => {
  const { server, url } = await startServer();
  t.after(() => server.stop());

  const engine = server.getEngine();
  const initialModel = engine.getModel();
  engine.runTurn = async function* () {
    throw new Error('simulated turn failure');
  };

  const response = await fetch(`${url}/api/turn`, {
    method: 'POST',
    headers: {
      Origin: allowedOrigin,
      Authorization: `Bearer ${authToken}`,
      'Content-Type': 'application/json',
      Connection: 'close',
    },
    body: JSON.stringify({ prompt: 'fail after model selection', model: 'temporary-model' }),
  });
  assert.equal(response.status, 200);
  assert.match(await response.text(), /simulated turn failure/);
  assert.equal(engine.getModel(), initialModel);
  assert.equal(server.hasActiveTurn(), false);
});
