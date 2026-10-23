import ManifoldModule from 'manifold-3d';
import { sculptHead } from './sculpt-head.mjs';
import { Anatomy } from '../shared/specimen.mjs';
import { PRINT_HEIGHT } from '../shared/print-settings.mjs';

// Conventions for a sturdy FDM figurine (0.4 mm nozzle, PLA or PETG), in printed
// millimeters so they hold at every supported print height.
export const PRINT_RULES = {
  minFeatureMm: 3,      // thinnest diameter of any horn, antenna or tail segment
  baseThicknessMm: 3,   // display base slab
  baseChamferMm: 0.8,   // bottom-edge chamfer that absorbs first-layer squish ("elephant's foot")
  overhangDeg: 45,      // faces tilted further than this from vertical need support
};
export const DESIGN_VERSION = 'printable-v5';
const BASE_TOP = 3;
const GROUNDED_TAIL = 10;

// One shared recipe drives both the boolean solid and editable OpenSCAD source.
// All appendages overlap their parents; feet overlap a flat display base.
export function legProfile(input) {
  const a = Anatomy.parse(input);
  return {
    clearance: a.legPairs ? Math.min(a.legLength, 6, a.bodyHeight * .25) : 0,
    radius: Math.max(4.5, Math.min(6, a.bodyWidth * .28)),
  };
}

// mmPerUnit is the print scale; feature minimums depend on it. createModel
// solves for it, and the default approximates a 60 mm print.
export function recipe(input, mmPerUnit = 1, baseplate = true) {
  const a = Anatomy.parse(input), parts = [];
  const minRadius = PRINT_RULES.minFeatureMm / 2 / mmPerUnit * 1.05;
  const thick = r => Math.max(r, minRadius);
  const ellipsoid = (p, r, tag = 'body') => parts.push({ type: 'ellipsoid', p, r, tag });
  const link = (p, q, r, s = r, tag = 'body') => parts.push({ type: 'link', p, q, r, s, tag });
  const { bodyLength: l, bodyWidth: w, bodyHeight: h, headSize: hs } = a;
  const legs = legProfile(a);
  const z = h + (a.legPairs ? 3 + legs.clearance : 2);
  // The base is the convex hull of one or more discs [x, y, radius].
  const base = { type: 'base', radius: Math.max(l * 1.18, w * 1.85), top: BASE_TOP, tag: 'base',
    height: Math.max(BASE_TOP, PRINT_RULES.baseThicknessMm / mmPerUnit) };
  base.discs = [[0, 0, base.radius]];
  base.chamfer = Math.min(base.height / 3, PRINT_RULES.baseChamferMm / mmPerUnit);
  if (baseplate) parts.push(base);
  ellipsoid([0, 0, z], [w, l, h]);
  for (let i = 0; i < a.legPairs; i++) {
    const y = a.legPairs === 1 ? 0 : -l * .64 + i * l * 1.28 / (a.legPairs - 1);
    for (const side of [-1, 1]) {
      const hip = [side * w * .66, y, z - h * .55];
      const knee = [side * w * 1.02 * a.stanceWidth, y + 1, 6 + legs.clearance * .4];
      const foot = [side * w * 1.12 * a.stanceWidth, y - 1, 4.2];
      link(hip, knee, legs.radius * 1.18, legs.radius, 'leg');
      link(knee, foot, legs.radius, legs.radius, 'leg');
      ellipsoid(foot, [legs.radius * 1.25, legs.radius * 1.45, 3.8], 'foot');
    }
  }
  const head = [0, -l * .84 - a.neckLength * .22, z + a.neckLength + hs * .22];
  sculptHead(a, head, z, { ellipsoid, link, thick });
  for (let i = 0; i < a.backPlates; i++) {
    const t = a.backPlates === 1 ? 0 : -.62 + i * 1.35 / (a.backPlates - 1);
    const top = z + h * Math.sqrt(1 - t * t);
    ellipsoid([0, l * t, top - 1], [w * .53, 4.1, 5.5], 'accent');
  }
  if (a.tailLength > 0) {
    // A long cantilevered tail is the first thing to snap off a figurine, so
    // long tails sweep down and rest on the base as a third point of support.
    const grounded = a.tailLength >= GROUNDED_TAIL;
    const tipRadius = thick(Math.max(1.4, 5 * (1 - 9 / 11)));
    const groundZ = BASE_TOP + tipRadius * .4;
    let prev = [0, l * .68, z];
    for (let i = 1; i <= 9; i++) {
      const t = i / 9;
      const height = grounded ? z + (groundZ - z) * (1 - Math.cos(t * Math.PI)) / 2
        : z - Math.sin(t * 2) * h * .35 + t * t * 7;
      const next = [Math.sin(t * 2.7) * a.tailCurl * a.tailLength * .7, l * .68 + t * a.tailLength, height];
      link(prev, next, thick(5 * (1 - (i - 1) / 11)), i === 9 ? tipRadius : thick(5 * (1 - i / 11)), 'tail');
      prev = next;
    }
    if (grounded) {
      ellipsoid([prev[0], prev[1], BASE_TOP + tipRadius * .2], [tipRadius * 1.7, tipRadius * 1.7, tipRadius * .9], 'tail');
      const pad = tipRadius * 1.7 + 2;
      if (Math.hypot(prev[0], prev[1]) + pad > base.radius) base.discs.push([prev[0], prev[1], pad]);
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

function verticalSpan(parts, baseplate) {
  let low = Infinity, high = -Infinity;
  for (const part of parts) {
    const [bottom, top] = part.type === 'base' ? [part.top - part.height, part.top]
      : part.type === 'ellipsoid' ? [part.p[2] - part.r[2], part.p[2] + part.r[2]]
      : [Math.min(part.p[2] - part.r, part.q[2] - part.s), Math.max(part.p[2] + part.r, part.q[2] + part.s)];
    low = Math.min(low, bottom); high = Math.max(high, top);
  }
  return high - (baseplate ? low : Math.max(BASE_TOP, low));
}

// Thickening features changes the model's height and so the print scale;
// a few rounds settle it well within the minimums' 5% margin.
function printRecipe(anatomy, height, baseplate) {
  let mmPerUnit = height / verticalSpan(recipe(anatomy, 1, baseplate), baseplate);
  for (let i = 0; i < 4; i++) mmPerUnit = height / verticalSpan(recipe(anatomy, mmPerUnit, baseplate), baseplate);
  return recipe(anatomy, mmPerUnit, baseplate);
}

// Surface share that faces down more steeply than the overhang limit, ignoring
// the base's underside on the bed, plus the solid's center of mass.
function printAnalysis(positions, triangles) {
  const limit = -Math.sin(PRINT_RULES.overhangDeg * Math.PI / 180);
  let area = 0, overhang = 0, volume = 0; const center = [0, 0, 0];
  for (let i = 0; i < triangles.length; i += 3) {
    const [a, b, c] = [0, 1, 2].map(k => positions.slice(triangles[i + k] * 3, triangles[i + k] * 3 + 3));
    const u = b.map((v, k) => v - a[k]), v = c.map((v, k) => v - a[k]);
    const n = [u[1]*v[2]-u[2]*v[1], u[2]*v[0]-u[0]*v[2], u[0]*v[1]-u[1]*v[0]];
    const doubled = Math.hypot(...n);
    area += doubled / 2;
    if (doubled && n[2] / doubled < limit && Math.max(a[2], b[2], c[2]) > .01) overhang += doubled / 2;
    const tetra = (a[0]*(b[1]*c[2]-b[2]*c[1]) + a[1]*(b[2]*c[0]-b[0]*c[2]) + a[2]*(b[0]*c[1]-b[1]*c[0])) / 6;
    volume += tetra;
    for (let k = 0; k < 3; k++) center[k] += tetra * (a[k] + b[k] + c[k]) / 4;
  }
  return { overhangPct: Math.round(overhang / area * 1000) / 10, centerOfMass: center.map(v => v / volume) };
}

let modulePromise;
export async function createModel(anatomy, height = PRINT_HEIGHT.initial, baseplate = true) {
  if (!Number.isFinite(height) || height < PRINT_HEIGHT.min || height > PRINT_HEIGHT.max) throw new Error(`Height must be ${PRINT_HEIGHT.min}–${PRINT_HEIGHT.max} mm.`);
  modulePromise ||= ManifoldModule().then(m => { m.setup(); return m; });
  const { Manifold } = await modulePromise;
  const parts = printRecipe(anatomy, height, baseplate), owned = [];
  const keep = v => { owned.push(v); return v; };
  const unitBall = keep(Manifold.sphere(1, 32));
  const ball = (p, r) => keep(unitBall.scale(r)).translate(p);
  try {
    const solids = parts.map(part => {
      if (part.type === 'base') {
        const { height: h, chamfer: c } = part;
        const discs = part.discs.flatMap(([x, y, r]) => [
          keep(keep(Manifold.cylinder(c, r - c, r, 96)).translate([x, y, 0])),
          keep(keep(Manifold.cylinder(h - c, r, r, 96)).translate([x, y, c]))]);
        return keep(keep(Manifold.hull(discs)).translate([0, 0, part.top - h]));
      }
      if (part.type === 'ellipsoid') return keep(ball(part.p, part.r));
      const one = keep(ball(part.p, [part.r, part.r, part.r]));
      const two = keep(ball(part.q, [part.s, part.s, part.s]));
      return keep(Manifold.hull([one, two]));
    });
    const complete = keep(Manifold.union(solids));
    // Flat feet, belly and tail pads contact the same plane when there is no slab.
    const union = baseplate ? complete : keep(complete.trimByPlane([0, 0, 1], BASE_TOP));
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
    const base = parts.find(p => p.type === 'base');
    const links = parts.filter(p => p.type === 'link');
    const mm = v => Math.round(v * scale * 10) / 10;
    const { overhangPct, centerOfMass } = printAnalysis(positions, triangles);
    // The base is centered on the origin, so this is the distance from its middle.
    const centerOffset = Math.hypot(centerOfMass[0], centerOfMass[1]);
    return {
      positions, triangles, parts, scale,
      info: { designVersion: DESIGN_VERSION, watertight: true, components: componentCount, triangles: scaled.numTri(),
        legShaftDiameterMm: anatomy.legPairs ? mm(legProfile(anatomy).radius * 2) : null,
        minFeatureDiameterMm: links.length ? mm(Math.min(...links.flatMap(p => [p.r, p.s])) * 2) : null,
        baseplate, baseThicknessMm: base ? mm(base.height) : 0, baseChamferMm: base ? mm(base.chamfer) : 0,
        overhangPct, stable: base ? centerOffset < base.radius * scale * .5 : null,
        tailRestsOnBase: baseplate && anatomy.tailLength >= GROUNDED_TAIL,
        dimensions: box.max.map((v, i) => Math.round((v - box.min[i]) * 10) / 10),
        volumeCm3: Math.round(scaled.volume() / 100) / 10, height, units: 'mm',
        printNote: `${baseplate ? 'Print upright on the chamfered base.' : 'Print upright on the flat contact surfaces. Without a baseplate, check bed adhesion and balance; consider a brim.'} Every horn, antenna and tail segment is at least ${PRINT_RULES.minFeatureMm} mm thick${baseplate && anatomy.tailLength >= GROUNDED_TAIL ? ' and the tail rests on the base' : ''}. About ${Math.round(overhangPct)}% of the surface overhangs more than ${PRINT_RULES.overhangDeg}°: enable tree or organic supports for the belly, chin and eyes. Preview in your slicer; physical results depend on your printer and material.` },
      scad: scadSource(parts, scale, height, bounds, baseplate, unitBall.getMesh()),
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

function sphereScad(mesh) {
  const points = [], faces = [];
  for (let i = 0; i < mesh.vertProperties.length; i += mesh.numProp) points.push(Array.from(mesh.vertProperties.slice(i, i + 3)));
  // OpenSCAD polyhedra use clockwise winding when viewed from outside.
  for (let i = 0; i < mesh.triVerts.length; i += 3) faces.push(Array.from(mesh.triVerts.slice(i, i + 3)).reverse());
  return `// Shared faceted sphere preserves the STL shape and export bounds.\nmodule unit_ball() {\n  polyhedron(points=${JSON.stringify(points)}, faces=${JSON.stringify(faces)});\n}\n`;
}

function scadSource(parts, factor, height, bounds, baseplate, sphereMesh) {
  const vector = v => JSON.stringify(v);
  const ball = (p, r) => `translate(${vector(p)}) scale(${vector(r)}) unit_ball();`;
  const clip = baseplate ? '' : `\n  // Clip to the same flat contact plane as the STL.\n  translate(${vector(bounds.min)}) cube(${vector(bounds.max.map((v, i) => v - bounds.min[i]))});\n`;
  return `// Critter Generator: editable CSG source. Units: millimeters.\n// This is the simplified print sculpt, not an image-to-3D reconstruction.\n// Change target_height_mm to resize; edit the primitives below to reshape.\n${sphereScad(sphereMesh)}target_height_mm=${height};\nscale(${factor} * target_height_mm / ${height}) translate([0, 0, ${-bounds.min[2]}]) ${baseplate ? '' : 'intersection() {\n'}union() {\n` + parts.map(p => {
    if (p.type === 'base') return `  // Display base; the bottom chamfer offsets first-layer squish.\n  translate([0, 0, ${p.top - p.height}]) hull() {\n` + p.discs.map(([x, y, r]) =>
      `    translate([${x}, ${y}, 0]) { cylinder(h=${p.chamfer}, r1=${r - p.chamfer}, r2=${r}, $fn=96); translate([0, 0, ${p.chamfer}]) cylinder(h=${p.height - p.chamfer}, r=${r}, $fn=96); }`).join('\n') + '\n  }';
    if (p.type === 'ellipsoid') return `  ${ball(p.p, p.r)}`;
    return `  hull() { ${ball(p.p, [p.r,p.r,p.r])} ${ball(p.q, [p.s,p.s,p.s])} }`;
  }).join('\n') + '\n}\n' + clip + (baseplate ? '' : '}\n');
}
