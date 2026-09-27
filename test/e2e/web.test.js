// Browser smoke test: serves the production build (run `vite build` first; `npm run
// test:e2e` does both) and drives it in the locally installed Chrome, headless.
// Set SCREENSHOT=path to save a screenshot of the result.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { preview } from 'vite';
import { chromium } from 'playwright-core';

let server, browser, url;
before(async () => {
  server = await preview({ preview: { port: 0, strictPort: false }, logLevel: 'silent' });
  url = server.resolvedUrls.local[0];
  browser = await chromium.launch({ channel: 'chrome', headless: true });
});
after(async () => {
  await browser?.close();
  await new Promise((r) => server?.httpServer.close(r));
});

test('page generates GEB with complete shadows', async () => {
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && !/Failed to load resource/.test(m.text()) && errors.push(m.text()));
  page.on('response', (r) => r.status() >= 400 && errors.push(`${r.status()} ${r.url()}`));

  await page.goto(url);
  // The page submits G/E/B on load; wait for the best candidate to be built.
  await page.waitForSelector('#candidates button[aria-pressed="true"]', { timeout: 60_000 });
  await page.waitForSelector('#shadow-panels figure:nth-child(3)');

  assert.match(await page.textContent('#status'), /Tried 24 arrangements/);
  const captions = await page.$$eval('#shadow-panels figcaption', (els) => els.map((e) => e.textContent));
  assert.equal(captions.length, 3);
  for (const c of captions) assert.match(c, /100\.0%/, c);
  assert.equal(await page.isDisabled('#download'), false);
  // GEB in Bungee is one piece but has a 0.43 mm wall, which the voxel check reports.
  assert.match(await page.textContent('#print-check'), /^One piece · \d+ parts? thinner than 1 mm \([\d.]+ mm³\)$/);

  // The "Show missing parts" toggle hides the red areas and outlines.
  assert.equal(await page.isVisible('#shadow-panels .target'), true);
  await page.uncheck('#show-missing');
  assert.equal(await page.isVisible('#shadow-panels .target'), false);
  assert.equal(await page.isVisible('#shadow-panels .shadow'), true);
  await page.check('#show-missing');

  // Switching the bundled font regenerates with that font.
  assert.equal(await page.$$eval('#font-choice option', (o) => o.length) > 1, true);
  const before = await page.getAttribute('#shadow-panels path.shadow', 'd');
  await page.selectOption('#font-choice', 'anton');
  await page.waitForFunction((d) => {
    const p = document.querySelector('#shadow-panels path.shadow');
    return p && p.getAttribute('d') !== d && !document.querySelector('#go').disabled;
  }, before, { timeout: 60_000 });
  assert.match(await page.textContent('#status'), /Tried \d+ arrangements/);

  // Snap to a view and make sure rendering doesn't throw.
  await page.click('.toolbar [data-view="front"]');
  if (process.env.SCREENSHOT) await page.screenshot({ path: process.env.SCREENSHOT });
  assert.deepEqual(errors, []);
});

const wordsDone = (page) => page.waitForFunction(
  () => /in [\d.]+ s/.test(document.querySelector('#words-status').textContent) && document.querySelectorAll('#shadow-panels figure').length >= 2,
  null, { timeout: 180_000 });

test('look menu: every two-word look makes a one-piece design; knobs and finish work', async () => {
  const page = await browser.newPage({ viewport: { width: 1400, height: 950 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(url);
  await page.waitForSelector('#candidates button[aria-pressed="true"]', { timeout: 60_000 });
  assert.deepEqual(await page.$$eval('#looks button', (bs) => bs.map((b) => b.dataset.look)), ['cube', 'row', 'rows', 'grid', 'tower', 'block']);
  for (const look of ['row', 'rows', 'grid', 'tower', 'block']) {
    await page.click(`#looks button[data-look="${look}"]`);
    // Only the active look's controls are visible.
    assert.equal(await page.isVisible('#form'), false, 'cube form hidden');
    assert.equal(await page.isVisible('#words-form'), true);
    await wordsDone(page);
    assert.match(await page.textContent('#print-check'), /^One piece/, look);
  }
  // Word block with a heart from above: three views.
  await page.click('#looks button[data-look="block"]');
  await wordsDone(page);
  await page.click('.shape-row button[title="Use ❤"]');
  await page.waitForFunction(() => document.querySelectorAll('#shadow-panels figure').length === 3, null, { timeout: 120_000 });
  const captions = await page.$$eval('#shadow-panels figcaption', (els) => els.map((e) => e.textContent.split(' ·')[0]));
  assert.deepEqual(captions, ['front', 'right', 'top']);
  // Finish options go into the share link's knobs.
  await page.check('input[name="stand"]');
  await page.waitForFunction(() => JSON.parse(new URLSearchParams(location.hash.slice(1)).get('k') ?? '{}').stand === true);
  await page.check('#colour-faces');
  // Back to the cube, whose controls return.
  await page.click('#looks button[data-look="cube"]');
  await page.waitForSelector('#candidates button[aria-pressed="true"]', { timeout: 60_000 });
  assert.equal(await page.isVisible('#words-form'), false);
  assert.deepEqual(errors, []);
});

test('shared links restore the page state (cube, word looks, and old-format links)', async () => {
  const page = await browser.newPage({ viewport: { width: 1400, height: 950 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  // Cube: a non-default font and a non-first candidate.
  await page.goto(url);
  await page.waitForSelector('#candidates button[aria-pressed="true"]', { timeout: 60_000 });
  await page.selectOption('#font-choice', 'anton');
  await page.waitForFunction(() => new URLSearchParams(location.hash.slice(1)).get('font') === 'anton' && new URLSearchParams(location.hash.slice(1)).has('pick'));
  await page.waitForTimeout(500);
  const before = await page.evaluate(() => new URLSearchParams(location.hash.slice(1)).get('pick'));
  await page.locator('#candidates button').nth(2).click();
  await page.waitForFunction((p) => new URLSearchParams(location.hash.slice(1)).get('pick') !== p, before);
  const cubeUrl = page.url();
  const picked = await page.textContent('#candidates button[aria-pressed="true"] .letters');

  // A word look with knobs and a selected design.
  await page.click('#looks button[data-look="tower"]');
  await page.fill('input[name="wordA"]', 'Ada');
  await page.fill('input[name="wordB"]', 'Bo');
  await page.click('#words-go');
  await wordsDone(page);
  await page.click('.shape-row button[title="Use ❤"]');
  await page.waitForFunction(() => new URLSearchParams(location.hash.slice(1)).get('ti')?.includes('❤'), null, { timeout: 120_000 });
  const lookUrl = page.url();

  const p2 = await browser.newPage({ viewport: { width: 1400, height: 950 } });
  p2.on('pageerror', (e) => errors.push(e.message));
  await p2.goto(lookUrl);
  await p2.waitForFunction(() => document.querySelectorAll('#shadow-panels figure').length === 3, null, { timeout: 120_000 });
  assert.equal(await p2.getAttribute('#looks button[data-look="tower"]', 'aria-checked'), 'true');
  assert.equal(await p2.inputValue('input[name="wordA"]'), 'Ada');
  assert.equal(await p2.inputValue('.shape-row input'), '❤');
  assert.match(await p2.textContent('#word-stats'), /❤/);

  await p2.goto('about:blank');
  await p2.goto(cubeUrl);
  await p2.waitForSelector('#candidates button[aria-pressed="true"]', { timeout: 60_000 });
  assert.equal(await p2.getAttribute('#looks button[data-look="cube"]', 'aria-checked'), 'true');
  assert.equal(await p2.inputValue('#font-choice'), 'anton');
  assert.equal(await p2.textContent('#candidates button[aria-pressed="true"] .letters'), picked);

  // An old-format link (from before the look menu) still opens its design.
  const old = '#' + new URLSearchParams({ m: 'words', font: 'kanit-black', a: 'Stop', b: 'Work', sec: 'families', fam: 'spaced', case: 'upper', rows: '1', stand: '1', turn: '1' });
  await p2.goto('about:blank');
  await p2.goto(url + old);
  await p2.waitForFunction(() => /in [\d.]+ s/.test(document.querySelector('#words-status').textContent), null, { timeout: 120_000 });
  assert.equal(await p2.getAttribute('#looks button[data-look="row"]', 'aria-checked'), 'true');
  assert.equal(await p2.inputValue('input[name="wordA"]'), 'Stop');
  assert.equal(await p2.isChecked('input[name="stand"]'), true);
  assert.deepEqual(errors, []);
});
