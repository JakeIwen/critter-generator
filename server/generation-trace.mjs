import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { GENERATION_PROMPT_VERSION } from '../shared/generation-options.mjs';
import { safeError } from './codex.mjs';

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
    imageModel: item.model ?? null, failure: item.failure ? safeError(item.failure.message ?? item.failure) : null }));
}

export class GenerationTrace {
  constructor(store, job, context = {}) {
    this.store = store;
    this.value = { version: TRACE_VERSION, jobId: job.id, kind: job.kind, specimenId: job.specimenId,
      createdAt: job.createdAt, templateVersion: GENERATION_PROMPT_VERSION,
      buildRevision: process.env.CRITTER_BUILD_REVISION || null, ...context, steps: [] };
    this.save();
  }
  save(changes = {}) {
    Object.assign(this.value, changes);
    writeTrace(this.store, this.value);
  }
  async run(codex, stage, options) {
    const step = { stage, attempt: this.value.steps.filter(item => item.stage === stage).length + 1,
      startedAt: new Date().toISOString(), status: 'running',
      input: [{ type: 'text', text: options.prompt }, ...imageReferences(options.imagePaths ?? [], this.store.root)],
      outputSchema: options.schema ?? null, imageGenerationEnabled: Boolean(options.image) };
    this.value.steps.push(step); this.save();
    try {
      await codex.connect();
      step.orchestrationModel = codex.state.model; step.reasoningEffort = codex.effort;
      const result = await codex.run({ ...options, onThread: threadId => {
        step.threadId = threadId; this.save(); options.onThread?.(threadId);
      } });
      Object.assign(step, { status: 'completed', responseText: result.text,
        images: imageMetadata(result.images) });
      return result;
    } catch (error) {
      Object.assign(step, { status: 'failed', error: safeError(error), errorCode: error.code ?? null });
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
