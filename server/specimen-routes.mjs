import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import express from 'express';
import { z } from 'zod';
import { Settings } from '../shared/specimen.mjs';
import { createAnatomyPlan, parseAnatomyPlan } from '../shared/anatomy-plan.mjs';
import { PRINT_HEIGHT } from '../shared/print-settings.mjs';
import { JOB_KINDS } from '../shared/generation-timing.mjs';
import { MODEL_ASSET_NAMES, cadIsStale } from '../shared/specimen-assets.mjs';
import { CadRequest } from './cad-stage.mjs';
import { readTrace } from './generation-trace.mjs';

const PortraitRequest = z.object({ instructions: z.string().trim().max(1000).default('') }).strict();
const FILE_TYPES = Object.freeze({ 'portrait.png': 'image/png', 'model.stl': 'model/stl',
  'model.scad': 'text/plain', 'mesh.json': 'application/json', 'record.json': 'application/json' });
const settingsError = `Use valid settings, slider values from 0–100, height ${PRINT_HEIGHT.min}–${PRINT_HEIGHT.max} mm, and a prompt under 1,000 characters.`;

function settingsRequest(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error(settingsError);
  const { plan, ...input } = body;
  const result = Settings.safeParse(input);
  if (!result.success) throw new Error(settingsError);
  const settings = { ...result.data, printModel: false };
  return { settings, plan: plan ? parseAnatomyPlan(plan, settings) : null };
}

function attachmentName(specimen, suffix) {
  const slug = specimen.englishName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'critter';
  return `${slug}.${suffix}`;
}

export function createSpecimenRoutes({ store, jobs }) {
  const router = express.Router();
  const busy = res => {
    if (!jobs.current) return false;
    res.status(409).json({ error: 'A generation is already running.', jobId: jobs.current.job.id }); return true;
  };
  router.get('/api/specimens', (_req, res) => res.json(store.list('specimens')));
  router.get('/api/jobs/:id', (req, res) => {
    const job = store.get('jobs', req.params.id);
    job ? res.json(job) : res.status(404).json({ error: 'Generation not found.' });
  });
  router.post('/api/plan', (req, res) => {
    try {
      const { settings } = settingsRequest(req.body);
      res.json({ plan: createAnatomyPlan(settings, randomUUID(), store.list('specimens')) });
    } catch (error) { res.status(400).json({ error: error.message }); }
  });
  router.post('/api/generate', (req, res) => {
    let request;
    try { request = settingsRequest(req.body); } catch (error) { return res.status(400).json({ error: error.message }); }
    if (!busy(res)) res.status(202).json(jobs.start(request));
  });
  router.post('/api/specimens/:id/portrait', (req, res) => {
    const specimen = store.get('specimens', req.params.id), parsed = PortraitRequest.safeParse(req.body ?? {});
    if (!specimen) return res.status(404).json({ error: 'Specimen not found.' });
    if (!parsed.success) return res.status(400).json({ error: 'Use portrait instructions under 1,000 characters.' });
    if (parsed.data.instructions && !specimen.image) return res.status(409).json({ error: 'Generate the first portrait before editing it.' });
    if (!busy(res)) res.status(202).json(jobs.start({ existing: specimen, settings: specimen.settings,
      instructions: parsed.data.instructions }));
  });
  router.post('/api/specimens/:id/cad', (req, res) => {
    const specimen = store.get('specimens', req.params.id), parsed = CadRequest.safeParse(req.body ?? {});
    if (!specimen) return res.status(404).json({ error: 'Specimen not found.' });
    if (!specimen.image) return res.status(409).json({ error: 'Generate a portrait before requesting its sculpture.' });
    if (!parsed.success) return res.status(400).json({ error: `Choose a height from ${PRINT_HEIGHT.min}–${PRINT_HEIGHT.max} mm and a baseplate checkbox value.` });
    if (!busy(res)) res.status(202).json(jobs.start({ existing: specimen, settings: specimen.settings,
      kind: JOB_KINDS.CAD, cadRequest: parsed.data }));
  });
  router.post('/api/jobs/:id/cancel', (req, res) => {
    jobs.cancel(req.params.id) ? res.json({ ok: true }) : res.status(409).json({ error: 'That generation is no longer running.' });
  });
  mountAssetRoutes(router, store);
  return router;
}

function mountAssetRoutes(router, store) {
  router.get('/api/specimens/:id/files/:name', (req, res) => {
    const { id, name } = req.params, specimen = store.get('specimens', id);
    if (!FILE_TYPES[name] || !specimen || (name === 'portrait.png' && !specimen.image) ||
      (!specimen.print && MODEL_ASSET_NAMES.includes(name))) return res.status(404).json({ error: 'File not found.' });
    if (name === 'record.json') return res.json(specimen);
    const file = name === 'portrait.png' ? store.portraitFile(specimen) : MODEL_ASSET_NAMES.includes(name) ?
      store.modelFile(specimen, name) : store.file('specimens', id, name);
    if (!existsSync(file)) return res.status(404).json({ error: 'File not found.' });
    if (MODEL_ASSET_NAMES.includes(name)) res.setHeader('X-Critter-Cad-Stale', String(cadIsStale(specimen)));
    if (req.query.download === '1') res.attachment(attachmentName(specimen, name.split('.').at(-1)));
    res.type(FILE_TYPES[name]).set('Cache-Control', 'no-store').sendFile(file, { dotfiles: 'allow' });
  });
  router.get('/api/specimens/:id/portraits/:version.png', (req, res) => {
    const specimen = store.get('specimens', req.params.id), version = Number(req.params.version);
    if (!specimen?.image || !Number.isSafeInteger(version) || version < 1) return res.status(404).json({ error: 'Portrait not found.' });
    let file;
    try { file = store.portraitFile(specimen, version); } catch { return res.status(404).json({ error: 'Portrait not found.' }); }
    if (!existsSync(file)) return res.status(404).json({ error: 'Portrait not found.' });
    if (req.query.download === '1') res.attachment(attachmentName(specimen, `portrait-v${version}.png`));
    res.type('image/png').sendFile(file, { dotfiles: 'allow' });
  });
  mountTraceRoutes(router, store);
}

function mountTraceRoutes(router, store) {
  const send = (res, jobId, specimenId) => {
    try {
      const trace = readTrace(store, jobId);
      if (specimenId && trace.specimenId !== specimenId) throw new Error('Wrong specimen.');
      res.attachment(`generation-trace-${jobId}.json`).json(trace);
    } catch { res.status(404).json({ error: 'Generation trace not found.' }); }
  };
  router.get('/api/jobs/:id/trace', (req, res) => send(res, req.params.id));
  router.get('/api/specimens/:id/trace', (req, res) => {
    const specimen = store.get('specimens', req.params.id);
    if (!specimen?.latestTraceJobId) return res.status(404).json({ error: 'No generation trace was recorded for this specimen.' });
    send(res, specimen.latestTraceJobId, specimen.id);
  });
  router.get('/api/specimens/:id/traces/:jobId', (req, res) => send(res, req.params.jobId, req.params.id));
}
