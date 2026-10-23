import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
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

test('HTTP generation carries sampled anatomy through Codex, storage, mesh and portrait', async t => {
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
      CRITTER_TEST_LOG: log, PUBLIC_ORIGIN: '' } });
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
  const settings = Settings.parse({ absurdity: 65, deviancy: 35, lethality: 70, height: 60, baseplate: false });
  const specimens = [];
  for (const prompt of ['', '', 'Exactly four legs and two eyes, no horns.']) {
    const response = await fetch(origin + '/api/generate', { method: 'POST', headers, body: JSON.stringify({ ...settings, prompt }) });
    assert.equal(response.status, 202);
    const { jobId } = await response.json();
    const job = await waitFor(() => get(`/api/jobs/${jobId}`), result => !['queued', 'running'].includes(result.status));
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
  assert.notEqual(specimens[1].anatomy.legPairs, specimens[2].anatomy.legPairs);
  const requests = (await readFile(log, 'utf8')).trim().split('\n').map(line => JSON.parse(line));
  assert.equal(requests.length, 6, 'Each specimen gets one design request and one portrait request');
  for (let index = 0; index < 3; index++) {
    assert(requests[index * 2 + 1].input[0].text.includes(JSON.stringify(specimens[2 - index].anatomy)));
  }
});
