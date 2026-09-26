"""Mirrors test/parity.test.js: checks this Python port against the shared
reference fixture test/fixtures/parity.json (generated from the JS core by
scripts/make-fixtures.js). If this fails after an intentional change to the
JS core's geometry conventions, regenerate the fixture and re-check --
do not loosen the tolerances here to make a real mismatch pass.
"""
from __future__ import annotations

import json
from pathlib import Path

import pytest

from shadow_hull import VIEW_NAMES, build_triplet, measure, search, silhouette

FX_PATH = Path(__file__).resolve().parents[2] / "test" / "fixtures" / "parity.json"
FX = json.loads(FX_PATH.read_text())

OPTS = {"size": FX["size"], "fit": FX["fit"]}
TOL = FX["tolerance"]


def close_rel(a: float, b: float, rel: float, msg: str = "") -> None:
    assert abs(a - b) <= rel * abs(b), f"{msg}: {a} vs {b}"


@pytest.mark.parametrize(
    "ch,want",
    list(FX["silhouettes"].items()),
    ids=[repr(k) for k in FX["silhouettes"]],
)
def test_silhouette_area(font, ch, want):
    s = silhouette(font, ch, **OPTS)
    close_rel(s.area(), want["area"], TOL["area_rel"], f"area of {ch!r}")


@pytest.mark.parametrize(
    "case",
    FX["fixed"],
    ids=[f"{c['texts']}_{c['transforms']}" for c in FX["fixed"]],
)
def test_fixed_case(font, case):
    shapes = {v: silhouette(font, case["texts"][v], **OPTS) for v in VIEW_NAMES}
    solid = build_triplet(shapes, case["transforms"], size=OPTS["size"])
    m = measure(solid, shapes, case["transforms"])
    for v in VIEW_NAMES:
        assert abs(m["views"][v]["coverage"] - case["coverage"][v]) <= TOL["coverage_abs"], (
            f"{v} coverage {m['views'][v]['coverage']} vs {case['coverage'][v]}"
        )
    assert m["pieces"] == case["pieces"]
    close_rel(m["volume"], case["volume"], TOL["volume_rel"], "volume")


@pytest.mark.parametrize(
    "s",
    FX["searches"],
    ids=["".join(s["texts"]) for s in FX["searches"]],
)
def test_search(font, s):
    ranked = search(font, s["texts"], size=OPTS["size"], fit=OPTS["fit"], **s.get("opts", {}))
    assert len(ranked) == s["candidates"]
    assert ranked[0]["metrics"]["pieces"] == s["best"]["pieces"]
    assert abs(ranked[0]["metrics"]["minCoverage"] - s["best"]["minCoverage"]) <= TOL["coverage_abs"]
