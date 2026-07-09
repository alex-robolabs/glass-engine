const puppeteer = require('puppeteer-core');
const path = require('path');
const { pathToFileURL } = require('url');
const APP = pathToFileURL(path.resolve(__dirname, '..', 'glass-engine.html')).href;
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--allow-file-access-from-files'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 360, height: 740, deviceScaleFactor: 2, hasTouch: true });
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(String(e)));
  await page.goto(APP);
  await sleep(500);

  // A. mixed-text toast overlap: pass the 5th checkpoint (license toast fires 1.2s later),
  //    egg toast fired just before, both alive at once. All real-user actions.
  await page.evaluate(() => {
    for (let m = 0; m < 4; m++) document.querySelector('.checkpoint[data-m="' + m + '"]').querySelectorAll('.ck-opt')[CHECKPOINTS[m].correct].click();
  });
  await sleep(1600);
  await page.evaluate(() => {
    document.querySelector('.checkpoint[data-m="4"]').querySelectorAll('.ck-opt')[CHECKPOINTS[4].correct].click();
    const t = document.getElementById('title');
    for (let i = 0; i < 5; i++) t.click(); // egg toast now; license toast lands 1.2s later
  });
  await sleep(1400);
  const toasts = await page.evaluate(() => [...document.querySelectorAll('.toast')].map((x) => ({ text: x.textContent.slice(0, 25), top: Math.round(x.getBoundingClientRect().top), left: Math.round(x.getBoundingClientRect().left) })));
  await page.screenshot({ path: __dirname + '/b3-toast-mix.png' });
  console.log('mixed toasts:', JSON.stringify(toasts));

  // B. orphan auto-finish chain: persistence + recovery
  await page.reload(); await sleep(400);
  await page.evaluate(() => {
    resetGen('the pit crew');
    autoFinish();
    document.getElementById('autoBtn').dispatchEvent(new MouseEvent('click', { bubbles: true })); // bypass disabled
    resetGen(); // Start over
  });
  await sleep(3000);
  const orphan1 = await page.evaluate(() => ({ autoTimerSet: !!autoTimer, seqLen: seq.length, genDone }));
  await sleep(3000);
  const orphan2 = await page.evaluate(() => ({ autoTimerSet: !!autoTimer }));
  // recovery: pick a starter chip
  await page.evaluate(() => document.querySelectorAll('#starters .chip')[1].click());
  await sleep(1000);
  const orphan3 = await page.evaluate(() => ({ autoTimerSet: !!autoTimer, seqLen: seq.length, rollDisabled: document.getElementById('rollBtn').disabled }));
  console.log('orphan after 3s:', JSON.stringify(orphan1), 'after 6s:', JSON.stringify(orphan2), 'after starter chip:', JSON.stringify(orphan3));

  // C. sanity: real double-click of Auto-finish cannot double-run (disabled is synchronous)
  const dbl = await page.evaluate(() => {
    resetGen('our team');
    document.getElementById('autoBtn').click();
    const disabledAfterFirst = document.getElementById('autoBtn').disabled;
    document.getElementById('autoBtn').click(); // el.click() on disabled button: no-op
    return { disabledAfterFirst };
  });
  console.log('double-auto real path:', JSON.stringify(dbl));

  // D. long emoji run pill (like a kid pasting emoji spam) at 360px
  await page.evaluate(() => { resetGen(); showTab(1); });
  const emojiRun = await page.evaluate(() => {
    document.getElementById('tokIn').value = '😂'.repeat(80);
    renderTokens();
    const r = document.querySelector('#tokOut .tok').getBoundingClientRect();
    return { toks: document.querySelectorAll('#tokOut .tok').length, pillW: Math.round(r.width), docW: document.documentElement.scrollWidth, canScrollX: document.documentElement.scrollWidth > innerWidth, bodyOverflowX: getComputedStyle(document.body).overflowX };
  });
  await sleep(500);
  await page.screenshot({ path: __dirname + '/b3-emoji-run.png' });
  console.log('emoji run:', JSON.stringify(emojiRun));

  console.log('pageErrors:', JSON.stringify(pageErrors));
  await browser.close();
})().catch((e) => { console.error('FAIL', e); process.exit(1); });
