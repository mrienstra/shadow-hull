"""The three views of a trip-let and the in-plane transforms a glyph can take.

Direct port of views.js. World axes: X right, Y away from the front viewer, Z
up. Each view is a right-handed frame (U, V, D) with U x V = D: a viewer
standing on the +D side, looking toward -D, sees U to their right and V up,
so a glyph laid out with glyph-x -> U and glyph-y -> V reads correctly
(unmirrored). Seen from the opposite side (-D), the same shadow reads
mirrored.

Matrix layout note: the JS core represents transforms as flat column-major
Mat3/Mat4 arrays (the layout manifold-3d's JS/WASM bindings expect). The
Python manifold3d bindings instead take a row-major nested list -- the
first N columns form the linear part, the last column is the translation
(see `CrossSection.transform` / `Manifold.transform` docstrings). The
matrices below are built directly in that row-major nested-list form; they
are the same affine maps as views.js's, just laid out for the Python API.
"""
from __future__ import annotations

Vec3 = tuple[float, float, float]

VIEWS: dict[str, dict] = {
    "front": {"U": (1, 0, 0), "V": (0, 0, 1), "D": (0, -1, 0), "side": "-Y"},  # viewer at -Y
    "right": {"U": (0, 1, 0), "V": (0, 0, 1), "D": (1, 0, 0), "side": "+X"},   # viewer at +X
    "top": {"U": (1, 0, 0), "V": (0, 1, 0), "D": (0, 0, 1), "side": "+Z"},     # viewer above
}
VIEW_NAMES: tuple[str, str, str] = ("front", "right", "top")

_OPPOSITE = {"-Y": "+Y", "+X": "-X", "+Z": "-Z"}


def local_to_world(view: str) -> list[list[float]]:
    """Local (glyph-plane x, y, extrusion z) -> world, as a row-major 3x4
    matrix (Manifold.transform format): world = x*U + y*V + z*D.
    """
    v = VIEWS[view]
    U, V, D = v["U"], v["V"], v["D"]
    return [[U[i], V[i], D[i], 0] for i in range(3)]


def world_to_local(view: str) -> list[list[float]]:
    """World -> local (the transpose, since the frame is orthonormal)."""
    v = VIEWS[view]
    U, V, D = v["U"], v["V"], v["D"]
    return [[*U, 0], [*V, 0], [*D, 0]]


def d4(index: int) -> tuple[float, float, float, float]:
    """The 8 symmetries of the square (dihedral group D4), indexed 0-7:
    index = rot + 4 * mirror, where rot is quarter-turns counter-clockwise
    and mirror flips glyph-x *before* rotating. Returns a row-major 2x2
    (a, b, c, d) mapping (x, y) -> (a*x + b*y, c*x + d*y).
    """
    rot, mirror = index % 4, index >= 4
    cos, sin = [(1, 0), (0, 1), (-1, 0), (0, -1)][rot]
    m = -1 if mirror else 1
    return (cos * m, -sin, sin * m, cos)


def d4_mat(index: int) -> list[list[float]]:
    """Row-major 2x3 matrix for CrossSection.transform (no translation)."""
    a, b, c, d = d4(index)
    return [[a, b, 0], [c, d, 0]]


def how_to_view(view: str, index: int) -> dict:
    """How a viewer should look at a view built with D4 `index` to see the
    glyph unmirrored: from which side, and how far the glyph appears
    rotated (degrees counter-clockwise) from upright.
    """
    rot, mirror = (index % 4) * 90, index >= 4
    side = VIEWS[view]["side"]
    # Seen from the far side, a mirror-then-rotate(r) reads as rotate(-r).
    if mirror:
        return {"from": _OPPOSITE[side], "rotation": (360 - rot) % 360}
    return {"from": side, "rotation": rot}


def transform_choices(mode: str) -> dict[str, list[int]]:
    """Candidate D4 indices per view for a search.
    - 'upright': the object sits on a table. Side views must read upright,
      from either side (0 or 4); the top view may be rotated but seen from
      above only.
    - 'any': the object can be held in any orientation; all 8 per view.
    - 'none': identity only.
    """
    if mode == "none":
        return {"front": [0], "right": [0], "top": [0]}
    if mode == "any":
        all_ = [0, 1, 2, 3, 4, 5, 6, 7]
        return {"front": list(all_), "right": list(all_), "top": list(all_)}
    return {"front": [0, 4], "right": [0, 4], "top": [0, 1, 2, 3]}
