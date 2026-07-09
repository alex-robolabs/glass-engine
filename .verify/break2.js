// break-it tester: abuse scenarios for glass-engine.html
const puppeteer = require('puppeteer-core');
const path = require('path');
const { pathToFileURL } = require('url');

const APP = pathToFileURL(path.resolve(__dirname, '..', 'glass-engine.html')).href;
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const results = [];
function log(name, data) { results.push({ name, data }); console.log('== ' + name + ' ==\n' + JSON.stringify(data, null, 1)); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function realClick(page, sel) {
  const pt = await page.evaluate((s) => {
    const el = document.querySelector(s);
    el.scrollIntoView({ block: 'center', behavior: 'instant' });
    const r = el.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  }, sel);
  await page.mouse.click(pt.x, pt.y);
}

(async () => {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--allow-file-access-from-files'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 360, height: 740, deviceScaleFactor: 2, hasTouch: true });
  const pageErrors = [];
  const consoleErrs = [];
  page.on('pageerror', (e) => pageErrors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') consoleErrs.push(m.text()); });
  const errSnapshot = (() => { let last = 0; return () => { const s = pageErrors.slice(last); last = pageErrors.length; return s; }; })();

  await page.goto(APP);
  await sleep(400);
  log('load', { errors: errSnapshot(), consoleErrs: consoleErrs.slice() });

  // ---------- 1. PREDICT abuse ----------
  // pick starter, rapid-fire roll + auto together
  await page.evaluate(() => document.querySelectorAll('#starters .chip')[0].click());
  for (let i = 0; i < 6; i++) { await realClick(page, '#rollBtn'); }
  // click auto then hammer both real buttons fast (disabled state should swallow)
  await realClick(page, '#autoBtn');
  for (let i = 0; i < 8; i++) {
    await realClick(page, '#rollBtn');
    await realClick(page, '#autoBtn');
  }
  await sleep(500);
  const st1 = await page.evaluate(() => ({ seqLen: seq.length, genDone, autoTimerSet: !!autoTimer, rollDisabled: document.getElementById('rollBtn').disabled, autoDisabled: document.getElementById('autoBtn').disabled }));
  log('predict.rapid-roll-auto', { st1, errors: errSnapshot() });

  // Start over during auto-finish
  await page.evaluate(() => { resetGen('the robot'); autoFinish(); });
  await sleep(450); // mid-generation
  await realClick(page, '#resetBtn');
  await sleep(900);
  const st2 = await page.evaluate(() => ({ seqLen: seq.length, genDone, autoTimerSet: !!autoTimer, out: document.getElementById('genOut').textContent.slice(0, 60), barsShown: document.getElementById('bars').style.display }));
  log('predict.startover-during-auto', { st2, errors: errSnapshot() });

  // dual auto-finish via dispatchEvent on disabled button (bypass), then Start over
  await page.evaluate(() => {
    resetGen('the pit crew');
    autoFinish();
    document.getElementById('autoBtn').dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
  await sleep(500);
  await realClick(page, '#resetBtn');
  await sleep(1200);
  const st3 = await page.evaluate(() => ({ seqLen: seq.length, genDone, autoTimerSet: !!autoTimer, rollDisabled: document.getElementById('rollBtn').disabled }));
  log('predict.dual-auto-dispatch', { st3, errors: errSnapshot() });

  // app-tab switch during auto-finish
  await page.evaluate(() => { resetGen('at lunch'); autoFinish(); });
  await sleep(300);
  await page.evaluate(() => showTab(1)); // TOKENS
  await sleep(1500);
  await page.evaluate(() => showTab(0));
  await sleep(3500);
  const st4 = await page.evaluate(() => ({ seqLen: seq.length, genDone, autoTimerSet: !!autoTimer, out: document.getElementById('genOut').textContent.slice(0, 80) }));
  log('predict.tabswitch-during-auto', { st4, errors: errSnapshot() });

  // manual bar tap when seq > 30 words: does the tapped word get dropped?
  const st5 = await page.evaluate(() => {
    resetGen('the robot');
    seq = 'the robot ate my homework and asked for seconds the robot ate my homework and asked for seconds the robot ate my homework and asked for seconds'.split(' '); // 27... make longer
    while (seq.length <= 31) seq.push('robot');
    renderGen(); renderBars();
    const before = seq.length;
    chooseWord('sings'); // simulate a bar tap
    return { before, after: seq.length, genDone, lastWord: seq[seq.length - 1] };
  });
  log('predict.cap-drops-tapped-word', { st5, errors: errSnapshot() });

  // ---------- 2. checkpoint answered twice ----------
  await page.reload(); await sleep(300);
  const ck = await page.evaluate(() => {
    const box = document.querySelector('.checkpoint[data-m="0"]');
    const opts = box.querySelectorAll('.ck-opt');
    opts[0].click(); // wrong
    opts[1].click(); // correct
    // now force more clicks through dispatchEvent (buttons are disabled)
    opts[1].dispatchEvent(new MouseEvent('click', { bubbles: true }));
    opts[0].dispatchEvent(new MouseEvent('click', { bubbles: true }));
    opts[1].click(); opts[0].click();
    return {
      passed: S.passed[0],
      doneMsgs: box.querySelectorAll('.ck-done').length,
      fb: box.querySelector('.ck-fb').textContent.slice(0, 40),
      badLeft: box.querySelectorAll('.ck-opt.bad').length,
      gaugeFull: document.querySelectorAll('.gauge.full').length,
    };
  });
  log('checkpoint.double-answer', { ck, errors: errSnapshot() });

  // ---------- 3. TOKENS ----------
  await page.evaluate(() => showTab(1));
  // emoji
  const tokEmoji = await page.evaluate(() => {
    document.getElementById('tokIn').value = '🤖🤖🤖 café naïve strawberry 🍓!';
    renderTokens();
    return { count: document.getElementById('tokCount').textContent, toks: [...document.querySelectorAll('#tokOut .tok-t')].map((t) => t.textContent) };
  });
  log('tokens.emoji-accents', { tokEmoji, errors: errSnapshot() });

  // 5000-char paste timing
  const tokBig = await page.evaluate(() => {
    const big = 'the strawberry robot unbelievable retokenization skyscraper 123456 café!!! '.repeat(70).slice(0, 5000);
    const t0 = performance.now();
    document.getElementById('tokIn').value = big;
    renderTokens();
    const h = document.getElementById('tokOut').offsetHeight; // force layout
    const t1 = performance.now();
    return { ms: +(t1 - t0).toFixed(1), tokens: document.querySelectorAll('#tokOut .tok').length, outH: h, counter: document.getElementById('tokCount').textContent };
  });
  log('tokens.5000char-timing', { tokBig, errors: errSnapshot() });

  // long punctuation run: single giant token pill overflow?
  const tokPunct = await page.evaluate(() => {
    document.getElementById('tokIn').value = '!'.repeat(300);
    renderTokens();
    const tok = document.querySelector('#tokOut .tok');
    const r = tok.getBoundingClientRect();
    return { tokCount: document.querySelectorAll('#tokOut .tok').length, pillWidth: Math.round(r.width), pillRight: Math.round(r.right), viewport: innerWidth, docScrollW: document.documentElement.scrollWidth, bodyScrollW: document.body.scrollWidth };
  });
  await page.screenshot({ path: __dirname + '/b2-tok-punct.png' });
  log('tokens.punct-run-overflow', { tokPunct, errors: errSnapshot() });

  // ---------- 4. MEANING ----------
  await page.reload(); await sleep(300);
  await page.evaluate(() => showTab(2));
  await sleep(200);
  // preset chip clicked mid-ghost-flight: selects change, wordMath ignored?
  const wm1 = await page.evaluate(async () => {
    document.querySelectorAll('#wmPresets .chip')[0].click(); // king - man + woman, starts 1s flight
    await new Promise((r) => setTimeout(r, 250));
    document.querySelectorAll('#wmPresets .chip')[2].click(); // dog - puppy + kitten, mid-flight
    const midOut = document.getElementById('wmOut').textContent;
    const midSel = [wmA.value, wmB.value, wmC.value].join(' ');
    await new Promise((r) => setTimeout(r, 1300));
    return { midOut, midSel, finalOut: document.getElementById('wmOut').textContent, finalSel: [wmA.value, wmB.value, wmC.value].join(' '), wmBusy };
  });
  log('meaning.preset-mid-flight', { wm1, errors: errSnapshot() });

  // app-tab switch during ghost animation
  const wm2 = await page.evaluate(async () => {
    document.querySelectorAll('#wmPresets .chip')[1].click(); // robot - wheels + wings
    await new Promise((r) => setTimeout(r, 200));
    showTab(3);
    await new Promise((r) => setTimeout(r, 1400));
    showTab(2);
    return { out: document.getElementById('wmOut').textContent, wmBusy };
  });
  log('meaning.tabswitch-during-ghost', { wm2, errors: errSnapshot() });

  // map: drag far past clamps
  const box = await page.evaluate(() => { const r = document.getElementById('mapWrap').getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; });
  const cx = box.x + box.w / 2, cy = box.y + box.h / 2;
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  for (let i = 1; i <= 20; i++) await page.mouse.move(cx + i * 100, cy + i * 40); // drag 2000px right
  await page.mouse.up();
  const mv1 = await page.evaluate(() => ({ ...mapView }));
  await page.mouse.move(cx, cy); await page.mouse.down();
  for (let i = 1; i <= 20; i++) await page.mouse.move(cx - i * 100, cy - i * 40);
  await page.mouse.up();
  const mv2 = await page.evaluate(() => ({ ...mapView }));
  log('map.drag-past-clamps', { mv1, mv2, errors: errSnapshot() });

  // tap mid-drag with a second (touch) pointer while mouse is down
  await page.mouse.move(cx - 50, cy); await page.mouse.down();
  await page.mouse.move(cx + 60, cy + 10); // moved > 8
  await page.touchscreen.tap(cx, cy); // second pointer taps mid-drag
  await page.mouse.move(cx + 120, cy + 30);
  await page.mouse.up();
  const mid = await page.evaluate(() => ({ nbCap: document.getElementById('nbCap').textContent, mapView: { ...mapView } }));
  // is the map still draggable afterwards?
  await page.mouse.move(cx, cy); await page.mouse.down(); await page.mouse.move(cx - 80, cy - 30); await page.mouse.up();
  const mid2 = await page.evaluate(() => ({ ...mapView }));
  log('map.tap-mid-drag', { mid, dragAfter: mid2, errors: errSnapshot() });

  // ---------- 5. ATTENTION ----------
  await page.reload(); await sleep(300);
  await page.evaluate(() => showTab(3));
  await sleep(450);
  // rapid ending toggles BEFORE predicting
  const att1 = await page.evaluate(() => {
    const ends = document.querySelectorAll('#attEndings .btn');
    for (let i = 0; i < 12; i++) ends[i % 2].click();
    return {
      predicted: attState.predicted,
      verdict: document.getElementById('attVerdict').textContent,
      gridDisabled: document.getElementById('gridBtn').disabled,
      pathCount: document.querySelectorAll('#attSvg path').length,
      endChip: attState.chips[attState.chips.length - 1].textContent,
    };
  });
  log('attention.toggle-before-predict', { att1, errors: errSnapshot() });

  // predict, then rapid toggles after
  const att2 = await page.evaluate(async () => {
    attState.chips[1].click(); // pick 'robot'
    await new Promise((r) => setTimeout(r, 100));
    const ends = document.querySelectorAll('#attEndings .btn');
    for (let i = 0; i < 14; i++) ends[i % 2].click();
    return {
      pathCount: document.querySelectorAll('#attSvg path').length,
      words: attPreset().words.length,
      verdict: document.getElementById('attVerdict').textContent.slice(0, 70),
      ending: attState.ending,
    };
  });
  log('attention.rapid-toggle-after-predict', { att2, errors: errSnapshot() });

  // preset switch mid grow animation
  const att3 = await page.evaluate(async () => {
    document.querySelectorAll('#attPresets .chip')[0].click();
    attState.chips[5].click(); // pick 'field', grow anim 0.8s
    await new Promise((r) => setTimeout(r, 150));
    document.querySelectorAll('#attPresets .chip')[1].click(); // switch mid-anim
    await new Promise((r) => setTimeout(r, 200));
    const clean = { paths: document.querySelectorAll('#attSvg path').length, verdict: document.getElementById('attVerdict').textContent, predicted: attState.predicted };
    attState.chips[1].click(); // predict in new preset
    await new Promise((r) => setTimeout(r, 100));
    return { clean, afterPick: { paths: document.querySelectorAll('#attSvg path').length, verdict: document.getElementById('attVerdict').textContent.slice(0, 60) } };
  });
  log('attention.preset-switch-mid-anim', { att3, errors: errSnapshot() });

  // resize while lines shown: endpoint must track the it chip
  await page.evaluate(() => { document.querySelectorAll('#attPresets .chip')[0].click(); attState.chips[1].click(); });
  await sleep(300);
  const geomCheck = () => page.evaluate(() => {
    const p = attPreset();
    const stage = document.querySelector('.att-stage').getBoundingClientRect();
    const it = attState.chips[p.it].getBoundingClientRect();
    const w1 = attState.chips[1].getBoundingClientRect();
    const path = attState.paths[1]; // path to 'robot'
    const nums = path.getAttribute('d').replace(/[MQ]/g, '').trim().split(/\s+/).map(Number);
    return {
      dStart: [nums[0], nums[1]],
      dEnd: [nums[4], nums[5]],
      itChip: [+(it.left - stage.left + it.width / 2).toFixed(1), +(it.top - stage.top).toFixed(1)],
      wordChip: [+(w1.left - stage.left + w1.width / 2).toFixed(1), +(w1.top - stage.top).toFixed(1)],
    };
  });
  const before = await geomCheck();
  await page.setViewport({ width: 800, height: 700, deviceScaleFactor: 2, hasTouch: true });
  await sleep(500);
  const after = await geomCheck();
  await page.screenshot({ path: __dirname + '/b2-att-resize.png' });
  log('attention.resize-endpoint', { before, after, errors: errSnapshot() });
  await page.setViewport({ width: 360, height: 740, deviceScaleFactor: 2, hasTouch: true });
  await sleep(400);

  // resize while NOT on attention tab, then come back
  await page.evaluate(() => showTab(0));
  await page.setViewport({ width: 700, height: 700, deviceScaleFactor: 2, hasTouch: true });
  await sleep(300);
  await page.setViewport({ width: 360, height: 740, deviceScaleFactor: 2, hasTouch: true });
  await sleep(300);
  await page.evaluate(() => showTab(3));
  await sleep(400);
  const back = await geomCheck();
  log('attention.resize-while-hidden-then-return', { back, errors: errSnapshot() });

  // free play: 1 word, 12+ words, emoji, punctuation-only
  const fp = await page.evaluate(() => {
    const runs = {};
    const go = (v) => { document.getElementById('fpIn').value = v; fpRender(); return { tables: document.querySelectorAll('#fpGrid table').length, cols: document.querySelectorAll('#fpGrid thead th').length - 1 }; };
    runs.oneWord = go('hello');
    runs.words14 = go('a bb ccc dddd e ff ggg hh i jj kk ll mm nn');
    runs.emoji = go('🤖 beeped at 🚀 because 🎉');
    runs.punct = go('!!! ??? ... ,,,');
    return runs;
  });
  log('attention.freeplay-edge-inputs', { fp, errors: errSnapshot() });

  // ---------- 6. LOOP spam ----------
  const loop = await page.evaluate(() => {
    showTab(4);
    const n = document.getElementById('loopNext');
    for (let i = 0; i < 12; i++) n.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    const done = { steps: document.querySelectorAll('#loopSteps .step').length, btn: n.textContent, disabled: n.disabled, closeHidden: document.getElementById('loopClose').hidden };
    document.getElementById('loopAgain').click();
    return { done, afterAgain: { steps: document.querySelectorAll('#loopSteps .step').length, btn: n.textContent } };
  });
  log('loop.spam-next', { loop, errors: errSnapshot() });

  // ---------- 7. LICENSE: force-open before gauges full ----------
  await page.reload(); await sleep(300);
  await page.evaluate(() => document.getElementById('licOpen').click());
  await sleep(200);
  const lic1 = await page.evaluate(() => ({
    modalOpen: !document.getElementById('licModal').hidden,
    bannerHidden: document.getElementById('licBanner').hidden,
    passed: S.passed.slice(),
    heading: document.getElementById('licH').textContent,
    cardDate: document.getElementById('cardDate').textContent,
    cardGauges: document.getElementById('cardGauges').childElementCount,
  }));
  await page.screenshot({ path: __dirname + '/b2-lic-early.png' });
  log('license.force-open-early', { lic1, errors: errSnapshot() });

  // easter egg while license modal is open (JS taps; real taps land on the modal backdrop)
  const egg1 = await page.evaluate(async () => {
    const t = document.getElementById('title');
    for (let i = 0; i < 5; i++) t.click();
    await new Promise((r) => setTimeout(r, 150));
    const toasts = [...document.querySelectorAll('.toast')];
    return { toastCount: toasts.length, toastText: toasts[0] && toasts[0].textContent.slice(0, 30), modalStillOpen: !document.getElementById('licModal').hidden, toastZ: toasts[0] && getComputedStyle(toasts[0]).zIndex, modalZ: getComputedStyle(document.getElementById('licModal')).zIndex };
  });
  // and: what does a REAL tap on the title area do while the modal is open? (backdrop click closes)
  await page.mouse.click(60, 40); // title location, but modal overlays it
  await sleep(150);
  const egg2 = await page.evaluate(() => ({ modalOpenAfterRealTap: !document.getElementById('licModal').hidden }));
  log('license.egg-while-modal-open', { egg1, egg2, errors: errSnapshot() });

  // double egg fast: overlapping toasts?
  await page.evaluate(() => { document.querySelectorAll('.toast').forEach((t) => t.remove()); });
  const egg3 = await page.evaluate(async () => {
    const t = document.getElementById('title');
    for (let i = 0; i < 10; i++) t.click();
    await new Promise((r) => setTimeout(r, 200));
    const toasts = [...document.querySelectorAll('.toast')].map((x) => { const r = x.getBoundingClientRect(); return { top: r.top, left: Math.round(r.left) }; });
    return { count: toasts.length, positions: toasts };
  });
  await page.screenshot({ path: __dirname + '/b2-double-toast.png' });
  log('extras.double-egg-toast-overlap', { egg3, errors: errSnapshot() });

  // ---------- 8. full legit pass + license + png ----------
  await page.reload(); await sleep(300);
  await page.evaluate(() => {
    for (let m = 0; m < 5; m++) {
      const box = document.querySelector('.checkpoint[data-m="' + m + '"]');
      box.querySelectorAll('.ck-opt')[CHECKPOINTS[m].correct].click();
    }
  });
  await sleep(1800);
  const full = await page.evaluate(() => ({ gauges: document.querySelectorAll('.gauge.full').length, banner: !document.getElementById('licBanner').hidden }));
  await page.evaluate(() => document.getElementById('licOpen').click());
  await sleep(200);
  await page.type('#licName', 'Zoë Q. Ramírez-🤖');
  const lic2 = await page.evaluate(() => document.getElementById('cardName').textContent);
  const cdp = await page.createCDPSession();
  await cdp.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: __dirname + '/dl-b2' }).catch(() => {});
  await page.evaluate(() => document.getElementById('licPng').click());
  await sleep(1200);
  const fs = require('fs');
  let dl = [];
  try { dl = fs.readdirSync(__dirname + '/dl-b2'); } catch (e) {}
  log('license.full-flow', { full, cardName: lic2, download: dl, errors: errSnapshot() });

  log('FINAL', { allPageErrors: pageErrors, allConsoleErrors: consoleErrs });
  await browser.close();
})().catch((e) => { console.error('HARNESS FAIL', e); process.exit(1); });
