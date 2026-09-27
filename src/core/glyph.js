import opentype from 'opentype.js';

/** Parse a font file (ArrayBuffer / Buffer). Environment-neutral: no fs here. */
export function loadFont(data) {
  const buf = data instanceof ArrayBuffer
    ? data
    : data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
  return opentype.parse(buf);
}

/**
 * Outline of `text` (one or more characters, kerned) as closed polygons in
 * font units, y up. Curves are flattened so that segments are at most about
 * `tolerance` em long. `tracking` (em, may be negative) is added between
 * letters; negative values make letters overlap.
 *
 * @returns {Array<Array<[number, number]>>}
 */
export function textContours(font, text, { tolerance = 0.01, tracking = 0 } = {}) {
  const em = font.unitsPerEm;
  const maxSeg = tolerance * em;
  // Lay glyphs out ourselves (advance width + pair kerning) rather than via
  // font.getPath: its GSUB shaping throws on lookup types opentype.js doesn't
  // support, which some display fonts use. Ligatures are not applied.
  // opentype paths are y-down (canvas); negate y to get y-up.
  const glyphs = [...text].map((ch) => font.charToGlyph(ch));
  const path = { commands: [] };
  let pen = 0;
  glyphs.forEach((g, i) => {
    path.commands.push(...g.getPath(pen, 0, em).commands);
    if (i + 1 < glyphs.length) pen += g.advanceWidth + font.getKerningValue(g, glyphs[i + 1]) + tracking * em;
  });
  const contours = [];
  let cur = null;
  let x = 0, y = 0;

  const segs = (...pts) => {
    let len = 0;
    for (let i = 1; i < pts.length; i++) len += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    return Math.min(64, Math.max(2, Math.ceil(len / maxSeg)));
  };

  for (const c of path.commands) {
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
