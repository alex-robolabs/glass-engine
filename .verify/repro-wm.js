const puppeteer = require('puppeteer-core');

(async () => {
  const browser = await puppeteer.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: 'new',
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });
  await page.goto('file:///Users/rodcolin/Projects/RSA%202026/glass-engine.html');
  await new Promise((r) => setTimeout(r, 800));

  // check reduced-motion state (headless default should be no-preference)
  const reduced = await page.evaluate(
    () => matchMedia('(prefers-reduced-motion: reduce)').matches
  );
  console.log('prefers-reduced-motion:', reduced);

  // find the preset chips inside #wmPresets
  const chips = await page.evaluate(() =>
    Array.from(document.querySelectorAll('#wmPresets .chip')).map((c) => c.textContent)
  );
  console.log('chips:', JSON.stringify(chips));

  // click first preset (king - man + woman)
  await page.evaluate(() => document.querySelectorAll('#wmPresets .chip')[0].click());
  await new Promise((r) => setTimeout(r, 100));
  // click second preset (robot - wheels + wings) while first is in flight
  await page.evaluate(() => document.querySelectorAll('#wmPresets .chip')[1].click());

  // wait for the first animation to land (1050ms timeout inside wordMath)
  await new Promise((r) => setTimeout(r, 1600));

  const state = await page.evaluate(() => ({
    A: document.getElementById('wmA').value,
    B: document.getElementById('wmB').value,
    C: document.getElementById('wmC').value,
    out: document.getElementById('wmOut').textContent,
    pulsing: Array.from(document.querySelectorAll('.node.pulse')).map(
      (n) => n.textContent || n.getAttribute('data-w') || 'node'
    ),
  }));
  console.log('AFTER DOUBLE-CLICK PRESETS:');
  console.log('  dropdowns:', state.A, '-', state.B, '+', state.C);
  console.log('  wmOut    :', JSON.stringify(state.out));
  console.log('  pulsing  :', JSON.stringify(state.pulsing));

  // Also test Compute button dropped while busy:
  await page.evaluate(() => document.querySelectorAll('#wmPresets .chip')[0].click()); // start anim
  await new Promise((r) => setTimeout(r, 100));
  // user manually changes C then clicks Compute while busy
  await page.evaluate(() => {
    document.getElementById('wmC').value = 'kitten';
    document.getElementById('wmGo').click();
  });
  await new Promise((r) => setTimeout(r, 1600));
  const state2 = await page.evaluate(() => ({
    A: document.getElementById('wmA').value,
    B: document.getElementById('wmB').value,
    C: document.getElementById('wmC').value,
    out: document.getElementById('wmOut').textContent,
  }));
  console.log('AFTER COMPUTE-WHILE-BUSY:');
  console.log('  dropdowns:', state2.A, '-', state2.B, '+', state2.C);
  console.log('  wmOut    :', JSON.stringify(state2.out));

  await browser.close();
})();
