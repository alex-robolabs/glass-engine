const puppeteer = require('puppeteer-core');
(async () => {
  const browser = await puppeteer.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: 'new',
  });
  const page = await browser.newPage();
  await page.goto('file:///Users/rodcolin/Projects/RSA%202026/glass-engine.html');
  await new Promise(r => setTimeout(r, 500));

  // instrument setTimeout to count scheduling of the auto chain
  await page.evaluate(() => {
    window.__stCount = 0;
    const orig = window.setTimeout;
    window.setTimeout = function (fn, ms) {
      if (ms === 380 || ms === 220 || ms === 60) window.__stCount++;
      return orig.apply(this, arguments);
    };
  });

  // 1) pick a starter chip
  await page.evaluate(() => {
    document.querySelector('#starters .chip').click();
  });

  // 2) click Auto-finish (real .click() path first, to test disabled behavior)
  const r1 = await page.evaluate(() => {
    const b = document.getElementById('autoBtn');
    b.click(); // first, legit
    const disabledAfterFirst = b.disabled;
    // real-user second activation attempts:
    b.click();                    // HTMLElement.click() honors disabled -> should no-op
    const countAfterRealClicks = window.__stCount;
    return { disabledAfterFirst, countAfterRealClicks };
  });

  // 3) forced programmatic dispatchEvent on the disabled button
  const r2 = await page.evaluate(() => {
    const b = document.getElementById('autoBtn');
    let fired = false;
    b.addEventListener('click', () => { fired = true; }, { once: true });
    b.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    return { listenerFiredOnDisabled: fired };
  });

  // 4) press Start over
  await page.evaluate(() => document.getElementById('resetBtn').click());
  const c0 = await page.evaluate(() => window.__stCount);
  await new Promise(r => setTimeout(r, 3000));
  const s3 = await page.evaluate(() => ({ count: window.__stCount, seqEmpty: document.getElementById('genOut').textContent }));
  await new Promise(r => setTimeout(r, 3000));
  const s6 = await page.evaluate(() => window.__stCount);

  // 5) does picking a starter kill the orphan loop?
  await page.evaluate(() => document.querySelector('#starters .chip').click());
  const cAfterChip = await page.evaluate(() => window.__stCount);
  await new Promise(r => setTimeout(r, 2000));
  const cAfterChip2 = await page.evaluate(() => window.__stCount);

  // is the UI usable during the orphan window? (bars hidden since seq empty, but check autoTimer effect)
  console.log(JSON.stringify({
    r1, r2,
    countAtReset: c0,
    countAt3s: s3.count,
    countAt6s: s6,
    stillSchedulingAfterReset: s6 > c0,
    afterChip: cAfterChip,
    afterChipPlus2s: cAfterChip2,
    orphanKilledByChip: cAfterChip2 === cAfterChip,
  }, null, 2));

  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
