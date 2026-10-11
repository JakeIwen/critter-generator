import './style.css';
import { mountViewer } from './viewer.js';

const icon = (name, size = 18) => {
  const paths = {
    arrow: '<path d="M5 12h14m-6-6 6 6-6 6"/>',
    download: '<path d="M12 3v12m-5-5 5 5 5-5M5 16v4h14v-4"/>',
    cube: '<path d="m12 3 9 5v9l-9 5-9-5V8l9-5Zm0 10 9-5M12 13 3 8m9 5v9"/>',
    sparkle: '<path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5L12 3Z"/>',
    reset: '<path d="M3 11a9 9 0 1 1 2 7M3 4v7h7"/>',
    leaf: '<path d="M20 3C7 1 1 9 6 17s17 0 14-14ZM5 20 16 9"/>',
    check: '<path d="m5 12 4 4L19 6"/>',
    book: '<path d="M12 5C8 2 4 3 2 4v15c3-1 7-1 10 1 3-2 7-2 10-1V4c-3-1-7-1-10 1Zm0 0v15"/>',
  };
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.sparkle}</svg>`;
};
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
let specimens = [], selected = null, viewer = null, viewToken = 0, activeJob = null, polling = false, tab = 'portrait', page = 'lab';

document.querySelector('#app').innerHTML = `
  <header class="topbar">
    <a href="#" class="brand" aria-label="Critter Generator home"><span class="brand-mark">${icon('leaf',25)}</span><span>CRITTER<span class="brand-bottom">GENERATOR</span></span></a>
    <nav aria-label="Main navigation"><button class="nav active" data-page="lab">The laboratory</button><button class="nav" data-page="collection">Collection <span id="count">0</span></button></nav>
    <button id="connection" class="connection" title="Check the Codex connection"><i></i><span>Connecting to Codex</span>${icon('reset',14)}</button>
  </header>
  <main>
    <section class="intro"><div><p class="eyebrow">THE UNNATURAL HISTORY MUSEUM <span>EST. WHENEVER</span></p><h1>Unnatural selection<span>.</span></h1></div><p class="intro-note">A cabinet of creatures that never were.<br>Dream them up. Bring them into the world.</p></section>
    <section id="laboratory" class="workspace">
      <aside class="controls card">
        <div class="section-heading"><span class="step">01</span><h2>Play with nature</h2>${icon('sparkle')}</div>
        <p class="muted controls-intro">A little curiosity. A questionable amount of creative license.</p>
        <form id="generator-form">
          <label class="input-label" for="prompt">Start with a notion <span>OPTIONAL</span></label>
          <textarea id="prompt" maxlength="1000" rows="3" placeholder="A shy swamp dweller that collects lost buttons…"></textarea>
          <div class="sliders">
            ${slider('absurdity','Absurdity',65,'Almost plausible','Nature gave up','The extent to which this creature defies sensible evolution.')}
            ${slider('deviancy','Sexual deviancy',35,'Conventional','Deeply peculiar','Bizarre courtship & reproductive biology. Non-graphic.')}
            ${slider('lethality','Lethality',20,'Pocket companion','Apex nightmare','How dangerous this fictional animal is.')}
          </div>
          <div class="height-control"><label for="height">${icon('cube',16)} Print height</label><div><input id="height" type="number" value="100" min="60" max="180" step="1" required aria-label="Print height in millimeters"/><span>mm</span></div></div>
          <p class="micro">60–180 mm · display base included</p>
          <button id="generate" class="button primary" type="submit">${icon('sparkle')} Create a critter ${icon('arrow')}</button>
          <p class="generation-note">Made with Codex.<br>New discoveries usually take a minute or two.</p>
        </form>
        <div class="presets"><span class="eyebrow">NEED A NUDGE?</span><button data-preset="gentle">Oddly plausible <span>↗</span></button><button data-preset="weird">Nature’s mistake <span>↗</span></button><button data-preset="danger">Absolute menace <span>↗</span></button></div>
      </aside>
      <section class="specimen-stage" aria-label="Specimen artwork and printable model">
        <div id="status-box" class="status-box hidden" role="status" aria-live="polite"><div><span class="spinner"></span><div><strong id="status-title">Discovering a new species</strong><p id="status-message"></p></div></div><button id="cancel">Cancel</button></div>
        <div class="portrait-card">
          <div class="stage-top"><span class="specimen-tag" id="specimen-tag">SPECIMEN / 001</span><div class="view-tabs" role="tablist" aria-label="Specimen view"><button id="portrait-tab" role="tab" aria-selected="true">Portrait</button><button id="model-tab" role="tab" aria-selected="false">${icon('cube',14)} 3D print</button></div></div>
          <div id="visual" class="visual"><div class="loading-visual"><span class="spinner"></span><p>Opening the cabinet…</p></div></div>
          <div class="stage-bottom"><span id="view-caption">A NEW SPECIES AWAITS</span><button id="reset-view" title="Reset the model camera" class="hidden">${icon('reset',16)} Reset view</button></div>
        </div>
        <div class="download-card card"><div><span class="eyebrow">FROM IMAGINATION TO YOUR DESK</span><h3>Make it tangible.</h3></div><div class="download-actions"><a id="stl-download" class="button primary" aria-label="Download printable STL">${icon('download')} STL</a><a id="cad-download" class="button secondary" aria-label="Download editable OpenSCAD CAD source">${icon('cube')} CAD source</a></div></div>
        <div id="print-info" class="print-info"></div>
        <p class="print-caption">The 3D print is a simplified sculpture of the same anatomy. Artwork can vary in detail. Supports may be needed; check the model in your slicer.</p>
      </section>
      <aside id="field-notes" class="field-notes card" aria-label="Specimen field notes"><div class="loading-visual"><span class="spinner"></span></div></aside>
    </section>
    <section id="collection" class="hidden"><div class="collection-heading"><div><p class="eyebrow">YOUR FIELD COLLECTION</p><h2>Previously undiscovered.</h2></div><p>Every creature is saved to this collection.</p></div><div id="collection-grid" class="collection-grid"></div></section>
    <footer><span>${icon('leaf',14)} NO ACTUAL ECOSYSTEMS WERE HARMED.</span><span>Fictional species. Real possibilities.</span></footer>
  </main><div id="toast" class="toast hidden" role="alert"></div>`;

function slider(id, name, value, low, high, hint) {
  return `<div class="slider-control ${id}"><div class="slider-label"><label for="${id}">${name}</label><output id="${id}-value" for="${id}">${value}<small>/100</small></output></div><input id="${id}" type="range" min="0" max="100" value="${value}" aria-describedby="${id}-hint" style="--value:${value}%"/><div class="range-labels"><span>${low}</span><span>${high}</span></div><p id="${id}-hint" class="slider-hint">${hint}</p></div>`;
}
async function api(url, options = {}) {
  const response = await fetch(url, { ...options, headers: { 'Content-Type': 'application/json', 'X-Critter-Request': '1', ...options.headers } });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || 'The server could not complete this request.');
  return body;
}
const $ = id => document.getElementById(id);
function toast(message) { $('toast').textContent = message; $('toast').classList.remove('hidden'); clearTimeout(toast.timer); toast.timer = setTimeout(() => $('toast').classList.add('hidden'), 9000); }
function file(specimen, name, download = false) { return `/api/specimens/${encodeURIComponent(specimen.id)}/files/${name}${download ? '?download=1' : ''}`; }
function setPage(next) {
  page = next; $('laboratory').classList.toggle('hidden', page !== 'lab'); $('collection').classList.toggle('hidden', page !== 'collection');
  document.querySelectorAll('[data-page]').forEach(b => b.classList.toggle('active', b.dataset.page === page));
  if (page === 'collection') renderCollection();
}
document.querySelectorAll('[data-page]').forEach(b => b.onclick = () => setPage(b.dataset.page));
document.querySelector('.brand').onclick = e => { e.preventDefault(); setPage('lab'); };
for (const id of ['absurdity','deviancy','lethality']) $(id).oninput = () => {
  $(id + '-value').innerHTML = `${$(id).value}<small>/100</small>`; $(id).style.setProperty('--value', `${$(id).value}%`);
};
const presets = {
  gentle: { absurdity: 15, deviancy: 10, lethality: 5, prompt: 'A gentle forest grazer with one surprising adaptation.' },
  weird: { absurdity: 95, deviancy: 80, lethality: 25, prompt: 'A delightfully ridiculous creature with inexplicably elaborate courtship rituals.' },
  danger: { absurdity: 60, deviancy: 35, lethality: 95, prompt: 'A small but intimidating cave predator with imposing horns and dorsal armor.' },
};
document.querySelectorAll('[data-preset]').forEach(b => b.onclick = () => {
  const preset = presets[b.dataset.preset]; $('prompt').value = preset.prompt;
  for (const id of ['absurdity','deviancy','lethality']) { $(id).value = preset[id]; $(id).oninput(); }
  document.querySelectorAll('[data-preset]').forEach(p => p.classList.toggle('chosen', p === b));
});
async function loadSpecimens(selectId) {
  specimens = await api('/api/specimens'); $('count').textContent = specimens.filter(s => !s.demo).length;
  const specimen = specimens.find(s => s.id === selectId) || specimens.find(s => s.id === selected?.id) || specimens[0];
  if (specimen) await selectSpecimen(specimen);
  renderCollection();
}
async function selectSpecimen(specimen) {
  selected = specimen;
  $('specimen-tag').textContent = specimen.demo ? 'EXAMPLE / SCULPTURE' : `SPECIMEN / ${String(specimens.filter(s => !s.demo).length - specimens.findIndex(s => s.id === specimen.id)).padStart(3,'0')}`;
  $('stl-download').href = file(specimen, 'model.stl', true); $('cad-download').href = file(specimen, 'model.scad', true);
  const { print } = specimen;
  $('print-info').innerHTML = `<span>${icon('check',14)} Closed, single solid</span><span>${print.dimensions.map(escape).join(' × ')} mm</span><span>${print.triangles.toLocaleString()} triangles</span>`;
  $('field-notes').innerHTML = `<div class="notes-heading"><span class="eyebrow">${specimen.demo ? 'EXAMPLE FIELD NOTES' : 'FIELD NOTES'}</span>${icon('book',19)}</div>
    <h2>${escape(specimen.englishName)}</h2><p class="latin">${escape(specimen.latinName)}</p><p class="epithet">${escape(specimen.epithet)}</p>
    <div class="trait-chips"><span>A ${specimen.settings.absurdity}</span><span>D ${specimen.settings.deviancy}</span><span>L ${specimen.settings.lethality}</span><span>FICTIONAL SPECIES</span></div>
    <p class="description">${escape(specimen.description)}</p>
    ${note('Habitat',specimen.habitat)}${note('Diet',specimen.diet)}${note('Courtship & biology',specimen.courtship)}${note('Threat assessment',specimen.danger)}
    <blockquote><span>FROM THE FIELD JOURNAL</span>“${escape(specimen.fieldNote)}”</blockquote>
    <div class="notes-downloads">${specimen.image ? `<a href="${file(specimen,'portrait.png',true)}">${icon('download',14)} Save portrait</a>` : '<button id="retry-portrait">'+icon('sparkle',14)+' '+(specimen.demo ? 'Illustrate example' : 'Retry portrait')+'</button>'}<a href="${file(specimen,'record.json',true)}">${icon('download',14)} Field notes</a><button id="reuse-settings">${icon('reset',14)} Use these settings</button></div>
    ${specimen.imageError ? `<p class="inline-error">Portrait incomplete: ${escape(specimen.imageError)}</p>` : ''}`;
  if ($('retry-portrait')) $('retry-portrait').onclick = () => launch(`/api/specimens/${specimen.id}/portrait`, {});
  if ($('retry-portrait')) $('retry-portrait').disabled = !!activeJob;
  $('reuse-settings').onclick = () => {
    $('prompt').value = specimen.settings.prompt; $('height').value = specimen.settings.height;
    for (const id of ['absurdity','deviancy','lethality']) { $(id).value = specimen.settings[id]; $(id).oninput(); }
    $('generator-form').scrollIntoView({ behavior: 'smooth', block: 'center' });
  };
  await showView(specimen.image ? tab : 'model');
}
function note(title, text) { return `<div class="note"><h3>${title}</h3><p>${escape(text)}</p></div>`; }
async function showView(next) {
  tab = next; const token = ++viewToken;
  viewer?.dispose(); viewer = null;
  $('portrait-tab').setAttribute('aria-selected', String(next === 'portrait'));
  $('model-tab').setAttribute('aria-selected', String(next === 'model'));
  $('reset-view').classList.toggle('hidden', next !== 'model');
  if (!selected) return;
  const specimen = selected;
  if (next === 'portrait' && specimen.image) {
    $('visual').innerHTML = `<img class="portrait" src="${file(specimen,'portrait.png')}" alt="Generated portrait of ${escape(specimen.englishName)}"/>`;
    $('view-caption').textContent = 'IMAGINED BY CODEX · CATALOGUED BY YOU';
    $('visual').querySelector('img').onerror = () => { if (token === viewToken) $('visual').innerHTML = '<div class="loading-visual"><p>The portrait could not load. Try the 3D print tab or reload.</p></div>'; };
    return;
  }
  if (next === 'portrait') {
    $('visual').innerHTML = `<div class="loading-visual">${icon('sparkle',40)}<h3>A portrait is waiting to happen.</h3><p>The field notes and print sculpture are ready.</p><button id="empty-portrait" class="button primary">${icon('sparkle')} ${activeJob ? 'Portrait in progress' : 'Generate portrait'}</button></div>`;
    $('empty-portrait').disabled = !!activeJob; $('empty-portrait').onclick = () => launch(`/api/specimens/${specimen.id}/portrait`, {});
    $('view-caption').textContent = 'ARTWORK NOT YET GENERATED'; return;
  }
  $('visual').innerHTML = '<div class="loading-visual"><span class="spinner"></span><p>Loading the print sculpture…</p></div>';
  $('view-caption').textContent = 'ACTUAL PRINT GEOMETRY · DRAG TO ROTATE · SCROLL TO ZOOM';
  try {
    const mesh = await api(file(specimen,'mesh.json'));
    if (token !== viewToken) return;
    $('visual').innerHTML = '<div id="model-viewer"></div>';
    viewer = mountViewer($('model-viewer'), mesh, specimen.print.height);
  } catch (e) {
    if (token === viewToken) { $('visual').innerHTML = '<div class="loading-visual"><p>The 3D preview is unavailable. You can still download the STL and CAD source.</p></div>'; toast(e.message); }
  }
}
const stageTitles = {design:'Discovering a new species',model:'Bringing it into three dimensions',image:'Putting a face to the name',done:'Discovery complete'};
// A new critter has no specimen until its field notes exist, so show the job
// itself instead of leaving the previously selected specimen on stage.
function showPending(job) {
  const title = stageTitles[job.stage] || 'Working on your specimen';
  if (!$('pending-visual')) {
    ++viewToken; viewer?.dispose(); viewer = null; selected = null;
    $('reset-view').classList.add('hidden');
    $('specimen-tag').textContent = 'NEW SPECIMEN / IN PROGRESS';
    $('view-caption').textContent = 'DISCOVERY IN PROGRESS';
    $('visual').innerHTML = `<div id="pending-visual" class="loading-visual"><span class="spinner"></span><h3 id="pending-title"></h3><p id="pending-message"></p></div>`;
    $('field-notes').innerHTML = `<div class="notes-heading"><span class="eyebrow">FIELD NOTES</span>${icon('book',19)}</div><div class="loading-visual"><span class="spinner"></span><p>The field notes are being written.</p></div>`;
  }
  $('pending-title').textContent = title; $('pending-message').textContent = job.message || '';
}
$('portrait-tab').onclick = () => showView('portrait'); $('model-tab').onclick = () => showView('model');
$('reset-view').onclick = () => viewer?.reset();
function renderCollection() {
  $('collection-grid').innerHTML = specimens.map(s => `<button class="collection-item card" data-specimen="${s.id}"><div class="collection-image">${s.image ? `<img src="${file(s,'portrait.png')}" alt="${escape(s.englishName)}" loading="lazy"/>` : `<div class="collection-placeholder">${icon('cube',48)}<span>${s.demo ? 'EXAMPLE SCULPTURE' : 'SCULPTURE READY'}</span></div>`}<span>${s.demo ? 'EXAMPLE' : new Date(s.createdAt).toLocaleDateString(undefined,{month:'short',day:'numeric'})}</span></div><div class="collection-details"><p class="latin">${escape(s.latinName)}</p><h3>${escape(s.englishName)}</h3><p>A ${s.settings.absurdity} <i>·</i> D ${s.settings.deviancy} <i>·</i> L ${s.settings.lethality} <span>${icon('arrow')}</span></p></div></button>`).join('');
  document.querySelectorAll('[data-specimen]').forEach(b => b.onclick = () => { setPage('lab'); tab = 'portrait'; void selectSpecimen(specimens.find(s => s.id === b.dataset.specimen)); });
}
function busy(value) {
  $('generate').disabled = value;
  $('generate').innerHTML = value ? '<span class="spinner"></span> Discovering…' : `${icon('sparkle')} Create a critter ${icon('arrow')}`;
  if ($('retry-portrait')) $('retry-portrait').disabled = value;
}
async function launch(url, body) {
  if (activeJob) return toast('A discovery is already in progress.');
  busy(true);
  try {
    const result = await api(url, { method: 'POST', body: JSON.stringify(body) }); activeJob = result.jobId; sessionStorage.setItem('critter-job',activeJob);
    if (url === '/api/generate') { setPage('lab'); showPending({ stage: 'design', message: 'Connecting to Codex…' }); }
    void pollJob();
  }
  catch (e) { toast(e.message); busy(false); }
}
$('generator-form').onsubmit = e => {
  e.preventDefault();
  const settings = { prompt: $('prompt').value.trim() };
  for (const id of ['absurdity','deviancy','lethality','height']) settings[id] = Number($(id).value);
  void launch('/api/generate', settings);
};
$('cancel').onclick = async () => { try { await api(`/api/jobs/${activeJob}/cancel`, { method: 'POST', body: '{}' }); } catch(e) { toast(e.message); } };
async function pollJob() {
  if (polling || !activeJob) return;
  polling = true; busy(true);
  try {
    while (activeJob) {
      const job = await api(`/api/jobs/${activeJob}`);
      $('status-box').classList.remove('hidden'); $('status-message').textContent = job.message;
      $('status-title').textContent = stageTitles[job.stage] || 'Working on your specimen';
      if (!job.specimenId && ['queued','running'].includes(job.status)) showPending(job);
      if (job.specimenId && selected?.id !== job.specimenId) { tab = 'portrait'; await loadSpecimens(job.specimenId); }
      if (!['queued','running'].includes(job.status)) {
        activeJob = null; sessionStorage.removeItem('critter-job'); $('status-box').classList.add('hidden'); busy(false);
        tab = 'portrait'; await loadSpecimens(job.specimenId); toast(job.message); break;
      }
      await new Promise(resolve => setTimeout(resolve, 1800));
    }
  } catch(e) { toast(`Connection interrupted: ${e.message}. Reload to reconnect to the generation.`); busy(false); }
  finally { polling = false; }
}
async function checkConnection(reconnect = false) {
  try {
    const status = await api(reconnect ? '/api/connect' : '/api/status', reconnect ? { method:'POST',body:'{}' } : {});
    $('connection').classList.toggle('online',status.connected);
    $('connection').querySelector('span').textContent = status.connected ? 'Codex connected' : 'Codex offline · Retry';
    $('connection').title = status.reason || `Using ${status.model} through Codex`;
    if (status.activeJob && !activeJob) { activeJob = status.activeJob; void pollJob(); }
  } catch(e) { $('connection').querySelector('span').textContent = 'Codex offline · Retry'; $('connection').classList.remove('online'); if(reconnect) toast(e.message); }
}
$('connection').onclick = () => checkConnection(true);
async function init() {
  try { await loadSpecimens(); await checkConnection(); activeJob ||= sessionStorage.getItem('critter-job'); if(activeJob) void pollJob(); }
  catch(e) { toast(e.message); }
  setInterval(() => void checkConnection(), 15000);
}
void init();
