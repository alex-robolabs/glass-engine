const puppeteer = require('puppeteer-core');

(async () => {
  const browser = await puppeteer.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: 'new',
    args: ['--no-sandbox']
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });
  await page.goto('file:///Users/rodcolin/Projects/RSA%202026/glass-engine.html');

  // Reveal the license banner (normally shown after all checkpoints pass)
  await page.evaluate(() => { document.getElementById('licBanner').hidden = false; });

  // Focus the invoking button and open the modal via keyboard (Enter)
  await page.evaluate(() => { document.getElementById('licOpen').focus(); });
  await page.keyboard.press('Enter');
  await new Promise(r => setTimeout(r, 300)); // wait past the 50ms focus timeout

  const afterOpen = await page.evaluate(() => ({
    modalHidden: document.getElementById('licModal').hidden,
    active: document.activeElement ? document.activeElement.id || document.activeElement.tagName : null,
    insideModal: !!(document.activeElement && document.activeElement.closest('#licModal'))
  }));
  console.log('After open:', JSON.stringify(afterOpen));

  // Press Tab repeatedly, track where focus goes
  const trail = [];
  let escaped = null;
  for (let i = 1; i <= 12; i++) {
    await page.keyboard.press('Tab');
    const st = await page.evaluate(() => {
      const a = document.activeElement;
      return {
        id: a ? (a.id || a.tagName + (a.textContent ? ':' + a.textContent.slice(0, 25) : '')) : 'none',
        inside: !!(a && a.closest('#licModal'))
      };
    });
    trail.push(`${i}:${st.id}${st.inside ? '' : ' [OUTSIDE MODAL]'}`);
    if (!st.inside && escaped === null) escaped = i;
  }
  console.log('Tab trail:', trail.join(' | '));
  console.log('Focus escaped modal at Tab press #:', escaped);

  // Can we actually interact with the background while modal is open?
  const canInteract = await page.evaluate(() => {
    const a = document.activeElement;
    const modalOpen = !document.getElementById('licModal').hidden;
    return { modalStillOpen: modalOpen, activeNow: a ? (a.id || a.tagName) : null };
  });
  console.log('While modal open:', JSON.stringify(canInteract));

  // Now test Escape-close focus restoration.
  // Re-open cleanly: focus licOpen, Enter, wait, then Escape.
  await page.evaluate(() => { document.getElementById('licModal').hidden = true; document.getElementById('licOpen').focus(); });
  await page.keyboard.press('Enter');
  await new Promise(r => setTimeout(r, 300));
  const preEsc = await page.evaluate(() => document.activeElement.id);
  await page.keyboard.press('Escape');
  await new Promise(r => setTimeout(r, 100));
  const afterEsc = await page.evaluate(() => {
    const a = document.activeElement;
    return {
      modalHidden: document.getElementById('licModal').hidden,
      activeId: a ? (a.id || a.tagName) : null,
      activeIsHidden: a ? !(a.offsetParent || a === document.body || a.tagName === 'BODY') : null,
      restoredToLicOpen: a === document.getElementById('licOpen')
    };
  });
  console.log('Focus before Escape:', preEsc);
  console.log('After Escape:', JSON.stringify(afterEsc));

  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
