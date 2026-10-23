import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const edge = path.resolve(process.env.LIONFEATHER_EDGE_DIR || path.join(root, '..', 'lionfeather-edge'));
const deployer = path.join(edge, 'apps', 'critter', 'deploy.sh');

if (!existsSync(deployer)) {
  console.error(`Critter deployer not found: ${deployer}. Place lionfeather-edge beside this checkout or set LIONFEATHER_EDGE_DIR.`);
  process.exitCode = 1;
} else {
  // Hosting, transfer exclusions, credentials and service checks belong to edge.
  const result = spawnSync('bash', [deployer, root], { cwd: edge, stdio: 'inherit' });
  if (result.error) console.error(`Could not start the Critter deployer: ${result.error.message}`);
  process.exitCode = result.status ?? 1;
}
