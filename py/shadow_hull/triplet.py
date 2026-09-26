"""Silhouettes, trip-let construction, and measurement (port of triplet.js).

Unlike the JS core, no WASM module handle needs to be threaded through: the
Python manifold3d bindings are ready to use as soon as they're imported, and
Manifold/CrossSection objects are ordinary garbage-collected Python objects
(no `.delete()` / Scope bookkeeping needed).
"""
from __future__ import annotations

from manifold3d import CrossSection, FillRule, Manifold, OpType

from .glyph import DEFAULT_TOLERANCE, text_contours
from .views import VIEW_NAMES, d4_mat, how_to_view, local_to_world, world_to_local


def silhouette(font, text: str, size: float = 40, fit: str = "stretch", tolerance: float | None = None) -> CrossSection:
    """A glyph outline normalised into the square [-size/2, size/2]^2.
    - fit 'stretch': scale x and y independently to fill the square. Every
      pair of views shares an axis, so filling the square keeps shared
      extents equal.
    - fit 'contain': uniform scale, centred (keeps proportions, loses
      coverage).
    Empty or missing text gives the full square (no constraint for that
    view).
    """
    if not text:
        return CrossSection.square((size, size), True)
    contours = text_contours(font, text, DEFAULT_TOLERANCE if tolerance is None else tolerance)
    raw = CrossSection(contours, FillRule.NonZero)
    if raw.is_empty():
        raise ValueError(f"No outline for {text!r} in this font")
    min_x, min_y, max_x, max_y = raw.bounds()
    sx, sy = size / (max_x - min_x), size / (max_y - min_y)
    if fit == "contain":
        sx = sy = min(sx, sy)
    return raw.translate((-(min_x + max_x) / 2, -(min_y + max_y) / 2)).scale((sx, sy))


def build_triplet(shapes: dict[str, CrossSection], transforms: dict[str, int] | None = None, size: float = 40) -> Manifold:
    """Build the trip-let for fixed silhouettes and transforms.

    @param shapes { front, right, top }: CrossSections in the square.
    @param transforms { front, right, top }: D4 indices (see views.py).
    @returns Manifold.
    """
    transforms = transforms or {}
    length = size * 1.5  # overshoot the cube so no faces are coplanar
    prisms = []
    for v in VIEW_NAMES:
        cs = shapes[v].transform(d4_mat(transforms.get(v, 0)))
        # CrossSection.extrude has no `center` option (unlike the JS/WASM
        # binding's `extrude(h, 0, 0, [1,1], true)`): it always places the
        # bottom at z=0, top at z=height, so we centre it ourselves.
        prism = cs.extrude(length).translate((0, 0, -length / 2))
        prisms.append(prism.transform(local_to_world(v)))
    return Manifold.batch_boolean(prisms, OpType.Intersect)


def measure(solid: Manifold, shapes: dict[str, CrossSection], transforms: dict[str, int] | None = None) -> dict:
    """Measure how well the solid's actual shadows match the targets.
    Per view:
     - coverage: fraction of the target letter that the shadow fills (1 = all).
     - missing: target area the shadow fails to cover (letters conflict).
     - outside: shadow area outside the target. Should be ~0 by construction;
       anything else means a frame/orientation bug.
    Plus: pieces (connected components; 1 = one solid), volume.
    """
    transforms = transforms or {}
    views = {}
    for v in VIEW_NAMES:
        target = shapes[v].transform(d4_mat(transforms.get(v, 0)))
        shadow = solid.transform(world_to_local(v)).project()
        target_area = target.area()
        missing = (target - shadow).area()
        outside = (shadow - target).area()
        views[v] = {
            "coverage": 1 - missing / target_area,
            "missing": missing,
            "outside": outside,
            "targetArea": target_area,
        }
    pieces = len(solid.decompose())
    coverages = [views[v]["coverage"] for v in VIEW_NAMES]
    return {
        "views": views,
        "minCoverage": min(coverages),
        "meanCoverage": sum(coverages) / len(coverages),
        "pieces": pieces,
        "volume": solid.volume(),
    }


def viewing_guide(texts: dict[str, str], transforms: dict[str, int] | None = None) -> dict:
    """Human-facing viewing instructions for a set of transforms."""
    transforms = transforms or {}
    return {
        v: {"text": texts.get(v, ""), **how_to_view(v, transforms.get(v, 0))}
        for v in VIEW_NAMES
    }
