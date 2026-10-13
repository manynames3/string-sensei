const CACHE_NAME = "string-sensei-v41";
const APP_SHELL = [
  "./",
  "./index.html",
  "./manifest.webmanifest?v=41",
  "./assets/favicon-sensei-64.png?v=41",
  "./assets/icon-sensei-192.png?v=41",
  "./assets/icon-sensei-512.png?v=41",
  "./assets/icon-sensei-maskable-192.png?v=41",
  "./assets/icon-sensei-maskable-512.png?v=41",
  "./assets/mascots/sensei-flat-v1.png?v=41",
  "./assets/mascots/sensei-sharp-v1.png?v=41",
  "./assets/mascots/sensei-tuned-v1.png?v=41",
  "./assets/mascots/sensei-waiting-v1.png?v=41",
  "./src/app.js?v=41",
  "./src/components.js?v=41",
  "./src/notes.js?v=41",
  "./src/pitchDetection.js?v=41",
  "./src/tunerLogic.js?v=41",
  "./src/styles.css?v=41"
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.filter((key) => key.startsWith("string-sensei-") && key !== CACHE_NAME).map((key) => caches.delete(key))
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
    const network = fetch(event.request)
        .then(async (response) => {
          if (!response || response.status !== 200 || response.type !== "basic") return response;
          const copy = response.clone();
          try {
            const cache = await caches.open(CACHE_NAME);
            await cache.put(event.request, copy);
          } catch {
            // A full cache must not prevent an online page from opening.
          }
          return response;
        });
    event.waitUntil(network.catch(() => {}));
    event.respondWith((async () => {
      let timeout;
      try {
        return await Promise.race([
          network,
          new Promise((_, reject) => { timeout = setTimeout(() => reject(new Error("Network timeout")), 1500); })
        ]);
      } catch {
        return await caches.match(event.request) ?? await caches.match("./index.html") ?? Response.error();
      } finally {
        clearTimeout(timeout);
      }
    })());
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => cached ?? fetch(event.request)
      .then((response) => {
        if (!response || response.status !== 200 || response.type !== "basic") return response;
        const copy = response.clone();
        event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy)).catch(() => {}));
        return response;
      })
      .catch(() => Response.error()))
  );
});
