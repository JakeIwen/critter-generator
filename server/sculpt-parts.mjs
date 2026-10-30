import { Sculpt, SCULPT_KINDS, SCULPT_AXES, SCULPT_GROUND } from '../shared/sculpt.mjs';
import { rotationMatrix, multiplyRotations, transformVector, eulerRotation } from './sculpt-transforms.mjs';

function copies(part, thick) {
  const results = [], count = part.radial?.count ?? 1, origin = part.radial?.center ?? [0, 0, 0];
  for (let i = 0; i < count; i++) for (const side of part.mirrorX ? [1, -1] : [1]) {
    const degrees = [0, 0, 0];
    if (part.radial) degrees[Object.values(SCULPT_AXES).indexOf(part.radial.axis)] = i * 360 / count;
    const radial = rotationMatrix(degrees);
    // Mirror the seed first, then rotate both copies about the specified world axis.
    const position = p => transformVector(radial, p.map((v, k) => v * (k === 0 ? side : 1) - origin[k])).map((v, k) => v + origin[k]);
    const tag = part.accent ? 'accent' : 'body';
    if (part.kind === SCULPT_KINDS.ELLIPSOID) {
      const reflected = rotationMatrix(part.rotation ?? undefined).map((row, j) => row.map((v, k) => v * (j === 0 ? side : 1) * (k === 0 ? side : 1)));
      results.push({ type: 'ellipsoid', p: position(part.center), r: part.radii.map(thick), tag,
        rotation: eulerRotation(multiplyRotations(radial, reflected)) });
    } else if (part.kind === SCULPT_KINDS.CAPSULE) {
      results.push({ type: 'link', p: position(part.from), q: position(part.to), r: thick(part.radius), s: thick(part.endRadius), tag });
    } else results.push({ type: 'hull', balls: part.balls.map(b => ({ p: position(b.center), r: thick(b.radius) })), tag });
  }
  return results;
}

export function partBounds(part) {
  if (part.type === 'base') {
    return { min: [Math.min(...part.discs.map(([x, , r]) => x-r)), Math.min(...part.discs.map(([, y, r]) => y-r)), part.top-part.height],
      max: [Math.max(...part.discs.map(([x, , r]) => x+r)), Math.max(...part.discs.map(([, y, r]) => y+r)), part.top] };
  }
  if (part.type === 'ellipsoid') {
    const matrix = rotationMatrix(part.rotation), extent = matrix.map(row => Math.hypot(...row.map((v, i) => v * part.r[i])));
    return { min: part.p.map((v, i) => v-extent[i]), max: part.p.map((v, i) => v+extent[i]) };
  }
  const balls = part.type === 'hull' ? part.balls : [{ p: part.p, r: part.r }, { p: part.q, r: part.s }];
  return { min: [0, 1, 2].map(i => Math.min(...balls.map(b => b.p[i]-b.r))), max: [0, 1, 2].map(i => Math.max(...balls.map(b => b.p[i]+b.r))) };
}

export function sculptParts(input, mmPerUnit, baseplate, rules) {
  const sculpt = Sculpt.parse(input), minRadius = rules.minFeatureMm / 2 / mmPerUnit * 1.05;
  const parts = sculpt.parts.flatMap(part => copies(part, r => Math.max(r, minRadius)));
  if (baseplate) {
    const bounds = parts.map(partBounds), pad = Math.max(2, minRadius), axes = [0, 1];
    const min = axes.map(i => Math.min(...bounds.map(b => b.min[i]))), max = axes.map(i => Math.max(...bounds.map(b => b.max[i])));
    const center = axes.map(i => (min[i]+max[i])/2), radius = Math.min(...axes.map(i => (max[i]-min[i])/2)) + pad;
    const height = Math.max(SCULPT_GROUND, rules.baseThicknessMm/mmPerUnit);
    // The full bounding footprint supports off-center and radial forms, not just a torso.
    parts.unshift({ type: 'base', top: SCULPT_GROUND, height, chamfer: Math.min(height/3, rules.baseChamferMm/mmPerUnit),
      radius, center, discs: [min[0], max[0]].flatMap(x => [min[1], max[1]].map(y => [x, y, pad])), tag: 'base' });
  }
  return parts;
}

export function minimumPartRadius(parts) {
  return Math.min(...parts.filter(p => p.type !== 'base').flatMap(p => p.type === 'ellipsoid' ? p.r : p.type === 'hull' ? p.balls.map(b => b.r) : [p.r, p.s]));
}
