const puppeteer = require('puppeteer-core');
(async () => {
  const browser = await puppeteer.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: 'new',
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 360, height: 740, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  await page.goto('file:///Users/rodcolin/Projects/RSA 2026/glass-engine.html');
  await new Promise(r => setTimeout(r, 400));

  const res = await page.evaluate(() => {
    const fs = (sel) => {
      const n = document.querySelector(sel);
      return n ? getComputedStyle(n).fontSize : 'MISSING';
    };
    const out = {};
    out.htmlFont = getComputedStyle(document.documentElement).fontSize;
    out.fpIn = fs('#fpIn');
    out.select = fs('#wmA');
    out.textarea = fs('#tokIn');
    out.licName = fs('#licName');
    out.tempSlider = fs('#tempSlider');
    out.viewportMeta = document.querySelector('meta[name=viewport]').content;
    out.hScroll = document.documentElement.scrollWidth + ' vs ' + document.documentElement.clientWidth;

    // needle pivot check: bbox center of rotation
    const g = document.querySelector('.g-needle-rot');
    out.needleComputedTransform = getComputedStyle(g).transform;
    out.needleTransformOrigin = getComputedStyle(g).transformOrigin;
    out.needleTransformBox = getComputedStyle(g).transformBox;
    const svg = g.ownerSVGElement;
    out.svgClientW = svg.getBoundingClientRect().width;

    // where does the needle tip land visually at -120deg? (screen coords of line end)
    const line = g.querySelector('line');
    const r = line.getBoundingClientRect();
    const sr = svg.getBoundingClientRect();
    out.needleBBoxRelSvg = { x: +(r.x - sr.x).toFixed(1), y: +(r.y - sr.y).toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1) };

    // hover rules present?
    out.hoverRules = [];
    for (const sheet of document.styleSheets) {
      for (const rule of sheet.cssRules) {
        if (rule.selectorText && rule.selectorText.includes(':hover')) out.hoverRules.push(rule.selectorText);
      }
    }
    // tabs metrics
    const tabs = document.querySelector('.tabs');
    const cs = getComputedStyle(tabs);
    out.tabs = { position: cs.position, paddingBottom: cs.paddingBottom, height: tabs.getBoundingClientRect().height };
    out.tabBtnFont = getComputedStyle(document.querySelector('.tabs button')).fontSize;
    return out;
  });
  console.log(JSON.stringify(res, null, 2));
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
