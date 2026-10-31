// Скачивает лист Copernicus DEM GLO-30 (N54 E058) и вырезает район в Float32
// Запуск: node tools/fetch-copernicus.mjs <папка dem>
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const dem = process.argv[2];
const name = 'Copernicus_DSM_COG_10_N54_00_E058_00_DEM';
const url = `https://copernicus-dem-30m.s3.amazonaws.com/${name}/${name}.tif`;
const file = path.join(dem, `${name}.tif`);
if (!fs.existsSync(file)) {
  const r = await fetch(url, { headers: { 'User-Agent': 'iremel-site-map/1.0' } });
  console.log('скачивание', r.status, r.headers.get('content-length'));
  if (!r.ok) process.exit(1);
  fs.writeFileSync(file, Buffer.from(await r.arrayBuffer()));
}
const b = fs.readFileSync(file);
const le = b.toString('latin1', 0, 2) === 'II';
const u16 = (o) => (le ? b.readUInt16LE(o) : b.readUInt16BE(o));
const u32 = (o) => (le ? b.readUInt32LE(o) : b.readUInt32BE(o));
const magic = u16(2);
console.log('TIFF', le ? 'LE' : 'BE', magic === 43 ? 'BigTIFF' : 'classic');
const f64 = (o) => (le ? b.readDoubleLE(o) : b.readDoubleBE(o));
const u64 = (o) => Number(le ? b.readBigUInt64LE(o) : b.readBigUInt64BE(o));

let ifd = magic === 43 ? u64(8) : u32(4);
const big = magic === 43;
const tags = {};
const count = big ? u64(ifd) : u16(ifd);
const start = ifd + (big ? 8 : 2);
const size = big ? 20 : 12;
const typeSize = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 12: 8, 13: 4, 16: 8, 17: 8 };
for (let i = 0; i < count; i++) {
  const p = start + i * size;
  const tag = u16(p), type = u16(p + 2), n = big ? u64(p + 4) : u32(p + 4);
  const bytes = (typeSize[type] || 1) * n;
  const valOff = bytes <= (big ? 8 : 4) ? p + (big ? 12 : 8) : big ? u64(p + 12) : u32(p + 8);
  const read = (k) => { const o = valOff + k * (typeSize[type] || 1); return type === 3 ? u16(o) : type === 4 || type === 13 ? u32(o) : type === 16 ? u64(o) : type === 12 ? f64(o) : b[o]; };
  tags[tag] = n === 1 ? read(0) : Array.from({ length: Math.min(n, 2e6) }, (_, k) => read(k));
}
const W = tags[256], H = tags[257], comp = tags[259], pred = tags[317] || 1, tw = tags[322], th = tags[323], off = tags[324], cnt = tags[325], bps = tags[258], sf = tags[339];
const scale = tags[33550], tie = tags[33922];
console.log({ W, H, comp, pred, tw, th, bps, sf, scale, tie: tie?.slice(0, 6), tiles: off?.length });
if (comp !== 8 && comp !== 32946) throw new Error('сжатие ' + comp);

const lonMin = tie[3], latMax = tie[4], dLon = scale[0], dLat = scale[1];
const bbox = { n: 54.70, s: 54.47, w: 58.58, e: 58.97 };
const x0 = Math.floor((bbox.w - lonMin) / dLon) - 4, x1 = Math.ceil((bbox.e - lonMin) / dLon) + 4;
const y0 = Math.floor((latMax - bbox.n) / dLat) - 4, y1 = Math.ceil((latMax - bbox.s) / dLat) + 4;
const cw = x1 - x0, ch = y1 - y0;
const out = new Float32Array(cw * ch);
const cols = Math.ceil(W / tw);
for (let ty = Math.floor(y0 / th); ty <= Math.floor((y1 - 1) / th); ty++) for (let tx = Math.floor(x0 / tw); tx <= Math.floor((x1 - 1) / tw); tx++) {
  const idx = ty * cols + tx;
  const raw = zlib.inflateSync(b.subarray(off[idx], off[idx] + cnt[idx]));
  const bytes = new Uint8Array(raw.buffer, raw.byteOffset, raw.length);
  const stride = tw * 4;
  const vals = new Float32Array(tw * th);
  if (pred === 3) {
    const dv = new DataView(new ArrayBuffer(4));
    for (let r = 0; r < th; r++) {
      const row = bytes.subarray(r * stride, (r + 1) * stride);
      for (let i = 1; i < stride; i++) row[i] = (row[i] + row[i - 1]) & 255;
      for (let c = 0; c < tw; c++) {
        dv.setUint8(0, row[c]); dv.setUint8(1, row[tw + c]); dv.setUint8(2, row[2 * tw + c]); dv.setUint8(3, row[3 * tw + c]);
        vals[r * tw + c] = dv.getFloat32(0, false);
      }
    }
  } else {
    const dv = new DataView(raw.buffer, raw.byteOffset, raw.length);
    for (let i = 0; i < vals.length; i++) vals[i] = dv.getFloat32(i * 4, le);
  }
  for (let r = 0; r < th; r++) for (let c = 0; c < tw; c++) {
    const X = tx * tw + c - x0, Y = ty * th + r - y0;
    if (X >= 0 && Y >= 0 && X < cw && Y < ch) out[Y * cw + X] = vals[r * tw + c];
  }
}
fs.writeFileSync(path.join(dem, 'cop.f32'), Buffer.from(out.buffer));
fs.writeFileSync(path.join(dem, 'cop.json'), JSON.stringify({ W: cw, H: ch, lon0: lonMin + (x0 + 0.5) * dLon, lat0: latMax - (y0 + 0.5) * dLat, dLon, dLat }));
let mn = 1e9, mx = -1e9; for (const v of out) { if (v < mn) mn = v; if (v > mx) mx = v; }
console.log('вырезано', cw, ch, 'высоты', mn.toFixed(1), mx.toFixed(1));
const at = (la, lo) => { const X = (lo - (lonMin + (x0 + 0.5) * dLon)) / dLon, Y = (latMax - (y0 + 0.5) * dLat - la) / dLat; const xi = Math.floor(X), yi = Math.floor(Y), fx = X - xi, fy = Y - yi; const v = (a, c) => out[c * cw + a]; return v(xi, yi) * (1 - fx) * (1 - fy) + v(xi + 1, yi) * fx * (1 - fy) + v(xi, yi + 1) * (1 - fx) * fy + v(xi + 1, yi + 1) * fx * fy; };
for (const [n, la, lo] of [['Большой Иремель 1582', 54.5201, 58.8427], ['Малый Иремель 1449', 54.5530, 58.8973], ['Поперечная 1389', 54.6489, 58.6527], ['Кордонный', 54.6274, 58.7510], ['Тюлюк 564', 54.6111, 58.7725], ['Ларкино', 54.5938, 58.8262]]) console.log(n, '->', at(la, lo).toFixed(0));
