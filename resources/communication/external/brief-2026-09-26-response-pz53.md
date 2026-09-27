I read the brief — it's a genuinely well-built piece of work, and two of the foundations (the exact 2D cell arithmetic from the shared-z observation, and the erosion-distributes-over-intersection thickness check) are the kind of results I'd want to keep no matter what else changes. My main structural criticism: connectivity is treated as a repair pass when it can be reasoned about exactly, and the coverage metric is area-uniform when legibility research says it shouldn't be. Thoughts on each question below; speculation is flagged.

## Q1: Hidden Connectors

There's a clean answer here, and it's provable. A connector is invisible from view \(v\) only if every one of its points projects into \(\mathrm{ink}_v\) — that is, only if it lies inside the extrusion tube of \(\mathrm{ink}_v\). So any hidden connector must be a subset of the visual hull \( V = \bigcap_v \mathrm{extrude}(\mathrm{ink}_v) \). Two consequences:

- **Per-cell, the answer is often "no."** If a cell's own hull is disconnected, no invisible connector exists inside that cell — your 2–4-piece results are locally unfixable without visible shadow. Extra shadow there is forced, not a search failure.
- **Globally, the answer is often "yes" — and you're not checking it.** You note that in the chain, neighbours can only add shadow, so per-cell coverage is a lower bound. The same applies to connectivity: the global hull (front word extruded, side word extruded, intersected) can connect cells that are locally separate, because the diagonal chain gives cell *i*'s front chunk and cell *i+1*'s side chunk overlapping z-ranges and overlapping footprint. Compute the global hull's connectivity before paying for rods.

The global hull is cheap to reason about exactly. With your coordinates, \( V = \{(x,y,z) : (x,z) \in A,\ (y,z) \in B\} \), so the slice at height \(z\) is the product \(X(z) \times Y(z)\) of two 1D interval sets. Components can only merge or split at blob boundaries, and there are only O(#blobs) events in a z-sweep — connectivity of \(V\) is decidable essentially for free, consistent with volume-intersection constructions generally. A minimal invisible connector is then a shortest thick path inside \(V\) between pieces (grid BFS at 1 mm on an 85 mm object is ~10⁶ cells, trivial), with your existing erosion check reused to guarantee the rod survives the nozzle. [ias.ac](https://www.ias.ac.in/public/Volumes/sadh/018/02/0325-0336.pdf)

The i-dot is exactly this: a vertical column is available iff some z-interval has partner ink covering the dot's y-range while front ink covers its x-range. So yes — **connectivity should steer the search**, in two tiers: a hard filter (global hull connected) and a soft DP term (whether adjacent cells' hulls actually touch, which is a 2D interval test per boundary). I'd fold it in rather than repair afterwards; you're already carrying a Pareto front, and "connected with zero extra shadow" is the best state on it.

## Q2 and Q3: Legibility and Ranking

For deformations, ranked by how well they preserve legibility, using what the type-legibility literature actually says matters — mid-segments and stroke junctions are the strongest cues for letter identification, terminals are not critical, and larger x-height, open counters, and uniform stroke weight all help: [legible-typography](https://legible-typography.com/en/5-overview-of-research-type)

1. **Alternate glyphs** — stylistic sets, small caps, and swapping weight within a family are "deformations" the type designer already validated. Search font-space before outline-space.
2. **Vertical-metric-only moves** — raising x-height, shifting ascenders/descenders, shared per-row stretch. These leave stroke geometry untouched.
3. **Uniform horizontal scale** — preferably by substituting the family's condensed cut if one exists, rather than ad-hoc squeezing.
4. **ARAP-style free deformation — avoid.** It's the right tool for photographs, not outlines; it breaks stroke weight and curve quality, which for type are exactly what carries identity. This is where I'd depart from Mitra & Pauly's pipeline .

One warning specific to your project: heavy faces maximize coverage, but bold fonts with high stroke contrast measurably impair letter recognition, and Bungee/Kanit Black live on that edge — check that counters stay open. [sciencedirect](https://www.sciencedirect.com/science/article/pii/S0003687021001460)

For a distortion measure, there is no single accepted principled metric for type, so say so plainly — but a good composite is: **perimetric complexity** \(p^2/a\), the standard proxy for identifiability, measured on the rendered shadow versus the source glyph; junction and mid-segment survival (count them on the ink skeleton before/after); counter-area ratio; and stroke-width histogram via a distance transform on the skeleton. A pragmatic end-to-end proxy: render the shadow at print scale and run OCR (or a small classifier trained on font renders) — crude, but it catches the failures that area-coverage misses. [legible-typography](https://legible-typography.com/en/5-overview-of-research-type)

That last point is my main answer to Q3: **your coverage metric is area-uniform, but legibility isn't.** Losing 2% of a stem junction is worse than losing 10% of a terminal. Weight the coverage (and extra-shadow) penalty by proximity to skeleton junctions and mid-segments. Otherwise your ranking (loose fragments → coverage → stretch) is sound; two adjustments — rank fragments *after* connector repair so a hidden-rod-fixed i-dot isn't penalized, and weight extra-shadow pixels by whether they bridge a counter or merge adjacent letters rather than by raw area.

## Q4 and Q5: Layouts and Angles

Layout ideas beyond chains and stacked rows, ranked by promise (partly speculative, grounded in typographic practice):

- **Closed rings** — wrap the two words around a square or annular ring so the chain closes on itself. A closed loop is inherently one piece and print-stable, and the silhouette is compact and symmetric.
- **Cube-face wrapping** — the literal GEB homage: three words on three faces of a cube, each word small enough to sit on one face. This is the "designed" look for three words, and it naturally constrains chunking to equal counts per face.
- **Serpentine rows** — turn the chain at word ends to fill a square footprint instead of a long diagonal.
- **Mirrored row interlock** — alternate stacked rows rotated 180°, so one row's ascenders occupy the next row's descender space. Uses the dead space above x-height.
- **Weight mixing within one family** — light and heavy rows share skeletons (legibility preserved) while giving visual hierarchy.

On "designed rather than jumbled," I'd say it's mostly three things: one shared stretch factor rather than per-letter stretch, roughly uniform inter-letter rhythm in every view, and a *small vocabulary* of transforms applied consistently. This is the same argument behind display typography, and it's also why per-letter case mixing like `FINoLA` reads as jumbled unless there's a rule. For curation itself, an interactive genetic-algorithm loop — show candidates from the Pareto front, let the user select, breed the next generation — is a well-trodden and pleasant mechanism for exactly this kind of aesthetic filtering. The ambigram tradition (Langdon, Kim — stroke pairing across words by hand) is your design precedent here; stroke-level pairing as in AmbigramGenerator is the automated version, but random pairing is what makes its results look jumbled. [archives.iw3c2](https://archives.iw3c2.org/www2002/CDROM/poster/57/)

For Q5, the key structural fact is nice: since your extrusions are horizontal, every face of the hull is a vertical plane regardless of the azimuthal angle between views. So printability for two words is essentially angle-independent — the only overhangs ever come from a top-facing word. What changes at angle \(\theta\): the slice at height \(z\) becomes an oblique product of the two interval sets (a skewed parallelogram tiling instead of rectangles), the shared-z coverage logic survives intact, but neighbouring cells overlap more as \(\theta\) shrinks, so your per-cell lower bound gets looser and 3D re-measurement of finalists matters more. My recommendation: **for three words, don't use three orthogonal axes — use three views at 120° in azimuth, all sharing the vertical axis.** You get dihedral symmetry (search reduction), a triangular-prism object that stands on a table with all three words readable from around it, and no view forced to be the floor-looking-up one. Speculative on aesthetics, but the geometry supports it fully.

## Q6: Search at Scale

Ranked, for three words / longer names:

1. **Large-neighborhood search over your existing DP** — fix two words' chunking, re-run the exact DP for the third, iterate. Cheapest to build on what you have, and per-cell evaluation is already milliseconds, so the inner loop is free.
2. **CP-SAT (OR-Tools, open source)** — encode chunk boundaries, case, and orientation as integer variables with interval-arithmetic coverage constraints, staged lexicographic optimization for your multi-objective. Its superpower is *infeasibility certificates*: it can prove no layout achieves 100% worst-letter coverage, which tells you when to start deforming letters instead of searching harder. (WASM availability in the browser is the open question — I'd run it server-side or as a CLI stage.)
3. **Beam search** over chunk boundaries with exact per-cell evaluation — simplest scalable fallback, parallelizes trivially.
4. **Simulated annealing / GA** — fine for the continuous polish variables (spacing, stretch), weak for proving anything; combine with interactive curation. [archives.iw3c2](https://archives.iw3c2.org/www2002/CDROM/poster/57/)
5. **Learned heuristics — skip.** Your evaluation function is cheap and exact; learning would add noise, not capability.

Pitfalls: lexicographic objectives need staging in CP-SAT; keep symmetry breaking (you already have the cube group machinery); and cap the Pareto front — with more objectives per state it grows multiplicatively and dominates runtime.

If I had to pick one next step: implement the global-hull connectivity check and the junction-weighted coverage metric. Both are cheap, both are exact, and together they turn your two weakest post-hoc stages (rod repair, area-uniform scoring) into first-class citizens of the search.