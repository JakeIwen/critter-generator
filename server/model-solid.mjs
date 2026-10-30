export function partSolid(Manifold, unitBall, part, keep) {
  const ball = (p, r) => keep(keep(unitBall.scale(r)).translate(p));
  if (part.type === 'base') {
    const { height: h, chamfer: c } = part;
    const discs = part.discs.flatMap(([x, y, r]) => [
      keep(keep(Manifold.cylinder(c, r-c, r, 96)).translate([x, y, 0])),
      keep(keep(Manifold.cylinder(h-c, r, r, 96)).translate([x, y, c]))]);
    return keep(keep(Manifold.hull(discs)).translate([0, 0, part.top-h]));
  }
  if (part.type === 'ellipsoid') {
    const scaled = keep(unitBall.scale(part.r));
    return keep((part.rotation ? keep(scaled.rotate(part.rotation)) : scaled).translate(part.p));
  }
  const balls = part.type === 'hull' ? part.balls : [{ p: part.p, r: part.r }, { p: part.q, r: part.s }];
  return keep(Manifold.hull(balls.map(b => ball(b.p, [b.r, b.r, b.r]))));
}

export function colorSolid(solid, color, keep) {
  const rgb = [1, 3, 5].map(i => parseInt(color.slice(i, i+2), 16)/255)
    .map(c => c <= .04045 ? c/12.92 : ((c+.055)/1.055)**2.4);
  return keep(solid.setProperties(3, properties => { for (let i = 0; i < 3; i++) properties[i] = rgb[i]; }));
}

export function solidMesh(solid) {
  const mesh = solid.getMesh(), positions = [], colors = [];
  for (let i = 0; i < mesh.vertProperties.length; i += mesh.numProp) {
    positions.push(...mesh.vertProperties.slice(i, i+3));
    if (mesh.numProp >= 6) colors.push(...mesh.vertProperties.slice(i+3, i+6));
  }
  return { positions, triangles: Array.from(mesh.triVerts), ...(colors.length ? { colors } : {}) };
}
