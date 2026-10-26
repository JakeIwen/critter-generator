import { copyFile, mkdir, mkdtemp, readFile, rename, writeFile } from 'node:fs/promises';
import { existsSync, realpathSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Settings } from '../shared/specimen.mjs';
import { sliders } from '../shared/sliders.mjs';
import { PRINT_HEIGHT } from '../shared/print-settings.mjs';
import { createAnatomyPlan } from '../shared/anatomy-plan.mjs';
import { JOB_KINDS } from '../shared/generation-timing.mjs';
import { PORTRAIT_KINDS, portraitVersionOf } from '../shared/specimen-assets.mjs';
import { EVALUATION_OUTCOMES, summarizeEvaluation } from '../shared/evaluation-metrics.mjs';

const root = path.resolve(import.meta.dirname, '..');

function canonicalPath(value) {
  let ancestor = path.resolve(value);
  const remaining = [];
  while (!existsSync(ancestor)) {
    remaining.unshift(path.basename(ancestor));
    const parent = path.dirname(ancestor);
    if (parent === ancestor) throw new Error('Output path has no existing parent.');
    ancestor = parent;
  }
  return path.join(realpathSync(ancestor), ...remaining);
}

function inside(candidate, parent) {
  const relative = path.relative(parent, candidate);
  return !relative || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

export function safeEvaluationOutput(value) {
  const resolved = canonicalPath(value), lexical = path.resolve(value);
  const protectedRoots = [path.join(root, '.local'), process.env.CRITTER_DATA_DIR].filter(Boolean).map(canonicalPath);
  if ([resolved, lexical].some(item => item.split(path.sep).includes('.local')) ||
    protectedRoots.some(parent => inside(resolved, parent))) {
    throw new Error('Evaluation output must be outside .local and the authoritative CRITTER_DATA_DIR.');
  }
  return resolved;
}

function caseSettings(item) {
  return Settings.parse({ prompt: '', height: PRINT_HEIGHT.initial, printModel: false,
    ...Object.fromEntries(sliders.map(slider => [slider.id, slider.initial])), ...item.settings });
}

async function createOutput(requested) {
  if (!requested) return mkdtemp(path.join(safeEvaluationOutput(tmpdir()), 'critter-evaluation-'));
  const parent = safeEvaluationOutput(requested);
  await mkdir(parent, { recursive: true, mode: 0o700 });
  return mkdtemp(path.join(parent, 'critter-evaluation-'));
}

function scoreTemplate(records, corpus) {
  const cases = new Map(corpus.cases.map(item => [item.id, item]));
  return { version: 1, instructions: 'Assign each criterion satisfied, conflict, uncertain or unscorable. Leave unreviewed values null. Appearance is a separate subjective 1–5 rating.',
    scores: records.map(record => ({ runId: record.runId, caseId: record.caseId,
      criteria: cases.get(record.caseId).criteria.map(criterion => ({ ...criterion, status: null, notes: '' })),
      appearanceScore: null, appearanceNotes: '' })) };
}

async function persistResults(output, manifest, corpus) {
  const scores = scoreTemplate(manifest.records, corpus);
  const scoreFile = path.join(output, 'scores.json');
  if (existsSync(scoreFile)) {
    const previous = new Map(JSON.parse(await readFile(scoreFile, 'utf8')).scores.map(score => [score.runId, score]));
    scores.scores = scores.scores.map(score => previous.get(score.runId) ?? score);
  }
  manifest.metrics = summarizeEvaluation(manifest.records, scores.scores);
  manifest.notRun = manifest.plannedRuns.filter(id => !manifest.records.some(record => record.runId === id));
  for (const [name, value] of [['manifest.json', manifest], ['scores.json', scores]]) {
    const file = path.join(output, name);
    await writeFile(file + '.tmp', JSON.stringify(value, null, 2)); await rename(file + '.tmp', file);
  }
}

async function runCase(context, item, repeat) {
  const { jobs, store, output, prior, plans } = context;
  const runId = `${item.id}-${String(repeat).padStart(2, '0')}`, started = Date.now();
  let jobId = null;
  try {
    const existing = item.sourceCase ? prior.get(`${item.sourceCase}-${String(repeat).padStart(2, '0')}`) : null;
    if (item.sourceCase && !existing?.image) throw new Error('The source case did not produce a usable portrait.');
    const settings = existing?.settings ?? plans[item.id].settings;
    const plan = existing ? null : plans[item.id].variation;
    ({ jobId } = jobs.start({ settings, existing, plan, instructions: item.instructions ?? '',
      kind: item.kind === PORTRAIT_KINDS.EDIT ? JOB_KINDS.PORTRAIT : JOB_KINDS.GENERATION }));
    await jobs.current?.promise;
    const job = store.get('jobs', jobId), specimen = job.specimenId ? store.get('specimens', job.specimenId) : null;
    const { readTrace } = await import('./generation-trace.mjs');
    const trace = readTrace(store, jobId);
    const tracePath = `artifacts/${runId}-trace.json`, specimenPath = specimen ? `artifacts/${runId}-record.json` : null;
    await writeFile(path.join(output, tracePath), JSON.stringify(trace, null, 2));
    if (specimenPath) await writeFile(path.join(output, specimenPath), JSON.stringify(specimen, null, 2));
    let portraitPath = null;
    if (job.status === EVALUATION_OUTCOMES.COMPLETED && specimen?.image) {
      portraitPath = `artifacts/${runId}.png`;
      await copyFile(store.portraitFile(specimen), path.join(output, portraitPath));
      prior.set(runId, specimen);
    }
    return { runId, caseId: item.id, repeat, kind: item.kind, status: job.status, jobId,
      specimenId: specimen?.id ?? null, portraitVersion: specimen ? portraitVersionOf(specimen) : null,
      createdAt: job.createdAt, finishedAt: job.finishedAt, durationMs: Date.now() - started,
      paths: { portrait: portraitPath, trace: tracePath, specimen: specimenPath }, error: trace.error ?? null,
      stages: trace.steps.map(step => ({ stage: step.stage, durationMs: step.durationMs ?? 0,
        status: step.status, ...(step.attempt ? { attempt: step.attempt } : {}) })) };
  } catch (error) {
    return { runId, caseId: item.id, repeat, kind: item.kind, status: EVALUATION_OUTCOMES.FAILED, jobId,
      durationMs: Date.now() - started, stages: [], error: error.message };
  }
}

function buildRevision() {
  try {
    if (execFileSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' }).trim()) return null;
    return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
  }
  catch { return null; }
}

export async function liveEvaluation(values, corpus) {
  const output = await createOutput(values.out);
  const [{ Store }, { Codex }, { GenerationJobs }] = await Promise.all([
    import('./store.mjs'), import('./codex.mjs'), import('./generation-jobs.mjs'),
  ]);
  const store = new Store(path.join(output, 'data')), codex = new Codex(path.join(output, 'data/workspace'));
  const jobs = new GenerationJobs({ store, codex }), prior = new Map();
  const plans = Object.fromEntries(corpus.cases.filter(item => !item.sourceCase).map(item => {
    const settings = caseSettings(item);
    return [item.id, { settings, variation: createAnatomyPlan(settings, item.seed, []) }];
  }));
  const revision = process.env.CRITTER_BUILD_REVISION || buildRevision();
  if (revision) process.env.CRITTER_BUILD_REVISION = revision;
  const manifest = { version: 1, corpusVersion: corpus.version, createdAt: new Date().toISOString(), completedAt: null,
    buildRevision: revision, outputDirectory: output,
    allowance: 'Existing Codex ChatGPT allowance; no API key route', records: [],
    plannedRuns: Array.from({ length: values.repeat }, (_, index) => corpus.cases.map(item => `${item.id}-${String(index + 1).padStart(2, '0')}`)).flat() };
  let stopped = false;
  const stop = () => { stopped = true; if (jobs.current) jobs.cancel(jobs.current.job.id); codex.close(); };
  process.once('SIGINT', stop); process.once('SIGTERM', stop);
  console.log(`Live evaluations consume the existing Codex ChatGPT allowance. Output: ${output}`);
  try {
    await mkdir(path.join(output, 'artifacts'));
    await writeFile(path.join(output, 'plans.json'), JSON.stringify(plans, null, 2));
    await writeFile(path.join(output, 'corpus.json'), JSON.stringify(corpus, null, 2));
    await persistResults(output, manifest, corpus);
    for (let repeat = 1; repeat <= values.repeat && !stopped; repeat++) {
      for (const item of corpus.cases) {
        if (stopped) break;
        const record = await runCase({ jobs, store, output, prior, plans }, item, repeat);
        manifest.records.push(record); await persistResults(output, manifest, corpus);
        console.log(`${record.runId}: ${record.status} (${(record.durationMs / 1000).toFixed(1)} s)`);
        if (!codex.state.connected && record.status !== EVALUATION_OUTCOMES.COMPLETED) {
          stopped = true; manifest.stopReason = 'Codex connection is unavailable; remaining cases were not run.';
        }
      }
    }
  } finally {
    manifest.completedAt = new Date().toISOString();
    try { await persistResults(output, manifest, corpus); }
    finally {
      process.removeListener('SIGINT', stop); process.removeListener('SIGTERM', stop);
      codex.close(); store.db.close();
    }
  }
  console.log(`Manifest: ${path.join(output, 'manifest.json')}\nManual scoring: ${path.join(output, 'scores.json')}`);
  if (manifest.notRun.length || manifest.records.some(record => record.status !== EVALUATION_OUTCOMES.COMPLETED)) process.exitCode = 1;
}
