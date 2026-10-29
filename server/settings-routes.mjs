import { Router } from 'express';
import { GENERATION_MODEL_KEY } from '../shared/generation-models.mjs';
import { GenerationSelection } from './model-catalog.mjs';
import { generationStats } from './generation-stats.mjs';

export function createSettingsRoutes({ store, catalog, isOwner }) {
  const router = Router();
  const ownerOnly = (req, res, next) => isOwner(req) ? next() : res.status(403).json({ error: 'Owner access only.' });
  router.get('/api/models', ownerOnly, async (req, res) => {
    const models = await catalog.getCatalog({ refresh: req.query.refresh === '1' });
    res.json({ catalog: models, selection: store.generationModel() });
  });
  router.put('/api/settings/generation', ownerOnly, async (req, res) => {
    const parsed = GenerationSelection.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Choose a valid provider, model and effort.' });
    const error = await catalog.validateSelection(parsed.data);
    if (error) return res.status(400).json({ error });
    const selection = store.setMetadata(GENERATION_MODEL_KEY, { ...parsed.data, updatedAt: new Date().toISOString() });
    res.json({ selection });
  });
  router.get('/api/stats', ownerOnly, (_req, res) => res.json(generationStats(store.list('jobs'), store.generationTiming())));
  return router;
}
