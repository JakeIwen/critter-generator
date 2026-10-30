import { providerForStage } from '../shared/generation-models.mjs';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { GENERATION_PROMPT_VERSION } from '../shared/generation-options.mjs';
import { safeError, failureReason } from './model-refusals.mjs';

// Trace versions are a durable format contract, not a runtime preference.
export const TRACE_VERSION = 1;

export function traceFile(store, jobId) {
  return store.file('jobs', jobId, 'trace.json');
}

export function readTrace(store, jobId) {
  return JSON.parse(readFileSync(traceFile(store, jobId), 'utf8'));
}

function writeTrace(store, value) {
  const file = traceFile(store, value.jobId);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file + '.tmp', JSON.stringify(value, null, 2));
  renameSync(file + '.tmp', file);
}

export function interruptTrace(store, job) {
  let value;
  try { value = readTrace(store, job.id); } catch (error) { if (error.code === 'ENOENT') return; throw error; }
  for (const step of value.steps) {
    if (step.status !== 'running') continue;
    Object.assign(step, { status: 'interrupted', finishedAt: job.finishedAt,
      durationMs: Date.parse(job.finishedAt) - Date.parse(step.startedAt) });
  }
  writeTrace(store, { ...value, status: 'interrupted', error: job.message, finishedAt: job.finishedAt });
}

function imageReferences(files, root) {
  return files.map(file => ({ type: 'localImage', path: path.resolve(file),
    relativePath: path.relative(root, file), sha256: createHash('sha256').update(readFileSync(file)).digest('hex') }));
}

function imageMetadata(items) {
  return (items ?? []).map(item => ({ id: item.id ?? null, status: item.status ?? null,
    revisedPrompt: item.revisedPrompt ?? null, transparentBackground: item.transparentBackground ?? null,
    imageModel: item.model ?? null, failure: item.failure ? safeError(failureReason(item.failure)) : null, failureDetails: item.failure ?? null }));
}

export class GenerationTrace {
  constructor(store, job, context = {}) {
    this.store = store;
    this.value = { version: TRACE_VERSION, jobId: job.id, kind: job.kind, specimenId: job.specimenId,
      createdAt: job.createdAt, generation: job.generation, templateVersion: GENERATION_PROMPT_VERSION,
      buildRevision: process.env.CRITTER_BUILD_REVISION || null, ...context, steps: [] };
    this.save();
  }
  save(changes = {}) {
    Object.assign(this.value, changes);
    writeTrace(this.store, this.value);
  }
  async run(providers, stage, options) {
    const selection = this.value.generation;
    const provider = providerForStage(stage, selection), client = providers[provider];
    const selected = provider === selection.provider;
    const step = { stage, provider, orchestrationModel: selected ? selection.model : null,
      reasoningEffort: selected ? selection.effort : null, attempt: this.value.steps.filter(item => item.stage === stage).length + 1,
      startedAt: new Date().toISOString(), status: 'running',
      input: [{ type: 'text', text: options.prompt }, ...imageReferences(options.imagePaths ?? [], this.store.root)],
      outputSchema: options.schema ?? null, imageGenerationEnabled: Boolean(options.image) };
    this.value.steps.push(step); this.save();
    try {
      if (!client) throw new Error('The selected generation provider is not configured.');
      await client.connect?.();
      step.orchestrationModel = selected ? selection.model : client.state.model;
      step.reasoningEffort = selected ? selection.effort : client.effort ?? null;
      const result = await client.run({ ...options, stage, model: step.orchestrationModel, effort: step.reasoningEffort, onThread: threadId => {
        step.threadId = threadId; this.save(); options.onThread?.(threadId);
      } });
      Object.assign(step, { status: 'completed', responseText: result.text,
        images: imageMetadata(result.images) });
      return { ...result, provider };
    } catch (error) {
      Object.assign(step, { status: 'failed', error: safeError(error), errorCode: error.code ?? null });
      if (error.providerResponse) Object.assign(step, { responseText: error.providerResponse.text,
        providerError: error.providerResponse.failure, images: imageMetadata(error.providerResponse.images) });
      throw error;
    } finally {
      step.finishedAt = new Date().toISOString();
      step.durationMs = Date.parse(step.finishedAt) - Date.parse(step.startedAt);
      this.save();
    }
  }
  async operation(stage, input, execute) {
    const step = { stage, input, status: 'running', startedAt: new Date().toISOString() };
    this.value.steps.push(step); this.save();
    try {
      const output = await execute();
      Object.assign(step, { status: 'completed', output });
      return output;
    } catch (error) {
      Object.assign(step, { status: 'failed', error: safeError(error) }); throw error;
    } finally {
      step.finishedAt = new Date().toISOString();
      step.durationMs = Date.parse(step.finishedAt) - Date.parse(step.startedAt); this.save();
    }
  }
}
