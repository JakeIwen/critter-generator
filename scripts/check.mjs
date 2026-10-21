import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

const root = path.resolve(import.meta.dirname, '..');
const scratch = await mkdtemp(path.join(tmpdir(), 'critter-check-'));
let server;
function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: root, stdio: 'inherit', ...options });
    child.once('error', reject);
    child.once('exit', code => code === 0 ? resolve() : reject(new Error(`${command} ${args.join(' ')} exited ${code}`)));
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
    try { if ((await fetch(`${origin}/api/specimens`)).ok) return; } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(`isolated server did not become ready at ${origin}`);
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
  const env = { ...process.env, PORT: String(port), CRITTER_DATA_DIR: path.join(scratch, 'data') };
  server = spawn(process.execPath, ['server/index.mjs'], { cwd: root, env, stdio: 'inherit' });
  await waitForServer(`http://127.0.0.1:${port}`);
  await run(process.execPath, ['scripts/verify-http.mjs'], { env });
} finally {
  if (server && server.exitCode === null) {
    server.kill('SIGTERM');
    await new Promise(resolve => server.once('exit', resolve));
  }
  await rm(scratch, { recursive: true, force: true });
}
