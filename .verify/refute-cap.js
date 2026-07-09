const puppeteer = require('puppeteer-core');

(async () => {
  const browser = await puppeteer.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: 'new',
  });
  const page = await browser.newPage();
  await page.goto('file:///Users/rodcolin/Projects/RSA%202026/glass-engine.html');
  await new Promise((r) => setTimeout(r, 500));

  const result = await page.evaluate(() => {
    // go to predict tab state; click starter chip "the robot"
    const chips = [...document.querySelectorAll('#starters button, #starters .chip')];
    const chip = chips.find((c) => c.textContent.includes('the robot')) || chips[0];
    if (!chip) return { error: 'no starter chip found', chips: chips.length };
    chip.click();

    const log = [];
    const seqText = () => [...document.querySelectorAll('#genOut .gw')].map((s) => s.textContent);

    for (let i = 0; i < 40; i++) {
      // pick first visible bar that is NOT the stop token
      const bars = [...document.querySelectorAll('#bars button, .bar')].filter(
        (b) => b.dataset.w != null && b.style.visibility !== 'hidden'
      );
      const bar = bars.find((b) => b.dataset.w !== '■');
      if (!bar) { log.push({ tap: i + 1, note: 'no non-stop bar available', before: seqText().length }); break; }
      const chosen = bar.dataset.w;
      const before = seqText();
      bar.click();
      const after = seqText();
      const appended = after.length === before.length + 1 && after[after.length - 1] === chosen;
      log.push({ tap: i + 1, chosen, beforeLen: before.length, afterLen: after.length, appended, last: after[after.length - 1] });
      const barsVisible = document.getElementById('bars').style.display !== 'none';
      if (!barsVisible) break;
    }
    return { log, finalSeq: seqText().join(' ') };
  });

  console.log(JSON.stringify(result.log ? result.log.slice(-5) : result, null, 2));
  console.log('FINAL:', result.finalSeq);
  await browser.close();
})();
