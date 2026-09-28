// Build the arm-to-corner review page: node scripts/letterform-review/build.mjs <outDir>
// → <outDir>/pack.json, <outDir>/sheets/*.webp (3D before/after), <outDir>/arm-to-corner.html.
// Publish the HTML with the sheets as files (sheets/<font>.webp) and the db capability (marks).
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
const here = new URL('.', import.meta.url).pathname, out = process.argv[2];
if (!out) { console.error('usage: node scripts/letterform-review/build.mjs <outDir>'); process.exit(1); }
mkdirSync(out + '/sheets', { recursive: true });
execFileSync('node', [here + 'pack.mjs', out + '/pack.json'], { stdio: 'inherit' });
execFileSync('node', [here + 'render.mjs', out], { stdio: 'inherit' });
writeFileSync(out + '/arm-to-corner.html', readFileSync(here + 'template.html', 'utf8').replace('/*DATA*/null', readFileSync(out + '/pack.json', 'utf8')));
console.log('wrote', out + '/arm-to-corner.html');
