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
  assert.equal(await page.textContent('#print-check'), 'One piece · no part thinner than 1 mm');

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
