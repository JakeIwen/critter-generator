import { api, specimenFile } from './api.js';
import { icon } from './icons.js';
import { escape, usedSliders, hasPrintModel } from './specimen-format.js';
import { mountViewer } from './viewer.js';

const note = (title, text) => `<div class="note"><h3>${title}</h3><p>${escape(text)}</p></div>`;

function setPrintActions(byId, specimen) {
  const available = hasPrintModel(specimen);
  for (const id of ['model-tab', 'model-downloads', 'print-info', 'print-caption']) byId(id).classList.toggle('hidden', !available);
  byId('model-tab').disabled = !available;
  for (const [id, name] of [['stl-download', 'model.stl'], ['cad-download', 'model.scad']]) {
    if (available) byId(id).href = specimenFile(specimen, name, true); else byId(id).removeAttribute('href');
  }
  const print = specimen?.print;
  byId('print-info').innerHTML = available ? `<span>${icon('check',14)} Closed, single solid</span><span>${print.dimensions.map(escape).join(' × ')} mm</span><span>${print.triangles.toLocaleString()} triangles</span>${print.minFeatureDiameterMm ? `<span>Thinnest feature ${escape(print.minFeatureDiameterMm)} mm</span>` : ''}${print.overhangPct !== undefined ? `<span>${escape(Math.round(print.overhangPct))}% overhang</span>` : ''}` : '';
}

function physicalNotes(biology) {
  if (!biology) return '';
  return `${note('Physical form', biology.bodyPlan)}${note('Movement', biology.locomotion)}${note('Surface', biology.covering)}${note('Distinctive traits', biology.features.join(' '))}`;
}

function renderPendingView(byId) {
  setPrintActions(byId, null);
  byId('portrait-tab').setAttribute('aria-selected', 'true');
  byId('model-tab').setAttribute('aria-selected', 'false');
  byId('reset-view').classList.add('hidden');
  byId('specimen-tag').textContent = 'NEW SPECIMEN / IN PROGRESS';
  byId('view-caption').textContent = 'DISCOVERY IN PROGRESS';
  byId('visual').innerHTML = `<div id="pending-visual" class="loading-visual"><span class="spinner"></span><h3 id="pending-title"></h3><p id="pending-message"></p></div>`;
  byId('field-notes').innerHTML = `<div class="notes-heading"><span class="eyebrow">FIELD NOTES</span>${icon('book',19)}</div><div class="loading-visual"><span class="spinner"></span><p>The field notes are being written.</p></div>`;
}

function renderFieldNotes(byId, specimen, activeJob, onPortrait, onReuse) {
  byId('field-notes').innerHTML = `<div class="notes-heading"><span class="eyebrow">${specimen.demo ? 'EXAMPLE FIELD NOTES' : 'FIELD NOTES'}</span>${icon('book',19)}</div>
    <h2>${escape(specimen.englishName)}</h2><p class="latin">${escape(specimen.latinName)}</p><p class="epithet">${escape(specimen.epithet)}</p>
    <div class="trait-chips">${usedSliders(specimen.settings).map(({ id, short }) => `<span class="chip-${id}">${short} ${specimen.settings[id]}</span>`).join('')}<span>FICTIONAL SPECIES</span></div>
    <p class="description">${escape(specimen.description)}</p>
    ${physicalNotes(specimen.biology)}
    ${note('Environment',specimen.habitat)}${note('Diet',specimen.diet)}${note('Courtship & biology',specimen.courtship)}${note('Threat assessment',specimen.danger)}
    <blockquote><span>FROM THE FIELD JOURNAL</span>“${escape(specimen.fieldNote)}”</blockquote>
    <div class="notes-downloads">${specimen.image ? `<a href="${specimenFile(specimen,'portrait.png',true)}">${icon('download',14)} Save portrait</a>` : '<button id="retry-portrait">'+icon('sparkle',14)+' '+(specimen.demo ? 'Illustrate example' : 'Retry portrait')+'</button>'}<a href="${specimenFile(specimen,'record.json',true)}">${icon('download',14)} Field notes</a><button id="reuse-settings">${icon('reset',14)} Use these settings</button></div>
    ${specimen.imageError ? `<p class="inline-error">Portrait incomplete: ${escape(specimen.imageError)}</p>` : ''}`;
  if (byId('retry-portrait')) byId('retry-portrait').onclick = () => onPortrait(specimen);
  if (byId('retry-portrait')) byId('retry-portrait').disabled = activeJob;
  byId('reuse-settings').onclick = () => onReuse({ ...specimen.settings, printModel: specimen.settings?.printModel ?? hasPrintModel(specimen) });
}

export function createSpecimenView(byId, { onPortrait, onReuse, onError }) {
  let activeJob = false;
  let selected = null;
  let tab = 'portrait';
  let viewToken = 0;
  let viewer = null;

  async function showView(next) {
    if (next === 'model' && !hasPrintModel(selected)) next = 'portrait';
    tab = next;
    const token = ++viewToken;
    viewer?.dispose(); viewer = null;
    byId('portrait-tab').setAttribute('aria-selected', String(next === 'portrait'));
    byId('model-tab').setAttribute('aria-selected', String(next === 'model'));
    byId('reset-view').classList.toggle('hidden', next !== 'model');
    if (!selected) return;
    const specimen = selected;
    if (next === 'portrait' && specimen.image) {
      byId('visual').innerHTML = `<img class="portrait" src="${specimenFile(specimen,'portrait.png')}" alt="Generated portrait of ${escape(specimen.englishName)}"/>`;
      byId('view-caption').textContent = '';
      byId('visual').querySelector('img').onerror = () => { if (token === viewToken) byId('visual').innerHTML = `<div class="loading-visual"><p>The portrait could not load. ${hasPrintModel(specimen) ? 'Try the 3D print tab or reload.' : 'Reload to try again.'}</p></div>`; };
      return;
    }
    if (next === 'portrait') {
      byId('visual').innerHTML = `<div class="loading-visual">${icon('sparkle',40)}<h3>${activeJob ? 'Observing the lifeform…' : 'Portrait not yet generated'}</h3><p>${hasPrintModel(specimen) ? 'The field notes and print sculpture are ready.' : 'The field notes are ready.'}</p><button id="empty-portrait" class="button primary">${icon('sparkle')} ${activeJob ? 'Portrait in progress' : 'Generate portrait'}</button></div>`;
      byId('empty-portrait').disabled = activeJob;
      byId('empty-portrait').onclick = () => onPortrait(specimen);
      byId('view-caption').textContent = 'ARTWORK NOT YET GENERATED';
      return;
    }
    byId('visual').innerHTML = '<div class="loading-visual"><span class="spinner"></span><p>Loading the print sculpture…</p></div>';
    byId('view-caption').textContent = 'ACTUAL PRINT GEOMETRY · DRAG TO ROTATE · SCROLL TO ZOOM';
    try {
      const mesh = await api(specimenFile(specimen,'mesh.json'));
      if (token !== viewToken) return;
      byId('visual').innerHTML = '<div id="model-viewer"></div>';
      viewer = mountViewer(byId('model-viewer'), mesh, specimen.print.height);
    } catch (error) {
      if (token === viewToken) {
        byId('visual').innerHTML = '<div class="loading-visual"><p>The 3D preview is unavailable. You can still download the STL and CAD source.</p></div>';
        onError(error.message);
      }
    }
  }

  async function select(specimen, specimens) {
    selected = specimen;
    byId('specimen-tag').textContent = specimen.demo ? 'EXAMPLE / SCULPTURE' : `SPECIMEN / ${String(specimens.filter(item => !item.demo).length - specimens.findIndex(item => item.id === specimen.id)).padStart(3,'0')}`;
    setPrintActions(byId, specimen);
    renderFieldNotes(byId, specimen, activeJob, onPortrait, onReuse);
    await showView(!specimen.image && hasPrintModel(specimen) ? 'model' : tab);
  }

  byId('portrait-tab').onclick = () => showView('portrait');
  byId('model-tab').onclick = () => showView('model');
  byId('reset-view').onclick = () => viewer?.reset();
  return {
    get selectedId() { return selected?.id; },
    select,
    resetToPortrait() { tab = 'portrait'; },
    selectPortrait(specimen, specimens) { tab = 'portrait'; return select(specimen, specimens); },
    setBusy(value) {
      activeJob = value;
      for (const id of ['retry-portrait', 'empty-portrait']) if (byId(id)) byId(id).disabled = value;
    },
    showPending(job, title) {
      if (!byId('pending-visual')) {
        ++viewToken; viewer?.dispose(); viewer = null; selected = null;
        tab = 'portrait';
        renderPendingView(byId);
      }
      byId('pending-title').textContent = title;
      byId('pending-message').textContent = job.message || '';
    },
  };
}
