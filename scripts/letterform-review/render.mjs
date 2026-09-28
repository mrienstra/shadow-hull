// Before/after 3D renders of every arm-to-corner move, one WebP sheet per font.
import { readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'vite';
import { chromium } from 'playwright-core';
const R = '/Users/m/Documents/GitHub/shadow-hull/';
const OUT = process.argv[2];
const { loadFont, glyphRun } = await import(R + 'src/core/glyph.js');
const { tidyPair } = await import(R + 'src/core/wordpair.js');
const { getManifold, faceRuns } = await import(R + 'src/core/index.js');
const { buildComposition, disposeCells } = await import(R + 'src/core/compose.js');
const wasm = await getManifold();
const pack = JSON.parse(readFileSync(OUT + '/pack.json', 'utf8'));
const fonts = JSON.parse(readFileSync(R + 'fonts/fonts.json', 'utf8'));
const H = 20, CAPS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', COLS = 4;
const server = await createServer({ root: R + 'scripts/letterform-review/render-page', logLevel: 'silent', server: { port: 0 } });
await server.listen();
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal'] });
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('page error', e.message));
await page.goto(server.resolvedUrls.local[0]);
await page.waitForFunction(() => window.ready);
const r2 = (v) => Math.round(v * 100) / 100;
function solidOf(la, lb) {
  const w = (ls) => Math.max(...ls[0].pts.flat().map((p) => p[0]));
  const cells = [{ box: { min: [0, 0, 0], max: [w(la), w(lb), H] }, shapes: {
    front: new wasm.CrossSection(la[0].pts, 'NonZero'), right: new wasm.CrossSection(lb[0].pts, 'NonZero') } }];
  const solid = buildComposition(wasm, cells);
  const m = solid.getMesh();
  const pos = [];
  for (let i = 0; i < m.vertProperties.length; i += m.numProp) pos.push(m.vertProperties[i], m.vertProperties[i + 1], m.vertProperties[i + 2]);
  const out = { pos, idx: [...m.triVerts], runs: faceRuns(m) };
  solid.delete(); disposeCells(cells);
  return out;
}
const knots = JSON.parse(readFileSync(OUT + '/knots.json', 'utf8'));
const { fontLetters } = await import('./letters.mjs');
const { warpHeights, levelHeights } = await import(R + 'src/core/tidy.js');
for (const fp of pack) {
  const f = fonts.find((x) => x.id === fp.id);
  const { L } = fontLetters(f);
  const warp = (ls, ks) => (ks.length ? warpHeights(ls, levelHeights(ls).map((z) => [z, new Map(ks).get(z) ?? z])) : ls);
  const jobs = knots[fp.id].map(({ a, b, knots: k }) => ({ a, b, ra: warp(L[a], k.a), rb: warp(L[b], k.b) }));
  if (jobs.length !== fp.cards.length) throw new Error(`${fp.name}: ${jobs.length} vs ${fp.cards.length}`);
  await page.evaluate(([n, c]) => window.startSheet(n, c), [jobs.length, COLS]);
  for (let i = 0; i < jobs.length; i++) {
    const { a, b, ra, rb } = jobs[i];
    const before = solidOf(L[a], L[b]), after = solidOf(ra, rb);
    // Frame both the same way: the cell's bounding sphere.
    const wa = Math.max(...L[a][0].pts.flat().map((p) => p[0])), wb = Math.max(...L[b][0].pts.flat().map((p) => p[0]));
    const fit = { centre: [wa / 2, wb / 2, H / 2], radius: Math.hypot(wa, wb, H) / 2 };
    await page.evaluate(([m, i, fit]) => window.draw(m, i, 0, fit), [before, i, fit]);
    await page.evaluate(([m, i, fit]) => window.draw(m, i, 1, fit), [after, i, fit]);
  }
  const data = await page.evaluate(() => window.sheetData());
  writeFileSync(`${OUT}/sheets/${fp.id}.webp`, Buffer.from(data.split(',')[1], 'base64'));
  console.log(fp.name, jobs.length, 'moves rendered');
}
await browser.close(); await server.close();
