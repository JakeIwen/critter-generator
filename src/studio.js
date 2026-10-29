import { JOB_KINDS } from '../shared/generation-timing.mjs';
import { api } from './api.js';
import { renderCollection } from './collection.js';
import { mountConnection } from './connection.js';
import { mountGenerationForm } from './generation-form.js';
import { createJobController } from './generation-jobs.js';
import { mountSettingsPage } from './settings-page.js';
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
  const settingsPage = mountSettingsPage(byId, { onError: toast });
  const setPage = page => {
    byId('laboratory').classList.toggle('hidden', page !== 'lab');
    byId('collection').classList.toggle('hidden', page !== 'collection');
    byId('settings').classList.toggle('hidden', page !== 'settings');
    document.querySelectorAll('[data-page]').forEach(button => button.classList.toggle('active', button.dataset.page === page));
    if (page === 'collection') renderCollection(byId, specimens, selectFromCollection);
    if (page === 'settings') void settingsPage.show();
  };
  const form = mountGenerationForm(byId, settings => jobs.launch('/api/generate', settings), toast);
  const specimenView = createSpecimenView(byId, {
    onPortrait: (specimen, body = {}) => jobs.launch(`/api/specimens/${specimen.id}/portrait`, body, JOB_KINDS.PORTRAIT),
    onCad: (specimen, body) => jobs.launch(`/api/specimens/${specimen.id}/cad`, body, JOB_KINDS.CAD),
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
    onLaunchPending(job, title) { setPage('lab'); specimenView.showPending(job, title); },
    onPending(job, title) { specimenView.showPending(job, title); },
    onSpecimen(id) {
      if (id === specimenView.selectedId) return undefined;
      specimenView.resetToPortrait(); return loadSpecimens(id);
    },
    async onComplete(job) {
      if (job.kind === JOB_KINDS.CAD && job.status === 'completed') specimenView.preferModel(); else specimenView.resetToPortrait();
      await loadSpecimens(job.specimenId); toast(job.message);
    },
    onError: toast,
  });
  document.querySelectorAll('[data-page]').forEach(button => button.onclick = () => setPage(button.dataset.page));
  document.querySelector('.brand').onclick = event => { event.preventDefault(); setPage('lab'); };
  const connection = mountConnection(byId, jobs, toast);
  void initialize(loadSpecimens, connection, toast);
}

async function initialize(loadSpecimens, connection, toast) {
  try { await loadSpecimens(); await connection.check(); connection.resumeSavedJob(); }
  catch (error) { toast(error.message); }
  connection.startPolling();
}

