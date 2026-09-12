import { createHash } from "node:crypto";

// No route HTML, RSC payload, API, media, price or user data enters CacheStorage.
// Changing this program changes its cache namespace without a manual version bump.
const program = String.raw`
const PREFIX = 'hoda-public-pwa-';
const CACHE = PREFIX + '__VERSION__';
const OFFLINE = ['fa', 'tr', 'en'].map(l => '/pwa/' + l + '/offline');
const MAX_ENTRIES = 64;
let writes = Promise.resolve();
function publicAsset(request) {
  const u = new URL(request.url);
  return request.method === 'GET' && u.origin === self.location.origin && !u.search &&
    !request.headers.has('authorization') && !request.headers.has('range') &&
    /^\/_next\/static\/[a-zA-Z0-9_./%-]+\.(?:js|css|woff2?)$/.test(u.pathname);
}
function safeResponse(response) {
  return response.ok && !response.redirected && response.type !== 'opaque' &&
    !/private|no-store/i.test(response.headers.get('cache-control') || '') &&
    !response.headers.has('set-cookie') &&
    !/cookie|authorization|\*/i.test(response.headers.get('vary') || '');
}
function store(url, response) {
  const copy = response.clone();
  writes = writes.catch(() => {}).then(async () => {
    const c = await caches.open(CACHE);
    await c.put(url, copy);
    const keys = await c.keys();
    const removable = keys.filter(k => !OFFLINE.includes(new URL(k.url).pathname));
    while ((await c.keys()).length > MAX_ENTRIES && removable.length) await c.delete(removable.shift());
  });
  return writes;
}
self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const responses = await Promise.all(OFFLINE.map(async url => {
      const response = await fetch(url, {credentials:'omit', cache:'no-store'});
      if (!safeResponse(response) || response.headers.get('x-hoda-public-offline') !== '1') throw Error('INVALID_OFFLINE_PAGE');
      return [url, response];
    }));
    for (const [url, response] of responses) await store(url, response);
    // No automatic skipWaiting: another tab may contain an unfinished order.
  })());
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) if (key.startsWith(PREFIX) && key !== CACHE) await caches.delete(key);
    await self.clients.claim();
  })());
});
self.addEventListener('message', event => {
  if (event.data?.type === 'REFRESH_PUBLIC_OFFLINE' && event.source?.id) {
    event.waitUntil(Promise.all(OFFLINE.map(async url => {
      const response = await fetch(url, {credentials:'omit',cache:'no-store'});
      if(safeResponse(response) && response.headers.get('x-hoda-public-offline') === '1') await store(url,response);
    })).catch(() => {}));
    return;
  }
  if (event.data?.type !== 'ACTIVATE_UPDATE' || !event.source?.id) return;
  event.waitUntil((async () => {
    // A coordinated automatic reload must never replace another tab's form.
    const clients = await self.clients.matchAll({type:'window', includeUncontrolled:true});
    if (clients.length === 1 && clients[0].id === event.source.id &&
        /^\/(fa|tr|en)\/?$/.test(new URL(clients[0].url).pathname)) await self.skipWaiting();
    else event.source.postMessage({type:'UPDATE_DEFERRED'});
  })());
});
self.addEventListener('fetch', event => {
  const request = event.request;
  const u = new URL(request.url);
  if (request.method !== 'GET' || u.origin !== self.location.origin) return;
  if (request.mode === 'navigate' && /^\/(fa|tr|en)(\/|$)/.test(u.pathname)) {
    // Network only. An HTTP error remains an HTTP error; only transport failure
    // returns a generic locale-specific page without the requested URL/token.
    event.respondWith(fetch(request).catch(async () => {
      const c = await caches.open(CACHE);
      return (await c.match('/pwa/' + u.pathname.split('/')[1] + '/offline')) || Response.error();
    }));
  } else if (publicAsset(request)) {
    event.respondWith((async () => {
      const c = await caches.open(CACHE);
      const hit = await c.match(request.url);
      if (hit) return hit;
      const response = await fetch(new Request(request, {credentials:'omit'}));
      if (safeResponse(response)) event.waitUntil(store(request.url, response).catch(() => {}));
      return response;
    })());
  }
});
`;
export const workerVersion = createHash("sha256")
  .update(program)
  .digest("hex")
  .slice(0, 16);
export const workerSource = program.replace("__VERSION__", workerVersion);

export function sourceForBuild(buildId: string) {
  return program.replace(
    "__VERSION__",
    createHash("sha256")
      .update(program + buildId)
      .digest("hex")
      .slice(0, 16),
  );
}
