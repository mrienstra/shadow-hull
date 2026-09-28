// Do the fast sliver measures agree with the voxel ground truth?
// node scripts/validate-slivers.mjs [pairs=200] → rank correlations + a table.
// Random capital pairs × bundled fonts, one cell each (20 mm, shared frame),
// before any tidying. See resources/research/letterform-tidy.md.
import { readFileSync } from 'node:fs';
import { getManifold, loadFont, thinFeatures } from '../src/core/index.js';
import { layoutCells } from '../src/core/wordpair.js';
import { buildComposition, disposeCells } from '../src/core/compose.js';
import { columnSlivers, featureNearMisses } from '../src/core/slivers.js';

const N = +(process.argv[2] ?? 200), T = 0.8;
const wasm = await getManifold();
const fonts = JSON.parse(readFileSync(new URL('../fonts/fonts.json', import.meta.url), 'utf8'))
  .map((f) => ({ ...f, font: loadFont(readFileSync(new URL(`../fonts/${f.file}`, import.meta.url))) }));
let seed = 12345;
const rand = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
const CAPS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const rows = [];
for (let n = 0; n < N; n++) {
  const f = fonts[Math.floor(rand() * fonts.length)];
  const a = CAPS[Math.floor(rand() * 26)], b = CAPS[Math.floor(rand() * 26)];
  const [c] = layoutCells(wasm, f.font, { rows: [{ a: [a], b: [b] }] }, { height: 20 });
  const col = columnSlivers(c.letters.front, c.letters.right, { t: T });
  const fe = featureNearMisses(c.letters.front, c.letters.right, { t: T });
  const solid = buildComposition(wasm, [c]);
  const thin = thinFeatures(solid, { minThickness: T, voxel: 0.16 }).thinVolume;
  const gaps = thinFeatures(solid, { minThickness: T, voxel: 0.16, gaps: true }).thinVolume;
  solid.delete(); disposeCells([c]);
  rows.push({ font: f.name, pair: a + b, thin, gaps, knife: col.knife, cut: col.cut, near: fe.weight, count: fe.count, distinct: fe.distinct });
  if ((n + 1) % 25 === 0) console.error(`${n + 1}/${N}`);
}
const rank = (xs) => { const idx = xs.map((x, i) => [x, i]).sort((p, q) => p[0] - q[0]); const r = new Array(xs.length); for (let i = 0; i < idx.length;) { let j = i; while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++; for (let k = i; k <= j; k++) r[idx[k][1]] = (i + j) / 2; i = j + 1; } return r; };
const pearson = (x, y) => { const m = (v) => v.reduce((s, t) => s + t, 0) / v.length; const mx = m(x), my = m(y); let a = 0, b = 0, c = 0; for (let i = 0; i < x.length; i++) { a += (x[i] - mx) * (y[i] - my); b += (x[i] - mx) ** 2; c += (y[i] - my) ** 2; } return a / Math.sqrt(b * c); };
const spearman = (x, y) => pearson(rank(x), rank(y));
const col = (k) => rows.map((r) => r[k]);
console.log(`${N} pairs, t = ${T} mm. Spearman rank correlation with the voxel ground truth:`);
for (const [truth, label] of [['thin', 'thin material (knives)'], ['gaps', 'thin air (cuts)']]) {
  console.log(`  ${label}:`, ['knife', 'cut', 'near', 'count', 'distinct'].map((k) => `${k} ${spearman(col(truth), col(k)).toFixed(2)}`).join('  '));
}
console.log('  thin + gaps vs knife + cut:', spearman(rows.map((r) => r.thin + r.gaps), rows.map((r) => r.knife + r.cut)).toFixed(2));
console.log('Largest voxel-thin pairs:');
for (const r of [...rows].sort((p, q) => q.thin - p.thin).slice(0, 8)) console.log(`  ${r.font.padEnd(18)} ${r.pair}  thin ${r.thin.toFixed(2)}  knife ${r.knife.toFixed(2)}  gaps ${r.gaps.toFixed(2)}  cut ${r.cut.toFixed(2)}  near ${r.near.toFixed(2)}`);
