const puppeteer = require('puppeteer-core');
const path = require('path');

(async () => {
  const browser = await puppeteer.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: 'new',
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 760 });
  await page.goto('file://' + path.resolve(__dirname, '../glass-engine.html'));
  await new Promise(r => setTimeout(r, 500));

  const correct = [1, 0, 2, 0, 2];
  // Answer checkpoints 1-4 via real clicks
  const res = await page.evaluate((correct) => {
    const boxes = document.querySelectorAll('.checkpoint');
    const out = [];
    boxes.forEach((box, idx) => {
      if (idx === 4) return;
      const btns = box.querySelectorAll('.ck-opt');
      btns[correct[idx]].click();
      out.push(idx + ':' + btns[correct[idx]].textContent.slice(0, 20));
    });
    return out;
  }, correct);
  console.log('answered 1-4:', res);
  await new Promise(r => setTimeout(r, 300));

  // Answer 5th checkpoint (starts the 1200ms license-toast timer)
  await page.evaluate((correct) => {
    const box = document.querySelectorAll('.checkpoint')[4];
    box.querySelectorAll('.ck-opt')[correct[4]].click();
  }, correct);

  // Within the 1.2s window, tap the title 5 times (real clicks) to fire the egg toast
  await page.evaluate(() => {
    const t = document.getElementById('title');
    for (let i = 0; i < 5; i++) t.click();
  });

  // Wait past the 1200ms delay so the license toast has appended too
  await new Promise(r => setTimeout(r, 1500));

  const state = await page.evaluate(() => {
    const toasts = [...document.querySelectorAll('.toast')];
    return toasts.map(t => {
      const r = t.getBoundingClientRect();
      const cs = getComputedStyle(t);
      return { text: t.textContent, top: r.top, left: r.left, w: r.width, h: r.height, z: cs.zIndex, bg: cs.backgroundColor };
    });
  });
  console.log('live toasts:', JSON.stringify(state, null, 2));
  await page.screenshot({ path: __dirname + '/verify-toast-overlap.png' });

  // Also test the double-egg (10 taps)
  await new Promise(r => setTimeout(r, 3000)); // let old toasts expire
  await page.evaluate(() => {
    const t = document.getElementById('title');
    for (let i = 0; i < 10; i++) t.click();
  });
  await new Promise(r => setTimeout(r, 200));
  const dbl = await page.evaluate(() => [...document.querySelectorAll('.toast')].map(t => t.textContent));
  console.log('double-egg toasts:', dbl.length, dbl);

  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
