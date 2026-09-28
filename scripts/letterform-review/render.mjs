// Before/after 3D renders of every arm-to-corner move, one WebP sheet per font.
import { readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'vite';
import { chromium } from 'playwright-core';
const R = '/Users/m/Documents/GitHub/shadow-hull/';
const OUT = process.argv[2];
const { loadFont, glyphRun } = await import(R + 'src/core/glyph.js');
const { alignCorners } = await import(R + 'src/core/wordpair.js');
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
for (const fp of pack) {
  const f = fonts.find((x) => x.id === fp.id);
  const font = loadFont(readFileSync(R + 'fonts/' + f.file).buffer);
  const raw = Object.fromEntries([...CAPS].map((c) => [c, glyphRun(font, c)[0].contours]));
  const ys = Object.values(raw).flat(2).map((p) => p[1]);
  const y0 = Math.min(...ys), s = H / (Math.max(...ys) - y0);
  const L = Object.fromEntries(Object.entries(raw).map(([c, cs]) => {
    const xs = cs.flat().map((p) => p[0]), x0 = Math.min(...xs);
    return [c, [{ ch: c, pts: cs.map((r) => r.map(([x, y]) => [(x - x0) * s, (y - y0) * s])) }]];
  }));
  // Same moves, order and de-duplication as pack.mjs.
  const seen = new Set(), jobs = [];
  for (const a of CAPS) for (const b of CAPS) {
    const res = alignCorners(L[a], L[b], { tol: 0.15 * H });
    for (const m of res.moved) {
      const mv = m.side === 'a' ? a : b, ot = m.side === 'a' ? b : a, k = mv + ot + r2(m.by);
      if (seen.has(k)) continue; seen.add(k);
      // Render with the moved letter in front (orange), as the page's outlines put it on the left;
      // the move is the same in a×b and b×a, and the solids are mirror images.
      jobs.push(m.side === 'a' ? { a, b, ra: res.a, rb: res.b } : { a: b, b: a, ra: res.b, rb: res.a });
    }
  }
  if (jobs.length !== fp.moves.length) throw new Error(`${fp.name}: ${jobs.length} vs ${fp.moves.length}`);
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
