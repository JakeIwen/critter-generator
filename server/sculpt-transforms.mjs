const radians = degrees => degrees * Math.PI / 180;
export function rotationMatrix([x, y, z] = [0, 0, 0]) {
  const [a, b, c] = [x, y, z].map(radians), [cx, cy, cz] = [a, b, c].map(Math.cos), [sx, sy, sz] = [a, b, c].map(Math.sin);
  return [[cz*cy, cz*sy*sx-sz*cx, cz*sy*cx+sz*sx], [sz*cy, sz*sy*sx+cz*cx, sz*sy*cx-cz*sx], [-sy, cy*sx, cy*cx]];
}
export const transformVector = (matrix, vector) => matrix.map(row => row.reduce((sum, v, i) => sum + v * vector[i], 0));
export const multiplyRotations = (a, b) => a.map(row => [0, 1, 2].map(i => row.reduce((sum, v, j) => sum + v * b[j][i], 0)));
export function eulerRotation(matrix) {
  const y = Math.asin(Math.max(-1, Math.min(1, -matrix[2][0])));
  const regular = Math.abs(Math.cos(y)) > 1e-8;
  return [regular ? Math.atan2(matrix[2][1], matrix[2][2]) : Math.atan2(-matrix[1][2], matrix[1][1]),
    y, regular ? Math.atan2(matrix[1][0], matrix[0][0]) : 0].map(v => v * 180 / Math.PI);
}
