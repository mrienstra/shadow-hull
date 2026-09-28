import { test } from 'node:test';
import assert from 'node:assert/strict';
import { columnSlivers } from '../src/core/slivers.js';
import { featureNearMisses } from '../src/core/tidy.js';

// Letters as { pts: contours in (u, z) }: rectangles [u0, u1] × [z0, z1].
const rect = (u0, u1, z0, z1) => [[u0, z0], [u1, z0], [u1, z1], [u0, z1]];
const letter = (...rects) => [{ ch: '?', pts: rects }];
const square = letter(rect(0, 10, 0, 10));

test('columnSlivers: a thin layer is knife volume, a thin slot is cut volume', () => {
  // A 0.5 mm layer at the bottom, a 1.5 mm gap, then the rest: 10 × 10 × 0.5 = 50 mm³ of knife.
  const layer = columnSlivers(square, letter(rect(0, 10, 0, 0.5), rect(0, 10, 2, 10)));
  assert.ok(Math.abs(layer.knife - 50) < 1, `knife ${layer.knife}`);
  assert.ok(layer.cut < 1e-9, 'a 1.5 mm gap is not a thin cut');
  // A 0.4 mm slot between two thick blocks: 10 × 10 × 0.4 = 40 mm³ of cut.
  const slot = columnSlivers(square, letter(rect(0, 10, 0, 5), rect(0, 10, 5.4, 10)));
  assert.ok(Math.abs(slot.cut - 40) < 1, `cut ${slot.cut}`);
  assert.ok(slot.knife < 1e-9);
  // A plain cube has neither.
  const cube = columnSlivers(square, square);
  assert.ok(cube.knife < 1e-9 && cube.cut < 1e-9 && Math.abs(cube.volume - 1000) < 1);
});

test('featureNearMisses: close but unequal feature heights', () => {
  const a = letter(rect(0, 10, 0, 10), rect(10, 14, 4, 6)); // an arm 4–6
  const b = letter(rect(0, 10, 0, 10), rect(10, 14, 4.3, 6)); // an arm 4.3–6
  const r = featureNearMisses(a, b);
  assert.equal(r.count, 1, 'only 4 vs 4.3 is a near-miss (6 = 6 lines up)');
});
