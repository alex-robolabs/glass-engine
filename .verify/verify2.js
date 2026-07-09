const puppeteer = require('puppeteer-core');

(async () => {
  const browser = await puppeteer.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: 'new',
    defaultViewport: { width: 360, height: 740 }, // desktop-mode 360px window
    args: ['--no-sandbox', '--hide-scrollbars'],
  });
  const page = await browser.newPage();
  await page.goto('file:///Users/rodcolin/Projects/RSA%202026/glass-engine.html', { waitUntil: 'networkidle0' });

  await page.evaluate(() => {
    const btns = [...document.querySelectorAll('button, [role="tab"], a')];
    const b = btns.find(x => /tok/i.test(x.textContent));
    if (b) b.click();
  });
  await new Promise(r => setTimeout(r, 300));

  await page.evaluate(() => {
    const ta = document.getElementById('tokIn');
    ta.value = '\u{1F602}'.repeat(80);
    ta.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await new Promise(r => setTimeout(r, 500));

  const r = await page.evaluate(() => {
    const tok = document.querySelector('#tokOut .tok');
    const rect = tok.getBoundingClientRect();
    const panel = document.getElementById('tokOut').closest('.panel, section, .card') || document.getElementById('tokOut').parentElement;
    const pr = panel.getBoundingClientRect();
    return {
      tokWidth: Math.round(rect.width),
      tokRight: Math.round(rect.right),
      panelRight: Math.round(pr.right),
      panelClass: panel.className,
      layoutViewport: document.documentElement.clientWidth,
      innerWidth: window.innerWidth,
      vvScale: window.visualViewport ? window.visualViewport.scale : null,
      vvWidth: window.visualViewport ? Math.round(window.visualViewport.width) : null,
      docScrollWidth: document.documentElement.scrollWidth,
      countLabel: document.getElementById('tokCount').textContent,
    };
  });
  console.log(JSON.stringify(r, null, 2));

  // scroll the token area into view for the screenshot
  await page.evaluate(() => document.getElementById('tokOut').scrollIntoView({ block: 'center' }));
  await new Promise(r2 => setTimeout(r2, 200));
  await page.screenshot({ path: '/Users/rodcolin/Projects/RSA 2026/.verify/verify-desktop360-emoji.png' });

  // can the user scroll horizontally by gesture? body overflow-x hidden propagates to viewport.
  const scrollTest = await page.evaluate(() => {
    window.scrollTo(9999, window.scrollY);
    return { scrollXAfter: window.scrollX };
  });
  console.log(JSON.stringify(scrollTest));

  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
