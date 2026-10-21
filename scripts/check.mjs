import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

const root = path.resolve(import.meta.dirname, '..');
const scratch = await mkdtemp(path.join(tmpdir(), 'critter-check-'));
let server;
const commandTimeoutMs = 120_000;
function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: root, stdio: 'inherit', ...options });
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(`${command} ${args.join(' ')} exceeded ${commandTimeoutMs}ms`));
    }, commandTimeoutMs);
    child.once('error', error => { clearTimeout(timer); reject(error); });
    child.once('exit', code => {
      clearTimeout(timer);
      code === 0 ? resolve() : reject(new Error(`${command} ${args.join(' ')} exited ${code}`));
    });
  });
}
async function availablePort() {
  const listener = createServer();
  await new Promise((resolve, reject) => listener.listen(0, '127.0.0.1', resolve).once('error', reject));
  const { port } = listener.address();
  await new Promise(resolve => listener.close(resolve));
  return port;
}
async function waitForServer(origin) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try { if ((await fetch(`${origin}/api/specimens`, { signal: AbortSignal.timeout(1_000) })).ok) return; } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(`isolated server did not become ready at ${origin}`);
}
async function offlineCodexEnvironment() {
  const bin = path.join(scratch, 'bin');
  const marker = path.join(scratch, 'offline-codex-used');
  await mkdir(bin);
  await writeFile(path.join(bin, 'codex'), '#!/bin/sh\nprintf fixture > "$CRITTER_CHECK_MARKER"\nexit 1\n', { mode: 0o700 });
  return { PATH: bin, CRITTER_CHECK_MARKER: marker };
}
async function verifyOfflineCodex(marker) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try { if (await readFile(marker, 'utf8') === 'fixture') return; } catch (error) { if (error.code !== 'ENOENT') throw error; }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error('isolated server did not use the offline Codex fixture');
}
async function stopServer(child) {
  if (!child || (child.exitCode !== null || child.signalCode !== null)) return;
  child.kill('SIGTERM');
  const waitForExit = timeoutMs => new Promise(resolve => {
    if ((child.exitCode !== null || child.signalCode !== null)) return resolve(true);
    const timer = setTimeout(() => resolve(false), timeoutMs);
    child.once('exit', () => { clearTimeout(timer); resolve(true); });
  });
  if (!await waitForExit(5_000)) {
    child.kill('SIGKILL');
    if (!await waitForExit(5_000)) throw new Error('isolated server did not exit after SIGKILL');
  }
}
try {
  const tests = (await readdir(path.join(root, 'tests')))
    .filter(name => name.endsWith('.test.mjs'))
    .sort()
    .map(name => path.join('tests', name));
  if (!tests.length) throw new Error('no unit tests found');
  await run(process.execPath, ['--test', ...tests]);
  await run(path.join(root, 'node_modules/.bin/vite'), ['build', '--outDir', path.join(scratch, 'dist'), '--emptyOutDir']);
  const port = await availablePort();
  const env = { ...process.env, ...await offlineCodexEnvironment(), PORT: String(port), CRITTER_DATA_DIR: path.join(scratch, 'data'), CRITTER_DIST_DIR: path.join(scratch, 'dist') };
  server = spawn(process.execPath, ['server/index.mjs'], { cwd: root, env, stdio: 'inherit' });
  const startupError = new Promise((_, reject) => {
    server.once('error', reject);
    server.once('exit', code => reject(new Error(`isolated server exited during startup with ${code}`)));
  });
  await Promise.race([waitForServer(`http://127.0.0.1:${port}`), startupError]);
  const servedIndex = await (await fetch(`http://127.0.0.1:${port}/`, { signal: AbortSignal.timeout(5_000) })).text();
  const builtIndex = await readFile(path.join(scratch, 'dist/index.html'), 'utf8');
  if (servedIndex !== builtIndex) throw new Error('isolated server did not serve the scratch build');
  await run(process.execPath, ['scripts/verify-http.mjs'], { env });
  await verifyOfflineCodex(env.CRITTER_CHECK_MARKER);
} finally {
  await stopServer(server);
  await rm(scratch, { recursive: true, force: true });
}
