import { api } from './api.js';
import { createGenerationProgress } from './generation-progress.js';
const runningStatuses = ['queued', 'running'];
const stageTitles = {design:'Discovering a new species',model:'Building the print sculpture',image:'Observing it in its environment',done:'Discovery complete'};

export function createJobController(byId, { onBusy, onLaunchPending, onPending, onSpecimen, onComplete, onError }) {
  let activeJob = null;
  let polling = false;
  let cancellingJob = null;
  const progress = createGenerationProgress(byId);
  async function poll() {
    if (polling || !activeJob) return;
    polling = true; onBusy(true);
    byId('status-box').classList.remove('hidden');
    if (activeJob !== cancellingJob) progress.start(activeJob);
    try {
      while (activeJob) {
        const job = await api(`/api/jobs/${activeJob}`);
        byId('status-box').classList.remove('hidden');
        byId('status-message').textContent = job.message;
        byId('status-title').textContent = stageTitles[job.stage] || 'Working on your specimen';
        if (runningStatuses.includes(job.status) && activeJob !== cancellingJob) progress.start(activeJob, job.createdAt);
        if (!job.specimenId && runningStatuses.includes(job.status)) onPending(job, byId('status-title').textContent);
        if (job.specimenId) await onSpecimen(job.specimenId);
        if (!runningStatuses.includes(job.status)) {
          progress.stop(true); cancellingJob = null;
          activeJob = null; sessionStorage.removeItem('critter-job');
          byId('status-box').classList.add('hidden'); onBusy(false);
          await onComplete(job); break;
        }
        await new Promise(resolve => setTimeout(resolve, 1800));
      }
    } catch (error) {
      progress.stop();
      onError(`Connection interrupted: ${error.message}. Reload to reconnect to the generation.`); onBusy(false);
    } finally { polling = false; }
  }
  async function launch(url, body) {
    if (activeJob) return onError('A discovery is already in progress.');
    onBusy(true);
    try {
      const result = await api(url, { method: 'POST', body: JSON.stringify(body) });
      activeJob = result.jobId; sessionStorage.setItem('critter-job', activeJob);
      byId('status-title').textContent = stageTitles.design;
      byId('status-message').textContent = 'Connecting to Codex…';
      if (url === '/api/generate') onLaunchPending({ stage: 'design', message: 'Connecting to Codex…' }, stageTitles.design);
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
  return { launch, resume(jobId) {
    if (jobId && (!activeJob || activeJob === jobId) && !polling) { activeJob = jobId; void poll(); }
  } };
}
