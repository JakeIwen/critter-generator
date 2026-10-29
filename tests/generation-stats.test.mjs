import test from 'node:test';
import assert from 'node:assert/strict';
import { generationStats } from '../server/generation-stats.mjs';
import { DEFAULT_GENERATION_MODEL } from '../shared/generation-models.mjs';

const timing = { sampleCount: 0, estimatedDurationMs: 130_000 };
const job = (id, duration, values = {}) => ({ id, kind: 'generation', status: 'completed',
  createdAt: '2026-01-01T00:00:00Z', finishedAt: new Date(Date.parse('2026-01-01T00:00:00Z') + duration).toISOString(),
  generation: DEFAULT_GENERATION_MODEL, ...values });

test('empty stats preserve timing and contain no invented model history', () => {
  assert.deepEqual(generationStats([], timing), { timing, totals: [], durations: [], recent: [], byModel: [] });
});

test('stats use actual completed elapsed times, keep failures and separate kinds/models/efforts', () => {
  const jobs = [job('a', 1000), job('b', 3000), job('c', 5000), job('bad', 9000, { status: 'failed' }),
    job('cancel', 200, { status: 'cancelled' }), job('partial', 200, { status: 'partial' }),
    job('interrupted', 200, { status: 'interrupted' }), job('running', 200, { status: 'running', finishedAt: null }),
    job('portrait', 100, { kind: 'portrait' }), job('cad', 100, { kind: 'cad' }),
    job('effort', 200, { generation: { ...DEFAULT_GENERATION_MODEL, effort: 'low' } }),
    job('claude', 400, { generation: { provider: 'claude', model: 'fable', effort: 'high' } })];
  const before = structuredClone(jobs), stats = generationStats(jobs, timing);
  assert.deepEqual(jobs, before);
  assert.deepEqual(stats.durations.find(item => item.kind === 'generation'), {
    kind: 'generation', count: 5, averageMs: 1920, medianMs: 1000, minMs: 200, maxMs: 5000,
  });
  const group = stats.byModel.find(item => item.kind === 'generation' && item.effort === 'max');
  assert.deepEqual(group, { ...DEFAULT_GENERATION_MODEL, kind: 'generation', count: 8, failures: 4, averageMs: 3000 });
  assert.equal(stats.recent.length, 10);
  assert.equal(stats.totals.find(item => item.status === 'failed').count, 1);
});

test('legacy classification matches generation timing and invalid durations never enter averages', () => {
  const jobs = [job('legacy-generation', 1000, { kind: undefined, generation: undefined, designThreadId: 'thread' }),
    job('legacy-portrait', 2000, { kind: undefined, generation: undefined, designThreadId: '' }),
    job('invalid', 0), job('negative', -20), job('missing', 200, { finishedAt: null }),
    job('bad-date', 100, { createdAt: 'not-a-date' })];
  const stats = generationStats(jobs, timing);
  assert.deepEqual(stats.durations, [
    { kind: 'generation', count: 1, averageMs: 1000, medianMs: 1000, minMs: 1000, maxMs: 1000 },
    { kind: 'portrait', count: 1, averageMs: 2000, medianMs: 2000, minMs: 2000, maxMs: 2000 },
  ]);
  const legacy = stats.recent.find(item => item.id === 'legacy-generation');
  assert.equal(legacy.kind, 'generation'); assert.equal(legacy.provider, null); assert.equal(legacy.model, null);
  assert.equal(stats.byModel.find(item => item.provider === 'codex').averageMs, null);
});

test('recent jobs are newest first, capped at ten, with an even median for completed jobs', () => {
  const jobs = Array.from({ length: 12 }, (_, index) => job(String(index), 1000 + index * 1000,
    { createdAt: new Date(Date.UTC(2025, 0, 1, index)).toISOString(), finishedAt: new Date(Date.UTC(2025, 0, 1, index) + 1000 + index * 1000).toISOString() }));
  const stats = generationStats(jobs, timing);
  assert.deepEqual(stats.recent.map(item => item.id), ['11', '10', '9', '8', '7', '6', '5', '4', '3', '2']);
  assert.equal(stats.durations[0].medianMs, 6500);
});
