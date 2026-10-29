import { z } from 'zod';
import { HIDDEN_EFFORTS, PROVIDERS, providerLabels } from '../shared/generation-models.mjs';
import { safeError } from './codex.mjs';

const ModelId = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:/[\]-]{0,119}$/);
const Effort = z.string().regex(/^[a-z][a-z0-9_-]{0,29}$/);
export const GenerationSelection = z.object({ provider: z.enum(Object.values(PROVIDERS)), model: ModelId,
  effort: Effort.nullable() }).strict();
const ListedModel = z.object({ id: ModelId, resolvedModel: ModelId.nullable().default(null), label: z.string().min(1).max(120), description: z.string().max(1000).nullable(),
  efforts: z.array(Effort), defaultEffort: Effort.nullable(), isDefault: z.boolean() });
export const CATALOG_FRESH_MS = 15 * 60_000;
export const CATALOG_RETRY_MS = 60_000;
const unavailable = provider => ({ provider, available: false, reason: `${providerLabels[provider]} has not been checked yet.`,
  models: [], checkedAt: null });

export class ModelCatalog {
  constructor({ discoverers, now = Date.now, freshnessMs = CATALOG_FRESH_MS, retryMs = CATALOG_RETRY_MS }) {
    this.discoverers = discoverers; this.now = now; this.freshnessMs = freshnessMs; this.retryMs = retryMs;
    this.states = new Map(Object.values(PROVIDERS).map(provider => [provider, unavailable(provider)]));
    this.pending = new Map();
  }
  get refreshing() { return this.pending.size > 0; }
  async getProvider(provider, { refresh = false } = {}) {
    if (this.pending.has(provider)) return this.pending.get(provider);
    const state = this.states.get(provider);
    if (!state) throw new Error('Unknown generation provider.');
    const lifetime = state.available ? this.freshnessMs : this.retryMs;
    if (!refresh && state.checkedAt !== null && this.now() - Date.parse(state.checkedAt) < lifetime) return state;
    const pending = this.discover(provider).finally(() => this.pending.delete(provider));
    this.pending.set(provider, pending);
    return pending;
  }
  async discover(provider) {
    let next;
    try {
      const discover = this.discoverers[provider];
      if (!discover) throw new Error(`${providerLabels[provider]} is not configured on this host.`);
      const result = await discover();
      const models = z.array(ListedModel).parse(Array.isArray(result) ? result : result.models ?? []).map(model => {
        const efforts = model.efforts.filter(effort => !HIDDEN_EFFORTS.includes(effort));
        return { ...model, efforts,
          defaultEffort: HIDDEN_EFFORTS.includes(model.defaultEffort) ? efforts.at(-1) ?? null : model.defaultEffort };
      });
      next = models.length && result.available !== false
        ? { available: true, models, reason: null }
        : { available: false, models: [], reason: safeError(result.reason || `No ${providerLabels[provider]} models are available to this account.`) };
    } catch (error) { next = { available: false, models: [], reason: safeError(error) }; }
    const state = { provider, ...next, checkedAt: new Date(this.now()).toISOString() };
    this.states.set(provider, state);
    return state;
  }
  async getCatalog(options = {}) {
    const providers = await Promise.all(Object.values(PROVIDERS).map(provider => this.getProvider(provider, options)));
    return { providers, refreshing: this.refreshing };
  }
  async validateSelection(input) {
    const parsed = GenerationSelection.safeParse(input);
    if (!parsed.success) return 'Choose a valid provider, model and effort.';
    const { provider, model, effort } = parsed.data;
    // A cached outage must not fail jobs after the provider comes back: re-probe when unavailable.
    const state = await this.getProvider(provider, { refresh: !this.states.get(provider).available });
    if (!state.available) return state.reason;
    const listed = state.models.find(item => item.id === model);
    if (!listed) return `Selected model ${model} is not available to this ${providerLabels[provider]} account. Choose another in Settings.`;
    if (listed.efforts.length ? !listed.efforts.includes(effort) : effort !== null) {
      return listed.efforts.length ? `Choose a supported effort for ${model}: ${listed.efforts.join(', ')}.` : `${model} does not support an effort setting; use null.`;
    }
    return null;
  }
}
