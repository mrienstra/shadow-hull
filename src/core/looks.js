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

const CASES = { upper: 'Capitals', lower: 'lowercase', title: 'Title case', mixed: 'Mixed case (per letter, for fit)' };
const choice = (options, def, labels = {}) => ({ type: 'choice', options, default: def, labels });
const bool = (def) => ({ type: 'bool', default: def });

export const LOOKS = [
  {
    id: 'cube', label: 'Letter cube', inputs: 'letters',
    blurb: 'Three letters, one per side — the Gödel, Escher, Bach cover.',
    knobs: {},
  },
  {
    id: 'row', label: 'Pairs in a row', inputs: 'words',
    blurb: 'One shape per pair of letters, standing in a row: one word from the left, the other from the right.',
    knobs: {
      spacing: choice(['gapped', 'touching'], 'gapped'), case: choice(['upper', 'mixed', 'lower', 'title'], 'upper', CASES),
      stretch: bool(false), stand: bool(true), turn: bool(true),
    },
  },
  {
    id: 'rows', label: 'Pairs in rows', inputs: 'words',
    blurb: 'The row of pairs broken into two or three lines, stacked.',
    knobs: {
      rows: choice([2, 3], 2), spacing: choice(['gapped', 'touching'], 'gapped'), case: choice(['upper', 'mixed', 'lower', 'title'], 'upper', CASES),
      stretch: bool(false), stand: bool(true), turn: bool(false),
    },
  },
  {
    id: 'grid', label: 'Grid', inputs: 'words',
    blurb: 'Letters in equal rows and aligned columns (FIN / OLA).',
    knobs: {
      rows: choice([2, 3], 2), mono: bool(false), case: choice(['upper', 'mixed', 'lower', 'title'], 'upper', CASES),
      stretch: bool(false), stand: bool(true), turn: bool(false),
    },
  },
  {
    id: 'tower', label: 'Tower', inputs: 'words',
    blurb: 'Letters stacked vertically, one word down each side.',
    knobs: {
      style: choice(['stacked', 'pairs', 'tall'], 'stacked', { stacked: 'Stacked (shorter word’s letters taller)', pairs: 'One pair per level', tall: 'One tall letter' }),
      spacing: choice(['touching', 'gapped'], 'touching'), shape: { type: 'text', default: '' },
      stretch: bool(false), stand: bool(false), turn: bool(false),
    },
  },
  {
    id: 'block', label: 'Word block', inputs: 'words',
    blurb: 'Both whole words cut through one block; optionally shaped from above (e.g. ❤) or read at an angle.',
    knobs: {
      case: choice(['upper', 'lower', 'title'], 'upper', CASES), shape: { type: 'text', default: '' },
      angle: choice([90, 75, 60, 45], 90, { 90: '90° (front and side)', 75: '75°', 60: '60°', 45: '45°' }), stand: bool(false), turn: bool(false),
    },
  },
];
export const LOOK = Object.fromEntries(LOOKS.map((l) => [l.id, l]));

/** Knob values for a look: its defaults, overridden by `given`. */
export function lookKnobs(lookId, given = {}) {
  const look = LOOK[lookId];
  const out = {};
  for (const [k, def] of Object.entries(look.knobs)) out[k] = given[k] ?? def.default;
  return out;
}

const pct = (x) => `${(x * 100).toFixed(1)}%`;
const rowFamily = (spacing) => (spacing === 'touching' ? 'touching' : 'spaced');
const finish = (k) => ({ stand: !!k.stand, turn: !!k.turn });
const titleCase = (c) => CASES[c] ?? c;

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
  const out = (title, text, recipe, metrics, note = '') => ({ look: lookId, title, text, note, recipe: { ...recipe, ...finish(k) }, metrics });

  const chainRecipe = (famName, l) => ({
    kind: 'chain', spacing: famName, join: 'hull+bridges',
    layout: { rows: l.rows.map(({ a, b, fit, frame }) => ({ a, b, fit, frame })), score: l.score, imbalance: l.imbalance, caseMode: l.caseMode },
  });
  const chains = function* (rows, famName, titlePrefix = '') {
    const designs = designWordPair(wasm, font, wordA, wordB, { spacing: famName, join: 'hull+bridges', height, candidates, cases, rows: [rows], fits });
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
          yield* chains(Math.min([...wordA].length, [...wordB].length), fam, 'One pair per level · ');
          continue;
        }
        const fit = k.stretch ? 'stretch' : 'uniform';
        let base, label;
        if (style === 'tall') {
          const [best] = designSpanColumn(wasm, font, wordA, wordB, { spacing: k.spacing === 'touching' ? 'touching' : 'spaced', fit, height });
          const shorter = [...wordA].length >= [...wordB].length ? wordB : wordA;
          label = `One tall letter (${[...shorter.toUpperCase()].map((c, i) => (best.spans[i] > 1 ? `${c}×${best.spans[i]}` : c)).join('')})`;
          base = { kind: 'span', spacing: k.spacing === 'touching' ? 'touching' : 'spaced', fit, spans: best.spans };
        } else {
          label = `Stacked (${fit === 'stretch' ? 'taller' : 'larger'})`;
          base = { kind: 'stacked', fit };
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
