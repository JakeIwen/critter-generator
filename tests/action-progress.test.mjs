import test from 'node:test';
import assert from 'node:assert/strict';
import { actionProgressMarkup, createActionProgress } from '../src/action-progress.js';

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
