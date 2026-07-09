const puppeteer = require('puppeteer-core');
const FILE = 'file://' + encodeURI('/Users/rodcolin/Projects/RSA 2026/glass-engine.html');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const browser = await puppeteer.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: 'new',
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900, deviceScaleFactor: 1 });
  await page.goto(FILE, { waitUntil: 'load' });
  await sleep(400);
  const r = await page.evaluate(() => {
    showTab(3);
    const btns = [...document.querySelectorAll('#attWords .aw')];
    btns.find((x) => x.textContent === 'robot').click();
    document.getElementById('gridBtn').click();
    const grid = document.getElementById('attGrid');
    const out = {};
    // find heatmap cells
    const all = grid.querySelectorAll('*');
    out.tagSample = [...all].slice(0, 8).map((n) => n.tagName + '.' + n.className);
    const table = grid.firstElementChild;
    const tr = table.getBoundingClientRect();
    out.tableSize = { w: tr.width, h: tr.height };
    const lab = grid.querySelector('.agl, [class*=lab], span, div div');
    // font sizes of first text-bearing descendant
    const texts = [...all].filter((n) => n.children.length === 0 && n.textContent.trim());
    out.labelFont = texts.length ? getComputedStyle(texts[0]).fontSize : null;
    out.textSample = texts.slice(0, 12).map((t) => t.textContent);
    // measure a cell
    const cells = [...all].filter((n) => n.children.length === 0 && !n.textContent.trim());
    if (cells.length) { const c = cells[0].getBoundingClientRect(); out.cell = { w: c.width, h: c.height }; }
    return out;
  });
  console.log(JSON.stringify(r, null, 1));
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
