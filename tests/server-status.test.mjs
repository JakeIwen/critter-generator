import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { request as httpRequest } from 'node:http';
import { once } from 'node:events';
import { Store } from '../server/store.mjs';
import { DEFAULT_APP_SETTINGS, publicAppSettings } from '../shared/app-settings.mjs';
import { COOKIE } from '../server/login.mjs';

const root = path.resolve(import.meta.dirname, '..');
const publicOrigin = 'https://critter.example.test';
const appHeaders = { 'X-Critter-Request': '1' };

async function server(t, { publicHost = false, provider = 'codex' } = {}) {
  const scratch = await mkdtemp(path.join(tmpdir(), 'critter-status-'));
  const listener = createServer().listen(0, '127.0.0.1'); await once(listener, 'listening');
  const port = listener.address().port; await new Promise(resolve => listener.close(resolve));
  const bin = path.join(scratch, 'bin'); await mkdir(bin);
  const fixture = new URL('./fixtures/design-codex.mjs', import.meta.url).href;
  await writeFile(path.join(bin, 'codex'), `#!${process.execPath}\nimport ${JSON.stringify(fixture)};\n`, { mode: 0o700 });
  const store = new Store(path.join(scratch, 'data'));
  store.setMetadata('generation-model', { provider, model: 'fixture', effort: null }); store.db.close();
  const child = spawn(process.execPath, ['server/index.mjs'], { cwd: root, stdio: ['ignore', 'ignore', 'pipe'],
    env: { ...process.env, PATH: bin, PORT: String(port), CRITTER_DATA_DIR: path.join(scratch, 'data'),
      CRITTER_DIST_DIR: path.join(scratch, 'dist'), CRITTER_CLAUDE_EXECUTABLE: path.join(bin, 'claude-missing'),
      PUBLIC_ORIGIN: publicHost ? publicOrigin : '', CRITTER_PASSCODE: 'fixture passcode',
      ACCESS_TEAM_DOMAIN: 'fixture.cloudflareaccess.com', ACCESS_AUD: 'fixture-audience',
      CRITTER_OWNER_EMAIL: 'owner@example.test', CRITTER_TEST_LOG: path.join(scratch, 'requests.jsonl') } });
  let errors = ''; child.stderr.on('data', bytes => { errors += bytes; });
  t.after(async () => {
    if (child.exitCode === null && child.signalCode === null) {
      const exited = once(child, 'exit'); child.kill('SIGTERM');
      const timer = setTimeout(() => child.kill('SIGKILL'), 2000); await exited; clearTimeout(timer);
    }
    await rm(scratch, { recursive: true, force: true });
  });
  const request = (route, options = {}) => new Promise((resolve, reject) => {
    const form = options.body instanceof URLSearchParams;
    const req = httpRequest(`http://127.0.0.1:${port}${route}`, { ...options,
      headers: { ...(publicHost ? { Host: new URL(publicOrigin).host } : {}),
        ...(form ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}), ...options.headers },
      signal: AbortSignal.timeout(2000) }, res => {
      const chunks = []; res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => resolve(new Response(Buffer.concat(chunks), { status: res.statusCode, headers: res.headers })));
      res.on('error', reject);
    });
    req.on('error', reject); req.end(form ? options.body.toString() : options.body);
  });
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    assert.equal(child.exitCode, null, errors);
    try { if ((await request(publicHost ? '/auth' : '/api/status')).ok) return { request }; } catch {}
    await new Promise(resolve => setTimeout(resolve, 30));
  }
  throw new Error('Isolated status server did not start.');
}

test('connect retries Codex and returns the usual session-aware status on localhost', async t => {
  const { request } = await server(t);
  const response = await request('/api/connect', { method: 'POST', headers: appHeaders });
  assert.equal(response.status, 200);
  const status = await response.json();
  assert.equal(status.connected, true); assert.equal(status.connection.codex.connected, true);
  assert.equal(status.owner, true); assert.equal(status.session, null);
  assert.deepEqual(status.config, publicAppSettings(DEFAULT_APP_SETTINGS));
  assert.deepEqual(status.generation, { provider: 'codex', model: 'fixture', effort: null });
  assert.equal((await request('/auth/logout', { method: 'POST', headers: appHeaders })).status, 404);
});

test('connect also retries selected Claude and reports its failure even when Codex is connected', async t => {
  const { request } = await server(t, { provider: 'claude' });
  const response = await request('/api/connect', { method: 'POST', headers: appHeaders });
  assert.equal(response.status, 503);
  const { error } = await response.json(); assert.match(error, /Claude/i);
  const status = await (await request('/api/status')).json();
  assert.equal(status.connection.codex.connected, true);
  assert.equal(status.connection.claude.connected, false);
  assert.equal(status.connection.claude.reason, error);
});

test('public status identifies passcode sessions and logout requires the app request header', async t => {
  const { request } = await server(t, { publicHost: true });
  const entered = await request('/auth/passcode', { method: 'POST', headers: { Origin: publicOrigin },
    body: new URLSearchParams({ passcode: 'fixture passcode' }) });
  assert.equal(entered.status, 303);
  const cookie = entered.headers.get('set-cookie').split(';')[0];
  const status = await (await request('/api/status', { headers: { cookie } })).json();
  assert.equal(status.session, 'passcode'); assert.equal(status.owner, false);
  assert.deepEqual(status.config, publicAppSettings(DEFAULT_APP_SETTINGS));
  for (const method of ['GET', 'PUT']) assert.equal((await request('/api/settings/app', { method, headers: { cookie, ...appHeaders } })).status, 403);
  const blocked = await request('/auth/logout', { method: 'POST', headers: { cookie } });
  assert.equal(blocked.status, 403); assert.deepEqual(await blocked.json(), { error: 'Missing app request header.' });
  const response = await request('/auth/logout', { method: 'POST', headers: { cookie, ...appHeaders } });
  assert.equal(response.status, 200); assert.deepEqual(await response.json(), { ok: true });
  assert.equal(response.headers.get('set-cookie'), `${COOKIE}=; Path=/; Max-Age=0; Secure; HttpOnly; SameSite=Lax`);
  assert.equal((await request('/api/status')).status, 401);
});
