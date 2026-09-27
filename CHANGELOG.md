# Changelog

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
