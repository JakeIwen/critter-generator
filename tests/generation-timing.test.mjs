import { DEFAULT_APP_SETTINGS } from '../shared/app-settings.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import os from 'node:os';
import path from 'node:path';
import { Store } from '../server/store.mjs';
import { JOB_KINDS, completedGenerationDuration,
  generationTimingFromJobs } from '../shared/generation-timing.mjs';

const epoch = Date.parse('2026-10-01T00:00:00Z');
function completed(index, durationMs = (index + 1) * 1000, extra = {}) {
  const started = epoch + index * 1_000_000;
  return { id: `job-${index}`, kind: JOB_KINDS.GENERATION, status: 'completed',
    createdAt: new Date(started).toISOString(), finishedAt: new Date(started + durationMs).toISOString(), ...extra };
}

test('rolling timing uses the most recent five completed full generations, ordered by completion', () => {
  const jobs = Array.from({ length: 12 }, (_, index) => completed(index));
  const timing = generationTimingFromJobs([...jobs].reverse());
  assert.equal(timing.sampleCount, DEFAULT_APP_SETTINGS.timingWindow);
  assert.equal(timing.averageDurationMs, 10_000, 'Oldest seven durations are outside the five-generation window');
  assert.equal(timing.estimatedDurationMs, timing.averageDurationMs);
  assert.equal(timing.updatedAt, jobs[11].finishedAt);
  assert.deepEqual(generationTimingFromJobs(jobs), timing, 'Input ordering cannot change the estimate');
  const longRunning = { ...completed(0), finishedAt: new Date(epoch + 20_000_000).toISOString() };
  const withOutlier = generationTimingFromJobs([...jobs, longRunning]);
  assert.equal(withOutlier.updatedAt, jobs[11].finishedAt,
    'An outlier does not become the newest included sample');
  assert.equal(withOutlier.excludedOutliers, 1);
});

test('seven-minute samples are excluded before selecting the rolling window', () => {
  const older = Array.from({ length: 5 }, (_, index) => completed(index, (index + 1) * 1000));
  const outlier = completed(5, 7 * 60_000);
  const timing = generationTimingFromJobs([...older, outlier]);
  assert.equal(timing.sampleCount, 5);
  assert.equal(timing.averageDurationMs, 3_000);
  assert.equal(timing.excludedOutliers, 1);
  assert.equal(timing.updatedAt, older[4].finishedAt);
});

test('a sample of exactly six minutes is included', () => {
  const older = Array.from({ length: 5 }, (_, index) => completed(index, (index + 1) * 1000));
  const threshold = completed(5, DEFAULT_APP_SETTINGS.timingOutlierMinutes * 60_000);
  const timing = generationTimingFromJobs([...older, threshold]);
  assert.equal(timing.sampleCount, 5);
  assert.equal(timing.averageDurationMs, 74_800);
  assert.equal(timing.excludedOutliers, 0);
  assert.equal(timing.updatedAt, threshold.finishedAt);
});

test('only successful full generations contribute; legacy design runs are recognized', () => {
  const success = completed(0, 60_000);
  const legacy = completed(1, 80_000, { kind: undefined, designThreadId: 'legacy-design' });
  const rejected = [
    ...['queued', 'running', 'failed', 'cancelled', 'interrupted', 'partial'].map(status => completed(2, 600_000, { status })),
    completed(3, 20_000, { kind: JOB_KINDS.PORTRAIT, designThreadId: 'copied-legacy-thread' }),
    completed(4, 30_000, { kind: undefined, imageThreadId: 'legacy-retry' }),
    completed(5, 40_000, { kind: 'unknown', designThreadId: 'not-a-full-generation' }),
    completed(6, 50_000, { kind: undefined, designThreadId: '' }),
  ];
  for (const job of rejected) assert.equal(completedGenerationDuration(job), null);
  assert.equal(completedGenerationDuration(legacy), 80_000);
  assert.equal(generationTimingFromJobs([success, legacy, ...rejected]).averageDurationMs, 70_000);
  assert.equal(generationTimingFromJobs([success, legacy, ...rejected]).sampleCount, 2);
});

test('invalid and nonpositive timestamp intervals are excluded; stored duration is not trusted', () => {
  const valid = completed(0, 60_001, { durationMs: 1 });
  const invalid = [
    { createdAt: 'not-a-date' }, { finishedAt: 'not-a-date' }, { createdAt: null },
    { finishedAt: undefined }, { createdAt: 0 }, { finishedAt: valid.createdAt },
    { finishedAt: new Date(epoch - 1).toISOString() },
  ].map(change => ({ ...valid, ...change }));
  for (const job of invalid) assert.equal(completedGenerationDuration(job), null);
  assert.equal(completedGenerationDuration(valid), 60_001);
  assert.equal(generationTimingFromJobs([valid, completed(1, 60_000)]).averageDurationMs, 60_001);
  assert.deepEqual(generationTimingFromJobs(invalid), {
    sampleCount: 0, excludedOutliers: 0, averageDurationMs: null,
    estimatedDurationMs: DEFAULT_APP_SETTINGS.initialEstimateSeconds * 1000, updatedAt: null,
  });
});

test('SQLite stores the rolling average, updates idempotently and restores it across restart', t => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'critter-timing-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  let store = new Store(root);
  assert.equal(store.generationTiming().estimatedDurationMs, DEFAULT_APP_SETTINGS.initialEstimateSeconds * 1000);
  const jobs = Array.from({ length: 12 }, (_, index) => completed(index));
  for (const job of jobs) store.save('jobs', job.id, job);
  const expected = store.generationTiming();
  assert.equal(expected.averageDurationMs, 10_000);
  const reader = new DatabaseSync(path.join(root, 'critters.sqlite'), { readOnly: true });
  try {
    const stored = reader.prepare("SELECT value FROM app_metadata WHERE key='generation-timing'").get();
    assert.deepEqual(JSON.parse(stored.value), expected, 'The aggregate itself is durable, not only computed on reads');
  } finally { reader.close(); }
  store.save('jobs', jobs[11].id, jobs[11]);
  assert.deepEqual(store.generationTiming(), expected, 'Saving a completion twice never duplicates a sample');
  store.save('jobs', 'retry', completed(15, 1_000, { id: 'retry', kind: JOB_KINDS.PORTRAIT }));
  store.save('jobs', 'failure', completed(16, 900_000, { id: 'failure', status: 'failed' }));
  assert.deepEqual(store.generationTiming(), expected);
  store.db.close();
  store = new Store(root);
  try {
    assert.deepEqual(store.generationTiming(), expected);
    store.save('jobs', jobs[11].id, { ...jobs[11], status: 'failed' });
    assert.equal(store.generationTiming().averageDurationMs, 9_000, 'Corrected historical status removes that sample');
    assert.equal(store.generationTiming().sampleCount, DEFAULT_APP_SETTINGS.timingWindow);
  } finally { store.db.close(); }
});

test('startup backfills successful historical design jobs without rewriting their records', t => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'critter-timing-legacy-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const jobs = [completed(0, 70_000, { kind: undefined, designThreadId: 'design-a' }),
    completed(1, 90_000, { kind: undefined, designThreadId: 'design-b' }),
    completed(2, 30_000, { kind: undefined, imageThreadId: 'portrait-retry' })];
  for (const job of jobs) {
    const folder = path.join(root, 'jobs', job.id);
    mkdirSync(folder, { recursive: true });
    writeFileSync(path.join(folder, 'record.json'), JSON.stringify(job));
  }
  const store = new Store(root);
  try {
    assert.equal(store.generationTiming().sampleCount, 2);
    assert.equal(store.generationTiming().averageDurationMs, 80_000);
    assert.equal(store.get('jobs', jobs[0].id).durationMs, undefined, 'Backfill leaves historical job payloads unchanged');
  } finally { store.db.close(); }
});
