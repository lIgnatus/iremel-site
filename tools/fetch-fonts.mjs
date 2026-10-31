// Забирает шрифты Sofia Sans (лицензия OFL) и пишет @font-face для своего хостинга
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(here, '..', 'public', 'fonts');
fs.mkdirSync(out, { recursive: true });
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';
const url = 'https://fonts.googleapis.com/css2?family=Sofia+Sans:ital,wght@0,300..800;1,300..800&family=Sofia+Sans+Condensed:wght@300..800&family=Sofia+Sans+Extra+Condensed:wght@400..900&display=swap';
const css = await (await fetch(url, { headers: { 'User-Agent': UA } })).text();
const blocks = [...css.matchAll(/\/\* ([\w-]+) \*\/\s*@font-face \{([\s\S]*?)\}/g)];
const faces = [];
for (const [, subset, body] of blocks) {
  if (subset !== 'cyrillic' && subset !== 'latin') continue;
  const family = /font-family: '([^']+)'/.exec(body)[1];
  const style = /font-style: (\w+)/.exec(body)[1];
  const weight = /font-weight: ([\d ]+)/.exec(body)[1];
  const src = /url\((https[^)]+)\)/.exec(body)[1];
  const range = /unicode-range: ([^;]+)/.exec(body)[1];
  const file = `${family.toLowerCase().replace(/ /g, '-')}-${style}-${subset}.woff2`;
  const r = await fetch(src, { headers: { 'User-Agent': UA } });
  fs.writeFileSync(path.join(out, file), Buffer.from(await r.arrayBuffer()));
  console.log(file, (fs.statSync(path.join(out, file)).size / 1024).toFixed(0), 'КБ');
  faces.push(`@font-face{font-family:'${family}';font-style:${style};font-weight:${weight};font-display:swap;src:url(fonts/${file}) format('woff2');unicode-range:${range}}`);
}
fs.writeFileSync(path.join(here, '..', 'src', 'fonts.css'), faces.join('\n') + '\n');
