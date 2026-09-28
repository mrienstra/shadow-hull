import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { getManifold } from '../src/core/index.js';
import { sharpEdges, trimSharp } from '../src/core/sharp.js';

let wasm;
before(async () => { wasm = await getManifold(); });

test('trimSharp chamfers a knife edge and leaves blunt shapes alone', () => {
  // A 10 mm wedge with a ~10° knife edge along x (at y = 10, z = 0).
  const wedge = wasm.Manifold.hull([[0, 0, 0], [0, 10, 0], [10, 0, 0], [10, 10, 0], [0, 0, 1.76], [10, 0, 1.76]]);
  const cut = trimSharp(wasm, wedge, { t: 0.3 });
  assert.ok(sharpEdges(wedge.getMesh()).length > 9.9);
  assert.ok(sharpEdges(cut.getMesh()).length < 1e-6, 'no knife edge left');
  const removed = wedge.volume() - cut.volume();
  // The tip up to where the wedge is 0.3 mm thick, capped at 1.5 mm deep: about 1.5 × 0.26 / 2 × 10 mm.
  assert.ok(removed > 1.5 && removed < 2.5, `only the tip goes: ${removed} mm³`);
  const cube = wasm.Manifold.cube([10, 10, 10]), same = trimSharp(wasm, cube);
  assert.ok(Math.abs(same.volume() - 1000) < 1e-6, 'a cube is untouched');
  for (const m of [wedge, cut, cube, same]) m.delete();
});
