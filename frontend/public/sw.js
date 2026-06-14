self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", () => {
  clients.claim();
  self.registration.unregister();
  caches.keys().then((keys) => keys.forEach((k) => caches.delete(k)));
});
