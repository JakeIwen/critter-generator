import { sliders } from '../shared/sliders.mjs';
import { presets } from './presets.js';
import { icon } from './icons.js';
import { mountGenerationDirections } from './generation-directions.js';

function wireAnimalChoices(byId, selectedTypes, onChange) {
  const buttons = [...byId('generator-form').querySelectorAll('[data-animal-type]')];
  function showTypes() {
    for (const button of buttons) button.setAttribute('aria-pressed', String(selectedTypes.has(button.dataset.animalType)));
    byId('any-animal').setAttribute('aria-pressed', String(selectedTypes.size === 0));
    const validLock = selectedTypes.size >= 1 && selectedTypes.size <= 3;
    byId('lock-inspirations').setCustomValidity(byId('lock-inspirations').checked && !validLock ? 'Select one to three animal groups to keep that exact combination.' : '');
  }
  for (const button of buttons) button.onclick = () => {
    const id = button.dataset.animalType;
    if (selectedTypes.has(id)) selectedTypes.delete(id); else selectedTypes.add(id);
    showTypes(); onChange();
  };
  byId('any-animal').onclick = () => { selectedTypes.clear(); showTypes(); onChange(); };
  byId('lock-inspirations').addEventListener('change', showTypes);
  return showTypes;
}

function wireSliders(byId) {
  for (const { id } of sliders) byId(id).oninput = () => {
    byId(`${id}-value`).innerHTML = `${byId(id).value}<small>/100</small>`;
    byId(id).style.setProperty('--value', `${byId(id).value}%`);
  };
  return values => {
    for (const { id, initial } of sliders) { byId(id).value = values[id] ?? initial; byId(id).oninput(); }
  };
}

export function mountGenerationForm(byId, onGenerate, onError = () => {}) {
  const selectedTypes = new Set();
  const readBase = () => ({ prompt: byId('prompt').value.trim(), animalTypes: [...selectedTypes], legless: byId('legless').checked,
    ...Object.fromEntries(sliders.map(({ id }) => [id, Number(byId(id).value)])) });
  const directions = mountGenerationDirections(byId, { readBase, onError });
  const showTypes = wireAnimalChoices(byId, selectedTypes, directions.clearPlan);
  const applySliders = wireSliders(byId);
  document.querySelectorAll('[data-preset]').forEach(button => button.onclick = () => {
    const preset = presets[button.dataset.preset]; byId('prompt').value = preset.prompt;
    applySliders(preset); directions.clearPlan();
    document.querySelectorAll('[data-preset]').forEach(item => item.classList.toggle('chosen', item === button));
  });
  byId('generator-form').onsubmit = event => {
    event.preventDefault();
    const settings = { ...readBase(), ...directions.values() };
    if (byId('generator-form').reportValidity()) onGenerate(settings);
  };
  return {
    applySettings(settings) {
      byId('prompt').value = settings.prompt ?? ''; byId('legless').checked = settings.legless ?? false;
      selectedTypes.clear(); for (const id of settings.animalTypes ?? []) selectedTypes.add(id);
      directions.applySettings(settings); showTypes(); applySliders(settings);
      byId('generator-form').scrollIntoView({ behavior: 'smooth', block: 'center' });
    },
    setBusy(value) {
      byId('generate').disabled = value; directions.setBusy(value);
      byId('generate').innerHTML = value ? '<span class="spinner"></span> Working…' : `${icon('sparkle')} Generate lifeform ${icon('arrow')}`;
    },
  };
}
