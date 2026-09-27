import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { getManifold } from '../src/core/index.js';
import { buildComposition, disposeCells } from '../src/core/compose.js';
import { basePlate, bridgePieces, strayShadow } from '../src/core/join.js';

let wasm;
before(async () => { wasm = await getManifold(); });

// Two separate 10 mm cells side by side (2 mm apart), full squares in both views.
function twoCells() {
  const sq = (x0, z0) => new wasm.CrossSection([[[x0, z0], [x0 + 10, z0], [x0 + 10, z0 + 10], [x0, z0 + 10]]], 'NonZero');
  return [0, 12].map((x) => ({
    box: { min: [x, x, 0], max: [x + 10, x + 10, 10] },
    shapes: { front: sq(x, 0), right: sq(x, 0) },
  }));
}

test('basePlate joins cells standing on it; stray shadow is the bar under them', () => {
  const cells = twoCells();
  const solid = buildComposition(wasm, cells);
  const joined = basePlate(wasm, solid, cells, { thickness: 1, embed: 0.3 });
  try {
    assert.equal(solid.decompose().length, 2);
    assert.equal(joined.decompose().length, 2, 'plate follows cell footprints, which do not touch here');
    const stray = strayShadow(wasm, solid, joined, cells);
    assert.ok(stray.front > 0 && stray.front < 0.1, `front stray ${stray.front}`);
  } finally { solid.delete(); joined.delete(); disposeCells(cells); }
});

test('bridgePieces joins everything with short rods', () => {
  const cells = twoCells();
  const solid = buildComposition(wasm, cells);
  const { solid: joined, bridges } = bridgePieces(wasm, solid, { radius: 0.5 });
  try {
    assert.equal(joined.decompose().length, 1);
    assert.equal(bridges.length, 1);
    assert.ok(Math.abs(bridges[0].length - Math.hypot(2, 2)) < 1e-6, `rod length ${bridges[0].length}`);
  } finally { solid.delete(); joined.delete(); disposeCells(cells); }
});
