// Shared by pack.mjs and render.mjs: every bundled font's capitals placed as in
// the review (20 mm, one frame for all 26), and the font's shared lines there.
import { readFileSync } from 'node:fs';
const R = new URL('../../', import.meta.url).pathname;
const { loadFont, glyphRun } = await import(R + 'src/core/glyph.js');
const { fontGuides } = await import(R + 'src/core/tidy.js');
export const H = 20, CAPS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
export const fonts = JSON.parse(readFileSync(R + 'fonts/fonts.json', 'utf8'));
export function fontLetters(f) {
  const font = loadFont(readFileSync(R + 'fonts/' + f.file).buffer);
  const raw = Object.fromEntries([...CAPS].map((c) => [c, glyphRun(font, c)[0].contours]));
  const ys = Object.values(raw).flat(2).map((p) => p[1]);
  const y0 = Math.min(...ys), s = H / (Math.max(...ys) - y0);
  const L = Object.fromEntries(Object.entries(raw).map(([c, cs]) => {
    const xs = cs.flat().map((p) => p[0]), x0 = Math.min(...xs);
    return [c, [{ ch: c, pts: cs.map((r) => r.map(([x, y]) => [(x - x0) * s, (y - y0) * s])) }]];
  }));
  const guides = fontGuides(font, (ch) => raw[ch] ?? glyphRun(font, ch)[0].contours).map((y) => (y - y0) * s);
  return { L, guides };
}
// One card per unordered pair of different letters (a × b and b × a are mirror images).
export const pairs = [...CAPS].flatMap((a, i) => [...CAPS].slice(i + 1).map((b) => [a, b]));
