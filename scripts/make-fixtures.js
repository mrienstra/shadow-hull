#!/usr/bin/env node
// Regenerate test/fixtures/parity.json: reference numbers from the JS core that
// every implementation (JS, Python, ...) must reproduce. Run after an
// intentional change to geometry conventions, and review the diff.
import { readFile, writeFile } from 'node:fs/promises';
import {
  getManifold, loadFont, silhouette, buildTriplet, measure, search, VIEW_NAMES,
} from '../src/core/index.js';

const SIZE = 40;
const FONT = 'fonts/ArchivoBlack-Regular.ttf';
const round = (x, d = 6) => Number(x.toFixed(d));

const FIXED = [
  { front: 'G', right: 'E', top: 'B', transforms: { front: 0, right: 0, top: 0 } },
  { front: 'A', right: 'M', top: 'Y', transforms: { front: 4, right: 0, top: 3 } },
  { front: 'F', right: '', top: '', transforms: { front: 0, right: 0, top: 0 } },
  { front: 'X', right: 'Y', top: 'Z', transforms: { front: 1, right: 6, top: 2 } },
];
const SEARCHES = [['G', 'E', 'B'], ['A', 'M', 'Y']];

const wasm = await getManifold();
const font = loadFont(await readFile(FONT));
const out = {
  about: 'Reference results from the JS core (scripts/make-fixtures.js). Implementations must match within tolerance.',
  font: FONT, size: SIZE, fit: 'stretch', tolerance: { area_rel: 0.005, coverage_abs: 0.005, volume_rel: 0.005 },
  silhouettes: {}, fixed: [], searches: [],
};

for (const ch of new Set(FIXED.flatMap((c) => VIEW_NAMES.map((v) => c[v])))) {
  const s = silhouette(wasm, font, ch, { size: SIZE });
  const parts = s.decompose();
  out.silhouettes[ch] = { area: round(s.area()), components: parts.length };
  for (const p of [s, ...parts]) p.delete();
}

for (const c of FIXED) {
  const shapes = Object.fromEntries(VIEW_NAMES.map((v) => [v, silhouette(wasm, font, c[v], { size: SIZE })]));
  const solid = buildTriplet(wasm, shapes, c.transforms, { size: SIZE });
  const m = measure(wasm, solid, shapes, c.transforms);
  out.fixed.push({
    texts: { front: c.front, right: c.right, top: c.top }, transforms: c.transforms,
    coverage: Object.fromEntries(VIEW_NAMES.map((v) => [v, round(m.views[v].coverage)])),
    pieces: m.pieces, volume: round(m.volume, 3),
  });
  solid.delete();
  for (const s of Object.values(shapes)) s.delete();
}

for (const texts of SEARCHES) {
  const ranked = search(wasm, font, texts, { size: SIZE });
  out.searches.push({
    texts, candidates: ranked.length,
    best: { minCoverage: round(ranked[0].metrics.minCoverage), pieces: ranked[0].metrics.pieces },
  });
}

await writeFile('test/fixtures/parity.json', JSON.stringify(out, null, 2) + '\n');
console.log('wrote test/fixtures/parity.json');
