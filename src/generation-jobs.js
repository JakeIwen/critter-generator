import { JOB_KINDS } from '../shared/generation-timing.mjs';
import { api } from './api.js';
import { createGenerationProgress } from './generation-progress.js';
const runningStatuses = ['queued', 'running'];
const connectingMessage = 'Connecting to the model…';
const stageTitles = { design:'Discovering a new species', 'cad-design':'Interpreting the portrait for CAD', model:'Building the print sculpture', image:'Drawing the portrait', review:'Reviewing the portrait', done:'Specimen updated' };

function showJobProgress(byId, progress, job) {
  if (job.kind === JOB_KINDS.CAD) {
    progress.stop(); byId('status-progress').removeAttribute('value');
    byId('status-progress').setAttribute('aria-valuetext', 'CAD generation in progress');
    byId('status-estimate').textContent = 'Creating a printable approximation of the current portrait.';
  } else progress.start(job.id, job.createdAt, job.estimatedDurationMs);
}

function refreshTiming(progress) {
  void api('/api/status', { signal: AbortSignal.timeout(5000) })
    .then(status => progress.setTiming(status.generationTiming, status.config))
    .catch(() => {}); // Connection polling retries this optional refresh.
}

export function createJobController(byId, { onBusy, onLaunchPending, onPending, onSpecimen, onComplete, onError, onJob = () => {} }) {
  let activeJob = null;
  let polling = false;
  let cancellingJob = null;
  let currentJob = null;
  const progress = createGenerationProgress(byId);
  function updateJob(job) {
    currentJob = job;
    const title = stageTitles[job.stage] || 'Working on your specimen';
    onJob(job, title);
    // CAD feedback stays at its action card instead of competing with an off-screen status box.
    byId('status-box').classList.toggle('hidden', job.kind === JOB_KINDS.CAD);
    byId('status-message').textContent = job.message; byId('status-title').textContent = title;
  }
  async function poll() {
    if (polling || !activeJob) return;
    polling = true; onBusy(true);
    if (currentJob?.kind !== JOB_KINDS.CAD) byId('status-box').classList.remove('hidden');
    try {
      while (activeJob) {
        const job = await api(`/api/jobs/${activeJob}`);
        updateJob({ ...job, cancelling: activeJob === cancellingJob });
        if (runningStatuses.includes(job.status) && activeJob !== cancellingJob) showJobProgress(byId, progress, job);
        if (!job.specimenId && runningStatuses.includes(job.status)) onPending(job, byId('status-title').textContent);
        if (job.specimenId) await onSpecimen(job.specimenId);
        if (!runningStatuses.includes(job.status)) {
          progress.stop(true); cancellingJob = null; currentJob = null; onJob(null);
          activeJob = null; sessionStorage.removeItem('critter-job');
          byId('status-box').classList.add('hidden'); onBusy(false);
          refreshTiming(progress);
          await onComplete(job); break;
        }
        // Job polling cadence is UI feedback, independent of generation timeouts.
      await new Promise(resolve => setTimeout(resolve, 1800));
      }
    } catch (error) {
      progress.stop(); onJob(null);
      onError(`Connection interrupted: ${error.message}. Reload to reconnect to the generation.`); onBusy(false);
    } finally { polling = false; }
  }
  async function launch(url, body, kind = JOB_KINDS.GENERATION, specimenId = null) {
    if (activeJob) return onError('A specimen update is already in progress.');
    onBusy(true);
    const stage = kind === JOB_KINDS.CAD ? 'cad-design' : kind === JOB_KINDS.PORTRAIT ? 'image' : 'design';
    if (kind === JOB_KINDS.CAD) updateJob({ kind, specimenId, stage, message: connectingMessage, createdAt: new Date().toISOString() });
    try {
      const result = await api(url, { method: 'POST', body: JSON.stringify(body) });
      activeJob = result.jobId; sessionStorage.setItem('critter-job', activeJob);
      showJobProgress(byId, progress, { id: activeJob, kind, createdAt: result.createdAt, estimatedDurationMs: result.estimatedDurationMs });
      updateJob({ id: activeJob, kind, specimenId, stage, message: connectingMessage, createdAt: result.createdAt });
      if (url === '/api/generate') onLaunchPending({ stage: 'design', message: connectingMessage }, stageTitles.design);
      void poll();
    } catch (error) { onJob(null); onError(error.message); onBusy(false); }
  }
  const cancel = async () => {
    if (!activeJob) return;
    try {
      const jobId = activeJob;
      await api(`/api/jobs/${jobId}/cancel`, { method: 'POST', body: '{}' });
      if (activeJob === jobId) {
        cancellingJob = jobId; progress.stop();
        if (currentJob) updateJob({ ...currentJob, cancelling: true });
        byId('status-estimate').textContent = 'Cancelling…';
      }
    }
    catch (error) { onError(error.message); }
  };
  byId('cancel').onclick = cancel;
  return { launch, cancel, setTiming: progress.setTiming, resume(jobId) {
    if (jobId && (!activeJob || activeJob === jobId) && !polling) { activeJob = jobId; void poll(); }
  } };
}
