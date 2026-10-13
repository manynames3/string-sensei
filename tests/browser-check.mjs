// Run with the local preview server: ego-browser nodejs < tests/browser-check.mjs
const assert = (await import("node:assert/strict")).default;
const task = await taskSpace(process.env.SENSEI_BROWSER_SPACE_ID ? Number(process.env.SENSEI_BROWSER_SPACE_ID) : "String Sensei preview checks");
const page = task.page("p1");
const checks = [];
console.log({ spaceId: task.spaceId });
await page.cdp("Emulation.setFocusEmulationEnabled", { enabled: true });
await page.cdp("Page.addScriptToEvaluateOnNewDocument", { source: `
  window.__errors = [];
  addEventListener("error", e => window.__errors.push(e.message));
  addEventListener("unhandledrejection", e => window.__errors.push(String(e.reason)));
` });
await page.goto("http://localhost:4173");
await page.evaluate(() => localStorage.removeItem("string-sensei-preferences"));
await page.reload();

async function check(name, fn) {
  await fn();
  checks.push(name);
  console.log(`PASS ${name}`);
}

async function syntheticMic() {
  await page.evaluate(() => {
    window.__fixtureFrequency = null;
    navigator.mediaDevices.getUserMedia = async () => {
      const context = new AudioContext();
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      const destination = context.createMediaStreamDestination();
      oscillator.connect(gain);
      gain.connect(destination);
      gain.gain.value = 0.05;
      const frequencies = [82.406889, 110, 146.832384, 195.997718, 246.941651, 329.627557];
      const update = () => {
        const selected = document.querySelector("#string-mode").value;
        oscillator.frequency.value = window.__fixtureFrequency ?? frequencies[Number(selected.split(":")[1] ?? 5)];
      };
      update();
      const timer = setInterval(update, 20);
      oscillator.start();
      await context.resume();
      window.__stream = destination.stream;
      window.__cleanup = async () => {
        clearInterval(timer);
        oscillator.stop();
        destination.stream.getTracks().forEach(t => t.stop());
        await context.close();
      };
      return destination.stream;
    };
  });
}

await check("responsive layout and rendered assets", async () => {
  for (const [width, height] of [[320, 568], [390, 844], [743, 1309], [768, 1024], [1280, 800]]) {
    await page.cdp("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: width < 768 });
    const result = await page.evaluate(() => ({
      overflow: document.documentElement.scrollWidth > innerWidth,
      images: [...document.images].every(i => i.complete && i.naturalWidth > 0),
      startBottom: document.querySelector("#start-button").getBoundingClientRect().bottom,
      height: innerHeight,
      mascotWidth: document.querySelector(".mascot-wrap").getBoundingClientRect().width
    }));
    assert.equal(result.overflow, false, `${width}px horizontal overflow`);
    assert.equal(result.images, true, "missing image");
    assert.ok(result.startBottom <= result.height, `${width}px start button below fold`);
    assert.ok(result.mascotWidth >= 220, `${width}px mascot reduced to a thumbnail`);
    await page.screenshot({ path: `/tmp/string-sensei-preview-${width}.png` });
  }
});

await check("A4 changes preserve a manually selected string", async () => {
  await page.selectOption("#string-mode", "standard:1");
  await page.fill("#calibration", "441");
  await page.press("#calibration", "Tab");
  assert.equal(await page.evaluate(() => document.querySelector("#string-mode").value), "standard:1");
  assert.equal(await page.evaluate(() => document.querySelector("#current-string").textContent), "String 5: A (A2)");
});

await check("guided selection does not leak into saved manual preferences", async () => {
  await page.click("#guided-button");
  assert.equal(await page.evaluate(() => document.querySelector("#string-mode").value), "standard:0");
  await page.reload();
  assert.deepEqual(await page.evaluate(() => ({ hidden: document.querySelector("#guided-panel").hidden, mode: document.querySelector("#string-mode").value })), { hidden: true, mode: "standard:1" });
  await page.evaluate(() => localStorage.setItem("string-sensei-preferences", JSON.stringify({ tuningId: "standard", stringMode: "standard:0", calibrationHz: 440 })));
  await page.reload();
  assert.equal(await page.evaluate(() => document.querySelector("#string-mode").value), "auto");
});

await check("guided instruction and meter fit together on a phone", async () => {
  await page.cdp("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await page.click("#guided-button");
  const result = await page.evaluate(() => ({
    guideBottom: document.querySelector("#guided-panel").getBoundingClientRect().bottom,
    meterBottom: document.querySelector(".meter").getBoundingClientRect().bottom,
    messageClipped: document.querySelector("#status-message").scrollHeight > document.querySelector("#status-message").clientHeight + 1,
    height: innerHeight
  }));
  assert.ok(result.guideBottom < result.height && result.meterBottom < result.height);
  assert.equal(result.messageClipped, false);
  await page.screenshot({ path: "/tmp/string-sensei-preview-guide.png" });
  await page.click("#guided-button");
});

await check("permission errors remain readable and permit retry", async () => {
  await page.evaluate(() => { navigator.mediaDevices.getUserMedia = async () => { throw new DOMException("Denied fixture", "NotAllowedError"); }; });
  await page.click("#start-button");
  await page.waitForFunction(() => document.querySelector(".status-panel").dataset.status === "error");
  for (const width of [320, 390]) {
    await page.cdp("Emulation.setDeviceMetricsOverride", { width, height: 844, deviceScaleFactor: 1, mobile: true });
    const result = await page.evaluate(() => {
      const message = document.querySelector("#status-message");
      return { clipped: message.scrollHeight > message.clientHeight + 1, disabled: document.querySelector("#start-button").disabled, settingsHidden: document.querySelector("#mic-settings").hidden };
    });
    assert.deepEqual(result, { clipped: false, disabled: false, settingsHidden: true });
  }
});

await check("cancelled late microphone requests stop their tracks", async () => {
  await page.evaluate(() => { navigator.mediaDevices.getUserMedia = () => new Promise(resolve => { window.__resolveMic = resolve; }); });
  await page.click("#start-button");
  await page.waitForFunction(() => Boolean(window.__resolveMic));
  await page.click("#stop-button");
  await page.evaluate(() => {
    const context = new AudioContext();
    window.__lateContext = context;
    window.__lateStream = context.createMediaStreamDestination().stream;
    window.__resolveMic(window.__lateStream);
  });
  await page.waitForFunction(() => window.__lateStream.getTracks().every(t => t.readyState === "ended"));
  await page.evaluate(() => window.__lateContext.close());
  assert.equal(await page.evaluate(() => document.querySelector("#stop-button").hidden), true);
});

await check("audio setup failure releases the acquired microphone", async () => {
  await page.reload();
  await page.evaluate(() => {
    const NativeAudioContext = window.AudioContext;
    window.AudioContext = class extends NativeAudioContext { createAnalyser() { throw new Error("Fixture setup failure"); } };
    navigator.mediaDevices.getUserMedia = async () => {
      window.__failureContext = new NativeAudioContext();
      window.__failureStream = window.__failureContext.createMediaStreamDestination().stream;
      return window.__failureStream;
    };
  });
  await page.click("#start-button");
  await page.waitForFunction(() => document.querySelector(".status-panel").dataset.status === "error");
  assert.equal(await page.evaluate(() => window.__failureStream.getTracks().every(t => t.readyState === "ended")), true);
  await page.evaluate(() => window.__failureContext.close());
  await page.reload();
});

await check("large Sensei reactions render for flat, sharp, and tuned notes", async () => {
  await page.selectOption("#string-mode", "standard:1");
  await syntheticMic();
  await page.evaluate(() => { window.__fixtureFrequency = 107.5; });
  await page.click("#start-button");
  for (const [frequency, expected] of [[107.5, "flat"], [112.5, "sharp"], [110, "tuned"]]) {
    await page.evaluate(f => { window.__fixtureFrequency = f; }, frequency);
    await page.waitForFunction(status => {
      const img = document.querySelector("#mascot img");
      return document.querySelector(".status-panel").dataset.status === status && img.complete && img.naturalWidth > 0 && img.src.includes(`sensei-${status}`);
    }, expected);
    assert.ok(await page.evaluate(() => document.querySelector(".mascot-wrap").getBoundingClientRect().width >= 220));
    await page.screenshot({ path: `/tmp/string-sensei-reaction-${expected}.png` });
  }
  await page.click("#stop-button");
  await page.evaluate(() => window.__cleanup());
  await page.selectOption("#string-mode", "auto");
});

await check("six-string guided completion persists and turns the mic off", async () => {
  await syntheticMic();
  await page.click("#guided-button");
  await page.click("#start-button");
  await page.waitForFunction(() => document.querySelector("#status-title").textContent === "All Set", undefined, { timeout: 20000 });
  await page.evaluate(() => new Promise(resolve => { let frames = 0; const tick = () => ++frames >= 20 ? resolve() : requestAnimationFrame(tick); requestAnimationFrame(tick); }));
  assert.deepEqual(await page.evaluate(() => ({
    title: document.querySelector("#status-title").textContent,
    dots: document.querySelectorAll(".guided-dot.is-complete").length,
    ended: window.__stream.getTracks().every(t => t.readyState === "ended"),
    stopHidden: document.querySelector("#stop-button").hidden,
    restart: document.querySelector("#guided-button").textContent
  })), { title: "All Set", dots: 6, ended: true, stopHidden: true, restart: "Start Over" });
  await page.screenshot({ path: "/tmp/string-sensei-preview-complete.png" });
  await page.evaluate(() => window.__cleanup());
});

await check("pause recovery and reference tones release microphone capture", async () => {
  await syntheticMic();
  await page.click("#start-button");
  await page.waitForFunction(() => !document.querySelector("#stop-button").hidden && document.querySelector("#stop-button").textContent === "Stop");
  await page.evaluate(() => window.StringSensei.pause());
  assert.equal(await page.evaluate(() => window.__stream.getTracks().every(t => t.readyState === "ended")), true);
  assert.equal(await page.evaluate(() => document.querySelector("#status-title").textContent), "Tuning Paused");
  await page.evaluate(() => window.__cleanup());
  await syntheticMic();
  await page.click("#start-button");
  await page.waitForFunction(() => !document.querySelector("#start-button").disabled);
  await page.click("[data-tone='A2']");
  await page.waitForFunction(() => document.querySelector("[data-tone='A2']").getAttribute("aria-pressed") === "true");
  assert.equal(await page.evaluate(() => window.__stream.getTracks().every(t => t.readyState === "ended")), true);
  await page.click("[data-tone='A2']");
  await page.evaluate(() => window.__cleanup());
});

await check("accessible meter and persisted Calm Mode", async () => {
  assert.deepEqual(await page.evaluate(() => ({ role: document.querySelector(".meter").getAttribute("role"), live: document.querySelector("#tuning-announcement").getAttribute("aria-live"), chaosLive: document.querySelector("#chaos-output").getAttribute("aria-live") })), { role: "meter", live: "polite", chaosLive: null });
  await page.click("#calm-mode");
  await page.reload();
  assert.equal(await page.evaluate(() => document.body.classList.contains("calm-mode") && document.querySelector("#calm-mode").checked), true);
  assert.deepEqual(await page.evaluate(() => window.__errors), []);
  await page.click("#calm-mode");
});

await check("Android bridge recovery and service-worker exclusion", async () => {
  const preload = await page.cdp("Page.addScriptToEvaluateOnNewDocument", { source: `
    window.__settingsOpened = 0;
    window.StringSenseiAndroid = { openSettings() { window.__settingsOpened++; }, setTuningActive() {} };
    navigator.mediaDevices.getUserMedia = async () => { throw new DOMException("Denied fixture", "NotAllowedError"); };
  ` });
  await page.goto("http://127.0.0.1:4173");
  await page.click("#start-button");
  await page.waitForFunction(() => !document.querySelector("#mic-settings").hidden);
  assert.match(await page.evaluate(() => document.querySelector("#status-message").textContent), /App Settings/);
  await page.click("#mic-settings");
  assert.equal(await page.evaluate(() => window.__settingsOpened), 1);
  assert.equal(await page.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).length), 0);
  assert.deepEqual(await page.evaluate(() => window.__errors), []);
  await page.cdp("Page.removeScriptToEvaluateOnNewDocument", { identifier: preload.identifier });
});

await check("installed PWA reopens offline with its controls and assets", async () => {
  await page.goto("http://localhost:4173");
  await page.waitForFunction(async () => Boolean(await navigator.serviceWorker.ready) && Boolean(navigator.serviceWorker.controller));
  await page.cdp("Network.enable", {});
  await page.cdp("Network.emulateNetworkConditions", { offline: true, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  try {
    await page.reload();
    await page.waitForFunction(() => document.querySelector("#tuning-preset").options.length === 5);
    assert.equal(await page.evaluate(() => [...document.images].every(i => i.complete && i.naturalWidth > 0)), true);
    assert.deepEqual(await page.evaluate(() => window.__errors), []);
  } finally {
    await page.cdp("Network.emulateNetworkConditions", { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  }
});

await page.cdp("Emulation.clearDeviceMetricsOverride", {});
await page.cdp("Emulation.setFocusEmulationEnabled", { enabled: false });
await page.goto("http://localhost:4173");
await task.finish({ keep: ["p1"] });
console.log(JSON.stringify({ passed: checks.length, checks }));
