import { DEFAULT_APP_SETTINGS } from '../shared/app-settings.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { PROVIDERS, menuModels, joinModelValue, splitModelValue } from '../shared/generation-models.mjs';
import { menuModelLabel, modelLabel } from '../src/settings-format.js';
import { mountSettingsPage } from '../src/settings-page.js';

const models = Object.freeze(Array.from({ length: 10 }, (_, index) => Object.freeze({ id: `model-${index}` })));

test('model menu keeps the first six in discovery order without changing the catalog', () => {
  assert.equal(DEFAULT_APP_SETTINGS.menuModelsPerProvider, 6);
  assert.deepEqual(menuModels(models), models.slice(0, 6));
  assert.equal(models.length, 10);
});

test('model menu appends a selected model outside six but never duplicates or invents one', () => {
  assert.deepEqual(menuModels(models, 'model-8'), [...models.slice(0, 6), models[8]]);
  assert.deepEqual(menuModels(models, 'model-2'), models.slice(0, 6));
  assert.deepEqual(menuModels(models, 'missing'), models.slice(0, 6));
});

test('model menu preserves shorter and empty catalogs', () => {
  assert.deepEqual(menuModels(models.slice(0, 3), 'model-2'), models.slice(0, 3));
  assert.deepEqual(menuModels([]), []);
});

test('combined model option values round trip both providers and valid model punctuation', () => {
  for (const provider of Object.values(PROVIDERS)) {
    for (const model of ['gpt-6-astra', 'default', 'anthropic/claude:alias[1m]', 'model_1.0']) {
      const value = joinModelValue(provider, model);
      assert.equal(value, `${provider}|${model}`);
      assert.deepEqual(splitModelValue(value), { provider, model });
    }
  }
});

test('Codex menu labels show only ids and mark the default', () => {
  const model = { id: 'gpt-6-astra', label: 'GPT-6-Astra', isDefault: false };
  assert.equal(menuModelLabel(PROVIDERS.CODEX, model), 'gpt-6-astra');
  assert.equal(menuModelLabel(PROVIDERS.CODEX, { ...model, isDefault: true }), 'gpt-6-astra (default)');
});

test('Claude menu labels show resolved identities and avoid a redundant Default marker', () => {
  const model = { id: 'default', label: 'Default', resolvedModel: 'claude-opus-5-5[1m]', isDefault: true };
  assert.equal(menuModelLabel(PROVIDERS.CLAUDE, model), 'Default · claude-opus-5-5[1m]');
  assert.equal(menuModelLabel(PROVIDERS.CLAUDE, { ...model, label: 'DEFAULT' }), 'DEFAULT · claude-opus-5-5[1m]');
  assert.equal(menuModelLabel(PROVIDERS.CLAUDE, { ...model, label: 'Opus 5.5' }), 'Opus 5.5 · claude-opus-5-5[1m] (default)');
  assert.equal(menuModelLabel(PROVIDERS.CLAUDE, { ...model, label: 'Opus 5.5', isDefault: false }), 'Opus 5.5 · claude-opus-5-5[1m]');
  assert.equal(menuModelLabel(PROVIDERS.CLAUDE, { ...model, resolvedModel: null }), 'Default · default');
  assert.equal(menuModelLabel(PROVIDERS.CLAUDE, { id: 'sonnet', label: 'Sonnet', isDefault: false }), 'Sonnet · sonnet');
  assert.equal(modelLabel({ provider: PROVIDERS.CODEX, model: 'gpt-6-astra', effort: 'max' }), 'Codex · gpt-6-astra · Maximum');
});

const codexModels = models.map(({ id }, index) => ({ id, label: `Model ${index}`, efforts: ['low', 'high'],
  defaultEffort: 'low', isDefault: index === 0 }));
const claudeModel = { id: 'default', label: 'Default', resolvedModel: 'claude-opus-5-5[1m]',
  efforts: ['medium', 'max'], defaultEffort: 'max', isDefault: true };
const available = (provider, models) => ({ provider, models, available: true, reason: null });

async function settingsFixture(t, { providers, selection }) {
  const section = { innerHTML: '' }, saved = [], errors = [];
  t.mock.method(globalThis, 'fetch', async (url, options = {}) => {
    let body;
    if (url === '/api/models') body = { catalog: { providers, refreshing: false }, selection };
    else if (url === '/api/settings/app') body = { values: structuredClone(DEFAULT_APP_SETTINGS), efforts: ['low', 'medium', 'high', 'max', 'ultra'] };
    else if (url === '/api/stats') body = { recent: [], totals: [], durations: [], byModel: [] };
    else if (url === '/api/settings/generation' && options.method === 'PUT') {
      saved.push(JSON.parse(options.body));
      body = { selection: saved.at(-1) };
    } else assert.fail(`Unexpected request: ${url}`);
    return { ok: true, json: async () => body };
  });
  const page = mountSettingsPage(id => { assert.equal(id, 'settings'); return section; }, { onError: error => errors.push(error) });
  await page.show();
  assert.deepEqual(errors, []);
  return { section, saved, errors };
}

test('Settings renders one grouped model menu, retains the saved older model and saves combined changes', async t => {
  const { section, saved, errors } = await settingsFixture(t, {
    providers: [available(PROVIDERS.CLAUDE, [claudeModel]), available(PROVIDERS.CODEX, codexModels)],
    selection: { provider: PROVIDERS.CODEX, model: 'model-8', effort: 'high' },
  });
  assert.doesNotMatch(section.innerHTML, /settings-provider/);
  assert.match(section.innerHTML, /<optgroup label="Codex">[\s\S]*<optgroup label="Claude">/);
  assert.match(section.innerHTML, /<option value="codex\|model-0">model-0 \(default\)<\/option>/);
  assert.match(section.innerHTML, /<option value="codex\|model-8" selected>model-8<\/option>/);
  for (const id of ['model-6', 'model-7', 'model-9']) assert(!section.innerHTML.includes(`value="codex|${id}"`));
  section.onchange({ target: { id: 'settings-model', value: joinModelValue(PROVIDERS.CLAUDE, 'default') } });
  assert.match(section.innerHTML, /<option value="claude\|default" selected>Default · claude-opus-5-5\[1m\]<\/option>/);
  assert.match(section.innerHTML, /<option value="max" selected>Maximum<\/option>/);
  assert.match(section.innerHTML, /value="codex\|model-8"/, 'The saved model stays available after changing the draft');
  assert.match(section.innerHTML, /Current: Codex · model-8 · High/);
  await section.onsubmit({ preventDefault() {} });
  assert.deepEqual(saved, [{ provider: PROVIDERS.CLAUDE, model: 'default', effort: 'max' }]);
  assert.match(section.innerHTML, /Saved · uses Claude · default · Maximum for new jobs/);
  assert.deepEqual(errors, []);
});

test('Settings retains unavailable groups with disabled escaped reasons and selects the first available default', async t => {
  const { section, saved } = await settingsFixture(t, {
    providers: [{ provider: PROVIDERS.CODEX, available: false, models: [], reason: 'Sign in <again>' },
      available(PROVIDERS.CLAUDE, [{ ...claudeModel, id: 'other', isDefault: false }, claudeModel])],
    selection: { provider: PROVIDERS.CODEX, model: 'model-0', effort: 'ultra' },
  });
  assert.match(section.innerHTML, /<optgroup label="Codex"><option value="" disabled>Sign in &lt;again&gt;<\/option><\/optgroup>/);
  assert.match(section.innerHTML, /Codex: Sign in &lt;again&gt;/);
  assert.match(section.innerHTML, /<option value="claude\|default" selected>/);
  await section.onsubmit({ preventDefault() {} });
  assert.deepEqual(saved, [{ provider: PROVIDERS.CLAUDE, model: 'default', effort: 'max' }]);
});

test('Settings falls back to the first provider when a saved model is missing, using its first model without a default', async t => {
  const { section, saved } = await settingsFixture(t, {
    providers: [available(PROVIDERS.CLAUDE, [claudeModel]),
      available(PROVIDERS.CODEX, codexModels.map(model => ({ ...model, isDefault: false })))],
    selection: { provider: PROVIDERS.CLAUDE, model: 'missing', effort: 'medium' },
  });
  assert.match(section.innerHTML, /<option value="codex\|model-0" selected>/);
  await section.onsubmit({ preventDefault() {} });
  assert.deepEqual(saved, [{ provider: PROVIDERS.CODEX, model: 'model-0', effort: 'low' }]);
});


test('model menu applies a configured cap and still appends the saved model', () => {
  assert.deepEqual(menuModels(models, 'model-8', 1), [models[0], models[8]]);
  assert.deepEqual(menuModels(models, 'model-8', 30), models);
});
