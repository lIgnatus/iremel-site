// Данные 3D-карты и силуэты хребтов из открытого рельефа (AWS Terrain Tiles) и OpenStreetMap
// Запуск: node tools/make-terrain.mjs <папка с osm-paths.json и dem/>
// Результат: public/terrain/height.bin, relief.webp, relief-1024.webp, src/data/terrain.json, src/data/skylines.json
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { loadDem } from './dem.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');
const geo = process.argv[2];
const outPublic = path.join(root, 'public', 'terrain');
const outData = path.join(root, 'src', 'data');
fs.mkdirSync(outPublic, { recursive: true });
fs.mkdirSync(outData, { recursive: true });

const elev = loadDem(geo);

const bbox = { n: 54.70, s: 54.47, w: 58.58, e: 58.97 };
const lat0 = (bbox.n + bbox.s) / 2, lon0 = (bbox.w + bbox.e) / 2;
const mPerLat = 111200, mPerLon = 111320 * Math.cos((lat0 * Math.PI) / 180);
const widthM = (bbox.e - bbox.w) * mPerLon, heightM = (bbox.n - bbox.s) * mPerLat;

// Сетка высот для геометрии
const G = 640;
const grid = new Float32Array(G * G);
for (let j = 0; j < G; j++) for (let i = 0; i < G; i++) {
  grid[j * G + i] = elev(bbox.n - (j / (G - 1)) * (bbox.n - bbox.s), bbox.w + (i / (G - 1)) * (bbox.e - bbox.w));
}
let hMin = Infinity, hMax = -Infinity;
for (const v of grid) { if (v < hMin) hMin = v; if (v > hMax) hMax = v; }
const u16 = new Uint16Array(G * G);
for (let k = 0; k < grid.length; k++) u16[k] = Math.round(((grid[k] - hMin) / (hMax - hMin)) * 65535);
fs.writeFileSync(path.join(outPublic, 'height.bin'), Buffer.from(u16.buffer));
fs.writeFileSync(path.join(outData, 'terrain.json'), JSON.stringify({ grid: G, hMin: +hMin.toFixed(1), hMax: +hMax.toFixed(1), widthM: Math.round(widthM), heightM: Math.round(heightM), bbox, lat0, lon0, mPerLat, mPerLon }));
console.log('сетка', G, 'высоты', hMin.toFixed(0), hMax.toFixed(0), 'размер', (widthM / 1000).toFixed(1), (heightM / 1000).toFixed(1), 'км');

// Растровая подложка: пояса высот и отмывка
const T = 2048;
const hash = (x, y) => { let h = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return h - Math.floor(h); };
const vnoise = (x, y) => {
  const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi;
  const s = (t) => t * t * (3 - 2 * t);
  const a = hash(xi, yi), b = hash(xi + 1, yi), c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1);
  return (a * (1 - s(fx)) + b * s(fx)) * (1 - s(fy)) + (c * (1 - s(fx)) + d * s(fx)) * s(fy);
};
const fbm = (x, y) => vnoise(x, y) * 0.55 + vnoise(x * 2.3, y * 2.3) * 0.28 + vnoise(x * 5.1, y * 5.1) * 0.17;
const hex = (s) => [parseInt(s.slice(1, 3), 16), parseInt(s.slice(3, 5), 16), parseInt(s.slice(5, 7), 16)];
const stops = [[420, hex('#1b2c27')], [640, hex('#20352c')], [900, hex('#263f31')], [1090, hex('#35523a')], [1190, hex('#6a7244')], [1290, hex('#94834c')], [1420, hex('#a3946c')], [1600, hex('#c4bdb0')]];
const beltColor = (e) => {
  if (e <= stops[0][0]) return stops[0][1];
  for (let i = 1; i < stops.length; i++) if (e <= stops[i][0]) {
    const t = (e - stops[i - 1][0]) / (stops[i][0] - stops[i - 1][0]);
    return stops[i - 1][1].map((c, k) => c + (stops[i][1][k] - c) * t);
  }
  return stops[stops.length - 1][1];
};
const hTex = new Float32Array(T * T);
for (let j = 0; j < T; j++) for (let i = 0; i < T; i++) hTex[j * T + i] = elev(bbox.n - (j / (T - 1)) * (bbox.n - bbox.s), bbox.w + (i / (T - 1)) * (bbox.e - bbox.w));

// Лёгкое размытие для рассеянной тени в долинах
function boxBlur(src, S, r) {
  const a = new Float32Array(src.length), b = new Float32Array(src.length);
  for (let y = 0; y < S; y++) { let s = 0; for (let x = -r; x <= r; x++) s += src[y * S + Math.min(S - 1, Math.max(0, x))]; for (let x = 0; x < S; x++) { a[y * S + x] = s / (2 * r + 1); s += src[y * S + Math.min(S - 1, x + r + 1)] - src[y * S + Math.max(0, x - r)]; } }
  for (let x = 0; x < S; x++) { let s = 0; for (let y = -r; y <= r; y++) s += a[Math.min(S - 1, Math.max(0, y)) * S + x]; for (let y = 0; y < S; y++) { b[y * S + x] = s / (2 * r + 1); s += a[Math.min(S - 1, y + r + 1) * S + x] - a[Math.max(0, y - r) * S + x]; } }
  return b;
}
const hBlur = boxBlur(hTex, T, 26);

const cell = (widthM + heightM) / 2 / T;
const az = (315 * Math.PI) / 180, alt = (38 * Math.PI) / 180;
const lx = Math.sin(az) * Math.cos(alt), ly = Math.cos(az) * Math.cos(alt), lz = Math.sin(alt);
const rgb = Buffer.alloc(T * T * 3);
for (let j = 0; j < T; j++) for (let i = 0; i < T; i++) {
  const k = j * T + i;
  const l = hTex[j * T + Math.max(0, i - 1)], r = hTex[j * T + Math.min(T - 1, i + 1)];
  const u = hTex[Math.max(0, j - 1) * T + i], d = hTex[Math.min(T - 1, j + 1) * T + i];
  const dx = (r - l) / (2 * cell), dy = (u - d) / (2 * cell);
  const nl = Math.hypot(dx, dy, 1);
  const lambert = Math.max(0, (-dx * lx - dy * ly + lz) / nl);
  const slope = Math.atan(Math.hypot(dx, dy)) * (180 / Math.PI);
  const e = hTex[k] + (fbm(i * 0.012, j * 0.012) - 0.5) * 90;
  let c = beltColor(e).slice();
  // Камни на крутых склонах выше леса
  const rock = Math.max(0, Math.min(1, (e - 1120) / 120)) * Math.max(0, Math.min(1, (slope - 11) / 12));
  c = c.map((v, ch) => v + ([150, 142, 126][ch] - v) * rock);
  // Лесная фактура ниже границы леса
  const forest = Math.max(0, Math.min(1, (1180 - e) / 150));
  const tex = (fbm(i * 0.21, j * 0.21) - 0.5) * 26 * forest;
  c = c.map((v) => v + tex);
  const occl = Math.max(-1, Math.min(1, (hTex[k] - hBlur[k]) / 70));
  const light = 0.42 + 1.02 * lambert + 0.22 * occl;
  const shade = Math.max(0, 0.72 - lambert) * 22; // тени уводим в синеву
  rgb[k * 3] = Math.max(0, Math.min(255, c[0] * light - shade * 0.5));
  rgb[k * 3 + 1] = Math.max(0, Math.min(255, c[1] * light - shade * 0.15));
  rgb[k * 3 + 2] = Math.max(0, Math.min(255, c[2] * light + shade * 0.45));
}

// Реки из OpenStreetMap
const paths = JSON.parse(fs.readFileSync(path.join(geo, 'osm-paths.json'), 'utf8'));
const river = hex('#8fc0c4');
const px = (lat, lon) => [((lon - bbox.w) / (bbox.e - bbox.w)) * (T - 1), ((bbox.n - lat) / (bbox.n - bbox.s)) * (T - 1)];
const dot = (x, y, a) => {
  const xi = Math.round(x), yi = Math.round(y);
  if (xi < 0 || yi < 0 || xi >= T || yi >= T) return;
  const k = (yi * T + xi) * 3;
  for (let ch = 0; ch < 3; ch++) rgb[k + ch] = rgb[k + ch] + (river[ch] - rgb[k + ch]) * a;
};
for (const w of paths.elements) {
  if (w.type !== 'way' || !w.tags?.waterway || !w.geometry) continue;
  const strong = w.tags.waterway === 'river';
  for (let i = 1; i < w.geometry.length; i++) {
    const [ax, ay] = px(w.geometry[i - 1].lat, w.geometry[i - 1].lon), [bx, by] = px(w.geometry[i].lat, w.geometry[i].lon);
    const steps = Math.ceil(Math.hypot(bx - ax, by - ay) * 1.5);
    for (let s = 0; s <= steps; s++) {
      const t = s / Math.max(1, steps), x = ax + (bx - ax) * t, y = ay + (by - ay) * t;
      dot(x, y, strong ? 0.8 : 0.32);
      if (strong) { dot(x + 1, y, 0.35); dot(x, y + 1, 0.35); }
    }
  }
}

const tmp = path.join(os.tmpdir(), `relief-${process.pid}.ppm`);
fs.writeFileSync(tmp, Buffer.concat([Buffer.from(`P6\n${T} ${T}\n255\n`), rgb]));
for (const [size, name, q] of [[2048, 'relief.webp', 80], [1024, 'relief-1024.webp', 76]]) {
  const r = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', tmp, '-vf', `scale=${size}:${size}:flags=lanczos`, '-c:v', 'libwebp', '-quality', String(q), path.join(outPublic, name)], { encoding: 'utf8' });
  if (r.status) console.log(r.stderr);
  else console.log(name, (fs.statSync(path.join(outPublic, name)).size / 1e6).toFixed(2), 'МБ');
}
fs.unlinkSync(tmp);

// Силуэты хребтов: для каждого азимута наибольший угол подъёма в трёх поясах дальности
function skyline(lat, lon, up, a0, a1, bands) {
  const h0 = elev(lat, lon) + up;
  const res = bands.map(() => []);
  const step = (a1 - a0) / 480;
  for (let a = a0; a <= a1; a += step) {
    const rad = (a * Math.PI) / 180;
    const best = bands.map(() => -90);
    for (let r = 300; r < 42000; r += 40 + r * 0.004) {
      const la = lat + (Math.cos(rad) * r) / mPerLat, lo = lon + (Math.sin(rad) * r) / mPerLon;
      if (la > bbox.n || la < bbox.s || lo > bbox.e || lo < bbox.w) break;
      const h = elev(la, lo) - (r * r) / (2 * 6371000) * 0.87;
      const ang = (Math.atan2(h - h0, r) * 180) / Math.PI;
      bands.forEach(([b0, b1], i) => { if (r >= b0 && r < b1 && ang > best[i]) best[i] = ang; });
    }
    best.forEach((v, i) => res[i].push(v));
  }
  return res;
}
const views = {
  eastFromPoperechnaya: skyline(54.6489, 58.6527, 4, 104, 164, [[300, 4000], [4000, 11000], [11000, 42000]]),
  southFromMatreshka: skyline(54.6246, 58.8561, 4, 150, 232, [[300, 3500], [3500, 8000], [8000, 42000]]),
  westFromIremel: skyline(54.5201, 58.8427, 3, 262, 348, [[300, 5000], [5000, 13000], [13000, 42000]]),
  northFromIremel: skyline(54.5201, 58.8427, 3, 340, 410, [[300, 5000], [5000, 13000], [13000, 42000]]),
};
const round = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, v.map((b) => b.map((x) => +x.toFixed(3)))]));
fs.writeFileSync(path.join(outData, 'skylines.json'), JSON.stringify(round(views)));
for (const [k, v] of Object.entries(views)) console.log(k, v.map((b) => `${Math.min(...b).toFixed(2)}..${Math.max(...b).toFixed(2)}`).join(' | '));
