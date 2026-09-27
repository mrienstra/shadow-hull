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

test('two-words mode streams designs and shows a heart block with three views', async () => {
  const page = await browser.newPage({ viewport: { width: 1400, height: 950 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(url);
  await page.waitForSelector('#candidates button[aria-pressed="true"]', { timeout: 60_000 });
  await page.click('#tab-words');
  // Default sections: blocks (none and ❤ on top, three cases) and stacked columns.
  await page.waitForFunction(() => /designs in/.test(document.querySelector('#words-status').textContent), null, { timeout: 180_000 });
  const titles = await page.$$eval('#designs button .title', (els) => els.map((e) => e.textContent));
  assert.ok(titles.includes('upper, top ❤'), titles.join(', '));
  assert.ok(titles.includes('stacked + ❤'), titles.join(', '));
  await page.locator('#designs button', { hasText: 'upper, top ❤' }).click();
  await page.waitForFunction(() => document.querySelectorAll('#shadow-panels figure').length === 3, null, { timeout: 60_000 });
  const captions = await page.$$eval('#shadow-panels figcaption', (els) => els.map((e) => e.textContent));
  assert.deepEqual(captions.map((c) => c.split(' ·')[0]), ['front', 'right', 'top']);
  assert.match(await page.textContent('#print-check'), /^One piece/);
  assert.equal(await page.isDisabled('#download'), false);
  await page.check('#colour-faces');
  await page.click('.toolbar [data-view="top"]');
  // Switching back to three letters still works.
  await page.click('#tab-letters');
  await page.waitForSelector('#candidates button[aria-pressed="true"]', { timeout: 60_000 });
  assert.deepEqual(errors, []);
});
