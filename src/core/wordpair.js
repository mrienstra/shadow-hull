/**
 * Word pairs: two words read from two sides (front and right) of one solid.
 *
 * Key fact: the two views share only the vertical axis. In a cell pairing
 * chunk a (front) with chunk b (right), a's ink at height z shows only if b
 * has ink somewhere at z, and vice versa. Each connected blob of ink covers
 * one interval of heights, so a chunk's "vertical profile" is the union of its
 * blobs' height ranges, and a cell's coverage is exact 2D arithmetic (no 3D
 * booleans). That makes cells cheap to score and independent of each other,
 * so the best way to cut both words into paired chunks is a dynamic program
 * over positions (like sequence alignment), keeping a Pareto front of
 * trade-offs per state.
 *
 * Layout: each word is split into lines (rows, top to bottom), each line into
 * chunks (a letter or a few); chunk i of A's line pairs with chunk i of B's
 * line. Cells in a row form a diagonal chain: A along +X, B along +Y, with
 * `gap` between (negative = overlap, which also helps join the cells).
 * The top view is unconstrained.
 */
import { glyphRun, kissOffset } from './glyph.js';
import { cellPieces } from './scan.js';
import { buildComposition, measureComposition, disposeCells } from './compose.js';
import { alignLevels, alignCorners, tidyPair } from './tidy.js';
// Letter features and tidying live in tidy.js; re-exported for existing callers.
export { levelHeights, cornerHeights, alignLevels, alignCorners, tidyPair } from './tidy.js';

const inkCache = new WeakMap();

/**
 * Outline (whole and per glyph) and ink bounds of `text` in font units (y up).
 * `txt` = { tolerance, tracking, kiss } (see glyphRun).
 */
export function ink(font, text, txt = {}) {
  let byText = inkCache.get(font);
  if (!byText) inkCache.set(font, (byText = new Map()));
  const key = `${text}\u0000${txt.tolerance}\u0000${txt.tracking ?? 0}\u0000${txt.kiss ?? ''}`;
  if (!byText.has(key)) {
    const glyphs = glyphRun(font, text, txt);
    const contours = glyphs.flatMap((g) => g.contours);
    const pts = contours.flat();
    byText.set(key, {
      contours, glyphs,
      xMin: Math.min(...pts.map((p) => p[0])), xMax: Math.max(...pts.map((p) => p[0])),
      yMin: Math.min(...pts.map((p) => p[1])), yMax: Math.max(...pts.map((p) => p[1])),
    });
  }
  return byText.get(key);
}

/** Place contours: x' = x0 + (x - xFrom) * sx, y' = y0 + (y - yFrom) * sy. */
function placePoints(contours, [xFrom, yFrom], [x0, y0], [sx, sy]) {
  return contours.map((c) => c.map(([x, y]) => [x0 + (x - xFrom) * sx, y0 + (y - yFrom) * sy]));
}
function placed(wasm, contours, from, to, scale) {
  return new wasm.CrossSection(placePoints(contours, from, to, scale), 'NonZero');
}

/** Vertical frame [yMin, yMax] (font units) shared by a row: all texts' ink. */
export function rowFrame(font, texts, txt) {
  const inks = texts.map((t) => ink(font, t, txt));
  return [Math.min(...inks.map((g) => g.yMin)), Math.max(...inks.map((g) => g.yMax))];
}

/**
 * Vertical placement of a chunk in a row of height `height` (row bottom at 0):
 * 'shared' keeps the row's common frame (baselines line up); 'fill' stretches
 * the chunk's own ink to the full row height. Returns the y-offset/scale and
 * the distortion (vertical stretch relative to 'shared'; 0 = none).
 */
function vertical(g, frame, height, fit) {
  const shared = height / (frame[1] - frame[0]);
  if (fit !== 'fill') return { from: frame[0], s: shared, distortion: 0 };
  const s = height / (g.yMax - g.yMin);
  return { from: g.yMin, s, distortion: s / shared - 1 };
}

/**
 * Grid placement (pass 1 of layoutCells): every letter gets a column slot of
 * the same width in every row (the word's widest letter), so letters line up
 * in columns in each view. Chunks still pair as given; a merged chunk spans
 * several slots. Slots are `width - overlap` apart (overlap < 0 = visible
 * gap). grid.fit 'stretch' scales each letter horizontally towards its slot
 * width, at most grid.maxStretch (default 1.5) times, then centres it: a
 * monospaced look with any font, without turning an I into a block.
 * 'center' keeps natural widths.
 */
function gridRows(font, layout, { height = 20, fit = 'shared', txt, overlap = 0.3, grid }) {
  const glyphBox = (g) => {
    const pts = g.contours.flat();
    return { x0: Math.min(...pts.map((p) => p[0])), x1: Math.max(...pts.map((p) => p[0])) };
  };
  // One vertical frame for all rows, so every row has the same scale.
  let frame = rowFrame(font, layout.rows.flatMap((r) => [...r.a, ...r.b]), txt);
  for (const r of layout.rows) if (r.frame) frame = [Math.min(frame[0], r.frame[0]), Math.max(frame[1], r.frame[1])];
  const shared = height / (frame[1] - frame[0]);
  const letterWidths = (k) => layout.rows.flatMap((r) => r[k].flatMap((t) => ink(font, t, txt).glyphs.map((g) => { const b = glyphBox(g); return (b.x1 - b.x0) * shared; })));
  const W = { a: Math.max(...letterWidths('a')), b: Math.max(...letterWidths('b')) };
  const pitch = { a: W.a - overlap, b: W.b - overlap };
  return layout.rows.map((row) => {
    const col = { a: 0, b: 0 };
    return row.a.map((ta, i) => {
      const f = row.fit?.[i] ?? fit;
      const side = (k, t) => {
        const g = ink(font, t, txt);
        const v = vertical(g, frame, height, f);
        const start = col[k];
        const letters = g.glyphs.map((gl) => {
          const b = glyphBox(gl), w = (b.x1 - b.x0) * shared;
          // Stretch towards the slot width, capped: an I stretched to a full slot is just a block.
          const sx = grid.fit === 'stretch' ? shared * Math.min(W[k] / w, grid.maxStretch ?? 1.5) : shared;
          const centre = col[k] * pitch[k] + W[k] / 2;
          col[k]++;
          return { ch: gl.ch, pts: placePoints(gl.contours, [(b.x0 + b.x1) / 2, v.from], [centre, 0], [sx, v.s]), stretch: sx / shared };
        });
        return { letters, pos: start * pitch[k], span: (col[k] - start - 1) * pitch[k] + W[k] };
      };
      const A = side('a', ta), B = side('b', row.b[i]);
      return { a: A.letters, b: B.letters, x: A.pos, y: B.pos, wa: A.span, wb: B.span, label: `${ta}/${row.b[i]}` };
    });
  });
}

/**
 * Cells for a fixed layout (for building the 3D solid).
 * @param layout.rows [{ a: [chunk...], b: [chunk...], fit?: ['shared'|'fill', ...], frame?: [y0, y1] }]
 *   top to bottom; a[i] pairs with b[i]. `frame` defaults to the row's own ink.
 * @param opts.height row height (mm); opts.gap between chunks (mm, may be < 0),
 *   or 'kiss': each chunk just touches the previous one in each view,
 *   overlapping by opts.overlap (mm) at the closest point; opts.lineGap
 *   between rows (mm, or 'kiss' likewise); opts.fit default per-cell fit; opts.tracking / opts.kiss
 *   letter spacing inside chunks (em; see glyphRun); opts.align 'left' |
 *   'center' for rows. A negative opts.overlap with 'kiss' leaves a visible gap
 *   of that size at the closest point instead. opts.grid ({ fit: 'center' |
 *   'stretch' }) places every letter in a fixed column slot instead (see gridRows).
 *   opts.tidy: null, or { mode, tol } to nudge each pair's strokes so their
 *   features meet (see tidy.js): mode 'pair' = tidyPair (the trade-off
 *   search), 'corners' = alignCorners (share links from before tidyPair),
 *   'levels' = alignLevels; tol in mm.
 */
export function layoutCells(wasm, font, layout, opts = {}) {
  const { height = 20, gap = 0, lineGap = 0, fit = 'shared', tolerance, tracking, kiss, overlap = 0.3, align = 'left', grid = null, tidy: tidyOpt = null } = opts;
  // Line up each pair's nearly level edges (before spacing, so letters still just touch).
  // Nudge strokes so each pair's features meet (before spacing, so letters still just touch).
  const tidy = (a, b) => {
    if (!tidyOpt) return { a, b };
    const { mode, tol } = tidyOpt;
    if (mode === 'pair') return tidyPair(a, b, { tol });
    if (mode === 'corners') return alignCorners(a, b, { tol, maxStrain: 0.15 });
    return alignLevels(a, b, { tol });
  };
  const txt = { tolerance, tracking, kiss };
  const shiftPts = (pts, du, dv) => pts.map((c) => c.map(([u, v]) => [u + du, v + dv]));
  // Pass 1: each row laid out with its bottom at z = 0 (plain JS geometry).
  const rows = grid ? gridRows(font, layout, { ...opts, txt }).map((row) => row.map((c) => ({ ...c, ...tidy(c.a, c.b) }))) : layout.rows.map((row) => {
    if (row.a.length !== row.b.length) throw new Error('Each row needs the same number of chunks in both words');
    // Never clip: widen a given frame to cover this row's own ink.
    const own = rowFrame(font, [...row.a, ...row.b], txt);
    const frame = row.frame ? [Math.min(row.frame[0], own[0]), Math.max(row.frame[1], own[1])] : own;
    const shared = height / (frame[1] - frame[0]);
    const out = [];
    let x = 0, y = 0, prev = null;
    row.a.forEach((ta, i) => {
      const ga = ink(font, ta, txt), gb = ink(font, row.b[i], txt);
      const f = row.fit?.[i] ?? fit;
      const va = vertical(ga, frame, height, f), vb = vertical(gb, frame, height, f);
      const wa = (ga.xMax - ga.xMin) * shared, wb = (gb.xMax - gb.xMin) * shared;
      const { a: lettersA, b: lettersB } = tidy(
        ga.glyphs.map((g) => ({ ch: g.ch, pts: placePoints(g.contours, [ga.xMin, va.from], [0, 0], [shared, va.s]) })),
        gb.glyphs.map((g) => ({ ch: g.ch, pts: placePoints(g.contours, [gb.xMin, vb.from], [0, 0], [shared, vb.s]) })));
      if (prev && gap === 'kiss') {
        // Just touch the previous cell in each view (per-height edge profiles).
        const dx = kissOffset(prev.a.flatMap((l) => l.pts), lettersA.flatMap((l) => l.pts), overlap);
        const dy = kissOffset(prev.b.flatMap((l) => l.pts), lettersB.flatMap((l) => l.pts), overlap);
        x = dx ?? prev.x + prev.wa; y = dy ?? prev.y + prev.wb;
      }
      const a = lettersA.map((l) => ({ ch: l.ch, pts: shiftPts(l.pts, x, 0) }));
      const b = lettersB.map((l) => ({ ch: l.ch, pts: shiftPts(l.pts, y, 0) }));
      out.push({ a, b, x, y, wa, wb, label: `${ta}/${row.b[i]}` });
      prev = { a, b, x, y, wa, wb };
      if (gap !== 'kiss') { x += wa + gap; y += wb + gap; }
    });
    return out;
  });
  // Centre each row's chain on the widest row, in both views, so short rows
  // don't sit under the start of the row above.
  if (align === 'center' && rows.length > 1 && !grid) {
    const extent = (row, k, pos, w) => Math.max(...row.map((c) => c[pos] + c[w])) - Math.min(...row.map((c) => c[pos]));
    const wa = Math.max(...rows.map((r) => extent(r, 'a', 'x', 'wa'))), wb = Math.max(...rows.map((r) => extent(r, 'b', 'y', 'wb')));
    for (const row of rows) {
      const dx = (wa - extent(row, 'a', 'x', 'wa')) / 2, dy = (wb - extent(row, 'b', 'y', 'wb')) / 2;
      for (const c of row) {
        c.x += dx; c.y += dy;
        c.a = c.a.map((l) => ({ ch: l.ch, pts: shiftPts(l.pts, dx, 0) }));
        c.b = c.b.map((l) => ({ ch: l.ch, pts: shiftPts(l.pts, dy, 0) }));
      }
    }
  }
  // Pass 2: stack rows top to bottom. With lineGap 'kiss', each row sits as
  // high as it can while its ink stays below the row above in *both* views,
  // touching (overlapping by `overlap`) in the tighter one.
  const tops = [0];
  for (let j = 1; j < rows.length; j++) {
    let top = tops[j - 1] - height - (lineGap === 'kiss' ? 0 : lineGap);
    if (lineGap === 'kiss') {
      // Rotate (u, z) -> (-z, u) so "downwards" becomes "rightwards" for kissOffset.
      const turn = (pts, dz) => pts.map((c) => c.map(([u, z]) => [-(z + dz), u]));
      const needs = ['a', 'b'].map((k) => kissOffset(
        rows[j - 1].flatMap((c) => c[k].flatMap((l) => turn(l.pts, tops[j - 1] - height))),
        rows[j].flatMap((c) => c[k].flatMap((l) => turn(l.pts, 0))), overlap));
      const ok = needs.filter((d) => d != null);
      // kissOffset gives how far down (in -z) row j must move from z-bottom 0
      // to just touch in each view. Take the larger move: the rows touch in one
      // view and stay clear in the other (the smaller move would make them
      // collide, and hide letters, in the other view).
      if (ok.length) top = -Math.max(...ok) + height;
    }
    tops.push(top);
  }
  const cells = [];
  rows.forEach((row, j) => {
    const z0 = tops[j] - height;
    for (const c of row) {
      const a = c.a.map((l) => ({ ch: l.ch, pts: shiftPts(l.pts, 0, z0) }));
      const b = c.b.map((l) => ({ ch: l.ch, pts: shiftPts(l.pts, 0, z0) }));
      cells.push({
        box: { min: [c.x, c.y, z0], max: [c.x + c.wa, c.y + c.wb, tops[j]] },
        shapes: {
          front: new wasm.CrossSection(a.flatMap((l) => l.pts), 'NonZero'),
          right: new wasm.CrossSection(b.flatMap((l) => l.pts), 'NonZero'),
        },
        letters: { front: a, right: b },
        label: c.label,
      });
    }
  });
  return cells;
}

// ---- Exact 2D cell scoring --------------------------------------------------

/** Merged height intervals where a CrossSection has ink (projection onto y). */
export function verticalProfile(cs) {
  const parts = cs.decompose();
  const iv = parts.map((p) => { const { min, max } = p.bounds(); p.delete(); return [min[1], max[1]]; }).sort((a, b) => a[0] - b[0]);
  const out = [];
  for (const [a, b] of iv) {
    if (out.length && a <= out[out.length - 1][1]) out[out.length - 1][1] = Math.max(out[out.length - 1][1], b);
    else out.push([a, b]);
  }
  return out;
}

/** Fraction of `cs` lying at heights covered by `profile` (1 = all of it shows). */
function coverageUnder(wasm, cs, profile) {
  const { min, max } = cs.bounds();
  const w = max[0] - min[0] + 2, cx = (min[0] + max[0]) / 2;
  const strips = profile.map(([a, b]) => [[cx - w / 2, a], [cx + w / 2, a], [cx + w / 2, b], [cx - w / 2, b]]);
  if (!strips.length) return 0;
  const kept = cs.intersect(strips);
  try { return kept.area() / cs.area(); } finally { kept.delete(); }
}

/**
 * Score one cell in 2D: both chunks placed in a row of the given frame/fit.
 * Returns { coverage: min of the two sides, covA, covB, distortion }.
 */
export function scoreCell(wasm, font, ta, tb, frame0, fit, { height = 20, tolerance, tracking, kiss } = {}) {
  const txt = { tolerance, tracking, kiss };
  const ga = ink(font, ta, txt), gb = ink(font, tb, txt);
  const frame = [Math.min(frame0[0], ga.yMin, gb.yMin), Math.max(frame0[1], ga.yMax, gb.yMax)];
  const shared = height / (frame[1] - frame[0]);
  const va = vertical(ga, frame, height, fit), vb = vertical(gb, frame, height, fit);
  const a = placed(wasm, ga.contours, [ga.xMin, va.from], [0, 0], [shared, va.s]);
  const b = placed(wasm, gb.contours, [gb.xMin, vb.from], [0, 0], [shared, vb.s]);
  try {
    const covA = coverageUnder(wasm, a, verticalProfile(b));
    const covB = coverageUnder(wasm, b, verticalProfile(a));
    return { coverage: Math.min(covA, covB), covA, covB, distortion: Math.max(va.distortion, vb.distortion) };
  } finally {
    a.delete(); b.delete();
  }
}

/**
 * Extra pieces a cell falls into on its own (0 = one solid). E.g. pairing an
 * "i" with a letter that has ink at dot height strands the dot as a floating
 * lump. Needs a small 3D build; callers cache it.
 */
export function cellFragments(wasm, font, ta, tb, frame, fit, { height = 20, tolerance, tracking, kiss } = {}) {
  const cells = layoutCells(wasm, font, { rows: [{ a: [ta], b: [tb], fit: [fit], frame }] }, { height, tolerance, tracking, kiss });
  const solid = buildComposition(wasm, cells);
  try {
    const parts = solid.decompose();
    for (const p of parts) p.delete();
    return Math.max(0, parts.length - 1);
  } finally {
    solid.delete();
    disposeCells(cells);
  }
}

/**
 * Same as cellFragments, but by scanline slicing in plain JS (see scan.js):
 * ~100x faster, may over-count a connection thinner than one slice.
 */
export function cellFragmentsScan(font, ta, tb, frame0, fit, { height = 20, tolerance, tracking, kiss, levels = 200 } = {}) {
  const txt = { tolerance, tracking, kiss };
  const ga = ink(font, ta, txt), gb = ink(font, tb, txt);
  const frame = [Math.min(frame0[0], ga.yMin, gb.yMin), Math.max(frame0[1], ga.yMax, gb.yMax)];
  const shared = height / (frame[1] - frame[0]);
  const va = vertical(ga, frame, height, fit), vb = vertical(gb, frame, height, fit);
  const a = placePoints(ga.contours, [ga.xMin, va.from], [0, 0], [shared, va.s]);
  const b = placePoints(gb.contours, [gb.xMin, vb.from], [0, 0], [shared, vb.s]);
  return Math.max(0, cellPieces(a, b, 0, height, levels) - 1);
}

// ---- Search -----------------------------------------------------------------

/** Cut `s` into `r` lines of ceil(n / r) letters (the last may be shorter): FINOLA, 2 -> FIN / OLA. */
export function gridLines(s, r) {
  const chars = [...s], c = Math.ceil(chars.length / r);
  return Array.from({ length: r }, (_, j) => chars.slice(j * c, (j + 1) * c).join('')).filter(Boolean);
}

/** All ways to cut `s` into `k` non-empty contiguous pieces. */
export function splits(s, k) {
  const chars = [...s];
  if (k === 1) return [[s]];
  const out = [];
  for (let i = 1; i <= chars.length - k + 1; i++) {
    for (const rest of splits(chars.slice(i).join(''), k - 1)) out.push([chars.slice(0, i).join(''), ...rest]);
  }
  return out;
}

const CASES = {
  upper: (s) => s.toUpperCase(),
  lower: (s) => s.toLowerCase(),
  title: (s) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase(),
  as: (s) => s,
};

/** Case variants of a chunk: fixed by caseMode, or every upper/lower mix ('mixed'). */
function caseVariants(chunk, caseMode) {
  if (caseMode !== 'mixed') return [chunk];
  let out = [''];
  for (const ch of chunk) {
    const opts = [...new Set([ch.toUpperCase(), ch.toLowerCase()])];
    out = out.flatMap((p) => opts.map((o) => p + o));
  }
  return out;
}

const lowercaseCount = (s) => [...s].filter((c) => c !== c.toUpperCase()).length;

/**
 * Objectives for a (partial) layout, all "smaller is better" except coverage:
 * coverage (min over cells), distortion (max stretch), fragments (extra
 * pieces inside cells, e.g. stranded i-dots), merged (letters beyond
 * one per chunk: fewer = more cells, more even pairing), lower (lowercase
 * letters used in 'mixed' mode: prefer capitals when it makes no difference).
 */
const ZERO = { coverage: 1, distortion: 0, fragments: 0, merged: 0, lower: 0 };
const combine = (p, c) => ({
  coverage: Math.min(p.coverage, c.coverage),
  distortion: Math.max(p.distortion, c.distortion),
  fragments: p.fragments + c.fragments,
  merged: p.merged + c.merged,
  lower: p.lower + c.lower,
});
const dominates = (p, q) =>
  p.coverage >= q.coverage - 1e-6 && p.distortion <= q.distortion + 1e-9 && p.fragments <= q.fragments
  && p.merged <= q.merged && p.lower <= q.lower
  && (p.coverage > q.coverage + 1e-6 || p.distortion < q.distortion - 1e-9 || p.fragments < q.fragments
    || p.merged < q.merged || p.lower < q.lower);

/**
 * Default display order: fewest fragments (floating pieces), then coverage
 * rounded to 0.5% (so hair-thin overshoot of round letters doesn't decide),
 * then least stretch, fewest merged letters, fewest lowercase.
 */
export function rankScore(p, q) {
  const bucket = (c) => Math.round(c * 200);
  return p.fragments - q.fragments || bucket(q.coverage) - bucket(p.coverage) || p.distortion - q.distortion
    || p.merged - q.merged || p.lower - q.lower || q.coverage - p.coverage;
}

/**
 * Order for whole layouts: rankScore, then balanced lines (grid-like
 * FIN/OLA before F/INOLA; otherwise equal scores fall back to split order).
 */
export function rankLayouts(p, q) {
  return rankScore(p.score, q.score) || (p.imbalance ?? 0) - (q.imbalance ?? 0);
}

function pareto(items, limit) {
  const front = items.filter((p) => !items.some((q) => q !== p && dominates(q.score, p.score)));
  // Deduplicate equal scores (keep first), then cap by coverage.
  const seen = new Set();
  const uniq = front.filter((p) => {
    const k = [p.score.coverage.toFixed(6), p.score.distortion.toFixed(6), p.score.fragments, p.score.merged, p.score.lower].join();
    return !seen.has(k) && seen.add(k);
  });
  return uniq.sort((p, q) => rankScore(p.score, q.score)).slice(0, limit);
}

/**
 * Pareto-optimal ways to pair one line of A with one line of B.
 * DP over (i, j) = letters of A and B consumed; each step adds one cell of
 * 1..maxChunk letters from each line, with every case variant and fit.
 */
export function alignLines(wasm, font, lineA, lineB, opts = {}) {
  const { caseMode = 'upper', fits = ['shared'], maxChunk = 3, frontLimit = 12, height = 20, tolerance, tracking, kiss } = opts;
  const txt = { tolerance, tracking, kiss };
  const A = [...CASES[caseMode === 'mixed' ? 'as' : caseMode](lineA)], B = [...CASES[caseMode === 'mixed' ? 'as' : caseMode](lineB)];
  const frameTexts = caseMode === 'mixed' ? [...A, ...B].flatMap((c) => [c.toUpperCase(), c.toLowerCase()]) : [...A, ...B];
  // A caller searching many line splits passes one frame and cache for all of
  // them (same row height scale everywhere, and cells are scored once).
  const frame = opts.frame ?? rowFrame(font, frameTexts, txt);
  const cellCache = opts.cache ?? new Map();
  const cellOptions = (ca, cb) => {
    const key = `${caseMode}|${ca}|${cb}|${frame}|${fits}|${height}|${tracking ?? 0}|${kiss ?? ''}`;
    if (!cellCache.has(key)) {
      const out = [];
      for (const va of caseVariants(ca, caseMode)) for (const vb of caseVariants(cb, caseMode)) for (const fit of fits) {
        const s = scoreCell(wasm, font, va, vb, frame, fit, { height, tolerance, tracking, kiss });
        const fragments = cellFragmentsScan(font, va, vb, frame, fit, { height, tolerance, tracking, kiss });
        out.push({
          a: va, b: vb, fit, cell: s,
          score: { coverage: s.coverage, distortion: s.distortion, fragments, merged: [...va].length + [...vb].length - 2, lower: lowercaseCount(va) + lowercaseCount(vb) },
        });
      }
      cellCache.set(key, pareto(out, frontLimit));
    }
    return cellCache.get(key);
  };

  const n = A.length, m = B.length;
  const best = Array.from({ length: n + 1 }, () => Array(m + 1).fill(null));
  best[0][0] = [{ score: ZERO, cells: [] }];
  for (let i = 0; i <= n; i++) {
    for (let j = 0; j <= m; j++) {
      if (!best[i][j] || (i === n && j === m)) continue;
      for (let di = 1; di <= maxChunk && i + di <= n; di++) {
        for (let dj = 1; dj <= maxChunk && j + dj <= m; dj++) {
          const opts2 = cellOptions(A.slice(i, i + di).join(''), B.slice(j, j + dj).join(''));
          const next = (best[i + di][j + dj] ??= []);
          for (const p of best[i][j]) for (const c of opts2) next.push({ score: combine(p.score, c.score), cells: [...p.cells, c] });
          best[i + di][j + dj] = pareto(next, frontLimit);
        }
      }
    }
  }
  return (best[n][m] ?? []).map((p) => ({ ...p, frame }));
}

/**
 * Explore word-pair layouts: for each row count, every way to split both
 * words into lines, each line pair aligned by DP. Returns the Pareto front of
 * whole layouts (best coverage first), each with its per-row cells.
 *
 * @param opts.cases 'upper' | 'lower' | 'title' | 'mixed' (per-letter case)
 * @param opts.fits per-cell vertical fit choices: 'shared' and/or 'fill'
 * @param opts.rows row counts to try
 * @param opts.grid only equal-length line splits (see gridLines), for grid layouts
 * @param opts.byStyle return every non-dominated layout per (case, line split)
 *   instead of only the global front, so styles that lose on these objectives
 *   (e.g. stacked rows, which win on compactness) stay visible.
 */
export function exploreWordPair(wasm, font, wordA, wordB, opts = {}) {
  const { cases = ['upper', 'lower', 'title', 'mixed'], rows: rowCounts = [1, 2], frontLimit = 12, byStyle = false } = opts;
  const results = [];
  const cache = new Map();
  for (const caseMode of cases) {
    // Title case applies to whole words, so do it before splitting into lines.
    const [wa, wb] = caseMode === 'title' ? [CASES.title(wordA), CASES.title(wordB)] : [wordA, wordB];
    const lineMode = caseMode === 'title' ? 'as' : caseMode;
    // One vertical frame per case mode: every row has the same scale.
    const letters = [...wa, ...wb];
    const frame = rowFrame(font, lineMode === 'mixed'
      ? letters.flatMap((c) => [c.toUpperCase(), c.toLowerCase()])
      : letters.map((c) => (CASES[lineMode] ?? CASES.as)(c)), { tolerance: opts.tolerance, tracking: opts.tracking, kiss: opts.kiss });
    for (const r of rowCounts) {
      if (r > Math.min([...wa].length, [...wb].length)) continue;
      const lineSplits = (w) => (opts.grid ? [gridLines(w, r)] : splits(w, r));
      for (const la of lineSplits(wa)) {
        for (const lb of lineSplits(wb)) {
          if (la.length !== r || lb.length !== r) continue;
          let partial = [{ score: ZERO, rows: [] }];
          for (let j = 0; j < r; j++) {
            const aligned = alignLines(wasm, font, la[j], lb[j], { ...opts, caseMode: lineMode, frontLimit, frame, cache });
            partial = pareto(partial.flatMap((p) => aligned.map((q) => ({
              score: combine(p.score, q.score),
              rows: [...p.rows, { a: q.cells.map((c) => c.a), b: q.cells.map((c) => c.b), fit: q.cells.map((c) => c.fit), frame: q.frame, cells: q.cells }],
            }))), frontLimit);
          }
          // Line imbalance: how uneven each word's lines are (0 = a true grid, e.g. FIN/OLA).
          const imbalance = [la, lb].reduce((t, ls) => { const n = ls.map((x) => [...x].length); return t + Math.max(...n) - Math.min(...n); }, 0);
          for (const p of partial) results.push({ ...p, caseMode, lines: [la, lb], imbalance });
        }
      }
    }
  }
  return byStyle ? results : pareto(results, 1e9);
}

/** Build and measure a layout in 3D (pieces, compactness, verified coverage). */
export function realizeLayout(wasm, font, layout, opts = {}) {
  const cells = layoutCells(wasm, font, { rows: layout.rows }, opts);
  const solid = buildComposition(wasm, cells);
  const metrics = measureComposition(wasm, solid, cells);
  return { cells, solid, metrics, dispose: () => { solid.delete(); disposeCells(cells); } };
}

/** One-line description of a layout, e.g. "F·IN·O / L·A  ×  B·R·Y / A·N". */
export function describeLayout({ rows }) {
  const word = (k) => rows.map((r) => r[k].map((t, i) => (r.fit?.[i] === 'fill' ? `${t}↕` : t)).join('·')).join(' / ');
  return `${word('a')}  ×  ${word('b')}`;
}
