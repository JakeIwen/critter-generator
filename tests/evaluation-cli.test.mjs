import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Settings } from '../shared/specimen.mjs';
import { sliders } from '../shared/sliders.mjs';
import { createAnatomyPlan } from '../shared/anatomy-plan.mjs';

const root = path.resolve(import.meta.dirname, '..');
const run = (args, env = {}) => spawnSync(process.execPath, ['scripts/evaluate.mjs', ...args], {
  cwd: root, encoding: 'utf8', env: { ...process.env, ...env }, timeout: 10_000,
});

test('the default CLI lists cases offline and selecting an edit includes its source case', () => {
  const scratch = mkdtempSync(path.join(os.tmpdir(), 'critter-eval-cli-'));
  try {
    const marker = path.join(scratch, 'codex-called'), bin = path.join(scratch, 'bin');
    mkdirSync(bin); writeFileSync(path.join(bin, 'codex'), `#!/bin/sh\ntouch '${marker}'\nexit 1\n`, { mode: 0o700 });
    const result = run([], { PATH: bin });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Offline corpus listing/);
    assert.match(result.stdout, /transparent-cutout/);
    assert.match(result.stdout, /targeted-edit/);
    assert.equal(existsSync(marker), false);
    const selected = run(['--case', 'targeted-edit']);
    assert.equal(selected.status, 0, selected.stderr);
    assert.match(selected.stdout, /tidal-cat \(generation\)/);
    assert.doesNotMatch(selected.stdout, /cat-invent \(generation\)/);
  } finally { rmSync(scratch, { recursive: true, force: true }); }
});

test('the CLI refuses authoritative and symlinked output paths before any live work', () => {
  const scratch = mkdtempSync(path.join(os.tmpdir(), 'critter-eval-output-'));
  try {
    const authoritative = path.join(scratch, 'authoritative'), alias = path.join(scratch, 'alias');
    mkdirSync(authoritative); symlinkSync(authoritative, alias);
    for (const output of [path.join(root, '.local/evaluations'), path.join(authoritative, 'evaluations'), path.join(alias, 'evaluations')]) {
      const result = run(['--live', '--out', output], { CRITTER_DATA_DIR: authoritative });
      assert.equal(result.status, 1);
      assert.match(result.stderr, /outside .local and the authoritative/);
      assert.equal(existsSync(path.join(authoritative, 'evaluations')), false);
    }
    const untouched = path.join(scratch, 'offline-output');
    assert.equal(run(['--list', '--out', untouched]).status, 0);
    assert.equal(existsSync(untouched), false);
  } finally { rmSync(scratch, { recursive: true, force: true }); }
});

test('saved evaluation results can be summarized with manual scores without a generation call', () => {
  const scratch = mkdtempSync(path.join(os.tmpdir(), 'critter-eval-summary-'));
  try {
    const manifest = path.join(scratch, 'manifest.json'), scores = path.join(scratch, 'scores.json');
    writeFileSync(manifest, JSON.stringify({ records: [{ runId: 'cat-01', status: 'failed', durationMs: 250 }] }));
    writeFileSync(scores, JSON.stringify({ scores: [{ runId: 'cat-01', criteria: [{ id: 'legs', status: 'unscorable' }], appearanceScore: null }] }));
    const result = run(['--summarize', manifest, '--scores', scores]);
    assert.equal(result.status, 0, result.stderr);
    const summary = JSON.parse(result.stdout);
    assert.equal(summary.completionRate, 0);
    assert.equal(summary.endToEndMs.median, 250);
    assert.equal(summary.constraints.statuses.unscorable, 1);
    assert.equal(summary.subjectiveAppearance.sampleCount, 0);
  } finally { rmSync(scratch, { recursive: true, force: true }); }
});

test('corpus generation settings validate and fixed empty-history seeds produce stable repeat plans', () => {
  const corpus = JSON.parse(readFileSync(path.join(root, 'evals/image-generation.json'), 'utf8'));
  assert.equal(new Set(corpus.cases.map(item => item.id)).size, corpus.cases.length);
  for (const item of corpus.cases.filter(item => item.kind === 'generation')) {
    const settings = Settings.parse({ height: 100, ...Object.fromEntries(sliders.map(slider => [slider.id, slider.initial])), ...item.settings });
    assert.deepEqual(createAnatomyPlan(settings, item.seed, []), createAnatomyPlan(settings, item.seed, []));
    assert(item.criteria.length > 0);
  }
  const result = run(['--case', 'does-not-exist']);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Unknown evaluation case/);
});
