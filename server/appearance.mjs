// Appearance persistence under app_metadata key `appearance`: the active theme
// everyone sees and the owner's saved themes. The active theme's knobs are also
// written into each served page so viewers never see the default colors first.
import { formatKnob, knobKeys, normalizeActiveTheme, normalizeThemes } from 'theme-kit/core';
import { APPEARANCE_KEY, critterKnobs, defaultActiveTheme, isBuiltinTheme } from '../shared/appearance.mjs';

export function readAppearance(store) {
  const value = store.metadata(APPEARANCE_KEY) ?? {};
  return {
    active: normalizeActiveTheme(critterKnobs, value.active, defaultActiveTheme()),
    themes: normalizeThemes(critterKnobs, value.themes).filter(theme => !isBuiltinTheme(theme.id)),
  };
}

export const saveAppearance = (store, appearance) => { store.setMetadata(APPEARANCE_KEY, appearance); return appearance; };

/** A first-paint rule for the active knobs; the values are validated numbers, never raw input. */
export function themeStyleTag({ knobs }) {
  const declarations = knobKeys.map(key => `${critterKnobs[key].property}:${formatKnob(critterKnobs[key], knobs[key])}`).join(';');
  return `<style id="theme-knobs">:root{${declarations}}</style>`;
}

export function withThemeStyle(html, active) {
  const tag = themeStyleTag(active);
  return html.includes('</head>') ? html.replace('</head>', `${tag}</head>`) : html.replace(/^(<!doctype html>)?/i, match => match + tag);
}
