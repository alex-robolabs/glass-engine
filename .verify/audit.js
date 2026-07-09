const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');
(async () => {
  const src = path.resolve('..', 'glass-engine.html');
  const browser = await puppeteer.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: 'new',
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 360, height: 740 });
  const requests = [];
  page.on('request', r => requests.push(r.url()));
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.goto('file://' + src, { waitUntil: 'networkidle0' });
  const nonFile = requests.filter(u => !u.startsWith('file://') && !u.startsWith('data:'));
  console.log('non-file requests:', JSON.stringify(nonFile));
  console.log('page errors:', JSON.stringify(errors));
  const scroll = await page.evaluate(() => document.documentElement.scrollWidth + ' vs ' + window.innerWidth);
  console.log('scrollWidth vs innerWidth @360:', scroll);
  // header / footer / tagline text
  const texts = await page.evaluate(() => ({
    h1: document.querySelector('h1').textContent,
    tag: document.querySelector('.tag').textContent,
    foot: document.querySelector('.pagefoot').textContent,
    tabs: [...document.querySelectorAll('.tabs button')].map(b => b.textContent),
    gauges: document.querySelectorAll('.gauge').length,
  }));
  console.log(JSON.stringify(texts, null, 1));
  // tokens: strawberry
  await page.evaluate(() => {
    document.querySelectorAll('.tabs button')[1].click();
    document.getElementById('tryStraw').click();
  });
  const tok = await page.evaluate(() => ({
    toks: [...document.querySelectorAll('#tokOut .tok-t')].map(t => t.textContent),
    count: document.getElementById('tokCount').textContent,
    strawCapHidden: document.getElementById('strawCap').hidden,
    ctx: document.getElementById('ctxPct').textContent,
  }));
  console.log('tokens:', JSON.stringify(tok));
  // pass all checkpoints
  const ck = await page.evaluate(() => {
    const CORRECT = [1, 0, 2, 0, 2];
    const boxes = document.querySelectorAll('.checkpoint');
    boxes.forEach((box, m) => {
      const opts = box.querySelectorAll('.ck-opt');
      // wrong first, then right (retry works?)
      opts[(CORRECT[m] + 1) % 3].click();
      opts[CORRECT[m]].click();
    });
    return {
      full: document.querySelectorAll('.gauge.full').length,
      bannerHidden: document.getElementById('licBanner').hidden,
    };
  });
  await new Promise(r => setTimeout(r, 1600));
  const lic = await page.evaluate(() => {
    document.getElementById('licOpen').click();
    document.getElementById('licName').value = 'ada lovelace';
    document.getElementById('licName').dispatchEvent(new Event('input'));
    return {
      bannerHidden: document.getElementById('licBanner').hidden,
      name: document.getElementById('cardName').textContent,
      date: document.getElementById('cardDate').textContent,
      meta: document.querySelector('.card-meta').textContent,
      cert: document.querySelector('.card-cert').textContent,
      miniGauges: document.getElementById('cardGauges').childElementCount,
      nudge: document.querySelector('.lic-nudge').textContent,
    };
  });
  console.log('checkpoints:', JSON.stringify(ck), 'license:', JSON.stringify(lic));
  await page.screenshot({ path: 'audit-license.png' });
  await browser.close();

  // extendability test: add a 3rd preset, reload in a temp copy
  const html = fs.readFileSync(src, 'utf8');
  const inject = html.replace('const ATTENTION_PRESETS = [', `const ATTENTION_PRESETS = [
  { label: 'test third', words: ['The','dog','chased','the','ball','because','it','was'], it: 6,
    endings: [ { word: 'fast', answer: 4, weights: [0.05,0.2,0.1,0.05,0.45,0.05,0,0.1] } ] },`);
  const tmp = '/tmp/ge-test.html';
  fs.writeFileSync(tmp, inject);
  const b2 = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new' });
  const p2 = await b2.newPage();
  await p2.setViewport({ width: 360, height: 740 });
  const err2 = [];
  p2.on('pageerror', e => err2.push(String(e)));
  await p2.goto('file://' + tmp, { waitUntil: 'networkidle0' });
  const ext = await p2.evaluate(() => {
    document.querySelectorAll('.tabs button')[3].click();
    const chips = [...document.querySelectorAll('#attPresets .chip')].map(c => c.textContent);
    chips.length && document.querySelectorAll('#attPresets .chip')[0].click(); // load new preset (index 0)
    const words = [...document.querySelectorAll('#attWords .aw')].map(w => w.textContent);
    // pick a word, see reveal
    document.querySelectorAll('#attWords .aw')[4].click();
    return { chips, words, verdict: document.getElementById('attVerdict').textContent,
      paths: document.querySelectorAll('#attSvg path').length };
  });
  console.log('extendability:', JSON.stringify(ext), 'errors:', JSON.stringify(err2));
  await b2.close();
})().catch(e => { console.error('FAIL', e); process.exit(1); });
