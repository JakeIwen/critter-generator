import test from 'node:test';
import assert from 'node:assert/strict';
import { createJobController } from '../src/generation-jobs.js';
import { JOB_KINDS } from '../shared/generation-timing.mjs';

const flush = () => new Promise(resolve => setImmediate(resolve));
function browser(t, kind = JOB_KINDS.CAD) {
  const originals = Object.fromEntries(['fetch', 'sessionStorage', 'setTimeout', 'setInterval', 'clearInterval'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  const storage = new Map(), nodes = {}, jobs = [], busy = [], completed = [], errors = [], requests = [];
  let wake, status = 'running', stage = 'cad-design', postResolve;
  const currentJob = () => ({ id: 'job', kind, specimenId: 'example', createdAt: '2026-01-01T00:00:00Z', status, stage, message: stage });
  const byId = id => nodes[id] ??= { textContent: '', classes: new Set(), setAttribute() {}, removeAttribute() {},
    classList: { add(name) { nodes[id].classes.add(name); }, remove(name) { nodes[id].classes.delete(name); }, toggle(name, value) { if (value) nodes[id].classes.add(name); else nodes[id].classes.delete(name); } } };
  const globals = {
    sessionStorage: { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) },
    setTimeout(callback, ms) { assert.equal(ms, 1800); wake = callback; }, setInterval() { return 1; }, clearInterval() {},
    async fetch(url, options) {
      requests.push([url, options?.method]);
      let body;
      if (url.endsWith('/cancel')) { status = 'cancelled'; body = {}; }
      else if (url === '/api/jobs/job') body = currentJob();
      else if (url === '/api/status') body = {};
      else body = await new Promise(resolve => { postResolve = resolve; });
      return { ok: true, json: async () => body };
    },
  };
  for (const [key, value] of Object.entries(globals)) Object.defineProperty(globalThis, key, { configurable: true, value });
  t.after(() => { for (const [key, descriptor] of Object.entries(originals)) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key]; } });
  const controller = createJobController(byId, { onBusy: value => busy.push(value), onJob: (job, title) => jobs.push([job, title]),
    onLaunchPending() {}, onPending() {}, onSpecimen() {}, onComplete: job => completed.push(job), onError: error => errors.push(error) });
  return { controller, nodes, jobs, busy, completed, errors, requests, storage,
    accept() { postResolve({ jobId: 'job', createdAt: currentJob().createdAt }); },
    async poll(nextStatus = status, nextStage = stage) { status = nextStatus; stage = nextStage; wake(); await flush(); },
  };
}

test('CAD feedback starts before POST resolves, follows stages and clears on completion', async t => {
  const v = browser(t);
  const launch = v.controller.launch('/api/specimens/example/cad', { height: 100 }, JOB_KINDS.CAD, 'example');
  assert.equal(v.jobs.at(-1)[0].specimenId, 'example'); assert.match(v.jobs.at(-1)[0].message, /Connecting/);
  assert.equal(v.nodes['status-box'].classes.has('hidden'), true);
  v.accept(); await launch; await flush();
  assert.equal(v.jobs.at(-1)[1], 'Interpreting the portrait for CAD');
  assert.equal(v.storage.get('critter-job'), 'job');
  await v.poll('running', 'model'); assert.equal(v.jobs.at(-1)[1], 'Building the print sculpture');
  await v.poll('completed', 'done');
  assert.equal(v.jobs.at(-1)[0], null); assert.equal(v.busy.at(-1), false); assert.equal(v.completed[0].status, 'completed');
  assert.equal(v.storage.has('critter-job'), false); assert.deepEqual(v.errors, []);
});

test('reloaded CAD jobs recover in-card state and both cancel entry points use the same path', async t => {
  const v = browser(t); v.controller.resume('job'); await flush();
  assert.equal(v.jobs.at(-1)[0].createdAt, '2026-01-01T00:00:00Z');
  assert.equal(v.nodes.cancel.onclick, v.controller.cancel);
  await v.controller.cancel();
  assert.equal(v.jobs.at(-1)[0].cancelling, true);
  assert.deepEqual(v.requests.filter(([url]) => url.endsWith('/cancel')), [['/api/jobs/job/cancel', 'POST']]);
  await v.poll(); assert.equal(v.completed[0].status, 'cancelled'); assert.equal(v.jobs.at(-1)[0], null);
});

test('failed jobs reset in-card feedback and hand the terminal result to the existing completion path', async t => {
  const v = browser(t); v.controller.resume('job'); await flush(); await v.poll('failed');
  assert.equal(v.completed[0].status, 'failed'); assert.equal(v.busy.at(-1), false); assert.equal(v.jobs.at(-1)[0], null);
});

test('portrait jobs hide the top status box and retain their stage feedback', async t => {
  const v = browser(t, JOB_KINDS.PORTRAIT); v.controller.resume('job'); await flush();
  assert.equal(v.nodes['status-box'].classes.has('hidden'), true);
  await v.poll('running', 'image'); assert.equal(v.nodes['status-title'].textContent, 'Drawing the portrait');
  await v.poll('completed', 'done'); assert.equal(v.nodes['status-box'].classes.has('hidden'), true);
});

test('portrait submission immediately identifies its specimen and edit control, then clears saved context', async t => {
  const v = browser(t, JOB_KINDS.PORTRAIT);
  const launch = v.controller.launch('/api/specimens/example/portrait', { instructions: 'Orange fur' }, JOB_KINDS.PORTRAIT, 'example', 'apply-portrait-edit');
  assert.equal(v.jobs.at(-1)[0].specimenId, 'example');
  assert.equal(v.jobs.at(-1)[0].actionButtonId, 'apply-portrait-edit');
  assert.match(v.jobs.at(-1)[0].message, /Connecting/);
  assert.equal(v.nodes['status-box'].classes.has('hidden'), true);
  v.accept(); await launch; await flush();
  assert.equal(v.jobs.at(-1)[0].actionButtonId, 'apply-portrait-edit');
  assert.equal(v.storage.get('critter-job-action'), 'apply-portrait-edit');
  await v.poll('completed', 'done');
  assert.equal(v.storage.has('critter-job-action'), false); assert.deepEqual(v.errors, []);
});

test('reloaded portrait edits recover their action and share cancellation', async t => {
  const v = browser(t, JOB_KINDS.PORTRAIT);
  v.storage.set('critter-job', 'job'); v.storage.set('critter-job-action', 'apply-portrait-edit');
  v.controller.resume('job'); await flush();
  assert.equal(v.jobs.at(-1)[0].actionButtonId, 'apply-portrait-edit');
  assert.equal(v.nodes['status-box'].classes.has('hidden'), true);
  await v.controller.cancel(); assert.equal(v.jobs.at(-1)[0].cancelling, true);
  await v.poll(); assert.equal(v.completed[0].status, 'cancelled'); assert.equal(v.jobs.at(-1)[0], null);
  assert.equal(v.storage.has('critter-job-action'), false);
});

test('portrait failure restores controls through the existing terminal result path', async t => {
  const v = browser(t, JOB_KINDS.PORTRAIT); v.controller.resume('job'); await flush(); await v.poll('failed', 'image');
  assert.equal(v.completed[0].status, 'failed'); assert.equal(v.busy.at(-1), false); assert.equal(v.jobs.at(-1)[0], null);
  assert.equal(v.nodes['status-box'].classes.has('hidden'), true);
});

test('full discoveries keep their form-adjacent status box', async t => {
  const v = browser(t, JOB_KINDS.GENERATION); v.controller.resume('job'); await flush();
  assert.equal(v.nodes['status-box'].classes.has('hidden'), false);
  await v.poll('completed', 'done'); assert.equal(v.nodes['status-box'].classes.has('hidden'), true);
});
