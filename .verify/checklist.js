// Acceptance checklist harness for glass-engine.html
// Runs every mechanically checkable line of the spec checklist and prints PASS/FAIL.
const p = require('puppeteer-core');
const fs = require('fs');
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const FILE = 'file:///Users/rodcolin/Projects/RSA 2026/glass-engine.html';
const PATH = '/Users/rodcolin/Projects/RSA 2026/glass-engine.html';

const results = [];
const check = (name, ok, detail) => {
  results.push({ name, ok, detail });
  console.log((ok ? 'PASS' : 'FAIL') + '  ' + name + (detail ? '  :: ' + detail : ''));
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const b = await p.launch({ executablePath: CHROME, headless: 'new' });

  // ---------- 1. offline file:// load, zero network requests ----------
  {
    const pg = await b.newPage();
    const reqs = [];
    pg.on('request', (r) => reqs.push(r.url()));
    await pg.setOfflineMode(true);
    const t0 = Date.now();
    await pg.goto(FILE, { waitUntil: 'load' });
    const loadMs = Date.now() - t0;
    await sleep(1200);
    const bad = reqs.filter((u) => !u.startsWith('file://') && !u.startsWith('data:'));
    check('offline load, zero network requests', bad.length === 0, 'requests=' + reqs.length + ' nonlocal=' + JSON.stringify(bad) + ' load=' + loadMs + 'ms');
    check('interactive fast (load event under 2s)', loadMs < 2000, loadMs + 'ms');
    await pg.close();
  }

  // ---------- 2. 360px: no horizontal scroll on any tab, taps land, nav reachable ----------
  {
    const pg = await b.newPage();
    await pg.setViewport({ width: 360, height: 700 });
    await pg.goto(FILE, { waitUntil: 'load' });
    let maxScroll = 0;
    const badTargets = [];
    for (let i = 0; i < 5; i++) {
      await pg.evaluate((i) => document.querySelectorAll('#tabs button')[i].click(), i);
      await sleep(350);
      if (i === 1) await pg.evaluate(() => { document.getElementById('tryStraw').click(); });
      if (i === 3) await pg.evaluate(() => {
        document.querySelectorAll('#attWords .aw')[1].click(); // commit a prediction so the grid unlocks
        document.getElementById('gridBtn').click();
        document.getElementById('fpIn').value = 'the dog chased the ball because it bounced';
        document.getElementById('fpGo').click();
      });
      if (i === 4) for (let k = 0; k < 6; k++) await pg.evaluate(() => document.getElementById('loopNext').click());
      await sleep(350);
      const sw = await pg.evaluate(() => Math.max(document.documentElement.scrollWidth, document.body.scrollWidth));
      maxScroll = Math.max(maxScroll, sw);
      const bads = await pg.evaluate(() => {
        const out = [];
        document.querySelectorAll('button, select, input, textarea').forEach((n) => {
          const r = n.getBoundingClientRect();
          const style = getComputedStyle(n);
          if (r.width === 0 || r.height === 0 || style.visibility === 'hidden' || n.closest('[hidden]')) return;
          if (r.height < 43.5 && r.width < 43.5) out.push(n.tagName + '.' + n.className + ' ' + Math.round(r.width) + 'x' + Math.round(r.height));
          else if (r.height < 43.5 && !(n.closest('.att-grid'))) out.push(n.tagName + '.' + n.className + ' h=' + Math.round(r.height));
        });
        return out;
      });
      bads.forEach((x) => badTargets.push('tab' + i + ': ' + x));
    }
    check('360px: no horizontal scroll on any tab', maxScroll <= 360, 'maxScrollWidth=' + maxScroll);
    check('360px: all touch targets at least 44px', badTargets.length === 0, badTargets.slice(0, 6).join(' | ') || 'all good');
    const nav = await pg.evaluate(() => {
      const r = document.getElementById('tabs').getBoundingClientRect();
      return { top: r.top, bottom: r.bottom, ih: innerHeight };
    });
    check('360px: bottom nav reachable in viewport', nav.bottom <= nav.ih + 1 && nav.top < nav.ih, JSON.stringify(nav));
    await pg.close();
  }

  // ---------- 3. 1280px projector readability (font scale check + screenshot) ----------
  {
    const pg = await b.newPage();
    await pg.setViewport({ width: 1280, height: 900 });
    await pg.goto(FILE, { waitUntil: 'load' });
    await sleep(400);
    const fs1 = await pg.evaluate(() => ({
      html: getComputedStyle(document.documentElement).fontSize,
      h2: getComputedStyle(document.querySelector('.mod.on h2')).fontSize,
      cap: getComputedStyle(document.querySelector('.cap')).fontSize,
    }));
    check('1280px: type scales up for projector', parseFloat(fs1.html) >= 19, JSON.stringify(fs1));
    await pg.screenshot({ path: 'shot-1280-final.png' });
    await pg.close();
  }

  // ---------- 4. temperature slider changes generation character ----------
  {
    const pg = await b.newPage();
    await pg.setViewport({ width: 800, height: 900 });
    await pg.goto(FILE, { waitUntil: 'load' });
    const gen = async (temp, n) => {
      return pg.evaluate(async (temp, n) => {
        const sl = document.getElementById('tempSlider');
        sl.value = String(temp);
        sl.dispatchEvent(new Event('input'));
        const outs = [];
        const starters = document.querySelectorAll('#starters .chip');
        for (let i = 0; i < n; i++) {
          starters[0].click();
          for (let s = 0; s < 14; s++) {
            const roll = document.getElementById('rollBtn');
            if (roll.disabled) break;
            roll.click();
          }
          outs.push(seq.join(' ')); // top-level let, shared global lexical scope
        }
        return outs;
      }, temp, n);
    };
    const jac = (a, b) => {
      const A = new Set(a.split(/\s+/)), B = new Set(b.split(/\s+/));
      let inter = 0;
      for (const x of A) if (B.has(x)) inter++;
      return inter / (A.size + B.size - inter);
    };
    const meanPairJac = (arr) => {
      let s = 0, c = 0;
      for (let i = 0; i < arr.length; i++) for (let j = i + 1; j < arr.length; j++) { s += jac(arr[i], arr[j]); c++; }
      return s / c;
    };
    const cold = await gen(0.2, 8);
    const hot = await gen(2.0, 8);
    const jc = meanPairJac(cold), jh = meanPairJac(hot);
    const distinctCold = new Set(cold).size, distinctHot = new Set(hot).size;
    check('temperature: cold repetitive vs hot varied', jc > jh + 0.12 && distinctHot >= distinctCold,
      'jaccard cold=' + jc.toFixed(2) + ' hot=' + jh.toFixed(2) + ' distinct cold=' + distinctCold + '/8 hot=' + distinctHot + '/8');
    console.log('   cold sample: ' + cold[0]);
    console.log('   hot sample:  ' + hot[0]);
    await pg.close();
  }

  // ---------- 5. strawberry splits, counter accurate ----------
  {
    const pg = await b.newPage();
    await pg.goto(FILE, { waitUntil: 'load' });
    await pg.evaluate(() => document.querySelectorAll('#tabs button')[1].click());
    const r = await pg.evaluate(() => {
      const ta = document.getElementById('tokIn');
      ta.value = 'strawberry';
      ta.dispatchEvent(new Event('input'));
      return new Promise((res) => setTimeout(() => {
        const toks = [...document.querySelectorAll('#tokOut .tok-t')].map((n) => n.textContent);
        res({ toks, count: document.getElementById('tokCount').textContent, cap: document.getElementById('strawCap').hidden });
      }, 300));
    });
    check('strawberry splits into straw + berry', JSON.stringify(r.toks) === JSON.stringify(['straw', 'berry']), JSON.stringify(r.toks));
    check('token counter accurate', r.count.startsWith(r.toks.length + ' tokens') && r.count.includes('10 characters'), r.count);
    check('strawberry caption appears', r.cap === false, 'hidden=' + r.cap);
    await pg.close();
  }

  // ---------- 6. word math presets land ----------
  {
    const pg = await b.newPage();
    await pg.goto(FILE, { waitUntil: 'load' });
    await pg.evaluate(() => document.querySelectorAll('#tabs button')[2].click());
    const expect = ['queen', 'drone', 'cat'];
    for (let i = 0; i < 3; i++) {
      await pg.evaluate((i) => document.querySelectorAll('#wmPresets .chip')[i].click(), i);
      await sleep(1400);
      const ans = await pg.evaluate(() => (document.querySelector('#wmOut .ans') || {}).textContent || 'NONE');
      check('word math preset ' + (i + 1) + ' lands on ' + expect[i], ans === expect[i], 'got ' + ans);
    }
    await pg.close();
  }

  // ---------- 7. attention routing + animated toggle ----------
  {
    const pg = await b.newPage();
    await pg.goto(FILE, { waitUntil: 'load' });
    await pg.evaluate(() => document.querySelectorAll('#tabs button')[3].click());
    await sleep(400);
    const route = async () => pg.evaluate(() => (document.querySelector('#attWords .aw.ans') || {}).textContent || 'NONE');
    // preset 1: commit a prediction first (tap 'cross', index 3), default ending = heavy
    await pg.evaluate(() => document.querySelectorAll('#attWords .aw')[3].click());
    await sleep(900);
    check('attention: heavy routes to robot', (await route()) === 'robot', 'got ' + (await route()));
    const pathCount = await pg.evaluate(() => document.querySelectorAll('#attSvg path').length);
    check('attention: lines drawn', pathCount >= 8, pathCount + ' paths');
    const trans = await pg.evaluate(() => getComputedStyle(document.querySelector('#attSvg path')).transitionDuration);
    check('attention: toggle animates (css transition on lines)', parseFloat(trans) > 0.3, 'transition=' + trans);
    await pg.evaluate(() => document.querySelectorAll('#attEndings .btn')[1].click());
    await sleep(700);
    check('attention: muddy routes to field', (await route()) === 'field', 'got ' + (await route()));
    // preset 2
    await pg.evaluate(() => document.querySelectorAll('#attPresets .chip')[1].click());
    await sleep(300);
    await pg.evaluate(() => document.querySelectorAll('#attWords .aw')[3].click());
    await sleep(900);
    check('attention: big routes to trophy', (await route()) === 'trophy', 'got ' + (await route()));
    await pg.evaluate(() => document.querySelectorAll('#attEndings .btn')[1].click());
    await sleep(700);
    check('attention: small routes to suitcase', (await route()) === 'suitcase', 'got ' + (await route()));
    await pg.close();
  }

  // ---------- 8. ATTENTION_PRESETS extendability (add, test, remove) ----------
  {
    const src = fs.readFileSync(PATH, 'utf8');
    const marker = 'const ATTENTION_PRESETS = [';
    const inject = marker + `
  {
    label: 'the sandwich test',
    words: ['The', 'kid', 'dropped', 'the', 'sandwich', 'because', 'it', 'was', 'too'],
    it: 6,
    endings: [
      { word: 'slippery', answer: 4, weights: [0.03, 0.14, 0.09, 0.03, 0.55, 0.04, 0, 0.05, 0.07] },
      { word: 'clumsy', answer: 1, weights: [0.03, 0.55, 0.10, 0.03, 0.14, 0.04, 0, 0.04, 0.07] },
    ],
  },`;
    const test = src.replace(marker, inject);
    const tmp = '/Users/rodcolin/Projects/RSA 2026/.verify/tmp-preset-test.html';
    fs.writeFileSync(tmp, test);
    const pg = await b.newPage();
    await pg.goto('file://' + tmp, { waitUntil: 'load' });
    await pg.evaluate(() => document.querySelectorAll('#tabs button')[3].click());
    await sleep(300);
    const chips = await pg.evaluate(() => [...document.querySelectorAll('#attPresets .chip')].map((c) => c.textContent));
    // exercise the injected preset end to end
    await pg.evaluate(() => document.querySelectorAll('#attPresets .chip')[0].click());
    await sleep(200);
    await pg.evaluate(() => document.querySelectorAll('#attWords .aw')[1].click());
    await sleep(900);
    const ans1 = await pg.evaluate(() => (document.querySelector('#attWords .aw.ans') || {}).textContent);
    await pg.evaluate(() => document.querySelectorAll('#attEndings .btn')[1].click());
    await sleep(600);
    const ans2 = await pg.evaluate(() => (document.querySelector('#attWords .aw.ans') || {}).textContent);
    check('new preset appears with zero other edits', chips.length === 3 && chips[0] === 'the sandwich test', JSON.stringify(chips));
    check('new preset fully functional', ans1 === 'sandwich' && ans2 === 'kid', 'slippery->' + ans1 + ' clumsy->' + ans2);
    await pg.close();
    fs.unlinkSync(tmp); // tested, now removed, per the checklist
  }

  // ---------- 9. five checkpoints, gauges, license ----------
  {
    const pg = await b.newPage();
    await pg.setViewport({ width: 390, height: 800 });
    await pg.goto(FILE, { waitUntil: 'load' });
    const CORRECT = await pg.evaluate(() => CHECKPOINTS.map((c) => c.correct));
    for (let m = 0; m < 5; m++) {
      await pg.evaluate((m) => document.querySelectorAll('#tabs button')[m].click(), m);
      await sleep(200);
      // one wrong answer first on module 0 to test retry-until-correct
      if (m === 0) {
        await pg.evaluate((m, c) => {
          document.querySelectorAll('.checkpoint')[m].querySelectorAll('.ck-opt')[(c + 1) % 3].click();
        }, m, CORRECT[m]);
        await sleep(200);
        const fb = await pg.evaluate((m) => document.querySelectorAll('.checkpoint')[m].querySelector('.ck-fb').textContent, m);
        check('checkpoint wrong answer: kind feedback, retry allowed', fb.startsWith('Not quite'), fb.slice(0, 60));
      }
      await pg.evaluate((m, c) => {
        document.querySelectorAll('.checkpoint')[m].querySelectorAll('.ck-opt')[c].click();
      }, m, CORRECT[m]);
      await sleep(250);
    }
    await sleep(1600);
    const state = await pg.evaluate(() => ({
      full: document.querySelectorAll('.gauge.full').length,
      needle: getComputedStyle(document.querySelector('.gauge.full .g-needle-rot')).transform,
      dash: getComputedStyle(document.querySelector('.gauge.full .g-arc-fill')).strokeDashoffset,
      banner: !document.getElementById('licBanner').hidden,
    }));
    check('all five gauges sweep full', state.full === 5, JSON.stringify(state));
    check('license banner unlocks', state.banner, '');
    await pg.evaluate(() => document.getElementById('licOpen').click());
    await sleep(300);
    await pg.type('#licName', 'Ada Lovelace');
    await sleep(200);
    const card = await pg.evaluate(() => ({
      name: document.getElementById('cardName').textContent,
      date: document.getElementById('cardDate').textContent,
    }));
    const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    check('license renders typed name', card.name === 'ADA LOVELACE', card.name);
    check('license shows current date', card.date.includes(today), card.date + ' vs ' + today);
    await pg.screenshot({ path: 'shot-license.png' });
    await pg.close();
  }

  // ---------- 10. prefers-reduced-motion ----------
  {
    const pg = await b.newPage();
    await pg.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
    await pg.goto(FILE, { waitUntil: 'load' });
    await sleep(300);
    const rm = await pg.evaluate(() => {
      const needle = getComputedStyle(document.querySelector('.gauge .g-needle-rot'));
      const arc = getComputedStyle(document.querySelector('.gauge .g-arc-fill'));
      return { flutter: needle.animationName, sweepDur: arc.transitionDuration, modAnim: getComputedStyle(document.querySelector('.mod.on')).animationDuration };
    });
    check('reduced motion: needle flutter disabled', rm.flutter === 'none', rm.flutter);
    check('reduced motion: sweep/draw transitions collapsed', parseFloat(rm.sweepDur) <= 0.005, JSON.stringify(rm));
    // word math must land instantly (no traveling dot)
    await pg.evaluate(() => document.querySelectorAll('#tabs button')[2].click());
    await pg.evaluate(() => document.querySelectorAll('#wmPresets .chip')[0].click());
    await sleep(120);
    const fast = await pg.evaluate(() => document.getElementById('wmOut').textContent);
    check('reduced motion: word math lands without travel animation', fast.includes('lands nearest'), fast);
    await pg.close();
  }

  // ---------- 11. no em dash in file or rendered copy ----------
  {
    const src = fs.readFileSync(PATH, 'utf8');
    const pg = await b.newPage();
    await pg.goto(FILE, { waitUntil: 'load' });
    const rendered = await pg.evaluate(() => document.body.innerText);
    check('no em dash or en dash anywhere', !src.includes('—') && !src.includes('–') && !rendered.includes('—') && !rendered.includes('–'), '');
    await pg.close();
  }

  // ---------- 12. size ----------
  {
    const kb = fs.statSync(PATH).size / 1024;
    check('file under 400 KB', kb < 400, kb.toFixed(1) + ' KB');
  }

  await b.close();
  const fails = results.filter((r) => !r.ok);
  console.log('\n==== ' + (results.length - fails.length) + '/' + results.length + ' checks passed ====');
  process.exit(fails.length ? 1 : 0);
})().catch((e) => { console.error('HARNESS ERROR', e); process.exit(2); });
