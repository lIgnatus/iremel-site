const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* память браузера недоступна */ } },
};
const rub = (n) => `${Number(n).toLocaleString('ru-RU')} ₽`;

/* Видео: грузим перед показом, играем только то, что на экране */
const conn = navigator.connection;
const saveData = Boolean(conn?.saveData) || /(^|-)2g$/.test(conn?.effectiveType || '');
const small = matchMedia('(max-width: 900px)').matches;
let paused = saveData || store.get('iremel-films') === 'off';
const inView = new Set();

const srcFor = (v) => `video/${v.dataset.clip}${small ? '-720' : ''}.mp4`;
const start = (v) => {
  if (!v.getAttribute('src')) { v.src = srcFor(v); v.load(); }
  if (!paused) v.play().catch(() => {});
};
const filmIo = new IntersectionObserver((entries) => {
  for (const e of entries) {
    const v = e.target;
    if (e.isIntersecting) { inView.add(v); start(v); } else { inView.delete(v); v.pause(); }
  }
}, { rootMargin: '15% 0px', threshold: 0.01 });
$$('video.film').forEach((v) => filmIo.observe(v));

const pauseBtn = $('#film-pause');
const paintPause = () => {
  pauseBtn.setAttribute('aria-pressed', String(paused));
  pauseBtn.setAttribute('aria-label', paused ? 'Включить видео' : 'Остановить видео');
  $('path', pauseBtn).setAttribute('d', paused ? 'M4 2l10 6-10 6z' : 'M4 2h3v12H4zM9 2h3v12H9z');
};
pauseBtn.addEventListener('click', () => {
  paused = !paused;
  store.set('iremel-films', paused ? 'off' : 'on');
  inView.forEach((v) => (paused ? v.pause() : start(v)));
  paintPause();
});
paintPause();

/* Высотомер: высота зависит от того, какой раздел в середине экрана */
const profile = JSON.parse($('#profile-data').textContent);
const total = profile[profile.length - 1][0];
const bands = [[700, 'Долина'], [1100, 'Тайга'], [1250, 'Редколесье'], [1450, 'Горная тундра'], [Infinity, 'Вершина']];
const altValue = $('#alti-value');
const altBelt = $('#alti-belt');
const alti = $('#alti');
const altDot = $('#alti-dot');
const altProf = $('.alti__prof');
const bar = $('#bar');
const navLinks = $$('.bar__nav a');
let sections = [];
let override = null;

const measure = () => {
  sections = $$('[data-alt]').map((el) => {
    const [a, b] = el.dataset.alt.split(':').map(Number);
    const r = el.getBoundingClientRect();
    return { el, a, b, top: r.top + scrollY, h: r.height };
  });
};

function altitudeAt(y) {
  for (const s of sections) {
    if (y >= s.top && y < s.top + s.h) return s.a + (s.b - s.a) * ((y - s.top) / s.h);
  }
  return y < sections[0].top ? sections[0].a : sections[sections.length - 1].b;
}

function paintAltitude(alt) {
  const v = Math.round(alt);
  altValue.textContent = v.toLocaleString('ru-RU');
  altBelt.textContent = bands.find(([limit]) => alt < limit)[1];
  const point = profile.find((p) => p[1] >= alt) || profile[profile.length - 1];
  const box = altProf.getBoundingClientRect();
  const host = alti.getBoundingClientRect();
  if (box.width) {
    const y = (142 - ((point[1] - 500) / 1100) * 134) / 150;
    alti.style.setProperty('--dx', `${box.left - host.left + (point[0] / total) * box.width}px`);
    alti.style.setProperty('--dy', `${box.top - host.top + y * box.height}px`);
  }
}

let ticking = false;
function onScroll() {
  if (ticking) return;
  ticking = true;
  requestAnimationFrame(() => {
    ticking = false;
    const mid = scrollY + innerHeight * 0.5;
    if (override === null) paintAltitude(altitudeAt(mid));
    bar.classList.toggle('is-solid', scrollY > innerHeight * 0.7);
    alti.classList.toggle('is-past', scrollY > innerHeight * 0.45);
    const current = sections.filter((s) => s.el.id && mid >= s.top).pop();
    navLinks.forEach((a) => {
      if (current && a.getAttribute('href') === `#${current.el.id}`) a.setAttribute('aria-current', 'true');
      else a.removeAttribute('aria-current');
    });
  });
}
addEventListener('scroll', onScroll, { passive: true });
altProf.addEventListener('transitionend', onScroll);
addEventListener('resize', () => { measure(); onScroll(); });
new ResizeObserver(() => { measure(); onScroll(); }).observe(document.body);
document.addEventListener('iremel:alt', (e) => {
  override = e.detail;
  if (override !== null) paintAltitude(override); else onScroll();
});
measure();
onScroll();

/* Подбор номера */
function radioGroup(group, onPick) {
  const items = $$('[role=radio]', group);
  const pick = (btn) => {
    items.forEach((b) => { b.setAttribute('aria-checked', String(b === btn)); b.tabIndex = b === btn ? 0 : -1; });
    onPick(btn);
  };
  items.forEach((b, i) => {
    b.tabIndex = b.getAttribute('aria-checked') === 'true' ? 0 : -1;
    b.addEventListener('click', () => pick(b));
    b.addEventListener('keydown', (e) => {
      const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
      if (!step) return;
      e.preventDefault();
      const next = items[(i + step + items.length) % items.length];
      next.focus();
      pick(next);
    });
  });
}

const prices = $$('.room__price');
const days = $('.seg--days');
radioGroup(days, (btn) => prices.forEach((p) => { p.textContent = rub(p.dataset[btn.dataset.days]); }));
radioGroup($('.seg[aria-label="Сколько вас"]'), (btn) => {
  const need = Number(btn.dataset.cap);
  $$('.room').forEach((r) => { r.hidden = need > 0 && Number(r.dataset.cap) < need; });
  $$('.house').forEach((h) => { h.hidden = $$('.room', h).every((r) => r.hidden); });
  measure();
});

/* Даты */
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const addDay = (s, n) => { const d = new Date(`${s}T12:00:00`); d.setDate(d.getDate() + n); return iso(d); };
const today = iso(new Date());
const forms = $$('form.book');
const bookDates = { in: '', out: '' };

const syncForms = () => forms.forEach((f) => {
  f.elements.in.value = bookDates.in;
  f.elements.out.value = bookDates.out;
  f.elements.out.min = bookDates.in ? addDay(bookDates.in, 1) : addDay(today, 1);
});
forms.forEach((f) => {
  f.elements.in.min = today;
  f.elements.out.min = addDay(today, 1);
  const err = $('.book__err', f);
  f.elements.in.addEventListener('change', (e) => {
    bookDates.in = e.target.value;
    if (bookDates.in && (!bookDates.out || bookDates.out <= bookDates.in)) bookDates.out = addDay(bookDates.in, 2);
    syncForms();
  });
  f.elements.out.addEventListener('change', (e) => { bookDates.out = e.target.value; syncForms(); });
  f.addEventListener('submit', (e) => {
    e.preventDefault();
    const { in: a, out: b } = bookDates;
    if (!a || !b || b <= a) {
      err.textContent = 'Дата выезда должна быть позже даты заезда.';
      err.hidden = false;
      return;
    }
    err.hidden = true;
    const ru = (s) => s.split('-').reverse().join('-');
    window.open(`https://litepms.ru/widget/search?id=${f.dataset.booking}&search=1&date_in=${ru(a)}&date_out=${ru(b)}`, '_blank', 'noopener');
  });
});

/* 3D-модель грузится, только когда гость подходит к ней */
const mapStage = $('#map-stage');
let mapReady = null;
const loadMap = () => {
  mapReady ??= import('./map3d.js').then((m) => m.initMap({
    stage: mapStage,
    canvas: $('#map-canvas'),
    labels: $('#map-labels'),
    data: JSON.parse($('#map-data').textContent),
    read: $('#map-read'),
    buttons: $$('.map__routes [data-route]'),
  }));
  return mapReady;
};
new IntersectionObserver((entries, io) => {
  if (entries[0].isIntersecting) { loadMap(); io.disconnect(); }
}, { rootMargin: '60% 0px' }).observe(mapStage);

$$('[data-fly]').forEach((a) => a.addEventListener('click', () => {
  loadMap().then((map) => setTimeout(() => map?.fly(a.dataset.fly), 700));
}));
