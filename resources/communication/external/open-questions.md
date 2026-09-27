# Open questions for outside review

A running list of "juicy" questions to put to other frontier models. Add to it
as questions come up. When there's a good set, tidy it into a short
self-contained brief (context, what we've tried, what we measured, the
question) for the owner to send out. Replies go in this folder too.

Briefs: `brief-2026-09-26.md` (drafted; covers 2–6 below, plus search at
scale for three words).

Context for any brief: we generate solids whose orthogonal shadows spell
letters or words (GEB-cover "trip-lets", visual hulls). The JS core uses
manifold-3d, and each solid is an intersection of extruded glyph prisms. We
measure each shadow against its target (coverage, pieces, minimum-thickness
survival). See `CLAUDE.md` and `resources/research/`.

## Search / optimisation

1. ~~**Word pairs as sequence alignment.**~~ Done: DP over chunk pairings
   with a Pareto front (`wordpair.js`); row splits are enumerated outside it.
   Still open: grids and three-word search (brief Q6).
2. **Multi-objective ranking.** Coverage, letter distortion (stretching),
   connectivity/printability and compactness pull against each other. Is a
   Pareto front the right way to present results, and what are good default
   weightings or distortion measures for letter legibility?

## Geometry / legibility

3. **Fixing inconsistent silhouettes.** Mitra & Pauly (2009) deform the input
   images (as-rigid-as-possible) until the shadows agree. For letters, what
   deformations keep legibility best: stem-preserving stretch, x-height
   changes, moving ascenders and descenders, swapping in alternate glyphs?
4. **Non-orthogonal views** (e.g. 45° apart). What changes in the theory:
   shared-axis reasoning, symmetry reduction, printability? Any known results
   on the best view angles for 2 or 3 words?

## Creative layouts

5. Beyond chains, stacks and grids, what other ways are there to marry two
   words of different lengths (e.g. Finola & Bryan)? Ideas so far: case
   mixing per letter (`fiNoLa`), per-letter width and height stretch,
   negative letter spacing (overlaps), splitting letters into strokes and
   pairing the strokes (2CATteam), stacking rows, grids.

## Connectivity

6. **Joining word-pair cells into one printable piece.** Neighbouring cells in
   a diagonal chain only touch where both letters have ink in the overlap
   corner, so layouts come out in 2–5 pieces even with overlapping cells.
   Tried: a base plate (7–12% extra shadow; doesn't reach stacked rows) and
   rods along a minimum spanning tree of closest points (always one piece,
   ≤3% extra shadow, rods ≤8 mm). Open: can connectors hide entirely *inside*
   both shadows (a rod whose projections fall within ink in both views), and
   should connectivity steer the layout search itself?
