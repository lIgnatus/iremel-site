// Трёхмерная модель района на чистом WebGL2: рельеф, тропы, подписи, пролёт вдоль маршрута

const EXAG = 1.5;
const K = 0.001 * EXAG;
const BASE = -0.9;
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

const VS_TERRAIN = `#version 300 es
layout(location=0) in vec3 aPos;
layout(location=1) in vec2 aUv;
uniform mat4 uVP; uniform vec3 uCam;
out vec2 vUv; out float vY; out float vD;
void main(){ vUv=aUv; vY=aPos.y; vD=distance(aPos,uCam); gl_Position=uVP*vec4(aPos,1.); }`;

const FS_TERRAIN = `#version 300 es
precision highp float;
in vec2 vUv; in float vY; in float vD;
uniform sampler2D uTex; uniform float uHMin; uniform float uK; uniform vec3 uHaze;
out vec4 o;
float contour(float h,float s){ float f=h/s; float w=fwidth(f); float d=abs(fract(f-.5)-.5); return 1.-smoothstep(0.,1.3*w,d); }
void main(){
  vec3 c=texture(uTex,vUv).rgb;
  float h=vY/uK+uHMin;
  float fade=1.-smoothstep(12.,40.,vD);
  c=mix(c,vec3(.98,.93,.82),contour(h,100.)*.14*fade+contour(h,500.)*.26);
  c=mix(c,uHaze,smoothstep(18.,70.,vD)*.4);
  o=vec4(c,1.);
}`;

const VS_SKIRT = `#version 300 es
layout(location=0) in vec3 aPos;
uniform mat4 uVP;
out float vY;
void main(){ vY=aPos.y; gl_Position=uVP*vec4(aPos,1.); }`;

const FS_SKIRT = `#version 300 es
precision highp float;
in float vY; out vec4 o;
void main(){ float s=fract(vY*7.); vec3 c=mix(vec3(.075,.13,.125),vec3(.13,.2,.18),smoothstep(-.9,1.2,vY)); c*=.92+.08*step(.5,s); o=vec4(c,1.); }`;

const VS_LINE = `#version 300 es
layout(location=0) in vec3 aPos;
layout(location=1) in vec3 aPrev;
layout(location=2) in vec3 aNext;
layout(location=3) in float aSide;
layout(location=4) in float aT;
uniform mat4 uVP; uniform vec2 uRes; uniform float uW;
out float vT;
void main(){
  vec4 c=uVP*vec4(aPos,1.); vec4 p=uVP*vec4(aPrev,1.); vec4 n=uVP*vec4(aNext,1.);
  vec2 sp=p.xy/p.w*uRes; vec2 sn=n.xy/n.w*uRes;
  vec2 d=sn-sp; float l=length(d); d=l>1e-4?d/l:vec2(1.,0.);
  vec2 nrm=vec2(-d.y,d.x);
  c.xy+=nrm*aSide*uW/uRes*c.w;
  c.z-=.0007*c.w;
  vT=aT; gl_Position=c;
}`;

const FS_LINE = `#version 300 es
precision highp float;
in float vT; uniform float uProg; uniform vec4 uColor; out vec4 o;
void main(){ if(vT>uProg) discard; o=uColor; }`;

function program(gl, vs, fs) {
  const make = (type, src) => {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  };
  const p = gl.createProgram();
  gl.attachShader(p, make(gl.VERTEX_SHADER, vs));
  gl.attachShader(p, make(gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
  const uniforms = new Proxy({}, { get: (t, n) => (t[n] ??= gl.getUniformLocation(p, n)) });
  return { p, u: uniforms };
}

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const norm = (a) => { const l = Math.hypot(...a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

function lookAt(e, t, up) {
  const z = norm(sub(e, t)), x = norm(cross(up, z)), y = cross(z, x);
  return new Float32Array([x[0], y[0], z[0], 0, x[1], y[1], z[1], 0, x[2], y[2], z[2], 0, -dot(x, e), -dot(y, e), -dot(z, e), 1]);
}
function perspective(fovy, aspect, near, far) {
  const f = 1 / Math.tan(fovy / 2), nf = 1 / (near - far);
  return new Float32Array([f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) * nf, -1, 0, 0, 2 * far * near * nf, 0]);
}
function mul(a, b) {
  const o = new Float32Array(16);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
    o[c * 4 + r] = a[r] * b[c * 4] + a[r + 4] * b[c * 4 + 1] + a[r + 8] * b[c * 4 + 2] + a[r + 12] * b[c * 4 + 3];
  }
  return o;
}

export async function initMap({ stage, canvas, labels, data, read, buttons }) {
  const gl = canvas.getContext('webgl2', { antialias: true, alpha: true, powerPreference: 'high-performance' });
  const smallScreen = innerWidth < 900;
  if (!gl) {
    const flat = new Image();
    flat.src = 'terrain/relief-1024.webp';
    flat.alt = 'Карта рельефа района';
    flat.className = 'map__flat';
    canvas.replaceWith(flat);
    buttons.forEach((b) => { b.disabled = true; });
    read.textContent = 'Браузер не поддерживает 3D, показываем карту рельефа.';
    return null;
  }

  const T = data.terrain;
  const [heightBuf, bitmap] = await Promise.all([
    fetch('terrain/height.bin').then((r) => r.arrayBuffer()),
    fetch(smallScreen ? 'terrain/relief-1024.webp' : 'terrain/relief.webp').then((r) => r.blob()).then((b) => createImageBitmap(b)),
  ]);
  const raw = new Uint16Array(heightBuf);
  const G = T.grid;
  const W = T.widthM / 1000, D = T.heightM / 1000;
  const heightM = (i, j) => T.hMin + (raw[j * G + i] / 65535) * (T.hMax - T.hMin);

  const toWorldXZ = (lat, lon) => [((lon - T.lon0) * T.mPerLon) / 1000, ((T.lat0 - lat) * T.mPerLat) / 1000];
  const groundM = (x, z) => {
    const fx = Math.min(G - 1.001, Math.max(0, ((x + W / 2) / W) * (G - 1)));
    const fz = Math.min(G - 1.001, Math.max(0, ((z + D / 2) / D) * (G - 1)));
    const i = Math.floor(fx), j = Math.floor(fz), a = fx - i, b = fz - j;
    return heightM(i, j) * (1 - a) * (1 - b) + heightM(i + 1, j) * a * (1 - b) + heightM(i, j + 1) * (1 - a) * b + heightM(i + 1, j + 1) * a * b;
  };
  const worldY = (m) => (m - T.hMin) * K;

  // Сетка рельефа
  const step = smallScreen ? 2 : 1;
  const N = Math.floor((G - 1) / step) + 1;
  const pos = new Float32Array(N * N * 3), uv = new Float32Array(N * N * 2);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const gi = i * step, gj = j * step, k = j * N + i;
    pos[k * 3] = -W / 2 + (gi / (G - 1)) * W;
    pos[k * 3 + 1] = worldY(heightM(gi, gj));
    pos[k * 3 + 2] = -D / 2 + (gj / (G - 1)) * D;
    uv[k * 2] = gi / (G - 1);
    uv[k * 2 + 1] = gj / (G - 1);
  }
  const idx = new Uint32Array((N - 1) * (N - 1) * 6);
  let q = 0;
  for (let j = 0; j < N - 1; j++) for (let i = 0; i < N - 1; i++) {
    const a = j * N + i, b = a + 1, c = a + N, d = c + 1;
    idx[q++] = a; idx[q++] = c; idx[q++] = b; idx[q++] = b; idx[q++] = c; idx[q++] = d;
  }

  const terrainVao = gl.createVertexArray();
  gl.bindVertexArray(terrainVao);
  const attr = (loc, arr, size) => {
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, arr, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 0, 0);
  };
  attr(0, pos, 3);
  attr(1, uv, 2);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx, gl.STATIC_DRAW);

  // Боковые стенки: модель стоит как макет
  const wall = [];
  const pushEdge = (ax, az, ay, bx, bz, by) => wall.push(ax, ay, az, ax, BASE, az, bx, by, bz, bx, by, bz, ax, BASE, az, bx, BASE, bz);
  for (let i = 0; i < N - 1; i++) {
    const p = (k) => [pos[k * 3], pos[k * 3 + 1], pos[k * 3 + 2]];
    const [a0, a1, a2] = p(i), [b0, b1, b2] = p(i + 1);
    pushEdge(a0, a2, a1, b0, b2, b1);
    const [c0, c1, c2] = p((N - 1) * N + i), [d0, d1, d2] = p((N - 1) * N + i + 1);
    pushEdge(c0, c2, c1, d0, d2, d1);
    const [e0, e1, e2] = p(i * N), [f0, f1, f2] = p((i + 1) * N);
    pushEdge(e0, e2, e1, f0, f2, f1);
    const [g0, g1, g2] = p(i * N + N - 1), [h0, h1, h2] = p((i + 1) * N + N - 1);
    pushEdge(g0, g2, g1, h0, h2, h1);
  }
  const skirtVao = gl.createVertexArray();
  gl.bindVertexArray(skirtVao);
  attr(0, new Float32Array(wall), 3);
  const skirtCount = wall.length / 3;

  // Текстура
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, bitmap);
  gl.generateMipmap(gl.TEXTURE_2D);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  const aniso = gl.getExtension('EXT_texture_filter_anisotropic');
  if (aniso) gl.texParameterf(gl.TEXTURE_2D, aniso.TEXTURE_MAX_ANISOTROPY_EXT, Math.min(8, gl.getParameter(aniso.MAX_TEXTURE_MAX_ANISOTROPY_EXT)));

  const pT = program(gl, VS_TERRAIN, FS_TERRAIN);
  const pS = program(gl, VS_SKIRT, FS_SKIRT);
  const pL = program(gl, VS_LINE, FS_LINE);

  // Маршруты
  const palette = { iremel: [1, 0.82, 0.45, 1], poperechnaya: [1, 0.55, 0.34, 1], larkino: [0.56, 0.9, 0.86, 1] };
  const routes = {};
  for (const [id, r] of Object.entries(data.routes)) {
    const pts = r.pts.map(([lat, lon, e, d]) => {
      const [x, z] = toWorldXZ(lat, lon);
      return { p: [x, worldY(groundM(x, z)) + 0.035, z], e, d };
    });
    const n = pts.length, count = n * 2;
    const a = { pos: new Float32Array(count * 3), prev: new Float32Array(count * 3), next: new Float32Array(count * 3), side: new Float32Array(count), t: new Float32Array(count) };
    const len = pts[n - 1].d || 1;
    pts.forEach((pt, i) => {
      const pr = pts[Math.max(0, i - 1)].p, nx = pts[Math.min(n - 1, i + 1)].p;
      for (let s = 0; s < 2; s++) {
        const k = i * 2 + s;
        a.pos.set(pt.p, k * 3); a.prev.set(pr, k * 3); a.next.set(nx, k * 3);
        a.side[k] = s ? 1 : -1;
        a.t[k] = pt.d / len;
      }
    });
    const ind = new Uint32Array((n - 1) * 6);
    for (let i = 0; i < n - 1; i++) {
      const b = i * 2;
      ind.set([b, b + 1, b + 2, b + 2, b + 1, b + 3], i * 6);
    }
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    attr(0, a.pos, 3); attr(1, a.prev, 3); attr(2, a.next, 3); attr(3, a.side, 1); attr(4, a.t, 1);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, ind, gl.STATIC_DRAW);
    routes[id] = { vao, count: ind.length, pts, km: r.km, up: r.up, color: palette[id] };
  }
  gl.bindVertexArray(null);

  // Подписи
  const places = data.places.map((pl) => {
    const [x, z] = toWorldXZ(pl.lat, pl.lon);
    const el = document.createElement('div');
    el.className = `lab lab--${pl.kind}`;
    el.textContent = pl.name;
    if (pl.sub) { const s = document.createElement('small'); s.textContent = pl.sub; el.append(s); }
    labels.append(el);
    return { el, p: [x, worldY(groundM(x, z)) + 0.05, z] };
  });
  const walker = document.createElement('div');
  walker.className = 'lab lab--dot';
  walker.hidden = true;
  labels.append(walker);

  // Камера
  const cam = { yaw: 0.72, pitch: 0.62, dist: smallScreen ? 44 : 36, tx: 0.6, ty: 0.3, tz: 0.8 };
  const goal = { dist: cam.dist };
  let vp = new Float32Array(16), eye = [0, 0, 0], cssW = 1, cssH = 1;
  let flying = null, selected = null, progress = 1, idle = !reduce, visible = false, raf = 0, last = 0, yawV = 0, pitchV = 0;

  const eyeFrom = () => [
    cam.tx + cam.dist * Math.sin(cam.yaw) * Math.cos(cam.pitch),
    cam.ty + cam.dist * Math.sin(cam.pitch),
    cam.tz + cam.dist * Math.cos(cam.yaw) * Math.cos(cam.pitch),
  ];

  function resize() {
    const r = canvas.getBoundingClientRect();
    cssW = r.width; cssH = r.height;
    const dpr = Math.min(devicePixelRatio || 1, smallScreen ? 1.5 : 2);
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    gl.viewport(0, 0, canvas.width, canvas.height);
  }
  new ResizeObserver(resize).observe(canvas);
  resize();

  const project = (p) => {
    const x = vp[0] * p[0] + vp[4] * p[1] + vp[8] * p[2] + vp[12];
    const y = vp[1] * p[0] + vp[5] * p[1] + vp[9] * p[2] + vp[13];
    const w = vp[3] * p[0] + vp[7] * p[1] + vp[11] * p[2] + vp[15];
    if (w <= 0.01) return null;
    return [((x / w + 1) / 2) * cssW, ((1 - y / w) / 2) * cssH];
  };
  const place = (el, p) => {
    const s = project(p);
    if (!s) { el.style.visibility = 'hidden'; return; }
    el.style.visibility = 'visible';
    el.style.transform = `translate(calc(${s[0].toFixed(1)}px - 50%), calc(${s[1].toFixed(1)}px - 100%))`;
  };

  const ease = (t) => t * t * (3 - 2 * t);
  const fmt = (v) => v.toLocaleString('ru-RU', { maximumFractionDigits: 1 });
  const showRead = (t) => { read.textContent = t; };
  const pressed = (id) => buttons.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.route === id)));

  function draw() {
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST);
    eye = eyeFrom();
    const proj = perspective(0.62, cssW / Math.max(1, cssH), 0.2, 240);
    vp = mul(proj, lookAt(eye, [cam.tx, cam.ty, cam.tz], [0, 1, 0]));

    gl.useProgram(pS.p);
    gl.uniformMatrix4fv(pS.u.uVP, false, vp);
    gl.bindVertexArray(skirtVao);
    gl.drawArrays(gl.TRIANGLES, 0, skirtCount);

    gl.useProgram(pT.p);
    gl.uniformMatrix4fv(pT.u.uVP, false, vp);
    gl.uniform3fv(pT.u.uCam, eye);
    gl.uniform1f(pT.u.uHMin, T.hMin);
    gl.uniform1f(pT.u.uK, K);
    gl.uniform3f(pT.u.uHaze, 0.11, 0.2, 0.23);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.bindVertexArray(terrainVao);
    gl.drawElements(gl.TRIANGLES, idx.length, gl.UNSIGNED_INT, 0);

    gl.useProgram(pL.p);
    gl.uniformMatrix4fv(pL.u.uVP, false, vp);
    gl.uniform2f(pL.u.uRes, cssW / 2, cssH / 2);
    for (const [id, r] of Object.entries(routes)) {
      const on = id === selected;
      gl.uniform1f(pL.u.uW, on ? 2.6 : selected ? 1.1 : 1.8);
      gl.uniform1f(pL.u.uProg, on ? progress : 1.01);
      gl.uniform4fv(pL.u.uColor, on || !selected ? r.color : [r.color[0], r.color[1], r.color[2], 0.8]);
      gl.bindVertexArray(r.vao);
      gl.drawElements(gl.TRIANGLES, r.count, gl.UNSIGNED_INT, 0);
    }
    gl.bindVertexArray(null);
    for (const pl of places) place(pl.el, pl.p);
  }

  function tick(now) {
    raf = visible ? requestAnimationFrame(tick) : 0;
    const dt = Math.min(50, now - (last || now));
    last = now;
    if (flying) {
      const u = Math.min(1, (now - flying.start) / flying.ms);
      const e = ease(u);
      const r = routes[flying.id];
      const f = e * (r.pts.length - 1), i = Math.min(r.pts.length - 2, Math.floor(f)), a = r.pts[i], b = r.pts[i + 1], s = f - i;
      const p = [a.p[0] + (b.p[0] - a.p[0]) * s, a.p[1] + (b.p[1] - a.p[1]) * s, a.p[2] + (b.p[2] - a.p[2]) * s];
      const alt = a.e + (b.e - a.e) * s, dist = (a.d + (b.d - a.d) * s) / 1000;
      const k = 1 - Math.exp(-dt / 320);
      cam.tx += (p[0] - cam.tx) * k; cam.ty += (p[1] - cam.ty) * k; cam.tz += (p[2] - cam.tz) * k;
      cam.dist += (flying.dist - cam.dist) * (1 - Math.exp(-dt / 900));
      cam.pitch += (0.5 - cam.pitch) * (1 - Math.exp(-dt / 900));
      cam.yaw += dt * 0.00007;
      goal.dist = cam.dist;
      progress = e;
      walker.hidden = false;
      walker.textContent = '';
      const small = document.createElement('small');
      small.textContent = `${Math.round(alt).toLocaleString('ru-RU')} м`;
      walker.append(small);
      place(walker, p);
      showRead(`${fmt(dist)} км от старта, высота ${Math.round(alt).toLocaleString('ru-RU')} м`);
      document.dispatchEvent(new CustomEvent('iremel:alt', { detail: alt }));
      if (u >= 1) {
        flying = null;
        showRead(`Весь путь ${fmt(r.km)} км, подъём ${Math.round(r.up).toLocaleString('ru-RU')} м`);
        document.dispatchEvent(new CustomEvent('iremel:alt', { detail: null }));
      }
    } else {
      if (idle) cam.yaw += dt * 0.00004;
      cam.yaw += yawV; cam.pitch = Math.min(1.35, Math.max(0.16, cam.pitch + pitchV));
      yawV *= 0.92; pitchV *= 0.92;
      cam.dist += (goal.dist - cam.dist) * (1 - Math.exp(-dt / 160));
    }
    draw();
  }

  new IntersectionObserver((e) => {
    visible = e[0].isIntersecting;
    if (visible && !raf) { last = 0; raf = requestAnimationFrame(tick); }
    if (!visible && flying) stopFly();
  }, { threshold: 0.05 }).observe(stage);

  function stopFly() {
    if (!flying) return;
    flying = null;
    progress = 1;
    walker.hidden = true;
    document.dispatchEvent(new CustomEvent('iremel:alt', { detail: null }));
  }

  function fly(id) {
    const r = routes[id];
    if (!r) return;
    idle = false;
    selected = id;
    pressed(id);
    progress = 0;
    flying = { id, start: performance.now(), ms: Math.min(16000, Math.max(7000, r.km * 1100)), dist: Math.max(9, r.km * 0.95) };
  }
  buttons.forEach((b) => {
    b.setAttribute('aria-pressed', 'false');
    b.addEventListener('click', () => fly(b.dataset.route));
  });

  // Управление
  const pointers = new Map();
  let pinch = 0;
  canvas.addEventListener('pointerdown', (e) => {
    pointers.set(e.pointerId, [e.clientX, e.clientY]);
    canvas.setPointerCapture(e.pointerId);
    idle = false;
    stopFly();
  });
  canvas.addEventListener('pointermove', (e) => {
    const p = pointers.get(e.pointerId);
    if (!p) return;
    const dx = e.clientX - p[0], dy = e.clientY - p[1];
    pointers.set(e.pointerId, [e.clientX, e.clientY]);
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      const d = Math.hypot(a[0] - b[0], a[1] - b[1]);
      if (pinch) goal.dist = Math.min(70, Math.max(6, goal.dist * (pinch / d)));
      pinch = d;
      return;
    }
    yawV = -dx * 0.0042;
    pitchV = dy * 0.003;
    cam.yaw += yawV;
    cam.pitch = Math.min(1.35, Math.max(0.16, cam.pitch + pitchV));
  });
  const release = (e) => { pointers.delete(e.pointerId); pinch = 0; };
  canvas.addEventListener('pointerup', release);
  canvas.addEventListener('pointercancel', release);
  const isFull = () => stage.classList.contains('is-full');
  canvas.addEventListener('wheel', (e) => {
    if (!e.ctrlKey && !isFull()) return;
    e.preventDefault();
    goal.dist = Math.min(70, Math.max(6, goal.dist * Math.exp(e.deltaY * 0.0012)));
  }, { passive: false });
  stage.querySelectorAll('[data-zoom]').forEach((b) => b.addEventListener('click', () => {
    idle = false;
    goal.dist = Math.min(70, Math.max(6, goal.dist * (b.dataset.zoom === 'in' ? 0.72 : 1.38)));
  }));
  const fullBtn = stage.querySelector('[data-full]');
  const toggleFull = (on) => {
    stage.classList.toggle('is-full', on);
    document.body.style.overflow = on ? 'hidden' : '';
    fullBtn.setAttribute('aria-pressed', String(on));
    fullBtn.textContent = on ? 'Свернуть' : 'На весь экран';
  };
  fullBtn.addEventListener('click', () => toggleFull(!isFull()));
  addEventListener('keydown', (e) => { if (e.key === 'Escape' && isFull()) toggleFull(false); });

  showRead('');
  draw();
  return { fly };
}
