// Review data (see build.mjs): per font, each capital's outline and level
// heights once, and tidyPair's result (as the app makes it) for every pair.
// Writes <out>/pack.json (for the page, rounded) and <out>/knots.json (full
// precision, for render.mjs).
import { writeFileSync } from 'node:fs';
import { fonts, fontLetters, pairs } from './letters.mjs';
const R = new URL('../../', import.meta.url).pathname;
const { tidyPair, levelHeights } = await import(R + 'src/core/wordpair.js');
const out = process.argv[2];
const r1 = (v) => Math.round(v * 10) / 10, r2 = (v) => Math.round(v * 100) / 100;
const page = [], full = {};
for (const f of fonts) {
  const { L, guides } = fontLetters(f);
  const letters = {};
  for (const [c, [l]] of Object.entries(L)) {
    letters[c] = { d: l.pts.map((r) => r.map(([u, z]) => `${r1(u)},${r1(z)}`).join(' ')).join('|'), w: r2(Math.max(...l.pts.flat().map((p) => p[0]))), lv: levelHeights(L[c]).map(r2) };
  }
  const cards = [];
  full[f.id] = [];
  for (const [a, b] of pairs) {
    const r = tidyPair(L[a], L[b], { tol: 3, guides: { a: guides, b: guides } });
    if (!r.moved.length) continue;
    // How much any band of either letter changed height (largest, as a fraction).
    const change = Math.max(...['a', 'b'].map((s) => {
      const lv = levelHeights(s === 'a' ? L[a] : L[b]), to = new Map(r.knots[s]);
      return Math.max(0, ...lv.slice(1).map((z, i) => Math.abs(((to.get(z) ?? z) - (to.get(lv[i]) ?? lv[i])) / (z - lv[i]) - 1)));
    }));
    cards.push({
      a, b, ka: r.knots.a.map(([x, y]) => [r2(x), r2(y)]), kb: r.knots.b.map(([x, y]) => [r2(x), r2(y)]),
      moves: r.moved.map((m) => ({ kind: m.kind, levels: m.levels.map(([s, x, y]) => [s, r2(x), r2(y)]), target: r2(m.target), targetKind: m.targetKind })),
      change: r2(change), k0: r2(r.before.knife), k1: r2(r.after.knife), c0: r2(r.before.cut), c1: r2(r.after.cut),
    });
    full[f.id].push({ a, b, knots: r.knots });
  }
  page.push({ id: f.id, name: f.name, letters, cards, guides: guides.map(r2) });
  console.log(f.name, cards.length, 'cards');
}
writeFileSync(`${out}/pack.json`, JSON.stringify(page));
writeFileSync(`${out}/knots.json`, JSON.stringify(full));
