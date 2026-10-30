import test from 'node:test';
import assert from 'node:assert/strict';
import { Sculpt, sculptValidation, SCULPT_LIMITS } from '../shared/sculpt.mjs';
import { generationOutputSchema } from '../shared/anatomy-plan.mjs';
import { createModel, stlBuffer, PRINT_RULES } from '../server/geometry.mjs';
import { cartwheelSculpt, quadrupedSculpt } from './fixtures/sculpts.mjs';

function verifyStl(model, height) {
  const bytes = stlBuffer(model), count = bytes.readUInt32LE(80), edges = new Map();
  let low = Infinity, high = -Infinity, volume = 0;
  for (let i = 0; i < count; i++) {
    const points = [0, 1, 2].map(j => [0, 1, 2].map(k => bytes.readFloatLE(96+i*50+j*12+k*4)));
    const [a, b, c] = points, keys = points.map(p => p.join(','));
    assert.equal(new Set(keys).size, 3);
    for (let j = 0; j < 3; j++) {
      assert(points[j].every(Number.isFinite)); low = Math.min(low, points[j][2]); high = Math.max(high, points[j][2]);
      const p = keys[j], q = keys[(j+1)%3], key = [p, q].sort().join('|'), edge = edges.get(key) ?? [0, 0];
      edge[0]++; edge[1] += p < q ? 1 : -1; edges.set(key, edge);
    }
    volume += (a[0]*(b[1]*c[2]-b[2]*c[1])+a[1]*(b[2]*c[0]-b[0]*c[2])+a[2]*(b[0]*c[1]-b[1]*c[0]))/6;
  }
  for (const edge of edges.values()) assert.deepEqual(edge, [2, 0], 'Every serialized edge has two consistently wound faces');
  assert(volume > 0); assert(Math.abs(low) < 1e-5); assert(Math.abs(high-height) < 1e-4);
  assert.equal(model.info.components, 1); assert(model.info.watertight);
}

for (const [name, sculpt] of Object.entries({ cartwheel: cartwheelSculpt, quadruped: quadrupedSculpt })) {
  test(`${name} exports one closed printable solid at 60 and 300 mm, with and without a base`, async () => {
    for (const height of [60, 300]) for (const baseplate of [true, false]) {
      const model = await createModel(sculpt, height, baseplate);
      verifyStl(model, height); assert(model.info.minFeatureDiameterMm >= PRINT_RULES.minFeatureMm);
      assert.equal(model.colors.length, model.positions.length);
      assert(new Set(model.colors).size > 3, 'Accent survives boolean fusion as vertex colors');
      assert.match(model.scad, /rotate\(/);
      if (baseplate) assert(model.info.baseThicknessMm >= PRINT_RULES.baseThicknessMm);
    }
  });
}

test('rotation, radial repetition and mirroring affect the exported solid, not only source metadata', async () => {
  const disc = { ...cartwheelSculpt, parts: [cartwheelSculpt.parts[0]] };
  const vertical = await createModel(disc, 100, false);
  const horizontal = await createModel({ ...disc, parts: [{ ...disc.parts[0], rotation: [0, 0, 0] }] }, 100, false);
  assert(vertical.info.dimensions[0] > vertical.info.dimensions[1]*8);
  assert(horizontal.info.dimensions[1] > vertical.info.dimensions[1]*8);
  assert.match(vertical.scad, /rotate\(\[90,0,0\]\)/);
  const radial = await createModel(cartwheelSculpt, 100, false);
  const seedOnly = await createModel({ ...cartwheelSculpt, parts: cartwheelSculpt.parts.map(p => ({ ...p, radial: null })) }, 100, false);
  assert.notDeepEqual(stlBuffer(radial), stlBuffer(seedOnly));
  const mirrored = await createModel(quadrupedSculpt, 100, false);
  const oneSide = await createModel({ ...quadrupedSculpt, parts: quadrupedSculpt.parts.map(p => ({ ...p, mirrorX: false })) }, 100, false);
  assert(mirrored.info.volumeCm3 > oneSide.info.volumeCm3);
});

test('sculpt trust boundary rejects malformed, nonfinite, oversized and incompatible fields', () => {
  const part = cartwheelSculpt.parts[0];
  for (const change of [{ center: [151, 0, 1] }, { radii: [0, 2, 3] }, { rotation: [0, Infinity, 0] }, { rotation: [361, 0, 0] },
    { kind: 'torso' }, { center: null }, { from: [0, 0, 0] }, { center: [1, 2] }]) {
    assert.equal(Sculpt.safeParse({ ...cartwheelSculpt, parts: [{ ...part, ...change }] }).success, false);
  }
  assert.equal(Sculpt.safeParse({ ...cartwheelSculpt, parts: Array(SCULPT_LIMITS.parts+1).fill(part) }).success, false);
  const repeated = { ...part, mirrorX: true, radial: { axis: 'z', center: [0, 0, 0], count: 24 } };
  assert.equal(Sculpt.safeParse({ ...cartwheelSculpt, parts: [repeated, repeated, repeated] }).success, false);
  assert.equal(sculptValidation(true).safeParse(quadrupedSculpt).success, false);
  assert.equal(Sculpt.safeParse({ ...cartwheelSculpt, parts: [{ kind: 'hull', balls: Array(9).fill({ center: [0, 0, 5], radius: 2 }) }] }).success, false);
});

test('strict output schema has required keys, nullable unused fields and no tuple/union extension syntax', () => {
  const visit = value => {
    if (!value || typeof value !== 'object') return;
    assert(!('prefixItems' in value)); assert(!('oneOf' in value)); assert(!('discriminator' in value));
    if (value.type === 'object') {
      assert.equal(value.additionalProperties, false);
      assert.deepEqual([...value.required].sort(), Object.keys(value.properties).sort());
    }
    for (const child of Object.values(value)) visit(child);
  };
  visit(generationOutputSchema(Sculpt)); visit(generationOutputSchema(sculptValidation(true)));
});

test('disconnected authored components fail instead of silently publishing loose pieces', async () => {
  const sculpt = { ...cartwheelSculpt, parts: [cartwheelSculpt.parts[0], { kind: 'ellipsoid', center: [100, 0, 60], radii: [2, 2, 2] }] };
  await assert.rejects(createModel(sculpt, 100, false), /2 disconnected components/);
});

test('a thin upright sculpt gets a base deep enough not to tip', async () => {
  const model = await createModel(cartwheelSculpt, 100);
  const [width, depth, height] = model.info.dimensions;
  assert(Math.min(width, depth) >= height * 2 * PRINT_RULES.minBaseReach * .95, `base ${width}×${depth} for a ${height} mm figure`);
});

test('model-facing sculpt schemas carry no defaults for strict structured output', () => {
  // No sculpt field is named "default", so any occurrence is the keyword.
  assert(!JSON.stringify(generationOutputSchema(sculptValidation(false))).includes('"default":'));
  assert.equal(Sculpt.parse({ color: '#112233', accent: '#445566', approximationNotes: [],
    parts: [{ kind: 'ellipsoid', center: [0, 0, 20], radii: [10, 10, 17] }] }).parts[0].mirrorX, false);
});
