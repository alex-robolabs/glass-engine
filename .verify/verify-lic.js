const puppeteer = require('puppeteer-core');
(async () => {
  const browser = await puppeteer.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: 'new'
  });
  const page = await browser.newPage();
  await page.goto('file:///Users/rodcolin/Projects/RSA%202026/glass-engine.html');
  await new Promise(r => setTimeout(r, 500));
  const res = await page.evaluate(() => {
    const passedBefore = JSON.stringify(window.S ? S.passed : 'S not global');
    const bannerHidden = document.getElementById('licBanner').hidden;
    const btn = document.getElementById('licOpen');
    const rect = btn.getBoundingClientRect();
    btn.click();
    const modalHidden = document.getElementById('licModal').hidden;
    const heading = document.getElementById('licH').textContent;
    const date = document.getElementById('cardDate').textContent;
    const gauges = document.getElementById('cardGauges').childElementCount;
    return { passedBefore, bannerHidden, btnRect: { w: rect.width, h: rect.height }, modalOpenedAfterClick: !modalHidden, heading, date, gauges };
  });
  console.log(JSON.stringify(res, null, 2));
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
