import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Store } from '../server/store.mjs';
import { GenerationJobs } from '../server/generation-jobs.mjs';
import { readTrace } from '../server/generation-trace.mjs';
import { DEFAULT_GENERATION_MODEL } from '../shared/generation-models.mjs';
import { example, Settings } from '../shared/specimen.mjs';
import { leglessSculpt } from './fixtures/sculpts.mjs';

async function setup(t, replies, settings = {}) {
  const root = await mkdtemp(path.join(tmpdir(), 'critter-sculpt-')), store = new Store(root), calls = [];
  t.after(async () => { store.db.close(); await rm(root, { recursive: true, force: true }); });
  store.saveAppSettings({ ...store.appSettings(), ...settings });
  const specimen = { ...example, id: 'sculpt-test', createdAt: '2026-01-01T00:00:00Z', image: true, portraitVersion: 1, print: null,
    biology: { legCount: 0 }, settings: Settings.parse({ absurdity: 50, deviancy: 0, lethality: 0, height: 100 }) };
  store.save('specimens', specimen.id, specimen);
  store.portrait(specimen.id, await readFile(new URL('../server/assets/example-lantern-portrait.png', import.meta.url)));
  const provider = { state: { model: DEFAULT_GENERATION_MODEL.model }, run: async options => {
    calls.push(options); const reply = replies[Math.min(calls.length-1, replies.length-1)];
    if (reply instanceof Error) throw reply;
    return { text: typeof reply === 'string' ? reply : JSON.stringify(reply), images: [] };
  } };
  const jobs = new GenerationJobs({ store, providers: { codex: provider }, getSettings: () => store.appSettings() });
  const run = async () => {
    const { jobId } = jobs.start({ existing: store.get('specimens', specimen.id), settings: specimen.settings,
      kind: 'cad', cadRequest: { height: 100, baseplate: false } });
    await jobs.current?.promise;
    return { job: store.get('jobs', jobId), trace: readTrace(store, jobId), saved: store.get('specimens', specimen.id) };
  };
  return { store, calls, run, specimen };
}

const disconnected = { ...leglessSculpt, parts: [...leglessSculpt.parts, { kind: 'ellipsoid', center: [100, 0, 50], radii: [2, 2, 2] }] };

test('CAD repairs parsing and disconnected-solid errors with the exact response/error on the same provider', async t => {
  const { calls, run } = await setup(t, ['{"parts":', disconnected, leglessSculpt]);
  const { job, trace, saved } = await run();
  assert.equal(job.status, 'completed', job.message); assert.equal(calls.length, 3);
  assert(calls.every(call => call.model === DEFAULT_GENERATION_MODEL.model && call.imagePaths.length === 1));
  assert.match(calls[1].prompt, /Previous sculpt JSON/); assert(calls[1].prompt.includes('{"parts":'));
  const failed = trace.steps.find(step => step.stage === 'cad-build' && step.status === 'failed');
  assert.equal(failed.error, 'Sculpture has 2 disconnected components.'); assert(calls[2].prompt.includes(failed.error));
  assert(calls[2].prompt.includes(JSON.stringify(disconnected)));
  assert.deepEqual(saved.sculpt, leglessSculpt); assert.deepEqual(saved.print.approximationNotes, []);
  assert.equal(saved.print.sourcePortraitVersion, 1); assert.equal(saved.anatomy.bodyLength, example.anatomy.bodyLength, 'Legacy anatomy is not rewritten');
  assert.equal(trace.steps.filter(step => step.stage === 'cad-publish').length, 1);
});

test('schema errors are repaired and final failure leaves all previously published assets untouched', async t => {
  const malformed = { ...leglessSculpt, parts: [{ ...leglessSculpt.parts[0], radii: [0, 2, 3] }] };
  const { store, run, specimen, calls } = await setup(t, [leglessSculpt]);
  const first = await run(); assert.equal(first.job.status, 'completed');
  const before = await readFile(store.modelFile(first.saved, 'model.stl'));
  const providerReply = [malformed, malformed, malformed];
  // Drive a new public job through its injected provider rather than changing worker internals.
  const jobs = new GenerationJobs({ store, getSettings: () => store.appSettings(), providers: { codex: {
    state: { model: DEFAULT_GENERATION_MODEL.model }, run: async options => { calls.push(options); return { text: JSON.stringify(providerReply.shift()), images: [] }; },
  } } });
  const { jobId } = jobs.start({ existing: first.saved, settings: specimen.settings, kind: 'cad', cadRequest: { height: 120, baseplate: true } });
  await jobs.current?.promise;
  assert.equal(store.get('jobs', jobId).status, 'failed');
  const retained = store.get('specimens', specimen.id);
  assert.deepEqual(retained.print, first.saved.print); assert.deepEqual(retained.sculpt, first.saved.sculpt);
  assert.deepEqual(await readFile(store.modelFile(retained, 'model.stl')), before);
  assert.equal((await readdir(store.file('specimens', specimen.id, 'models'))).length, 1);
  assert.match(calls.at(-1).prompt, /Exact error:/); assert.match(calls.at(-1).prompt, /radii/);
});

test('zero repair attempts fails after one reply and does not create a model asset set', async t => {
  const { calls, run, store, specimen } = await setup(t, [disconnected, leglessSculpt], { cadRepairAttempts: 0 });
  const { job, saved } = await run(); assert.equal(job.status, 'failed'); assert.equal(calls.length, 1); assert.equal(saved.print, null);
  await assert.rejects(readdir(store.file('specimens', specimen.id, 'models')), { code: 'ENOENT' });
});

test('provider transport failures and explicit refusals are not treated as repairable geometry', async t => {
  for (const reply of [new Error('offline transport failure'), 'I cannot help create this sculpture.']) {
    await t.test(String(reply), async t => {
      const { calls, run } = await setup(t, [reply, leglessSculpt]);
      const { job } = await run(); assert.equal(job.status, 'failed'); assert.equal(calls.length, 1);
    });
  }
});
