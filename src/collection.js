import { specimenFile } from './api.js';
import { icon } from './icons.js';
import { escape, usedSliders } from './specimen-format.js';

export function renderCollection(byId, specimens, onSelect) {
  byId('collection-grid').innerHTML = specimens.map(specimen => `<button class="collection-item card" data-specimen="${specimen.id}"><div class="collection-image">${specimen.image ? `<img src="${specimenFile(specimen,'portrait.png')}" alt="${escape(specimen.englishName)}" loading="lazy"/>` : `<div class="collection-placeholder">${icon('cube',48)}<span>${specimen.demo ? 'EXAMPLE SCULPTURE' : 'SCULPTURE READY'}</span></div>`}<span>${specimen.demo ? 'EXAMPLE' : new Date(specimen.createdAt).toLocaleDateString(undefined,{month:'short',day:'numeric'})}</span></div><div class="collection-details"><p class="latin">${escape(specimen.latinName)}</p><h3>${escape(specimen.englishName)}</h3><p>${usedSliders(specimen.settings).map(({ id, short }) => `${short} ${specimen.settings[id]}`).join(' <i>·</i> ')} <span>${icon('arrow')}</span></p></div></button>`).join('');
  document.querySelectorAll('[data-specimen]').forEach(button => button.onclick = () => onSelect(specimens.find(specimen => specimen.id === button.dataset.specimen)));
}
