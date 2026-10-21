import { api } from './api.js';
const runningStatuses = ['queued', 'running'];
const stageTitles = {design:'Discovering a new species',model:'Bringing it into three dimensions',image:'Putting a face to the name',done:'Discovery complete'};

export function createJobController(byId, { onBusy, onLaunchPending, onPending, onSpecimen, onComplete, onError }) {
  let activeJob = null;
  let polling = false;
  async function poll() {
    if (polling || !activeJob) return;
    polling = true; onBusy(true);
    try {
      while (activeJob) {
        const job = await api(`/api/jobs/${activeJob}`);
        byId('status-box').classList.remove('hidden');
        byId('status-message').textContent = job.message;
        byId('status-title').textContent = stageTitles[job.stage] || 'Working on your specimen';
        if (!job.specimenId && runningStatuses.includes(job.status)) onPending(job, byId('status-title').textContent);
        if (job.specimenId) await onSpecimen(job.specimenId);
        if (!runningStatuses.includes(job.status)) {
          activeJob = null; sessionStorage.removeItem('critter-job');
          byId('status-box').classList.add('hidden'); onBusy(false);
          await onComplete(job); break;
        }
        await new Promise(resolve => setTimeout(resolve, 1800));
      }
    } catch (error) {
      onError(`Connection interrupted: ${error.message}. Reload to reconnect to the generation.`); onBusy(false);
    } finally { polling = false; }
  }
  async function launch(url, body) {
    if (activeJob) return onError('A discovery is already in progress.');
    onBusy(true);
    try {
      const result = await api(url, { method: 'POST', body: JSON.stringify(body) });
      activeJob = result.jobId; sessionStorage.setItem('critter-job', activeJob);
      if (url === '/api/generate') onLaunchPending({ stage: 'design', message: 'Connecting to Codex…' }, stageTitles.design);
      void poll();
    } catch (error) { onError(error.message); onBusy(false); }
  }
  byId('cancel').onclick = async () => {
    try { await api(`/api/jobs/${activeJob}/cancel`, { method: 'POST', body: '{}' }); }
    catch (error) { onError(error.message); }
  };
  return { launch, resume(jobId) { if (!activeJob && jobId) { activeJob = jobId; void poll(); } } };
}
