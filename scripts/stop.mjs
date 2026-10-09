import { readFileSync } from 'node:fs';
try {
  const info = JSON.parse(readFileSync(new URL('../.local/server.json', import.meta.url), 'utf8'));
  if (!Number.isInteger(info.port) || info.port < 1024 || info.port > 65535 || typeof info.stopToken !== 'string') throw new Error('No valid running app instance recorded.');
  const response = await fetch(`http://127.0.0.1:${info.port}/api/shutdown`, {
    method: 'POST', headers: { 'X-Critter-Request': '1', 'X-Critter-Stop-Token': info.stopToken }, signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) throw new Error('The recorded app instance is no longer running; no process was stopped.');
  console.log('Stopped Critter Generator.');
} catch (e) { console.error(e.code === 'ENOENT' ? 'No running app recorded.' : e.message); process.exitCode = 1; }
