import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  getManifold, loadFont, silhouette, buildTriplet, measure, search, toBinarySTL, howToView, d4, VIEW_NAMES,
} from '../src/core/index.js';

const SIZE = 40, H = SIZE / 2;
let wasm, font;
before(async () => {
  wasm = await getManifold();
  font = loadFont(await readFile(new URL('../fonts/ArchivoBlack-Regular.ttf', import.meta.url)));
});

const shapesFor = (texts) =>
  Object.fromEntries(VIEW_NAMES.map((v) => [v, silhouette(wasm, font, texts[v] ?? '', { size: SIZE })]));
const free = (shapes, ...more) => { for (const s of [...Object.values(shapes), ...more]) s.delete(); };

/** Extent of the solid along `upAxis` within a thin slab at `axis` = `at`. */
function slabExtent(solid, axis, at, upAxis) {
  const dims = [SIZE * 2, SIZE * 2, SIZE * 2];
  dims[axis] = 1;
  const pos = [0, 0, 0];
  pos[axis] = at;
  const box = wasm.Manifold.cube(dims, true).translate(pos);
  const cut = solid.intersect(box);
  const { min, max } = cut.boundingBox();
  const res = cut.isEmpty() ? null : [min[upAxis], max[upAxis]];
  box.delete(); cut.delete();
  return res;
}

/**
 * An "F" reads correctly when, in the viewer's frame, its stem is on the left
 * (spans full height) and its right edge has material only in the upper half.
 * `right`/`up` are world axis indices and signs for the viewer's right/up.
 */
function assertReadsAsF(solid, right, up) {
  const [ra, rs] = right, [ua, us] = up;
  const left = slabExtent(solid, ra, -rs * (H - 1), ua);
  const farRight = slabExtent(solid, ra, rs * (H - 1), ua);
  assert.ok(left && left[1] - left[0] > SIZE * 0.95, `stem on the left spans full height: ${left}`);
  assert.ok(farRight, 'top bar reaches the right edge');
  const lowest = us > 0 ? farRight[0] : -farRight[1];
  assert.ok(lowest > 0, `right edge has material only in the upper half (lowest ${lowest.toFixed(2)})`);
}

// Viewer frames, stated independently of views.js: [axis index, sign].
const X = 0, Y = 1, Z = 2;
const FRAMES = {
  'front/-Y': { right: [X, +1], up: [Z, +1] }, // standing at -Y, facing +Y
  'front/+Y': { right: [X, -1], up: [Z, +1] },
  'right/+X': { right: [Y, +1], up: [Z, +1] }, // standing at +X, facing -X
  'right/-X': { right: [Y, -1], up: [Z, +1] },
  'top/+Z': { right: [X, +1], up: [Y, +1] },   // above, front edge toward you
};

for (const view of VIEW_NAMES) {
  for (const index of [0, 4]) {
    const { from, rotation } = howToView(view, index);
    const key = `${view}/${from}`;
    if (!FRAMES[key]) continue;
    test(`"F" on ${view} with transform ${index} reads correctly from ${from}`, () => {
      assert.equal(rotation, 0);
      const shapes = shapesFor({ [view]: 'F' });
      const solid = buildTriplet(wasm, shapes, { [view]: index }, { size: SIZE });
      try {
        assertReadsAsF(solid, FRAMES[key].right, FRAMES[key].up);
      } finally { free(shapes, solid); }
    });
  }
}

test('d4 matrices form the square symmetries (orthogonal, det ±1, mirror iff index >= 4)', () => {
  for (let i = 0; i < 8; i++) {
    const [a, b, c, d] = d4(i);
    assert.equal(a * a + c * c, 1);
    assert.equal(a * b + c * d, 0);
    assert.equal(a * d - b * c, i >= 4 ? -1 : 1);
  }
});

test('shadows never extend outside their targets, for every transform', () => {
  const shapes = shapesFor({ front: 'G', right: 'E', top: 'B' });
  try {
    for (let i = 0; i < 8; i++) {
      const tf = { front: i, right: (i + 3) % 8, top: (i + 5) % 8 };
      const solid = buildTriplet(wasm, shapes, tf, { size: SIZE });
      const m = measure(wasm, solid, shapes, tf);
      solid.delete();
      for (const v of VIEW_NAMES) assert.ok(m.views[v].outside < 1e-3, `${v} outside ${m.views[v].outside} (tf ${JSON.stringify(tf)})`);
    }
  } finally { free(shapes); }
});

test('an unconstrained view casts the full square', () => {
  const shapes = shapesFor({});
  const solid = buildTriplet(wasm, shapes, {}, { size: SIZE });
  try {
    assert.ok(Math.abs(solid.volume() - SIZE ** 3) < 1e-6 * SIZE ** 3);
  } finally { free(shapes, solid); }
});

test('search finds a complete, one-piece GEB', () => {
  const [best] = search(wasm, font, ['G', 'E', 'B'], { size: SIZE });
  assert.equal(best.metrics.pieces, 1);
  assert.ok(best.metrics.minCoverage > 0.99, `worst coverage ${best.metrics.minCoverage}`);
});

test('binary STL has the right header count and length', () => {
  const shapes = shapesFor({ front: 'G', right: 'E', top: 'B' });
  const solid = buildTriplet(wasm, shapes, {}, { size: SIZE });
  try {
    const stl = toBinarySTL(solid);
    const n = new DataView(stl.buffer).getUint32(80, true);
    assert.equal(n, solid.numTri());
    assert.equal(stl.length, 84 + 50 * n);
  } finally { free(shapes, solid); }
});

test('applySymmetry matches transforming the actual solid (all 48 symmetries)', async () => {
  const { CUBE_SYMMETRIES, applySymmetry } = await import('../src/core/symmetry.js');
  const config = { assignment: { front: 'F', right: 'G', top: 'R' }, transforms: { front: 0, right: 5, top: 3 } };
  const cache = new Map();
  const shape = (t) => cache.get(t) ?? cache.set(t, silhouette(wasm, font, t, { size: SIZE })).get(t);
  const build = (c) => buildTriplet(wasm, Object.fromEntries(VIEW_NAMES.map((v) => [v, shape(c.assignment[v])])), c.transforms, { size: SIZE });
  const original = build(config);
  try {
    for (const R of CUBE_SYMMETRIES) {
      const mat4 = [R[0][0], R[1][0], R[2][0], 0, R[0][1], R[1][1], R[2][1], 0, R[0][2], R[1][2], R[2][2], 0, 0, 0, 0, 1];
      const moved = original.transform(mat4);
      const rebuilt = build(applySymmetry(R, config));
      const diff = wasm.Manifold.union(moved.subtract(rebuilt), rebuilt.subtract(moved));
      assert.ok(diff.volume() < 1e-6 * SIZE ** 3, `R=${JSON.stringify(R)}: symmetric difference ${diff.volume()}`);
      for (const m of [moved, rebuilt, diff]) m.delete();
    }
  } finally {
    original.delete();
    for (const s of cache.values()) s.delete();
  }
});

test('dedupe keeps the best result and one config per orbit', () => {
  const all = search(wasm, font, ['A', 'M', 'Y'], { size: SIZE, dedupe: false });
  const reps = search(wasm, font, ['A', 'M', 'Y'], { size: SIZE });
  assert.equal(all.length, 96);
  assert.equal(reps.length, 24);
  assert.ok(Math.abs(all[0].metrics.minCoverage - reps[0].metrics.minCoverage) < 1e-9);
});

test('thicknessCheck finds a neck thinner than the minimum (synthetic dumbbell)', async () => {
  const { thicknessCheck } = await import('../src/core/triplet.js');
  const { CrossSection } = wasm;
  // Two 15x40 blocks joined by a 0.6 mm-tall bar at mid-height, filling the square's width.
  const rect = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
  const dumbbell = new CrossSection([rect(-H, -H, -5, H), rect(5, -H, H, H), rect(-5.5, -0.3, 5.5, 0.3)], 'NonZero');
  const shapes = { front: dumbbell, right: CrossSection.square([SIZE, SIZE], true), top: CrossSection.square([SIZE, SIZE], true) };
  try {
    const solid = buildTriplet(wasm, shapes, {}, { size: SIZE });
    assert.equal(solid.decompose().length, 1);
    solid.delete();
    assert.equal(thicknessCheck(wasm, shapes, {}, { size: SIZE, minThickness: 0.4 }).erodedPieces, 1);
    assert.equal(thicknessCheck(wasm, shapes, {}, { size: SIZE, minThickness: 1 }).erodedPieces, 2);
    assert.equal(thicknessCheck(wasm, shapes, {}, { size: SIZE, minThickness: 45 }).erodedPieces, 0);
  } finally { free(shapes); }
});

test('glyph self-symmetries are detected and folded into the dedupe', async () => {
  const { stabilizer } = await import('../src/core/symmetry.js');
  const stab = (t) => { const s = silhouette(wasm, font, t, { size: SIZE }); try { return stabilizer(s); } finally { s.delete(); } };
  assert.deepEqual(stab('I'), [0, 1, 2, 3, 4, 5, 6, 7]);
  assert.deepEqual(stab('H'), [0, 4]);
  // Archivo Black's M is drawn slightly asymmetric (stems 203 vs 219 units): not folded.
  assert.deepEqual(stab('M'), [0]);
  const all = search(wasm, font, ['X', 'O', 'H'], { size: SIZE, dedupe: false });
  const reps = search(wasm, font, ['X', 'O', 'H'], { size: SIZE });
  assert.equal(reps.length, 11);
  assert.ok(Math.abs(all[0].metrics.minCoverage - reps[0].metrics.minCoverage) < 1e-9);
});

test('extrudeCentered does not leak WASM memory (manifold-3d extrude workaround)', async () => {
  const { extrudeCentered } = await import('../src/core/manifold.js');
  const poly = Array.from({ length: 400 }, (_, i) => [10 * Math.cos((i / 400) * 2 * Math.PI), 10 * Math.sin((i / 400) * 2 * Math.PI)]);
  const cs = new wasm.CrossSection([poly], 'NonZero');
  const run = (n) => { for (let k = 0; k < n; k++) { const m = extrudeCentered(wasm, cs, 50); m.volume(); m.delete(); } };
  run(200); // let the heap reach steady state
  const before = process.memoryUsage().rss;
  run(1000);
  const grown = (process.memoryUsage().rss - before) / 1e6;
  cs.delete();
  // The unpatched wrapper leaks ~0.37 MB per call here (~370 MB for 1000 calls).
  assert.ok(grown < 60, `RSS grew ${grown.toFixed(0)} MB over 1000 extrusions`);
});

test('faceRuns labels every face of a trip-let by the view that carved it', async () => {
  const { faceRuns } = await import('../src/core/manifold.js');
  const shapes = shapesFor({ front: 'G', right: 'E', top: 'B' });
  const solid = buildTriplet(wasm, shapes, {}, { size: SIZE });
  try {
    const mesh = solid.getMesh();
    const runs = faceRuns(mesh);
    const labels = new Set(runs.map((r) => r.label));
    assert.deepEqual([...labels].sort(), ['front', 'right', 'top']);
    assert.equal(runs.reduce((a, r) => a + r.count, 0), mesh.triVerts.length);
    // A front-prism face contains the front view's extrusion direction (±Y): its normal has no Y part.
    const v = (i) => [0, 1, 2].map((k) => mesh.vertProperties[i * mesh.numProp + k]);
    for (const r of runs.filter((x) => x.label === 'front')) {
      for (let t = r.start; t < r.start + r.count; t += 3) {
        const [a, b, c] = [0, 1, 2].map((k) => v(mesh.triVerts[t + k]));
        const u = b.map((x, i) => x - a[i]), w = c.map((x, i) => x - a[i]);
        const n = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]];
        const len = Math.hypot(...n);
        // Vertices are float32, so skip slivers (area < 0.001 mm²) and allow 1e-3.
        if (len / 2 > 1e-3) assert.ok(Math.abs(n[1] / len) < 1e-3, `front faces are parallel to Y (n_y ${n[1] / len})`);
      }
    }
  } finally { free(shapes, solid); }
});
