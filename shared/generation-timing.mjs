export const DEFAULT_ESTIMATE_MS = 130_000;
export const TIMING_WINDOW = 5;
export const OUTLIER_MS = 6 * 60_000;
export const JOB_KINDS = Object.freeze({ GENERATION: 'generation', PORTRAIT: 'portrait', CAD: 'cad' });

export function completedGenerationDuration(job) {
  const fullGeneration = job.kind === JOB_KINDS.GENERATION ||
    (job.kind === undefined && typeof job.designThreadId === 'string' && job.designThreadId.length > 0);
  if (job.status !== 'completed' || !fullGeneration) return null;
  if (typeof job.createdAt !== 'string' || typeof job.finishedAt !== 'string') return null;
  const started = Date.parse(job.createdAt), finished = Date.parse(job.finishedAt);
  const duration = finished - started;
  return Number.isFinite(duration) && duration > 0 ? duration : null;
}

export function generationTimingFromJobs(jobs) {
  const successfulSamples = jobs.map(job => ({ job, duration: completedGenerationDuration(job) }))
    .filter(sample => sample.duration !== null);
  const excludedOutliers = successfulSamples.filter(sample => sample.duration > OUTLIER_MS).length;
  const samples = successfulSamples
    .filter(sample => sample.duration <= OUTLIER_MS)
    .sort((a, b) => Date.parse(b.job.finishedAt) - Date.parse(a.job.finishedAt) ||
      Date.parse(b.job.createdAt) - Date.parse(a.job.createdAt) || String(a.job.id).localeCompare(String(b.job.id)))
    .slice(0, TIMING_WINDOW);
  const averageDurationMs = samples.length
    ? Math.round(samples.reduce((sum, sample) => sum + sample.duration, 0) / samples.length) : null;
  return {
    sampleCount: samples.length,
    excludedOutliers,
    averageDurationMs,
    estimatedDurationMs: averageDurationMs ?? DEFAULT_ESTIMATE_MS,
    updatedAt: samples.length ? new Date(samples[0].job.finishedAt).toISOString() : null,
  };
}
