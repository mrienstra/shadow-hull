/**
 * Slivers and shallow cuts in a two-letter cell, where features of the two
 * letters *nearly* line up. Three measures, from exact to cheap:
 *
 * - thinFeatures (voxel.js) on the built solid: thin material (knives,
 *   slivers) and, with `gaps`, thin air (shallow cuts), in any direction.
 * - columnSlivers: the cell is {(x, y, z) : (x, z) in A and (y, z) in B}, so
 *   along each vertical line (x, y) it is the heights where both letters have
 *   ink: A's column at x intersected with B's column at y. A near-miss of two
 *   feature heights leaves a short run of material there (a knife or sliver)
 *   or a short run of air between material (a shallow cut). Summing those
 *   over a grid of lines gives their volumes (mm³) without building anything.
 * - featureNearMisses (tidy.js): only the letters' feature heights; weak
 *   (see the research note), kept for reference.
 *
 * Letters are [{ pts: contours in (u, z) }] as in layoutCells' cell.letters.
 */
import { scanIntervals } from './scan.js';

// Ink intervals in z of `letters` along the vertical line u.
const swap = (letters) => letters.flatMap((l) => l.pts.map((r) => r.map(([u, z]) => [z, u])));
function range(letters) {
  let lo = Infinity, hi = -Infinity;
  for (const l of letters) for (const r of l.pts) for (const [u] of r) { lo = Math.min(lo, u); hi = Math.max(hi, u); }
  return [lo, hi];
}
function columns(letters, step) {
  const polys = swap(letters), [lo, hi] = range(letters);
  const out = [];
  for (let u = lo + step / 2; u < hi; u += step) out.push(scanIntervals(polys, u));
  return out.filter((c) => c.length);
}
// Where one column's ink ends exactly where the other's begins, the solid has
// a zero-thickness sheet there (coincident opposite faces; the boolean leaves
// a stray face, e.g. L × A in Bungee after tidying): kept as a length-0 run.
const TOUCH = 1e-6;
function intersect(a, b) {
  const out = [];
  let i = 0, j = 0;
  while (i < a.length && j < b.length) {
    const lo = Math.max(a[i][0], b[j][0]), hi = Math.min(a[i][1], b[j][1]);
    if (hi > lo + TOUCH) out.push([lo, hi]);
    else if (Math.abs(hi - lo) <= TOUCH) out.push([lo, lo]);
    if (a[i][1] < b[j][1]) i++; else j++;
  }
  return out;
}

/**
 * Vertical runs shorter than `t`: `knife` = material, `cut` = air between
 * material. Volumes (mm³) `knife`, `cut` and `volume` (the whole cell, for
 * scale); and scores (mm²) `knifeScore`, `cutScore`: each thin run's
 * footprint × (1 − length / t), so the thinner a sliver, the more it counts
 * (a volume would reward squashing a sliver thinner, e.g. L × A in Bungee).
 * Faces that exactly touch (zero thickness) count as the thinnest sliver.
 */
export function columnSlivers(lettersA, lettersB, { t = 0.8, step = 0.1 } = {}) {
  const A = columns(lettersA, step), B = columns(lettersB, step);
  let knife = 0, cut = 0, volume = 0, knifeScore = 0, cutScore = 0;
  for (const ca of A) {
    for (const cb of B) {
      const iv = intersect(ca, cb);
      for (let k = 0; k < iv.length; k++) {
        const len = iv[k][1] - iv[k][0];
        volume += len;
        if (len < t) { knife += len; knifeScore += 1 - len / t; }
        if (k > 0) { const gap = iv[k][0] - iv[k - 1][1]; if (gap < t) { cut += gap; cutScore += 1 - gap / t; } }
      }
    }
  }
  const a = step * step;
  return { knife: knife * a, cut: cut * a, volume: volume * a, knifeScore: knifeScore * a, cutScore: cutScore * a };
}

/**
 * The thin runs themselves: [x, y, z0, z1] for every vertical run of material
 * shorter than `t` (knife-thin, with air directly above and below), including
 * zero-length ones where faces only touch. x, y are column centres on a grid
 * of `step` over the letters' own extents (cell coordinates).
 */
export function thinRuns(lettersA, lettersB, { t = 0.3, step = 0.05 } = {}) {
  const [la, ha] = range(lettersA), [lb, hb] = range(lettersB);
  const pa = swap(lettersA), pb = swap(lettersB);
  const colsB = [];
  for (let y = lb + step / 2; y < hb; y += step) colsB.push([y, scanIntervals(pb, y)]);
  const out = [];
  for (let x = la + step / 2; x < ha; x += step) {
    const ca = scanIntervals(pa, x);
    if (!ca.length) continue;
    for (const [y, cb] of colsB) {
      if (!cb.length) continue;
      for (const [z0, z1] of intersect(ca, cb)) if (z1 - z0 < t) out.push([x, y, z0, z1]);
    }
  }
  return out;
}
