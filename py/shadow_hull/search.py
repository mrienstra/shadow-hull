"""Trying every text/view assignment and transform, and ranking the results
(port of search.js).
"""
from __future__ import annotations

import itertools
from functools import cmp_to_key

from .triplet import build_triplet, measure, silhouette
from .views import VIEW_NAMES, transform_choices


def _permutations(items: list) -> list[list]:
    """Distinct permutations of `items`. `itertools.permutations` visits
    positions in the same first-element-varies-slowest order as search.js's
    hand-written recursive `permutations()`, so de-duplicating its output
    (for repeated values) by first occurrence reproduces the JS order
    exactly, not just the same set.
    """
    seen = set()
    out = []
    for p in itertools.permutations(items):
        if p not in seen:
            seen.add(p)
            out.append(list(p))
    return out


def compare_candidates(a: dict, b: dict, prefer_connected: bool = True) -> int:
    """Ranking: one-piece solids first (when prefer_connected), then the
    worst letter's coverage, then the mean coverage. Returns a negative
    number if `a` ranks before `b`, positive if after, 0 if tied -- for use
    with `functools.cmp_to_key` (mirrors compareCandidates's use as a JS
    Array.sort comparator).
    """
    if prefer_connected:
        ca, cb = a["metrics"]["pieces"] == 1, b["metrics"]["pieces"] == 1
        if ca != cb:
            return -1 if ca else 1
    d = b["metrics"]["minCoverage"] - a["metrics"]["minCoverage"]
    if d:
        return -1 if d < 0 else 1
    d = b["metrics"]["meanCoverage"] - a["metrics"]["meanCoverage"]
    if d:
        return -1 if d < 0 else 1
    return 0


def search(
    font,
    texts: list[str],
    size: float = 40,
    fit: str = "stretch",
    tolerance: float | None = None,
    permute: bool = True,
    transforms: str = "upright",
    prefer_connected: bool = True,
    dedupe: bool = False,
) -> list[dict]:
    """Try every assignment of `texts` to views and every allowed transform,
    build and measure each, and return candidates best first.

    @param texts three strings (a letter, a word, or '' for "no constraint").
    @param permute try all assignments of texts to views (default True).
    @param transforms 'upright' | 'any' | 'none' (see views.py).
    @param dedupe the JS core (src/core/symmetry.js) can skip configurations
        that are cube-symmetric images of another one already in the search
        (same shadows up to which side you view them from). That symmetry
        reduction is *not* ported here -- out of scope for this task. This
        parameter exists only so callers (including the parity fixtures,
        which record `dedupe: false` explicitly) can pass it through
        unsurprised: False (the default) runs the full, non-deduplicated
        search, matching the JS core's own dedupe=false behaviour; True
        raises, since there's no reduction implemented to honour it.
    """
    if dedupe:
        raise NotImplementedError(
            "search() does not port the JS core's symmetry-based dedupe "
            "(src/core/symmetry.js); call with dedupe=False (the default) "
            "for the full, non-deduplicated candidate set."
        )
    if len(texts) != 3:
        raise ValueError("Need exactly three texts")
    shapes_cache: dict[str, object] = {}

    def shape_of(t: str):
        if t not in shapes_cache:
            shapes_cache[t] = silhouette(font, t, size=size, fit=fit, tolerance=tolerance)
        return shapes_cache[t]

    choices = transform_choices(transforms)
    candidates = []
    orders = _permutations(list(texts)) if permute else [list(texts)]
    for order in orders:
        assignment = {v: order[i] for i, v in enumerate(VIEW_NAMES)}
        view_shapes = {v: shape_of(assignment[v]) for v in VIEW_NAMES}
        for combo in itertools.product(*[choices[v] for v in VIEW_NAMES]):
            tf = {v: combo[i] for i, v in enumerate(VIEW_NAMES)}
            solid = build_triplet(view_shapes, tf, size=size)
            candidates.append({
                "assignment": assignment,
                "transforms": tf,
                "metrics": measure(solid, view_shapes, tf),
            })

    candidates.sort(key=cmp_to_key(lambda a, b: compare_candidates(a, b, prefer_connected)))
    return candidates
