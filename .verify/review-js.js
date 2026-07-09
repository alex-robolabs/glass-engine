const puppeteer = require('puppeteer-core');
const path = require('path');

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await puppeteer.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: 'new',
    args: ['--allow-file-access-from-files'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 360, height: 740 });
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));

  const url = 'file://' + path.resolve(__dirname, '..', 'glass-engine.html');
  await page.goto(url, { waitUntil: 'load' });
  await sleep(300);

  const log = (k, v) => console.log('== ' + k + ':', typeof v === 'string' ? v : JSON.stringify(v));

  // ---------- 1. tokenizer fuzz: join === text minus whitespace, deterministic ----------
  const tokRes = await page.evaluate(() => {
    const samples = [
      "the robot ate my homework at berkeley",
      "how many r's are in strawberry?",
      "STRAWBERRY Strawberry sTrAwBeRrY",
      "unhappiness rereading misunderstanding overreaction",
      "1234567 89 0", "?!?!... ,,, ;;", "", "   ", "a", "I",
      "café naïve 😀 emoji", "x".repeat(200), "un un un ing ing",
      "prefixes: un re pre dis over under mis non sub super anti semi",
      "snowman skyscraper cupcake rainbow butterfly watermelon popcorn",
      "xyzzyq plughf zzzzzzzzzzzzzzzzzzz qqqq wwwww",
    ];
    // random fuzz
    const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJ 0123456789 .,!?\'"-_ ';
    let seed = 42;
    const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
    for (let i = 0; i < 300; i++) {
      let s = '';
      const n = Math.floor(rnd() * 60);
      for (let j = 0; j < n; j++) s += chars[Math.floor(rnd() * chars.length)];
      samples.push(s);
    }
    const bad = [];
    for (const s of samples) {
      const t1 = tokenize(s), t2 = tokenize(s);
      if (t1.join('|') !== t2.join('|')) bad.push({ s, why: 'nondeterministic' });
      if (t1.join('') !== s.replace(/\s+/g, '')) bad.push({ s, got: t1.join(''), want: s.replace(/\s+/g, '') });
      for (const tk of t1) if (tk === '' || tk == null) bad.push({ s, why: 'empty token' });
    }
    return { count: samples.length, bad: bad.slice(0, 5) };
  });
  log('tokenizer fuzz', tokRes);

  // ---------- 2. predict: auto-finish vs Start over ----------
  const predictRes = await page.evaluate(async () => {
    const sleep = (ms) => new Promise(r => setTimeout(r, ms));
    document.querySelectorAll('#starters .chip')[0].click(); // 'the robot'
    document.getElementById('autoBtn').click();
    await sleep(500); // a couple of steps happen
    document.getElementById('resetBtn').click();
    const lenAtReset = document.querySelectorAll('#genOut .gw').length;
    await sleep(1200); // if the timer leaked, more words appear
    const lenAfter = document.querySelectorAll('#genOut .gw').length;
    return { lenAtReset, lenAfter, rollDisabled: document.getElementById('rollBtn').disabled };
  });
  log('predict auto-finish vs start over', predictRes);

  // ---------- 2b. auto-finish continues after switching tab? ----------
  const bgGen = await page.evaluate(async () => {
    const sleep = (ms) => new Promise(r => setTimeout(r, ms));
    document.querySelectorAll('#starters .chip')[0].click();
    document.getElementById('autoBtn').click();
    await sleep(200);
    const before = document.querySelectorAll('#genOut .gw').length;
    document.querySelectorAll('#tabs button')[1].click(); // go to TOKENS
    await sleep(1600);
    const after = document.querySelectorAll('#genOut .gw').length;
    document.querySelectorAll('#tabs button')[0].click();
    document.getElementById('resetBtn').click();
    return { before, after, keptRunningWhileHidden: after > before };
  });
  log('auto-finish across tab switch', bgGen);

  // ---------- 2c. single-continuation sampling + END + cap ----------
  const sampleRes = await page.evaluate(() => {
    // find a word with exactly one continuation
    let single = null;
    for (const [w, m] of CHAIN) { if (m.size === 1) { single = w; break; } }
    const out = { single };
    if (single) {
      seq = [single]; genDone = false;
      out.cands = candidates(single);
      out.sample = sampleWord();
    }
    // cap behavior: seq of 31 words then choose a real word
    seq = Array(31).fill('the'); genDone = false;
    chooseWord('robot');
    out.capDone = genDone;
    out.capLen = seq.length;
    out.capTailShown = document.querySelector('#genOut').textContent.includes('■');
    resetGen();
    return out;
  });
  log('sampling/END/cap', sampleRes);

  // ---------- 3. attention flow ----------
  await page.evaluate(() => document.querySelectorAll('#tabs button')[3].click());
  await sleep(400);
  const attRes = await page.evaluate(async () => {
    const sleep = (ms) => new Promise(r => setTimeout(r, ms));
    const out = {};
    // pick a wrong word
    document.querySelectorAll('#attWords .aw')[3].click(); // 'cross'
    await sleep(100);
    out.pathsAfterPick = document.querySelectorAll('#attSvg path').length;
    // toggle ending
    document.querySelectorAll('#attEndings .btn')[1].click();
    await sleep(100);
    out.verdictAfterToggle = document.getElementById('attVerdict').textContent;
    // switch preset while revealed
    document.querySelectorAll('#attPresets .chip')[1].click();
    await sleep(100);
    out.pathsAfterPreset = document.querySelectorAll('#attSvg path').length;
    out.predictedAfterPreset = attState.predicted;
    // toggle ending BEFORE predicting on the new preset
    document.querySelectorAll('#attEndings .btn')[1].click();
    out.endChipText = document.querySelectorAll('#attWords .aw')[11].textContent;
    // now pick correctly: answer for 'small' is index 6 (suitcase)
    document.querySelectorAll('#attWords .aw')[6].click();
    await sleep(100);
    out.verdictCorrect = document.getElementById('attVerdict').textContent;
    out.pathsNow = document.querySelectorAll('#attSvg path').length;
    // grid
    document.getElementById('gridBtn').click();
    out.gridRows = document.querySelectorAll('#attGrid tbody tr').length;
    return out;
  });
  log('attention flow', attRes);

  // resize while attention shown, then while hidden
  await page.setViewport({ width: 700, height: 740 });
  await sleep(300);
  const attResize = await page.evaluate(() => ({
    paths: document.querySelectorAll('#attSvg path').length,
    d0: document.querySelector('#attSvg path') && document.querySelector('#attSvg path').getAttribute('d'),
  }));
  await page.setViewport({ width: 360, height: 740 });
  await sleep(300);
  log('attention after resize', attResize);

  // resize while on a different tab, then come back
  await page.evaluate(() => document.querySelectorAll('#tabs button')[0].click());
  await page.setViewport({ width: 500, height: 740 });
  await sleep(200);
  await page.setViewport({ width: 360, height: 740 });
  await sleep(200);
  await page.evaluate(() => document.querySelectorAll('#tabs button')[3].click());
  await sleep(300);
  const attBack = await page.evaluate(() => {
    // do the path endpoints match current chip geometry?
    const stage = document.querySelector('.att-stage');
    const sr = stage.getBoundingClientRect();
    const p = ATTENTION_PRESETS[attState.preset];
    const chip = attState.chips[0].getBoundingClientRect();
    const want = { x: chip.left - sr.left + chip.width / 2, y: chip.top - sr.top };
    const path = attState.paths.find(Boolean);
    const d = path ? path.getAttribute('d') : null;
    return { want, d };
  });
  log('attention geometry after tab-return', attBack);

  // ---------- 4. free play ----------
  const fpRes = await page.evaluate(() => {
    const out = {};
    const inp = document.getElementById('fpIn');
    inp.value = 'hello';
    document.getElementById('fpGo').click();
    out.oneWord = document.getElementById('fpGrid').childElementCount;
    inp.value = '';
    document.getElementById('fpGo').click();
    out.empty = document.getElementById('fpGrid').childElementCount;
    inp.value = 'the dog chased the ball because it bounced';
    document.getElementById('fpGo').click();
    out.normal = document.getElementById('fpGrid').childElementCount;
    inp.value = 'one';
    document.getElementById('fpGo').click();
    out.backToOne = document.getElementById('fpGrid').childElementCount;
    return out;
  });
  log('free play', fpRes);

  // ---------- 5. map tap vs drag ----------
  await page.evaluate(() => document.querySelectorAll('#tabs button')[2].click());
  await sleep(400);
  const mapRes = await page.evaluate(async () => {
    const sleep = (ms) => new Promise(r => setTimeout(r, ms));
    const out = {};
    // synthesize a tap on 'king' (map coords 16,84) -> screen coords
    const svg = document.getElementById('mapSvg');
    const ctm = svg.getScreenCTM();
    const pt = new DOMPoint(16, 84).matrixTransform(ctm);
    const wrap = document.getElementById('mapWrap');
    const down = new PointerEvent('pointerdown', { clientX: pt.x, clientY: pt.y, pointerId: 1, bubbles: true });
    const up = new PointerEvent('pointerup', { clientX: pt.x, clientY: pt.y, pointerId: 1, bubbles: true });
    wrap.dispatchEvent(down); wrap.dispatchEvent(up);
    await sleep(100);
    out.tapCap = document.getElementById('nbCap').textContent;
    // drag: down, move 60px, up -> should pan, not select
    const before = document.getElementById('mapSvg').getAttribute('viewBox');
    wrap.dispatchEvent(new PointerEvent('pointerdown', { clientX: 100, clientY: 100, pointerId: 2, bubbles: true }));
    wrap.dispatchEvent(new PointerEvent('pointermove', { clientX: 130, clientY: 130, pointerId: 2, bubbles: true }));
    wrap.dispatchEvent(new PointerEvent('pointermove', { clientX: 160, clientY: 160, pointerId: 2, bubbles: true }));
    wrap.dispatchEvent(new PointerEvent('pointerup', { clientX: 160, clientY: 160, pointerId: 2, bubbles: true }));
    await sleep(50);
    out.viewBoxChanged = before !== document.getElementById('mapSvg').getAttribute('viewBox');
    out.capAfterDrag = document.getElementById('nbCap').textContent;
    return out;
  });
  log('map tap/drag', mapRes);

  // ---------- 6. wordMath double click + preset during animation ----------
  const wmRes = await page.evaluate(async () => {
    const sleep = (ms) => new Promise(r => setTimeout(r, ms));
    const out = {};
    document.getElementById('wmGo').click();
    document.getElementById('wmGo').click(); // reentrant
    await sleep(200);
    // click a preset chip mid-animation
    document.querySelectorAll('#wmPresets .chip')[1].click(); // robot - wheels + wings
    out.selDuring = [document.getElementById('wmA').value, document.getElementById('wmB').value, document.getElementById('wmC').value];
    await sleep(1200);
    out.outText = document.getElementById('wmOut').textContent;
    out.busy = wmBusy;
    return out;
  });
  log('wordMath reentrancy', wmRes);

  // ---------- 7. checkpoints: double-answer + pass all ----------
  const ckRes = await page.evaluate(async () => {
    const sleep = (ms) => new Promise(r => setTimeout(r, ms));
    const out = {};
    const boxes = [...document.querySelectorAll('.checkpoint')];
    const CORRECT = [1, 0, 2, 0, 2];
    // wrong answer then double-click correct on module 0
    const b0 = boxes.find(b => b.dataset.m === '0');
    b0.querySelectorAll('.ck-opt')[0].click(); // wrong
    const good = b0.querySelectorAll('.ck-opt')[1];
    good.click(); good.click(); good.click();
    await sleep(50);
    out.doneMsgs0 = b0.querySelectorAll('.ck-done').length;
    out.disabled0 = [...b0.querySelectorAll('.ck-opt')].every(x => x.disabled);
    // pass the rest
    for (const b of boxes) {
      const m = +b.dataset.m;
      if (m === 0) continue;
      b.querySelectorAll('.ck-opt')[CORRECT[m]].click();
    }
    await sleep(1600);
    out.banner = !document.getElementById('licBanner').hidden;
    out.gaugesFull = document.querySelectorAll('.gauge.full').length;
    return out;
  });
  log('checkpoints', ckRes);

  // ---------- 8. license modal focus + escape ----------
  const licRes = await page.evaluate(async () => {
    const sleep = (ms) => new Promise(r => setTimeout(r, ms));
    const out = {};
    document.getElementById('licOpen').click();
    await sleep(150);
    out.open = !document.getElementById('licModal').hidden;
    out.focused = document.activeElement && document.activeElement.id;
    document.getElementById('licName').value = 'ada lovelace';
    document.getElementById('licName').dispatchEvent(new Event('input', { bubbles: true }));
    out.cardName = document.getElementById('cardName').textContent;
    return out;
  });
  await page.keyboard.press('Escape');
  await sleep(100);
  const licAfter = await page.evaluate(() => ({
    closed: document.getElementById('licModal').hidden,
    focusAfterClose: document.activeElement && (document.activeElement.id || document.activeElement.tagName),
  }));
  log('license modal', licRes);
  log('license after escape', licAfter);

  // tab focus escape from modal (focus trap check)
  await page.evaluate(() => document.getElementById('licOpen').click());
  await sleep(150);
  const trapRes = await page.evaluate(async () => {
    // walk focus forward and see if it leaves the modal
    const modal = document.getElementById('licModal');
    let leaks = null;
    const focusables = [...document.querySelectorAll('button, input, [tabindex]')].filter(e => e.offsetParent !== null || modal.contains(e));
    // simulate: from the last focusable inside modal, next tab target is outside
    const inside = focusables.filter(e => modal.contains(e));
    const all = focusables;
    const lastInside = inside[inside.length - 1];
    const idx = all.indexOf(lastInside);
    const next = all[(idx + 1) % all.length];
    leaks = next && !modal.contains(next) ? (next.id || next.textContent.slice(0, 20)) : null;
    return { insideCount: inside.length, leaksTo: leaks };
  });
  log('modal focus trap (static analysis)', trapRes);
  await page.keyboard.press('Escape');

  // ---------- 9. tokens: empty + long input ----------
  const tokUi = await page.evaluate(async () => {
    const sleep = (ms) => new Promise(r => setTimeout(r, ms));
    document.querySelectorAll('#tabs button')[1].click();
    const t = document.getElementById('tokIn');
    t.value = '';
    t.dispatchEvent(new Event('input', { bubbles: true }));
    await sleep(200);
    const out = { emptyCount: document.getElementById('tokCount').textContent, pct: document.getElementById('ctxPct').textContent };
    t.value = 'strawberry';
    t.dispatchEvent(new Event('input', { bubbles: true }));
    await sleep(200);
    out.strawCapShown = !document.getElementById('strawCap').hidden;
    out.hotToks = document.querySelectorAll('.tok.hot').length;
    return out;
  });
  log('tokens ui', tokUi);

  // ---------- 10. loop steps re-animation ----------
  const loopRes = await page.evaluate(async () => {
    const sleep = (ms) => new Promise(r => setTimeout(r, ms));
    document.querySelectorAll('#tabs button')[4].click();
    document.getElementById('loopNext').click();
    document.getElementById('loopNext').click();
    document.getElementById('loopNext').click();
    await sleep(50);
    // are ALL step cards freshly animating (opacity < 1 mid-animation)?
    const ops = [...document.querySelectorAll('#loopSteps .step')].map(s => getComputedStyle(s).opacity);
    return { steps: ops.length, opacities: ops };
  });
  log('loop re-animation', loopRes);

  console.log('== page errors:', JSON.stringify(errors));
  await browser.close();
})().catch(e => { console.error('FATAL', e); process.exit(1); });
