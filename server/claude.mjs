import { DEFAULT_APP_SETTINGS, generationTimeoutMessage } from '../shared/app-settings.mjs';
import { readFile } from 'node:fs/promises';
import { query as sdkQuery } from '@anthropic-ai/claude-agent-sdk';
import { GENERATION_INSTRUCTIONS } from '../shared/generation-instructions.mjs';
import { PROVIDERS } from '../shared/generation-models.mjs';
import { modelFailure } from './model-refusals.mjs';
import { safeError } from './safe-error.mjs';
import { claudeOptions, resolveClaudeExecutable } from './provider-cli.mjs';

// Discovery bounds the subscription handshake, not a generation turn.
const DISCOVERY_TIMEOUT_MS = 20_000;
// No tools are offered, so the only extra turn is the structured-output end-turn tool call.
const MAX_TURNS = 3;

function subscriptionReason(account) {
  if (account.apiProvider && account.apiProvider !== 'firstParty') return 'Claude is configured for another API provider. Use a Claude subscription sign-in on this host.';
  if (account.apiKeySource && account.apiKeySource !== 'none') return 'Claude is using API-key billing. Use a Claude subscription sign-in on this host.';
  if (!account.subscriptionType && (!account.tokenSource || account.tokenSource === 'none')) return 'Claude is not signed in. Sign in with a Claude subscription on this host.';
  return null;
}

function listedModels(models) {
  return models.map(model => {
    const efforts = model.supportsEffort ? model.supportedEffortLevels ?? [] : [];
    return { id: model.value, resolvedModel: model.resolvedModel ?? null,
      label: (model.displayName || model.value).replace(/\s*\(recommended\)\s*$/i, '').slice(0, 120),
      description: model.description?.slice(0, 1000) ?? null, efforts,
      defaultEffort: efforts.includes('high') ? 'high' : efforts[Math.floor(efforts.length / 2)] ?? null,
      isDefault: model.isDefault ?? model.value === 'default' };
  });
}

function imageType(bytes) {
  if (bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return 'image/png';
  if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return 'image/jpeg';
  if (bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  throw new Error('Claude reference images must be PNG, JPEG or WebP.');
}

async function* userPrompt(prompt, files) {
  const content = [{ type: 'text', text: prompt }];
  for (const file of files) {
    const bytes = await readFile(file);
    content.push({ type: 'image', source: { type: 'base64', media_type: imageType(bytes), data: bytes.toString('base64') } });
  }
  yield { type: 'user', message: { role: 'user', content }, parent_tool_use_id: null };
}

async function readResult(session, { schema, onThread, onProgress, stage }) {
  let text = '', threadId = null, result, refusal = null, assistantId;
  for await (const message of session) {
    if (message.session_id && message.session_id !== threadId) { threadId = message.session_id; onThread?.(threadId); }
    if (message.type === 'system' && message.subtype === 'model_refusal_no_fallback') refusal = message;
    if (message.type === 'system' && message.subtype === 'model_refusal_fallback') refusal = null;
    if (message.type === 'assistant') {
      const content = (message.message?.content ?? []).filter(block => block.type === 'text').map(block => block.text).join('\n');
      const id = message.message?.id;
      if (id && id !== assistantId) text = '';
      if (content) text = text && id && id === assistantId ? `${text}\n${content}` : content;
      assistantId = id;
      if (message.message?.stop_reason === 'refusal') refusal = { stop_reason: 'refusal' };
      onProgress?.('Claude is writing the specimen…');
    }
    if (message.type !== 'result') continue;
    // Structured-output retry exhaustion is not, by itself, evidence of a refusal.
    if (message.is_error || message.subtype !== 'success' || message.stop_reason === 'refusal' || refusal) {
      throw modelFailure({ provider: PROVIDERS.CLAUDE, stage, reply: text || message.result || '',
        declined: message.stop_reason === 'refusal' || Boolean(refusal),
        failure: { subtype: message.subtype, stop_reason: message.stop_reason ?? null, errors: message.errors ?? [], result: message.result ?? null, refusal,
          message: message.errors?.join(' ') || message.result || 'Claude could not complete this generation.' } });
    }
    result = message;
    break;
  }
  if (!result) throw modelFailure({ provider: PROVIDERS.CLAUDE, stage, reply: text,
    declined: Boolean(refusal), failure: refusal, fallback: 'Claude returned no generation result.' });
  if (schema && result.structured_output !== undefined) text = JSON.stringify(result.structured_output);
  else text = text || result.result || '';
  return { text, images: [], threadId };
}

export class Claude {
  constructor(cwd, { query = sdkQuery, resolveExecutable = resolveClaudeExecutable,
    getSettings = () => DEFAULT_APP_SETTINGS, discoveryTimeoutMs = DISCOVERY_TIMEOUT_MS } = {}) {
    this.cwd = cwd; this.query = query; this.resolveExecutable = resolveExecutable;
    this.getSettings = getSettings; this.discoveryTimeoutMs = discoveryTimeoutMs;
    this.state = { connected: false, model: null, reason: 'Claude has not been checked yet.' };
  }
  async models() {
    if (this.discovering) return this.discovering;
    this.discovering = this.discover().finally(() => { this.discovering = null; });
    return this.discovering;
  }
  async discover() {
    let timer, release;
    const idle = new Promise(resolve => { release = resolve; });
    async function* idlePrompt() { await idle; }
    try {
      const session = this.query({ prompt: idlePrompt(), options: claudeOptions(this.cwd, this.resolveExecutable) });
      this.probe = session;
      const read = async () => {
        await session.initializationResult();
        const reason = subscriptionReason(await session.accountInfo());
        if (reason) throw new Error(reason);
        return listedModels(await session.supportedModels());
      };
      const models = await Promise.race([read(), new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('Claude model discovery timed out. Refresh the list to try again.')), this.discoveryTimeoutMs);
      })]);
      if (!models.length) throw new Error('No Claude models are available to this subscription.');
      this.availableModels = models;
      this.state = { connected: true, model: (models.find(model => model.isDefault) ?? models[0]).id, reason: null };
      return models;
    } catch (error) {
      this.availableModels = [];
      this.state = { connected: false, model: null, reason: safeError(error) };
      throw new Error(this.state.reason);
    } finally { clearTimeout(timer); release(); this.probe?.close(); this.probe = null; }
  }
  async connect() {
    if (!this.state.connected) await this.models();
    return this.state;
  }
  async execute(options, abortController) {
    await this.connect();
    if (abortController.signal.aborted) throw new Error('Generation cancelled.');
    const model = options.model ?? this.state.model;
    const listed = this.availableModels.find(item => item.id === model);
    if (!listed) throw new Error(`Selected model ${model} is not available to this Claude account. Choose another in Settings.`);
    const effort = options.effort === undefined ? listed.defaultEffort : options.effort;
    this.state = { connected: true, model, reason: null }; this.effort = effort;
    this.session = this.query({ prompt: userPrompt(options.prompt, options.imagePaths ?? []), options: {
      ...claudeOptions(this.cwd, this.resolveExecutable), model, ...(effort !== null ? { effort } : {}),
      systemPrompt: GENERATION_INSTRUCTIONS, maxTurns: MAX_TURNS, abortController,
      ...(options.schema ? { outputFormat: { type: 'json_schema', schema: options.schema } } : {}),
    } });
    return readResult(this.session, options);
  }
  async run(options) {
    if (options.image) throw new Error('Claude cannot generate images');
    if (options.signal?.aborted) throw new Error('Generation cancelled.');
    if (this.active) throw new Error('Claude is already generating a specimen.');
    this.active = true;
    const abortController = new AbortController();
    const { generationTimeoutMinutes } = this.getSettings();
    let timer, abort;
    const stopped = new Promise((_, reject) => {
      const stop = message => { abortController.abort(); this.close(); reject(new Error(message)); };
      abort = () => stop('Generation cancelled.');
      options.signal?.addEventListener('abort', abort, { once: true });
      timer = setTimeout(() => stop(generationTimeoutMessage(generationTimeoutMinutes)), generationTimeoutMinutes * 60_000);
    });
    try { return await Promise.race([this.execute(options, abortController), stopped]); }
    catch (error) {
      if (error.modelFailure) throw error;
      throw modelFailure({ provider: PROVIDERS.CLAUDE, stage: options.stage,
        failure: { message: error.message || String(error), ...(error.code ? { code: error.code } : {}) } });
    }
    finally {
      clearTimeout(timer); options.signal?.removeEventListener('abort', abort);
      this.session?.close(); this.session = null; this.active = false;
    }
  }
  close() {
    this.session?.interrupt?.().catch(() => {});
    this.session?.close(); this.probe?.close();
  }
}
