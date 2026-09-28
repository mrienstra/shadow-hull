// Arm-to-corner review data (see build.mjs): per font, each capital's outline
// and level heights once, and every tidyPair move (as the app makes them) over all 676 pairs.
import { readFileSync, writeFileSync } from 'node:fs';
const R = '/Users/m/Documents/GitHub/shadow-hull/';
const { loadFont, glyphRun } = await import(R + 'src/core/glyph.js');
const { tidyPair, levelHeights } = await import(R + 'src/core/wordpair.js');
const fonts = JSON.parse(readFileSync(R + 'fonts/fonts.json', 'utf8'));
const H = 20, CAPS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const r1 = (v) => Math.round(v * 10) / 10, r2 = (v) => Math.round(v * 100) / 100;
const out = [];
for (const f of fonts) {
  let font; try { font = loadFont(readFileSync(R + 'fonts/' + f.file).buffer); } catch (e) { console.log('skip', f.name, e.message); continue; }
  const raw = Object.fromEntries([...CAPS].map((c) => [c, glyphRun(font, c)[0].contours]));
  const ys = Object.values(raw).flat(2).map((p) => p[1]);
  const y0 = Math.min(...ys), s = H / (Math.max(...ys) - y0);
  const L = Object.fromEntries(Object.entries(raw).map(([c, cs]) => {
    const xs = cs.flat().map((p) => p[0]), x0 = Math.min(...xs);
    return [c, [{ ch: c, pts: cs.map((r) => r.map(([x, y]) => [(x - x0) * s, (y - y0) * s])) }]];
  }));
  const letters = {};
  for (const c of CAPS) {
    const pts = L[c][0].pts;
    letters[c] = { d: pts.map((r) => r.map(([u, z]) => `${r1(u)},${r1(z)}`).join(' ')).join('|'), w: r2(Math.max(...pts.flat().map((p) => p[0]))), lv: levelHeights(L[c]).map(r2) };
  }
  const moves = [];
  let near = 0;
  for (const a of CAPS) for (const b of CAPS) {
    const res = tidyPair(L[a], L[b], { tol: 0.15 * H });
    // Fields: moved, other, by, band, target height, strain, knife before/after,
    // cut before/after (mm³, column measure), target kind ('edge' | 'corner'),
    // the band's new edges (a band may also get a little taller or shorter).
    for (const m of res.moved) {
      moves.push([m.side === 'a' ? a : b, m.side === 'a' ? b : a, r2(m.by), m.band.map(r2), r2(m.target), r2(m.strain),
        r2(m.before.knife), r2(m.after.knife), r2(m.before.cut), r2(m.after.cut), m.kind, m.to.map(r2)]);
    }
    const A = levelHeights(res.a), B = levelHeights(res.b);
    if (A.some((za) => B.some((zb) => { const d = Math.abs(za - zb); return d > 1e-3 && d <= 0.6; }))) near++;
  }
  // One card per (moved letter, corner letter): the same pair appears as a×b and b×a.
  const seen = new Set();
  const uniq = moves.filter((m) => { const k = m[0] + m[1] + m[2]; if (seen.has(k)) return false; seen.add(k); return true; });
  out.push({ id: f.id, name: f.name, letters, moves: uniq, near });
  console.log(f.name, uniq.length, 'cards; near-miss pairs', near);
}
writeFileSync(process.argv[2], JSON.stringify(out));
