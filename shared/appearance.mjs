// Critter's side of the shared theme model (theme-kit): its knob defaults and
// built-in theme, used by the appearance routes, the page's first-paint style
// and the theme editor adapter.
import { knobSpecs } from 'theme-kit/core';

export const APPEARANCE_KEY = 'appearance';
const critterKnobValues = Object.freeze({ hueNeutral: 305, hueBrand: 315, hueAccent: 70, chroma: 0.8 });
/** The four knobs keep theme-kit's property names; defaults match the :root knobs in src/style.css. */
export const critterKnobs = knobSpecs(Object.fromEntries(Object.entries(critterKnobValues).map(([key, value]) => [key, { default: value }])));
/** Locked themes; the first is the fallback. */
export const builtinThemes = Object.freeze([{ id: 'critter', name: 'Critter', knobs: critterKnobValues }]);
export const isBuiltinTheme = id => builtinThemes.some(theme => theme.id === id);
export const defaultActiveTheme = () => ({ id: builtinThemes[0].id, knobs: { ...builtinThemes[0].knobs } });
