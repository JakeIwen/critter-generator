import { sliders } from '../shared/sliders.mjs';
import { presets } from './presets.js';
import { icon } from './icons.js';
import { mountGenerationDirections, MAX_ANIMAL_INSPIRATIONS } from './generation-directions.js';

function wireAnimalChoices(byId, selectedTypes, onChange) {
  const buttons = [...byId('generator-form').querySelectorAll('[data-animal-type]')];
  const titles = new Map(buttons.map(button => [button, button.title]));
  function showTypes() {
    for (const button of buttons) {
      const selected = selectedTypes.has(button.dataset.animalType);
      button.setAttribute('aria-pressed', String(selected));
      button.disabled = !selected && selectedTypes.size >= MAX_ANIMAL_INSPIRATIONS;
      button.title = button.disabled ? 'Deselect one to choose another' : titles.get(button);
    }
    byId('any-animal').setAttribute('aria-pressed', String(selectedTypes.size === 0));
  }
  for (const button of buttons) button.onclick = () => {
    const id = button.dataset.animalType;
    if (selectedTypes.has(id)) selectedTypes.delete(id);
    else if (selectedTypes.size < MAX_ANIMAL_INSPIRATIONS) selectedTypes.add(id); else return;
    showTypes(); onChange();
  };
  byId('any-animal').onclick = () => { selectedTypes.clear(); showTypes(); onChange(); };
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
  const readBase = () => ({ prompt: byId('prompt').value.trim(), intent: byId('prompt').value.trim() ? 'literal' : 'invent',
    animalTypes: [...selectedTypes], ...Object.fromEntries(sliders.map(({ id }) => [id, Number(byId(id).value)])) });
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
      byId('prompt').value = settings.prompt ?? '';
      selectedTypes.clear(); for (const id of (settings.animalTypes ?? []).slice(0, MAX_ANIMAL_INSPIRATIONS)) selectedTypes.add(id);
      directions.applySettings(settings); showTypes(); applySliders(settings);
      byId('generator-form').scrollIntoView({ behavior: 'smooth', block: 'center' });
    },
    setBusy(value) {
      byId('generate').disabled = value; directions.setBusy(value);
      byId('generate').innerHTML = value ? '<span class="spinner"></span> Working…' : `${icon('sparkle')} Generate lifeform ${icon('arrow')}`;
    },
  };
}
