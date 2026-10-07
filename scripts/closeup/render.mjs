// Close-up renders of a finished design, for checking geometry by eye.
//   node scripts/closeup/render.mjs '<json>' out.png
// json: { font, a, b, look, knobs, cell, focus?: [x,y,z], radius, dirs?, variants?: [knobs…] }
// Each variant (knob overrides) is one row; the default view directions are
// three: 3/4 above, from below-left, from the right. Focus defaults to the
// sharpest edge in `cell` (as drawn, before trimming).
import { readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'vite';
import { chromium } from 'playwright-core';
import { getManifold, loadFont } from '../../src/core/index.js';
import { generateLook } from '../../src/core/looks.js';
import { buildRecipe, designView } from '../../src/core/gallery.js';
import { sharpEdges } from '../../src/core/sharp.js';
const root = new URL('../../', import.meta.url).pathname;
const o = JSON.parse(process.argv[2]), out = process.argv[3];
const w = await getManifold();
const ctx = { wasm: w, font: loadFont(readFileSync(`${root}fonts/${o.font}`)), shapeFont: loadFont(readFileSync(`${root}fonts/shapes/NotoEmoji.ttf`)), height: 20 };
const server = await createServer({ root: `${root}scripts/closeup`, logLevel: 'silent', server: { port: 0 } });
await server.listen();
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage();
await page.goto(server.resolvedUrls.local[0]);
await page.waitForFunction(() => window.ready);
const dirs = o.dirs ?? [[[1.1, -1.6, 1.2], [0, 0, 1]], [[-1.2, -1.4, 0.6], [0, 0, 1]], [[1.4, 1.2, 0.5], [0, 0, 1]]];
let focus = o.focus, rows = [];
for (const variant of o.variants ?? [{}]) {
  const knobs = { ...o.knobs, ...variant };
  const [it] = generateLook(ctx, o.a ?? 'Finola', o.b ?? 'Bryan', o.look ?? 'row', knobs);
  const d = buildRecipe(ctx, o.a ?? 'Finola', o.b ?? 'Bryan', { ...it.recipe, ...(variant.trim !== undefined ? { trim: variant.trim } : {}) });
  if (!focus) {
    const bx = d.cells.find((c) => c.label === o.cell)?.box ?? { min: [-1e9, -1e9, -1e9], max: [1e9, 1e9, 1e9] };
    const inBox = (p) => p[0] >= bx.min[0] - 0.1 && p[0] <= bx.max[0] + 0.1 && p[1] >= bx.min[1] - 0.1 && p[1] <= bx.max[1] + 0.1;
    const e = sharpEdges(d.solid.getMesh()).edges.find((x) => inBox(x.a));
    focus = e ? e.a.map((q, i) => (q + e.b[i]) / 2) : bx.min.map((q, i) => (q + bx.max[i]) / 2);
  }
  const v = designView(w, d, { turn: 0 });
  const m = v.mesh, pos = [];
  for (let i = 0; i < m.vertProperties.length; i += m.numProp) pos.push(m.vertProperties[i], m.vertProperties[i + 1], m.vertProperties[i + 2]);
  rows.push(await page.evaluate(([mm, c, r, ds]) => window.shots(mm, c, r, ds), [{ pos, idx: [...m.triVerts], runs: v.runs }, focus, o.radius ?? 3, dirs]));
  d.dispose();
}
// Stack the rows into one PNG.
const stacked = await page.evaluate(async (urls) => {
  const imgs = await Promise.all(urls.map((u) => new Promise((ok) => { const i = new Image(); i.onload = () => ok(i); i.src = u; })));
  const c = document.createElement('canvas'); c.width = imgs[0].width; c.height = imgs.reduce((s, i) => s + i.height, 0);
  let y = 0; for (const i of imgs) { c.getContext('2d').drawImage(i, 0, y); y += i.height; }
  return c.toDataURL('image/png');
}, rows);
writeFileSync(out, Buffer.from(stacked.split(',')[1], 'base64'));
console.log('wrote', out, 'focus', focus.map((x) => x.toFixed(2)).join(','));
await browser.close(); await server.close();
