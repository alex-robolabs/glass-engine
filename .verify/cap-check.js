const puppeteer = require('puppeteer-core');

(async () => {
  const browser = await puppeteer.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: 'new',
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 360, height: 740 });
  await page.goto('file:///Users/rodcolin/Projects/RSA%202026/glass-engine.html', { waitUntil: 'load' });

  const data = await page.evaluate(() => {
    const out = [];
    document.querySelectorAll('p.cap').forEach((el) => {
      const text = el.textContent.trim().replace(/\s+/g, ' ');
      if (!text) return;
      const wasHidden = el.hidden;
      if (wasHidden) el.hidden = false;
      const cs = getComputedStyle(el);
      const lineH = parseFloat(cs.lineHeight);
      const rect = el.getBoundingClientRect();
      // element may be in a hidden section; force measure by cloning into body
      let h = rect.height;
      if (h === 0) {
        const clone = el.cloneNode(true);
        clone.hidden = false;
        clone.style.cssText = 'position:absolute;visibility:hidden;width:328px;';
        document.body.appendChild(clone);
        h = clone.getBoundingClientRect().height;
        clone.remove();
      }
      if (wasHidden) el.hidden = true;
      const sentences = (text.match(/[.!?](\s|$)/g) || []).length;
      out.push({
        id: el.id || '(no id)',
        words: text.split(' ').length,
        chars: text.length,
        heightPx: Math.round(h),
        approxLines: lineH ? Math.round(h / lineH) : null,
        sentences,
        text: text.slice(0, 70) + (text.length > 70 ? '...' : ''),
      });
    });
    return out;
  });

  console.table(data);
  await browser.close();
})();
