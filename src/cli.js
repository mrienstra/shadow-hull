#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import {
  getManifold, loadFont, silhouette, buildTriplet, search, toBinarySTL, viewingGuide, VIEW_NAMES,
} from './core/index.js';

const DEFAULT_FONT = fileURLToPath(new URL('../fonts/ArchivoBlack-Regular.ttf', import.meta.url));

const USAGE = `Usage: shadow-hull <ABC | A B C> [options]

Builds a trip-let: a solid whose shadows along three axes read as three texts.
Pass three characters as one argument ("GEB"), or three arguments for words
or empty strings ('' = no constraint on that view).

Options:
  -o, --out FILE          write the best candidate as binary STL
  -f, --font FILE         TTF/OTF font (default: Archivo Black)
  -s, --size MM           cube edge length (default 40)
      --fit MODE          stretch | contain (default stretch)
      --transforms MODE   upright | any | none (default upright)
      --no-permute        keep the given text-to-view order (front, right, top)
      --allow-pieces      don't rank one-piece solids first
  -n, --top N             candidates to list (default 5)
      --json              print results as JSON
  -h, --help`;

const fmt = (x) => (x * 100).toFixed(1).padStart(5) + '%';

async function main() {
  const { values: o, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      out: { type: 'string', short: 'o' },
      font: { type: 'string', short: 'f' },
      size: { type: 'string', short: 's', default: '40' },
      fit: { type: 'string', default: 'stretch' },
      transforms: { type: 'string', default: 'upright' },
      'no-permute': { type: 'boolean' },
      'allow-pieces': { type: 'boolean' },
      top: { type: 'string', short: 'n', default: '5' },
      json: { type: 'boolean' },
      help: { type: 'boolean', short: 'h' },
    },
  });
  if (o.help || !positionals.length) { console.log(USAGE); return; }
  const texts = positionals.length === 1 ? [...positionals[0]] : positionals;
  if (texts.length !== 3) throw new Error(`Need three texts, got ${texts.length}. ${USAGE}`);

  const size = Number(o.size);
  const wasm = await getManifold();
  const font = loadFont(await readFile(o.font ?? DEFAULT_FONT));
  const t0 = performance.now();
  const ranked = search(wasm, font, texts, {
    size, fit: o.fit, transforms: o.transforms, permute: !o['no-permute'], preferConnected: !o['allow-pieces'],
  });
  const ms = performance.now() - t0;
  const top = ranked.slice(0, Number(o.top));

  if (o.json) {
    console.log(JSON.stringify({ texts, tried: ranked.length, ms, candidates: top.map((c) => ({ ...c, guide: viewingGuide(c.assignment, c.transforms) })) }, null, 2));
  } else {
    console.log(`Tried ${ranked.length} candidates in ${ms.toFixed(0)} ms. Coverage = share of each letter the shadow actually shows.\n`);
    console.log('  #  ' + VIEW_NAMES.map((v) => v.padEnd(16)).join('') + 'worst  pieces');
    top.forEach((c, i) => {
      const g = viewingGuide(c.assignment, c.transforms);
      const cells = VIEW_NAMES.map((v) => {
        const r = g[v].rotation ? `↺${g[v].rotation}` : '';
        return `${JSON.stringify(g[v].text)} ${fmt(c.metrics.views[v].coverage)} ${r}`.padEnd(16);
      });
      console.log(`${String(i + 1).padStart(3)}  ${cells.join('')}${fmt(c.metrics.minCoverage)}  ${c.metrics.pieces}`);
    });
    const g = viewingGuide(top[0].assignment, top[0].transforms);
    console.log('\nBest: ' + VIEW_NAMES.map((v) => `${JSON.stringify(g[v].text)} seen from ${g[v].from}${g[v].rotation ? ` (rotated ${g[v].rotation}° CCW)` : ''}`).join(', '));
    const bad = VIEW_NAMES.filter((v) => top[0].metrics.views[v].outside > 1e-6 * size * size);
    if (bad.length) console.warn(`WARNING: shadow extends outside target in ${bad.join(', ')} (orientation bug?)`);
  }

  if (o.out) {
    const best = top[0];
    const shapes = Object.fromEntries(VIEW_NAMES.map((v) => [v, silhouette(wasm, font, best.assignment[v], { size, fit: o.fit })]));
    const solid = buildTriplet(wasm, shapes, best.transforms, { size });
    await writeFile(o.out, toBinarySTL(solid));
    if (!o.json) console.log(`Wrote ${o.out} (${solid.numTri()} triangles)`);
    solid.delete();
    for (const s of Object.values(shapes)) s.delete();
  }
}

main().catch((e) => { console.error(e.message); process.exit(1); });
