/**
 * Compositions: a solid built as the union of cells, each a small trip-let in
 * its own box. This generalises buildTriplet (one cell filling a cube) to
 * words: e.g. a diagonal chain of letter pairs, stacked rows, grids.
 *
 * A cell is { box: { min: [x, y, z], max: [x, y, z] }, shapes: { front?, right?, top? } }.
 * Each shape is a CrossSection already placed in that view's local 2D frame
 * (see views.js): front = (X, Z), right = (Y, Z), top = (X, Y). A missing shape
 * leaves that view unconstrained inside the box. Shapes are not consumed.
 */
import { Scope, extrudeCentered } from './manifold.js';
import { VIEW_NAMES, localToWorld, worldToLocal } from './views.js';

function extent(cells) {
  let m = 0;
  for (const { box } of cells) for (const v of [...box.min, ...box.max]) m = Math.max(m, Math.abs(v));
  return m;
}

/** Union of all cells. Caller owns the returned Manifold. */
export function buildComposition(wasm, cells) {
  const { Manifold } = wasm;
  const scope = new Scope();
  try {
    const length = 4 * extent(cells) + 1; // prisms long enough to cross every box
    const solids = cells.map(({ box, shapes }) => {
      const size = box.max.map((x, i) => x - box.min[i]);
      const parts = [scope.add(scope.add(Manifold.cube(size, false)).translate(box.min))];
      for (const v of VIEW_NAMES) {
        if (!shapes[v]) continue;
        const prism = scope.add(extrudeCentered(wasm, shapes[v], length));
        parts.push(scope.add(prism.transform(localToWorld(v))));
      }
      return scope.add(Manifold.intersection(parts));
    });
    return Manifold.union(solids);
  } finally {
    scope.dispose();
  }
}

/**
 * Compare each constrained view's shadow with the union of its cells' shapes.
 * Per view: coverage (1 = every target shape fully shown), outside (should
 * be ~0), worstCell (lowest per-cell coverage, i.e. the weakest letter/chunk).
 * Views with no shapes report only the shadow area.
 */
export function measureComposition(wasm, solid, cells) {
  const { CrossSection } = wasm;
  const scope = new Scope();
  try {
    const views = {};
    for (const v of VIEW_NAMES) {
      const shadow = scope.add(scope.add(solid.transform(worldToLocal(v))).project());
      const own = cells.map((c) => c.shapes[v]).filter(Boolean);
      if (!own.length) { views[v] = { constrained: false, shadowArea: shadow.area() }; continue; }
      const target = scope.add(CrossSection.union(own));
      const missing = scope.add(target.subtract(shadow)).area();
      const outside = scope.add(shadow.subtract(target)).area();
      const worstCell = Math.min(...own.map((s) => 1 - scope.add(s.subtract(shadow)).area() / s.area()));
      views[v] = { constrained: true, coverage: 1 - missing / target.area(), worstCell, missing, outside };
    }
    // Pieces below 0.1% of the volume are dust (slivers where two letters
    // barely touch); they would not survive printing, so count them apart.
    const parts = solid.decompose();
    const total = solid.volume();
    const dust = parts.filter((p) => p.volume() < 1e-3 * total).length;
    const pieces = parts.length - dust;
    for (const p of parts) p.delete();
    const { min, max } = solid.boundingBox();
    const constrained = VIEW_NAMES.filter((v) => views[v].constrained);
    return {
      views,
      minCoverage: Math.min(...constrained.map((v) => views[v].coverage)),
      worstCell: Math.min(...constrained.map((v) => views[v].worstCell)),
      pieces,
      dust,
      volume: total,
      size: max.map((x, i) => x - min[i]),
    };
  } finally {
    scope.dispose();
  }
}

/** Free every shape in a list of cells. */
export function disposeCells(cells) {
  for (const c of cells) for (const s of Object.values(c.shapes)) s?.delete();
}

/**
 * How visible each letter is in its view: the share of its ink not covered
 * by any other letter's ink in the same view (overlapping neighbours can hide
 * a letter even when coverage is 100%), and how much of its outline touches
 * other letters: `contact` ≈ length of outline within `contactDistance` of
 * another letter, in row heights. Touching along a whole stem (~1) makes two
 * letters read as one (I next to L reads as a thick L). Needs cells with
 * per-letter outlines (`cell.letters[view] = [{ ch, pts }]`, from layoutCells).
 * @returns { views: { front: [{ ch, visible, contact }], ... }, worst, worstContact }
 */
export function letterVisibility(wasm, cells, { contactDistance = 0.3, height = 20 } = {}) {
  const { CrossSection } = wasm;
  const scope = new Scope();
  try {
    const views = {};
    let worst = { ch: null, view: null, visible: 1 };
    let worstContact = { ch: null, view: null, contact: 0 };
    for (const v of VIEW_NAMES) {
      const letters = cells.flatMap((c) => c.letters?.[v] ?? []);
      if (!letters.length) continue;
      const shapes = letters.map((l) => scope.add(new CrossSection(l.pts, 'NonZero')));
      views[v] = letters.map((l, i) => {
        const others = shapes.filter((_, j) => j !== i);
        const own = shapes[i].area();
        let hidden = 0, contact = 0;
        if (others.length) {
          const rest = scope.add(CrossSection.union(others));
          hidden = scope.add(rest.intersect(shapes[i])).area();
          // Ink of this letter within contactDistance of another letter, beyond the
          // overlap itself, divided by the distance ≈ length of outline in contact.
          const near = scope.add(scope.add(rest.offset(contactDistance, 'Round')).intersect(shapes[i])).area();
          contact = (near - hidden) / contactDistance / height;
        }
        const visible = own > 0 ? 1 - hidden / own : 1;
        if (visible < worst.visible) worst = { ch: l.ch, view: v, visible };
        if (contact > worstContact.contact) worstContact = { ch: l.ch, view: v, contact };
        return { ch: l.ch, visible, contact };
      });
    }
    return { views, worst, worstContact };
  } finally {
    scope.dispose();
  }
}
