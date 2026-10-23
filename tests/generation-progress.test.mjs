import test from 'node:test';
import assert from 'node:assert/strict';
import { createGenerationProgress } from '../src/generation-progress.js';

function clockView(initialTime = 1_000_000, storage = new Map()) {
  let currentTime = initialTime;
  let tick;
  let scheduled = 0;
  let cancelled = 0;
  const nodes = {
    'status-progress': { value: 0, setAttribute(name, value) { this[name] = value; } },
    'status-estimate': { textContent: '' },
  };
  const progress = createGenerationProgress(id => nodes[id], {
    now: () => currentTime,
    schedule(callback, milliseconds) { assert.equal(milliseconds, 1000); tick = callback; scheduled++; return scheduled; },
    cancel() { tick = null; cancelled++; },
    storage: {
      getItem: key => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, value),
      removeItem: key => storage.delete(key),
    },
  });
  return {
    progress, nodes, storage,
    advance(seconds) { currentTime += seconds * 1000; tick?.(); },
    get scheduled() { return scheduled; },
    get cancelled() { return cancelled; },
  };
}

test('generation estimate advances each second and stays incomplete after 130 seconds', () => {
  const view = clockView();
  view.progress.start('job-one');
  assert.equal(view.nodes['status-estimate'].textContent, '0s elapsed · About 2m 10s remaining');
  view.advance(65);
  assert.equal(view.nodes['status-progress'].value, 47.5);
  assert.equal(view.nodes['status-estimate'].textContent, '1m 5s elapsed · About 1m 5s remaining');
  view.advance(65);
  assert.equal(view.nodes['status-progress'].value, 95);
  assert.match(view.nodes['status-estimate'].textContent, /Taking longer than estimated; still working/);
  view.advance(600);
  assert.equal(view.nodes['status-progress'].value, 95);
  assert.equal(view.nodes['status-progress']['aria-valuetext'], view.nodes['status-estimate'].textContent);
});

test('resuming uses server creation time without creating extra intervals', () => {
  const view = clockView();
  view.progress.start('portrait-retry', new Date(940_000).toISOString());
  assert.match(view.nodes['status-estimate'].textContent, /^1m 0s elapsed/);
  view.advance(10);
  view.progress.start('portrait-retry', new Date(940_000).toISOString());
  assert.match(view.nodes['status-estimate'].textContent, /^1m 10s elapsed/);
  assert.equal(view.scheduled, 1);
});

test('reload restores fallback timing for the same job and resets it for a new job', () => {
  const first = clockView();
  first.progress.start('first-job');
  first.progress.stop();
  const reloaded = clockView(1_030_000, first.storage);
  reloaded.progress.start('first-job');
  assert.match(reloaded.nodes['status-estimate'].textContent, /^30s elapsed/);
  reloaded.progress.start('second-job');
  assert.match(reloaded.nodes['status-estimate'].textContent, /^0s elapsed/);
});

test('stopping halts updates and completion clears saved timing', () => {
  const view = clockView();
  view.progress.start('job');
  view.advance(15);
  const lastEstimate = view.nodes['status-estimate'].textContent;
  view.progress.stop();
  view.advance(30);
  assert.equal(view.nodes['status-estimate'].textContent, lastEstimate);
  assert.equal(view.cancelled, 1);
  assert.equal(view.storage.size, 1);
  view.progress.start('job');
  assert.match(view.nodes['status-estimate'].textContent, /^45s elapsed/);
  view.progress.stop(true);
  assert.equal(view.storage.size, 0);
  assert.equal(view.cancelled, 2);
});
