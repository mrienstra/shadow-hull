/**
 * Joining a composition's pieces into one printable solid.
 *
 * - basePlate: a thin slab under the bottom row, following the cells'
 *   footprints. Its top is raised to the lowest point every bottom-row cell
 *   reaches (plus `embed`, so they overlap rather than just touch). It adds a bar under both words'
 *   shadows.
 * - bridges: join loose pieces with thin rods, straight (along x, y or z)
 *   and landing on flat faces where possible, else between the closest
 *   points. Generic: works for any solid. The rods may add thin stray lines
 *   to the shadows.
 *
 * Both return a new Manifold (caller owns it); neither consumes its inputs.
 */
import { Scope, extrudeCentered, tagged } from './manifold.js';
import { VIEW_NAMES, localToWorld, worldToLocal } from './views.js';

/** Base plate under the bottom row of `cells`, fitted to `solid`. */
export function basePlate(wasm, solid, cells, { thickness = 1.5, embed = 0.3 } = {}) {
  const { Manifold } = wasm;
  const scope = new Scope();
  try {
    const bottom = Math.min(...cells.map((c) => c.box.min[2]));
    const lowRow = cells.filter((c) => c.box.min[2] === bottom);
    // Lowest point of the solid inside each bottom-row cell; the plate must reach all of them.
    let top = bottom;
    for (const c of lowRow) {
      const size = c.box.max.map((x, i) => x - c.box.min[i]);
      const box = scope.add(scope.add(Manifold.cube(size, false)).translate(c.box.min));
      const part = scope.add(solid.intersect(box));
      if (!part.isEmpty()) top = Math.max(top, part.boundingBox().min[2]);
    }
    // Sink the plate into the letters: faces that merely touch stay separate pieces.
    top += embed;
    const slabs = lowRow.map((c) => {
      const w = c.box.max[0] - c.box.min[0], d = c.box.max[1] - c.box.min[1];
      return scope.add(scope.add(Manifold.cube([w, d, thickness], false)).translate([c.box.min[0], c.box.min[1], top - thickness]));
    });
    const plate = scope.add(tagged(scope.add(Manifold.union(slabs)), 'connector'));
    return Manifold.union(solid, plate);
  } finally {
    scope.dispose();
  }
}

function vertices(m, max = 4000) {
  const mesh = m.getMesh();
  const n = mesh.vertProperties.length / mesh.numProp;
  const step = Math.max(1, Math.floor(n / max));
  const out = [];
  for (let i = 0; i < n; i += step) {
    const k = i * mesh.numProp;
    out.push([mesh.vertProperties[k], mesh.vertProperties[k + 1], mesh.vertProperties[k + 2]]);
  }
  return out;
}

/**
 * Cheapest pair between two point sets (brute force; inputs are sampled).
 * Cost = distance + lowWeight × height above zBase of the higher endpoint
 * + levelWeight × height difference of the endpoints, so positive weights
 * prefer level rods near the baseline (they read like a ligature) over the
 * geometrically closest spot.
 * Returns [cost, p, q, length].
 */
function closestPair(P, Q, lowWeight = 0, zBase = 0, levelWeight = 0) {
  let best = [Infinity, null, null, 0];
  for (const p of P) {
    for (const q of Q) {
      const d = Math.sqrt((p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2 + (p[2] - q[2]) ** 2);
      const cost = d + lowWeight * (Math.max(p[2], q[2]) - zBase) + levelWeight * Math.abs(p[2] - q[2]);
      if (cost < best[0]) best = [cost, p, q, d];
    }
  }
  return best;
}

/**
 * A round rod (12-sided) of radius r from p to q, extended `overshoot` past
 * both ends so it sinks into the pieces it joins.
 */
function rod(wasm, p, q, r, overshoot = r) {
  const d = q.map((x, i) => x - p[i]);
  const len = Math.hypot(...d) || 1;
  const u = d.map((x) => x / len);
  // Two unit vectors perpendicular to u.
  const a = Math.abs(u[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
  const cross = (x, y) => [x[1] * y[2] - x[2] * y[1], x[2] * y[0] - x[0] * y[2], x[0] * y[1] - x[1] * y[0]];
  const norm = (x) => { const l = Math.hypot(...x); return x.map((c) => c / l); };
  const e1 = norm(cross(u, a)), e2 = cross(u, e1);
  const pts = [];
  for (const [c, s] of [[p, -overshoot], [q, overshoot]]) {
    for (let k = 0; k < 12; k++) {
      const t = (k / 12) * 2 * Math.PI, cs = Math.cos(t) * r, sn = Math.sin(t) * r;
      pts.push([0, 1, 2].map((i) => c[i] + u[i] * s + e1[i] * cs + e2[i] * sn));
    }
  }
  return wasm.Manifold.hull(pts);
}

/** Triangles of each piece as flat arrays (for ray casting). */
function triangles(m) {
  const { vertProperties: vp, triVerts: tv, numProp } = m.getMesh();
  const out = new Float64Array(tv.length * 3);
  for (let i = 0; i < tv.length; i++) for (let c = 0; c < 3; c++) out[i * 3 + c] = vp[tv[i] * numProp + c];
  return out;
}

/**
 * Straight rods along one axis between pieces i and j. Rays along `axis` on a
 * grid over where both pieces' bounding boxes overlap (across the axis); a
 * rod runs between consecutive hits of i and j (so only empty space lies
 * between). A rod counts only if its whole end, plus a margin, lands on a
 * nearly flat face of both pieces (rays on rings around it hit within
 * `slope` × ring radius of its ends, about 20°): so rods stand clear of
 * rounded corners and edges. Among the shortest, the one with the most such
 * room around it wins.
 * @returns { p, q, length, clearance } or null
 */
function straightRod(tris, boxes, i, j, axis, r, { margin = 0.4, slope = 0.35, grid = 20 } = {}) {
  const [a, b] = [0, 1, 2].filter((k) => k !== axis);
  const R = r + margin;
  const lo = [Math.max(boxes[i].min[a], boxes[j].min[a]) + R, Math.max(boxes[i].min[b], boxes[j].min[b]) + R];
  const hi = [Math.min(boxes[i].max[a], boxes[j].max[a]) - R, Math.min(boxes[i].max[b], boxes[j].max[b]) - R];
  if (!(lo[0] < hi[0] && lo[1] < hi[1])) return null;
  // Bucket every piece's triangles that reach the region (grown by 4R for clearance tests).
  const g = 4 * R, B = grid;
  const bl = [lo[0] - g, lo[1] - g], bs = [(hi[0] - lo[0] + 2 * g) / B, (hi[1] - lo[1] + 2 * g) / B];
  const buckets = Array.from({ length: B * B }, () => []);
  tris.forEach((t, piece) => {
    for (let k = 0; k < t.length; k += 9) {
      let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
      for (let c = 0; c < 9; c += 3) {
        u0 = Math.min(u0, t[k + c + a]); u1 = Math.max(u1, t[k + c + a]);
        v0 = Math.min(v0, t[k + c + b]); v1 = Math.max(v1, t[k + c + b]);
      }
      const x0 = Math.max(0, Math.floor((u0 - bl[0]) / bs[0])), x1 = Math.min(B - 1, Math.floor((u1 - bl[0]) / bs[0]));
      const y0 = Math.max(0, Math.floor((v0 - bl[1]) / bs[1])), y1 = Math.min(B - 1, Math.floor((v1 - bl[1]) / bs[1]));
      for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) buckets[x * B + y].push(piece, k);
    }
  });
  // The gap between i and j along the ray at (u, v): [start, end] or null.
  const gap = (u, v) => {
    const x = Math.floor((u - bl[0]) / bs[0]), y = Math.floor((v - bl[1]) / bs[1]);
    if (x < 0 || y < 0 || x >= B || y >= B) return null;
    const hits = [];
    const bk = buckets[x * B + y];
    for (let n = 0; n < bk.length; n += 2) {
      const t = tris[bk[n]], k = bk[n + 1];
      const [ua, va, ub, vb, uc, vc] = [t[k + a], t[k + b], t[k + 3 + a], t[k + 3 + b], t[k + 6 + a], t[k + 6 + b]];
      const det = (vb - vc) * (ua - uc) + (uc - ub) * (va - vc);
      if (Math.abs(det) < 1e-12) continue;
      const l1 = ((vb - vc) * (u - uc) + (uc - ub) * (v - vc)) / det;
      const l2 = ((vc - va) * (u - uc) + (ua - uc) * (v - vc)) / det;
      const l3 = 1 - l1 - l2;
      if (l1 < -1e-9 || l2 < -1e-9 || l3 < -1e-9) continue;
      hits.push([l1 * t[k + axis] + l2 * t[k + 3 + axis] + l3 * t[k + 6 + axis], bk[n]]);
    }
    hits.sort((h, k) => h[0] - k[0]);
    let best = null;
    for (let n = 0; n + 1 < hits.length; n++) {
      const [s, pa] = hits[n], [e, pb] = hits[n + 1];
      if ((pa === i && pb === j) || (pa === j && pb === i)) {
        if (!best || e - s < best[1] - best[0]) best = [s, e, pa === i];
      }
    }
    return best;
  };
  // Nearly flat around (u, v) out to radius rr: rays on a ring meet the same gap ends.
  const flat = (u, v, c, rr) => {
    const tol = slope * rr;
    for (let k = 0; k < 12; k++) {
      const t = (k / 12) * 2 * Math.PI;
      const h = gap(u + rr * Math.cos(t), v + rr * Math.sin(t));
      if (!h || Math.abs(h[0] - c[0]) > tol || Math.abs(h[1] - c[1]) > tol) return false;
    }
    return true;
  };
  const N = 16, cands = [];
  for (let x = 0; x <= N; x++) {
    for (let y = 0; y <= N; y++) {
      const u = lo[0] + ((hi[0] - lo[0]) * x) / N, v = lo[1] + ((hi[1] - lo[1]) * y) / N;
      const c = gap(u, v);
      if (c) cands.push({ u, v, c, length: c[1] - c[0] });
    }
  }
  cands.sort((p, q) => p.length - q.length);
  const good = [];
  for (const cd of cands.slice(0, 80)) {
    if (good.length && cd.length > good[0].length + 0.05) break;
    if (!flat(cd.u, cd.v, cd.c, R) || !flat(cd.u, cd.v, cd.c, R / 2)) continue;
    // Room to spare: how far the flat area extends beyond the margin.
    let clearance = 1;
    for (const f of [1.5, 2, 3, 4]) { if (flat(cd.u, cd.v, cd.c, R * f)) clearance = f; else break; }
    good.push({ ...cd, clearance });
  }
  if (!good.length) return null;
  // Most room; among equals, the one nearest their middle (not the first found).
  const most = Math.max(...good.map((g) => g.clearance));
  const tied = good.filter((g) => g.clearance === most);
  const mu = tied.reduce((m, g) => m + g.u, 0) / tied.length, mv = tied.reduce((m, g) => m + g.v, 0) / tied.length;
  const found = tied.reduce((x, g) => (Math.hypot(g.u - mu, g.v - mv) < Math.hypot(x.u - mu, x.v - mv) ? g : x));
  const at = (w) => { const pt = [0, 0, 0]; pt[a] = found.u; pt[b] = found.v; pt[axis] = w; return pt; };
  const [pi, pj] = found.c[2] ? [at(found.c[0]), at(found.c[1])] : [at(found.c[1]), at(found.c[0])];
  return { p: pi, q: pj, length: found.length, clearance: found.clearance, straight: true };
}

/**
 * Join all pieces with thin rods along a minimum spanning tree (Kruskal), so
 * each rod is as short as possible. Rods are straight (along x, y or z) and
 * land on flat faces clear of rounded corners wherever possible; a diagonal
 * rod between the closest points is the fallback (costed as `diagonalCost` ×
 * its length + 2 mm, so a somewhat longer straight rod is preferred).
 * `lowWeight` / `levelWeight` bias rods towards the bottom / towards level
 * (see closestPair). Pieces smaller than `dustFraction` of the volume are
 * dropped instead. Rods are thin (default 0.6 mm across): placeholders for,
 * say, clear acrylic rod or fishing line, which barely shadow.
 * @returns { solid, bridges: [{ from, to, length, straight }] }
 */
export function bridgePieces(wasm, solid, { radius = 0.3, dustFraction = 1e-3, lowWeight = 0, levelWeight = 0, maxPoints = 1500, diagonalCost = 1.5 } = {}) {
  const { Manifold } = wasm;
  const scope = new Scope();
  try {
    const total = solid.volume();
    const parts = solid.decompose().map((p) => scope.add(p)).filter((p) => p.volume() >= dustFraction * total);
    if (parts.length < 2) return { solid: Manifold.union(parts), bridges: [] };
    const pts = parts.map((p) => vertices(p, maxPoints));
    const tris = parts.map(triangles);
    const boxes = parts.map((p) => p.boundingBox());
    const zBase = solid.boundingBox().min[2];
    const bias = (p, q) => lowWeight * (Math.max(p[2], q[2]) - zBase) + levelWeight * Math.abs(p[2] - q[2]);
    // Cheap bound first (closest sampled points), the straight-rod search only
    // for pairs Kruskal actually reaches (lazy: re-queue with the true cost).
    const queue = [];
    for (let i = 0; i < parts.length; i++) {
      for (let j = i + 1; j < parts.length; j++) {
        const [cost, p, q, d] = closestPair(pts[i], pts[j], lowWeight, zBase, levelWeight);
        queue.push({ i, j, cost, diag: { p, q, length: d, cost: diagonalCost * cost + 2 }, exact: false });
      }
    }
    const parent = parts.map((_, i) => i);
    const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
    const bridges = [], rods = [];
    while (queue.length) {
      queue.sort((x, y) => x.cost - y.cost);
      const e = queue.shift();
      if (find(e.i) === find(e.j)) continue;
      if (!e.exact) {
        let best = { ...e.diag, straight: false };
        for (const axis of [2, 0, 1]) {
          const s = straightRod(tris, boxes, e.i, e.j, axis, radius);
          if (s && s.length + bias(s.p, s.q) < best.cost) best = { ...s, cost: s.length + bias(s.p, s.q) };
        }
        queue.push({ ...e, cost: best.cost, best, exact: true });
        continue;
      }
      parent[find(e.i)] = find(e.j);
      const { p, q, length, straight } = e.best;
      // Straight rods land on nearly flat faces: sink them past any slope. Diagonal
      // ones end at corners: sink them further.
      rods.push(scope.add(tagged(scope.add(rod(wasm, p, q, radius, straight ? 0.6 : 2 * radius)), 'connector')));
      bridges.push({ from: p, to: q, length, straight });
    }
    return { solid: Manifold.union([...parts, ...rods]), bridges };
  } finally {
    scope.dispose();
  }
}

/**
 * Extra shadow a joined solid casts beyond the letters-only solid, per
 * constrained view, as a fraction of that view's target area.
 */
export function strayShadow(wasm, lettersSolid, joinedSolid, cells, { frames } = {}) {
  const scope = new Scope();
  try {
    const out = {};
    for (const v of VIEW_NAMES) {
      const own = cells.map((c) => c.shapes[v]).filter(Boolean);
      if (!own.length) continue;
      const target = scope.add(wasm.CrossSection.union(own));
      const a = scope.add(scope.add(lettersSolid.transform(worldToLocal(v, frames))).project());
      const b = scope.add(scope.add(joinedSolid.transform(worldToLocal(v, frames))).project());
      out[v] = scope.add(b.subtract(a)).area() / target.area();
    }
    return out;
  } finally {
    scope.dispose();
  }
}

/**
 * The full hull H of a composition: every constrained view's whole target
 * (union of its cells' shapes) extruded along its axis, intersected. H
 * contains every solid whose shadows stay inside the targets, so it bounds
 * coverage from above, and material taken from H never adds shadow.
 * Caller owns the result.
 */
export function fullHull(wasm, cells, { frames } = {}) {
  const { Manifold, CrossSection } = wasm;
  const scope = new Scope();
  try {
    let extent = 0;
    for (const { box } of cells) for (const v of [...box.min, ...box.max]) extent = Math.max(extent, Math.abs(v));
    const length = 4 * extent + 1;
    const prisms = [];
    for (const v of VIEW_NAMES) {
      const own = cells.map((c) => c.shapes[v]).filter(Boolean);
      if (!own.length) continue;
      const word = scope.add(CrossSection.union(own));
      prisms.push(scope.add(scope.add(tagged(scope.add(extrudeCentered(wasm, word, length)), v)).transform(localToWorld(v, frames))));
    }
    return Manifold.intersection(prisms);
  } finally {
    scope.dispose();
  }
}

const significant = (m, dustFraction = 1e-3) => {
  const parts = m.decompose();
  const total = m.volume();
  const n = parts.filter((p) => p.volume() >= dustFraction * total).length;
  for (const p of parts) p.delete();
  return n;
};

/**
 * Join pieces with zero extra shadow by adding "off-diagonal" blocks of the
 * full hull: H inside the box spanned by cell i's x-range, cell j's y-range
 * and both cells' z-ranges. Blocks are tried nearest-first and
 * kept only if they reduce the piece count. Pieces in different components
 * of H can't be joined invisibly; bridge those afterwards.
 * @returns { solid, blocks: [{ i, j, volume }], pieces }
 */
export function hullJoin(wasm, solid, cells, { dustFraction = 1e-3 } = {}) {
  const { Manifold } = wasm;
  const scope = new Scope();
  try {
    const H = scope.add(fullHull(wasm, cells));
    let current = solid, pieces = significant(solid, dustFraction);
    const blocks = [];
    const candidates = [];
    // Block (i, j): x-range of cell i, y-range of cell j, spanning both cells'
    // z-ranges (so blocks can also join stacked rows). Nearest first.
    cells.forEach((a, i) => cells.forEach((b, j) => {
      if (i === j) return;
      const rows = a.box.min[2] === b.box.min[2] ? 0 : 1;
      candidates.push({ i, j, dist: Math.abs(i - j) + 10 * rows });
    }));
    candidates.sort((p, q) => p.dist - q.dist);
    for (const c of candidates) {
      if (pieces <= 1) break;
      const a = cells[c.i].box, b = cells[c.j].box;
      const min = [a.min[0], b.min[1], Math.min(a.min[2], b.min[2])];
      const max = [a.max[0], b.max[1], Math.max(a.max[2], b.max[2])];
      // The block's cut faces are connector faces (it's material added to join pieces).
      const box = scope.add(tagged(scope.add(scope.add(Manifold.cube(max.map((x, k) => x - min[k]), false)).translate(min)), 'connector'));
      const block = scope.add(H.intersect(box));
      if (block.isEmpty()) continue;
      const next = Manifold.union(current, block);
      const n = significant(next, dustFraction);
      if (n < pieces) {
        if (current !== solid) current.delete();
        current = next;
        pieces = n;
        blocks.push({ i: c.i, j: c.j, volume: block.volume() });
      } else {
        next.delete();
      }
    }
    return { solid: current === solid ? Manifold.union([solid]) : current, blocks, pieces };
  } finally {
    scope.dispose();
  }
}

/**
 * A display stand: a rounded base under the whole design, from the convex
 * hull of its footprint (seen from above) padded with round corners — reads
 * as a finished object, unlike basePlate's staircase of cell footprints.
 * Its top sits at the lowest point every bottom-row cell reaches (plus
 * `embed`, so they fuse rather than touch), like basePlate.
 */
export function displayStand(wasm, solid, cells, { height = 2, pad = 3, embed = 0.3 } = {}) {
  const { Manifold } = wasm;
  const scope = new Scope();
  try {
    const bottom = Math.min(...cells.map((c) => c.box.min[2]));
    const lowRow = cells.filter((c) => Math.abs(c.box.min[2] - bottom) < 1e-9);
    let top = bottom;
    for (const c of lowRow) {
      const size = c.box.max.map((x, i) => x - c.box.min[i]);
      const box = scope.add(scope.add(Manifold.cube(size, false)).translate(c.box.min));
      const part = scope.add(solid.intersect(box));
      if (!part.isEmpty()) top = Math.max(top, part.boundingBox().min[2]);
    }
    top += embed;
    const footprint = scope.add(solid.project());
    const outline = scope.add(scope.add(footprint.hull()).offset(pad, 'Round', 2, 64));
    const slab = scope.add(tagged(scope.add(scope.add(extrudeCentered(wasm, outline, height)).translate([0, 0, top - height / 2])), 'connector'));
    return Manifold.union(solid, slab);
  } finally {
    scope.dispose();
  }
}
