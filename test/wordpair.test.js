import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { getManifold, loadFont } from '../src/core/index.js';
import { splits, alignLines, rowFrame, scoreCell, realizeLayout } from '../src/core/wordpair.js';

let wasm, font;
before(async () => {
  wasm = await getManifold();
  font = loadFont(await readFile(new URL('../fonts/Kanit-Black.ttf', import.meta.url)));
});

test('splits enumerates contiguous cuts', () => {
  assert.deepEqual(splits('ABC', 2), [['A', 'BC'], ['AB', 'C']]);
  assert.equal(splits('FINOLA', 3).length, 10); // C(5, 2)
});

test('2D cell scores match the 3D solid (title case, i-dot lost)', () => {
  const frame = rowFrame(font, ['Fi', 'Br']);
  for (const [a, b] of [['F', 'B'], ['i', 'r'], ['n', 'y'], ['o', 'a']]) {
    const s = scoreCell(wasm, font, a, b, frame, 'shared');
    const r = realizeLayout(wasm, font, { rows: [{ a: [a], b: [b], fit: ['shared'], frame }] });
    try {
      assert.ok(Math.abs(r.metrics.views.front.coverage - s.covA) < 1e-6, `${a}/${b} front ${r.metrics.views.front.coverage} vs ${s.covA}`);
      assert.ok(Math.abs(r.metrics.views.right.coverage - s.covB) < 1e-6, `${a}/${b} right ${r.metrics.views.right.coverage} vs ${s.covB}`);
    } finally { r.dispose(); }
  }
  // The i's dot has no partner ink in "r", so it is lost.
  assert.ok(scoreCell(wasm, font, 'i', 'r', frame, 'shared').covA < 0.95);
});

test('alignLines ranks letter-by-letter (no fragments) first for equal-length uppercase words', () => {
  const front = alignLines(wasm, font, 'HELLO', 'WORLD', { caseMode: 'upper', fits: ['shared'] });
  const [best] = front;
  assert.equal(best.cells.length, 5);
  assert.equal(best.score.fragments, 0);
  assert.ok(best.score.coverage > 0.99); // round letters overshoot flat ones slightly
  assert.equal(best.score.distortion, 0);
  // Merging letters can buy a little coverage, but strands fragments.
  assert.ok(front.some((p) => p.cells.length < 5 && p.score.fragments > 0));
});
