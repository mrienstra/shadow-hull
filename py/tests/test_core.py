"""Mirrors test/core.test.js.

Not ported (out of scope for this task, per src/core/symmetry.js and the
`dedupe` option added to search.js after this port started): the
"applySymmetry matches transforming the actual solid" test and the "dedupe
keeps the best result and one config per orbit" test. shadow_hull.search
raises NotImplementedError if called with dedupe=True; see search.py.
"""
from __future__ import annotations

import math
import struct

import pytest
from manifold3d import Manifold

from shadow_hull import VIEW_NAMES, build_triplet, d4, how_to_view, measure, search, silhouette, to_binary_stl

SIZE = 40
H = SIZE / 2


def shapes_for(font, texts: dict) -> dict:
    return {v: silhouette(font, texts.get(v, ""), size=SIZE) for v in VIEW_NAMES}


def slab_extent(solid: Manifold, axis: int, at: float, up_axis: int):
    """Extent of the solid along `up_axis` within a thin slab at `axis` = `at`."""
    dims = [SIZE * 2, SIZE * 2, SIZE * 2]
    dims[axis] = 1
    pos = [0.0, 0.0, 0.0]
    pos[axis] = at
    box = Manifold.cube(tuple(dims), True).translate(tuple(pos))
    cut = solid ^ box  # intersection (see the manifold3d API check: `^` is OpType.Intersect)
    if cut.is_empty():
        return None
    bbox = cut.bounding_box()  # (xmin, ymin, zmin, xmax, ymax, zmax)
    return (bbox[up_axis], bbox[3 + up_axis])


def assert_reads_as_f(solid, right, up):
    """An "F" reads correctly when, in the viewer's frame, its stem is on
    the left (spans full height) and its right edge has material only in
    the upper half. `right`/`up` are (world axis index, sign) for the
    viewer's right/up.
    """
    ra, rs = right
    ua, us = up
    left = slab_extent(solid, ra, -rs * (H - 1), ua)
    far_right = slab_extent(solid, ra, rs * (H - 1), ua)
    assert left is not None and left[1] - left[0] > SIZE * 0.95, f"stem on the left spans full height: {left}"
    assert far_right is not None, "top bar reaches the right edge"
    lowest = far_right[0] if us > 0 else -far_right[1]
    assert lowest > 0, f"right edge has material only in the upper half (lowest {lowest:.2f})"


# Viewer frames, stated independently of views.py: (axis index, sign).
X, Y, Z = 0, 1, 2
FRAMES = {
    "front/-Y": {"right": (X, 1), "up": (Z, 1)},   # standing at -Y, facing +Y
    "front/+Y": {"right": (X, -1), "up": (Z, 1)},
    "right/+X": {"right": (Y, 1), "up": (Z, 1)},   # standing at +X, facing -X
    "right/-X": {"right": (Y, -1), "up": (Z, 1)},
    "top/+Z": {"right": (X, 1), "up": (Y, 1)},     # above, front edge toward you
}

# Same dynamic-generation approach as core.test.js: only emit a case when
# howToView(view, index) lands on a side FRAMES has an independently
# hand-written frame for.
_F_CASES = []
for _view in VIEW_NAMES:
    for _index in (0, 4):
        _info = how_to_view(_view, _index)
        _key = f"{_view}/{_info['from']}"
        if _key in FRAMES:
            _F_CASES.append(pytest.param(_view, _index, id=f"{_view}_tf{_index}_from_{_info['from']}"))


@pytest.mark.parametrize("view,index", _F_CASES)
def test_f_reads_correctly(font, view, index):
    info = how_to_view(view, index)
    assert info["rotation"] == 0
    shapes = shapes_for(font, {view: "F"})
    solid = build_triplet(shapes, {view: index}, size=SIZE)
    assert_reads_as_f(solid, FRAMES[f"{view}/{info['from']}"]["right"], FRAMES[f"{view}/{info['from']}"]["up"])


def test_d4_matrices_form_square_symmetries():
    """d4 matrices form the square symmetries (orthogonal, det +-1, mirror iff index >= 4)."""
    for i in range(8):
        a, b, c, d = d4(i)
        assert math.isclose(a * a + c * c, 1, abs_tol=1e-12)
        assert math.isclose(a * b + c * d, 0, abs_tol=1e-12)
        det = a * d - b * c
        assert math.isclose(det, -1 if i >= 4 else 1, abs_tol=1e-12)


def test_shadows_never_extend_outside_targets(font):
    shapes = shapes_for(font, {"front": "G", "right": "E", "top": "B"})
    for i in range(8):
        tf = {"front": i, "right": (i + 3) % 8, "top": (i + 5) % 8}
        solid = build_triplet(shapes, tf, size=SIZE)
        m = measure(solid, shapes, tf)
        for v in VIEW_NAMES:
            assert m["views"][v]["outside"] < 1e-3, f"{v} outside {m['views'][v]['outside']} (tf {tf})"


def test_unconstrained_view_casts_full_square(font):
    shapes = shapes_for(font, {})
    solid = build_triplet(shapes, {}, size=SIZE)
    assert abs(solid.volume() - SIZE ** 3) < 1e-6 * SIZE ** 3


def test_search_finds_complete_one_piece_geb(font):
    ranked = search(font, ["G", "E", "B"], size=SIZE)
    best = ranked[0]
    assert best["metrics"]["pieces"] == 1
    assert best["metrics"]["minCoverage"] > 0.99, f"worst coverage {best['metrics']['minCoverage']}"


def test_binary_stl_has_right_header_count_and_length(font):
    shapes = shapes_for(font, {"front": "G", "right": "E", "top": "B"})
    solid = build_triplet(shapes, {}, size=SIZE)
    stl = to_binary_stl(solid)
    n = struct.unpack_from("<I", stl, 80)[0]
    assert n == solid.num_tri()
    assert len(stl) == 84 + 50 * n
