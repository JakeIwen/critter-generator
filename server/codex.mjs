import { DEFAULT_APP_SETTINGS, generationTimeoutMessage } from '../shared/app-settings.mjs';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { readFile, realpath } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

import { DEFAULT_GENERATION_MODEL, PROVIDERS, GENERATION_STAGES } from '../shared/generation-models.mjs';
import { GENERATION_INSTRUCTIONS } from '../shared/generation-instructions.mjs';
import { modelFailure, missingPortrait } from './model-refusals.mjs';
import { safeError } from './safe-error.mjs';

const RUNAWAY_WHITESPACE = 400;

export class Codex {
  constructor(cwd, { getSettings = () => DEFAULT_APP_SETTINGS } = {}) {
    this.getSettings = getSettings;
    this.cwd = cwd; this.pending = new Map(); this.sequence = 0; this.active = null;
    this.state = { connected: false, model: null, reason: 'Connecting to Codex…' };
  }
  send(message) { this.child.stdin.write(JSON.stringify(message) + '\n'); }
  rpc(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = ++this.sequence;
      // RPC deadlines bound transport requests, independently of generation turns.
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error(`${method} timed out.`)); }, 45000);
      this.pending.set(id, { resolve, reject, timer });
      try { this.send({ id, method, params }); } catch (e) { clearTimeout(timer); this.pending.delete(id); reject(e); }
    });
  }
  async connect() {
    if (this.state.connected) return this.state;
    if (this.connecting) return this.connecting;
    this.connecting = this.open().catch(e => {
      this.state = { connected: false, model: null, reason: safeError(e) };
      this.child?.kill(); throw e;
    }).finally(() => { this.connecting = null; });
    return this.connecting;
  }
  async open() {
    const env = { ...process.env };
    for (const key of ['OPENAI_API_KEY', 'OPENAI_BASE_URL', 'OPENAI_ORG_ID', 'OPENAI_PROJECT_ID']) delete env[key];
    this.child = spawn('codex', ['app-server', '--stdio', '-c', 'analytics.enabled=false', '-c', 'model_provider="openai"'],
      { cwd: this.cwd, env, stdio: ['pipe', 'pipe', 'pipe'] });
    this.child.stderr.on('data', () => {}); // Never expose raw CLI diagnostics or credentials.
    const disconnect = () => {
      this.state.connected = false;
      this.state.reason = 'Codex disconnected. Check `codex login status`, then retry.';
      for (const { reject, timer } of this.pending.values()) { clearTimeout(timer); reject(new Error(this.state.reason)); }
      this.pending.clear();
      this.active?.reject(new Error(this.state.reason)); this.active = null;
    };
    this.child.on('error', disconnect); this.child.on('exit', disconnect);
    createInterface({ input: this.child.stdout }).on('line', line => {
      try { this.receive(JSON.parse(line)); } catch { /* Ignore unrelated malformed notifications. */ }
    });
    await this.rpc('initialize', { clientInfo: { name: 'critter_generator', title: 'Critter Generator', version: '1.0.0' },
      capabilities: { experimentalApi: true } });
    this.send({ method: 'initialized', params: {} });
    const [account, config] = await Promise.all([
      this.rpc('account/read', { refreshToken: false }), this.rpc('config/read', { cwd: this.cwd, includeLayers: false }),
    ]);
    if (account.account?.type !== 'chatgpt') throw new Error('Sign in with your ChatGPT account: run `codex login` in Terminal.');
    this.mcpNames = Object.keys(config.config?.mcp_servers || {});
    const models = await this.listModels();
    const model = models.find(m => m.id === DEFAULT_GENERATION_MODEL.model) || models.find(m => m.isDefault) || models[0];
    if (!model) throw new Error('No Codex models are available to this account.');
    this.effort = model.efforts.includes('medium') ? 'medium' : model.defaultEffort;
    this.state = { connected: true, model: model.id, reason: null };
    return this.state;
  }
  async listModels() {
    const models = [];
    let cursor;
    do {
      const page = await this.rpc('model/list', { includeHidden: false, limit: 100, ...(cursor ? { cursor } : {}) });
      models.push(...page.data.map(model => ({ id: model.model, resolvedModel: null, label: model.displayName || model.model,
        description: model.description ?? null,
        efforts: (model.supportedReasoningEfforts ?? []).map(effort => effort.reasoningEffort),
        defaultEffort: model.defaultReasoningEffort ?? null, isDefault: Boolean(model.isDefault) })));
      cursor = page.nextCursor;
    } while (cursor);
    this.availableModels = models;
    return models;
  }
  async models() {
    await this.connect();
    return this.listModels();
  }
  receive(message) {
    if (message.id !== undefined && !message.method) {
      const pending = this.pending.get(message.id);
      if (!pending) return;
      clearTimeout(pending.timer); this.pending.delete(message.id);
      if (message.error) pending.reject(new Error(message.error.message)); else pending.resolve(message.result);
      return;
    }
    if (message.id !== undefined) {
      // This product needs no shell, filesystem, connector, or permission grants.
      if (/requestApproval$/.test(message.method)) this.send({ id: message.id, result: { decision: 'decline' } });
      else this.send({ id: message.id, error: { code: -32601, message: 'Interactive tools are unavailable in the creature generator.' } });
      return;
    }
    const a = this.active, p = message.params;
    if (!a || p?.threadId !== a.threadId) return;
    if (message.method === 'item/agentMessage/delta' && typeof p.delta === 'string') {
      // Under a strict output schema the model sometimes stops writing values and
      // streams whitespace until the turn times out. Give up on that attempt early.
      a.blankRun = /\S/.test(p.delta) ? p.delta.length - p.delta.trimEnd().length : (a.blankRun || 0) + p.delta.length;
      if (a.blankRun > RUNAWAY_WHITESPACE) {
        this.active = null;
        if (a.turnId) this.rpc('turn/interrupt', { threadId: a.threadId, turnId: a.turnId }).catch(() => {});
        a.reject(Object.assign(new Error('Codex stalled while writing the specimen.'), { code: 'runaway_output' }));
        return;
      }
    }
    if (message.method === 'turn/started') { a.turnId = p.turn.id; a.onTurn?.(a.turnId); }
    if (message.method === 'item/started' && p.item?.type === 'imageGeneration') a.onProgress?.('Painting the specimen portrait…');
    if (message.method === 'item/completed') {
      if (p.item?.type === 'agentMessage') a.messages.push(p.item.text);
      if (p.item?.type === 'imageGeneration') a.images.push(p.item);
    }
    if (message.method === 'turn/completed') {
      this.active = null;
      if (p.turn.status !== 'completed') {
        const error = modelFailure({ provider: PROVIDERS.CODEX, stage: a.stage, failure: p.turn.error,
          reply: a.messages?.at(-1) || '', fallback: `Generation ${p.turn.status}.` });
        error.providerResponse.images = a.images ?? [];
        a.reject(error);
      }
      else a.resolve({ text: a.messages.at(-1) || '', images: a.images, threadId: a.threadId });
    }
  }
  async run({ prompt, schema, image = false, imagePaths = [], signal, onProgress, onThread, model, effort,
    stage = image ? GENERATION_STAGES.IMAGE : GENERATION_STAGES.DESIGN }) {
    await this.connect();
    if (signal?.aborted) throw new Error('Generation cancelled.');
    if (this.active) throw new Error('Codex is already generating a specimen.');
    model ??= this.state.model;
    if (!this.availableModels.some(available => available.id === model)) {
      throw new Error(`Selected model ${model} is not available to this Codex account. Choose another in Settings.`);
    }
    if (effort === undefined) effort = this.effort;
    const thread = await this.rpc('thread/start', {
      model, modelProvider: 'openai', allowProviderModelFallback: false,
      cwd: this.cwd, runtimeWorkspaceRoots: [this.cwd], sandbox: 'read-only', approvalPolicy: 'never',
      ephemeral: true, config: {
        web_search: 'disabled', ...(effort !== null ? { model_reasoning_effort: effort } : {}),
        features: { shell_tool: false, unified_exec: false, code_mode_host: false, view_image: false,
          multi_agent: false, apps: false, plugins: false, remote_plugin: false, image_generation: image,
          browser_use: false, computer_use: false, hooks: false, memories: false },
        mcp_servers: Object.fromEntries(this.mcpNames.map(name => [name, { enabled: false }])),
      },
      developerInstructions: GENERATION_INSTRUCTIONS,
    });
    if (thread.sandbox?.type !== 'readOnly') throw new Error('Codex did not accept the read-only sandbox for this request.');
    const threadId = thread.thread.id;
    onThread?.(threadId);
    const { generationTimeoutMinutes } = this.getSettings();
    let timer, abort;
    const result = new Promise((resolve, reject) => {
      this.active = { threadId, stage, messages: [], images: [], resolve, reject, onProgress,
        onTurn: () => { if (signal?.aborted) abort(); } };
      abort = () => {
        if (this.active?.threadId !== threadId) return;
        if (this.active.turnId) this.rpc('turn/interrupt', { threadId, turnId: this.active.turnId }).catch(() => {});
      };
      signal?.addEventListener('abort', abort, { once: true });
      timer = setTimeout(() => {
        abort();
        if (this.active?.threadId === threadId) { this.active = null; reject(new Error(generationTimeoutMessage(generationTimeoutMinutes))); }
      }, generationTimeoutMinutes * 60_000);
    });
    // A disconnect can reject the turn while the start RPC is still pending.
    // Attach a handler immediately; the original rejection is awaited below.
    result.catch(() => {});
    try {
      const started = await this.rpc('turn/start', { threadId, input: [{ type: 'text', text: prompt },
        ...imagePaths.map(file => ({ type: 'localImage', path: path.resolve(file) }))],
        model, effort, sandboxPolicy: { type: 'readOnly', networkAccess: false },
        approvalPolicy: 'never', ...(schema ? { outputSchema: schema } : {}) });
      if (this.active?.threadId === threadId) { this.active.turnId = started.turn.id; if (signal?.aborted) abort(); }
    } catch (e) { this.active?.reject(e); this.active = null; }
    try { return await result; }
    finally { clearTimeout(timer); signal?.removeEventListener('abort', abort); this.rpc('thread/unsubscribe', { threadId }).catch(() => {}); }
  }
  close() { this.child?.kill(); }
}

export async function imageBytes(items, reply = '') {
  for (const item of [...items].reverse()) {
    if (item.failure) continue;
    const raw = item.result || '';
    if (raw.length > 200 && /^(?:data:image\/[a-z+]+;base64,)?[A-Za-z0-9+/=\r\n]+$/.test(raw)) {
      const buffer = Buffer.from(raw.replace(/^data:[^,]+,/, ''), 'base64');
      if (isImage(buffer)) return buffer;
    }
    if (item.savedPath) {
      const allowed = await realpath(path.join(process.env.CODEX_HOME || path.join(os.homedir(), '.codex'), 'generated_images'));
      const file = await realpath(item.savedPath);
      if (!file.startsWith(allowed + path.sep)) continue;
      const buffer = await readFile(file);
      if (isImage(buffer)) return buffer;
    }
  }
  throw missingPortrait(items, reply);
}
export function isImage(buffer) {
  return buffer.length < 30 * 1024 * 1024 && (buffer.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) ||
    (buffer[0] === 255 && buffer[1] === 216 && buffer[2] === 255) ||
    (buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP'));
}
