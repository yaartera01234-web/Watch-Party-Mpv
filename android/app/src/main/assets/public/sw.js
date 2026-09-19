/* SELF-DESTRUCT SERVICE WORKER: ye file purane workbox SW ki jagah install hoti
   hai, saare purane caches (jin mein stale bundle tha) delete karti hai, phir
   khud unregister ho jati hai. App ab hamesha taaza assets se chalegi. */
self.addEventListener("install", function () { self.skipWaiting(); });
self.addEventListener("activate", function (e) {
  e.waitUntil(
    caches.keys()
      .then(function (ks) { return Promise.all(ks.map(function (k) { return caches.delete(k); })); })
      .then(function () { return self.clients.claim(); })
      .then(function () { return self.registration.unregister(); })
      .then(function () {
        // khuli hui windows ko taaza URL par le jao -- pehli launch par hi naya
        // bundle load ho. Agli load par SW maujood hi nahi hoga, is liye loop nahi.
        return self.clients
          .matchAll({ type: "window", includeUncontrolled: true })
          .then(function (cs) { cs.forEach(function (c) { c.navigate(c.url); }); });
      })
  );
});
self.addEventListener("fetch", function () {});
