// Add a content hash to the script and stylesheet links in index.html, so
// browsers fetch the new files right after a deploy instead of a cached copy.
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const hash = f => createHash('sha256').update(readFileSync(f)).digest('hex').slice(0, 10);
let html = readFileSync('index.html', 'utf8');
for (const f of ['dist/app.js', 'style.css']) {
  html = html.replace(new RegExp(`${f.replace('.', '\\.')}(\\?v=[0-9a-f]+)?"`), `${f}?v=${hash(f)}"`);
}
writeFileSync('index.html', html);
