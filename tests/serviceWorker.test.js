import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const source = await readFile(new URL("../service-worker.js", import.meta.url), "utf8");

function worker(fetch, cache, timers = {}) {
  const handlers = {};
  vm.runInNewContext(source, {
    self: { location: { origin: "https://tuner.test" }, addEventListener: (name, fn) => { handlers[name] = fn; }, clients: { claim() {} } },
    fetch, caches: cache, URL, Response, setTimeout, clearTimeout, ...timers
  });
  return handlers;
}

function request(path, mode = "navigate") {
  return { url: `https://tuner.test/${path}`, method: "GET", mode, headers: { get: () => mode === "navigate" ? "text/html" : "text/javascript" } };
}

test("offline navigation uses the cached app shell", async () => {
  const cached = new Response("cached tuner");
  const handlers = worker(() => Promise.reject(new Error("Offline")), { match: async key => key === "./index.html" ? cached : undefined });
  let result;
  handlers.fetch({ request: request("index.html"), respondWith: p => { result = p; }, waitUntil() {} });
  assert.equal(await (await result).text(), "cached tuner");
});

test("a stalled network falls back to cache without waiting indefinitely", async () => {
  const cached = new Response("cached tuner");
  const handlers = worker(() => new Promise(() => {}), { match: async () => cached }, {
    setTimeout: fn => { queueMicrotask(fn); return 1; }, clearTimeout() {}
  });
  let result;
  handlers.fetch({ request: request(""), respondWith: p => { result = p; }, waitUntil() {} });
  assert.equal(await (await result).text(), "cached tuner");
});

test("an uncached offline script does not receive HTML", async () => {
  const handlers = worker(() => Promise.reject(new Error("Offline")), { match: async () => undefined });
  let result;
  handlers.fetch({ request: request("missing.js", "cors"), respondWith: p => { result = p; } });
  assert.equal((await result).type, "error");
});

test("cache activation preserves caches belonging to other applications", async () => {
  const deleted = [];
  const handlers = worker(() => {}, {
    keys: async () => ["string-sensei-v37", "string-sensei-v41", "another-app"],
    delete: async key => deleted.push(key)
  });
  let completion;
  handlers.activate({ waitUntil: p => { completion = p; } });
  await completion;
  assert.deepEqual(deleted, ["string-sensei-v37"]);
});

test("cache write failure does not turn a successful online navigation into an error", async () => {
  const response = { status: 200, type: "basic", clone: () => ({}) };
  let writes = 0;
  const handlers = worker(() => Promise.resolve(response), {
    open: async () => ({ put: async () => { writes++; throw new Error("Quota exceeded"); } }),
    match: async () => undefined
  });
  let result;
  handlers.fetch({ request: request("index.html"), respondWith: p => { result = p; }, waitUntil() {} });
  assert.equal(await result, response);
  assert.equal(writes, 1);
});
