import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import FONTS from '../fonts/fonts.json';

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
scene.add(new THREE.HemisphereLight(0xffffff, 0x8888aa, 1.6));
const sun = new THREE.DirectionalLight(0xffffff, 1.6);
sun.position.set(2, -3, 4);
scene.add(sun);
const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 1000);
camera.up.set(0, 0, 1);
let controls = new OrbitControls(camera, renderer.domElement);
let meshObj = null, box = null, size = 40;

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
  applyColour();
  scene.add(meshObj);
  box = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(dims.x, dims.y, dims.z)),
    new THREE.LineBasicMaterial({ color: 0x888888, transparent: true, opacity: 0.35 }),
  );
  scene.add(box);
  fitFrustum();
}

renderer.setAnimationLoop(() => { controls.update(); renderer.render(scene, camera); });

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
  snap('iso');
}

const fontChoice = $('#font-choice');
for (const f of FONTS) fontChoice.append(new Option(`${f.name} — ${f.note}`, f.id));
fontChoice.addEventListener('change', async () => {
  const f = FONTS.find((x) => x.id === fontChoice.value);
  uploadedFont = null;
  clearGoogleFont();
  await call({ type: 'font', url: FONT_URLS[`../fonts/${f.file}`] });
  form.font.value = '';
  status.textContent = `Font: ${f.name}`;
  if (mode === 'letters') form.requestSubmit();
  else $('#words-status').textContent = `Font: ${f.name}. Generate to use it.`;
});

form.font.addEventListener('change', async () => {
  const file = form.font.files[0];
  if (!file) return;
  const data = await file.arrayBuffer();
  uploadedFont = data.slice(0);
  await call({ type: 'font', data }, [data]);
  status.textContent = `Font: ${file.name}`;
  form.requestSubmit();
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

for (const b of document.querySelectorAll('.toolbar [data-view]')) b.addEventListener('click', () => snap(b.dataset.view));
$('#colour-faces').addEventListener('change', applyColour);

$('#download').addEventListener('click', () => {
  const name = mode === 'words' ? wordDownloadName : VIEW_NAMES.map((v) => guide[v].text || '_').join('-') + '.stl';
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob([stl], { type: 'model/stl' })), download: name });
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
});

// ---- Two words mode --------------------------------------------------------
let wordsWorker = null, wordsJob = 0, wordDownloadName = 'design.stl';
const wordsForm = $('#words-form'), designsHost = $('#designs'), wordsStatus = $('#words-status');

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
function fontSource() {
  if (uploadedFont) return { fontData: uploadedFont.slice(0) };
  if (googleFont) return { fontUrl: googleFont.url };
  const f = FONTS.find((x) => x.id === fontChoice.value);
  return { fontUrl: new URL(FONT_URLS[`../fonts/${f.file}`], location.href).href };
}

function setMode(next) {
  mode = next;
  const words = mode === 'words';
  $('#tab-letters').setAttribute('aria-selected', String(!words));
  $('#tab-words').setAttribute('aria-selected', String(words));
  form.hidden = words; $('#candidates').hidden = words;
  wordsForm.hidden = !words; designsHost.hidden = !words;
  $('#view-right').textContent = words ? 'Side' : 'Right';
  $('#shadow-panels').replaceChildren();
  $('#print-check').textContent = '';
  $('#download').disabled = true;
  if (meshObj) { scene.remove(meshObj); meshObj = null; }
  if (box) { scene.remove(box); box = null; }
  writeHash();
  if (words && !designsHost.children.length) wordsForm.requestSubmit();
  if (!words) form.requestSubmit();
}
$('#tab-letters').addEventListener('click', () => mode !== 'letters' && setMode('letters'));
$('#tab-words').addEventListener('click', () => mode !== 'words' && setMode('words'));

const checked = (name) => [...wordsForm.querySelectorAll(`input[name="${name}"]:checked`)].map((i) => i.value);
function wordsOptions(everything = false) {
  const f = new FormData(wordsForm);
  const tops = [...String(f.get('tops') ?? '').trim()].length ? [null, ...[...new Intl.Segmenter().segment(String(f.get('tops')).replace(/[\s,]+/g, ''))].map((x) => x.segment)] : [null];
  const angles = String(f.get('angles') ?? '').split(/[\s,]+/).map(Number).filter((x) => x > 0 && x < 180);
  if (everything) {
    return { sections: ['families', 'blocks', 'angles', 'spans', 'stacked'], families: ['touching', 'spaced', 'grid', 'grid-mono', 'column', 'column-touching'], cases: ['upper', 'lower', 'title', 'mixed'], rows: [1, 2, 3], tops, angles };
  }
  return { sections: checked('section'), families: checked('family'), cases: checked('case'), rows: checked('rows').map(Number), tops, angles };
}

const pct1 = (x) => `${(x * 100).toFixed(1)}%`;
let currentWords = ['', ''], selectedButton = null;
function generateWords(everything = false) {
  const f = new FormData(wordsForm);
  const wordA = String(f.get('wordA') ?? '').trim(), wordB = String(f.get('wordB') ?? '').trim();
  if (!wordA || !wordB) { wordsStatus.textContent = 'Enter two words.'; return; }
  const opts = wordsOptions(everything);
  if (!opts.sections.length) { wordsStatus.textContent = 'Pick at least one kind of design.'; return; }
  startWordsWorker(); // cancels any running gallery
  currentWords = [wordA, wordB];
  designsHost.replaceChildren();
  selectedButton = null;
  wordsStatus.textContent = 'Generating…';
  $('#words-stop').disabled = false;
  const sections = new Map();
  let first = true;
  wordsCall({ type: 'gallery', wordA, wordB, opts, ...fontSource() }, (m) => {
    if (m.type === 'item') {
      const { item } = m;
      if (!sections.has(item.section)) {
        const h = Object.assign(document.createElement('h3'), { textContent: item.section });
        designsHost.append(h);
        sections.set(item.section, h);
      }
      const b = document.createElement('button');
      b.type = 'button';
      b.innerHTML = '<span class="title"></span><span class="q"></span><span class="text"></span>';
      b.children[0].textContent = item.title;
      const mm = item.metrics;
      b.children[1].textContent = `${pct1(mm.coverage)} · q ${mm.quality.toFixed(2)}`;
      b.children[1].title = 'Worst-letter coverage · quality score';
      b.children[2].textContent = item.text + (item.note ? ` · ${item.note}` : '');
      b.addEventListener('click', () => selectWordDesign(item, b));
      designsHost.append(b);
      wordsStatus.textContent = `${m.n} design${m.n === 1 ? '' : 's'} so far (${(m.ms / 1000).toFixed(0)} s)…`;
      if (sharedRecipe && JSON.stringify(item.recipe) === sharedRecipe) {
        // The design a shared link opened: highlight it without rebuilding.
        selectedButton?.setAttribute('aria-pressed', 'false');
        b.setAttribute('aria-pressed', 'true');
        selectedButton = b;
        first = false;
      } else if (first && !sharedRecipe) { first = false; selectWordDesign(item, b); }
    } else if (m.type === 'done') {
      wordsStatus.textContent = `${m.n} designs in ${(m.ms / 1000).toFixed(0)} s.`;
      $('#words-stop').disabled = true;
    } else if (m.type === 'error') {
      wordsStatus.textContent = `Error: ${m.error}`;
      $('#words-stop').disabled = true;
    }
  });
}

let selectedItem = null, sharedRecipe = null;
function selectWordDesign(item, button) {
  selectedButton?.setAttribute('aria-pressed', 'false');
  button?.setAttribute('aria-pressed', 'true');
  selectedButton = button;
  selectedItem = item;
  if (button) sharedRecipe = null; // a click replaces whatever a link asked for
  writeHash();
  // Builds run on a separate worker so they don't wait behind a running gallery.
  const builder = selectWordDesign.worker ??= (() => {
    const w = new Worker(new URL('./words-worker.js', import.meta.url), { type: 'module' });
    w.onmessage = ({ data }) => selectWordDesign.handlers.get(data.id)?.(data);
    return w;
  })();
  selectWordDesign.handlers ??= new Map();
  const id = (selectWordDesign.next = (selectWordDesign.next ?? 0) + 1);
  selectWordDesign.handlers.set(id, (m) => {
    selectWordDesign.handlers.delete(id);
    if (id !== selectWordDesign.next) return; // a newer selection won
    if (m.type === 'error') { wordsStatus.textContent = `Error: ${m.error}`; return; }
    const { view } = m;
    wordFrames = view.frames;
    stl = m.stl;
    wordDownloadName = `${currentWords.join('-')}-${item.title.replace(/[^\w]+/g, '-')}.stl`.toLowerCase();
    $('#download').disabled = false;
    showMesh({ ...view.mesh, runs: view.runs });
    showWordShadows(view, item);
    snap('iso');
  });
  const finish = { stand: wordsForm.stand.checked, turn: wordsForm.turn.checked };
  builder.postMessage({ type: 'build', id, wordA: currentWords[0], wordB: currentWords[1], recipe: { ...item.recipe, ...finish }, ...fontSource() });
}
// Finish options rebuild only the selected design.
for (const name of ['stand', 'turn']) wordsForm[name].addEventListener('change', () => selectedItem && selectWordDesign(selectedItem, selectedButton));

function showWordShadows(view, item) {
  const host = $('#shadow-panels');
  host.replaceChildren();
  const m = view.metrics;
  const el = $('#print-check');
  el.textContent = `${m.finalPieces === 1 ? 'One piece' : `${m.finalPieces} pieces`}`
    + (m.rods ? ` · ${m.rods} rod${m.rods === 1 ? '' : 's'} (longest ${m.longestRod.toFixed(1)} mm)` : '')
    + (m.blocks ? ` · ${m.blocks} hidden join${m.blocks === 1 ? '' : 's'}` : '')
    + ` · ${m.size.map((x) => x.toFixed(0)).join(' × ')} mm`;
  el.className = m.finalPieces !== 1 ? 'warn' : '';
  const stats = document.createElement('p');
  stats.id = 'word-stats';
  stats.textContent = `${item.title} — worst letter ${pct1(m.coverage)} · least visible ${m.visibleMin < 1 ? `${m.leastVisible} ${pct1(m.visibleMin)}` : 'all 100%'}`
    + ` · most contact ${m.contactMax > 0 ? `${m.mostContact} ${pct1(m.contactMax)}` : 'none'} · stretch ${(m.stretch * 100).toFixed(0)}% · quality ${m.quality.toFixed(3)}`;
  host.append(stats);
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
    cap.textContent = `${x.label} · ${pct1(m.views[v].coverage)}`;
    fig.append(svg, cap);
    host.append(fig);
  }
}

wordsForm.addEventListener('submit', (e) => { e.preventDefault(); generateWords(false); });
$('#words-all').addEventListener('click', () => generateWords(true));
$('#words-stop').addEventListener('click', () => {
  startWordsWorker();
  $('#words-stop').disabled = true;
  wordsStatus.textContent = `Stopped · ${designsHost.querySelectorAll('button').length} designs.`;
});

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
async function useGoogleFont(idOrFamily, weight, { quiet = false } = {}) {
  const say = (t) => { status.textContent = t; $('#words-status').textContent = t; };
  try {
    const cat = await loadGoogleCatalog();
    const key = String(idOrFamily).trim().toLowerCase();
    const f = cat.find((x) => x.id === key || x.family.toLowerCase() === key);
    if (!f) { say(`No Google Font called “${idOrFamily}”.`); return false; }
    const w = f.weights.includes(weight) ? weight : Math.max(...f.weights);
    const url = `https://cdn.jsdelivr.net/fontsource/fonts/${f.id}@latest/latin-${w}-normal.ttf`;
    say(`Loading ${f.family} ${w}…`);
    await call({ type: 'font', url });
    uploadedFont = null;
    form.font.value = '';
    googleFont = { id: f.id, family: f.family, weight: w, url };
    gfont.value = f.family;
    gweight.replaceChildren(...f.weights.map((x) => new Option(String(x), String(x))));
    gweight.value = String(w);
    gweight.disabled = false;
    say(`Font: ${f.family} ${w} (Google Fonts, OFL)`);
    writeHash();
    if (!quiet && mode === 'letters') form.requestSubmit();
    if (!quiet && mode === 'words') $('#words-status').textContent += ' — Generate to use it.';
    return true;
  } catch (e) {
    say(`Couldn’t load that font: ${e.message}`);
    return false;
  }
}
gfont.addEventListener('focus', () => { loadGoogleCatalog().catch(() => {}); }, { once: true });
gfont.addEventListener('change', () => gfont.value.trim() && useGoogleFont(gfont.value));
gweight.addEventListener('change', () => googleFont && useGoogleFont(googleFont.id, Number(gweight.value)));

// ---- Shareable state in the URL hash -----------------------------------------
// #m=letters&font=bungee&t=G|E|B&size=40&fit=stretch&tf=upright&perm=1&conn=1&thick=1&pick=[...]
// #m=words&font=kanit-black&a=Finola&b=Bryan&sec=blocks,stacked&fam=...&case=...&rows=...&tops=❤&angles=...&r={recipe}&ti=title
let pendingPick = null;
const boxes = (name, root) => [...root.querySelectorAll(`input[name="${name}"]`)];
function writeHash() {
  const h = new URLSearchParams();
  h.set('m', mode);
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
    for (const [key, name] of [['sec', 'section'], ['fam', 'family'], ['case', 'case'], ['rows', 'rows']]) h.set(key, checked(name).join(','));
    h.set('tops', f.get('tops')); h.set('angles', f.get('angles'));
    if (wordsForm.stand.checked) h.set('stand', '1');
    if (wordsForm.turn.checked) h.set('turn', '1');
    if (selectedItem) { h.set('r', JSON.stringify(selectedItem.recipe)); h.set('ti', selectedItem.title); }
  }
  history.replaceState(null, '', `#${h}`);
}

function readHash() {
  const h = new URLSearchParams(location.hash.slice(1));
  if (!h.has('m')) return null;
  if (h.get('font') && FONTS.some((f) => f.id === h.get('font'))) fontChoice.value = h.get('font');
  if (h.get('gf')) pendingGoogleFont = { id: h.get('gf'), weight: Number(h.get('gw')) || null };
  if (h.get('m') === 'letters') {
    const t = (h.get('t') ?? '').split('|');
    VIEW_NAMES.forEach((v, i) => { if (t[i] != null) form[v].value = t[i]; });
    for (const [key, name] of [['size', 'size'], ['fit', 'fit'], ['tf', 'transforms'], ['thick', 'minThickness']]) if (h.has(key)) form[name].value = h.get(key);
    if (h.has('perm')) form.permute.checked = h.get('perm') === '1';
    if (h.has('conn')) form.preferConnected.checked = h.get('conn') === '1';
    pendingPick = h.get('pick');
    return 'letters';
  }
  wordsForm.wordA.value = h.get('a') ?? wordsForm.wordA.value;
  wordsForm.wordB.value = h.get('b') ?? wordsForm.wordB.value;
  for (const [key, name] of [['sec', 'section'], ['fam', 'family'], ['case', 'case'], ['rows', 'rows']]) {
    if (!h.has(key)) continue;
    const on = new Set(h.get(key).split(',').filter(Boolean));
    for (const i of boxes(name, wordsForm)) i.checked = on.has(i.value);
  }
  if (h.has('tops')) wordsForm.tops.value = h.get('tops');
  wordsForm.stand.checked = h.get('stand') === '1';
  wordsForm.turn.checked = h.get('turn') === '1';
  if (h.has('angles')) wordsForm.angles.value = h.get('angles');
  if (h.has('r')) sharedRecipe = h.get('r');
  return { mode: 'words', title: h.get('ti') ?? 'Shared design' };
}

$('#share').addEventListener('click', async () => {
  writeHash();
  const note = uploadedFont ? ' (the uploaded font isn’t included; the link uses the default font)' : '';
  try {
    await navigator.clipboard.writeText(location.href);
    $('#share-status').textContent = `Link copied${note}.`;
  } catch {
    $('#share-status').textContent = `Copy this link${note}: ${location.href}`;
  }
});
for (const el of [form, wordsForm]) el.addEventListener('change', () => writeHash());

// Start from a shared link, if any: restore the fonts, inputs and mode first.
const shared = readHash();
if (shared && pendingGoogleFont) await useGoogleFont(pendingGoogleFont.id, pendingGoogleFont.weight, { quiet: true });
else if (shared) await call({ type: 'font', url: FONT_URLS[`../fonts/${FONTS.find((f) => f.id === fontChoice.value).file}`] });
if (shared?.mode === 'words') {
  setMode('words'); // starts the gallery (and highlights the shared design when it streams in)
  if (sharedRecipe) {
    const item = { title: shared.title, recipe: JSON.parse(sharedRecipe) };
    selectWordDesign(item, null);
  }
}

if (!shared || shared === 'letters') form.requestSubmit();
