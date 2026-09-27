import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { getManifold, loadFont } from '../src/core/index.js';
import { compositions, spanColumnCells } from '../src/core/column.js';
import { disposeCells } from '../src/core/compose.js';
import { designSpanColumn } from '../src/core/design.js';

let wasm, font;
before(async () => {
  wasm = await getManifold();
  font = loadFont(await readFile(new URL('../fonts/Kanit-Black.ttf', import.meta.url)));
});

test('compositions: ordered sums with bounded parts', () => {
  const key = (xs) => xs.map((x) => x.join('')).sort();
  assert.deepEqual(key(compositions(6, 5)), key([[2, 1, 1, 1, 1], [1, 2, 1, 1, 1], [1, 1, 2, 1, 1], [1, 1, 1, 2, 1], [1, 1, 1, 1, 2]]));
  assert.equal(compositions(7, 4, 3).length, 16); // C(6,3) = 20 minus 4 with a part of 4
});

test('spanning letter covers its rows; partners stay one per row', () => {
  const cells = spanColumnCells(wasm, font, 'Finola', 'Bryan', [1, 1, 2, 1, 1], { gap: 1.2 });
  try {
    assert.equal(cells.length, 5);
    const tall = cells[2];
    assert.equal(tall.letters.right.length, 1);
    assert.equal(tall.letters.front.map((l) => l.ch).join(''), 'NO');
    const h = (c) => c.box.max[2] - c.box.min[2];
    assert.ok(Math.abs(h(tall) - (2 * h(cells[0]) + 1.2)) < 1e-9, 'two rows plus the gap');
  } finally { disposeCells(cells); }
});

test('touching spanning column is one piece with near-full coverage', () => {
  const [best] = designSpanColumn(wasm, font, 'Finola', 'Bryan', { spacing: 'touching', fit: 'uniform' });
  assert.equal(best.metrics.pieces, 1);
  assert.ok(best.metrics.coverage > 0.99, `coverage ${best.metrics.coverage}`);
});
