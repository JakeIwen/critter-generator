import test from 'node:test';
import assert from 'node:assert/strict';
import { createModel, stlBuffer, recipe, PRINT_RULES } from '../server/geometry.mjs';
import { example, Anatomy } from '../shared/specimen.mjs';

function verifySerializedSolid(buffer, height) {
  const count = buffer.readUInt32LE(80);
  assert.equal(buffer.length, 84 + count * 50);
  const edges = new Map(); let volume = 0, minZ = Infinity, maxZ = -Infinity;
  for (let i = 0; i < count; i++) {
    const start = 84 + i * 50 + 12;
    const v = [0,1,2].map(j => [0,1,2].map(k => buffer.readFloatLE(start + j * 12 + k * 4)));
    for (const point of v) { assert(point.every(Number.isFinite)); minZ = Math.min(minZ, point[2]); maxZ = Math.max(maxZ, point[2]); }
    const [a,b,c] = v;
    volume += (a[0]*(b[1]*c[2]-b[2]*c[1])+a[1]*(b[2]*c[0]-b[0]*c[2])+a[2]*(b[0]*c[1]-b[1]*c[0]))/6;
    const keys = v.map(p => p.join(','));
    assert.equal(new Set(keys).size,3,'No degenerate serialized triangles');
    for (let j = 0; j < 3; j++) {
      const p = keys[j], q = keys[(j+1)%3], key = [p,q].sort().join('|');
      const edge = edges.get(key) || {count:0,orientation:0};
      edge.count++; edge.orientation += p < q ? 1 : -1; edges.set(key,edge);
    }
  }
  for (const e of edges.values()) { assert.equal(e.count,2,'Every STL edge has exactly two incident faces'); assert.equal(e.orientation,0,'Consistent face winding'); }
  assert(volume > 0,'Positive enclosed volume');
  assert(Math.abs(minZ) < 1e-5,'Flat base on Z=0'); assert(Math.abs(maxZ-height) < 1e-4,'Requested millimeter height survives STL serialization');
}

test('exported STL is closed, oriented, and at the requested height', async () => {
  const model = await createModel(example.anatomy,100);
  assert.equal(model.info.components,1); verifySerializedSolid(stlBuffer(model),100);
  assert.match(model.scad,/target_height_mm=100/); assert.match(model.scad,/union\(\)/);
});
test('anatomy boundary combinations produce connected printable solids', async () => {
  for (let i = 0; i < 16; i++) {
    const anatomy = {...example.anatomy, bodyLength:i%2?34:18,bodyWidth:i%3?11:22,bodyHeight:i%2?12:24,headSize:i%3?8:16,
      neckLength:i%2?14:0,legPairs:i%5,legLength:i%2?16:0,eyes:1+i%6,horns:i%7,hornLength:i%2?16:4,
      tailLength:i%2?28:0,tailCurl:i%3-1,antennae:i%5,backPlates:i%9,texture:['smooth','ridged','speckled'][i%3]};
    const height = i%2 ? 60 : 180;
    const model = await createModel(anatomy,height);
    assert.equal(model.info.components,1,`Case ${i}`); verifySerializedSolid(stlBuffer(model),height);
    if (anatomy.legPairs) assert(model.info.legShaftDiameterMm >= 5, `Case ${i}: leg shafts stay at least 5 mm at the smallest supported print size`);
    if (model.info.minFeatureDiameterMm !== null) assert(model.info.minFeatureDiameterMm >= PRINT_RULES.minFeatureMm, `Case ${i}: no protrusion thinner than ${PRINT_RULES.minFeatureMm} mm`);
    assert(model.info.baseThicknessMm >= PRINT_RULES.baseThicknessMm, `Case ${i}: base slab thick enough`);
    assert(model.info.stable, `Case ${i}: center of mass sits over the middle of the base`);
    assert(model.info.overhangPct >= 0 && model.info.overhangPct < 60, `Case ${i}: overhang share is measured`);
  }
});
test('legacy tall-leg inputs produce a low stance with stout load-bearing segments', () => {
  const parts = recipe({...example.anatomy,legLength:16,bodyHeight:24,bodyWidth:22});
  const body = parts.find(p => p.type === 'ellipsoid');
  const base = parts.find(p => p.type === 'base');
  const clearance = body.p[2] - body.r[2] - base.top;
  assert(clearance <= body.r[2] * .25,'Belly clearance is bounded relative to body size');
  const legs = parts.filter(p => p.tag === 'leg');
  assert(legs.length > 0);
  for (const leg of legs) {
    const length = Math.hypot(...leg.p.map((v,i) => v-leg.q[i]));
    assert(length / (2 * Math.min(leg.r,leg.s)) < 2,'Each load-bearing segment is short compared with its thickness');
  }
});
test('the base has a bottom chamfer against first-layer squish', async () => {
  const { positions } = await createModel(example.anatomy, 60);
  let bed = 0, above = 0;
  for (let i = 0; i < positions.length; i += 3) {
    const reach = Math.hypot(positions[i], positions[i + 1]), z = positions[i + 2];
    if (z < 1e-4) bed = Math.max(bed, reach);
    else if (z > PRINT_RULES.baseChamferMm + .05 && z < 2) above = Math.max(above, reach);
  }
  assert(above - bed > PRINT_RULES.baseChamferMm * .9, 'Bed footprint is inset by the chamfer');
});
test('long tails rest on the base instead of cantilevering', async () => {
  const parts = recipe({...example.anatomy, tailLength:28, tailCurl:1});
  const base = parts.find(p => p.type === 'base');
  const tail = parts.filter(p => p.tag === 'tail' && p.type === 'link').at(-1);
  assert(tail.q[2] - tail.s < base.top, 'Tail tip sinks into the base');
  assert(base.discs.some(([x, y, r]) => Math.hypot(tail.q[0] - x, tail.q[1] - y) < r), 'Tail tip lies over the base');
  const short = recipe({...example.anatomy, tailLength:6}).filter(p => p.tag === 'tail' && p.type === 'link').at(-1);
  assert(short.q[2] > base.top + 5, 'Short stubby tails stay up');
  const model = await createModel({...example.anatomy, tailLength:28, tailCurl:1}, 100);
  assert.match(model.scad, /hull\(\)/); assert.equal(model.info.tailRestsOnBase, true);
});
test('invalid geometry cannot create unbounded or non-finite meshes', async () => {
  assert.equal(Anatomy.safeParse({...example.anatomy,bodyLength:Infinity}).success,false);
  await assert.rejects(createModel(example.anatomy,0));
  await assert.rejects(createModel({...example.anatomy,legPairs:10000}));
});
