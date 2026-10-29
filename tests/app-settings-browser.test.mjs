import test from 'node:test';
import assert from 'node:assert/strict';
import { createAppSettingsCard } from '../src/app-settings-card.js';
import { mountGenerationForm } from '../src/generation-form.js';
import { DEFAULT_APP_SETTINGS } from '../shared/app-settings.mjs';

function cardFixture(t) {
  let stored = structuredClone(DEFAULT_APP_SETTINGS), saves = 0, refreshed = 0;
  const errors = [];
  t.mock.method(globalThis, 'fetch', async (url, options = {}) => {
    assert.equal(url, '/api/settings/app');
    if (options.method === 'PUT') { stored = JSON.parse(options.body); saves++; }
    return { ok: true, json: async () => ({ values: stored, efforts: ['low', 'max', ...stored.hiddenEfforts] }) };
  });
  const card = createAppSettingsCard({ update() {}, onError: error => errors.push(error), onSaved: async () => { refreshed++; } });
  return { card, errors, saves: () => saves, refreshed: () => refreshed };
}

test('app settings card loads, edits numbers and hidden efforts, saves and resets only the draft', async t => {
  const { card, saves, refreshed, errors } = cardFixture(t);
  await card.load();
  assert.match(card.render(false), /value="ultra" checked/);
  assert.match(card.render(false), /app-timingWindow/);
  card.change({ dataset: { appSetting: 'timingWindow' }, type: 'number', value: '12' });
  card.change({ dataset: { appSetting: 'hiddenEfforts' }, type: 'checkbox', value: 'ultra', checked: false });
  await card.save({ preventDefault() {} });
  assert.equal(card.values.timingWindow, 12); assert.deepEqual(card.values.hiddenEfforts, []);
  assert.equal(saves(), 1); assert.equal(refreshed(), 1); assert.deepEqual(errors, []);
  card.reset();
  assert.equal(saves(), 1); assert.equal(card.values.timingWindow, 12);
  assert.match(card.render(false), /Defaults filled/);
  await card.save({ preventDefault() {} });
  assert.deepEqual(card.values, DEFAULT_APP_SETTINGS);
  card.includeEfforts(['future']); assert.match(card.render(false), /value="future"/);
});

function formFixture(t) {
  const nodes = new Map(), generated = [];
  const node = id => {
    if (!nodes.has(id)) nodes.set(id, { value: '', title: '', dataset: {}, textContent: '', innerHTML: '', disabled: false,
      setAttribute(key, value) { this[key] = value; }, setCustomValidity() {}, addEventListener() {},
      querySelector: () => node(`${id}-span`), style: { setProperty() {} }, reportValidity: () => true, scrollIntoView() {} });
    return nodes.get(id);
  };
  const buttons = ['mammals', 'birds', 'reptiles', 'amphibians'].map(id => {
    const button = node(id); button.dataset.animalType = id; return button;
  });
  node('generator-form').querySelectorAll = () => buttons;
  const original = Object.getOwnPropertyDescriptor(globalThis, 'document');
  Object.defineProperty(globalThis, 'document', { configurable: true, value: { querySelectorAll: () => [] } });
  t.after(() => { if (original) Object.defineProperty(globalThis, 'document', original); else delete globalThis.document; });
  const form = mountGenerationForm(node, settings => generated.push(settings));
  const submit = () => { node('generator-form').onsubmit({ preventDefault() {} }); return generated.at(-1); };
  return { form, node, buttons, submit };
}

test('public configuration changes inspiration cap, trims selections, updates text and limits reuse', t => {
  const { form, node, buttons, submit } = formFixture(t);
  buttons.slice(0, 3).forEach(button => button.onclick());
  assert.equal(buttons[3].disabled, true);
  form.setConfig({ maxAnimalInspirations: 1 });
  assert.equal(node('animal-limit').textContent, 'OPTIONAL · MAX 1');
  assert.match(node('animal-summary').title, /up to 1 animal group,/);
  assert.deepEqual(submit().animalTypes, ['mammals']);
  assert.equal(submit().directionLocks.inspirations, true);
  form.applySettings({ animalTypes: ['birds', 'reptiles', 'amphibians'] });
  assert.deepEqual(submit().animalTypes, ['birds']);
  form.setConfig({ maxAnimalInspirations: 4 });
  assert.equal(buttons[3].disabled, false);
  buttons[3].onclick(); assert.deepEqual(submit().animalTypes, ['birds', 'amphibians']);
  node('any-animal').onclick();
  assert.deepEqual(submit().animalTypes, []); assert.equal(submit().directionLocks.inspirations, false);
});
