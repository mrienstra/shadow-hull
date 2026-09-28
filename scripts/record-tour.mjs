#!/usr/bin/env node
// Record the viewer's tour (tour=1) of one design to an MP4 or GIF, frame by
// frame with deterministic time: the page's window.__tour.seek(t) places the
// camera and renders, the script screenshots the viewport and pipes the PNGs to
// ffmpeg. An --out ending in .gif (or --gif) writes a looping GIF, scaled down to
// --gif-width with one palette for the whole clip. --bg, --front, --right and
// --top recolour the background and the faces carved by each view (CSS colours);
// with any of those the fill light loses its blue tint. --light scales the lights.
// White faces need about --light 3 to read as white (e.g. --bg '#808080' --right white
// --front black --light 3).
//
//   npm run record-tour -- [--a Finola] [--b Bryan] [--look row] [--knobs '{"stand":false,"supports":"none"}']
//                          [--hash '<full hash>'] [--url http://localhost:5173/] [--fps 30]
//                          [--width 1920] [--height 1080] [--move 2] [--pause 0.6] [--tilt 0]
//                          [--plain] [--bg '#888'] [--front black] [--right white] [--top ...] [--light 1]
//                          [--out out/tour.mp4 | --gif [--gif-width 720]]
//
// Without --url it builds the page (vite build) and serves it with vite preview.
// Uses the locally installed Chrome (playwright-core, channel 'chrome').
import { parseArgs } from 'node:util';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { chromium } from 'playwright-core';

const { values: o } = parseArgs({
  options: {
    a: { type: 'string', default: 'Finola' },
    b: { type: 'string', default: 'Bryan' },
    look: { type: 'string', default: 'row' },
    knobs: { type: 'string', default: '{"stand":false,"supports":"none"}' },
    hash: { type: 'string' },
    url: { type: 'string' },
    fps: { type: 'string' }, // default 30, or 20 for a GIF (GIF delays are whole centiseconds)
    width: { type: 'string', default: '1920' },
    height: { type: 'string', default: '1080' },
    move: { type: 'string', default: '2' },
    pause: { type: 'string', default: '0.6' },
    tilt: { type: 'string', default: '0' },
    plain: { type: 'boolean', default: false }, // don't colour by view
    bg: { type: 'string' },
    front: { type: 'string' }, // defaults are the page's: front orange, right blue, top purple
    right: { type: 'string' },
    top: { type: 'string' },
    light: { type: 'string', default: '1' }, // light intensity multiplier
    out: { type: 'string' },
    gif: { type: 'boolean', default: false },
    'gif-width': { type: 'string', default: '720' },
    ffmpeg: { type: 'string', default: '/opt/homebrew/bin/ffmpeg' },
    help: { type: 'boolean', short: 'h', default: false },
  },
});
if (o.help) {
  console.log('Usage: npm run record-tour -- [--a Finola --b Bryan --look row --knobs JSON | --hash HASH] [--url URL] [--fps 30] [--width 1920 --height 1080] [--move 2 --pause 0.6 --tilt 0] [--plain] [--bg C --front C --right C --top C] [--light 1] [--out out/tour.mp4 | --gif [--gif-width 720]]');
  process.exit(0);
}
const out = resolve(o.out ?? (o.gif ? 'out/tour.gif' : 'out/tour.mp4'));
const gif = o.gif || /\.gif$/i.test(out);
const fps = Number(o.fps ?? (gif ? 20 : 30)), width = Number(o.width), height = Number(o.height);

let hash;
if (o.hash) {
  hash = new URLSearchParams(o.hash.replace(/^#/, ''));
} else {
  hash = new URLSearchParams();
  hash.set('look', o.look); hash.set('a', o.a); hash.set('b', o.b); hash.set('k', JSON.stringify(JSON.parse(o.knobs)));
}
hash.set('tour', '1');

let server = null, base = o.url;
if (!base) {
  const { build, preview } = await import('vite');
  console.log('Building the page…');
  await build({ logLevel: 'warn' });
  server = await preview({ preview: { port: 0, strictPort: false }, logLevel: 'silent' });
  base = server.resolvedUrls.local[0];
}
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${base.replace(/#.*$/, '')}#${hash}`);
  console.log(`Page: ${page.url()}`);
  // Wait until the look has finished generating and the first design is built.
  await page.waitForFunction(
    () => /in [\d.]+ s/.test(document.querySelector('#words-status').textContent) && window.__tour?.ready,
    null, { timeout: 300_000, polling: 250 },
  );
  if (errors.length) throw new Error(errors.join('\n'));
  // The swing timing inputs (hidden until Swing or Tour plays) set the tour's timing.
  await page.evaluate(({ move, pause, tilt }) => {
    Object.assign(document.querySelector('#swing-secs'), { value: move });
    Object.assign(document.querySelector('#swing-hold'), { value: pause });
    Object.assign(document.querySelector('#swing-tilt'), { value: tilt });
  }, { move: o.move, pause: o.pause, tilt: o.tilt });
  if (!o.plain) await page.check('#colour-faces');
  const faceColours = Object.fromEntries(['front', 'right', 'top'].filter((k) => o[k]).map((k) => [k, o[k]]));
  await page.evaluate(({ m, scale }) => {
    window.__tour.faceColours(m);
    window.__tour.lighting({ scale, neutral: Object.keys(m).length > 0 });
  }, { m: faceColours, scale: Number(o.light) });
  // Only the 3D view, filling the window, on the panel's background.
  await page.addStyleTag({ content: `
    #viewport { position: fixed !important; inset: 0 !important; z-index: 1000; min-height: 0 !important;
      background: ${o.bg ?? 'var(--surface)'} !important; }
    body { overflow: hidden !important; }
    header, main > section:not(.viewer), .toolbar { visibility: hidden !important; }` });
  await page.waitForFunction(({ w, h }) => {
    const c = document.querySelector('#viewport canvas');
    return c.width === w && c.height === h;
  }, { w: width, h: height });
  const { duration, stops } = await page.evaluate(() => ({ duration: window.__tour.duration, stops: window.__tour.stops() }));
  console.log(`Stops: ${stops.map((s, i) => `${i + 1}. ${s.wide ? 'all of ' : ''}${s.text} (${s.view === 'front' ? 'front' : 'side'})`).join(', ')}`);
  const frames = Math.round(duration * fps);
  console.log(`Duration ${duration.toFixed(2)} s → ${frames} frames at ${fps} fps, ${width}×${height}`);

  mkdirSync(dirname(out), { recursive: true });
  // Screenshots are taken at full size and downscaled for a GIF (smoother edges
  // than rendering small); palettegen sees every frame before paletteuse runs.
  const encode = gif
    ? ['-vf', `scale=${Number(o['gif-width'])}:-1:flags=lanczos,split[a][b];[a]palettegen=stats_mode=full[p];`
        + '[b][p]paletteuse=dither=sierra2_4a', '-loop', '0']
    : ['-vf', 'pad=ceil(iw/2)*2:ceil(ih/2)*2', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '18', '-preset', 'slow',
        '-movflags', '+faststart'];
  const ff = spawn(o.ffmpeg, [
    '-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(fps), '-c:v', 'png', '-i', '-', ...encode, out,
  ], { stdio: ['pipe', 'inherit', 'inherit'] });
  const done = new Promise((res, rej) => ff.on('close', (code) => (code === 0 ? res() : rej(new Error(`ffmpeg exited with ${code}`)))));
  const t0 = Date.now();
  for (let i = 0; i < frames; i++) {
    await page.evaluate((t) => window.__tour.seek(t), i / fps);
    const png = await page.screenshot({ type: 'png', clip: { x: 0, y: 0, width, height } });
    if (!ff.stdin.write(png)) await new Promise((r) => ff.stdin.once('drain', r));
    if (i % fps === 0) process.stdout.write(`\r${i}/${frames} frames (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
  }
  ff.stdin.end();
  await done;
  if (errors.length) throw new Error(errors.join('\n'));
  console.log(`\rWrote ${out} (${frames} frames, ${(frames / fps).toFixed(2)} s)`);
} finally {
  await browser.close();
  if (server) await new Promise((r) => server.httpServer.close(r));
}
