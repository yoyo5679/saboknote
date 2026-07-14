const CACHE_NAME = 'sabok-note-cache-v22';
const urlsToCache = [
  '/',
  '/index.html',
  '/index.css',
  '/index.js',
  '/treasure.html',
  '/manifest.json'
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(urlsToCache))
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const isNavigation = event.request.mode === 'navigate' ||
    (event.request.headers.get('accept') || '').includes('text/html');

  // 핵심 코드(index.js/css)는 모바일에서 로그인 버그 픽스가 한 방문 늦게 반영되던
  // stale-while-revalidate 문제가 있어 HTML과 같이 네트워크 우선으로 처리
  const reqUrl = new URL(event.request.url);
  const isCoreAsset = reqUrl.origin === self.location.origin &&
    (reqUrl.pathname === '/index.js' || reqUrl.pathname === '/index.css');

  if (isNavigation || isCoreAsset) {
    // HTML·핵심 JS/CSS: 네트워크 우선 → 항상 최신 배포 반영, 오프라인 시 캐시 폴백
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          return response;
        })
        .catch(() => caches.match(event.request, { ignoreSearch: true })
          .then((cached) => cached || caches.match('/index.html')))
    );
    return;
  }

  // 정적 자원: stale-while-revalidate — 캐시를 즉시 주고 백그라운드에서 최신본으로 갱신
  event.respondWith(
    caches.match(event.request, { ignoreSearch: true }).then((cached) => {
      const fetchAndUpdate = fetch(event.request).then((response) => {
        if (response && response.ok && event.request.url.startsWith(self.location.origin)) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        }
        return response;
      }).catch(() => cached);
      return cached || fetchAndUpdate;
    })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((name) => {
          if (name !== CACHE_NAME) return caches.delete(name);
        })
      );
    }).then(() => self.clients.claim())
  );
});
