import { z } from 'zod';
import { REVIEW_FINDINGS } from './generation-review.mjs';

export const EVALUATION_FINDINGS = Object.freeze({ ...REVIEW_FINDINGS, UNSCORABLE: 'unscorable' });
export const EVALUATION_OUTCOMES = Object.freeze({ COMPLETED: 'completed', FAILED: 'failed', PARTIAL: 'partial',
  CANCELLED: 'cancelled', INTERRUPTED: 'interrupted' });
const duration = z.number().finite().nonnegative();
export const EvaluationRecord = z.object({
  runId: z.string().min(1), caseId: z.string().optional(), status: z.enum(Object.values(EVALUATION_OUTCOMES)),
  durationMs: duration.optional(), createdAt: z.string().optional(), finishedAt: z.string().optional(),
  stages: z.array(z.object({ stage: z.string().min(1), durationMs: duration,
    attempt: z.number().int().positive().optional(), status: z.string().optional() })).default([]),
}).passthrough();
export const EvaluationScore = z.object({
  runId: z.string().min(1), caseId: z.string().optional(),
  criteria: z.array(z.object({ id: z.string().min(1), label: z.string().optional(),
    status: z.enum(Object.values(EVALUATION_FINDINGS)).nullable(), notes: z.string().default('') }).strict()).default([]),
  appearanceScore: z.number().min(1).max(5).nullable().default(null), appearanceNotes: z.string().default(''),
}).strict();

function distribution(values) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b), count = sorted.length;
  return { sampleCount: count, median: count ? (sorted[Math.floor((count - 1) / 2)] + sorted[Math.ceil((count - 1) / 2)]) / 2 : null,
    p90: count ? sorted[Math.ceil(count * .9) - 1] : null };
}

function elapsed(record) {
  if (record.durationMs !== undefined) return record.durationMs;
  const value = Date.parse(record.finishedAt) - Date.parse(record.createdAt);
  return Number.isFinite(value) && value >= 0 ? value : null;
}

function timingAndAttempts(records) {
  const stages = {}, byStage = {};
  let retries = 0;
  for (const record of records) {
    const totals = {}, calls = {};
    for (const step of record.stages) {
      totals[step.stage] = (totals[step.stage] ?? 0) + step.durationMs;
      if (step.attempt !== undefined) calls[step.stage] = (calls[step.stage] ?? 0) + 1;
    }
    for (const [stage, value] of Object.entries(totals)) (stages[stage] ??= []).push(value);
    for (const [stage, count] of Object.entries(calls)) {
      byStage[stage] = (byStage[stage] ?? 0) + count;
      retries += Math.max(0, count - 1);
    }
  }
  return { stagesMs: Object.fromEntries(Object.entries(stages).map(([stage, values]) => [stage, distribution(values)])),
    attempts: { codexCalls: Object.values(byStage).reduce((sum, count) => sum + count, 0), retries, byStage } };
}

function manualScores(records, scores) {
  const known = new Map(records.map(record => [record.runId, record])), seen = new Set();
  const statuses = Object.fromEntries(Object.values(EVALUATION_FINDINGS).map(status => [status, 0]));
  let unscored = 0;
  for (const score of scores) {
    if (!known.has(score.runId) || seen.has(score.runId)) throw new Error(`Unknown or duplicate score run: ${score.runId}`);
    if (score.caseId && known.get(score.runId).caseId !== score.caseId) throw new Error(`Score case does not match run: ${score.runId}`);
    seen.add(score.runId);
    const criteria = new Set();
    for (const criterion of score.criteria) {
      if (criteria.has(criterion.id)) throw new Error(`Duplicate score criterion: ${score.runId}/${criterion.id}`);
      criteria.add(criterion.id);
      if (criterion.status === null) unscored++; else statuses[criterion.status]++;
    }
  }
  const decided = statuses[REVIEW_FINDINGS.SATISFIED] + statuses[REVIEW_FINDINGS.CONFLICT];
  return { constraints: { statuses, unscored, decided,
    satisfiedFractionAmongDecided: decided ? statuses[REVIEW_FINDINGS.SATISFIED] / decided : null },
  subjectiveAppearance: { scale: '1–5, manually assigned', ...distribution(scores.map(score => score.appearanceScore).filter(value => value !== null)) } };
}

export function summarizeEvaluation(input, inputScores = []) {
  const records = z.array(EvaluationRecord).parse(input), scores = z.array(EvaluationScore).parse(inputScores);
  if (new Set(records.map(record => record.runId)).size !== records.length) throw new Error('Evaluation run IDs must be unique.');
  const outcomes = Object.fromEntries(Object.values(EVALUATION_OUTCOMES).map(status => [status, 0]));
  for (const record of records) outcomes[record.status]++;
  return { runs: records.length, completed: outcomes[EVALUATION_OUTCOMES.COMPLETED], outcomes,
    completionRate: records.length ? outcomes[EVALUATION_OUTCOMES.COMPLETED] / records.length : null,
    endToEndMs: distribution(records.map(elapsed).filter(value => value !== null)),
    ...timingAndAttempts(records), ...manualScores(records, scores) };
}
