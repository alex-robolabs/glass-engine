const puppeteer = require('puppeteer-core');
const FILE = 'file://' + encodeURI('/Users/rodcolin/Projects/RSA 2026/glass-engine.html');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const browser = await puppeteer.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: 'new',
  });
  for (const vp of [{ width: 360, height: 740, deviceScaleFactor: 2 }, { width: 1280, height: 900, deviceScaleFactor: 1 }]) {
    const page = await browser.newPage();
    await page.setViewport(vp);
    await page.goto(FILE, { waitUntil: 'load' });
    await sleep(500);
    const r = await page.evaluate(() => {
      const out = { w: innerWidth };
      out.hscroll = document.documentElement.scrollWidth > innerWidth;
      // attention stage empty height pre-commit
      showTab(3);
      const svg = document.getElementById('attSvg');
      const stage = document.querySelector('.att-stage');
      out.stageH = stage.getBoundingClientRect().height;
      out.svgH = svg.getBoundingClientRect().height;
      // grid size after commit
      const btns = [...document.querySelectorAll('#attWords .aw')];
      btns.find((x) => x.textContent === 'robot').click();
      document.getElementById('gridBtn').click();
      const grid = document.getElementById('attGrid');
      const gr = grid.getBoundingClientRect();
      out.gridW = gr.width; out.gridH = gr.height;
      // grid column header texts
      out.gridCols = [...grid.querySelectorAll('.gc-col, .att-grid *')].slice(0, 0); // placeholder
      out.gridHTMLlen = grid.children.length;
      // font sizes
      const h2 = document.querySelector('#mod3 h2');
      out.h2Size = getComputedStyle(h2).fontSize;
      out.bodySize = getComputedStyle(document.body).fontSize;
      const aw = document.querySelector('#attWords .aw');
      out.awSize = getComputedStyle(aw).fontSize;
      const cellS = grid.querySelector('div');
      // map svg size and label px size
      showTab(2);
      const svgm = document.getElementById('mapSvg');
      const mr = svgm.getBoundingClientRect();
      const vb = svgm.getAttribute('viewBox').split(' ').map(Number);
      out.mapPx = { w: mr.width, h: mr.height, vb };
      out.labelPx = 3.0 * mr.width / vb[2];
      // bars min height
      showTab(0);
      const bars = document.getElementById('bars');
      out.barsMinH = getComputedStyle(bars).minHeight;
      out.barsH = bars.getBoundingClientRect().height;
      return out;
    });
    console.log(vp.width, JSON.stringify(r, null, 1));
    await page.close();
  }
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
