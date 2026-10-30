import { publicAppSettings } from '../shared/app-settings.mjs';
import express from 'express';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { PAGE_PATHS, isAppPagePath } from '../shared/page-routes.mjs';
import { example } from '../shared/specimen.mjs';
import { Codex } from './codex.mjs';
import { safeError } from './safe-error.mjs';
import { Claude } from './claude.mjs';
import { ModelCatalog } from './model-catalog.mjs';
import { PROVIDERS } from '../shared/generation-models.mjs';
import { createSettingsRoutes } from './settings-routes.mjs';
import { GenerationJobs } from './generation-jobs.mjs';
import { createSpecimenRoutes } from './specimen-routes.mjs';
import { Store } from './store.mjs';
import { createAccessVerifier } from './access.mjs';
import { createLogin, logout } from './login.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const distRoot = process.env.CRITTER_DIST_DIR || path.join(root, 'dist');
// Host, port and login environment stay deployment-owned: web edits could lock the owner out.
const port = Number(process.env.PORT || 4329);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('PORT must be an integer from 1024 to 65535.');
const store = new Store(process.env.CRITTER_DATA_DIR || path.join(root, '.local'));
const workspace = path.join(store.root, 'workspace');
const getSettings = () => store.appSettings();
const codex = new Codex(workspace, { getSettings });
const claude = new Claude(workspace, { getSettings });
const providers = { [PROVIDERS.CODEX]: codex, [PROVIDERS.CLAUDE]: claude };
const catalog = new ModelCatalog({ getSettings, discoverers: Object.fromEntries(
  Object.entries(providers).map(([id, provider]) => [id, () => provider.models()])) });
const app = express();
const stopToken = randomUUID();
app.disable('x-powered-by');
const origins = new Set([`http://127.0.0.1:${port}`, `http://localhost:${port}`, 'http://127.0.0.1:5173', 'http://localhost:5173']);
const localHosts = [`127.0.0.1:${port}`, `localhost:${port}`];
// Optional public hosting behind Cloudflare Access (e.g. https://critter.lionfeather.dev).
// Requests for that host need a session from server/login.mjs; localhost stays as before.
const publicOrigin = process.env.PUBLIC_ORIGIN ? new URL(process.env.PUBLIC_ORIGIN) : null;
// Login rate limits stay fixed security policy, never owner-adjustable preferences.
const login = publicOrigin ? createLogin({ publicOrigin, passcode: process.env.CRITTER_PASSCODE,
  verifyAccess: createAccessVerifier({ teamDomain: process.env.ACCESS_TEAM_DOMAIN, audience: process.env.ACCESS_AUD }),
  ownerEmail: process.env.CRITTER_OWNER_EMAIL, secretFile: path.join(store.root, 'session-secret') }) : null;
const isOwner = req => login ? login.isOwner(req) : true;
if (publicOrigin) origins.add(publicOrigin.origin);
const isPublicHost = req => publicOrigin && req.headers.host === publicOrigin.host;
const isLoginPath = req => req.path === '/auth' || req.path.startsWith('/auth/');
app.use((req, res, next) => {
  const isPublic = isPublicHost(req);
  if (!isPublic && !localHosts.includes(req.headers.host)) return res.status(403).json({ error: 'Localhost access only.' });
  if (isPublic && !isLoginPath(req) && !login.signedIn(req)) return login.challenge(req, res);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  // Keep proxies such as Cloudflare from injecting scripts (e.g. analytics beacons) into pages.
  res.setHeader('Cache-Control', 'no-transform');
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; worker-src 'self' blob:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'");
  if (req.headers.origin && !origins.has(req.headers.origin)) return res.status(403).json({ error: 'Cross-origin access denied.' });
  // The sign-in form is a plain HTML post; login.mjs checks its Origin instead.
  const isLoginForm = isPublic && req.method === 'POST' && req.path === '/auth/passcode';
  if (!['GET', 'HEAD'].includes(req.method) && req.headers['x-critter-request'] !== '1' && !isLoginForm) return res.status(403).json({ error: 'Missing app request header.' });
  next();
});
if (login) app.use((req, res, next) => isPublicHost(req) ? login.router(req, res, next) : next());
app.get(PAGE_PATHS.logout, (_req, res) => logout(res, PAGE_PATHS.lab));
app.use(express.json({ limit: '64kb' }));
app.use('/api', (_req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });

const jobs = new GenerationJobs({ store, providers, catalog, getSettings });
if (!store.get('specimens', 'example-lantern')) {
  store.save('specimens', 'example-lantern', { ...example, anatomy: null,
    id: 'example-lantern', demo: true, image: false, print: null,
    settings: { prompt: '', absurdity: 65, deviancy: 35, lethality: 20, height: 100, printModel: false },
    createdAt: '2026-01-01T00:00:00.000Z' });
}
// The example ships with a Codex-generated portrait so new installs aren't blank.
const examplePortrait = path.join(root, 'server/assets/example-lantern-portrait.png');
const exampleRecord = store.get('specimens', 'example-lantern');
if (!exampleRecord.image && existsSync(examplePortrait)) {
  store.portrait('example-lantern', readFileSync(examplePortrait));
  store.save('specimens', 'example-lantern', { ...exampleRecord, image: true, imageError: null });
}

const connectionStatus = req => ({ ...codex.state, owner: isOwner(req),
  session: isPublicHost(req) ? login.sessionMethod(req) : null,
  generation: (({ provider, model, effort }) => ({ provider, model, effort }))(store.generationModel()),
  connection: Object.fromEntries(Object.entries(providers).map(([id, provider]) => [id, provider.state])),
  config: publicAppSettings(getSettings()),
  activeJob: jobs.current?.job.id || null, generationTiming: store.generationTiming() });
app.get('/api/status', (req, res) => res.json(connectionStatus(req)));
app.post('/api/shutdown', (req, res) => {
  if (req.headers['x-critter-stop-token'] !== stopToken) return res.status(403).json({ error: 'Invalid instance token.' });
  res.json({ stopped: true }); setTimeout(shutdown, 50);
});
app.post('/api/connect', async (req, res) => {
  try {
    await codex.connect();
    if (store.generationModel().provider === PROVIDERS.CLAUDE) await claude.connect();
    res.json(connectionStatus(req));
  } catch (e) { res.status(503).json({ error: safeError(e) }); }
});
app.use(createSettingsRoutes({ store, catalog, isOwner }));
app.use(createSpecimenRoutes({ store, jobs, isOwner }));

app.use(express.static(distRoot, { setHeaders(res, file) {
  const policy = path.basename(file) === 'index.html' ? 'no-cache'
    : file.startsWith(path.resolve(distRoot, 'assets') + path.sep) ? 'public, max-age=31536000, immutable' : null;
  if (policy) res.setHeader('Cache-Control', `${res.getHeader('Cache-Control')}, ${policy}`);
} }));
app.use((req, res, next) => {
  if (!['GET', 'HEAD'].includes(req.method) || !isAppPagePath(req.path)) return next();
  res.set('Cache-Control', 'no-transform, no-cache').sendFile('index.html', { root: distRoot });
});
app.use((err, _req, res, _next) => res.status(err.status || 500).json({ error: err.status === 400 ? 'Invalid JSON request.' : safeError(err) }));
const server = app.listen(port, '127.0.0.1');
server.once('listening', () => {
  writeFileSync(path.join(store.root, 'server.json'), JSON.stringify({ pid: process.pid, port, root, stopToken }), { mode: 0o600 });
  console.log(`Critter Generator: http://127.0.0.1:${port}`);
  void codex.connect().catch(() => {});
});
server.on('error', e => { console.error(safeError(e)); codex.close(); claude.close(); process.exit(1); });
function shutdown() {
  jobs.current?.controller.abort(); codex.close(); claude.close();
  try { unlinkSync(path.join(store.root, 'server.json')); } catch {}
  server.close(() => process.exit(0)); setTimeout(() => process.exit(0), 1500).unref();
}
process.on('SIGTERM', shutdown); process.on('SIGINT', shutdown);
