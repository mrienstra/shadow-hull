# Changelog

## 2026-09-28 (one font per axis)

- Owner request: in two-word looks the side word can have its own font, e.g.
  a script one way and a block face the other. Core: `fontB` (options, and
  `ctx.fontB` for recipes and looks) threaded through layout, cell scoring,
  search, grid, block and both towers; default = the front font, and then
  every result is byte-identical to before (checked on 20 designs × 2 fonts:
  recipes, metrics and volumes).
- Rule for the vertical frame with two fonts: both fonts are lined up on
  baseline and cap height (each scaled so its capitals are the same height),
  and the frame covers both words' ink (`alignedFrames` in glyph.js; with one
  font it is the old frame). Letting each word's ink fill the row instead cost
  ~3% coverage (Bungee × Kanit Black, FINOLA × BRYAN: 0.967 vs 0.994), since
  one font's round overshoot then kept the other's flat capitals from meeting.
- Chain recipes carry the side word's frame (`frameB`) only when the fonts
  differ, so old links and one-font recipes are unchanged. The fonts
  themselves stay page state, like the front font.
- Page: "Side word font" under the font controls (two-word looks only):
  Same as front · bundled fonts · any Google Font · upload. Share links add
  `font2` or `gf2`/`gw2` only when it differs from the front font. The words
  workers load and cache both fonts. `scripts/explore-words.js --font2`.
- Tests: unit (each view drawn in its own font, flat capitals meet, 2D
  scores match 3D, fontB = font identical), looks (five looks with two
  fonts), e2e (side font changes the design, round-trips through the link;
  the default link has no `font2`).
- Subagent: built by a subagent (opus, ~220k tokens, ~25 min). Earned its
  cost: broad plumbing across core, workers and UI; it rejected the suggested
  height rule with evidence (coverage −3%) and chose a better one. I re-checked
  that one-font designs are unchanged (12 designs, 2 fonts, identical), re-ran
  the suites, and looked at its screenshots.

## 2026-09-28 (which model is which, when comparing)

- Owner: when comparing, it could be unclear which state is shown. While a
  model is pinned, a label in the corner of the view says "Pinned" (amber)
  or "Current" (blue) and lists what differs between the two (settings,
  font, side font, design), with that model's value: e.g. "Trim knife
  edges: on". C also works right after clicking a checkbox (only typing in
  text fields is ignored). The Flip button keeps a short, fixed-width label:
  a longer one re-wrapped the toolbar and resized the view (caught by the
  pixel-exact e2e test).
- No subagents used.

## 2026-09-28 (compare in place: keep the view, Pin and Flip)

- Owner: small differences were hard to see because a setting change reset
  the view after a delay. Now a rebuild of the same look and words keeps the
  camera, zoom and centring (new words or a new look still reset them).
  "Trim knife edges" is a finish setting like the stand: it rebuilds only the
  shown design, no new search. New **Pin** / **Flip** (key C) in the viewer
  toolbar: pin the shown model, change something, flip between the two in the
  same view. e2e: flipping back to the pinned model is pixel-identical to
  before the change; new words clear the pin.
- No subagents used.

## 2026-09-28 (trim knife edges by chamfering; on by default)

- "Trim knife edges" now chamfers every convex edge sharper than 60° where
  the wedge is 0.3 mm thick (`trimSharp`, src/core/sharp.js; at most 1.5 mm
  deep; cutters overlap along curved edges and sit just outside the faces,
  which otherwise left hair-thin slivers). Rounded corners are untouched.
  Works on any mesh, so angled blocks too. On by default.
  FINOLA × BRYAN, knife edges under 60°: Alfa Slab One 21.2 → 0 mm, Archivo
  Black 55.1 → 0.1, Bungee 12.7 → 2.1, Sigmar One 18.8 → 5.9 (tiny slivers
  where cuts meet), Kanit none to begin with. Shadows unchanged (a few
  1e-5 in Archivo and Sigmar), pieces unchanged, a few hundred triangles more.
- Replaces the column-based trimThin/thinRuns (removed): it cut rounded
  corners, ballooned meshes and left zero-thickness faces.
- Exact meets + trimming: fewer knife edges in Bungee (8.5 vs 12.7 mm before
  trimming) but 15 zero-thickness sheets (the stray-triangle defect), which
  chamfering can't remove. So tidy keeps its 0.01 mm offsets for now; A × L's
  sliced L foot top (a crease, not a knife) stays open.
- No subagents used.

## 2026-09-28 (a knife measure that ignores rounded corners)

- `sharpEdges` (src/core/sharp.js): convex mesh edges where the faces meet
  at an acute interior angle: the owner's "sharp edge". Smooth rounded
  corners have none (their facets meet at shallow angles), unlike the
  column-based thin measures. FINOLA × BRYAN: Bungee untidied has 5.3 mm of
  edge under 45° (F/B, the owner's first knife), tidied none; under 60°,
  A/N and NO/Y remain (12.7 mm). Kanit has none under 60° either way (its
  "thin spots" were rounded corners). check-thin.mjs now reports these too.
  Test added. Next: steer tidy's final choice and trimming by this.
- No subagents used.

## 2026-09-28 (tops and bottoms may line up; the thin-spot check counts rounded corners)

- tidyPair: a letter's top or bottom may now move exactly onto a nearly equal
  edge of the other letter (within 0.3 mm; exact, not a hair beside, since
  same-facing edges meet safely). No change in FINOLA × BRYAN: there the tops
  and bottoms already agree.
- Finding: most of Kanit's "thin spots" are smooth rounded corners. A
  vertical line just inside a rounded corner passes through a sliver of
  material before leaving through the curved wall, so the column-based
  measures (check-thin, columnSlivers, thinRuns) count it as thin. A smooth
  corner isn't a sharp edge. Next: measure sharpness on the mesh itself
  (edges where faces meet at an acute angle), then rebuild trimming on that.
- No subagents used.

## 2026-09-28 (tested: exact meets + trimming)

- Owner asked to test tidy with exact meets plus trimming. Options added for
  the experiment (defaults unchanged): tidy passes `eps` / `touch` through
  (touch = weight of exactly touching faces in the sliver score).
- Result (FINOLA × BRYAN, ray-cast check of the finished mesh, spots under
  0.3 mm / zero-thickness):
  Bungee: offsets 84 / 0, offsets + trim 57 / 43, exact + trim 58 / 66.
  Kanit: offsets 646 / 1, offsets + trim 1614 / 203, exact + trim 1650 / 216.
  Exact meets fix A × L's sliced L foot top (edges land exactly on the L's),
  but the trimming step as built makes things worse: its box mask blows the
  mesh up (2.7k → 50.6k triangles) and leaves zero-thickness faces where it
  removes a plate. Also found: most of Kanit's thin spots are plates along
  the letters' tops (front and side tops differ by 0.07–0.15 mm), which tidy
  can't fix because it never moves a letter's top or bottom.
- No subagents used.

## 2026-09-28 (trim knife edges: first version, off by default)

- Owner: after tidying lines edges up, trim or round sharp edges only where
  needed; a sharp edge exists only where thin material meets an opening.
  New knob "Trim knife edges (under 0.3 mm)" on the two-word looks (off by
  default for now; recipe `trim: true`). `trimThin` (compose.js) removes
  material thinner than 0.3 mm vertically with air above and below:
  where = columns with such a run (`thinRuns`, from the outlines);
  what = a vertical morphological opening, done cheaply because the solid is
  front outline × side outline (erode each outline vertically as shifted
  copies, build, grow back as shifted copies). ~10 ms per design.
  FINOLA × BRYAN: Bungee loses 0.6 mm³ (the A/N plate, NO/Y slivers) with
  shadows and pieces unchanged; Kanit loses 3.7 mm³, side shadow 100% →
  99.993%, pieces unchanged. Not yet for angled blocks. Test added.
- Tried and dropped: a plain grid of boxes (left most thin material, split
  Kanit into 11 pieces); an unmasked opening (saw-toothed slopes); exact
  Minkowski erosion/dilation (over 15 minutes).
- Tidy: tried placing "beside" offsets by which way edges face (fixes the L
  foot block top being sliced in A × L) but it flipped A × C / A × D back to
  clearing; reverted. Plan: exact meets plus this trimming step.
- No subagents used.

## 2026-09-28 (tidy: smaller offset; sharper review outlines)

- "Beside a feature" offset 0.05 → 0.01 mm (owner noticed A × L's crossbar
  bottom slightly overshooting the L's foot; the offset only exists to stop
  opposite faces touching). The finished default design still has no
  touching-face sheets or thin spots in L/A (scripts/check-thin.mjs).
- Review page: outlines stored at 0.01 mm (0.1 mm made curves jaggy in the
  3D viewer).
- Tried and reverted: a strong reward for lining edges up (mu 3). It fixes
  A × G's overshoot (the crossbar bottom goes to the shared line and its top
  to the G's bar) but also lines up edges that gain nothing (F × B's B
  bowl moved 0.5 mm) and thins A/N's plate to 0.08 mm. Open question for the
  owner: accept curve wedges for alignment and trim thin tips afterwards?
- No subagents used.

## 2026-09-28 (tidy: owner's review of the Bungee cards)

- Owner's notes on the review page: prefer making a thin section vanish
  (edges lined up) over thickening it (cleared by 0.8 mm); let the A move
  (its crossbar bottom, 6.45 mm, is the odd one out: C D E G I L S Z share a
  line at 6.76–6.81 mm); allow meeting in the middle; allow several changes
  per pair (J × A). tidyPair is now a greedy search of up to 3 changes over
  level heights of both letters (level / shift / middle moves), with a
  reward for fewer distinct heights, a fixed cost for "clear" moves, a cost
  for moving a level off one of the font's shared lines (`fontGuides`: flat
  edges shared by ≥ 4 capitals; layoutCells maps them into each chunk), and
  end bands (serifs) recognised as strokes. Bungee: C/D/I/J/L × A now move
  the A; F × B unchanged.
- A hairline sheet (0.012 mm, under 0.1 mm wide) along the A's rounded
  counter corner escaped the 0.1 mm measuring grid; the final check of the
  best candidates now uses 0.05 mm. `scripts/check-thin.mjs` ray-casts the
  finished mesh to find what's still thin, by pair and height (15 s).
  Left for the owner: A × N keeps a 0.25 mm plate under the N's slot (only a
  "clear" move fixes it; those are now a fallback).
- Review page: one card per letter pair (both letters may change), listing
  each change; 3D viewer takes a changed side letter too.
- No subagents used.

## 2026-09-28 (stray triangle: touching faces; clear-of-feature moves)

- Owner still saw a thin triangle in L × A (top view) on the new site. It
  was a zero-thickness sheet: tidying put the L's foot top exactly on the A's
  crossbar bottom, and the boolean leaves a stray face where opposite faces
  coincide. The column measure dropped touching columns, so it scored that
  as clean. Now touching faces count as the thinnest sliver, and tidyPair
  also tries landing 0.05 mm either side of a feature (L × A: 5.04–10.00, a
  clean window) and clearing a feature by 0.8 mm (A × N: the N's middle
  band 1 mm lower, clear of the A's crossbar). Tests: touching faces score;
  L × A leaves no zero-thickness sheet.
- Lesson: after a fix, check the whole finished design (every pair, and the
  built mesh), not just the pair that was reported.
- No subagents used.

## 2026-09-28 (no stand, no rods by default; thinner slivers count worse)

- Owner: no stand and no support rods by default. All two-word looks now
  default to both off; gapped row, rows and grid then stay in separate pieces
  and the page says so (rods or the stand join them). Tests that need one
  piece ask for rods explicitly.
- Owner spotted a very thin triangle in L × A: tidying had squashed a
  0.47 mm plate to 0.12 mm, which the volume-based measure counted as better.
  Now thin runs score by footprint × thinness, a band's edges may also move
  separately (L × A: both onto the A's crossbar, no slivers left), horizontal
  strokes resist thickness changes (the F's arm is still shifted, not
  thinned), and the search uses a 0.1 mm grid. Details in
  resources/research/letterform-tidy.md. Test added for L × A.
- No subagents used.

## 2026-09-28 (tidy slivers: trade-off search)

- `tidyPair` (new src/core/tidy.js, which now holds the letter-feature and
  warp code from wordpair.js): per pair, the one stroke shift (either letter,
  to the other's flat edge or corner) that best reduces knives + 0.3 × cuts
  (column measure) against how much it stretches the gaps around the stroke;
  only if it clearly helps. The app's knob becomes "Tidy slivers" (recipe
  `tidy: 'pair'`; older `corners` links unchanged). FINOLA × BRYAN: the F's
  arm (as before) plus the L's foot to the A's crossbar (6.6 mm³ of knife
  gone). Review page shows tidyPair's changes. Test added.
- No subagents used.

## 2026-09-27 (review page: interactive 3D and sliver scores)

- Owner request: orbit the 3D before/after. Clicking a card's 3D thumbnail
  opens a viewer: before and after side by side, cameras linked, Front / Side
  / Top / 3/4 buttons, Esc closes. The solids are built in the page by
  manifold-3d (published alongside as lib/manifold.js + .wasm) from the
  page's own outlines, so any future move type works; three.js is bundled by
  vite into lib/viewer.js. Moved letter now always in front (orange), in the
  thumbnails too (it was at the side in 161 of 363 cards).
- Each card shows knives and cuts (column measure, mm³) before → after, green
  or red; "Only changes that reduce knives" filter.
- Subagent: the viewer was built by a subagent (opus, ~100k tokens, ~9 min).
  Earned its cost: self-contained, parallel with the measures work, and it
  caught the moved-letter orientation mismatch. Untested in the real Artifact
  sandbox (WebAssembly may be refused by its CSP; the page then says so).

## 2026-09-27 (sliver measures)

- `src/core/slivers.js`: `columnSlivers` measures knives/slivers (vertical
  runs of material under 0.8 mm) and shallow cuts (short air runs between
  material) from the two letters' outlines alone, ~10 ms per cell;
  `featureNearMisses` from feature heights only. `thinFeatures` gains `gaps`
  (thin air). Validated against the voxel ground truth
  (`scripts/validate-slivers*.mjs`); findings in
  resources/research/letterform-tidy.md: the column measure is the cost to
  use; the feature-height proxy is too weak; a third of arm-to-corner moves
  make slivers worse by the column measure.

## 2026-09-27 (letter tidying: arm to corner, first cut)

- Owner request: in FINOLA × BRYAN (Bungee), the B's notch sits 0.37 mm below
  the top of the F's middle arm, leaving a thin wedge. New knob on row, rows
  and grid, "Line up arms with corners" (on by default; older share links
  unchanged): `alignCorners` shifts one letter's stroke, keeping its
  thickness, so its edge meets the other letter's pointed corner (F's arm
  ↓ 0.37 mm). One letter per pair, never same-letter pairs, and at most a 15%
  change to the gaps beside the stroke (provisional).
- First tried meeting nearly level edges halfway (`alignLevels`); the owner
  disliked it (it moved the gap between the F's arms). Kept, unused.
- Review page for the owner (every capital pair × 9 fonts, 2D and 3D
  before/after, Good/Bad marks): `scripts/letterform-review/`. Findings and
  open questions: `resources/research/letterform-tidy.md`.
- Test: F's arm moves to the B's notch, keeps its thickness; same letters and
  over-limit changes are left alone.
- No subagents used.

## 2026-09-27 (tour for recording a video)

- Owner request: a video of one design (FINOLA × BRYAN, pairs in a row, no
  stand, no rods, coloured by view). Niche, so it hides behind `tour=1` in the
  URL hash; without it nothing changes (writeHash keeps `tour=1` when present).
- **Tour ▶** (next to Swing): zooms in on each cell's chunk of word A from the
  front, then its chunk of word B from the side, in chain order (F, B, I, R,
  NO, Y, L, A, A, N), then all of FINOLA, all of BRYAN, and back to F, so it
  loops. Stops come from the built design: the words worker now also sends
  each cell's per-view chunk bounds and depth (`view.cells`). A letter stop
  centres the chunk and fills 70% of the view; the camera pivots on the cell's
  centre, so it turns about each pair. Word stops use the Front/Side buttons'
  margin (the word fills 2/3). Directions are the same per-design frames as
  those buttons (45° turn included).
- Motion reuses Swing's timing and easing (move, pause, max tilt): azimuth,
  target and zoom move together (zoom geometrically); moves between a word
  and a letter take 1.5×. Dragging or a view button stops it.
- `npm run record-tour` (`scripts/record-tour.mjs`): builds and previews the
  page, drives `window.__tour.seek(t)` in local Chrome frame by frame, pipes
  PNG screenshots to ffmpeg (H.264, yuv420p, CRF 18) → `out/tour.mp4`
  (gitignored). Default: 33.2 s at 1920×1080, 30 fps.
- `record-tour --gif` (or an `--out` ending in `.gif`): a looping GIF instead,
  captured at full size and downscaled to `--gif-width` (default 720) with
  lanczos, one palette for the whole clip (palettegen → paletteuse, sierra2_4a
  dither). Default 20 fps, since GIF delays are whole centiseconds (30 fps
  would play at 3 cs = 33 fps). Default tour: 664 frames, 720×405, ~10 MB.
- `record-tour` colours: `--bg`, `--front`, `--right`, `--top` (any CSS
  colour) recolour the background and the faces carved by each view, through
  new `window.__tour.faceColours` / `lighting` hooks (the page itself is
  unchanged). With custom face colours the fill light's ground tint goes
  neutral (the default blue-grey tinted white faces). `--light` scales both
  lights: head-on faces get little direct light, so white only reads as white
  at about `--light 3` (checked at 1, 1.5, 2, 2.5, 3); black is unaffected.
  Owner's pick: `--bg '#808080' --right white --front black --light 3`.
- e2e: with `tour=1` the stops follow the pairs, the first stop differs from
  the Front view, the loop's end equals its start, and a view button hands the
  camera back; without it there is no Tour button.
- Subagent: built by a subagent (opus, ~150k tokens, ~11 min). Earned its cost:
  self-contained, owner asked to delegate; it checked its own stills and caught
  the Shadows panel over the video. I re-checked the stills and re-ran the suites.

## 2026-09-27 (thinner, straighter support rods)

- Owner request (NO × YA tower: a chunky diagonal rod from a rounded corner):
  thinner rods, straight where possible, inset from rounded corners, since a
  careful maker might use clear acrylic rod or fishing line instead.
- Rods are now round and 0.6 mm across (were 1.6 mm square).
- `bridgePieces` first looks for a **straight rod along x, y or z**: rays
  cast through the pieces' triangles on a grid where the two pieces overlap
  across that axis. A rod runs between consecutive hits of the two pieces (so
  only empty space lies between). It counts only if rings of rays around it
  (at its radius + 0.4 mm and half that) meet both pieces within a ~20°
  slope, so its ends sit on nearly flat faces, clear of rounded corners. Among
  the shortest, the one with the most such room wins; ties go to the middle.
  A diagonal rod between the closest points remains the fallback, costed
  1.5× + 2 mm so a somewhat longer straight rod wins. The straight-rod search
  runs lazily, only for pairs the spanning tree reaches.
- NO × YA now gets one vertical 1.4 mm rod under the N's left leg, on the O's
  flat top. Pairs in a row still use (thin) diagonal rods: neighbouring
  pieces sit diagonally, so no single straight rod reaches.
- Test: a bar above a slab gets a vertical 2 mm rod, clear of the edges.
- No subagents used.

## 2026-09-27 (tower knobs that did nothing)

- The owner noticed Tower → Spacing: gapped had no effect. An audit of every
  knob on every look (build each look with one knob changed and compare the
  finished object's volume and bounding box) found three tower bugs:
  - **Stacked tower ignored spacing.** The recipe never carried it, so the
    builder always used touching. Now gapped leaves a gap between the letters,
    joined by rods (or left in pieces with Support rods: none).
  - **One pair per level ignored the shape.** Chains had no top shape.
    `realizeDesign` now takes `top`: the shape is fitted over the whole
    layout's footprint (`placeTop`) and searched for the best rotation/scale
    like the other towers. FINOLA × BRYAN + ❤: 99.7% of the heart shown, one piece.
  - **Prefer compact never changed a tower** (each tower style has a single
    layout), so the knob is gone from Tower. Old share links that carry it
    just ignore it.
- The audit's other "no effect" cases are expected: Turn only rotates the
  finished object for display; Support rods: none on touching designs that
  are already one piece; Prefer compact / Stretch on rows and grids when the
  ranking picks the same layout either way.
- Tests: gapped stacked tower and heart tower (one pair per level) are in the
  reachable list; spacing and shape change the object for all three tower
  styles; a gapped stacked tower without supports stays in pieces.
- No subagents used.

## 2026-09-27 (bounding box toggle)

- Viewer: "Bounding box" checkbox, off by default (the box was always drawn).
  Remembered per browser. e2e: off by default; checking it changes the picture.

## 2026-09-27 (swing animation)

- Viewer: "Swing ⇄" ping-pongs the camera around the vertical axis between the
  exact front and side views (each design's own view directions, so angled
  blocks and the 45° turn work; the letter cube swings front ↔ side). Sine
  ease-in-out, so the camera stops smoothly at each end; a pause at each end;
  "max tilt" rises (or, negative, dips) along a sine arch that's 0 at both
  ends, so each word still reads exactly. Defaults chosen by the owner after
  previewing: swing 2.0 s, pause 0.6 s, max tilt 0°. Dragging or a view button
  stops it; a new design keeps swinging.
- Fixed a layout shift: showing the timing inputs wrapped the toolbar, which
  resized the viewport and rescaled the view. The inputs now always take
  their space (visibility: hidden when off).
- e2e: both pauses match the Front / Side button views pixel for pixel;
  defaults; a view button stops the swing.
- No subagents used.

## 2026-09-27 (report by look; old gallery generator removed)

- `scripts/explore-words.js` now generates every word look with "More
  variants" (plus the tower and block with ❤), grouped by look under the web
  page's labels and descriptions. Finola × Bryan: 86 designs in 134 s (was 68
  in 217 s). Options: `--looks`, `--fast`, `--shape`.
- Removed the section-based `generateGallery`, its constants and the worker's
  `gallery` message: the page stopped using them at stage 2, and every variant
  they made is a look (`test/looks.test.js`). `gallery.js` keeps the recipe
  builder and `designView`.
- `ui-map.md`: all open items from the reorganisation are done.
- No subagents used.

## 2026-09-27 (letter cube wording; shared font upload)

- The letter cube's options use the same plain wording as the word looks:
  "Letter shapes: stretched to fill each face / kept in proportion", "Which way
  up: sits on a table / any way up / exactly as typed", "Warn about walls
  thinner than", "Let letters swap sides", "Prefer one piece"; "Side" instead of
  "Right"; "Make it" instead of "Generate".
- Uploading a font moved to the shared font row. It works for every look,
  regenerates the current one, and clears a Google Font. Uploaded fonts stay
  out of share links, as before.
- No subagents used.

## 2026-09-27 (no-supports option; prefer compact)

- "Support rods" knob on every word look: allowed where needed (default) or
  none. With none, only hidden hull joins and the stand may connect pieces
  (recipe `supports: 'none'` drops the rods), and designs that stay in pieces
  rank lower. Finola × Bryan, pairs in a row: gapped + no supports + no stand
  = 6 pieces (gapped letters can't connect by themselves); add the stand → one
  piece, no rods. The checklist says so and suggests touching spacing, a stand,
  or allowing supports.
- "Prefer compact" (rows, grid, tower): adds 0.3 × (1 − shortest/longest side)
  to the quality penalty, so squarer layouts win ties (`weights.compact`).
- Tests: supports none → no rods; stand or rods → one piece; compact term. e2e:
  the Supports knob on the row look.
- No subagents used.

## 2026-09-27 (UI reorganisation: status)

- Stage 5 (taste controls): "Allow stretching letters" is a knob on every look
  where it applies (off by default). Every design is joined into one piece
  automatically, so no "prefer one piece" control. `ui-map.md` records what's
  done and what's open.

## 2026-09-27 (UI stage 3: thumbnails)

- Results list entries show a small 3/4-view thumbnail. A third worker builds
  each design's mesh in the background (mesh only), and one reused offscreen
  renderer draws it. Thumbnails include the current stand/turn and refresh when
  those change; a new search cancels the queue. List titles use short case names.
- e2e: each look's first design gets a thumbnail.
- No subagents used.

## 2026-09-27 (UI stage 4: plain-language checks)

- Each design's panel shows a checklist: every letter fully shows / which
  letter is cut; no letter hidden by neighbours / which is covered; letters
  don't merge / which touches along a whole stroke; how much letters are
  stretched; one piece (and how many support rods); approximate size. Raw numbers
  are under a "Numbers" expander. List items show "all good" or "N to note",
  with the checklist as a tooltip. Shadow captions say "side", not "right".
- No subagents used.

## 2026-09-27 (UI reorganisation, stages 2 and 6: look-first page)

- The tabs are replaced by a look menu (six cards with small drawings):
  Letter cube, Pairs in a row, Pairs in rows, Grid, Tower, Word block. Each
  look shows only its own knobs, generated from `look-defs.js`: segmented
  choices, checkboxes (allow stretching, display stand, turn 45°, monospaced),
  and a shape field with quick-insert symbols (❤ ♥ ⭐ ☀ ♣ ♠ ♦ ♪ 😀 🐱). Changing a
  knob regenerates (0.2–2 s), and stand/turn rebuild only the selection. "More
  variants" widens the search. Font changes regenerate too.
- The letter cube is a look (stage 6): same flow, its existing options.
- Share links: `#look=…&k={knobs}&r=…`; older `#m=letters` / `#m=words…` links
  still open (a recipe maps to its look).
- Look definitions are data-only (`look-defs.js`) so the page doesn't bundle
  the geometry code.
- e2e rewritten: every look makes a one-piece design, only the active look's
  controls show, a shape knob gives three views, finish goes into the link,
  and round trips work for the cube, a word look and an old-format link.
- No subagents used.

## 2026-09-27 (UI reorganisation, stage 1: looks in core)

- `src/core/looks.js`: six looks (letter cube, pairs in a row, pairs in rows,
  grid, tower, word block), each with only its own knobs in one vocabulary
  (spacing gapped/touching, case, stretch, shape, angle, stand, turn).
  `generateLook` gives a fast first result (0.1–2.4 s; a shape on a tower ~6 s),
  with `more` widening it (every case, runner-up layouts, all tower styles, all
  angles). Items are gallery recipes, and the recipe includes the finish, so
  the same builder, viewer and share links work.
- `designWordPair`: a family's own rows (grid 2/3, column) are now only a
  default; an explicit `rows` wins.
- Tests (`test/looks.test.js`): every look in `ui-map.md` is reachable as
  look + knobs and builds into one piece with ≥85% coverage.
- No subagents used.

## 2026-09-27 (UI lay of the land)

- `resources/design/ui-map.md`: an inventory before reorganising the web UI.
  It maps each look to how to reach it today, lists the controls, shows what
  applies to what, and lists where the structure fights the user, with
  directions (not decided). Confirmed that TextTango's "pairs in a row on a
  stand" is our spaced chain, 1 row, with stand and turn: STOP × WORK →
  S+W, T+O, O+R, P+K.
- No subagents used.

## 2026-09-27 (display stand; any Google Font)

- `displayStand` (join.js): a rounded base from the convex hull of the design's
  footprint, padded with round corners, sunk 0.3 mm into the bottom row. It's a
  join step ('stand', after hidden joins, before rods). Spaced chain,
  Finola × Bryan: 5 rods → 0, one piece; the cost is a bar under both shadows
  (~12–14% extra shadow), so it's opt-in. Recipes take `stand`; `designView`
  takes `turn` (output-only rotation of mesh, STL and camera frames; -45° so the
  two words face front-left and front-right, as TextTango does).
- Web: "Finish" options in Two words (Display stand, Turn 45° for display)
  rebuild only the selected design and are kept in share links.
- Web: any Google Font by name (Fontsource catalogue: ~2,100 families; TTF via
  jsDelivr, CORS-enabled), heaviest weight by default with a weight picker;
  works in both modes and in share links (`gf`, `gw`). Checked in a browser:
  load, generate, and restore from a link give identical designs.
- Tests: the stand joins separate cells under a convex outline; e2e toggles the
  finish options and checks they reach the share link.
- No subagents used.

## 2026-09-27 (prior art: TextTango)

- Studied Lucandia/dual_letter_illusion (notes in
  `resources/research/prior-art.md`, ideas in `resources/backlog.md`). Code is
  GPL-3.0: ideas only.
- Subagent ledger: one Sonnet agent cloned and read it. **Worth it**: an accurate
  summary with file references and licence details, which saved me reading the
  repo. I re-checked the key claims in `app.py` and added the one thing it
  missed: the 45°/135° rotation means their straight row of pairs is our
  diagonal chain turned 45° and set on a stand.

## 2026-09-27 (GitHub Pages)

- `.github/workflows/pages.yml`: on every push to main, run the unit tests,
  build the web page and deploy it to https://mrienstra.github.io/shadow-hull/
  (Pages build type: GitHub Actions). README links to it.

## 2026-09-27 (release prep)

- README.md (what it is, synonyms, quick start, fonts, papers and prior work)
  and an MIT LICENSE (the bundled fonts keep their OFL licenses). package.json
  gets the license, repository and a broader description.
- Checked the Quick start in a fresh clone: install, tests, CLI, report
  script, web build.
- Subagent ledger: one Fable agent fact-checked the README's references (URLs,
  bibliographic details, synonyms, GEB cover, Debris). **Worth it**: everything
  checked out except one wording ("strokes" → "parts" for 2CATteam's
  generator), and it confirmed a softening I'd already made ("uses the term
  shadow hull", not "coins").

## 2026-09-27 (example words)

- The example pair "Finola" × "Bryan" refers to the lead agents of NBC's
  *Debris* (2021), Finola Jones and Bryan Beneventi. Noted in CLAUDE.md, the
  report script and under the web page's word inputs. The repo and its history
  were checked for anything tying the names to real people (none).
- Subagent ledger: one Fable agent verified the *Debris* facts (network, year,
  exact spellings, cast) against Wikipedia, Rotten Tomatoes and IMDb. Cheap and
  **worth it**: it's a factual claim in reader-facing text, which CLAUDE.md says
  to check.

## 2026-09-27 (web: mode-specific controls, shareable links)

- Fixed: both modes' controls were always shown. `form { display: grid }`
  overrode the `hidden` attribute; `[hidden] { display: none !important }`.
  The e2e test now checks visibility (mutation-checked: it fails without the fix).
- Shareable state in the URL hash, updated as you work: mode, font, inputs,
  options, and the selection (three letters: the candidate; two words: the
  design's recipe and title, which a link builds straight away while the list
  regenerates). "Share link" copies it; an uploaded font can't be included,
  and the button says so.
- Fixed: in three-letters mode a slow build for an earlier click could finish
  after a later click and overwrite the view and selection (builds take ~2 s
  with the thin-part check). Only the latest selection may finish now.
- e2e: a round trip of shared links in both modes.
- No subagents used.

## 2026-09-27 (web: Two words mode; gallery in core)

- `src/core/gallery.js`: every word-pair variant (chain families, blocks with
  top shapes, angled blocks, tall-letter columns, stacked columns, hearts) as
  plain JSON recipes streamed by `generateGallery`; `buildRecipe` rebuilds one;
  `designView` gives mesh, face runs, per-view outlines and frames. The report
  script now uses it (68 designs for Finola × Bryan, ~3.6 min).
- Web page: tabs for Three letters / Two words. Two words: words, font, which
  sections (defaults: blocks + stacked, ~15 s; "Everything" matches the
  report), options for chain families, cases, rows, top shapes (any characters
  from Noto Emoji) and view angles. Designs stream into a grouped list; clicking
  one builds it on a second worker and shows it in 3D (recentred; camera snaps
  use the design's view frames, so angled blocks get a proper "side" view),
  with shadows, metrics, colour by view and STL download. Stop terminates the
  gallery worker. The viewer and shadow panels stay pinned while the list scrolls.
- Fixed a race: a three-letters search finishing after switching to Two words
  drew its shadows over the words view.
- e2e: Two words mode streams designs and shows a heart block with three views.
- No subagents used.

## 2026-09-27 (column variants: heart from above; stacked, all taller)

- Heart over a column: `spanColumnCells` / `stackedColumnCells` take a top
  shape (`placeTop`: rotate, scale to the footprint). `searchTopFit` tries
  rotations × sizes; ties within 0.01 quality prefer upright, then 45° steps
  (upright costs one side letter 99.9% → 99.2% on the tall-Y column).
  Finola × Bryan, touching, tall Y: front 99.9%, side 99.7–100%, heart
  99.7–100% at any rotation (45° is slightly worse at 98.4%). A touching column
  has ink at nearly every height, so the heart trims almost nothing, and from
  above it fills the heart.
- Stacked column (`stackedColumnCells`): both words stacked whole, the shorter
  word's letters all taller so the stacks match (Bryan ~1.2×; 1.197 with the
  0.3 mm row overlap) — no per-row pairing. Touching: 100% / 100%, one piece,
  no rods (stems touch between rows, as in every touching layout). 'uniform'
  also widens them.
- Report: `--sections families,blocks,angles,spans,stacked`; new "Column
  variants" section.
- No subagents used.

## 2026-09-27 (colour faces by the view that carved them)

- `manifold.js`: `tagged(m, label)` registers a solid's original ID under a label;
  `faceRuns(mesh)` returns labelled triangle runs (Manifold keeps per-triangle
  provenance through booleans). View prisms are tagged by view (trip-lets,
  compositions, full hull); cell boxes 'box'; rods, plates and hull-join cut
  faces 'connector'.
- Cell boxes are padded by 0.05 mm: letters' flat sides lay exactly on box faces,
  and the coplanar tie credited those faces to the box. With two views the
  prisms already bound a cell, so no material is added (coverage unchanged).
- Report and web page colour faces (front orange, side blue, top purple, box
  grey, connectors dark grey), with a toggle and an explanation: a face follows
  the outline of its view's letter (the walls of that extrusion), so the flat
  face seen head-on shows the *other* view's colour.
- Test: every trip-let face labelled; front-labelled faces are parallel to Y
  (float32 tolerance 1e-3, slivers skipped).
- No subagents used.

## 2026-09-27 (column with spanning letters)

- `column.js`: the longer word one letter per row; the shorter word's letters
  get row spans (all compositions, each ≤3) and pair with the letters in their
  span. Spanning letters are stretched or scaled uniformly (drop-cap).
  `designSpanColumn` builds and ranks every span choice.
- Row frame snaps to baseline and cap height (within 3% em): using ink extremes
  left flat letters short of the row edges because round letters overshoot,
  so "touching" rows didn't touch (6 separate pieces).
- Finola × Bryan (Kanit Black, upper): touching rows give one piece at 99.9%
  (stems touch between rows, contact 106–134%). Spaced rows (1.2 mm) cut a line
  through the spanning letter (97.9%) and need 5 rods. Best spans: Y×2 (touching)
  and A×2 (spaced); the drop-cap scores highest (0.965 spaced).
- Report: "Column, tall letter" section.
- No subagents used.

## 2026-09-26 (other view angles, blocks)

- `viewAtAzimuth(deg)` gives a vertical view at any azimuth (0 = front, 90 = right,
  still right-handed). `frameOf` / `localToWorld` / `worldToLocal` take a
  `frames` override, threaded through `buildComposition`, `measureComposition`,
  `strayShadow`, `fullHull` and `finishDesign`.
- Blocks at other angles (`realizeBlock({ angle })`): both words centred on the
  vertical axis. Finola × Bryan, touching uppercase, 90° → 20°: coverage
  unchanged (front 99.8%, side 100%) and nothing outside, as the shared-z argument
  predicts; the footprint grows as 1/sin θ (99 × 88 mm at 90°, 99 × 223 mm at
  45°, 99 × 529 mm at 20°). Test checks azimuth 90 = the right view and that
  coverage is unchanged at 50°.
- Report: "Block, other view angles" section (`--angles 75,60,45`); shadow panels
  use the design's frames and label angled views.
- No subagents used.

## 2026-09-26 (block layouts; shapes on the third axis)

- `block.js`: "normal" layouts. Whole word A front, whole word B side (single
  rows, one cell), optional top-view shape stretched over the footprint.
  `glyphSilhouette` turns any glyph into a filled outline (holes dropped).
- `fonts/shapes/NotoEmoji.ttf` (OFL, monochrome outline emoji, 1,891 glyphs):
  ❤ ♥ ⭐ 😀 🐱… as top shapes. None of the bundled letter fonts has ♥.
- `design.js`: `finishDesign` (join + measure, shared) and `realizeBlock`.
- Finola × Bryan, Kanit Black, touching: plain block 99.8% worst letter, one
  piece. With ❤ on top: letters ≥99.7%, heart 97.9% shown, one piece, a
  99 × 88 × 19 mm heart-shaped slab. Lowercase/title + ❤: letters ~88%. Spaced
  blocks don't work: every letter pair is its own block (30 pieces, 29 rods), and
  the gaps grid the heart (84%). Left out of the report.
- Report: Block section (`--tops none,❤`); cards show the top view when constrained.
- No subagents used.

## 2026-09-26 (single column)

- `column` and `column-touching` families: one letter pair per row (rows = the
  shorter word's length), rows centred into a tower. Finola × Bryan: 5 rows,
  with the longer word doubling up where the search scores best (e.g. OL).
  Spaced columns score 0.97–0.98 (upper/mixed) with 5 short rods; touching
  columns merge stems (contact up to 130%).
- No subagents used.

## 2026-09-26 (design pipeline in core; quality ranking)

- `src/core/design.js`: the word-pair pipeline moved out of the report script
  (so the web page can share it). `SPACING` families, `realizeDesign`,
  `designQuality`, `designWordPair`.
- Ranking folds in the measured results: each style's top 3 search layouts are
  built, joined and scored by `designQuality`. The score is worst-letter coverage
  minus penalties for hidden letters (<95% visible), merged stems (contact >0.2
  row heights), stretch, extra shadow, unjoined pieces, and uneven rows
  (weights in `QUALITY_WEIGHTS`). This changed the winner in 20/40 style ×
  family cells for Finola × Bryan, e.g. touching upper 2 rows: contact 136% →
  89%; grid lowercase 3 rows: 92% → 100% coverage.
- Report: shows quality and flags re-ranked winners; ~2 min with 3 candidates.
- `resources/backlog.md` collects requests not yet started.
- No subagents used.

## 2026-09-26 (grid style)

- Grid layouts: `gridLines` splits each word into equal lines (FIN/OLA ×
  BRY/AN; FI/NO/LA × BR/YA/N), and `layoutCells({ grid })` puts every letter in
  a fixed column slot (the word's widest letter), so letters line up in columns
  in both views. `grid.fit 'stretch'` widens letters towards the slot width,
  capped at `maxStretch` (1.5×): full stretch turned an I into a solid block.
- Report gains two families: Grid, and Grid monospaced. Finola × Bryan: uppercase
  and mixed grids are 100% with every letter fully visible. Lowercase and title
  grids are 74%, because the fixed rows force i to pair with r, which has no ink
  at dot height.
- Notes: the only distortions so far are scaling (per-letter width/height to the
  square for trip-lets; vertical stretch to row height for word pairs; capped
  horizontal stretch in mono grids). The only monospaced bundled font is Rubik
  Mono One.
- No subagents used.

## 2026-09-26 (report rendering, grid tie-break)

- Report: one shared WebGL canvas draws every on-screen 3D view into its card
  (Chrome allows ~16 contexts per page; with 24 cards the first 8 were lost).
- Balanced grid splits (FIN/OLA × BRY/AN, FI/NO/LA × BR/YA/N) scored exactly the
  same as the lopsided winners (F/INOLA) but lost on split order. `rankLayouts`
  now breaks ties by line imbalance, so grids show up in the report.
- No subagents used.

## 2026-09-26 (touching vs spaced; contact metric)

- Owner feedback: with touching letters, flat stems merge. The i next to l reads
  as a thick L, and in stacked rows the I under the F reads as a longer F stem.
  The touching look is still wanted as one option.
- `letterVisibility` now also reports `contact`: outline within 0.3 mm of another
  letter, in row heights. Touching Finola × Bryan: I 125%, N 136% (merged
  stems); with a 1.2 mm gap: 0%.
- Fixed row stacking with `lineGap: 'kiss'`: it took the smaller of the two
  views' moves, so rows collided in the other view (this hid 28% of an i).
  It now takes the larger move: touching in one view, clear in the other.
- `layoutCells` `align: 'center'` for rows. A negative `overlap` with 'kiss'
  leaves a visible gap at the closest point.
- `bridgePieces` `lowWeight` / `levelWeight`: rods prefer level spots near the
  baseline, so they read like a thin broken underline.
- Report shows two families side by side: **Touching** (0.3 mm overlap, left
  rows; clean and solid; stems can merge; mostly zero-shadow hull joins) and
  **Spaced** (1.2 mm gaps, centred rows; no contact, every letter 100%
  visible; 5 level rods per layout, 2–5% extra shadow).
- No subagents used.

## 2026-09-26 (kiss spacing, letter visibility)

- Problem: fixed overlaps (0.2 × row height between cells, −0.06 em
  tracking) hid letters: in Finola × Bryan the least visible letter was 13–71%
  visible (I 13%, l 27%, L 71%) while coverage said 100%.
- `letterVisibility` (compose.js): the share of each letter not covered by other
  letters in its view. Cells now carry per-letter outlines (`glyphRun`).
- Kiss spacing: `glyphRun({ kiss })` inside chunks, and `layoutCells` with
  `gap: 'kiss'` between cells and `lineGap: 'kiss'` between rows. Each neighbour
  is placed to just touch, overlapping by `overlap` (0.3 mm) at the closest point
  of the per-height edge profiles. Rows must touch in both views and share z,
  so the tighter view overlaps more.
- Result (best per style): least visible letter 93–97% in 10/12 layouts. Lowercase
  and title with 3 rows nest their rows and hide 24–28% of an i. All 12 are one
  piece: 9 via hull blocks alone (zero extra shadow), 3 with one rod (≤1.4%).
  The cost: the lowercase/title i-dot is an island again (coverage ~93%).
- Report defaults: `--gap kiss --line-gap kiss --kiss 0.01`; stats show the least
  visible letter.
- No subagents used.

## 2026-09-26 (hull-aware joining, tracking)

- `join.js`: `fullHull` (whole words extruded and intersected; contains every
  solid whose shadows stay in the letters) and `hullJoin` (adds off-diagonal
  hull blocks, nearest first, across rows too, kept only if they cut the piece
  count; zero extra shadow by construction). Test: two cells meeting at an
  edge join with one block and no stray shadow.
- Letter tracking (`textContours` `tracking`, em; negative = touching) threaded
  through the word-pair search and layout; report `--tracking` (default −0.06)
  and `--join hull+bridges` (default).
- Finola × Bryan, Kanit Black, best per style: with tracking 0, hull joining
  alone fixed 1/12 layouts; at −0.06 em, 6/12 are one piece with zero extra
  shadow, the rest need 1–2 rods ≤4.1 mm (≤2.2% extra shadow), and every style
  reaches 100% (the title-case i-dot merges into the F). Piece counts equal the
  larger number of shadow parts in either view, as the responses predicted.
- Known issue: the fixed overlap between cells (0.2 × row height) swallows
  narrow letters ("FINOLA" reads almost "FNOLA"). Should be per-pair: just
  enough for neighbours to touch.
- No subagents used.

## 2026-09-26 (thin-feature check)

- `voxel.js`: `thinFeatures` finds material thinner than the minimum wall by
  voxel morphological opening (slice, then scanline voxelize, then three 3D
  Euclidean distance transforms). It reports residue reaching deeper than r past
  the opened surface, so ordinary sharp edges (~0.41 r of shaving) pass and
  wedges sharper than ~60° are flagged. About 2 s per 40 mm trip-let at 0.2 mm
  voxels. Manifold's exact Minkowski opening took 27–60 s.
- This answers the critique in `-pk3`: the erosion-split check misses thin
  appendages. It mattered for our own best GEB in Bungee: it has a 0.43 mm
  wall (verified on cross-sections) that the old check passed.
- CLI prints it for the best candidate; the page's print-check line includes it.
  Search ranking doesn't use it yet (too slow for every candidate).

## 2026-09-26 (external brief)

- `resources/communication/external/brief-2026-09-26.md`: a self-contained brief
  for outside models (context, what works, measurements, six questions).
  `open-questions.md` points to it; its Q1 (DP alignment) is marked done.
- Subagent ledger: one Fable agent fact-checked the brief against the repo and
  re-measured. **Earned its cost**: it caught a wrong explanation (the i-dot
  isn't lost for lack of ink in "Bryan"; it's paired with r, and pairing it
  with B strands it as a fragment), stale numbers (pieces 2–4 not 2–5; the plate
  joins 3 of 4 single-row layouts at 5–12%, not all at 7–12%), a conflated
  metric (Arial 7/16 is "sturdy", not "one piece"), and numbers from one
  configuration stated as general. I re-measured the plate numbers and the i-dot
  pairings myself before applying the fixes.

## 2026-09-26 (word pairs: speed, joining)

- Profiled the word-pair search: 93% of the time went to per-cell 3D builds counting
  fragments. `scan.js` now counts a two-view cell's pieces by scanline slicing
  (union-find across slices). It agrees with 3D on 444/450 random cells; the rest
  are resolution effects or dust-sized slivers (~0.004 mm³). One frame and cell
  cache are shared across rows and line splits. Finola × Bryan: 100.7 s → 1.6 s
  (chunks ≤2), 230 s → 7 s (≤3). The 3D check reports dust (<0.1% volume) apart.
- `join.js`: `basePlate` (slab under the bottom row, sunk 0.3 mm into the letters;
  faces that only touch stay separate pieces in Manifold), `bridgePieces` (rods
  along a minimum spanning tree of closest-point distances), `strayShadow`.
  Finola × Bryan, best per style: plate joins single-row layouts at 7–12% extra
  shadow (the bar). Bridges join every layout into one piece at ≤3% extra shadow,
  longest rod ≤8 mm (joining everything to the largest piece needed up to 30 mm).
- Report script: `--join none|plate|bridges|plate+bridges` (default bridges).
- No subagents used.

## 2026-09-26 (word pairs: exploration)

- Fixed manifold-3d JS `extrude` leaks (~0.4 MB per glyph extrusion), which had
  crashed long searches with "memory access out of bounds". `extrudeCentered`
  plus a regression test (mutation-checked).
- `compose.js`: solids as unions of cells (each a small trip-let in its own
  box), measured per view and per cell.
- `wordpair.js`: two words, front and right. For two views, coverage is exact
  2D arithmetic: a letter's ink at height z shows iff its partner has ink at z,
  and each connected blob covers one interval of heights. The search is a
  dynamic program over chunk pairings (sequence-alignment style) with a Pareto front of
  coverage / stretch / fragments / merged letters / lowercase count. Options:
  case (upper, lower, title, per-letter mixed), per-cell vertical fit (shared
  baseline or stretched to row height), rows (stacking). Per-cell fragments
  (e.g. stranded i-dots) come from a small 3D build, computed only for cells that
  survive the 2D pre-filter.
- `scripts/explore-words.js`: HTML report (3D + both shadows) of the best layout per
  style, written to `reports/` (gitignored).
- Findings (Finola × Bryan, Kanit Black): uppercase and per-letter mixed case
  reach 100% with no stretch (mixed: `FINoLA × BRYaN`); lowercase needs 40–80%
  stretch; title case loses the i-dot. Letters that merge into one chunk often
  leave floating fragments. A fixed overlap of 0.2 × height swallows narrow letters.
- `resources/communication/external/open-questions.md`: running list of
  questions for outside review.
- Subagent ledger: one Sonnet Explore agent read `../omelet-megatype`. **Cheap,
  and worth it for a clear no**: canvas-level scaling only, no license, nothing
  to port. That saved me reading the repo myself.

## 2026-09-26 (fonts, missing-parts toggle)

- Benchmark set: `test/fixtures/benchmark-words.json`, 16 triples using all 26
  letters (includes the hard L+T pair, round/straight/diagonal groups, a
  repeated letter, real words). `scripts/benchmark-fonts.js` scores fonts on it.
- Benchmarked 24 heavy Google Fonts plus Arial / Arial Black. Bundled 9 (OFL, unmodified)
  for score and variety of style. The default is now **Bungee** (16/16 sturdy, 99.9%
  mean worst-letter coverage). Archivo Black was mid-table (14/16, 97.1%) and
  stays for the parity fixtures. Details in `fonts/README.md`.
- Font picker on the page (outside Options); `--font <id>` and `--list-fonts` in the CLI.
- Fixed a crash: opentype.js `getPath` throws on some GSUB lookups (Black Ops One,
  Paytone One) for multi-character text. `textContours` now lays out glyphs
  itself (advance width + pair kerning; no ligatures).
- Page: a "Show missing parts" toggle hides the red areas and dashed outlines
  (remembered per browser). The e2e test covers the toggle and switching fonts.
- Noted: stretch-to-square fit turns condensed faces (Anton, Passion One) into wide ones.
- No subagents used.

## 2026-09-26 (Python port, printability, glyph symmetry)

- `py/`: Python port (manifold3d + fontTools). 26 tests pass, including
  the shared parity fixtures and its own "F" orientation tests; breaking its
  front view on purpose makes both fail. Symmetry dedupe not ported yet.
  GEB search: ~1.4 s (96 configs) vs JS ~3 s for the same 96.
- `thicknessCheck`: exact erosion by a ball (offset each silhouette by -r
  and rebuild), which reports whether a minimum wall thickness splits the solid.
  Shown in the CLI (`-t`, default 1 mm) and on the page. It's reported, not
  used for ranking, so the parity fixtures stay unchanged. Tested with a synthetic dumbbell.
- The search also folds each glyph's own D4 symmetries into the dedupe (I, H,
  O, D...). XOH: 96 → 11, best unchanged.
- Research: font choice dominates (table in `resources/research/approaches.md`).
- Subagent ledger: one Sonnet agent ported the core to Python. **Earned its
  cost**: it ran in parallel with the web and symmetry work, delivered a clean
  port on the first pass, and found real API differences (no centred extrude,
  row-major transforms, CrossSection's default fill rule). I re-ran its tests,
  reviewed the view/build/test code, and broke its front view on purpose to
  confirm the tests catch it. The shared fixtures turned "is the port right?"
  into a check I could run myself.

## 2026-09-26 (web, symmetry, test infra)

- Web app (`web/`): Vite + Three.js, search in a Web Worker. It shows the solid,
  snaps the camera so each letter reads upright (checked by screenshot for
  a 270°-turned top letter), draws each shadow over its target with missing
  area in red, and downloads STL.
- Search keeps one config per orbit of the 48 cube symmetries: upright
  96 → 24 configs, any 3072 → 64 (GEB 98 s → 2 s). The best result is unchanged
  in all 9 mode/word combinations tried. A test checks `applySymmetry` against
  actual transformed geometry for all 48.
- Test infra: shared parity fixtures (`test/fixtures/parity.json`, JS test +
  Python test), browser smoke test (`npm run test:e2e`), `npm run check`.
  There's no git remote yet, so no CI workflow; add one when there is.

## 2026-09-26 (JS core)

- `src/core/`: glyph outlines (opentype.js, curves flattened), view frames and
  D4 transforms, build (Manifold intersection of three centred, overshooting
  prisms), measure (coverage / missing / outside per view via `project()`,
  plus piece count), search (text-to-view permutations × transforms; ranked
  one-piece first, then worst-letter coverage). Binary STL export.
- `src/cli.js`: `shadow-hull GEB -o geb.stl`. Default font is Archivo Black (OFL, bundled).
- Tests (10): orientation checked with an "F" against hand-written viewer
  frames, and a deliberate mirror of the front frame is caught (mutation-checked);
  no shadow ever falls outside its target across transforms; GEB reaches 100%.
- Results: GEB 100% on all letters, one piece (96 candidates, ~3 s). AMY's
  worst letter is M at 94.8% (the unsearched Arial probe gave 62%).
- Known inefficiency: `--transforms any` tries 3072 combos (~17 s for AMY),
  many equivalent under cube rotations; dedupe later.
- No subagents used for this step.

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
