/**
 * The three views of a trip-let and the in-plane transforms a glyph can take.
 *
 * World axes: X right, Y away from the front viewer, Z up.
 * Each view is a right-handed frame (U, V, D) with U x V = D: a viewer standing
 * on the +D side, looking toward -D, sees U to their right and V up, so a glyph
 * laid out with glyph-x -> U and glyph-y -> V reads correctly (unmirrored).
 * Seen from the opposite side (-D), the same shadow reads mirrored.
 */
export const VIEWS = {
  front: { U: [1, 0, 0], V: [0, 0, 1], D: [0, -1, 0], side: '-Y' }, // viewer at -Y
  right: { U: [0, 1, 0], V: [0, 0, 1], D: [1, 0, 0], side: '+X' },  // viewer at +X
  top:   { U: [1, 0, 0], V: [0, 1, 0], D: [0, 0, 1], side: '+Z' },  // viewer above
};
export const VIEW_NAMES = /** @type {const} */ (['front', 'right', 'top']);

const OPPOSITE = { '-Y': '+Y', '+X': '-X', '+Z': '-Z' };

/** Local (glyph-plane x, y, extrusion z) -> world, as a column-major Mat4. */
export function localToWorld(view) {
  const { U, V, D } = VIEWS[view];
  return [...U, 0, ...V, 0, ...D, 0, 0, 0, 0, 1];
}

/** World -> local (the transpose, since the frame is orthonormal). */
export function worldToLocal(view) {
  const { U, V, D } = VIEWS[view];
  return [U[0], V[0], D[0], 0, U[1], V[1], D[1], 0, U[2], V[2], D[2], 0, 0, 0, 0, 1];
}

/**
 * The 8 symmetries of the square (dihedral group D4), indexed 0-7:
 * index = rot + 4 * mirror, where rot is quarter-turns counter-clockwise and
 * mirror flips glyph-x *before* rotating. Each is a row-major 2x2 [a, b, c, d]
 * mapping (x, y) -> (a x + b y, c x + d y).
 */
export function d4(index) {
  const rot = index % 4, mirror = index >= 4;
  const [cos, sin] = [[1, 0], [0, 1], [-1, 0], [0, -1]][rot];
  const m = mirror ? -1 : 1;
  return [cos * m, -sin, sin * m, cos];
}

/** Column-major Mat3 for CrossSection.transform. */
export function d4Mat3(index) {
  const [a, b, c, d] = d4(index);
  return [a, c, 0, b, d, 0, 0, 0, 1];
}

/**
 * How a viewer should look at a view built with D4 `index` to see the glyph
 * unmirrored: from which side, and how far the glyph appears rotated
 * (degrees counter-clockwise) from upright.
 */
export function howToView(view, index) {
  const rot = (index % 4) * 90, mirror = index >= 4;
  const side = VIEWS[view].side;
  // Seen from the far side, a mirror-then-rotate(r) reads as rotate(-r).
  return mirror
    ? { from: OPPOSITE[side], rotation: (360 - rot) % 360 }
    : { from: side, rotation: rot };
}

/**
 * Candidate D4 indices per view for a search.
 * - 'upright': the object sits on a table. Side views must read upright, from
 *   either side (0 or 4); the top view may be rotated but seen from above only.
 * - 'any': the object can be held in any orientation; all 8 per view.
 * - 'none': identity only.
 */
export function transformChoices(mode) {
  if (mode === 'none') return { front: [0], right: [0], top: [0] };
  if (mode === 'any') {
    const all = [0, 1, 2, 3, 4, 5, 6, 7];
    return { front: all, right: all, top: all };
  }
  return { front: [0, 4], right: [0, 4], top: [0, 1, 2, 3] };
}
