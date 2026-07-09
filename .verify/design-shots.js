const puppeteer = require('puppeteer-core');
const path = require('path');

const APP = 'file://' + path.resolve(__dirname, '..', 'glass-engine.html');
const OUT = (n) => path.join(__dirname, 'design-' + n + '.png');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const browser = await puppeteer.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: 'new',
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 360, height: 740, deviceScaleFactor: 2 });
  page.on('pageerror', (e) => console.log('PAGEERROR:', e.message));
  page.on('console', (m) => { if (m.type() === 'error') console.log('CONSOLE:', m.text()); });
  await page.goto(APP, { waitUntil: 'load' });
  await sleep(600);

  // ---------- 1. PREDICT: pick starter, roll 3 words ----------
  await page.evaluate(() => {
    document.querySelectorAll('#starters .chip')[0].click(); // 'the robot'
  });
  await sleep(400);
  for (let i = 0; i < 3; i++) {
    await page.evaluate(() => document.getElementById('rollBtn').click());
    await sleep(450);
  }
  await sleep(600);
  await page.screenshot({ path: OUT('01-predict-viewport') });
  await page.screenshot({ path: OUT('01-predict-full'), fullPage: true });

  // ---------- 2. TOKENS ----------
  await page.evaluate(() => {
    showTab(1);
    document.getElementById('tokIn').value = 'the unbelievable strawberry cupcake';
    renderTokens();
  });
  await sleep(600);
  await page.screenshot({ path: OUT('02-tokens-viewport') });
  await page.screenshot({ path: OUT('02-tokens-full'), fullPage: true });

  // ---------- 3. MEANING: select robot ----------
  await page.evaluate(() => { showTab(2); mapSelect('robot'); });
  await sleep(900);
  await page.screenshot({ path: OUT('03-meaning-robot-viewport') });
  await page.screenshot({ path: OUT('03-meaning-robot-full'), fullPage: true });

  // word math preset 1: king - man + woman
  await page.evaluate(() => {
    document.querySelectorAll('#wmPresets .chip')[0].click();
  });
  await sleep(1500);
  // screenshot with map area in view
  await page.evaluate(() => window.scrollTo(0, 0));
  await sleep(200);
  await page.screenshot({ path: OUT('03-wordmath-map') });
  await page.evaluate(() => {
    document.getElementById('wmOut').scrollIntoView({ block: 'center' });
  });
  await sleep(300);
  await page.screenshot({ path: OUT('03-wordmath-out') });

  // ---------- 4. ATTENTION ----------
  await page.evaluate(() => { showTab(3); });
  await sleep(400);
  await page.screenshot({ path: OUT('04-attention-initial') });
  // commit a prediction: tap 'robot' (index 1, correct for 'heavy')
  await page.evaluate(() => { document.querySelectorAll('#attWords .aw')[1].click(); });
  await sleep(1200);
  await page.screenshot({ path: OUT('04-attention-committed') });
  // toggle ending to 'too muddy'
  await page.evaluate(() => { document.querySelectorAll('#attEndings .btn')[1].click(); });
  await sleep(900);
  await page.screenshot({ path: OUT('04-attention-muddy') });
  // open the grid
  await page.evaluate(() => { document.getElementById('gridBtn').click(); });
  await sleep(400);
  await page.evaluate(() => { document.getElementById('attGrid').scrollIntoView({ block: 'center' }); });
  await sleep(300);
  await page.screenshot({ path: OUT('04-attention-grid') });
  await page.screenshot({ path: OUT('04-attention-full'), fullPage: true });
  await page.evaluate(() => { document.getElementById('gridBtn').click(); }); // close again

  // ---------- 5. LOOP: fully stepped ----------
  await page.evaluate(() => { showTab(4); });
  await sleep(300);
  for (let i = 0; i < 6; i++) {
    await page.evaluate(() => document.getElementById('loopNext').click());
    await sleep(250);
  }
  await sleep(500);
  await page.screenshot({ path: OUT('05-loop-viewport') });
  await page.screenshot({ path: OUT('05-loop-full'), fullPage: true });

  // ---------- 6. Pass all checkpoints, license ----------
  await page.evaluate(() => {
    document.querySelectorAll('.checkpoint').forEach((box) => {
      const m = parseInt(box.dataset.m, 10);
      box.querySelectorAll('.ck-opt')[CHECKPOINTS[m].correct].click();
    });
  });
  await sleep(1800); // banner appears after 1.2s
  await page.evaluate(() => window.scrollTo(0, 0));
  await sleep(1400);
  await page.screenshot({ path: OUT('06-gauges-banner') });
  await page.evaluate(() => document.getElementById('licOpen').click());
  await sleep(400);
  await page.type('#licName', 'Maya Torres');
  await sleep(400);
  await page.screenshot({ path: OUT('06-license-modal') });

  // horizontal scroll sanity
  const hscroll = await page.evaluate(() => ({
    sw: document.documentElement.scrollWidth,
    cw: document.documentElement.clientWidth,
  }));
  console.log('scrollWidth/clientWidth:', JSON.stringify(hscroll));

  await browser.close();
  console.log('DONE');
})().catch((e) => { console.error(e); process.exit(1); });
