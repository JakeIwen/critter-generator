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
    .then(status => progress.setTiming(status.generationTiming))
    .catch(() => {}); // Connection polling retries this optional refresh.
}

export function createJobController(byId, { onBusy, onLaunchPending, onPending, onSpecimen, onComplete, onError }) {
  let activeJob = null;
  let polling = false;
  let cancellingJob = null;
  const progress = createGenerationProgress(byId);
  async function poll() {
    if (polling || !activeJob) return;
    polling = true; onBusy(true);
    byId('status-box').classList.remove('hidden');
    try {
      while (activeJob) {
        const job = await api(`/api/jobs/${activeJob}`);
        byId('status-box').classList.remove('hidden');
        byId('status-message').textContent = job.message;
        byId('status-title').textContent = stageTitles[job.stage] || 'Working on your specimen';
        if (runningStatuses.includes(job.status) && activeJob !== cancellingJob) showJobProgress(byId, progress, job);
        if (!job.specimenId && runningStatuses.includes(job.status)) onPending(job, byId('status-title').textContent);
        if (job.specimenId) await onSpecimen(job.specimenId);
        if (!runningStatuses.includes(job.status)) {
          progress.stop(true); cancellingJob = null;
          activeJob = null; sessionStorage.removeItem('critter-job');
          byId('status-box').classList.add('hidden'); onBusy(false);
          refreshTiming(progress);
          await onComplete(job); break;
        }
        await new Promise(resolve => setTimeout(resolve, 1800));
      }
    } catch (error) {
      progress.stop();
      onError(`Connection interrupted: ${error.message}. Reload to reconnect to the generation.`); onBusy(false);
    } finally { polling = false; }
  }
  async function launch(url, body, kind = JOB_KINDS.GENERATION) {
    if (activeJob) return onError('A specimen update is already in progress.');
    onBusy(true);
    try {
      const result = await api(url, { method: 'POST', body: JSON.stringify(body) });
      activeJob = result.jobId; sessionStorage.setItem('critter-job', activeJob);
      showJobProgress(byId, progress, { id: activeJob, kind, createdAt: result.createdAt, estimatedDurationMs: result.estimatedDurationMs });
      byId('status-title').textContent = stageTitles[kind === JOB_KINDS.CAD ? 'cad-design' : kind === JOB_KINDS.PORTRAIT ? 'image' : 'design'];
      byId('status-message').textContent = connectingMessage;
      if (url === '/api/generate') onLaunchPending({ stage: 'design', message: connectingMessage }, stageTitles.design);
      void poll();
    } catch (error) { onError(error.message); onBusy(false); }
  }
  byId('cancel').onclick = async () => {
    if (!activeJob) return;
    try {
      const jobId = activeJob;
      await api(`/api/jobs/${jobId}/cancel`, { method: 'POST', body: '{}' });
      if (activeJob === jobId) {
        cancellingJob = jobId; progress.stop();
        byId('status-estimate').textContent = 'Cancelling…';
      }
    }
    catch (error) { onError(error.message); }
  };
  return { launch, setTiming: progress.setTiming, resume(jobId) {
    if (jobId && (!activeJob || activeJob === jobId) && !polling) { activeJob = jobId; void poll(); }
  } };
}
