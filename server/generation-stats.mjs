import { JOB_KINDS } from '../shared/generation-timing.mjs';

const FAILED_STATUSES = new Set(['failed', 'partial', 'cancelled', 'interrupted']);
function kindOf(job) {
  return job.kind ?? (typeof job.designThreadId === 'string' && job.designThreadId.length ? JOB_KINDS.GENERATION : JOB_KINDS.PORTRAIT);
}
function elapsed(job) {
  if (typeof job.createdAt !== 'string' || typeof job.finishedAt !== 'string') return null;
  const duration = Date.parse(job.finishedAt) - Date.parse(job.createdAt);
  return Number.isFinite(duration) && duration > 0 ? duration : null;
}
function modelOf(job) {
  return { provider: job.generation?.provider ?? null, model: job.generation?.model ?? null, effort: job.generation?.effort ?? null };
}
const average = values => values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) : null;
function durationSummary(kind, values) {
  const sorted = [...values].sort((a, b) => a - b), middle = Math.floor(sorted.length / 2);
  return { kind, count: sorted.length, averageMs: average(sorted),
    medianMs: sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2,
    minMs: sorted[0], maxMs: sorted.at(-1) };
}

export function generationStats(jobs, timing) {
  const totals = new Map(), durations = new Map(), models = new Map();
  for (const job of jobs) {
    const kind = kindOf(job), duration = elapsed(job), model = modelOf(job);
    const totalKey = JSON.stringify([kind, job.status]);
    const total = totals.get(totalKey) ?? { kind, status: job.status, count: 0 };
    total.count++; totals.set(totalKey, total);
    const key = JSON.stringify([model.provider, model.model, model.effort, kind]);
    const group = models.get(key) ?? { ...model, kind, count: 0, failures: 0, durations: [] };
    group.count++; if (FAILED_STATUSES.has(job.status)) group.failures++;
    if (job.status === 'completed' && duration !== null) {
      if (!durations.has(kind)) durations.set(kind, []);
      durations.get(kind).push(duration); group.durations.push(duration);
    }
    models.set(key, group);
  }
  const recent = [...jobs].sort((a, b) => (Date.parse(b.createdAt) || 0) - (Date.parse(a.createdAt) || 0) || String(a.id).localeCompare(String(b.id)))
    .slice(0, 10).map(job => ({ id: job.id, kind: kindOf(job), status: job.status,
      createdAt: job.createdAt ?? null, finishedAt: job.finishedAt ?? null, durationMs: elapsed(job),
      ...modelOf(job), specimenId: job.specimenId ?? null }));
  return { timing, totals: [...totals.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, value]) => value),
    durations: [...durations.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([kind, values]) => durationSummary(kind, values)), recent,
    byModel: [...models.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, { durations: values, ...group }]) => ({ ...group, averageMs: average(values) })) };
}
