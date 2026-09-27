/**
 * Block layouts: the "normal" arrangement. The front view shows the whole of
 * word A in one row, the side view the whole of word B, and the top view is
 * either unconstrained (the full hull of the two words) or a shape, e.g. a
 * heart, stretched over the footprint — a GEB-style three-view solid whose
 * views are word, word and shape.
 *
 * Coverage logic: a front letter's ink at (x, z) shows iff some y has side ink
 * at (y, z) and top ink at (x, y). With no top shape nearly every capital
 * shows fully; a top shape trims letters where it is narrow (e.g. near the
 * heart's lobes and tip).
 */
import { glyphRun } from './glyph.js';

/**
 * A glyph as a filled silhouette (CrossSection, font units, y up). With
 * fillHoles, inner detail is dropped and only outer outlines are kept, which
 * is what a shadow of a line-art emoji (e.g. Noto Emoji ❤) looks like.
 */
export function glyphSilhouette(wasm, font, ch, { fillHoles = true, tolerance = 0.005 } = {}) {
  const contours = glyphRun(font, ch, { tolerance }).flatMap((g) => g.contours);
  const cs = new wasm.CrossSection(contours, 'NonZero');
  if (!fillHoles) return cs;
  // Clipper returns outer outlines counter-clockwise (positive area), holes clockwise.
  const area = (p) => p.reduce((a, [x, y], i) => { const [u, v] = p[(i + 1) % p.length]; return a + x * v - u * y; }, 0) / 2;
  const outer = cs.toPolygons().filter((p) => area(p) > 0);
  cs.delete();
  return new wasm.CrossSection(outer, 'NonZero');
}

/** Place a CrossSection into the rectangle [x0, x1] × [y0, y1] ('stretch' or 'contain'). */
function fitInto(cs, [x0, x1], [y0, y1], fit = 'stretch') {
  const { min, max } = cs.bounds();
  let sx = (x1 - x0) / (max[0] - min[0]), sy = (y1 - y0) / (max[1] - min[1]);
  if (fit === 'contain') sx = sy = Math.min(sx, sy);
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  return cs.translate([-(min[0] + max[0]) / 2, -(min[1] + max[1]) / 2]).scale([sx, sy]).translate([cx, cy]);
}

const CASE = {
  upper: (s) => s.toUpperCase(),
  lower: (s) => s.toLowerCase(),
  title: (s) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase(),
  as: (s) => s,
};

/**
 * One cell holding both whole words (and optionally a top shape).
 * @param opts.caseMode upper | lower | title | as
 * @param opts.kiss letter spacing (em overlap at the closest point; negative = gap)
 * @param opts.top { shape: CrossSection (any units), fit: 'stretch' | 'contain' } or null
 * @returns cells (compose.js format, with per-letter outlines)
 */
export function blockCells(wasm, font, wordA, wordB, { height = 20, caseMode = 'upper', kiss = -0.06, tolerance, top = null } = {}) {
  const words = [CASE[caseMode](wordA), CASE[caseMode](wordB)];
  const runs = words.map((w) => glyphRun(font, w, { tolerance, kiss }));
  // One vertical frame for both words so baselines match.
  const all = runs.flatMap((r) => r.flatMap((g) => g.contours.flat()));
  const yMin = Math.min(...all.map((p) => p[1])), yMax = Math.max(...all.map((p) => p[1]));
  const s = height / (yMax - yMin);
  const place = (run) => {
    const xs = run.flatMap((g) => g.contours.flat().map((p) => p[0]));
    const x0 = Math.min(...xs);
    return {
      width: (Math.max(...xs) - x0) * s,
      letters: run.map((g) => ({ ch: g.ch, pts: g.contours.map((c) => c.map(([x, y]) => [(x - x0) * s, (y - yMin) * s])) })),
    };
  };
  const [A, B] = runs.map(place);
  const shapes = {
    front: new wasm.CrossSection(A.letters.flatMap((l) => l.pts), 'NonZero'),
    right: new wasm.CrossSection(B.letters.flatMap((l) => l.pts), 'NonZero'),
  };
  if (top?.shape) shapes.top = fitInto(top.shape, [0, A.width], [0, B.width], top.fit);
  return [{
    box: { min: [0, 0, 0], max: [A.width, B.width, height] },
    shapes,
    letters: { front: A.letters, right: B.letters },
    label: `${words[0]}/${words[1]}`,
  }];
}
