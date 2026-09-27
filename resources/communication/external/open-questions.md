# Open questions for outside review

A running list of "juicy" questions to put to other frontier models. Add to it
as questions come up. When there's a good set, tidy it into a short
self-contained brief (context, what we've tried, what we measured, the
question) for the owner to send out. Replies go in this folder too.

Context for any brief: we generate solids whose orthogonal shadows spell
letters or words (GEB-cover "trip-lets", visual hulls). The JS core uses
manifold-3d, and each solid is an intersection of extruded glyph prisms. We
measure each shadow against its target (coverage, pieces, minimum-thickness
survival). See `CLAUDE.md` and `resources/research/`.

## Search / optimisation

1. **Word pairs as sequence alignment.** Two views share only the vertical
   axis, so each cell's coverage is local. We plan to segment both words into
   aligned chunks with dynamic programming over cached cell scores (max-min
   coverage, pairwise terms for neighbour overlap and connectivity). Is there
   a better formulation? How do we fold in row splits (stacking) and grids
   without enumerating everything?
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
   Options: a base plate (it adds a bar under both words' shadows), thin
   connectors hidden inside both shadows, a per-pair overlap chosen to
   guarantee contact, or making connectivity a search objective. What do
   makers and the literature do, and which keeps both readings cleanest?
