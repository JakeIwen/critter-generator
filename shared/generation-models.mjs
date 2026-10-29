export const PROVIDERS = Object.freeze({ CODEX: 'codex', CLAUDE: 'claude' });
export const providerLabels = Object.freeze({ [PROVIDERS.CODEX]: 'Codex', [PROVIDERS.CLAUDE]: 'Claude' });
export const DEFAULT_GENERATION_MODEL = Object.freeze({ provider: PROVIDERS.CODEX, model: 'gpt-6-astra', effort: 'max' });
export const GENERATION_MODEL_KEY = 'generation-model';
export const MENU_MODELS_PER_PROVIDER = 6;
export const HIDDEN_EFFORTS = Object.freeze(['ultra']);

export function menuModels(models, selectedId) {
  const visible = models.slice(0, MENU_MODELS_PER_PROVIDER);
  const selected = models.find(model => model.id === selectedId);
  if (selected && !visible.includes(selected)) visible.push(selected);
  return visible;
}

export function joinModelValue(provider, model) {
  return `${provider}|${model}`;
}

export function splitModelValue(value) {
  const [provider, model] = value.split('|');
  return { provider, model };
}

export const GENERATION_STAGES = Object.freeze({ DESIGN: 'design', DESIGN_REVIEW: 'design-review',
  IMAGE_REVIEW: 'image-review', CAD_DESIGN: 'cad-design', IMAGE: 'image' });
export const TEXT_STAGES = Object.freeze([GENERATION_STAGES.DESIGN, GENERATION_STAGES.DESIGN_REVIEW,
  GENERATION_STAGES.IMAGE_REVIEW, GENERATION_STAGES.CAD_DESIGN]);
const stageProviders = Object.freeze(Object.fromEntries([
  ...TEXT_STAGES.map(stage => [stage, selection => selection.provider]),
  [GENERATION_STAGES.IMAGE, () => PROVIDERS.CODEX],
]));

export function providerForStage(stage, selection) {
  const resolve = stageProviders[stage];
  if (!resolve) throw new Error(`Unknown generation stage: ${stage}`);
  return resolve(selection);
}

const effortLabels = Object.freeze({ none: 'None', minimal: 'Minimal', low: 'Low', medium: 'Medium',
  high: 'High', xhigh: 'Extra high', max: 'Maximum' });
export function effortLabel(effort) {
  return effort == null ? 'Default' : effortLabels[effort] ?? effort.charAt(0).toUpperCase() + effort.slice(1);
}
