# Backlog

Ideas and requests not yet started, newest first. Move items to CHANGELOG.md
when done. Owner requests are marked (owner).

## Layouts and shapes
- Other view angles for *chain* layouts and grids (blocks have them now):
  cells' boxes become parallelograms; hull join and the 2D scoring carry over.
- Top shapes on angled blocks (fit the shape to the parallelogram footprint).
- Third-axis shapes on *chain* layouts (block layouts have them now): the
  chain's footprint is a diagonal staircase, so a top shape needs hull blocks
  to fill it.
- The chain/"jumbled" arrangements stay: they're compelling (owner).

## Rendering
- (owner, no rush) **Colour faces by the axis that clipped them** (which
  view's prism a face lies on). Manifold keeps per-triangle `originalID`/run
  info through booleans; tag each prism, then colour by run in three.js.

## Earlier plan (synthesis, 2026-09-26)
- Band-wise vertical warp (baseline / x-height / cap / ascender / descender)
  with |log s| penalty weighted by horizontal strokes.
- Legibility score: junction-weighted coverage; OCR/classifier later.
- Variable-font axes (Roboto Flex) as a deformation space.
- Web page: word-pair mode using `designWordPair` (core), families as options.
- Ranking of trip-let candidates by the voxel thin-feature check (top few).
