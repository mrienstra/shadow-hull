import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

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

function fitFrustum() {
  const w = viewport.clientWidth, h = viewport.clientHeight;
  renderer.setSize(w, h, false);
  const half = size * 1.05, aspect = w / h;
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
function snap(view) {
  if (view === 'iso' || !guide) return lookFrom([1.1, -1.6, 1.2], [0, 0, 1]);
  const { from, rotation } = guide[view];
  const [dir, right, up] = SIDES[from];
  // The letter appears rotated `rotation`° CCW; roll the camera the same way to read it upright.
  const r = (rotation * Math.PI) / 180;
  const rolled = up.map((u, i) => Math.cos(r) * u - Math.sin(r) * right[i]);
  lookFrom(dir, rolled);
}

function showMesh({ numProp, vertProperties, triVerts }) {
  if (meshObj) { meshObj.geometry.dispose(); scene.remove(meshObj); }
  if (box) { box.geometry.dispose(); scene.remove(box); }
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array((vertProperties.length / numProp) * 3);
  for (let i = 0, j = 0; i < vertProperties.length; i += numProp) {
    pos[j++] = vertProperties[i]; pos[j++] = vertProperties[i + 1]; pos[j++] = vertProperties[i + 2];
  }
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setIndex(new THREE.BufferAttribute(triVerts, 1));
  meshObj = new THREE.Mesh(geo, material);
  scene.add(meshObj);
  box = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(size, size, size)),
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
    const pad = size * 0.06;
    svg.setAttribute('viewBox', `${-size / 2 - pad} ${-size / 2 - pad} ${size + 2 * pad} ${size + 2 * pad}`);
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

// ---- Form / candidates -----------------------------------------------------
const form = $('#form');
const status = $('#status');
let lastOpts = null, stl = null;

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
    },
  };
}

async function select(candidate, button) {
  for (const b of document.querySelectorAll('#candidates button')) b.setAttribute('aria-pressed', String(b === button));
  const r = await call({ type: 'build', candidate, opts: lastOpts });
  size = lastOpts.size;
  guide = r.guide;
  stl = r.stl;
  $('#download').disabled = false;
  showMesh(r);
  showShadows(r.views, r.metrics);
  snap('iso');
}

form.font.addEventListener('change', async () => {
  const file = form.font.files[0];
  if (!file) return;
  const data = await file.arrayBuffer();
  await call({ type: 'font', data }, [data]);
  status.textContent = `Font: ${file.name}`;
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
    await select(r.candidates[0], list.querySelector('button'));
  } catch (err) {
    status.textContent = `Error: ${err.message}`;
  } finally {
    $('#go').disabled = false;
  }
});

for (const b of document.querySelectorAll('.toolbar [data-view]')) b.addEventListener('click', () => snap(b.dataset.view));

$('#download').addEventListener('click', () => {
  const name = VIEW_NAMES.map((v) => guide[v].text || '_').join('-') + '.stl';
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob([stl], { type: 'model/stl' })), download: name });
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
});

form.requestSubmit();
