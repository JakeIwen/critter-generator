import test from 'node:test';
import assert from 'node:assert/strict';
import { ModelCatalog, GenerationSelection, CATALOG_FRESH_MS, CATALOG_RETRY_MS } from '../server/model-catalog.mjs';
import { DEFAULT_GENERATION_MODEL, TEXT_STAGES, providerForStage, effortLabel } from '../shared/generation-models.mjs';

const astra = { id: 'gpt-6-astra', label: 'Astra', description: null,
  efforts: ['low', 'medium', 'high', 'xhigh', 'max', 'ultra'], defaultEffort: 'medium', isDefault: true };
const fable = { id: 'fable[1m]', label: 'Fable', description: 'Claude model', efforts: [], defaultEffort: null, isDefault: true };

function fixture() {
  let clock = 0;
  const calls = { codex: 0, claude: 0 };
  const catalog = new ModelCatalog({ now: () => clock, discoverers: {
    codex: async () => { calls.codex++; return [astra]; },
    claude: async () => { calls.claude++; return [fable]; },
  } });
  return { catalog, calls, tick: ms => { clock += ms; } };
}

test('canonical provider routing never sends image generation to Claude', () => {
  for (const stage of TEXT_STAGES) assert.equal(providerForStage(stage, { provider: 'claude' }), 'claude');
  assert.equal(providerForStage('image', { provider: 'claude' }), 'codex');
  assert.throws(() => providerForStage('typo', DEFAULT_GENERATION_MODEL), /Unknown/);
  assert.deepEqual(['xhigh', 'max', 'ultra', 'future'].map(effortLabel), ['Extra high', 'Maximum', 'Ultra', 'Future']);
  assert(Object.isFrozen(DEFAULT_GENERATION_MODEL));
});

test('catalog is lazy, caches successful discovery for fifteen minutes and supports forced refresh', async () => {
  const { catalog, calls, tick } = fixture();
  assert.deepEqual(calls, { codex: 0, claude: 0 });
  const first = await catalog.getCatalog();
  assert.equal(first.providers.length, 2); assert.equal(first.refreshing, false);
  assert.deepEqual(calls, { codex: 1, claude: 1 });
  tick(CATALOG_FRESH_MS - 1); assert.deepEqual(await catalog.getCatalog(), first);
  tick(1); await catalog.getCatalog(); assert.deepEqual(calls, { codex: 2, claude: 2 });
  await catalog.getCatalog({ refresh: true }); assert.deepEqual(calls, { codex: 3, claude: 3 });
});

test('catalog retries failed discovery after sixty seconds and redacts errors', async () => {
  let clock = 0, calls = 0;
  const catalog = new ModelCatalog({ now: () => clock, discoverers: {
    codex: async () => { calls++; throw new Error('Disconnected sk-secret Bearer account-token'); },
  } });
  assert.equal(await catalog.validateSelection(DEFAULT_GENERATION_MODEL), 'Disconnected [redacted] Bearer [redacted]');
  clock = CATALOG_RETRY_MS - 1; await catalog.getProvider('codex'); assert.equal(calls, 1);
  clock++; await catalog.getProvider('codex'); assert.equal(calls, 2);
  const missing = await catalog.getProvider('claude'); assert.equal(missing.available, false);
});

test('concurrent refresh requests share one discovery, including validation', async () => {
  let resolve, calls = 0;
  const catalog = new ModelCatalog({ discoverers: { codex: () => { calls++; return new Promise(done => { resolve = done; }); } } });
  const first = catalog.getProvider('codex'), second = catalog.getProvider('codex', { refresh: true });
  const valid = catalog.validateSelection(DEFAULT_GENERATION_MODEL);
  assert.equal(catalog.refreshing, true); assert.equal(calls, 1);
  resolve([astra]); assert.deepEqual(await first, await second); assert.equal(await valid, null);
  assert.equal(catalog.refreshing, false);
});

test('selection validates model ids, supported efforts and unavailable accounts before saving', async () => {
  const { catalog, calls } = fixture();
  assert.equal(await catalog.validateSelection(DEFAULT_GENERATION_MODEL), null);
  assert.deepEqual(calls, { codex: 1, claude: 0 }, 'Validation discovers only the chosen provider');
  assert.match(await catalog.validateSelection({ ...DEFAULT_GENERATION_MODEL, model: 'other' }), /Selected model other is not available/);
  for (const effort of [null, 'none']) assert.match(await catalog.validateSelection({ ...DEFAULT_GENERATION_MODEL, effort }), /supported effort/);
  assert.equal(await catalog.validateSelection({ provider: 'claude', model: fable.id, effort: null }), null);
  assert.match(await catalog.validateSelection({ provider: 'claude', model: fable.id, effort: 'high' }), /use null/);
  for (const model of ['--flag', 'bad model', 'a'.repeat(121), 'bad\n']) {
    assert.equal(GenerationSelection.safeParse({ ...DEFAULT_GENERATION_MODEL, model }).success, false);
  }
  assert.equal(GenerationSelection.safeParse({ provider: 'claude', model: 'anthropic/claude:alias[1m]', effort: null }).success, true);
  assert.equal(GenerationSelection.safeParse({ ...DEFAULT_GENERATION_MODEL, effort: 'Max' }).success, false);
});
