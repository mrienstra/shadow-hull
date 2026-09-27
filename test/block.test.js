import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { getManifold, loadFont } from '../src/core/index.js';
import { glyphSilhouette } from '../src/core/block.js';
import { realizeBlock } from '../src/core/design.js';

let wasm, font, emoji;
before(async () => {
  wasm = await getManifold();
  font = loadFont(await readFile(new URL('../fonts/Kanit-Black.ttf', import.meta.url)));
  emoji = loadFont(await readFile(new URL('../fonts/shapes/NotoEmoji.ttf', import.meta.url)));
});

test('glyphSilhouette fills line-art detail: Noto ❤ becomes one solid outline', () => {
  const raw = glyphSilhouette(wasm, emoji, '❤', { fillHoles: false });
  const filled = glyphSilhouette(wasm, emoji, '❤');
  try {
    assert.equal(filled.decompose().length, 1);
    assert.ok(filled.area() > raw.area(), 'filling adds the inner detail back');
    assert.equal(filled.toPolygons().length, 1, 'no holes left');
  } finally { raw.delete(); filled.delete(); }
});

test('block: whole words front and side, heart on top, one piece', () => {
  const heart = glyphSilhouette(wasm, emoji, '❤');
  const plain = realizeBlock(wasm, font, 'Finola', 'Bryan', { caseMode: 'upper', spacing: 'touching' });
  const hearted = realizeBlock(wasm, font, 'Finola', 'Bryan', { caseMode: 'upper', spacing: 'touching', top: { shape: heart, fit: 'stretch' } });
  try {
    assert.ok(plain.metrics.coverage > 0.99, `plain ${plain.metrics.coverage}`);
    assert.equal(plain.metrics.views.top.constrained, false);
    assert.ok(hearted.metrics.views.top.coverage > 0.95, `heart shown ${hearted.metrics.views.top.coverage}`);
    assert.equal(hearted.metrics.finalPieces, 1);
  } finally { plain.dispose(); hearted.dispose(); heart.delete(); }
});
