/**
 * Joining a composition's pieces into one printable solid.
 *
 * - basePlate: a thin slab under the bottom row, following the cells'
 *   footprints. Its top is raised to the lowest point every bottom-row cell
 *   reaches (plus `embed`, so they overlap rather than just touch). It adds a bar under both words'
 *   shadows.
 * - bridges: join each loose piece to the main body with a thin rod between
 *   their closest points (sampled mesh vertices). Generic: works for any
 *   solid. The rods may add small stray marks to the shadows.
 *
 * Both return a new Manifold (caller owns it); neither consumes its inputs.
 */
import { Scope } from './manifold.js';
import { VIEW_NAMES, worldToLocal } from './views.js';

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
    const plate = scope.add(Manifold.union(slabs));
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

/** Closest pair between two point sets (brute force; inputs are sampled). */
function closestPair(P, Q) {
  let best = [Infinity, null, null];
  for (const p of P) {
    for (const q of Q) {
      const d = (p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2 + (p[2] - q[2]) ** 2;
      if (d < best[0]) best = [d, p, q];
    }
  }
  return best;
}

/** A square rod of half-width r from p to q (overshooting into both ends). */
function rod(wasm, p, q, r) {
  const pts = [];
  for (const c of [p, q]) {
    for (const dx of [-r, r]) for (const dy of [-r, r]) for (const dz of [-r, r]) pts.push([c[0] + dx, c[1] + dy, c[2] + dz]);
  }
  return wasm.Manifold.hull(pts);
}

/**
 * Join all pieces with rods along a minimum spanning tree of closest-point
 * distances (Kruskal), so each rod is as short as possible (joining every
 * piece to the largest one can need long rods). Pieces smaller than
 * `dustFraction` of the volume are dropped instead.
 * @returns { solid, bridges: [{ from, to, length }] }
 */
export function bridgePieces(wasm, solid, { radius = 0.8, dustFraction = 1e-3 } = {}) {
  const { Manifold } = wasm;
  const scope = new Scope();
  try {
    const total = solid.volume();
    const parts = solid.decompose().map((p) => scope.add(p)).filter((p) => p.volume() >= dustFraction * total);
    const pts = parts.map((p) => vertices(p));
    const edges = [];
    for (let i = 0; i < parts.length; i++) {
      for (let j = i + 1; j < parts.length; j++) edges.push([i, j, ...closestPair(pts[i], pts[j])]);
    }
    edges.sort((a, b) => a[2] - b[2]);
    const parent = parts.map((_, i) => i);
    const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
    const bridges = [], rods = [];
    for (const [i, j, d2, p, q] of edges) {
      if (find(i) === find(j)) continue;
      parent[find(i)] = find(j);
      rods.push(scope.add(rod(wasm, p, q, radius)));
      bridges.push({ from: p, to: q, length: Math.sqrt(d2) });
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
export function strayShadow(wasm, lettersSolid, joinedSolid, cells) {
  const scope = new Scope();
  try {
    const out = {};
    for (const v of VIEW_NAMES) {
      const own = cells.map((c) => c.shapes[v]).filter(Boolean);
      if (!own.length) continue;
      const target = scope.add(wasm.CrossSection.union(own));
      const a = scope.add(scope.add(lettersSolid.transform(worldToLocal(v))).project());
      const b = scope.add(scope.add(joinedSolid.transform(worldToLocal(v))).project());
      out[v] = scope.add(b.subtract(a)).area() / target.area();
    }
    return out;
  } finally {
    scope.dispose();
  }
}
