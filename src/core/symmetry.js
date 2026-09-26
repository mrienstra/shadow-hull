/**
 * Symmetry reduction for the search. Rotating or reflecting a trip-let by any
 * of the cube's 48 symmetries gives a solid with the same shadows (up to which
 * side you view them from), so a search only needs one configuration per orbit.
 *
 * A configuration is { assignment: {view: text}, transforms: {view: d4 index} }.
 * Under a symmetry R, the prism for view v (local->world matrix L_v * G, with
 * G the glyph's D4 transform) maps to R * L_v * G. Its extrusion axis lands on
 * some view v', and L_v'^T * R * L_v * G is block-diagonal [G', ±1]. Prisms are
 * extruded symmetrically, so the ±1 doesn't matter and the image is view v'
 * with transform G'.
 */
import { VIEWS, VIEW_NAMES, d4 } from './views.js';

const mul = (A, B) => A.map((row) => [0, 1, 2].map((j) => row[0] * B[0][j] + row[1] * B[1][j] + row[2] * B[2][j]));
const transpose = (A) => [0, 1, 2].map((i) => A.map((row) => row[i]));
const frame = (v) => transpose([VIEWS[v].U, VIEWS[v].V, VIEWS[v].D]); // columns U, V, D

/** The 48 signed permutation matrices (row-major 3x3). */
export const CUBE_SYMMETRIES = (() => {
  const perms = [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]];
  const out = [];
  for (const p of perms) {
    for (let s = 0; s < 8; s++) {
      const M = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
      p.forEach((j, i) => { M[i][j] = (s >> i) & 1 ? -1 : 1; });
      out.push(M);
    }
  }
  return out;
})();

const D4_BY_KEY = new Map(Array.from({ length: 8 }, (_, i) => [d4(i).join(','), i]));

/** Image of a configuration under symmetry R. */
export function applySymmetry(R, { assignment, transforms }) {
  const out = { assignment: {}, transforms: {} };
  for (const v of VIEW_NAMES) {
    const [a, b, c, d] = d4(transforms[v] ?? 0);
    const N = mul(mul(R, frame(v)), [[a, b, 0], [c, d, 0], [0, 0, 1]]);
    const axis = [N[0][2], N[1][2], N[2][2]];
    const v2 = VIEW_NAMES.find((w) => Math.abs(VIEWS[w].D.reduce((s, x, i) => s + x * axis[i], 0)) === 1);
    const local = mul(transpose(frame(v2)), N);
    out.assignment[v2] = assignment[v];
    out.transforms[v2] = D4_BY_KEY.get([local[0][0], local[0][1], local[1][0], local[1][1]].join(','));
  }
  return out;
}

export const configKey = ({ assignment, transforms }) =>
  JSON.stringify(VIEW_NAMES.map((v) => [assignment[v], transforms[v] ?? 0]));

/** D4 index of d4(i) * d4(j) (apply j first). */
export function d4Compose(i, j) {
  const [a, b, c, d] = d4(i), [e, f, g, h] = d4(j);
  return D4_BY_KEY.get([a * e + b * g, a * f + b * h, c * e + d * g, c * f + d * h].join(','));
}

/**
 * D4 indices that map a silhouette onto itself (within `tolerance` of its
 * area): e.g. [0, 4] for a mirror-symmetric "A". Transforms that differ by
 * one of these build the same prism.
 */
export function stabilizer(shape, tolerance = 1e-4) {
  const area = shape.area(), out = [];
  for (let k = 0; k < 8; k++) {
    const [a, b, c, d] = d4(k);
    const moved = shape.transform([a, c, 0, b, d, 0, 0, 0, 1]);
    const x = moved.subtract(shape), y = shape.subtract(moved);
    if (x.area() + y.area() <= tolerance * area) out.push(k);
    for (const o of [moved, x, y]) o.delete();
  }
  return out;
}

/** Configs that build the same solid because of the glyphs' own symmetries. */
function glyphEquivalents(config, stabilizers) {
  let out = [config];
  for (const v of VIEW_NAMES) {
    const stab = stabilizers?.[config.assignment[v]] ?? [0];
    out = out.flatMap((c) => stab.map((s) => ({
      assignment: c.assignment,
      transforms: { ...c.transforms, [v]: d4Compose(c.transforms[v] ?? 0, s) },
    })));
  }
  return out;
}

/**
 * Keep one representative per symmetry orbit, restricted to `configs` (so the
 * search's constraints, e.g. upright-only, still hold). Orbits combine the
 * cube's symmetries with each glyph's own (`stabilizers`: text -> D4 indices,
 * optional). The representative is the one with the fewest non-identity
 * transforms, then earliest in `configs`.
 */
export function orbitRepresentatives(configs, stabilizers) {
  const rank = new Map();
  configs.forEach((c, i) => {
    const nonIdentity = VIEW_NAMES.filter((v) => (c.transforms[v] ?? 0) !== 0).length;
    rank.set(configKey(c), nonIdentity * configs.length + i);
  });
  return configs.filter((c) => {
    const mine = rank.get(configKey(c));
    return glyphEquivalents(c, stabilizers).every((e) => CUBE_SYMMETRIES.every((R) => {
      const r = rank.get(configKey(applySymmetry(R, e)));
      return r === undefined || r >= mine;
    }));
  });
}
