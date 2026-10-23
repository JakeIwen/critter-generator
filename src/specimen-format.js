import { sliders } from '../shared/sliders.mjs';

export const escape = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));

export const usedSliders = (settings = {}) => sliders.filter(({ id }) => settings[id] !== undefined);

export const hasPrintModel = specimen => Boolean(specimen?.print && specimen?.anatomy);
