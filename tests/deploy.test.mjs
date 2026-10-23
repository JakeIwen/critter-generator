import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, realpathSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');

test('deploy command passes the source checkout safely and preserves hosting deployer failures', t => {
  const edge = mkdtempSync(path.join(tmpdir(), 'critter edge '));
  t.after(() => rmSync(edge, { recursive: true, force: true }));
  const run = () => spawnSync(process.execPath, [path.join(root, 'scripts/deploy.mjs')], {
    cwd: tmpdir(), env: { ...process.env, LIONFEATHER_EDGE_DIR: edge }, encoding: 'utf8',
  });
  const missing = run();
  assert.equal(missing.status, 1);
  assert.match(missing.stderr, /Critter deployer not found/);
  mkdirSync(path.join(edge, 'apps/critter'), { recursive: true });
  const deployer = path.join(edge, 'apps/critter/deploy.sh');
  writeFileSync(deployer, 'printf "%s\\n" "$#" "$1" "$PWD"\n');
  const success = run();
  assert.equal(success.status, 0, success.stderr);
  assert.deepEqual(success.stdout.trim().split('\n'), ['1', root, realpathSync(edge)]);
  writeFileSync(deployer, 'echo "Fixture deployment failed" >&2\nexit 17\n');
  const failure = run();
  assert.equal(failure.status, 17);
  assert.match(failure.stderr, /Fixture deployment failed/);
});
