// All geometry runs here so the page stays responsive during a search.
import wasmUrl from 'manifold-3d/manifold.wasm?url';
import defaultFontUrl from '../fonts/ArchivoBlack-Regular.ttf?url';
import {
  getManifold, loadFont, search, silhouette, buildTriplet, measure, toBinarySTL, viewingGuide, Scope, VIEW_NAMES,
  d4, d4Mat3, worldToLocal,
} from '../src/core/index.js';

const wasmReady = getManifold({ locateFile: () => wasmUrl });
let font = null;

async function ensureFont(data) {
  if (data) font = loadFont(data);
  else if (!font) font = loadFont(await (await fetch(defaultFontUrl)).arrayBuffer());
  return font;
}

const polys = (cs) => cs.toPolygons().map((p) => p.map(([x, y]) => [x, y]));

/** Geometry for one candidate: mesh, STL and per-view target/shadow/missing outlines. */
function buildCandidate(wasm, { assignment, transforms }, { size, fit }) {
  const scope = new Scope();
  try {
    const shapes = Object.fromEntries(VIEW_NAMES.map((v) => [v, scope.add(silhouette(wasm, font, assignment[v], { size, fit }))]));
    const solid = scope.add(buildTriplet(wasm, shapes, transforms, { size }));
    const metrics = measure(wasm, solid, shapes, transforms);
    const views = {};
    for (const v of VIEW_NAMES) {
      const target = scope.add(shapes[v].transform(d4Mat3(transforms[v] ?? 0)));
      const shadow = scope.add(scope.add(solid.transform(worldToLocal(v))).project());
      const missing = scope.add(target.subtract(shadow));
      // Undo the glyph's D4 transform (inverse = transpose) so panels read upright.
      const [a, b, c, d] = d4(transforms[v] ?? 0);
      const upright = (cs) => polys(scope.add(cs.transform([a, b, 0, c, d, 0, 0, 0, 1])));
      views[v] = { target: upright(target), shadow: upright(shadow), missing: upright(missing) };
    }
    const mesh = solid.getMesh();
    return {
      numProp: mesh.numProp,
      vertProperties: mesh.vertProperties.slice(),
      triVerts: mesh.triVerts.slice(),
      stl: toBinarySTL(solid),
      views, metrics,
      guide: viewingGuide(assignment, transforms),
    };
  } finally {
    scope.dispose();
  }
}

self.onmessage = async ({ data: msg }) => {
  try {
    const wasm = await wasmReady;
    if (msg.type === 'font') {
      await ensureFont(msg.data);
      self.postMessage({ id: msg.id, ok: true });
    } else if (msg.type === 'search') {
      await ensureFont();
      const t0 = performance.now();
      const ranked = search(wasm, font, msg.texts, msg.opts);
      const ms = performance.now() - t0;
      self.postMessage({
        id: msg.id, ok: true, tried: ranked.length, ms, candidates: ranked.slice(0, msg.top ?? 12).map((c) => ({ ...c, guide: viewingGuide(c.assignment, c.transforms) })),
      });
    } else if (msg.type === 'build') {
      await ensureFont();
      const r = buildCandidate(wasm, msg.candidate, msg.opts);
      self.postMessage({ id: msg.id, ok: true, ...r }, [r.vertProperties.buffer, r.triVerts.buffer, r.stl.buffer]);
    }
  } catch (e) {
    self.postMessage({ id: msg.id, ok: false, error: String(e?.message ?? e) });
  }
};
