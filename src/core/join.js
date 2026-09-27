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
import { Scope, extrudeCentered } from './manifold.js';
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

/**
 * The full hull H of a composition: every constrained view's whole target
 * (union of its cells' shapes) extruded along its axis, intersected. H
 * contains every solid whose shadows stay inside the targets, so it bounds
 * coverage from above, and material taken from H never adds shadow.
 * Caller owns the result.
 */
export function fullHull(wasm, cells) {
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
      prisms.push(scope.add(scope.add(extrudeCentered(wasm, word, length)).transform(localToWorld(v))));
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
      const box = scope.add(scope.add(Manifold.cube(max.map((x, k) => x - min[k]), false)).translate(min));
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
