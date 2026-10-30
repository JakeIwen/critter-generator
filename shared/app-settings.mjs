import { animalTypes } from './animal-types.mjs';

export const APP_SETTINGS_KEY = 'app-settings';
export const APP_SETTINGS_GROUPS = Object.freeze({ timing: 'Progress estimate', generation: 'Generation', models: 'Model menu' });
export const APP_SETTINGS = Object.freeze({
  timingWindow: { label: 'Successful runs to average', help: 'Use the most recent successful full generations after excluding outliers.', unit: 'runs', min: 1, max: 20, step: 1, default: 5, group: 'timing' },
  timingOutlierMinutes: { label: 'Ignore runs longer than', help: 'Longer successful generations do not contribute to the progress estimate.', unit: 'min', min: 1, max: 60, step: 1, default: 6, group: 'timing' },
  initialEstimateSeconds: { label: 'Initial estimate', help: 'Used when no successful generations qualify for the estimate.', unit: 'sec', min: 10, max: 1800, step: 1, default: 130, group: 'timing' },
  generationTimeoutMinutes: { label: 'Model turn timeout', help: 'Maximum time for a new generation turn on either provider. Running turns keep their timeout.', unit: 'min', min: 1, max: 60, step: 1, default: 10, group: 'generation' },
  designAttempts: { label: 'Design attempts', help: 'Total attempts when a model stalls with runaway output; other failures are not retried.', unit: 'attempts', min: 1, max: 5, step: 1, default: 3, group: 'generation' },
  cadRepairAttempts: { label: 'Sculpture repair attempts', help: 'Extra attempts after an invalid sculpture or failed solid build. Existing assets are kept on failure.', unit: 'retries', min: 0, max: 5, step: 1, default: 2, group: 'generation' },
  maxAnimalInspirations: { label: 'Animal inspiration limit', help: 'Maximum selected groups in the generator form. Existing API clients are not restricted.', unit: 'groups', min: 1, max: animalTypes.length, step: 1, default: 3, group: 'generation' },
  menuModelsPerProvider: { label: 'Models per provider', help: 'Show this many models in discovery order, plus the saved model if needed.', unit: 'models', min: 1, max: 30, step: 1, default: 6, group: 'models' },
  hiddenEfforts: { label: 'Hidden efforts', help: 'Checked efforts are hidden from the menu and rejected for new selections. The saved selection must remain visible.', unit: '', min: null, max: null, step: null, default: Object.freeze(['ultra']), group: 'models' },
  catalogFreshMinutes: { label: 'Model list freshness', help: 'Rediscover available models after this long. Refresh models bypasses the cache.', unit: 'min', min: 1, max: 1440, step: 1, default: 15, group: 'models' },
});
export const DEFAULT_APP_SETTINGS = Object.freeze(Object.fromEntries(
  Object.entries(APP_SETTINGS).map(([key, definition]) => [key, definition.default])));
export const defaultAppSettings = () => structuredClone(DEFAULT_APP_SETTINGS);
export const publicAppSettings = ({ maxAnimalInspirations, timingWindow }) => ({ maxAnimalInspirations, timingWindow });
export const inspirationHelp = cap => `Choose up to ${cap} animal group${cap === 1 ? '' : 's'}, or leave Any animal selected to let the generator choose.`;
export const generationTimeoutMessage = minutes => `Generation timed out after ${minutes} minute${minutes === 1 ? '' : 's'}. Please retry.`;
