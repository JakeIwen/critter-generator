import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { APP_SETTINGS, APP_SETTINGS_KEY, DEFAULT_APP_SETTINGS, defaultAppSettings, publicAppSettings } from '../shared/app-settings.mjs';
import { animalTypes } from '../shared/animal-types.mjs';
import { AppSettings } from '../server/app-settings.mjs';
import { Store } from '../server/store.mjs';
import { generationTimingFromJobs } from '../shared/generation-timing.mjs';

function storeFixture(t) {
  const root = mkdtempSync(path.join(tmpdir(), 'critter-app-settings-'));
  const store = new Store(root);
  t.after(() => { store.db.close(); rmSync(root, { recursive: true, force: true }); });
  return { root, store };
}
const job = (id, minutes) => ({ id, kind: 'generation', status: 'completed',
  createdAt: `2026-10-${id.padStart(2, '0')}T00:00:00Z`, finishedAt: `2026-10-${id.padStart(2, '0')}T00:${String(minutes).padStart(2, '0')}:00Z` });

test('app setting definitions retain existing defaults and derive strict integer validation', () => {
  assert.deepEqual(DEFAULT_APP_SETTINGS, { timingWindow: 5, timingOutlierMinutes: 6, initialEstimateSeconds: 130,
    generationTimeoutMinutes: 10, designAttempts: 3, cadRepairAttempts: 2, maxAnimalInspirations: 3, menuModelsPerProvider: 6,
    hiddenEfforts: ['ultra'], catalogFreshMinutes: 15 });
  assert.equal(APP_SETTINGS.maxAnimalInspirations.max, animalTypes.length);
  assert.deepEqual(AppSettings.parse(defaultAppSettings()), DEFAULT_APP_SETTINGS);
  for (const [key, definition] of Object.entries(APP_SETTINGS)) {
    for (const field of ['label', 'help', 'unit', 'min', 'max', 'step', 'default', 'group']) assert(Object.hasOwn(definition, field));
    if (Array.isArray(definition.default)) continue;
    for (const value of [definition.min, definition.max]) assert(AppSettings.safeParse({ ...DEFAULT_APP_SETTINGS, [key]: value }).success);
    for (const value of [definition.min - 1, definition.max + 1, definition.min + 0.5, String(definition.min), null]) {
      assert.equal(AppSettings.safeParse({ ...DEFAULT_APP_SETTINGS, [key]: value }).success, false, `${key}: ${value}`);
    }
  }
  for (const hiddenEfforts of [['Max'], [''], ['a'.repeat(31)], [1], null, 'ultra']) {
    assert.equal(AppSettings.safeParse({ ...DEFAULT_APP_SETTINGS, hiddenEfforts }).success, false);
  }
  assert(AppSettings.safeParse({ ...DEFAULT_APP_SETTINGS, hiddenEfforts: ['xhigh', 'future_effort-2'] }).success);
  assert.equal(AppSettings.safeParse({ ...DEFAULT_APP_SETTINGS, extra: true }).success, false);
  assert.equal(AppSettings.safeParse({ timingWindow: 2 }).success, false);
  const defaults = defaultAppSettings(); defaults.hiddenEfforts.push('low');
  assert.deepEqual(defaultAppSettings().hiddenEfforts, ['ultra']);
  assert.deepEqual(publicAppSettings(DEFAULT_APP_SETTINGS), { timingWindow: 5, maxAnimalInspirations: 3 });
});

test('stored partial settings merge over defaults, ignore stale keys and survive reopening', t => {
  const { store, root } = storeFixture(t);
  assert.deepEqual(store.appSettings(), DEFAULT_APP_SETTINGS);
  store.setMetadata(APP_SETTINGS_KEY, { timingWindow: 2, hiddenEfforts: [], removedKey: true, designAttempts: -1 });
  const expected = { ...DEFAULT_APP_SETTINGS, timingWindow: 2, hiddenEfforts: [] };
  assert.deepEqual(store.appSettings(), expected);
  const reopened = new Store(root);
  try { assert.deepEqual(reopened.appSettings(), expected); }
  finally { reopened.db.close(); }
});

test('saving timing settings immediately rebuilds durable estimates without rewriting jobs', t => {
  const { store } = storeFixture(t);
  store.saveAppSettings({ ...store.appSettings(), initialEstimateSeconds: 75 });
  assert.equal(store.generationTiming().estimatedDurationMs, 75_000);
  const jobs = [job('1', 1), job('2', 4), job('3', 7)];
  for (const item of jobs) store.save('jobs', item.id, item);
  assert.equal(store.generationTiming().averageDurationMs, 150_000);
  assert.equal(store.generationTiming().excludedOutliers, 1);
  store.saveAppSettings({ ...store.appSettings(), timingOutlierMinutes: 8, timingWindow: 1 });
  assert.equal(store.generationTiming().estimatedDurationMs, 420_000);
  assert.equal(store.generationTiming().sampleCount, 1);
  assert.equal(store.generationTiming().excludedOutliers, 0);
  assert.deepEqual(store.metadata('generation-timing'), generationTimingFromJobs(jobs, store.appSettings()));
  assert.deepEqual(store.list('jobs'), jobs.toReversed());
  store.saveAppSettings({ ...store.appSettings(), timingOutlierMinutes: 1, timingWindow: 20 });
  assert.equal(store.generationTiming().estimatedDurationMs, 60_000);
  assert.equal(store.generationTiming().excludedOutliers, 2);
});
