// 앱 화면을 휴대폰에 저장해 두고, 인터넷이 없어도 열리게 합니다.
const CACHE = 'kyosaka-v7';
const MAPCACHE = 'kyosaka-map2';   // 지도 그림: 확인 가능한 응답만 저장하고 개수를 제한함
const MAP_MAX = 800;
const SHELL = ['./', './index.html', './manifest.webmanifest', './icon-192.png', './icon-512.png', './apple-touch-icon.png'];

self.addEventListener('install', (e) => {
  // 설치할 때는 임시 보관본을 건너뛰고 서버에서 새로 받음. 하나라도 못 받으면 설치하지 않고 예전 것을 계속 씀
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => Promise.all(SHELL.map((u) => fetch(new Request(u, { cache: 'reload' })).then((res) => { if (!res.ok) throw new Error(u); return c.put(u, res); }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('kyosaka-') && k !== CACHE && k !== 'kyosaka-fonts' && k !== 'kyosaka-photos' && k !== MAPCACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function trimMap(c) {
  return c.keys().then((keys) => { if (keys.length > MAP_MAX) return Promise.all(keys.slice(0, keys.length - MAP_MAX).map((k) => c.delete(k))); });
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    e.respondWith(caches.open('kyosaka-fonts').then((c) => c.match(req).then((hit) =>
      hit || fetch(req).then((res) => { if (res.ok || res.type === 'opaque') c.put(req, res.clone()); return res; })
    )));
    return;
  }
  // 관광지 사진: 한 번 받은 건 저장해 두고 오프라인에서도 보여줌
  if (url.hostname === 'upload.wikimedia.org') {
    e.respondWith(caches.open('kyosaka-photos').then((c) => c.match(req).then((hit) =>
      hit || fetch(req).then((res) => { if (res.ok || res.type === 'opaque') c.put(req, res.clone()); return res; })
    )));
    return;
  }
  // 지도 라이브러리와 지도 그림: 한 번 받은 건 저장해 두고 다시 씀 (오류 응답은 저장하지 않음)
  if (url.hostname === 'cdnjs.cloudflare.com' || url.hostname === 'tile.openstreetmap.org') {
    e.respondWith(caches.open(MAPCACHE).then((c) => c.match(req, { ignoreVary: true }).then((hit) =>
      hit || fetch(req).then((res) => { if (res.ok) { c.put(req, res.clone()).then(() => trimMap(c)); } return res; })
    )));
    return;
  }
  if (url.origin !== self.location.origin) return;

  const nav = req.mode === 'navigate';
  // 앱 화면만 저장함. 다른 파일을 주소창으로 열었을 때 그걸 앱 화면으로 저장하지 않음
  if (nav && !/\/(index\.html)?$/.test(url.pathname)) return;

  // 정보 탭 '새로고침': 저장본을 건너뛰고 서버에서 바로 받아 저장본도 바꿔둠
  if (url.searchParams.has('fresh')) {
    e.respondWith(fetch(req, { cache: 'no-store' }).then((res) => {
      if (res.ok) {
        const a = res.clone(), b = res.clone();
        e.waitUntil(caches.open(CACHE).then((c) => Promise.all([c.put('./index.html', a), c.put('./', b)])));
      }
      return res;
    }));
    return;
  }

  // 저장본을 바로 보여주고, 인터넷이 되면 서버에 새 버전이 있는지 꼭 확인해서 바꿔둠
  // 앱 화면은 주소(?family 등)와 상관없이 늘 './index.html' 한 곳에 저장하고 꺼냄
  e.respondWith(caches.open(CACHE).then((c) =>
    (nav ? c.match('./index.html') : c.match(req, { ignoreSearch: true })).then((hit) => {
      const net = fetch(req, { cache: 'no-cache' }).then((res) => {
        if (res.ok) {
          if (nav) { c.put('./index.html', res.clone()); c.put('./', res.clone()); }
          else c.put(req, res.clone());
        }
        return res;
      }).catch(() => null);
      if (hit) { e.waitUntil(net); return hit; }
      return net.then((res) => res || (nav ? c.match('./index.html') : Response.error()));
    })
  ));
});
