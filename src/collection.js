import { specimenFile } from './api.js';
import { icon } from './icons.js';
import { escape, usedSliders, hasPrintModel } from './specimen-format.js';

const CONFIRM_DELETE_MS = 5000;

export function renderCollection(byId, specimens, onSelect, owner = false, onDelete) {
  const grid = byId('collection-grid');
  grid.innerHTML = specimens.map(specimen => collectionCard(specimen, owner)).join('');
  grid.querySelectorAll('[data-specimen]').forEach(button => {
    button.onclick = () => onSelect(specimens.find(specimen => specimen.id === button.dataset.specimen));
  });
  grid.querySelectorAll('[data-delete]').forEach(button => {
    const specimen = specimens.find(specimen => specimen.id === button.dataset.delete);
    mountDelete(button, specimen, onDelete);
  });
}

function collectionCard(specimen, owner) {
  const name = escape(specimen.englishName), id = escape(specimen.id);
  return `<article class="collection-item card">
    <div class="collection-image">${specimen.image
      ? `<img src="${specimenFile(specimen, 'portrait.png')}" alt="${name}" loading="lazy"/>`
      : `<div class="collection-placeholder">${icon(hasPrintModel(specimen) ? 'cube' : 'book', 48)}<span>${specimen.demo ? 'EXAMPLE' : hasPrintModel(specimen) ? 'SCULPTURE READY' : 'FIELD NOTES READY'}</span></div>`}
      <span>${specimen.demo ? 'EXAMPLE' : new Date(specimen.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
    </div>
    <div class="collection-details"><p class="latin">${escape(specimen.latinName)}</p>
      <h3><button class="collection-open" type="button" data-specimen="${id}">${name}</button></h3>
      <footer class="collection-footer"><p>${usedSliders(specimen.settings).map(({ id, short }) => `${short} ${specimen.settings[id]}`).join(' <i>·</i> ')} <span>${icon('arrow')}</span></p>
        ${owner && !specimen.demo ? `<button class="collection-delete" type="button" data-delete="${id}" aria-label="Delete ${name}">Delete</button>` : ''}
      </footer>
    </div>
  </article>`;
}

function mountDelete(button, specimen, onDelete) {
  let expires = 0, timer;
  const reset = () => {
    expires = 0; button.textContent = 'Delete'; button.classList.remove('confirming');
    button.setAttribute('aria-label', `Delete ${specimen.englishName}`);
  };
  button.onclick = async event => {
    event.stopPropagation();
    if (button.disabled) return;
    if (Date.now() >= expires) {
      clearTimeout(timer); expires = Date.now() + CONFIRM_DELETE_MS;
      button.textContent = 'Confirm delete'; button.classList.add('confirming');
      button.setAttribute('aria-label', `Confirm delete ${specimen.englishName}`);
      timer = setTimeout(reset, CONFIRM_DELETE_MS); return;
    }
    clearTimeout(timer); button.disabled = true;
    try { await onDelete(specimen); }
    finally { reset(); button.disabled = false; }
  };
}
