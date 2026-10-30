import sharp from 'sharp';

export const MESH_RENDER_SIZE = Object.freeze({ width: 768, height: 256 });
const VIEWS = Object.freeze([{ label: 'Front (−Y)', direction: [0, -1, 0] }, { label: 'Side (+X)', direction: [1, 0, 0] },
  { label: 'Three-quarter', direction: [1, -1, .65] }]);
const dot = (a, b) => a[0]*b[0] + a[1]*b[1] + a[2]*b[2];
const cross = (a, b) => [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
const normalize = v => { const length = Math.hypot(...v) || 1; return v.map(x => x/length); };
const srgbByte = value => Math.round(255 * Math.max(0, Math.min(1, value <= .0031308 ? 12.92*value : 1.055*value**(1/2.4)-.055)));

function project(mesh, direction) {
  const forward = normalize(direction), right = normalize(cross([0, 0, 1], forward)), up = cross(forward, right);
  const vertices = [], low = [Infinity, Infinity], high = [-Infinity, -Infinity];
  for (let i = 0; i < mesh.positions.length; i += 3) {
    const point = mesh.positions.slice(i, i+3), p = [dot(point, right), dot(point, up), dot(point, forward)];
    vertices.push(p);
    for (let k = 0; k < 2; k++) { low[k] = Math.min(low[k], p[k]); high[k] = Math.max(high[k], p[k]); }
  }
  return { vertices, low, high, forward };
}

function paintTriangle(pixels, depth, points, color, panel) {
  const { width, height } = MESH_RENDER_SIZE, panelWidth = width/VIEWS.length;
  const [a, b, c] = points;
  const denominator = (b[1]-c[1])*(a[0]-c[0]) + (c[0]-b[0])*(a[1]-c[1]);
  if (Math.abs(denominator) < 1e-9) return;
  const left = Math.max(panel*panelWidth, Math.floor(Math.min(a[0], b[0], c[0])));
  const right = Math.min((panel+1)*panelWidth-1, Math.ceil(Math.max(a[0], b[0], c[0])));
  const top = Math.max(0, Math.floor(Math.min(a[1], b[1], c[1]))), bottom = Math.min(height-25, Math.ceil(Math.max(a[1], b[1], c[1])));
  for (let y = top; y <= bottom; y++) for (let x = left; x <= right; x++) {
    const u = ((b[1]-c[1])*(x+.5-c[0]) + (c[0]-b[0])*(y+.5-c[1]))/denominator;
    const v = ((c[1]-a[1])*(x+.5-c[0]) + (a[0]-c[0])*(y+.5-c[1]))/denominator, w = 1-u-v;
    if (u < -1e-8 || v < -1e-8 || w < -1e-8) continue;
    const z = u*a[2]+v*b[2]+w*c[2], index = y*width+x;
    if (z <= depth[index]) continue;
    depth[index] = z;
    for (let k = 0; k < 3; k++) pixels[index*3+k] = color[k];
  }
}

function renderPanel(mesh, view, panel, scale, pixels, depth) {
  const panelWidth = MESH_RENDER_SIZE.width/VIEWS.length;
  const center = view.low.map((v, i) => (v+view.high[i])/2);
  const projected = view.vertices.map(p => [panelWidth*(panel+.5)+(p[0]-center[0])*scale, 116-(p[1]-center[1])*scale, p[2]]);
  const light = normalize([-1, -2, 3]);
  for (let i = 0; i < mesh.triangles.length; i += 3) {
    const indices = mesh.triangles.slice(i, i+3), world = indices.map(j => mesh.positions.slice(j*3, j*3+3));
    const normal = normalize(cross(world[1].map((v, k) => v-world[0][k]), world[2].map((v, k) => v-world[0][k])));
    const shade = .35 + .55*Math.max(0, dot(normal, light)) + .1*Math.max(0, dot(normal, view.forward));
    const color = [0, 1, 2].map(k => srgbByte(shade * (mesh.colors ? indices.reduce((sum, j) => sum+mesh.colors[j*3+k], 0)/3 : [.5, .48, .36][k])));
    paintTriangle(pixels, depth, indices.map(j => projected[j]), color, panel);
  }
}

// Orthographic views share one scale so the checker can compare proportions across views.
export async function renderMesh(mesh) {
  if (!mesh.positions?.length || !mesh.triangles?.length) throw new Error('Cannot render an empty mesh.');
  const { width, height } = MESH_RENDER_SIZE, pixels = Buffer.alloc(width*height*3, 238);
  const depth = new Float64Array(width*height).fill(-Infinity), views = VIEWS.map(v => project(mesh, v.direction));
  const scale = Math.min(...views.flatMap(v => [224/Math.max(1e-6, v.high[0]-v.low[0]), 208/Math.max(1e-6, v.high[1]-v.low[1])]));
  views.forEach((view, panel) => renderPanel(mesh, view, panel, scale, pixels, depth));
  const labels = `<svg width="${width}" height="${height}">${VIEWS.map((v, i) => `<text x="${width/VIEWS.length*(i+.5)}" y="248" text-anchor="middle" font-family="sans-serif" font-size="12" fill="#333">${v.label}</text>`).join('')}</svg>`;
  return sharp(pixels, { raw: { width, height, channels: 3 } }).composite([{ input: Buffer.from(labels) }]).png().toBuffer();
}
