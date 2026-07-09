const puppeteer = require('puppeteer-core');

(async () => {
  const browser = await puppeteer.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: 'new',
    defaultViewport: { width: 360, height: 740, isMobile: true, deviceScaleFactor: 2 },
    args: ['--no-sandbox', '--hide-scrollbars'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 360, height: 740, isMobile: true, deviceScaleFactor: 2 });
  await page.goto('file:///Users/rodcolin/Projects/RSA%202026/glass-engine.html', { waitUntil: 'networkidle0' });

  // Go to TOKENS tab
  await page.evaluate(() => {
    const btns = [...document.querySelectorAll('button, [role="tab"], a')];
    const b = btns.find(x => /token/i.test(x.textContent));
    if (b) b.click();
  });
  await new Promise(r => setTimeout(r, 400));

  // Paste 80 laughing emoji, no spaces
  const results = {};
  for (const [name, input] of [['emoji80', '😂'.repeat(80)], ['bang300', '!'.repeat(300)]]) {
    await page.evaluate((val) => {
      const ta = document.getElementById('tokIn');
      ta.value = val;
      ta.dispatchEvent(new Event('input', { bubbles: true }));
    }, input);
    await new Promise(r => setTimeout(r, 500)); // debounce 90ms + animation

    results[name] = await page.evaluate(() => {
      const toks = [...document.querySelectorAll('#tokOut .tok')];
      const widths = toks.map(t => Math.round(t.getBoundingClientRect().width));
      const panel = document.querySelector('#tokOut').closest('section, .panel, .card, div');
      const panelRect = panel ? panel.getBoundingClientRect() : null;
      const first = toks[0] ? toks[0].getBoundingClientRect() : null;
      return {
        tokenCount: toks.length,
        maxTokWidth: Math.max(...widths, 0),
        firstTokRight: first ? Math.round(first.right) : null,
        docScrollWidth: document.documentElement.scrollWidth,
        bodyScrollWidth: document.body.scrollWidth,
        innerWidth: window.innerWidth,
        countLabel: document.getElementById('tokCount')?.textContent,
        bodyOverflowX: getComputedStyle(document.body).overflowX,
        htmlOverflowX: getComputedStyle(document.documentElement).overflowX,
        canScrollHoriz: document.documentElement.scrollWidth > window.innerWidth,
      };
    });
    await page.screenshot({ path: `/Users/rodcolin/Projects/RSA 2026/.verify/verify-${name}-360.png` });
  }

  console.log(JSON.stringify(results, null, 2));

  // Also try horizontal scroll attempt to see if user could even see the rest
  await page.evaluate(() => window.scrollTo(500, 0));
  const scrolledX = await page.evaluate(() => window.scrollX);
  console.log('scrollX after scrollTo(500,0):', scrolledX);

  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
