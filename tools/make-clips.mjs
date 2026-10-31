// Нарезка веб-клипов из исходников: бесшовная петля, без звука, 1080p и 720p, постер
// Запуск: node tools/make-clips.mjs [id ...]
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const sources = path.resolve(root, '..', 'Видео Иремель (исходники)');
const out = path.join(root, 'public', 'video');
fs.mkdirSync(out, { recursive: true });

const clips = JSON.parse(fs.readFileSync(path.join(here, 'clips.json'), 'utf8'));
const only = process.argv.slice(2);

function encode(clip, width, height, crf, suffix) {
  const dir = path.join(sources, clip.source);
  const file = path.join(dir, fs.readdirSync(dir).find((n) => /\.(mkv|mp4|webm)$/.test(n)));
  const { start, length: L, fade: X, crop, grade = '', speed = 1 } = clip;
  const srcL = L * speed, srcX = X * speed;
  const steps = [];
  if (speed !== 1) steps.push(`setpts=PTS/${speed}`);
  if (crop) steps.push(`crop=${crop}`);
  steps.push('fps=30', `scale=${width}:${height}:force_original_aspect_ratio=increase:flags=lanczos`, `crop=${width}:${height}`);
  if (grade) steps.push(grade);
  steps.push('format=yuv420p', 'setsar=1', 'settb=1/30');
  const prep = steps.join(',');
  // Хвост плавно переходит в голову, поэтому последний кадр петли совпадает с первым
  const graph = `[0:v]${prep},setpts=PTS-STARTPTS[tail];[1:v]${prep},setpts=PTS-STARTPTS[head];[2:v]${prep},setpts=PTS-STARTPTS[mid];[tail][head]xfade=transition=fade:duration=${X}:offset=0,format=yuv420p[x];[x][mid]concat=n=2:v=1:a=0,format=yuv420p[outv]`;
  const target = path.join(out, `${clip.id}${suffix}.mp4`);
  const r = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y',
    '-ss', String(start + srcL), '-t', String(srcX + 0.25), '-i', file,
    '-ss', String(start), '-t', String(srcX + 0.25), '-i', file,
    '-ss', String(start + srcX), '-t', String(srcL - srcX), '-i', file,
    '-filter_complex', graph, '-map', '[outv]', '-an', '-c:v', 'libx264', '-preset', 'slow', '-crf', String(crf), '-profile:v', 'high', '-movflags', '+faststart', target], { encoding: 'utf8' });
  if (r.status) throw new Error(`${clip.id}: ${r.stderr.slice(0, 1400)}`);
  return fs.statSync(target).size;
}

function poster(clip) {
  const target = path.join(out, `${clip.id}.webp`);
  const src = path.join(out, `${clip.id}.mp4`);
  spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-ss', String(clip.posterAt ?? 1.5), '-i', src, '-frames:v', '1', '-vf', 'scale=1280:-2:flags=lanczos', '-c:v', 'libwebp', '-quality', '66', target]);
  return fs.statSync(target).size;
}

for (const clip of clips) {
  if (only.length && !only.includes(clip.id)) continue;
  const a = encode(clip, 1920, 1080, clip.crf ?? 25, '');
  const b = encode(clip, 1280, 720, (clip.crf ?? 25) + 3, '-720');
  const p = poster(clip);
  console.log(`${clip.id}: 1080p ${(a / 1e6).toFixed(1)} МБ, 720p ${(b / 1e6).toFixed(1)} МБ, постер ${(p / 1e3).toFixed(0)} КБ`);
}
console.log('готово');
