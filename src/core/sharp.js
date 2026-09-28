/**
 * Sharp edges of a mesh: knife-like edges where two faces meet at an acute
 * interior angle (convex edges only). Smoothly rounded corners have no such
 * edge (their facets meet at shallow angles), unlike column-based thinness,
 * which counts them. Returns total length (mm) and the edges, sharpest first.
 */
export function sharpEdges(mesh, { maxAngle = 60 } = {}) {
  const { vertProperties: P, numProp: n, triVerts: T } = mesh;
  const v = (i) => [P[i * n], P[i * n + 1], P[i * n + 2]];
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const norm = (a) => { const l = Math.hypot(...a); return l > 0 ? a.map((x) => x / l) : a; };
  const normals = [], edges = new Map();
  for (let t = 0; t < T.length; t += 3) {
    const [a, b, c] = [T[t], T[t + 1], T[t + 2]];
    normals.push(norm(cross(sub(v(b), v(a)), sub(v(c), v(a)))));
    for (const [p, q, r] of [[a, b, c], [b, c, a], [c, a, b]]) {
      const key = p < q ? `${p},${q}` : `${q},${p}`;
      const e = edges.get(key);
      if (e) e.push([t / 3, r]); else edges.set(key, [[t / 3, r]]);
    }
  }
  const out = [];
  let length = 0;
  for (const [key, fs] of edges) {
    if (fs.length !== 2) continue;
    const [[f1], [f2, r2]] = fs;
    const [i, j] = key.split(',').map(Number);
    const n1 = normals[f1], n2 = normals[f2];
    // Convex if the other face's far vertex lies behind the first face's plane.
    if (dot(n1, sub(v(r2), v(i))) > -1e-9) continue;
    const between = Math.acos(Math.max(-1, Math.min(1, dot(n1, n2)))) * (180 / Math.PI);
    const interior = 180 - between;
    if (interior >= maxAngle) continue;
    const len = Math.hypot(...sub(v(i), v(j)));
    if (len < 1e-6) continue;
    length += len;
    out.push({ a: v(i), b: v(j), angle: interior, length: len });
  }
  out.sort((x, y) => x.angle - y.angle);
  return { length, edges: out };
}
