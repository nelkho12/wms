// Run with:  npm test   (uses the in-memory store; the SQL Server store shares the same Persistence logic)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryStore, Persistence, COLLECTION_NAMES } from '../server/store';

const empty = () => Object.fromEntries(COLLECTION_NAMES.map((n) => [n, [] as any[]])) as any;
const open = async (store: MemoryStore) => {
  const p = new Persistence(store);
  const loaded = await p.loadAll();
  return { p, state: loaded as any };
};

test('rows saved with unshift() come back in the same order after a restart', async () => {
  const store = new MemoryStore();
  await store.init();
  let { p, state } = await open(store);
  state.auditLogs.unshift({ id: 'A1', timestamp: 't1' });
  await p.commit(state);
  state.auditLogs.unshift({ id: 'A2', timestamp: 't2' });
  await p.commit(state);
  state.auditLogs.unshift({ id: 'A3', timestamp: 't3' });
  state.auditLogs.push({ id: 'A0', timestamp: 't0' });
  await p.commit(state);

  const again = await open(store);
  assert.deepEqual(again.state.auditLogs.map((r: any) => r.id), ['A3', 'A2', 'A1', 'A0']);
});

test('only changed rows are written', async () => {
  const store = new MemoryStore();
  await store.init();
  const { p, state } = await open(store);
  state.skus.push({ sku: 'S1', name: 'One', category: 'c' }, { sku: 'S2', name: 'Two', category: 'c' });
  assert.equal(await p.commit(state), true);
  assert.equal(await p.commit(state), false, 'nothing changed -> nothing written');

  const seen: string[] = [];
  const orig = store.apply.bind(store);
  store.apply = async (changes, meta) => {
    for (const [k, v] of Object.entries(changes)) seen.push(`${k}:up=${v!.upserts.map((r) => r.id)}:del=${v!.deletes}`);
    return orig(changes, meta);
  };
  state.skus[1].name = 'Two!';
  await p.commit(state);
  assert.deepEqual(seen, ['skus:up=S2:del=']);
});

test('deletes and edits survive a restart', async () => {
  const store = new MemoryStore();
  await store.init();
  let { p, state } = await open(store);
  state.users.push({ id: 'U1', name: 'a', email: 'a@x', role: 'Admin' }, { id: 'U2', name: 'b', email: 'b@x', role: 'Picker' });
  await p.commit(state);
  state.users = state.users.filter((u: any) => u.id !== 'U1');
  state.users[0].role = 'Receiver';
  await p.commit(state);
  const again = await open(store);
  assert.deepEqual(again.state.users.map((u: any) => [u.id, u.role]), [['U2', 'Receiver']]);
});

test('a failed write marks nothing as saved, so the next commit retries it', async () => {
  const store = new MemoryStore();
  await store.init();
  const { p, state } = await open(store);
  state.skus.push({ sku: 'S1', name: 'One', category: 'c' });
  store.failNextApply = true;
  await assert.rejects(() => p.commit(state), /simulated/);
  assert.equal((await store.load('skus')).length, 0);
  assert.equal(await p.commit(state), true, 'same change is retried');
  assert.equal((await store.load('skus')).length, 1);
});

test('duplicate ids are rejected before anything is written', async () => {
  const store = new MemoryStore();
  await store.init();
  const { p, state } = await open(store);
  state.skus.push({ sku: 'S1', name: 'a', category: 'c' }, { sku: 'S1', name: 'b', category: 'c' });
  await assert.rejects(() => p.commit(state), /Duplicate id/);
});

test('hasChanges reports dirty state without writing', async () => {
  const store = new MemoryStore();
  await store.init();
  const { p, state } = await open(store);
  assert.equal(await p.hasChanges(state), false);
  state.zones.push({ code: 'Z', title: 'Zone' });
  assert.equal(await p.hasChanges(state), true);
  assert.equal((await store.load('zones')).length, 0);
});

test('many items inserted in one go keep their order', async () => {
  const store = new MemoryStore();
  await store.init();
  const { p, state } = await open(store);
  for (let i = 0; i < 50; i++) state.stockMovements.unshift({ id: `M${i}`, timestamp: 't', type: 'x', sku: 's', batchNo: 'b', quantity: 1, operator: 'o' });
  await p.commit(state);
  const again = await open(store);
  assert.deepEqual(again.state.stockMovements.map((m: any) => m.id), state.stockMovements.map((m: any) => m.id));
});

test('meta values are saved and only rewritten when changed', async () => {
  const store = new MemoryStore();
  await store.init();
  const { p, state } = await open(store);
  assert.equal(await p.commit(state, { k: 'v1' }), true);
  assert.equal(await p.commit(state, { k: 'v1' }), false);
  assert.equal(await p.commit(state, { k: 'v2' }), true);
  assert.equal(await store.getMeta('k'), 'v2');
});
