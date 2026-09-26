# Changelog

## 2026-09-26 (JS core)

- `src/core/`: glyph outlines (opentype.js, curves flattened), view frames and
  D4 transforms, build (Manifold intersection of three centred, overshooting
  prisms), measure (coverage / missing / outside per view via `project()`,
  plus piece count), search (text-to-view permutations × transforms; ranked
  one-piece first, then worst-letter coverage). Binary STL export.
- `src/cli.js`: `shadow-hull GEB -o geb.stl`. Default font is Archivo Black (OFL, bundled).
- Tests (10): orientation checked with an "F" against hand-written viewer
  frames, and a deliberate mirror of the front frame is caught (mutation-checked);
  no shadow ever falls outside its target across transforms; GEB reaches 100%.
- Results: GEB 100% on all letters, one piece (96 candidates, ~3 s). AMY's
  worst letter is M at 94.8% (the unsearched Arial probe gave 62%).
- Known inefficiency: `--transforms any` tries 3072 combos (~17 s for AMY),
  many equivalent under cube rotations; dedupe later.
- No subagents used for this step.

## 2026-09-26

- Added `CLAUDE.md` (project summary, layout, working rules).
- Research: tested three stacks hands-on (manifold3d Python, build123d,
  manifold-3d JS). Results are in `resources/research/approaches.md`, probe
  scripts in `resources/research/probes/`, prior art and facts in
  `resources/research/prior-art.md`. Key finding: with Manifold, booleans
  aren't the problem. Shadow consistency and floating pieces are, and
  `project()` lets us measure both.
- Subagent ledger: one Sonnet web-research agent (prior art, OpenSCAD status,
  Mitra & Pauly, the 1979 SciAm attribution). **Earned its cost**: it found
  Lyl3 and ondras/3, which I hadn't known about, and confirmed the Gardner
  correction, while I ran the local probes in parallel. I re-checked its repo claims
  (2CATteam, ondras/3) with `gh api`. Its "trip-let page numbers" and
  follow-up-code claims are still unverified and marked that way.
