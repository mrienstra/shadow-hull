// Stage 1 of the UI reorganisation: every look in resources/design/ui-map.md
// must stay reachable as a look + knob values (nothing lost in the shuffle).
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { getManifold, loadFont } from '../src/core/index.js';
import { LOOK, LOOKS, lookKnobs, generateLook } from '../src/core/looks.js';
import { buildRecipe } from '../src/core/gallery.js';

let ctx;
before(async () => {
  const wasm = await getManifold();
  ctx = {
    wasm, height: 20,
    font: loadFont(await readFile(new URL('../fonts/Kanit-Black.ttf', import.meta.url))),
    shapeFont: loadFont(await readFile(new URL('../fonts/shapes/NotoEmoji.ttf', import.meta.url))),
  };
});

test('every look has a label, blurb and knobs with defaults', () => {
  assert.deepEqual(LOOKS.map((l) => l.id), ['cube', 'row', 'rows', 'grid', 'tower', 'block']);
  for (const l of LOOKS) {
    assert.ok(l.label && l.blurb, l.id);
    for (const [k, def] of Object.entries(l.knobs)) assert.ok('default' in def, `${l.id}.${k}`);
  }
  assert.deepEqual(lookKnobs('row', { spacing: 'touching' }), { spacing: 'touching', case: 'upper', stretch: false, supports: 'allowed', stand: true, turn: true });
});

// The ui-map's list of looks → how each is reached now, and what it must produce.
const REACHABLE = [
  ['pairs in a row on a stand', 'row', {}, (r) => r.kind === 'chain' && r.layout.rows.length === 1 && r.stand && r.turn],
  ['pairs on a diagonal (no turn)', 'row', { turn: false, stand: false }, (r) => r.kind === 'chain' && !r.turn && !r.stand],
  ['two rows of pairs', 'rows', { rows: 2 }, (r) => r.kind === 'chain' && r.layout.rows.length === 2],
  ['three rows of pairs', 'rows', { rows: 3 }, (r) => r.kind === 'chain' && r.layout.rows.length === 3],
  ['grid', 'grid', {}, (r) => r.spacing === 'grid'],
  ['grid, monospaced', 'grid', { mono: true }, (r) => r.spacing === 'grid-mono'],
  ['tower: one pair per level', 'tower', { style: 'pairs' }, (r) => r.kind === 'chain' && r.spacing.startsWith('column')],
  ['tower: one tall letter', 'tower', { style: 'tall' }, (r) => r.kind === 'span'],
  ['tower: stacked', 'tower', { style: 'stacked' }, (r) => r.kind === 'stacked'],
  ['heart-shaped tower', 'tower', { style: 'stacked', shape: '❤' }, (r) => r.kind === 'stacked' && r.top?.char === '❤'],
  ['gapped stacked tower', 'tower', { style: 'stacked', spacing: 'gapped' }, (r) => r.kind === 'stacked' && r.spacing === 'spaced'],
  ['heart-shaped tower, one pair per level', 'tower', { style: 'pairs', shape: '❤' }, (r) => r.kind === 'chain' && r.top?.char === '❤'],
  ['whole-word block', 'block', {}, (r) => r.kind === 'block' && !r.top && (r.angle ?? 90) === 90],
  ['heart slab', 'block', { shape: '❤' }, (r) => r.kind === 'block' && r.top?.char === '❤'],
  ['angled block', 'block', { angle: 45 }, (r) => r.kind === 'block' && r.angle === 45],
];
for (const [name, lookId, knobs, check] of REACHABLE) {
  test(`reachable: ${name}`, () => {
    const [first] = generateLook(ctx, 'Finola', 'Bryan', lookId, knobs);
    assert.ok(first, 'at least one design');
    assert.ok(check(first.recipe), JSON.stringify(first.recipe).slice(0, 200));
    const d = buildRecipe(ctx, 'Finola', 'Bryan', first.recipe);
    try {
      assert.equal(d.metrics.finalPieces, 1, 'one printable piece');
      assert.ok(d.metrics.coverage > 0.85, `coverage ${d.metrics.coverage}`);
    } finally { d.dispose(); }
  });
}

// Every knob a look shows must change the object (turn only rotates it for
// display, so it's checked by the recipe instead).
test('tower knobs take effect: spacing and shape on every style; no compact knob', () => {
  assert.ok(!('compact' in LOOK.tower.knobs), 'compact never changed a tower');
  const shape = (knobs) => {
    const [first] = generateLook(ctx, 'Finola', 'Bryan', 'tower', knobs);
    const d = buildRecipe(ctx, 'Finola', 'Bryan', first.recipe);
    try {
      const { min, max } = d.joined.boundingBox();
      return { key: `${d.joined.volume().toFixed(1)}|${[...min, ...max].map((x) => x.toFixed(1))}`, metrics: d.metrics };
    } finally { d.dispose(); }
  };
  for (const style of ['stacked', 'pairs', 'tall']) {
    const plain = shape({ style });
    assert.notEqual(shape({ style, spacing: 'gapped' }).key, plain.key, `${style}: spacing`);
    const heart = shape({ style, shape: '❤' });
    assert.notEqual(heart.key, plain.key, `${style}: shape`);
    assert.ok(heart.metrics.views.top.coverage > 0.9, `${style}: heart shown ${heart.metrics.views.top.coverage}`);
  }
  const loose = shape({ style: 'stacked', spacing: 'gapped', supports: 'none' }).metrics;
  assert.ok(loose.rods === 0 && loose.finalPieces > 1, 'gapped stacked tower without supports stays in pieces');
});

test('the letter cube is a look too (three letters)', () => {
  assert.equal(LOOK.cube.inputs, 'letters');
});

test('supports: none means no rods; a stand or touching letters still make one piece', () => {
  const build = (knobs) => {
    const [first] = generateLook(ctx, 'Finola', 'Bryan', 'row', knobs);
    const d = buildRecipe(ctx, 'Finola', 'Bryan', first.recipe);
    try { return d.metrics; } finally { d.dispose(); }
  };
  const gappedAlone = build({ supports: 'none', stand: false });
  assert.equal(gappedAlone.rods, 0);
  assert.ok(gappedAlone.finalPieces > 1, 'gapped letters stay separate without supports');
  const withStand = build({ supports: 'none', stand: true });
  assert.equal(withStand.rods, 0);
  assert.equal(withStand.finalPieces, 1, 'the stand joins them');
  const withRods = build({ stand: false });
  assert.ok(withRods.rods > 0 && withRods.finalPieces === 1, 'supports allowed: rods join them');
});

test('prefer compact adds a compactness term to the quality', async () => {
  const { designQuality, QUALITY_WEIGHTS } = await import('../src/core/design.js');
  const m = { coverage: 1, visibleMin: 1, contactMax: 0, stretch: 0, strayMax: 0, finalPieces: 1, imbalance: 0, compactness: 0.5 };
  assert.equal(designQuality(m), 1);
  assert.ok(Math.abs(designQuality(m, { ...QUALITY_WEIGHTS, compact: 0.3 }) - 0.85) < 1e-12);
});
