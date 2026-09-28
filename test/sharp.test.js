import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { getManifold } from '../src/core/index.js';
import { sharpEdges } from '../src/core/sharp.js';

let wasm;
before(async () => { wasm = await getManifold(); });

test('sharpEdges: a cube has none under 60°; a thin wedge has its knife edge; a rounded shape has none', () => {
  const cube = wasm.Manifold.cube([10, 10, 10]);
  assert.equal(sharpEdges(cube.getMesh(), { maxAngle: 60 }).length, 0, 'right angles are not sharp');
  // A 10 mm long wedge whose edge is 20° (a knife): hull of a 10 × 10 base edge and a line.
  const wedge = wasm.Manifold.hull([[0, 0, 0], [0, 10, 0], [10, 0, 0], [10, 10, 0], [0, 0, 1.76], [10, 0, 1.76]]);
  const s = sharpEdges(wedge.getMesh(), { maxAngle: 60 });
  assert.ok(Math.abs(s.length - 10) < 0.01, `the 10 mm knife edge: ${s.length}`);
  assert.ok(s.edges[0].angle < 20, `about 10°: ${s.edges[0].angle}`);
  const ball = wasm.Manifold.sphere(5, 64);
  assert.equal(sharpEdges(ball.getMesh(), { maxAngle: 60 }).length, 0, 'smooth, however finely faceted');
  cube.delete(); wedge.delete(); ball.delete();
});
