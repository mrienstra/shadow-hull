#!/usr/bin/env node
// Compare fonts on the benchmark triples (test/fixtures/benchmark-words.json).
// Usage: node scripts/benchmark-fonts.js FONT_OR_DIR... [--min-thickness MM] [--json OUT]
// For each font and triple, runs the default search and checks the best
// candidate: worst-letter coverage, one piece, and survival of the minimum
// thickness. Prints a table sorted best first.
import { readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { join, basename } from 'node:path';
import { parseArgs } from 'node:util';
import { getManifold, loadFont, search, silhouette, thicknessCheck, VIEW_NAMES } from '../src/core/index.js';

const { values: o, positionals } = parseArgs({
  allowPositionals: true,
  options: { 'min-thickness': { type: 'string', default: '1' }, json: { type: 'string' }, size: { type: 'string', default: '40' } },
});
const size = Number(o.size), minThickness = Number(o['min-thickness']);
const { triples } = JSON.parse(await readFile(new URL('../test/fixtures/benchmark-words.json', import.meta.url), 'utf8'));

const files = [];
for (const p of positionals) {
  if ((await stat(p)).isDirectory()) files.push(...(await readdir(p)).filter((f) => /\.(ttf|otf)$/i.test(f)).map((f) => join(p, f)));
  else files.push(p);
}

const wasm = await getManifold();
const rows = [];
for (const file of files) {
  const font = loadFont(await readFile(file));
  const per = [];
  for (const [texts] of triples) {
    const [best] = search(wasm, font, texts, { size });
    const shapes = Object.fromEntries(VIEW_NAMES.map((v) => [v, silhouette(wasm, font, best.assignment[v], { size })]));
    const t = thicknessCheck(wasm, shapes, best.transforms, { size, minThickness });
    for (const s of Object.values(shapes)) s.delete();
    per.push({
      texts: texts.join(''), minCoverage: best.metrics.minCoverage, pieces: best.metrics.pieces,
      sturdy: best.metrics.pieces === 1 && t.erodedPieces === 1,
    });
  }
  const mean = (f) => per.reduce((a, r) => a + f(r), 0) / per.length;
  rows.push({
    font: basename(file).replace(/\.(ttf|otf)$/i, ''),
    meanWorstCoverage: mean((r) => r.minCoverage),
    minWorstCoverage: Math.min(...per.map((r) => r.minCoverage)),
    onePiece: per.filter((r) => r.pieces === 1).length,
    sturdy: per.filter((r) => r.sturdy).length,
    per,
  });
  process.stderr.write('.');
}
process.stderr.write('\n');

// Sturdy count first (printable), then mean worst-letter coverage.
rows.sort((a, b) => b.sturdy - a.sturdy || b.meanWorstCoverage - a.meanWorstCoverage);
const pct = (x) => (x * 100).toFixed(1).padStart(6) + '%';
console.log(`${triples.length} triples, ${size} mm, min thickness ${minThickness} mm`);
console.log('font'.padEnd(26) + 'sturdy  1-piece  mean-worst  min-worst  weakest');
for (const r of rows) {
  const weakest = [...r.per].sort((a, b) => a.minCoverage - b.minCoverage).slice(0, 2).map((p) => `${p.texts} ${(p.minCoverage * 100).toFixed(0)}%`).join(', ');
  console.log(`${r.font.padEnd(26)}${`${r.sturdy}/${triples.length}`.padStart(6)}  ${`${r.onePiece}/${triples.length}`.padStart(7)}  ${pct(r.meanWorstCoverage)}    ${pct(r.minWorstCoverage)}   ${weakest}`);
}
if (o.json) await writeFile(o.json, JSON.stringify(rows, null, 2));
