const puppeteer = require('puppeteer-core');
(async () => {
  const browser = await puppeteer.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: 'new',
  });
  const page = await browser.newPage();
  await page.goto('file:///Users/rodcolin/Projects/RSA%202026/glass-engine.html');

  const result = await page.evaluate(() => {
    // set temperature to 0.2 via the real slider
    const slider = document.getElementById('tempSlider');
    slider.value = '0.2';
    slider.dispatchEvent(new Event('input', { bubbles: true }));

    // instrument chooseWord to record the last sampled word passed in
    const orig = chooseWord;
    let lastArg = null;
    chooseWord = function (w) { lastArg = w; return orig(w); };

    const runs = [];
    for (let t = 0; t < 5; t++) {
      // click the 'at lunch' starter chip
      const chips = [...document.querySelectorAll('#starters .chip')];
      const chip = chips.find((c) => c.textContent === 'at lunch');
      chip.click();
      lastArg = null;
      let steps = 0;
      while (!genDone && steps < 200) { rollOnce(); steps++; }
      // what the student sees
      const shown = document.getElementById('genOut').textContent;
      // model's true P(END | last displayed word)
      const last = seq[seq.length - 1];
      const cands = candidates(last);
      const endCand = cands.find((c) => c.w === END);
      runs.push({
        seqLen: seq.length,
        lastWord: last,
        lastSampled: lastArg,
        cappedNotEnd: lastArg !== END && genDone,
        pEndGivenLast: endCand ? endCand.p : 0,
        shownTail: shown.split(/(?=■)|\s+/).slice(-8).join(' '),
        endsWithSquare: shown.trimEnd().endsWith(END),
      });
    }

    // also: does 'my' ever precede END in the chain (any sentence end with 'my')?
    const myMap = CHAIN.get('my');
    const pEndAfterMy = myMap && myMap.has(END) ? myMap.get(END) : 0;

    // check whether any run at default temp 1.0 also caps (10 tries)
    slider.value = '1';
    slider.dispatchEvent(new Event('input', { bubbles: true }));
    let capsAtT1 = 0;
    for (let t = 0; t < 20; t++) {
      const chips = [...document.querySelectorAll('#starters .chip')];
      chips.find((c) => c.textContent === 'the robot').click();
      lastArg = null;
      let steps = 0;
      while (!genDone && steps < 200) { rollOnce(); steps++; }
      if (lastArg !== END) capsAtT1++;
    }
    return { runs, pEndAfterMy, capsAtT1 };
  });

  console.log(JSON.stringify(result, null, 2));
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
