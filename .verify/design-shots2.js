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
  await page.setViewport({ width: 360, height: 740, deviceScaleFactor: 4 });
  await page.goto(APP, { waitUntil: 'load' });
  await sleep(500);

  // PREDICT retake: pick starter, choose 3 non-stop words so bars stay visible
  await page.evaluate(() => {
    document.querySelectorAll('#starters .chip')[0].click();
  });
  await sleep(300);
  for (let i = 0; i < 3; i++) {
    await page.evaluate(() => {
      const cands = candidates(seq[seq.length - 1]).filter((c) => c.w !== '■');
      if (cands.length) chooseWord(cands[Math.min(1, cands.length - 1)].w);
    });
    await sleep(450);
  }
  await sleep(600);
  await page.screenshot({ path: OUT('01b-predict-bars') });

  // MEANING: select robot, then clip the map element
  await page.evaluate(() => { showTab(2); mapSelect('robot'); });
  await sleep(900);
  const box = await page.evaluate(() => {
    const r = document.getElementById('mapWrap').getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height };
  });
  await page.screenshot({ path: OUT('03b-map-robot-hires'), clip: { x: box.x, y: box.y, width: box.w, height: box.h } });

  // select king too (dense royalty cluster)
  await page.evaluate(() => { mapSelect('king'); });
  await sleep(900);
  await page.screenshot({ path: OUT('03b-map-king-hires'), clip: { x: box.x, y: box.y, width: box.w, height: box.h } });

  // wordmath preset while map visible: does the user see the ghost?
  // check what part of the page is visible when the preset chip is tapped
  const vis = await page.evaluate(() => {
    const chip = document.querySelectorAll('#wmPresets .chip')[0];
    chip.scrollIntoView({ block: 'center' });
    const m = document.getElementById('mapWrap').getBoundingClientRect();
    return { mapTop: m.top, mapBottom: m.bottom, vh: innerHeight };
  });
  console.log('when preset chip centered, map rect:', JSON.stringify(vis));
  await sleep(300);
  await page.screenshot({ path: OUT('03c-preset-in-view') });

  // ATTENTION wrong-pick state: pick 'field' (idx 5) while ending is 'heavy'
  await page.evaluate(() => { showTab(3); attLoadPreset(0); });
  await sleep(300);
  await page.evaluate(() => { document.querySelectorAll('#attWords .aw')[5].click(); });
  await sleep(1200);
  await page.screenshot({ path: OUT('04b-attention-wrongpick') });

  await browser.close();
  console.log('DONE');
})().catch((e) => { console.error(e); process.exit(1); });
