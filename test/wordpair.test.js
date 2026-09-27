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

test('scanline fragment counts agree with 3D on common letter pairs', async () => {
  const { cellFragments, cellFragmentsScan } = await import('../src/core/wordpair.js');
  const frame = rowFrame(font, [...'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz']);
  const pairs = [['F', 'B'], ['i', 'r'], ['LA', 'N'], ['o', 'a'], ['NO', 'Y'], ['fi', 'b'], ['M', 'W']];
  for (const [a, b] of pairs) {
    for (const fit of ['shared', 'fill']) {
      assert.equal(cellFragmentsScan(font, a, b, frame, fit), cellFragments(wasm, font, a, b, frame, fit), `${a}/${b} ${fit}`);
    }
  }
});

test('kissOffset makes shapes just touch; letterVisibility sees overlaps', async () => {
  const { kissOffset } = await import('../src/core/glyph.js');
  const { letterVisibility } = await import('../src/core/compose.js');
  const sq = (x0, w) => [[[x0, 0], [x0 + w, 0], [x0 + w, 10], [x0, 10]]];
  // Right square placed at 0 must move to 10 - 0.5 to overlap the left one by 0.5.
  assert.ok(Math.abs(kissOffset(sq(0, 10), sq(0, 4), 0.5) - 9.5) < 1e-9);
  // No shared heights: no kiss.
  assert.equal(kissOffset(sq(0, 10), [[[0, 20], [4, 20], [4, 30], [0, 30]]], 0.5), null);
  const cells = [{ letters: { front: [{ ch: 'A', pts: sq(0, 10) }, { ch: 'B', pts: sq(7.5, 10) }] } }];
  const v = letterVisibility(wasm, cells);
  assert.ok(Math.abs(v.views.front[0].visible - 0.75) < 1e-9);
  assert.equal(v.worst.visible, v.views.front[0].visible);
});

test('kiss spacing keeps every Finola/Bryan letter at least 90% visible', () => {
  const layout = { rows: [{ a: ['F', 'I', 'N', 'O', 'LA'], b: ['B', 'R', 'Y', 'A', 'N'] }] };
  const r = realizeLayout(wasm, font, layout, { gap: 'kiss', overlap: 0.3, kiss: 0.01 });
  const fixed = realizeLayout(wasm, font, layout, { gap: -4, tracking: -0.06 });
  return import('../src/core/compose.js').then(({ letterVisibility }) => {
    try {
      assert.ok(letterVisibility(wasm, r.cells).worst.visible > 0.9);
      assert.ok(letterVisibility(wasm, fixed.cells).worst.visible < 0.5, 'fixed overlap hides a letter');
    } finally { r.dispose(); fixed.dispose(); }
  });
});
