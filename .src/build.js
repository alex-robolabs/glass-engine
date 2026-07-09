// assembles glass-engine.html from the source parts and data files
const fs = require('fs');
const path = require('path');
const d = (f) => path.join(__dirname, f);
const read = (f) => fs.readFileSync(d(f), 'utf8');

const head = read('01-head.html');
const body = read('02-body.html');
let js = read('03-app.js');

const corpus = JSON.parse(read('corpus.json'));
const wordmap = JSON.parse(read('wordmap.json'));
const tokvocab = JSON.parse(read('tokvocab.json'));

const splice = (src, marker, value) => {
  const re = new RegExp('/\\*@DATA:' + marker + '\\*/(\\[\\]|\\{[^;]*\\})');
  if (!re.test(src)) throw new Error('marker not found: ' + marker);
  return src.replace(re, () => JSON.stringify(value));
};
js = splice(js, 'corpus', corpus);
js = splice(js, 'wordmap', wordmap);
js = splice(js, 'tokvocab', tokvocab);

const out = head + body + '<script>\n' + js + '\n</script>\n</body>\n</html>\n';

// hard checks before writing
if (out.includes('—')) throw new Error('em dash found in output');
if (out.includes('–')) throw new Error('en dash found in output');
if (out.includes('@DATA:')) throw new Error('unspliced data marker remains');

const target = path.join(__dirname, '..', 'glass-engine.html');
fs.writeFileSync(target, out);
const kb = (fs.statSync(target).size / 1024).toFixed(1);
console.log('built glass-engine.html: ' + kb + ' KB');
if (fs.statSync(target).size > 400 * 1024) throw new Error('file exceeds 400 KB');
