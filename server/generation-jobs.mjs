import { PROVIDERS, providerLabels, GENERATION_STAGES } from '../shared/generation-models.mjs';
import { randomUUID } from 'node:crypto';
import { createAnatomyPlan, plannedDesign } from '../shared/anatomy-plan.mjs';
import { illustrationPrompt } from '../shared/specimen.mjs';
import { JOB_KINDS, completedGenerationDuration } from '../shared/generation-timing.mjs';
import { REVIEW_STATUS, RequirementReview, reviewPrompt, reviewSchema } from '../shared/generation-review.mjs';
import { PORTRAIT_KINDS, portraitVersionOf } from '../shared/specimen-assets.mjs';
import { imageBytes, safeError } from './codex.mjs';
import { generateCad } from './cad-stage.mjs';
import { GenerationTrace, interruptTrace } from './generation-trace.mjs';

const DESIGN_ATTEMPTS = 3;

export class GenerationJobs {
  constructor({ store, providers, codex, catalog = null }) {
    this.store = store; this.providers = providers ?? { [PROVIDERS.CODEX]: codex }; this.catalog = catalog; this.current = null;
    for (const job of store.list('jobs')) {
      if (['queued', 'running'].includes(job.status)) {
        this.update(job, { status: 'interrupted', message: 'The server restarted. Completed specimen files have been kept.',
          finishedAt: new Date().toISOString() });
        try { interruptTrace(store, job); } catch (error) { this.update(job, { traceError: safeError(error) }); }
      }
    }
  }
  update(job, changes) {
    Object.assign(job, changes);
    const durationMs = completedGenerationDuration(job);
    if (durationMs !== null) job.durationMs = durationMs;
    this.store.save('jobs', job.id, job);
  }
  start({ settings, existing = null, plan = null, instructions = '', cadRequest = null,
    kind = existing ? JOB_KINDS.PORTRAIT : JOB_KINDS.GENERATION }) {
    if (this.current) throw Object.assign(new Error('A generation is already running.'), { status: 409, jobId: this.current.job.id });
    const { provider, model, effort } = this.store.generationModel();
    const job = { id: randomUUID(), kind, settings, generation: { provider, model, effort }, status: 'queued', stage: GENERATION_STAGES.DESIGN,
      message: `Connecting to ${providerLabels[provider]}…`, createdAt: new Date().toISOString(), specimenId: existing?.id ?? null,
      estimatedDurationMs: kind === JOB_KINDS.CAD ? null : this.store.generationTiming().estimatedDurationMs };
    if (existing?.variation || plan) job.variation = existing?.variation ?? plan;
    const controller = new AbortController();
    this.store.save('jobs', job.id, job);
    this.current = { job, controller };
    const promise = this.execute({ job, settings, existing, plan, instructions, cadRequest, signal: controller.signal });
    this.current && (this.current.promise = promise);
    return { jobId: job.id, estimatedDurationMs: job.estimatedDurationMs };
  }
  cancel(id) {
    if (this.current?.job.id !== id) return false;
    this.current.controller.abort(); this.update(this.current.job, { message: 'Cancelling…' }); return true;
  }
  saveSpecimen(specimen, job) {
    const traceJobIds = [...new Set([...(specimen.traceJobIds ?? []), job.id])];
    return this.store.save('specimens', specimen.id, { ...specimen, traceJobIds, latestTraceJobId: job.id });
  }
  async design(job, settings, plan, trace, signal) {
    const variation = plan ?? createAnatomyPlan(settings, job.id, this.store.list('specimens'));
    this.update(job, { variation, message: 'Inventing the organism and writing field notes…' }); trace.save({ variation });
    const design = plannedDesign(settings, variation);
    let result;
    for (let attempt = 1; attempt <= DESIGN_ATTEMPTS; attempt++) {
      try {
        result = await trace.run(this.providers, GENERATION_STAGES.DESIGN, { prompt: design.prompt, schema: design.schema, signal,
          onThread: designThreadId => this.update(job, { designThreadId }) }); break;
      } catch (error) {
        if (error.code !== 'runaway_output' || attempt === DESIGN_ATTEMPTS || signal.aborted) throw error;
        this.update(job, { message: `${providerLabels[job.generation.provider]} stalled; trying again (attempt ${attempt + 1} of ${DESIGN_ATTEMPTS})…` });
      }
    }
    signal.throwIfAborted();
    const parsed = await trace.operation('design-validation', { schema: design.schema },
      () => design.parse(JSON.parse(result.text)));
    const specimen = { ...parsed, id: randomUUID(), settings, variation, anatomy: null, print: null,
      createdAt: new Date().toISOString(), image: false, demo: false };
    this.update(job, { specimenId: specimen.id }); trace.save({ specimenId: specimen.id });
    return this.saveSpecimen(specimen, job);
  }
  async review(specimen, trace, signal, image) {
    try {
      const result = await trace.run(this.providers, image ? GENERATION_STAGES.IMAGE_REVIEW : GENERATION_STAGES.DESIGN_REVIEW, {
        prompt: reviewPrompt(specimen, { image }), schema: reviewSchema, signal,
        imagePaths: image ? [this.store.portraitFile(specimen)] : [] });
      return { status: REVIEW_STATUS.REVIEWED, ...RequirementReview.parse(JSON.parse(result.text)) };
    } catch (error) {
      if (signal.aborted) throw error;
      return { status: REVIEW_STATUS.UNAVAILABLE, issues: [], error: safeError(error) };
    }
  }
  async portrait(specimen, job, instructions, trace, signal) {
    const kind = instructions ? PORTRAIT_KINDS.EDIT : specimen.image ? PORTRAIT_KINDS.REGENERATE : PORTRAIT_KINDS.GENERATION;
    const imagePaths = specimen.image ? [this.store.portraitFile(specimen)] : [];
    const designReview = specimen.settings.review ? await this.review(specimen, trace, signal, false) : null;
    this.update(job, { stage: GENERATION_STAGES.IMAGE, message: instructions ? 'Refining the portrait…' : 'Painting the specimen portrait…' });
    const result = await trace.run(this.providers, GENERATION_STAGES.IMAGE, { prompt: illustrationPrompt(specimen, {
      editInstructions: instructions, referenceImage: Boolean(specimen.image) }), image: true, imagePaths, signal,
    onThread: imageThreadId => this.update(job, { imageThreadId }),
    onProgress: message => this.update(job, { message }) });
    signal.throwIfAborted();
    const bytes = await imageBytes(result.images);
    const next = await trace.operation('portrait-publication', { kind, encodedBytes: bytes.length },
      () => this.store.savePortrait(specimen, bytes, { kind, instructions: instructions || null,
        jobId: job.id, createdAt: new Date().toISOString() }));
    if (instructions) next.portraitEdits = [...(specimen.portraitEdits ?? []), { version: portraitVersionOf(next), instructions }];
    let saved = this.saveSpecimen({ ...next, review: specimen.settings.review ? {
      status: REVIEW_STATUS.UNAVAILABLE, issues: [], designIssues: designReview?.issues ?? [],
      error: 'Portrait review has not completed.' } : null }, job);
    if (specimen.settings.review) {
      this.update(job, { stage: 'review', message: 'Reviewing the portrait against your requirements…' });
      const review = await this.review(saved, trace, signal, true);
      saved = this.saveSpecimen({ ...saved, review: { ...review, designIssues: designReview?.issues ?? [],
        designError: designReview?.error ?? null } }, job);
    }
    return saved;
  }
  async execute({ job, settings, existing, plan, instructions, cadRequest, signal }) {
    let specimen = existing, trace;
    try {
      trace = new GenerationTrace(this.store, job, { settings, instructions, cadRequest,
        sourcePortraitVersion: existing?.image ? portraitVersionOf(existing) : null });
      this.update(job, { status: 'running' });
      const selectionError = await this.catalog?.validateSelection(job.generation);
      if (selectionError) throw new Error(selectionError);
      signal.throwIfAborted();
      if (!existing) specimen = await this.design(job, settings, plan, trace, signal);
      if (job.kind === JOB_KINDS.CAD) {
        specimen = await generateCad({ specimen, request: cadRequest, store: this.store, providers: this.providers, trace, signal,
          update: changes => this.update(job, changes) });
        specimen = this.saveSpecimen({ ...specimen, cadError: null }, job);
      } else specimen = await this.portrait(specimen, job, instructions, trace, signal);
      this.update(job, { status: 'completed', stage: 'done', message: job.kind === JOB_KINDS.CAD ?
        'The sculpture is ready for the current portrait.' : 'The portrait is ready.', finishedAt: new Date().toISOString() });
      trace.save({ status: job.status, finishedAt: job.finishedAt, specimenId: specimen.id,
        portraitVersion: portraitVersionOf(specimen), review: specimen.review ?? null });
    } catch (error) {
      const message = signal.aborted ? 'Generation cancelled. Completed images, notes and model files have been kept.' : safeError(error);
      if (specimen) specimen = this.store.get('specimens', specimen.id) ?? specimen;
      if (specimen) specimen = this.saveSpecimen({ ...specimen,
        ...(job.kind === JOB_KINDS.CAD ? { cadError: message } : { imageError: message }) }, job);
      this.update(job, { status: signal.aborted ? 'cancelled' : specimen && !specimen.image ? 'partial' : 'failed',
        message, finishedAt: new Date().toISOString() });
      trace?.save({ status: job.status, error: message, finishedAt: job.finishedAt, specimenId: specimen?.id ?? null });
    } finally { if (this.current?.job.id === job.id) this.current = null; }
  }
}
