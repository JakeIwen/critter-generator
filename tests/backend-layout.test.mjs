import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "..");
const read = file => readFileSync(path.join(root, file), "utf8");

function contractRows(markdown) {
  const section = (markdown.split(/^## Contracts\s*$/m)[1] ?? "").split(/^## /m)[0];
  return section
    .split("\n")
    .filter(line => /^\|/.test(line) && !/^\|\s*(?:Path|-)/.test(line))
    .map(line => line.split("|").slice(1, -1).map(cell => cell.trim().replaceAll("`", "")))
    .filter(row => row.length >= 3);
}

function packageTargets(scripts) {
  return new Set(Object.values(scripts).flatMap(command =>
    [...command.matchAll(/(?:^|\s)([\w./-]+\.mjs)(?=\s|$)/g)].map(match => match[1])));
}

function contractProblems(markdown, scripts, present = existsSync) {
  const rows = contractRows(markdown);
  const byPath = new Map(rows.map(([target, caller, owner]) => [target, { caller, owner }]));
  const problems = [];
  for (const target of packageTargets(scripts)) if (!byPath.has(target)) problems.push(`undeclared target: ${target}`);
  for (const [target, { caller, owner }] of byPath) {
    if (!caller || !owner) problems.push(`incomplete contract: ${target}`);
    if (!present(path.join(root, target))) problems.push(`missing target: ${target}`);
    for (const ownerPath of owner.split(/,\s*/)) if (!present(path.join(root, ownerPath))) problems.push(`missing owner: ${ownerPath}`);
  }
  return problems;
}

function imports(source) {
  const script = `import vm from "node:vm";let source="";for await(const chunk of process.stdin)source+=chunk;const module=new vm.SourceTextModule(source);console.log(JSON.stringify(module.moduleRequests.map(request=>request.specifier)));`;
  const child = spawnSync(process.execPath, ["--experimental-vm-modules", "--input-type=module", "-e", script], {
    input: source,
    encoding: "utf8",
  });
  assert.equal(child.status, 0, child.stderr);
  return JSON.parse(child.stdout);
}

test("server entry composes adapters while shared models stay server-independent", () => {
  const entryImports = imports(read("server/index.mjs"));
  for (const owner of ["./codex.mjs", "./store.mjs", "./geometry.mjs", "./access.mjs", "./login.mjs"]) assert.ok(entryImports.includes(owner), owner);
  for (const model of ["shared/specimen.mjs", "shared/sliders.mjs"]) {
    assert.ok(imports(read(model)).every(specifier => !specifier.startsWith("../server/")), model);
  }
  assert.ok(imports('import "../server/runtime.mjs";').some(specifier => specifier.startsWith("../server/")));
});

test("every package executable has a complete existing Contracts row", () => {
  assert.deepEqual(contractProblems(read("AGENTS.md"), JSON.parse(read("package.json")).scripts), []);
});

test("contract validation rejects undeclared and missing targets", () => {
  const markdown = "## Contracts\n\n| Path | Caller | Owner |\n|---|---|---|\n| `server/index.mjs` | fixture | `server/index.mjs` |\n";
  const problems = contractProblems(markdown, { serve: "node server/index.mjs", stop: "node scripts/missing.mjs" }, file => !String(file).endsWith("missing.mjs"));
  assert.ok(problems.includes("undeclared target: scripts/missing.mjs"));
});
