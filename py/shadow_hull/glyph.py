"""Glyph outline extraction and curve flattening (fontTools port of glyph.js).

Unlike glyph.js (which gets its outline commands from opentype.js's
`font.getPath`, a y-down/canvas-style API that then negates y to recover
font units), fontTools glyph outlines are already expressed directly in the
font's native y-up coordinate system, so no y-flip is needed here.
"""
from __future__ import annotations

import io
import math
from pathlib import Path
from typing import Sequence

from fontTools.pens.basePen import BasePen
from fontTools.pens.recordingPen import DecomposingRecordingPen
from fontTools.ttLib import TTFont

Point = tuple[float, float]
Contour = list[Point]

DEFAULT_TOLERANCE = 0.01


def load_font(data) -> TTFont:
    """Load a font from a path, raw bytes, a file-like object, or an already
    loaded TTFont (returned unchanged). Environment-neutral like glyph.js's
    `loadFont`, minus the ArrayBuffer/Buffer distinction that doesn't apply
    in Python.
    """
    if isinstance(data, TTFont):
        return data
    if isinstance(data, (str, Path)):
        return TTFont(str(data))
    if isinstance(data, (bytes, bytearray)):
        return TTFont(io.BytesIO(bytes(data)))
    return TTFont(data)  # assume file-like


class _FlattenPen(BasePen):
    """Flattens quadratic/cubic segments to polylines.

    Segment count follows the same rule as glyph.js's `segs()`:
    `clamp(ceil(control-polygon length / maxSeg), 2, 64)`, where the
    control-polygon length is the sum of the distances between consecutive
    control points (p0-p1-p2[-p3]) of *that one* curve segment.

    Composite decomposition and the TrueType "implied on-curve point between
    two consecutive off-curve points" rule are both handled upstream of this
    pen (see `glyph_contours`): the former by `DecomposingRecordingPen`, the
    latter by `BasePen.qCurveTo` itself, which splits a run of off-curve
    points into simple `_qCurveToOne` calls at the implied on-curve
    midpoints before we ever see them -- so this pen only ever needs to
    flatten one simple quadratic or cubic segment at a time.
    """

    def __init__(self, glyph_set, max_seg: float):
        super().__init__(glyph_set)
        self._max_seg = max_seg
        self.contours: list[Contour] = []
        self._cur: Contour | None = None

    def _seg_count(self, pts: Sequence[Point]) -> int:
        length = sum(
            math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1])
            for i in range(len(pts) - 1)
        )
        return min(64, max(2, math.ceil(length / self._max_seg)))

    def _moveTo(self, pt: Point) -> None:
        self._cur = [pt]

    def _lineTo(self, pt: Point) -> None:
        assert self._cur is not None
        self._cur.append(pt)

    def _qCurveToOne(self, p1: Point, p2: Point) -> None:
        p0 = self._getCurrentPoint()
        assert self._cur is not None
        n = self._seg_count((p0, p1, p2))
        for i in range(1, n + 1):
            t = i / n
            s = 1 - t
            self._cur.append((
                s * s * p0[0] + 2 * s * t * p1[0] + t * t * p2[0],
                s * s * p0[1] + 2 * s * t * p1[1] + t * t * p2[1],
            ))

    def _curveToOne(self, p1: Point, p2: Point, p3: Point) -> None:
        p0 = self._getCurrentPoint()
        assert self._cur is not None
        n = self._seg_count((p0, p1, p2, p3))
        for i in range(1, n + 1):
            t = i / n
            s = 1 - t
            a, b, d, e = s * s * s, 3 * s * s * t, 3 * s * t * t, t * t * t
            self._cur.append((
                a * p0[0] + b * p1[0] + d * p2[0] + e * p3[0],
                a * p0[1] + b * p1[1] + d * p2[1] + e * p3[1],
            ))

    def _closePath(self) -> None:
        if self._cur is not None and len(self._cur) > 2:
            self.contours.append(self._cur)
        self._cur = None

    def _endPath(self) -> None:
        # Open paths are not expected in font outlines, but handle them the
        # same way glyph.js's trailing `if (cur?.length > 2)` check does.
        self._closePath()


def glyph_contours(font: TTFont, glyph_name: str, tolerance: float = DEFAULT_TOLERANCE) -> list[Contour]:
    """Flattened contours of one glyph (by glyph name), in font units, y up.
    Composite glyphs are decomposed into their component contours.
    """
    upm = font["head"].unitsPerEm
    max_seg = tolerance * upm
    glyph_set = font.getGlyphSet()
    if glyph_name not in glyph_set:
        return []
    rec = DecomposingRecordingPen(glyph_set)
    glyph_set[glyph_name].draw(rec)
    flat = _FlattenPen(glyph_set, max_seg)
    rec.replay(flat)
    return flat.contours


def text_contours(font: TTFont, text: str, tolerance: float = DEFAULT_TOLERANCE) -> list[Contour]:
    """Outline of `text` (one or more characters) as closed polygons in font
    units, y up. Curves are flattened so that segments are at most about
    `tolerance` em long (same rule as glyph.js's `textContours`).

    Note: characters are laid out left to right using only their advance
    widths (hmtx); kerning pairs (a `kern` table or GPOS kerning feature,
    which glyph.js applies via opentype.js's `kerning: true`) are *not*
    applied here. This has no effect on single-character text -- the common
    case for this project's silhouettes -- but multi-character words may be
    spaced very slightly differently than the JS core.

    @returns list of contours, each a list of (x, y) tuples.
    """
    cmap = font.getBestCmap()
    hmtx = font["hmtx"]
    contours: list[Contour] = []
    x = 0.0
    for ch in text:
        glyph_name = cmap.get(ord(ch))
        if glyph_name is None:
            raise ValueError(f"No glyph for character {ch!r} in this font")
        for contour in glyph_contours(font, glyph_name, tolerance):
            contours.append([(px + x, py) for px, py in contour])
        advance_width, _lsb = hmtx[glyph_name]
        x += advance_width
    return contours
