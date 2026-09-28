/**
 * Looks: what the user wants to make, in plain terms, each with only the
 * knobs that apply to it. The UI shows a look menu; this module turns a look
 * plus knob values into designs (the same JSON recipes as gallery.js, so the
 * same builder, viewer and share links work).
 *
 * Vocabulary (one meaning each):
 *   spacing  'gapped' (a visible gap between letters) | 'touching'
 *   case     'upper' | 'lower' | 'title' | 'mixed' (per-letter, chosen for fit)
 *   stretch  allow stretching letters vertically to fit (a distortion) — off by default
 *   shape    a character drawn from above (e.g. ❤), or '' for none
 *   stand    add a rounded display stand;  turn  rotate 45° for display
 */
import { designWordPair, designSpanColumn, searchTopFit } from './design.js';
import { buildRecipe, topShape } from './gallery.js';
import { describeLayout } from './wordpair.js';

import { LOOKS, LOOK, CASES, lookKnobs } from './look-defs.js';
import { QUALITY_WEIGHTS } from './design.js';

// "Prefer compact": also reward squarer overall shapes when ranking layouts
// (compactness = shortest side / longest side of the letters' bounding box).
const COMPACT_WEIGHTS = { ...QUALITY_WEIGHTS, compact: 0.3 };
// "Tidy": move a stroke (up to 15% of the row height) so its edge meets the
// other letter's pointed corner, e.g. the F's middle arm down to the B's notch.
const TIDY = 0.15;

export { LOOKS, LOOK, lookKnobs };

const pct = (x) => `${(x * 100).toFixed(1)}%`;
const rowFamily = (spacing) => (spacing === 'touching' ? 'touching' : 'spaced');
const stripExtra = ({ stand, turn, supports, weights, ...r }) => r;
const finish = (k) => ({ stand: !!k.stand, turn: !!k.turn });
// Short case names for list titles (the knob labels are longer).
const SHORT_CASES = { upper: 'Capitals', lower: 'lowercase', title: 'Title case', mixed: 'Mixed case' };
const titleCase = (c) => SHORT_CASES[c] ?? CASES[c] ?? c;

/**
 * Designs for one look, best first. Fast by default (one layout per setting);
 * `more` widens the search (all cases, runner-up layouts, both variants).
 * Yields { look, title, text, note, recipe, metrics }; recipe includes the
 * finish (stand/turn), so buildRecipe gives the finished object.
 */
export function* generateLook(ctx, wordA, wordB, lookId, given = {}, { more = false, candidates = 3 } = {}) {
  const k = lookKnobs(lookId, given);
  const { wasm, font, height = 20 } = ctx;
  const fits = k.stretch ? ['shared', 'fill'] : ['shared'];
  // Looks without a case knob use capitals (more: every case).
  const cases = more ? ['upper', 'mixed', 'lower', 'title'] : [k.case ?? 'upper'];
  // Supports: with 'none', joins may only use hidden hull blocks (and the
  // stand); designs that stay in pieces then rank lower (quality −0.5 per piece).
  const join = k.supports === 'none' ? 'hull' : 'hull+bridges';
  const extra = { ...(k.supports === 'none' ? { supports: 'none' } : {}), ...(k.compact ? { weights: COMPACT_WEIGHTS } : {}) };
  const out = (title, text, recipe, metrics, note = '') => ({ look: lookId, title, text, note, recipe: { ...recipe, ...extra, ...finish(k) }, metrics });

  const corners = k.tidy ? +(TIDY * height).toFixed(3) : 0;
  const chainRecipe = (famName, l) => ({
    kind: 'chain', spacing: famName, join: 'hull+bridges', ...(corners ? { corners } : {}),  // supports/weights come from `extra`
    layout: { rows: l.rows.map(({ a, b, fit, frame }) => ({ a, b, fit, frame })), score: l.score, imbalance: l.imbalance, caseMode: l.caseMode },
  });
  const chains = function* (rows, famName, titlePrefix = '') {
    const designs = designWordPair(wasm, font, wordA, wordB, {
      spacing: famName, join, height, candidates, cases, rows: [rows], fits, weights: k.compact ? COMPACT_WEIGHTS : undefined, corners,
    });
    for (const { layout, metrics, runnersUp } of designs) {
      yield out(`${titlePrefix}${titleCase(layout.caseMode)}`, describeLayout(layout), chainRecipe(famName, layout), metrics);
      if (more) for (const r of runnersUp) yield out(`${titlePrefix}${titleCase(r.layout.caseMode)} (alternative)`, describeLayout(r.layout), chainRecipe(famName, r.layout), r.metrics);
    }
  };

  switch (lookId) {
    case 'row': yield* chains(1, rowFamily(k.spacing)); break;
    case 'rows': yield* chains(k.rows, rowFamily(k.spacing)); break;
    case 'grid': yield* chains(k.rows, k.mono ? 'grid-mono' : 'grid'); break;
    case 'tower': {
      const styles = more ? ['stacked', 'pairs', 'tall'] : [k.style];
      const shapeChar = [...(k.shape ?? '')].join('').trim();
      for (const style of styles) {
        if (style === 'pairs') {
          const fam = k.spacing === 'touching' ? 'column-touching' : 'column';
          const levels = Math.min([...wordA].length, [...wordB].length);
          if (!(shapeChar && ctx.shapeFont)) {
            yield* chains(levels, fam, 'One pair per level · ');
            continue;
          }
          // With a shape from above: the best layout, then the best fit of the shape over it.
          for (const item of chains(levels, fam, 'One pair per level · ')) {
            const base = stripExtra(item.recipe);
            const [best] = searchTopFit((t) => buildRecipe(ctx, wordA, wordB, { ...base, ...extra, top: { char: shapeChar, rotate: t.rotate, scale: t.scale } }), topShape(ctx, shapeChar));
            yield out(`${item.title} + ${shapeChar}`, `${item.text} · ${shapeChar} seen from above, ${pct(best.metrics.views.top.coverage)} shown`, { ...base, top: { char: shapeChar, rotate: best.rotate, scale: best.scale } }, best.metrics);
            if (!more) break;
          }
          continue;
        }
        const fit = k.stretch ? 'stretch' : 'uniform';
        let base, label;
        if (style === 'tall') {
          const [best] = designSpanColumn(wasm, font, wordA, wordB, { spacing: k.spacing === 'touching' ? 'touching' : 'spaced', fit, height, join });
          const shorter = [...wordA].length >= [...wordB].length ? wordB : wordA;
          label = `One tall letter (${[...shorter.toUpperCase()].map((c, i) => (best.spans[i] > 1 ? `${c}×${best.spans[i]}` : c)).join('')})`;
          base = { kind: 'span', spacing: k.spacing === 'touching' ? 'touching' : 'spaced', fit, spans: best.spans };
        } else {
          label = `Stacked (${fit === 'stretch' ? 'taller' : 'larger'}${k.spacing === 'gapped' ? ', gapped' : ''})`;
          base = { kind: 'stacked', fit, spacing: k.spacing === 'gapped' ? 'spaced' : 'touching' };
        }
        if (shapeChar && ctx.shapeFont) {
          const [best] = searchTopFit((t) => buildRecipe(ctx, wordA, wordB, { ...base, top: { char: shapeChar, rotate: t.rotate, scale: t.scale } }), topShape(ctx, shapeChar));
          yield out(`${label} + ${shapeChar}`, `${shapeChar} seen from above, ${pct(best.metrics.views.top.coverage)} shown`, { ...base, top: { char: shapeChar, rotate: best.rotate, scale: best.scale } }, best.metrics);
        } else {
          const d = buildRecipe(ctx, wordA, wordB, base);
          const { metrics } = d;
          d.dispose();
          yield out(label, `${wordA} × ${wordB}`, base, metrics);
        }
      }
      break;
    }
    case 'block': {
      const angles = more ? [90, 75, 60, 45] : [k.angle];
      const blockCases = more ? ['upper', 'lower', 'title'] : [k.case];
      const shapeChar = [...(k.shape ?? '')].join('').trim();
      for (const angle of angles) {
        for (const caseMode of blockCases) {
          const withShape = shapeChar && angle === 90 && ctx.shapeFont;
          const recipe = { kind: 'block', caseMode, angle, top: withShape ? { char: shapeChar } : null };
          const d = buildRecipe(ctx, wordA, wordB, recipe);
          const { metrics } = d;
          d.dispose();
          const note = withShape ? `${shapeChar} ${pct(metrics.views.top.coverage)} shown` : shapeChar && angle !== 90 ? 'shape needs 90°' : '';
          yield out(`${titleCase(caseMode)}${angle !== 90 ? ` · ${angle}°` : ''}${withShape ? ` · ${shapeChar}` : ''}`, `${wordA} × ${wordB}`, recipe, metrics, note);
        }
      }
      break;
    }
    default: throw new Error(`Look ${lookId} isn't a two-word look`);
  }
}
