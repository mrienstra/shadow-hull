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
import { glyphRun } from './glyph.js';

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
 * Cells for a column with row spans.
 * @param spans row span of each letter of the shorter word (sums to the longer word's length)
 * @param opts.gap vertical gap between rows (mm; negative = overlap)
 * @param opts.fit 'stretch' | 'uniform' for spanning letters
 * @returns cells (compose.js format, per-letter outlines), front = word A, right = word B
 */
export function spanColumnCells(wasm, font, wordA, wordB, spans, { height = 20, gap = 1.2, fit = 'stretch', caseMode = 'upper', tolerance } = {}) {
  const [a, b] = [CASE[caseMode](wordA), CASE[caseMode](wordB)].map((w) => [...w]);
  const aLong = a.length >= b.length;
  const [long, short] = aLong ? [a, b] : [b, a];
  if (spans.length !== short.length || spans.reduce((x, y) => x + y, 0) !== long.length) throw new Error('spans must cover the longer word');
  // One vertical frame for every letter, so all rows share a scale and baseline.
  const glyph = (ch) => glyphRun(font, ch, { tolerance })[0];
  const glyphs = { long: long.map(glyph), short: short.map(glyph) };
  const pts = [...glyphs.long, ...glyphs.short].flatMap((g) => g.contours.flat());
  // Row frame from the type's guidelines, not ink extremes: round letters
  // overshoot the baseline and cap height slightly, and using their ink would
  // leave flat letters (F, I, E) short of the row edges, so rows that should
  // touch wouldn't. Snap to baseline / cap height when within 3% of an em.
  const em = font.unitsPerEm, cap = font.tables.os2?.sCapHeight || 0.7 * em;
  let yMin = Math.min(...pts.map((p) => p[1])), yMax = Math.max(...pts.map((p) => p[1]));
  if (yMin > -0.03 * em) yMin = 0;
  if (Math.abs(yMax - cap) < 0.03 * em) yMax = cap;
  const s = height / (yMax - yMin);
  const rowBottom = (j) => -(j + 1) * height - j * gap;
  // Place a glyph centred on u = 0, from z0 to z1 (its frame mapped there).
  const place = (g, z0, z1, sx) => {
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
    const tall = place(glyphs.short[i], z0, z1, fit === 'uniform' ? s * k : s);
    const partners = [];
    for (let j = row; j < row + span; j++) partners.push(place(glyphs.long[j], rowBottom(j), rowBottom(j) + height, s));
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
  return cells;
}
