import { Scope, extrudeCentered } from './manifold.js';
import { textContours } from './glyph.js';
import { VIEW_NAMES, localToWorld, worldToLocal, d4Mat3, howToView } from './views.js';

/**
 * A glyph outline normalised into the square [-size/2, size/2]^2.
 * - fit 'stretch': scale x and y independently to fill the square. Every pair
 *   of views shares an axis, so filling the square keeps shared extents equal.
 * - fit 'contain': uniform scale, centred (keeps proportions, loses coverage).
 * Empty or missing text gives the full square (no constraint for that view).
 */
export function silhouette(wasm, font, text, { size = 40, fit = 'stretch', tolerance } = {}) {
  const { CrossSection } = wasm;
  if (!text) return CrossSection.square([size, size], true);
  const contours = textContours(font, text, { tolerance });
  const raw = new CrossSection(contours, 'NonZero');
  try {
    if (raw.isEmpty()) throw new Error(`No outline for ${JSON.stringify(text)} in this font`);
    const { min, max } = raw.bounds();
    let sx = size / (max[0] - min[0]), sy = size / (max[1] - min[1]);
    if (fit === 'contain') sx = sy = Math.min(sx, sy);
    return raw.translate([-(min[0] + max[0]) / 2, -(min[1] + max[1]) / 2]).scale([sx, sy]);
  } finally {
    raw.delete();
  }
}

/**
 * Build the trip-let for fixed silhouettes and transforms.
 *
 * @param wasm Manifold module (from getManifold()).
 * @param shapes { front, right, top }: CrossSections in the square (not consumed).
 * @param transforms { front, right, top }: D4 indices (see views.js).
 * @returns Manifold (caller owns it and must .delete() it).
 */
export function buildTriplet(wasm, shapes, transforms = {}, { size = 40 } = {}) {
  const { Manifold } = wasm;
  const scope = new Scope();
  try {
    const length = size * 1.5; // overshoot the cube so no faces are coplanar
    const prisms = VIEW_NAMES.map((v) => {
      const cs = scope.add(shapes[v].transform(d4Mat3(transforms[v] ?? 0)));
      const prism = scope.add(extrudeCentered(wasm, cs, length));
      return scope.add(prism.transform(localToWorld(v)));
    });
    return Manifold.intersection(prisms);
  } finally {
    scope.dispose();
  }
}

/**
 * Measure how well the solid's actual shadows match the targets.
 * Per view:
 *  - coverage: fraction of the target letter that the shadow fills (1 = all).
 *  - missing: target area the shadow fails to cover (letters conflict).
 *  - outside: shadow area outside the target. Should be ~0 by construction;
 *    anything else means a frame/orientation bug.
 * Plus: pieces (connected components; 1 = one solid), volume.
 */
export function measure(wasm, solid, shapes, transforms = {}) {
  const scope = new Scope();
  try {
    const views = {};
    for (const v of VIEW_NAMES) {
      const target = scope.add(shapes[v].transform(d4Mat3(transforms[v] ?? 0)));
      const shadow = scope.add(scope.add(solid.transform(worldToLocal(v))).project());
      const targetArea = target.area();
      const missing = scope.add(target.subtract(shadow)).area();
      const outside = scope.add(shadow.subtract(target)).area();
      views[v] = { coverage: 1 - missing / targetArea, missing, outside, targetArea };
    }
    const parts = solid.decompose();
    const pieces = parts.length;
    for (const p of parts) p.delete();
    const coverages = VIEW_NAMES.map((v) => views[v].coverage);
    return {
      views,
      minCoverage: Math.min(...coverages),
      meanCoverage: coverages.reduce((a, b) => a + b, 0) / coverages.length,
      pieces,
      volume: solid.volume(),
    };
  } finally {
    scope.dispose();
  }
}

/** Human-facing viewing instructions for a set of transforms. */
export function viewingGuide(texts, transforms = {}) {
  return Object.fromEntries(VIEW_NAMES.map((v) => [v, { text: texts[v] ?? '', ...howToView(v, transforms[v] ?? 0) }]));
}

/**
 * Printability check: does the solid survive a minimum wall thickness?
 *
 * Eroding the solid by a ball of radius r (= minThickness / 2) is exact and
 * cheap here: each prism is infinite along its own axis, so its erosion is the
 * prism of its silhouette offset by -r (round joins), and erosion distributes
 * over intersection. If the eroded solid has more pieces than the original,
 * some neck is thinner than minThickness; if it is empty, the whole thing is.
 *
 * @returns { minThickness, erodedPieces, erodedVolumeFraction }
 */
export function thicknessCheck(wasm, shapes, transforms = {}, { size = 40, minThickness = 1 } = {}) {
  const scope = new Scope();
  try {
    const r = minThickness / 2;
    const eroded = Object.fromEntries(VIEW_NAMES.map((v) => [v, scope.add(shapes[v].offset(-r, 'Round', 2, 64))]));
    const solid = scope.add(buildTriplet(wasm, shapes, transforms, { size }));
    const thin = scope.add(buildTriplet(wasm, eroded, transforms, { size }));
    const parts = thin.decompose();
    for (const p of parts) p.delete();
    return {
      minThickness,
      erodedPieces: thin.isEmpty() ? 0 : parts.length,
      erodedVolumeFraction: thin.volume() / solid.volume(),
    };
  } finally {
    scope.dispose();
  }
}
