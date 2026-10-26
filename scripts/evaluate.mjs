import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { summarizeEvaluation } from '../shared/evaluation-metrics.mjs';
import { safeEvaluationOutput, liveEvaluation } from '../server/evaluation-run.mjs';

const root = path.resolve(import.meta.dirname, '..');
const corpusFile = path.join(root, 'evals/image-generation.json');
const help = `Image-generation evaluations

Default: --list (offline; no Codex connection or generation).
  --list                 List corpus cases and manual criteria.
  --case ID              Select a case; repeat the flag for several cases.
  --repeat N             Repeat each selected case 1–10 times (default 1).
  --live                 Run actual generations using the existing Codex ChatGPT allowance.
  --out DIRECTORY        Put an isolated evaluation directory here (default: system temp).
  --summarize MANIFEST   Summarize saved results without any generation.
  --scores FILE          Include manually completed scores.json in --summarize.
  --help                 Show this help.

The live runner never uses the app's .local data. Each repeat reuses a fixed
plan generated from the corpus seed and empty history. Edits run their source
case first. Output includes original images, traces, manifest.json and scores.json.
Constraint scores are manual; no image-quality pass rate is inferred automatically.
`;

function options(argv) {
  const { values } = parseArgs({ args: argv, options: {
    list: { type: 'boolean', default: false }, live: { type: 'boolean', default: false },
    help: { type: 'boolean', default: false }, case: { type: 'string', multiple: true },
    repeat: { type: 'string', default: '1' }, out: { type: 'string' },
    summarize: { type: 'string' }, scores: { type: 'string' },
  } });
  const repeat = Number(values.repeat);
  if (!Number.isInteger(repeat) || repeat < 1 || repeat > 10) throw new Error('--repeat must be an integer from 1 to 10.');
  if (values.live && (values.list || values.summarize)) throw new Error('Choose --live, --list or --summarize.');
  if (values.scores && !values.summarize) throw new Error('--scores requires --summarize.');
  if (values.out) safeEvaluationOutput(values.out);
  if (values.summarize && values.out) throw new Error('--out is only available for live evaluation output.');
  return { ...values, repeat };
}

async function selectedCases(ids) {
  const corpus = JSON.parse(await readFile(corpusFile, 'utf8'));
  const cases = new Map(corpus.cases.map(item => [item.id, item]));
  const selected = new Map(), visiting = new Set();
  const add = id => {
    if (selected.has(id)) return;
    if (!cases.has(id)) throw new Error(`Unknown evaluation case: ${id}`);
    if (visiting.has(id)) throw new Error(`Evaluation dependency cycle: ${id}`);
    visiting.add(id);
    const item = cases.get(id);
    if (item.sourceCase) add(item.sourceCase);
    selected.set(id, item); visiting.delete(id);
  };
  for (const id of ids?.flatMap(value => value.split(',')) ?? cases.keys()) add(id);
  return { version: corpus.version, cases: [...selected.values()] };
}

function listCases(corpus) {
  console.log('Offline corpus listing. No Codex calls were made.');
  for (const item of corpus.cases) {
    console.log(`\n${item.id} (${item.kind}${item.sourceCase ? `; source: ${item.sourceCase}` : ''})`);
    for (const criterion of item.criteria) console.log(`  ${criterion.id}: ${criterion.label}`);
  }
}

async function main(argv) {
  const values = options(argv);
  if (values.help) { console.log(help); return; }
  if (values.summarize) {
    const manifest = JSON.parse(await readFile(values.summarize, 'utf8'));
    const scores = values.scores ? JSON.parse(await readFile(values.scores, 'utf8')).scores : [];
    console.log(JSON.stringify(summarizeEvaluation(manifest.records, scores), null, 2)); return;
  }
  const corpus = await selectedCases(values.case);
  if (!values.live) { listCases(corpus); return; }
  await liveEvaluation(values, corpus);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main(process.argv.slice(2)).catch(error => { console.error(error.message); process.exitCode = 1; });
}
