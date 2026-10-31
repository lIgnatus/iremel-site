// Шаблон страницы. Все тексты и цены лежат в src/data/site.json
const nbsp = ' ';
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const rub = (n) => `${String(n).replace(/\B(?=(\d{3})+(?!\d))/g, nbsp)}${nbsp}₽`;
const m = (n) => `${String(n).replace(/\B(?=(\d{3})+(?!\d))/g, nbsp)}${nbsp}м`;
const places = (n) => (n === 1 ? 'место' : n < 5 ? 'места' : 'мест');

const img = (photos, id, cls = '', sizes = '(max-width: 760px) 86vw, 34vw') => {
  const p = photos[id];
  if (!p) throw new Error(`Нет фото ${id}`);
  const ratio = p.h / p.w;
  const w = Math.min(1000, p.w);
  return `<img class="${cls}" src="img/${id}-480.webp" srcset="img/${id}-480.webp ${Math.min(480, p.w)}w, img/${id}-1000.webp ${w}w" sizes="${sizes}" width="${w}" height="${Math.round(w * ratio)}" alt="${esc(p.alt)}" loading="lazy" decoding="async">`;
};

const film = (clip, label = '') => `<video class="film" muted playsinline loop preload="none" poster="video/${clip}.webp" data-clip="${clip}"${label ? ` aria-label="${esc(label)}"` : ' aria-hidden="true"'}></video>`;

const credit = (d, sourceId, text) => {
  const s = d.videoSources[sourceId];
  return `<p class="credit">${esc(text)}. Видео: <a href="${s.url}" target="_blank" rel="noopener">${esc(s.author)}</a>, CC${nbsp}BY</p>`;
};

// Настоящий профиль тропы от домов до вершины
function trailData(d) {
  const pts = d.routes.iremel.pts;
  const total = pts[pts.length - 1][3];
  const W = 1000, H = 150, top = 8, base = 142;
  const lo = 500, hi = 1600;
  const x = (dist) => (dist / total) * W;
  const y = (e) => base - ((e - lo) / (hi - lo)) * (base - top);
  const line = pts.map((p, i) => `${i ? 'L' : 'M'}${x(p[3]).toFixed(1)} ${y(p[2]).toFixed(1)}`).join('');
  const area = `${line}L${W} ${H}L0 ${H}Z`;
  const at = (e) => pts.find((p) => p[2] >= e) || pts[pts.length - 1];
  const points = [
    { href: '#nomera', label: 'Номера', e: 522, p: pts[0] },
    { href: '#jekskursii', label: 'Экскурсии', e: 900, p: at(900) },
    { href: '#tur', label: '3D-тур', e: 1200, p: at(1200) },
    { href: '#kontakty', label: 'Контакты', e: 1582, p: pts[pts.length - 1] },
  ].map((c) => ({ ...c, x: (x(c.p[3]) / W) * 100, y: (y(c.p[2]) / H) * 100 }));
  return { line, area, points, W, H };
}

function ridge(views, name, cls) {
  const bands = views[name];
  const all = bands.flat().filter((v) => v > -80);
  const lo = Math.min(...all), hi = Math.max(...all);
  const W = 1000, H = 200;
  const shape = (b) => {
    const step = Math.max(1, Math.floor(b.length / 160));
    const pts = b.filter((_, i) => i % step === 0).map((v, i, arr) => `${((i / (arr.length - 1)) * W).toFixed(1)} ${(H - ((Math.max(v, lo) - lo) / (hi - lo)) * (H - 8)).toFixed(1)}`);
    return `0 ${H} ${pts.join(' ')} ${W} ${H}`;
  };
  return `<div class="ridge ${cls}" aria-hidden="true"><svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" focusable="false"><polygon class="ridge__far" points="${shape(bands[2])}"/><polygon class="ridge__mid" points="${shape(bands[1])}"/><polygon class="ridge__near" points="${shape(bands[0])}"/></svg></div>`;
}

// Высота букв слова повторяет силуэт массива
function wordmark(views) {
  const [near, mid, far] = views.southFromMatreshka;
  const env = mid.map((v, i) => Math.max(v, far[i], near[i]));
  const word = [...'ИРЕМЕЛЬ'];
  const a = 0.14, b = 0.9;
  const raw = word.map((_, i) => {
    const t = a + ((b - a) * (i + 0.5)) / word.length;
    const k = Math.floor(t * (env.length - 1));
    return env[k];
  });
  const lo = Math.min(...raw), hi = Math.max(...raw);
  const hs = raw.map((v) => 0.78 + (0.22 * (v - lo)) / (hi - lo));
  return word.map((c, i) => `<span style="--h:${hs[i].toFixed(3)}">${c}</span>`).join('');
}

function bookForm(d, cls, idp) {
  return `<form class="book ${cls}" data-booking="${d.bookingId}" action="https://litepms.ru/widget/search" method="get" target="_blank">
    <input type="hidden" name="id" value="${d.bookingId}"><input type="hidden" name="search" value="1">
    <div class="book__field"><label for="${idp}-in">Заезд</label><input id="${idp}-in" name="in" type="date" required></div>
    <div class="book__field"><label for="${idp}-out">Выезд</label><input id="${idp}-out" name="out" type="date" required></div>
    <button class="btn" type="submit">Показать свободные номера</button>
    <p class="book__price">от <b>${rub(d.hero.priceFrom)}</b> ${esc(d.hero.priceNote)}</p>
    <p class="book__err" role="alert" hidden></p>
  </form>`;
}

function room(r, d) {
  const hasMore = Boolean(r.text);
  const capText = r.extra ? `${r.places} ${places(r.places)} + ${r.extra}${nbsp}доп.` : `${r.places}${nbsp}${places(r.places)}`;
  const head = `<span class="room__name">${esc(r.name)}</span><span class="room__brief">${esc(r.brief)}</span><span class="room__cap">${capText}</span><span class="room__price" data-weekday="${r.weekday}" data-weekend="${r.weekend}">${rub(r.weekday)}</span>`;
  const link = `https://litepms.ru/widget/search?id=${d.bookingId}&room_id=${r.lp}`;
  if (!hasMore) return `<div class="room room--plain" data-cap="${r.places + r.extra}"><div class="room__head">${head}<span class="room__mark" aria-hidden="true"></span></div></div>`;
  return `<details class="room" data-cap="${r.places + r.extra}"><summary class="room__head">${head}<span class="room__mark" aria-hidden="true"></span></summary><div class="room__more"><p>${esc(r.text)}</p><a class="link" href="${link}" target="_blank" rel="noopener">Открыть этот номер в бронировании</a></div></details>`;
}

// Отзыв живёт внутри карточки. Подпись общая: на старом сайте отзывы не привязаны к конкретным домам
const guest = (r) => (r ? `<figure class="guest"><blockquote>${esc(r.text)}</blockquote><figcaption>${esc(r.name)}${r.role ? `, ${esc(r.role)}` : ''}, отзыв гостя</figcaption></figure>` : '');

function house(h, d) {
  const strip = h.photos.length ? `<div class="strip" tabindex="0" role="group" aria-label="Фото: ${esc(h.name)}">${h.photos.map((id, i) => `<figure class="strip__item${i === 0 ? ' strip__item--lead' : ''}">${img(d.photos, id, '', i === 0 ? '(max-width: 760px) 86vw, 46vw' : '(max-width: 760px) 66vw, 24vw')}</figure>`).join('')}</div>` : '';
  return `<article class="house" id="dom-${h.id}">
    <header class="house__head"><h3>${esc(h.name)}</h3><p>${esc(h.text)}</p></header>
    ${strip}
    <div class="house__rooms">${h.rooms.map((r) => room(r, d)).join('')}</div>
    ${guest(h.review)}
  </article>`;
}

function yardItem(it, d, i) {
  return `<article class="yard yard--${it.id}">
    <div class="yard__photos">${it.photos.map((id, k) => img(d.photos, id, k === 0 ? 'yard__lead' : 'yard__side', k === 0 ? '(max-width: 760px) 100vw, 44vw' : '(max-width: 760px) 50vw, 18vw')).join('')}</div>
    <div class="yard__text">
      <h3>${esc(it.name)}</h3>
      <p>${esc(it.text)}</p>
      <dl class="tariff">${it.prices.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>
      ${it.note ? `<p class="yard__note">${esc(it.note)}</p>` : ''}
    </div>
  </article>`;
}

function route(r, d) {
  const stats = r.stats.length ? `<dl class="route__stats">${r.stats.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>` : '';
  const btn = r.route ? `<a class="route__map" href="#tur" data-fly="${r.route}">Пройти по карте</a>` : '';
  return `<article class="route">
    <div class="route__name"><h3>${esc(r.name)}</h3><p>${esc(r.kind)}</p></div>
    <div class="route__body"><p class="route__text">${esc(r.text)}</p>${guest(r.review)}</div>
    <div class="route__side">${stats}${btn}</div>
  </article>`;
}

function filmCard(f, d) {
  const s = d.videoSources[f.source];
  return `<figure class="reel${f.size ? ` reel--${f.size}` : ''}">
    <div class="reel__frame">${film(f.clip, f.place)}</div>
    <figcaption><b>${esc(f.place)}</b><span>${esc(f.note)}</span><a href="${s.url}" target="_blank" rel="noopener">${esc(s.author)}</a></figcaption>
  </figure>`;
}

function sources(d) {
  const used = [...new Set([d.windows.taiga.source, d.windows.tundra.source, d.windows.summit.source, 'larkino-dawn', ...d.films.items.map((f) => f.source)])];
  return used.map((id) => {
    const s = d.videoSources[id];
    return `<li><a href="${s.url}" target="_blank" rel="noopener">${esc(s.title.replace(/\s+!/g, '!').replace(/\s{2,}/g, ' '))}</a>, ${esc(s.author)}</li>`;
  }).join('');
}

export function renderPage(d) {
  const t = trailData(d);
  const prof = JSON.stringify(d.routes.iremel.pts.filter((_, i) => i % 4 === 0).map((p) => [p[3], p[2]]));
  const jsonLd = {
    '@context': 'https://schema.org', '@type': 'LodgingBusiness', name: d.fullName, description: d.description,
    telephone: d.phoneHref, email: d.email, url: d.canonical, priceRange: '5800-13200 RUB',
    address: { '@type': 'PostalAddress', addressCountry: 'RU', addressRegion: 'Челябинская область', addressLocality: 'посёлок Кордонный', streetAddress: 'улица Лесная, 2' },
    geo: { '@type': 'GeoCoordinates', latitude: d.geo.lat, longitude: d.geo.lon },
    sameAs: [d.vk, d.telegram],
  };
  const w = d.windows;
  return `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(d.title)}</title>
<meta name="description" content="${esc(d.description)}">
${d.indexable ? `<link rel="canonical" href="${d.canonical}">` : '<meta name="robots" content="noindex">'}
<meta name="theme-color" content="#0b1d1a">
<meta property="og:type" content="website">
<meta property="og:title" content="${esc(d.title)}">
<meta property="og:description" content="${esc(d.description)}">
<meta property="og:image" content="${d.siteUrl}video/iremel-morning.webp">
<link rel="icon" href="icon.svg" type="image/svg+xml">
<link rel="preload" href="fonts/sofia-sans-extra-condensed-normal-cyrillic.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="fonts/sofia-sans-normal-cyrillic.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="video/${d.hero.clip}.webp" as="image">
<link rel="stylesheet" href="styles.css">
<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>
</head>
<body>
<a class="skip" href="#nomera">Перейти к номерам</a>

<header class="bar" id="bar">
  <a class="bar__logo" href="#top">Иремель</a>
  <nav class="bar__nav" aria-label="Разделы сайта">
    <a href="#nomera">Номера</a>
    <a href="#jekskursii">Экскурсии</a>
    <a href="#tur">3D-тур</a>
    <a href="#kontakty">Контакты</a>
  </nav>
  <a class="bar__tel" href="tel:${d.phoneHref}">${esc(d.phone)}</a>
  <button class="btn btn--small" type="button" popovertarget="book-pop">Забронировать</button>
</header>

<main>
<section class="hero" id="top" data-alt="522:522">
  <div class="hero__film">${film(d.hero.clip)}</div>
  <div class="hero__inner">
    <h1 class="mark" aria-label="Иремель"><span class="mark__row" aria-hidden="true">${wordmark(d.skylines)}</span></h1>
    <p class="hero__lead">${esc(d.hero.lead)}</p>
    <nav class="trail" aria-label="Профиль тропы от домов до вершины">
      <svg class="trail__svg" viewBox="0 0 ${t.W} ${t.H}" preserveAspectRatio="none" aria-hidden="true" focusable="false"><path class="trail__area" d="${t.area}"/><path class="trail__line" d="${t.line}" vector-effect="non-scaling-stroke"/></svg>
      ${t.points.map((p, i) => `<a class="trail__pt trail__pt--${i}" href="${p.href}" style="--x:${p.x.toFixed(2)}%;--y:${p.y.toFixed(2)}%;--d:${(0.6 + p.x * 0.012).toFixed(2)}s"><b>${p.label}</b><span>${m(p.e)}</span></a>`).join('')}
    </nav>
    ${bookForm(d, 'book--hero', 'h')}
  </div>
  ${credit(d, 'larkino-dawn', d.hero.credit)}
</section>

<section class="band band--home" id="nomera" data-alt="522:640">
  ${ridge(d.skylines, 'southFromMatreshka', 'ridge--up')}
  <div class="band__in">
    <header class="stage"><h2>Номера</h2><span class="stage__rule" aria-hidden="true"></span><p class="stage__alt">${m(522)}</p></header>
    <p class="lead">${esc(d.rooms.lead)}</p>
    <div class="picker" role="group" aria-label="Подбор номера">
      <div class="seg" role="radiogroup" aria-label="Сколько вас">
        <button type="button" role="radio" aria-checked="true" data-cap="0">Все</button>
        <button type="button" role="radio" aria-checked="false" data-cap="2">Вдвоём</button>
        <button type="button" role="radio" aria-checked="false" data-cap="3">Втроём</button>
        <button type="button" role="radio" aria-checked="false" data-cap="4">Вчетвером</button>
        <button type="button" role="radio" aria-checked="false" data-cap="5">Впятером</button>
        <button type="button" role="radio" aria-checked="false" data-cap="6">Вшестером</button>
      </div>
      <div class="seg seg--days" role="radiogroup" aria-label="Цены">
        <button type="button" role="radio" aria-checked="true" data-days="weekday">Будни</button>
        <button type="button" role="radio" aria-checked="false" data-days="weekend">Выходные</button>
      </div>
    </div>
    <p class="picker__note" id="picker-note">За дополнительное место ${rub(d.rooms.extraPlace.weekday)} в будни и ${rub(d.rooms.extraPlace.weekend)} в выходные.</p>
    <div class="houses">
      ${d.houses.map((h) => house(h, d)).join('')}
    </div>
    <details class="rules">
      <summary>Условия брони и заезда</summary>
      <ul>${d.rooms.rules.map((r) => `<li>${esc(r)}</li>`).join('')}</ul>
    </details>
  </div>
</section>

<section class="band band--yard" id="territoriya" data-alt="640:780">
  <div class="band__in">
    <header class="stage"><h2>${esc(d.yard.title)}</h2><span class="stage__rule" aria-hidden="true"></span><p class="stage__alt">${m(640)}</p></header>
    <p class="lead">${esc(d.yard.lead)}</p>
    ${d.yard.items.map((it, i) => yardItem(it, d, i)).join('')}
    <p class="yard__more">${esc(d.yard.more)}</p>
  </div>
</section>

<section class="win" data-alt="780:900" aria-label="${esc(w.taiga.line)}">
  <div class="win__stick">
    ${film(w.taiga.clip)}
    <div class="win__in"><p class="win__alt">${m(w.taiga.alt)}</p><p class="win__line">${esc(w.taiga.line)}</p><p class="win__text">${esc(w.taiga.text)}</p></div>
    ${credit(d, w.taiga.source, w.taiga.credit)}
  </div>
</section>

<section class="band band--larch" id="jekskursii" data-alt="900:1150">
  ${ridge(d.skylines, 'eastFromPoperechnaya', 'ridge--up')}
  <div class="band__in">
    <header class="stage"><h2>Экскурсии</h2><span class="stage__rule" aria-hidden="true"></span><p class="stage__alt">${m(900)}</p></header>
    <p class="lead">${esc(d.excursions.lead)}</p>
    <a class="btn btn--dark" href="tel:${d.phoneHref}">Позвонить управляющему</a>
    <div class="routes">${d.excursions.items.map((r) => route(r, d)).join('')}</div>
  </div>
</section>

<section class="map" id="tur" data-alt="1150:1250">
  <div class="map__stage" id="map-stage">
    <canvas class="map__canvas" id="map-canvas" aria-label="Трёхмерная модель района с маршрутами"></canvas>
    <div class="map__labels" id="map-labels" aria-hidden="true"></div>
    <div class="map__tools">
      <button type="button" class="map__tool" data-zoom="in" aria-label="Приблизить">+</button>
      <button type="button" class="map__tool" data-zoom="out" aria-label="Отдалить">&minus;</button>
      <button type="button" class="map__tool map__tool--wide" data-full aria-pressed="false">На весь экран</button>
    </div>
    <noscript><p class="map__fallback">Для 3D-модели нужен JavaScript.</p></noscript>
  </div>
  <div class="map__panel">
    <h2>${esc(d.map.title)}</h2>
    <p>${esc(d.map.lead)}</p>
    <div class="map__routes" role="group" aria-label="Маршруты на карте">
      <button type="button" data-route="iremel"><b>Большой Иремель</b><span>${String(d.routes.iremel.km).replace('.', ',')} км от домов</span></button>
      <button type="button" data-route="poperechnaya"><b>Поперечная</b><span>${String(d.routes.poperechnaya.km).replace('.', ',')} км от домов</span></button>
      <button type="button" data-route="larkino"><b>Ларкино ущелье</b><span>${String(d.routes.larkinoFromHome.km).replace('.', ',')} км от домов</span></button>
    </div>
    <p class="map__read" id="map-read" aria-live="polite"></p>
    ${d.matterportId ? `<a class="link" href="https://my.matterport.com/show/?m=${d.matterportId}" target="_blank" rel="noopener">Открыть тур по домам</a>` : ''}
    <p class="map__note">${esc(d.map.note)}</p>
  </div>
</section>

<section class="band band--lichen" id="priroda" data-alt="1250:1430">
  ${ridge(d.skylines, 'westFromIremel', 'ridge--up')}
  <div class="band__in">
    <header class="stage"><h2>${esc(d.films.title)}</h2><span class="stage__rule" aria-hidden="true"></span><p class="stage__alt">${m(1250)}</p></header>
    <p class="lead">${esc(d.films.lead)}</p>
    <div class="reels">${d.films.items.map((f) => filmCard(f, d)).join('')}</div>
  </div>
</section>

<section class="win" data-alt="1430:1560" aria-label="${esc(w.tundra.line)}">
  <div class="win__stick">
    ${film(w.tundra.clip)}
    <div class="win__in"><p class="win__alt">${m(w.tundra.alt)}</p><p class="win__line">${esc(w.tundra.line)}</p><p class="win__text">${esc(w.tundra.text)}</p></div>
    ${credit(d, w.tundra.source, w.tundra.credit)}
  </div>
</section>

<section class="win win--summit" data-alt="1560:1582" aria-label="Вершина">
  <div class="win__stick">
    ${film(w.summit.clip)}
    <div class="win__in"><p class="win__alt">${m(w.summit.alt)}</p><p class="win__line">Вершина</p></div>
    ${credit(d, w.summit.source, w.summit.credit)}
  </div>
</section>

<section class="band band--stone" id="kontakty" data-alt="1582:1582">
  ${ridge(d.skylines, 'northFromIremel', 'ridge--up')}
  <div class="band__in">
    <header class="stage"><h2>${esc(d.contacts.title)}</h2><span class="stage__rule" aria-hidden="true"></span><p class="stage__alt">${m(1582)}</p></header>
    <p class="lead">${esc(d.contacts.lead)}</p>
    <div class="top__grid">
      <div class="reach">
        <a class="reach__tel" href="tel:${d.phoneHref}">${esc(d.phone)}</a>
        <p>Звоните ${esc(d.phoneHours)}</p>
        <p><a href="mailto:${d.email}">${esc(d.email)}</a></p>
        <p class="reach__social"><a href="${d.telegram}" target="_blank" rel="noopener">Telegram</a> <a href="${d.vk}" target="_blank" rel="noopener">ВКонтакте</a></p>
      </div>
      <div class="reach">
        <p class="reach__addr">${esc(d.address)}</p>
        <p>${esc(d.addressNote)}</p>
        <p><a href="${d.mapUrl}" target="_blank" rel="noopener">Открыть в Яндекс Картах</a></p>
      </div>
      ${bookForm(d, 'book--top', 't')}
    </div>
  </div>
</section>
</main>

<footer class="foot">
  <div class="foot__in">
    <p>${new Date().getFullYear()}, ${esc(d.fullName)}. Фото номеров и территории принадлежат комплексу.</p>
    <details class="foot__src">
      <summary>Источники видео и данных</summary>
      <p>Видео на сайте: фрагменты роликов с YouTube, звук убран. Лицензия <a href="https://creativecommons.org/licenses/by/3.0/deed.ru" target="_blank" rel="noopener">Creative Commons BY 3.0</a>.</p>
      <ul>${sources(d)}</ul>
      <p>Рельеф: Copernicus DEM GLO-30, © DLR e.V. 2010-2014 и © Airbus Defence and Space GmbH 2014-2018, предоставлено программой Copernicus Европейского союза и ESA. Тропы, реки и вершины: © участники <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>, ODbL. Шрифт Sofia Sans, лицензия OFL.</p>
    </details>
  </div>
</footer>

<aside class="alti" id="alti">
  <div class="alti__read" aria-hidden="true"><b id="alti-value">522</b><span class="alti__unit">м</span><span class="alti__belt" id="alti-belt">Долина</span></div>
  <svg class="alti__prof" viewBox="0 0 ${t.W} ${t.H}" preserveAspectRatio="none" aria-hidden="true" focusable="false"><path class="alti__area" d="${t.area}"/><path class="alti__line" d="${t.line}" vector-effect="non-scaling-stroke"/></svg>
  <span class="alti__dot" id="alti-dot" aria-hidden="true"></span>
  <button class="alti__pause" id="film-pause" type="button" aria-pressed="false" aria-label="Остановить видео"><svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M4 2h3v12H4zM9 2h3v12H9z"/></svg></button>
  <button class="btn btn--small alti__book" type="button" popovertarget="book-pop">Забронировать</button>
</aside>

<div class="pop" id="book-pop" popover>
  <div class="pop__head"><p>Выберите даты</p><button type="button" class="pop__close" popovertarget="book-pop" popovertargetaction="hide" aria-label="Закрыть">&times;</button></div>
  ${bookForm(d, 'book--pop', 'p')}
  <p class="pop__tel">Или позвоните: <a href="tel:${d.phoneHref}">${esc(d.phone)}</a></p>
</div>

<script id="profile-data" type="application/json">${prof}</script>
<script id="map-data" type="application/json">${JSON.stringify({ terrain: d.terrain, routes: { iremel: d.routes.iremel, poperechnaya: d.routes.poperechnaya, larkino: d.routes.larkinoFromHome }, places: d.mapPlaces })}</script>
<script type="module" src="main.js"></script>
</body>
</html>
`;
}
