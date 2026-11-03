// Réseau d'abord (données toujours fraîches), copie locale en secours hors connexion.
const CACHE = "em-v10";
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", e => e.waitUntil(
  caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())
));
self.addEventListener("fetch", e => {
  if (e.request.method !== "GET" || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(
    // no-cache : on revalide toujours auprès du serveur, une mise à jour se voit tout de suite
    fetch(new Request(e.request.url, { cache: "no-cache", credentials: "same-origin" }))
      .then(r => { const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); return r; })
      .catch(() => caches.match(e.request))
  );
});
