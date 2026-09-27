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

test('hullJoin joins pieces through the full hull with zero extra shadow', async () => {
  const { hullJoin, fullHull } = await import('../src/core/join.js');
  const rect = (a0, a1) => new wasm.CrossSection([[[a0, 0], [a1, 0], [a1, 10], [a0, 10]]], 'NonZero');
  // Each word is one bar (two touching halves), but the chain's two cells only
  // meet along an edge, so the chain is 2 pieces while the full hull is 1.
  const cells = [
    { box: { min: [0, 0, 0], max: [11, 11, 10] }, shapes: { front: rect(0, 11), right: rect(0, 11) } },
    { box: { min: [11, 11, 0], max: [22, 22, 10] }, shapes: { front: rect(11, 22), right: rect(11, 22) } },
  ];
  const solid = buildComposition(wasm, cells);
  const H = fullHull(wasm, cells);
  const { solid: joined, blocks, pieces } = hullJoin(wasm, solid, cells);
  try {
    assert.equal(solid.decompose().length, 2);
    assert.equal(H.decompose().length, 1);
    assert.equal(pieces, 1);
    assert.equal(joined.decompose().length, 1);
    assert.equal(blocks.length, 1);
    const stray = strayShadow(wasm, solid, joined, cells);
    assert.ok(stray.front < 1e-9 && stray.right < 1e-9, `stray ${JSON.stringify(stray)}`);
  } finally { solid.delete(); H.delete(); joined.delete(); disposeCells(cells); }
});

test('displayStand joins cells standing on it, under a convex rounded outline', async () => {
  const { displayStand } = await import('../src/core/join.js');
  // Two separate 10 mm cells on a diagonal, 2 mm apart.
  const sq = (x0, z0) => new wasm.CrossSection([[[x0, z0], [x0 + 10, z0], [x0 + 10, z0 + 10], [x0, z0 + 10]]], 'NonZero');
  const cells = [0, 12].map((x) => ({ box: { min: [x, x, 0], max: [x + 10, x + 10, 10] }, shapes: { front: sq(x, 0), right: sq(x, 0) } }));
  const solid = buildComposition(wasm, cells);
  const joined = displayStand(wasm, solid, cells, { height: 2, pad: 3 });
  try {
    assert.equal(solid.decompose().length, 2);
    assert.equal(joined.decompose().length, 1, 'the stand joins both cells');
    const { min, max } = joined.boundingBox();
    assert.ok(min[0] < -2.9 && max[0] > 24.9, 'padded beyond the footprint');
    assert.ok(Math.abs(min[2] - (0.3 - 2)) < 1e-6, 'stand top sunk 0.3 mm into the letters');
    const plan = joined.project();
    const hull = plan.hull();
    assert.ok(Math.abs(hull.area() - plan.area()) < 1e-6 * hull.area(), 'outline is convex');
    plan.delete(); hull.delete();
  } finally { solid.delete(); joined.delete(); disposeCells(cells); }
});
