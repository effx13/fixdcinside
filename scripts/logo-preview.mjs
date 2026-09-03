/** Renders assets/icon.svg at several sizes into _logo_preview.html for eyeballing. */
import { readFileSync, writeFileSync } from 'node:fs';

const svg = readFileSync('assets/icon.svg', 'utf8')
  .replace(/<\?xml[^>]*\?>/, '')
  .trim();
const at = (size, light) => {
  const sized = svg.replace(/width="\d+" height="\d+"/, `width="${size}" height="${size}"`);
  return `<div class="card${light ? ' light' : ''}">${sized}<div>${size}px</div></div>`;
};

writeFileSync(
  '_logo_preview.html',
  `<!doctype html><meta charset="utf-8"><title>logo preview</title>
<style>
 body{margin:0;background:#16171b;color:#e9e9ee;font:13px system-ui;padding:20px;display:flex;gap:20px;flex-wrap:wrap;align-items:flex-start}
 .card{background:#0f1013;border:1px solid #2a2c33;border-radius:12px;padding:14px;text-align:center}
 .light{background:#fbfbfd;color:#16171b}
 svg{display:block;margin:0 auto 8px}
</style>
${[256, 128, 64].map((s) => at(s, false)).join('\n')}
${[64, 32, 16].map((s) => at(s, true)).join('\n')}`,
);
console.log('wrote _logo_preview.html');
