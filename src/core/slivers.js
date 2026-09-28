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
 * - featureNearMisses: only the letters' feature heights (level edges and
 *   pointed corners, see wordpair.js): pairs closer than `t` but not equal.
 *   Needs no outlines at all once heights are known (for font search).
 *
 * Letters are [{ pts: contours in (u, z) }] as in layoutCells' cell.letters.
 */
import { scanIntervals } from './scan.js';
import { levelHeights, cornerHeights } from './wordpair.js';

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
function intersect(a, b) {
  const out = [];
  let i = 0, j = 0;
  while (i < a.length && j < b.length) {
    const lo = Math.max(a[i][0], b[j][0]), hi = Math.min(a[i][1], b[j][1]);
    if (hi > lo) out.push([lo, hi]);
    if (a[i][1] < b[j][1]) i++; else j++;
  }
  return out;
}

/**
 * Volumes (mm³) of vertical runs shorter than `t`: `knife` = material,
 * `cut` = air between material; `volume` = the whole cell, for scale.
 */
export function columnSlivers(lettersA, lettersB, { t = 0.8, step = 0.1 } = {}) {
  const A = columns(lettersA, step), B = columns(lettersB, step);
  let knife = 0, cut = 0, volume = 0;
  for (const ca of A) {
    for (const cb of B) {
      const iv = intersect(ca, cb);
      for (let k = 0; k < iv.length; k++) {
        const len = iv[k][1] - iv[k][0];
        volume += len;
        if (len < t) knife += len;
        if (k > 0) { const gap = iv[k][0] - iv[k - 1][1]; if (gap < t) cut += gap; }
      }
    }
  }
  const a = step * step;
  return { knife: knife * a, cut: cut * a, volume: volume * a };
}

/**
 * Near-misses between the two letters' feature heights: pairs closer than `t`
 * but not within `eps` (already lined up). `weight` sums (t - d) / t, so the
 * closest misses count most; `distinct` = how many different feature heights
 * the pair has in all (fewer = a simpler, cleaner solid).
 */
export function featureNearMisses(lettersA, lettersB, { t = 0.8, eps = 1e-3 } = {}) {
  const feats = (ls) => [...levelHeights(ls), ...cornerHeights(ls)];
  const A = feats(lettersA), B = feats(lettersB);
  let count = 0, weight = 0;
  for (const a of A) for (const b of B) {
    const d = Math.abs(a - b);
    if (d > eps && d < t) { count++; weight += (t - d) / t; }
  }
  const all = [...A, ...B].sort((x, y) => x - y);
  const distinct = all.filter((z, i) => i === 0 || z - all[i - 1] > eps).length;
  return { count, weight, distinct };
}
