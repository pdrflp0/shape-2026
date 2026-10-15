// Service worker: guarda todos os arquivos para o app funcionar 100% offline.
// Estratégia: responde do cache na hora e atualiza em segundo plano (stale-while-revalidate).
// Ao publicar uma versão nova, aumente VERSION: o app baixa tudo de uma vez e oferece "Atualizar".
const VERSION = 'shape2026-v2';
const ASSETS = [
  './', 'index.html', 'manifest.json', 'program.json', 'css/app.css',
  'js/app.js', 'js/db.js', 'js/program.js', 'js/progression.js', 'js/timer.js', 'js/figures.js', 'js/charts.js', 'js/ui.js', 'js/day.js',
  'js/achievements.js', 'js/share.js',
  'js/screens/today.js', 'js/screens/workouts.js', 'js/screens/session.js', 'js/screens/cardio.js',
  'js/screens/progress.js', 'js/screens/diet.js', 'js/screens/profile.js',
  'icons/icon-180.png', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon.svg',
];
// telas de abertura: só a do seu modelo é usada, então ficam no cache sob demanda (não no pré-cache)

self.addEventListener('install', e => {
  // cache: 'reload' ignora o cache HTTP do GitHub Pages (10 min) e baixa a versão nova de verdade
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(ASSETS.map(u => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting()));
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
