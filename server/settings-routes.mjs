import { Router } from 'express';
import { AppSettings } from './app-settings.mjs';
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
    // App settings may change while asynchronous model discovery is running.
    if (store.appSettings().hiddenEfforts.includes(parsed.data.effort)) return res.status(400).json({ error: 'This effort is hidden in App settings. Choose another effort.' });
    const selection = store.setMetadata(GENERATION_MODEL_KEY, { ...parsed.data, updatedAt: new Date().toISOString() });
    res.json({ selection });
  });
  router.get('/api/settings/app', ownerOnly, async (_req, res) => {
    await catalog.getCatalog();
    res.json({ values: store.appSettings(), efforts: catalog.effortChoices() });
  });
  router.put('/api/settings/app', ownerOnly, (req, res) => {
    const parsed = AppSettings.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: `Invalid app settings: ${parsed.error.issues.map(issue => `${issue.path.join('.') || 'settings'}: ${issue.message}`).join('; ')}` });
    const { effort } = store.generationModel();
    if (parsed.data.hiddenEfforts.includes(effort)) return res.status(400).json({
      error: `Cannot hide the saved generation effort "${effort}". Save a different generation effort first.` });
    res.json({ values: store.saveAppSettings(parsed.data), efforts: catalog.effortChoices() });
  });
  router.get('/api/stats', ownerOnly, (_req, res) => res.json(generationStats(store.list('jobs'), store.generationTiming())));
  return router;
}
