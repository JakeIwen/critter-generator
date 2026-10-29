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
import { Anatomy, Settings, example } from '../shared/specimen.mjs';

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
        ? { anatomy: Anatomy.parse({ ...example.anatomy, legPairs: 0, legLength: 0 }), approximationNotes: ['Fine flexible flippers are approximated by a smooth solid.'] } : design;
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
  const cadStep = readTrace(store, cad.jobId).steps.find(step => step.stage === 'cad-design');
  assert.equal(cadStep.provider, 'claude'); assert.equal(cadStep.reasoningEffort, 'max');
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
