import express from 'express';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { Settings, GenerationSpecimen, specimenSchema, creaturePrompt, illustrationPrompt, example } from '../shared/specimen.mjs';
import { Codex, imageBytes, safeError } from './codex.mjs';
import { Store } from './store.mjs';
import { DESIGN_VERSION } from './geometry.mjs';
import { createAccessVerifier } from './access.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const port = Number(process.env.PORT || 4329);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('PORT must be an integer from 1024 to 65535.');
const store = new Store(process.env.CRITTER_DATA_DIR || path.join(root, '.local'));
const codex = new Codex(path.join(store.root, 'workspace'));
const app = express();
const stopToken = randomUUID();
app.disable('x-powered-by');
const origins = new Set([`http://127.0.0.1:${port}`, `http://localhost:${port}`, 'http://127.0.0.1:5173', 'http://localhost:5173']);
const localHosts = [`127.0.0.1:${port}`, `localhost:${port}`];
// Optional public hosting behind Cloudflare Access (e.g. https://critter.lionfeather.dev).
// Requests for that host must carry a valid Access token; localhost stays as before.
const publicOrigin = process.env.PUBLIC_ORIGIN ? new URL(process.env.PUBLIC_ORIGIN) : null;
const verifyAccess = publicOrigin
  ? createAccessVerifier({ teamDomain: process.env.ACCESS_TEAM_DOMAIN, audience: process.env.ACCESS_AUD })
  : null;
if (publicOrigin) origins.add(publicOrigin.origin);
app.use(async (req, res, next) => {
  const isPublic = publicOrigin && req.headers.host === publicOrigin.host;
  if (!isPublic && !localHosts.includes(req.headers.host)) return res.status(403).json({ error: 'Localhost access only.' });
  if (isPublic) {
    try { await verifyAccess(req.headers['cf-access-jwt-assertion']); } catch { return res.status(403).json({ error: 'Your sign-in has expired. Reload the page to sign in again.' }); }
  }
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  // Keep proxies such as Cloudflare from injecting scripts (e.g. analytics beacons) into pages.
  res.setHeader('Cache-Control', 'no-transform');
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; worker-src 'self' blob:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'");
  if (req.headers.origin && !origins.has(req.headers.origin)) return res.status(403).json({ error: 'Cross-origin access denied.' });
  if (!['GET', 'HEAD'].includes(req.method) && req.headers['x-critter-request'] !== '1') return res.status(403).json({ error: 'Missing app request header.' });
  next();
});
app.use(express.json({ limit: '16kb' }));
app.use('/api', (_req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });

let current = null;
for (const job of store.list('jobs')) {
  if (['queued', 'running'].includes(job.status)) store.save('jobs', job.id, { ...job, status: 'interrupted', message: 'The server restarted. Any completed specimen files have been kept.', finishedAt: new Date().toISOString() });
}
if (!store.get('specimens', 'example-lantern')) {
  const print = await store.model('example-lantern', example.anatomy, 100);
  store.save('specimens', 'example-lantern', { ...example, id: 'example-lantern', demo: true, image: false, print,
    settings: { prompt: '', absurdity: 65, deviancy: 35, lethality: 20, height: 100 }, createdAt: '2026-01-01T00:00:00.000Z' });
}
// Generated specimens keep the model they were made with; the example follows the current print recipe.
if (store.get('specimens', 'example-lantern').print.designVersion !== DESIGN_VERSION) {
  const print = await store.model('example-lantern', example.anatomy, 100);
  store.save('specimens', 'example-lantern', { ...store.get('specimens', 'example-lantern'), print });
}
// The example ships with a Codex-generated portrait so new installs aren't blank.
const examplePortrait = path.join(root, 'server/assets/example-lantern-portrait.png');
const exampleRecord = store.get('specimens', 'example-lantern');
if (!exampleRecord.image && existsSync(examplePortrait)) {
  store.portrait('example-lantern', readFileSync(examplePortrait));
  store.save('specimens', 'example-lantern', { ...exampleRecord, image: true, imageError: null });
}

app.get('/api/status', (_req, res) => res.json({ ...codex.state, activeJob: current?.job.id || null }));
app.post('/api/shutdown', (req, res) => {
  if (req.headers['x-critter-stop-token'] !== stopToken) return res.status(403).json({ error: 'Invalid instance token.' });
  res.json({ stopped: true }); setTimeout(shutdown, 50);
});
app.post('/api/connect', async (_req, res) => {
  try { res.json(await codex.connect()); } catch (e) { res.status(503).json({ error: safeError(e) }); }
});
app.get('/api/specimens', (_req, res) => res.json(store.list('specimens')));
app.get('/api/jobs/:id', (req, res) => {
  const job = store.get('jobs', req.params.id);
  job ? res.json(job) : res.status(404).json({ error: 'Generation not found.' });
});
const files = { 'portrait.png': 'image/png', 'model.stl': 'model/stl', 'model.scad': 'text/plain', 'mesh.json': 'application/json', 'record.json': 'application/json' };
app.get('/api/specimens/:id/files/:name', (req, res) => {
  const { id, name } = req.params;
  if (!files[name]) return res.status(404).json({ error: 'File not found.' });
  const specimen = store.get('specimens', id);
  if (!specimen || (name === 'portrait.png' && !specimen.image)) return res.status(404).json({ error: 'File not found.' });
  const file = store.file('specimens', id, name);
  if (!existsSync(file)) return res.status(404).json({ error: 'File not found.' });
  res.type(files[name]);
  if (req.query.download === '1') {
    const slug = specimen.englishName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'critter';
    res.attachment(`${slug}.${name.split('.').at(-1)}`);
  }
  if (name === 'record.json') return res.json(specimen);
  res.sendFile(file, { dotfiles: 'allow' });
});
app.post('/api/generate', (req, res) => {
  const parsed = Settings.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Use slider values from 0–100, height 60–180 mm, and a prompt under 1,000 characters.' });
  if (current) return res.status(409).json({ error: 'A specimen is already being generated.', jobId: current.job.id });
  res.status(202).json(startJob(parsed.data));
});
app.post('/api/specimens/:id/portrait', (req, res) => {
  const specimen = store.get('specimens', req.params.id);
  if (!specimen) return res.status(404).json({ error: 'Specimen not found.' });
  if (specimen.image) return res.status(409).json({ error: 'This specimen already has a portrait.' });
  if (current) return res.status(409).json({ error: 'A specimen is already being generated.', jobId: current.job.id });
  res.status(202).json(startJob(specimen.settings, specimen));
});
app.post('/api/jobs/:id/cancel', (req, res) => {
  if (current?.job.id !== req.params.id) return res.status(409).json({ error: 'That generation is no longer running.' });
  current.controller.abort(); update(current.job, { message: 'Cancelling…' }); res.json({ ok: true });
});

function update(job, data) { Object.assign(job, data); store.save('jobs', job.id, job); }
const DESIGN_ATTEMPTS = 3;
async function designWithRetries(job, settings, signal) {
  for (let attempt = 1; ; attempt++) {
    try {
      return await codex.run({ prompt: creaturePrompt(settings), schema: specimenSchema, signal,
        onThread: threadId => update(job, { designThreadId: threadId }) });
    } catch (e) {
      if (e.code !== 'runaway_output' || attempt >= DESIGN_ATTEMPTS || signal.aborted) throw e;
      update(job, { message: `Codex stalled; trying again (attempt ${attempt + 1} of ${DESIGN_ATTEMPTS})…` });
    }
  }
}
function startJob(settings, existing) {
  const job = { id: randomUUID(), status: 'queued', stage: 'design', message: 'Connecting to Codex…', createdAt: new Date().toISOString(), specimenId: existing?.id || null };
  const controller = new AbortController();
  current = { job, controller }; store.save('jobs', job.id, job);
  void execute(job, settings, existing, controller.signal);
  return { jobId: job.id };
}
async function execute(job, settings, existing, signal) {
  let specimen = existing;
  try {
    update(job, { status: 'running', message: 'Inventing anatomy and writing field notes…' });
    if (!existing) {
      const generated = await designWithRetries(job, settings, signal);
      if (signal.aborted) throw new Error('Generation cancelled.');
      let parsed;
      try { parsed = GenerationSpecimen.parse(JSON.parse(generated.text)); } catch { throw new Error('Codex returned an invalid specimen. Please try again.'); }
      update(job, { stage: 'model', message: 'Sculpting and checking the printable solid…' });
      const id = randomUUID();
      const print = await store.model(id, parsed.anatomy, settings.height);
      specimen = { ...parsed, id, settings, print, createdAt: new Date().toISOString(), image: false, demo: false };
      store.save('specimens', id, specimen); update(job, { specimenId: id });
    }
    if (signal.aborted) throw new Error('Generation cancelled.');
    update(job, { stage: 'image', message: 'Painting the specimen portrait. This can take a few minutes…' });
    const result = await codex.run({ prompt: illustrationPrompt(specimen), image: true, signal,
      onThread: threadId => update(job, { imageThreadId: threadId }), onProgress: message => update(job, { message }) });
    if (signal.aborted) throw new Error('Generation cancelled.');
    store.portrait(specimen.id, await imageBytes(result.images));
    store.save('specimens', specimen.id, { ...specimen, image: true, imageError: null });
    update(job, { status: 'completed', stage: 'done', message: 'A new species has been catalogued.', finishedAt: new Date().toISOString() });
  } catch (e) {
    const message = signal.aborted ? 'Generation cancelled. Completed field notes and model files have been kept.' : safeError(e);
    if (specimen && !specimen.image) store.save('specimens', specimen.id, { ...specimen, imageError: message });
    update(job, { status: signal.aborted ? 'cancelled' : specimen ? 'partial' : 'failed', message, finishedAt: new Date().toISOString() });
  } finally { if (current?.job.id === job.id) current = null; }
}

app.use(express.static(path.join(root, 'dist')));
app.get('/', (_req, res) => res.sendFile(path.join(root, 'dist/index.html')));
app.use((err, _req, res, _next) => res.status(err.status || 500).json({ error: err.status === 400 ? 'Invalid JSON request.' : safeError(err) }));
const server = app.listen(port, '127.0.0.1');
server.once('listening', () => {
  writeFileSync(path.join(store.root, 'server.json'), JSON.stringify({ pid: process.pid, port, root, stopToken }), { mode: 0o600 });
  console.log(`Critter Generator: http://127.0.0.1:${port}`);
  void codex.connect().catch(() => {});
});
server.on('error', e => { console.error(safeError(e)); codex.close(); process.exit(1); });
function shutdown() {
  current?.controller.abort(); codex.close();
  try { unlinkSync(path.join(store.root, 'server.json')); } catch {}
  server.close(() => process.exit(0)); setTimeout(() => process.exit(0), 1500).unref();
}
process.on('SIGTERM', shutdown); process.on('SIGINT', shutdown);
