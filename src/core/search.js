import { silhouette, buildTriplet, measure } from './triplet.js';
import { VIEW_NAMES, transformChoices } from './views.js';
import { orbitRepresentatives, stabilizer } from './symmetry.js';

/** Distinct permutations of `items`. */
function permutations(items) {
  if (items.length <= 1) return [items];
  const out = [], seen = new Set();
  items.forEach((x, i) => {
    for (const rest of permutations([...items.slice(0, i), ...items.slice(i + 1)])) {
      const p = [x, ...rest], key = JSON.stringify(p);
      if (!seen.has(key)) { seen.add(key); out.push(p); }
    }
  });
  return out;
}

function* product(lists) {
  if (!lists.length) { yield []; return; }
  for (const x of lists[0]) for (const rest of product(lists.slice(1))) yield [x, ...rest];
}

/**
 * Ranking: one-piece solids first (when preferConnected), then the worst
 * letter's coverage, then the mean coverage.
 */
export function compareCandidates(a, b, { preferConnected = true } = {}) {
  if (preferConnected) {
    const ca = a.metrics.pieces === 1, cb = b.metrics.pieces === 1;
    if (ca !== cb) return ca ? -1 : 1;
  }
  return (b.metrics.minCoverage - a.metrics.minCoverage) || (b.metrics.meanCoverage - a.metrics.meanCoverage);
}

/**
 * Try every assignment of `texts` to views and every allowed transform,
 * build and measure each, and return candidates best first.
 *
 * @param texts three strings (a letter, a word, or '' for "no constraint").
 * @param opts.permute try all assignments of texts to views (default true).
 * @param opts.transforms 'upright' | 'any' | 'none' (see views.js).
 * @param opts.dedupe skip configurations that are rotations/reflections of
 *   another one in the search (same shadows; see symmetry.js). Default true.
 */
export function search(wasm, font, texts, opts = {}) {
  const {
    size = 40, fit = 'stretch', tolerance, permute = true, transforms = 'upright', preferConnected = true, dedupe = true,
  } = opts;
  if (texts.length !== 3) throw new Error('Need exactly three texts');
  const shapes = new Map();
  const shapeOf = (t) => {
    if (!shapes.has(t)) shapes.set(t, silhouette(wasm, font, t, { size, fit, tolerance }));
    return shapes.get(t);
  };
  const choices = transformChoices(transforms);
  let configs = [];
  for (const order of permute ? permutations(texts) : [texts]) {
    const assignment = Object.fromEntries(VIEW_NAMES.map((v, i) => [v, order[i]]));
    for (const combo of product(VIEW_NAMES.map((v) => choices[v]))) {
      configs.push({ assignment, transforms: Object.fromEntries(VIEW_NAMES.map((v, i) => [v, combo[i]])) });
    }
  }
  if (dedupe) {
    const stabilizers = Object.fromEntries([...new Set(texts)].map((t) => [t, stabilizer(shapeOf(t))]));
    configs = orbitRepresentatives(configs, stabilizers);
  }

  const candidates = [];
  try {
    for (const { assignment, transforms: tf } of configs) {
      const viewShapes = Object.fromEntries(VIEW_NAMES.map((v) => [v, shapeOf(assignment[v])]));
      const solid = buildTriplet(wasm, viewShapes, tf, { size });
      try {
        candidates.push({ assignment, transforms: tf, metrics: measure(wasm, solid, viewShapes, tf) });
      } finally {
        solid.delete();
      }
    }
  } finally {
    for (const s of shapes.values()) s.delete();
  }
  return candidates.sort((a, b) => compareCandidates(a, b, { preferConnected }));
}
