// For tidy moves: when the column measure says a move removes sliver material,
// does the voxel ground truth agree? node scripts/validate-slivers-moves.mjs
import { readFileSync } from 'node:fs';
import { getManifold, loadFont, thinFeatures } from '../src/core/index.js';
import { layoutCells, alignCorners } from '../src/core/wordpair.js';
import { buildComposition, disposeCells } from '../src/core/compose.js';
import { columnSlivers } from '../src/core/slivers.js';

const T = 0.8, wasm = await getManifold();
const pick = (process.argv[2] ?? 'bungee,kanit-black,archivo-black').split(',');
const fonts = JSON.parse(readFileSync(new URL('../fonts/fonts.json', import.meta.url), 'utf8')).filter((f) => pick.includes(f.id));
const CAPS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const voxel = (A, B, box) => {
  const cells = [{ box, shapes: { front: new wasm.CrossSection(A.flatMap((l) => l.pts), 'NonZero'), right: new wasm.CrossSection(B.flatMap((l) => l.pts), 'NonZero') } }];
  const s = buildComposition(wasm, cells);
  const v = thinFeatures(s, { minThickness: T, voxel: 0.16 }).thinVolume;
  s.delete(); disposeCells(cells);
  return v;
};
const rows = [];
for (const f of fonts) {
  const font = loadFont(readFileSync(new URL(`../fonts/${f.file}`, import.meta.url)));
  for (const a of CAPS) for (const b of CAPS) {
    const [c] = layoutCells(wasm, font, { rows: [{ a: [a], b: [b] }] }, { height: 20 });
    const r = alignCorners(c.letters.front, c.letters.right);
    if (r.moved.length) {
      const k0 = columnSlivers(c.letters.front, c.letters.right, { t: T }).knife, k1 = columnSlivers(r.a, r.b, { t: T }).knife;
      const v0 = voxel(c.letters.front, c.letters.right, c.box), v1 = voxel(r.a, r.b, c.box);
      rows.push({ font: f.name, pair: a + b, strain: r.moved[0].strain, k0, k1, v0, v1 });
    }
    c.shapes.front.delete(); c.shapes.right.delete();
  }
  console.error(f.name, 'done');
}
const sgn = (x) => (Math.abs(x) < 0.05 ? 0 : Math.sign(x));
let agree = 0;
for (const r of rows) if (sgn(r.k1 - r.k0) === sgn(r.v1 - r.v0)) agree++;
console.log(`${rows.length} moves. Column and voxel agree on the direction of change (±0.05 mm³) in ${agree} (${Math.round((100 * agree) / rows.length)}%).`);
const by = (p) => rows.filter(p).length;
console.log(`Column: better ${by((r) => r.k1 < r.k0 - 0.05)}, same ${by((r) => Math.abs(r.k1 - r.k0) <= 0.05)}, worse ${by((r) => r.k1 > r.k0 + 0.05)}. Voxel: better ${by((r) => r.v1 < r.v0 - 0.05)}, same ${by((r) => Math.abs(r.v1 - r.v0) <= 0.05)}, worse ${by((r) => r.v1 > r.v0 + 0.05)}.`);
console.log('Disagreements:');
for (const r of rows.filter((r) => sgn(r.k1 - r.k0) !== sgn(r.v1 - r.v0)).slice(0, 15)) console.log(`  ${r.font.padEnd(14)} ${r.pair} strain ${r.strain.toFixed(2)}  column ${r.k0.toFixed(2)}→${r.k1.toFixed(2)}  voxel ${r.v0.toFixed(2)}→${r.v1.toFixed(2)}`);
