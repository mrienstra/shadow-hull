// Two-words mode: streams gallery designs (src/core/gallery.js) and builds the
// one the page asks for. A separate worker so a long gallery can be stopped by
// terminating it without touching the three-letters worker.
import wasmUrl from 'manifold-3d/manifold.wasm?url';
import shapeFontUrl from '../fonts/shapes/NotoEmoji.ttf?url';
import { getManifold, loadFont, toBinarySTL } from '../src/core/index.js';
import { generateGallery, buildRecipe, designView } from '../src/core/gallery.js';

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

self.onmessage = async ({ data: msg }) => {
  try {
    if (msg.type === 'gallery') {
      const { wordA, wordB, opts } = msg;
      const needShapes = opts.sections.some((s) => s === 'stacked' || s === 'blocks') && (opts.tops ?? [null, '❤']).some(Boolean);
      await ensureFonts({ ...msg, needShapes });
      const t0 = performance.now();
      let n = 0;
      for (const item of generateGallery(ctx, wordA, wordB, opts)) {
        self.postMessage({ id: msg.id, type: 'item', item, n: ++n, ms: performance.now() - t0 });
      }
      self.postMessage({ id: msg.id, type: 'done', n, ms: performance.now() - t0 });
    } else if (msg.type === 'build') {
      await ensureFonts({ ...msg, needShapes: !!msg.recipe.top });
      const d = buildRecipe(ctx, msg.wordA, msg.wordB, msg.recipe);
      try {
        const { solid, ...view } = designView(ctx.wasm, d, { turn: msg.recipe.turn ? -45 : 0 });
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
