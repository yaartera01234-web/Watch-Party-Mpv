/* SELF-DESTRUCT SERVICE WORKER: ye file purane workbox SW ki jagah install hoti
   hai, saare purane caches (jin mein stale bundle tha) delete karti hai, phir
   khud unregister ho jati hai. App ab hamesha taaza assets se chalegi. */
self.addEventListener("install", function () { self.skipWaiting(); });
self.addEventListener("activate", function (e) {
  e.waitUntil(
    caches.keys()
      .then(function (ks) { return Promise.all(ks.map(function (k) { return caches.delete(k); })); })
      .then(function () { return self.registration.unregister(); })
  );
});
self.addEventListener("fetch", function () {});
