import test from 'node:test';
import assert from 'node:assert/strict';
import { actionProgressMarkup, createActionProgress } from '../src/action-progress.js';
import { createSpecimenActionProgress } from '../src/specimen-action-progress.js';
import { JOB_KINDS } from '../shared/generation-timing.mjs';

function view() {
  let time = 100_000, tick = null, schedules = 0, cancellations = 0, cancelClicks = 0;
  const hidden = new Set(['hidden']);
  const nodes = {
    'cad-progress': { classList: { toggle(name, value) { if (value) hidden.add(name); else hidden.delete(name); } } },
    'generate-cad': { innerHTML: 'Generate CAD', disabled: false }, 'cad-message': {}, 'cad-elapsed': {}, 'cad-cancel': {},
  };
  const progress = createActionProgress(id => nodes[id], { id: 'cad', buttonId: 'generate-cad', loadingLabel: 'Generating CAD…',
    onCancel() { cancelClicks++; }, now: () => time,
    schedule(callback, delay) { assert.equal(delay, 1000); tick = callback; return ++schedules; }, cancel() { tick = null; cancellations++; },
  });
  return { nodes, hidden, progress, advance(seconds) { time += seconds * 1000; tick?.(); },
    get schedules() { return schedules; }, get cancellations() { return cancellations; }, get cancelClicks() { return cancelClicks; } };
}

const job = { id: 'job', createdAt: new Date(77_000).toISOString(), message: 'Planning from the current portrait…' };

test('in-card progress has a polite status, an indeterminate bar and a non-submit cancel control', () => {
  const markup = actionProgressMarkup('cad', 'CAD generation progress');
  assert.match(markup, /role="status" aria-live="polite"/);
  assert.match(markup, /<progress aria-label="CAD generation progress"><\/progress>/);
  assert.match(markup, /id="cad-cancel"[^>]*type="button"/);
});

test('running feedback restores elapsed time, ticks between polls and shares cancellation', () => {
  const v = view(); v.progress.update(job, 'Interpreting the portrait for CAD');
  assert.equal(v.hidden.has('hidden'), false);
  assert.match(v.nodes['generate-cad'].innerHTML, /spinner.*Generating CAD…/);
  assert.equal(v.nodes['generate-cad'].disabled, true);
  assert.equal(v.nodes['cad-message'].textContent, job.message);
  assert.equal(v.nodes['cad-elapsed'].textContent, '0:23');
  v.advance(38); assert.equal(v.nodes['cad-elapsed'].textContent, '1:01');
  v.progress.update({ ...job, message: '' }, 'Building the print sculpture');
  assert.equal(v.nodes['cad-message'].textContent, 'Building the print sculpture');
  assert.equal(v.schedules, 1);
  v.nodes['cad-cancel'].onclick(); assert.equal(v.cancelClicks, 1);
  v.progress.update({ ...job, cancelling: true });
  assert.equal(v.nodes['cad-message'].textContent, 'Cancelling…'); assert.equal(v.nodes['cad-cancel'].disabled, true);
  v.progress.update(null);
  assert.equal(v.hidden.has('hidden'), true); assert.equal(v.nodes['generate-cad'].innerHTML, 'Generate CAD');
  assert.equal(v.cancellations, 1);
  v.advance(10); assert.equal(v.nodes['cad-elapsed'].textContent, '1:01');
});

test('submission feedback starts before a job ID exists and survives a card rerender', () => {
  const v = view(); v.progress.update({ message: 'Connecting…' });
  assert.equal(v.nodes['cad-cancel'].disabled, true); assert.equal(v.nodes['cad-elapsed'].textContent, '0:00');
  v.nodes['generate-cad'] = { innerHTML: 'Regenerate CAD', disabled: true };
  v.progress.update(job); v.progress.update(null);
  assert.equal(v.nodes['generate-cad'].innerHTML, 'Regenerate CAD');
  delete v.nodes['cad-progress']; v.progress.update(job);
  assert.equal(v.schedules, 1);
});

test('a shared progress region puts the spinner on the chosen button and restores both labels', () => {
  const v = view(); v.nodes['apply-edit'] = { innerHTML: 'Apply edit', disabled: false };
  v.progress.update(job, 'Drawing', { buttonId: 'apply-edit', loadingLabel: 'Applying edit…' });
  assert.match(v.nodes['apply-edit'].innerHTML, /spinner.*Applying edit…/);
  assert.equal(v.nodes['generate-cad'].innerHTML, 'Generate CAD');
  v.progress.update(job, 'Drawing');
  assert.equal(v.nodes['apply-edit'].innerHTML, 'Apply edit');
  assert.match(v.nodes['generate-cad'].innerHTML, /Generating CAD…/);
  v.progress.update(null); assert.equal(v.nodes['generate-cad'].innerHTML, 'Generate CAD');
});

test('specimen feedback follows the initiating portrait control and only the displayed specimen', t => {
  const originals = [globalThis.setInterval, globalThis.clearInterval];
  globalThis.setInterval = () => 1; globalThis.clearInterval = () => {};
  t.after(() => { [globalThis.setInterval, globalThis.clearInterval] = originals; });
  const nodes = {}, regions = ['cad', 'portrait', 'retry-portrait', 'empty-portrait'];
  for (const id of regions) {
    const hidden = new Set(['hidden']);
    nodes[`${id}-progress`] = { hidden, classList: { toggle(name, value) { if (value) hidden.add(name); else hidden.delete(name); } } };
    for (const suffix of ['message', 'elapsed', 'cancel']) nodes[`${id}-${suffix}`] = {};
  }
  for (const id of ['generate-cad', 'regenerate-portrait', 'apply-portrait-edit', 'retry-portrait', 'empty-portrait']) nodes[id] = { innerHTML: id };
  let cancelled = 0;
  const update = createSpecimenActionProgress(id => nodes[id], () => { cancelled++; });
  const specimen = { id: 'saved', image: true }, running = { ...job, kind: JOB_KINDS.PORTRAIT, specimenId: 'saved' };
  const visible = () => regions.filter(id => !nodes[`${id}-progress`].hidden.has('hidden'));
  for (const [buttonId, region, label] of [['regenerate-portrait', 'portrait', 'Painting a new portrait…'],
    ['apply-portrait-edit', 'portrait', 'Applying edit…'], ['retry-portrait', 'retry-portrait', 'Painting a new portrait…'],
    ['empty-portrait', 'empty-portrait', 'Painting a new portrait…']]) {
    update({ ...running, actionButtonId: buttonId }, 'Drawing', specimen);
    assert.deepEqual(visible(), [region]); assert.ok(nodes[buttonId].innerHTML.includes(label));
    nodes[`${region}-cancel`].onclick();
    update(null, '', specimen); assert.equal(nodes[buttonId].innerHTML, buttonId);
  }
  assert.equal(cancelled, 4);
  update(running, 'Drawing', specimen); assert.deepEqual(visible(), ['portrait']);
  update(running, 'Drawing', { id: 'other', image: true }); assert.deepEqual(visible(), []);
  update(running, 'Drawing', { ...specimen, image: false }); assert.deepEqual(visible(), ['empty-portrait']);
  update({ ...running, kind: JOB_KINDS.GENERATION }, 'Discovering', specimen); assert.deepEqual(visible(), []);
  update({ ...running, kind: JOB_KINDS.CAD }, 'Building', specimen); assert.deepEqual(visible(), ['cad']);
  update(null, '', specimen);
});
