// Turns the Vite artifact build into one self-contained HTML page for claude.ai.
import fs from 'node:fs';
import path from 'node:path';

const dir = 'dist-artifact';
const html = fs.readFileSync(path.join(dir, 'index.html'), 'utf8');
const read = (href) => fs.readFileSync(path.join(dir, href.replace(/^\//, '')), 'utf8');
const css = [...html.matchAll(/<link rel="stylesheet"[^>]*href="([^"]+)"/g)].map((m) => read(m[1])).join('\n');
const js = [...html.matchAll(/<script type="module"[^>]*src="([^"]+)"/g)].map((m) => read(m[1])).join('\n');

const page = `<title>ChoreQuest</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Baloo+2:wght@600;700;800&family=Nunito:wght@400;600;700;800&display=swap">
<style>${css}</style>
<div id="root"></div>
<script type="module">${js.replace(/<\/script/gi, '<\\/script')}</script>
`;
fs.writeFileSync(path.join(dir, 'chorequest.html'), page);
console.log(`dist-artifact/chorequest.html  ${(page.length / 1024).toFixed(0)} KB`);
