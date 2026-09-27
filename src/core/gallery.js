/**
 * Gallery: every word-pair design variant we generate, as small JSON
 * "recipes" (so a worker can stream them and a page can rebuild any one),
 * plus the view data a renderer needs. Shared by scripts/explore-words.js and
 * the web page, so both show the same designs.
 *
 * generateGallery yields { section, title, text, note, recipe, metrics } one
 * at a time. buildRecipe rebuilds a design from its recipe; designView turns
 * a built design into mesh + face runs + per-view outlines.
 */
import { worldToLocal, frameOf, VIEWS } from './views.js';
import { faceRuns } from './manifold.js';
import { describeLayout, rankLayouts } from './wordpair.js';
import { glyphSilhouette } from './block.js';
import {
  SPACING, designWordPair, realizeDesign, realizeBlock, designSpanColumn, realizeSpanColumn,
  realizeStackedColumn, searchTopFit,
} from './design.js';

/** Sections in display order, with their labels. */
export const GALLERY_SECTIONS = {
  families: 'Word chains: spacing families (touching, spaced, grid, grid monospaced, column, column touching)',
  blocks: 'Block: whole words, touching; top view none or a shape',
  angles: 'Block, other view angles (the side word is read this many degrees round from the front)',
  spans: 'Column, tall letter (the shorter word’s letter spans rows instead of the longer word doubling up)',
  stacked: 'Column variants, touching (stacked: every letter of the shorter word taller; ❤: heart seen from above)',
};

export const DEFAULT_GALLERY = {
  sections: Object.keys(GALLERY_SECTIONS),
  families: ['touching', 'spaced', 'grid', 'grid-mono', 'column', 'column-touching'],
  cases: ['upper', 'lower', 'title', 'mixed'],
  rows: [1, 2, 3],
  tops: [null, '❤'],
  angles: [75, 60, 45],
  candidates: 3,
  join: 'hull+bridges',
  height: 20,
};

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

/** Rebuild a design from its recipe (see generateGallery). Caller disposes. */
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
    case 'chain': return realizeDesign(wasm, font, r.layout, { spacing: r.spacing, join: withStand(r.join ?? 'hull+bridges'), height, weights: r.weights });
    case 'block': return realizeBlock(wasm, font, wordA, wordB, { caseMode: r.caseMode, spacing: 'touching', top, join: withStand('bridges'), height, angle: r.angle ?? 90 });
    case 'span': return realizeSpanColumn(wasm, font, wordA, wordB, r.spans, { spacing: r.spacing, fit: r.fit, height, top, join: withStand('hull+bridges') });
    case 'stacked': return realizeStackedColumn(wasm, font, wordA, wordB, { fit: r.fit, height, top, join: withStand('bridges') });
    default: throw new Error(`Unknown recipe kind ${r.kind}`);
  }
}

const pct = (x) => `${(x * 100).toFixed(1)}%`;

/**
 * Yield every design, section by section. Each item is plain JSON:
 * { section, title, text, note, recipe, metrics }.
 * @param opts see DEFAULT_GALLERY; opts.shapeFont for top shapes.
 */
export function* generateGallery(ctx, wordA, wordB, opts = {}) {
  const o = { ...DEFAULT_GALLERY, ...opts };
  const { wasm, font, height } = { height: o.height, ...ctx };
  const sections = new Set(o.sections);
  const shorter = [...wordA].length >= [...wordB].length ? wordB : wordA;
  const spanLabel = (spans) => [...shorter.toUpperCase()].map((c, i) => (spans[i] > 1 ? `${c}×${spans[i]}` : c)).join(' ');
  const hasShapes = !!ctx.shapeFont;

  if (sections.has('families')) {
    for (const spacing of o.families) {
      const designs = designWordPair(wasm, font, wordA, wordB, {
        spacing, join: o.join, height, candidates: o.candidates, cases: o.cases, rows: o.rows,
      });
      const order = ['upper', 'lower', 'title', 'mixed'];
      designs.sort((a, b) => order.indexOf(a.layout.caseMode) - order.indexOf(b.layout.caseMode) || a.layout.rows.length - b.layout.rows.length);
      for (const { style, layout, metrics, runnersUp } of designs) {
        const reranked = runnersUp.some((r) => rankLayouts(r.layout, layout) < 0);
        const { score, imbalance, caseMode, rows } = layout;
        yield {
          section: `${GALLERY_SECTIONS.families.split(':')[0]}: ${SPACING[spacing].label}`, title: style, text: describeLayout(layout),
          note: reranked ? 're-ranked: the search’s first choice scored lower' : '',
          recipe: { kind: 'chain', spacing, join: o.join, layout: { rows: rows.map(({ a, b, fit, frame }) => ({ a, b, fit, frame })), score, imbalance, caseMode } },
          metrics,
        };
      }
    }
  }

  if (sections.has('blocks')) {
    for (const ch of o.tops) {
      if (ch && !hasShapes) continue;
      for (const caseMode of ['upper', 'lower', 'title']) {
        const recipe = { kind: 'block', caseMode, top: ch ? { char: ch } : null };
        const d = buildRecipe(ctx, wordA, wordB, recipe);
        const { metrics } = d;
        d.dispose();
        yield {
          section: GALLERY_SECTIONS.blocks, title: `${caseMode}, top ${ch ?? 'none'}`, text: `${wordA} × ${wordB}${ch ? ` × ${ch}` : ''}`,
          note: ch ? `top ${ch} ${pct(metrics.views.top.coverage)} shown` : '', recipe, metrics,
        };
      }
    }
  }

  if (sections.has('angles')) {
    for (const angle of o.angles) {
      for (const caseMode of ['upper', 'title']) {
        const recipe = { kind: 'block', caseMode, angle };
        const d = buildRecipe(ctx, wordA, wordB, recipe);
        const { metrics } = d;
        d.dispose();
        yield { section: GALLERY_SECTIONS.angles, title: `${caseMode}, ${angle}°`, text: `${wordA} × ${wordB} at ${angle}°`, note: '', recipe, metrics };
      }
    }
  }

  if (sections.has('spans')) {
    for (const spacing of ['touching', 'spaced']) {
      for (const fit of ['stretch', 'uniform']) {
        const [best, ...rest] = designSpanColumn(wasm, font, wordA, wordB, { spacing, fit, height });
        yield {
          section: GALLERY_SECTIONS.spans, title: `${spacing}, ${fit === 'stretch' ? 'stretched' : 'drop-cap'}`, text: `spans: ${spanLabel(best.spans)}`,
          note: `best of ${rest.length + 1} span choices`, recipe: { kind: 'span', spacing, fit, spans: best.spans }, metrics: best.metrics,
        };
      }
    }
  }

  if (sections.has('stacked')) {
    const k = Math.max([...wordA].length, [...wordB].length) / [...shorter].length;
    for (const fit of ['stretch', 'uniform']) {
      const recipe = { kind: 'stacked', fit };
      const d = buildRecipe(ctx, wordA, wordB, recipe);
      const { metrics } = d;
      d.dispose();
      yield {
        section: GALLERY_SECTIONS.stacked, title: `stacked, ${fit === 'stretch' ? 'taller' : 'taller and wider'}`,
        text: `${shorter.toUpperCase()} letters ${((k - 1) * 100).toFixed(0)}% ${fit === 'stretch' ? 'taller' : 'larger'}`, note: '', recipe, metrics,
      };
    }
    if (hasShapes) {
      const heart = topShape(ctx, '❤');
      const [bestSpans] = designSpanColumn(wasm, font, wordA, wordB, { spacing: 'touching', fit: 'stretch', height });
      const variants = [
        ['tall letter + ❤', `spans: ${spanLabel(bestSpans.spans)}`, { kind: 'span', spacing: 'touching', fit: 'stretch', spans: bestSpans.spans }],
        ['stacked + ❤', `${shorter.toUpperCase()} letters ${((k - 1) * 100).toFixed(0)}% taller`, { kind: 'stacked', fit: 'stretch' }],
      ];
      for (const [title, text, base] of variants) {
        const [best, ...rest] = searchTopFit((t) => buildRecipe(ctx, wordA, wordB, { ...base, top: { char: '❤', rotate: t.rotate, scale: t.scale } }), heart);
        yield {
          section: GALLERY_SECTIONS.stacked, title, text: `${text} · heart rotated ${best.rotate}°${best.scale !== 1 ? `, ×${best.scale}` : ''}`,
          note: `heart ${pct(best.metrics.views.top.coverage)} shown · best of ${rest.length + 1} rotations × sizes`,
          recipe: { ...base, top: { char: '❤', rotate: best.rotate, scale: best.scale } }, metrics: best.metrics,
        };
      }
    }
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
