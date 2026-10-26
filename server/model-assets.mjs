import { randomUUID } from 'node:crypto';
import { mkdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

function writeModelAssets(folder, result) {
  mkdirSync(folder, { recursive: true });
  writeFileSync(path.join(folder, 'model.stl'), result.stl);
  writeFileSync(path.join(folder, 'model.scad'), result.model.scad);
  writeFileSync(path.join(folder, 'mesh.json'), JSON.stringify({ positions: result.model.positions, triangles: result.model.triangles }));
}

export function publishModel(folder, result, options = {}) {
  if (options.sourcePortraitVersion === undefined) {
    writeModelAssets(folder, result);
    return result.model.info;
  }
  if (!Number.isSafeInteger(options.sourcePortraitVersion) || options.sourcePortraitVersion < 1) {
    throw new Error('A model must reference an existing portrait version.');
  }
  const assetRevision = randomUUID(), parent = path.join(folder, 'models');
  const temporary = path.join(parent, `.pending-${assetRevision}`);
  const destination = path.join(parent, assetRevision);
  try {
    writeModelAssets(temporary, result);
    renameSync(temporary, destination);
  } finally { rmSync(temporary, { recursive: true, force: true }); }
  return { ...result.model.info, assetRevision, sourcePortraitVersion: options.sourcePortraitVersion,
    stale: false, generatedAt: options.generatedAt ?? new Date().toISOString() };
}
