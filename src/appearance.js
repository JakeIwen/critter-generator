// The theme editor's store: the active theme everyone sees and the owner's
// saved themes, from /api/appearance. The server writes the active knobs into
// each page for first paint; this applies knobs inline only for previews and saves.
import { applyKnobs } from 'theme-kit/core';
import { critterKnobs, defaultActiveTheme } from '../shared/appearance.mjs';
import { api } from './api.js';

const listeners = new Set();
let snapshot = { themes: [], active: defaultActiveTheme() };
let previewKnobs = null;

const show = () => applyKnobs(critterKnobs, previewKnobs ?? snapshot.active.knobs, document.documentElement.style);
// Loading only reads: the page already carries the active knobs. Writes apply what the server saved.
function learn(appearance, apply = false) {
  snapshot = { themes: appearance.themes, active: appearance.active };
  if (apply) show();
  listeners.forEach(listener => listener());
}
const send = (url, method, body) => api(url, { method, ...(body ? { body: JSON.stringify(body) } : {}) })
  .then(appearance => learn(appearance, true));

export const loadAppearance = () => api('/api/appearance').then(appearance => learn(appearance));
export const getAppearance = () => snapshot;
export function subscribeAppearance(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export const themeStore = {
  snapshot: getAppearance,
  subscribe: subscribeAppearance,
  saveTheme: theme => send(`/api/appearance/themes/${encodeURIComponent(theme.id)}`, 'PUT', { theme }),
  deleteTheme: id => send(`/api/appearance/themes/${encodeURIComponent(id)}`, 'DELETE'),
  activate: active => send('/api/appearance/active', 'PUT', { active }),
  preview(knobs) {
    previewKnobs = knobs;
    show();
  },
};
