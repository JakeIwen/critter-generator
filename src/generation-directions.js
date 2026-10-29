import { api } from './api.js';
import { escape } from './specimen-format.js';
import { icon } from './icons.js';
import { animalTypeById } from '../shared/animal-types.mjs';
import { compositionModeOptions, aspectRatioOptions, directionOptions,
  MAX_REQUIREMENT_COUNT, MAX_REQUIREMENT_LENGTH } from '../shared/generation-choices.mjs';

export const MAX_ANIMAL_INSPIRATIONS = 3;

const selectOptions = choices => choices.map(({ id, label, description }) => `<option value="${escape(id)}"${description ? ` title="${escape(description)}"` : ''}>${escape(label)}</option>`).join('');
const lockOptions = choices => `<option value="">Choose for me</option>${selectOptions(choices)}`;
const featureLines = text => [...new Set(text.split('\n').map(line => line.trim()).filter(Boolean))];
const directionLabel = (kind, id) => directionOptions[kind].find(choice => choice.id === id)?.label ?? 'Follow description';
const featureTextLength = MAX_REQUIREMENT_COUNT * (MAX_REQUIREMENT_LENGTH + 1) - 1;

export function generationDirectionsMarkup(inspirationMarkup) {
  return `<div class="generation-options">
    <div class="option-pair"><label for="composition-mode">Composition<select id="composition-mode">${selectOptions(compositionModeOptions)}</select></label><label for="aspect-ratio">Frame<select id="aspect-ratio">${selectOptions(aspectRatioOptions)}</select></label></div></div>
    <details class="direction-details"><summary>Requirements & direction controls</summary><div class="direction-fields">
      ${inspirationMarkup}
      <label class="field-label" for="required-features"><span>Must include</span><span class="optional-tag">OPTIONAL</span><span class="info-hint" tabindex="0" role="img" aria-label="One requirement per line, up to ${MAX_REQUIREMENT_COUNT}. Carried into both the species description and portrait." title="One requirement per line, up to ${MAX_REQUIREMENT_COUNT}. Carried into both the species description and portrait.">?</span></label><textarea id="required-features" rows="2" maxlength="${featureTextLength}" placeholder="Exactly four legs&#10;A single white tail ring"></textarea>
      <label class="field-label" for="excluded-features"><span>Must exclude</span><span class="optional-tag">OPTIONAL</span><span class="info-hint" tabindex="0" role="img" aria-label="One exclusion per line, up to ${MAX_REQUIREMENT_COUNT}. Kept out of both the species description and portrait." title="One exclusion per line, up to ${MAX_REQUIREMENT_COUNT}. Kept out of both the species description and portrait.">?</span></label><textarea id="excluded-features" rows="2" maxlength="${featureTextLength}" placeholder="Wings&#10;Extra limbs"></textarea>
      <label for="lock-viewpoint">Camera<select id="lock-viewpoint">${lockOptions(directionOptions.viewpoint)}</select></label>
      <label for="lock-encounter">Activity<select id="lock-encounter">${lockOptions(directionOptions.encounter)}</select></label>
      <label for="lock-silhouette">Body outline<select id="lock-silhouette">${lockOptions(directionOptions.silhouette)}</select></label>
    </div></details>
    <div class="plan-controls"><button id="preview-plan" class="button secondary" type="button" title="Sample the camera, encounter, body outline and inspiration this generation would use. Your explicit choices are kept.">${icon('reset',14)} <span>Preview directions</span></button><p id="plan-preview" class="plan-preview" role="status" aria-live="polite">Directions are chosen when you generate.</p></div>`;
}

function validateFeatureLines(node) {
  const lines = featureLines(node.value);
  node.setCustomValidity(lines.length > MAX_REQUIREMENT_COUNT || lines.some(line => line.length > MAX_REQUIREMENT_LENGTH) ?
    `Use up to ${MAX_REQUIREMENT_COUNT} requirements, with no more than ${MAX_REQUIREMENT_LENGTH} characters per line.` : '');
  return lines;
}

function describePlan(plan) {
  const groups = (plan.inspirationIds ?? []).map(id => animalTypeById[id]?.label ?? id);
  const directions = [['silhouette', plan.silhouette], ['viewpoint', plan.portrait?.viewpoint], ['encounter', plan.portrait?.encounter]].filter(([, id]) => id).map(([kind, id]) => directionLabel(kind, id));
  return [groups.length ? groups.join(' + ') : 'Animal form follows your description', ...directions, plan.challenge].filter(Boolean).join(' · ');
}

export function mountGenerationDirections(byId, { readBase, onError }) {
  let plan = null;
  let previewing = false;
  let busy = false;
  let requestVersion = 0;
  const syncPreviewButton = () => {
    byId('preview-plan').disabled = busy || previewing;
    byId('preview-plan').querySelector('span').textContent = plan ? 'New directions' : 'Preview directions';
  };
  const clearPlan = () => { plan = null; requestVersion++; byId('plan-preview').textContent = 'Directions are chosen when you generate.'; syncPreviewButton(); };
  function values() {
    return {
      compositionMode: byId('composition-mode').value, aspectRatio: byId('aspect-ratio').value,
      requiredFeatures: validateFeatureLines(byId('required-features')), excludedFeatures: validateFeatureLines(byId('excluded-features')),
      directionLocks: { viewpoint: byId('lock-viewpoint').value || null, encounter: byId('lock-encounter').value || null, silhouette: byId('lock-silhouette').value || null, inspirations: readBase().animalTypes.length > 0 },
    };
  }
  for (const id of ['required-features', 'excluded-features']) byId(id).addEventListener('input', () => validateFeatureLines(byId(id)));
  byId('generator-form').addEventListener('input', clearPlan);
  byId('generator-form').addEventListener('change', clearPlan);
  byId('generator-form').addEventListener('invalid', event => {
    for (let details = event.target.closest('details'); details; details = details.parentElement?.closest('details')) details.open = true;
  }, true);
  byId('preview-plan').onclick = async () => {
    const settings = { ...readBase(), ...values() };
    if (!byId('generator-form').reportValidity()) return;
    const version = ++requestVersion;
    previewing = true; syncPreviewButton(); byId('plan-preview').textContent = 'Choosing directions…';
    try {
      const result = await api('/api/plan', { method: 'POST', body: JSON.stringify(settings) });
      if (version !== requestVersion) return;
      plan = result.plan; byId('plan-preview').textContent = describePlan(plan);
    } catch (error) { if (version === requestVersion) { clearPlan(); onError(error.message); } }
    finally { previewing = false; syncPreviewButton(); }
  };
  return {
    clearPlan,
    values: () => ({ ...values(), ...(plan ? { plan } : {}) }),
    setBusy(value) { busy = value; if (value && previewing) clearPlan(); syncPreviewButton(); },
    applySettings(settings) {
      byId('composition-mode').value = settings.compositionMode ?? 'wildlife'; byId('aspect-ratio').value = settings.aspectRatio ?? '1:1';
      byId('required-features').value = (settings.requiredFeatures ?? []).join('\n'); byId('excluded-features').value = (settings.excludedFeatures ?? []).join('\n');
      for (const id of ['required-features', 'excluded-features']) validateFeatureLines(byId(id));
      for (const key of ['viewpoint', 'encounter', 'silhouette']) byId(`lock-${key}`).value = settings.directionLocks?.[key] ?? '';
      clearPlan();
    },
  };
}
