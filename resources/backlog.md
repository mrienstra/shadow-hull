# Backlog

Ideas and requests not yet started, newest first. Move items to CHANGELOG.md
when done. Owner requests are marked (owner).

## Layouts and shapes
- Column variant: when words differ in length, let one letter of the shorter
  word span two rows (tall letter) instead of doubling up letters of the longer one.
- (owner) **More "normal" layouts**: explore single-row only, with different
  relative view angles (non-orthogonal; any two vertical views still share z,
  so the interval arithmetic carries over; see brief-2026-09-26-synthesis.md).
- (owner) **Third axis as a shape**: e.g. a heart for the top view: a Unicode
  glyph (♥ U+2665 in a font that has it) or an emoji outline (silhouette only).
  Needs the word-pair chain to get a top constraint, or a trip-let with a shape.
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
