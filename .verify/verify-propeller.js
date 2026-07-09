const puppeteer = require('puppeteer-core');
(async () => {
  const browser = await puppeteer.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: 'new',
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 360, height: 740, deviceScaleFactor: 2 });
  await page.goto('file:///Users/rodcolin/Projects/RSA%202026/glass-engine.html', { waitUntil: 'networkidle0' });
  await new Promise(r => setTimeout(r, 600));
  // navigate to the MEANING module (mod2) as a student would, without touching the map
  await page.evaluate(() => {
    document.querySelectorAll('#tabs button')[2].click();
  });
  await new Promise(r => setTimeout(r, 600));

  const info = await page.evaluate(() => {
    const svg = document.getElementById('mapSvg');
    const wrap = document.getElementById('mapWrap');
    const wr = wrap.getBoundingClientRect();
    const texts = [...svg.querySelectorAll('text')];
    const t = texts.find(t => t.textContent === 'propeller');
    if (!t) return { found: false };
    const r = t.getBoundingClientRect();
    const cls = t.getAttribute('class') || '';
    const vb = svg.getAttribute('viewBox');
    const disp = getComputedStyle(t).display;
    // also check every placed (visible) label for clipping at either edge
    const clipped = texts
      .filter(x => (x.getAttribute('class') || '') !== 'toff')
      .map(x => ({ w: x.textContent, r: x.getBoundingClientRect() }))
      .filter(o => o.r.right > wr.right + 0.5 || o.r.left < wr.left - 0.5)
      .map(o => ({ w: o.w, left: +o.r.left.toFixed(1), right: +o.r.right.toFixed(1) }));
    return {
      found: true, cls, display: disp, viewBox: vb,
      wrap: { left: +wr.left.toFixed(1), right: +wr.right.toFixed(1), width: +wr.width.toFixed(1), height: +wr.height.toFixed(1) },
      label: { left: +r.left.toFixed(1), right: +r.right.toFixed(1), width: +r.width.toFixed(1) },
      overflowPx: +(r.right - wr.right).toFixed(1),
      allClipped: clipped,
    };
  });
  console.log(JSON.stringify(info, null, 2));

  // screenshot the map region on first paint (no scrolling of map itself)
  const wrapEl = await page.$('#mapWrap');
  await wrapEl.evaluate(el => el.scrollIntoView({ block: 'center' }));
  await new Promise(r => setTimeout(r, 300));
  await wrapEl.screenshot({ path: '/Users/rodcolin/Projects/RSA 2026/.verify/verify-propeller-360.png' });
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
