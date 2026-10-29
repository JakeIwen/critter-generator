import { JOB_KINDS } from '../shared/generation-timing.mjs';
import { api } from './api.js';
import { renderCollection } from './collection.js';
import { mountConnection } from './connection.js';
import { mountGenerationForm } from './generation-form.js';
import { createJobController } from './generation-jobs.js';
import { mountRouter } from './router.js';
import { mountSettingsPage } from './settings-page.js';
import { createSpecimenView } from './specimen-view.js';
import { renderStudio } from './template.js';

export function mountStudio() {
  renderStudio(document.querySelector('#app'));
  const byId = id => document.getElementById(id);
  let specimens = [], owner = false;
  const showCollection = () => renderCollection(byId, specimens, owner, archiveSpecimen);
  const setOwner = value => { if (owner !== value) { owner = value; showCollection(); } router.setOwner(value); };
  // Toast lifetime is transient UI feedback, not an app-wide generation preference.
  const toast = message => {
    byId('toast').textContent = message; byId('toast').classList.remove('hidden');
    clearTimeout(toast.timer); toast.timer = setTimeout(() => byId('toast').classList.add('hidden'), 9000);
  };
  const settingsPage = mountSettingsPage(byId, { onError: toast, onSaved: () => connection.check() });
  const form = mountGenerationForm(byId, settings => jobs.launch('/api/generate', settings), toast);
  const specimenView = createSpecimenView(byId, {
    onPortrait: (specimen, body = {}) => jobs.launch(`/api/specimens/${specimen.id}/portrait`, body, JOB_KINDS.PORTRAIT),
    onCad: (specimen, body) => jobs.launch(`/api/specimens/${specimen.id}/cad`, body, JOB_KINDS.CAD),
    onReuse: form.applySettings,
    onError: toast,
  });
  const router = mountRouter(byId, { getSpecimens: () => specimens, specimenView, showCollection, settingsPage, toast });
  async function loadSpecimens(selectId) {
    specimens = await api('/api/specimens');
    byId('count').textContent = specimens.filter(specimen => !specimen.demo).length;
    showCollection(); await router.refresh(selectId);
  }
  async function archiveSpecimen(specimen) {
    try {
      await api(`/api/specimens/${encodeURIComponent(specimen.id)}`, { method: 'DELETE' });
      await loadSpecimens(); toast(`Archived ${specimen.englishName}`);
    } catch (error) { toast(error.message); }
  }
  const jobs = createJobController(byId, {
    onBusy(value) { form.setBusy(value); specimenView.setBusy(value); },
    onLaunchPending(job, title) { router.navigate({ page: 'lab' }); specimenView.showPending(job, title); },
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
  const connection = mountConnection(byId, jobs, toast, setOwner, form.setConfig);
  void initialize(loadSpecimens, connection, toast);
}

async function initialize(loadSpecimens, connection, toast) {
  try { await loadSpecimens(); await connection.check(); connection.resumeSavedJob(); }
  catch (error) { toast(error.message); }
  connection.startPolling();
}

