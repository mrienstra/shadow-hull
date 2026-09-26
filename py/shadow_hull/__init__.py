"""shadow_hull: generate trip-lets (GEB-cover solids) -- Python port of the
JS core in src/core/ (glyph.js, views.js, triplet.js, search.js, stl.js).
"""
from .glyph import glyph_contours, load_font, text_contours
from .search import compare_candidates, search
from .stl import to_binary_stl
from .triplet import build_triplet, measure, silhouette, viewing_guide
from .views import (
    VIEW_NAMES,
    VIEWS,
    d4,
    d4_mat,
    how_to_view,
    local_to_world,
    transform_choices,
    world_to_local,
)

__all__ = [
    "load_font",
    "text_contours",
    "glyph_contours",
    "VIEWS",
    "VIEW_NAMES",
    "d4",
    "d4_mat",
    "how_to_view",
    "transform_choices",
    "local_to_world",
    "world_to_local",
    "silhouette",
    "build_triplet",
    "measure",
    "viewing_guide",
    "search",
    "compare_candidates",
    "to_binary_stl",
]
