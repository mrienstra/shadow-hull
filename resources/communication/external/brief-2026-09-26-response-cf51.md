Good brief. The one thing I'd push on before the six questions is a structural observation that reshapes several of them:

**The full-word hull is the maximal zero-cost solid.** Extrude the whole front word along Y, the whole side word along X, intersect: call it H. *Any* solid whose shadows lie inside the letter ink is a subset of H, so every "hidden connector" lives in H, and H itself has the best possible coverage of any layout (each letter shows at every height where the *other word* has ink anywhere). Your diagonal chain is H restricted to the diagonal blocks X_i × Y_i of the n×m chunk grid. Off-diagonal blocks X_i × Y_j are free material: zero extra shadow in either view, by construction. The design space is "which blocks (or partial blocks) of H to keep", trading footprint and mass against coverage and connectivity. That reframes Q1, Q4 and Q6.

Because both views share z, H's topology is also a 2D computation: at each height, the slice is (ink intervals of front word) × (ink intervals of side word), and components merge as z moves. So H's connected components are the components of the fiber product of the two silhouettes' Reeb graphs over z — union-find over rasterized rows, exact, milliseconds. I'm fairly confident this is right; worth a quick check against a 3D boolean.

## 1. Hidden connectors

1. **Existence test is cheap and usually negative.** A connector between two pieces with zero extra shadow exists iff the pieces lie in the same component of H. A gap column between two letters in *either* word is an empty slab through all of H, so separately-spaced letters can never be hidden-connected, and an island in a silhouette (the i-dot) is a 3D island, full stop: piece count ≥ number of components of each actual shadow. Your 2–4 pieces for six-letter words tells me those layouts already have letters touching; that's the only reason it isn't 6.
2. **Finding rods inside H.** Erode both silhouettes by the rod radius r, rebuild H_r, voxelize, run Dijkstra/MST between pieces inside H_r, then sweep a ball of radius r along the path. The erosion trick you already have guarantees the rod stays inside H, so the shadow is exactly unchanged.
3. **Half-hidden connectors.** A rod confined to letter i's front ink but crossing the side gap is invisible from the front and reads as a thin bridge from the side. Choose its height where both side neighbours have ink adjacent to the gap (crossbar or baseline height) and it reads as a ligature or underline rather than a defect. The base plate is the special case of this.
4. **Steer the search, yes.** Since piece count is exact 2D arithmetic, put it in the Pareto front directly instead of repairing afterwards; better, add "letters touch" as a layout move (negative tracking, ligature-rich or connected fonts, unicase). The i-dot can't be saved by a connector; the fix is a glyph whose tittle is attached, a dotless i, or a partner with ink at dot height (your B pairing) plus H-connectivity to the B cell through an off-diagonal block, which is zero extra shadow.

## 2. Repairing conflicting letters

Coverage conflicts are entirely vertical: letter A paired with B loses exactly the ink of A at heights where B is empty. So the repair problem is 1D.

1. **Vertical dynamic time warping** of the two letters' ink-by-height profiles (Sakoe & Chiba 1978), with slope bounds so nothing stalls, and slope forced to 1 inside horizontal-stroke bands. Output is a piecewise-linear z-warp per letter with knots at feature lines (baseline, x-height, cap, ascender, descender, tops/bottoms of crossbars). That is "move x-height / shift ascenders" done systematically, and it preserves horizontal stroke thickness, which uniform stretch does not.
2. **Variable-font axes first.** Weight and width are designer-sanctioned deformations; heavy weights also widen every z-profile, which is why Bungee wins. Some families expose x-height or ascender axes.
3. **Alternates**: stylistic sets, small caps, swashes, unicase, single-storey vs double-storey a/g. Discrete, lossless, cheap to enumerate.
4. **Adding ink** (extend a serif or terminal to reach the partner's height) is often more legible than deleting it.
5. ARAP last: it has no notion of stroke.

Measuring legibility: run a font-agnostic recognizer (Tesseract, or a small CNN trained on rendered glyphs from a few thousand Google Fonts) on the *actual rendered shadow*, and score confidence and confusion with neighbours (i/l, O/D, E/F). That unifies coverage, warp and connectors into one number: 93% coverage that drops a dot is not the same as 93% that drops a crossbar. For a geometric proxy, change in stroke contrast (horizontal ÷ vertical stroke width) is the classic typographic sin, and uniform vertical stretch by s changes it by exactly s. For "how far from a real font" there's the font manifold of Campbell & Kautz (SIGGRAPH 2014).

## 3. Ranking

- Treat piece count, min thickness and loose slivers as hard constraints, then rank by a single legibility score per view (worst letter), then compactness. Coverage rounded to 0.5% then stretch is measuring the wrong thing: 3% vs 79% stretch is a huge perceptual gap that a tie-break can't express.
- Stretch penalty should be |log s|, weighted by how much horizontal-stroke ink the letter has (a stretched l is fine; a stretched E is not). Tolerance is font-specific: monoline sans tolerates more.
- "Merged letters" isn't uniformly bad; a ligature is merged on purpose. Score it as a legibility hit, not a count.
- Keep the Pareto front and expose two or three weight sliders; defaults are guesses about taste.

## 4. Layouts

1. **Block selection on the n×m grid**, not just the diagonal. A front letter can pair with two side chunks at different y; its front shadow is the union, so coverage improves at zero shadow cost. Partial blocks (the dot of i paired with B only at dot height) are the fine-grained version. Pitfalls: footprint, slivers that fail the thickness check, and the object stops reading as a chain. AmbigramGenerator's random stroke pairing is exactly partial-block selection with no alignment constraint, which is why it looks jumbled.
2. **Unequal rows**: the shorter word in one tall row, the longer in two stacked rows, so each side letter pairs with two front letters. Height is shared but row structure needn't be.
3. **Width axis** of a variable font to match word lengths instead of chunking unevenly.
4. **Design the top view too.** The chain's footprint is what a viewer sees from above; a staircase or a plus reads as intended, a random block subset does not.

Designed vs jumbled, in my experience: one baseline and one cap-height per view, consistent stroke weight (no thinned strokes from stretch), connectors that look like type features, few pieces, and a footprint with a nameable shape.

## 5. Non-orthogonal views

Views at angle θ in the horizontal plane still share z, so every height-slice argument survives unchanged; slices become parallelograms instead of rectangles. The thickness check also survives for any θ (erosion distributes over intersection, and a ball's shadow along either axis is still a disk). What changes:

- Cell positions couple: solving p·s₁ = a_i, p·s₂ = b_i is always possible, but the footprint stretches ∝ 1/sin θ and cell aspect ratio degrades the same way. Below ~45° slivers and thin walls become the problem.
- Both words already sit at varying depth in a chain, so real eyes (not parallel light) see perspective misalignment; small θ makes the depth spread worse. Scale cells slightly by depth if the object is for looking at rather than shadow-casting.
- For two words, 90° is simply best. Three words all in the horizontal plane want 60° spacing (hexagonal slices, walk-around viewing); a top word instead keeps the 90° footprint but loses the shared-axis shortcut.

## 6. Search at scale

1. **Precompute pair tables.** For a font, coverage of every letter pair × orientation × stretch bucket is a small table, reusable across all words. With the top word added, cells are 3D booleans, but memoized per triple; DP over three-way alignment is O(n³) states, trivial for names.
2. **ILP for block selection** with connectivity as flow constraints and legibility as a linear objective over precomputed block scores. Solvers handle a 10×10 grid instantly; this is the natural home for Q1/Q4.
3. **Beam search** once DP state grows (connectivity state, coupled stretch); keep it wide on the Pareto front.
4. **Annealing or CMA-ES** only for the continuous tail: per-cell stretch, warp knots, spacing.
5. **Learned heuristics**: not worth it; the exact tables are cheap. SAT only fits if you binarize everything, and coverage is not binary.
6. **Bound from H**: a letter that can't reach target coverage in H can't reach it in any layout, so it needs deformation, not more search.

One related reference: the differentiable-rendering follow-up to Mitra & Pauly (I believe "Shadow Art Revisited", WACV 2022) optimizes the solid directly against target images; heavier than you need, but useful for the deformation case.
