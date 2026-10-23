export function sculptHead(a, head, z, { ellipsoid, link, thick }) {
  const { bodyLength: l, headSize: hs } = a;
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
    link(root, tip, thick(3.2), thick(1.1), 'accent');
  }
  for (let i = 0; i < a.antennae; i++) {
    const x = a.antennae === 1 ? 0 : -hs * .7 + i * hs * 1.4 / (a.antennae - 1);
    const root = [x, head[1] - hs * .05, head[2] + hs * .61];
    const mid = [x * 1.4, root[1] - 1, root[2] + 8];
    const tip = [x * 1.75, root[1] - 5, root[2] + 13];
    link(root, mid, thick(2.2), thick(1.9), 'accent'); link(mid, tip, thick(1.9), thick(1.9), 'accent');
    ellipsoid(tip, [3.7, 3.7, 4.4], 'accent');
  }
}
