# Changelog

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
