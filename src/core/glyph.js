import opentype from 'opentype.js';
import { scanIntervals } from './scan.js';

/** Parse a font file (ArrayBuffer / Buffer). Environment-neutral: no fs here. */
export function loadFont(data) {
  const buf = data instanceof ArrayBuffer
    ? data
    : data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
  return opentype.parse(buf);
}

/** Flatten opentype path commands (y-down) into closed polygons (y-up). */
function flatten(commands, maxSeg) {
  const contours = [];
  let cur = null;
  let x = 0, y = 0;
  const segs = (...pts) => {
    let len = 0;
    for (let i = 1; i < pts.length; i++) len += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    return Math.min(64, Math.max(2, Math.ceil(len / maxSeg)));
  };
  for (const c of commands) {
    switch (c.type) {
      case 'M':
        if (cur?.length > 2) contours.push(cur);
        cur = [[c.x, -c.y]];
        break;
      case 'L':
        cur.push([c.x, -c.y]);
        break;
      case 'Q': {
        const p0 = [x, y], p1 = [c.x1, -c.y1], p2 = [c.x, -c.y];
        const n = segs(p0, p1, p2);
        for (let i = 1; i <= n; i++) {
          const t = i / n, s = 1 - t;
          cur.push([s * s * p0[0] + 2 * s * t * p1[0] + t * t * p2[0], s * s * p0[1] + 2 * s * t * p1[1] + t * t * p2[1]]);
        }
        break;
      }
      case 'C': {
        const p0 = [x, y], p1 = [c.x1, -c.y1], p2 = [c.x2, -c.y2], p3 = [c.x, -c.y];
        const n = segs(p0, p1, p2, p3);
        for (let i = 1; i <= n; i++) {
          const t = i / n, s = 1 - t;
          const a = s * s * s, b = 3 * s * s * t, d = 3 * s * t * t, e = t * t * t;
          cur.push([a * p0[0] + b * p1[0] + d * p2[0] + e * p3[0], a * p0[1] + b * p1[1] + d * p2[1] + e * p3[1]]);
        }
        break;
      }
      case 'Z':
        if (cur?.length > 2) contours.push(cur);
        cur = null;
        continue;
    }
    if (c.type !== 'Z') [x, y] = [c.x, -c.y];
  }
  if (cur?.length > 2) contours.push(cur);
  return contours;
}

const shift = (contours, dx) => contours.map((c) => c.map(([x, y]) => [x + dx, y]));

/**
 * Horizontal offset that makes `right` (placed at 0) just touch `left`:
 * the smallest gap between left's right edge and right's left edge over all
 * heights where both have ink becomes -overlap. Null if they share no height.
 */
export function kissOffset(left, right, overlap, levels = 96) {
  const ys = [...left, ...right].flat().map((p) => p[1]);
  const y0 = Math.min(...ys), y1 = Math.max(...ys);
  let best = Infinity;
  for (let k = 0; k < levels; k++) {
    const y = y0 + ((k + 0.5) / levels) * (y1 - y0);
    const a = scanIntervals(left, y), b = scanIntervals(right, y);
    if (!a.length || !b.length) continue;
    best = Math.min(best, b[0][0] - a[a.length - 1][1]);
  }
  return best === Infinity ? null : -overlap - best;
}

/**
 * Glyphs of `text` laid out left to right, each as closed polygons in font
 * units (y up). Curves are flattened so segments are at most about
 * `tolerance` em long.
 * - `tracking` (em, may be negative) is added to advance + kerning.
 * - `kiss` (em): instead of advances, place each letter so it just touches
 *   the letters before it, overlapping by `kiss` at the closest point
 *   (letters that share no height fall back to advance + tracking).
 * We lay glyphs out ourselves rather than via font.getPath: its GSUB shaping
 * throws on lookup types opentype.js doesn't support, which some display
 * fonts use. Ligatures are not applied.
 *
 * @returns {Array<{ ch: string, contours: Array<Array<[number, number]>> }>}
 */
export function glyphRun(font, text, { tolerance = 0.01, tracking = 0, kiss = null } = {}) {
  const em = font.unitsPerEm;
  const glyphs = [...text].map((ch) => ({ ch, g: font.charToGlyph(ch) }));
  const out = [];
  let pen = 0;
  glyphs.forEach(({ ch, g }, i) => {
    let contours = flatten(g.getPath(0, 0, em).commands, tolerance * em);
    if (kiss != null && i > 0) {
      const prev = out.flatMap((o) => o.contours);
      const dx = kissOffset(prev, contours, kiss * em);
      contours = shift(contours, dx ?? pen);
    } else {
      contours = shift(contours, pen);
    }
    out.push({ ch, contours });
    if (i + 1 < glyphs.length) pen += g.advanceWidth + font.getKerningValue(g, glyphs[i + 1].g) + tracking * em;
  });
  return out;
}

/** All glyph outlines of `text` as one list of polygons (see glyphRun). */
export function textContours(font, text, opts = {}) {
  return glyphRun(font, text, opts).flatMap((g) => g.contours);
}
