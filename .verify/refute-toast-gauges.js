const puppeteer = require('puppeteer-core');

const FILE = 'file://' + encodeURI('/Users/rodcolin/Projects/RSA 2026/glass-engine.html');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function measure(page) {
  return page.evaluate(() => {
    const g = document.querySelector('.gauges');
    const t = document.querySelector('.toast');
    const gr = g ? g.getBoundingClientRect() : null;
    const tr = t ? t.getBoundingClientRect() : null;
    const inView = (r) => r && r.bottom > 0 && r.top < innerHeight;
    let overlap = false;
    if (gr && tr) {
      overlap = tr.left < gr.right && tr.right > gr.left && tr.top < gr.bottom && tr.bottom > gr.top && inView(gr);
    }
    return {
      scrollY: scrollY,
      gauges: gr ? { top: gr.top, bottom: gr.bottom, left: gr.left, right: gr.right, visible: inView(gr) } : null,
      toast: tr ? { top: tr.top, bottom: tr.bottom, left: tr.left, right: tr.right, text: t.textContent } : null,
      overlap,
    };
  });
}

async function realisticRun(browser, vp, label, finalModule) {
  const page = await browser.newPage();
  await page.setViewport(vp);
  await page.goto(FILE, { waitUntil: 'load' });
  await sleep(500);

  // pass 4 checkpoints programmatically (order: all except finalModule)
  await page.evaluate((fin) => {
    document.querySelectorAll('.checkpoint').forEach((box) => {
      const m = parseInt(box.dataset.m, 10);
      if (m === fin) return;
      box.querySelectorAll('.ck-opt')[CHECKPOINTS[m].correct].click();
    });
  }, finalModule);
  await sleep(300);

  // Now the REAL flow for the final one: switch to its tab, scroll to the
  // checkpoint like a human, click the correct option with a real mouse click.
  await page.evaluate((fin) => showTab(fin), finalModule);
  await sleep(300);
  const btnBox = await page.evaluate((fin) => {
    const box = [...document.querySelectorAll('.checkpoint')].find((b) => parseInt(b.dataset.m, 10) === fin);
    box.scrollIntoView({ block: 'center' });
    const btn = box.querySelectorAll('.ck-opt')[CHECKPOINTS[fin].correct];
    const r = btn.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }, finalModule);
  await sleep(200);
  // re-read position after scroll settles
  const btnBox2 = await page.evaluate((fin) => {
    const box = [...document.querySelectorAll('.checkpoint')].find((b) => parseInt(b.dataset.m, 10) === fin);
    const btn = box.querySelectorAll('.ck-opt')[CHECKPOINTS[fin].correct];
    const r = btn.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }, finalModule);
  await page.mouse.click(btnBox2.x, btnBox2.y);

  // sample: during sweep (600ms), at toast appearance (1400ms)
  await sleep(600);
  const during = await measure(page);
  await sleep(800); // t=1400ms, toast visible
  const atToast = await measure(page);
  await page.screenshot({ path: `/Users/rodcolin/Projects/RSA 2026/.verify/refute-${label}-realflow.png` });

  // artificial state: scroll to top while toast alive
  await page.evaluate(() => scrollTo(0, 0));
  await sleep(150);
  const scrolledTop = await measure(page);
  await page.screenshot({ path: `/Users/rodcolin/Projects/RSA 2026/.verify/refute-${label}-scrolltop.png` });

  console.log(`\n=== ${label} (final module ${finalModule}) ===`);
  console.log('t=600ms during sweep :', JSON.stringify(during));
  console.log('t=1400ms toast live  :', JSON.stringify(atToast));
  console.log('after scrollTo(0,0)  :', JSON.stringify(scrolledTop));
  await page.close();
}

(async () => {
  const browser = await puppeteer.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: 'new',
  });
  try {
    await realisticRun(browser, { width: 360, height: 740, deviceScaleFactor: 2, isMobile: true, hasTouch: true }, 'm360-loop', 4);
    await realisticRun(browser, { width: 360, height: 740, deviceScaleFactor: 2, isMobile: true, hasTouch: true }, 'm360-predict', 0);
    await realisticRun(browser, { width: 1280, height: 900, deviceScaleFactor: 1 }, 'd1280-loop', 4);
  } finally {
    await browser.close();
  }
})().catch((e) => { console.error(e); process.exit(1); });
