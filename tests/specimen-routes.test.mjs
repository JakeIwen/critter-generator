import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createSpecimenRoutes } from '../server/specimen-routes.mjs';
import { Store } from '../server/store.mjs';
import { example } from '../shared/specimen.mjs';

async function server(t) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'critter-specimen-routes-'));
  const store = new Store(directory), jobs = { current: null };
  for (const id of ['example-lantern', 'saved-one', 'other']) store.save('specimens', id,
    { ...example, id, demo: id === 'example-lantern', createdAt: '2026-09-01T00:00:00Z' });
  const app = express();
  app.use(createSpecimenRoutes({ store, jobs, isOwner: req => req.headers['test-owner'] === 'yes' }));
  const listener = app.listen(0, '127.0.0.1'); await once(listener, 'listening');
  t.after(async () => {
    await new Promise(resolve => listener.close(resolve)); store.db.close();
    await rm(directory, { recursive: true, force: true });
  });
  const origin = `http://127.0.0.1:${listener.address().port}`;
  return { store, jobs, remove: (id, owner = true) => fetch(`${origin}/api/specimens/${id}`, {
    method: 'DELETE', headers: owner ? { 'test-owner': 'yes' } : {},
  }) };
}

test('nonowners cannot delete specimens or probe whether one exists', async t => {
  const { store, remove } = await server(t);
  for (const id of ['saved-one', 'unknown', 'example-lantern']) {
    const response = await remove(id, false);
    assert.equal(response.status, 403); assert.deepEqual(await response.json(), { error: 'Owner access only.' });
  }
  assert.equal(store.list('specimens').length, 3);
});

test('owner deletion rejects unknown, demo and running-job specimens', async t => {
  const { store, jobs, remove } = await server(t);
  const unknown = await remove('unknown'); assert.equal(unknown.status, 404);
  assert.deepEqual(await unknown.json(), { error: 'Specimen not found.' });
  const demo = await remove('example-lantern'); assert.equal(demo.status, 409);
  assert.deepEqual(await demo.json(), { error: 'The bundled example cannot be deleted.' });
  jobs.current = { job: { id: 'job-one', specimenId: 'saved-one' } };
  const running = await remove('saved-one'); assert.equal(running.status, 409);
  assert.deepEqual(await running.json(), { error: 'A generation is running for this specimen.' });
  assert.equal(store.list('specimens').length, 3);
  const other = await remove('other'); assert.equal(other.status, 200);
  assert.deepEqual(await other.json(), { archived: 'other' });
  assert.equal(store.get('specimens', 'other'), null);
});

test('owner deletion archives a saved specimen and later calls return not found', async t => {
  const { store, remove } = await server(t);
  const response = await remove('saved-one'); assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { archived: 'saved-one' });
  assert.equal(store.get('specimens', 'saved-one'), null);
  assert.equal((await remove('saved-one')).status, 404);
});
