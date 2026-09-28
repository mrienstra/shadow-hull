/**
 * Word-pair design pipeline: search → build → join → measure → rank.
 * Shared by the report script and (later) the web page. Environment-neutral.
 *
 * The DP search (wordpair.js) ranks layouts on per-cell properties. Letter
 * visibility, contact between neighbours, joining cost and the final shape
 * depend on spacing and neighbours, so they're measured on built candidates:
 * each style keeps its top few search results, builds them, and picks the best
 * by designQuality.
 */
import { letterVisibility, buildComposition, measureComposition, disposeCells, trimThin } from './compose.js';
import { exploreWordPair, layoutCells, rankLayouts } from './wordpair.js';
import { blockCells } from './block.js';
import { compositions, spanColumnCells, stackedColumnCells, placeTop } from './column.js';
import { basePlate, bridgePieces, strayShadow, hullJoin, displayStand } from './join.js';

/**
 * Spacing families. Each has search options, layout options and rod options.
 * - touching: neighbours just touch (0.3 mm overlap at the closest point): solid
 *   and clean, but flat stems can merge (I next to L reads as a thick L).
 * - spaced: a visible 1.2 mm gap at the closest point, rows centred, pieces
 *   joined by level rods near the baseline (they read like ligatures).
 * - grid: equal-length rows, every letter in a fixed column slot.
 * - grid-mono: grid, letters widened towards the slot width (≤1.5×).
 * - column / column-touching: one letter pair per row, stacked into a tower.
 */
export const SPACING = {
  touching: {
    label: 'Touching',
    search: {}, layout: { gap: 'kiss', lineGap: 'kiss', overlap: 0.3, kiss: 0.01, align: 'left' }, rods: {},
  },
  spaced: {
    label: 'Spaced',
    search: {}, layout: { gap: 'kiss', lineGap: 'kiss', overlap: -1.2, kiss: -0.06, align: 'center' }, rods: { lowWeight: 1, levelWeight: 3 },
  },
  grid: {
    label: 'Grid',
    search: { grid: true, rows: [2, 3] }, layout: { grid: { fit: 'center' }, lineGap: 'kiss', overlap: -1.2, kiss: -0.06 }, rods: { lowWeight: 1, levelWeight: 3 },
  },
  // Single column: one letter pair per row (rows = the shorter word's length;
  // the longer word doubles up somewhere), rows centred into a tower.
  column: {
    label: 'Column (one letter per row)',
    search: { rows: 'column' }, layout: { gap: 'kiss', lineGap: 'kiss', overlap: -1.2, kiss: -0.06, align: 'center' }, rods: { lowWeight: 0, levelWeight: 0 },
  },
  'column-touching': {
    label: 'Column, touching',
    search: { rows: 'column' }, layout: { gap: 'kiss', lineGap: 'kiss', overlap: 0.3, kiss: 0.01, align: 'center' }, rods: {},
  },
  'grid-mono': {
    label: 'Grid, monospaced (letters widened towards their slot, at most 1.5×)',
    search: { grid: true, rows: [2, 3] }, layout: { grid: { fit: 'stretch' }, lineGap: 'kiss', overlap: -1.2, kiss: -0.06 }, rods: { lowWeight: 1, levelWeight: 3 },
  },
};

/**
 * Weights for designQuality. Each is a penalty per unit of its measure,
 * subtracted from the worst letter's coverage (1 = perfect). Tuned so that:
 * a letter 30% hidden costs ~0.25; stems merged along a whole letter height
 * (contact ~1.3) cost ~0.3 (enough to prefer a less-merged layout within the
 * touching family, not enough to abandon it); 79% vertical stretch costs ~0.08;
 * 3% extra shadow costs 0.03; an unjoined extra piece costs 0.5.
 * Optional `compact` (used by "prefer compact"): × (1 − shortest/longest side).
 */
export const QUALITY_WEIGHTS = {
  hidden: 1, hiddenFree: 0.05, // visible share below 95% is penalised
  contact: 0.25, contactFree: 0.2, // contact above 0.2 row heights is penalised
  stretch: 0.1, stray: 1, pieces: 0.5, imbalance: 0.005,
};

/** One number to rank designs (higher is better); see QUALITY_WEIGHTS. */
export function designQuality(m, w = QUALITY_WEIGHTS) {
  return m.coverage
    - (w.compact ?? 0) * (1 - (m.compactness ?? 1))
    - w.hidden * Math.max(0, 1 - w.hiddenFree - m.visibleMin)
    - w.contact * Math.max(0, m.contactMax - w.contactFree)
    - w.stretch * m.stretch
    - w.stray * m.strayMax
    - w.pieces * (m.finalPieces - 1)
    - w.imbalance * m.imbalance;
}

/**
 * Join a built composition and measure everything (shared by chain layouts
 * and blocks). Takes ownership of `solid` and `cells` via dispose().
 * @returns { cells, solid (letters only), joined, metrics, dispose() }
 */
export function finishDesign(wasm, cells, solid, { join = 'hull+bridges', rods = {}, height = 20, stretch = 0, imbalance = 0, frames, weights, trim = 0 } = {}) {
  // Trim knife edges first (letters only), so everything is measured on the trimmed solid.
  if (trim > 0) { const trimmed = trimThin(wasm, cells, solid, { t: trim, frames }); solid.delete(); solid = trimmed; }
  const base = measureComposition(wasm, solid, cells, { frames });
  const vis = letterVisibility(wasm, cells, { height });
  let joined = solid, bridges = [], blocks = [];
  const replace = (next) => { if (joined !== solid) joined.delete(); joined = next; };
  if (join.includes('hull') && cells.length > 1) { const h = hullJoin(wasm, joined, cells); replace(h.solid); blocks = h.blocks; }
  if (join.includes('plate')) replace(basePlate(wasm, joined, cells));
  if (join.includes('stand')) replace(displayStand(wasm, joined, cells));
  if (join.includes('bridges')) { const b = bridgePieces(wasm, joined, rods); replace(b.solid); bridges = b.bridges; }
  const stray = strayShadow(wasm, solid, joined, cells, { frames });
  const parts = joined.decompose();
  const finalPieces = parts.filter((x) => x.volume() >= 1e-3 * joined.volume()).length;
  for (const x of parts) x.delete();
  const size = base.size;
  const metrics = {
    coverage: base.worstCell, views: base.views,
    visibleMin: vis.worst.visible, leastVisible: vis.worst.ch,
    contactMax: vis.worstContact.contact, mostContact: vis.worstContact.ch,
    stretch, imbalance,
    pieces: base.pieces, finalPieces,
    blocks: blocks.length, rods: bridges.length, longestRod: bridges.length ? Math.max(...bridges.map((b) => b.length)) : 0,
    stray, strayMax: Math.max(0, ...Object.values(stray)),
    size, compactness: Math.min(...size) / Math.max(...size),
  };
  metrics.quality = designQuality(metrics, weights);
  return {
    cells, solid, joined, metrics, frames,
    dispose: () => { if (joined !== solid) joined.delete(); solid.delete(); disposeCells(cells); },
  };
}

/**
 * Build one chain layout with a spacing family, join it, and measure everything.
 * `fontB` (here and below): word B's font, for the side view (default: `font`).
 */
export function realizeDesign(wasm, font, layout, { spacing = 'spaced', join = 'hull+bridges', height = 20, weights, top = null, tidy = null, fontB, trim = 0 } = {}) {
  const fam = SPACING[spacing];
  const cells = layoutCells(wasm, font, { rows: layout.rows }, { height, ...fam.layout, tidy, fontB });
  if (top?.shape) {
    // A shape seen from above over the whole layout (used for towers of
    // letter pairs): fitted to the cells' combined footprint, shared by all.
    const x0 = Math.min(...cells.map((c) => c.box.min[0])), x1 = Math.max(...cells.map((c) => c.box.max[0]));
    const y0 = Math.min(...cells.map((c) => c.box.min[1])), y1 = Math.max(...cells.map((c) => c.box.max[1]));
    for (const c of cells) {
      const centred = placeTop(top, (x1 - x0) / 2, (y1 - y0) / 2);
      c.shapes.top = centred.translate([(x0 + x1) / 2, (y0 + y1) / 2]);
      centred.delete();
    }
  }
  const solid = buildComposition(wasm, cells);
  return finishDesign(wasm, cells, solid, {
    join, rods: fam.rods, height, stretch: layout.score?.distortion ?? 0, imbalance: layout.imbalance ?? 0, weights, trim,
  });
}

/**
 * A block design (see block.js): whole words front and side, optional top
 * shape. spacing 'touching' (letters just touch) or 'spaced' (visible gaps,
 * joined by low level rods).
 */
export function realizeBlock(wasm, font, wordA, wordB, { caseMode = 'upper', spacing = 'spaced', top = null, join = 'bridges', height = 20, angle = 90, fontB, trim = 0 } = {}) {
  const fam = SPACING[spacing];
  const { cells, frames } = blockCells(wasm, font, wordA, wordB, { height, caseMode, kiss: fam.layout.kiss, top, angle, fontB });
  const solid = buildComposition(wasm, cells, { frames });
  return finishDesign(wasm, cells, solid, { join, rods: fam.rods, height, frames, trim });
}

/** Style key of a layout: case mode × number of rows. */
export const styleOf = (p) => `${p.caseMode}, ${p.rows.length} row${p.rows.length > 1 ? 's' : ''}`;

/**
 * Best design per style for one spacing family: the search's top `candidates`
 * layouts per style are built, joined and measured, and the best by
 * designQuality wins. Returns [{ style, layout, metrics, runnersUp }], best first.
 */
export function designWordPair(wasm, font, wordA, wordB, opts = {}) {
  const {
    spacing = 'spaced', join = 'hull+bridges', height = 20, candidates = 3,
    cases = ['upper', 'lower', 'title', 'mixed'], rows, fits = ['shared', 'fill'], maxChunk = 3, weights, tidy = null, fontB,
  } = opts;
  const fam = SPACING[spacing];
  const search = { ...fam.search };
  // A family's rows (e.g. grid: 2 and 3; column: one per letter) are only a
  // default: an explicit `rows` wins.
  if (search.rows === 'column') search.rows = [Math.min([...wordA].length, [...wordB].length)];
  search.rows = rows ?? search.rows ?? [1, 2, 3];
  const all = exploreWordPair(wasm, font, wordA, wordB, {
    cases, fits, maxChunk, byStyle: true, height, kiss: fam.layout.kiss, fontB, ...search,
  });
  const groups = new Map();
  for (const p of all) {
    const k = styleOf(p);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(p);
  }
  const out = [];
  for (const [style, ps] of groups) {
    ps.sort(rankLayouts);
    const tried = ps.slice(0, candidates).map((layout) => {
      const d = realizeDesign(wasm, font, layout, { spacing, join, height, weights, tidy, fontB });
      const m = d.metrics;
      d.dispose();
      return { style, layout, metrics: m };
    });
    tried.sort((a, b) => b.metrics.quality - a.metrics.quality);
    out.push({ ...tried[0], runnersUp: tried.slice(1) });
  }
  return out.sort((a, b) => b.metrics.quality - a.metrics.quality);
}

/**
 * Column with spanning letters (see column.js): the longer word one letter per
 * row, the shorter word's letters spanning rows so both fill the same height.
 * Tries every span assignment (each span ≤ maxSpan), builds, joins and ranks
 * them by designQuality. spacing 'touching' (rows overlap 0.3 mm) or 'spaced'
 * (1.2 mm gaps, which cut a line through spanning letters).
 * @returns [{ spans, metrics }] best first
 */
export function designSpanColumn(wasm, font, wordA, wordB, { spacing = 'touching', fit = 'stretch', caseMode = 'upper', maxSpan = 3, height = 20, join = 'hull+bridges', fontB } = {}) {
  const [n, m] = [[...wordA].length, [...wordB].length];
  const spansList = compositions(Math.max(n, m), Math.min(n, m), maxSpan);
  const gap = spacing === 'touching' ? -0.3 : 1.2;
  const results = spansList.map((spans) => {
    const d = realizeSpanColumn(wasm, font, wordA, wordB, spans, { spacing, fit, caseMode, height, join, gap, fontB });
    const { metrics } = d;
    d.dispose();
    return { spans, metrics };
  });
  return results.sort((a, b) => b.metrics.quality - a.metrics.quality);
}

/** Build one spanning column (see designSpanColumn); caller disposes. */
export function realizeSpanColumn(wasm, font, wordA, wordB, spans, { spacing = 'touching', fit = 'stretch', caseMode = 'upper', height = 20, join = 'hull+bridges', gap, top = null, fontB, trim = 0 } = {}) {
  const fam = SPACING[spacing];
  const cells = spanColumnCells(wasm, font, wordA, wordB, spans, { height, gap: gap ?? (spacing === 'touching' ? -0.3 : 1.2), fit, caseMode, top, fontB });
  const solid = buildComposition(wasm, cells);
  // Stretch: how much taller than a normal row the tallest spanning letter is.
  const stretch = Math.max(...spans) - 1;
  return finishDesign(wasm, cells, solid, { join, rods: fam.rods, height, stretch: fit === 'stretch' ? stretch : 0, trim });
}

/** Build a stacked block (see column.js stackedColumnCells); caller disposes. */
export function realizeStackedColumn(wasm, font, wordA, wordB, { spacing = 'touching', fit = 'stretch', caseMode = 'upper', height = 20, join = 'bridges', top = null, fontB, trim = 0 } = {}) {
  const fam = SPACING[spacing];
  const cells = stackedColumnCells(wasm, font, wordA, wordB, { height, gap: spacing === 'touching' ? -0.3 : 1.2, fit, caseMode, top, fontB });
  const solid = buildComposition(wasm, cells);
  return finishDesign(wasm, cells, solid, { join, rods: fam.rods, height, stretch: fit === 'stretch' ? cells[0].stretch : 0, trim });
}

/**
 * Best rotation/scale of a top shape over a column design: tries each
 * rotation × scale, and keeps the best by designQuality (which includes the
 * top view's coverage via the worst view), treating differences under 0.01
 * as ties broken towards upright, then 45° steps, then natural size. `build(top)` must return a design
 * (realizeSpanColumn / realizeStackedColumn with that top).
 * @returns [{ rotate, scale, metrics }] best first
 */
export function searchTopFit(build, shape, { rotations = [0, 15, 30, 45, 60, 75, 90, 135, 180, 225, 270, 315], scales = [1, 1.15, 1.3], tie = 0.01 } = {}) {
  const out = [];
  for (const rotate of rotations) {
    for (const scale of scales) {
      const d = build({ shape, rotate, scale });
      out.push({ rotate, scale, metrics: d.metrics });
      d.dispose();
    }
  }
  // Anything within `tie` of the best quality counts as tied: among those,
  // prefer an upright shape, then 45° steps, then the natural size (e.g. one
  // letter at 99.2% vs 99.9% isn't worth a tilted heart). The rest follow by quality.
  const best = Math.max(...out.map((r) => r.metrics.quality));
  const niceness = (r) => (r % 360 === 0 ? 0 : r % 45 === 0 ? 1 : 2);
  const tied = (r) => r.metrics.quality >= best - tie;
  return out.sort((a, b) => (tied(b) - tied(a))
    || (tied(a) && (niceness(a.rotate) - niceness(b.rotate) || a.scale - b.scale))
    || b.metrics.quality - a.metrics.quality);
}

