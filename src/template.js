import { PAGE_PATHS } from '../shared/page-routes.mjs';
import { sliders } from '../shared/sliders.mjs';
import { generationDirectionsMarkup, MAX_ANIMAL_INSPIRATIONS } from './generation-directions.js';
import { animalTypes } from '../shared/animal-types.mjs';
import { icon } from './icons.js';
import { escape } from './specimen-format.js';

function slider({ id, name, initial: value, low, high }) {
  return `<div class="slider-control ${id}"><div class="slider-label"><label for="${id}">${name}</label><output id="${id}-value" for="${id}">${value}<small>/100</small></output></div><input id="${id}" type="range" min="0" max="100" value="${value}" style="--value:${value}%"/><div class="range-labels"><span>${low}</span><span>${high}</span></div></div>`;
}

function animalChoices() {
  return `<details class="inspiration-details"><summary title="Choose up to ${MAX_ANIMAL_INSPIRATIONS} animal groups to use together.">Animal inspiration <span class="optional-tag">OPTIONAL · MAX ${MAX_ANIMAL_INSPIRATIONS}</span></summary>
    <div class="animal-chips"><button id="any-animal" class="animal-chip" type="button" aria-pressed="true">Any animal</button>${animalTypes.map(type => `<button class="animal-chip" type="button" data-animal-type="${type.id}" aria-pressed="false" title="${escape(type.traits)}">${escape(type.label)}</button>`).join('')}</div>
  </details>`;
}

export function renderStudio(root) {
  root.innerHTML = `
  <header class="topbar">
    <a href="${PAGE_PATHS.lab}" data-page="lab" class="brand" aria-label="Critter Generator home"><span class="brand-mark">${icon('fish',28)}</span><span>CRITTER<span class="brand-bottom">GENERATOR</span></span></a>
    <nav aria-label="Main navigation"><a class="nav active" data-page="lab" href="${PAGE_PATHS.lab}">The laboratory</a><a class="nav" data-page="collection" href="${PAGE_PATHS.collection}">Collection <span id="count">0</span></a><a class="nav" data-page="settings" href="${PAGE_PATHS.settings}" id="settings-nav" hidden>Settings</a></nav>
    <div class="topbar-tools"><a id="logout" class="logout" href="${PAGE_PATHS.logout}" hidden>Log out</a><button id="connection" class="connection" title="Check the Codex connection"><i></i><span>Connecting to Codex</span>${icon('reset',14)}</button><div id="theme-toggle" class="theme-switch" role="radiogroup" aria-label="Theme"><button type="button" role="radio" data-theme="light" aria-checked="false" tabindex="-1" title="Light theme">${icon('sun',16)}<span class="theme-label">Light</span></button><button type="button" role="radio" data-theme="dark" aria-checked="true" tabindex="0" title="Dark theme">${icon('moon',16)}<span class="theme-label">Dark</span></button></div></div>
  </header>
  <main>
    <h1 class="page-title">Critter Generator</h1>
    <section id="laboratory" class="workspace">
      <aside class="controls card">
        <div class="section-heading"><h2>New lifeform</h2>${icon('sparkle')}</div>
        <form id="generator-form">
          <label class="input-label" for="prompt">Describe an idea <span class="optional-tag">OPTIONAL</span></label>
          <textarea id="prompt" maxlength="1000" rows="3" placeholder="A translucent reef hunter that grows false eyes to lure its prey…"></textarea>
          <div class="sliders">
            ${sliders.map(slider).join('')}
          </div>
          ${generationDirectionsMarkup(animalChoices())}
          <button id="generate" class="button primary" type="submit" title="Generate field notes and a portrait. Request CAD after the portrait is ready.">${icon('sparkle')} Generate lifeform ${icon('arrow')}</button>
          <p id="generation-estimate" class="generation-note"></p>
        </form>
        <div class="presets"><span class="eyebrow">NEED A NUDGE?</span><button data-preset="gentle">Oddly plausible <span>↗</span></button><button data-preset="weird">Nature’s mistake <span>↗</span></button><button data-preset="danger">Absolute menace <span>↗</span></button></div>
      </aside>
      <section class="specimen-stage" aria-label="Specimen portrait and on-demand CAD">
        <div id="status-box" class="status-box hidden"><div class="status-header"><div role="status" aria-live="polite"><strong id="status-title">Discovering a new species</strong><p id="status-message"></p></div><button id="cancel">Cancel</button></div><progress id="status-progress" max="100" value="0" aria-label="Estimated generation progress"></progress><p id="status-estimate" class="status-estimate"></p></div>
        <div class="portrait-card">
          <div class="stage-top"><span class="specimen-tag" id="specimen-tag">SPECIMEN / 001</span><div class="view-tabs" role="tablist" aria-label="Specimen view"><button id="portrait-tab" role="tab" aria-selected="true">Portrait</button><button id="model-tab" role="tab" aria-selected="false" title="Simplified printable interpretation">${icon('cube',14)} 3D model</button></div></div>
          <div id="visual" class="visual"><div class="loading-visual"><span class="spinner"></span><p>Opening the cabinet…</p></div></div>
          <div class="stage-bottom"><span id="view-caption">A NEW SPECIES AWAITS</span><button id="reset-view" title="Reset the model camera" class="hidden">${icon('reset',16)} Reset view</button></div>
        </div>
        <div id="specimen-actions"></div>
        <div id="model-downloads" class="download-card card"><div><h3>Print files</h3></div><div class="download-actions"><a id="stl-download" class="button primary" aria-label="Download printable STL">${icon('download')} STL</a><a id="cad-download" class="button secondary" aria-label="Download editable OpenSCAD CAD source">${icon('cube')} CAD source</a></div></div>
        <div id="print-info" class="print-info"></div>
        <p id="print-caption" class="print-caption">CAD approximates the current portrait. Inspect the model and supports in your slicer before printing.</p>
      </section>
      <aside id="field-notes" class="field-notes card" aria-label="Specimen field notes"><div class="loading-visual"><span class="spinner"></span></div></aside>
    </section>
    <section id="collection" class="hidden"><div class="collection-heading"><h2>Collection</h2></div><div id="collection-grid" class="collection-grid"></div></section>
    <section id="settings" class="hidden"></section>
  </main><div id="toast" class="toast hidden" role="alert"></div>`;
}
