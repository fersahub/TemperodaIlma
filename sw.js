const CACHE_NAME = 'tempero-v28-whatsapp-manual-order';
const CACHE_PREFIX = 'tempero-';
const CORE_ASSETS = [
  './index.html',
  './offline.html',
  './manifest.json',
  './css/styles.css',
  './js/theme-init.js',
  './js/vendor/qrcode-generator.js',
  './js/tailwind-config.js',
  './js/splash.js',
  './js/config/loja.js',
  './js/data/combos.js',
  './js/data/pratos.js',
  './js/core/estado.js',
  './js/modules/interface.js',
  './js/services/endereco.js',
  './js/modules/experiencia.js',
  './js/modules/pedidos.js?v=20261125-4',
  './js/modules/operacao.js',
  './js/services/pix.js?v=20261125-4',
  './js/modules/horarios.js',
  './js/modules/favoritos.js',
  './js/modules/detalhes-prato.js',
  './js/modules/cardapio.js',
  './js/modules/catalogo.js?v=20261125-4',
  './js/modules/avulsas.js',
  './js/modules/avaliacoes.js',
  './js/modules/carrinho.js',
  './js/modules/checkout.js?v=20261125-4',
  './js/app.js?v=20261125-3',
  './assets/images/marca/LOGO.PNG',
  './assets/images/optimized/pratos/Empadao de frango.webp',
  './assets/images/pwa/icon-192.png',
  './assets/images/pwa/icon-512.png'
];
const CDN_HOSTS = new Set(['cdn.tailwindcss.com','cdnjs.cloudflare.com','cdn.jsdelivr.net','fonts.googleapis.com','fonts.gstatic.com']);

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll(CORE_ASSETS);
    await self.skipWaiting();
  })());
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME).map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  const local = url.origin === self.location.origin;
  const cdn = CDN_HOSTS.has(url.hostname);
  if (!local && !cdn) return;

  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      const paginaAdmin = url.pathname.endsWith('/admin.html');
      try {
        const response = await fetch(request);
        if (response.ok && !paginaAdmin) {
          const cache = await caches.open(CACHE_NAME);
          await cache.put('./index.html', response.clone());
        }
        return response;
      } catch (error) {
        if (paginaAdmin) return new Response('O painel administrativo precisa de conexão com a internet.', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
        return (await caches.match('./offline.html')) || (await caches.match('./index.html')) || Response.error();
      }
    })());
    return;
  }

  if (local && !['script','style','image','font'].includes(request.destination) && !url.pathname.endsWith('.json')) return;
  event.respondWith((async () => {
    const cached = await caches.match(request);
    try {
      // Scripts e estilos locais usam a rede sem reutilizar uma cópia antiga do cache HTTP.
      const atualizarArquivo = local && ['script', 'style'].includes(request.destination);
      const response = await fetch(atualizarArquivo ? new Request(request, { cache: 'reload' }) : request);
      if (response.ok || response.type === 'opaque') {
        const cache = await caches.open(CACHE_NAME);
        await cache.put(request, response.clone());
        return response;
      }
      return cached || response;
    } catch (error) {
      return cached || Response.error();
    }
  })());
});
