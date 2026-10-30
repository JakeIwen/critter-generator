import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
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
  store.saveAppSettings({ ...store.appSettings(), cadReviewRounds: 0, ...settings });
  const specimen = { ...example, id: 'sculpt-test', createdAt: '2026-01-01T00:00:00Z', image: true, portraitVersion: 1, print: null,
    biology: { legCount: 0 }, settings: Settings.parse({ absurdity: 50, deviancy: 0, lethality: 0, height: 100 }) };
  store.save('specimens', specimen.id, specimen);
  store.portrait(specimen.id, await readFile(new URL('../server/assets/example-lantern-portrait.png', import.meta.url)));
  const provider = { state: { model: DEFAULT_GENERATION_MODEL.model }, run: async options => {
    calls.push({ ...options, jobMessage: store.list('jobs').find(job => job.status === 'running')?.message }); const reply = replies[Math.min(calls.length-1, replies.length-1)];
    if (reply instanceof Error) throw reply;
    if (typeof reply === 'function') return reply(options);
    return { text: typeof reply === 'string' ? reply : JSON.stringify(reply), images: [] };
  } };
  const jobs = new GenerationJobs({ store, providers: { codex: provider }, getSettings: () => store.appSettings() });
  const run = async () => {
    const { jobId } = jobs.start({ existing: store.get('specimens', specimen.id), settings: specimen.settings,
      kind: 'cad', cadRequest: { height: 100, baseplate: false } });
    await jobs.current?.promise;
    return { job: store.get('jobs', jobId), trace: readTrace(store, jobId), saved: store.get('specimens', specimen.id) };
  };
  return { store, calls, run, specimen, jobs };
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


test('comparison rounds use portrait plus durable fused render and publish only the final revised sculpt', async t => {
  const revised = { ...leglessSculpt, color: '#5588aa', parts: [{ ...leglessSculpt.parts[0], radii: [16, 12, 15] }] };
  const { calls, run, store, specimen } = await setup(t, [leglessSculpt, revised, revised], { cadReviewRounds: 2 });
  const { job, trace, saved } = await run();
  assert.equal(job.status, 'completed', job.message); assert.equal(calls.length, 3);
  assert.deepEqual(saved.sculpt, revised);
  const rounds = trace.steps.filter(step => step.stage === 'cad-review-round');
  assert.equal(rounds.length, 2); assert(rounds.every(step => step.output.accepted));
  for (let i = 1; i <= 2; i++) {
    assert.equal(calls[i].imagePaths.length, 2);
    assert.equal(calls[i].imagePaths[0], store.portraitFile(specimen));
    assert.equal(calls[i].jobMessage, `Checking the sculpture against the portrait (round ${i} of 2)…`);
    assert(calls[i].prompt.includes(JSON.stringify(i === 1 ? leglessSculpt : revised)));
    const png = await readFile(calls[i].imagePaths[1]), hash = createHash('sha256').update(png).digest('hex');
    const step = trace.steps.filter(step => step.stage === 'cad-design')[i];
    assert.equal(step.input[2].sha256, hash); assert.equal(rounds[i-1].output.renderSha256, hash);
    assert.deepEqual(JSON.parse(step.responseText), revised); assert.equal(rounds[i-1].output.build.components, 1);
  }
  assert.equal((await readdir(store.file('specimens', specimen.id, 'models'))).length, 1);
  const mesh = JSON.parse(await readFile(store.modelFile(saved, 'mesh.json')));
  assert.equal(mesh.colors.length, mesh.positions.length, 'Published mesh retains fused vertex colors');
});

test('a revision that exhausts its repairs retains the last good model and traces the failed build', async t => {
  const { calls, run } = await setup(t, [leglessSculpt, disconnected, disconnected], { cadReviewRounds: 1, cadRepairAttempts: 1 });
  const { job, trace, saved } = await run();
  assert.equal(job.status, 'completed', job.message); assert.equal(calls.length, 3);
  assert.deepEqual(saved.sculpt, leglessSculpt);
  const round = trace.steps.find(step => step.stage === 'cad-review-round');
  assert.equal(round.output.accepted, false); assert.equal(round.output.retainedLastGood, true);
  assert.match(round.output.error, /2 disconnected components/); assert.equal(round.output.build.components, 1);
  assert.equal(trace.steps.filter(step => step.stage === 'cad-build' && step.status === 'failed').length, 2);
  assert.match(calls[2].prompt, /Exact error: Sculpture has 2 disconnected components/);
  assert.deepEqual(calls[2].imagePaths, calls[1].imagePaths);
});

test('repairable revisions replace the initial model, and zero rounds never render or ask for comparison', async t => {
  const revised = { ...leglessSculpt, color: '#5588aa' };
  await t.test('repair succeeds', async t => {
    const { calls, run } = await setup(t, [leglessSculpt, disconnected, revised], { cadReviewRounds: 1 });
    const { job, saved } = await run(); assert.equal(job.status, 'completed'); assert.deepEqual(saved.sculpt, revised); assert.equal(calls.length, 3);
  });
  await t.test('disabled', async t => {
    const { calls, run } = await setup(t, [leglessSculpt, revised], { cadReviewRounds: 0 });
    const { job, trace, saved } = await run(); assert.equal(job.status, 'completed'); assert.equal(calls.length, 1);
    assert.deepEqual(saved.sculpt, leglessSculpt);
    assert(!trace.steps.some(step => ['cad-review-round', 'cad-render'].includes(step.stage)));
  });
});

test('cancellation during comparison does not publish an intermediate or silently accept the last good build', async t => {
  let notify;
  const entered = new Promise(resolve => { notify = resolve; });
  const hold = ({ signal }) => new Promise((resolve, reject) => {
    notify(); signal.addEventListener('abort', () => reject(signal.reason), { once: true });
  });
  const { run, jobs, store, specimen } = await setup(t, [leglessSculpt, hold], { cadReviewRounds: 1 });
  const running = run(); await entered;
  const current = store.list('jobs').find(job => job.status === 'running');
  assert(jobs.cancel(current.id));
  const { job, saved } = await running;
  assert.equal(job.status, 'cancelled'); assert.equal(saved.print, null);
  await assert.rejects(readdir(store.file('specimens', specimen.id, 'models')), { code: 'ENOENT' });
});


test('later failed rounds retain the most recent successful revision, not the initial sculpt', async t => {
  const revised = { ...leglessSculpt, color: '#5588aa' };
  const { run, calls } = await setup(t, [leglessSculpt, revised, disconnected], { cadReviewRounds: 2, cadRepairAttempts: 0 });
  const { job, saved, trace } = await run();
  assert.equal(job.status, 'completed'); assert.deepEqual(saved.sculpt, revised); assert.equal(calls.length, 3);
  const rounds = trace.steps.filter(step => step.stage === 'cad-review-round');
  assert.deepEqual(rounds.map(step => step.output.accepted), [true, false]);
  assert.match(rounds[1].output.renderSha256, /^[a-f0-9]{64}$/);
});
