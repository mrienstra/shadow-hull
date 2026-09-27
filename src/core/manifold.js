import Module from 'manifold-3d';

let ready;

/**
 * Load and initialise the Manifold WASM module once; returns { Manifold, CrossSection, ... }.
 * `moduleOptions` (first call only) is passed to the Emscripten loader, e.g.
 * `{ locateFile: () => wasmUrl }` when a bundler relocates manifold.wasm.
 */
export function getManifold(moduleOptions) {
  ready ??= Module(moduleOptions).then((wasm) => {
    wasm.setup();
    return wasm;
  });
  return ready;
}

/**
 * Collects WASM objects so they can be freed together. Manifold/CrossSection
 * objects live in WASM memory and are not garbage-collected.
 */
export class Scope {
  #objs = [];
  /** Track `obj` for deletion and return it. */
  add(obj) {
    this.#objs.push(obj);
    return obj;
  }
  /** Stop tracking `obj` (the caller now owns it). */
  release(obj) {
    const i = this.#objs.indexOf(obj);
    if (i >= 0) this.#objs.splice(i, 1);
    return obj;
  }
  dispose() {
    for (const o of this.#objs) o.delete();
    this.#objs.length = 0;
  }
}

/**
 * Extrude a CrossSection to `height`, centred on z = 0. Caller owns the result.
 *
 * Works around two leaks in manifold-3d's JS `CrossSection.extrude` (3.5.4):
 * with `center: true` it never frees the uncentred intermediate manifold, and
 * it never frees the temporary polygon vector from `_ToPolygons()`. Together
 * these leak ~0.4 MB per call for a glyph, which crashes long searches
 * ("memory access out of bounds"). Uses the wrapper's internals when present,
 * otherwise the public API without `center`.
 */
export function extrudeCentered(wasm, cs, height) {
  let raw;
  if (typeof wasm._Extrude === 'function' && typeof cs._ToPolygons === 'function') {
    const polys = cs._ToPolygons();
    try {
      raw = wasm._Extrude(polys, height, 0, 0, { x: 1, y: 1 });
    } finally {
      polys.delete();
    }
  } else {
    raw = cs.extrude(height);
  }
  try {
    return raw.translate([0, 0, -height / 2]);
  } finally {
    raw.delete();
  }
}

// ---- Face provenance ----------------------------------------------------------
// Manifold keeps, through booleans, which input solid each output triangle came
// from (mesh.runOriginalID / runIndex). We register a label per input solid
// (e.g. the view whose prism it is) so faces can be coloured by what carved them.
const faceLabels = new Map();

/** A copy of `m` with its own original ID registered under `label`. Caller owns both. */
export function tagged(m, label) {
  const t = m.asOriginal();
  faceLabels.set(t.originalID(), label);
  return t;
}

/**
 * Triangle runs of a mesh with their labels: [{ start, count, label }] where
 * start/count index into triVerts (as three.js geometry groups expect).
 * Untagged runs get label null.
 */
export function faceRuns(mesh) {
  const out = [];
  const { runIndex, runOriginalID } = mesh;
  if (!runIndex || !runOriginalID) return [{ start: 0, count: mesh.triVerts.length, label: null }];
  for (let r = 0; r < runOriginalID.length; r++) {
    const start = runIndex[r], count = runIndex[r + 1] - start;
    if (count > 0) out.push({ start, count, label: faceLabels.get(runOriginalID[r]) ?? null });
  }
  return out;
}
