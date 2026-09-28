// Build the arm-to-corner review page: node scripts/letterform-review/build.mjs <outDir> [--skip-render]
// → <outDir>/pack.json, <outDir>/sheets/*.webp (3D before/after thumbnails),
//   <outDir>/lib/{viewer.js, manifold.js, manifold.wasm} (interactive 3D viewer:
//   viewer.js bundles three.js; the solids are built in the page with manifold-3d),
//   <outDir>/arm-to-corner.html.
// Publish the HTML with the files printed at the end (published path → local path)
// and the db capability (marks). --skip-render keeps the existing sheets.
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, readFileSync, statSync, writeFileSync, readdirSync } from 'node:fs';
import { build } from 'vite';
const here = new URL('.', import.meta.url).pathname, R = new URL('../../', import.meta.url).pathname;
const out = process.argv[2]?.replace(/\/$/, '');
if (!out || out.startsWith('--')) { console.error('usage: node scripts/letterform-review/build.mjs <outDir> [--skip-render]'); process.exit(1); }
mkdirSync(out + '/sheets', { recursive: true });
mkdirSync(out + '/lib', { recursive: true });
execFileSync('node', [here + 'pack.mjs', out + '/pack.json'], { stdio: 'inherit' });
if (!process.argv.includes('--skip-render')) execFileSync('node', [here + 'render.mjs', out], { stdio: 'inherit' });

// The viewer: three.js bundled in (tree-shaken, minified); manifold-3d stays a separate
// file, loaded by viewer.js from next to itself, with its wasm.
await build({
  configFile: false, logLevel: 'warn', root: here,
  build: {
    outDir: out + '/lib', emptyOutDir: false, minify: true, copyPublicDir: false,
    lib: { entry: here + 'viewer.js', formats: ['es'], fileName: () => 'viewer.js' },
  },
});
for (const f of ['manifold.js', 'manifold.wasm']) copyFileSync(R + 'node_modules/manifold-3d/' + f, `${out}/lib/${f}`);

writeFileSync(out + '/arm-to-corner.html', readFileSync(here + 'template.html', 'utf8').replace('/*DATA*/null', readFileSync(out + '/pack.json', 'utf8')));
console.log('wrote', out + '/arm-to-corner.html');

const pack = JSON.parse(readFileSync(out + '/pack.json', 'utf8'));
const files = Object.fromEntries([
  ...pack.map((f) => `sheets/${f.id}.webp`),
  ...readdirSync(out + '/lib').sort().map((f) => `lib/${f}`),
].map((p) => [p, `${out}/${p}`]));
const size = (p) => statSync(p).size;
const total = Object.values(files).reduce((s, p) => s + size(p), size(out + '/arm-to-corner.html'));
console.log('\npage:', out + '/arm-to-corner.html');
console.log('files (published path → local path):');
console.log(JSON.stringify(files, null, 2));
console.log(`total ${(total / 1e6).toFixed(2)} MB (${Object.keys(files).length} files + page)`);
