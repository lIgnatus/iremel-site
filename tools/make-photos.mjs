// Готовит фото для сайта: WebP двух размеров из исходников комплекса
// Запуск: node tools/make-photos.mjs <папка с исходными фото>
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const src = process.argv[2];
const out = path.join(here, '..', 'public', 'img');
fs.mkdirSync(out, { recursive: true });
const list = JSON.parse(fs.readFileSync(path.join(here, 'photos.json'), 'utf8'));
let total = 0, missing = 0;
const meta = {};
for (const p of list) {
  const file = path.join(src, p.from);
  if (!fs.existsSync(file)) { console.log('нет файла', p.id, p.from); missing++; continue; }
  const probe = spawnSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', file], { encoding: 'utf8' }).stdout.trim().split(',').map(Number);
  const [w, h] = probe;
  for (const [suffix, width] of [['-480', 480], ['-1000', 1000]]) {
    const target = path.join(out, `${p.id}${suffix}.webp`);
    const scale = Math.min(width, w);
    const r = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', file, '-vf', `scale=${scale}:-2:flags=lanczos`, '-c:v', 'libwebp', '-quality', '72', target], { encoding: 'utf8' });
    if (r.status) console.log(p.id, r.stderr.slice(-200));
    else total += fs.statSync(target).size;
  }
  meta[p.id] = { w, h, alt: p.alt };
}
fs.writeFileSync(path.join(here, '..', 'src', 'data', 'photos.json'), JSON.stringify(meta, null, 0));
console.log('фото', Object.keys(meta).length, 'нет', missing, 'объём', (total / 1e6).toFixed(1), 'МБ');
