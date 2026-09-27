# shadow-hull

Make solids whose shadows read as letters, words or shapes from different
sides, like the carved blocks on the cover of Douglas Hofstadter's
*Gödel, Escher, Bach*, which cast "G", "E" and "B" along three axes.

**Try it online: https://mrienstra.github.io/shadow-hull/**

Also known as: **trip-lets** (Hofstadter's name), **visual hulls** or
**shadow hulls**, **shadow art** and **shadow sculptures**, **3D ambigrams**,
**dual-letter illusions** or **triple-letter blocks**, and, in computer vision,
**shape from silhouette**. In CAD terms it's a boolean intersection of extruded
silhouettes.

## What it does

- **Three letters, one per axis** (the GEB block). It tries every assignment
  of letters to sides and every allowed flip and turn, removes duplicates using
  the cube's symmetries, and ranks results by how much of each letter the
  shadow actually shows.
- **Two words, read from the front and the side** (e.g. "Finola" and "Bryan";
  see [Example words](#example-words)). Layouts include diagonal chains of
  letter pairs, grids, single columns, tall "drop-cap" letters, stacked columns,
  whole-word blocks (optionally with a shape such as ❤ seen from above), and
  side views at angles other than 90°. The best way to pair up the letters is
  found by dynamic programming, using an exact 2D shortcut for coverage.
- **Printability**: it joins loose pieces with zero-shadow blocks taken from
  the full hull, or with short rods, and checks for walls and fins thinner
  than a minimum thickness. Optionally it adds a rounded **display stand**
  and turns the object 45° so both words face the front.
- **Legibility measures**: coverage per letter, how much of each letter is
  hidden by its neighbours, and how much it touches them (merged stems).
- Faces can be coloured by the view that carved them.

Geometry uses [manifold-3d](https://github.com/elalish/manifold) (robust mesh
booleans) and [opentype.js](https://github.com/opentypejs/opentype.js) for font
outlines. A Python port of the three-letter core lives in `py/`.

## Quick start

```sh
npm install
npm run dev            # web page: "Three letters" and "Two words" modes
npm test               # unit tests (npm run check also runs browser and Python tests)

node src/cli.js GEB -o geb.stl                 # three letters, best result as STL
node src/cli.js --list-fonts
node scripts/explore-words.js Finola Bryan     # HTML report of every look's variants → reports/
```

The web page keeps its state in the URL, so "Share link" gives a link that
reopens the same design.

## Fonts

Nine heavy display fonts from Google Fonts, plus Noto Emoji for shapes, all
under the SIL Open Font License (see `fonts/README.md` for how they were
chosen). The web page can also load **any Google Font** by name (TTF files via
[Fontsource](https://fontsource.org/)), and any TTF/OTF can be uploaded.

## Papers and prior work

- Niloy J. Mitra and Mark Pauly, *Shadow Art*, ACM Transactions on Graphics
  28(5), SIGGRAPH Asia 2009 ([paper](https://www.cg.tuwien.ac.at/courses/CA/material/papers/ShadowArt.pdf),
  [DOI](https://doi.org/10.1145/1618452.1618502)). Uses the term "shadow hull" and
  deforms inconsistent silhouettes until they agree.
- Aldo Laurentini, *The Visual Hull Concept for Silhouette-Based Image
  Understanding*, IEEE TPAMI 16(2), 1994 ([DOI](https://doi.org/10.1109/34.273735)).
- [Trip-let on Wolfram MathWorld](https://mathworld.wolfram.com/Trip-Let.html).
- Maker tools: Lyl3's [Customizable Triple Letter Blocks Ambigram](https://www.thingiverse.com/thing:3633456)
  (OpenSCAD), [ondras/3](https://github.com/ondras/3) (GEB shadow cube
  generator), [2CATteam/AmbigramGenerator](https://github.com/2CATteam/AmbigramGenerator)
  (two-word ambigrams from letter parts), and
  [Lucandia/dual_letter_illusion](https://github.com/Lucandia/dual_letter_illusion).

## Example words

"Finola" and "Bryan", used in examples and tests, are the lead agents in NBC's
sci-fi series *Debris* (2021): Finola Jones and Bryan Beneventi.

## License

MIT (see `LICENSE`). Bundled fonts keep their own OFL licenses.
