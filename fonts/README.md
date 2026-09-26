# Bundled fonts

All from [Google Fonts](https://github.com/google/fonts) (`ofl/`), under the
SIL Open Font License 1.1. Each license is next to its font. The files are
unmodified, so the Reserved Font Names in some licenses don't apply.
`fonts.json` lists them for the CLI (`--list-fonts`) and the web picker; the
first entry is the default.

Chosen by measurement, plus variety of style: `node scripts/benchmark-fonts.js DIR`
on the 16 triples in `test/fixtures/benchmark-words.json` (all 26 letters;
40 mm; best candidate per triple). "Sturdy" means one piece that also passes the
1 mm thickness check. Results from 2026-09-26 (26 fonts tried):

| Font | Sturdy | Mean worst-letter coverage | Lowest |
|---|---|---|---|
| Bungee | 16/16 | 99.9% | 99.5% |
| Passion One Black | 16/16 | 99.9% | 99.5% |
| Chango | 16/16 | 99.8% | 99.1% |
| Sigmar One | 16/16 | 99.8% | 99.2% |
| Kanit Black | 16/16 | 99.4% | 96.8% |
| Anton | 16/16 | 99.4% | 98.2% |
| Rubik Mono One | 16/16 | 99.2% | 96.9% |
| Alfa Slab One | 14/16 | 99.6% | 98.4% |
| Archivo Black | 14/16 | 97.1% | 86.6% (L-T-A) |

For comparison: Arial Black 15/16, 95.8%; Arial 7/16, 78.2%; Black Ops One
(a stencil face) 0/16, because its gaps are real gaps.
