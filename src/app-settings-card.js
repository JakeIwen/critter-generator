import { APP_SETTINGS, APP_SETTINGS_GROUPS, defaultAppSettings } from '../shared/app-settings.mjs';
import { effortLabel, sortEfforts } from '../shared/generation-models.mjs';
import { api } from './api.js';
import { escape } from './specimen-format.js';

const appSettingsUrl = '/api/settings/app';

function field(key, definition, state) {
  const id = `app-${key}`;
  if (Array.isArray(definition.default)) {
    const efforts = sortEfforts(new Set([...state.efforts, ...state.draft[key]]));
    return `<fieldset class="settings-efforts"><legend title="${escape(definition.help)}">${escape(definition.label)}</legend>
      <div class="settings-effort-choices">${efforts.map(effort => `<label><input type="checkbox" data-app-setting="${key}" value="${escape(effort)}"${state.draft[key].includes(effort) ? ' checked' : ''}>${escape(effortLabel(effort))}</label>`).join('')}</div></fieldset>`;
  }
  return `<label class="app-setting" for="${id}" title="${escape(definition.help)}"><span>${escape(definition.label)}</span>
    <span class="settings-number"><input id="${id}" data-app-setting="${key}" type="number" min="${definition.min}" max="${definition.max}" step="${definition.step}" required value="${escape(state.draft[key])}"><span>${escape(definition.unit)}</span></span></label>`;
}

function markup(state, busy) {
  return `<article class="card settings-card"><h2>App settings</h2><form id="app-settings-form" class="settings-form">
    <fieldset class="app-settings-fields"${busy || state.saving ? ' disabled' : ''}>
    ${Object.entries(APP_SETTINGS_GROUPS).map(([group, label]) => `<fieldset class="settings-group"><legend>${escape(label)}</legend>
      ${Object.entries(APP_SETTINGS).filter(([, definition]) => definition.group === group).map(([key, definition]) => field(key, definition, state)).join('')}
    </fieldset>`).join('')}
    <div class="settings-buttons"><button type="submit" class="button primary">${state.saving ? 'Saving…' : 'Save'}</button>
      <button id="app-settings-reset" type="button" class="button secondary">Reset to defaults</button></div></fieldset>
    <p id="app-settings-status" class="settings-note settings-save-status" role="status">${escape(state.saved)}</p>
  </form></article>`;
}

export function createAppSettingsCard({ update, onError, onSaved }) {
  const state = { values: defaultAppSettings(), draft: defaultAppSettings(), efforts: [], saved: '', saving: false };
  const accept = result => { state.values = result.values; state.draft = structuredClone(result.values); state.efforts = result.efforts; };
  async function save(event) {
    event.preventDefault();
    if (state.saving) return;
    state.saving = true; state.saved = ''; update();
    try {
      accept(await api(appSettingsUrl, { method: 'PUT', body: JSON.stringify(state.draft) }));
      state.saved = 'Saved · app settings apply without a restart';
      await onSaved();
    } catch (error) { onError(error); }
    finally { state.saving = false; update(); }
  }
  return {
    get values() { return state.values; },
    get saving() { return state.saving; },
    render: busy => markup(state, busy),
    async load() { accept(await api(appSettingsUrl)); state.saved = ''; },
    includeEfforts(efforts) { state.efforts = [...new Set([...state.efforts, ...efforts])]; },
    change(target) {
      const key = target.dataset?.appSetting;
      if (!Object.hasOwn(APP_SETTINGS, key)) return false;
      if (target.type === 'checkbox') {
        const hidden = new Set(state.draft[key]);
        if (target.checked) hidden.add(target.value); else hidden.delete(target.value);
        state.draft[key] = [...hidden];
      } else state.draft[key] = target.value === '' ? '' : Number(target.value);
      state.saved = '';
      return true;
    },
    reset() { state.draft = defaultAppSettings(); state.saved = 'Defaults filled · Save to apply'; update(); },
    save,
  };
}
