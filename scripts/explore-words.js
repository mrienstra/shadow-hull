#!/usr/bin/env node
// Explore layouts for a word pair and write an HTML report (3D view + both
// shadows per layout) to reports/<a>-<b>.html. Exploration tool, not product.
// Usage: node scripts/explore-words.js Finola Bryan [--font kanit-black] [--rows 1,2,3]
//        [--cases upper,lower,title,mixed] [--fits shared,fill] [--gap=kiss|-0.2] [--line-gap=kiss|-0.05]
//        [--overlap 0.3] [--kiss 0.01]
//        [--join none|hull|plate|bridges|hull+bridges|...] [--tracking=-0.06]
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { getManifold, loadFont, worldToLocal } from '../src/core/index.js';
import { letterVisibility } from '../src/core/compose.js';
import { exploreWordPair, realizeLayout, describeLayout, rankScore } from '../src/core/wordpair.js';
import { basePlate, bridgePieces, strayShadow, hullJoin } from '../src/core/join.js';

const { values: o, positionals: [wordA, wordB] } = parseArgs({
  allowPositionals: true,
  options: {
    font: { type: 'string', default: 'kanit-black' }, rows: { type: 'string', default: '1,2,3' },
    cases: { type: 'string', default: 'upper,lower,title,mixed' }, fits: { type: 'string', default: 'shared,fill' },
    // Spacing: 'kiss' = neighbours just touch (overlap mm); a number = fixed gap × row height.
    gap: { type: 'string', default: 'kiss' }, 'line-gap': { type: 'string', default: 'kiss' },
    overlap: { type: 'string', default: '0.3' },
    kiss: { type: 'string', default: '0.01' }, // em overlap between letters inside a chunk ('' = use --tracking)
    'max-chunk': { type: 'string', default: '3' },
    join: { type: 'string', default: 'hull+bridges' }, // none | hull | plate | bridges, combined with '+'
    tracking: { type: 'string', default: '0' }, // em between letters inside chunks when --kiss=''
  },
});
if (!wordA || !wordB) { console.error('Usage: explore-words.js WORD_A WORD_B [options]'); process.exit(1); }

const FONTS_DIR = new URL('../fonts/', import.meta.url);
const fonts = JSON.parse(await readFile(new URL('fonts.json', FONTS_DIR), 'utf8'));
const entry = fonts.find((f) => f.id === o.font);
const font = loadFont(await readFile(entry ? fileURLToPath(new URL(entry.file, FONTS_DIR)) : o.font));
const wasm = await getManifold();
const H = 20;
const gap = o.gap === 'kiss' ? 'kiss' : Number(o.gap) * H;
const lineGap = o['line-gap'] === 'kiss' ? 'kiss' : Number(o['line-gap']) * H;
const letterOpts = o.kiss === '' ? { tracking: Number(o.tracking) } : { kiss: Number(o.kiss) };

const t0 = performance.now();
const all = exploreWordPair(wasm, font, wordA, wordB, {
  cases: o.cases.split(','), rows: o.rows.split(',').map(Number), fits: o.fits.split(','),
  maxChunk: Number(o['max-chunk']), byStyle: true, height: H, ...letterOpts,
});
console.error(`search: ${all.length} layouts in ${((performance.now() - t0) / 1000).toFixed(0)} s`);

// Best per style (case × rows), by rankScore.
const groups = new Map();
for (const p of all) {
  const k = `${p.caseMode}, ${p.rows.length} row${p.rows.length > 1 ? 's' : ''}`;
  if (!groups.has(k)) groups.set(k, []);
  groups.get(k).push(p);
}
const pct = (x) => `${(x * 100).toFixed(1)}%`;
const svgPath = (polys) => polys.map((p) => 'M' + p.map(([x, y]) => `${x.toFixed(2)},${(-y).toFixed(2)}`).join('L') + 'Z').join('');
const entries = [];
for (const [style, ps] of groups) {
  ps.sort((p, q) => rankScore(p.score, q.score));
  const p = ps[0];
  const r = realizeLayout(wasm, font, p, { height: H, gap, lineGap, overlap: Number(o.overlap), ...letterOpts });
  const vis = letterVisibility(wasm, r.cells);
  const m = r.metrics;
  // Join into one piece; the letters-only solid stays in r.solid for coverage.
  let joined = r.solid, bridges = [], blocks = [];
  const replace = (next) => { if (joined !== r.solid) joined.delete(); joined = next; };
  if (o.join.includes('hull')) { const h = hullJoin(wasm, joined, r.cells); replace(h.solid); blocks = h.blocks; }
  if (o.join.includes('plate')) replace(basePlate(wasm, joined, r.cells));
  if (o.join.includes('bridges')) {
    const b = bridgePieces(wasm, joined);
    replace(b.solid); bridges = b.bridges;
  }
  const stray = strayShadow(wasm, r.solid, joined, r.cells);
  const finalParts = joined.decompose();
  const finalPieces = finalParts.filter((x) => x.volume() >= 1e-3 * joined.volume()).length;
  for (const x of finalParts) x.delete();
  const views = {};
  for (const v of ['front', 'right']) {
    const shadow = joined.transform(worldToLocal(v)).project();
    const target = wasm.CrossSection.union(r.cells.map((c) => c.shapes[v]));
    const missing = target.subtract(shadow);
    const { min, max } = target.bounds();
    views[v] = { shadow: svgPath(shadow.toPolygons()), missing: svgPath(missing.toPolygons()), box: [min[0], -max[1], max[0] - min[0], max[1] - min[1]] };
    for (const x of [shadow, target, missing]) x.delete();
  }
  const mesh = joined.getMesh();
  const verts = [];
  for (let i = 0; i < mesh.vertProperties.length; i += mesh.numProp) verts.push(...[0, 1, 2].map((k) => Math.round(mesh.vertProperties[i + k] * 100) / 100));
  entries.push({
    style, text: describeLayout(p),
    stats: `worst letter ${pct(m.worstCell)} · least visible ${vis.worst.ch} ${pct(vis.worst.visible)} · stretch ${(p.score.distortion * 100).toFixed(0)}% · ${m.pieces} piece${m.pieces > 1 ? 's' : ''}`
      + (o.join === 'none' ? '' : ` → ${finalPieces} after ${o.join} (${blocks.length ? `${blocks.length} hull block${blocks.length === 1 ? '' : 's'}, ` : ''}${bridges.length} rod${bridges.length === 1 ? '' : 's'}${bridges.length ? `, longest ${Math.max(...bridges.map((b) => b.length)).toFixed(1)} mm` : ''}; extra shadow ${pct(stray.front)} / ${pct(stray.right)})`)
      + ` · ${m.size.map((x) => x.toFixed(0)).join(' × ')} mm`,
    views, verts, tris: Array.from(mesh.triVerts),
  });
  if (joined !== r.solid) joined.delete();
  r.dispose();
}

const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${wordA} × ${wordB}</title>
<style>
:root { --bg:#f6f5f2; --card:#fff; --ink:#1d1d1f; --muted:#6b6b70; --line:#deddd8; --miss:#e0483e; }
@media (prefers-color-scheme: dark) { :root { --bg:#151517; --card:#1f1f22; --ink:#ececf0; --muted:#9a9aa3; --line:#34343a; --miss:#ff6a5e; } }
body { margin:0; padding:16px; background:var(--bg); color:var(--ink); font:14px/1.4 system-ui, sans-serif; }
h1 { font-size:20px; margin:0 0 4px; } p.sub { margin:0 0 16px; color:var(--muted); }
.grid { display:grid; grid-template-columns:repeat(auto-fill, minmax(360px, 1fr)); gap:12px; }
.card { background:var(--card); border:1px solid var(--line); border-radius:10px; padding:12px; }
.card h2 { font-size:14px; margin:0; } .card .t { font-family:ui-monospace, monospace; font-size:12px; margin:4px 0; }
.card .s { color:var(--muted); font-size:12px; margin-bottom:8px; }
canvas { width:100%; height:240px; display:block; background:var(--bg); border-radius:6px; }
.shadows { display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-top:8px; }
.shadows svg { width:100%; height:70px; background:var(--bg); border-radius:6px; }
.shadows .cap { font-size:11px; color:var(--muted); }
path.s { fill:var(--ink); } path.m { fill:var(--miss); }
</style></head><body>
<h1>${wordA} × ${wordB}</h1>
<p class="sub">Best layout per style (${entry?.name ?? o.font}). “·” separates cells, “/” rows, “↕” = letter stretched to row height. Front reads ${wordA}, right reads ${wordB}; red = missing from the letter. “Least visible” = share of a letter not covered by neighbouring letters. Spacing: ${o.gap} (rows ${o['line-gap']}); joined with ${o.join}. Drag to rotate.</p>
<div class="grid" id="grid"></div>
<script type="importmap">{ "imports": { "three": "https://cdn.jsdelivr.net/npm/three@0.186.1/build/three.module.js", "three/addons/": "https://cdn.jsdelivr.net/npm/three@0.186.1/examples/jsm/" } }</script>
<script type="module">
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
const DATA = ${JSON.stringify(entries)};
const grid = document.getElementById('grid');
for (const e of DATA) {
  const card = document.createElement('div'); card.className = 'card';
  const svg = (v, cap) => '<div><svg viewBox="' + e.views[v].box.join(' ') + '"><path class="s" d="' + e.views[v].shadow + '"/><path class="m" d="' + e.views[v].missing + '"/></svg><div class="cap">' + cap + '</div></div>';
  card.innerHTML = '<h2></h2><div class="t"></div><div class="s"></div><canvas></canvas><div class="shadows">' + svg('front', 'front') + svg('right', 'right') + '</div>';
  card.querySelector('h2').textContent = e.style; card.querySelector('.t').textContent = e.text; card.querySelector('.s').textContent = e.stats;
  grid.append(card);
  const canvas = card.querySelector('canvas');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(devicePixelRatio);
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xffffff, 0x8888aa, 1.6));
  const sun = new THREE.DirectionalLight(0xffffff, 1.6); sun.position.set(2, -3, 4); scene.add(sun);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(e.verts, 3)); geo.setIndex(e.tris);
  geo.computeBoundingSphere();
  const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0xc8a27a, roughness: 0.65, flatShading: true }));
  scene.add(mesh);
  const c = geo.boundingSphere.center, rad = geo.boundingSphere.radius;
  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, rad * 20); cam.up.set(0, 0, 1);
  cam.position.set(c.x - rad * 2, c.y - rad * 3, c.z + rad * 2); cam.lookAt(c);
  const controls = new OrbitControls(cam, canvas); controls.target.copy(c);
  const fit = () => { const w = canvas.clientWidth, h = canvas.clientHeight; renderer.setSize(w, h, false); const a = w / h, k = rad * 1.05;
    Object.assign(cam, { left: -k * a, right: k * a, top: k, bottom: -k }); cam.updateProjectionMatrix(); };
  new ResizeObserver(fit).observe(canvas); fit();
  renderer.setAnimationLoop(() => { controls.update(); renderer.render(scene, cam); });
}
</script></body></html>`;

await mkdir(new URL('../reports/', import.meta.url), { recursive: true });
const out = new URL(`../reports/${wordA}-${wordB}.html`.toLowerCase(), import.meta.url);
await writeFile(out, html);
console.log(fileURLToPath(out));
