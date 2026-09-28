# Backlog

Ideas and requests not yet started, newest first. Move items to CHANGELOG.md
when done. Owner requests are marked (owner).

## Letterform tidying (owner; see resources/research/letterform-tidy.md)
- Settle the strain limit and the counter/S-terminal cases from the review page.
- Tidy the other looks (tower stacked/tall, block).
- Later: tweak both letters towards a compromise shape.
- Tune tidyPair's weights from the owner's marks on the review page.
- Font search: score a word pair against many fonts (or font pairings, now
  that each word can have its own font) with the column sliver measure.

## Ideas from TextTango (Lucandia/dual_letter_illusion; GPL, so reimplement)
- Quick-insert buttons for symbols (♥ ⭐ ♪ …) next to the top-shape field.
- Manual reinforcement override per letter pair (pillar / rod), alongside the
  automatic joining.
- STEP export (exact B-rep) via opencascade.js or the Python port + build123d.

## Support rods
- L-shaped rods (two straight legs) for pieces that sit diagonally to each
  other, as in pairs in a row, which still get a diagonal rod.
- A rod thickness choice (e.g. 0.6 mm placeholder vs a sturdier printable rod).

## Layouts and shapes
- Other view angles for *chain* layouts and grids (blocks have them now):
  cells' boxes become parallelograms; hull join and the 2D scoring carry over.
- Top shapes on angled blocks (fit the shape to the parallelogram footprint).
- Third-axis shapes on *chain* layouts (block layouts have them now): the
  chain's footprint is a diagonal staircase, so a top shape needs hull blocks
  to fill it.
- The chain/"jumbled" arrangements stay: they're compelling (owner).

## Rendering
- Export coloured models (3MF with per-face colours) for multi-colour printing.

## Earlier plan (synthesis, 2026-09-26)
- Band-wise vertical warp (baseline / x-height / cap / ascender / descender)
  with |log s| penalty weighted by horizontal strokes.
- Legibility score: junction-weighted coverage; OCR/classifier later.
- Variable-font axes (Roboto Flex) as a deformation space.
- Web: move long galleries to a pool of workers (sections in parallel).
- Web: shorter share links (chain recipes carry the whole layout; could be
  compressed, or referenced by index into a deterministic gallery).
- Ranking of trip-let candidates by the voxel thin-feature check (top few).
