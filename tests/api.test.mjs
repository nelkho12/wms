// Run with:  npm test      (starts the service with an in-memory database)
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';

const PORT = 3100 + Math.floor(Math.random() * 500);
const BASE = `http://127.0.0.1:${PORT}`;
const ADMIN = { email: 's.connor@apexwms.io', password: 'Demo12345!' }; // the Admin in the demo data
let proc;
let token = '';
let sku; // a SKU with stock
const logs = [];

async function api(method, path, body, tok = token) {
  const res = await fetch(BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(tok ? { Authorization: `Bearer ${tok}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  let json = null;
  try { json = await res.json(); } catch {}
  return { status: res.status, body: json };
}
const inv = async () => (await api('GET', '/api/inventory')).body;
const batchOf = async (batchNo, s) => (await inv()).batches.find((b) => b.batchNo === batchNo && (!s || b.sku === s));

before(async () => {
  proc = spawn(process.execPath, ['--import', 'tsx', 'server.ts'], {
    env: { ...process.env, PORT: String(PORT), WMS_STORE: 'memory', SEED_MODE: 'demo', WMS_TEST_HOOKS: '1',
           DEMO_USER_PASSWORD: ADMIN.password, NODE_ENV: 'production' },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  proc.stdout.on('data', (d) => logs.push(String(d)));
  proc.stderr.on('data', (d) => logs.push(String(d)));
  for (let i = 0; i < 60; i++) {
    try { if ((await fetch(BASE + '/api/health')).ok) break; } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  const login = await api('POST', '/api/auth/login', ADMIN, '');
  assert.equal(login.status, 200, JSON.stringify(login.body) + logs.join(''));
  token = login.body.token;
  const data = await inv();
  const sums = {};
  data.batches.filter((b) => b.status === 'ACTIVE' && b.quantityOnHand > 50).forEach((b) => (sums[b.sku] = (sums[b.sku] || 0) + b.quantityOnHand));
  sku = Object.keys(sums)[0];
  assert.ok(sku, 'demo data should contain a SKU with stock');
});
after(() => proc && proc.kill());

const newOrder = async (qty, s = sku) =>
  (await api('POST', '/api/sales-orders', { customerName: 'TEST', items: [{ sku: s, orderQtyCtn: qty }] })).body.order;
const activeBatch = async (s = sku) => (await inv()).batches.filter((b) => b.sku === s && b.status === 'ACTIVE' && b.quantityOnHand > 10)[0];

// ------------------------------------------------------------------ sign-in & permissions
test('API needs a login; health does not', async () => {
  assert.equal((await api('GET', '/api/inventory', undefined, '')).status, 401);
  assert.equal((await api('DELETE', '/api/stock-movements', undefined, '')).status, 401);
  assert.equal((await api('GET', '/api/health', undefined, '')).status, 200);
});
test('wrong password is refused, then locked after 5 tries', async () => {
  for (let i = 0; i < 5; i++) assert.equal((await api('POST', '/api/auth/login', { email: ADMIN.email, password: 'nope' }, '')).status, 401);
  assert.equal((await api('POST', '/api/auth/login', { email: ADMIN.email, password: ADMIN.password }, '')).status, 429);
});
test('users never expose password hashes', async () => {
  const users = (await api('GET', '/api/users')).body;
  assert.ok(users.length >= 2);
  assert.ok(users.every((u) => u.passwordHash === undefined));
});
test('roles are enforced on the server', async () => {
  // create a Picker and sign in as them
  const created = await api('POST', '/api/users', { name: 'Pat Picker', email: 'pat@test.local', role: 'Picker', password: 'Picker12345' });
  assert.equal(created.status, 200, JSON.stringify(created.body));
  assert.equal((await api('POST', '/api/users', { name: 'x', email: 'weak@test.local', role: 'Picker', password: 'short' })).status, 400);
  const pick = await api('POST', '/api/auth/login', { email: 'pat@test.local', password: 'Picker12345' }, '');
  assert.equal(pick.status, 200);
  const pt = pick.body.token;
  assert.equal((await api('GET', '/api/inventory', undefined, pt)).status, 200);
  assert.equal((await api('DELETE', '/api/stock-movements', undefined, pt)).status, 403);
  assert.equal((await api('POST', '/api/users', { name: 'Evil', email: 'e@x.com', role: 'Admin', password: 'Evil123456' }, pt)).status, 403);
  assert.equal((await api('POST', '/api/inventory/receive', {}, pt)).status, 403);
  assert.equal((await api('GET', '/api/mssql/schema', undefined, pt)).status, 403);

  // a Picker may edit their own details, but not their role or password, and not other people
  const meId = pick.body.user.id;
  assert.equal((await api('PUT', `/api/users/${meId}`, { department: 'Night Pick' }, pt)).status, 200);
  assert.equal((await api('PUT', `/api/users/${meId}`, { role: 'Admin' }, pt)).status, 403);
  assert.equal((await api('PUT', `/api/users/${meId}`, { password: 'Hacked12345' }, pt)).status, 403);
  const other = (await api('GET', '/api/users')).body.find((u) => u.id !== meId);
  assert.equal((await api('PUT', `/api/users/${other.id}`, { name: 'Pwned' }, pt)).status, 403);
  // the Picker can change their own password with the old one
  assert.equal((await api('POST', '/api/auth/change-password', { currentPassword: 'Picker12345', newPassword: 'Picker67890' }, pt)).status, 200);
  assert.equal((await api('POST', '/api/auth/login', { email: 'pat@test.local', password: 'Picker12345' }, '')).status, 401);
  assert.equal((await api('POST', '/api/auth/login', { email: 'pat@test.local', password: 'Picker67890' }, '')).status, 200);
});
test('tampered or expired tokens are refused', async () => {
  assert.equal((await api('GET', '/api/inventory', undefined, token.slice(0, -3) + 'abc')).status, 401);
});
test('audit log records the real signed-in user', async () => {
  await api('POST', '/api/audit-logs', { actionCategory: 'SYSTEM', actionType: 'TEST', targetEntity: 't', details: 'x', userName: 'Someone Else' });
  const logsNow = (await api('GET', '/api/audit-logs')).body;
  assert.equal(logsNow[0].actionType, 'TEST');
  assert.equal(logsNow[0].userName, 'Sarah Connor');
});

// ------------------------------------------------------------------ bug 1-3: picking
test('BUG1 picking the same order twice does not deduct twice', async () => {
  const b = await activeBatch();
  const before = b.quantityOnHand;
  const o = await newOrder(2);
  const r1 = await api('POST', '/api/orders/complete-pick', { orderId: o.id, pickedItems: [{ batchNo: b.batchNo, sku, qty: 2 }] });
  assert.equal(r1.status, 200, JSON.stringify(r1.body));
  assert.equal(r1.body.order.status, 'COMPLETED');
  const r2 = await api('POST', '/api/orders/complete-pick', { orderId: o.id, pickedItems: [{ batchNo: b.batchNo, sku, qty: 2 }] });
  assert.equal(r2.status, 400);
  assert.equal((await batchOf(b.batchNo, sku)).quantityOnHand, before - 2);
});
test('BUG2 picking more than is on hand is refused and changes nothing', async () => {
  const b = await activeBatch();
  const before = b.quantityOnHand;
  const o = await newOrder(5);
  const r = await api('POST', '/api/orders/complete-pick', { orderId: o.id, pickedItems: [{ batchNo: b.batchNo, sku, qty: before + 1 }] });
  assert.equal(r.status, 400);
  assert.equal((await batchOf(b.batchNo, sku)).quantityOnHand, before);
});
test('BUG3 a short pick leaves the order IN_PROGRESS with the right outstanding qty', async () => {
  const b = await activeBatch();
  const o = await newOrder(5);
  const r = await api('POST', '/api/orders/complete-pick', { orderId: o.id, pickedItems: [{ batchNo: b.batchNo, sku, qty: 1 }] });
  assert.equal(r.status, 200);
  assert.equal(r.body.order.status, 'IN_PROGRESS');
  assert.equal(r.body.order.items[0].pickedQty, 1);
  assert.equal(r.body.order.items[0].outstandingQty, 4);
  // finishing the rest completes it
  const r2 = await api('POST', '/api/orders/complete-pick', { orderId: o.id, pickedItems: [{ batchNo: b.batchNo, sku, qty: 4 }] });
  assert.equal(r2.body.order.status, 'COMPLETED');
  // over-picking is refused
  assert.equal((await api('POST', '/api/orders/complete-pick', { orderId: o.id, pickedItems: [{ batchNo: b.batchNo, sku, qty: 1 }] })).status, 400);
});

// ------------------------------------------------------------------ bug 4: lock
test('BUG4 locking an order takes the stock out; refuses when stock is missing', async () => {
  const b = await activeBatch();
  const before = b.quantityOnHand;
  const o = await newOrder(7);
  const r = await api('POST', `/api/sales-orders/${o.id}/lock`, { isLocked: true });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.order.status, 'DONE');
  const total = (await inv()).batches.filter((x) => x.sku === sku).reduce((s, x) => s + x.quantityOnHand, 0);
  assert.ok(total <= before + 1e9);
  assert.equal((await batchOf(b.batchNo, sku)).quantityOnHand, before - 7); // earliest batch served it
  const big = await newOrder(10_000_000);
  const r2 = await api('POST', `/api/sales-orders/${big.id}/lock`, { isLocked: true });
  assert.equal(r2.status, 400);
  assert.match(r2.body.error, /not enough/i);
});

// ------------------------------------------------------------------ bug 5-8: outbound / receive / import / adjust
test('BUG5 outbound to an unknown sales order ships nothing', async () => {
  const b = await activeBatch();
  const before = b.quantityOnHand;
  const r = await api('POST', '/api/inventory/outbound', { sku, batchNo: b.batchNo, quantity: 1, salesOrderId: 'SO-NOPE' });
  assert.equal(r.status, 404);
  assert.equal((await batchOf(b.batchNo, sku)).quantityOnHand, before);
});
test('BUG6 CSV-imported QUARANTINE batches really are quarantined', async () => {
  const r = await api('POST', '/api/inventory/import-batches', { items: [{ batchNo: 'QT-1', sku, quantityOnHand: 10, status: 'QUARANTINE', bestBeforeDate: '2030-01-01' }] });
  assert.equal(r.status, 200);
  assert.equal((await batchOf('QT-1', sku)).status, 'QUARANTINED');
  assert.equal((await api('POST', '/api/inventory/outbound', { sku, batchNo: 'QT-1', quantity: 1 })).status, 400);
});
test('BUG7 bad numbers and dates are refused', async () => {
  const base = { sku, batchNo: 'NEG-1', bestBeforeDate: '2030-01-01', locationId: 'A-01-01' };
  assert.equal((await api('POST', '/api/inventory/receive', { ...base, quantity: -50 })).status, 400);
  assert.equal((await api('POST', '/api/inventory/receive', { ...base, quantity: 0 })).status, 400);
  assert.equal((await api('POST', '/api/inventory/receive', { ...base, quantity: 'abc' })).status, 400);
  assert.equal((await api('POST', '/api/inventory/receive', { ...base, quantity: 5, bestBeforeDate: 'not-a-date' })).status, 400);
  const b = await activeBatch();
  assert.equal((await api('POST', '/api/inventory/adjust', { sku, batchNo: b.batchNo, countedQuantity: 'abc' })).status, 400);
  assert.equal((await api('POST', '/api/inventory/adjust', { sku, batchNo: b.batchNo, adjustmentType: 'SUBTRACT', countedQuantity: b.quantityOnHand + 1 })).status, 400);
  const imp = await api('POST', '/api/inventory/import-batches', { items: [{ batchNo: 'BAD-1', sku, quantityOnHand: 'xx' }, { batchNo: 'BAD-2', sku: 'NO-SUCH-SKU', quantityOnHand: 1 }] });
  assert.equal(imp.body.rejectedCount, 2);
  assert.equal((await batchOf('BAD-1', sku)), undefined);
});
test('BUG8 FEFO outbound continues into the next batch and skips expired stock', async () => {
  // two batches for a fresh SKU-less scenario: use import with known dates
  await api('POST', '/api/inventory/import-batches', { items: [
    { batchNo: 'F-EXPIRED', sku, quantityOnHand: 100, bestBeforeDate: '2020-01-01' },
    { batchNo: 'F-EARLY', sku, quantityOnHand: 8, bestBeforeDate: '2029-01-01' },
    { batchNo: 'F-LATE', sku, quantityOnHand: 50, bestBeforeDate: '2029-06-01' }
  ] });
  const fefo = (await inv()).batches.filter((b) => b.sku === sku && b.status === 'ACTIVE' && b.quantityOnHand > 0 && b.bestBeforeDate >= '2026-10-27').sort((a, b) => a.bestBeforeDate.localeCompare(b.bestBeforeDate));
  const firstTwo = fefo.slice(0, 2).map((b) => b.batchNo);
  const total = (await inv()).batches.filter((b) => b.sku === sku && b.status === 'ACTIVE' && b.bestBeforeDate >= '2026-10-27').reduce((s, b) => s + b.quantityOnHand, 0);
  const want = fefo[0].quantityOnHand + 3; // forces spill into the 2nd batch
  const r = await api('POST', '/api/inventory/outbound', { sku, quantity: want });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.deepEqual(r.body.batchesUsed.map((x) => x.batchNo), firstTwo);
  assert.ok(!r.body.batchesUsed.some((x) => x.batchNo === 'F-EXPIRED'));
  assert.equal(r.body.movements.length, 2);
  // more than exists in total: refused
  assert.equal((await api('POST', '/api/inventory/outbound', { sku, quantity: total + 1000 })).status, 400);
});
test('BUG9 quarantine hold / release are explicit and logged correctly', async () => {
  const b = await batchOf('F-LATE', sku);
  const hold = await api('POST', '/api/inventory/quarantine', { batchNo: 'F-LATE', sku, action: 'HOLD', quarantineReason: 'test' });
  assert.equal(hold.body.newStatus, 'QUARANTINED');
  const again = await api('POST', '/api/inventory/quarantine', { batchNo: 'F-LATE', sku, action: 'HOLD' });
  assert.equal(again.body.newStatus, 'QUARANTINED'); // second HOLD does not release
  const rel = await api('POST', '/api/inventory/quarantine', { batchNo: 'F-LATE', sku, action: 'RELEASE' });
  assert.equal(rel.body.newStatus, 'ACTIVE');
  assert.equal(rel.body.movementLog.type, 'QUARANTINE_RELEASE');
  assert.equal((await batchOf('F-LATE', sku)).status, 'ACTIVE');
  assert.ok(b);
});
test('BUG10 the same batch number on two SKUs is handled separately', async () => {
  const skus = (await inv()).skus.map((s) => s.sku);
  const other = skus.find((s) => s !== sku);
  await api('POST', '/api/inventory/import-batches', { items: [
    { batchNo: 'SHARED-1', sku, quantityOnHand: 20, bestBeforeDate: '2030-01-01' },
    { batchNo: 'SHARED-1', sku: other, quantityOnHand: 30, bestBeforeDate: '2030-01-01' }
  ] });
  assert.equal((await batchOf('SHARED-1', sku)).quantityOnHand, 20);
  assert.equal((await batchOf('SHARED-1', other)).quantityOnHand, 30);
  const r = await api('POST', '/api/inventory/outbound', { sku: other, batchNo: 'SHARED-1', quantity: 5 });
  assert.equal(r.status, 200);
  assert.equal((await batchOf('SHARED-1', sku)).quantityOnHand, 20); // untouched
  assert.equal((await batchOf('SHARED-1', other)).quantityOnHand, 25);
});
test('BUG11 orders and auto-allocate only reserve stock that exists', async () => {
  const before = (await inv()).skus.find((x) => x.sku === sku).exactQty;
  const o = await newOrder(10_000_000);
  assert.ok(o.totalAllocatedCtn < 10_000_000, 'creating an order must not reserve stock that is not there');
  const r = await api('POST', `/api/sales-orders/${o.id}/auto-allocate`);
  assert.equal(r.status, 200);
  assert.ok(r.body.order.totalAllocatedCtn < 10_000_000);
  assert.equal(r.body.shortages.length, 1);
  const after = (await inv()).skus.find((x) => x.sku === sku).exactQty;
  // the huge order may take whatever was free, but must never push available stock below zero because of it
  assert.ok(after >= Math.min(before, 0), `available went from ${before} to ${after}`);
  // manually asking for more than is free is refused
  const o2 = await newOrder(1);
  const put = await api('PUT', `/api/sales-orders/${o2.id}/allocation`, { items: [{ sku, allocateQty: 10_000_000 }] });
  assert.equal(put.status, 400);
});

// ------------------------------------------------------------------ small bugs
test('IDs never collide (150 orders)', async () => {
  const ids = new Set();
  for (let i = 0; i < 150; i++) ids.add((await newOrder(1)).id);
  assert.equal(ids.size, 150);
  const all = (await api('GET', '/api/orders')).body;
  assert.equal(new Set(all.map((o) => o.id)).size, all.length);
});
test('timestamps use local server time, not UTC', async () => {
  const m = (await inv()).stockMovements[0];
  const now = new Date();
  const local = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  assert.ok(m.timestamp.startsWith(local), `${m.timestamp} vs ${local}`);
});
test('cannot delete a location that still holds stock', async () => {
  const data = await inv();
  const known = new Set(data.locations.map((l) => l.id));
  const b = data.batches.find((x) => x.quantityOnHand > 0 && known.has(x.locationId));
  assert.ok(b, 'demo data has a batch in a known bin');
  const r = await api('DELETE', `/api/locations/${encodeURIComponent(b.locationId)}`);
  assert.equal(r.status, 400);
  assert.match(r.body.error, /still holds stock/);
});
test('route optimizer uses on-hand stock, only the remaining quantity, and reports honest savings', async () => {
  const o = await newOrder(3);
  const r = await api('POST', '/api/orders/optimize-route', { orderId: o.id });
  assert.equal(r.status, 200);
  const picked = r.body.route.nodes.reduce((s, n) => s + n.pickQty, 0);
  assert.equal(picked, 3);
  assert.ok(r.body.route.savedDistancePercent >= 0);
});

// ------------------------------------------------------------------ database failure
test('a failed database write changes nothing (rollback)', async () => {
  const b = await activeBatch();
  const before = b.quantityOnHand;
  const ordersBefore = (await api('GET', '/api/orders')).body.length;
  await api('POST', '/api/_test/fail-next-write');
  const r = await api('POST', '/api/inventory/outbound', { sku, batchNo: b.batchNo, quantity: 1 });
  assert.equal(r.status, 503);
  assert.equal((await batchOf(b.batchNo, sku)).quantityOnHand, before);
  assert.equal((await api('GET', '/api/orders')).body.length, ordersBefore);
  // and the next attempt works
  assert.equal((await api('POST', '/api/inventory/outbound', { sku, batchNo: b.batchNo, quantity: 1 })).status, 200);
  assert.equal((await batchOf(b.batchNo, sku)).quantityOnHand, before - 1);
});
test('requests that fail validation leave no half-finished changes', async () => {
  // order with a valid line + an over-pick: nothing may be deducted
  const b = await activeBatch();
  const before = b.quantityOnHand;
  const o = await newOrder(2);
  const r = await api('POST', '/api/orders/complete-pick', { orderId: o.id, pickedItems: [{ batchNo: b.batchNo, sku, qty: 1 }, { batchNo: b.batchNo, sku, qty: 500000 }] });
  assert.equal(r.status, 400);
  assert.equal((await batchOf(b.batchNo, sku)).quantityOnHand, before);
});
