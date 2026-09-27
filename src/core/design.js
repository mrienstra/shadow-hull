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
import { letterVisibility, buildComposition, measureComposition, disposeCells } from './compose.js';
import { exploreWordPair, layoutCells, rankLayouts } from './wordpair.js';
import { blockCells } from './block.js';
import { basePlate, bridgePieces, strayShadow, hullJoin } from './join.js';

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
 */
export const QUALITY_WEIGHTS = {
  hidden: 1, hiddenFree: 0.05, // visible share below 95% is penalised
  contact: 0.25, contactFree: 0.2, // contact above 0.2 row heights is penalised
  stretch: 0.1, stray: 1, pieces: 0.5, imbalance: 0.005,
};

/** One number to rank designs (higher is better); see QUALITY_WEIGHTS. */
export function designQuality(m, w = QUALITY_WEIGHTS) {
  return m.coverage
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
export function finishDesign(wasm, cells, solid, { join = 'hull+bridges', rods = {}, height = 20, stretch = 0, imbalance = 0 } = {}) {
  const base = measureComposition(wasm, solid, cells);
  const vis = letterVisibility(wasm, cells, { height });
  let joined = solid, bridges = [], blocks = [];
  const replace = (next) => { if (joined !== solid) joined.delete(); joined = next; };
  if (join.includes('hull') && cells.length > 1) { const h = hullJoin(wasm, joined, cells); replace(h.solid); blocks = h.blocks; }
  if (join.includes('plate')) replace(basePlate(wasm, joined, cells));
  if (join.includes('bridges')) { const b = bridgePieces(wasm, joined, rods); replace(b.solid); bridges = b.bridges; }
  const stray = strayShadow(wasm, solid, joined, cells);
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
  metrics.quality = designQuality(metrics);
  return {
    cells, solid, joined, metrics,
    dispose: () => { if (joined !== solid) joined.delete(); solid.delete(); disposeCells(cells); },
  };
}

/** Build one chain layout with a spacing family, join it, and measure everything. */
export function realizeDesign(wasm, font, layout, { spacing = 'spaced', join = 'hull+bridges', height = 20 } = {}) {
  const fam = SPACING[spacing];
  const cells = layoutCells(wasm, font, { rows: layout.rows }, { height, ...fam.layout });
  const solid = buildComposition(wasm, cells);
  return finishDesign(wasm, cells, solid, {
    join, rods: fam.rods, height, stretch: layout.score?.distortion ?? 0, imbalance: layout.imbalance ?? 0,
  });
}

/**
 * A block design (see block.js): whole words front and side, optional top
 * shape. spacing 'touching' (letters just touch) or 'spaced' (visible gaps,
 * joined by low level rods).
 */
export function realizeBlock(wasm, font, wordA, wordB, { caseMode = 'upper', spacing = 'spaced', top = null, join = 'bridges', height = 20 } = {}) {
  const fam = SPACING[spacing];
  const cells = blockCells(wasm, font, wordA, wordB, { height, caseMode, kiss: fam.layout.kiss, top });
  const solid = buildComposition(wasm, cells);
  return finishDesign(wasm, cells, solid, { join, rods: fam.rods, height });
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
    cases = ['upper', 'lower', 'title', 'mixed'], rows = [1, 2, 3], fits = ['shared', 'fill'], maxChunk = 3,
  } = opts;
  const fam = SPACING[spacing];
  const search = { ...fam.search };
  if (search.rows === 'column') search.rows = [Math.min([...wordA].length, [...wordB].length)];
  const all = exploreWordPair(wasm, font, wordA, wordB, {
    cases, rows, fits, maxChunk, byStyle: true, height, kiss: fam.layout.kiss, ...search,
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
      const d = realizeDesign(wasm, font, layout, { spacing, join, height });
      const m = d.metrics;
      d.dispose();
      return { style, layout, metrics: m };
    });
    tried.sort((a, b) => b.metrics.quality - a.metrics.quality);
    out.push({ ...tried[0], runnersUp: tried.slice(1) });
  }
  return out.sort((a, b) => b.metrics.quality - a.metrics.quality);
}
