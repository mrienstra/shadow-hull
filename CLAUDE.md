# shadow-hull

Generating "trip-lets" (GEB-cover solids): the intersection of three orthogonal
extruded silhouettes, so the solid casts a different letter/shape along each
axis. Several implementation approaches may be tried side by side (non-web
and/or web) before deciding which to keep.

## Layout

- `src/core/` — environment-neutral JS core (Node + browser; fonts passed in as
  ArrayBuffers, no fs). Build → project shadows → measure → search.
  View frames and the D4 glyph transforms are defined once in `views.js`;
  build and measure both use them.
  `symmetry.js` reduces the search to one config per cube-symmetry orbit.
- `src/core/design.js` — word-pair pipeline (search → build → join → measure →
  rank by `designQuality`) and the spacing families; shared by the report
  script and the web page.
- `src/cli.js` — Node CLI (`node src/cli.js GEB -o out.stl`, `--help`).
- `web/` — Vite + Three.js page; geometry runs in `worker.js` on the same core.
  `npm run dev` / `npm run build` (→ `dist/`).
- `py/` — Python port (manifold3d + fontTools), kept in parity with the JS core.
- `test/` — `npm test` (node:test). The "F" tests check reading orientation
  against viewer frames written independently of `views.js`; keep them independent.
  `test/fixtures/parity.json` holds reference numbers that every implementation
  must reproduce; regenerate with `npm run fixtures` only for intentional
  changes, and review the diff. `test/e2e/` drives the built page in local
  Chrome (playwright-core, no browser download).
  `npm run check` runs JS, e2e and Python suites.
- `fonts/` — bundled OFL fonts from Google Fonts + licenses; `fonts.json` lists
  them (first = default); `fonts/README.md` has the benchmark behind the choice.
- `scripts/benchmark-fonts.js` — score fonts on `test/fixtures/benchmark-words.json`
  (16 triples covering all 26 letters); reuse it when changing ranking/search.
- `resources/communication/external/` — original research write-ups (as received).
- `resources/research/` — research notes gathered while working; add to these
  when a finding is likely to be referred to again.
- `CHANGELOG.md` — dated log of what changed and why.
- `resources/backlog.md` — requests and ideas not yet started (owner requests marked).

## Environment

Node via fnm; in non-interactive shells first run
`eval "$(/opt/homebrew/bin/brew shellenv)" && eval "$(fnm env)"`.

## Working rules

- **Commit your own work at stopping points; don't ask first** unless
  something is uncertain, or you are waiting for a quiet moment while other
  sessions are mid-edit. A subagent reports; the session that spawned it
  checks the diff and commits.
- **You may use subagents without being asked.** Delegate breadth (a read
  across many files or sources where only the conclusion matters) and keep
  judgment and writing. Mechanical work you can verify from the diff doesn't
  need one. Before a claim lands in a reader-facing edit or outward artifact,
  have a fresh top-tier subagent check it against the sources, facts not
  judgement: re-running your own method reproduces your own blind spot. A
  subagent's finding, especially a count or a "zero hits", is a claim to
  re-measure, never a result. When you used one, say in your CHANGELOG entry
  whether it earned its cost and why — that ledger is how this default gets
  revised.
