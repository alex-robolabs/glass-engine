const puppeteer = require('puppeteer-core');
const path = require('path');

(async () => {
  const browser = await puppeteer.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: 'new',
  });
  const url = 'file://' + path.resolve(__dirname, '..', 'glass-engine.html');

  for (const vp of [{ w: 360, h: 740 }, { w: 1280, h: 800 }]) {
    const page = await browser.newPage();
    await page.setViewport({ width: vp.w, height: vp.h });
    await page.goto(url, { waitUntil: 'load' });
    // Navigate to ATTENTION tab
    await page.evaluate(() => {
      const tabs = document.querySelectorAll('nav button, .tab, [role="tab"], button');
      for (const t of tabs) {
        if (t.textContent.trim().toUpperCase() === 'ATTENTION') { t.click(); return; }
      }
    });
    await new Promise(r => setTimeout(r, 600));

    const pre = await page.evaluate(() => {
      const stage = document.querySelector('.att-stage');
      const prompt = document.getElementById('attPrompt');
      const firstChip = document.querySelector('#attWords .aw');
      const it = document.querySelector('#attWords .aw.it');
      const sr = stage.getBoundingClientRect();
      const pr = prompt.getBoundingClientRect();
      const fc = firstChip.getBoundingClientRect();
      const svgKids = document.getElementById('attSvg').childElementCount;
      const rows = new Set([...document.querySelectorAll('#attWords .aw')].map(c => Math.round(c.getBoundingClientRect().top))).size;
      return {
        stageH: Math.round(sr.height),
        gapPromptToChips: Math.round(fc.top - pr.bottom),
        paddingTop: getComputedStyle(stage).paddingTop,
        svgChildrenPreCommit: svgKids,
        chipRows: rows,
        itChipTopWithinStage: Math.round(it.getBoundingClientRect().top - sr.top),
      };
    });

    await page.screenshot({ path: `${__dirname}/refute-att-pre-${vp.w}.png` });

    // Commit a prediction: tap a non-"it" word ("robot", index 1)
    await page.evaluate(() => {
      const chips = document.querySelectorAll('#attWords .aw');
      chips[1].click();
    });
    await new Promise(r => setTimeout(r, 1200));

    const post = await page.evaluate(() => {
      const stage = document.querySelector('.att-stage');
      const sr = stage.getBoundingClientRect();
      const svg = document.getElementById('attSvg');
      const paths = [...svg.querySelectorAll('path')];
      let minY = Infinity;
      for (const p of paths) {
        const bb = p.getBoundingClientRect();
        if (bb.top < minY) minY = bb.top;
      }
      return {
        stageH: Math.round(sr.height),
        nPaths: paths.length,
        arcTopWithinStage: Math.round(minY - sr.top), // how close the highest arc gets to stage top
        headroomUnused: Math.round(minY - sr.top),    // px of the 88px band never touched by arcs
      };
    });

    await page.screenshot({ path: `${__dirname}/refute-att-post-${vp.w}.png` });
    console.log(JSON.stringify({ viewport: vp.w, pre, post }, null, 2));
    await page.close();
  }
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
