import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { Claude } from '../server/claude.mjs';
import { claudeEnvironment, resolveClaudeExecutable } from '../server/provider-cli.mjs';
import { GENERATION_INSTRUCTIONS } from '../shared/generation-instructions.mjs';

const model = { value: 'fable', displayName: 'Fable', supportsEffort: true, supportedEffortLevels: ['low', 'high', 'max'], isDefault: true };
function fixture({ messages = [], account = { subscriptionType: 'max', apiProvider: 'firstParty', apiKeySource: 'none' },
  initialization, hold = false, models = [model], getSettings } = {}) {
  const calls = [], inputs = [];
  let closed = 0, interrupted = 0, entered;
  const started = new Promise(resolve => { entered = resolve; });
  const query = call => {
    calls.push(call);
    return { initializationResult: initialization ?? (async () => ({})), accountInfo: async () => account,
      supportedModels: async () => models, close: () => { closed++; }, interrupt: async () => { interrupted++; },
      async *[Symbol.asyncIterator]() {
        for await (const input of call.prompt) inputs.push(input);
        entered();
        if (hold) await new Promise(resolve => call.options.abortController.signal.addEventListener('abort', resolve, { once: true }));
        else for (const message of messages) yield message;
      } };
  };
  const provider = new Claude(os.tmpdir(), { query, resolveExecutable: () => '/fixture/claude', discoveryTimeoutMs: 15, getSettings });
  return { provider, calls, inputs, started, closed: () => closed, interrupted: () => interrupted };
}

test('Claude discovers lazily with an idle prompt and restricted subscription environment', async () => {
  const { provider, calls, closed } = fixture();
  assert.equal(calls.length, 0); assert.equal(provider.state.connected, false);
  assert.deepEqual(await provider.models(), [{ id: 'fable', resolvedModel: null, label: 'Fable', description: null,
    efforts: ['low', 'high', 'max'], defaultEffort: 'high', isDefault: true }]);
  const options = calls[0].options;
  assert.deepEqual(options.tools, []); assert.deepEqual(options.settingSources, []);
  assert.equal(options.strictMcpConfig, true); assert.equal(options.persistSession, false);
  assert.equal(options.permissionMode, 'dontAsk');
  assert.deepEqual(options.extraArgs, { restricted: null, 'disable-slash-commands': null });
  assert.equal(closed(), 1); assert.equal(provider.state.connected, true);
  assert.deepEqual(claudeEnvironment({ HOME: '/fixture', PATH: '/bin', ANTHROPIC_API_KEY: 'secret', OPENAI_BASE_URL: 'gateway',
    CRITTER_PASSCODE: 'secret', CLAUDE_CONFIG_DIR: '/wrong' }), {
    HOME: '/fixture', PATH: '/bin', CLAUDE_AGENT_SDK_CLIENT_APP: 'critter-generator/1.0',
  });
});

test('Claude returns structured output, reads a PNG reference, and reports the session id', async t => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'critter-claude-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const image = path.join(directory, 'reference.not-a-png-extension');
  const bytes = await readFile(new URL('../server/assets/example-lantern-portrait.png', import.meta.url));
  await writeFile(image, bytes);
  const { provider, calls, inputs } = fixture({ messages: [
    { type: 'assistant', session_id: 'thread-1', message: { content: [{ type: 'thinking', thinking: 'private' }, { type: 'text', text: 'not the JSON' }] } },
    { type: 'result', subtype: 'success', session_id: 'thread-1', structured_output: { count: 4 }, result: 'fallback' },
  ] });
  const schema = { type: 'object', properties: { count: { type: 'integer' } } }, threads = [];
  const result = await provider.run({ prompt: 'Describe this specimen.', schema, imagePaths: [image], model: 'fable', effort: 'max', onThread: id => threads.push(id) });
  assert.deepEqual(result, { text: '{"count":4}', images: [], threadId: 'thread-1' });
  assert.deepEqual(threads, ['thread-1']);
  assert.deepEqual(inputs[0].message.content, [{ type: 'text', text: 'Describe this specimen.' },
    { type: 'image', source: { type: 'base64', media_type: 'image/png', data: bytes.toString('base64') } }]);
  assert.equal(calls[1].options.model, 'fable'); assert.equal(calls[1].options.effort, 'max');
  assert.deepEqual(calls[1].options.outputFormat, { type: 'json_schema', schema });
  assert.equal(calls[1].options.systemPrompt, GENERATION_INSTRUCTIONS); assert.equal(calls[1].options.maxTurns, 3);
});

test('Claude falls back to assistant text but never treats error results as a specimen', async () => {
  const { provider } = fixture({ messages: [
    { type: 'assistant', session_id: 'thread', message: { content: [{ type: 'text', text: '{"ok":true}' }] } },
    { type: 'result', subtype: 'success', session_id: 'thread' },
  ] });
  assert.equal((await provider.run({ prompt: 'JSON', schema: { type: 'object' } })).text, '{"ok":true}');
  const failed = fixture({ messages: [{ type: 'result', subtype: 'error_max_turns', errors: ['Oops sk-secret Bearer secret'] }] });
  await assert.rejects(failed.provider.run({ prompt: 'JSON' }), /Oops \[redacted\] Bearer \[redacted\]/);
  await assert.rejects(provider.run({ prompt: 'Image', image: true }), /^Error: Claude cannot generate images$/);
});

test('Claude abort interrupts and closes the session even when the iterator has not returned', async () => {
  const { provider, started, closed, interrupted } = fixture({ hold: true });
  const controller = new AbortController();
  const result = provider.run({ prompt: 'Wait', signal: controller.signal });
  await started; controller.abort();
  await assert.rejects(result, /^Error: Generation cancelled\.$/);
  assert(closed() >= 2); assert.equal(interrupted(), 1);
  await assert.rejects(provider.run({ prompt: 'Already aborted', signal: controller.signal }), /cancelled/);
});

test('Claude discovery rejects API billing, unsigned accounts, missing executables and times out', async () => {
  for (const [account, reason] of [[{ apiProvider: 'gateway' }, /another API provider/],
    [{ apiKeySource: 'env', subscriptionType: 'max' }, /API-key billing/], [{}, /not signed in/]]) {
    const { provider } = fixture({ account });
    await assert.rejects(provider.models(), reason); assert.equal(provider.state.connected, false);
  }
  const timeout = fixture({ initialization: () => new Promise(() => {}) });
  await assert.rejects(timeout.provider.models(), /discovery timed out/); assert.equal(timeout.closed(), 1);
  const missing = new Claude(os.tmpdir(), { query: () => assert.fail('Must not spawn any CLI'), resolveExecutable: () => undefined });
  await assert.rejects(missing.models(), /CLI is unavailable/);
});

test('Claude listing strips only a trailing recommended marker and carries the resolved model identity', async () => {
  const { provider } = fixture({ models: [
    { ...model, value: 'default', displayName: 'Default (Recommended)  ', resolvedModel: 'claude-opus-5-5[1m]' },
    { ...model, value: 'sonnet', displayName: 'Sonnet 5.5  (recommended)', resolvedModel: 'claude-sonnet-5-5[1m]' },
    { ...model, value: 'haiku', displayName: 'Haiku 5.5 (RECOMMENDED)', resolvedModel: 'claude-haiku-5-5' },
    { ...model, value: 'named', displayName: 'Named (recommended) preview' },
  ] });
  const models = await provider.models();
  assert.deepEqual(models.map(({ id, label, resolvedModel }) => ({ id, label, resolvedModel })), [
    { id: 'default', label: 'Default', resolvedModel: 'claude-opus-5-5[1m]' },
    { id: 'sonnet', label: 'Sonnet 5.5', resolvedModel: 'claude-sonnet-5-5[1m]' },
    { id: 'haiku', label: 'Haiku 5.5', resolvedModel: 'claude-haiku-5-5' },
    { id: 'named', label: 'Named (recommended) preview', resolvedModel: null },
  ]);
});

test('Claude generation timeout reads current settings and closes the timed-out session', async t => {
  let generationTimeoutMinutes = 2;
  const { provider, started, interrupted } = fixture({ hold: true, getSettings: () => ({ generationTimeoutMinutes }) });
  await provider.connect();
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const result = provider.run({ prompt: 'Wait' });
  const rejected = assert.rejects(result, /after 2 minutes/);
  await started;
  t.mock.timers.tick(119_999); assert.equal(interrupted(), 0);
  t.mock.timers.tick(1); await rejected; assert.equal(interrupted(), 1);
  generationTimeoutMinutes = 1;
  const next = provider.run({ prompt: 'Wait again' });
  const nextRejected = assert.rejects(next, /after 1 minute\./);
  t.mock.timers.tick(60_000); await nextRejected;
});

test('the isolated-check marker disables even an explicitly resolvable Claude executable', t => {
  const keys = ['CRITTER_CHECK_MARKER', 'CRITTER_CLAUDE_EXECUTABLE'];
  const previous = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  t.after(() => { for (const key of keys) {
    if (previous[key] === undefined) delete process.env[key]; else process.env[key] = previous[key];
  } });
  delete process.env.CRITTER_CHECK_MARKER;
  process.env.CRITTER_CLAUDE_EXECUTABLE = process.execPath;
  assert.equal(resolveClaudeExecutable(), process.execPath);
  process.env.CRITTER_CHECK_MARKER = 'isolated-fixture';
  assert.equal(resolveClaudeExecutable(), undefined);
});
