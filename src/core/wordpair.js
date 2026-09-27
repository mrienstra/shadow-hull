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
import { textContours } from './glyph.js';
import { cellPieces } from './scan.js';
import { buildComposition, measureComposition, disposeCells } from './compose.js';

const inkCache = new WeakMap();

/** Outline and ink bounds of `text` in font units (y up). */
export function ink(font, text, tolerance) {
  let byText = inkCache.get(font);
  if (!byText) inkCache.set(font, (byText = new Map()));
  const key = `${text}\u0000${tolerance}`;
  if (!byText.has(key)) {
    const contours = textContours(font, text, { tolerance });
    const pts = contours.flat();
    byText.set(key, {
      contours,
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
export function rowFrame(font, texts, tolerance) {
  const inks = texts.map((t) => ink(font, t, tolerance));
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
 * Cells for a fixed layout (for building the 3D solid).
 * @param layout.rows [{ a: [chunk...], b: [chunk...], fit?: ['shared'|'fill', ...], frame?: [y0, y1] }]
 *   top to bottom; a[i] pairs with b[i]. `frame` defaults to the row's own ink.
 * @param opts.height row height (mm); opts.gap between chunks (mm, may be < 0);
 *   opts.lineGap between rows (mm); opts.fit default per-cell fit.
 */
export function layoutCells(wasm, font, layout, opts = {}) {
  const { height = 20, gap = 0, lineGap = 0, fit = 'shared', tolerance } = opts;
  const cells = [];
  layout.rows.forEach((row, j) => {
    if (row.a.length !== row.b.length) throw new Error('Each row needs the same number of chunks in both words');
    // Never clip: widen a given frame to cover this row's own ink.
    const own = rowFrame(font, [...row.a, ...row.b], tolerance);
    const frame = row.frame ? [Math.min(row.frame[0], own[0]), Math.max(row.frame[1], own[1])] : own;
    const shared = height / (frame[1] - frame[0]);
    const zTop = -j * (height + lineGap), z0 = zTop - height;
    let x = 0, y = 0;
    row.a.forEach((ta, i) => {
      const ga = ink(font, ta, tolerance), gb = ink(font, row.b[i], tolerance);
      const f = row.fit?.[i] ?? fit;
      const va = vertical(ga, frame, height, f), vb = vertical(gb, frame, height, f);
      const wa = (ga.xMax - ga.xMin) * shared, wb = (gb.xMax - gb.xMin) * shared;
      cells.push({
        box: { min: [x, y, z0], max: [x + wa, y + wb, zTop] },
        shapes: {
          front: placed(wasm, ga.contours, [ga.xMin, va.from], [x, z0], [shared, va.s]),
          right: placed(wasm, gb.contours, [gb.xMin, vb.from], [y, z0], [shared, vb.s]),
        },
        label: `${ta}/${row.b[i]}`,
      });
      x += wa + gap;
      y += wb + gap;
    });
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
export function scoreCell(wasm, font, ta, tb, frame0, fit, { height = 20, tolerance } = {}) {
  const ga = ink(font, ta, tolerance), gb = ink(font, tb, tolerance);
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
export function cellFragments(wasm, font, ta, tb, frame, fit, { height = 20, tolerance } = {}) {
  const cells = layoutCells(wasm, font, { rows: [{ a: [ta], b: [tb], fit: [fit], frame }] }, { height, tolerance });
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
export function cellFragmentsScan(font, ta, tb, frame0, fit, { height = 20, tolerance, levels = 200 } = {}) {
  const ga = ink(font, ta, tolerance), gb = ink(font, tb, tolerance);
  const frame = [Math.min(frame0[0], ga.yMin, gb.yMin), Math.max(frame0[1], ga.yMax, gb.yMax)];
  const shared = height / (frame[1] - frame[0]);
  const va = vertical(ga, frame, height, fit), vb = vertical(gb, frame, height, fit);
  const a = placePoints(ga.contours, [ga.xMin, va.from], [0, 0], [shared, va.s]);
  const b = placePoints(gb.contours, [gb.xMin, vb.from], [0, 0], [shared, vb.s]);
  return Math.max(0, cellPieces(a, b, 0, height, levels) - 1);
}

// ---- Search -----------------------------------------------------------------

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
  const { caseMode = 'upper', fits = ['shared'], maxChunk = 3, frontLimit = 12, height = 20, tolerance } = opts;
  const A = [...CASES[caseMode === 'mixed' ? 'as' : caseMode](lineA)], B = [...CASES[caseMode === 'mixed' ? 'as' : caseMode](lineB)];
  const frameTexts = caseMode === 'mixed' ? [...A, ...B].flatMap((c) => [c.toUpperCase(), c.toLowerCase()]) : [...A, ...B];
  // A caller searching many line splits passes one frame and cache for all of
  // them (same row height scale everywhere, and cells are scored once).
  const frame = opts.frame ?? rowFrame(font, frameTexts, tolerance);
  const cellCache = opts.cache ?? new Map();
  const cellOptions = (ca, cb) => {
    const key = `${caseMode}|${ca}|${cb}|${frame}|${fits}|${height}`;
    if (!cellCache.has(key)) {
      const out = [];
      for (const va of caseVariants(ca, caseMode)) for (const vb of caseVariants(cb, caseMode)) for (const fit of fits) {
        const s = scoreCell(wasm, font, va, vb, frame, fit, { height, tolerance });
        const fragments = cellFragmentsScan(font, va, vb, frame, fit, { height, tolerance });
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
      : letters.map((c) => (CASES[lineMode] ?? CASES.as)(c)), opts.tolerance);
    for (const r of rowCounts) {
      if (r > Math.min([...wa].length, [...wb].length)) continue;
      for (const la of splits(wa, r)) {
        for (const lb of splits(wb, r)) {
          let partial = [{ score: ZERO, rows: [] }];
          for (let j = 0; j < r; j++) {
            const aligned = alignLines(wasm, font, la[j], lb[j], { ...opts, caseMode: lineMode, frontLimit, frame, cache });
            partial = pareto(partial.flatMap((p) => aligned.map((q) => ({
              score: combine(p.score, q.score),
              rows: [...p.rows, { a: q.cells.map((c) => c.a), b: q.cells.map((c) => c.b), fit: q.cells.map((c) => c.fit), frame: q.frame, cells: q.cells }],
            }))), frontLimit);
          }
          for (const p of partial) results.push({ ...p, caseMode, lines: [la, lb] });
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
