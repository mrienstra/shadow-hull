#!/usr/bin/env node
// Explore layouts for a word pair and write an HTML report (3D view + both
// shadows per layout) to reports/<a>-<b>.html. Exploration tool, not product.
// Usage: node scripts/explore-words.js Finola Bryan [--font kanit-black] [--rows 1,2,3]
//        [--cases upper,lower,title,mixed] [--fits shared,fill] [--presets touching,spaced]
//        [--join none|hull|plate|bridges|hull+bridges|...] [--tracking=-0.06]
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { getManifold, loadFont, worldToLocal } from '../src/core/index.js';
import { describeLayout, rankLayouts } from '../src/core/wordpair.js';
import { SPACING, designWordPair, realizeDesign, realizeBlock, designSpanColumn, realizeSpanColumn } from '../src/core/design.js';
import { glyphSilhouette } from '../src/core/block.js';

const { values: o, positionals: [wordA, wordB] } = parseArgs({
  allowPositionals: true,
  options: {
    font: { type: 'string', default: 'kanit-black' }, rows: { type: 'string', default: '1,2,3' },
    cases: { type: 'string', default: 'upper,lower,title,mixed' }, fits: { type: 'string', default: 'shared,fill' },
    // Spacing families shown side by side (see PRESETS below).
    presets: { type: 'string', default: 'touching,spaced,grid,grid-mono,column,column-touching' },
    'max-chunk': { type: 'string', default: '3' },
    candidates: { type: 'string', default: '3' }, // search results per style built and re-ranked by quality
    // Block section: whole words front and side, top view none or a shape
    // (characters from the Noto Emoji outline font, holes filled). '' = skip.
    tops: { type: 'string', default: 'none,❤' },
    // Blocks at other angles between the two word views (degrees; '' = skip).
    angles: { type: 'string', default: '75,60,45' },
    // Columns where the shorter word's letters span rows (instead of the longer doubling up).
    spans: { type: 'boolean', default: true },
    join: { type: 'string', default: 'hull+bridges' }, // none | hull | plate | bridges, combined with '+'

  },
});
if (!wordA || !wordB) { console.error('Usage: explore-words.js WORD_A WORD_B [options]'); process.exit(1); }

const FONTS_DIR = new URL('../fonts/', import.meta.url);
const fonts = JSON.parse(await readFile(new URL('fonts.json', FONTS_DIR), 'utf8'));
const entry = fonts.find((f) => f.id === o.font);
const font = loadFont(await readFile(entry ? fileURLToPath(new URL(entry.file, FONTS_DIR)) : o.font));
const wasm = await getManifold();
const H = 20;
const pct = (x) => `${(x * 100).toFixed(1)}%`;
const svgPath = (polys) => polys.map((p) => 'M' + p.map(([x, y]) => `${x.toFixed(2)},${(-y).toFixed(2)}`).join('L') + 'Z').join('');
const entries = [];
for (const spacing of o.presets.split(',')) {
  const t0 = performance.now();
  const designs = designWordPair(wasm, font, wordA, wordB, {
    spacing, join: o.join, height: H, candidates: Number(o.candidates),
    cases: o.cases.split(','), rows: o.rows.split(',').map(Number), fits: o.fits.split(','), maxChunk: Number(o['max-chunk']),
  });
  console.error(`${spacing}: ${designs.length} styles in ${((performance.now() - t0) / 1000).toFixed(0)} s`);
  // Show styles in a stable order (case, then rows) rather than by quality.
  const order = ['upper', 'lower', 'title', 'mixed'];
  designs.sort((a, b) => order.indexOf(a.layout.caseMode) - order.indexOf(b.layout.caseMode) || a.layout.rows.length - b.layout.rows.length);
  for (const { style, layout, metrics: m, runnersUp } of designs) {
    const d = realizeDesign(wasm, font, layout, { spacing, join: o.join, height: H });
    const rerank = runnersUp.some((r) => rankLayouts(r.layout, layout) < 0) ? ' · re-ranked: search’s first choice scored lower' : '';
    entries.push(card(d, SPACING[spacing].label, style, describeLayout(layout), o.join, rerank));
    d.dispose();
  }
}

// Block layouts: whole words, touching letters, top view none or a shape.
if (o.tops) {
  const emoji = loadFont(await readFile(fileURLToPath(new URL('shapes/NotoEmoji.ttf', FONTS_DIR))));
  for (const top of o.tops.split(',')) {
    const shape = top === 'none' ? null : glyphSilhouette(wasm, emoji, top);
    for (const caseMode of ['upper', 'lower', 'title']) {
      const d = realizeBlock(wasm, font, wordA, wordB, { caseMode, spacing: 'touching', top: shape && { shape, fit: 'stretch' }, join: 'bridges', height: H });
      const topNote = shape ? ` · top ${top} ${pct(d.metrics.views.top.coverage)} shown` : '';
      entries.push(card(d, 'Block (whole words, touching; top view: none or a shape)', `${caseMode}, top ${top}`, `${wordA} × ${wordB}${shape ? ' × ' + top : ''}`, 'bridges', topNote));
      d.dispose();
    }
    shape?.delete();
  }
}

// Blocks with the side view at other angles (single row, touching, uppercase and mixed-free cases).
if (o.angles) {
  for (const angle of o.angles.split(',').map(Number)) {
    for (const caseMode of ['upper', 'title']) {
      const d = realizeBlock(wasm, font, wordA, wordB, { caseMode, spacing: 'touching', join: 'bridges', height: H, angle });
      entries.push(card(d, 'Block, other view angles (the side word is read from this many degrees round from the front)', `${caseMode}, ${angle}°`, `${wordA} × ${wordB} at ${angle}°`, 'bridges'));
      d.dispose();
    }
  }
}

// Columns with spanning letters: best span assignment per spacing × fit.
if (o.spans) {
  const shorter = [...wordA].length >= [...wordB].length ? wordB : wordA;
  for (const spacing of ['touching', 'spaced']) {
    for (const fit of ['stretch', 'uniform']) {
      const [best, ...rest] = designSpanColumn(wasm, font, wordA, wordB, { spacing, fit, height: H });
      const label = [...shorter.toUpperCase()].map((c, i) => (best.spans[i] > 1 ? `${c}×${best.spans[i]}` : c)).join(' ');
      const d = realizeSpanColumn(wasm, font, wordA, wordB, best.spans, { spacing, fit, height: H });
      entries.push(card(d, 'Column, tall letter (the shorter word’s letter spans rows instead of the longer word doubling up)', `${spacing}, ${fit === 'stretch' ? 'stretched' : 'drop-cap'}`, `spans: ${label}`, 'hull+bridges', ` · best of ${rest.length + 1} span choices`));
      d.dispose();
    }
  }
}

function card(d, preset, style, text, join, note = '') {
  const m = d.metrics;
  const views = {};
  for (const v of ['front', 'right', 'top']) {
    const own = d.cells.map((c) => c.shapes[v]).filter(Boolean);
    if (!own.length) continue;
    const shadow = d.joined.transform(worldToLocal(v, d.frames)).project();
    const target = wasm.CrossSection.union(own);
    const missing = target.subtract(shadow);
    const { min, max } = target.bounds();
    const cap = d.frames?.[v] ? `side, ${d.frames[v].side}` : v;
    views[v] = { cap, shadow: svgPath(shadow.toPolygons()), missing: svgPath(missing.toPolygons()), box: [min[0], -max[1], max[0] - min[0], max[1] - min[1]] };
    for (const x of [shadow, target, missing]) x.delete();
  }
  const mesh = d.joined.getMesh();
  const verts = [];
  for (let i = 0; i < mesh.vertProperties.length; i += mesh.numProp) verts.push(...[0, 1, 2].map((k) => Math.round(mesh.vertProperties[i + k] * 100) / 100));
  return {
    preset, style, text,
    stats: `quality ${m.quality.toFixed(3)} · worst letter ${pct(m.coverage)} · least visible ${m.visibleMin < 1 ? `${m.leastVisible} ${pct(m.visibleMin)}` : 'all 100%'}`
      + ` · most contact ${m.contactMax > 0 ? `${m.mostContact} ${pct(m.contactMax)}` : 'none'} · stretch ${(m.stretch * 100).toFixed(0)}% · ${m.pieces} piece${m.pieces > 1 ? 's' : ''}`
      + (join === 'none' ? '' : ` → ${m.finalPieces} after ${join} (${m.blocks ? `${m.blocks} hull block${m.blocks === 1 ? '' : 's'}, ` : ''}${m.rods} rod${m.rods === 1 ? '' : 's'}${m.rods ? `, longest ${m.longestRod.toFixed(1)} mm` : ''}; extra shadow ${pct(m.stray.front)} / ${pct(m.stray.right)})`)
      + ` · ${m.size.map((x) => x.toFixed(0)).join(' × ')} mm${note}`,
    views, verts, tris: Array.from(mesh.triVerts),
  };
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
.card h2 { font-size:14px; margin:0; } h2.preset { font-size:16px; margin:20px 0 8px; } .card .t { font-family:ui-monospace, monospace; font-size:12px; margin:4px 0; }
.card .s { color:var(--muted); font-size:12px; margin-bottom:8px; }
/* One shared WebGL canvas over the page draws into each .view's rectangle
   (browsers allow only ~16 WebGL contexts per page). */
#gl { position:fixed; inset:0; width:100vw; height:100vh; pointer-events:none; z-index:1; }
.view { width:100%; height:240px; background:var(--bg); border-radius:6px; touch-action:none; }
.shadows { display:grid; grid-template-columns:repeat(auto-fit, minmax(90px, 1fr)); gap:8px; margin-top:8px; }
.shadows svg { width:100%; height:70px; background:var(--bg); border-radius:6px; }
.shadows .cap { font-size:11px; color:var(--muted); }
path.s { fill:var(--ink); } path.m { fill:var(--miss); }
</style></head><body>
<h1>${wordA} × ${wordB}</h1>
<p class="sub">Best layout per style (${entry?.name ?? o.font}), chosen by “quality”: worst-letter coverage minus penalties for hidden letters, merged stems, stretch, extra shadow and uneven rows (src/core/design.js). “·” separates cells, “/” rows, “↕” = letter stretched to row height. Front reads ${wordA}, right reads ${wordB}; red = missing from the letter. “Least visible” = share of a letter not covered by neighbouring letters; “most contact” = outline touching other letters, in row heights (≳30% reads as merged). Joined with ${o.join}. Drag to rotate.</p>
<div id="grid"></div>
<canvas id="gl"></canvas>
<script type="importmap">{ "imports": { "three": "https://cdn.jsdelivr.net/npm/three@0.186.1/build/three.module.js", "three/addons/": "https://cdn.jsdelivr.net/npm/three@0.186.1/examples/jsm/" } }</script>
<script type="module">
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
const DATA = ${JSON.stringify(entries)};
const gl = document.getElementById('gl');
const renderer = new THREE.WebGLRenderer({ canvas: gl, antialias: true, alpha: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(devicePixelRatio);
renderer.setClearColor(0x000000, 0);
const material = new THREE.MeshStandardMaterial({ color: 0xc8a27a, roughness: 0.65, flatShading: true });
const views = [];
const main = document.getElementById('grid');
const sections = new Map();
for (const e of DATA) {
  if (!sections.has(e.preset)) {
    const h = document.createElement('h2'); h.className = 'preset'; h.textContent = e.preset;
    const g = document.createElement('div'); g.className = 'grid';
    main.append(h, g); sections.set(e.preset, g);
  }
  const grid = sections.get(e.preset);
  const card = document.createElement('div'); card.className = 'card';
  const svg = (v, cap) => '<div><svg viewBox="' + e.views[v].box.join(' ') + '"><path class="s" d="' + e.views[v].shadow + '"/><path class="m" d="' + e.views[v].missing + '"/></svg><div class="cap">' + cap + '</div></div>';
  card.innerHTML = '<h2></h2><div class="t"></div><div class="s"></div><div class="view"></div><div class="shadows">' + svg('front', e.views.front.cap) + svg('right', e.views.right.cap) + (e.views.top ? svg('top', 'top') : '') + '</div>';
  card.querySelector('h2').textContent = e.style; card.querySelector('.t').textContent = e.text; card.querySelector('.s').textContent = e.stats;
  grid.append(card);
  const view = card.querySelector('.view');
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xffffff, 0x8888aa, 1.6));
  const sun = new THREE.DirectionalLight(0xffffff, 1.6); sun.position.set(2, -3, 4); scene.add(sun);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(e.verts, 3)); geo.setIndex(e.tris);
  geo.computeBoundingSphere();
  scene.add(new THREE.Mesh(geo, material));
  const c = geo.boundingSphere.center, rad = geo.boundingSphere.radius;
  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, rad * 20); cam.up.set(0, 0, 1);
  cam.position.set(c.x - rad * 2, c.y - rad * 3, c.z + rad * 2); cam.lookAt(c);
  const controls = new OrbitControls(cam, view); controls.target.copy(c);
  views.push({ view, scene, cam, controls, rad });
}

// Render every on-screen view into its rectangle of the shared canvas.
function frame() {
  const w = gl.clientWidth, h = gl.clientHeight;
  if (gl.width !== Math.round(w * devicePixelRatio) || gl.height !== Math.round(h * devicePixelRatio)) renderer.setSize(w, h, false);
  renderer.setScissorTest(false);
  renderer.clear();
  renderer.setScissorTest(true);
  for (const v of views) {
    const r = v.view.getBoundingClientRect();
    if (r.bottom < 0 || r.top > h || r.right < 0 || r.left > w) continue;
    const bottom = h - r.bottom;
    renderer.setViewport(r.left, bottom, r.width, r.height);
    renderer.setScissor(r.left, bottom, r.width, r.height);
    const a = r.width / r.height, k = v.rad * 1.05;
    Object.assign(v.cam, { left: -k * a, right: k * a, top: k, bottom: -k });
    v.cam.updateProjectionMatrix();
    v.controls.update();
    renderer.render(v.scene, v.cam);
  }
}
renderer.setAnimationLoop(frame);
</script></body></html>`;

await mkdir(new URL('../reports/', import.meta.url), { recursive: true });
const out = new URL(`../reports/${wordA}-${wordB}.html`.toLowerCase(), import.meta.url);
await writeFile(out, html);
console.log(fileURLToPath(out));
