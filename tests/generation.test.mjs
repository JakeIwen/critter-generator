import { DEFAULT_APP_SETTINGS } from '../shared/app-settings.mjs';
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

async function isolatedGenerationServer(t, { failFirstPortrait = false, corruptReference = false, failDesignOnce = false, holdReview = false, seedJobs = [], outcome = null } = {}) {
  const scratch = await mkdtemp(path.join(tmpdir(), 'critter-generation-'));
  const listener = createServer().listen(0, '127.0.0.1');
  await once(listener, 'listening');
  const port = listener.address().port;
  await new Promise(resolve => listener.close(resolve));
  const bin = path.join(scratch, 'bin'), log = path.join(scratch, 'requests.jsonl');
  await mkdir(bin);
  const fixture = new URL('./fixtures/design-codex.mjs', import.meta.url).href;
  await writeFile(path.join(bin, 'codex'), `#!${process.execPath}\nimport ${JSON.stringify(fixture)};\n`, { mode: 0o700 });
  for (const job of seedJobs) {
    const folder = path.join(scratch, 'data/jobs', job.id);
    await mkdir(folder, { recursive: true });
    await writeFile(path.join(folder, 'record.json'), JSON.stringify(job));
    if (job.trace) await writeFile(path.join(folder, 'trace.json'), JSON.stringify(job.trace));
  }
  const child = spawn(process.execPath, ['server/index.mjs'], { cwd: root, stdio: ['ignore', 'ignore', 'pipe'],
    env: { ...process.env, PATH: bin, PORT: String(port), CRITTER_DATA_DIR: path.join(scratch, 'data'),
      CRITTER_CLAUDE_EXECUTABLE: path.join(bin, 'claude-unavailable'), CRITTER_TEST_LOG: log, CRITTER_TEST_FAIL_FIRST_PORTRAIT: failFirstPortrait ? '1' : '',
      CRITTER_TEST_CORRUPT_REFERENCE: corruptReference ? '1' : '', CRITTER_TEST_FAIL_DESIGN_ONCE: failDesignOnce ? '1' : '',
      CRITTER_TEST_HOLD_REVIEW: holdReview ? '1' : '', CRITTER_TEST_TURN_OUTCOME: JSON.stringify(outcome), PUBLIC_ORIGIN: '' } });
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
  const configured = await fetch(origin + '/api/settings/generation', { method: 'PUT', headers,
    body: JSON.stringify({ provider: 'codex', model: 'fixture', effort: null }) });
  assert.equal(configured.status, 200);
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

test('generation is image-first even for legacy print settings and preserves preview directions and trace', async t => {
  const { origin, get, post, requests } = await isolatedGenerationServer(t);
  for (const prompt of ['', 'A cat with a white tail ring.']) {
    const body = { ...legacySettings, prompt, printModel: true, requiredFeatures: ['one white tail ring'], excludedFeatures: ['wings'] };
    const previewResponse = await fetch(origin + '/api/plan', { method: 'POST', headers, body: JSON.stringify(body) });
    assert.equal(previewResponse.status, 200);
    const { plan } = await previewResponse.json();
    const job = await post('/api/generate', { ...body, plan });
    assert.equal(job.status, 'completed', job.message);
    const specimen = await get(`/api/specimens/${job.specimenId}/files/record.json`);
    assert.deepEqual(specimen.variation, plan);
    assert.deepEqual(job.variation, plan);
    assert.equal(specimen.anatomy, null); assert.equal(specimen.print, null);
    assert.equal(specimen.settings.printModel, false);
    assert.equal(specimen.visualRequirements.originalPrompt, prompt);
    assert(specimen.visualRequirements.required.includes('one white tail ring'));
    assert(specimen.visualRequirements.excluded.includes('wings'));
    for (const name of ['model.stl', 'model.scad', 'mesh.json']) {
      assert.equal((await fetch(`${origin}/api/specimens/${specimen.id}/files/${name}`)).status, 404);
    }
    const trace = await get(`/api/specimens/${specimen.id}/trace`);
    assert.equal(trace.status, 'completed'); assert.equal(trace.templateVersion, 4);
    assert.equal(trace.settings.prompt, prompt); assert.deepEqual(trace.variation, plan);
    assert.equal(trace.steps.find(step => step.stage === 'design').orchestrationModel, 'fixture');
    const image = trace.steps.find(step => step.stage === 'image');
    assert(image.input[0].text.includes(prompt));
    assert(image.input[0].text.includes('one white tail ring'));
    assert.equal(image.images[0].revisedPrompt, 'Offline fixture revised portrait prompt.');
    assert.equal(image.images[0].imageModel, null);
    assert(trace.steps.every(step => Number.isFinite(step.durationMs)));
    assert.equal((await fetch(`${origin}/api/specimens/${specimen.id}/portraits/1.png`)).status, 200);
  }
  assert.equal((await requests()).length, 4);
});

test('portrait-only generation saves biology without CAD and retries the same organism and scene', async t => {
  const { scratch, origin, get, post, requests } = await isolatedGenerationServer(t, { failFirstPortrait: true });
  const settings = { ...legacySettings, printModel: false, animalTypes: ['cephalopods'], legless: true };
  const job = await post('/api/generate', settings);
  assert.equal(job.status, 'partial', job.message);
  assert.equal(job.message, 'The isolated portrait fixture failed once. The field notes are saved; use Retry portrait.');
  const recordRoute = `/api/specimens/${job.specimenId}/files/record.json`;
  const specimen = await get(recordRoute);
  assert.equal((await get('/api/status')).generationTiming.sampleCount, 0, 'Partial generation is not a completed timing sample');
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
  assert.equal((await get('/api/status')).generationTiming.sampleCount, 0, 'Portrait retries do not shorten the full-generation estimate');
  assert.deepEqual((await readdir(folder)).sort(), ['portrait.png', 'portraits', 'record.json']);
  assert.equal((await fetch(`${origin}/api/specimens/${specimen.id}/files/portrait.png`)).status, 200);
  const turns = await requests();
  assert.equal(turns.filter(turn => turn.outputSchema).length, 1, 'Retry never reruns design');
  assert.equal(turns.length, 3);
  assert.deepEqual(turns[1].input, turns[2].input, 'Retry uses the original biology, environment and camera direction');
  assert(turns[1].input[0].text.includes(specimen.biology.bodyPlan));
  const next = await post('/api/generate', settings);
  assert.equal(next.status, 'completed', 'Saved null anatomy can participate in future diversity history');
  assert.equal((await get('/api/status')).generationTiming.sampleCount, 1);
  assert.equal((await fetch(`${origin}/api/specimens/example-lantern/files/model.stl`)).status, 404, 'A fresh example does not generate CAD at startup');
});

test('HTTP loader estimate uses the timing window of completed generations and freezes the preceding average on each job', async t => {
  const seedJobs = Array.from({ length: 12 }, (_, index) => {
    const start = Date.UTC(2025, 0, 1, index);
    return { id: `history-${index}`, status: 'completed', kind: 'generation', designThreadId: `design-${index}`,
      createdAt: new Date(start).toISOString(), finishedAt: new Date(start + (60 + index * 10) * 1000).toISOString() };
  });
  for (const [id, status, kind] of [['retry', 'completed', 'portrait'], ['failed', 'failed', 'generation']]) {
    seedJobs.push({ id, status, kind, createdAt: '2025-01-02T00:00:00Z', finishedAt: '2025-01-02T00:20:00Z' });
  }
  const { origin, get, post } = await isolatedGenerationServer(t, { seedJobs });
  const before = (await get('/api/status')).generationTiming;
  const previousDurations = seedJobs.filter(job => job.id.startsWith('history-')).slice(-DEFAULT_APP_SETTINGS.timingWindow)
    .map(job => Date.parse(job.finishedAt) - Date.parse(job.createdAt));
  const expectedAverage = previousDurations.reduce((sum, duration) => sum + duration, 0) / DEFAULT_APP_SETTINGS.timingWindow;
  assert.equal(before.sampleCount, DEFAULT_APP_SETTINGS.timingWindow);
  assert.equal(before.averageDurationMs, expectedAverage);
  assert.equal(before.estimatedDurationMs, expectedAverage);
  const connected = await fetch(origin + '/api/connect', { method: 'POST', headers, body: '{}' });
  assert.equal(connected.status, 200);
  assert.deepEqual((await connected.json()).generationTiming, before);
  const job = await post('/api/generate', { ...legacySettings, printModel: false });
  assert.equal(job.status, 'completed', job.message);
  assert.equal(job.estimatedDurationMs, before.estimatedDurationMs);
  assert.equal(job.durationMs, Date.parse(job.finishedAt) - Date.parse(job.createdAt));
  const after = (await get('/api/status')).generationTiming;
  assert.equal(after.sampleCount, DEFAULT_APP_SETTINGS.timingWindow);
  const retainedTotal = previousDurations.slice(1).reduce((sum, duration) => sum + duration, 0);
  assert(Math.abs(after.averageDurationMs - (retainedTotal + job.durationMs) / DEFAULT_APP_SETTINGS.timingWindow) <= 1);
  assert.equal(after.estimatedDurationMs, after.averageDurationMs);
  assert.equal((await get(`/api/jobs/${job.id}`)).estimatedDurationMs, expectedAverage, 'Current job keeps its original estimate');
});

test('on-demand CAD uses the current image and becomes stale after a versioned edit', async t => {
  const { origin, get, post, requests } = await isolatedGenerationServer(t);
  const first = await post('/api/generate', { ...legacySettings, prompt: 'A marine animal, no walking legs.' });
  const recordRoute = `/api/specimens/${first.specimenId}/files/record.json`;
  const original = await get(recordRoute);
  const originalImage = Buffer.from(await (await fetch(`${origin}/api/specimens/${original.id}/files/portrait.png`)).arrayBuffer());
  const cad = await post(`/api/specimens/${original.id}/cad`, { height: 125, baseplate: false });
  assert.equal(cad.status, 'completed', cad.message); assert.equal(cad.kind, 'cad');
  const printed = await get(recordRoute);
  assert.deepEqual(printed.biology, original.biology);
  assert.equal(printed.print.sourcePortraitVersion, 1);
  assert.equal(printed.print.stale, false); assert.equal(printed.print.height, 125);
  assert.equal(printed.print.baseplate, false);
  const modelRoute = `${origin}/api/specimens/${original.id}/files/model.stl`;
  const model = await fetch(modelRoute), oldModel = Buffer.from(await model.arrayBuffer());
  assert.equal(model.headers.get('x-critter-cad-stale'), 'false');
  const edit = await post(`/api/specimens/${original.id}/portrait`, { instructions: 'Change only the body color to orange.' });
  assert.equal(edit.status, 'completed', edit.message);
  const changed = await get(recordRoute);
  assert.equal(changed.id, original.id); assert.deepEqual(changed.biology, original.biology);
  assert.equal(changed.portraitVersion, 2); assert.equal(changed.portraits.length, 2);
  assert.equal(changed.portraits[1].kind, 'edit'); assert.equal(changed.print.stale, true);
  assert.equal(changed.portraitEdits[0].instructions, 'Change only the body color to orange.');
  const archived = await fetch(`${origin}/api/specimens/${original.id}/portraits/1.png`);
  assert.deepEqual(Buffer.from(await archived.arrayBuffer()), originalImage);
  const current = await fetch(`${origin}/api/specimens/${original.id}/files/portrait.png`);
  assert.notDeepEqual(Buffer.from(await current.arrayBuffer()), originalImage);
  const stale = await fetch(modelRoute);
  assert.equal(stale.headers.get('x-critter-cad-stale'), 'true');
  assert.deepEqual(Buffer.from(await stale.arrayBuffer()), oldModel, 'Stale CAD remains downloadable unchanged');
  const newerCad = await post(`/api/specimens/${original.id}/cad`, { height: 160 });
  assert.equal(newerCad.status, 'completed', newerCad.message);
  const updated = await get(recordRoute);
  assert.equal(updated.print.sourcePortraitVersion, 2); assert.equal(updated.print.stale, false);
  assert.notEqual(updated.print.assetRevision, printed.print.assetRevision);
  const turns = await requests();
  for (const turn of turns.filter(turn => turn.outputSchema?.properties.approximationNotes || !turn.outputSchema && turn.input.length > 1)) {
    assert(turn.input.some(input => input.type === 'localImage'), 'CAD and edits receive the reference image');
  }
  const timing = (await get('/api/status')).generationTiming;
  assert.equal(timing.sampleCount, 1, 'CAD and portrait edits do not enter the discovery-time average');
});

test('a failed regenerated image preserves the current portrait and CAD freshness', async t => {
  const { origin, get, post } = await isolatedGenerationServer(t, { corruptReference: true });
  const first = await post('/api/generate', legacySettings);
  const route = `/api/specimens/${first.specimenId}/files/record.json`;
  const old = await get(route);
  const before = Buffer.from(await (await fetch(`${origin}/api/specimens/${old.id}/files/portrait.png`)).arrayBuffer());
  const edit = await post(`/api/specimens/${old.id}/portrait`, { instructions: 'Change its color.' });
  assert.equal(edit.status, 'failed'); assert.match(edit.message, /decoded/);
  const unchanged = await get(route);
  assert.equal(unchanged.portraitVersion, 1); assert.equal(unchanged.portraits.length, 1);
  assert.deepEqual(Buffer.from(await (await fetch(`${origin}/api/specimens/${old.id}/files/portrait.png`)).arrayBuffer()), before);
  const trace = await get(`/api/jobs/${edit.id}/trace`);
  assert.equal(trace.status, 'failed');
  assert.equal(trace.steps.find(step => step.stage === 'portrait-publication').status, 'failed');
});

test('traces keep every design attempt and optional reviews are advisory', async t => {
  const { get, post, requests } = await isolatedGenerationServer(t, { failDesignOnce: true });
  const job = await post('/api/generate', { ...legacySettings, prompt: 'Four legs, no wings.', review: true });
  assert.equal(job.status, 'completed', job.message);
  const trace = await get(`/api/jobs/${job.id}/trace`);
  const attempts = trace.steps.filter(step => step.stage === 'design');
  assert.deepEqual(attempts.map(step => step.status), ['failed', 'completed']);
  assert.equal(attempts[0].errorCode, 'runaway_output');
  assert.deepEqual(attempts[0].input, attempts[1].input);
  assert.deepEqual(attempts[0].outputSchema, attempts[1].outputSchema);
  const specimen = await get(`/api/specimens/${job.specimenId}/files/record.json`);
  assert.equal(specimen.review.status, 'reviewed');
  assert.equal(specimen.review.issues[0].status, 'uncertain');
  assert.equal(specimen.review.designIssues.length, 1);
  const review = (await requests()).find(turn => turn.outputSchema?.properties.issues && turn.input.length > 1);
  assert(review.input.some(item => item.type === 'localImage'));
});

test('restart marks an unfinished trace and its active stage interrupted', async t => {
  const createdAt = '2025-01-01T00:00:00.000Z';
  const seedJobs = [{ id: 'abandoned', kind: 'portrait', status: 'running', createdAt,
    trace: { version: 1, jobId: 'abandoned', status: 'running', steps: [{ stage: 'image', status: 'running', startedAt: createdAt }] } }];
  const { get } = await isolatedGenerationServer(t, { seedJobs });
  const job = await get('/api/jobs/abandoned'), trace = await get('/api/jobs/abandoned/trace');
  assert.equal(job.status, 'interrupted'); assert.equal(trace.status, 'interrupted');
  assert.equal(trace.steps[0].status, 'interrupted'); assert(trace.steps[0].durationMs > 0);
  assert.equal(trace.finishedAt, job.finishedAt);
});

test('cancelling an advisory review preserves the newly published portrait instead of rolling it back', async t => {
  const { origin, get } = await isolatedGenerationServer(t, { holdReview: true });
  const started = await fetch(origin + '/api/generate', { method: 'POST', headers,
    body: JSON.stringify({ ...legacySettings, review: true }) });
  const { jobId } = await started.json();
  await waitFor(() => get(`/api/jobs/${jobId}/trace`), trace => trace.steps?.some(step => step.stage === 'image-review' && step.status === 'running'));
  const running = await get(`/api/jobs/${jobId}`);
  const recordRoute = `/api/specimens/${running.specimenId}/files/record.json`;
  const published = await get(recordRoute);
  assert.equal(published.image, true); assert.equal(published.portraitVersion, 1);
  assert.equal(published.review.status, 'unavailable');
  const cancelled = await fetch(origin + `/api/jobs/${jobId}/cancel`, { method: 'POST', headers, body: '{}' });
  assert.equal(cancelled.status, 200);
  const terminal = await waitFor(() => get(`/api/jobs/${jobId}`), job => job.status === 'cancelled');
  assert.equal(terminal.status, 'cancelled');
  const kept = await get(recordRoute);
  assert.equal(kept.image, true); assert.equal(kept.portraitVersion, 1);
  assert.equal(kept.portraits.length, 1); assert.equal(kept.review.status, 'unavailable');
  assert.equal((await fetch(`${origin}/api/specimens/${kept.id}/files/portrait.png`)).status, 200);
});

test('a blocked image keeps field notes, reports recovery and preserves raw image failure evidence', async t => {
  const failure = { code: 'moderation_blocked', message: 'The image was blocked by the safety filter.', detail: 'Original failure detail.' };
  const reply = 'The image tool did not return a portrait.';
  const { get, post } = await isolatedGenerationServer(t, { outcome: { stage: 'image', items: [
    { type: 'imageGeneration', id: 'blocked-image', status: 'failed', failure, result: '', revisedPrompt: 'Original revised prompt.' },
    { type: 'agentMessage', text: reply },
  ] } });
  const job = await post('/api/generate', legacySettings);
  assert.equal(job.status, 'partial');
  assert.equal(job.message, 'The image safety filter blocked this portrait. The field notes are saved; use Retry portrait, or soften the description or sliders and generate a new specimen.');
  const specimen = await get(`/api/specimens/${job.specimenId}/files/record.json`);
  assert(specimen.biology); assert.equal(specimen.print, null); assert.equal(specimen.image, false);
  assert.equal(specimen.imageError, job.message);
  const trace = await get(`/api/jobs/${job.id}/trace`), step = trace.steps.find(step => step.stage === 'image');
  assert.equal(trace.error, job.message); assert.equal(step.responseText, reply);
  assert.deepEqual(step.images[0].failureDetails, failure); assert.equal(step.images[0].failure, failure.message);
  assert.equal(step.images[0].revisedPrompt, 'Original revised prompt.');
});

test('text-only portrait and design refusals become plain messages instead of missing-image or JSON errors', async t => {
  for (const stage of ['image', 'design']) await t.test(stage, async t => {
    const action = stage === 'image' ? 'paint this portrait' : 'write this specimen';
    const reply = `I cannot ${action}.\n\tPlease revise the description.`;
    const { get, post } = await isolatedGenerationServer(t, { outcome: { stage, items: [{ type: 'agentMessage', text: reply }] } });
    const job = await post('/api/generate', legacySettings);
    const recovery = stage === 'image' ? 'The field notes are saved; use Retry portrait, or soften the description or sliders and generate a new specimen.' :
      'No specimen was saved; adjust the description and try again.';
    assert.equal(job.message, `Codex declined to ${action}: “I cannot ${action}. Please revise the description.”. ${recovery}`);
    assert.equal(job.status, stage === 'image' ? 'partial' : 'failed');
    assert.equal(Boolean(job.specimenId), stage === 'image');
    const trace = await get(`/api/jobs/${job.id}/trace`);
    assert.equal(trace.steps.find(step => step.stage === stage).responseText, reply);
  });
});

test('policy-failed turns keep structured errors and replies in the trace even without a successful result', async t => {
  const failure = { message: 'Request could not be completed.', codexErrorInfo: 'misalignmentPolicyViolation',
    additionalDetails: 'Original policy detail.', misalignment: null };
  const reply = 'Original declined reply.';
  const { get, post } = await isolatedGenerationServer(t, { outcome: { stage: 'image',
    items: [{ type: 'agentMessage', text: reply }], turn: { status: 'failed', error: failure } } });
  const job = await post('/api/generate', legacySettings);
  assert.equal(job.status, 'partial');
  assert.equal(job.message, 'Codex blocked the request to paint this portrait for safety reasons. The field notes are saved; use Retry portrait, or soften the description or sliders and generate a new specimen.');
  const trace = await get(`/api/jobs/${job.id}/trace`), step = trace.steps.find(step => step.stage === 'image');
  assert.equal(step.status, 'failed'); assert.equal(step.responseText, reply); assert.deepEqual(step.providerError, failure);
});
