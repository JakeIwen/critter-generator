import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "..");
const read = file => readFileSync(path.join(root, file), "utf8");

test("server entry composes feature adapters without leaking them into models", () => {
  const entry = read("server/index.mjs");
  for (const owner of ["./codex.mjs", "./store.mjs", "./geometry.mjs", "./access.mjs", "./login.mjs"]) {
    assert.ok(entry.includes(owner), owner);
  }
  assert.doesNotMatch(read("shared/specimen.mjs"), /\.\.\/server\//);
  assert.doesNotMatch(read("shared/sliders.mjs"), /\.\.\/server\//);
});

test("documented commands keep the stable process and verification targets", () => {
  const scripts = JSON.parse(read("package.json")).scripts;
  assert.equal(scripts.serve, "node server/index.mjs");
  assert.equal(scripts.check, "node scripts/check.mjs");
  assert.equal(scripts["verify:http"], "node scripts/verify-http.mjs");
  assert.equal(scripts.stop, "node scripts/stop.mjs");
  assert.match(read("AGENTS.md"), /^## Contracts$/m);
});

test("the complete check keeps production state and live Codex outside its boundary", () => {
  const check = read("scripts/check.mjs");
  assert.match(check, /mkdtemp/);
  assert.match(check, /CRITTER_DATA_DIR/);
  assert.match(check, /CRITTER_DIST_DIR/);
  assert.match(check, /offlineCodexEnvironment/);
  assert.match(check, /rm\(scratch, \{ recursive: true, force: true \}\)/);
});
