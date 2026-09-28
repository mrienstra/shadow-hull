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

## Proposed direction (not started)

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
- Suggested order: measures (and validate the proxy) → scores on the review
  page → tidy as a trade-off search. Font per axis is independent.

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
