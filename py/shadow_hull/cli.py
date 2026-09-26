"""Command-line interface (port of src/cli.js).

    python -m shadow_hull GEB -o out.stl
"""
from __future__ import annotations

import argparse
import json as json_module
import sys
import time
from pathlib import Path

from .glyph import load_font
from .search import search
from .stl import to_binary_stl
from .triplet import build_triplet, silhouette, viewing_guide
from .views import VIEW_NAMES

# py/shadow_hull/cli.py -> py/shadow_hull -> py -> repo root -> fonts/...
DEFAULT_FONT = Path(__file__).resolve().parents[2] / "fonts" / "ArchivoBlack-Regular.ttf"


def _fmt(x: float) -> str:
    return f"{x * 100:.1f}%".rjust(6)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="python -m shadow_hull",
        description=(
            'Builds a trip-let: a solid whose shadows along three axes read as three texts. '
            'Pass three characters as one argument ("GEB"), or three arguments for words '
            "or empty strings ('' = no constraint on that view)."
        ),
    )
    parser.add_argument("texts", nargs="+", metavar="ABC | A B C")
    parser.add_argument("-o", "--out", metavar="FILE", help="write the best candidate as binary STL")
    parser.add_argument("-f", "--font", metavar="FILE", help="TTF/OTF font (default: Archivo Black)")
    parser.add_argument("-s", "--size", type=float, default=40, metavar="MM", help="cube edge length (default 40)")
    parser.add_argument("--fit", choices=["stretch", "contain"], default="stretch", help="stretch | contain (default stretch)")
    parser.add_argument("--transforms", choices=["upright", "any", "none"], default="upright", help="upright | any | none (default upright)")
    parser.add_argument("--no-permute", action="store_true", help="keep the given text-to-view order (front, right, top)")
    parser.add_argument("--allow-pieces", action="store_true", help="don't rank one-piece solids first")
    parser.add_argument("-n", "--top", type=int, default=5, metavar="N", help="candidates to list (default 5)")
    parser.add_argument("--json", action="store_true", help="print results as JSON")
    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)

    texts = list(args.texts[0]) if len(args.texts) == 1 else list(args.texts)
    if len(texts) != 3:
        parser.error(f"Need three texts, got {len(texts)}.")

    font = load_font(args.font or DEFAULT_FONT)
    t0 = time.perf_counter()
    ranked = search(
        font, texts, size=args.size, fit=args.fit, transforms=args.transforms,
        permute=not args.no_permute, prefer_connected=not args.allow_pieces,
    )
    ms = (time.perf_counter() - t0) * 1000
    top = ranked[: args.top]

    if args.json:
        candidates = [{**c, "guide": viewing_guide(c["assignment"], c["transforms"])} for c in top]
        print(json_module.dumps({"texts": texts, "tried": len(ranked), "ms": ms, "candidates": candidates}, indent=2))
    else:
        print(f"Tried {len(ranked)} candidates in {ms:.0f} ms. Coverage = share of each letter the shadow actually shows.\n")
        print("  #  " + "".join(v.ljust(16) for v in VIEW_NAMES) + "worst  pieces")
        for i, c in enumerate(top):
            g = viewing_guide(c["assignment"], c["transforms"])
            cells = []
            for v in VIEW_NAMES:
                r = f"↺{g[v]['rotation']}" if g[v]["rotation"] else ""
                cell = f"{g[v]['text']!r} {_fmt(c['metrics']['views'][v]['coverage'])} {r}"
                cells.append(cell.ljust(16))
            print(f"{i + 1:>3}  " + "".join(cells) + f"{_fmt(c['metrics']['minCoverage'])}  {c['metrics']['pieces']}")
        g = viewing_guide(top[0]["assignment"], top[0]["transforms"])
        best_line = ", ".join(
            f"{g[v]['text']!r} seen from {g[v]['from']}" + (f" (rotated {g[v]['rotation']}° CCW)" if g[v]["rotation"] else "")
            for v in VIEW_NAMES
        )
        print(f"\nBest: {best_line}")
        bad = [v for v in VIEW_NAMES if top[0]["metrics"]["views"][v]["outside"] > 1e-6 * args.size * args.size]
        if bad:
            print(f"WARNING: shadow extends outside target in {', '.join(bad)} (orientation bug?)", file=sys.stderr)

    if args.out:
        best = top[0]
        shapes = {v: silhouette(font, best["assignment"][v], size=args.size, fit=args.fit) for v in VIEW_NAMES}
        solid = build_triplet(shapes, best["transforms"], size=args.size)
        Path(args.out).write_bytes(to_binary_stl(solid))
        if not args.json:
            print(f"Wrote {args.out} ({solid.num_tri()} triangles)")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
