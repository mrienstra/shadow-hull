import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import FONTS from '../fonts/fonts.json';
import { LOOKS, LOOK, lookKnobs } from '../src/core/look-defs.js';

// Bundled fonts: URLs resolved by Vite; list and notes from fonts/fonts.json.
const FONT_URLS = import.meta.glob('../fonts/*.ttf', { query: '?url', import: 'default', eager: true });

const VIEW_NAMES = ['front', 'right', 'top'];
const $ = (s) => document.querySelector(s);

// ---- Worker RPC -----------------------------------------------------------
const worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
let nextId = 0;
const pending = new Map();
worker.onmessage = ({ data }) => {
  const p = pending.get(data.id);
  if (!p) return;
  pending.delete(data.id);
  data.ok ? p.resolve(data) : p.reject(new Error(data.error));
};
const call = (msg, transfer = []) => new Promise((resolve, reject) => {
  const id = nextId++;
  pending.set(id, { resolve, reject });
  worker.postMessage({ ...msg, id }, transfer);
});

// ---- 3D view (world: X right, Y back, Z up) --------------------------------
const viewport = $('#viewport');
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(devicePixelRatio);
viewport.append(renderer.domElement);
const scene = new THREE.Scene();
const hemi = new THREE.HemisphereLight(0xffffff, 0x8888aa, 1.6);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffffff, 1.6);
sun.position.set(2, -3, 4);
scene.add(sun);
const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 1000);
camera.up.set(0, 0, 1);
let controls = new OrbitControls(camera, renderer.domElement);
let meshObj = null, box = null, size = 40;
const meshCentre = new THREE.Vector3(); // world point shown at the scene origin

const material = new THREE.MeshStandardMaterial({ color: 0xc8a27a, roughness: 0.65, metalness: 0, flatShading: true });
// Colour by the view that carved each face (labels from core faceRuns).
const FACE_COLOURS = { front: 0xe07b53, right: 0x4c9be8, top: 0x9b6fd6, box: 0xb7b1a6, connector: 0x6f6f6f };
const faceMaterials = Object.fromEntries(Object.entries(FACE_COLOURS).map(([k, color]) => [k, new THREE.MeshStandardMaterial({ color, roughness: 0.65, metalness: 0, flatShading: true })]));
const LABEL_ORDER = [...Object.keys(FACE_COLOURS), null];
const paletteMaterials = [...Object.values(faceMaterials), material];

function fitFrustum() {
  const w = viewport.clientWidth, h = viewport.clientHeight;
  renderer.setSize(w, h, false);
  const half = size * 0.75, aspect = w / h;
  Object.assign(camera, aspect >= 1
    ? { left: -half * aspect, right: half * aspect, top: half, bottom: -half }
    : { left: -half, right: half, top: half / aspect, bottom: -half / aspect });
  camera.updateProjectionMatrix();
}
new ResizeObserver(fitFrustum).observe(viewport);

// Viewer frames per side: [look-from direction, screen-right, screen-up].
const SIDES = {
  '-Y': [[0, -1, 0], [1, 0, 0], [0, 0, 1]],
  '+Y': [[0, 1, 0], [-1, 0, 0], [0, 0, 1]],
  '+X': [[1, 0, 0], [0, 1, 0], [0, 0, 1]],
  '-X': [[-1, 0, 0], [0, -1, 0], [0, 0, 1]],
  '+Z': [[0, 0, 1], [1, 0, 0], [0, 1, 0]],
  '-Z': [[0, 0, -1], [-1, 0, 0], [0, 1, 0]],
};

function lookFrom(dir, up) {
  const d = new THREE.Vector3(...dir).normalize().multiplyScalar(size * 4);
  camera.position.copy(d);
  camera.up.set(...up);
  camera.lookAt(0, 0, 0);
  // OrbitControls caches camera.up when created, so rebuild it after a roll.
  controls.dispose();
  controls = new OrbitControls(camera, renderer.domElement);
}

let guide = null;
let wordFrames = null; // two-words mode: the design's view frames { U, V, D, label }
function snap(view) {
  if (mode === 'words') {
    if (view === 'iso' || !wordFrames) return lookFrom([1.1, -1.6, 1.2], [0, 0, 1]);
    const { D, V } = wordFrames[view];
    return lookFrom(D, V);
  }
  if (view === 'iso' || !guide) return lookFrom([1.1, -1.6, 1.2], [0, 0, 1]);
  const { from, rotation } = guide[view];
  const [dir, right, up] = SIDES[from];
  // The letter appears rotated `rotation`° CCW; roll the camera the same way to read it upright.
  const r = (rotation * Math.PI) / 180;
  const rolled = up.map((u, i) => Math.cos(r) * u - Math.sin(r) * right[i]);
  lookFrom(dir, rolled);
}

function applyColour() {
  if (meshObj) meshObj.material = $('#colour-faces').checked ? paletteMaterials : material;
}

function showMesh({ numProp, vertProperties, triVerts, runs = [] }) {
  if (meshObj) { meshObj.geometry.dispose(); scene.remove(meshObj); }
  if (box) { box.geometry.dispose(); scene.remove(box); }
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array((vertProperties.length / numProp) * 3);
  for (let i = 0, j = 0; i < vertProperties.length; i += numProp) {
    pos[j++] = vertProperties[i]; pos[j++] = vertProperties[i + 1]; pos[j++] = vertProperties[i + 2];
  }
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setIndex(new THREE.BufferAttribute(triVerts, 1));
  for (const r of runs) geo.addGroup(r.start, r.count, LABEL_ORDER.indexOf(r.label in FACE_COLOURS ? r.label : null));
  // Centre on the bounding box (word layouts aren't centred like trip-lets).
  geo.computeBoundingBox();
  const bb = geo.boundingBox, dims = new THREE.Vector3(), centre = new THREE.Vector3();
  bb.getSize(dims); bb.getCenter(centre);
  size = Math.max(dims.x, dims.y, dims.z);
  meshObj = new THREE.Mesh(geo, material);
  meshObj.position.copy(centre).negate();
  meshCentre.copy(centre);
  applyColour();
  scene.add(meshObj);
  box = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(dims.x, dims.y, dims.z)),
    new THREE.LineBasicMaterial({ color: 0x888888, transparent: true, opacity: 0.35 }),
  );
  box.visible = $('#show-box').checked;
  scene.add(box);
  fitFrustum();
}

// ---- Swing: ping-pong between the front and side views -----------------------
// The camera circles the vertical axis between the two exact horizontal views,
// holding each for a moment, with ease-in-out (sine) motion so the reversal is
// gentle: velocity is zero at both ends. Timing is tunable in the toolbar.
let swing = null; // { a0, a1, t0 } while swinging
function swingEnds() {
  let front, side;
  if (mode === 'words') {
    if (!wordFrames) return null;
    front = wordFrames.front.D; side = wordFrames.right.D;
  } else {
    if (!guide) return null;
    front = SIDES[guide.front.from][0]; side = SIDES[guide.right.from][0];
  }
  const a0 = Math.atan2(front[1], front[0]);
  let a1 = Math.atan2(side[1], side[0]);
  // Go the short way round.
  while (a1 - a0 > Math.PI) a1 -= 2 * Math.PI;
  while (a1 - a0 < -Math.PI) a1 += 2 * Math.PI;
  return { a0, a1 };
}
function setSwing(on) {
  const ends = on ? swingEnds() : null;
  swing = ends ? { ...ends, t0: performance.now() } : null;
  $('#swing').setAttribute('aria-pressed', String(!!swing));
  $('#swing-timing').classList.toggle('off', !swing);
  if (!swing) {
    // Hand the camera back to the orbit controls where the swing left it.
    controls.dispose();
    controls = new OrbitControls(camera, renderer.domElement);
  }
}
const easeInOutSine = (x) => 0.5 - 0.5 * Math.cos(Math.PI * x);
function swingCamera(now) {
  const move = Math.max(0.3, Number($('#swing-secs').value) || 2) * 1000;
  const hold = Math.max(0, Number($('#swing-hold').value) || 0) * 1000;
  const period = 2 * (move + hold);
  const t = (now - swing.t0) % period;
  // hold at front → swing to side → hold at side → swing back
  let x;
  if (t < hold) x = 0;
  else if (t < hold + move) x = easeInOutSine((t - hold) / move);
  else if (t < 2 * hold + move) x = 1;
  else x = 1 - easeInOutSine((t - 2 * hold - move) / move);
  const a = swing.a0 + (swing.a1 - swing.a0) * x;
  // Tilt follows a sine arch over the swing: 0 at both ends (exact outlines),
  // the maximum halfway. It uses the eased progress, so it settles smoothly too.
  // Negative looks up from below.
  const maxTilt = (Math.min(60, Math.max(-60, Number($('#swing-tilt').value) || 0)) * Math.PI) / 180;
  const tilt = maxTilt * Math.sin(Math.PI * x);
  const r = size * 4;
  camera.position.set(Math.cos(a) * Math.cos(tilt) * r, Math.sin(a) * Math.cos(tilt) * r, Math.sin(tilt) * r);
  camera.up.set(0, 0, 1);
  camera.lookAt(0, 0, 0);
}
renderer.domElement.addEventListener('pointerdown', () => swing && setSwing(false));

// ---- Tour (only with tour=1 in the URL hash, for recording videos) -------------
// Two-word looks: for each cell of the design in order, zoom in on its chunk of
// word A from the front, then its chunk of word B from the side; then all of
// word A (front), all of word B (side), and back to the first stop, so it
// loops. Moves use the Swing timing and easing: pause, then azimuth, target
// and zoom (geometrically) move together, with the tilt arch.
// scripts/record-tour.mjs drives window.__tour to render a video frame by frame.
const TOUR = new URLSearchParams(location.hash.slice(1)).get('tour') === '1';
let wordCells = null; // per-cell chunk bounds from the words worker (view.cells)
let tour = null; // { t0 } while playing
let tourHeld = false; // __tour.seek owns the camera
let tourTarget = new THREE.Vector3();
const LETTER_FILL = 0.7; // a letter chunk fills this much of the view (height or width)
const WORD_FILL = 1 / 1.5; // as the Front/Side buttons: fitFrustum shows 1.5 × the design's size
function tourStops() {
  if (mode !== 'words' || !wordFrames || !wordCells?.length) return null;
  const ends = swingEnds();
  if (!ends) return null;
  const W = camera.right - camera.left, H = camera.top - camera.bottom;
  const stop = (view, chunks, wide) => {
    chunks = chunks.filter(Boolean);
    if (!chunks.length) return null;
    const { U, V, D } = wordFrames[view];
    const u0 = Math.min(...chunks.map((c) => c.min[0])), u1 = Math.max(...chunks.map((c) => c.max[0]));
    const v0 = Math.min(...chunks.map((c) => c.min[1])), v1 = Math.max(...chunks.map((c) => c.max[1]));
    // The chunk's centre as seen in this view; in depth, the cell's centre (so
    // the camera turns about the cell between its two letters). Wide shots
    // keep the design's centre in depth, like the view buttons.
    const target = new THREE.Vector3()
      .addScaledVector(new THREE.Vector3(...U), (u0 + u1) / 2)
      .addScaledVector(new THREE.Vector3(...V), (v0 + v1) / 2)
      .addScaledVector(new THREE.Vector3(...D), wide ? meshCentre.dot(new THREE.Vector3(...D)) : chunks[0].depth)
      .sub(meshCentre);
    const fill = wide ? WORD_FILL : LETTER_FILL;
    const zoom = fill * Math.min(H / Math.max(v1 - v0, 1e-6), W / Math.max(u1 - u0, 1e-6));
    const text = chunks.map((c) => c.text).join('');
    return { view, a: view === 'front' ? ends.a0 : ends.a1, target, zoom, wide, text };
  };
  const stops = [];
  for (const c of wordCells) stops.push(stop('front', [c.front]), stop('right', [c.right]));
  stops.push(stop('front', wordCells.map((c) => c.front), true), stop('right', wordCells.map((c) => c.right), true));
  return stops.filter(Boolean);
}
function tourPlan() {
  const stops = tourStops();
  if (!stops?.length) return null;
  const move = Math.max(0.3, Number($('#swing-secs').value) || 2);
  const hold = Math.max(0, Number($('#swing-hold').value) || 0);
  const segs = [];
  let t = 0;
  stops.forEach((from, i) => {
    const to = stops[(i + 1) % stops.length];
    // Zooming between a whole word and a letter takes a bit longer.
    const m = from.wide !== to.wide ? move * 1.5 : move;
    segs.push({ from, to, t0: t, hold, move: m });
    t += hold + m;
  });
  return { stops, segs, duration: t };
}
function tourCamera(plan, t) {
  t = ((t % plan.duration) + plan.duration) % plan.duration;
  const seg = plan.segs.findLast((s) => s.t0 <= t);
  const local = t - seg.t0;
  const x = local < seg.hold ? 0 : easeInOutSine(Math.min(1, (local - seg.hold) / seg.move));
  const { from, to } = seg;
  let a1 = to.a;
  while (a1 - from.a > Math.PI) a1 -= 2 * Math.PI;
  while (a1 - from.a < -Math.PI) a1 += 2 * Math.PI;
  const a = from.a + (a1 - from.a) * x;
  const maxTilt = (Math.min(60, Math.max(-60, Number($('#swing-tilt').value) || 0)) * Math.PI) / 180;
  const tilt = maxTilt * Math.sin(Math.PI * x);
  const target = from.target.clone().lerp(to.target, x);
  const r = size * 4;
  camera.position.set(Math.cos(a) * Math.cos(tilt), Math.sin(a) * Math.cos(tilt), Math.sin(tilt)).multiplyScalar(r).add(target);
  camera.up.set(0, 0, 1);
  camera.lookAt(target);
  camera.zoom = Math.exp(Math.log(from.zoom) + (Math.log(to.zoom) - Math.log(from.zoom)) * x);
  camera.updateProjectionMatrix();
  tourTarget = target;
}
function setTour(on, { keep = false } = {}) {
  const was = !!tour || tourHeld;
  tourHeld = false;
  if (on) setSwing(false);
  tour = on && tourPlan() ? { t0: performance.now() } : null;
  $('#tour')?.setAttribute('aria-pressed', String(!!tour));
  $('#swing-timing').classList.toggle('off', !swing && !tour);
  if (was && !tour) {
    // Hand the camera to the orbit controls: where the tour left it (a drag),
    // or reset for a view button.
    controls.dispose();
    controls = new OrbitControls(camera, renderer.domElement);
    if (keep) controls.target.copy(tourTarget);
    else { camera.zoom = 1; camera.updateProjectionMatrix(); }
  }
}
if (TOUR) {
  const b = Object.assign(document.createElement('button'), { type: 'button', id: 'tour', textContent: 'Tour ▶', title: 'Tour: zoom in on each letter pair, front then side, then each whole word; loops. Uses the swing timing.' });
  b.setAttribute('aria-pressed', 'false');
  $('#swing').after(b);
  b.addEventListener('click', () => setTour(!tour));
  renderer.domElement.addEventListener('pointerdown', () => tour && setTour(false, { keep: true }));
  // For scripts/record-tour.mjs: deterministic time. seek(t) (seconds) sets the
  // camera and renders; the page's own animation stays out of the way until release().
  window.__tour = {
    get ready() { return !!tourPlan(); },
    get duration() { return tourPlan()?.duration ?? 0; },
    stops: () => tourPlan()?.stops.map((s) => ({ view: s.view, text: s.text, wide: s.wide, zoom: s.zoom })) ?? [],
    seek(t) {
      const plan = tourPlan();
      if (!plan) return false;
      if (tour) setTour(false);
      if (swing) setSwing(false);
      tourHeld = true;
      tourCamera(plan, t);
      renderer.render(scene, camera);
      return true;
    },
    // Recolour faces by view label ({ front: '#000', right: '#fff', ... }; any CSS colour).
    faceColours(map) { for (const [k, c] of Object.entries(map)) faceMaterials[k]?.color.set(c); },
    // Scale both lights; neutral drops the fill light's blue ground tint (for white/grey faces).
    lighting({ scale = 1, neutral = false }) {
      hemi.intensity = 1.6 * scale; sun.intensity = 1.6 * scale;
      hemi.groundColor.set(neutral ? 0x999999 : 0x8888aa);
    },
    release() { tourHeld = false; camera.zoom = 1; camera.updateProjectionMatrix(); snap('iso'); },
  };
}

renderer.setAnimationLoop((now) => {
  if (tourHeld) { /* __tour.seek placed the camera */ } else if (tour) {
    const plan = tourPlan();
    if (plan) tourCamera(plan, (now - tour.t0) / 1000);
  } else if (swing) swingCamera(now);
  else controls.update();
  renderer.render(scene, camera);
});

// ---- Shadow panels ---------------------------------------------------------
const SVGNS = 'http://www.w3.org/2000/svg';
const pathOf = (polys) => polys.map((p) => 'M' + p.map(([x, y]) => `${x.toFixed(3)},${(-y).toFixed(3)}`).join('L') + 'Z').join('');

function showShadows(views, metrics) {
  const host = $('#shadow-panels');
  host.replaceChildren();
  for (const v of VIEW_NAMES) {
    const fig = document.createElement('figure');
    const svg = document.createElementNS(SVGNS, 'svg');
    const sz = lastOpts.size, pad = sz * 0.06;
    svg.setAttribute('viewBox', `${-sz / 2 - pad} ${-sz / 2 - pad} ${sz + 2 * pad} ${sz + 2 * pad}`);
    svg.setAttribute('role', 'img');
    const g = guide[v];
    svg.setAttribute('aria-label', `${v} shadow of "${g.text}"`);
    for (const [cls, polys] of [['shadow', views[v].shadow], ['missing', views[v].missing], ['target', views[v].target]]) {
      const p = document.createElementNS(SVGNS, 'path');
      p.setAttribute('class', cls);
      p.setAttribute('d', pathOf(polys));
      p.setAttribute('fill-rule', 'nonzero');
      svg.append(p);
    }
    const cap = document.createElement('figcaption');
    const rot = g.rotation ? `, turned ${g.rotation}°` : '';
    cap.textContent = `${v} "${g.text}" · ${(metrics.views[v].coverage * 100).toFixed(1)}% · from ${g.from}${rot}`;
    fig.append(svg, cap);
    host.append(fig);
  }
}

function showPrintCheck(metrics, t) {
  const el = $('#print-check');
  const pieces = metrics.pieces === 1 ? 'One piece' : `${metrics.pieces} separate pieces`;
  let thick = '';
  const thin = t && (t.erodedPieces !== metrics.pieces || t.thinRegions > 0);
  if (t) {
    thick = !thin
      ? ` · no part thinner than ${t.minThickness} mm`
      : ` · ${t.thinRegions || 'some'} part${t.thinRegions === 1 ? '' : 's'} thinner than ${t.minThickness} mm (${t.thinVolume.toFixed(1)} mm³)`;
  }
  el.textContent = pieces + thick;
  el.className = metrics.pieces !== 1 || thin ? 'warn' : '';
}

// "Show missing parts" toggle; remembered per browser when storage is available.
const showMissing = $('#show-missing');
try { showMissing.checked = localStorage.getItem('showMissing') !== 'false'; } catch {}
const applyShowMissing = () => $('#shadow-panels').classList.toggle('plain', !showMissing.checked);
showMissing.addEventListener('change', () => {
  applyShowMissing();
  try { localStorage.setItem('showMissing', String(showMissing.checked)); } catch {}
});
applyShowMissing();

// ---- Form / candidates -----------------------------------------------------
const form = $('#form');
const status = $('#status');
let lastOpts = null, stl = null;
let mode = 'letters';
let uploadedFont = null; // an uploaded font's bytes, reused by two-words mode
let googleFont = null; // { id, family, weight, url } when a Google Font is in use

function readForm() {
  const f = new FormData(form);
  return {
    texts: VIEW_NAMES.map((v) => String(f.get(v) ?? '')),
    opts: {
      size: Number(f.get('size')) || 40,
      fit: f.get('fit'),
      transforms: f.get('transforms'),
      permute: f.get('permute') === 'on',
      preferConnected: f.get('preferConnected') === 'on',
      minThickness: Number(f.get('minThickness')) || 0,
    },
  };
}

let selectedCandidate = null, selectToken = 0;
async function select(candidate, button) {
  for (const b of document.querySelectorAll('#candidates button')) b.setAttribute('aria-pressed', String(b === button));
  const token = ++selectToken;
  const r = await call({ type: 'build', candidate, opts: lastOpts });
  // Builds take a moment; if another candidate was picked meanwhile, or the
  // mode changed, this result is stale and must not overwrite the newer one.
  if (token !== selectToken || mode !== 'letters') return;
  selectedCandidate = candidate;
  writeHash();
  guide = r.guide;
  stl = r.stl;
  $('#download').disabled = false;
  showMesh(r);
  showShadows(r.views, r.metrics);
  showPrintCheck(r.metrics, r.thickness);
  if (swing) setSwing(true); else snap('iso');
}

const fontChoice = $('#font-choice');
for (const f of FONTS) fontChoice.append(new Option(`${f.name} — ${f.note}`, f.id));
fontChoice.addEventListener('change', async () => {
  const f = FONTS.find((x) => x.id === fontChoice.value);
  uploadedFont = null;
  clearGoogleFont();
  await call({ type: 'font', url: FONT_URLS[`../fonts/${f.file}`] });
  $('#font-upload').value = '';
  status.textContent = `Font: ${f.name}`;
  if (mode === 'letters') form.requestSubmit();
  else generateWords(false);
});

$('#font-upload').addEventListener('change', async () => {
  const file = $('#font-upload').files[0];
  if (!file) return;
  const data = await file.arrayBuffer();
  clearGoogleFont();
  uploadedFont = data.slice(0);
  await call({ type: 'font', data }, [data]);
  status.textContent = `Font: ${file.name}`;
  $('#words-status').textContent = `Font: ${file.name}`;
  if (mode === 'letters') form.requestSubmit();
  else generateWords(false);
});

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const { texts, opts } = readForm();
  if (texts.every((t) => !t)) { status.textContent = 'Enter at least one letter.'; return; }
  $('#go').disabled = true;
  status.textContent = 'Searching…';
  try {
    const r = await call({ type: 'search', texts, opts, top: 12 });
    lastOpts = opts;
    if (mode !== 'letters') return; // switched to two words while searching
    status.textContent = `Tried ${r.tried} arrangements in ${(r.ms / 1000).toFixed(1)} s.`;
    const list = $('#candidates');
    list.replaceChildren();
    r.candidates.forEach((c, i) => {
      const li = document.createElement('li');
      const b = document.createElement('button');
      b.type = 'button';
      const letters = VIEW_NAMES.map((v) => c.assignment[v] || '·').join(' ');
      const pieces = c.metrics.pieces === 1 ? '1 piece' : `${c.metrics.pieces} pieces`;
      b.innerHTML = `<span class="meta">${i + 1}</span><span class="letters"></span><span class="meta"></span>`;
      b.children[1].textContent = letters;
      // How to view each letter: 'back' = from the far side; ↺ = turned.
      const note = VIEW_NAMES.map((v) => {
        const { from, rotation } = c.guide[v];
        const back = from !== { front: '-Y', right: '+X', top: '+Z' }[v];
        return `${back ? 'back' : ''}${rotation ? `↺${rotation}` : ''}` || '·';
      }).join(' ');
      if (note !== '· · ·') b.children[1].append(Object.assign(document.createElement('span'), { className: 'note', textContent: note }));
      b.children[2].textContent = `${(c.metrics.minCoverage * 100).toFixed(1)}% · ${pieces}`;
      b.title = 'Worst-letter coverage · pieces';
      b.addEventListener('click', () => select(c, b));
      li.append(b);
      list.append(li);
    });
    // A shared link may name a candidate; otherwise take the best.
    const want = pendingPick && r.candidates.findIndex((c) => JSON.stringify([c.assignment, c.transforms]) === pendingPick);
    pendingPick = null;
    const k = want > 0 ? want : 0;
    await select(r.candidates[k], list.querySelectorAll('button')[k]);
  } catch (err) {
    status.textContent = `Error: ${err.message}`;
  } finally {
    $('#go').disabled = false;
  }
});

for (const b of document.querySelectorAll('.toolbar [data-view]')) b.addEventListener('click', () => { setTour(false); setSwing(false); snap(b.dataset.view); });
$('#swing').addEventListener('click', () => { setTour(false); setSwing(!swing); });
$('#colour-faces').addEventListener('change', applyColour);
// Bounding box toggle (off by default); remembered per browser when storage is available.
const showBox = $('#show-box');
try { showBox.checked = localStorage.getItem('showBox') === 'true'; } catch {}
showBox.addEventListener('change', () => {
  if (box) box.visible = showBox.checked;
  try { localStorage.setItem('showBox', String(showBox.checked)); } catch {}
});

$('#download').addEventListener('click', () => {
  const name = mode === 'words' ? wordDownloadName : VIEW_NAMES.map((v) => guide[v].text || '_').join('-') + '.stl';
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob([stl], { type: 'model/stl' })), download: name });
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
});

// ---- Looks (what to make) ------------------------------------------------------
// The look menu replaces the old tabs: 'cube' is the three-letter flow above;
// every other look is a two-word look generated by core/looks.js.
let wordsWorker = null, wordsJob = 0, wordDownloadName = 'design.stl';
const wordsForm = $('#words-form'), designsHost = $('#designs'), wordsStatus = $('#words-status');
let currentLook = 'cube';

// Small schematic drawings for the look menu.
const LOOK_ICONS = {
  cube: '<path class="line" d="M18 12l12-6 12 6v14l-12 6-12-6z M18 12l12 6 12-6 M30 18v14"/><text x="23" y="27" font-size="8" font-weight="700" class="ink">G</text><text x="33" y="27" font-size="8" font-weight="700" class="ink">E</text>',
  row: '<rect class="base" x="4" y="30" width="48" height="5" rx="2.5"/>' + [8, 20, 32, 44].map((x) => `<rect class="ink" x="${x - 4}" y="16" width="8" height="14" rx="1.5"/>`).join(''),
  rows: '<rect class="base" x="8" y="33" width="40" height="4" rx="2"/>' + [14, 26, 38].map((x) => `<rect class="ink" x="${x - 4}" y="19" width="8" height="12" rx="1.5"/>`).join('') + [20, 32].map((x) => `<rect class="ink" x="${x - 4}" y="5" width="8" height="12" rx="1.5"/>`).join(''),
  grid: [0, 1].flatMap((r) => [0, 1, 2].map((c) => `<rect class="ink" x="${14 + c * 11}" y="${6 + r * 15}" width="8" height="12" rx="1"/>`)).join(''),
  tower: [0, 1, 2, 3].map((r) => `<rect class="ink" x="24" y="${3 + r * 9}" width="8" height="7.5" rx="1"/>`).join(''),
  block: '<path class="ink" d="M28 34c-9-6-16-11-16-18a7 7 0 0 1 16-3 7 7 0 0 1 16 3c0 7-7 12-16 18z"/>',
};

function renderLookMenu() {
  const host = $('#looks');
  host.replaceChildren(...LOOKS.map((l) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.setAttribute('role', 'radio');
    b.dataset.look = l.id;
    b.title = l.blurb;
    b.innerHTML = `<svg viewBox="0 0 56 40" aria-hidden="true">${LOOK_ICONS[l.id] ?? ''}</svg><span></span>`;
    b.querySelector('span').textContent = l.label;
    b.addEventListener('click', () => setLook(l.id));
    return b;
  }));
}

// Knob widgets, generated from the look's definition.
const BOOL_LABELS = { stretch: 'Allow stretching letters', compact: 'Prefer compact', stand: 'Display stand', tidy: 'Tidy slivers (nudge strokes so letters meet cleanly)', trim: 'Trim knife edges (under 0.3 mm)', turn: 'Turn 45° for display', mono: 'Monospaced (letters widened to their column)' };
const KNOB_LABELS = { spacing: 'Spacing', case: 'Letters', rows: 'Rows', style: 'Style', shape: 'Shape seen from above', angle: 'Angle between the two words', supports: 'Support rods (thin joins between pieces)' };
const SHAPES = ['❤', '♥', '⭐', '☀', '♣', '♠', '♦', '♪', '😀', '🐱'];
let knobValues = {};
function renderKnobs(lookId) {
  const look = LOOK[lookId];
  knobValues = lookKnobs(lookId, knobValues);
  const host = $('#knobs');
  host.replaceChildren();
  const bools = document.createElement('div');
  bools.className = 'knob-bools';
  for (const [name, def] of Object.entries(look.knobs)) {
    if (def.type === 'bool') {
      const l = document.createElement('label');
      l.className = 'check';
      l.innerHTML = '<input type="checkbox"> <span></span>';
      const i = l.querySelector('input');
      i.name = name; i.checked = !!knobValues[name];
      l.querySelector('span').textContent = BOOL_LABELS[name] ?? name;
      i.addEventListener('change', () => setKnob(name, i.checked));
      bools.append(l);
      continue;
    }
    const wrap = document.createElement('div');
    wrap.className = 'knob';
    const cap = document.createElement('span');
    cap.textContent = KNOB_LABELS[name] ?? name;
    wrap.append(cap);
    if (def.type === 'choice') {
      const seg = document.createElement('div');
      seg.className = 'seg';
      seg.dataset.knob = name;
      for (const opt of def.options) {
        const b = document.createElement('button');
        b.type = 'button';
        b.textContent = def.labels?.[opt] ?? String(opt);
        b.setAttribute('aria-pressed', String(knobValues[name] === opt));
        b.addEventListener('click', () => setKnob(name, opt));
        seg.append(b);
      }
      wrap.append(seg);
    } else if (def.type === 'text') {
      const row = document.createElement('div');
      row.className = 'shape-row';
      const i = document.createElement('input');
      i.name = name; i.value = knobValues[name] ?? ''; i.placeholder = 'none'; i.setAttribute('aria-label', KNOB_LABELS[name] ?? name);
      i.addEventListener('change', () => setKnob(name, i.value.trim()));
      row.append(i);
      for (const ch of SHAPES) {
        const b = document.createElement('button');
        b.type = 'button'; b.textContent = ch; b.title = `Use ${ch}`;
        b.addEventListener('click', () => { i.value = ch; setKnob(name, ch); });
        row.append(b);
      }
      const none = document.createElement('button');
      none.type = 'button'; none.textContent = '×'; none.title = 'No shape';
      none.addEventListener('click', () => { i.value = ''; setKnob(name, ''); });
      row.append(none);
      wrap.append(row);
    }
    host.append(wrap);
  }
  host.append(bools);
}

const FINISH = new Set(['stand', 'turn']);
let knobTimer = null;
function setKnob(name, value) {
  knobValues[name] = value;
  for (const b of document.querySelectorAll(`.seg[data-knob="${name}"] button`)) b.setAttribute('aria-pressed', String(b.textContent === (LOOK[currentLook].knobs[name].labels?.[value] ?? String(value))));
  writeHash();
  if (FINISH.has(name)) {
    if (selectedItem) selectWordDesign(selectedItem, selectedButton);
    thumbReset();
    for (const b of designsHost.querySelectorAll('button')) if (b._item) queueThumb(b._item, b);
    return;
  }
  clearTimeout(knobTimer);
  knobTimer = setTimeout(() => generateWords(false), 250);
}

function startWordsWorker() {
  wordsWorker?.terminate();
  wordsWorker = new Worker(new URL('./words-worker.js', import.meta.url), { type: 'module' });
  wordsWorker.onmessage = ({ data }) => wordsHandlers.get(data.id)?.(data);
  return wordsWorker;
}
const wordsHandlers = new Map();
function wordsCall(msg, onMessage, transfer = []) {
  const id = ++wordsJob;
  wordsHandlers.set(id, onMessage);
  (wordsWorker ?? startWordsWorker()).postMessage({ ...msg, id }, transfer);
  return id;
}
// Fonts for a words-worker message: the front font (word A), plus the side
// word's font (word B) when it has its own (see sideSource).
function fontSource() {
  const side = sideSource();
  if (uploadedFont) return { fontData: uploadedFont.slice(0), ...side };
  if (googleFont) return { fontUrl: googleFont.url, ...side };
  const f = FONTS.find((x) => x.id === fontChoice.value);
  return { fontUrl: new URL(FONT_URLS[`../fonts/${f.file}`], location.href).href, ...side };
}

function setLook(id, { generate = true } = {}) {
  currentLook = id;
  mode = id === 'cube' ? 'letters' : 'words';
  for (const b of document.querySelectorAll('#looks button')) b.setAttribute('aria-checked', String(b.dataset.look === id));
  $('#look-blurb').textContent = LOOK[id].blurb;
  const words = mode === 'words';
  form.hidden = words; $('#candidates').hidden = words;
  wordsForm.hidden = !words; designsHost.hidden = !words;
  $('#side-font').hidden = !words;
  $('#view-right').textContent = words ? 'Side' : 'Right';
  $('#shadow-panels').replaceChildren();
  $('#print-check').textContent = '';
  $('#download').disabled = true;
  if (meshObj) { scene.remove(meshObj); meshObj = null; }
  if (box) { scene.remove(box); box = null; }
  if (words) {
    knobValues = {};
    renderKnobs(id);
    designsHost.replaceChildren();
    selectedItem = null;
  }
  writeHash();
  if (!generate) return;
  if (words) generateWords(false);
  else form.requestSubmit();
}

const pct1 = (x) => `${(x * 100).toFixed(1)}%`;
let currentWords = ['', ''], selectedButton = null;
function generateWords(more = false) {
  const f = new FormData(wordsForm);
  const wordA = String(f.get('wordA') ?? '').trim(), wordB = String(f.get('wordB') ?? '').trim();
  if (!wordA || !wordB) { wordsStatus.textContent = 'Enter two words.'; return; }
  startWordsWorker(); // cancels anything running
  currentWords = [wordA, wordB];
  designsHost.replaceChildren();
  selectedButton = null;
  thumbReset();
  wordsStatus.textContent = more ? 'Trying more variants…' : 'Making it…';
  $('#words-stop').disabled = false;
  let first = true;
  wordsCall({ type: 'look', wordA, wordB, lookId: currentLook, knobs: { ...knobValues }, more, ...fontSource() }, (m) => {
    if (m.type === 'item') {
      const { item } = m;
      const b = document.createElement('button');
      b.type = 'button';
      b.innerHTML = '<img class="thumb" alt="" width="72" height="48"><span class="title"></span><span class="q"></span><span class="text"></span>';
      b.querySelector('.title').textContent = item.title;
      const mm = item.metrics;
      b.querySelector('.q').textContent = checkBadge(mm);
      b.querySelector('.q').title = designChecks(mm).map((c) => `${c.ok ? '✓' : '•'} ${c.text}`).join('\n');
      b.querySelector('.text').textContent = item.text + (item.note ? ` · ${item.note}` : '');
      queueThumb(item, b);
      b._item = item;
      b.addEventListener('click', () => selectWordDesign(item, b));
      designsHost.append(b);
      wordsStatus.textContent = `${m.n} design${m.n === 1 ? '' : 's'} so far (${(m.ms / 1000).toFixed(0)} s)…`;
      if (sharedRecipe && JSON.stringify(stripFinish(item.recipe)) === sharedRecipe) {
        selectedButton?.setAttribute('aria-pressed', 'false');
        b.setAttribute('aria-pressed', 'true');
        selectedButton = b;
        first = false;
      } else if (first && !sharedRecipe) { first = false; selectWordDesign(item, b); }
    } else if (m.type === 'done') {
      wordsStatus.textContent = `${m.n} design${m.n === 1 ? '' : 's'} in ${(m.ms / 1000).toFixed(1)} s.${more ? '' : ' “More variants” tries other cases, layouts and styles.'}`;
      $('#words-stop').disabled = true;
    } else if (m.type === 'error') {
      wordsStatus.textContent = `Error: ${m.error}`;
      $('#words-stop').disabled = true;
    }
  });
}
const stripFinish = ({ stand, turn, ...r }) => r;

let selectedItem = null, sharedRecipe = null;
function selectWordDesign(item, button) {
  selectedButton?.setAttribute('aria-pressed', 'false');
  button?.setAttribute('aria-pressed', 'true');
  selectedButton = button;
  selectedItem = item;
  if (button) sharedRecipe = null; // a click replaces whatever a link asked for
  writeHash();
  // Builds run on their own worker so they don't wait behind a running search.
  const builder = selectWordDesign.worker ??= (() => {
    const w = new Worker(new URL('./words-worker.js', import.meta.url), { type: 'module' });
    w.onmessage = ({ data }) => selectWordDesign.handlers.get(data.id)?.(data);
    return w;
  })();
  selectWordDesign.handlers ??= new Map();
  const id = (selectWordDesign.next = (selectWordDesign.next ?? 0) + 1);
  selectWordDesign.handlers.set(id, (m) => {
    selectWordDesign.handlers.delete(id);
    if (id !== selectWordDesign.next || mode !== 'words') return; // a newer selection or mode won
    if (m.type === 'error') { wordsStatus.textContent = `Error: ${m.error}`; return; }
    const { view } = m;
    wordFrames = view.frames;
    wordCells = view.cells ?? null;
    stl = m.stl;
    wordDownloadName = `${currentWords.join('-')}-${currentLook}-${item.title.replace(/[^\w]+/g, '-')}.stl`.toLowerCase().replace(/-+/g, '-');
    $('#download').disabled = false;
    showMesh({ ...view.mesh, runs: view.runs });
    showWordShadows(view, item);
    if (swing) setSwing(true); else snap('iso');
  });
  // The finish (stand, turn) comes from the current knobs, not the listed recipe.
  const finish = { stand: !!knobValues.stand, turn: !!knobValues.turn };
  builder.postMessage({ type: 'build', id, wordA: currentWords[0], wordB: currentWords[1], recipe: { ...item.recipe, ...finish }, ...fontSource() });
}

// Plain-language checks for a design (numbers go under "Numbers").
function designChecks(m) {
  const checks = [];
  const add = (ok, text) => checks.push({ ok, text });
  add(m.coverage >= 0.995, m.coverage >= 0.995 ? 'Every letter fully shows in its shadow' : `The least complete letter shows ${pct1(m.coverage)} (red in the shadows)`);
  add(m.visibleMin >= 0.97, m.visibleMin >= 0.97 ? 'No letter is hidden by its neighbours' : `${m.leastVisible} is ${pct1(1 - m.visibleMin)} covered by neighbouring letters`);
  add(m.contactMax <= 0.3, m.contactMax <= 0.3 ? 'Letters don’t merge into each other' : `${m.mostContact} touches its neighbours along a whole stroke (can read as one letter)`);
  if (m.stretch > 0.005) add(m.stretch <= 0.25, `Letters stretched up to ${Math.round(m.stretch * 100)}%`);
  add(m.finalPieces === 1, m.finalPieces === 1 ? `One piece${m.rods ? ` (${m.rods} small support rod${m.rods === 1 ? '' : 's'})` : ''}` : `${m.finalPieces} separate pieces`);
  if (m.finalPieces > 1 && knobValues.supports === 'none') {
    add(false, 'Without supports, gapped letters can’t connect: try touching spacing, a display stand, or allow supports');
  }
  return checks;
}
function checkBadge(m) {
  const bad = designChecks(m).filter((c) => !c.ok).length;
  return bad ? `${bad} to note` : 'all good';
}

function showWordShadows(view, item) {
  const host = $('#shadow-panels');
  host.replaceChildren();
  const m = view.metrics;
  const el = $('#print-check');
  el.className = '';
  el.replaceChildren();
  const list = document.createElement('ul');
  list.className = 'checks';
  for (const c of designChecks(m)) {
    const li = document.createElement('li');
    li.className = c.ok ? 'ok' : 'note';
    li.textContent = c.text;
    list.append(li);
  }
  const size = document.createElement('li');
  size.className = 'info';
  size.textContent = `About ${m.size.map((x) => x.toFixed(0)).join(' × ')} mm (letters 20 mm tall)`;
  list.append(size);
  el.append(list);
  const nums = document.createElement('details');
  nums.id = 'word-stats';
  nums.innerHTML = '<summary>Numbers</summary><p></p>';
  nums.querySelector('p').textContent = `${item.title} — worst letter ${pct1(m.coverage)} · least visible ${m.visibleMin < 1 ? `${m.leastVisible} ${pct1(m.visibleMin)}` : 'all 100%'}`
    + ` · most contact ${m.contactMax > 0 ? `${m.mostContact} ${pct1(m.contactMax)}` : 'none'} · stretch ${(m.stretch * 100).toFixed(0)}% · pieces ${m.pieces} → ${m.finalPieces}`
    + `${m.rods ? ` · ${m.rods} rods (longest ${m.longestRod.toFixed(1)} mm)` : ''}${m.blocks ? ` · ${m.blocks} hidden joins` : ''} · quality ${m.quality.toFixed(3)}`;
  host.append(nums);
  for (const [v, x] of Object.entries(view.views)) {
    const fig = document.createElement('figure');
    const svg = document.createElementNS(SVGNS, 'svg');
    svg.classList.add('wide');
    const pts = x.target.flat();
    const [x0, x1] = [Math.min(...pts.map((p) => p[0])), Math.max(...pts.map((p) => p[0]))];
    const [y0, y1] = [Math.min(...pts.map((p) => p[1])), Math.max(...pts.map((p) => p[1]))];
    const pad = 0.04 * Math.max(x1 - x0, y1 - y0);
    svg.setAttribute('viewBox', `${x0 - pad} ${-y1 - pad} ${x1 - x0 + 2 * pad} ${y1 - y0 + 2 * pad}`);
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', `${x.label} shadow`);
    for (const [cls, polys] of [['shadow', x.shadow], ['missing', x.missing], ['target', x.target]]) {
      const p = document.createElementNS(SVGNS, 'path');
      p.setAttribute('class', cls);
      p.setAttribute('d', pathOf(polys));
      svg.append(p);
    }
    const cap = document.createElement('figcaption');
    cap.textContent = `${x.label === 'right' ? 'side' : x.label} · ${pct1(m.views[v].coverage)}`;
    fig.append(svg, cap);
    host.append(fig);
  }
}

wordsForm.addEventListener('submit', (e) => { e.preventDefault(); generateWords(false); });
$('#words-more').addEventListener('click', () => generateWords(true));
$('#words-stop').addEventListener('click', () => {
  startWordsWorker();
  $('#words-stop').disabled = true;
  wordsStatus.textContent = `Stopped · ${designsHost.querySelectorAll('button').length} designs.`;
});


// ---- Thumbnails for the results list ------------------------------------------
// A third worker builds each listed design's mesh in the background; one small
// offscreen renderer draws a 3/4 view into an <img>. Restarting a search
// cancels the queue (thumbGeneration).
const THUMB_W = 144, THUMB_H = 96;
let thumbWorker = null, thumbQueue = [], thumbBusy = false, thumbGeneration = 0, thumbRenderer = null;
function thumbReset() { thumbGeneration++; thumbQueue = []; }
function queueThumb(item, button) {
  thumbQueue.push({ item, button, gen: thumbGeneration });
  pumpThumbs();
}
function pumpThumbs() {
  if (thumbBusy) return;
  const job = thumbQueue.shift();
  if (!job) return;
  if (job.gen !== thumbGeneration) return pumpThumbs();
  thumbBusy = true;
  thumbWorker ??= new Worker(new URL('./words-worker.js', import.meta.url), { type: 'module' });
  thumbWorker.onmessage = ({ data }) => {
    thumbBusy = false;
    if (data.type === 'mesh' && job.gen === thumbGeneration && job.button.isConnected) {
      const img = job.button.querySelector('img.thumb');
      if (img) img.src = renderThumb(data.mesh);
    }
    pumpThumbs();
  };
  const finish = { stand: !!knobValues.stand, turn: !!knobValues.turn };
  thumbWorker.postMessage({ type: 'build', id: 0, meshOnly: true, wordA: currentWords[0], wordB: currentWords[1], recipe: { ...job.item.recipe, ...finish }, ...fontSource() });
}
function renderThumb({ numProp, vertProperties, triVerts }) {
  thumbRenderer ??= new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  thumbRenderer.setPixelRatio(2);
  thumbRenderer.setSize(THUMB_W, THUMB_H, false);
  const sceneT = new THREE.Scene();
  sceneT.add(new THREE.HemisphereLight(0xffffff, 0x8888aa, 1.6));
  const sunT = new THREE.DirectionalLight(0xffffff, 1.6); sunT.position.set(2, -3, 4); sceneT.add(sunT);
  const pos = new Float32Array((vertProperties.length / numProp) * 3);
  for (let i = 0, j = 0; i < vertProperties.length; i += numProp) { pos[j++] = vertProperties[i]; pos[j++] = vertProperties[i + 1]; pos[j++] = vertProperties[i + 2]; }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setIndex(new THREE.BufferAttribute(triVerts, 1));
  geo.computeBoundingSphere();
  const mesh = new THREE.Mesh(geo, material);
  sceneT.add(mesh);
  const c = geo.boundingSphere.center, r = geo.boundingSphere.radius;
  const cam = new THREE.OrthographicCamera(-r * 1.5, r * 1.5, r, -r, 0.1, r * 20);
  cam.up.set(0, 0, 1);
  cam.position.set(c.x + r * 1.1 * 2, c.y - r * 1.6 * 2, c.z + r * 1.2 * 2);
  cam.lookAt(c);
  thumbRenderer.render(sceneT, cam);
  const url = thumbRenderer.domElement.toDataURL('image/png');
  geo.dispose();
  return url;
}

// ---- Any Google Font (via Fontsource: TTF files on jsDelivr, CORS-enabled) ----
// The bundled fonts were picked for this job; any Google Font can be loaded by
// name. Heaviest weight by default — heavy faces cover letters best.
let googleCatalog = null, pendingGoogleFont = null;
const gfont = $('#gfont'), gweight = $('#gweight');
async function loadGoogleCatalog() {
  if (googleCatalog) return googleCatalog;
  const list = await (await fetch('https://api.fontsource.org/v1/fonts')).json();
  googleCatalog = list.filter((f) => f.type === 'google' && f.styles.includes('normal') && f.subsets.includes('latin'));
  $('#gfont-list').replaceChildren(...googleCatalog.map((f) => new Option(f.family)));
  return googleCatalog;
}
function clearGoogleFont() {
  googleFont = null;
  gfont.value = '';
  gweight.replaceChildren();
  gweight.disabled = true;
}
// A Google Font by id or family name, at `weight` if it has it (else its heaviest).
async function resolveGoogleFont(idOrFamily, weight) {
  const cat = await loadGoogleCatalog();
  const key = String(idOrFamily).trim().toLowerCase();
  const f = cat.find((x) => x.id === key || x.family.toLowerCase() === key);
  if (!f) return null;
  const w = f.weights.includes(weight) ? weight : Math.max(...f.weights);
  return { id: f.id, family: f.family, weight: w, weights: f.weights, url: `https://cdn.jsdelivr.net/fontsource/fonts/${f.id}@latest/latin-${w}-normal.ttf` };
}
async function useGoogleFont(idOrFamily, weight, { quiet = false } = {}) {
  const say = (t) => { status.textContent = t; $('#words-status').textContent = t; };
  try {
    const f = await resolveGoogleFont(idOrFamily, weight);
    if (!f) { say(`No Google Font called “${idOrFamily}”.`); return false; }
    const { weight: w, url } = f;
    say(`Loading ${f.family} ${w}…`);
    await call({ type: 'font', url });
    uploadedFont = null;
    $('#font-upload').value = '';
    googleFont = { id: f.id, family: f.family, weight: w, url };
    gfont.value = f.family;
    gweight.replaceChildren(...f.weights.map((x) => new Option(String(x), String(x))));
    gweight.value = String(w);
    gweight.disabled = false;
    say(`Font: ${f.family} ${w} (Google Fonts, OFL)`);
    writeHash();
    if (!quiet && mode === 'letters') form.requestSubmit();
    if (!quiet && mode === 'words') generateWords(false);
    return true;
  } catch (e) {
    say(`Couldn’t load that font: ${e.message}`);
    return false;
  }
}
gfont.addEventListener('focus', () => { loadGoogleCatalog().catch(() => {}); }, { once: true });
gfont.addEventListener('change', () => gfont.value.trim() && useGoogleFont(gfont.value));
gweight.addEventListener('change', () => googleFont && useGoogleFont(googleFont.id, Number(gweight.value)));

// ---- Side word font (two-word looks) ------------------------------------------
// The word seen from the side (word B) can use its own font, e.g. a script
// face one way and a block face the other. Like the front font it's page
// state, not part of a design's recipe. null = same as the front font.
// { kind: 'bundled', id } | { kind: 'google', id, family, weight, url } | { kind: 'upload', name, data }
let sideFont = null, pendingSideGoogle = null, font2Settled = '';
const font2Choice = $('#font2-choice'), gfont2 = $('#gfont2'), gweight2 = $('#gweight2');
font2Choice.append(new Option('Same as front', ''), ...FONTS.map((f) => new Option(f.name, f.id)),
  new Option('Any Google Font…', 'google'), new Option('Upload a font…', 'upload'));

function sideSource() {
  if (!sideFont) return {};
  if (sideFont.kind === 'upload') return { fontBData: sideFont.data.slice(0) };
  if (sideFont.kind === 'google') return { fontBUrl: sideFont.url };
  const f = FONTS.find((x) => x.id === sideFont.id);
  return { fontBUrl: new URL(FONT_URLS[`../fonts/${f.file}`], location.href).href };
}
// True when the side font is the front font anyway (then links don't carry it).
function sideIsFront() {
  if (!sideFont) return true;
  if (sideFont.kind === 'bundled') return !googleFont && !uploadedFont && sideFont.id === fontChoice.value;
  if (sideFont.kind === 'google') return googleFont?.url === sideFont.url;
  return false;
}
function setSideFont(next, { quiet = false, say = null } = {}) {
  sideFont = next;
  font2Settled = font2Choice.value;
  $('#gfont2-row').hidden = next?.kind !== 'google' && font2Choice.value !== 'google';
  writeHash();
  if (!quiet && mode === 'words') generateWords(false);
  if (say) $('#words-status').textContent = say;
}
font2Choice.addEventListener('change', () => {
  const v = font2Choice.value;
  $('#gfont2-row').hidden = v !== 'google';
  if (v === 'upload') { $('#font2-upload').click(); return; } // chosen in the file dialog
  if (v === 'google') { loadGoogleCatalog().catch(() => {}); gfont2.focus(); return; } // chosen by name
  gfont2.value = '';
  setSideFont(v ? { kind: 'bundled', id: v } : null);
});
$('#font2-upload').addEventListener('cancel', () => { font2Choice.value = font2Settled; $('#gfont2-row').hidden = font2Settled !== 'google'; });
$('#font2-upload').addEventListener('change', async () => {
  const file = $('#font2-upload').files[0];
  if (!file) { font2Choice.value = font2Settled; return; }
  const data = await file.arrayBuffer();
  $('#font2-upload').value = '';
  gfont2.value = '';
  font2Choice.querySelector('option[value="upload"]').textContent = `${file.name} (uploaded)`;
  font2Choice.value = 'upload';
  setSideFont({ kind: 'upload', name: file.name, data });
});
async function useSideGoogleFont(idOrFamily, weight, { quiet = false } = {}) {
  const say = (t) => { $('#words-status').textContent = t; };
  try {
    const f = await resolveGoogleFont(idOrFamily, weight);
    if (!f) { say(`No Google Font called “${idOrFamily}”.`); return false; }
    say(`Loading ${f.family} ${f.weight}…`);
    const res = await fetch(f.url); // check it loads (the workers then get it from the cache)
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    font2Choice.value = 'google';
    gfont2.value = f.family;
    gweight2.replaceChildren(...f.weights.map((x) => new Option(String(x), String(x))));
    gweight2.value = String(f.weight);
    gweight2.disabled = false;
    setSideFont({ kind: 'google', id: f.id, family: f.family, weight: f.weight, url: f.url }, { quiet });
    if (quiet) say(`Side word font: ${f.family} ${f.weight} (Google Fonts, OFL)`);
    return true;
  } catch (e) {
    say(`Couldn’t load that font: ${e.message}`);
    return false;
  }
}
gfont2.addEventListener('focus', () => { loadGoogleCatalog().catch(() => {}); }, { once: true });
gfont2.addEventListener('change', () => {
  const name = gfont2.value.trim();
  if (!name || (sideFont?.kind === 'google' && sideFont.family.toLowerCase() === name.toLowerCase())) return; // already in use
  useSideGoogleFont(name);
});
gweight2.addEventListener('change', () => sideFont?.kind === 'google' && useSideGoogleFont(sideFont.id, Number(gweight2.value)));

// ---- Shareable state in the URL hash -----------------------------------------
// #look=cube&font=bungee&t=G|E|B&size=40&fit=stretch&tf=upright&perm=1&conn=1&thick=1&pick=[...]
// #look=row&font=kanit-black&a=Finola&b=Bryan&k={knobs}&r={recipe}&ti=title
//   (+ font2=… or gf2=…&gw2=… when the side word has its own font)
// Older links (#m=letters / #m=words&…) still open.
let pendingPick = null;
function writeHash() {
  const h = new URLSearchParams();
  h.set('look', currentLook);
  if (googleFont) { h.set('gf', googleFont.id); h.set('gw', googleFont.weight); } else if (!uploadedFont) h.set('font', fontChoice.value);
  if (mode === 'letters') {
    const f = new FormData(form);
    h.set('t', VIEW_NAMES.map((v) => f.get(v) ?? '').join('|'));
    h.set('size', f.get('size')); h.set('fit', f.get('fit')); h.set('tf', f.get('transforms'));
    h.set('perm', f.get('permute') === 'on' ? '1' : '0'); h.set('conn', f.get('preferConnected') === 'on' ? '1' : '0');
    h.set('thick', f.get('minThickness'));
    if (selectedCandidate) h.set('pick', JSON.stringify([selectedCandidate.assignment, selectedCandidate.transforms]));
  } else {
    const f = new FormData(wordsForm);
    h.set('a', f.get('wordA')); h.set('b', f.get('wordB'));
    h.set('k', JSON.stringify(knobValues));
    // The side word's font, only when it differs from the front font (uploads aren't linked).
    if (!sideIsFront()) {
      if (sideFont.kind === 'bundled') h.set('font2', sideFont.id);
      else if (sideFont.kind === 'google') { h.set('gf2', sideFont.id); h.set('gw2', sideFont.weight); }
    }
    if (selectedItem) { h.set('r', JSON.stringify(stripFinish(selectedItem.recipe))); h.set('ti', selectedItem.title); }
  }
  if (new URLSearchParams(location.hash.slice(1)).get('tour') === '1') h.set('tour', '1'); // keep tour mode
  history.replaceState(null, '', `#${h}`);
}

// Which look an older recipe belongs to (for links from before the look menu).
function lookOfRecipe(r) {
  if (r.kind === 'block') return 'block';
  if (r.kind === 'span' || r.kind === 'stacked') return 'tower';
  if (r.spacing?.startsWith('grid')) return 'grid';
  if (r.spacing?.startsWith('column')) return 'tower';
  return (r.layout?.rows?.length ?? 1) > 1 ? 'rows' : 'row';
}

function readHash() {
  const h = new URLSearchParams(location.hash.slice(1));
  if (!h.has('look') && !h.has('m')) return null;
  if (h.get('font') && FONTS.some((f) => f.id === h.get('font'))) fontChoice.value = h.get('font');
  if (h.get('gf')) pendingGoogleFont = { id: h.get('gf'), weight: Number(h.get('gw')) || null };
  const look = h.get('look') ?? (h.get('m') === 'letters' ? 'cube' : null);
  if (look === 'cube') {
    const t = (h.get('t') ?? '').split('|');
    VIEW_NAMES.forEach((v, i) => { if (t[i] != null && t[i] !== '') form[v].value = t[i]; });
    for (const [key, name] of [['size', 'size'], ['fit', 'fit'], ['tf', 'transforms'], ['thick', 'minThickness']]) if (h.has(key)) form[name].value = h.get(key);
    if (h.has('perm')) form.permute.checked = h.get('perm') === '1';
    if (h.has('conn')) form.preferConnected.checked = h.get('conn') === '1';
    pendingPick = h.get('pick');
    return { look: 'cube' };
  }
  if (h.get('font2') && FONTS.some((f) => f.id === h.get('font2'))) {
    sideFont = { kind: 'bundled', id: h.get('font2') };
    font2Choice.value = font2Settled = h.get('font2');
  }
  if (h.get('gf2')) pendingSideGoogle = { id: h.get('gf2'), weight: Number(h.get('gw2')) || null };
  wordsForm.wordA.value = h.get('a') ?? wordsForm.wordA.value;
  wordsForm.wordB.value = h.get('b') ?? wordsForm.wordB.value;
  const recipe = h.get('r') ? JSON.parse(h.get('r')) : null;
  let knobs = {};
  try { knobs = JSON.parse(h.get('k') ?? '{}'); } catch {}
  if (h.get('stand') === '1') knobs.stand = true; // older links
  if (h.get('turn') === '1') knobs.turn = true;
  const resolved = look && LOOK[look] ? look : recipe ? lookOfRecipe(recipe) : 'row';
  if (recipe) { const { stand, turn, ...rest } = recipe; if (stand) knobs.stand = true; if (turn) knobs.turn = true; sharedRecipe = JSON.stringify(rest); }
  return { look: resolved, knobs, title: h.get('ti') ?? 'Shared design', recipe };
}

$('#share').addEventListener('click', async () => {
  writeHash();
  const note = uploadedFont ? ' (the uploaded font isn’t included; the link uses the default font)'
    : sideFont?.kind === 'upload' ? ' (the uploaded side word font isn’t included; the link uses the front font for both words)' : '';
  try {
    await navigator.clipboard.writeText(location.href);
    $('#share-status').textContent = `Link copied${note}.`;
  } catch {
    $('#share-status').textContent = `Copy this link${note}: ${location.href}`;
  }
});
form.addEventListener('change', () => writeHash());
wordsForm.addEventListener('change', (e) => { if (e.target.name === 'wordA' || e.target.name === 'wordB') writeHash(); });

// Start: the look menu, then restore a shared link if there is one.
renderLookMenu();
const shared = readHash();
if (shared && pendingGoogleFont) await useGoogleFont(pendingGoogleFont.id, pendingGoogleFont.weight, { quiet: true });
else if (shared) await call({ type: 'font', url: FONT_URLS[`../fonts/${FONTS.find((f) => f.id === fontChoice.value).file}`] });
if (shared && pendingSideGoogle) await useSideGoogleFont(pendingSideGoogle.id, pendingSideGoogle.weight, { quiet: true });
if (shared && shared.look !== 'cube') {
  setLook(shared.look, { generate: false });
  knobValues = lookKnobs(shared.look, shared.knobs);
  renderKnobs(shared.look);
  writeHash();
  generateWords(false);
  if (shared.recipe) selectWordDesign({ title: shared.title, recipe: JSON.parse(sharedRecipe) }, null);
} else {
  setLook('cube', { generate: false });
  form.requestSubmit();
}
