import { sliders } from '../shared/sliders.mjs';
import { PRINT_HEIGHT } from '../shared/print-settings.mjs';
import { icon } from './icons.js';

function slider({ id, name, initial: value, low, high, hint }) {
  return `<div class="slider-control ${id}"><div class="slider-label"><label for="${id}">${name}</label><output id="${id}-value" for="${id}">${value}<small>/100</small></output></div><input id="${id}" type="range" min="0" max="100" value="${value}" aria-describedby="${id}-hint" style="--value:${value}%"/><div class="range-labels"><span>${low}</span><span>${high}</span></div><p id="${id}-hint" class="slider-hint">${hint}</p></div>`;
}

export function renderStudio(root) {
  root.innerHTML = `
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
            ${sliders.map(slider).join('')}
          </div>
          <div class="height-control"><label for="height">${icon('cube',16)} Print height</label><div><input id="height" type="number" value="${PRINT_HEIGHT.initial}" min="${PRINT_HEIGHT.min}" max="${PRINT_HEIGHT.max}" step="1" required aria-label="Print height in millimeters"/><span>mm</span></div></div>
          <p class="micro">${PRINT_HEIGHT.min}–${PRINT_HEIGHT.max} mm · total model height</p>
          <label class="baseplate-control" for="baseplate"><input id="baseplate" type="checkbox" checked/> Include baseplate</label>
          <button id="generate" class="button primary" type="submit">${icon('sparkle')} Create a critter ${icon('arrow')}</button>
          <p class="generation-note">Estimated wait: 2 min 10 sec.</p>
        </form>
        <div class="presets"><span class="eyebrow">NEED A NUDGE?</span><button data-preset="gentle">Oddly plausible <span>↗</span></button><button data-preset="weird">Nature’s mistake <span>↗</span></button><button data-preset="danger">Absolute menace <span>↗</span></button></div>
      </aside>
      <section class="specimen-stage" aria-label="Specimen artwork and printable model">
        <div id="status-box" class="status-box hidden"><div class="status-header"><div role="status" aria-live="polite"><strong id="status-title">Discovering a new species</strong><p id="status-message"></p></div><button id="cancel">Cancel</button></div><progress id="status-progress" max="100" value="0" aria-label="Estimated generation progress"></progress><p id="status-estimate" class="status-estimate"></p></div>
        <div class="portrait-card">
          <div class="stage-top"><span class="specimen-tag" id="specimen-tag">SPECIMEN / 001</span><div class="view-tabs" role="tablist" aria-label="Specimen view"><button id="portrait-tab" role="tab" aria-selected="true">Portrait</button><button id="model-tab" role="tab" aria-selected="false">${icon('cube',14)} 3D print</button></div></div>
          <div id="visual" class="visual"><div class="loading-visual"><span class="spinner"></span><p>Opening the cabinet…</p></div></div>
          <div class="stage-bottom"><span id="view-caption">A NEW SPECIES AWAITS</span><button id="reset-view" title="Reset the model camera" class="hidden">${icon('reset',16)} Reset view</button></div>
        </div>
        <div class="download-card card"><div><span class="eyebrow">FROM IMAGINATION TO YOUR DESK</span><h3>Make it tangible.</h3></div><div class="download-actions"><a id="stl-download" class="button primary" aria-label="Download printable STL">${icon('download')} STL</a><a id="cad-download" class="button secondary" aria-label="Download editable OpenSCAD CAD source">${icon('cube')} CAD source</a></div></div>
        <div id="print-info" class="print-info"></div>
        <p class="print-caption">The 3D print is a simplified sculpture of the same anatomy. Artwork can vary in detail. Check the model and supports in your slicer.</p>
      </section>
      <aside id="field-notes" class="field-notes card" aria-label="Specimen field notes"><div class="loading-visual"><span class="spinner"></span></div></aside>
    </section>
    <section id="collection" class="hidden"><div class="collection-heading"><div><p class="eyebrow">YOUR FIELD COLLECTION</p><h2>Previously undiscovered.</h2></div><p>Every creature is saved to this collection.</p></div><div id="collection-grid" class="collection-grid"></div></section>
    <footer><span>${icon('leaf',14)} NO ACTUAL ECOSYSTEMS WERE HARMED.</span><span>Fictional species. Real possibilities.</span></footer>
  </main><div id="toast" class="toast hidden" role="alert"></div>`;
}
