import { PROVIDERS, effortLabel, providerLabels } from '../shared/generation-models.mjs';
import { api } from './api.js';

const sessionLabels = { owner: 'Signed in as owner', email: 'Signed in by email', passcode: 'Signed in with the passcode' };

export function mountConnection(byId, jobs, toast, setOwner = () => {}) {
  let label = providerLabels[PROVIDERS.CODEX];
  async function check(reconnect = false) {
    try {
      const status = await api(reconnect ? '/api/connect' : '/api/status', reconnect ? { method:'POST',body:'{}' } : {});
      const provider = status.generation?.provider ?? PROVIDERS.CODEX;
      const connection = status.connection?.[provider] ?? status;
      const model = status.generation?.model ?? connection.model ?? status.model;
      label = providerLabels[provider] ?? provider;
      byId('settings-nav').hidden = status.owner !== true;
      setOwner(status.owner === true);
      byId('logout').hidden = typeof status.session !== 'string';
      byId('logout').title = sessionLabels[status.session] ?? '';
      byId('connection').classList.toggle('online', connection.connected);
      byId('connection').querySelector('span').textContent = `${label} ${connection.connected ? 'connected' : 'offline · Retry'}`;
      byId('connection').title = connection.connected
        ? `Using ${model ?? 'the selected model'} (${effortLabel(status.generation?.effort)}) through ${label}`
        : connection.reason || `${label} is unavailable.`;
      if (sessionLabels[status.session]) byId('connection').title += ` · ${sessionLabels[status.session].toLowerCase()}`;
      jobs.setTiming(status.generationTiming);
      jobs.resume(status.activeJob || sessionStorage.getItem('critter-job'));
    } catch(error) {
      byId('connection').querySelector('span').textContent = `${label} offline · Retry`;
      byId('connection').title = error.message;
      byId('connection').classList.remove('online'); if(reconnect) toast(error.message);
    }
  }
  byId('connection').onclick = () => check(true);
  byId('logout').onclick = async () => {
    try { await api('/auth/logout', { method: 'POST', body: '{}' }); location.assign('/auth'); }
    catch (error) { toast(error.message); }
  };
  return {
    check,
    resumeSavedJob() { jobs.resume(sessionStorage.getItem('critter-job')); },
    startPolling() { setInterval(() => void check(), 15000); },
  };
}
