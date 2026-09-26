# Approaches: hands-on probe results (2026-09-26)

All three stacks below were installed and run on this machine. The probe scripts
are in `probes/` (these are throwaway code, not the product).

## Python: manifold3d + fontTools (most promising non-web option)

- `pip install manifold3d fonttools numpy` (tested with Python 3.12 in a uv venv).
- Glyph outlines come from fontTools (`DecomposingRecordingPen`), with curves
  flattened to polygons, then `CrossSection(polys, FillRule.NonZero)`. Nonzero
  fill handles the glyph holes (counters) correctly.
- Build: extrude each glyph (overshooting the cube), place it with an explicit
  3x4 basis matrix, then `Manifold.batch_boolean(parts, OpType.Intersect)`.
  Time: GEB in Arial Bold took about 20 ms (3.6k triangles). Simple letters take about 2 ms.
- **Verification is built in:** `M.transform(inverse_basis).project()` returns
  the actual shadow as a `CrossSection`. Comparing it with the target gives:
  - `(shadow - target).area()` should be 0; anything else means orientation or
    placement is wrong. This caught a mirrored view on the first try.
  - `(target - shadow).area()` is the part of the letter that is **missing**
    because the three letters conflict.
- **Orientation:** use explicit (U, V, D) bases (glyph-x → U, glyph-y → V,
  extrude → D, with U × V = D), not chained Euler rotations. Build and verify
  from the same table so they cannot drift apart.
- `genus()` < 0 means the solid is in several pieces (roughly 1 − genus
  pieces, e.g. XYZ gives −4, about 5 pieces). This is a cheap check for
  floating parts.

Coverage per letter (Arial Bold, each glyph stretched to fill the square):

| Word | X | Y | Z | Notes |
|---|---|---|---|---|
| GEB | G 0.990 | E 0.992 | B 0.988 | good |
| XYZ | X 0.917 | Y 1.000 | Z 0.824 | ~5 disconnected pieces |
| AMY | A 0.906 | M **0.621** | Y 0.863 | M loses a lot |

With *uniform* scaling instead (letters not sharing heights/widths), coverage
was much worse (B 0.82 in GEB). **Each pair of views shares an axis, so the
letters must share extents along it.** Stretching to fill the square is the
simplest way to guarantee that; a better way may be to fit cap height or
use a monospaced/block font.

## Python: build123d (exact B-rep, STEP export)

- `pip install build123d` (0.13.0; installed without trouble on Python 3.12).
- It has a built-in `Text(ch, font_size, font_path, align=...)`, so no glyph
  code is needed. `extrude(..., both=True)` plus `&` for intersection.
- GEB: valid solid, 1 solid, 0.93 s (about 50 times slower than Manifold, still fine).
  Exports STEP directly. `is_valid` is a property, not a method.
- Good for CAD or fabrication output. Not yet checked: projecting to verify
  shadows (Manifold's `project()` is simpler; you could tessellate and hand
  the mesh to Manifold for the check).

## JS/web: manifold-3d (npm) + opentype.js

- manifold-3d 3.5.4 and opentype.js 2.0.0. It is ESM only (`import Module from
  'manifold-3d'`, then `await Module(); w.setup()`); `require` fails.
- Instances have `intersect`, `transform`, `project`, `slice`, `getMesh`,
  `status`, `genus`, and `volume`, the same shape as the Python API, so the
  build-and-verify loop ports directly. `CrossSection.ofPolygons` takes glyph
  polygons; opentype.js `path.commands` would need the same curve flattening.
- Runs in Node as well as the browser, so one core could serve a CLI and a
  web page.

## OpenSCAD

- No stable release since 2021.01. Manifold is the default only in
  snapshots: `brew install --cask openscad@snapshot` (2026.09.23 as of this
  note), with CLI flag `--backend=manifold`. Not installed here yet.
- Good for quick hand-built models or matching Lyl3's customizer. It can't
  easily measure shadow coverage itself.

## Takeaways so far

1. Booleans are **not** the hard part with Manifold: it gave zero failures and
   runs in milliseconds. The hard parts are **consistency** (missing shadow
   area) and **connectivity** (floating pieces).
2. So the core of a good tool is: build → project → measure → search. Search
   over axis permutations (6), glyph flips, scaling/fit choices, fonts, and
   perhaps glyph adjustments (Mitra & Pauly deform the images).
3. Candidate architecture: a manifold-3d JS core (Node CLI + browser), or a
   Python manifold3d core with build123d for STEP export.

## Font matters a lot (measured 2026-09-26, JS core, 40 mm cube, best of search)

| Font | GEB | AMY | XYZ | KWS | survives 1 mm min thickness? |
|---|---|---|---|---|---|
| Archivo Black | 100% · 1 pc | 94.8% · 1 | 98.3% · 1 | 97.2% · 1 | yes, all four |
| Arial (regular) | 99.9% · 1 | 52.5% · 4 | 77.9% · 5 | 73.7% · 1 | no (necks < 0.5 mm) |
| Times New Roman | 91.3% · 1 | 62.5% · 8 | 80.9% · 6 | 87.0% · 9 | no |

Cells show worst-letter coverage and number of pieces. Heavy, blocky faces work much better. Thin or serif
faces lose coverage, break into pieces, and leave thin necks.

Also: Archivo Black's diagonal letters (A, M, V, W, X, Y) are drawn slightly
asymmetric on purpose (e.g. M stems are 203 vs 219 units wide). Mirroring one
of them changes the result a little, so the search doesn't treat it as a
symmetry.
