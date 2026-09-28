/**
 * Column layouts where letters of the shorter word span several rows.
 *
 * The longer word gets one letter per row. The shorter word's letters get
 * row spans that add up to the same number of rows (e.g. Finola × Bryan:
 * 6 rows, one of Bryan's letters spans two). Each shorter-word letter pairs
 * with the longer-word letters in its span, in one cell covering those rows.
 * A spanning letter is made tall by stretching ('stretch') or by uniform
 * scaling ('uniform', like a drop cap).
 *
 * Caveat: a spanning letter also covers the gap between its rows, where the
 * other word has no ink, so a positive row gap cuts a line through it.
 */
import { glyphRun, capHeight, alignedFrames } from './glyph.js';

/** All ways to write n as an ordered sum of k parts, each 1..maxPart. */
export function compositions(n, k, maxPart = 3) {
  if (k === 0) return n === 0 ? [[]] : [];
  const out = [];
  for (let p = 1; p <= Math.min(maxPart, n - (k - 1)); p++) {
    for (const rest of compositions(n - p, k - 1, maxPart)) out.push([p, ...rest]);
  }
  return out;
}

const CASE = {
  upper: (s) => s.toUpperCase(),
  lower: (s) => s.toLowerCase(),
  title: (s) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase(),
  as: (s) => s,
};

/**
 * Vertical frames [A, B] (font units) for word A's glyphs in `font` and word
 * B's in `fontB`: one from all glyphs with one font (every row shares a scale
 * and baseline); with two, one per word, aligned so both fonts' baselines and
 * cap heights meet (see glyph.js alignedFrames). Snapped to the
 * type's guidelines, not ink extremes: round letters overshoot the baseline
 * and cap height slightly, and using their ink would leave flat letters (F, I,
 * E) short of the row edges, so rows that should touch wouldn't. Snap to
 * baseline / cap height when within 3% of an em.
 */
function columnFrames(font, fontB, ga, gb) {
  const frame = (f, glyphs, cap = f.tables.os2?.sCapHeight || 0.7 * f.unitsPerEm) => {
    const pts = glyphs.flatMap((g) => g.contours.flat());
    const em = f.unitsPerEm;
    let yMin = Math.min(...pts.map((p) => p[1])), yMax = Math.max(...pts.map((p) => p[1]));
    if (yMin > -0.03 * em) yMin = 0;
    if (Math.abs(yMax - cap) < 0.03 * em) yMax = cap;
    return [yMin, yMax];
  };
  if (fontB === font) { const f = frame(font, [...ga, ...gb]); return [f, f]; }
  return alignedFrames([font, fontB], [[frame(font, ga, capHeight(font))], [frame(fontB, gb, capHeight(fontB))]]);
}

/**
 * Cells for a column with row spans.
 * @param spans row span of each letter of the shorter word (sums to the longer word's length)
 * @param opts.gap vertical gap between rows (mm; negative = overlap)
 * @param opts.fit 'stretch' | 'uniform' for spanning letters
 * @param opts.top optional top-view shape over the column (see placeTop)
 * @param opts.fontB word B's font (default: `font`; see columnFrames)
 * @returns cells (compose.js format, per-letter outlines), front = word A, right = word B
 */
export function spanColumnCells(wasm, font, wordA, wordB, spans, { height = 20, gap = 1.2, fit = 'stretch', caseMode = 'upper', tolerance, top = null, fontB = font } = {}) {
  const [a, b] = [CASE[caseMode](wordA), CASE[caseMode](wordB)].map((w) => [...w]);
  const aLong = a.length >= b.length;
  const [long, short] = aLong ? [a, b] : [b, a];
  if (spans.length !== short.length || spans.reduce((x, y) => x + y, 0) !== long.length) throw new Error('spans must cover the longer word');
  const glyphsOf = (f, chars) => chars.map((ch) => glyphRun(f, ch, { tolerance })[0]);
  const ga = glyphsOf(font, a), gb = glyphsOf(fontB, b);
  const glyphs = aLong ? { long: ga, short: gb } : { long: gb, short: ga };
  // One vertical frame for every letter (per word with two fonts), so all rows share a scale and baseline.
  const [frameA, frameB] = columnFrames(font, fontB, ga, gb);
  const [frameLong, frameShort] = aLong ? [frameA, frameB] : [frameB, frameA];
  const scale = ([y0, y1]) => height / (y1 - y0);
  const rowBottom = (j) => -(j + 1) * height - j * gap;
  // Place a glyph centred on u = 0, from z0 to z1 (its frame mapped there).
  const place = (g, [yMin, yMax], z0, z1, sx) => {
    const xs = g.contours.flat().map((p) => p[0]);
    const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
    const sy = (z1 - z0) / (yMax - yMin);
    const pts2 = g.contours.map((c) => c.map(([x, y]) => [(x - cx) * sx, z0 + (y - yMin) * sy]));
    const us = pts2.flat().map((p) => p[0]);
    return { ch: g.ch, pts: pts2, half: Math.max(...us.map(Math.abs)) };
  };
  const cells = [];
  let row = 0;
  short.forEach((_, i) => {
    const span = spans[i];
    const z0 = rowBottom(row + span - 1), z1 = rowBottom(row) + height;
    // Tall letter: stretched vertically only, or scaled uniformly by the same factor.
    const k = (z1 - z0) / height;
    const s = scale(frameShort);
    const tall = place(glyphs.short[i], frameShort, z0, z1, fit === 'uniform' ? s * k : s);
    const partners = [];
    for (let j = row; j < row + span; j++) partners.push(place(glyphs.long[j], frameLong, rowBottom(j), rowBottom(j) + height, scale(frameLong)));
    const halfLong = Math.max(...partners.map((p) => p.half)), halfShort = tall.half;
    const [front, right] = aLong ? [partners, [tall]] : [[tall], partners];
    const [hx, hy] = aLong ? [halfLong, halfShort] : [halfShort, halfLong];
    cells.push({
      box: { min: [-hx, -hy, z0], max: [hx, hy, z1] },
      shapes: {
        front: new wasm.CrossSection(front.flatMap((l) => l.pts), 'NonZero'),
        right: new wasm.CrossSection(right.flatMap((l) => l.pts), 'NonZero'),
      },
      letters: { front: front.map(({ ch, pts: p }) => ({ ch, pts: p })), right: right.map(({ ch, pts: p }) => ({ ch, pts: p })) },
      label: `${front.map((l) => l.ch).join('')}/${right.map((l) => l.ch).join('')}`,
      span,
    });
    row += span;
  });
  if (top?.shape) {
    // One top shape over the whole column, shared by every cell.
    const hx = Math.max(...cells.map((c) => c.box.max[0])), hy = Math.max(...cells.map((c) => c.box.max[1]));
    for (const c of cells) c.shapes.top = placeTop(top, hx, hy);
  }
  return cells;
}

/**
 * Stacked block: both words stacked vertically (one letter per row), each as
 * a whole, with no per-row pairing. The shorter word's rows are stretched so
 * both stacks have the same height (Finola × Bryan: Bryan's letters 1.2×
 * taller). With touching rows each stack is continuous ink, so letters lose
 * only where the other stack has a gap at that height.
 * @param opts.fit 'stretch' (taller only) | 'uniform' (taller and wider)
 * @param opts.top { shape: CrossSection, rotate: degrees, scale: × footprint }
 * @param opts.fontB word B's font (default: `font`; see columnFrames)
 * @returns cells (compose.js format; one cell)
 */
export function stackedColumnCells(wasm, font, wordA, wordB, { height = 20, gap = -0.3, fit = 'stretch', caseMode = 'upper', tolerance, top = null, fontB = font } = {}) {
  const [a, b] = [CASE[caseMode](wordA), CASE[caseMode](wordB)].map((w) => [...w]);
  const ga = a.map((ch) => glyphRun(font, ch, { tolerance })[0]), gb = b.map((ch) => glyphRun(fontB, ch, { tolerance })[0]);
  const frames = columnFrames(font, fontB, ga, gb);
  const total = Math.max(a.length, b.length) * height + (Math.max(a.length, b.length) - 1) * gap;
  const stack = (glyphs, [yMin, yMax]) => {
    const s = height / (yMax - yMin);
    const rowH = (total - (glyphs.length - 1) * gap) / glyphs.length;
    const k = rowH / height; // 1 for the longer word, e.g. 1.2 for the shorter
    return glyphs.map((g, j) => {
      const xs = g.contours.flat().map((p) => p[0]);
      const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
      const z0 = total - (j + 1) * rowH - j * gap;
      const sx = fit === 'uniform' ? s * k : s, sy = s * k;
      return { ch: g.ch, pts: g.contours.map((c) => c.map(([x, y]) => [(x - cx) * sx, z0 + (y - yMin) * sy])), stretch: k };
    });
  };
  const A = stack(ga, frames[0]), B = stack(gb, frames[1]);
  const half = (letters) => Math.max(...letters.flatMap((l) => l.pts.flat().map((p) => Math.abs(p[0]))));
  const hx = half(A), hy = half(B);
  const shapes = {
    front: new wasm.CrossSection(A.flatMap((l) => l.pts), 'NonZero'),
    right: new wasm.CrossSection(B.flatMap((l) => l.pts), 'NonZero'),
  };
  if (top?.shape) shapes.top = placeTop(top, hx, hy);
  return [{
    box: { min: [-hx, -hy, 0], max: [hx, hy, total] },
    shapes,
    letters: { front: A.map(({ ch, pts }) => ({ ch, pts })), right: B.map(({ ch, pts }) => ({ ch, pts })) },
    label: `${a.join('')}/${b.join('')} stacked`,
    stretch: Math.max(...[...A, ...B].map((l) => l.stretch)) - 1,
  }];
}

/**
 * A top-view shape for a column: rotated by top.rotate degrees about the
 * vertical axis, then scaled so its bounding box is top.scale × the column's
 * footprint (hx, hy half-extents), centred on the axis.
 */
export function placeTop(top, hx, hy) {
  const rotated = top.shape.rotate(top.rotate ?? 0);
  const { min, max } = rotated.bounds();
  const k = top.scale ?? 1;
  const sx = (2 * hx * k) / (max[0] - min[0]), sy = (2 * hy * k) / (max[1] - min[1]);
  const out = rotated.translate([-(min[0] + max[0]) / 2, -(min[1] + max[1]) / 2]).scale([sx, sy]);
  rotated.delete();
  return out;
}
