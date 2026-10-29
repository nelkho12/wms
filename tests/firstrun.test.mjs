// First start on an empty database (the real-world path): no demo data, admin from .env.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';

const PORT = 3700 + Math.floor(Math.random() * 200);
const BASE = `http://127.0.0.1:${PORT}`;
let proc;
const logs = [];
before(async () => {
  proc = spawn(process.execPath, ['--import', 'tsx', 'server.ts'], {
    env: { ...process.env, PORT: String(PORT), WMS_STORE: 'memory', ADMIN_EMAIL: 'boss@mayralab.test', ADMIN_PASSWORD: 'BossPass123', NODE_ENV: 'production' },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  proc.stdout.on('data', (d) => logs.push(String(d)));
  proc.stderr.on('data', (d) => logs.push(String(d)));
  for (let i = 0; i < 60; i++) { try { if ((await fetch(BASE + '/api/health')).ok) break; } catch {} await new Promise((r) => setTimeout(r, 500)); }
});
after(() => proc && proc.kill());

const call = async (method, path, body, token) => {
  const r = await fetch(BASE + path, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, body: await r.json().catch(() => null) };
};

test('first run creates only the admin from .env, with the product catalog but no demo stock/users', async () => {
  const login = await call('POST', '/api/auth/login', { email: 'boss@mayralab.test', password: 'BossPass123' });
  assert.equal(login.status, 200, logs.join(''));
  const token = login.body.token;
  const users = (await call('GET', '/api/users', undefined, token)).body;
  assert.equal(users.length, 1);
  assert.equal(users[0].role, 'Admin');
  const inv = (await call('GET', '/api/inventory', undefined, token)).body;
  assert.ok(inv.skus.length > 0, 'catalog (SKUs) is loaded');
  assert.ok(inv.locations.length > 0, 'bin locations are loaded');
  assert.equal(inv.batches.length, 0, 'no demo batches');
  assert.equal((await call('GET', '/api/orders', undefined, token)).body.length, 0, 'no demo orders');
});

test('the admin can change their own password; the old one stops working', async () => {
  const token = (await call('POST', '/api/auth/login', { email: 'boss@mayralab.test', password: 'BossPass123' })).body.token;
  assert.equal((await call('POST', '/api/auth/change-password', { currentPassword: 'wrong', newPassword: 'NewPass12345' }, token)).status, 400);
  assert.equal((await call('POST', '/api/auth/change-password', { currentPassword: 'BossPass123', newPassword: 'NewPass12345' }, token)).status, 200);
  assert.equal((await call('POST', '/api/auth/login', { email: 'boss@mayralab.test', password: 'BossPass123' })).status, 401);
  assert.equal((await call('POST', '/api/auth/login', { email: 'boss@mayralab.test', password: 'NewPass12345' })).status, 200);
});

test('the last Admin cannot be deleted or demoted', async () => {
  const token = (await call('POST', '/api/auth/login', { email: 'boss@mayralab.test', password: 'NewPass12345' })).body.token;
  const me = (await call('GET', '/api/auth/me', undefined, token)).body.user;
  assert.equal((await call('DELETE', `/api/users/${me.id}`, undefined, token)).status, 400);
  assert.equal((await call('PUT', `/api/users/${me.id}`, { role: 'Picker' }, token)).status, 400);
});

test('role permissions are stored on the server and enforced', async () => {
  const token = (await call('POST', '/api/auth/login', { email: 'boss@mayralab.test', password: 'NewPass12345' })).body.token;
  await call('POST', '/api/users', { name: 'Rita Receiver', email: 'rita@test', role: 'Receiver', password: 'Receiver123' }, token);
  const rt = (await call('POST', '/api/auth/login', { email: 'rita@test', password: 'Receiver123' })).body.token;
  const body = { sku: 'X', batchNo: 'b', bestBeforeDate: '2030-01-01', locationId: 'A-01-01', quantity: 1 };
  assert.equal((await call('POST', '/api/inventory/receive', body, rt)).status, 404); // allowed (SKU simply does not exist)
  const perms = (await call('GET', '/api/role-permissions', undefined, token)).body;
  perms.Receiver = perms.Receiver.filter((p) => p !== 'inbound:receive' && p !== 'inventory:write');
  assert.equal((await call('PUT', '/api/role-permissions', perms, token)).status, 200);
  assert.equal((await call('POST', '/api/inventory/receive', body, rt)).status, 403); // now refused
});
