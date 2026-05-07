const PROXY_PREFIX = '/proxy';
const TARGET_ORIGIN = 'https://romix.tv';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  const isRomix =
    url.hostname === 'romix.tv' ||
    url.hostname === 'www.romix.tv';

  const isOurProxy =
    url.hostname === self.location.hostname &&
    url.pathname.startsWith(PROXY_PREFIX);

  if (!isRomix && !isOurProxy) return;

  if (isRomix) {
    const proxyUrl = `${self.location.origin}${PROXY_PREFIX}${url.pathname}${url.search}${url.hash}`;
    const newReq = new Request(proxyUrl, {
      method: event.request.method,
      headers: event.request.headers,
      body: ['GET', 'HEAD'].includes(event.request.method) ? undefined : event.request.body,
      credentials: 'include',
      redirect: 'follow',
    });
    event.respondWith(fetch(newReq));
    return;
  }
});
