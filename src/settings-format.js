import { PROVIDERS, effortLabel, providerLabels } from '../shared/generation-models.mjs';

export function durationLabel(milliseconds) {
  if (typeof milliseconds !== 'number' || !Number.isFinite(milliseconds)) return '—';
  const seconds = Math.round(milliseconds / 1000);
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

export function localDateTime(value) {
  const date = value ? new Date(value) : null;
  return date && Number.isFinite(date.getTime()) ? date.toLocaleString() : '—';
}

export function modelLabel({ provider, model, effort } = {}) {
  return provider && model ? `${providerLabels[provider] ?? provider} · ${model} · ${effortLabel(effort)}` : '—';
}

const menuModelLabels = Object.freeze({
  [PROVIDERS.CODEX]: model => `${model.id}${model.isDefault ? ' (default)' : ''}`,
  [PROVIDERS.CLAUDE]: model => `${model.label} · ${model.resolvedModel ?? model.id}${model.isDefault && model.label.toLowerCase() !== 'default' ? ' (default)' : ''}`,
});

export function menuModelLabel(provider, model) {
  return menuModelLabels[provider](model);
}
