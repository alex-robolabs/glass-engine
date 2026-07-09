// break-it tester for glass-engine.html
const puppeteer = require('puppeteer-core');
const path = require('path');
const URL = 'file://' + encodeURI('/Users/rodcolin/Projects/RSA 2026/glass-engine.html');
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const R = { sections: {} };

async function freshPage(browser, name, opts = {}) {
  const page = await browser.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push('PAGEERROR: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errs.push('CONSOLE.ERROR: ' + m.text()); });
  await page.setViewport({ width: 360, height: 740, hasTouch: !!opts.touch });
  await page.goto(URL, { waitUntil: 'load' });
  page._errs = errs;
  R.sections[name] = { errors: errs, notes: [] };
  page._notes = R.sections[name].notes;
  return page;
}

(async () => {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--hide-scrollbars'] });

  // ============ A: PREDICT stress ============
  {
    const p = await freshPage(browser, 'A_predict');
    const n = p._notes;
    // A1: rapid roll spam (41 synchronous clicks)
    await p.evaluate(() => document.querySelectorAll('#starters .chip')[0].click());
    await p.evaluate(() => { for (let i = 0; i < 41; i++) document.getElementById('rollBtn').click(); });
    const a1 = await p.evaluate(() => ({
      words: document.querySelectorAll('#genOut .gw').length,
      rollDisabled: document.getElementById('rollBtn').disabled,
      text: document.getElementById('genOut').textContent.slice(0, 80),
    }));
    n.push('A1 rapid-roll x41: ' + JSON.stringify(a1));

    // A2: roll+auto interleaved rapid fire
    await p.evaluate(() => document.getElementById('resetBtn').click());
    await p.evaluate(() => document.querySelectorAll('#starters .chip')[1].click());
    await p.evaluate(() => {
      const r = document.getElementById('rollBtn'), a = document.getElementById('autoBtn');
      for (let i = 0; i < 10; i++) { r.click(); a.click(); r.click(); a.click(); }
    });
    await sleep(300);
    const midLen = await p.evaluate(() => document.querySelectorAll('#genOut .gw').length);
    // A3: Start over during auto-finish; generation must fully stop
    await p.evaluate(() => document.getElementById('resetBtn').click());
    const snap1 = await p.evaluate(() => document.getElementById('genOut').textContent);
    await sleep(1200);
    const snap2 = await p.evaluate(() => document.getElementById('genOut').textContent);
    n.push('A2/A3 auto then Start over: len before reset=' + midLen + ', after reset="' + snap1 + '", 1.2s later="' + snap2 + '" ' + (snap1 === snap2 ? 'STOPPED OK' : 'STILL GENERATING <-- BUG'));

    // A4: starter chip clicked during auto-finish
    await p.evaluate(() => document.querySelectorAll('#starters .chip')[0].click());
    await p.evaluate(() => document.getElementById('autoBtn').click());
    await sleep(500);
    await p.evaluate(() => document.querySelectorAll('#starters .chip')[2].click()); // "at lunch"
    await sleep(100);
    const s1 = await p.evaluate(() => document.getElementById('genOut').textContent);
    await sleep(1000);
    const s2 = await p.evaluate(() => document.getElementById('genOut').textContent);
    n.push('A4 starter mid-auto: right after="' + s1 + '" 1s later="' + s2 + '" ' + (s1 === s2 ? 'STOPPED OK' : 'KEPT GENERATING <-- check'));

    // A5: tab switch during auto-finish + temp slider yank
    await p.evaluate(() => document.querySelectorAll('#starters .chip')[3].click());
    await p.evaluate(() => document.getElementById('autoBtn').click());
    await sleep(200);
    await p.evaluate(() => showTab(1));
    await p.evaluate(() => {
      const s = document.getElementById('tempSlider');
      for (const v of ['2', '0.2', '1.7', '0.4', '1']) { s.value = v; s.dispatchEvent(new Event('input')); }
    });
    await sleep(1500);
    await p.evaluate(() => showTab(0));
    await sleep(3000);
    const a5 = await p.evaluate(() => ({
      done: document.getElementById('rollBtn').disabled,
      text: document.getElementById('genOut').textContent.slice(0, 100),
    }));
    n.push('A5 tab-switch during auto + temp yank: ' + JSON.stringify(a5));
    await p.close();
  }

  // ============ B: checkpoints ============
  {
    const p = await freshPage(browser, 'B_checkpoints');
    const n = p._notes;
    // B1: double-click the correct answer on checkpoint 0
    await p.evaluate(() => {
      const box = document.querySelector('.checkpoint[data-m="0"]');
      const b = box.querySelectorAll('.ck-opt')[CHECKPOINTS[0].correct];
      b.click(); b.click(); b.click();
    });
    const b1 = await p.evaluate(() => ({
      doneMsgs: document.querySelectorAll('.checkpoint[data-m="0"] .ck-done').length,
      gaugeFull: document.querySelectorAll('.gauge.full').length,
      optsDisabled: [...document.querySelectorAll('.checkpoint[data-m="0"] .ck-opt')].every((x) => x.disabled),
    }));
    n.push('B1 triple-click correct: ' + JSON.stringify(b1) + (b1.doneMsgs === 1 ? ' OK' : ' <-- DUPLICATE PASS BUG'));
    // B2: wrong answer after pass (force click on disabled via dispatch)
    await p.evaluate(() => {
      const box = document.querySelector('.checkpoint[data-m="0"]');
      const wrong = box.querySelectorAll('.ck-opt')[0];
      wrong.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    const b2 = await p.evaluate(() => document.querySelector('.checkpoint[data-m="0"] .ck-fb').textContent.slice(0, 30));
    n.push('B2 forced wrong-after-pass, feedback still: "' + b2 + '"');
    // B3: pass remaining, watch banner + toast count
    await p.evaluate(() => {
      document.querySelectorAll('.checkpoint').forEach((box) => {
        const m = +box.dataset.m;
        box.querySelectorAll('.ck-opt')[CHECKPOINTS[m].correct].click();
      });
    });
    await sleep(1600);
    const b3 = await p.evaluate(() => ({
      bannerHidden: document.getElementById('licBanner').hidden,
      toasts: document.querySelectorAll('.toast').length,
      gauges: document.querySelectorAll('.gauge.full').length,
    }));
    n.push('B3 all passed: ' + JSON.stringify(b3));
    await p.close();
  }

  // ============ C: attention ============
  {
    const p = await freshPage(browser, 'C_attention');
    const n = p._notes;
    await p.evaluate(() => showTab(3));
    // C1: toggle endings x10 before predicting
    await p.evaluate(() => {
      const btns = document.querySelectorAll('#attEndings .btn');
      for (let i = 0; i < 10; i++) btns[i % 2].click();
    });
    const c1 = await p.evaluate(() => ({
      paths: document.querySelectorAll('#attSvg path').length,
      verdict: document.getElementById('attVerdict').textContent,
      endWord: [...document.querySelectorAll('#attWords .aw')].pop().textContent,
    }));
    n.push('C1 toggle-before-predict x10: ' + JSON.stringify(c1) + (c1.paths === 0 ? ' OK (no lines yet)' : ' <-- lines drawn before predict'));
    // C2: predict, then rapid ending toggles
    await p.evaluate(() => document.querySelectorAll('#attWords .aw')[3].click());
    await p.evaluate(() => {
      const btns = document.querySelectorAll('#attEndings .btn');
      for (let i = 0; i < 11; i++) btns[i % 2].click();
    });
    const c2 = await p.evaluate(() => ({
      paths: document.querySelectorAll('#attSvg path').length,
      ansChip: document.querySelector('#attWords .aw.ans')?.textContent,
      ending: attState.ending,
    }));
    n.push('C2 predict then toggle x11: ' + JSON.stringify(c2) + (c2.paths === 9 ? ' OK' : ' <-- path count wrong, expected 9'));
    // C3: switch presets mid draw animation, thrash
    await p.evaluate(() => document.querySelectorAll('#attPresets .chip')[1].click());
    await p.evaluate(() => document.querySelectorAll('#attWords .aw')[2].click()); // predict mid-anim
    await p.evaluate(() => {
      const chips = document.querySelectorAll('#attPresets .chip');
      for (let i = 0; i < 6; i++) chips[i % 2].click();
    });
    const c3 = await p.evaluate(() => ({
      chips: document.querySelectorAll('#attWords .aw').length,
      paths: document.querySelectorAll('#attSvg path').length,
      predicted: attState.predicted,
    }));
    n.push('C3 preset thrash mid-anim: ' + JSON.stringify(c3) + ' (fresh preset should have 0 paths, predicted=false)');

    // C4: geometry check across resizes. Predict on preset 0 first.
    await p.evaluate(() => document.querySelectorAll('#attPresets .chip')[0].click());
    await p.evaluate(() => document.querySelectorAll('#attWords .aw')[5].click());
    const measure = () => p.evaluate(() => {
      const stage = document.querySelector('.att-stage');
      const sr = stage.getBoundingClientRect();
      const pr = ATTENTION_PRESETS[attState.preset];
      const chips = [...document.querySelectorAll('#attWords .aw')];
      const paths = [...document.querySelectorAll('#attSvg path')];
      let worst = { dx: 0, dy: 0, sx: 0, sy: 0 };
      let pi = 0;
      const itr = chips[pr.it].getBoundingClientRect();
      const itx = itr.left - sr.left + itr.width / 2, ity = itr.top - sr.top;
      for (let j = 0; j < pr.words.length; j++) {
        if (j === pr.it) continue;
        const d = paths[pi++].getAttribute('d');
        const m = d.match(/M([-\d.]+) ([-\d.]+) Q([-\d.]+) ([-\d.]+) ([-\d.]+) ([-\d.]+)/);
        const r = chips[j].getBoundingClientRect();
        const ex = r.left - sr.left + r.width / 2, ey = r.top - sr.top;
        worst.dx = Math.max(worst.dx, Math.abs(parseFloat(m[5]) - ex));
        worst.dy = Math.max(worst.dy, Math.abs(parseFloat(m[6]) - ey));
        worst.sx = Math.max(worst.sx, Math.abs(parseFloat(m[1]) - itx));
        worst.sy = Math.max(worst.sy, Math.abs(parseFloat(m[2]) - ity));
      }
      return { pathCount: paths.length, worst, width: innerWidth };
    });
    const m360 = await measure();
    await p.setViewport({ width: 700, height: 740 });
    await sleep(350);
    const m700 = await measure();
    await p.setViewport({ width: 1280, height: 800 });
    await sleep(350);
    const m1280 = await measure();
    // resize while on another tab, then return
    await p.evaluate(() => showTab(0));
    await p.setViewport({ width: 500, height: 740 });
    await sleep(300);
    await p.evaluate(() => showTab(3));
    await sleep(200);
    const m500 = await measure();
    n.push('C4 line-to-chip geometry (max px deviation, endpoint dx/dy and it-chip start sx/sy):');
    n.push('  at 360: ' + JSON.stringify(m360));
    n.push('  resized to 700: ' + JSON.stringify(m700));
    n.push('  resized to 1280 (desktop layout): ' + JSON.stringify(m1280));
    n.push('  resized to 500 while on other tab, then back: ' + JSON.stringify(m500));
    await p.screenshot({ path: path.join(__dirname, 'break-att-resize.png') });

    // C5: free play abuse
    await p.setViewport({ width: 360, height: 740 });
    await sleep(250);
    const fp = async (val) => {
      await p.evaluate((v) => {
        const i = document.getElementById('fpIn');
        i.value = v;
        document.getElementById('fpGo').click();
      }, val);
      return p.evaluate(() => {
        const t = document.querySelector('#fpGrid table');
        return { hasTable: !!t, cols: t ? t.rows[0].cells.length - 1 : 0 };
      });
    };
    n.push('C5 freeplay "hello" (1 word): ' + JSON.stringify(await fp('hello')));
    n.push('C5 freeplay 14 words: ' + JSON.stringify(await fp('a b c d e f g h i j k l m n')));
    n.push('C5 freeplay emoji: ' + JSON.stringify(await fp('🤖 eats 🍕 because 😀 said so')));
    n.push('C5 freeplay punctuation: ' + JSON.stringify(await fp('?!? ... !!! ,,,')));
    const hscroll = await p.evaluate(() => document.body.scrollWidth);
    n.push('C5 body scrollWidth at 360 after freeplay: ' + hscroll);
    await p.close();
  }

  // ============ D: meaning map ============
  {
    const p = await freshPage(browser, 'D_map', { touch: true });
    const n = p._notes;
    await p.evaluate(() => showTab(2));
    await sleep(150);
    const box = await p.evaluate(() => {
      const r = document.getElementById('mapWrap').getBoundingClientRect();
      return { x: r.left, y: r.top, w: r.width, h: r.height };
    });
    const cx = box.x + box.w / 2, cy = box.y + box.h / 2;
    // D1: tap a word (small movement counts as tap)
    const robotPos = await p.evaluate(() => {
      const r = nodeEls['robot'].querySelector('circle').getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    });
    await p.mouse.move(robotPos.x, robotPos.y);
    await p.mouse.down(); await p.mouse.up();
    const d1 = await p.evaluate(() => ({
      cap: document.getElementById('nbCap').textContent.slice(0, 60),
      lines: document.querySelectorAll('#mapLines line').length,
    }));
    n.push('D1 tap robot: ' + JSON.stringify(d1));
    // D2: violent drag far past the edges, several directions
    for (const [dx, dy] of [[2500, 2000], [-4000, -3500], [3000, -2500], [-500, 4000]]) {
      await p.mouse.move(cx, cy);
      await p.mouse.down();
      for (let i = 1; i <= 10; i++) await p.mouse.move(cx + (dx * i) / 10, cy + (dy * i) / 10);
      await p.mouse.up();
    }
    const d2 = await p.evaluate(() => ({ view: mapView, nodesVisible: (() => {
      const vb = document.getElementById('mapSvg').getAttribute('viewBox').split(' ').map(Number);
      let c = 0;
      for (const w in MAP) { if (MAP[w].x >= vb[0] && MAP[w].x <= vb[0] + vb[2] && MAP[w].y >= vb[1] && MAP[w].y <= vb[1] + vb[3]) c++; }
      return c;
    })() }));
    n.push('D2 hard drags past edges: ' + JSON.stringify(d2) + ' (clamp is x,y in [-30,40])');
    // D3: touch tap during an active mouse drag
    await p.mouse.move(cx, cy);
    await p.mouse.down();
    await p.mouse.move(cx + 40, cy + 30);
    await p.touchscreen.tap(robotPos.x, robotPos.y);
    await p.mouse.move(cx + 90, cy + 60);
    await p.mouse.up();
    const d3view = await p.evaluate(() => ({ ...mapView }));
    // does dragging still work afterwards?
    await p.mouse.move(cx, cy);
    await p.mouse.down();
    for (let i = 1; i <= 5; i++) await p.mouse.move(cx - i * 12, cy - i * 10);
    await p.mouse.up();
    const d3after = await p.evaluate(() => ({ ...mapView }));
    n.push('D3 touch-tap mid-drag: view after=' + JSON.stringify(d3view) + ', after recovery drag=' + JSON.stringify(d3after) + (JSON.stringify(d3view) !== JSON.stringify(d3after) ? ' PAN RECOVERED OK' : ' <-- PAN DEAD AFTER MIXED INPUT'));
    // D4: word-math preset clicked mid-animation of another preset
    await p.evaluate(() => document.querySelectorAll('#wmPresets .chip')[0].click());
    await sleep(150);
    await p.evaluate(() => document.querySelectorAll('#wmPresets .chip')[2].click()); // mid-flight
    await sleep(1300);
    const d4 = await p.evaluate(() => ({
      out: document.getElementById('wmOut').textContent,
      selects: [document.getElementById('wmA').value, document.getElementById('wmB').value, document.getElementById('wmC').value],
    }));
    n.push('D4 preset mid-anim: ' + JSON.stringify(d4));
    // wmBusy must be released: compute again
    await p.evaluate(() => document.getElementById('wmGo').click());
    await sleep(1300);
    const d4b = await p.evaluate(() => document.getElementById('wmOut').textContent);
    n.push('D4b recompute after: "' + d4b + '"' + (d4b.includes('lands nearest') ? ' NOT STUCK' : ' <-- wmBusy STUCK'));
    // D5: tab switch during ghost animation
    await p.evaluate(() => document.querySelectorAll('#wmPresets .chip')[1].click());
    await sleep(120);
    await p.evaluate(() => showTab(0));
    await sleep(1300);
    await p.evaluate(() => showTab(2));
    const d5 = await p.evaluate(() => document.getElementById('wmOut').textContent);
    n.push('D5 tab-switch during ghost: "' + d5 + '"');
    await p.screenshot({ path: path.join(__dirname, 'break-map.png') });
    await p.close();
  }

  // ============ E: tokenizer ============
  {
    const p = await freshPage(browser, 'E_tokens');
    const n = p._notes;
    await p.evaluate(() => showTab(1));
    const setTok = (v) => p.evaluate((val) => {
      document.getElementById('tokIn').value = val;
      const t0 = performance.now();
      renderTokens();
      return { ms: +(performance.now() - t0).toFixed(1), toks: document.querySelectorAll('#tokOut .tok').length, count: document.getElementById('tokCount').textContent };
    }, v);
    n.push('E1 emoji paste: ' + JSON.stringify(await setTok('🤖🍕😀 robot ate 🌮, café niño')));
    const e1b = await p.evaluate(() => [...document.querySelectorAll('#tokOut .tok-t')].map((t) => t.textContent));
    n.push('E1 tokens: ' + JSON.stringify(e1b));
    // NFD combining accents
    n.push('E2 NFD accents (cafe\\u0301 nin\\u0303o): ' + JSON.stringify(await setTok('café niño')));
    const e2b = await p.evaluate(() => [...document.querySelectorAll('#tokOut .tok-t')].map((t) => JSON.stringify(t.textContent)));
    n.push('E2 tokens: ' + e2b.join(','));
    // 5000-char realistic paste
    const big = 'the robot ate my homework at berkeley and the pit crew laughed loudly while eating strawberry pizza '.repeat(50).slice(0, 5000);
    const e3 = await setTok(big);
    n.push('E3 5000-char paste render: ' + JSON.stringify(e3));
    // pathological: 5000 letters no spaces
    const e4 = await setTok('x'.repeat(5000));
    n.push('E4 5000 letters no spaces: ' + JSON.stringify(e4));
    // long punctuation run: single unbreakable pill?
    const e5 = await setTok('!'.repeat(300));
    const e5b = await p.evaluate(() => {
      const pill = document.querySelector('#tokOut .tok');
      return { pillWidth: Math.round(pill.getBoundingClientRect().width), bodyScrollW: document.body.scrollWidth, docScrollW: document.documentElement.scrollWidth, clientW: document.documentElement.clientWidth };
    });
    n.push('E5 300x"!" run: ' + JSON.stringify(e5) + ' ' + JSON.stringify(e5b) + (e5b.pillWidth > 360 ? ' <-- PILL WIDER THAN VIEWPORT (clipped?)' : ''));
    await p.screenshot({ path: path.join(__dirname, 'break-tok-punct.png') });
    // long emoji run
    const e6 = await setTok('🔥'.repeat(200));
    const e6b = await p.evaluate(() => {
      const pill = document.querySelector('#tokOut .tok');
      return { pills: document.querySelectorAll('#tokOut .tok').length, pillWidth: Math.round(pill.getBoundingClientRect().width) };
    });
    n.push('E6 200-emoji run: ' + JSON.stringify(e6) + ' ' + JSON.stringify(e6b));
    await p.screenshot({ path: path.join(__dirname, 'break-tok-emoji.png') });
    await p.close();
  }

  // ============ F: license + easter egg ============
  {
    const p = await freshPage(browser, 'F_license');
    const n = p._notes;
    // F1: licOpen before gauges full
    const f1a = await p.evaluate(() => ({ bannerHidden: document.getElementById('licBanner').hidden, btnVisible: !!document.getElementById('licOpen').offsetParent }));
    await p.evaluate(() => document.getElementById('licOpen').click()); // JS bypass
    const f1b = await p.evaluate(() => ({
      modalOpen: !document.getElementById('licModal').hidden,
      heading: document.getElementById('licH').textContent,
      gaugesPassed: document.querySelectorAll('.gauge.full').length,
      cardGauges: document.getElementById('cardGauges').childElementCount,
    }));
    n.push('F1 licOpen via JS before any pass: banner=' + JSON.stringify(f1a) + ' result=' + JSON.stringify(f1b));
    await p.screenshot({ path: path.join(__dirname, 'break-license-early.png') });
    await p.evaluate(() => document.getElementById('licClose').click());
    // F2: pass all, open properly, type name
    await p.evaluate(() => {
      document.querySelectorAll('.checkpoint').forEach((box) => {
        const m = +box.dataset.m;
        box.querySelectorAll('.ck-opt')[CHECKPOINTS[m].correct].click();
      });
    });
    await sleep(1500);
    const f2a = await p.evaluate(() => document.getElementById('licBanner').hidden);
    await p.click('#licOpen');
    await p.type('#licName', 'Zoe Test');
    const f2b = await p.evaluate(() => ({ cardName: document.getElementById('cardName').textContent, date: document.getElementById('cardDate').textContent }));
    n.push('F2 real open + name: bannerHidden=' + f2a + ' ' + JSON.stringify(f2b));
    // F3: easter egg during license modal. Is title physically reachable?
    const f3a = await p.evaluate(() => {
      const t = document.getElementById('title');
      const r = t.getBoundingClientRect();
      const topEl = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return { covered: !(topEl === t || t.contains(topEl)), topEl: topEl && (topEl.id || topEl.className) };
    });
    // fire it via JS anyway (and also 5 rapid clicks)
    await p.evaluate(() => { for (let i = 0; i < 5; i++) document.getElementById('title').click(); });
    await sleep(300);
    const f3b = await p.evaluate(() => ({
      toast: document.querySelector('.toast')?.textContent,
      modalStillOpen: !document.getElementById('licModal').hidden,
      cardName: document.getElementById('cardName').textContent,
      revving: document.querySelectorAll('.gauge.rev').length,
    }));
    n.push('F3 egg during modal: physical=' + JSON.stringify(f3a) + ' result=' + JSON.stringify(f3b));
    await p.screenshot({ path: path.join(__dirname, 'break-egg-modal.png') });
    // F4: download PNG click (should not throw)
    await p.evaluate(() => document.getElementById('licPng').click());
    await sleep(600);
    n.push('F4 download PNG clicked, errors so far: ' + p._errs.length);
    // F5: escape closes, reopen
    await p.keyboard.press('Escape');
    const f5 = await p.evaluate(() => document.getElementById('licModal').hidden);
    n.push('F5 escape closes modal: ' + f5);
    await p.close();
  }

  await browser.close();
  console.log(JSON.stringify(R, null, 1));
})().catch((e) => { console.error('HARNESS FAIL', e); process.exit(1); });
