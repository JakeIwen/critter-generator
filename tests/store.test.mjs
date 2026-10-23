import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Store } from '../server/store.mjs';
import { example } from '../shared/specimen.mjs';

test('SQLite retains creatures and jobs across restart and ignores stale legacy JSON', () => {
  const root = mkdtempSync(path.join(os.tmpdir(),'critter-store-'));
  try {
    mkdirSync(path.join(root,'specimens','legacy'),{recursive:true});
    const old = {...example,id:'legacy',createdAt:'2026-09-01T00:00:00Z'};
    writeFileSync(path.join(root,'specimens','legacy','record.json'),JSON.stringify(old));
    let store = new Store(root);
    assert.equal(store.get('specimens','legacy').englishName,example.englishName);
    store.save('specimens','legacy',{...old,englishName:'Renamed specimen'});
    store.save('jobs','job-1',{id:'job-1',status:'completed',createdAt:'2026-09-02T00:00:00Z',specimenId:'legacy'});
    store.db.close();
    writeFileSync(path.join(root,'specimens','legacy','record.json'),JSON.stringify(old));
    store = new Store(root);
    assert.equal(store.list('specimens')[0].englishName,'Renamed specimen');
    assert.equal(store.get('jobs','job-1').specimenId,'legacy');
    assert.equal(readFileSync(path.join(root,'critters.sqlite')).subarray(0,15).toString(),'SQLite format 3');
    assert.throws(()=>store.get('specimens','../../etc/passwd'));
    assert.throws(()=>store.list('specimens; DROP TABLE jobs'));
    store.db.close();
  } finally { rmSync(root,{recursive:true,force:true}); }
});

test('model worker persists 500 mm exports without a baseplate and defaults older calls to a baseplate', async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'critter-model-store-'));
  const store = new Store(root);
  try {
    const print = await store.model('no-base', example.anatomy, 500, false);
    assert.equal(print.height, 500);
    assert.equal(print.baseplate, false);
    assert.equal(print.components, 1);
    const mesh = JSON.parse(readFileSync(store.file('specimens', 'no-base', 'mesh.json'), 'utf8'));
    let minZ = Infinity, maxZ = -Infinity;
    for (let i = 2; i < mesh.positions.length; i += 3) {
      minZ = Math.min(minZ, mesh.positions[i]); maxZ = Math.max(maxZ, mesh.positions[i]);
    }
    assert(Math.abs(minZ) < 1e-5);
    assert(Math.abs(maxZ - 500) < 1e-4);
    const bytes = readFileSync(store.file('specimens', 'no-base', 'model.stl'));
    assert.equal(bytes.length, 84 + bytes.readUInt32LE(80) * 50);
    const cad = readFileSync(store.file('specimens', 'no-base', 'model.scad'), 'utf8');
    assert.match(cad, /target_height_mm=500/);
    assert.doesNotMatch(cad, /Display base/);
    const legacy = await store.model('legacy-base', example.anatomy, 100);
    assert.equal(legacy.baseplate, true);
    assert.match(readFileSync(store.file('specimens', 'legacy-base', 'model.scad'), 'utf8'), /Display base/);
  } finally {
    store.db.close();
    rmSync(root, { recursive: true, force: true });
  }
});
