// Interactive before/after viewer for the arm-to-corner review page.
// Bundled by build.mjs (with three.js) into <outDir>/lib/viewer.js; the page
// imports it on the first click of a card's 3D thumbnail. manifold.js and
// manifold.wasm are published next to it and loaded from there (relative URLs,
// so the page works from any path and under a CSP that only allows its own files).
//
// A solid = the front letter's outline (u, z) extruded along Y ∩ the side
// letter's outline extruded along X. World: X right, Y back, Z up; the front
// letter is seen from -Y, the side letter from +X (as src/core/views.js).
import {
  WebGLRenderer, Scene, HemisphereLight, DirectionalLight, OrthographicCamera,
  MeshStandardMaterial, BufferGeometry, BufferAttribute, Mesh, Vector3,
} from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

const HERE = import.meta.url; // kept in a variable so the bundler leaves the URLs alone
const COL = { front: 0xe07b53, right: 0x4c9be8 };
const mats = [COL.front, COL.right, 0xc8a27a].map((color) => new MeshStandardMaterial({ color, roughness: 0.65, metalness: 0, flatShading: true }));
// Look-from directions (screen up is +Z, except Top, which is nudged off the pole so up reads as +Y).
export const VIEWS = { front: [0, -1, 0], side: [1, 0, 0], top: [0, -1e-4, 1], iso: [1.1, -1.6, 1.2] };

let wasmP = null;
function manifold() {
  wasmP ??= (async () => {
    const [{ default: Module }, wasmBinary] = await Promise.all([
      import(/* @vite-ignore */ new URL('manifold.js', HERE).href),
      fetch(new URL('manifold.wasm', HERE).href).then((r) => { if (!r.ok) throw new Error(`manifold.wasm: HTTP ${r.status}`); return r.arrayBuffer(); }),
    ]);
    const wasm = await Module({ wasmBinary, locateFile: (p) => new URL(p, HERE).href });
    wasm.setup();
    return wasm;
  })();
  wasmP.catch(() => { wasmP = null; });
  return wasmP;
}

// Local (u, v, extrusion w) → world, column-major Mat4 (views.js frames).
const FRAME = {
  front: [1, 0, 0, 0, 0, 0, 1, 0, 0, -1, 0, 0, 0, 0, 0, 1], // (u, v, w) → (u, -w, v)
  right: [0, 1, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0, 0, 0, 0, 1],  // (u, v, w) → (w, u, v)
};

/** Build the solid of two outlines (arrays of rings of [u, z]); returns mesh arrays and face runs. */
function solid(wasm, front, side, length) {
  const { CrossSection, Manifold } = wasm;
  const trash = [], keep = (o) => (trash.push(o), o);
  try {
    const labels = new Map();
    const prism = (rings, view) => {
      const cs = keep(new CrossSection(rings, 'NonZero'));
      const t = keep(keep(keep(cs.extrude(length)).translate([0, 0, -length / 2])).asOriginal());
      labels.set(t.originalID(), view);
      return keep(t.transform(FRAME[view]));
    };
    const s = keep(Manifold.intersection([prism(front, 'front'), prism(side, 'right')]));
    const m = s.getMesh();
    const pos = new Float32Array((m.vertProperties.length / m.numProp) * 3);
    for (let i = 0, j = 0; i < m.vertProperties.length; i += m.numProp) {
      pos[j++] = m.vertProperties[i]; pos[j++] = m.vertProperties[i + 1]; pos[j++] = m.vertProperties[i + 2];
    }
    const runs = [];
    const { runIndex, runOriginalID } = m;
    if (runIndex && runOriginalID) {
      for (let r = 0; r < runOriginalID.length; r++) {
        const start = runIndex[r], count = runIndex[r + 1] - start;
        if (count > 0) runs.push({ start, count, label: labels.get(runOriginalID[r]) ?? null });
      }
    }
    return { pos, idx: new Uint32Array(m.triVerts), runs };
  } finally {
    for (const o of trash.reverse()) o.delete();
  }
}

function meshOf({ pos, idx, runs }, centre) {
  const geo = new BufferGeometry();
  geo.setAttribute('position', new BufferAttribute(pos, 3));
  geo.setIndex(new BufferAttribute(idx, 1));
  if (!runs.length) geo.addGroup(0, idx.length, 2);
  for (const r of runs) geo.addGroup(r.start, r.count, r.label === 'front' ? 0 : r.label === 'right' ? 1 : 2);
  const mesh = new Mesh(geo, mats);
  mesh.position.copy(centre).negate();
  return mesh;
}

let st = null; // { hosts, renderers, camera, controls, scene, meshes, radius }

function setup(hosts) {
  const scene = new Scene();
  scene.add(new HemisphereLight(0xffffff, 0x8888aa, 1.6));
  const sun = new DirectionalLight(0xffffff, 1.6); sun.position.set(2, -3, 4); scene.add(sun);
  const camera = new OrthographicCamera(-1, 1, 1, -1, 0.1, 1000);
  camera.up.set(0, 0, 1);
  const renderers = hosts.map((h) => {
    const r = new WebGLRenderer({ antialias: true, alpha: true });
    r.setPixelRatio(Math.min(devicePixelRatio, 2));
    r.domElement.style.cssText = 'display:block;width:100%;height:100%;touch-action:none';
    h.replaceChildren(r.domElement);
    return r;
  });
  // One camera, one OrbitControls per canvas, sharing the target: orbiting either view moves both.
  const controls = renderers.map((r) => {
    const c = new OrbitControls(camera, r.domElement);
    c.enableDamping = false;
    c.addEventListener('change', draw);
    return c;
  });
  controls[1].target = controls[0].target;
  controls.forEach((c) => c.listenToKeyEvents?.(c.domElement));
  renderers.forEach((r) => { r.domElement.tabIndex = 0; });
  st = { hosts, renderers, camera, controls, scene, meshes: [], radius: 20 };
  new ResizeObserver(draw).observe(hosts[0]);
  new ResizeObserver(draw).observe(hosts[1]);
}

function draw() {
  if (!st) return;
  const { hosts, renderers, camera, scene, meshes, radius } = st;
  hosts.forEach((h, k) => {
    const w = h.clientWidth, hh = h.clientHeight;
    if (!w || !hh) return;
    const r = renderers[k];
    r.setSize(w, hh, false);
    const half = radius * 1.08, a = w / hh;
    Object.assign(camera, a >= 1 ? { left: -half * a, right: half * a, top: half, bottom: -half } : { left: -half, right: half, top: half / a, bottom: -half / a });
    camera.updateProjectionMatrix();
    meshes.forEach((m, j) => { m.visible = j === k; });
    r.render(scene, camera);
  });
}

/** Point the shared camera from one of VIEWS, re-centred and at zoom 1. */
export function look(view) {
  if (!st) return;
  const { camera, controls, radius } = st;
  const d = new Vector3(...VIEWS[view]).normalize().multiplyScalar(radius * 6);
  controls[0].target.set(0, 0, 0);
  camera.position.copy(d);
  camera.zoom = 1;
  camera.near = 0.1; camera.far = radius * 12;
  camera.lookAt(0, 0, 0);
  camera.updateProjectionMatrix();
  controls.forEach((c) => c.update());
  draw();
}

/**
 * Show a pair: hosts = [beforeEl, afterEl]; before/after = front outlines,
 * side = side outline (rings of [u, z]) or { before, after }; w = [front width, side width]; h = height.
 * Resolves once both solids are built; throws if manifold cannot load.
 */
export async function show({ hosts, before, after, side, w, h, view = 'iso' }) {
  const wasm = await manifold();
  const length = 4 * Math.max(w[0], w[1], h) + 1;
  // side: one outline for both, or { before, after } when the side letter changes too.
  const sides = side.before ? [side.before, side.after] : [side, side];
  const meshes = [before, after].map((f, i) => solid(wasm, f, sides[i], length));
  if (!st || st.hosts[0] !== hosts[0]) setup(hosts);
  clear();
  const centre = new Vector3(w[0] / 2, w[1] / 2, h / 2);
  st.radius = Math.hypot(w[0], w[1], h) / 2;
  st.meshes = meshes.map((m) => meshOf(m, centre));
  st.meshes.forEach((m) => st.scene.add(m));
  look(view);
}

/** Free the current meshes (the renderers stay for the next pair). */
export function clear() {
  if (!st) return;
  for (const m of st.meshes) { st.scene.remove(m); m.geometry.dispose(); }
  st.meshes = [];
  draw();
}
