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
    'generation-estimate': { textContent: '', title: '' },
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

test('fallback estimate drives progress without displaying elapsed or remaining time', () => {
  const view = clockView();
  view.progress.start('job-one');
  const estimate = 'Estimated generation time: 2m 10s';
  assert.equal(view.nodes['generation-estimate'].textContent, estimate);
  assert.equal(view.nodes['status-estimate'].textContent, estimate);
  view.advance(65);
  assert.equal(view.nodes['status-progress'].value, 47.5);
  assert.equal(view.nodes['status-estimate'].textContent, estimate);
  view.advance(65);
  assert.equal(view.nodes['status-progress'].value, 95);
  view.advance(600);
  assert.equal(view.nodes['status-progress'].value, 95);
  assert.equal(view.nodes['status-estimate'].textContent, estimate);
  assert.doesNotMatch(view.nodes['status-estimate'].textContent, /elapsed|remaining/i);
  assert.equal(view.nodes['status-progress']['aria-valuetext'], 'Estimated progress: 95%');
});

test('saved average sets the next estimate while the active job keeps its original estimate', () => {
  const view = clockView();
  view.progress.setTiming({ estimatedDurationMs: 240_000, averageDurationMs: 240_000, sampleCount: 3 });
  assert.equal(view.nodes['generation-estimate'].textContent, 'Estimated generation time: 4m 0s');
  assert.match(view.nodes['generation-estimate'].title, /last 3 completed generations/);
  view.progress.start('long-job');
  view.advance(120);
  assert.equal(view.nodes['status-progress'].value, 47.5);
  view.progress.setTiming({ estimatedDurationMs: 60_000, averageDurationMs: 60_000, sampleCount: 4 });
  view.progress.start('long-job');
  assert.equal(view.nodes['status-progress'].value, 47.5);
  assert.equal(view.nodes['status-estimate'].textContent, 'Estimated generation time: 4m 0s');
  assert.equal(view.nodes['generation-estimate'].textContent, 'Estimated generation time: 1m 0s');
  view.progress.stop(true);
  view.progress.start('short-job');
  view.advance(30);
  assert.equal(view.nodes['status-progress'].value, 47.5);
});

test('server job estimate overrides a provisional estimate and survives repeated polls', () => {
  const view = clockView();
  view.progress.start('job');
  view.advance(45);
  view.progress.start('job', new Date(1_000_000).toISOString(), 90_000);
  assert.equal(view.nodes['status-progress'].value, 47.5);
  assert.equal(view.nodes['status-estimate'].textContent, 'Estimated generation time: 1m 30s');
  view.progress.setTiming({ estimatedDurationMs: 30_000, sampleCount: 10 });
  view.progress.start('job', new Date(1_000_000).toISOString());
  assert.equal(view.nodes['status-progress'].value, 47.5);
  assert.equal(view.scheduled, 1);
});

test('resuming uses server creation time and estimate without creating extra intervals', () => {
  const view = clockView();
  view.progress.start('portrait-retry', new Date(940_000).toISOString(), 120_000);
  assert.equal(view.nodes['status-progress'].value, 47.5);
  view.advance(10);
  view.progress.start('portrait-retry', new Date(940_000).toISOString(), 120_000);
  assert.equal(view.nodes['status-progress'].value, 70 / 120 * 95);
  assert.equal(view.nodes['status-estimate'].textContent, 'Estimated generation time: 2m 0s');
  assert.equal(view.scheduled, 1);
});

test('reload restores the original start and estimate even when the saved average has changed', () => {
  const first = clockView();
  first.progress.setTiming({ estimatedDurationMs: 200_000, sampleCount: 2 });
  first.progress.start('first-job');
  first.progress.stop();
  const reloaded = clockView(1_030_000, first.storage);
  reloaded.progress.setTiming({ estimatedDurationMs: 60_000, sampleCount: 3 });
  reloaded.progress.start('first-job');
  assert.equal(reloaded.nodes['status-progress'].value, 30 / 200 * 95);
  assert.equal(reloaded.nodes['status-estimate'].textContent, 'Estimated generation time: 3m 20s');
  reloaded.progress.start('second-job');
  assert.equal(reloaded.nodes['status-progress'].value, 0);
  assert.equal(reloaded.nodes['status-estimate'].textContent, 'Estimated generation time: 1m 0s');
});

test('stopping halts updates and completion clears saved timing', () => {
  const view = clockView();
  view.progress.start('job');
  view.advance(15);
  const lastProgress = view.nodes['status-progress'].value;
  view.progress.stop();
  view.advance(30);
  assert.equal(view.nodes['status-progress'].value, lastProgress);
  assert.equal(view.cancelled, 1);
  assert.equal(view.storage.size, 1);
  view.progress.start('job');
  assert.equal(view.nodes['status-progress'].value, 45 / 130 * 95);
  view.progress.stop(true);
  assert.equal(view.storage.size, 0);
  assert.equal(view.cancelled, 2);
});

test('invalid estimates and older timing records safely use a valid estimate', () => {
  const storage = new Map([['critter-job-timing', JSON.stringify({ jobId: 'older-job', startedAt: 970_000 })]]);
  const view = clockView(1_000_000, storage);
  view.progress.setTiming({ estimatedDurationMs: 0, averageDurationMs: 120_000, sampleCount: 1 });
  assert.match(view.nodes['generation-estimate'].title, /last 1 completed generation\./);
  view.progress.start('older-job', 'invalid timestamp', Number.NaN);
  assert.equal(view.nodes['status-progress'].value, 23.75);
  assert.equal(view.nodes['status-estimate'].textContent, 'Estimated generation time: 2m 0s');
  view.progress.stop(true);
  view.progress.setTiming({ estimatedDurationMs: -1, sampleCount: 0 });
  view.progress.start('fallback-job', undefined, Infinity);
  assert.equal(view.nodes['status-estimate'].textContent, 'Estimated generation time: 2m 10s');
});
