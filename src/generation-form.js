import { sliders } from '../shared/sliders.mjs';
import { presets } from './content.js';
import { icon } from './icons.js';

export function mountGenerationForm(byId, onGenerate) {
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
    const settings = { prompt: byId('prompt').value.trim() };
    for (const id of [...sliders.map(slider => slider.id), 'height']) settings[id] = Number(byId(id).value);
    onGenerate(settings);
  };
  return {
    applySettings(settings) {
      byId('prompt').value = settings.prompt;
      byId('height').value = settings.height;
      applySettings(settings);
      byId('generator-form').scrollIntoView({ behavior: 'smooth', block: 'center' });
    },
    setBusy(value) {
      byId('generate').disabled = value;
      byId('generate').innerHTML = value ? '<span class="spinner"></span> Discovering…' : `${icon('sparkle')} Create a critter ${icon('arrow')}`;
      if (byId('retry-portrait')) byId('retry-portrait').disabled = value;
    },
  };
}
