import test from 'node:test';
import assert from 'node:assert/strict';
import { PORTRAIT_KINDS, portraitVersionOf, portraitFilename, cadIsStale, modelFilename } from '../shared/specimen-assets.mjs';

test('asset version rules support saved legacy portraits and mark CAD stale after portrait changes', () => {
  assert.equal(portraitVersionOf({ image: false }), 0);
  assert.equal(portraitVersionOf({ image: true }), 1);
  assert.equal(portraitVersionOf({ image: true, portraitVersion: 3 }), 3);
  assert.equal(cadIsStale({ image: true, print: {} }), false);
  assert.equal(cadIsStale({ image: true, portraitVersion: 2, print: {} }), true);
  assert.equal(cadIsStale({ image: true, portraitVersion: 2, print: { sourcePortraitVersion: 2 } }), false);
  assert.equal(cadIsStale({ image: true, portraitVersion: 2, print: { sourcePortraitVersion: 2, stale: true } }), true);
  assert.equal(cadIsStale({ image: true, portraitVersion: 2, print: null }), false);
  assert.deepEqual(Object.values(PORTRAIT_KINDS), ['generation', 'regenerate', 'edit']);
});

test('asset filenames reject traversal and unsupported model or portrait versions', () => {
  assert.equal(portraitFilename(2), 'portraits/2.png');
  assert.throws(() => portraitFilename(0));
  assert.throws(() => portraitFilename('../secret'));
  assert.equal(modelFilename({ print: {} }, 'model.stl'), 'model.stl');
  assert.equal(modelFilename({ print: { assetRevision: 'revision-2' } }, 'mesh.json'), 'models/revision-2/mesh.json');
  assert.throws(() => modelFilename({ print: { assetRevision: '../secret' } }, 'model.stl'));
  assert.throws(() => modelFilename({ print: {} }, '../record.json'));
});
