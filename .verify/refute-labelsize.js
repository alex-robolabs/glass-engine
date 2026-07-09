const puppeteer = require('puppeteer-core');
(async () => {
  const browser = await puppeteer.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: 'new',
    args: ['--no-sandbox'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 360, height: 740, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  await page.goto('file:///Users/rodcolin/Projects/RSA%202026/glass-engine.html', { waitUntil: 'networkidle0' });
  // go to MEANING tab
  await page.evaluate(() => {
    const btns = [...document.querySelectorAll('.tabs button')];
    const b = btns.find((x) => /meaning/i.test(x.textContent));
    if (b) b.click();
  });
  await new Promise((r) => setTimeout(r, 600));
  const data = await page.evaluate(() => {
    const svg = document.getElementById('mapSvg');
    const r = svg.getBoundingClientRect();
    const vb = svg.getAttribute('viewBox');
    const ctm = svg.getScreenCTM();
    // find a visible (non-thinned) label
    const texts = [...svg.querySelectorAll('.node text')];
    const visible = texts.filter((t) => !t.classList.contains('toff'));
    const sample = visible.find((t) => t.textContent === 'robot') || visible[0];
    const tb = sample.getBoundingClientRect();
    const cs = getComputedStyle(sample);
    // effective rendered font size = font-size in viewBox units * screen scale
    const scaleX = ctm.a, scaleY = ctm.d;
    // count visible vs hidden labels
    const nVis = visible.length, nHid = texts.length - visible.length;
    return {
      svgWidth: r.width, svgHeight: r.height, viewBox: vb,
      declaredFontSize: cs.fontSize,
      screenScaleX: scaleX, screenScaleY: scaleY,
      effectivePx: 3.0 * Math.min(scaleX, scaleY),
      sampleWord: sample.textContent,
      sampleRect: { w: tb.width, h: tb.height },
      visibleLabels: nVis, hiddenLabels: nHid,
      touchAction: getComputedStyle(document.querySelector('.mapwrap')).touchAction,
      viewportMeta: document.querySelector('meta[name=viewport]').content,
    };
  });
  console.log(JSON.stringify(data, null, 2));

  // Selected label size check
  const sel = await page.evaluate(() => {
    // simulate selecting 'robot'
    if (typeof mapSelect === 'function') mapSelect('robot');
    const svg = document.getElementById('mapSvg');
    const ctm = svg.getScreenCTM();
    const g = document.querySelectorAll('.node.sel text');
    const cs = g.length ? getComputedStyle(g[0]) : null;
    return { selFontSize: cs ? cs.fontSize : null, effectiveSelPx: cs ? parseFloat(cs.fontSize) * Math.min(ctm.a, ctm.d) : null };
  });
  console.log(JSON.stringify(sel, null, 2));

  // check for wheel/dblclick zoom listeners by dispatching and observing viewBox
  const zoomTest = await page.evaluate(async () => {
    const svg = document.getElementById('mapSvg');
    const before = svg.getAttribute('viewBox');
    const wrap = document.querySelector('.mapwrap');
    wrap.dispatchEvent(new WheelEvent('wheel', { deltaY: -200, bubbles: true, cancelable: true }));
    wrap.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true, clientX: 180, clientY: 300 }));
    await new Promise((r) => setTimeout(r, 300));
    const after = svg.getAttribute('viewBox');
    return { before, after, changed: before !== after };
  });
  console.log('zoomTest', JSON.stringify(zoomTest));

  await page.screenshot({ path: '/Users/rodcolin/Projects/RSA 2026/.verify/refute-map360.png' });
  await browser.close();
})();
