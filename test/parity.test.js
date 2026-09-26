// The JS core must keep reproducing test/fixtures/parity.json (shared with the
// Python port). If a change is intentional, regenerate with
// `node scripts/make-fixtures.js` and review the diff.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  getManifold, loadFont, silhouette, buildTriplet, measure, search, VIEW_NAMES,
} from '../src/core/index.js';

const fx = JSON.parse(await readFile(new URL('./fixtures/parity.json', import.meta.url), 'utf8'));
const wasm = await getManifold();
const font = loadFont(await readFile(new URL(`../${fx.font}`, import.meta.url)));
const opts = { size: fx.size, fit: fx.fit };
const tol = fx.tolerance;
const closeRel = (a, b, rel, msg) => assert.ok(Math.abs(a - b) <= rel * Math.abs(b), `${msg}: ${a} vs ${b}`);

test('silhouette areas', () => {
  for (const [ch, want] of Object.entries(fx.silhouettes)) {
    const s = silhouette(wasm, font, ch, opts);
    closeRel(s.area(), want.area, tol.area_rel, `area of ${JSON.stringify(ch)}`);
    s.delete();
  }
});

for (const c of fx.fixed) {
  test(`fixed case ${JSON.stringify(c.texts)} ${JSON.stringify(c.transforms)}`, () => {
    const shapes = Object.fromEntries(VIEW_NAMES.map((v) => [v, silhouette(wasm, font, c.texts[v], opts)]));
    const solid = buildTriplet(wasm, shapes, c.transforms, opts);
    const m = measure(wasm, solid, shapes, c.transforms);
    for (const v of VIEW_NAMES) assert.ok(Math.abs(m.views[v].coverage - c.coverage[v]) <= tol.coverage_abs, `${v} coverage ${m.views[v].coverage} vs ${c.coverage[v]}`);
    assert.equal(m.pieces, c.pieces);
    closeRel(m.volume, c.volume, tol.volume_rel, 'volume');
    solid.delete();
    for (const s of Object.values(shapes)) s.delete();
  });
}

for (const s of fx.searches) {
  test(`search ${s.texts.join('')}`, () => {
    const ranked = search(wasm, font, s.texts, { ...opts, ...s.opts });
    assert.equal(ranked.length, s.candidates);
    assert.equal(ranked[0].metrics.pieces, s.best.pieces);
    assert.ok(Math.abs(ranked[0].metrics.minCoverage - s.best.minCoverage) <= tol.coverage_abs);
  });
}
