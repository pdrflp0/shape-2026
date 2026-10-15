// Service worker: guarda todos os arquivos para o app funcionar 100% offline.
// Estratégia: responde do cache na hora e atualiza em segundo plano (stale-while-revalidate).
// Ao editar program.json, a mudança aparece na segunda abertura do app; para forçar, aumente VERSION.
const VERSION = 'shape2026-v1';
const ASSETS = [
  './', 'index.html', 'manifest.json', 'program.json', 'css/app.css',
  'js/app.js', 'js/db.js', 'js/program.js', 'js/progression.js', 'js/timer.js', 'js/figures.js', 'js/charts.js', 'js/ui.js', 'js/day.js',
  'js/screens/today.js', 'js/screens/workouts.js', 'js/screens/session.js', 'js/screens/cardio.js',
  'js/screens/progress.js', 'js/screens/diet.js', 'js/screens/profile.js',
  'icons/icon-180.png', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon.svg',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith(caches.open(VERSION).then(async cache => {
    const cached = await cache.match(req, { ignoreSearch: true });
    const net = fetch(req).then(res => { if (res.ok) cache.put(req, res.clone()); return res; }).catch(() => null);
    if (cached) { e.waitUntil(net); return cached; }
    const res = await net;
    if (res) return res;
    if (req.mode === 'navigate') return cache.match('index.html');
    return new Response('', { status: 504 });
  }));
});
