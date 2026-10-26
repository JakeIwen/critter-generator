import test from 'node:test';
import assert from 'node:assert/strict';
import { EVALUATION_FINDINGS, EVALUATION_OUTCOMES, summarizeEvaluation } from '../shared/evaluation-metrics.mjs';

test('an unrun evaluation has no completion, timing, adherence or subjective quality estimate', () => {
  const summary = summarizeEvaluation([]);
  assert.equal(summary.runs, 0);
  assert.equal(summary.completionRate, null);
  assert.deepEqual(summary.endToEndMs, { sampleCount: 0, median: null, p90: null });
  assert.equal(summary.constraints.satisfiedFractionAmongDecided, null);
  assert.equal(summary.subjectiveAppearance.sampleCount, 0);
  assert.equal(summary.subjectiveAppearance.median, null);
});

test('completion and timing include failed, partial, cancelled and interrupted runs', () => {
  const records = Object.values(EVALUATION_OUTCOMES).map((status, index) => ({
    runId: `run-${index}`, status, durationMs: (index + 1) * 100,
  }));
  const summary = summarizeEvaluation(records);
  assert.equal(summary.runs, 5);
  assert.equal(summary.completed, 1);
  assert.equal(summary.completionRate, .2);
  assert.deepEqual(summary.endToEndMs, { sampleCount: 5, median: 300, p90: 500 });
  assert.deepEqual(Object.values(summary.outcomes), [1, 1, 1, 1, 1]);
});

test('stage timing sums retry durations within each run and exposes all Codex attempts', () => {
  const summary = summarizeEvaluation([
    { runId: 'recovered', status: 'completed', stages: [
      { stage: 'design', status: 'failed', attempt: 1, durationMs: 40 },
      { stage: 'design', status: 'completed', attempt: 2, durationMs: 60 },
      { stage: 'image', status: 'completed', attempt: 1, durationMs: 200 },
      { stage: 'portrait-publication', status: 'completed', durationMs: 5 },
    ] },
    { runId: 'failed', status: 'failed', stages: [{ stage: 'design', status: 'failed', attempt: 1, durationMs: 200 }] },
  ]);
  assert.deepEqual(summary.stagesMs.design, { sampleCount: 2, median: 150, p90: 200 });
  assert.deepEqual(summary.stagesMs.image, { sampleCount: 1, median: 200, p90: 200 });
  assert.equal(summary.attempts.codexCalls, 4);
  assert.equal(summary.attempts.retries, 1);
  assert.deepEqual(summary.attempts.byStage, { design: 3, image: 1 });
  assert.equal(summary.endToEndMs.sampleCount, 0, 'Missing total duration is not fabricated from stage sums');
});

test('manual constraint findings stay separate from subjective appearance scores and unreviewed criteria', () => {
  const records = [{ runId: 'cat', caseId: 'cat', status: 'completed', durationMs: 10 }];
  const criteria = [...Object.values(EVALUATION_FINDINGS), null].map((status, index) => ({ id: `criterion-${index}`, status }));
  const summary = summarizeEvaluation(records, [{ runId: 'cat', caseId: 'cat', criteria, appearanceScore: 4.5 }]);
  assert.deepEqual(summary.constraints.statuses, { satisfied: 1, uncertain: 1, conflict: 1, unscorable: 1 });
  assert.equal(summary.constraints.unscored, 1);
  assert.equal(summary.constraints.decided, 2);
  assert.equal(summary.constraints.satisfiedFractionAmongDecided, .5);
  assert.equal(summary.subjectiveAppearance.median, 4.5);
  const unreviewed = summarizeEvaluation(records, [{ runId: 'cat', criteria: [{ id: 'count', status: null }] }]);
  assert.equal(unreviewed.constraints.unscored, 1);
  assert.equal(unreviewed.constraints.satisfiedFractionAmongDecided, null);
  assert.equal(unreviewed.subjectiveAppearance.sampleCount, 0);
});

test('score validation catches unmatched run IDs, duplicate criteria, invalid statuses and invalid appearance scales', () => {
  const records = [{ runId: 'cat', caseId: 'cat', status: 'completed' }];
  assert.throws(() => summarizeEvaluation(records, [{ runId: 'dog' }]), /Unknown or duplicate/);
  assert.throws(() => summarizeEvaluation([...records, ...records]), /unique/);
  assert.throws(() => summarizeEvaluation(records, [{ runId: 'cat', caseId: 'dog' }]), /does not match/);
  assert.throws(() => summarizeEvaluation(records, [{ runId: 'cat', criteria: [{ id: 'legs', status: 'good' }] }]));
  assert.throws(() => summarizeEvaluation(records, [{ runId: 'cat', criteria: [{ id: 'legs', status: null }, { id: 'legs', status: null }] }]), /Duplicate/);
  assert.throws(() => summarizeEvaluation(records, [{ runId: 'cat', appearanceScore: 6 }]));
});

test('timestamp durations remain useful for failed jobs without explicit durationMs', () => {
  const summary = summarizeEvaluation([
    { runId: 'failed', status: 'failed', createdAt: '2026-01-01T00:00:00Z', finishedAt: '2026-01-01T00:00:02Z' },
    { runId: 'unknown-time', status: 'partial', createdAt: 'not-a-date', finishedAt: '2026-01-01T00:00:02Z' },
  ]);
  assert.deepEqual(summary.endToEndMs, { sampleCount: 1, median: 2000, p90: 2000 });
  assert.equal(summary.completionRate, 0);
});
