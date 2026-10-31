// Маршруты: граф троп OpenStreetMap, кратчайшие пути, профиль высот по рельефу
// Запуск: node tools/make-routes.mjs <папка с osm-paths.json, osm.json и dem/>
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadDem } from './dem.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const geo = process.argv[2];
const outDir = path.join(here, '..', 'src', 'data');
fs.mkdirSync(outDir, { recursive: true });

const paths = JSON.parse(fs.readFileSync(path.join(geo, 'osm-paths.json'), 'utf8'));
const elevAt = loadDem(geo);
const hav = (a, b) => {
  const r = (d) => (d * Math.PI) / 180;
  const dLa = r(b.lat - a.lat), dLo = r(b.lon - a.lon);
  const h = Math.sin(dLa / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(dLo / 2) ** 2;
  return 6371000 * 2 * Math.asin(Math.sqrt(h));
};

// Граф: вершины по идентификаторам узлов OSM
const nodes = new Map();
const edges = new Map();
const addEdge = (a, b, w) => { if (!edges.has(a)) edges.set(a, []); edges.get(a).push([b, w]); };
const addWay = (way) => {
  if (!way.nodes || !way.geometry) return;
  way.nodes.forEach((id, i) => { if (!nodes.has(id) && way.geometry[i]) nodes.set(id, way.geometry[i]); });
  for (let i = 1; i < way.nodes.length; i++) {
    const a = way.geometry[i - 1], b = way.geometry[i];
    if (!a || !b) continue;
    const w = hav(a, b);
    addEdge(way.nodes[i - 1], way.nodes[i], w);
    addEdge(way.nodes[i], way.nodes[i - 1], w);
  }
};
for (const e of paths.elements) if (e.type === 'way' && e.tags?.highway) addWay(e);

function nearest(lat, lon) {
  let best = null, bd = Infinity;
  for (const [id, p] of nodes) { const d = hav({ lat, lon }, p); if (d < bd && edges.has(id)) { bd = d; best = id; } }
  return [best, bd];
}
function shortest(fromId, toId) {
  const dist = new Map([[fromId, 0]]), prev = new Map(), done = new Set();
  const heap = [[0, fromId]];
  while (heap.length) {
    heap.sort((a, b) => a[0] - b[0]);
    const [d, u] = heap.shift();
    if (done.has(u)) continue;
    done.add(u);
    if (u === toId) break;
    for (const [v, w] of edges.get(u) || []) {
      const nd = d + w;
      if (nd < (dist.get(v) ?? Infinity)) { dist.set(v, nd); prev.set(v, u); heap.push([nd, v]); }
    }
    if (heap.length > 4000) heap.splice(2000);
  }
  if (!prev.has(toId)) return null;
  const line = [];
  for (let c = toId; c !== undefined; c = prev.get(c)) line.unshift(nodes.get(c));
  return line;
}

function resample(line, step = 40) {
  const out = [{ ...line[0], d: 0 }];
  let total = 0, next = step;
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1], b = line[i], seg = hav(a, b);
    while (total + seg >= next) {
      const t = (next - total) / seg;
      out.push({ lat: a.lat + (b.lat - a.lat) * t, lon: a.lon + (b.lon - a.lon) * t, d: next });
      next += step;
    }
    total += seg;
  }
  out.push({ ...line[line.length - 1], d: total });
  return out;
}

function stats(line) {
  const pts = resample(line).map((p) => ({ ...p, e: elevAt(p.lat, p.lon) }));
  // Сглаживание, чтобы шум рельефа не завышал набор высоты
  const smooth = pts.map((p, i) => {
    let s = 0, c = 0;
    for (let k = Math.max(0, i - 3); k <= Math.min(pts.length - 1, i + 3); k++) { s += pts[k].e; c++; }
    return { ...p, e: s / c };
  });
  let up = 0, down = 0;
  for (let i = 1; i < smooth.length; i++) { const de = smooth[i].e - smooth[i - 1].e; if (de > 0) up += de; else down -= de; }
  return { km: smooth[smooth.length - 1].d / 1000, up, down, min: Math.min(...smooth.map((p) => p.e)), max: Math.max(...smooth.map((p) => p.e)), pts: smooth };
}

const P = {
  kordonny: [54.6274, 58.7510],
  tyulyuk: [54.6111, 58.7725],
  larkino: [54.5938, 58.8262],
  iremel: [54.5201, 58.8427],
  poperechnaya: [54.6489, 58.6527],
  evlakta: [54.6746, 58.6826],
  kordonIremel: [54.5611, 58.8258],
};
const ids = Object.fromEntries(Object.entries(P).map(([k, [la, lo]]) => { const [id, d] = nearest(la, lo); console.log(k, 'ближайший узел в', d.toFixed(0), 'м'); return [k, id]; }));

const chain = (...keys) => {
  const line = [];
  for (let i = 1; i < keys.length; i++) {
    const seg = shortest(ids[keys[i - 1]], ids[keys[i]]);
    if (!seg) { console.log('нет пути', keys[i - 1], keys[i]); return null; }
    line.push(...(i > 1 ? seg.slice(1) : seg));
  }
  return line;
};

const routes = {
  iremel: chain('kordonny', 'tyulyuk', 'iremel'),
  iremelFromTyulyuk: chain('tyulyuk', 'iremel'),
  larkino: chain('tyulyuk', 'larkino'),
  larkinoFromHome: chain('kordonny', 'tyulyuk', 'larkino'),
  poperechnaya: [...(chain('kordonny', 'poperechnaya') || []), { lat: P.poperechnaya[0], lon: P.poperechnaya[1] }],
};
const result = {};
for (const [k, line] of Object.entries(routes)) {
  if (!line) continue;
  const s = stats(line);
  console.log(`${k}: ${s.km.toFixed(1)} км, вверх ${s.up.toFixed(0)} м, вниз ${s.down.toFixed(0)} м, высоты ${s.min.toFixed(0)}-${s.max.toFixed(0)}`);
  result[k] = { km: +s.km.toFixed(1), up: Math.round(s.up), down: Math.round(s.down), min: Math.round(s.min), max: Math.round(s.max), pts: s.pts.filter((_, i) => i % 3 === 0 || i === s.pts.length - 1).map((p) => [+p.lat.toFixed(5), +p.lon.toFixed(5), Math.round(p.e), Math.round(p.d)]) };
}
fs.writeFileSync(path.join(outDir, 'routes.json'), JSON.stringify(result));
console.log('сохранено', path.join(outDir, 'routes.json'));
