import { api } from './api.js';

export function mountConnection(byId, jobs, toast) {
  async function check(reconnect = false) {
    try {
      const status = await api(reconnect ? '/api/connect' : '/api/status', reconnect ? { method:'POST',body:'{}' } : {});
      byId('connection').classList.toggle('online',status.connected);
      byId('connection').querySelector('span').textContent = status.connected ? 'Codex connected' : 'Codex offline · Retry';
      byId('connection').title = status.reason || `Using ${status.model} through Codex`;
      jobs.setTiming(status.generationTiming);
      jobs.resume(status.activeJob || sessionStorage.getItem('critter-job'));
    } catch(error) {
      byId('connection').querySelector('span').textContent = 'Codex offline · Retry';
      byId('connection').classList.remove('online'); if(reconnect) toast(error.message);
    }
  }
  byId('connection').onclick = () => check(true);
  return {
    check,
    resumeSavedJob() { jobs.resume(sessionStorage.getItem('critter-job')); },
    startPolling() { setInterval(() => void check(), 15000); },
  };
}
