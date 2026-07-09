const puppeteer = require('puppeteer-core');
(async () => {
  const browser = await puppeteer.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: 'new',
    args: ['--no-sandbox'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844 }); // phone-ish
  await page.goto('file:///Users/rodcolin/Projects/RSA%202026/glass-engine.html');
  await new Promise((r) => setTimeout(r, 500));

  // Navigate to the meaning section (find nav that reveals #mapSvg / wmGo)
  const navInfo = await page.evaluate(() => {
    const btns = [...document.querySelectorAll('button, [role="tab"], nav a, .navbtn, .tab')].map((b, i) => ({ i, text: (b.textContent || '').trim().slice(0, 30), cls: b.className }));
    return btns;
  });
  console.log('buttons:', JSON.stringify(navInfo.slice(0, 25)));

  // click any nav item mentioning meaning/map
  const clicked = await page.evaluate(() => {
    const cands = [...document.querySelectorAll('button, a, [role="tab"]')];
    const t = cands.find((b) => /meaning/i.test(b.textContent || ''));
    if (t) { t.click(); return t.textContent.trim(); }
    return null;
  });
  console.log('clicked nav:', clicked);
  await new Promise((r) => setTimeout(r, 600));

  const visible = await page.evaluate(() => {
    const svg = document.getElementById('mapSvg');
    const r = svg ? svg.getBoundingClientRect() : null;
    return { hasSvg: !!svg, rect: r ? { w: r.width, h: r.height } : null, wmGo: !!document.getElementById('wmGo') };
  });
  console.log('visible:', JSON.stringify(visible));

  // Run word math preset king - man + woman (default values)
  await page.evaluate(() => document.getElementById('wmGo').click());
  await new Promise((r) => setTimeout(r, 1600)); // wait for 1s animation + land

  const afterMath = await page.evaluate(() => ({
    ghostChildren: document.getElementById('mapGhost').children.length,
    out: document.getElementById('wmOut').textContent,
  }));
  console.log('after wordMath:', JSON.stringify(afterMath));
  await page.screenshot({ path: '/Users/rodcolin/Projects/RSA 2026/.verify/ghost-after-math.png' });

  // Now select an unrelated word via mapSelect (as a tap would)
  await page.evaluate(() => mapSelect('drums'));
  await new Promise((r) => setTimeout(r, 400));

  const afterSelect = await page.evaluate(() => {
    const ghost = document.getElementById('mapGhost');
    const kids = [...ghost.children].map((c) => c.tagName);
    // check computed visibility of ghost dot
    const circ = ghost.querySelector('circle.ghost');
    let op = null;
    if (circ) op = getComputedStyle(circ).opacity;
    return { ghostChildren: ghost.children.length, kids, circleOpacity: op, nbCap: document.getElementById('nbCap').textContent };
  });
  console.log('after mapSelect(drums):', JSON.stringify(afterSelect));
  await page.screenshot({ path: '/Users/rodcolin/Projects/RSA 2026/.verify/ghost-after-select.png' });

  // wait 5 more seconds to check for any delayed cleanup/fade
  await new Promise((r) => setTimeout(r, 5000));
  const later = await page.evaluate(() => {
    const ghost = document.getElementById('mapGhost');
    const circ = ghost.querySelector('circle.ghost');
    return { ghostChildren: ghost.children.length, circleOpacity: circ ? getComputedStyle(circ).opacity : null };
  });
  console.log('5s later:', JSON.stringify(later));

  await browser.close();
})().catch((e) => { console.error('ERR', e); process.exit(1); });
