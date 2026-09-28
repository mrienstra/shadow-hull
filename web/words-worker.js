// Two-words mode: streams gallery designs (src/core/gallery.js) and builds the
// one the page asks for. A separate worker so a long gallery can be stopped by
// terminating it without touching the three-letters worker.
import wasmUrl from 'manifold-3d/manifold.wasm?url';
import shapeFontUrl from '../fonts/shapes/NotoEmoji.ttf?url';
import { getManifold, loadFont, toBinarySTL, frameOf } from '../src/core/index.js';
import { buildRecipe, designView } from '../src/core/gallery.js';
import { generateLook } from '../src/core/looks.js';

const wasmReady = getManifold({ locateFile: () => wasmUrl });
const ctx = { wasm: null, font: null, shapeFont: null, height: 20 };
let fontKey = null;

async function ensureFonts({ fontUrl, fontData, needShapes }) {
  ctx.wasm = await wasmReady;
  const key = fontUrl ?? (fontData ? `data:${fontData.byteLength}` : null);
  if (key && key !== fontKey) {
    ctx.font = loadFont(fontData ?? (await (await fetch(fontUrl)).arrayBuffer()));
    fontKey = key;
    // Cached top shapes are per shape font, not per letter font, so keep them.
  }
  if (needShapes && !ctx.shapeFont) ctx.shapeFont = loadFont(await (await fetch(shapeFontUrl)).arrayBuffer());
}

// Per cell and view: the letter chunk's 2D bounds in that view's frame (which
// the 45° turn leaves unchanged) and the depth of the cell's centre along the
// view direction. Small data, for the viewer's tour (tour=1) to frame each chunk.
function cellChunks(d) {
  return d.cells.map((c) => {
    const out = { label: c.label };
    const mid = c.box.min.map((m, i) => (m + c.box.max[i]) / 2);
    for (const v of ['front', 'right']) {
      if (!c.shapes[v]) continue;
      const { min, max } = c.shapes[v].bounds();
      const { D } = frameOf(v, d.frames);
      const text = (c.letters?.[v] ?? []).map((l) => l.ch ?? '').join('');
      out[v] = { min, max, depth: mid[0] * D[0] + mid[1] * D[1] + mid[2] * D[2], text };
    }
    return out;
  });
}

self.onmessage = async ({ data: msg }) => {
  try {
    if (msg.type === 'look') {
      const { wordA, wordB, lookId, knobs, more } = msg;
      await ensureFonts({ ...msg, needShapes: !!(knobs.shape && knobs.shape.trim()) || (more && lookId === 'block') });
      const t0 = performance.now();
      let n = 0;
      for (const item of generateLook(ctx, wordA, wordB, lookId, knobs, { more })) {
        self.postMessage({ id: msg.id, type: 'item', item, n: ++n, ms: performance.now() - t0 });
      }
      self.postMessage({ id: msg.id, type: 'done', n, ms: performance.now() - t0 });
    } else if (msg.type === 'build') {
      await ensureFonts({ ...msg, needShapes: !!msg.recipe.top });
      const d = buildRecipe(ctx, msg.wordA, msg.wordB, msg.recipe);
      try {
        if (msg.meshOnly) {
          // Thumbnails: just the (turned) mesh, no shadows or STL.
          const solid = msg.recipe.turn ? d.joined.rotate([0, 0, -45]) : d.joined;
          const m = solid.getMesh();
          const mesh = { numProp: m.numProp, vertProperties: m.vertProperties.slice(), triVerts: m.triVerts.slice() };
          if (solid !== d.joined) solid.delete();
          self.postMessage({ id: msg.id, type: 'mesh', mesh }, [mesh.vertProperties.buffer, mesh.triVerts.buffer]);
          return;
        }
        const { solid, ...view } = designView(ctx.wasm, d, { turn: msg.recipe.turn ? -45 : 0 });
        view.cells = cellChunks(d);
        const stl = toBinarySTL(solid);
        if (solid !== d.joined) solid.delete();
        self.postMessage({ id: msg.id, type: 'built', view, stl }, [view.mesh.vertProperties.buffer, view.mesh.triVerts.buffer, stl.buffer]);
      } finally {
        d.dispose();
      }
    }
  } catch (e) {
    self.postMessage({ id: msg.id, type: 'error', error: String(e?.message ?? e) });
  }
};
