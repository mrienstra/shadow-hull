/**
 * Recipes: every word-pair design as small JSON (so a worker can stream them
 * and a page or share link can rebuild any one), plus the view data a
 * renderer needs. looks.js generates recipes; buildRecipe rebuilds a design
 * from one; designView turns a built design into mesh + face runs + per-view
 * outlines. (The earlier section-based generateGallery was replaced by looks.)
 */
import { worldToLocal, frameOf, VIEWS } from './views.js';
import { faceRuns } from './manifold.js';
import { glyphSilhouette } from './block.js';
import { realizeDesign, realizeBlock, realizeSpanColumn, realizeStackedColumn } from './design.js';

/**
 * Context for building: { wasm, font, shapeFont, height }. `shapeFont` is the
 * font top-view shapes come from (Noto Emoji); needed only for recipes with a
 * top shape. Silhouettes are cached on the context; call disposeContext when done.
 */
export function topShape(ctx, ch) {
  ctx.shapes ??= new Map();
  if (!ctx.shapes.has(ch)) {
    if (!ctx.shapeFont) throw new Error(`Top shape ${ch} needs a shape font`);
    ctx.shapes.set(ch, glyphSilhouette(ctx.wasm, ctx.shapeFont, ch));
  }
  return ctx.shapes.get(ch);
}
export function disposeContext(ctx) {
  for (const s of ctx.shapes?.values() ?? []) s.delete();
  ctx.shapes?.clear();
}

/** Rebuild a design from its recipe (see looks.js). Caller disposes. */
export function buildRecipe(ctx, wordA, wordB, r) {
  const { wasm, font, height = 20 } = ctx;
  const top = r.top ? { shape: topShape(ctx, r.top.char), rotate: r.top.rotate ?? 0, scale: r.top.scale ?? 1, fit: 'stretch' } : null;
  // r.stand adds a display stand (after hidden joins, before rods);
  // r.supports === 'none' drops the rods ('bridges').
  const withStand = (join) => {
    let j = r.stand ? join.replace('bridges', 'stand+bridges') : join;
    if (r.supports === 'none') j = j.replace(/\+?bridges/, '') || 'none';
    return j;
  };
  switch (r.kind) {
    case 'chain': return realizeDesign(wasm, font, r.layout, { spacing: r.spacing, join: withStand(r.join ?? 'hull+bridges'), height, weights: r.weights, top, levels: r.levels ?? 0, corners: r.corners ?? 0 });
    case 'block': return realizeBlock(wasm, font, wordA, wordB, { caseMode: r.caseMode, spacing: 'touching', top, join: withStand('bridges'), height, angle: r.angle ?? 90 });
    case 'span': return realizeSpanColumn(wasm, font, wordA, wordB, r.spans, { spacing: r.spacing, fit: r.fit, height, top, join: withStand('hull+bridges') });
    case 'stacked': return realizeStackedColumn(wasm, font, wordA, wordB, { spacing: r.spacing === 'spaced' ? 'spaced' : 'touching', fit: r.fit, height, top, join: withStand('bridges') });
    default: throw new Error(`Unknown recipe kind ${r.kind}`);
  }
}

/**
 * Everything a viewer needs from a built design: mesh (joined solid), face
 * runs (for colouring by view), per-view outlines (target, shadow, missing,
 * as polygons in each view's frame) and the view frames (for camera snaps).
 * view.solid is the (possibly turned) output solid, for STL export: it is
 * d.joined when turn is 0, otherwise a new Manifold the caller must delete.
 */
export function designView(wasm, d, { turn = 0 } = {}) {
  const views = {};
  const frames = {};
  // `turn` (degrees about the vertical axis) rotates only the output — mesh,
  // STL and camera frames — e.g. -45 so a chain's two words face front-left
  // and front-right for display. Shadows are measured in the design's frames.
  const r = (turn * Math.PI) / 180, c = Math.cos(r), sn = Math.sin(r);
  const rot = ([x, y, z]) => [c * x - sn * y, sn * x + c * y, z];
  for (const v of ['front', 'right', 'top']) {
    const own = d.cells.map((cell) => cell.shapes[v]).filter(Boolean);
    const f = frameOf(v, d.frames);
    frames[v] = { U: rot(f.U), V: rot(f.V), D: rot(f.D), label: d.frames?.[v] ? `side, ${d.frames[v].side}` : v };
    if (!own.length) continue;
    const shadow = d.joined.transform(worldToLocal(v, d.frames)).project();
    const target = wasm.CrossSection.union(own);
    const missing = target.subtract(shadow);
    views[v] = { label: frames[v].label, target: target.toPolygons(), shadow: shadow.toPolygons(), missing: missing.toPolygons() };
    for (const x of [shadow, target, missing]) x.delete();
  }
  const out = turn ? d.joined.rotate([0, 0, turn]) : d.joined;
  const mesh = out.getMesh();
  const view = {
    views, frames, metrics: d.metrics, runs: faceRuns(mesh), solid: out,
    mesh: { numProp: mesh.numProp, vertProperties: mesh.vertProperties.slice(), triVerts: mesh.triVerts.slice() },
  };
  return view;
}

/** Default viewer frame for views a design doesn't override. */
export const DEFAULT_FRAMES = VIEWS;
