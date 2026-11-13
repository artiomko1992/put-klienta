/*
  Service worker «Пути клиента»: сохраняет файлы приложения на телефоне,
  чтобы оно открывалось без интернета.

  ВАЖНО: при КАЖДОЙ выкладке повышайте VERSION (v1 → v2 → v3 ...).
  Иначе телефон продолжит показывать старую версию из своего кэша.
*/
const VERSION = 'v1';
const CACHE = 'put-klienta-' + VERSION;
const FONT_CACHE = 'put-klienta-fonts';

// Файлы приложения, которые кладём в кэш сразу при установке
const APP_FILES = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './manifest.webmanifest',
  './icon.svg',
  './icon-192.png',
  './icon-512.png',
];

// Шрифт PT Sans: при установке сохраняем его целиком, чтобы без сети не было пропусков
const FONT_CSS = 'https://fonts.googleapis.com/css2?family=PT+Sans:wght@400;700&display=swap';
async function cacheFonts() {
  try {
    const cache = await caches.open(FONT_CACHE);
    const res = await fetch(FONT_CSS);
    if (!res.ok) return;
    await cache.put(FONT_CSS, res.clone());
    const css = await res.text();
    const urls = [...css.matchAll(/url\((https:[^)]+)\)/g)].map(m => m[1]);
    await Promise.all(urls.map(u => fetch(u).then(r => (r.ok ? cache.put(u, r) : null)).catch(() => null)));
  } catch (e) { /* нет сети — приложение возьмёт системный шрифт */ }
}

self.addEventListener('install', event => {
  event.waitUntil(Promise.all([
    caches.open(CACHE).then(cache => cache.addAll(APP_FILES)),
    cacheFonts(),
  ]).then(() => self.skipWaiting()));
});

// Новая версия включилась — удаляем кэши старых версий
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE && k !== FONT_CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Шрифты Google: берём из кэша, а если их там нет — скачиваем и запоминаем
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(
      caches.open(FONT_CACHE).then(cache => cache.match(req).then(hit => hit || fetch(req).then(res => {
        cache.put(req, res.clone());
        return res;
      }).catch(() => (url.hostname === 'fonts.googleapis.com'
        // нет сети и шрифт ещё не сохранён: пустой CSS, страница возьмёт системный шрифт
        ? new Response('', { headers: { 'Content-Type': 'text/css' } })
        : new Response('', { status: 204 })))))
    );
    return;
  }
  if (url.origin !== self.location.origin) return;

  // Открытие страницы: всегда отдаём сохранённый index.html (работает и без сети)
  if (req.mode === 'navigate') {
    event.respondWith(caches.match('./index.html').then(hit => hit || fetch(req)));
    return;
  }
  // Остальные файлы приложения: сначала из кэша, иначе из сети
  event.respondWith(caches.match(req, { ignoreSearch: true }).then(hit => hit || fetch(req)));
});
