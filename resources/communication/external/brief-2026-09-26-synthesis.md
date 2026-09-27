# Synthesis of responses to brief-2026-09-26

Three responses: `-cf51`, `-pk3`, `-pz53`. This note covers where they
agree, where they're wrong, what we checked ourselves, and what to do next.
Internal note, not for sending.

## Agreement (all three unless noted)

1. **The full-word hull H is the key object.** Extrude the whole front word
   and the whole side word and intersect: H contains *every* solid whose
   shadows stay inside the letters. So:
   - H gives the best possible coverage (an upper bound for any layout).
   - A zero-shadow ("hidden") connector between two pieces exists iff they lie
     in the same component of H.
   - The diagonal chain keeps only the diagonal blocks of H. Off-diagonal
     blocks are free material: they add no shadow (cf51).
   - H's components are computable by a z-sweep over interval products
     (union-find), the same maths as our cell coverage. `scan.js` already does
     this per cell.
2. **Connectivity belongs in the search,** not in a repair pass afterwards: a
   hard filter (H connected) plus a DP term for neighbouring cells.
3. **Deformations, safest first:** designer-sanctioned changes (variable-font
   axes such as Roboto Flex's YTAS/YTDE/YTLC/XTRA; alternates, small caps,
   weights, condensed cuts); then vertical-only, band-wise warps (move
   x-height, ascenders, descenders); ARAP last or never. cf51: vertical dynamic
   time warping of ink-by-height profiles, with slope 1 inside horizontal-stroke
   bands.
4. **Legibility measurement:** score the rendered shadow with OCR or a small
   letter classifier (all three). Weight coverage by skeleton junctions and
   mid-strokes (pz53). Make the stretch penalty |log s|, weighted by how much
   of the letter is horizontal strokes (cf51). Perimetric complexity as a
   proxy (pz53).
5. **Ranking:** make pieces, thickness and slivers hard constraints, then rank
   by legibility, then compactness. Keep the Pareto front and add a few weight
   sliders.
6. **Search at scale:** precompute pair/cell tables per font. Use CP-SAT/ILP for
   block selection with connectivity constraints, beam search as a fallback,
   annealing only for continuous polish, and skip learned heuristics.
7. **Non-orthogonal views:** any two *vertical* views still share z, so the
   interval arithmetic survives (slices become parallelograms). Three words
   read from around the object at 120° (pz53; cf51 says the same) keep that
   structure; a *top* word breaks it.

## Individual ideas worth keeping

- Half-hidden connectors at crossbar or baseline height that read as ligatures
  (cf51); the base plate is the extreme case.
- Unequal rows: the shorter word in one tall row, the longer in two (cf51).
- Design the top-view footprint as a nameable shape (cf51).
- "Typographic discipline" pass: one shared x-height, optical spacing
  (equalise inter-letter white areas), shared stem columns across cells, aligned
  motifs (pk3).
- Closed rings, serpentine rows, and row interlock that uses descender space
  (pz53).
- Use H with eroded silhouettes as a quick per-font feasibility screen (pk3).
- Per-letter case mixing reads as jumbled unless it follows a rule (pz53).
- Very heavy faces can close counters and hurt recognition (pz53, citing
  ergonomics research). Worth a check.
- Pathfind connectors in the *eroded* hull so that thickened rods stay hidden
  (cf51, pk3).

## Corrections: things the responses got wrong

- **pz53, i-dot:** "a vertical column is available iff some z-interval has
  partner ink…". A connector from dot to stem would project onto the gap
  between them in the front view, so it's visible. cf51 is right: an island
  in a shadow is a 3D island. Hidden joining needs the *shadows* to connect.
  Our measurements agree (below).
- **pz53, "every face of the hull is a vertical plane":** wrong. Faces contain
  the (horizontal) extrusion direction but follow the glyph outline, so
  diagonal strokes give slanted faces and the undersides of arms give
  horizontal ones. Overhangs come from the letterforms, even for two words.
- **pk3, "exact 3-way alignment is NP-hard, don't build a cubic DP":** the
  NP-hardness result is for an unbounded number of sequences. Three words give
  an O(n³) DP, trivial for names (cf51 says so).
- **pk3, citations:** some links look attached to the wrong claims. The
  dl.acm DOI 10.1109/34.273735 appears to be Laurentini's visual-hull paper,
  cited next to ARAP; the roboto-delta repo is cited for "ARAP pitfalls". Treat
  all citations in the responses as unverified until checked.

## A valid critique of our own work

- **pk3, thickness check:** we detect necks that *split* the solid, or parts
  that vanish, under erosion. A thin appendage (a fin or spike attached to the
  body) disappears under erosion without changing the piece count, so it
  passes. The brief's phrase "minimum-wall-thickness check" overclaimed. The
  fix is to compare with the opening, S vs (S ⊖ B) ⊕ B, in 3D on finalists.

## What we checked (2026-09-26, Finola × Bryan, Kanit Black, gap −0.2 × H)

| Case | Chain | Full hull H | Chain pieces in one H component? |
|---|---|---|---|
| upper | 100%, 3 pieces | 100% / 100%, 4 pieces, 4.0× volume | no (components 0, 1, 3) |
| lower | 100%, 2 pieces | 100% / 100%, 1 piece, 3.4× | **yes: hidden connector exists** |
| title | 93.3%, 2 pieces | 100% / 100% (i-dot shows), 2 pieces | no |
| mixed | 100%, 2 pieces | 100% / 100%, 2 pieces | no |

This confirms that H is an upper bound on coverage (title case recovers the
i-dot) and that hidden connection fails exactly when a word's shadow has more
than one component (upper, title and mixed have 2 in the front view).

## Proposed next steps (ranked)

1. **Hull-aware joining:** compute H and its components by z-sweep; add
   off-diagonal blocks, or paths inside eroded H, as zero-shadow connectors; use
   rods only across H components. Pair this with a "letters touch" objective
   (tracking inside words) so that each word's shadow is one piece.
2. **Opening-based thin-feature check** for finalists (correctness).
3. **Better stretch:** band-wise vertical warp (baseline, x-height, cap,
   ascender, descender), with a |log s| penalty weighted by horizontal strokes.
4. **Legibility score:** junction-weighted coverage first (cheap, geometric);
   an OCR/classifier score later.
5. **Deformation via variable fonts** (e.g. Roboto Flex): needs variable-font
   instancing. It's unclear whether opentype.js supports it; fontTools'
   instancer can bake static instances.
6. Search at scale and new layouts (120° three-word, rings, block selection
   via ILP) once the above is in place.
