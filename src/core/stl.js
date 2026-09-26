/** Binary STL (little-endian) from a Manifold's mesh. Returns a Uint8Array. */
export function toBinarySTL(solid) {
  const mesh = solid.getMesh();
  const { numProp, vertProperties: vp, triVerts: tv } = mesh;
  const nTri = tv.length / 3;
  const buf = new ArrayBuffer(84 + 50 * nTri);
  const dv = new DataView(buf);
  new TextEncoder().encodeInto('shadow-hull', new Uint8Array(buf, 0, 80));
  dv.setUint32(80, nTri, true);
  let o = 84;
  const p = (i) => [vp[i * numProp], vp[i * numProp + 1], vp[i * numProp + 2]];
  for (let t = 0; t < nTri; t++) {
    const a = p(tv[3 * t]), b = p(tv[3 * t + 1]), c = p(tv[3 * t + 2]);
    const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    const len = Math.hypot(...n) || 1;
    for (const x of [...n.map((k) => k / len), ...a, ...b, ...c]) { dv.setFloat32(o, x, true); o += 4; }
    o += 2; // attribute byte count
  }
  return new Uint8Array(buf);
}
