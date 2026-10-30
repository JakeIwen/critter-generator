import test from 'node:test';
import assert from 'node:assert/strict';
import { Codex, imageBytes } from '../server/codex.mjs';
import { safeError } from '../server/safe-error.mjs';

test('turn events only resolve the owned thread and ignore reasoning', async () => {
  const client = new Codex('/tmp');
  let result;
  client.active = { threadId:'owned',messages:[],images:[],resolve:r=>result=r,reject:e=>{throw e;} };
  client.receive({method:'item/completed',params:{threadId:'unrelated',item:{type:'agentMessage',text:'private unrelated text'}}});
  client.receive({method:'item/completed',params:{threadId:'owned',item:{type:'reasoning',text:'private reasoning'}}});
  client.receive({method:'item/completed',params:{threadId:'owned',item:{type:'agentMessage',text:'{"englishName":"Test"}'}}});
  client.receive({method:'turn/completed',params:{threadId:'owned',turn:{status:'completed'}}});
  assert.equal(result.text,'{"englishName":"Test"}'); assert.equal(client.active,null);
});
test('failed turns reject and unsupported requests are never approved', () => {
  const client=new Codex('/tmp'); let error, reply;
  client.active={threadId:'owned',reject:e=>error=e};
  client.receive({method:'turn/completed',params:{threadId:'owned',turn:{status:'failed',error:{message:'test failure'}}}});
  assert.match(error.message,/test failure/);
  client.send=message=>reply=message;
  client.receive({id:1,method:'item/commandExecution/requestApproval',params:{}});
  assert.equal(reply.result.decision,'decline');
});
test('a turn that streams endless whitespace is interrupted and rejected as runaway', () => {
  const client = new Codex('/tmp'); let error, interrupted;
  client.rpc = (method, params) => { interrupted = { method, params }; return Promise.resolve(); };
  client.active = { threadId:'owned', turnId:'t1', messages:[], images:[], resolve:()=>{}, reject:e=>error=e };
  client.receive({method:'item/agentMessage/delta',params:{threadId:'owned',delta:'{"fieldNote": '}});
  for (let i = 0; i < 100 && !error; i++) client.receive({method:'item/agentMessage/delta',params:{threadId:'owned',delta:' \n  '}});
  assert.equal(error.code, 'runaway_output');
  assert.deepEqual(interrupted, { method:'turn/interrupt', params:{ threadId:'owned', turnId:'t1' } });
  assert.equal(client.active, null);
});
test('ordinary whitespace between JSON values does not trip the runaway check', () => {
  const client = new Codex('/tmp'); let error;
  client.active = { threadId:'owned', messages:[], images:[], resolve:()=>{}, reject:e=>error=e };
  for (let i = 0; i < 500; i++) client.receive({method:'item/agentMessage/delta',params:{threadId:'owned',delta:i % 3 ? '  ' : '"word", '}});
  assert.equal(error, undefined); assert.ok(client.active);
});
test('image failures are explicit and credentials are redacted from errors', async () => {
  await assert.rejects(imageBytes([]),/no image/);
  await assert.rejects(imageBytes([{result:'not an image',failure:null}]),/no image/);
  assert.equal(safeError(new Error('sk-test_123 Bearer abc.def')),'[redacted] Bearer [redacted]');
});

class ProtocolFixture extends Codex {
  constructor(options = {}) { super('/fixture', options); this.requests = []; this.outcome = options.outcome; }
  async open() {
    this.mcpNames = [];
    const models = await this.listModels();
    this.effort = 'medium'; this.state = { connected: true, model: models[0].id, reason: null };
    return this.state;
  }
  async rpc(method, params) {
    this.requests.push({ method, params });
    if (method === 'model/list') return params.cursor ? { data: [{ model: 'other-model', displayName: 'Other',
      description: 'Another model', supportedReasoningEfforts: [], defaultReasoningEffort: null }], nextCursor: null } : {
      data: [{ model: 'gpt-6-astra', displayName: 'Astra', description: 'Astra model',
        supportedReasoningEfforts: [{ reasoningEffort: 'medium' }, { reasoningEffort: 'max' }], defaultReasoningEffort: 'medium', isDefault: true }], nextCursor: 'page-2',
    };
    if (method === 'thread/start') return { thread: { id: 'selected-thread' }, sandbox: { type: 'readOnly' } };
    if (method === 'turn/start') {
      queueMicrotask(() => {
        for (const item of this.outcome?.items ?? [{ type: 'agentMessage', text: '{"ok":true}' }]) {
          this.receive({ method: 'item/completed', params: { threadId: params.threadId, item } });
        }
        this.receive({ method: 'turn/completed', params: { threadId: params.threadId, turn: this.outcome?.turn ?? { status: 'completed' } } });
      });
      return { turn: { id: 'turn-1' } };
    }
    return {};
  }
}

test('Codex lists every visible model page and maps model metadata', async () => {
  const client = new ProtocolFixture();
  const models = await client.models();
  assert.deepEqual(models, [
    { id: 'gpt-6-astra', resolvedModel: null, label: 'Astra', description: 'Astra model', efforts: ['medium', 'max'], defaultEffort: 'medium', isDefault: true },
    { id: 'other-model', resolvedModel: null, label: 'Other', description: 'Another model', efforts: [], defaultEffort: null, isDefault: false },
  ]);
  for (const request of client.requests) assert.equal(request.params.includeHidden, false);
  assert(client.requests.some(request => request.params.cursor === 'page-2'));
});

test('Codex sends per-call model and effort to both thread and turn and rejects missing models', async () => {
  const client = new ProtocolFixture();
  const result = await client.run({ prompt: 'Describe', schema: { type: 'object' }, model: 'gpt-6-astra', effort: 'max' });
  assert.equal(result.text, '{"ok":true}');
  const thread = client.requests.find(request => request.method === 'thread/start').params;
  const turn = client.requests.find(request => request.method === 'turn/start').params;
  assert.equal(thread.model, 'gpt-6-astra'); assert.equal(thread.config.model_reasoning_effort, 'max');
  assert.equal(turn.model, 'gpt-6-astra'); assert.equal(turn.effort, 'max');
  const count = client.requests.length;
  await assert.rejects(client.run({ prompt: 'Describe', model: 'missing', effort: 'max' }),
    /^Error: Selected model missing is not available to this Codex account\. Choose another in Settings\.$/);
  assert.equal(client.requests.length, count, 'Unavailable selections never begin a thread');
});


test('models without reasoning effort omit the config override rather than passing a null TOML value', async () => {
  const client = new ProtocolFixture();
  await client.run({ prompt: 'Describe', model: 'other-model', effort: null });
  const thread = client.requests.find(request => request.method === 'thread/start').params;
  assert.equal(Object.hasOwn(thread.config, 'model_reasoning_effort'), false);
  const turn = client.requests.find(request => request.method === 'turn/start').params;
  assert.equal(turn.model, 'other-model'); assert.equal(turn.effort, null);
});

test('Codex turn timeout reads current settings and reports the configured duration', async t => {
  let generationTimeoutMinutes = 2, started;
  const client = new ProtocolFixture({ getSettings: () => ({ generationTimeoutMinutes }) });
  const rpc = client.rpc.bind(client);
  client.rpc = async (method, params) => {
    if (method === 'turn/start') {
      client.receive({ method: 'turn/started', params: { threadId: params.threadId, turn: { id: 'timeout-turn' } } });
      started(); return { turn: { id: 'timeout-turn' } };
    }
    return rpc(method, params);
  };
  await client.connect();
  t.mock.timers.enable({ apis: ['setTimeout'] });
  for (const minutes of [2, 1]) {
    generationTimeoutMinutes = minutes;
    const ready = new Promise(resolve => { started = resolve; });
    const result = client.run({ prompt: 'Wait', model: 'gpt-6-astra', effort: 'max' });
    const rejected = assert.rejects(result, new RegExp(`after ${minutes} minute${minutes === 1 ? '' : 's'}\\.`));
    await ready;
    t.mock.timers.tick(minutes * 60_000 - 1);
    assert(!client.requests.some(request => request.method === 'turn/interrupt'));
    t.mock.timers.tick(1); await rejected;
    assert(client.requests.some(request => request.method === 'turn/interrupt'));
    client.requests.length = 0;
  }
});


test('Codex reports structured policy failures and retains the original turn evidence', async () => {
  for (const codexErrorInfo of ['cyberPolicy', 'misalignmentPolicyViolation']) {
    const failure = { message: 'This request was not completed.', codexErrorInfo, additionalDetails: 'Original provider detail.', misalignment: null };
    const reply = 'The original assistant reply.';
    const images = [{ type: 'imageGeneration', id: 'failed-image', result: '', failure: 'moderation_blocked' }];
    const client = new ProtocolFixture({ outcome: { items: [{ type: 'agentMessage', text: reply }, ...images],
      turn: { status: 'failed', error: failure } } });
    await assert.rejects(client.run({ prompt: 'Paint', image: true }), error => {
      assert.equal(error.message, 'Codex blocked the request to paint this portrait for safety reasons.');
      assert.equal(error.providerResponse.text, reply); assert.deepEqual(error.providerResponse.failure, failure);
      assert.deepEqual(error.providerResponse.images, images); return true;
    });
  }
});

test('Codex image failures distinguish moderation evidence from the real usage-limit variant', async () => {
  // The installed protocol only types usageLimitExceeded; policy text can still arrive from newer servers.
  for (const [failure, expected] of [
    ['moderation_blocked: This image was rejected by the safety filter.', 'The image safety filter blocked this portrait.'],
    [{ type: 'usageLimitExceeded', limitId: 'image-generation', resetsAt: 1_800_000_000 }, 'The image generation usage limit was reached.'],
    [{ message: 'The image encoder is unavailable.' }, 'The image encoder is unavailable.'],
  ]) {
    const client = new ProtocolFixture({ outcome: { items: [
      { type: 'imageGeneration', id: 'failed-image', status: 'failed', result: '', failure },
      { type: 'agentMessage', text: 'I cannot paint the image right now.' },
    ] } });
    const result = await client.run({ prompt: 'Paint', image: true });
    await assert.rejects(imageBytes(result.images, result.text), { message: expected });
  }
});

test('Codex text-only refusals use a bounded one-line redacted excerpt without inventing a safety block', async () => {
  const reply = "I can't paint this portrait.\n\tPlease change it. sk-secret Bearer secret " + 'More detail. '.repeat(25);
  const client = new ProtocolFixture({ outcome: { items: [{ type: 'agentMessage', text: reply }] } });
  const result = await client.run({ prompt: 'Paint', image: true });
  await assert.rejects(imageBytes(result.images, result.text), error => {
    assert.match(error.message, /^Codex declined to paint this portrait: “I can't paint this portrait\. Please change it\. \[redacted\] Bearer \[redacted\]/);
    const excerpt = error.message.split('“')[1].split('”')[0];
    assert(excerpt.length >= 150 && excerpt.length <= 160); assert(excerpt.endsWith('…')); assert(!error.message.includes('\n'));
    assert.equal(error.providerResponse.text, reply); return true;
  });
  await assert.rejects(imageBytes([], 'Done.'), { message: 'Codex returned no image: “Done.”.' });
});

test('non-safety Codex turn errors keep their reason and policy text is recognized without a code', async () => {
  for (const [failure, expected] of [
    [{ message: 'The server is overloaded.', codexErrorInfo: 'serverOverloaded' }, 'The server is overloaded.'],
    [{ message: 'Request rejected by the content policy.', codexErrorInfo: 'other' }, 'Codex blocked the request to write this specimen for safety reasons.'],
    [{ message: 'Request failed.', codexErrorInfo: 'other', additionalDetails: 'moderation_blocked' }, 'Codex blocked the request to write this specimen for safety reasons.'],
  ]) {
    const client = new ProtocolFixture({ outcome: { items: [], turn: { status: 'failed', error: failure } } });
    await assert.rejects(client.run({ prompt: 'Describe', schema: { type: 'object' } }), { message: expected });
  }
});
