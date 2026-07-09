const puppeteer = require('puppeteer-core');
const path = require('path');

const FILE = 'file://' + encodeURI('/Users/rodcolin/Projects/RSA 2026/glass-engine.html');
const OUT = '/Users/rodcolin/Projects/RSA 2026/.verify/dr';
const fs = require('fs');
if (!fs.existsSync(OUT)) fs.mkdirSync(OUT);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function run(browser, label, vp) {
  const page = await browser.newPage();
  await page.setViewport(vp);
  await page.goto(FILE, { waitUntil: 'load' });
  await sleep(600);

  const shot = async (name, fullPage = true) => {
    await page.screenshot({ path: `${OUT}/${label}-${name}.png`, fullPage });
  };

  // ---------- 1. PREDICT: pick starter, roll 3 words ----------
  await page.evaluate(() => showTab(0));
  await sleep(200);
  await page.evaluate(() => {
    const chips = document.querySelectorAll('#starters .chip');
    chips[0].click(); // "the robot"
  });
  await sleep(500);
  for (let i = 0; i < 3; i++) {
    await page.evaluate(() => document.getElementById('rollBtn').click());
    await sleep(450);
  }
  await sleep(400);
  await shot('1-predict');
  await shot('1-predict-fold', false);

  // ---------- 2. TOKENS ----------
  await page.evaluate(() => showTab(1));
  await sleep(200);
  await page.evaluate(() => {
    const t = document.getElementById('tokIn');
    t.value = 'the unbelievable strawberry cupcake';
    t.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await sleep(500);
  await shot('2-tokens');
  await shot('2-tokens-fold', false);

  // ---------- 3. MEANING: select robot ----------
  await page.evaluate(() => showTab(2));
  await sleep(200);
  await page.evaluate(() => mapSelect('robot'));
  await sleep(700);
  await shot('3-meaning-robot');
  await shot('3-meaning-robot-fold', false);

  // word math preset 1 (king - man + woman)
  await page.evaluate(() => {
    document.querySelectorAll('#wmPresets .chip')[0].click();
  });
  await sleep(1400);
  await shot('3-meaning-wordmath');
  // scroll the word-math area into view for a fold shot
  await page.evaluate(() => document.getElementById('wmOut').scrollIntoView({ block: 'center' }));
  await sleep(200);
  await shot('3-meaning-wordmath-fold', false);

  // ---------- 4. ATTENTION ----------
  await page.evaluate(() => showTab(3));
  await sleep(300);
  await shot('4a-attention-initial', false);
  // commit a prediction: tap 'field' (wrong for heavy, shows the kind correction)
  await page.evaluate(() => {
    const btns = [...document.querySelectorAll('#attWords .aw')];
    const b = btns.find((x) => x.textContent === 'robot');
    b.click();
  });
  await sleep(900);
  await shot('4b-attention-committed');
  await page.evaluate(() => document.querySelector('.att-stage').scrollIntoView({ block: 'center' }));
  await sleep(200);
  await shot('4b-attention-committed-fold', false);
  // toggle ending to muddy
  await page.evaluate(() => {
    document.querySelectorAll('#attEndings .btn')[1].click();
  });
  await sleep(800);
  await shot('4c-attention-muddy-fold', false);
  // open grid
  await page.evaluate(() => document.getElementById('gridBtn').click());
  await sleep(500);
  await page.evaluate(() => document.getElementById('attGrid').scrollIntoView({ block: 'center' }));
  await sleep(200);
  await shot('4d-attention-grid');
  await shot('4d-attention-grid-fold', false);

  // ---------- 5. LOOP: fully stepped ----------
  await page.evaluate(() => showTab(4));
  await sleep(300);
  for (let i = 0; i < 7; i++) {
    const disabled = await page.evaluate(() => document.getElementById('loopNext').disabled);
    if (disabled) break;
    await page.evaluate(() => document.getElementById('loopNext').click());
    await sleep(350);
  }
  await sleep(400);
  await shot('5-loop');
  await shot('5-loop-fold', false);

  // ---------- 6. LICENSE: pass all checkpoints ----------
  await page.evaluate(() => {
    document.querySelectorAll('.checkpoint').forEach((box) => {
      const m = parseInt(box.dataset.m, 10);
      const idx = CHECKPOINTS[m].correct;
      box.querySelectorAll('.ck-opt')[idx].click();
    });
  });
  await sleep(2200); // banner appears after 1200ms
  await shot('6a-gauges-full-fold', false);
  await page.evaluate(() => document.getElementById('licOpen').click());
  await sleep(400);
  await page.type('#licName', 'Maya Rodriguez');
  await sleep(400);
  await shot('6b-license', false);
  // full modal in case it scrolls
  await shot('6b-license-full');

  await page.close();
}

(async () => {
  const browser = await puppeteer.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: 'new',
  });
  try {
    await run(browser, 'm360', { width: 360, height: 740, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    await run(browser, 'd1280', { width: 1280, height: 900, deviceScaleFactor: 2 });
  } finally {
    await browser.close();
  }
  console.log('done');
})().catch((e) => { console.error(e); process.exit(1); });
