// Where does a finished design have material thinner than a threshold, and
// knife (sharp) edges?
// node scripts/check-thin.mjs [font file] [look] [t]  → counts by letter pair and height.
// Ray-casts vertical lines through the built (joined) mesh, so it also sees
// what tidying and joining did, and zero-thickness sheets (as runs of 0).
import { readFileSync } from 'node:fs';
import { getManifold, loadFont } from '../src/core/index.js';
import { generateLook } from '../src/core/looks.js';
import { buildRecipe } from '../src/core/gallery.js';
import { sharpEdges } from '../src/core/sharp.js';
const [file = 'Bungee-Regular.ttf', look = 'row', T = '0.3'] = process.argv.slice(2);
const w = await getManifold();
const ctx = { wasm: w, font: loadFont(readFileSync(new URL(`../fonts/${file}`, import.meta.url))), height: 20 };
const [it] = generateLook(ctx, 'Finola', 'Bryan', look, {});
const d = buildRecipe(ctx, 'Finola', 'Bryan', it.recipe);
const m = d.joined.getMesh(), P = m.vertProperties, n = m.numProp, V = m.triVerts;
// Vertical ray (x, y) against every triangle: sorted hit heights.
const tris = [];
for (let t = 0; t < V.length; t += 3) tris.push([0, 1, 2].map((k) => [P[V[t + k] * n], P[V[t + k] * n + 1], P[V[t + k] * n + 2]]));
const hits = (x, y) => {
  const zs = [];
  for (const [a, b, c] of tris) {
    const det = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1]);
    if (Math.abs(det) < 1e-12) continue;
    const l1 = ((b[1] - c[1]) * (x - c[0]) + (c[0] - b[0]) * (y - c[1])) / det, l2 = ((c[1] - a[1]) * (x - c[0]) + (a[0] - c[0]) * (y - c[1])) / det, l3 = 1 - l1 - l2;
    if (l1 < 0 || l2 < 0 || l3 < 0) continue;
    zs.push(l1 * a[2] + l2 * b[2] + l3 * c[2]);
  }
  return zs.sort((p, q) => p - q);
};
const { min, max } = d.joined.boundingBox();
const cellOf = (x, y) => d.cells.find((c) => x >= c.box.min[0] && x <= c.box.max[0] && y >= c.box.min[1] && y <= c.box.max[1])?.label ?? '(join)';
const found = {};
for (let x = min[0] + 0.05; x < max[0]; x += 0.2) for (let y = min[1] + 0.05; y < max[1]; y += 0.2) {
  const zs = hits(x, y);
  for (let k = 0; k + 1 < zs.length; k += 2) {
    const len = zs[k + 1] - zs[k];
    if (len < +T) { const key = `${cellOf(x, y)} at ${(zs[k] + 20).toFixed(2)} mm, ${len.toFixed(2)} thick`; found[key] = (found[key] ?? 0) + 1; if (process.env.WHERE && key.startsWith(process.env.WHERE) && !found[key + '@']) { found[key + '@'] = 1; console.log('  e.g. at', x.toFixed(2), y.toFixed(2), 'hits', zs.map((z) => (z + 20).toFixed(3)).join(' ')); } }
  }
}
const list = Object.entries(found).filter(([k]) => !k.endsWith('@')).sort((p, q) => q[1] - p[1]);
console.log(`${file} ${look}: ${list.reduce((s, [, c]) => s + c, 0)} spots under ${T} mm`);
for (const [k, c] of list.slice(0, 15)) console.log(`  ${k} ×${c}`);
// Sharp (knife) edges: convex edges under 60° and 45°, by pair (thin spots above
// also count smooth rounded corners; these don't).
for (const a of [60, 45]) {
  const sh = sharpEdges(d.joined.getMesh(), { maxAngle: a }), by = {};
  for (const e of sh.edges) { const k = cellOf(e.a[0], e.a[1]); by[k] = (by[k] ?? 0) + e.length; }
  console.log(`sharp edges under ${a}°: ${sh.length.toFixed(1)} mm`, JSON.stringify(Object.fromEntries(Object.entries(by).map(([k, v]) => [k, +v.toFixed(1)]))));
}
d.dispose();
