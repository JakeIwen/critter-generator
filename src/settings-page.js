import { PROVIDERS, effortLabel, providerLabels } from '../shared/generation-models.mjs';
import { api } from './api.js';
import { durationLabel, localDateTime, modelLabel } from './settings-format.js';
import { escape } from './specimen-format.js';

const REFRESH_INTERVAL_MS = 2000;
const REFRESH_LIMIT_MS = 30_000;
const modelsUrl = '/api/models';
const providerState = state => state.catalog?.providers.find(item => item.provider === state.draft.provider);
const selectedModel = state => providerState(state)?.models.find(item => item.id === state.draft.model);
const option = (value, label, selected) => `<option value="${escape(value)}"${selected ? ' selected' : ''}>${escape(label)}</option>`;

function chooseModel(state) {
  const models = providerState(state)?.models ?? [];
  const model = models.find(item => item.id === state.draft.model) ?? models.find(item => item.isDefault) ?? models[0];
  if (!model) return;
  state.draft.model = model.id;
  state.draft.effort = model.efforts.includes(state.draft.effort) ? state.draft.effort : model.defaultEffort ?? model.efforts[0] ?? null;
}

function generationCard(state) {
  const provider = providerState(state), model = selectedModel(state);
  const models = provider?.available ? provider.models : [];
  const efforts = model?.efforts ?? [];
  const busy = state.loading || state.refreshing || state.saving;
  const reasons = (state.catalog?.providers ?? []).filter(item => !item.available)
    .map(item => `<p class="settings-note settings-reason">${escape(providerLabels[item.provider])}: ${escape(item.reason || 'Unavailable.')}</p>`).join('');
  return `<article class="card settings-card">
    <h2>Generation model</h2>
    <form id="settings-form" class="settings-form">
      <label for="settings-provider">Provider<select id="settings-provider"${busy ? ' disabled' : ''}>
        ${Object.values(PROVIDERS).map(id => option(id, providerLabels[id], id === state.draft.provider)).join('')}
      </select></label><div id="settings-reasons">${reasons}</div>
      <label for="settings-model">Model<select id="settings-model"${busy || !models.length ? ' disabled' : ''}>
        ${models.length ? models.map(item => option(item.id, `${item.label} · ${item.id}${item.isDefault ? ' (default)' : ''}`, item.id === state.draft.model)).join('') : option('', 'No models available', true)}
      </select></label>
      <label for="settings-effort"${efforts.length ? '' : ' hidden'}>Effort<select id="settings-effort"${busy || !efforts.length ? ' disabled' : ''}>
        ${efforts.map(effort => option(effort, effortLabel(effort), effort === state.draft.effort)).join('')}
      </select></label>
      <div class="settings-buttons"><button class="button primary" type="submit"${busy ? ' disabled' : ''}>${state.saving ? 'Saving…' : 'Save'}</button>
        <button id="settings-refresh" class="button secondary" type="button"${busy ? ' disabled' : ''}>${state.refreshing ? 'Refreshing…' : 'Refresh models'}</button></div>
    </form>
    <p class="settings-note">Applies to the next job. Portraits always use Codex image generation.</p>
    <p class="settings-note">Current: ${escape(modelLabel(state.selection))}</p>
    ${state.selection?.updatedAt ? `<p class="settings-note">Updated ${escape(localDateTime(state.selection.updatedAt))}</p>` : ''}
    <p class="settings-note settings-save-status" role="status">${escape(state.saved)}</p>
  </article>`;
}

function table(heading, headers, rows) {
  return `<h3>${heading}</h3><div class="table-scroll"><table class="settings-table" aria-label="${heading}"><thead><tr>
    ${headers.map(header => `<th scope="col">${header}</th>`).join('')}</tr></thead><tbody>
    ${rows.map(row => `<tr>${row.map(cell => `<td>${escape(cell)}</td>`).join('')}</tr>`).join('')}
  </tbody></table></div>`;
}

function statsCard(stats) {
  if (!stats) return '';
  const timing = stats.timing ?? {};
  return `<article class="card settings-card settings-stats"><h2>Generation stats</h2>
    <p class="settings-note">Estimate ${escape(durationLabel(timing.estimatedDurationMs))} · ${escape(timing.sampleCount ?? 0)} samples · ${escape(timing.excludedOutliers ?? 0)} excluded over six minutes</p>
    ${!stats.recent.length ? '<p class="settings-note">No jobs recorded yet.</p>' : ''}
    ${table('Totals', ['Kind', 'Status', 'Count'], stats.totals.map(row => [row.kind, row.status, row.count]))}
    ${table('Durations by kind', ['Kind', 'Count', 'Average', 'Median', 'Min', 'Max'], stats.durations.map(row => [row.kind, row.count, ...[row.averageMs, row.medianMs, row.minMs, row.maxMs].map(durationLabel)]))}
    ${table('Recent jobs', ['Kind', 'Status', 'Started', 'Duration', 'Model'], stats.recent.map(row => [row.kind, row.status, localDateTime(row.createdAt), durationLabel(row.durationMs), modelLabel(row)]))}
    ${table('By model', ['Model', 'Kind', 'Count', 'Failures', 'Average'], stats.byModel.map(row => [modelLabel(row), row.kind, row.count, row.failures, durationLabel(row.averageMs)]))}
  </article>`;
}

function render(section, state) {
  section.innerHTML = `<div class="collection-heading"><h2>Settings</h2></div>
    <p class="settings-error" role="alert">${escape(state.error)}</p>
    ${state.loading ? '<p class="settings-note" role="status">Loading settings…</p>' : ''}
    ${state.catalog ? `<div class="settings-grid">${generationCard(state)}${statsCard(state.stats)}</div>` : ''}`;
}

async function fetchModels(state, refresh, update) {
  const deadline = Date.now() + REFRESH_LIMIT_MS;
  let response = await api(`${modelsUrl}${refresh ? '?refresh=1' : ''}`, { signal: AbortSignal.timeout(REFRESH_LIMIT_MS) });
  while (true) {
    state.catalog = response.catalog;
    state.selection = response.selection;
    chooseModel(state);
    state.refreshing = response.catalog.refreshing;
    update();
    if (!state.refreshing) return;
    if (Date.now() + REFRESH_INTERVAL_MS >= deadline) throw new Error('Model refresh timed out. Try Refresh models again.');
    await new Promise(resolve => setTimeout(resolve, REFRESH_INTERVAL_MS));
    response = await api(modelsUrl, { signal: AbortSignal.timeout(Math.max(1, deadline - Date.now())) });
  }
}

export function mountSettingsPage(byId, { onError }) {
  const section = byId('settings');
  const state = { catalog: null, stats: null, selection: null, draft: {}, error: '', saved: '', loading: false, refreshing: false, saving: false };
  const update = () => render(section, state);
  const fail = error => { state.error = error.message; onError(error.message); };
  async function show() {
    if (state.loading || state.refreshing || state.saving) return;
    state.loading = true; state.error = ''; state.saved = ''; update();
    try {
      const [models, stats] = await Promise.all([api(modelsUrl), api('/api/stats')]);
      state.catalog = models.catalog; state.selection = models.selection;
      state.draft = { ...models.selection }; state.stats = stats; chooseModel(state);
      if (models.catalog.refreshing) await fetchModels(state, false, update);
    } catch (error) { fail(error); }
    finally { state.loading = false; state.refreshing = false; update(); }
  }
  async function refresh() {
    state.refreshing = true; state.error = ''; state.saved = ''; update();
    try { await fetchModels(state, true, update); }
    catch (error) { fail(error); }
    finally { state.refreshing = false; update(); }
  }
  async function save(event) {
    event.preventDefault();
    if (state.loading || state.refreshing || state.saving) return;
    state.saving = true; state.error = ''; state.saved = ''; update();
    try {
      const { provider, model, effort } = state.draft;
      const result = await api('/api/settings/generation', { method: 'PUT', body: JSON.stringify({ provider, model, effort: selectedModel(state)?.efforts.length ? effort : null }) });
      state.selection = result.selection; state.draft = { ...result.selection };
      state.saved = `Saved · uses ${result.selection.model} at ${effortLabel(result.selection.effort)} for new jobs`;
    } catch (error) { fail(error); }
    finally { state.saving = false; update(); }
  }
  section.onsubmit = save;
  section.onchange = event => {
    const field = { 'settings-provider': 'provider', 'settings-model': 'model', 'settings-effort': 'effort' }[event.target.id];
    if (!field) return;
    state.draft[field] = event.target.value; state.saved = ''; chooseModel(state); update();
  };
  section.onclick = event => { if (event.target.closest('#settings-refresh')) void refresh(); };
  return { show };
}
