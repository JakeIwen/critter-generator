import ManifoldModule from 'manifold-3d';
import { Anatomy } from '../shared/specimen.mjs';

// One shared recipe drives both the boolean solid and editable OpenSCAD source.
// All appendages overlap their parents; feet overlap a flat display base.
export function legProfile(input) {
  const a = Anatomy.parse(input);
  return {
    clearance: a.legPairs ? Math.min(a.legLength, 6, a.bodyHeight * .25) : 0,
    radius: Math.max(4.5, Math.min(6, a.bodyWidth * .28)),
  };
}

export function recipe(input) {
  const a = Anatomy.parse(input), parts = [];
  const ellipsoid = (p, r, tag = 'body') => parts.push({ type: 'ellipsoid', p, r, tag });
  const link = (p, q, r, s = r, tag = 'body') => parts.push({ type: 'link', p, q, r, s, tag });
  const { bodyLength: l, bodyWidth: w, bodyHeight: h, headSize: hs } = a;
  const legs = legProfile(a);
  const z = h + (a.legPairs ? 3 + legs.clearance : 2);
  const baseRadius = Math.max(l * 1.18, w * 1.85);
  parts.push({ type: 'base', radius: baseRadius, height: 3, tag: 'base' });
  ellipsoid([0, 0, z], [w, l, h]);
  for (let i = 0; i < a.legPairs; i++) {
    const y = a.legPairs === 1 ? 0 : -l * .64 + i * l * 1.28 / (a.legPairs - 1);
    for (const side of [-1, 1]) {
      const hip = [side * w * .66, y, z - h * .55];
      const knee = [side * w * 1.02, y + 1, 6 + legs.clearance * .4];
      const foot = [side * w * 1.12, y - 1, 4.2];
      link(hip, knee, legs.radius * 1.18, legs.radius, 'leg');
      link(knee, foot, legs.radius, legs.radius, 'leg');
      ellipsoid(foot, [legs.radius * 1.25, legs.radius * 1.45, 3.8], 'foot');
    }
  }
  const head = [0, -l * .84 - a.neckLength * .22, z + a.neckLength + hs * .22];
  link([0, -l * .53, z], head, hs * .69, hs * .7);
  ellipsoid(head, [hs, hs * .88, hs * .86]);
  ellipsoid([0, head[1] - hs * .65, head[2] - hs * .22], [hs * .65, hs * .55, hs * .36], 'accent');
  for (let i = 0; i < a.eyes; i++) {
    const angle = a.eyes === 1 ? 0 : -1.07 + i * 2.14 / (a.eyes - 1);
    const eye = [Math.sin(angle) * hs * .77, head[1] - Math.cos(angle) * hs * .73, head[2] + hs * .3];
    ellipsoid(eye, [2.9, 2.9, 2.9], 'eye');
    ellipsoid([eye[0], eye[1] - 1.5, eye[2]], [1.8, 1.8, 1.8], 'eye');
  }
  for (let i = 0; i < a.horns; i++) {
    const x = a.horns === 1 ? 0 : -hs * .65 + i * hs * 1.3 / (a.horns - 1);
    const root = [x, head[1] + 1.5, head[2] + hs * .58];
    const tip = [x * 1.28, head[1] + 3, root[2] + a.hornLength];
    link(root, tip, 3.2, 1.1, 'accent');
  }
  for (let i = 0; i < a.antennae; i++) {
    const x = a.antennae === 1 ? 0 : -hs * .7 + i * hs * 1.4 / (a.antennae - 1);
    const root = [x, head[1] - hs * .05, head[2] + hs * .61];
    const mid = [x * 1.4, root[1] - 1, root[2] + 8];
    const tip = [x * 1.75, root[1] - 5, root[2] + 13];
    link(root, mid, 2.2, 1.9, 'accent'); link(mid, tip, 1.9, 1.9, 'accent');
    ellipsoid(tip, [3.7, 3.7, 4.4], 'accent');
  }
  for (let i = 0; i < a.backPlates; i++) {
    const t = a.backPlates === 1 ? 0 : -.62 + i * 1.35 / (a.backPlates - 1);
    const top = z + h * Math.sqrt(1 - t * t);
    ellipsoid([0, l * t, top - 1], [w * .53, 4.1, 5.5], 'accent');
  }
  if (a.tailLength > 0) {
    let prev = [0, l * .68, z];
    for (let i = 1; i <= 9; i++) {
      const t = i / 9;
      const next = [Math.sin(t * 2.7) * a.tailCurl * a.tailLength * .7,
        l * .68 + t * a.tailLength, z - Math.sin(t * 2) * h * .35 + t * t * 7];
      link(prev, next, 5 * (1 - (i - 1) / 11), Math.max(1.4, 5 * (1 - i / 11)), 'body');
      prev = next;
    }
  }
  if (a.texture !== 'smooth') {
    for (let row = 0; row < 5; row++) for (const sign of [-1, 1]) {
      const y = (row - 2) * l * .29, x = sign * w * .74;
      const t = Math.sqrt(Math.max(.01, 1 - (y / l) ** 2 - .74 ** 2));
      ellipsoid([x, y, z + h * t * .94], a.texture === 'ridged' ? [2, 4.2, 2.8] : [2.5, 2.5, 2.5], 'accent');
    }
  }
  return parts;
}

let modulePromise;
export async function createModel(anatomy, height = 100) {
  if (!Number.isFinite(height) || height < 60 || height > 180) throw new Error('Height must be 60–180 mm.');
  modulePromise ||= ManifoldModule().then(m => { m.setup(); return m; });
  const { Manifold } = await modulePromise;
  const parts = recipe(anatomy), owned = [];
  const keep = v => { owned.push(v); return v; };
  const ball = (p, r) => keep(keep(Manifold.sphere(1, 32)).scale(r)).translate(p);
  try {
    const solids = parts.map(part => {
      if (part.type === 'base') return keep(Manifold.cylinder(part.height, part.radius, part.radius, 96));
      if (part.type === 'ellipsoid') return keep(ball(part.p, part.r));
      const one = keep(ball(part.p, [part.r, part.r, part.r]));
      const two = keep(ball(part.q, [part.s, part.s, part.s]));
      return keep(Manifold.hull([one, two]));
    });
    const union = keep(Manifold.union(solids));
    if (union.status() !== 'NoError') throw new Error('Solid union failed validation.');
    const components = union.decompose();
    const componentCount = components.length;
    for (const component of components) component.delete();
    if (componentCount !== 1) throw new Error(`Sculpture has ${componentCount} disconnected components.`);
    const bounds = union.boundingBox();
    const scale = height / (bounds.max[2] - bounds.min[2]);
    const scaled = keep(keep(union.translate([0, 0, -bounds.min[2]])).scale(scale));
    const mesh = scaled.getMesh();
    const positions = [];
    for (let i = 0; i < mesh.vertProperties.length; i += mesh.numProp) positions.push(...mesh.vertProperties.slice(i, i + 3));
    const triangles = Array.from(mesh.triVerts);
    const box = scaled.boundingBox();
    return {
      positions, triangles, parts, scale,
      info: { designVersion: 'sturdy-legs-v2', watertight: true, components: componentCount, triangles: scaled.numTri(),
        legShaftDiameterMm: anatomy.legPairs ? Math.round(legProfile(anatomy).radius * 2 * scale * 10) / 10 : null,
        dimensions: box.max.map((v, i) => Math.round((v - box.min[i]) * 10) / 10),
        volumeCm3: Math.round(scaled.volume() / 100) / 10, height, units: 'mm',
        printNote: 'Flat base included. Enable supports for the belly, muzzle, tail and antennae. Preview in your slicer; physical printability depends on your printer and material.' },
      scad: scadSource(parts, scale, height),
    };
  } finally { for (const solid of owned.reverse()) solid.delete(); }
}

export function stlBuffer(model) {
  const { positions: p, triangles: t } = model;
  const buffer = Buffer.alloc(84 + t.length / 3 * 50);
  buffer.write('Critter Generator | millimeters | closed single solid');
  buffer.writeUInt32LE(t.length / 3, 80);
  let offset = 84;
  for (let i = 0; i < t.length; i += 3) {
    const a = p.slice(t[i] * 3, t[i] * 3 + 3), b = p.slice(t[i + 1] * 3, t[i + 1] * 3 + 3), c = p.slice(t[i + 2] * 3, t[i + 2] * 3 + 3);
    const u = b.map((v, k) => v - a[k]), v = c.map((v, k) => v - a[k]);
    const n = [u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]];
    const length = Math.hypot(...n) || 1;
    for (const value of [...n.map(v => v / length), ...a, ...b, ...c]) { buffer.writeFloatLE(value, offset); offset += 4; }
    buffer.writeUInt16LE(0, offset); offset += 2;
  }
  return buffer;
}

function scadSource(parts, factor, height) {
  const vector = v => JSON.stringify(v);
  const ball = (p, r) => `translate(${vector(p)}) scale(${vector(r)}) sphere(r=1);`;
  return `// Critter Generator: editable CSG source. Units: millimeters.\n// This is the simplified print sculpt, not an image-to-3D reconstruction.\n// Change target_height_mm to resize; edit the primitives below to reshape.\n$fn=48;\ntarget_height_mm=${height};\nscale(${factor} * target_height_mm / ${height}) union() {\n` + parts.map(p => {
    if (p.type === 'base') return `  cylinder(h=${p.height}, r=${p.radius}, $fn=96);`;
    if (p.type === 'ellipsoid') return `  ${ball(p.p, p.r)}`;
    return `  hull() { ${ball(p.p, [p.r,p.r,p.r])} ${ball(p.q, [p.s,p.s,p.s])} }`;
  }).join('\n') + '\n}\n';
}
