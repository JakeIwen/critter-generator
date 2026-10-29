import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createSettingsRoutes } from '../server/settings-routes.mjs';
import { ModelCatalog } from '../server/model-catalog.mjs';
import { Store } from '../server/store.mjs';
import { DEFAULT_GENERATION_MODEL } from '../shared/generation-models.mjs';

async function server(t) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'critter-settings-'));
  const store = new Store(directory);
  let discoveries = 0;
  const catalog = new ModelCatalog({ getSettings: () => store.appSettings(), discoverers: {
    codex: async () => { discoveries++; return [{ id: DEFAULT_GENERATION_MODEL.model, label: 'Astra', description: null,
      efforts: ['low', 'max'], defaultEffort: 'low', isDefault: true }]; },
    claude: async () => { discoveries++; throw new Error('Claude is not signed in.'); },
  } });
  const app = express(); app.use(express.json());
  app.use(createSettingsRoutes({ store, catalog, isOwner: req => req.headers['test-owner'] === 'yes' }));
  const listener = app.listen(0, '127.0.0.1'); await once(listener, 'listening');
  t.after(async () => { await new Promise(resolve => listener.close(resolve)); store.db.close(); await rm(directory, { recursive: true, force: true }); });
  const origin = `http://127.0.0.1:${listener.address().port}`;
  const request = (route, { owner = true, selection } = {}) => fetch(origin + route, {
    method: selection ? 'PUT' : 'GET', headers: { 'Content-Type': 'application/json', ...(owner ? { 'test-owner': 'yes' } : {}) },
    ...(selection ? { body: JSON.stringify(selection) } : {}),
  });
  return { store, catalog, request, discoveries: () => discoveries };
}

test('owner settings round trip defaults to Astra/max and persists only validated selections', async t => {
  const { store, request } = await server(t);
  assert.deepEqual(store.generationModel(), DEFAULT_GENERATION_MODEL);
  assert.equal(store.metadata('missing', 42), 42);
  store.setMetadata('test-record', { answer: 42 }); assert.deepEqual(store.metadata('test-record'), { answer: 42 });
  const models = await request('/api/models'); assert.equal(models.status, 200);
  const value = await models.json(); assert.deepEqual(value.selection, DEFAULT_GENERATION_MODEL);
  assert.equal(value.catalog.providers.find(item => item.provider === 'claude').available, false);
  const selection = { ...DEFAULT_GENERATION_MODEL, effort: 'low' };
  const saved = await request('/api/settings/generation', { selection }); assert.equal(saved.status, 200);
  const body = await saved.json(); assert(Number.isFinite(Date.parse(body.selection.updatedAt)));
  assert.deepEqual(body.selection, { ...selection, updatedAt: body.selection.updatedAt });
  assert.deepEqual((await (await request('/api/models')).json()).selection, body.selection);
  for (const selection of [{ ...DEFAULT_GENERATION_MODEL, effort: 'unsupported' },
    { ...DEFAULT_GENERATION_MODEL, model: 'missing' }, { provider: 'claude', model: 'fable', effort: 'high' },
    { ...DEFAULT_GENERATION_MODEL, extra: true }]) {
    const rejected = await request('/api/settings/generation', { selection }); assert.equal(rejected.status, 400);
    assert.equal(typeof (await rejected.json()).error, 'string'); assert.deepEqual(store.generationModel(), body.selection);
  }
  const stats = await request('/api/stats'); assert.equal(stats.status, 200);
  assert.deepEqual(await stats.json(), { timing: store.generationTiming(), totals: [], durations: [], recent: [], byModel: [] });
});

test('nonowners cannot read models/stats or write settings, including forced discovery', async t => {
  const { request, discoveries, store } = await server(t);
  for (const route of ['/api/models', '/api/models?refresh=1', '/api/stats', '/api/settings/generation']) {
    const response = await request(route, { owner: false, ...(route.includes('/settings/') ? { selection: DEFAULT_GENERATION_MODEL } : {}) });
    assert.equal(response.status, 403); assert.deepEqual(await response.json(), { error: 'Owner access only.' });
  }
  assert.equal(discoveries(), 0); assert.deepEqual(store.generationModel(), DEFAULT_GENERATION_MODEL);
});

test('forced model refresh rechecks both accounts while ordinary reads share the cache', async t => {
  const { request, discoveries } = await server(t);
  await request('/api/models'); assert.equal(discoveries(), 2);
  await request('/api/models'); assert.equal(discoveries(), 2);
  await request('/api/models?refresh=1'); assert.equal(discoveries(), 4);
});


test('app settings enforce owner access, strict validation and the saved effort guard', async t => {
  const { request, store, discoveries } = await server(t);
  for (const selection of [undefined, store.appSettings()]) {
    const response = await request('/api/settings/app', { owner: false, selection });
    assert.equal(response.status, 403);
  }
  assert.equal(discoveries(), 0);
  const initial = await (await request('/api/settings/app')).json();
  assert.deepEqual(initial.values, store.appSettings());
  assert.deepEqual(initial.efforts, ['low', 'max', 'ultra']);
  const values = { ...initial.values, timingWindow: 2, initialEstimateSeconds: 80, hiddenEfforts: ['ultra', 'low'] };
  assert.equal((await request('/api/settings/app', { selection: values })).status, 200);
  assert.deepEqual((await (await request('/api/settings/app')).json()).values, values);
  assert.equal(store.generationTiming().estimatedDurationMs, 80_000);
  const hiddenSelection = await request('/api/settings/generation', { selection: { ...DEFAULT_GENERATION_MODEL, effort: 'low' } });
  assert.equal(hiddenSelection.status, 400);
  for (const selection of [{ ...values, timingWindow: 21 }, { ...values, extra: true }, { ...values, hiddenEfforts: ['Max'] }]) {
    assert.equal((await request('/api/settings/app', { selection })).status, 400);
  }
  const rejected = await request('/api/settings/app', { selection: { ...values, hiddenEfforts: ['max'] } });
  assert.equal(rejected.status, 400); assert.match((await rejected.json()).error, /Cannot hide the saved generation effort "max"/);
  assert.deepEqual(store.appSettings(), values);
  const stats = await (await request('/api/stats')).json();
  assert.equal(stats.timing.estimatedDurationMs, 80_000);
});


test('generation saves recheck hidden efforts after asynchronous discovery', async t => {
  const { request, store, catalog } = await server(t);
  const validate = catalog.validateSelection.bind(catalog);
  let release, entered;
  const waiting = new Promise(resolve => { entered = resolve; });
  t.mock.method(catalog, 'validateSelection', async selection => {
    const result = await validate(selection);
    entered(); await new Promise(resolve => { release = resolve; });
    return result;
  });
  const pending = request('/api/settings/generation', { selection: { ...DEFAULT_GENERATION_MODEL, effort: 'low' } });
  await waiting;
  const saved = await request('/api/settings/app', { selection: { ...store.appSettings(), hiddenEfforts: ['low'] } });
  assert.equal(saved.status, 200); release();
  const rejected = await pending; assert.equal(rejected.status, 400);
  assert.match((await rejected.json()).error, /hidden/);
  assert.equal(store.generationModel().effort, 'max');
});
