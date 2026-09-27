# Backlog

Ideas and requests not yet started, newest first. Move items to CHANGELOG.md
when done. Owner requests are marked (owner).

## Ideas from TextTango (Lucandia/dual_letter_illusion; GPL, so reimplement)
- **Display stand**: a rounded base along the chain (convex hull of the cell
  footprints, offset with round joins), with the object turned 45° so both
  words face the front. Reads as a finished object, unlike the staircase plate.
- **Any Google Font on demand** in the web page: fetch the TTF by family name
  (google/fonts raw files) instead of vendoring the catalog (they ship 1.9 GB).
- Quick-insert buttons for symbols (♥ ⭐ ♪ …) next to the top-shape field.
- Manual reinforcement override per letter pair (pillar / rod), alongside the
  automatic joining.
- STEP export (exact B-rep) via opencascade.js or the Python port + build123d.

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
