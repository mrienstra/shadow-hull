import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { getManifold } from '../src/core/index.js';
import { buildComposition, trimThin, disposeCells } from '../src/core/compose.js';

let wasm;
before(async () => { wasm = await getManifold(); });

// A cell from two letters given as rectangles [u0, u1] × [z0, z1] (front: u = x, side: u = y).
const rect = (u0, u1, z0, z1) => [[u0, z0], [u1, z0], [u1, z1], [u0, z1]];
function cellOf(front, side) {
  const letters = { front: [{ ch: 'a', pts: front }], right: [{ ch: 'b', pts: side }] };
  return {
    box: { min: [0, 0, 0], max: [10, 10, 10] },
    shapes: { front: new wasm.CrossSection(front, 'NonZero'), right: new wasm.CrossSection(side, 'NonZero') },
    letters,
  };
}

test('trimThin removes a thin plate (air above and below) and leaves thick material and shadows alone', () => {
  // Front: a full square. Side: a block 0–5 and a 0.2 mm plate at 7–7.2 over half its width.
  const cells = [cellOf([rect(0, 10, 0, 10)], [rect(0, 10, 0, 5), rect(0, 5, 7, 7.2)])];
  const solid = buildComposition(wasm, cells);
  const trimmed = trimThin(wasm, cells, solid, { t: 0.3 });
  try {
    assert.ok(Math.abs(solid.volume() - (500 + 10 * 5 * 0.2)) < 0.5, `before: ${solid.volume()}`);
    assert.ok(Math.abs(trimmed.volume() - 500) < 0.5, `the plate is gone: ${trimmed.volume()}`);
    const cube = [cellOf([rect(0, 10, 0, 10)], [rect(0, 10, 0, 10)])];
    const c = buildComposition(wasm, cube), ct = trimThin(wasm, cube, c, { t: 0.3 });
    assert.ok(Math.abs(c.volume() - ct.volume()) < 1e-6, 'nothing thin, nothing trimmed');
    c.delete(); ct.delete(); disposeCells(cube);
  } finally { solid.delete(); trimmed.delete(); disposeCells(cells); }
});
