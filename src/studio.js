import { api } from './api.js';
import { renderCollection } from './collection.js';
import { mountGenerationForm } from './generation-form.js';
import { createJobController } from './generation-jobs.js';
import { createSpecimenView } from './specimen-view.js';
import { renderStudio } from './template.js';

export function mountStudio() {
  renderStudio(document.querySelector('#app'));
  const byId = id => document.getElementById(id);
  let specimens = [];
  const toast = message => {
    byId('toast').textContent = message; byId('toast').classList.remove('hidden');
    clearTimeout(toast.timer); toast.timer = setTimeout(() => byId('toast').classList.add('hidden'), 9000);
  };
  const setPage = page => {
    byId('laboratory').classList.toggle('hidden', page !== 'lab');
    byId('collection').classList.toggle('hidden', page !== 'collection');
    document.querySelectorAll('[data-page]').forEach(button => button.classList.toggle('active', button.dataset.page === page));
    if (page === 'collection') renderCollection(byId, specimens, selectFromCollection);
  };
  const form = mountGenerationForm(byId, settings => jobs.launch('/api/generate', settings));
  const specimenView = createSpecimenView(byId, {
    onPortrait: specimen => jobs.launch(`/api/specimens/${specimen.id}/portrait`, {}),
    onReuse: form.applySettings,
    onError: toast,
  });
  async function loadSpecimens(selectId) {
    specimens = await api('/api/specimens');
    byId('count').textContent = specimens.filter(specimen => !specimen.demo).length;
    const specimen = specimens.find(item => item.id === selectId) || specimens.find(item => item.id === specimenView.selectedId) || specimens[0];
    if (specimen) await specimenView.select(specimen, specimens);
    renderCollection(byId, specimens, selectFromCollection);
  }
  function selectFromCollection(specimen) {
    setPage('lab'); void specimenView.selectPortrait(specimen, specimens);
  }
  const jobs = createJobController(byId, {
    onBusy(value) { form.setBusy(value); specimenView.setBusy(value); },
    onPending(job, title) { setPage('lab'); specimenView.showPending(job, title); },
    onSpecimen(id) { return id === specimenView.selectedId ? undefined : loadSpecimens(id); },
    async onComplete(job) { await loadSpecimens(job.specimenId); toast(job.message); },
    onError: toast,
  });
  document.querySelectorAll('[data-page]').forEach(button => button.onclick = () => setPage(button.dataset.page));
  document.querySelector('.brand').onclick = event => { event.preventDefault(); setPage('lab'); };
  mountConnection(byId, jobs, toast);
  void loadSpecimens().catch(error => toast(error.message));
}

function mountConnection(byId, jobs, toast) {
  async function check(reconnect = false) {
    try {
      const status = await api(reconnect ? '/api/connect' : '/api/status', reconnect ? { method:'POST',body:'{}' } : {});
      byId('connection').classList.toggle('online',status.connected);
      byId('connection').querySelector('span').textContent = status.connected ? 'Codex connected' : 'Codex offline · Retry';
      byId('connection').title = status.reason || `Using ${status.model} through Codex`;
      jobs.resume(status.activeJob || sessionStorage.getItem('critter-job'));
    } catch(error) {
      byId('connection').querySelector('span').textContent = 'Codex offline · Retry';
      byId('connection').classList.remove('online'); if(reconnect) toast(error.message);
    }
  }
  byId('connection').onclick = () => check(true);
  void check(); setInterval(() => void check(), 15000);
}
