// Theme editor endpoints. Every signed-in viewer can read the appearance;
// only the owner changes it.
import { Router } from 'express';
import { activeThemeProblem, normalizeKnobs, themeProblem } from 'theme-kit/core';
import { critterKnobs, isBuiltinTheme } from '../shared/appearance.mjs';
import { readAppearance, saveAppearance } from './appearance.mjs';

export function createAppearanceRoutes({ store, isOwner }) {
  const router = Router();
  const ownerOnly = (req, res, next) => isOwner(req) ? next() : res.status(403).json({ error: 'Owner access only.' });
  const fail = (res, error, status = 400) => res.status(status).json({ error });
  router.get('/api/appearance', (_req, res) => res.json(readAppearance(store)));
  router.put('/api/appearance/active', ownerOnly, (req, res) => {
    const appearance = readAppearance(store);
    const active = req.body?.active;
    const problem = activeThemeProblem(critterKnobs, active);
    if (problem) return fail(res, problem);
    if (!isBuiltinTheme(active.id) && !appearance.themes.some(theme => theme.id === active.id)) return fail(res, `No theme with id ${active.id}`);
    res.json(saveAppearance(store, { ...appearance, active: { id: active.id, knobs: normalizeKnobs(critterKnobs, active.knobs) } }));
  });
  router.put('/api/appearance/themes/:id', ownerOnly, (req, res) => {
    const theme = req.body?.theme;
    const problem = themeProblem(critterKnobs, theme);
    if (problem) return fail(res, problem);
    if (theme.id !== req.params.id) return fail(res, 'Theme id must match the URL');
    if (isBuiltinTheme(theme.id)) return fail(res, "Built-in themes can't be changed");
    const appearance = readAppearance(store);
    const saved = { id: theme.id, name: theme.name.trim(), knobs: normalizeKnobs(critterKnobs, theme.knobs) };
    const themes = appearance.themes.some(item => item.id === saved.id)
      ? appearance.themes.map(item => item.id === saved.id ? saved : item)
      : [...appearance.themes, saved];
    res.json(saveAppearance(store, { ...appearance, themes }));
  });
  router.delete('/api/appearance/themes/:id', ownerOnly, (req, res) => {
    if (isBuiltinTheme(req.params.id)) return fail(res, "Built-in themes can't be deleted");
    const appearance = readAppearance(store);
    if (!appearance.themes.some(theme => theme.id === req.params.id)) return fail(res, `No saved theme with id ${req.params.id}`, 404);
    res.json(saveAppearance(store, { ...appearance, themes: appearance.themes.filter(theme => theme.id !== req.params.id) }));
  });
  return router;
}
