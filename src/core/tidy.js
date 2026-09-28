/**
 * Tidying a pair of letters so their features meet cleanly (see
 * resources/research/letterform-tidy.md): feature heights of an outline
 * (level edges, pointed corners), a vertical warp that shifts strokes, and
 * the moves: alignLevels (meet halfway; owner disliked), alignCorners (arm to
 * corner) and tidyPair (the trade-off search that supersedes both).
 * Letters are [{ ch, pts: contours in (u, z) }] as in layoutCells' cells.
 */
import { columnSlivers } from './slivers.js';
import { scanIntervals } from './scan.js';


/**
 * Heights where a chunk's outline runs level: flat edges (at least `minFlat`
 * long) and the tops and bottoms of curves. Where one letter of a pair has
 * such an edge and the other has one *nearly* at the same height, the solid
 * gets a thin sliver between them (e.g. the F's middle arm 0.45 mm above the
 * B's counter).
 */
export function levelHeights(letters, { minFlat = 0.2 } = {}) {
  const zs = [];
  for (const { pts } of letters) for (const ring of pts) levelFlags(ring, minFlat).forEach((f, i) => f && zs.push(ring[i][1]));
  zs.sort((x, y) => x - y);
  return zs.filter((z, i) => i === 0 || z - zs[i - 1] > 1e-3);
}

/** Per vertex of a ring: does the outline run level there (see levelHeights)? */
function levelFlags(ring, minFlat = 0.2) {
  const n = ring.length;
  // Direction of travel in z to the nearest vertex at a different height.
  const step = (i, d) => {
    for (let k = 1; k < n; k++) {
      const dz = ring[(i + d * k + n * k) % n][1] - ring[i][1];
      if (Math.abs(dz) > 1e-6) return Math.sign(dz);
    }
    return 0;
  };
  const flags = new Array(n).fill(false);
  for (let i = 0; i < n; i++) {
    const c = ring[i], q = ring[(i + 1) % n];
    if (Math.abs(c[1] - q[1]) <= 1e-6 && Math.abs(c[0] - q[0]) >= minFlat) flags[i] = flags[(i + 1) % n] = true; // a flat edge
    else if (step(i, -1) !== 0 && step(i, -1) === step(i, 1)) flags[i] = true; // a top or a bottom
  }
  return flags;
}

/** Piecewise-linear remap of heights through sorted knots [[from, to]]. */
export function warpHeights(letters, knots) {
  const map = (z) => {
    if (z <= knots[0][0]) return z + knots[0][1] - knots[0][0];
    for (let k = 1; k < knots.length; k++) {
      const [a0, a1] = knots[k - 1], [b0, b1] = knots[k];
      if (z <= b0) return a1 + ((z - a0) * (b1 - a1)) / (b0 - a0);
    }
    const [l0, l1] = knots[knots.length - 1];
    return z + l1 - l0;
  };
  return letters.map((l) => ({ ...l, pts: l.pts.map((c) => c.map(([u, z]) => [u, map(z)])) }));
}

/**
 * Line up nearly level edges of a pair of chunks: each pair of level heights
 * (one per chunk) closer than `tol` but not equal meets halfway, by a
 * piecewise-linear vertical warp of each chunk that keeps its other level
 * heights where they are. Nearest pairs first; each height is used once, and
 * a pair is skipped if it would squeeze a stroke to under `minGap`.
 * @returns { a, b, moved: [[za, zb, z]] }
 */
export function alignLevels(lettersA, lettersB, { tol = 0.6, minGap = 0.2 } = {}) {
  const A = levelHeights(lettersA), B = levelHeights(lettersB);
  const eq = (x, y) => Math.abs(x - y) <= 1e-3;
  const usedA = new Set(A.filter((a) => B.some((b) => eq(a, b))));
  const usedB = new Set(B.filter((b) => A.some((a) => eq(a, b))));
  const pairs = [];
  for (const a of A) for (const b of B) if (!usedA.has(a) && !usedB.has(b) && Math.abs(a - b) <= tol) pairs.push([a, b]);
  pairs.sort((p, q) => Math.abs(p[0] - p[1]) - Math.abs(q[0] - q[1]));
  const toA = new Map(A.map((z) => [z, z])), toB = new Map(B.map((z) => [z, z]));
  const ok = (m) => [...m.values()].every((z, i, v) => i === 0 || z - v[i - 1] >= Math.min(minGap, [...m.keys()][i] - [...m.keys()][i - 1]));
  const moved = [];
  for (const [a, b] of pairs) {
    if (usedA.has(a) || usedB.has(b)) continue;
    const z = (a + b) / 2;
    toA.set(a, z); toB.set(b, z);
    if (ok(toA) && ok(toB)) { usedA.add(a); usedB.add(b); moved.push([a, b, z]); } else { toA.set(a, a); toB.set(b, b); }
  }
  if (!moved.length) return { a: lettersA, b: lettersB, moved };
  return { a: warpHeights(lettersA, [...toA]), b: warpHeights(lettersB, [...toB]), moved };
}

/**
 * Heights of pointed corners that aren't part of a level edge: e.g. the
 * notch where a B's two bowls meet (but not a counter's corners, or the
 * rounded ends of an arm, which have a level stretch within `reach` along the
 * outline). A corner turns by at least `minTurn` degrees within `sharp` mm
 * either side, which rounded corners (the turn spread over their radius) don't.
 */
export function cornerHeights(letters, { sharp = 0.15, reach = 0.8, minTurn = 50 } = {}) {
  const zs = [];
  for (const { pts } of letters) {
    for (const ring of pts) {
      const n = ring.length;
      const level = levelFlags(ring);
      // Is there a level stretch within `reach` along the outline from vertex i?
      // (The ends of flat edges and rounded corners next to them aren't corners.)
      const nearLevel = (i) => {
        for (const d of [-1, 1]) {
          let k = i, left = reach;
          for (let m = 0; m < n && left >= 0; m++) {
            if (level[k]) return true;
            const j = (k + d + n) % n;
            left -= Math.hypot(ring[j][0] - ring[k][0], ring[j][1] - ring[k][1]);
            k = j;
          }
        }
        return false;
      };
      // The point `reach` along the outline from vertex i, in direction d.
      const along = (i, d, dist) => {
        let k = i, left = dist;
        for (let m = 0; m < n; m++) {
          const j = (k + d + n) % n, seg = Math.hypot(ring[j][0] - ring[k][0], ring[j][1] - ring[k][1]);
          if (seg >= left) { const t = left / seg; return [ring[k][0] + t * (ring[j][0] - ring[k][0]), ring[k][1] + t * (ring[j][1] - ring[k][1])]; }
          left -= seg; k = j;
        }
        return ring[k];
      };
      for (let i = 0; i < n; i++) {
        const c = ring[i], p = along(i, -1, sharp), q = along(i, 1, sharp);
        const a1 = Math.atan2(c[1] - p[1], c[0] - p[0]), a2 = Math.atan2(q[1] - c[1], q[0] - c[0]);
        let turn = Math.abs(a2 - a1) * (180 / Math.PI);
        if (turn > 180) turn = 360 - turn;
        if (turn >= minTurn && !nearLevel(i)) zs.push([c[1], turn]);
      }
    }
  }
  // Points near a corner turn too (within `reach`): keep the sharpest of each cluster.
  zs.sort((x, y) => x[0] - y[0]);
  const out = [];
  for (let i = 0; i < zs.length; ) {
    let j = i, best = zs[i];
    while (j + 1 < zs.length && zs[j + 1][0] - zs[j][0] <= reach) { j++; if (zs[j][1] > best[1]) best = zs[j]; }
    out.push(best[0]);
    i = j + 1;
  }
  return out;
}

/**
 * Move a stroke of one chunk so its edge meets a pointed corner of the other
 * (e.g. lower the F's middle arm until its top meets the B's notch): the band
 * between two level heights that contains the corner shifts up or down,
 * keeping its thickness; the bands either side stretch or shrink. At most one
 * chunk moves per pair (the smallest change), corners are taken from the
 * other chunk as drawn, and the chunk's top and bottom stay put. Pairs of the
 * same letters are left alone.
 * Strain = the move as a fraction of the smaller neighbouring band (how much
 * the gaps either side of the stroke change); moves over `maxStrain` or `tol`
 * mm are skipped.
 * @returns { a, b, moved: [{ side, band: [lo, hi], by, corner, strain }] }
 */
export function alignCorners(lettersA, lettersB, { tol = 3, maxStrain = Infinity } = {}) {
  const out = { a: lettersA, b: lettersB, moved: [] };
  if (lettersA.map((l) => l.ch).join('') === lettersB.map((l) => l.ch).join('')) return out;
  let best = null;
  for (const [side, other] of [['a', 'b'], ['b', 'a']]) {
    const L = levelHeights(out[side]);
    if (L.length < 4) continue;
    for (const zc of cornerHeights(out[other])) {
      const k = L.findIndex((z, i) => i > 0 && L[i - 1] < zc && zc < z);
      if (k < 2 || k > L.length - 2) continue; // the band must not touch the top or bottom
      const [lo, hi] = [L[k - 1], L[k]];
      const below = lo - L[k - 2], above = L[k + 1] - hi;
      for (const by of [zc - hi, zc - lo]) {
        const strain = Math.abs(by) / Math.min(below, above);
        if (Math.abs(by) < 0.01 || Math.abs(by) > tol || strain > maxStrain || strain >= 0.7) continue;
        if (!best || strain < best.strain) best = { side, band: [lo, hi], by, corner: zc, strain };
      }
    }
  }
  if (!best) return out;
  const L = levelHeights(out[best.side]);
  out[best.side] = warpHeights(out[best.side], L.map((z) => [z, z === best.band[0] || z === best.band[1] ? z + best.by : z]));
  out.moved.push(best);
  return out;
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

/**
 * The trade-off search: the one change to a pair that best reduces slivers
 * without distorting the letters much. A change moves one band (a stroke, or
 * a gap between strokes, between two level heights, not touching the top or
 * bottom) of either chunk:
 *   - shift: the whole band moves up to `tol` mm, keeping its height, so one
 *     of its edges meets a feature of the other chunk (a level edge or a
 *     pointed corner, as drawn);
 *   - edges: each edge may instead move on its own to a feature within
 *     `near` mm (a near-miss), so the band gets a little taller or shorter
 *     (this can fix two near-misses at once, e.g. L × A in Bungee);
 *   - clear: as either of the above, but to `t` above or below a feature
 *     instead of onto it. Meeting a feature exactly still leaves a thin
 *     wedge wherever the other letter's edge slopes into it (an A's leg, an
 *     N's slot); clearing it by `t` leaves nothing thinner than `t`.
 * Pairs of the same letters are left alone.
 *   slivers    = knifeScore + cutWeight × cutScore (columnSlivers, mm²: the
 *                thinner a sliver, the more it counts)
 *   distortion = Σ over the band and its two neighbours of weight × |log| of
 *                its change in height, weight = strokeWeight for horizontal
 *                strokes (a band wider in ink than both bands beside it, like
 *                an F's arm), 1 for the rest: strokes keep their thickness
 *   cost       = slivers + lambda × distortion
 * A change is kept only if it lowers the cost and removes at least `minGain`
 * mm² of slivers; no neighbour may change by more than `maxStrain` and the
 * band itself by more than `maxBand`.
 * @returns { a, b, moved: [{ side, band, to, by, target, kind, strain, distortion, before, after }] }
 *   band → to: the band's old and new edges; by: the larger edge move;
 *   before/after: columnSlivers of the pair.
 */
export function tidyPair(lettersA, lettersB, {
  tol = 3, near = 1, maxStrain = 0.3, maxBand = 0.15, strokeWeight = 3, lambda = 3, cutWeight = 0.3,
  minGain = 0.2, t = 0.8, step = 0.1, eps = 0.05,
} = {}) {
  const out = { a: lettersA, b: lettersB, moved: [] };
  if (lettersA.map((l) => l.ch).join('') === lettersB.map((l) => l.ch).join('')) return out;
  const measure = (a, b) => columnSlivers(a, b, { t, step });
  const slivers = (m) => m.knifeScore + cutWeight * m.cutScore;
  const before = measure(lettersA, lettersB);
  let best = null;
  for (const [side, other] of [['a', 'b'], ['b', 'a']]) {
    const L = levelHeights(out[side]);
    if (L.length < 4) continue;
    const features = [
      ...levelHeights(out[other]).map((z) => [z, 'edge']),
      ...cornerHeights(out[other]).map((z) => [z, 'corner']),
    ];
    // Onto a feature, a hair either side of it (where exactly onto it would make
    // faces touch), or clear of it by t.
    const targets = features.flatMap(([z, kind]) => [[z, kind], [z + eps, kind], [z - eps, kind], [z + t, `clear of ${kind}`], [z - t, `clear of ${kind}`]]);
    // Ink width at each band's mid-height; a band wider than both neighbours is a horizontal stroke.
    const polys = out[side].flatMap((l) => l.pts);
    const width = L.slice(1).map((z, i) => scanIntervals(polys, (L[i] + z) / 2).reduce((s, [x0, x1]) => s + x1 - x0, 0));
    const weight = (i) => (i > 0 && i < width.length - 1 && width[i] > width[i - 1] && width[i] > width[i + 1] ? strokeWeight : 1);
    const tried = new Set();
    for (let k = 2; k <= L.length - 2; k++) {
      const [lo, hi] = [L[k - 1], L[k]];
      const below = lo - L[k - 2], above = L[k + 1] - hi, h = hi - lo;
      // Candidate new edges [lo', hi'] with what each meets.
      const cands = [];
      for (const [z, kind] of targets) {
        for (const by of [z - hi, z - lo]) if (Math.abs(by) >= 0.01 && Math.abs(by) <= tol) cands.push([lo + by, hi + by, z, kind]);
      }
      const nearLo = [[lo, null, null], ...targets.filter(([z]) => Math.abs(z - lo) >= 0.01 && Math.abs(z - lo) <= near).map(([z, kind]) => [z, z, kind])];
      const nearHi = [[hi, null, null], ...targets.filter(([z]) => Math.abs(z - hi) >= 0.01 && Math.abs(z - hi) <= near).map(([z, kind]) => [z, z, kind])];
      for (const [l2, zl, kl] of nearLo) for (const [h2, zh, kh] of nearHi) if (zl !== null || zh !== null) cands.push([l2, h2, zl ?? zh, kl ?? kh]);
      for (const [l2, h2, z, kind] of cands) {
        const nb = l2 - L[k - 2], na = L[k + 1] - h2, nh = h2 - l2;
        if (nb <= 0 || na <= 0 || nh <= 0) continue;
        const strain = Math.max(Math.abs(nb - below) / below, Math.abs(na - above) / above);
        if (strain > maxStrain || Math.abs(nh - h) / h > maxBand) continue;
        const key = `${k}:${l2.toFixed(3)}:${h2.toFixed(3)}`;
        if (tried.has(key)) continue;
        tried.add(key);
        const moved = warpHeights(out[side], L.map((x) => [x, x === lo ? l2 : x === hi ? h2 : x]));
        const after = side === 'a' ? measure(moved, lettersB) : measure(lettersA, moved);
        const gain = slivers(before) - slivers(after);
        // Band k-1 (below), k (this one) and k+1 (above), indexed from L[0].
        const distortion = weight(k - 2) * Math.abs(Math.log(nb / below)) + weight(k - 1) * Math.abs(Math.log(nh / h)) + weight(k) * Math.abs(Math.log(na / above));
        const cost = -gain + lambda * distortion;
        if (gain < minGain || cost >= 0) continue;
        if (!best || cost < best.cost) {
          const by = Math.abs(l2 - lo) > Math.abs(h2 - hi) ? l2 - lo : h2 - hi;
          best = { side, band: [lo, hi], to: [l2, h2], by, target: z, kind, strain, distortion, cost, letters: moved, after };
        }
      }
    }
  }
  if (!best) return out;
  out[best.side] = best.letters;
  const { letters, cost, after, ...rest } = best;
  out.moved.push({ ...rest, before, after });
  return out;
}
