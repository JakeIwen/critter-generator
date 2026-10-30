import { Sculpt } from '../../shared/sculpt.mjs';

const palette = { color: '#d4aa60', accent: '#242b30', approximationNotes: ['Feather barbs are merged into solid vanes.'] };
const radial = { count: 6, axis: 'y', center: [0, 0, 32] };
export const cartwheelSculpt = Sculpt.parse({ ...palette, parts: [
  { kind: 'ellipsoid', center: [0, 0, 32], radii: [22, 22, 1.6], rotation: [90, 0, 0] },
  { kind: 'ellipsoid', center: [0, -2.5, 32], radii: [7, 3.8, 7], accent: true },
  { kind: 'ellipsoid', center: [0, -5.7, 32], radii: [2.6, 1.4, 2.6], role: 'detail' },
  { kind: 'capsule', from: [0, -3, 28], to: [5, -3, 14], radius: 2.5, endRadius: 2, radial, role: 'walking-leg', accent: true },
  { kind: 'capsule', from: [5, -3, 14], to: [0, -2, 5], radius: 2, endRadius: 2.2, radial, role: 'walking-leg', accent: true },
  { kind: 'capsule', from: [0, -2, 5], to: [-2, -4, 4.5], radius: 2.2, endRadius: 1.5, radial, role: 'walking-leg' },
  { kind: 'capsule', from: [0, -2, 5], to: [2, -4, 4.5], radius: 2.2, endRadius: 1.5, radial, role: 'walking-leg' },
  { kind: 'hull', balls: [{ center: [4, 0, 12], radius: 1.1 }, { center: [17, 0, 19], radius: 1.1 },
    { center: [8, 0, 28], radius: 1.1 }], radial },
] });

export const quadrupedSculpt = Sculpt.parse({ ...palette, approximationNotes: [], parts: [
  { kind: 'ellipsoid', center: [0, 0, 21], radii: [10, 16, 8], rotation: [5, 0, 0] },
  { kind: 'ellipsoid', center: [0, -17, 25], radii: [7, 8, 7] },
  { kind: 'ellipsoid', center: [3.8, -23, 27.5], radii: [2, 2, 2], mirrorX: true, accent: true, role: 'detail' },
  { kind: 'capsule', from: [7, -9, 20], to: [10, -11, 4.5], radius: 3.5, endRadius: 2.5, mirrorX: true, role: 'walking-leg' },
  { kind: 'capsule', from: [7, 10, 20], to: [10, 12, 4.5], radius: 3.5, endRadius: 2.5, mirrorX: true, role: 'walking-leg' },
  { kind: 'capsule', from: [0, 12, 23], to: [0, 24, 16], radius: 3.5, endRadius: 2 },
] });

export const leglessSculpt = Sculpt.parse({ ...palette, approximationNotes: [], parts: [
  { kind: 'ellipsoid', center: [0, 0, 17], radii: [12, 15, 15] },
] });
