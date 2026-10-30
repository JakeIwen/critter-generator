import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { renderMesh, MESH_RENDER_SIZE } from '../server/mesh-render.mjs';
import { createModel } from '../server/geometry.mjs';
import { cartwheelSculpt, quadrupedSculpt } from './fixtures/sculpts.mjs';

for (const [name, sculpt] of Object.entries({ cartwheel: cartwheelSculpt, quadruped: quadrupedSculpt })) {
  test(`renderer produces three shaded, colored views of the fused ${name} quickly`, async () => {
    const mesh = await createModel(sculpt, 100, true), start = performance.now();
    const png = await renderMesh(mesh), elapsed = performance.now()-start;
    assert(elapsed < 2000, `Typical mesh render took ${elapsed.toFixed(0)} ms`);
    const { data, info } = await sharp(png).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    assert.equal(info.width, MESH_RENDER_SIZE.width); assert.equal(info.height, MESH_RENDER_SIZE.height);
    for (let panel = 0; panel < 3; panel++) {
      let changed = 0, colored = 0;
      for (let y = 0; y < 228; y++) for (let x = panel*256; x < (panel+1)*256; x++) {
        const i = (y*info.width+x)*3;
        if (data[i] !== 238 || data[i+1] !== 238 || data[i+2] !== 238) changed++;
        if (Math.abs(data[i]-data[i+2]) > 10) colored++;
      }
      assert(changed > 200, `View ${panel} contains the sculpture`); assert(colored > 100, `View ${panel} retains its palette`);
    }
    assert.deepEqual(await renderMesh(mesh), png, 'Rendering is deterministic');
  });
}

test('z buffering makes nearer triangles occlude farther ones independently of draw order', async () => {
  const mesh = { positions: [-1, -1, 0, 1, -1, 0, 0, -1, 2, -1, 1, 0, 1, 1, 0, 0, 1, 2],
    triangles: [0, 1, 2, 3, 4, 5], colors: [1, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 1] };
  const png = await renderMesh(mesh);
  assert.deepEqual(await renderMesh({ ...mesh, triangles: [3, 4, 5, 0, 1, 2] }), png);
  const { data, info } = await sharp(png).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const i = (116*info.width+128)*3;
  assert(data[i] > 100 && data[i+2] === 0, 'Front view sees the red triangle at -Y, not the blue one behind');
});

test('empty meshes fail explicitly instead of encoding a blank success image', async () => {
  await assert.rejects(renderMesh({ positions: [], triangles: [] }), /empty mesh/);
});
