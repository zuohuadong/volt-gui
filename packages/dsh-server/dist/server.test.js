import assert from 'node:assert/strict';
import test from 'node:test';
import { DshServer } from './server.js';
const authToken = 'desktop-session-token';
const allowedOrigin = 'null';
async function startServer(options = {}) {
    const server = new DshServer({
        port: 0,
        config: { model: 'deepseek-chat', workingDirectory: process.cwd() },
        authToken: options.auth === false ? undefined : authToken,
        allowedOrigins: options.auth === false ? undefined : [allowedOrigin],
        maxRequestBodyBytes: options.maxRequestBodyBytes,
    });
    return { server, url: await server.start() };
}
test('Electron server rejects untrusted origins and missing bearer tokens', async (t) => {
    const { server, url } = await startServer();
    t.after(() => server.stop());
    const untrusted = await fetch(`${url}/api/health`, { headers: { Origin: 'https://malicious.example' } });
    assert.equal(untrusted.status, 403);
    const unauthorized = await fetch(`${url}/api/health`, { headers: { Origin: allowedOrigin } });
    assert.equal(unauthorized.status, 401);
    const authorized = await fetch(`${url}/api/health`, {
        headers: { Origin: allowedOrigin, Authorization: `Bearer ${authToken}` },
    });
    assert.equal(authorized.status, 200);
    assert.equal(authorized.headers.get('access-control-allow-origin'), allowedOrigin);
});
test('Electron server validates preflight origins and request size', async (t) => {
    const { server, url } = await startServer({ maxRequestBodyBytes: 32 });
    t.after(() => server.stop());
    const preflight = await fetch(`${url}/api/turn`, { method: 'OPTIONS', headers: { Origin: allowedOrigin } });
    assert.equal(preflight.status, 204);
    assert.equal(preflight.headers.get('access-control-allow-origin'), allowedOrigin);
    const oversized = await fetch(`${url}/api/model`, {
        method: 'POST',
        headers: {
            Origin: allowedOrigin,
            Authorization: `Bearer ${authToken}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ model: 'x'.repeat(64) }),
    });
    assert.equal(oversized.status, 413);
});
test('CLI server remains available to non-browser local clients', async (t) => {
    const { server, url } = await startServer({ auth: false });
    t.after(() => server.stop());
    const response = await fetch(`${url}/api/health`);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('access-control-allow-origin'), null);
});
//# sourceMappingURL=server.test.js.map