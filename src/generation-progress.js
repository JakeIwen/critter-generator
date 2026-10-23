const ESTIMATED_SECONDS = 130;
const TIMING_KEY = 'critter-job-timing';

function duration(seconds) {
  const minutes = Math.floor(seconds / 60);
  return minutes ? `${minutes}m ${seconds % 60}s` : `${seconds}s`;
}

export function createGenerationProgress(byId, {
  now = Date.now, schedule = setInterval, cancel = clearInterval, storage = sessionStorage,
} = {}) {
  let timer = null;
  let startedAt = null;
  let activeJob = null;
  function render() {
    const elapsed = Math.max(0, Math.floor((now() - startedAt) / 1000));
    const remaining = Math.max(0, ESTIMATED_SECONDS - elapsed);
    const message = remaining
      ? `${duration(elapsed)} elapsed · About ${duration(remaining)} remaining`
      : `${duration(elapsed)} elapsed · Taking longer than estimated; still working…`;
    byId('status-progress').value = Math.min(95, elapsed / ESTIMATED_SECONDS * 95);
    byId('status-progress').setAttribute('aria-valuetext', message);
    byId('status-estimate').textContent = message;
  }
  function savedStart(jobId) {
    try {
      const saved = JSON.parse(storage.getItem(TIMING_KEY));
      return saved?.jobId === jobId && Number.isFinite(saved.startedAt) ? saved.startedAt : null;
    } catch { return null; }
  }
  return {
    start(jobId, createdAt) {
      const serverStart = Date.parse(createdAt);
      if (jobId !== activeJob) startedAt = savedStart(jobId) ?? now();
      if (Number.isFinite(serverStart)) startedAt = serverStart;
      activeJob = jobId;
      storage.setItem(TIMING_KEY, JSON.stringify({ jobId, startedAt }));
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
