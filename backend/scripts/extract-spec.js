/* Extract text from the spec PDF. Usage: node scripts/extract-spec.js <pdf> <out.txt> */
const fs = require('fs');
const zlib = require('zlib');

const [, , pdfPath, outPath] = process.argv;
const raw = fs.readFileSync(pdfPath).toString('latin1');

const objs = new Map();
const objRe = /(\d+)\s+(\d+)\s+obj\b([\s\S]*?)\bendobj/g;
let m;
while ((m = objRe.exec(raw)) !== null) objs.set(m[1], m[3]);

function stream(body) {
  const i = body.indexOf('stream');
  if (i < 0) return null;
  let s = i + 6;
  if (body[s] === '\r') s++;
  if (body[s] === '\n') s++;
  const e = body.lastIndexOf('endstream');
  if (e < 0) return null;
  let d = Buffer.from(body.slice(s, e), 'latin1');
  if (/\/Filter\s*\/FlateDecode/.test(body.slice(0, i))) {
    try { d = zlib.inflateSync(d); }
    catch (x) { try { d = zlib.inflateRawSync(d.slice(2)); } catch (y) { return null; } }
  }
  return d.toString('latin1');
}

function cmap(txt) {
  const map = new Map();
  let b;
  const bc = /beginbfchar([\s\S]*?)endbfchar/g;
  while ((b = bc.exec(txt)) !== null) {
    const p = /<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g; let x;
    while ((x = p.exec(b[1])) !== null) {
      let o = ''; const h = x[2];
      for (let i = 0; i + 3 < h.length + 1; i += 4) o += String.fromCharCode(parseInt(h.substr(i, 4), 16));
      map.set(parseInt(x[1], 16), o);
    }
  }
  const br = /beginbfrange([\s\S]*?)endbfrange/g;
  while ((b = br.exec(txt)) !== null) {
    const p = /<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g; let x;
    while ((x = p.exec(b[1])) !== null) {
      const lo = parseInt(x[1], 16), hi = parseInt(x[2], 16), base = parseInt(x[3].substr(0, 4), 16);
      for (let c = lo; c <= hi && c - lo < 65536; c++) map.set(c, String.fromCharCode(base + (c - lo)));
    }
  }
  return map;
}

function fontsFor(pageBody) {
  const out = {};
  const rm = pageBody.match(/\/Font\s*<<([\s\S]*?)>>/);
  if (!rm) return out;
  const p = /\/(\w+)\s+(\d+)\s+\d+\s+R/g; let x;
  while ((x = p.exec(rm[1])) !== null) {
    const fo = objs.get(x[2]); if (!fo) continue;
    const tu = fo.match(/\/ToUnicode\s+(\d+)\s+\d+\s+R/);
    if (tu) { const t = objs.get(tu[1]); if (t) { const s = stream(t); if (s) out[x[1]] = cmap(s); } }
    if (!out[x[1]]) out[x[1]] = null;
  }
  return out;
}

function decHex(h, f) {
  let o = '';
  if (f && f.size) for (let i = 0; i + 3 < h.length + 1; i += 4) { const c = f.get(parseInt(h.substr(i, 4), 16)); if (c !== undefined) o += c; }
  else for (let i = 0; i + 1 < h.length + 1; i += 2) o += String.fromCharCode(parseInt(h.substr(i, 2), 16));
  return o;
}
function decLit(s, f) {
  if (f && f.size) { let o = ''; for (let i = 0; i + 1 < s.length + 1; i += 2) { const c = f.get((s.charCodeAt(i) << 8) | s.charCodeAt(i + 1)); if (c !== undefined) o += c; } return o; }
  return s.replace(/\\([nrtbf()\\])/g, (_, c) => ({ n: '\n', r: '\r', t: '\t', b: '\b', f: '\f' }[c] || c));
}

function readContent(txt, fonts) {
  let o = ''; let cur = null;
  const re = /\/(\w+)\s+[\d.]+\s+Tf|<([0-9A-Fa-f\s]+)>\s*Tj|\[((?:[^\][]|\\.)*)\]\s*TJ|(T\*|\bTd\b|\bTD\b|\bET\b)/g;
  let t;
  while ((t = re.exec(txt)) !== null) {
    if (t[1]) cur = fonts[t[1]] || null;
    else if (t[2] !== undefined) o += decHex(t[2].replace(/\s+/g, ''), cur);
    else if (t[3] !== undefined) {
      const ir = /\(((?:\\.|[^\\)])*)\)|<([0-9A-Fa-f\s]+)>/g; let it;
      while ((it = ir.exec(t[3])) !== null) {
        if (it[2] !== undefined) o += decHex(it[2].replace(/\s+/g, ''), cur);
        else o += decLit(it[1], cur);
      }
    } else if (t[4]) o += '\n';
  }
  return o;
}

const pages = [];
const pr = /(\d+)\s+\d+\s+obj\s*<<([\s\S]*?)>>\s*endobj/g;
while ((m = pr.exec(raw)) !== null) pages.push({ n: +m[1], b: m[2] });

const order = [];
const kr = /\/Kids\s*\[([\s\S]*?)\]/g;
let km;
while ((km = kr.exec(raw)) !== null) {
  const ns = km[1].match(/(\d+)\s+\d+\s+R/g) || [];
  for (const n of ns) order.push(+n.match(/\d+/)[0]);
}
const byN = new Map(pages.map(p => [p.n, p]));
const seq = []; const seen = new Set();
for (const n of order) if (byN.has(n) && !seen.has(n)) { seq.push(byN.get(n)); seen.add(n); }
for (const p of pages) if (!seen.has(p.n)) seq.push(p);

let res = '';
seq.forEach((p, i) => {
  const f = fontsFor(p.b);
  const c = p.b.match(/\/Contents\s+(\d+)\s+\d+\s+R/);
  let txt = '';
  if (c) { const co = objs.get(c[1]); if (co) { const s = stream(co); if (s) txt = readContent(s, f); } }
  res += '\n===== PAGE ' + (i + 1) + ' =====\n' + txt.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
});

fs.writeFileSync(outPath, res, 'utf8');
console.log('OK pages=' + seq.length + ' chars=' + res.length);
