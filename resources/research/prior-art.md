# Prior art & facts (2026-09-26)

Gathered by a Sonnet research subagent plus direct repo inspection. Items
marked *unverified* were not checked against primary sources.

## Generators

- **Lyl3, "Customizable Triple Letter Blocks Ambigram"** makes true trip-lets
  with an OpenSCAD customizer. It generates all 6 axis permutations and lets
  the user choose one (no solver). Author's notes say most combinations work,
  and L+T is the hardest pair. License *unverified*.
  https://www.thingiverse.com/thing:3633456 ·
  https://www.printables.com/model/253459-customizable-triple-letter-blocks-ambigram
- **ondras/3** is a GEB shadow-cube web generator (app.js/box.js/scene.js +
  `geb.scad` + Gotham Black font, PHP `create/` endpoint, Dockerfile). Demo at
  3.toad.cz. No license. Last real commits were in 2020.
  https://github.com/ondras/3
- **2CATteam/AmbigramGenerator** is MIT licensed and uses Three.js +
  Three-CSGMesh (BSP). It makes **two-view word** ambigrams, not trip-lets.
  Created 2020, last commit 2022-08. Its interesting idea: split each letter into
  hand-drawn *parts* (per-letter complexity score 1–3, `letters/NN-k.svg`) and
  pair parts across the two words at random. That lets words of different
  lengths pair up, and "looks cooler". The README says it can't detect floating
  pieces; the user has to "re-roll". Live: https://2catteam.github.io/AmbigramGenerator/
- **Lucandia/dual_letter_illusion ("TextTango")**: Python + Streamlit, any
  Google Font, STEP export, two views only. GPL-3.0 code.
  https://github.com/Lucandia/dual_letter_illusion
- printpal.io Text Flip: a two-word web tool with no source.

None of them check that the resulting shadows match the targets. That's the
gap this project can fill (see `approaches.md`: Manifold `project()` makes
the check cheap).

## Mitra & Pauly 2009, "Shadow Art" (ACM TOG 28(5), Art. 156)

- Uses the term **"shadow hull"**: the intersection of the generalized shadow
  cones of the input images.
- "Inconsistency is the rule rather than the exception for more than two
  shadow sources." They resolve it by **deforming the 2D input images**
  (as-rigid-as-possible, Igarashi et al. 2005) with constraints from the
  inconsistent pixels, in one global optimization, and then recompute the hull.
- PDF: https://www.cg.tuwien.ac.at/courses/CA/material/papers/ShadowArt.pdf
- Follow-ups that may have code (*unverified*): "Shadow Art Revisited"
  (differentiable rendering), "Neural Shadow Art" (arXiv 2411.19161).

## History / naming

- The July 1979 *Scientific American* piece on GEB was **Martin Gardner's**
  "Mathematical Games" column, not Hofstadter's (his "Metamagical Themas"
  started in Jan 1981). This corrects `initial-pz53.md`.
- "Trip-let" appears in GEB itself: MathWorld cites the cover and pp. xiv, 1,
  and 273 (1989 Vintage ed.). *Unverified against the book.*

## OpenSCAD status

Last stable release was 2021.01 (that Homebrew cask is disabled). Manifold
became selectable in nightlies from 2024-09-28 and is now the snapshot default.
`brew install --cask openscad@snapshot`; `--backend=manifold`.

## Font / letter guidance (thin)

Blocky, bold, monoline sans faces work best; high-contrast serif faces
collapse. This comes from general ambigram advice, not trip-lets specifically.
