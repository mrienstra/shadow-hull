import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { getManifold, loadFont } from '../src/core/index.js';
import { designQuality, designWordPair, QUALITY_WEIGHTS } from '../src/core/design.js';

let wasm, font;
before(async () => {
  wasm = await getManifold();
  font = loadFont(await readFile(new URL('../fonts/Kanit-Black.ttf', import.meta.url)));
});

const base = { coverage: 1, visibleMin: 1, contactMax: 0, stretch: 0, strayMax: 0, finalPieces: 1, imbalance: 0 };

test('designQuality: perfect design scores 1; each defect lowers it', () => {
  assert.equal(designQuality(base), 1);
  for (const [k, v] of [['coverage', 0.9], ['visibleMin', 0.7], ['contactMax', 1.3], ['stretch', 0.8], ['strayMax', 0.03], ['finalPieces', 2], ['imbalance', 2]]) {
    assert.ok(designQuality({ ...base, [k]: v }) < 1, k);
  }
  // Small amounts are free: 97% visible, contact 0.1 row heights.
  assert.equal(designQuality({ ...base, visibleMin: 0.97, contactMax: 0.1 }), 1);
  // Merged stems cost less than a 30%-hidden letter (see QUALITY_WEIGHTS).
  assert.ok(designQuality({ ...base, contactMax: 1.3 }) > designQuality({ ...base, visibleMin: 0.7 }));
  assert.ok(QUALITY_WEIGHTS.pieces > 0);
});

test('designWordPair: one design per style, best first, all joined into one piece', () => {
  const designs = designWordPair(wasm, font, 'HI', 'OK', { spacing: 'spaced', cases: ['upper'], rows: [1, 2], candidates: 2 });
  assert.deepEqual(designs.map((d) => d.style).sort(), ['upper, 1 row', 'upper, 2 rows']);
  for (let i = 1; i < designs.length; i++) assert.ok(designs[i - 1].metrics.quality >= designs[i].metrics.quality);
  for (const d of designs) {
    assert.equal(d.metrics.finalPieces, 1);
    assert.ok(Math.abs(d.metrics.quality - designQuality(d.metrics)) < 1e-12);
    for (const r of d.runnersUp) assert.ok(r.metrics.quality <= d.metrics.quality);
  }
});
