// Общий доступ к высотам: Copernicus DEM GLO-30, вырезанный fetch-copernicus.mjs
import fs from 'node:fs';
import path from 'node:path';

export function loadDem(geoDir) {
  const meta = JSON.parse(fs.readFileSync(path.join(geoDir, 'dem', 'cop.json'), 'utf8'));
  const buf = fs.readFileSync(path.join(geoDir, 'dem', 'cop.f32'));
  const data = new Float32Array(buf.buffer, buf.byteOffset, buf.length / 4);
  const { W, H, lon0, lat0, dLon, dLat } = meta;
  return (lat, lon) => {
    const X = (lon - lon0) / dLon, Y = (lat0 - lat) / dLat;
    const xi = Math.min(W - 2, Math.max(0, Math.floor(X))), yi = Math.min(H - 2, Math.max(0, Math.floor(Y)));
    const fx = X - xi, fy = Y - yi;
    const v = (a, b) => data[b * W + a];
    return v(xi, yi) * (1 - fx) * (1 - fy) + v(xi + 1, yi) * fx * (1 - fy) + v(xi, yi + 1) * (1 - fx) * fy + v(xi + 1, yi + 1) * fx * fy;
  };
}
