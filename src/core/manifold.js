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
