'use strict';
/* ============================================================
   THE GLASS ENGINE : application logic
   Sections: utils, data, gauges, tabs, predict, tokens,
   meaning, attention, loop, checkpoints, license, extras
   ============================================================ */

// ---------- utils ----------
const $ = (id) => document.getElementById(id);
const RM = matchMedia('(prefers-reduced-motion: reduce)');
const reduced = () => RM.matches;
const SVGNS = 'http://www.w3.org/2000/svg';
function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
}
function svgEl(tag, attrs) {
  const n = document.createElementNS(SVGNS, tag);
  for (const k in attrs) n.setAttribute(k, attrs[k]);
  return n;
}
function hashId(s) { // deterministic fake token id, djb2
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
  return 1200 + (h % 48000);
}
function toast(msg, ms) {
  const t = el('div', 'toast', msg);
  document.body.appendChild(t);
  setTimeout(() => t.remove(), ms || 2600);
}

// ---------- state ----------
const S = { passed: [false, false, false, false, false], licensed: false };

// ============================================================
// DATA
// ============================================================
const CORPUS = /*@DATA:corpus*/[];
const WORDS = /*@DATA:wordmap*/[];
const TOKVOCAB = /*@DATA:tokvocab*/{"commonWords":[],"prefixes":[],"suffixes":[],"units":[]};

// ============================================================
// CLASS SENTENCE SLOT: add new presets here, match this shape
//
//   { label: 'text for the preset chip',
//     words: ['The','sentence','as','word','chips','without','the','last','word'],
//     it: <index in words of the pronoun that needs resolving>,
//     endings: [
//       { word: 'heavy',            the last word, gets a toggle button
//         answer: <index in words that the pronoun points to>,
//         weights: [/* one number per word, roughly summing to 1 */] },
//       ...one or more endings...
//     ] }
//
// The UI rebuilds chips, toggles, lines and the grid from this
// array alone. Add a preset, reload, done. No other edits.
// ============================================================
const ATTENTION_PRESETS = [
  {
    label: 'the robot and the field',
    words: ['The', 'robot', "couldn't", 'cross', 'the', 'field', 'because', 'it', 'was', 'too'],
    it: 7,
    endings: [
      { word: 'heavy', answer: 1, weights: [0.02, 0.55, 0.05, 0.08, 0.02, 0.12, 0.03, 0, 0.05, 0.08] },
      { word: 'muddy', answer: 5, weights: [0.02, 0.13, 0.04, 0.08, 0.03, 0.55, 0.03, 0, 0.04, 0.08] },
    ],
  },
  {
    label: 'the trophy and the suitcase',
    words: ['The', 'trophy', "wouldn't", 'fit', 'in', 'the', 'suitcase', 'because', 'it', 'was', 'too'],
    it: 8,
    endings: [
      { word: 'big', answer: 1, weights: [0.02, 0.55, 0.04, 0.09, 0.02, 0.02, 0.12, 0.03, 0, 0.04, 0.07] },
      { word: 'small', answer: 6, weights: [0.02, 0.12, 0.04, 0.09, 0.02, 0.02, 0.55, 0.03, 0, 0.04, 0.07] },
    ],
  },
];

const LOOP_STEPS = [
  { kind: 'plan', text: 'Check the battery and the error log before concluding anything.' },
  { kind: 'act', tool: 'check_battery("vex-red")', ret: '12.6V (full is about 12.8V)' },
  { kind: 'observe', text: 'Battery is fine. Keep digging.' },
  { kind: 'act', tool: 'get_error_log("vex-red")', ret: 'WARN: left drive motor over temperature (Port 1)' },
  { kind: 'observe', text: 'Found it.' },
  { kind: 'answer', text: 'The left drive motor is overheating. Thermal protection cuts its power, so the robot pulls left and stops. Let it cool down, then check Port 1 for friction.' },
];

const CHECKPOINTS = [
  {
    q: 'What does raising the temperature do?',
    opts: ['It makes the engine type faster', 'It picks less likely words more often', 'It teaches the model brand new words'],
    correct: 1,
    explain: 'temperature reshapes the odds. High heat flattens them, so rare words sneak through.',
  },
  {
    q: "Why is counting the r's in strawberry hard for a model?",
    opts: ['It sees chunks like straw and berry, not letters', 'The word is too long to remember', 'It never read the word strawberry before'],
    correct: 0,
    explain: 'the engine reads numbered chunks. It cannot count letters it never sees.',
  },
  {
    q: 'On this map, two words sitting close together means what?',
    opts: ['They are spelled almost the same', 'They rhyme', 'They mean similar things'],
    correct: 2,
    explain: 'distance is meaning. Words used the same way end up side by side.',
  },
  {
    q: 'Attention lets each word do what?',
    opts: ['Look at every other word to sharpen its own meaning', 'Check its spelling twice', 'Delete the words it disagrees with'],
    correct: 0,
    explain: "every word looks at every other word, so 'it' can figure out what it stands for.",
  },
  {
    q: 'What makes an agent more than a model?',
    opts: ['A much bigger vocabulary', 'A faster processor', 'Tools plus a loop that checks results'],
    correct: 2,
    explain: 'a model only predicts text. Tools and a check-your-work loop turn it into a mechanic.',
  },
];

// ============================================================
// GAUGES : the signature cluster
// ============================================================
const GAUGE_LABELS = ['PRE', 'TOK', 'MAP', 'ATT', 'LOOP'];
function gaugeSvg(full) {
  const svg = svgEl('svg', { viewBox: '0 0 80 64', 'aria-hidden': 'true' });
  const arcD = 'M17.5 53 A26 26 0 1 1 62.5 53';
  svg.appendChild(svgEl('path', { class: 'g-arc-bg', d: arcD, fill: 'none', 'stroke-width': 5, 'stroke-linecap': 'round' }));
  const fill = svgEl('path', { class: 'g-arc-fill', d: arcD, fill: 'none', 'stroke-width': 5, 'stroke-linecap': 'round' });
  svg.appendChild(fill);
  for (let a = -120; a <= 120; a += 60) {
    const r = a * Math.PI / 180, s = Math.sin(r), c = Math.cos(r);
    svg.appendChild(svgEl('line', {
      class: 'g-ticks', x1: 40 + 30.5 * s, y1: 40 - 30.5 * c, x2: 40 + 34 * s, y2: 40 - 34 * c, 'stroke-width': 1.2,
    }));
  }
  const g = svgEl('g', { class: 'g-needle-rot' });
  g.appendChild(svgEl('line', { x1: 40, y1: 40, x2: 40, y2: 19, stroke: '#EDF2F7', 'stroke-width': 2.6, 'stroke-linecap': 'round' }));
  svg.appendChild(g);
  svg.appendChild(svgEl('circle', { cx: 40, cy: 40, r: 3, fill: '#EDF2F7' }));
  if (full) { fill.style.strokeDashoffset = '0'; g.style.transform = 'rotate(120deg)'; }
  return svg;
}
const gaugeEls = [];
function buildGauges() {
  const host = $('gauges');
  for (let i = 0; i < 5; i++) {
    const d = el('div', 'gauge');
    d.appendChild(gaugeSvg(false));
    d.appendChild(el('div', 'g-lab', GAUGE_LABELS[i]));
    host.appendChild(d);
    gaugeEls.push(d);
  }
  document.body.classList.add('idle'); // tiny needle flutter, css only, off under reduced motion
}
function sweepGauge(i) {
  gaugeEls[i].classList.add('full');
  sndSweep();
}

// ============================================================
// TABS
// ============================================================
const TAB_NAMES = ['PREDICT', 'TOKENS', 'MEANING', 'ATTENTION', 'LOOP'];
const tabBtns = [];
function buildTabs() {
  const nav = $('tabs');
  TAB_NAMES.forEach((name, i) => {
    const b = el('button', i === 0 ? 'on' : '');
    b.setAttribute('aria-label', name.toLowerCase() + ' module');
    b.appendChild(el('span', 't-dot'));
    b.appendChild(document.createTextNode(name));
    b.addEventListener('click', () => showTab(i));
    nav.appendChild(b);
    tabBtns.push(b);
  });
}
function showTab(i) {
  for (let k = 0; k < 5; k++) {
    document.getElementById('mod' + k).classList.toggle('on', k === i);
    tabBtns[k].classList.toggle('on', k === i);
    tabBtns[k].setAttribute('aria-current', k === i ? 'page' : 'false');
  }
  window.scrollTo(0, 0);
  if (i === 3) attOnShow();
}

// ============================================================
// MODULE 01 : PREDICT, a real bigram language model
// ============================================================
const END = '■'; // sentinel drawn as a small square
const CHAIN = new Map();
function chainAdd(a, b) {
  let m = CHAIN.get(a);
  if (!m) { m = new Map(); CHAIN.set(a, m); }
  m.set(b, (m.get(b) || 0) + 1);
}
function buildChain() {
  for (const s of CORPUS) {
    const w = s.split(' ');
    for (let i = 0; i < w.length - 1; i++) chainAdd(w[i], w[i + 1]);
    chainAdd(w[w.length - 1], END);
  }
}
let seq = [], genDone = false, genCapped = false, autoTimer = null;
let TEMP = 1;
function candidates(word) {
  const m = CHAIN.get(word);
  if (!m) return [{ w: END, p: 1 }];
  const inv = 1 / TEMP;
  let tot = 0;
  const out = [];
  for (const [w, c] of m) { const v = Math.pow(c, inv); tot += v; out.push({ w, v }); }
  for (const o of out) { o.p = o.v / tot; }
  out.sort((a, b) => b.p - a.p || (a.w < b.w ? -1 : 1));
  return out;
}
const barEls = [];
function buildBars() {
  const host = $('bars');
  for (let i = 0; i < 5; i++) {
    const b = el('button', 'bar');
    b.appendChild(el('span', 'b-word'));
    const tr = el('span', 'b-track');
    tr.appendChild(el('span', 'b-fill'));
    b.appendChild(tr);
    b.appendChild(el('span', 'pct'));
    b.addEventListener('click', () => { if (b.dataset.w != null && !genDone && !autoTimer) chooseWord(b.dataset.w); });
    host.appendChild(b);
    barEls.push(b);
  }
}
function renderGen() {
  const out = $('genOut');
  out.textContent = '';
  if (!seq.length) {
    out.appendChild(el('span', 'hint', 'pick a starter above to fire up the engine'));
    return;
  }
  seq.forEach((w, i) => {
    const s = el('span', 'gw' + (i === seq.length - 1 ? ' new' : ''), w);
    out.appendChild(s);
  });
  if (genDone) {
    const s = el('span', 'gw mono', genCapped ? '...' : END);
    s.style.color = 'var(--dim)';
    out.appendChild(s);
    if (genCapped) out.appendChild(el('span', 'hint', ' out of road, start over'));
  }
}
function renderBars() {
  const cands = seq.length && !genDone ? candidates(seq[seq.length - 1]) : [];
  $('bars').style.display = cands.length ? '' : 'none';
  for (let i = 0; i < 5; i++) {
    const b = barEls[i], c = cands[i];
    if (!c) {
      b.style.visibility = 'hidden';
      delete b.dataset.w;
      continue;
    }
    b.style.visibility = '';
    b.dataset.w = c.w;
    const wl = b.firstChild;
    wl.textContent = c.w === END ? 'stop' : c.w;
    wl.classList.toggle('end', c.w === END);
    b.setAttribute('aria-label', 'choose ' + wl.textContent + ', ' + (c.p * 100).toFixed(1) + ' percent');
    // widths scale against the front-runner so small odds stay visible; labels carry the true numbers
    b.querySelector('.b-fill').style.width = (c.p / cands[0].p * 100).toFixed(1) + '%';
    b.lastChild.textContent = (c.p * 100).toFixed(1) + '%';
  }
  $('rollBtn').disabled = !seq.length || genDone || !!autoTimer;
  $('autoBtn').disabled = !seq.length || genDone || !!autoTimer;
}
function chooseWord(w) {
  if (w === END) genDone = true;
  else {
    seq.push(w);
    // length cap is our limit, not the model's choice; mark it honestly
    if (seq.length >= 30) { genDone = true; genCapped = true; }
  }
  sndClick();
  renderGen(); renderBars();
}
function sampleWord() {
  const cands = candidates(seq[seq.length - 1]);
  let r = Math.random();
  for (const c of cands) { r -= c.p; if (r <= 0) return c.w; }
  return cands[cands.length - 1].w;
}
function rollOnce() { if (seq.length && !genDone) chooseWord(sampleWord()); }
function autoFinish() {
  if (!seq.length || genDone) return;
  const step = () => {
    rollOnce();
    if (!genDone) autoTimer = setTimeout(step, reduced() ? 220 : 380);
    else { autoTimer = null; renderBars(); }
  };
  autoTimer = setTimeout(step, 60);
  renderBars();
}
function resetGen(starter) {
  clearTimeout(autoTimer); autoTimer = null;
  genDone = false; genCapped = false;
  seq = starter ? starter.split(' ') : [];
  renderGen(); renderBars();
}
const STARTERS = ['the robot', 'my teacher', 'at lunch', 'the pit crew', 'our team'];
function buildPredict() {
  buildChain();
  buildBars();
  const chipHost = $('starters');
  STARTERS.forEach((st) => {
    const c = el('button', 'chip', st);
    c.addEventListener('click', () => {
      chipHost.querySelectorAll('.chip').forEach((x) => x.classList.remove('on'));
      c.classList.add('on');
      resetGen(st);
    });
    chipHost.appendChild(c);
  });
  $('rollBtn').addEventListener('click', rollOnce);
  $('autoBtn').addEventListener('click', autoFinish);
  $('resetBtn').addEventListener('click', () => {
    chipHost.querySelectorAll('.chip').forEach((x) => x.classList.remove('on'));
    resetGen();
  });
  const slider = $('tempSlider');
  const words = [[0.45, 'boring'], [0.75, 'careful'], [1.05, 'balanced'], [1.45, 'adventurous'], [1.75, 'spicy'], [9, 'unhinged']];
  const syncTemp = () => {
    TEMP = parseFloat(slider.value);
    $('tVal').textContent = TEMP.toFixed(2);
    $('tWord').textContent = words.find((w) => TEMP < w[0])[1];
    renderBars();
  };
  slider.addEventListener('input', syncTemp);
  syncTemp();
  $('predictFoot').textContent = 'This is a real language model that fits in a webpage. It learned by counting word pairs in ' + CORPUS.length + ' sentences. GPT plays the same game with attention, deep networks, and most of the internet.';
  renderGen(); renderBars();
}

// ============================================================
// MODULE 02 : TOKENS, deterministic approximate subword chopper
// ============================================================
let COMMON, UNITS, PREFIXES, SUFFIXES;
function tokSetup() {
  COMMON = new Set(TOKVOCAB.commonWords);
  UNITS = new Set(TOKVOCAB.units);
  PREFIXES = TOKVOCAB.prefixes.slice().sort((a, b) => b.length - a.length);
  SUFFIXES = TOKVOCAB.suffixes.slice().sort((a, b) => b.length - a.length);
}
function chunkStem(stem) {
  if (stem.length === 0) return [];
  if (UNITS.has(stem)) return [stem];
  for (let i = stem.length - 2; i >= 2; i--) {
    const a = stem.slice(0, i), b = stem.slice(i);
    if (UNITS.has(a) && UNITS.has(b)) return [a, b];
  }
  const out = [];
  let i = 0;
  while (i < stem.length) {
    const rem = stem.length - i;
    const take = rem <= 4 ? rem : (rem === 5 ? 3 : 4); // never strand a 1-char tail
    out.push(stem.slice(i, i + take));
    i += take;
  }
  return out;
}
function tokenizeWord(word) {
  const lower = word.toLowerCase();
  if (COMMON.has(lower)) return [word];
  let pre = '', suf = '', stem = lower;
  for (const p of PREFIXES) {
    if (stem.startsWith(p) && stem.length - p.length >= 3) { pre = p; stem = stem.slice(p.length); break; }
  }
  for (const s of SUFFIXES) {
    if (stem.endsWith(s) && stem.length - s.length >= 3) { suf = s; stem = stem.slice(0, stem.length - s.length); break; }
  }
  const parts = [];
  if (pre) parts.push(pre);
  parts.push(...chunkStem(stem));
  if (suf) parts.push(suf);
  // map lowercase split back onto the original casing
  const out = [];
  let at = 0;
  for (const p of parts) { out.push(word.slice(at, at + p.length)); at += p.length; }
  return out;
}
function tokenize(text) {
  const toks = [];
  const re = /([a-zA-Z]+)|([0-9]+)|(\s+)|([^\sa-zA-Z0-9]+)/g;
  let m;
  while ((m = re.exec(text))) {
    if (m[1]) for (const t of tokenizeWord(m[1])) toks.push(t);
    else if (m[2]) { for (let i = 0; i < m[2].length; i += 3) toks.push(m[2].slice(i, i + 3)); }
    else if (m[4]) { const cps = Array.from(m[4]); for (let i = 0; i < cps.length; i += 3) toks.push(cps.slice(i, i + 3).join('')); }
    // whitespace separates, costs nothing here (real tokenizers glue it to words)
  }
  return toks;
}
function renderTokens() {
  const text = $('tokIn').value;
  const toks = tokenize(text);
  const host = $('tokOut');
  host.textContent = '';
  const hasStraw = text.toLowerCase().includes('strawberry');
  toks.forEach((t, i) => {
    const d = el('span', 'tok c' + (i % 5));
    const low = t.toLowerCase();
    if (hasStraw && (low === 'straw' || low === 'berry')) d.classList.add('hot');
    d.appendChild(el('span', 'tok-t', t));
    d.appendChild(el('span', 'tok-id', String(hashId(low))));
    host.appendChild(d);
  });
  $('tokCount').textContent = toks.length + ' tokens · ' + text.length + ' characters';
  const frac = toks.length / 1000000;
  $('ctxFill').style.width = Math.min(100, frac * 100) + '%';
  $('ctxPct').textContent = (frac * 100).toPrecision(2) + '% of a 1,000,000 token window';
  $('strawCap').hidden = !hasStraw;
  if (toks.length) sndClick();
}
function buildTokens() {
  tokSetup();
  let deb;
  $('tokIn').addEventListener('input', () => { clearTimeout(deb); deb = setTimeout(renderTokens, 90); });
  $('tryStraw').addEventListener('click', () => {
    $('tokIn').value = "how many r's are in strawberry?";
    renderTokens();
  });
  renderTokens();
}

// ============================================================
// MODULE 03 : MEANING, the word map and word math
// ============================================================
const MAP = {}; // word -> {x, y}
let mapView = { x: -8, y: -6, w: 116, h: 112 };
let mapSel = null;
function mapApply() {
  $('mapSvg').setAttribute('viewBox', mapView.x + ' ' + mapView.y + ' ' + mapView.w + ' ' + mapView.h);
}
const CLUSTER_COLORS = {
  royalty: '#FFB020', animals: '#6FDC8C', food: '#FF8FB2', machines: '#5BD1C6',
  feelings: '#9D8CFF', school: '#6FA8FF', music: '#FF9A5C', places: '#EDF2F7',
};
const nodeEls = {};
function buildMap() {
  const svg = $('mapSvg');
  svg.appendChild(svgEl('g', { id: 'mapLines' }));
  svg.appendChild(svgEl('g', { id: 'mapGhost' }));
  const gN = svgEl('g', { id: 'mapNodes' });
  svg.appendChild(gN);
  // label thinning: 111 labels cannot all be legible, so labels are placed
  // greedily without collisions; every dot stays tappable and hidden labels
  // reappear whenever their word is selected or lights up as a neighbor
  const PRIORITY = ['king', 'man', 'woman', 'queen', 'robot', 'wheels', 'wings', 'drone', 'dog', 'puppy', 'kitten', 'cat', 'berkeley'];
  const order = [...PRIORITY.map((w) => WORDS.find((x) => x.w === w)).filter(Boolean),
    ...WORDS.filter((x) => !PRIORITY.includes(x.w))];
  const FS = 4.2, CH = FS * 0.64;
  const placed = [];
  const fits = (bx) => placed.every((p) => bx.x + bx.w + 0.6 < p.x || p.x + p.w + 0.6 < bx.x || bx.y + bx.h + 0.4 < p.y || p.y + p.h + 0.4 < bx.y);
  for (const wd of order) {
    MAP[wd.w] = { x: wd.x, y: wd.y };
    const g = svgEl('g', { class: 'node' });
    g.appendChild(svgEl('circle', { class: 'dot', cx: wd.x, cy: wd.y, r: 0.85, fill: CLUSTER_COLORS[wd.c] || '#5BD1C6', 'fill-opacity': 0.85 }));
    const t = svgEl('text', { x: wd.x + 1.3, y: wd.y + 1 });
    t.textContent = wd.w;
    const box = { x: wd.x + 1.3, y: wd.y - FS * 0.6, w: wd.w.length * CH, h: FS * 1.2 };
    if (box.x + box.w > 106) { // flip left of the dot instead of clipping at the map edge
      t.setAttribute('text-anchor', 'end');
      t.setAttribute('x', wd.x - 1.3);
      box.x = wd.x - 1.3 - box.w;
    }
    if (fits(box)) placed.push(box);
    else t.setAttribute('class', 'toff');
    g.appendChild(t);
    gN.appendChild(g);
    nodeEls[wd.w] = g;
  }
  mapApply();
  // pan by pointer drag, tap to select
  const wrap = $('mapWrap');
  let pid = null, sx = 0, sy = 0, moved = 0;
  wrap.addEventListener('pointerdown', (e) => {
    pid = e.pointerId; sx = e.clientX; sy = e.clientY; moved = 0;
    wrap.setPointerCapture(pid);
  });
  wrap.addEventListener('pointermove', (e) => {
    if (pid !== e.pointerId) return;
    const r = wrap.getBoundingClientRect();
    const scale = Math.max(mapView.w / r.width, mapView.h / r.height);
    mapView.x -= (e.clientX - sx) * scale;
    mapView.y -= (e.clientY - sy) * scale;
    moved += Math.abs(e.clientX - sx) + Math.abs(e.clientY - sy);
    mapView.x = Math.max(-30, Math.min(40, mapView.x));
    mapView.y = Math.max(-30, Math.min(40, mapView.y));
    sx = e.clientX; sy = e.clientY;
    mapApply();
  });
  wrap.addEventListener('pointerup', (e) => {
    if (pid !== e.pointerId) return;
    pid = null;
    if (moved < 8) mapTap(e);
  });
  wrap.addEventListener('pointercancel', () => { pid = null; });
}
function svgPoint(e) {
  const svg = $('mapSvg');
  const pt = svg.createSVGPoint();
  pt.x = e.clientX; pt.y = e.clientY;
  return pt.matrixTransform(svg.getScreenCTM().inverse());
}
function mapTap(e) {
  const p = svgPoint(e);
  let best = null, bd = 81; // within 9 units
  for (const w in MAP) {
    const d = (MAP[w].x - p.x) ** 2 + (MAP[w].y - p.y) ** 2;
    if (d < bd) { bd = d; best = w; }
  }
  if (best) mapSelect(best);
}
function nearest(x, y, exclude, n) {
  const ex = new Set(exclude);
  return Object.keys(MAP)
    .filter((w) => !ex.has(w))
    .map((w) => ({ w, d: (MAP[w].x - x) ** 2 + (MAP[w].y - y) ** 2 }))
    .sort((a, b) => a.d - b.d)
    .slice(0, n);
}
function mapSelect(word) {
  for (const w in nodeEls) {
    nodeEls[w].setAttribute('class', 'node');
    nodeEls[w].querySelector('text').classList.remove('show');
  }
  document.getElementById('mapGhost').textContent = '';
  const lines = document.getElementById('mapLines');
  lines.textContent = '';
  mapSel = word;
  nodeEls[word].setAttribute('class', 'node sel');
  const p = MAP[word];
  const nbs = nearest(p.x, p.y, [word], 5);
  lines.setAttribute('class', reduced() ? '' : 'anim');
  const boxFor = (w, fs) => ({ x: MAP[w].x + 1.3, y: MAP[w].y - fs * 0.6, w: w.length * fs * 0.64, h: fs * 1.2 });
  const shown = [boxFor(word, 4.8)];
  const clear = (bx) => shown.every((o) => bx.x + bx.w + 0.6 < o.x || o.x + o.w + 0.6 < bx.x || bx.y + bx.h + 0.4 < o.y || o.y + o.h + 0.4 < bx.y);
  for (const nb of nbs) {
    nodeEls[nb.w].setAttribute('class', 'node nb');
    nodeEls[nb.w].parentNode.appendChild(nodeEls[nb.w]); // paint above other labels
    const t = nodeEls[nb.w].querySelector('text');
    const bx = boxFor(nb.w, 4.2);
    // reveal a hidden neighbor label only if it will not overprint; the caption lists them all anyway
    if (!t.classList.contains('toff')) shown.push(bx);
    else if (clear(bx)) { t.classList.add('show'); shown.push(bx); }
    lines.appendChild(svgEl('line', { class: 'nline', x1: p.x, y1: p.y, x2: MAP[nb.w].x, y2: MAP[nb.w].y }));
  }
  nodeEls[word].parentNode.appendChild(nodeEls[word]);
  $('nbCap').textContent = word + ' sits near: ' + nbs.map((n) => n.w).join(', ');
  sndClick();
}
const WM_PRESETS = [
  ['king', 'man', 'woman'],
  ['robot', 'wheels', 'wings'],
  ['dog', 'puppy', 'kitten'],
];
let wmBusy = false;
function wmSetBusy(b) {
  wmBusy = b;
  $('wmGo').disabled = b;
  document.querySelectorAll('#wmPresets .chip').forEach((c) => { c.disabled = b; });
}
function wordMath() {
  if (wmBusy) return;
  const A = $('wmA').value, B = $('wmB').value, C = $('wmC').value;
  const t = {
    x: MAP[A].x - MAP[B].x + MAP[C].x,
    y: MAP[A].y - MAP[B].y + MAP[C].y,
  };
  const ghost = document.getElementById('mapGhost');
  ghost.textContent = '';
  for (const w in nodeEls) nodeEls[w].setAttribute('class', 'node');
  document.getElementById('mapLines').textContent = '';
  // guide line plus traveling ghost dot
  ghost.appendChild(svgEl('line', {
    x1: MAP[A].x, y1: MAP[A].y, x2: t.x, y2: t.y,
    stroke: '#FFB020', 'stroke-opacity': 0.4, 'stroke-width': 0.3, 'stroke-dasharray': '1 1.2',
  }));
  const g = svgEl('g', {});
  g.appendChild(svgEl('circle', { class: 'ghost', cx: 0, cy: 0, r: 1.5 }));
  g.style.transform = 'translate(' + MAP[A].x + 'px,' + MAP[A].y + 'px)';
  ghost.appendChild(g);
  const land = () => {
    wmSetBusy(false);
    const hit = nearest(t.x, t.y, [A, B, C], 1)[0];
    const n = nodeEls[hit.w];
    n.setAttribute('class', 'node pulse');
    $('wmOut').innerHTML = '';
    $('wmOut').appendChild(document.createTextNode(A + ' - ' + B + ' + ' + C + ' lands nearest: '));
    const ans = el('span', 'ans', hit.w);
    $('wmOut').appendChild(ans);
    sndSweep();
  };
  $('wmOut').textContent = 'computing the vector...';
  if (reduced()) {
    g.style.transform = 'translate(' + t.x + 'px,' + t.y + 'px)';
    land();
  } else {
    wmSetBusy(true);
    requestAnimationFrame(() => requestAnimationFrame(() => {
      g.style.transition = 'transform 1s cubic-bezier(.4,.1,.3,1)';
      g.style.transform = 'translate(' + t.x + 'px,' + t.y + 'px)';
      setTimeout(land, 1050);
    }));
  }
}
function buildMeaning() {
  buildMap();
  const words = WORDS.map((w) => w.w).sort();
  for (const id of ['wmA', 'wmB', 'wmC']) {
    const sel = $(id);
    for (const w of words) {
      const o = document.createElement('option');
      o.value = o.textContent = w;
      sel.appendChild(o);
    }
  }
  $('wmA').value = 'king'; $('wmB').value = 'man'; $('wmC').value = 'woman';
  $('wmGo').addEventListener('click', wordMath);
  const host = $('wmPresets');
  for (const [a, b, c] of WM_PRESETS) {
    const chip = el('button', 'chip', a + ' - ' + b + ' + ' + c);
    chip.addEventListener('click', () => {
      $('wmA').value = a; $('wmB').value = b; $('wmC').value = c;
      wordMath();
    });
    host.appendChild(chip);
  }
}

// ============================================================
// MODULE 04 : ATTENTION, predict first, then see the machine
// ============================================================
const attState = { preset: 0, ending: 0, predicted: false, pick: -1, paths: [], chips: [] };
function attPreset() { return ATTENTION_PRESETS[attState.preset]; }
function attLoadPreset(i) {
  attState.preset = i; attState.ending = 0; attState.predicted = false; attState.pick = -1;
  const p = attPreset();
  document.querySelectorAll('#attPresets .chip').forEach((c, k) => c.classList.toggle('on', k === i));
  // ending toggles
  const eh = $('attEndings');
  eh.textContent = '';
  p.endings.forEach((e, k) => {
    const b = el('button', 'btn' + (k === 0 ? ' btn-primary' : ''), 'too ' + e.word);
    b.addEventListener('click', () => attSetEnding(k));
    eh.appendChild(b);
  });
  // word chips
  const wh = $('attWords');
  wh.textContent = '';
  attState.chips = [];
  p.words.forEach((w, k) => {
    const b = el('button', 'aw' + (k === p.it ? ' it' : ''), w);
    if (k === p.it) b.setAttribute('aria-label', w + ', the word being resolved');
    b.addEventListener('click', () => attPick(k));
    wh.appendChild(b);
    attState.chips.push(b);
  });
  const endChip = el('button', 'aw endw', p.endings[0].word);
  endChip.disabled = true;
  wh.appendChild(endChip);
  attState.chips.push(endChip);
  $('attSvg').textContent = '';
  attState.paths = [];
  $('attVerdict').textContent = '';
  document.querySelector('.att-stage').classList.remove('armed');
  // predict first: the grid shows the machine's answer, so it stays shut until they commit
  $('gridBtn').disabled = true;
  $('attGrid').hidden = true;
  $('gridBtn').textContent = 'See the full grid';
  $('gridBtn').setAttribute('aria-expanded', 'false');
  $('attPrompt').innerHTML = '';
  $('attPrompt').appendChild(document.createTextNode('Your turn: tap the word that '));
  $('attPrompt').appendChild(el('strong', '', "'" + p.words[p.it] + "'"));
  $('attPrompt').appendChild(document.createTextNode(' points to.'));
  attGridRender();
}
function attSetEnding(k) {
  attState.ending = k;
  const p = attPreset();
  $('attEndings').querySelectorAll('.btn').forEach((b, i) => b.classList.toggle('btn-primary', i === k));
  attState.chips[p.words.length].textContent = p.endings[k].word;
  if (attState.predicted) attReveal('toggle');
  attGridRender();
}
function attPick(k) {
  const p = attPreset();
  if (attState.predicted || k === p.it) return;
  attState.predicted = true;
  attState.pick = k;
  attState.chips[k].classList.add('pick');
  $('gridBtn').disabled = false;
  document.querySelector('.att-stage').classList.add('armed'); // grow arc headroom before measuring
  attReveal('first');
}
function attGeometry() {
  const stage = document.querySelector('.att-stage');
  const sr = stage.getBoundingClientRect();
  return attState.chips.map((c) => {
    const r = c.getBoundingClientRect();
    return { x: r.left - sr.left + r.width / 2, y: r.top - sr.top };
  });
}
function attReveal(mode) {
  const p = attPreset();
  const e = p.endings[attState.ending];
  const svg = $('attSvg');
  const pts = attGeometry();
  const from = pts[p.it];
  const maxW = Math.max(...e.weights);
  if (!attState.paths.length) {
    for (let j = 0; j < p.words.length; j++) {
      if (j === p.it) { attState.paths.push(null); continue; }
      const path = svgEl('path', { d: attPathD(from, pts[j]) });
      svg.appendChild(path);
      attState.paths.push(path);
    }
  }
  svg.setAttribute('class', 'att-svg' + (mode === 'first' && !reduced() ? ' grow' : ''));
  for (let j = 0; j < p.words.length; j++) {
    const path = attState.paths[j];
    if (!path) continue;
    const wn = e.weights[j] / maxW;
    path.style.strokeWidth = (0.8 + 7 * wn).toFixed(1) + 'px';
    path.style.strokeOpacity = (0.10 + 0.85 * wn).toFixed(2);
    path.setAttribute('class', j === e.answer ? 'top' : '');
  }
  attState.chips.forEach((c, j) => {
    c.classList.toggle('ans', j === e.answer);
    c.classList.toggle('right', attState.pick === j && j === e.answer);
  });
  if (mode === 'redraw') return; // geometry refresh only, keep the words
  const v = $('attVerdict');
  v.innerHTML = '';
  if (mode === 'first') {
    if (attState.pick === e.answer) {
      v.appendChild(el('span', 'yes', 'You read it like the machine does. '));
      v.appendChild(document.createTextNode("'" + p.words[p.it] + "' routes to " + p.words[e.answer] + '.'));
      sndSweep();
    } else {
      v.appendChild(document.createTextNode("Good guess. With '" + e.word + "', the machine routes '" + p.words[p.it] + "' to "));
      v.appendChild(el('strong', '', p.words[e.answer]));
      v.appendChild(document.createTextNode('. Follow the thick line.'));
    }
  } else {
    v.appendChild(document.createTextNode("'" + e.word + "' pulls '" + p.words[p.it] + "' toward "));
    v.appendChild(el('strong', '', p.words[e.answer]));
    v.appendChild(document.createTextNode('. Same sentence, new meaning.'));
  }
  $('attPrompt').textContent = 'Toggle the ending and watch the routing flip.';
}
function attPathD(a, b) {
  const lift = 26 + Math.abs(a.x - b.x) * 0.18;
  const my = Math.min(a.y, b.y) - lift;
  return 'M' + a.x + ' ' + a.y + ' Q' + ((a.x + b.x) / 2) + ' ' + my + ' ' + b.x + ' ' + b.y;
}
function attOnShow() {
  // geometry is only measurable while visible; redraw whatever is revealed
  if (attState.predicted) {
    $('attSvg').textContent = '';
    attState.paths = [];
    attReveal('redraw');
  }
}
function heurRow(words, i) {
  // hand-made stand-in for a learned attention row: nearby words matter,
  // content words matter more, a word rarely fixates on itself
  const row = [];
  for (let j = 0; j < words.length; j++) {
    let v = Math.exp(-Math.abs(i - j) / 1.8) * (words[j].length > 3 ? 1.5 : 0.7);
    if (j === i) v *= 0.6;
    row.push(v);
  }
  const m = Math.max(...row);
  return row.map((v) => v / m);
}
function attHeatRow(i, p, e) {
  if (i === p.it) {
    const r = e.weights.slice();
    const m = Math.max(...r);
    return r.map((v) => v / (m || 1));
  }
  return heurRow(p.words, i);
}
function heatTable(words, rowFn, hotRow) {
  const tbl = document.createElement('table');
  const thead = document.createElement('thead');
  const hr = document.createElement('tr');
  hr.appendChild(document.createElement('th'));
  for (const w of words) { const th = document.createElement('th'); th.textContent = w; hr.appendChild(th); }
  thead.appendChild(hr);
  tbl.appendChild(thead);
  const tb = document.createElement('tbody');
  words.forEach((w, i) => {
    const tr = document.createElement('tr');
    const th = document.createElement('th');
    th.textContent = w;
    if (i === hotRow) th.style.color = '#5BD1C6';
    tr.appendChild(th);
    rowFn(i).forEach((v) => {
      const td = document.createElement('td');
      td.style.background = 'rgba(255,176,32,' + (v * 0.82).toFixed(2) + ')';
      tr.appendChild(td);
    });
    tb.appendChild(tr);
  });
  tbl.appendChild(tb);
  return tbl;
}
function attGridRender() {
  const host = $('attGrid');
  if (host.hidden) return;
  const p = attPreset(), e = p.endings[attState.ending];
  host.textContent = '';
  host.appendChild(heatTable(p.words, (i) => attHeatRow(i, p, e), p.it));
  host.appendChild(el('p', 'cap', "Each row: where that word looks. The '" + p.words[p.it] + "' row is the hand-tuned one; the rest are simplified for teaching."));
}
// stretch goal: free play, a heuristic heatmap for any short sentence
function fpRender() {
  const words = $('fpIn').value.trim().toLowerCase().split(/\s+/).filter(Boolean).slice(0, 12);
  const host = $('fpGrid');
  host.textContent = '';
  if (words.length < 2) return;
  host.appendChild(heatTable(words, (i) => heurRow(words, i), -1));
  host.appendChild(el('p', 'cap', 'A real model learns these weights from data. This grid is a hand-made guess, so you can feel the shape of it.'));
  sndClick();
}
function buildAttention() {
  const host = $('attPresets');
  ATTENTION_PRESETS.forEach((p, i) => {
    const c = el('button', 'chip' + (i === 0 ? ' on' : ''), p.label);
    c.addEventListener('click', () => attLoadPreset(i));
    host.appendChild(c);
  });
  $('gridBtn').addEventListener('click', () => {
    const g = $('attGrid');
    g.hidden = !g.hidden;
    $('gridBtn').textContent = g.hidden ? 'See the full grid' : 'Hide the grid';
    $('gridBtn').setAttribute('aria-expanded', String(!g.hidden));
    attGridRender();
  });
  $('fpGo').addEventListener('click', fpRender);
  $('fpIn').addEventListener('keydown', (e) => { if (e.key === 'Enter') fpRender(); });
  attLoadPreset(0);
  addEventListener('resize', () => { if (!$('mod3').classList.contains('on')) return; attOnShow(); });
}

// ============================================================
// MODULE 05 : LOOP, the agent replay
// ============================================================
let loopAt = 0;
const BADGES = { plan: 'PLAN', act: 'ACT', observe: 'OBSERVE', answer: 'ANSWER' };
function loopRender() {
  const host = $('loopSteps');
  host.textContent = '';
  for (let i = 0; i < loopAt; i++) {
    const st = LOOP_STEPS[i];
    const card = el('div', 'step');
    card.appendChild(el('span', 'badge ' + st.kind, BADGES[st.kind] + ' · STEP ' + (i + 1)));
    if (st.tool) {
      card.appendChild(el('div', 'toolchip', st.tool));
      const r = el('div', 'toolret');
      r.appendChild(document.createTextNode('returns '));
      r.appendChild(el('span', 'rv', '"' + st.ret + '"'));
      card.appendChild(r);
    }
    if (st.text) card.appendChild(el('p', '', st.text));
    if (!reduced() && i === loopAt - 1) card.style.animationDelay = '0.05s';
    host.appendChild(card);
  }
  $('loopClose').hidden = loopAt < LOOP_STEPS.length;
  $('loopNext').disabled = loopAt >= LOOP_STEPS.length;
  $('loopNext').textContent = loopAt >= LOOP_STEPS.length ? 'Diagnosis complete' : 'Next step';
}
function buildLoop() {
  $('loopNext').addEventListener('click', () => { loopAt = Math.min(LOOP_STEPS.length, loopAt + 1); sndClick(); loopRender(); });
  $('loopAgain').addEventListener('click', () => { loopAt = 0; loopRender(); });
  loopRender();
}

// ============================================================
// CHECKPOINTS : one per module, retry until correct
// ============================================================
function buildCheckpoints() {
  document.querySelectorAll('.checkpoint').forEach((box) => {
    const m = parseInt(box.dataset.m, 10);
    const ck = CHECKPOINTS[m];
    box.appendChild(el('div', 'ck-tag', 'CHECKPOINT ' + (m + 1) + ' OF 5'));
    box.appendChild(el('p', 'ck-q', ck.q));
    const opts = el('div', 'ck-opts');
    const fb = el('p', 'ck-fb');
    fb.setAttribute('aria-live', 'polite');
    ck.opts.forEach((label, i) => {
      const b = el('button', 'ck-opt', label);
      b.addEventListener('click', () => {
        if (S.passed[m]) return;
        if (i === ck.correct) {
          b.classList.add('good');
          opts.querySelectorAll('.ck-opt').forEach((x) => { x.disabled = true; x.classList.remove('bad'); });
          fb.className = 'ck-fb ok';
          fb.textContent = 'Exactly: ' + ck.explain;
          passModule(m, box);
        } else {
          b.classList.remove('bad');
          void b.offsetWidth; // restart the shake
          b.classList.add('bad');
          fb.className = 'ck-fb no';
          fb.textContent = 'Not quite: ' + ck.explain + ' Try again.';
        }
      });
      opts.appendChild(b);
    });
    box.appendChild(opts);
    box.appendChild(fb);
  });
}
function passModule(m, box) {
  S.passed[m] = true;
  sweepGauge(m);
  tabBtns[m].classList.add('done');
  const d = el('p', 'ck-done', 'Checkpoint passed. Gauge ' + (m + 1) + ' sweeps to full.');
  box.appendChild(d);
  if (S.passed.every(Boolean)) {
    setTimeout(() => {
      $('licBanner').hidden = false;
      toast('All five gauges full. The engine is yours.');
    }, reduced() ? 100 : 1200);
  }
}

// ============================================================
// LICENSE : the pit pass
// ============================================================
function licenseDate() {
  return new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}
function buildLicense() {
  $('licOpen').addEventListener('click', () => {
    returnFocus = document.activeElement;
    $('licModal').hidden = false;
    $('cardDate').textContent = 'Certified ' + licenseDate();
    const cg = $('cardGauges');
    if (!cg.childElementCount) for (let i = 0; i < 5; i++) cg.appendChild(gaugeSvg(true));
    setTimeout(() => $('licName').focus(), 50);
  });
  let returnFocus = null;
  const close = () => {
    $('licModal').hidden = true;
    if (returnFocus && returnFocus.focus) returnFocus.focus();
  };
  $('licClose').addEventListener('click', close);
  $('licModal').addEventListener('click', (e) => { if (e.target === $('licModal')) close(); });
  addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('licModal').hidden) close(); });
  $('licName').addEventListener('input', () => {
    $('cardName').textContent = $('licName').value.trim().toUpperCase() || 'YOUR NAME';
  });
  $('licPng').addEventListener('click', downloadCard);
  $('licModal').addEventListener('keydown', (e) => { // keep Tab inside the dialog
    if (e.key !== 'Tab') return;
    const f = [$('licClose'), $('licName'), $('licPng')];
    const i = f.indexOf(document.activeElement);
    if (e.shiftKey && i <= 0) { e.preventDefault(); f[f.length - 1].focus(); }
    else if (!e.shiftKey && i === f.length - 1) { e.preventDefault(); f[0].focus(); }
  });
}
// stretch goal: render the pit pass to a canvas and download it
function downloadCard() {
  const W = 900, H = 560;
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d');
  const grad = ctx.createLinearGradient(0, 0, W, H);
  grad.addColorStop(0, '#1C2430'); grad.addColorStop(1, '#12171F');
  ctx.fillStyle = grad; ctx.fillRect(0, 0, W, H);
  const checker = (y0) => {
    for (let x = 0, k = 0; x < W; x += 22, k++) {
      ctx.fillStyle = k % 2 ? '#171D26' : '#EDF2F7';
      ctx.fillRect(x, y0, 22, 13);
      ctx.fillStyle = k % 2 ? '#EDF2F7' : '#171D26';
      ctx.fillRect(x, y0 + 13, 22, 13);
    }
  };
  checker(0); checker(H - 26);
  ctx.strokeStyle = 'rgba(255,176,32,0.6)'; ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, W - 2, H - 2);
  const mono = '500 17px ui-monospace, Menlo, monospace';
  ctx.fillStyle = '#5BD1C6'; ctx.font = mono;
  ctx.fillText('R O B O L A B S   ·   P I T   P A S S   ·   N O .  G E - 2 0 2 6', 40, 78);
  ctx.fillStyle = '#EDF2F7'; ctx.font = '800 44px -apple-system, Segoe UI, Roboto, sans-serif';
  ctx.fillText('THE GLASS ENGINE', 40, 132);
  const nm = $('cardName').textContent;
  let nmSize = 64;
  ctx.font = '800 ' + nmSize + 'px -apple-system, Segoe UI, Roboto, sans-serif';
  while (nmSize > 30 && ctx.measureText(nm).width > 820) {
    nmSize -= 4;
    ctx.font = '800 ' + nmSize + 'px -apple-system, Segoe UI, Roboto, sans-serif';
  }
  ctx.fillStyle = '#FFB020';
  ctx.fillText(nm, 40, 226);
  ctx.fillStyle = '#EDF2F7'; ctx.font = '600 30px -apple-system, Segoe UI, Roboto, sans-serif';
  ctx.fillText('Certified Engine-Opener', 40, 280);
  ctx.fillStyle = '#8B97A8'; ctx.font = mono;
  ctx.fillText('Certified ' + licenseDate(), 40, 336);
  ctx.fillText('Robolabs Summer Academy 2026 · UC Berkeley', 40, 366);
  // five full mini gauges
  for (let i = 0; i < 5; i++) {
    const cx = 74 + i * 110, cy = 470, r = 34;
    ctx.strokeStyle = 'rgba(255,255,255,0.15)'; ctx.lineWidth = 7; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.arc(cx, cy, r, Math.PI * 5 / 6, Math.PI * 13 / 6); ctx.stroke();
    ctx.strokeStyle = '#FFB020';
    ctx.beginPath(); ctx.arc(cx, cy, r, Math.PI * 5 / 6, Math.PI * 13 / 6); ctx.stroke();
    ctx.strokeStyle = '#EDF2F7'; ctx.lineWidth = 4;
    // needle parked at the arc's end, matching the on-screen full gauges
    ctx.beginPath(); ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(Math.PI / 6) * (r - 8), cy + Math.sin(Math.PI / 6) * (r - 8));
    ctx.stroke();
  }
  cv.toBlob((blob) => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'glass-engine-license.png';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 60000); // slow revoke: iOS confirms downloads at its own pace
  });
}

// ============================================================
// EXTRAS : sound (muted by default) and one hidden gear
// ============================================================
let sndOn = false, actx = null;
function beep(freq, dur, vol, when) {
  if (!sndOn) return;
  if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)();
  if (actx.state === 'suspended') actx.resume(); // iOS suspends the context after interruptions
  const t = actx.currentTime + (when || 0);
  const o = actx.createOscillator(), g = actx.createGain();
  o.type = 'triangle'; o.frequency.value = freq;
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(vol, t + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(actx.destination);
  o.start(t); o.stop(t + dur + 0.02);
}
const sndClick = () => beep(1500, 0.045, 0.05);
function sndSweep() { for (let i = 0; i < 6; i++) beep(500 + i * 160, 0.06, 0.06, i * 0.055); }
function buildSound() {
  const b = $('soundBtn');
  b.addEventListener('click', () => {
    sndOn = !sndOn;
    b.classList.toggle('on', sndOn);
    b.setAttribute('aria-pressed', String(sndOn));
    b.setAttribute('aria-label', 'sound, ' + (sndOn ? 'on' : 'off'));
    b.innerHTML = sndOn ? '&#9836;' : '&#215;&#9836;';
    if (sndOn) sndClick();
  });
}
let titleTaps = 0, titleTimer = null;
function buildEgg() {
  $('title').addEventListener('click', () => {
    titleTaps++;
    clearTimeout(titleTimer);
    titleTimer = setTimeout(() => { titleTaps = 0; }, 1600);
    if (titleTaps >= 5) {
      titleTaps = 0;
      gaugeEls.forEach((g, i) => {
        setTimeout(() => {
          if (g.classList.contains('full')) return;
          g.classList.add('rev');
          setTimeout(() => g.classList.remove('rev'), 950);
        }, reduced() ? 0 : i * 90);
      });
      for (let i = 0; i < 10; i++) beep(220 + i * 90, 0.09, 0.05, i * 0.05);
      toast('REDLINE. You found the hidden gear. Certified engine whisperer.', 3400);
    }
  });
}

// ---------- boot ----------
buildGauges();
buildTabs();
buildPredict();
buildTokens();
buildMeaning();
buildAttention();
buildLoop();
buildCheckpoints();
buildLicense();
buildSound();
buildEgg();
