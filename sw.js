// 앱 화면을 휴대폰에 저장해 두고, 인터넷이 없어도 열리게 합니다.
const CACHE = 'kyosaka-v3';
const SHELL = ['./', './index.html', './manifest.webmanifest', './icon-192.png', './icon-512.png', './apple-touch-icon.png'];

self.addEventListener('install', (e) => {
  // 설치할 때는 임시 보관본을 건너뛰고 서버에서 새로 받음
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => Promise.all(SHELL.map((u) => fetch(new Request(u, { cache: 'reload' })).then((res) => { if (res.ok) return c.put(u, res); }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('kyosaka-') && k !== CACHE && k !== 'kyosaka-fonts').map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

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
  if (url.origin !== self.location.origin) return;

  // 저장본을 바로 보여주고, 인터넷이 되면 서버에 새 버전이 있는지 꼭 확인해서 바꿔둠
  e.respondWith(caches.open(CACHE).then((c) =>
    c.match(req, { ignoreSearch: true }).then((hit) => {
      const net = fetch(req, { cache: 'no-cache' }).then((res) => {
        if (res.ok) { c.put(req, res.clone()); if (req.mode === 'navigate') c.put('./index.html', res.clone()); }
        return res;
      }).catch(() => null);
      if (hit) { e.waitUntil(net); return hit; }
      return net.then((res) => res || (req.mode === 'navigate' ? c.match('./index.html') : Response.error()));
    })
  ));
});
