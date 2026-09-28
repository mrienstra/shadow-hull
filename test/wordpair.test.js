import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { getManifold, loadFont } from '../src/core/index.js';
import { splits, alignLines, rowFrame, scoreCell, realizeLayout } from '../src/core/wordpair.js';

let wasm, font;
before(async () => {
  wasm = await getManifold();
  font = loadFont(await readFile(new URL('../fonts/Kanit-Black.ttf', import.meta.url)));
});

test('splits enumerates contiguous cuts', () => {
  assert.deepEqual(splits('ABC', 2), [['A', 'BC'], ['AB', 'C']]);
  assert.equal(splits('FINOLA', 3).length, 10); // C(5, 2)
});

test('2D cell scores match the 3D solid (title case, i-dot lost)', () => {
  const frame = rowFrame(font, ['Fi', 'Br']);
  for (const [a, b] of [['F', 'B'], ['i', 'r'], ['n', 'y'], ['o', 'a']]) {
    const s = scoreCell(wasm, font, a, b, frame, 'shared');
    const r = realizeLayout(wasm, font, { rows: [{ a: [a], b: [b], fit: ['shared'], frame }] });
    try {
      assert.ok(Math.abs(r.metrics.views.front.coverage - s.covA) < 1e-6, `${a}/${b} front ${r.metrics.views.front.coverage} vs ${s.covA}`);
      assert.ok(Math.abs(r.metrics.views.right.coverage - s.covB) < 1e-6, `${a}/${b} right ${r.metrics.views.right.coverage} vs ${s.covB}`);
    } finally { r.dispose(); }
  }
  // The i's dot has no partner ink in "r", so it is lost.
  assert.ok(scoreCell(wasm, font, 'i', 'r', frame, 'shared').covA < 0.95);
});

test('alignLines ranks letter-by-letter (no fragments) first for equal-length uppercase words', () => {
  const front = alignLines(wasm, font, 'HELLO', 'WORLD', { caseMode: 'upper', fits: ['shared'] });
  const [best] = front;
  assert.equal(best.cells.length, 5);
  assert.equal(best.score.fragments, 0);
  assert.ok(best.score.coverage > 0.99); // round letters overshoot flat ones slightly
  assert.equal(best.score.distortion, 0);
  // Merging letters can buy a little coverage, but strands fragments.
  assert.ok(front.some((p) => p.cells.length < 5 && p.score.fragments > 0));
});

test('scanline fragment counts agree with 3D on common letter pairs', async () => {
  const { cellFragments, cellFragmentsScan } = await import('../src/core/wordpair.js');
  const frame = rowFrame(font, [...'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz']);
  const pairs = [['F', 'B'], ['i', 'r'], ['LA', 'N'], ['o', 'a'], ['NO', 'Y'], ['fi', 'b'], ['M', 'W']];
  for (const [a, b] of pairs) {
    for (const fit of ['shared', 'fill']) {
      assert.equal(cellFragmentsScan(font, a, b, frame, fit), cellFragments(wasm, font, a, b, frame, fit), `${a}/${b} ${fit}`);
    }
  }
});

test('kissOffset makes shapes just touch; letterVisibility sees overlaps', async () => {
  const { kissOffset } = await import('../src/core/glyph.js');
  const { letterVisibility } = await import('../src/core/compose.js');
  const sq = (x0, w) => [[[x0, 0], [x0 + w, 0], [x0 + w, 10], [x0, 10]]];
  // Right square placed at 0 must move to 10 - 0.5 to overlap the left one by 0.5.
  assert.ok(Math.abs(kissOffset(sq(0, 10), sq(0, 4), 0.5) - 9.5) < 1e-9);
  // No shared heights: no kiss.
  assert.equal(kissOffset(sq(0, 10), [[[0, 20], [4, 20], [4, 30], [0, 30]]], 0.5), null);
  const cells = [{ letters: { front: [{ ch: 'A', pts: sq(0, 10) }, { ch: 'B', pts: sq(7.5, 10) }] } }];
  const v = letterVisibility(wasm, cells);
  assert.ok(Math.abs(v.views.front[0].visible - 0.75) < 1e-9);
  assert.equal(v.worst.visible, v.views.front[0].visible);
});

test('kiss spacing keeps every Finola/Bryan letter at least 90% visible', () => {
  const layout = { rows: [{ a: ['F', 'I', 'N', 'O', 'LA'], b: ['B', 'R', 'Y', 'A', 'N'] }] };
  const r = realizeLayout(wasm, font, layout, { gap: 'kiss', overlap: 0.3, kiss: 0.01 });
  const fixed = realizeLayout(wasm, font, layout, { gap: -4, tracking: -0.06 });
  return import('../src/core/compose.js').then(({ letterVisibility }) => {
    try {
      assert.ok(letterVisibility(wasm, r.cells).worst.visible > 0.9);
      assert.ok(letterVisibility(wasm, fixed.cells).worst.visible < 0.5, 'fixed overlap hides a letter');
    } finally { r.dispose(); fixed.dispose(); }
  });
});

test('equal-scoring layouts prefer balanced (grid) line splits', async () => {
  const { exploreWordPair, rankLayouts, rankScore } = await import('../src/core/wordpair.js');
  const all = exploreWordPair(wasm, font, 'Finola', 'Bryan', { rows: [2], cases: ['upper'], fits: ['shared', 'fill'], maxChunk: 3, byStyle: true });
  all.sort(rankLayouts);
  const tied = all.filter((p) => rankScore(p.score, all[0].score) === 0);
  assert.ok(tied.length > 1, 'several line splits tie on score');
  assert.equal(all[0].imbalance, Math.min(...tied.map((p) => p.imbalance)));
  assert.deepEqual(all[0].lines[0].map((x) => x.length), [3, 3]); // FIN / OLA
});

test('grid: equal lines, and letters in a column share a centre across rows', async () => {
  const { gridLines, layoutCells } = await import('../src/core/wordpair.js');
  const { disposeCells } = await import('../src/core/compose.js');
  assert.deepEqual(gridLines('FINOLA', 2), ['FIN', 'OLA']);
  assert.deepEqual(gridLines('BRYAN', 3), ['BR', 'YA', 'N']);
  const layout = { rows: [{ a: ['F', 'I', 'N'], b: ['B', 'R', 'Y'] }, { a: ['O', 'LA'], b: ['A', 'N'] }] };
  for (const fit of ['center', 'stretch']) {
    const cells = layoutCells(wasm, font, layout, { grid: { fit }, overlap: -1.2 });
    try {
      const centres = (row) => cells.filter((c) => c.box.max[2] === row).flatMap((c) => c.letters.front)
        .map((l) => { const xs = l.pts.flat().map((p) => p[0]); return (Math.min(...xs) + Math.max(...xs)) / 2; });
      const tops = [...new Set(cells.map((c) => c.box.max[2]))].sort((a, b) => b - a);
      const [r1, r2] = tops.map(centres);
      assert.equal(r1.length, 3);
      assert.equal(r2.length, 3); // O, L, A
      for (let k = 0; k < 3; k++) assert.ok(Math.abs(r1[k] - r2[k]) < 1e-6, `${fit} column ${k}: ${r1[k]} vs ${r2[k]}`);
    } finally { disposeCells(cells); }
  }
});

test('alignCorners: the F\'s middle arm moves down to the B\'s notch (Bungee); same letters and big changes are left alone', async () => {
  const { layoutCells, levelHeights, cornerHeights, alignCorners } = await import('../src/core/wordpair.js');
  const bungee = loadFont(await readFile(new URL('../fonts/Bungee-Regular.ttf', import.meta.url)));
  const cellOf = (a, b) => {
    const [c] = layoutCells(wasm, bungee, { rows: [{ a: [a], b: [b] }] }, { height: 20 });
    c.shapes.front.delete(); c.shapes.right.delete();
    return c.letters;
  };
  const { front: F, right: B } = cellOf('F', 'B');
  const r = alignCorners(F, B);
  assert.equal(r.moved.length, 1);
  const [m] = r.moved;
  assert.equal(m.side, 'a', 'the F moves, not the B');
  assert.ok(m.by < 0 && m.by > -0.6, `down a little: ${m.by}`);
  assert.ok(m.strain < 0.15, `strain ${m.strain}`);
  assert.equal(r.b, B, 'the B is untouched');
  // The arm keeps its thickness and its top now meets the notch.
  const [notch] = cornerHeights(B);
  const after = levelHeights(r.a), before = levelHeights(F);
  assert.ok(after.some((z) => Math.abs(z - notch) < 1e-6), 'an arm edge sits at the notch');
  assert.ok(Math.abs((after[2] - after[1]) - (before[2] - before[1])) < 1e-6, 'arm thickness unchanged');
  const same = cellOf('B', 'B');
  assert.equal(alignCorners(same.front, same.right).moved.length, 0, 'same letters: no change');
  assert.equal(alignCorners(F, B, { maxStrain: 0.05 }).moved.length, 0, 'over the strain limit: no change');
});

test('tidyPair: picks the F-arm-to-B-notch move in Bungee, only when it reduces slivers', async () => {
  const { layoutCells, tidyPair, cornerHeights, levelHeights } = await import('../src/core/wordpair.js');
  const { columnSlivers } = await import('../src/core/slivers.js');
  const bungee = loadFont(await readFile(new URL('../fonts/Bungee-Regular.ttf', import.meta.url)));
  const cellOf = (a, b) => {
    const [c] = layoutCells(wasm, bungee, { rows: [{ a: [a], b: [b] }] }, { height: 20 });
    c.shapes.front.delete(); c.shapes.right.delete();
    return c.letters;
  };
  const { front: F, right: B } = cellOf('F', 'B');
  const r = tidyPair(F, B);
  assert.equal(r.moved.length, 1);
  const [m] = r.moved;
  // The F's middle arm shifts (both its edges, keeping its thickness) down to the B's notch.
  assert.equal(m.kind, 'shift');
  assert.equal(m.side, 'a');
  assert.equal(m.targetKind, 'corner');
  const [[, lo0, lo1], [, hi0, hi1]] = m.levels;
  assert.ok(lo1 - lo0 < 0 && lo1 - lo0 > -0.6, `down a little: ${lo1 - lo0}`);
  assert.ok(Math.abs((hi1 - lo1) - (hi0 - lo0)) < 1e-9, 'arm keeps its thickness');
  assert.ok(Math.abs(m.target - cornerHeights(B)[0]) < 1e-9, 'meets the B\'s notch');
  assert.ok(levelHeights(r.a).some((z) => Math.abs(z - m.target) < 1e-6));
  assert.equal(r.b, B, 'the B is untouched');
  // The measured knife volume falls, as the move reports.
  const before = columnSlivers(F, B), after = columnSlivers(r.a, B);
  assert.ok(after.knife < before.knife - 0.2, `knife ${before.knife} → ${after.knife}`);
  // Same letters: never; and a gain threshold nothing can meet: no move.
  const same = cellOf('B', 'B');
  assert.equal(tidyPair(same.front, same.right).moved.length, 0);
  assert.equal(tidyPair(F, B, { minGain: 100 }).moved.length, 0);
});

// ---- One font per word (fontB) ----------------------------------------------

const loadBundled = async (file) => loadFont(await readFile(new URL(`../fonts/${file}`, import.meta.url)));
// Shape signature of outlines, invariant to uniform scale and translation:
// width / height of the ink and ink area / box area (NonZero polygons).
function signature(contourSets) {
  const pts = contourSets.flat(2);
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  const w = Math.max(...xs) - Math.min(...xs), h = Math.max(...ys) - Math.min(...ys);
  const cs = new wasm.CrossSection(contourSets.flat(), 'NonZero');
  try { return { aspect: w / h, fill: cs.area() / (w * h), z: [Math.min(...ys), Math.max(...ys)] }; } finally { cs.delete(); }
}

test('two fonts: each view is drawn in its own font, flat capitals of both fonts meet, fontB = font changes nothing', async () => {
  const { ink, layoutCells, realizeLayout } = await import('../src/core/wordpair.js');
  const bungee = await loadBundled('Bungee-Regular.ttf'), kanit = await loadBundled('Kanit-Black.ttf');
  const layout = { rows: [{ a: ['F', 'IN', 'O'], b: ['B', 'R', 'YAN'], fit: ['shared', 'shared', 'shared'] }] };
  const cells = layoutCells(wasm, bungee, layout, { height: 20, gap: 'kiss', overlap: 0.3, kiss: 0.01, fontB: kanit });
  try {
    for (const [i, c] of cells.entries()) {
      const front = signature(c.letters.front.map((l) => l.pts)), right = signature(c.letters.right.map((l) => l.pts));
      const sig = (f, t) => signature([ink(f, t, { kiss: 0.01 }).contours]); // same letter spacing as the layout
      const own = { a: sig(bungee, layout.rows[0].a[i]), b: sig(kanit, layout.rows[0].b[i]) };
      const other = { a: sig(kanit, layout.rows[0].a[i]), b: sig(bungee, layout.rows[0].b[i]) };
      for (const k of ['aspect', 'fill']) {
        assert.ok(Math.abs(front[k] - own.a[k]) < 1e-3, `${c.label} front ${k}: ${front[k]} vs Bungee ${own.a[k]}`);
        assert.ok(Math.abs(right[k] - own.b[k]) < 1e-3, `${c.label} side ${k}: ${right[k]} vs Kanit ${own.b[k]}`);
      }
      assert.ok(Math.abs(front.aspect - other.a.aspect) > 0.02 || Math.abs(front.fill - other.a.fill) > 0.02, `${c.label}: front differs from Kanit`);
      assert.ok(Math.abs(right.aspect - other.b.aspect) > 0.02 || Math.abs(right.fill - other.b.fill) > 0.02, `${c.label}: side differs from Bungee`);
    }
    // Flat capitals (F, I, N / B, R, Y, A, N) of both fonts span the same heights: baselines and cap heights meet.
    const f = signature([cells[0].letters.front[0].pts]), b = signature([cells[0].letters.right[0].pts]);
    assert.ok(Math.abs(f.z[0] - b.z[0]) < 0.01 && Math.abs(f.z[1] - b.z[1]) < 0.01, `F ${f.z} vs B ${b.z}`);
  } finally {
    for (const c of cells) { c.shapes.front.delete(); c.shapes.right.delete(); }
  }
  // Omitting fontB and passing the same font give identical solids.
  const opts = { height: 20, gap: 'kiss', overlap: -1.2, kiss: -0.06, align: 'center' };
  const frame = rowFrame(kanit, ['FIN', 'O', 'B', 'R', 'YAN']);
  const one = realizeLayout(wasm, kanit, { rows: [{ ...layout.rows[0], frame }] }, opts);
  const same = realizeLayout(wasm, kanit, { rows: [{ ...layout.rows[0], frame }] }, { ...opts, fontB: kanit });
  try {
    assert.equal(same.solid.volume(), one.solid.volume());
    assert.deepEqual(same.metrics, one.metrics);
  } finally { one.dispose(); same.dispose(); }
});

test('two fonts: 2D cell scores match the 3D solid, and search keeps coverage high', async () => {
  const { exploreWordPair, wordFrames } = await import('../src/core/wordpair.js');
  const bungee = await loadBundled('Bungee-Regular.ttf'), kanit = await loadBundled('Kanit-Black.ttf');
  const [frame, frameB] = wordFrames(bungee, kanit, ['F', 'I', 'N', 'O', 'L', 'A'], ['B', 'R', 'Y', 'A', 'N']);
  for (const [a, b] of [['F', 'B'], ['O', 'R'], ['LA', 'N']]) {
    const s = scoreCell(wasm, bungee, a, b, frame, 'shared', { fontB: kanit, frameB });
    const r = realizeLayout(wasm, bungee, { rows: [{ a: [a], b: [b], fit: ['shared'], frame, frameB }] }, { fontB: kanit });
    try {
      assert.ok(Math.abs(r.metrics.views.front.coverage - s.covA) < 1e-6, `${a}/${b} front ${r.metrics.views.front.coverage} vs ${s.covA}`);
      assert.ok(Math.abs(r.metrics.views.right.coverage - s.covB) < 1e-6, `${a}/${b} right ${r.metrics.views.right.coverage} vs ${s.covB}`);
    } finally { r.dispose(); }
  }
  const [best] = exploreWordPair(wasm, bungee, 'Finola', 'Bryan', { cases: ['upper'], rows: [1], fits: ['shared'], fontB: kanit });
  assert.ok(best.score.coverage > 0.98, `coverage ${best.score.coverage}`);
  assert.deepEqual(best.rows[0].frameB, frameB, 'rows carry word B\'s frame (in its own font)');
  const r = realizeLayout(wasm, bungee, best, { fontB: kanit });
  try {
    const built = Math.min(r.metrics.views.front.coverage, r.metrics.views.right.coverage);
    assert.ok(built > 0.98, `built coverage ${built}`);
  } finally { r.dispose(); }
});

test('tidyPair: L × A in Bungee (FINOLA × BRYAN) leaves no thin plate (a 0.12 mm triangle before thinness was scored)', async () => {
  const { layoutCells, tidyPair } = await import('../src/core/wordpair.js');
  const { columnSlivers } = await import('../src/core/slivers.js');
  const bungee = loadFont(await readFile(new URL('../fonts/Bungee-Regular.ttf', import.meta.url)));
  // The pair as it sits in the default row design (spaced family: kiss -0.06).
  const [c] = layoutCells(wasm, bungee, { rows: [{ a: ['L'], b: ['A'], frame: rowFrame(bungee, ['FINOLA', 'BRYAN'], { kiss: -0.06 }) }] }, { height: 20, kiss: -0.06 });
  c.shapes.front.delete(); c.shapes.right.delete();
  const r = tidyPair(c.letters.front, c.letters.right);
  assert.ok(r.moved.length >= 1);
  const s = columnSlivers(r.a, r.b, { t: 0.3, step: 0.05 });
  assert.equal(s.knife, 0, 'no material in runs thinner than 0.3 mm');
  // …and no faces that exactly touch (zero-thickness sheets render as stray triangles).
  assert.equal(s.knifeScore, 0, 'no zero-thickness sheets either');
  assert.ok(columnSlivers(r.a, r.b).knifeScore < columnSlivers(c.letters.front, c.letters.right).knifeScore / 5);
});
