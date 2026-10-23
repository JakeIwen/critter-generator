import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { once } from 'node:events';
import { createAnatomyPlan } from '../shared/anatomy-plan.mjs';
import { Settings } from '../shared/specimen.mjs';

const root = path.resolve(import.meta.dirname, '..');
const headers = { 'Content-Type': 'application/json', 'X-Critter-Request': '1' };
const pause = () => new Promise(resolve => setTimeout(resolve, 30));

async function waitFor(read, ready) {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    const result = await read();
    if (ready(result)) return result;
    await pause();
  }
  throw new Error('Isolated generation did not finish in 15 seconds.');
}

async function isolatedGenerationServer(t, { failFirstPortrait = false } = {}) {
  const scratch = await mkdtemp(path.join(tmpdir(), 'critter-generation-'));
  const listener = createServer().listen(0, '127.0.0.1');
  await once(listener, 'listening');
  const port = listener.address().port;
  await new Promise(resolve => listener.close(resolve));
  const bin = path.join(scratch, 'bin'), log = path.join(scratch, 'requests.jsonl');
  await mkdir(bin);
  const fixture = new URL('./fixtures/design-codex.mjs', import.meta.url).href;
  await writeFile(path.join(bin, 'codex'), `#!${process.execPath}\nimport ${JSON.stringify(fixture)};\n`, { mode: 0o700 });
  const child = spawn(process.execPath, ['server/index.mjs'], { cwd: root, stdio: ['ignore', 'ignore', 'pipe'],
    env: { ...process.env, PATH: bin, PORT: String(port), CRITTER_DATA_DIR: path.join(scratch, 'data'),
      CRITTER_TEST_LOG: log, CRITTER_TEST_FAIL_FIRST_PORTRAIT: failFirstPortrait ? '1' : '', PUBLIC_ORIGIN: '' } });
  let errors = '';
  child.stderr.on('data', data => { errors += data; });
  t.after(async () => {
    if (child.exitCode === null && child.signalCode === null) {
      const exited = once(child, 'exit');
      child.kill('SIGTERM');
      const timer = setTimeout(() => child.kill('SIGKILL'), 2000);
      await exited; clearTimeout(timer);
    }
    await rm(scratch, { recursive: true, force: true });
  });
  const origin = `http://127.0.0.1:${port}`;
  const get = async route => (await fetch(origin + route, { signal: AbortSignal.timeout(2000) })).json();
  await waitFor(async () => {
    assert.equal(child.exitCode, null, errors);
    try { return await get('/api/status'); } catch { return null; }
  }, result => result?.connected);
  const post = async (route, body = {}) => {
    const response = await fetch(origin + route, { method: 'POST', headers, body: JSON.stringify(body) });
    assert.equal(response.status, 202);
    const { jobId } = await response.json();
    return waitFor(() => get(`/api/jobs/${jobId}`), result => !['queued', 'running'].includes(result.status));
  };
  return { scratch, origin, get, post, requests: async () =>
    (await readFile(log, 'utf8')).trim().split('\n').map(line => JSON.parse(line)) };
}

const legacySettings = { absurdity: 65, deviancy: 35, lethality: 70, height: 60, baseplate: false };

test('HTTP generation carries sampled anatomy through Codex, storage, mesh and portrait', async t => {
  const { get, post, requests } = await isolatedGenerationServer(t);
  const settings = Settings.parse(legacySettings);
  const specimens = [];
  for (const prompt of ['', '', 'Exactly four legs and two eyes, no horns.']) {
    const job = await post('/api/generate', { ...legacySettings, prompt });
    const jobId = job.id;
    assert.equal(job.status, 'completed', job.message);
    const specimen = await get(`/api/specimens/${job.specimenId}/files/record.json`);
    assert.deepEqual(specimen.variation, job.variation);
    if (!prompt) {
      assert.deepEqual(job.variation, createAnatomyPlan(settings, jobId, specimens));
      for (const [key, value] of Object.entries(job.variation.anatomy)) assert.equal(specimen.anatomy[key], value);
    } else assert.deepEqual([specimen.anatomy.legPairs, specimen.anatomy.eyes, specimen.anatomy.horns], [2, 2, 0]);
    assert.equal(specimen.print.components, 1); assert.equal(specimen.print.baseplate, false);
    const mesh = await get(`/api/specimens/${specimen.id}/files/mesh.json`);
    assert.equal(mesh.triangles.length / 3, specimen.print.triangles);
    specimens.unshift(specimen);
  }
  assert.notDeepEqual(specimens[1].anatomy, specimens[2].anatomy, 'Repeated requests preserve sampled physical variation');
  const turns = await requests();
  assert.equal(turns.length, 6, 'Each specimen gets one design request and one portrait request');
  for (let index = 0; index < 3; index++) {
    assert(turns[index * 2 + 1].input[0].text.includes(JSON.stringify(specimens[2 - index].anatomy)));
  }
});

test('portrait-only generation saves biology without CAD and retries the same organism and scene', async t => {
  const { scratch, origin, get, post, requests } = await isolatedGenerationServer(t, { failFirstPortrait: true });
  const settings = { ...legacySettings, printModel: false, animalTypes: ['cephalopods'], legless: true };
  const job = await post('/api/generate', settings);
  assert.equal(job.status, 'partial', job.message);
  const recordRoute = `/api/specimens/${job.specimenId}/files/record.json`;
  const specimen = await get(recordRoute);
  assert.equal(specimen.print, null);
  assert.equal(specimen.anatomy, null);
  assert.equal(specimen.biology.legCount, 0);
  assert.deepEqual(specimen.settings.animalTypes, settings.animalTypes);
  assert.equal(specimen.settings.printModel, false);
  assert.deepEqual(specimen.variation, job.variation);
  const folder = path.join(scratch, 'data/specimens', specimen.id);
  assert.deepEqual(await readdir(folder), ['record.json'], 'No mesh, STL or CAD file is created');
  for (const name of ['model.stl', 'model.scad', 'mesh.json', 'portrait.png']) {
    assert.equal((await fetch(`${origin}/api/specimens/${specimen.id}/files/${name}`)).status, 404);
  }
  await writeFile(path.join(folder, 'model.stl'), 'stray asset');
  assert.equal((await fetch(`${origin}/api/specimens/${specimen.id}/files/model.stl`)).status, 404, 'Record state controls CAD availability');
  await rm(path.join(folder, 'model.stl'));
  const retry = await post(`/api/specimens/${specimen.id}/portrait`);
  assert.equal(retry.status, 'completed', retry.message);
  assert.deepEqual(retry.variation, job.variation);
  const repainted = await get(recordRoute);
  for (const key of ['anatomy', 'biology', 'print', 'variation', 'settings']) assert.deepEqual(repainted[key], specimen[key]);
  assert.equal(repainted.image, true);
  assert.deepEqual((await readdir(folder)).sort(), ['portrait.png', 'record.json']);
  assert.equal((await fetch(`${origin}/api/specimens/${specimen.id}/files/portrait.png`)).status, 200);
  const turns = await requests();
  assert.equal(turns.filter(turn => turn.outputSchema).length, 1, 'Retry never reruns design');
  assert.equal(turns.length, 3);
  assert.deepEqual(turns[1].input, turns[2].input, 'Retry uses the original biology, environment and camera direction');
  assert(turns[1].input[0].text.includes(specimen.biology.bodyPlan));
  const next = await post('/api/generate', settings);
  assert.equal(next.status, 'completed', 'Saved null anatomy can participate in future diversity history');
  assert.equal((await fetch(`${origin}/api/specimens/example-lantern/files/model.stl`)).status, 200, 'Legacy printable example remains downloadable');
});
