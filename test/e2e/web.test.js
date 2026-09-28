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
    assert.match(await page.textContent('#print-check'), /One piece/, look);
    // A thumbnail is rendered for the listed design.
    await page.waitForSelector('#designs img.thumb[src^="data:image/png"]', { timeout: 60_000 });
  }
  // Supports: none. Pairs in a row keep their stand by default, so still one piece, no rods.
  await page.click('#looks button[data-look="row"]');
  await wordsDone(page);
  await page.locator('.seg[data-knob="supports"] button', { hasText: 'None' }).click();
  await page.waitForFunction(() => JSON.parse(new URLSearchParams(location.hash.slice(1)).get('k') ?? '{}').supports === 'none');
  await wordsDone(page);
  await page.waitForFunction(() => /One piece/.test(document.querySelector('#print-check').textContent) && !/rod/.test(document.querySelector('#print-check').textContent), null, { timeout: 60_000 });
  // Word block with a heart from above: three views.
  await page.click('#looks button[data-look="block"]');
  await wordsDone(page);
  await page.click('.shape-row button[title="Use ❤"]');
  await page.waitForFunction(() => document.querySelectorAll('#shadow-panels figure').length === 3, null, { timeout: 120_000 });
  const captions = await page.$$eval('#shadow-panels figcaption', (els) => els.map((e) => e.textContent.split(' ·')[0]));
  assert.deepEqual(captions, ['front', 'side', 'top']);
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
  assert.ok(await p2.$$eval('ul.checks li', (li) => li.length) >= 4, 'plain-language checks shown');

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

test('side word font: another font for the second word changes the design and round-trips through the link', async () => {
  const page = await browser.newPage({ viewport: { width: 1400, height: 950 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const hash = () => page.evaluate(() => Object.fromEntries(new URLSearchParams(location.hash.slice(1))));
  // Outline targets per shadow panel (front, side), once a design is shown.
  const targets = (p) => p.$$eval('#shadow-panels figure path.target', (ps) => ps.map((x) => x.getAttribute('d')));
  await page.goto(`${url}#look=row&font=bungee&a=Finola&b=Bryan`);
  await wordsDone(page);
  await page.waitForFunction(() => new URLSearchParams(location.hash.slice(1)).has('r'));
  assert.equal(await page.isVisible('#side-font'), true, 'shown for two-word looks');
  assert.equal(await page.inputValue('#font2-choice'), '', 'default: same as front');
  assert.equal('font2' in (await hash()), false, 'the default link has no side font');
  const [, sideBefore] = await targets(page);

  await page.selectOption('#font2-choice', 'kanit-black');
  await page.waitForFunction((d) => {
    const ps = document.querySelectorAll('#shadow-panels figure path.target');
    return ps.length >= 2 && ps[1].getAttribute('d') !== d && /in [\d.]+ s/.test(document.querySelector('#words-status').textContent);
  }, sideBefore, { timeout: 180_000 });
  await page.waitForFunction(() => new URLSearchParams(location.hash.slice(1)).get('r')?.includes('frameB'), null, { timeout: 60_000 });
  const h = await hash();
  assert.equal(h.font2, 'kanit-black');
  assert.equal(h.font, 'bungee');
  const link = page.url();
  const [frontAfter, sideAfter] = await targets(page);

  const p2 = await browser.newPage({ viewport: { width: 1400, height: 950 } });
  p2.on('pageerror', (e) => errors.push(e.message));
  await p2.goto(link);
  await p2.waitForFunction((d) => document.querySelectorAll('#shadow-panels figure path.target')[1]?.getAttribute('d') === d, sideAfter, { timeout: 180_000 });
  assert.equal(await p2.inputValue('#font2-choice'), 'kanit-black');
  assert.equal((await targets(p2))[0], frontAfter, 'same front outline');
  await p2.close();

  // Back to "Same as front": the link drops the side font.
  await page.selectOption('#font2-choice', '');
  await page.waitForFunction(() => !new URLSearchParams(location.hash.slice(1)).has('font2'));
  // The cube has no side word, so no side font control.
  await page.click('#looks button[data-look="cube"]');
  assert.equal(await page.isVisible('#side-font'), false);
  assert.deepEqual(errors, []);
});

test('swing: pauses on exactly the front view, then the side view; controls stop it', async () => {
  const page = await browser.newPage({ viewport: { width: 1300, height: 800 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(url + '#look=row&font=kanit-black&a=Finola&b=Bryan');
  await wordsDone(page);
  assert.deepEqual(
    await page.$$eval('#swing-secs, #swing-hold, #swing-tilt', (els) => els.map((e) => Number(e.value))),
    [2, 0.6, 0], 'defaults',
  );
  const frame = () => page.evaluate(() => document.querySelector('#viewport canvas').toDataURL());
  // Reference: the exact front view.
  await page.click('.toolbar [data-view="front"]');
  await page.waitForTimeout(300);
  const front = await frame();
  await page.click('.toolbar [data-view="right"]');
  await page.waitForTimeout(300);
  const side = await frame();
  // Swing with long pauses so the test can sample them reliably.
  await page.click('#swing');
  await page.fill('#swing-hold', '3');
  await page.waitForTimeout(1000); // inside the front pause
  assert.equal(await frame(), front, 'first pause is the exact front view');
  await page.waitForTimeout(5500); // front pause 0–3 s, swing 3–5 s, side pause 5–8 s: now ≈ 6.5 s
  assert.equal(await frame(), side, 'second pause is the exact side view');
  // Bounding box: off by default; turning it on changes the picture.
  assert.equal(await page.isChecked('#show-box'), false);
  await page.click('.toolbar [data-view="iso"]');
  await page.waitForTimeout(300);
  const without = await frame();
  await page.check('#show-box');
  await page.waitForTimeout(300);
  assert.notEqual(await frame(), without, 'box drawn when checked');
  await page.uncheck('#show-box');
  await page.click('#swing');
  // Pressing a view button stops the swing.
  await page.click('.toolbar [data-view="iso"]');
  assert.equal(await page.getAttribute('#swing', 'aria-pressed'), 'false');
  assert.equal(await page.isVisible('#swing-timing'), false); // visibility: hidden
  assert.equal(await page.$('#tour'), null, 'no Tour button without tour=1');
  assert.deepEqual(errors, []);
});

test('tour (tour=1): stops follow the letter pairs, zoomed in; loops seamlessly', async () => {
  const page = await browser.newPage({ viewport: { width: 1000, height: 700 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(url + '#look=row&a=Finola&b=Bryan&k={"stand":false,"supports":"none"}&tour=1');
  await wordsDone(page);
  await page.waitForFunction(() => window.__tour?.ready);
  assert.equal(await page.isVisible('#tour'), true);
  assert.equal(await page.evaluate(() => new URLSearchParams(location.hash.slice(1)).get('tour')), '1', 'hash keeps tour=1');
  const stops = await page.evaluate(() => window.__tour.stops().map((s) => `${s.text}/${s.view}`));
  assert.deepEqual(stops, ['F/front', 'B/right', 'I/front', 'R/right', 'NO/front', 'Y/right', 'L/front', 'A/right', 'A/front', 'N/right', 'FINOLA/front', 'BRYAN/right']);
  const frame = () => page.evaluate(() => document.querySelector('#viewport canvas').toDataURL());
  await page.click('.toolbar [data-view="front"]');
  await page.waitForTimeout(300);
  const front = await frame();
  const start = await page.evaluate(() => (window.__tour.seek(0), document.querySelector('#viewport canvas').toDataURL()));
  assert.notEqual(start, front, 'stop 1 is zoomed in on the F, not the whole front view');
  const end = await page.evaluate(() => (window.__tour.seek(window.__tour.duration), document.querySelector('#viewport canvas').toDataURL()));
  assert.equal(end, start, 'the end of the loop is its start');
  // A view button hands the camera back.
  await page.click('.toolbar [data-view="front"]');
  await page.waitForTimeout(300);
  assert.equal(await frame(), front);
  assert.deepEqual(errors, []);
});
