# Lay of the land: what the tool can make, and how to reach it (2026-09-27)

An inventory made before reorganising the web UI. It covers what existed,
where the controls lived, and where the structure fought the user.

**Status (later on 2026-09-27):** the reorganisation in section 5 is done
in stages. There's a look menu with per-look knobs (the cube is a look), a
fast first result plus "More variants", thumbnails, plain-language checks, and
"allow stretching" as a knob. Sections 1–4 below describe the page *before*;
`test/looks.test.js` keeps every look in section 1 reachable. What's left:
see the end of section 5.

## 1. The looks we can make, and how to reach each today

| Look (plain description) | How to get it now (web) | Code |
|---|---|---|
| **GEB cube**: three letters, one per side, in a cube | Three letters tab (default) | `triplet.js`, `search.js` |
| **Pairs in a row on a stand** (TextTango-style: one shape per letter pair, e.g. S+W, T+O…) | Two words → tick *Word chains* → Options: *spaced* family, rows 1 → Finish: *Display stand* + *Turn 45°* | chain `wordpair.js` + `displayStand` + `turn` |
| **Pairs on a diagonal** (same object, not turned; the "chain") | Two words → *Word chains*, any family, rows 1 | `wordpair.js` |
| **Two or three rows of pairs** | *Word chains* → Options: rows 2 / 3 | `wordpair.js` |
| **Grid** (letters in columns, equal rows: FIN / OLA) | *Word chains* → Options: *grid* / *grid, mono* family | `gridRows` |
| **Tower**: one letter pair per row | *Word chains* → Options: *column* / *column, touching* family | `column` family |
| **Tower with a tall letter** (drop-cap) | *Column with a tall letter* section | `column.js` spans |
| **Stacked tower** (shorter word's letters all taller) | *Stacked columns* section (default) | `stackedColumnCells` |
| **Heart-shaped tower** (tower seen from above is ❤) | *Stacked columns* section (the "+ ❤" items) | `searchTopFit` |
| **Whole-word block** (FINOLA across the front, BRYAN across the side) | *Blocks* section (default), "top none" | `block.js` |
| **Heart slab** (whole-word block cut to ❤ from above) | *Blocks* section, "top ❤" items; other shapes via Options → *Top shapes* | `block.js` + Noto Emoji |
| **Angled block** (side word read from 45–75° round) | *Blocks at other view angles* section; angles in Options | `viewAtAzimuth` |

Several looks can only be reached as a *side effect* of a section plus options
plus finish: the pair row needs four separate controls.

## 2. Controls today (web)

**Shared (top of the left column):** mode tabs · bundled font picker · any
Google Font (+ weight) · (Three letters only, under Options: upload a font).

**Three letters:** 3 letter boxes · Options: size, fit (stretch / keep
proportions), orientations (upright / any / as given), min. thickness, try
every letter-to-side assignment, prefer one piece · Generate · ranked list.

**Two words:** 2 word boxes · the *Debris* note · **Finish** (stand, turn ×45°)
· **Designs to generate** (5 section checkboxes with timings) · Options:
chain families (6), letter case (4), rows (1–3), top shapes (text), view
angles (text) · Generate / Everything / Stop · list grouped by section.

**Viewer (both):** Front / Right-or-Side / Top / 3/4 · colour by view ·
Share link · Download STL. **Shadows panel:** show missing parts · pieces and
size line · (words) stats line · one panel per view.

## 3. What applies to what (Two words)

| | case modes | rows | spacing (touching / spaced) | top shape | view angle | stand / turn |
|---|---|---|---|---|---|---|
| Chains (6 families) | all 4 | 1–3 | per family | – | – | ✓ |
| Blocks | upper / lower / title (fixed set) | 1 | touching only | ✓ | 90° only | ✓ |
| Angled blocks | upper / title (fixed set) | 1 | touching only | – | ✓ | ✓ |
| Tall-letter column | upper only | = longer word | both (fixed) | ✓ (via Stacked section) | – | ✓ |
| Stacked column | upper only | = longer word | touching only | ✓ | – | ✓ |

The Options panel's case, rows and families apply **only to chains**; blocks,
angles and columns ignore them and use fixed internal sets.

## 4. Where the structure fights the user

1. **Organised by technique, not by look.** Sections ("Word chains",
   "Blocks", "Column variants") and families ("touching", "grid", "column")
   are implementation groupings. A user thinks "letters in a row", "a tower",
   "a heart".
2. **The same words mean different things.** "Column" is a chain family
   *and* two separate sections. "Touching/spaced" appear as chain families, as
   span-column options, and implicitly (blocks are always touching).
3. **Hidden coupling.** Options affect only one section. Top shapes and
   angles only affect blocks. Finish options apply only after selecting.
4. **Defaults hide the most classic look.** Chains (pairs in a row) are off
   by default ("slow, minutes"), but a single family with one row and one case
   takes about 2 s.
5. **The list is text-only.** Titles like "upper, 1 row" or "spaced,
   drop-cap" don't show what the object looks like; there are no thumbnails.
6. **Jargon in results:** "quality", "most contact", "stretch", ↕, "·" and
   "/", "hull blocks". Explained only in the report and tooltips.
7. **Two paradigms.** Three letters is search then pick; Two words is
   generate a gallery then pick. The viewer differs slightly: Right vs Side,
   shadows captions.
8. **The ranking's taste is baked in.** For STOP × WORK (spaced) it picked
   every letter stretched to the row height (↕). Whether a user would choose
   that is unclear, and there's no way to say "don't stretch".
9. **Timing is opaque.** "Everything" takes minutes; "~20 s" hints are
   static guesses per section.

## 5. Directions to consider (not decided)

- **Pick a look first**: a small visual menu (cube · pairs in a row ·
  grid · tower · block · heart…) with a thumbnail each. Each look then shows
  only its own knobs: spacing, case, rows, shape, angle, stand.
- **One vocabulary**: arrangement (row of pairs / grid / tower / block),
  spacing (touching / gapped), letters (case, stretch allowed?), extras (shape
  on top, stand, angle).
- **Fast first result, refine on demand**: generate one good design per look
  quickly, then offer "more variants" for that look.
- **Thumbnails in the list** (render each design small), grouped by look.
- **Plain-language metrics**: "all letters fully visible", "3 letters touch
  neighbours", "needs 5 support rods", instead of numbers.
- **Explicit taste controls**: allow stretching yes/no, prefer one piece,
  prefer compact.
- **Three letters as just another look** ("cube") in the same flow.

Done: look-first menu, one vocabulary, fast first result + more variants,
thumbnails, plain-language checks, stretch as a knob, cube as a look.
Not done / open: a "prefer compact" or "fewer supports" preference; the
cube's own options still use the old wording (fit, orientations); the report
script still groups by the old sections (it uses `gallery.js`, not looks).

## 6. Other entry points (for reference)

- CLI (`src/cli.js`): three letters only.
- Report (`scripts/explore-words.js`): every Two-words look, via
  `generateGallery` (the same code as the web page). `--sections` picks
  groups.
- Share links (URL hash) carry the mode, font, inputs, options, finish and
  the selected design.
