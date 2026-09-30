const fs = require('fs');
const path = require('path');
const cheerio = require('cheerio');
const acorn = require('acorn');
const postcss = require('postcss');
const root = path.resolve(__dirname, '../public');
function stripBanner(value) { return value.replace(/^\s*\/\*\s*=+\s*INLINED FROM[^]*?\*\/\s*/, '').replace(/\r/g, '').trim(); }
function scriptFunctions(source) {
  const ast = acorn.parse(source, { ecmaVersion: 'latest' });
  const body = ast.body.find(node => node.type === 'VariableDeclaration' && node.declarations[0].id.name === 'AF').declarations[0].init.callee.body.body;
  return body.filter(node => node.type === 'FunctionDeclaration');
}
const calendarPath = path.join(root, 'academy/calendar.html');
const calendar = cheerio.load(fs.readFileSync(calendarPath, 'utf8'));
const script = calendar('script').toArray().find(node => (calendar(node).html() || '').includes('INLINED FROM /js/academy.js'));
if (script) {
  const variant = stripBanner(calendar(script).html());
  const canonicalPath = path.join(root, 'js/academy.js');
  let canonical = fs.readFileSync(canonicalPath, 'utf8');
  if (!canonical.includes('function calendarTodayKey')) {
    const current = scriptFunctions(canonical).find(node => node.id.name === 'renderCalendar');
    const replacements = scriptFunctions(variant).filter(node => node.id.name === 'renderCalendar' || node.id.name.startsWith('calendar'));
    canonical = canonical.slice(0, current.start) + replacements.map(node => variant.slice(node.start, node.end)).join('\n\n') + canonical.slice(current.end);
    fs.writeFileSync(canonicalPath, canonical);
  }
  const dashboard = cheerio.load(fs.readFileSync(path.join(root, 'academy/dashboard.html'), 'utf8'));
  const styleFor = (doc) => stripBanner(doc('style').toArray().map(node => doc(node).html()).find(value => value.includes('INLINED FROM /css/academy.css')));
  const calendarCss = styleFor(calendar), baseCss = styleFor(dashboard);
  const normalized = node => node.toString().replace(/\s+/g, ' ').trim();
  const baseNodes = new Set(postcss.parse(baseCss).nodes.map(normalized));
  const extras = postcss.parse(calendarCss).nodes.filter(node => node.type !== 'comment' && !baseNodes.has(normalized(node)));
  fs.writeFileSync(path.join(root, 'css/academy-calendar.css'), extras.map(node => node.toString()).join('\n') + '\n');
}
let count = 0;
function walk(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) { walk(file); continue; }
    if (!entry.name.endsWith('.html')) continue;
    const source = fs.readFileSync(file, 'utf8');
    if (!source.includes('INLINED FROM')) continue;
    const doc = cheerio.load(source);
    doc('script:not([src]), style').each((index, node) => {
      const value = doc(node).html() || '';
      const match = value.match(/^\s*\/\*\s*=+\s*INLINED FROM (\/(?:js|css)\/[a-z0-9._-]+)\s*=+\s*\*\//i);
      if (!match) return;
      if (!fs.existsSync(path.join(root, match[1].slice(1)))) throw new Error('Missing shared asset: ' + match[1]);
      doc(node).replaceWith(node.tagName === 'script' ? `<script src="${match[1]}"></script>` : `<link rel="stylesheet" href="${match[1]}">`);
      count++;
    });
    if (file === calendarPath && !doc('link[href="/css/academy-calendar.css"]').length) doc('head').append('<link rel="stylesheet" href="/css/academy-calendar.css">');
    fs.writeFileSync(file, doc.html());
  }
}
walk(root);
console.log(`Externalized ${count} embedded assets; calendar behavior preserved in shared code.`);
