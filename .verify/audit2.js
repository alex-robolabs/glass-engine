const puppeteer = require('puppeteer-core');
const path = require('path');
(async () => {
  const src = path.resolve('..', 'glass-engine.html');
  const browser = await puppeteer.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: 'new',
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 360, height: 740 });
  await page.goto('file://' + src, { waitUntil: 'networkidle0' });
  // open license modal via checkpoints
  await page.evaluate(() => {
    const CORRECT = [1, 0, 2, 0, 2];
    document.querySelectorAll('.checkpoint').forEach((box, m) => box.querySelectorAll('.ck-opt')[CORRECT[m]].click());
  });
  await new Promise(r => setTimeout(r, 1500));
  const overlap = await page.evaluate(() => {
    document.getElementById('licOpen').click();
    const h = document.getElementById('licH').getBoundingClientRect();
    const x = document.getElementById('licClose').getBoundingClientRect();
    const inter = !(h.right < x.left || x.right < h.left || h.bottom < x.top || x.bottom < h.top);
    return { headingRect: [h.left, h.top, h.right, h.bottom], closeRect: [x.left, x.top, x.right, x.bottom], intersects: inter };
  });
  console.log('modal overlap:', JSON.stringify(overlap));
  // grid peek before predicting
  await page.evaluate(() => { document.getElementById('licClose').click(); document.querySelectorAll('.tabs button')[3].click(); });
  const peek = await page.evaluate(() => {
    document.getElementById('gridBtn').click();
    return {
      gridVisible: !document.getElementById('attGrid').hidden,
      rows: document.querySelectorAll('#attGrid tbody tr').length,
      predicted: document.getElementById('attVerdict').textContent === '',
    };
  });
  console.log('grid before predict:', JSON.stringify(peek));
  // attention toggle animates: pick then toggle ending, check weights change
  const att = await page.evaluate(async () => {
    document.querySelectorAll('#attWords .aw')[1].click(); // pick robot
    const w1 = [...document.querySelectorAll('#attSvg path')].map(p => p.style.strokeWidth);
    document.querySelectorAll('#attEndings .btn')[1].click(); // muddy
    const w2 = [...document.querySelectorAll('#attSvg path')].map(p => p.style.strokeWidth);
    return { w1, w2, verdict: document.getElementById('attVerdict').textContent };
  });
  console.log('att toggle:', JSON.stringify(att));
  // reduced motion
  await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
  const rm = await page.evaluate(() => {
    const needle = document.querySelector('.gauge:not(.full) .g-needle-rot');
    const gaugeFull = document.querySelectorAll('.gauge.full').length;
    return { anim: needle ? getComputedStyle(needle).animationName : 'all-full', gaugesFull: gaugeFull };
  });
  console.log('reduced motion:', JSON.stringify(rm));
  // desktop 1280
  const p2 = await browser.newPage();
  await p2.setViewport({ width: 1280, height: 800 });
  await p2.goto('file://' + src, { waitUntil: 'networkidle0' });
  const desk = await p2.evaluate(() => ({
    fontSize: getComputedStyle(document.documentElement).fontSize,
    tabsPos: getComputedStyle(document.querySelector('.tabs')).position,
    scroll: document.documentElement.scrollWidth <= innerWidth,
  }));
  console.log('desktop:', JSON.stringify(desk));
  await p2.screenshot({ path: 'audit-1280.png' });
  await browser.close();
})().catch(e => { console.error('FAIL', e); process.exit(1); });
