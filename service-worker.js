const CACHE_NAME = "string-sensei-v27";
const APP_SHELL = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./assets/icon.svg",
  "./assets/icon-maskable.svg",
  "./assets/mascots/sensei-flat-v1.png?v=27",
  "./assets/mascots/sensei-sharp-v1.png?v=27",
  "./assets/mascots/sensei-tuned-v1.png?v=27",
  "./assets/mascots/sensei-waiting-v1.png?v=27",
  "./src/app.js?v=27",
  "./src/components.js?v=27",
  "./src/notes.js?v=27",
  "./src/pitchDetection.js?v=27",
  "./src/tunerLogic.js?v=27",
  "./src/styles.css?v=27"
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
