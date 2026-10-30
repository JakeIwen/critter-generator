import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { Store } from '../server/store.mjs';
import { GenerationJobs } from '../server/generation-jobs.mjs';
import { readTrace } from '../server/generation-trace.mjs';
import { ModelCatalog } from '../server/model-catalog.mjs';
import { GENERATION_MODEL_KEY, DEFAULT_GENERATION_MODEL } from '../shared/generation-models.mjs';
import { leglessSculpt } from './fixtures/sculpts.mjs';
import { Settings, example } from '../shared/specimen.mjs';

async function setup(t) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'critter-provider-jobs-'));
  const store = new Store(directory), calls = [];
  const bytes = await readFile(new URL('../server/assets/example-lantern-portrait.png', import.meta.url));
  t.after(async () => { store.db.close(); await rm(directory, { recursive: true, force: true }); });
  const settings = Settings.parse({ prompt: 'A nonhuman animal.', absurdity: 50, deviancy: 0, lethality: 0, height: 100, review: true });
  const design = { ...example, anatomy: null, biology: {
    bodyPlan: 'A smooth, round-bodied nonhuman animal with a long tail and strong flippers.',
    locomotion: 'Swims through shallow pools using paired flippers.', covering: 'Smooth translucent skin over luminous organs.',
    features: ['A long tail', 'A flexible neck', 'Luminous organs', 'Two wide flippers'], legCount: 0,
  }, visualRequirements: { originalPrompt: settings.prompt, required: [], excluded: [] } };
  const provider = (id, model, effort) => ({ state: { connected: true, model, reason: null }, effort,
    connect: async () => {}, run: async options => {
      calls.push({ provider: id, ...options }); const threadId = `${id}-${calls.length}`;
      options.onThread?.(threadId);
      if (options.image) return { text: '', images: [{ result: bytes.toString('base64') }], threadId };
      const output = options.schema.properties.issues ? { issues: [] } : options.schema.properties.approximationNotes
        ? leglessSculpt : design;
      return { text: JSON.stringify(output), images: [], threadId };
    } });
  const providers = { codex: provider('codex', 'image-default', 'medium'), claude: provider('claude', 'fable', 'high') };
  return { store, providers, calls, settings };
}

test('Claude-selected jobs snapshot settings, route text/reviews/CAD to Claude and images to Codex', async t => {
  const { store, providers, calls, settings } = await setup(t);
  const selection = { provider: 'claude', model: 'fable', effort: 'max' };
  store.setMetadata(GENERATION_MODEL_KEY, { ...selection, updatedAt: '2026-01-01T00:00:00Z' });
  const jobs = new GenerationJobs({ store, providers });
  const { jobId } = jobs.start({ settings });
  store.setMetadata(GENERATION_MODEL_KEY, DEFAULT_GENERATION_MODEL);
  await jobs.current?.promise;
  const job = store.get('jobs', jobId); assert.equal(job.status, 'completed', job.message);
  assert.deepEqual(job.generation, selection);
  const trace = readTrace(store, jobId);
  assert.deepEqual(trace.generation, selection);
  assert.deepEqual(trace.steps.filter(step => step.provider).map(step => [step.stage, step.provider, step.orchestrationModel, step.reasoningEffort]), [
    ['design', 'claude', 'fable', 'max'], ['design-review', 'claude', 'fable', 'max'],
    ['image', 'codex', 'image-default', 'medium'], ['image-review', 'claude', 'fable', 'max'],
  ]);
  for (const call of calls) {
    assert.equal(call.provider, call.image ? 'codex' : 'claude');
    assert.equal(call.model, call.image ? 'image-default' : 'fable');
    assert.equal(call.effort, call.image ? 'medium' : 'max');
  }
  store.setMetadata(GENERATION_MODEL_KEY, selection);
  const existing = store.get('specimens', job.specimenId);
  const cad = jobs.start({ settings, existing, kind: 'cad', cadRequest: { height: 100, baseplate: false } });
  await jobs.current?.promise;
  assert.equal(store.get('jobs', cad.jobId).status, 'completed', store.get('jobs', cad.jobId).message);
  const cadSteps = readTrace(store, cad.jobId).steps.filter(step => step.stage === 'cad-design');
  assert.equal(cadSteps.length, 2, 'Default CAD includes the initial plan and one render/revise round');
  for (const step of cadSteps) { assert.equal(step.provider, 'claude'); assert.equal(step.reasoningEffort, 'max'); }
});

test('Codex selection controls both text and image model/effort rather than adapter defaults', async t => {
  const { store, providers, calls, settings } = await setup(t);
  const jobs = new GenerationJobs({ store, providers });
  const { jobId } = jobs.start({ settings }); await jobs.current?.promise;
  assert.equal(store.get('jobs', jobId).status, 'completed');
  for (const call of calls) {
    assert.equal(call.provider, 'codex'); assert.equal(call.model, 'gpt-6-astra'); assert.equal(call.effort, 'max');
  }
});

test('an unavailable selected provider fails a job before any billable stage, even portrait-only jobs', async t => {
  const { store, providers, calls, settings } = await setup(t);
  store.setMetadata(GENERATION_MODEL_KEY, { provider: 'claude', model: 'fable', effort: 'high' });
  const catalog = new ModelCatalog({ discoverers: { claude: async () => { throw new Error('Claude is not signed in.'); } } });
  const jobs = new GenerationJobs({ store, providers, catalog });
  const { jobId } = jobs.start({ settings, existing: { ...example, id: 'saved-example', image: false, createdAt: '2026-01-01T00:00:00Z' } });
  await jobs.current?.promise;
  const job = store.get('jobs', jobId);
  assert.equal(job.status, 'partial'); assert.equal(job.message, 'Claude is not signed in.');
  assert.equal(calls.length, 0);
});


test('new designs use the live configured attempt limit only for runaway output', async t => {
  const { store, providers, settings } = await setup(t);
  let attempts = 0;
  providers.codex.run = async () => {
    attempts++;
    throw Object.assign(new Error('Stalled fixture output'), { code: 'runaway_output' });
  };
  const jobs = new GenerationJobs({ store, providers, getSettings: () => store.appSettings() });
  for (const designAttempts of [1, 4]) {
    store.saveAppSettings({ ...store.appSettings(), designAttempts, initialEstimateSeconds: 80 }); attempts = 0;
    const { jobId, estimatedDurationMs } = jobs.start({ settings });
    assert.equal(estimatedDurationMs, 80_000);
    store.saveAppSettings({ ...store.appSettings(), initialEstimateSeconds: 70 });
    await jobs.current?.promise;
    assert.equal(store.get('jobs', jobId).estimatedDurationMs, 80_000);
    assert.equal(attempts, designAttempts); assert.equal(store.get('jobs', jobId).status, 'failed');
    assert.equal(readTrace(store, jobId).steps.filter(step => step.stage === 'design').length, designAttempts);
  }
  providers.codex.run = async () => { attempts++; throw new Error('Not retryable'); };
  attempts = 0; jobs.start({ settings }); await jobs.current?.promise; assert.equal(attempts, 1);
});

test('Claude prose refusals fail design without saving a specimen and retain the full reply', async t => {
  const { store, providers, settings } = await setup(t);
  store.setMetadata(GENERATION_MODEL_KEY, { provider: 'claude', model: 'fable', effort: 'high' });
  const reply = 'I cannot write this specimen.\nPlease adjust the description.';
  providers.claude.run = async () => ({ text: reply, images: [] });
  const jobs = new GenerationJobs({ store, providers });
  const { jobId } = jobs.start({ settings }); await jobs.current?.promise;
  const job = store.get('jobs', jobId);
  assert.equal(job.status, 'failed'); assert.equal(job.specimenId, null);
  assert.equal(store.list('specimens').length, 0);
  assert.equal(job.message, 'Claude declined to write this specimen: “I cannot write this specimen. Please adjust the description.”. No specimen was saved; adjust the description and try again.');
  assert.equal(readTrace(store, jobId).steps.find(step => step.stage === 'design').responseText, reply);
});

test('malformed JSON is unreadable output, not automatically a refusal or safety block', async t => {
  const { store, providers, settings } = await setup(t);
  providers.codex.run = async () => ({ text: '{"unfinished":', images: [] });
  const jobs = new GenerationJobs({ store, providers });
  const { jobId } = jobs.start({ settings }); await jobs.current?.promise;
  const job = store.get('jobs', jobId);
  assert.equal(job.status, 'failed'); assert.equal(job.specimenId, null);
  assert.equal(job.message, 'Codex returned an unreadable response: “{"unfinished":”. No specimen was saved; adjust the description and try again.');
});

test('review refusals stay advisory, use the same parser and preserve their replies', async t => {
  const { store, providers, settings } = await setup(t);
  const run = providers.codex.run;
  const reply = 'I cannot review this specimen.';
  providers.codex.run = options => options.schema?.properties.issues ? Promise.resolve({ text: reply, images: [] }) : run(options);
  const jobs = new GenerationJobs({ store, providers });
  const { jobId } = jobs.start({ settings }); await jobs.current?.promise;
  const job = store.get('jobs', jobId), specimen = store.get('specimens', job.specimenId);
  assert.equal(job.status, 'completed'); assert.equal(specimen.image, true); assert.equal(specimen.review.status, 'unavailable');
  assert.equal(specimen.review.designError, 'Codex declined to review this specimen: “I cannot review this specimen.”. The saved specimen is unchanged; inspect its requirements manually.');
  assert.equal(specimen.review.error, 'Codex declined to review this portrait: “I cannot review this specimen.”. The portrait is saved; inspect its requirements manually.');
  for (const step of readTrace(store, jobId).steps.filter(step => step.stage.endsWith('-review'))) assert.equal(step.responseText, reply);
});

test('failed edits and CAD refusals accurately report and retain the current portrait and existing CAD', async t => {
  const { store, providers, settings } = await setup(t);
  const jobs = new GenerationJobs({ store, providers });
  const first = jobs.start({ settings }); await jobs.current?.promise;
  const id = store.get('jobs', first.jobId).specimenId;
  const cad = jobs.start({ settings, existing: store.get('specimens', id), kind: 'cad', cadRequest: { height: 100, baseplate: false } });
  await jobs.current?.promise; assert.equal(store.get('jobs', cad.jobId).status, 'completed');
  const original = store.get('specimens', id), bytes = await readFile(store.portraitFile(original));
  const model = await readFile(store.modelFile(original, 'model.stl'));
  const run = providers.codex.run;
  providers.codex.run = options => options.image ? Promise.resolve({ text: '', images: [{ failure: 'moderation_blocked' }] }) : run(options);
  const edited = jobs.start({ settings, existing: original, instructions: 'Change its color.' }); await jobs.current?.promise;
  const edit = store.get('jobs', edited.jobId);
  assert.equal(edit.status, 'failed');
  assert.equal(edit.message, 'The image safety filter blocked this portrait. The field notes, current portrait and existing CAD are unchanged; revise the edit instructions and use Apply edit again.');
  store.setMetadata(GENERATION_MODEL_KEY, { provider: 'claude', model: 'fable', effort: 'high' });
  const reply = 'I cannot plan this sculpture.';
  providers.claude.run = async () => ({ text: reply, images: [] });
  const refused = jobs.start({ settings, existing: store.get('specimens', id), kind: 'cad', cadRequest: { height: 120, baseplate: true } });
  await jobs.current?.promise;
  const failed = store.get('jobs', refused.jobId), kept = store.get('specimens', id);
  assert.equal(failed.status, 'failed');
  assert.equal(failed.message, 'Claude declined to plan this sculpture: “I cannot plan this sculpture.”. The field notes, current portrait and existing CAD are unchanged; try another portrait or request CAD again.');
  assert.equal(kept.cadError, failed.message);
  for (const key of ['biology', 'portraits', 'portraitVersion', 'print', 'anatomy']) assert.deepEqual(kept[key], original[key]);
  assert.deepEqual(await readFile(store.portraitFile(kept)), bytes);
  assert.deepEqual(await readFile(store.modelFile(kept, 'model.stl')), model);
  assert.equal(readTrace(store, refused.jobId).steps.find(step => step.stage === 'cad-design').responseText, reply);
});
