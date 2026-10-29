import { DEFAULT_APP_SETTINGS } from '../shared/app-settings.mjs';

// Progress repaint cadence is presentation only; each job keeps its frozen duration estimate.
const TIMING_KEY = 'critter-job-timing';
const validEstimate = value => Number.isFinite(value) && value > 0 ? value : null;

function estimateLabel(milliseconds) {
  const seconds = Math.max(1, Math.round(milliseconds / 1000));
  const minutes = Math.floor(seconds / 60);
  const duration = minutes ? `${minutes}m ${seconds % 60}s` : `${seconds}s`;
  return `Estimated generation time: ${duration}`;
}

function savedTiming(storage, jobId) {
  try {
    const saved = JSON.parse(storage.getItem(TIMING_KEY));
    return saved?.jobId === jobId && Number.isFinite(saved.startedAt) ? saved : null;
  } catch { return null; }
}

export function createGenerationProgress(byId, {
  now = Date.now, schedule = setInterval, cancel = clearInterval, storage = sessionStorage,
} = {}) {
  let timer = null;
  let startedAt = null;
  let activeJob = null;
  let nextEstimateMs = DEFAULT_APP_SETTINGS.initialEstimateSeconds * 1000;
  let jobEstimateMs = DEFAULT_APP_SETTINGS.initialEstimateSeconds * 1000;
  function render() {
    const elapsed = Math.max(0, now() - startedAt);
    const percent = Math.min(95, elapsed / jobEstimateMs * 95);
    byId('status-progress').value = percent;
    byId('status-progress').setAttribute('aria-valuetext', `Estimated progress: ${Math.round(percent)}%`);
    byId('status-estimate').textContent = estimateLabel(jobEstimateMs);
  }
  function setTiming(summary, config = DEFAULT_APP_SETTINGS) {
    if (summary) nextEstimateMs = validEstimate(summary.estimatedDurationMs) ?? validEstimate(summary.averageDurationMs) ?? DEFAULT_APP_SETTINGS.initialEstimateSeconds * 1000;
    const count = Math.min(config.timingWindow ?? DEFAULT_APP_SETTINGS.timingWindow, Math.max(0, Math.trunc(summary?.sampleCount || 0)));
    const note = byId('generation-estimate');
    note.textContent = estimateLabel(nextEstimateMs);
    note.title = count ? `Based on the last ${count} completed generation${count === 1 ? '' : 's'}.` : 'Initial estimate until a completed generation is recorded.';
  }
  setTiming();
  return {
    setTiming,
    start(jobId, createdAt, estimatedDurationMs) {
      const serverStart = Date.parse(createdAt);
      if (jobId !== activeJob) {
        const saved = savedTiming(storage, jobId);
        startedAt = saved?.startedAt ?? now();
        jobEstimateMs = validEstimate(saved?.estimatedDurationMs) ?? nextEstimateMs;
      }
      if (Number.isFinite(serverStart)) startedAt = serverStart;
      jobEstimateMs = validEstimate(estimatedDurationMs) ?? jobEstimateMs;
      activeJob = jobId;
      storage.setItem(TIMING_KEY, JSON.stringify({ jobId, startedAt, estimatedDurationMs: jobEstimateMs }));
      render();
      if (timer === null) timer = schedule(render, 1000);
    },
    stop(clearSaved = false) {
      if (timer !== null) cancel(timer);
      timer = null;
      if (clearSaved) {
        storage.removeItem(TIMING_KEY);
        activeJob = null;
        startedAt = null;
      }
    },
  };
}
