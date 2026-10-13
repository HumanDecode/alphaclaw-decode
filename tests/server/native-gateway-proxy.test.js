const { EventEmitter } = require('events');
const express = require('express');
const request = require('supertest');
const { createWatchdogTerminalWsBridge } = require('../../lib/server/watchdog-terminal-ws');
const { registerProxyRoutes } = require('../../lib/server/routes/proxy');

describe('native gateway authentication boundary', () => {
  it.each(['/openclaw', '/openclaw/'])('forwards native upgrade %s without injecting credentials', (url) => {
    const server = new EventEmitter();
    const proxy = { ws: vi.fn() };
    const auth = vi.fn(() => false);
    createWatchdogTerminalWsBridge({ server, proxy, getGatewayUrl: () => 'http://127.0.0.1:18789', isAuthorizedRequest: auth, watchdogTerminal: {} });
    const req = { url, headers: { host: 'example.com' } };
    const socket = { write: vi.fn(), destroy: vi.fn() };
    server.emit('upgrade', req, socket, Buffer.alloc(0));
    expect(proxy.ws).toHaveBeenCalledWith(req, socket, expect.any(Buffer), { target: 'http://127.0.0.1:18789' });
    expect(auth).not.toHaveBeenCalled();
    expect(req.headers).toEqual({ host: 'example.com' });
  });
  it.each(['/api/watchdog/terminal/ws', '/api/ws/chat', '/openclaw/other', '/openclaw-evil', '/'])('blocks unauthenticated non-gateway upgrade %s', (url) => {
    const server = new EventEmitter();
    const proxy = { ws: vi.fn() };
    createWatchdogTerminalWsBridge({ server, proxy, getGatewayUrl: () => 'unused', isAuthorizedRequest: () => false, watchdogTerminal: {} });
    const socket = { write: vi.fn(), destroy: vi.fn() };
    server.emit('upgrade', { url, headers: { host: 'example.com' } }, socket, Buffer.alloc(0));
    expect(proxy.ws).not.toHaveBeenCalled();
    expect(socket.destroy).toHaveBeenCalled();
  });
  const app = () => {
    const instance = express();
    registerProxyRoutes({ app: instance, proxy: { web: (_req, res) => res.status(404).json({ error: 'not_found' }) }, getGatewayUrl: () => 'unused', getGatewayToken: () => 'never-inject', SETUP_API_PREFIXES: [], requireAuth: (_req, res) => res.sendStatus(401), oauthCallbackMiddleware: () => {}, webhookMiddleware: () => {} });
    return instance;
  };
  it('passes join rejection through from gateway, without caching', async () => {
    const res = await request(app()).get('/openclaw/j/abcdefghijklmnopqrstuv');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'not_found' });
    expect(res.headers['cache-control']).toBe('no-store');
  });
  it.each(['/openclaw', '/openclaw/', '/openclaw/j/short', '/openclaw/j/abcdefghijklmnopqrstuv?x=1', '/openclaw/j/abcdefghijklmnopqrstuv/extra'])('keeps HTTP %s protected', async (url) => {
    expect((await request(app()).get(url)).status).toBe(401);
  });
  it.each(['post', 'head', 'delete'])('does not exempt %s join requests', async (method) => {
    expect((await request(app())[method]('/openclaw/j/abcdefghijklmnopqrstuv')).status).toBe(401);
  });
});
