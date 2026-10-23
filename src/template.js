import { sliders } from '../shared/sliders.mjs';
import { PRINT_HEIGHT } from '../shared/print-settings.mjs';
import { animalTypes } from '../shared/animal-types.mjs';
import { icon } from './icons.js';
import { escape } from './specimen-format.js';

function slider({ id, name, initial: value, low, high, hint }) {
  return `<div class="slider-control ${id}"><div class="slider-label"><label for="${id}">${name}</label><output id="${id}-value" for="${id}">${value}<small>/100</small></output></div><input id="${id}" type="range" min="0" max="100" value="${value}" aria-describedby="${id}-hint" style="--value:${value}%"/><div class="range-labels"><span>${low}</span><span>${high}</span></div><p id="${id}-hint" class="slider-hint">${hint}</p></div>`;
}

function animalChoices() {
  return `<fieldset class="animal-choices"><legend>Animal inspiration <span class="info-hint" tabindex="0" role="img" aria-label="Choose any mix. Each generation draws one to three groups from your selection; Any animal draws from all groups." title="Choose any mix. Each generation draws one to three groups from your selection; Any animal draws from all groups.">?</span></legend>
    <div class="animal-chips"><button id="any-animal" class="animal-chip" type="button" aria-pressed="true">Any animal</button>${animalTypes.map(type => `<button class="animal-chip${type.fictional ? ' fictional-animal' : ''}" type="button" data-animal-type="${type.id}" aria-pressed="false" title="${escape(type.fictional ? `Fictional inspiration: ${type.traits}` : type.traits)}">${escape(type.label)}${type.fictional ? '<span aria-label="fictional">✦</span>' : ''}</button>`).join('')}</div>
    <label class="feature-control" for="legless"><input id="legless" type="checkbox"/> No legs <span class="info-hint" title="Require a legless lifeform. Fins, wings, tentacles and other forms of movement can still occur.">?</span></label>
  </fieldset>`;
}

export function renderStudio(root) {
  root.innerHTML = `
  <header class="topbar">
    <a href="#" class="brand" aria-label="Critter Generator home"><span class="brand-mark">${icon('leaf',25)}</span><span>CRITTER<span class="brand-bottom">GENERATOR</span></span></a>
    <nav aria-label="Main navigation"><button class="nav active" data-page="lab">The laboratory</button><button class="nav" data-page="collection">Collection <span id="count">0</span></button></nav>
    <button id="connection" class="connection" title="Check the Codex connection"><i></i><span>Connecting to Codex</span>${icon('reset',14)}</button>
  </header>
  <main>
    <h1 class="page-title">Critter Generator</h1>
    <section id="laboratory" class="workspace">
      <aside class="controls card">
        <div class="section-heading"><h2>New lifeform</h2>${icon('sparkle')}</div>
        <form id="generator-form">
          ${animalChoices()}
          <label class="input-label" for="prompt">Describe an idea <span>OPTIONAL</span></label>
          <textarea id="prompt" maxlength="1000" rows="3" placeholder="A translucent reef hunter that grows false eyes to lure its prey…"></textarea>
          <div class="sliders">
            ${sliders.map(slider).join('')}
          </div>
          <label class="feature-control print-toggle" for="print-model"><input id="print-model" type="checkbox"/> 3D Print / CAD <span class="info-hint" title="Include a simplified print sculpture. It cannot reproduce every feature of the animal; the image follows its full biology.">?</span></label>
          <fieldset id="print-settings" class="print-settings hidden" disabled>
            <legend class="sr-only">Print settings</legend>
            <div class="height-control"><label for="height">${icon('cube',16)} Print height</label><div><input id="height" type="number" value="${PRINT_HEIGHT.initial}" min="${PRINT_HEIGHT.min}" max="${PRINT_HEIGHT.max}" step="1" required aria-label="Print height in millimeters"/><span>mm</span></div></div>
            <p class="micro">${PRINT_HEIGHT.min}–${PRINT_HEIGHT.max} mm · total model height</p>
            <label class="baseplate-control" for="baseplate"><input id="baseplate" type="checkbox" checked/> Include baseplate</label>
          </fieldset>
          <button id="generate" class="button primary" type="submit">${icon('sparkle')} Generate lifeform ${icon('arrow')}</button>
          <p class="generation-note">Estimated wait: 2 min 10 sec.</p>
        </form>
        <div class="presets"><span class="eyebrow">NEED A NUDGE?</span><button data-preset="gentle">Oddly plausible <span>↗</span></button><button data-preset="weird">Nature’s mistake <span>↗</span></button><button data-preset="danger">Absolute menace <span>↗</span></button></div>
      </aside>
      <section class="specimen-stage" aria-label="Specimen artwork and printable model">
        <div id="status-box" class="status-box hidden"><div class="status-header"><div role="status" aria-live="polite"><strong id="status-title">Discovering a new species</strong><p id="status-message"></p></div><button id="cancel">Cancel</button></div><progress id="status-progress" max="100" value="0" aria-label="Estimated generation progress"></progress><p id="status-estimate" class="status-estimate"></p></div>
        <div class="portrait-card">
          <div class="stage-top"><span class="specimen-tag" id="specimen-tag">SPECIMEN / 001</span><div class="view-tabs" role="tablist" aria-label="Specimen view"><button id="portrait-tab" role="tab" aria-selected="true">Portrait</button><button id="model-tab" role="tab" aria-selected="false" title="Simplified printable interpretation">${icon('cube',14)} 3D Print/CAD</button></div></div>
          <div id="visual" class="visual"><div class="loading-visual"><span class="spinner"></span><p>Opening the cabinet…</p></div></div>
          <div class="stage-bottom"><span id="view-caption">A NEW SPECIES AWAITS</span><button id="reset-view" title="Reset the model camera" class="hidden">${icon('reset',16)} Reset view</button></div>
        </div>
        <div id="model-downloads" class="download-card card"><div><h3>Print files</h3></div><div class="download-actions"><a id="stl-download" class="button primary" aria-label="Download printable STL">${icon('download')} STL</a><a id="cad-download" class="button secondary" aria-label="Download editable OpenSCAD CAD source">${icon('cube')} CAD source</a></div></div>
        <div id="print-info" class="print-info"></div>
        <p id="print-caption" class="print-caption">Simplified printable interpretation. Wings, fins and other details may be approximated. Check the model and supports in your slicer.</p>
      </section>
      <aside id="field-notes" class="field-notes card" aria-label="Specimen field notes"><div class="loading-visual"><span class="spinner"></span></div></aside>
    </section>
    <section id="collection" class="hidden"><div class="collection-heading"><h2>Collection</h2></div><div id="collection-grid" class="collection-grid"></div></section>
    <footer><span>${icon('leaf',14)} FICTIONAL SPECIES</span></footer>
  </main><div id="toast" class="toast hidden" role="alert"></div>`;
}
