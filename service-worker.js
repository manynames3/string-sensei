const CACHE_NAME = "string-sensei-v35";
const APP_SHELL = [
  "./",
  "./index.html",
  "./manifest.webmanifest?v=35",
  "./assets/favicon-sensei-64.png?v=35",
  "./assets/icon-sensei-192.png?v=35",
  "./assets/icon-sensei-512.png?v=35",
  "./assets/icon-sensei-maskable-192.png?v=35",
  "./assets/icon-sensei-maskable-512.png?v=35",
  "./assets/mascots/sensei-flat-v1.png?v=35",
  "./assets/mascots/sensei-sharp-v1.png?v=35",
  "./assets/mascots/sensei-tuned-v1.png?v=35",
  "./assets/mascots/sensei-waiting-v1.png?v=35",
  "./src/app.js?v=35",
  "./src/components.js?v=35",
  "./src/notes.js?v=35",
  "./src/pitchDetection.js?v=35",
  "./src/tunerLogic.js?v=35",
  "./src/styles.css?v=35"
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
    ))
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const requestUrl = new URL(event.request.url);
  if (requestUrl.origin !== self.location.origin) return;

  const acceptsHtml = event.request.headers.get("accept")?.includes("text/html");
  const isPageRequest = event.request.mode === "navigate" || acceptsHtml;

  if (isPageRequest) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (!response || response.status !== 200 || response.type !== "basic") return response;
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          return response;
        })
        .catch(() => caches.match(event.request).then((cached) => cached ?? caches.match("./index.html")))
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => cached ?? fetch(event.request)
      .then((response) => {
        if (!response || response.status !== 200 || response.type !== "basic") return response;
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        return response;
      })
      .catch(() => caches.match("./index.html")))
  );
});
