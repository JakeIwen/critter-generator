import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createAppearanceRoutes } from '../server/appearance-routes.mjs';
import { readAppearance, withThemeStyle } from '../server/appearance.mjs';
import { Store } from '../server/store.mjs';

const rosewood = { id: 'rosewood-slate', name: 'Rosewood Slate', knobs: { hueNeutral: 360, hueBrand: 240, hueAccent: 70, chroma: 1.15 } };

async function server(t) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'critter-appearance-'));
  const store = new Store(directory);
  const app = express(); app.use(express.json());
  app.use(createAppearanceRoutes({ store, isOwner: req => req.headers['test-owner'] === 'yes' }));
  const listener = app.listen(0, '127.0.0.1'); await once(listener, 'listening');
  t.after(async () => { await new Promise(resolve => listener.close(resolve)); store.db.close(); await rm(directory, { recursive: true, force: true }); });
  const origin = `http://127.0.0.1:${listener.address().port}`;
  const request = (route, { method = 'GET', body, owner = true } = {}) => fetch(origin + route, {
    method, headers: { 'Content-Type': 'application/json', ...(owner ? { 'test-owner': 'yes' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return { store, request };
}

test('the owner saves, activates and deletes themes; every viewer reads the active one', async t => {
  const { store, request } = await server(t);
  assert.deepEqual(await (await request('/api/appearance', { owner: false })).json(), {
    active: { id: 'critter', knobs: { hueNeutral: 305, hueBrand: 315, hueAccent: 70, chroma: 0.8 } }, themes: [] });
  let response = await request('/api/appearance/themes/rosewood-slate', { method: 'PUT', body: { theme: { ...rosewood, name: ' Rosewood Slate ' } } });
  assert.equal(response.status, 200);
  assert.deepEqual((await response.json()).themes, [rosewood]);
  response = await request('/api/appearance/active', { method: 'PUT', body: { active: { id: rosewood.id, knobs: rosewood.knobs } } });
  assert.deepEqual((await response.json()).active, { id: rosewood.id, knobs: rosewood.knobs });
  assert.deepEqual((await (await request('/api/appearance', { owner: false })).json()).active.knobs, rosewood.knobs);
  response = await request('/api/appearance/themes/rosewood-slate', { method: 'DELETE' });
  assert.deepEqual((await response.json()).themes, []);
  assert.deepEqual(readAppearance(store).themes, []);
});

test('appearance writes are owner-only and validated without changing what is saved', async t => {
  const { store, request } = await server(t);
  const knobs = rosewood.knobs;
  const rejected = [
    ['/api/appearance/active', 'PUT', { active: { id: 'critter', knobs } }, false, 403, 'Owner access only.'],
    ['/api/appearance/active', 'PUT', { active: { id: 'missing', knobs } }, true, 400, 'No theme with id missing'],
    ['/api/appearance/active', 'PUT', { active: { id: 'critter', knobs: { ...knobs, chroma: 3 } } }, true, 400, 'chroma must be a number from 0 to 2'],
    ['/api/appearance/themes/critter', 'PUT', { theme: { ...rosewood, id: 'critter' } }, true, 400, "Built-in themes can't be changed"],
    ['/api/appearance/themes/other', 'PUT', { theme: rosewood }, true, 400, 'Theme id must match the URL'],
    ['/api/appearance/themes/rosewood-slate', 'PUT', { theme: { ...rosewood, knobs: { ...knobs, glow: 1 } } }, true, 400, 'Unknown knob glow'],
    ['/api/appearance/themes/critter', 'DELETE', undefined, true, 400, "Built-in themes can't be deleted"],
    ['/api/appearance/themes/missing', 'DELETE', undefined, true, 404, 'No saved theme with id missing'],
  ];
  for (const [route, method, body, owner, status, error] of rejected) {
    const before = store.metadata('appearance');
    const response = await request(route, { method, body, owner });
    assert.equal(response.status, status, `${method} ${route}`);
    assert.equal((await response.json()).error, error);
    assert.deepEqual(store.metadata('appearance'), before);
  }
});

test('served pages carry the active knobs before any script runs', () => {
  const style = '<style id="theme-knobs">:root{--hue-neutral:360;--hue-brand:240;--hue-accent:70;--chroma:1.15}</style>';
  assert.equal(withThemeStyle('<html><head><title>x</title></head></html>', { knobs: rosewood.knobs }), `<html><head><title>x</title>${style}</head></html>`);
  assert.equal(withThemeStyle('<!doctype html><title>x</title>', { knobs: rosewood.knobs }), `<!doctype html>${style}<title>x</title>`);
});
