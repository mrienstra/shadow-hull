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

/**
 * Trim knife edges (the design option `trim`): chamfer every convex edge
 * sharper than `maxAngle` where the wedge is `t` thick, i.e. at
 * r = t / (2 tan(angle / 2)) from the edge along both faces (at most
 * `maxDepth`). The chamfer meets the faces at blunt angles, so no new sharp
 * edge appears; rounded corners and everything else are left alone.
 * Sharp edges are joined into chains (polylines through shared vertices) and
 * each chain is cut as one smooth band: depth, face directions and normals
 * are taken per vertex (averaged over its two segments), so neighbouring
 * pieces share their corners exactly, and the depth fades to nothing as the
 * edge's angle nears the threshold (over `fade` degrees), so a chamfer has
 * no step where it ends. Returns a new Manifold.
 */
export function trimSharp(wasm, solid, { maxAngle = 60, t = 0.3, maxDepth = 1.5, fade = 10 } = {}) {
  const { Manifold } = wasm;
  const { vertProperties: P, numProp: n, triVerts: T } = solid.getMesh();
  const v = (i) => [P[i * n], P[i * n + 1], P[i * n + 2]];
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const add = (a, b, k = 1) => [a[0] + k * b[0], a[1] + k * b[1], a[2] + k * b[2]];
  const scale = (a, k) => a.map((x) => x * k);
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const norm = (a) => { const l = Math.hypot(...a); return l > 0 ? a.map((x) => x / l) : a; };
  // Positions can repeat across vertex indices (mesh seams): key by position.
  const key = (p) => p.map((x) => Math.round(x * 1e5)).join(',');
  const normals = [], edges = new Map();
  for (let k = 0; k < T.length; k += 3) {
    const [a, b, c] = [T[k], T[k + 1], T[k + 2]];
    normals.push(norm(cross(sub(v(b), v(a)), sub(v(c), v(a)))));
    for (const [p, q, r] of [[a, b, c], [b, c, a], [c, a, b]]) {
      const kk = p < q ? `${p},${q}` : `${q},${p}`;
      const e = edges.get(kk);
      if (e) e.push([k / 3, r]); else edges.set(kk, [[k / 3, r]]);
    }
  }
  const max = (maxAngle * Math.PI) / 180;
  // Sharp segments: endpoints, the two faces' normals and in-face directions (into each face), angle.
  const segs = [];
  for (const [kk, fs] of edges) {
    if (fs.length !== 2) continue;
    const [[f1, r1], [f2, r2]] = fs;
    const [i, j] = kk.split(',').map(Number);
    const A = v(i), B = v(j), n1 = normals[f1], n2 = normals[f2];
    if (dot(n1, sub(v(r2), A)) > -1e-9) continue; // concave
    const angle = Math.PI - Math.acos(Math.max(-1, Math.min(1, dot(n1, n2))));
    if (angle >= max) continue;
    const e = norm(sub(B, A));
    let d1 = norm(cross(n1, e)); if (dot(d1, sub(v(r1), A)) < 0) d1 = scale(d1, -1);
    let d2 = norm(cross(n2, e)); if (dot(d2, sub(v(r2), A)) < 0) d2 = scale(d2, -1);
    segs.push({ A, B, ka: key(A), kb: key(B), n1, n2, d1, d2, angle });
  }
  if (!segs.length) return solid.translate([0, 0, 0]);
  // Per vertex: the segments meeting there. Each segment's "side 1" is matched
  // to its neighbour's by face normal, so averages pair like with like.
  const at = new Map();
  for (const s of segs) for (const k of [s.ka, s.kb]) (at.get(k) ?? at.set(k, []).get(k)).push(s);
  const depth = (angle) => Math.min(maxDepth, t / (2 * Math.tan(angle / 2))) * Math.min(1, (max - angle) / ((fade * Math.PI) / 180));
  const vertex = new Map(); // key -> { p, out, s1, s2 } per (vertex, segment) pair, aligned to that segment's sides
  const point = (s, k, p) => {
    const others = (at.get(k) ?? []).filter((o) => o !== s);
    // Average with at most one neighbour (a chain); at branches, use this segment alone.
    const o = others.length === 1 ? others[0] : null;
    let n1 = s.n1, n2 = s.n2, d1 = s.d1, d2 = s.d2, angle = s.angle;
    if (o) {
      const same = dot(s.n1, o.n1) >= dot(s.n1, o.n2);
      const [on1, on2, od1, od2] = same ? [o.n1, o.n2, o.d1, o.d2] : [o.n2, o.n1, o.d2, o.d1];
      n1 = norm(add(n1, on1)); n2 = norm(add(n2, on2)); d1 = norm(add(d1, od1)); d2 = norm(add(d2, od2));
      angle = (angle + o.angle) / 2;
    }
    const r = depth(angle);
    const out = scale(norm(add(n1, n2)), 0.01);
    // Far corners pushed outside their own face (a cutter lying in a face's plane leaves slivers).
    return [add(p, out), add(add(p, d1, r), scale(n1, 0.02)), add(add(p, d2, r), scale(n2, 0.02)), r];
  };
  const cuts = [];
  for (const s of segs) {
    const [a0, a1, a2, ra] = point(s, s.ka, s.A), [b0, b1, b2, rb] = point(s, s.kb, s.B);
    if (ra < 1e-4 && rb < 1e-4) continue;
    // Chain ends (no neighbour): reach a hair past the vertex so the cut is clean.
    const e = norm(sub(s.B, s.A));
    const endA = (at.get(s.ka) ?? []).length === 1 ? scale(e, -0.01) : [0, 0, 0];
    const endB = (at.get(s.kb) ?? []).length === 1 ? scale(e, 0.01) : [0, 0, 0];
    cuts.push(Manifold.hull([add(a0, endA), add(a1, endA), add(a2, endA), add(b0, endB), add(b1, endB), add(b2, endB)]));
  }
  if (!cuts.length) return solid.translate([0, 0, 0]);
  const cut = Manifold.union(cuts);
  for (const c of cuts) c.delete();
  const res = solid.subtract(cut);
  cut.delete();
  return res;
}
