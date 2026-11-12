const C = 'tempero-v3-assets';
self.addEventListener('install', e => {
  self.skipWaiting();
  e.waitUntil(caches.open(C).then(c => c.addAll(['./', 'index.html', 'manifest.json', 'css/styles.css', 'js/theme-init.js', 'js/vendor/qrcode-generator.js', 'js/tailwind-config.js', 'js/splash.js', 'js/app.js', 'assets/images/marca/LOGO.PNG', 'assets/images/pwa/icon-192.png', 'assets/images/pwa/icon-512.png'])).catch(() => {}));
});
self.addEventListener('activate', e => e.waitUntil(clients.claim()));
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    fetch(e.request).then(r => {
      const cp = r.clone();
      caches.open(C).then(c => c.put(e.request, cp)).catch(() => {});
      return r;
    }).catch(() => caches.match(e.request))
  );
});
