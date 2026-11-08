// Service worker: lets the site install as an app and open the pages again when the signal is bad.
// Live data (Firebase) is never cached here. Only the website files are.
const CACHE = "sabay-tayo-v8";
const FILES = [
  "./", "index.html", "auth.html", "student.html", "driver.html", "admin.html", "offline.html",
  "style.css", "app.js", "auth.js", "student.js", "driver.js", "admin.js", "pwa.js",
  "qr.js", "manifest.json", "icon-192.png", "icon-512.png", "apple-touch-icon.png", "logo.png", "logo-icon.png"
];

// Save the website files the first time.
self.addEventListener("install", function (event) {
  event.waitUntil(
    caches.open(CACHE).then(function (cache) {
      return cache.addAll(FILES);
    })
  );
  self.skipWaiting();
});

// Delete old copies when the version number changes.
self.addEventListener("activate", function (event) {
  event.waitUntil(
    caches.keys().then(function (names) {
      return Promise.all(names.map(function (name) {
        if (name !== CACHE) {
          return caches.delete(name);
        }
      }));
    }).then(function () {
      return self.clients.claim();
    })
  );
});

// Online: always load the newest file (and keep a copy). Offline: use the saved copy.
async function answer(request) {
  try {
    const fresh = await fetch(request, { cache: "no-cache" }); // ask the server every time, skip the browser's old copy
    if (fresh.ok) {
      const cache = await caches.open(CACHE);
      cache.put(request, fresh.clone());
    }
    return fresh;
  } catch (error) {
    const saved = await caches.match(request, { ignoreSearch: true });
    if (saved) {
      return saved;
    }
    return caches.match("offline.html");
  }
}

self.addEventListener("fetch", function (event) {
  const request = event.request;
  // leave Firebase and the fonts alone
  if (request.method !== "GET" || new URL(request.url).origin !== location.origin) {
    return;
  }
  event.respondWith(answer(request));
});
