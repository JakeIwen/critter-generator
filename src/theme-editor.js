// Critter's adapter for the shared Appearance & Theme Editor pane (theme-kit),
// loaded on first use from the Settings page.
import { mountThemeEditor } from 'theme-kit';
import { builtinThemes, critterKnobs } from '../shared/appearance.mjs';
import { loadAppearance, themeStore } from './appearance.js';
import { getTheme, setTheme, subscribeTheme } from './theme.js';

const modes = [{ id: 'light', label: 'Light' }, { id: 'dark', label: 'Dark' }];
const adapter = {
  knobs: critterKnobs,
  builtins: builtinThemes,
  store: themeStore,
  mode: {
    options: modes,
    get: getTheme,
    set: id => { if (modes.some(mode => mode.id === id)) setTheme(id); },
    subscribe: subscribeTheme,
  },
};

let editor;
export async function showThemeEditor() {
  await loadAppearance();
  editor ??= mountThemeEditor(adapter);
  editor.show();
}
