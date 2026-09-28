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
export function levelHeights(letters, { minFlat = 0.2, flatOnly = false } = {}) {
  const zs = [];
  for (const { pts } of letters) for (const ring of pts) levelFlags(ring, minFlat, flatOnly).forEach((f, i) => f && zs.push(ring[i][1]));
  zs.sort((x, y) => x - y);
  return zs.filter((z, i) => i === 0 || z - zs[i - 1] > 1e-3);
}

/** Per vertex of a ring: does the outline run level there (see levelHeights)? */
function levelFlags(ring, minFlat = 0.2, flatOnly = false) {
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
    else if (!flatOnly && step(i, -1) !== 0 && step(i, -1) === step(i, 1)) flags[i] = true; // a top or a bottom
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
 * `trace` (an array) collects each round's best candidates with their cost parts.
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
 * `trace` (an array) collects each round's best candidates with their cost parts.
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
 * The trade-off search: a few small changes to a pair that best reduce
 * slivers without distorting the letters much. The letters' level heights
 * (see levelHeights) are the knobs: each change moves some of them, and each
 * letter is warped from its original outline through all its moved levels.
 * A change is one of:
 *   - level: one level of either letter moves onto a feature of the other
 *     (a level edge or a pointed corner), a hair beside it (`eps`: exactly
 *     onto it can make opposite faces touch), or clear of it by `t`;
 *   - shift: a band (two neighbouring levels) moves by the same amount, up to
 *     `tol` mm, so one of its edges does that (keeps the band's height);
 *   - middle: a level of each letter, less than `near` apart, both move to
 *     halfway (the two letters meet in the middle).
 * The top and bottom levels never move. Pairs of the same letters are left
 * alone. Up to `maxMoves` changes are made, best first, each only if it lowers
 * the cost by at least `minGain`:
 *   cost = slivers + lambda × distortion + mu × heights + guides + clear
 *   slivers    = knifeScore + cutWeight × cutScore (columnSlivers, mm²: the
 *                thinner a sliver, the more it counts; touching faces most)
 *   distortion = Σ over each letter's bands of weight × |log(new / old
 *                height)|; weight = strokeWeight for horizontal strokes (a
 *                band wider in ink than both bands beside it, like an F's arm
 *                or an A's crossbar), 1 for gaps and the rest
 *   heights    = distinct feature heights of the pair (within `merge` mm):
 *                lining edges up (a sliver vanishes) beats clearing them (a
 *                sliver thickens), and makes a simpler solid
 *   clear      = clearCost per "clear of" move (the fallback)
 *   guides     = guideWeight × mm moved, for levels on one of the font's
 *                shared lines (`guides` = { a, b }: heights in each letter's
 *                coordinates, see fontGuides): the odd letter out moves (in
 *                Bungee the A's crossbar, not the C, D, I, J or L at ~6.8 mm)
 * Bands may change height by at most `maxStrain` (gaps) or `maxBand`
 * (strokes).
 * `trace` (an array) collects each round's best candidates with their cost parts.
 * @returns { a, b, moved: [{ kind, side, levels: [[side, from, to]], target, targetKind }],
 *   knots: { a: [[from, to]], b }, before, after }  (heights in the letters' coordinates)
 */
export function tidyPair(lettersA, lettersB, {
  tol = 3, near = 1, maxStrain = 0.3, maxBand = 0.2, strokeWeight = 2, lambda = 3, mu = 1,
  cutWeight = 0.3, minGain = 0.2, t = 0.8, step = 0.05, eps = 0.01, merge = 0.06, maxMoves = 3, trace = null,
  guides = null, guideWeight = 3, guideTol = 0.25, clearCost = 2, touch = 1,
} = {}) {
  const orig = { a: lettersA, b: lettersB };
  const out = { a: lettersA, b: lettersB, moved: [], knots: { a: [], b: [] } };
  if (lettersA.map((l) => l.ch).join('') === lettersB.map((l) => l.ch).join('')) return out;
  const O = { a: levelHeights(lettersA), b: levelHeights(lettersB) };
  // Stroke weights per band, from the original outlines.
  const weights = {};
  for (const s of ['a', 'b']) {
    const L = O[s], polys = orig[s].flatMap((l) => l.pts);
    const width = L.slice(1).map((z, i) => scanIntervals(polys, (L[i] + z) / 2).reduce((sum, [x0, x1]) => sum + x1 - x0, 0));
    // A stroke is wider than each band beside it (end bands have one neighbour, e.g. an I's serifs).
    weights[s] = width.map((w, i) => ((i === 0 || w > width[i - 1]) && (i === width.length - 1 || w > width[i + 1]) && width.length > 1 ? strokeWeight : 1));
  }
  const warped = (s, C) => (C.every((z, i) => z === O[s][i]) ? orig[s] : warpHeights(orig[s], O[s].map((z, i) => [z, C[i]])));
  const valid = (s, C) => C.every((z, i) => i === 0 || (z > C[i - 1] + 0.05 && Math.abs((z - C[i - 1]) / (O[s][i] - O[s][i - 1]) - 1)
    <= (weights[s][i - 1] > 1 ? maxBand : maxStrain)));
  const distortion = (C) => ['a', 'b'].reduce((sum, s) => sum + C[s].slice(1).reduce((d, z, i) =>
    d + weights[s][i] * Math.abs(Math.log((z - C[s][i]) / (O[s][i + 1] - O[s][i]))), 0), 0);
  // Levels on one of the font's shared lines (guides: heights where many of
  // its capitals have an edge) are costly to move: guideWeight per mm.
  const onGuide = { a: O.a.map((z) => (guides?.a ?? []).some((g) => Math.abs(g - z) <= guideTol)), b: O.b.map((z) => (guides?.b ?? []).some((g) => Math.abs(g - z) <= guideTol)) };
  const offGuide = (C) => ['a', 'b'].reduce((sum, s) => sum + C[s].reduce((d, z, i) => d + (onGuide[s][i] ? Math.abs(z - O[s][i]) : 0), 0), 0);
  const heights = (lets) => {
    const all = [...levelHeights(lets.a), ...levelHeights(lets.b), ...cornerHeights(lets.a), ...cornerHeights(lets.b)].sort((x, y) => x - y);
    return all.filter((z, i) => i === 0 || z - all[i - 1] > merge).length;
  };
  const evaluate = (C, st) => {
    const lets = { a: warped('a', C.a), b: warped('b', C.b) };
    const m = columnSlivers(lets.a, lets.b, { t, step: st, touch });
    const parts = { slivers: m.knifeScore + cutWeight * m.cutScore, distortion: lambda * distortion(C), heights: mu * heights(lets), guides: guideWeight * offGuide(C) };
    return { lets, m, parts, cost: parts.slivers + parts.distortion + parts.heights + parts.guides };
  };
  let C = { a: [...O.a], b: [...O.b] };
  let cur = evaluate(C, step);
  cur.extra = 0;
  const before = cur.m;
  for (let round = 0; round < maxMoves; round++) {
    const cands = [];
    for (const [s, o] of [['a', 'b'], ['b', 'a']]) {
      const L = C[s], n = L.length;
      if (n < 3) continue;
      const other = warped(o, C[o]);
      const feats = [...levelHeights(other).map((z) => [z, 'edge']), ...cornerHeights(other).map((z) => [z, 'corner'])];
      const targets = feats.flatMap(([z, k]) => [[z, k], [z + eps, k], [z - eps, k], [z + t, `clear of ${k}`], [z - t, `clear of ${k}`]]);
      for (let i = 1; i < n - 1; i++) {
        for (const [z, k] of targets) {
          if (Math.abs(z - L[i]) >= 0.01 && Math.abs(z - L[i]) <= near + t) {
            const N = [...L]; N[i] = z;
            cands.push({ C: { ...C, [s]: N }, kind: 'level', side: s, levels: [[s, L[i], z]], target: z, targetKind: k });
          }
          if (i < n - 2) for (const j of [i, i + 1]) {
            const by = z - L[j];
            if (Math.abs(by) < 0.01 || Math.abs(by) > tol) continue;
            const N = [...L]; N[i] += by; N[i + 1] += by;
            cands.push({ C: { ...C, [s]: N }, kind: 'shift', side: s, levels: [[s, L[i], N[i]], [s, L[i + 1], N[i + 1]]], target: z, targetKind: k });
          }
        }
      }
      if (s === 'a') {
        for (let i = 1; i < n - 1; i++) for (let j = 1; j < C.b.length - 1; j++) {
          const d = Math.abs(L[i] - C.b[j]);
          if (d < 0.01 || d > near) continue;
          const mid = (L[i] + C.b[j]) / 2, NA = [...L], NB = [...C.b];
          NA[i] = mid; NB[j] = mid;
          cands.push({ C: { a: NA, b: NB }, kind: 'middle', side: 'both', levels: [['a', L[i], mid], ['b', C.b[j], mid]], target: mid, targetKind: 'edge' });
        }
      }
    }
    // Screen on a coarse grid (0.2 mm), then measure the most promising finely
    // (0.05 mm: hairline sheets along rounded corners can be under 0.1 mm wide).
    const seen = new Set();
    const screened = [];
    for (const c of cands) {
      if (!valid('a', c.C.a) || !valid('b', c.C.b)) continue;
      const key = [...c.C.a, ...c.C.b].map((z) => z.toFixed(3)).join();
      if (seen.has(key)) continue;
      seen.add(key);
      screened.push({ ...c, coarse: evaluate(c.C, 4 * step).cost });
    }
    screened.sort((x, y) => x.coarse - y.coarse);
    let best = null;
    if (trace) trace.push({ round, current: cur.parts, candidates: screened.slice(0, 12).map((c) => ({ kind: c.kind, levels: c.levels, targetKind: c.targetKind, ...evaluate(c.C, step).parts })) });
    // Clearing a feature (thickening the thin part) is the fallback: lining up
    // (the thin part vanishes) is preferred, so a clear move costs `clearCost`.
    const extra = (c) => (String(c.targetKind).startsWith('clear') ? clearCost : 0);
    screened.sort((x, y) => x.coarse + extra(x) - (y.coarse + extra(y)));
    for (const c of screened.slice(0, 6)) {
      const e = evaluate(c.C, step);
      e.cost += extra(c) + cur.extra;
      e.extra = extra(c) + cur.extra;
      if (!best || e.cost < best.e.cost) best = { c, e };
    }
    if (!best || best.e.cost > cur.cost - minGain) break;
    const { C: _C, coarse, ...move } = best.c;
    out.moved.push(move);
    C = best.c.C; cur = best.e;
  }
  if (!out.moved.length) return out;
  out.a = cur.lets.a; out.b = cur.lets.b;
  for (const s of ['a', 'b']) out.knots[s] = O[s].map((z, i) => [z, C[s][i]]).filter(([z, w]) => z !== w);
  out.before = before; out.after = cur.m;
  return out;
}

/**
 * A font's shared lines: heights (font units, y up) where at least `minLetters`
 * of its capitals have a flat edge (within `tol` em), e.g. a common bar
 * height (Bungee: C D E G I L S Z at 6.76–6.81 mm of 20). Only flat edges:
 * the tops and bottoms of curves (O, U, J…) scatter and would chain into
 * false lines. The baseline and cap height are included when shared; tidyPair
 * never moves a letter's top or bottom anyway. Cached per font.
 */
const guideCache = new WeakMap();
export function fontGuides(font, glyphContours, { minLetters = 4, tol = 0.006 } = {}) {
  if (guideCache.has(font)) return guideCache.get(font);
  const em = font.unitsPerEm, hs = [];
  for (const ch of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ') {
    const own = levelHeights([{ ch, pts: glyphContours(ch) }], { minFlat: 0.02 * em, flatOnly: true });
    const merged = own.filter((z, i) => i === 0 || z - own[i - 1] > tol * em);
    for (const z of merged) hs.push(z);
  }
  hs.sort((x, y) => x - y);
  const out = [];
  for (let i = 0; i < hs.length; ) {
    let j = i;
    while (j + 1 < hs.length && hs[j + 1] - hs[i] <= tol * em) j++;
    if (j - i + 1 >= minLetters) out.push(hs.slice(i, j + 1).reduce((a, b) => a + b, 0) / (j - i + 1));
    i = j + 1;
  }
  guideCache.set(font, out);
  return out;
}
