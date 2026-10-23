import { sliders } from '../shared/sliders.mjs';
import { presets } from './presets.js';
import { icon } from './icons.js';
import { PRINT_HEIGHT } from '../shared/print-settings.mjs';

export function mountGenerationForm(byId, onGenerate) {
  const selectedTypes = new Set();
  const typeButtons = [...byId('generator-form').querySelectorAll('[data-animal-type]')];
  const showTypes = () => {
    for (const button of typeButtons) button.setAttribute('aria-pressed', String(selectedTypes.has(button.dataset.animalType)));
    byId('any-animal').setAttribute('aria-pressed', String(selectedTypes.size === 0));
  };
  for (const button of typeButtons) button.onclick = () => {
    const id = button.dataset.animalType;
    if (selectedTypes.has(id)) selectedTypes.delete(id); else selectedTypes.add(id);
    showTypes();
  };
  byId('any-animal').onclick = () => { selectedTypes.clear(); showTypes(); };
  byId('print-model').onchange = () => {
    byId('print-settings').disabled = !byId('print-model').checked;
    byId('print-settings').classList.toggle('hidden', !byId('print-model').checked);
  };
  const applySettings = values => {
    for (const { id, initial } of sliders) {
      byId(id).value = values[id] ?? initial;
      byId(id).oninput();
    }
  };
  for (const { id } of sliders) byId(id).oninput = () => {
    byId(`${id}-value`).innerHTML = `${byId(id).value}<small>/100</small>`;
    byId(id).style.setProperty('--value', `${byId(id).value}%`);
  };
  document.querySelectorAll('[data-preset]').forEach(button => button.onclick = () => {
    const preset = presets[button.dataset.preset];
    byId('prompt').value = preset.prompt;
    applySettings(preset);
    document.querySelectorAll('[data-preset]').forEach(item => item.classList.toggle('chosen', item === button));
  });
  byId('generator-form').onsubmit = event => {
    event.preventDefault();
    const settings = { prompt: byId('prompt').value.trim(), baseplate: byId('baseplate').checked,
      animalTypes: [...selectedTypes], legless: byId('legless').checked, printModel: byId('print-model').checked };
    for (const id of [...sliders.map(slider => slider.id), 'height']) settings[id] = Number(byId(id).value);
    if (!settings.printModel && (!Number.isInteger(settings.height) || settings.height < PRINT_HEIGHT.min || settings.height > PRINT_HEIGHT.max)) settings.height = PRINT_HEIGHT.initial;
    onGenerate(settings);
  };
  return {
    applySettings(settings) {
      byId('prompt').value = settings.prompt ?? '';
      byId('height').value = settings.height ?? PRINT_HEIGHT.initial;
      byId('baseplate').checked = settings.baseplate ?? true;
      byId('print-model').checked = settings.printModel ?? true;
      byId('print-model').onchange();
      byId('legless').checked = settings.legless ?? false;
      selectedTypes.clear();
      for (const button of typeButtons) if (settings.animalTypes?.includes(button.dataset.animalType)) selectedTypes.add(button.dataset.animalType);
      showTypes();
      applySettings(settings);
      byId('generator-form').scrollIntoView({ behavior: 'smooth', block: 'center' });
    },
    setBusy(value) {
      byId('generate').disabled = value;
      byId('generate').innerHTML = value ? '<span class="spinner"></span> Discovering…' : `${icon('sparkle')} Generate lifeform ${icon('arrow')}`;
      if (byId('retry-portrait')) byId('retry-portrait').disabled = value;
    },
  };
}
