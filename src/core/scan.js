/**
 * Scanline helpers on raw polygon contours (plain JS, no WASM): fast
 * approximations used inside searches, verified in 3D on the finalists.
 */

/**
 * Ink intervals of `contours` (nonzero fill) along the horizontal line y.
 * Returns sorted, merged [[x0, x1], ...].
 */
export function scanIntervals(contours, y) {
  const hits = [];
  for (const c of contours) {
    for (let i = 0, n = c.length; i < n; i++) {
      const [x0, y0] = c[i], [x1, y1] = c[(i + 1) % n];
      if ((y0 <= y && y < y1) || (y1 <= y && y < y0)) {
        hits.push([x0 + ((y - y0) / (y1 - y0)) * (x1 - x0), y1 > y0 ? 1 : -1]);
      }
    }
  }
  hits.sort((a, b) => a[0] - b[0]);
  const out = [];
  let wind = 0, start = 0;
  for (const [x, d] of hits) {
    const was = wind;
    wind += d;
    if (was === 0 && wind !== 0) start = x;
    else if (was !== 0 && wind === 0) {
      if (out.length && start <= out[out.length - 1][1]) out[out.length - 1][1] = x;
      else out.push([start, x]);
    }
  }
  return out;
}

/**
 * Connected pieces of a two-view cell: the solid {(x, y, z) : (x, z) in A,
 * (y, z) in B}, where A and B are contours in (horizontal, z) coordinates.
 * Sliced at `levels` heights between z0 and z1: each slice is a set of
 * rectangles (A-interval x B-interval); rectangles in adjacent slices that
 * overlap are joined (union-find). Connections thinner than a slice can be
 * missed, so this can over-count slightly.
 */
export function cellPieces(contoursA, contoursB, z0, z1, levels = 200) {
  const parent = [];
  const find = (i) => { while (parent[i] !== i) i = parent[i] = parent[parent[i]]; return i; };
  const union = (i, j) => { const a = find(i), b = find(j); if (a !== b) parent[a] = b; };
  let prev = [];
  for (let k = 0; k < levels; k++) {
    const z = z0 + ((k + 0.5) / levels) * (z1 - z0);
    const ia = scanIntervals(contoursA, z), ib = scanIntervals(contoursB, z);
    const cur = [];
    for (const xa of ia) {
      for (const yb of ib) {
        const id = parent.length;
        parent.push(id);
        cur.push({ id, xa, yb });
        for (const p of prev) {
          if (p.xa[0] < xa[1] && xa[0] < p.xa[1] && p.yb[0] < yb[1] && yb[0] < p.yb[1]) union(id, p.id);
        }
      }
    }
    prev = cur;
  }
  const roots = new Set();
  for (let i = 0; i < parent.length; i++) roots.add(find(i));
  return roots.size;
}
