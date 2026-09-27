/**
 * Look definitions (data only — no geometry imports, so the web page can use
 * them without bundling the geometry code). See looks.js.
 */
export const CASES = { upper: 'Capitals', lower: 'lowercase', title: 'Title case', mixed: 'Mixed case (per letter, for fit)' };
const choice = (options, def, labels = {}) => ({ type: 'choice', options, default: def, labels });
const bool = (def) => ({ type: 'bool', default: def });
// Supports: thin rods that join separate pieces (visible as small marks in
// the shadows). 'none' leaves pieces to connect by themselves, through hidden
// joins, or through the display stand.
const supports = () => choice(['allowed', 'none'], 'allowed', { allowed: 'Allowed where needed', none: 'None' });

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
      stretch: bool(false), supports: supports(), stand: bool(true), turn: bool(true),
    },
  },
  {
    id: 'rows', label: 'Pairs in rows', inputs: 'words',
    blurb: 'The row of pairs broken into two or three lines, stacked.',
    knobs: {
      rows: choice([2, 3], 2), spacing: choice(['gapped', 'touching'], 'gapped'), case: choice(['upper', 'mixed', 'lower', 'title'], 'upper', CASES),
      stretch: bool(false), compact: bool(false), supports: supports(), stand: bool(true), turn: bool(false),
    },
  },
  {
    id: 'grid', label: 'Grid', inputs: 'words',
    blurb: 'Letters in equal rows and aligned columns (FIN / OLA).',
    knobs: {
      rows: choice([2, 3], 2), mono: bool(false), case: choice(['upper', 'mixed', 'lower', 'title'], 'upper', CASES),
      stretch: bool(false), compact: bool(false), supports: supports(), stand: bool(true), turn: bool(false),
    },
  },
  {
    id: 'tower', label: 'Tower', inputs: 'words',
    blurb: 'Letters stacked vertically, one word down each side.',
    knobs: {
      style: choice(['stacked', 'pairs', 'tall'], 'stacked', { stacked: 'Stacked (shorter word’s letters taller)', pairs: 'One pair per level', tall: 'One tall letter' }),
      spacing: choice(['touching', 'gapped'], 'touching'), shape: { type: 'text', default: '' },
      stretch: bool(false), supports: supports(), stand: bool(false), turn: bool(false),
    },
  },
  {
    id: 'block', label: 'Word block', inputs: 'words',
    blurb: 'Both whole words cut through one block; optionally shaped from above (e.g. ❤) or read at an angle.',
    knobs: {
      case: choice(['upper', 'lower', 'title'], 'upper', CASES), shape: { type: 'text', default: '' },
      angle: choice([90, 75, 60, 45], 90, { 90: '90° (front and side)', 75: '75°', 60: '60°', 45: '45°' }), supports: supports(), stand: bool(false), turn: bool(false),
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

