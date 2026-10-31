// Сборка: данные + шаблон = dist/index.html, рядом статика из public и src
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderPage } from '../src/page.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');
const src = path.join(root, 'src');
const dist = path.join(root, 'dist');
const read = (f) => JSON.parse(fs.readFileSync(path.join(src, 'data', f), 'utf8'));

const data = {
  ...read('site.json'),
  routes: read('routes.json'),
  terrain: read('terrain.json'),
  skylines: read('skylines.json'),
  photos: read('photos.json'),
  videoSources: read('video-sources.json'),
  mapPlaces: read('map-places.json'),
};

fs.rmSync(dist, { recursive: true, force: true });
fs.mkdirSync(dist, { recursive: true });
fs.cpSync(path.join(root, 'public'), dist, { recursive: true });
fs.writeFileSync(path.join(dist, 'index.html'), renderPage(data));
fs.writeFileSync(path.join(dist, 'styles.css'), fs.readFileSync(path.join(src, 'fonts.css'), 'utf8') + fs.readFileSync(path.join(src, 'styles.css'), 'utf8'));
for (const f of ['main.js', 'map3d.js']) fs.copyFileSync(path.join(src, f), path.join(dist, f));

// Старые адреса ведут на новые разделы
const redirect = (dir, hash) => {
  fs.mkdirSync(path.join(dist, dir), { recursive: true });
  fs.writeFileSync(path.join(dist, dir, 'index.html'), `<!doctype html><html lang="ru"><meta charset="utf-8"><meta name="robots" content="noindex"><title>Иремель</title><meta http-equiv="refresh" content="0;url=../#${hash}"><a href="../#${hash}">Перейти на сайт</a></html>\n`);
};
redirect('nomera', 'nomera');
redirect('jekskursii', 'jekskursii');
redirect('3d-tur', 'tur');
redirect('novosti', 'top');
redirect('albums', 'nomera');
fs.writeFileSync(path.join(dist, '404.html'), `<!doctype html><html lang="ru"><meta charset="utf-8"><title>Страница не найдена</title><meta http-equiv="refresh" content="3;url=./"><body style="font-family:system-ui;background:#0b1d1a;color:#efebdd;padding:2rem"><p>Такой страницы нет. Сейчас вернёмся на главную.</p><p><a style="color:#d9a441" href="./">На главную</a></p></body></html>\n`);
fs.writeFileSync(path.join(dist, '.nojekyll'), '');

let size = 0;
const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else size += fs.statSync(p).size; } };
walk(dist);
console.log('собрано', (fs.statSync(path.join(dist, 'index.html')).size / 1024).toFixed(0), 'КБ html, всего', (size / 1e6).toFixed(0), 'МБ');
