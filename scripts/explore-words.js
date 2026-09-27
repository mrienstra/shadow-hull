#!/usr/bin/env node
// Explore layouts for a word pair and write an HTML report (3D view + shadows
// per design) to reports/<a>-<b>.html. The designs come from src/core/gallery.js,
// which the web page uses too. Exploration tool, not product.
// Example words: Finola and Bryan, the lead agents (Finola Jones, Bryan Beneventi)
// in NBC's sci-fi series Debris (2021) — a 6- and a 5-letter name with an i-dot.
// Usage: node scripts/explore-words.js Finola Bryan [--font kanit-black]
//        [--sections families,blocks,angles,spans,stacked] [--presets touching,spaced,...]
//        [--cases upper,lower,title,mixed] [--rows 1,2,3] [--tops none,❤] [--angles 75,60,45]
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { getManifold, loadFont } from '../src/core/index.js';
import { generateGallery, buildRecipe, designView, disposeContext, DEFAULT_GALLERY } from '../src/core/gallery.js';

const { values: o, positionals: [wordA, wordB] } = parseArgs({
  allowPositionals: true,
  options: {
    font: { type: 'string', default: 'kanit-black' },
    sections: { type: 'string', default: DEFAULT_GALLERY.sections.join(',') },
    presets: { type: 'string', default: DEFAULT_GALLERY.families.join(',') },
    cases: { type: 'string', default: DEFAULT_GALLERY.cases.join(',') },
    rows: { type: 'string', default: DEFAULT_GALLERY.rows.join(',') },
    tops: { type: 'string', default: 'none,❤' },
    angles: { type: 'string', default: DEFAULT_GALLERY.angles.join(',') },
    candidates: { type: 'string', default: String(DEFAULT_GALLERY.candidates) },
    join: { type: 'string', default: DEFAULT_GALLERY.join },
  },
});
if (!wordA || !wordB) { console.error('Usage: explore-words.js WORD_A WORD_B [options]'); process.exit(1); }

const FONTS_DIR = new URL('../fonts/', import.meta.url);
const fonts = JSON.parse(await readFile(new URL('fonts.json', FONTS_DIR), 'utf8'));
const entry = fonts.find((f) => f.id === o.font);
const font = loadFont(await readFile(entry ? fileURLToPath(new URL(entry.file, FONTS_DIR)) : o.font));
const shapeFont = loadFont(await readFile(fileURLToPath(new URL('shapes/NotoEmoji.ttf', FONTS_DIR))));
const wasm = await getManifold();
const ctx = { wasm, font, shapeFont, height: 20 };
const list = (x) => (x ? x.split(',') : []);

// Face colours by what carved them. Order matters: index into PALETTE in the page.
const LABELS = ['front', 'right', 'top', 'box', 'connector', null];
const pct = (x) => `${(x * 100).toFixed(1)}%`;
const svgPath = (polys) => polys.map((p) => 'M' + p.map(([x, y]) => `${x.toFixed(2)},${(-y).toFixed(2)}`).join('L') + 'Z').join('');
const entries = [];
const t0 = performance.now();
for (const item of generateGallery(ctx, wordA, wordB, {
  sections: list(o.sections), families: list(o.presets), cases: list(o.cases), rows: list(o.rows).map(Number),
  tops: list(o.tops).map((t) => (t === 'none' ? null : t)), angles: list(o.angles).map(Number),
  candidates: Number(o.candidates), join: o.join,
})) {
  const d = buildRecipe(ctx, wordA, wordB, item.recipe);
  const v = designView(wasm, d);
  d.dispose();
  const m = v.metrics;
  const join = item.recipe.kind === 'chain' ? item.recipe.join : 'bridges';
  const views = {};
  for (const [k, x] of Object.entries(v.views)) {
    const xs = x.target.flat();
    const [x0, x1] = [Math.min(...xs.map((p) => p[0])), Math.max(...xs.map((p) => p[0]))];
    const [y0, y1] = [Math.min(...xs.map((p) => p[1])), Math.max(...xs.map((p) => p[1]))];
    views[k] = { cap: x.label, shadow: svgPath(x.shadow), missing: svgPath(x.missing), box: [x0, -y1, x1 - x0, y1 - y0] };
  }
  const verts = [];
  for (let i = 0; i < v.mesh.vertProperties.length; i += v.mesh.numProp) verts.push(...[0, 1, 2].map((k) => Math.round(v.mesh.vertProperties[i + k] * 100) / 100));
  entries.push({
    preset: item.section, style: item.title, text: item.text,
    stats: `quality ${m.quality.toFixed(3)} · worst letter ${pct(m.coverage)} · least visible ${m.visibleMin < 1 ? `${m.leastVisible} ${pct(m.visibleMin)}` : 'all 100%'}`
      + ` · most contact ${m.contactMax > 0 ? `${m.mostContact} ${pct(m.contactMax)}` : 'none'} · stretch ${(m.stretch * 100).toFixed(0)}% · ${m.pieces} piece${m.pieces > 1 ? 's' : ''}`
      + ` → ${m.finalPieces} after ${join} (${m.blocks ? `${m.blocks} hull block${m.blocks === 1 ? '' : 's'}, ` : ''}${m.rods} rod${m.rods === 1 ? '' : 's'}${m.rods ? `, longest ${m.longestRod.toFixed(1)} mm` : ''}; extra shadow ${pct(m.stray.front ?? 0)} / ${pct(m.stray.right ?? 0)})`
      + ` · ${m.size.map((x) => x.toFixed(0)).join(' × ')} mm${item.note ? ` · ${item.note}` : ''}`,
    views, verts, tris: Array.from(v.mesh.triVerts),
    runs: v.runs.map((r) => [r.start, r.count, LABELS.indexOf(r.label)]),
  });
  process.stderr.write('.');
}
disposeContext(ctx);
console.error(`\n${entries.length} designs in ${((performance.now() - t0) / 1000).toFixed(0)} s`);

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
.legend { font-size:13px; color:var(--muted); display:flex; flex-wrap:wrap; align-items:center; gap:6px; margin:0 0 12px; }
.legend .sw { display:inline-block; width:12px; height:12px; border-radius:2px; margin-left:8px; }
</style></head><body>
<h1>${wordA} × ${wordB}</h1>
<p class="sub">Best layout per style (${entry?.name ?? o.font}), chosen by “quality”: worst-letter coverage minus penalties for hidden letters, merged stems, stretch, extra shadow and uneven rows (src/core/design.js). “·” separates cells, “/” rows, “↕” = letter stretched to row height. Front reads ${wordA}, right reads ${wordB}; red = missing from the letter. “Least visible” = share of a letter not covered by neighbouring letters; “most contact” = outline touching other letters, in row heights (≳30% reads as merged). Joined with ${o.join}. Drag to rotate.</p>
<p class="legend"><label><input type="checkbox" id="colour" checked> Colour faces by the view that carved them:</label>
  <span class="sw" style="background:#e07b53"></span>front <span class="sw" style="background:#4c9be8"></span>side <span class="sw" style="background:#9b6fd6"></span>top
  <span class="sw" style="background:#b7b1a6"></span>bounding box <span class="sw" style="background:#6f6f6f"></span>connectors.
  A face follows the outline of the view it's coloured by (the walls of that letter's extrusion); the flat face you see head-on is cut by the other view's letter.</p>
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
// Same order as LABELS in the script: front, right/side, top, box, connector, untagged.
const PALETTE = [0xe07b53, 0x4c9be8, 0x9b6fd6, 0xb7b1a6, 0x6f6f6f, 0xc8a27a]
  .map((color) => new THREE.MeshStandardMaterial({ color, roughness: 0.65, flatShading: true }));
const meshes = [];
const colour = document.getElementById('colour');
const applyColour = () => { for (const m of meshes) m.material = colour.checked ? PALETTE : material; };
colour.addEventListener('change', applyColour);
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
  for (const [start, count, k] of e.runs) geo.addGroup(start, count, k < 0 ? PALETTE.length - 1 : k);
  const mesh = new THREE.Mesh(geo, material);
  meshes.push(mesh);
  scene.add(mesh);
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
applyColour();
renderer.setAnimationLoop(frame);
</script></body></html>`;

await mkdir(new URL('../reports/', import.meta.url), { recursive: true });
const out = new URL(`../reports/${wordA}-${wordB}.html`.toLowerCase(), import.meta.url);
await writeFile(out, html);
console.log(fileURLToPath(out));
