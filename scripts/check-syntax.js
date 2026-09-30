const fs = require('fs');
const path = require('path');
const vm = require('vm');
const cheerio = require('cheerio');
const root = path.resolve(__dirname, '..');
let scripts = 0, inline = 0;
function walk(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (['node_modules', '.git'].includes(entry.name)) continue;
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) { walk(file); continue; }
    if (entry.name.endsWith('.js')) { new vm.Script(fs.readFileSync(file, 'utf8'), { filename: file }); scripts++; }
    if (entry.name.endsWith('.html')) {
      const doc = cheerio.load(fs.readFileSync(file, 'utf8'));
      doc('script:not([src])').each((index, node) => {
        if (doc(node).attr('type') && !['text/javascript', 'application/javascript'].includes(doc(node).attr('type'))) return;
        new vm.Script(doc(node).html() || '', { filename: `${file}:inline:${index}` }); inline++;
      });
      doc('script[src], link[href]').each((index, node) => {
        const url = doc(node).attr('src') || doc(node).attr('href');
        if (!url.startsWith('/') || url.startsWith('//')) return;
        if (!fs.existsSync(path.join(root, 'public', url.split('?')[0]))) throw new Error('Missing asset: ' + url + ' in ' + file);
      });
    }
  }
}
walk(root);
console.log(`Syntax and asset checks passed: ${scripts} JavaScript files, ${inline} inline scripts.`);
