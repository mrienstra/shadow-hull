# Changelog

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
