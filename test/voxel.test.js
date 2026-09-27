import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { getManifold } from '../src/core/index.js';
import { thinFeatures, edt } from '../src/core/voxel.js';

let M;
before(async () => { M = (await getManifold()).Manifold; });

test('edt gives squared voxel distances', () => {
  // 5x1x1 line with a target at index 0.
  const D = edt(5, 1, 1, (i) => i === 0);
  assert.deepEqual([...D], [0, 1, 4, 9, 16]);
});

test('thinFeatures: plain cube passes (sharp edges are not thin)', () => {
  const cube = M.cube([10, 10, 10], true);
  assert.equal(thinFeatures(cube, { minThickness: 1 }).regions.length, 0);
});

test('thinFeatures flags a thin fin that erosion-split tests miss', () => {
  const body = M.cube([10, 10, 10], true);
  const thin = M.union(body, M.cube([0.6, 6, 6], true).translate([7.9, 0, 0]));
  const ok = M.union(body, M.cube([1.4, 6, 6], true).translate([7.9, 0, 0]));
  const r = thinFeatures(thin, { minThickness: 1 });
  assert.equal(r.regions.length, 1);
  assert.ok(Math.abs(r.regions[0].center[0] - 7.9) < 0.5, `fin found at x=${r.regions[0].center[0]}`);
  assert.equal(thinFeatures(ok, { minThickness: 1 }).regions.length, 0);
});

test('thinFeatures flags a thin neck', () => {
  const s = M.union([M.cube([10, 10, 10]).translate([-15, -5, -5]), M.cube([10, 10, 10]).translate([5, -5, -5]), M.cube([11, 0.6, 0.6], true)]);
  assert.equal(thinFeatures(s, { minThickness: 1 }).regions.length, 1);
});
