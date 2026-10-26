import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Store } from '../server/store.mjs';
import { example } from '../shared/specimen.mjs';
import sharp from 'sharp';
import { cadIsStale } from '../shared/specimen-assets.mjs';

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

test('portrait versions preserve the original legacy image and mark existing CAD out of date', async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'critter-portrait-store-'));
  const store = new Store(root);
  try {
    const first = await sharp({ create: { width: 3, height: 2, channels: 3, background: 'red' } }).png().toBuffer();
    const next = await sharp({ create: { width: 4, height: 2, channels: 3, background: 'blue' } }).webp().toBuffer();
    const original = { ...example, id: 'legacy-image', image: true, print: { height: 100 }, createdAt: '2026-09-01T00:00:00Z' };
    store.save('specimens', original.id, original);
    store.portrait(original.id, first);
    const updated = await store.savePortrait(original, next, { kind: 'edit', instructions: 'Turn blue', jobId: 'job-2', createdAt: '2026-09-02T00:00:00Z' });
    assert.equal(updated.portraitVersion, 2);
    assert.equal(updated.image, true);
    assert.equal(updated.imageError, null);
    assert.equal(updated.print.stale, true);
    assert.equal(cadIsStale(updated), true);
    assert.deepEqual(readFileSync(store.portraitFile(updated, 1)), first);
    assert.deepEqual(readFileSync(store.portraitFile(original)), first, 'A pre-publication record still resolves the original');
    assert.equal(updated.portraits[0].version, 1);
    assert.equal(updated.portraits[0].width, 3);
    assert.equal(updated.portraits[1].kind, 'edit');
    assert.equal(updated.portraits[1].instructions, 'Turn blue');
    assert.equal(updated.portraits[1].jobId, 'job-2');
    assert.equal(updated.portraits[1].width, 4);
    assert.equal((await sharp(readFileSync(store.portraitFile(updated))).metadata()).format, 'png');
    store.save('specimens', updated.id, updated);
    assert.deepEqual(store.get('specimens', updated.id).portraits, updated.portraits);
    assert.throws(() => store.portraitFile(updated, 3), /not found/);
  } finally { store.db.close(); rmSync(root, { recursive: true, force: true }); }
});

test('a failed portrait replacement preserves the current image, metadata and model bytes', async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'critter-portrait-failure-'));
  const store = new Store(root);
  try {
    const bytes = await sharp({ create: { width: 2, height: 2, channels: 3, background: 'red' } }).png().toBuffer();
    const specimen = { ...example, id: 'image', image: false, print: { height: 100 }, createdAt: '2026-09-01T00:00:00Z' };
    store.save('specimens', specimen.id, specimen);
    const saved = await store.savePortrait(specimen, bytes);
    store.save('specimens', saved.id, saved);
    writeFileSync(store.file('specimens', saved.id, 'model.stl'), 'original model');
    const before = readFileSync(store.portraitFile(saved));
    const corrupt = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), Buffer.alloc(160)]);
    await assert.rejects(store.savePortrait(saved, corrupt), /could not be decoded/);
    assert.deepEqual(readFileSync(store.portraitFile(saved)), before);
    assert.deepEqual(store.get('specimens', saved.id), saved);
    assert.equal(readFileSync(store.file('specimens', saved.id, 'model.stl'), 'utf8'), 'original model');
    mkdirSync(store.file('specimens', saved.id, 'portraits/2.png'));
    await assert.rejects(store.savePortrait(saved, bytes));
    assert.deepEqual(readFileSync(store.portraitFile(saved)), before, 'A publication failure leaves the current version intact');
    assert.deepEqual(store.get('specimens', saved.id), saved);
    assert.equal(readFileSync(store.file('specimens', saved.id, 'model.stl'), 'utf8'), 'original model');
  } finally { store.db.close(); rmSync(root, { recursive: true, force: true }); }
});

test('on-demand CAD versions preserve earlier and legacy files while following their source portrait', async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'critter-versioned-model-'));
  const store = new Store(root);
  try {
    const legacy = await store.model('image', example.anatomy, 100);
    const legacyBytes = readFileSync(store.file('specimens', 'image', 'model.stl'));
    const first = await store.model('image', example.anatomy, 120, false, { sourcePortraitVersion: 1 });
    const specimen = { id: 'image', image: true, portraitVersion: 1, print: first };
    const original = readFileSync(store.modelFile(specimen, 'model.stl'));
    assert.equal(first.sourcePortraitVersion, 1);
    assert.equal(first.stale, false);
    assert.equal(first.height, 120);
    assert.equal(first.baseplate, false);
    assert.equal(cadIsStale(specimen), false);
    const second = await store.model('image', example.anatomy, 200, true, { sourcePortraitVersion: 2 });
    assert.notEqual(first.assetRevision, second.assetRevision);
    assert.deepEqual(readFileSync(store.modelFile(specimen, 'model.stl')), original);
    assert.deepEqual(readFileSync(store.modelFile({ id: 'image', print: legacy }, 'model.stl')), legacyBytes);
    assert.equal(cadIsStale({ ...specimen, portraitVersion: 2 }), true);
    assert.equal(cadIsStale({ ...specimen, portraitVersion: 2, print: second }), false);
    await assert.rejects(store.model('image', { ...example.anatomy, bodyHeight: -1 }, 200, true, { sourcePortraitVersion: 2 }));
    assert.deepEqual(readFileSync(store.modelFile(specimen, 'model.stl')), original);
  } finally { store.db.close(); rmSync(root, { recursive: true, force: true }); }
});
