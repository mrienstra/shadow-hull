# Tidying letterforms so pairs meet cleanly (2026-09-27)

Where two letters of a pair have features at *nearly* the same height, the
intersected solid gets thin slivers and sharp wedges that catch the eye. We can
nudge one letter's strokes up or down (a small piecewise-linear vertical warp)
so the features meet exactly. This note records what was tried, what the owner
liked, and what's still open, so the work can resume in any session.

## Goal (owner's framing)

Reduce **knife/sliver shapes** (they catch the eye, literally stick out, break
easily and are hard to make) and, to a lesser extent and only if cheap,
**shallow cuts**: both are "it almost lines up but not quite". A crude target
could blend smoothness and reduced poly count. On the other side, keep
letterforms reasonably nice: mostly **preserve stroke thickness** (it could go
much deeper). Sometimes switching fonts is easier, but "all fonts" is a huge
search space. Eventually: **one font per axis** (e.g. cursive one way, block
the other).

## Proposed direction

- The solid is the front letter's shape × the side letter's shape, so its
  feature edges sit at the two letters' feature heights (level edges and
  corners). A near-miss between two such heights is a thin layer: a knife if it
  protrudes, a shallow cut if it's a notch.
- **Ground-truth measure:** thin material in the built solid (e.g. volume
  thinner than ~0.8 mm; `voxel.js` has a thin-feature check).
- **Cheap proxy (1D, no geometry):** near-miss pairs of feature heights,
  weighted by the width of the layer and by knife vs cut; plus the number of
  distinct feature heights as a "fewer polygons, smoother" term. Validate the
  proxy against the ground truth on the review set.
- **Letterform cost:** per band, |log(new/old)| weighted heavily for strokes
  and lightly for gaps and counters (generalises strain).
- **Search:** per pair, candidate nudges (arm to corner, stroke to level, both
  letters meeting halfway) minimising knife/cut cost + λ × letterform cost.
  Arm to corner becomes one move type among several.
- **Fonts:** the proxy needs only per-letter feature heights and band
  thicknesses, so they can be precomputed for many fonts (e.g. a few hundred
  Google Fonts) and a word pair scored against all of them in seconds;
  build solids only for the best few. Also scores font *pairings* for one font
  per axis.
- **One font per axis:** layout already handles the two words separately;
  mostly plumbing two fonts through (recipes, UI, share links).
- Order taken: measures → scores + interactive 3D on the review page → tidy
  as a trade-off search (all done 2026-09-27/28) → font per axis.

## Measures (stage 1, done)

`src/core/slivers.js`, checked by `scripts/validate-slivers.mjs` (200 random
cells) and `scripts/validate-slivers-moves.mjs` (268 tidy moves, 3 fonts),
t = 0.8 mm:

- **Column measure** (`columnSlivers`): along each vertical line the cell is
  A's column ∩ B's column; runs of material shorter than t = knife, short air
  runs between material = cut (mm³). ~10 ms per cell. Exact for *vertical*
  slivers (the only kind a vertical warp can fix); it also counts acute
  horizontal wedges, which are knife-like.
- **Voxel ground truth** (`thinFeatures`, new `gaps` option for thin air):
  ~1–2 s per solid. Its depth filter (residue ≥ r deep, tuned for
  printability) ignores small knives: on tidy moves it reports 0 → 0 where the
  column measure sees 1–3 mm³, so they agree on the direction of change in
  only 45% of moves, nearly all of the rest being "voxel sees nothing".
  Across random cells, rank correlation for thin material is 0.58 (voxel also
  sees sideways-thin strokes, e.g. X and S diagonals, that columns can't).
  Thin air (cuts) is rarely found by voxel, so no useful comparison.
- **Feature-height proxy** (`featureNearMisses`): weak (rank corr. ~0.2):
  a near-miss only matters where the two features overlap in x/y, which
  heights alone don't know. Not needed: the column measure is cheap enough
  even for font search (~5 cells × 300 fonts ≈ 15 s).
- **Decision:** the column measure is the cost; voxel stays an occasional
  printability check.
- **Finding:** by the column measure, 86 of 268 arm-to-corner moves make
  slivers *worse* (a move meets one corner but creates another near-miss) →
  the trade-off search should only accept moves that reduce the cost.

## Trade-off search (stage 3, done)

`tidyPair` (src/core/tidy.js; letter features and warps moved there from
wordpair.js, re-exported): candidates shift one band (stroke or gap, not
touching top/bottom) of either letter so an edge meets the other letter's
level edge or corner (as drawn), within 3 mm; cost = knife + 0.3·cut
(column measure, 0.2 mm grid) + 3·Σ|log| stretch of the two neighbouring
bands; kept only if it lowers the cost and removes ≥ 0.2 mm³; strain ≤ 30%.
~2 ms per pair. Over all 676 pairs it tidies 122 (Bungee), 170 (Kanit),
160 (Archivo Black), mostly stroke → level edge (the near-miss case the
halfway warp handled badly). It reproduces the owner's F×B change on its own.
FINOLA × BRYAN (Bungee): F/B −0.37 mm (knife 0.69 → 0), L/A −0.35 mm (the
L's foot to the A's crossbar, knife 6.6 → 0), A/N −0.21 mm (small gain).

The app's knob ("Tidy slivers", on by default for row, rows, grid; recipe
`tidy: 'pair'`) uses it; share links from the arm-to-corner day keep
`corners` → alignCorners. The review page now shows tidyPair's changes with
scores. Weights (λ = 3, cut 0.3, minGain 0.2, strain 30%) are first guesses
for the owner's review to tune.

## Starting case (owner)

FINOLA × BRYAN, pairs in a row, Bungee (the default font). In the F/B pair, the
notch where the B's two bowls meet is 0.37 mm below the top of the F's middle
arm, so the arm's top face ends in a thin wedge against the B's flaring bowl.
The owner suggested lowering the F's middle arm slightly.

Pitfall met on the way: measure with the font the page uses (Bungee). In Kanit
the same notch is 2.6 mm from the arm top, which led to a wrong first diagnosis.

## Tried

1. **Halfway level matching** (`alignLevels`, `opts.levels`): flat edges and
   curve tops/bottoms of the two letters within 0.6 mm meet halfway, by a warp
   that keeps the letter's other level heights fixed. Removed the 0.45 mm
   layers (F arm top vs B counter bottom), but it moves the *space between*
   strokes: the F's gap between arms rose, the top arm got thinner and the
   middle arm thicker. **Owner: disliked.** Code kept, not used by the UI.
2. **Arm to corner** (`alignCorners`, `opts.corners`, knob `tidy` on row, rows
   and grid): a pointed corner of one letter (`cornerHeights`: turns ≥ 50°
   within 0.15 mm, and no level stretch within 0.8 mm along the outline) inside
   a band of the other letter (between two level heights, not touching top or
   bottom) → that band shifts, keeping its thickness, so its nearer edge meets
   the corner. **Owner: liked it for F/B** (F's arm ↓ 0.37 mm; the wedge is gone).

## Rules settled with the owner

- Change **one letter per pair**, with the corner taken from the other letter
  as drawn (an early version moved both, measured the second corner on the
  already-moved letter, and the review page's corner lines didn't match).
  Tweaking both letters towards a compromise may look best long term, but
  evaluating changes needs one change per card.
- **Same-letter pairs** are never tweaked.
- Millimetres moved is the wrong size measure. **Strain** = move ÷ the smaller
  band beside the stroke (how much the gaps either side change). F/B = 13%.
  The app uses a provisional cap of 15% (`layoutCells`); the review page shows
  every change up to 70% with a slider.

## Open (owner to judge on the review page)

- Which strain limit looks acceptable (owner's first instinct: anything over
  ~1.5 mm is too much in Bungee; e.g. B ← X, 1.65 mm, gave "a pretty wonky B").
- Moves where the "band" is a counter (O ← K, Q ← K, C ← B): probably never.
- Corners from S terminals / Sigmar One's many sharp cuts.
- Interactive 3D on the review page (owner request): load three.js from
  cdnjs and ship the before/after meshes as data (or as published files).
- Still unhandled: level edges within 0.6 mm in about two thirds of pairs
  (e.g. F's arm top vs B's upper counter bottom). A variant of (1) that shifts
  whole strokes instead of the gaps between them may suit these.
- Other looks: tower (stacked/tall), block and span columns build cells
  elsewhere (column.js, block.js) and don't tidy yet.

## Review page

`node scripts/letterform-review/build.mjs <outDir>` → `pack.json` (every
capital pair × every bundled font), `sheets/<font>.webp` (3D before/after,
rendered in headless Chrome, 4 moves per row, 240 px tiles) and
`arm-to-corner.html`. Published (private) as
https://claude.ai/artifact/K7wrwWKLroYLywNZA8amSi with the `db` capability:
marks are saved in collection `marks`, one doc per card
(`<font>_<moved><corner>_<by>`, `{ v: good | bad | unsure }`). The pack
calls `alignCorners` without the app's 15% cap.
