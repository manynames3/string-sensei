// Install a debug APK first, then run with SENSEI_ADB=/path/to/adb node tests/android-check.mjs.
// Uses a disposable emulator, its permission flags, and debug-only WebView inspection.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";

const packageName = "com.supremeaiventures.stringsensei";
const device = process.env.SENSEI_ANDROID_DEVICE ?? "emulator-5554";
assert.ok(device.startsWith("emulator-"), "Run these checks on a disposable emulator.");
const adbPath = process.env.SENSEI_ADB ?? "adb";
const adb = (...args) => execFileSync(adbPath, ["-s", device, ...args], { encoding: "utf8", timeout: 15000 });
const shell = (...args) => adb("shell", ...args);
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const originalRotation = shell("settings", "get", "system", "user_rotation").trim();
const originalAutoRotation = shell("settings", "get", "system", "accelerometer_rotation").trim();
const originalFontScale = shell("settings", "get", "system", "font_scale").trim();
let socket;
let forwarded = false;
let sequence = 0;
const pending = new Map();
const passed = [];

function cdp(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++sequence;
    const timeout = setTimeout(() => { pending.delete(id); reject(new Error(`CDP timed out: ${method}`)); }, 10000);
    pending.set(id, { resolve, reject, timeout });
    socket.send(JSON.stringify({ id, method, params }));
  });
}

async function connect() {
  socket?.close();
  let pid;
  for (let attempt = 0; attempt < 40; attempt++) {
    try { pid = shell("pidof", packageName).trim(); } catch {}
    if (pid) break;
    await delay(100);
  }
  assert.ok(pid, "Android application process did not start");
  adb("forward", "tcp:9223", `localabstract:webview_devtools_remote_${pid}`);
  forwarded = true;
  let target;
  for (let attempt = 0; attempt < 40; attempt++) {
    try {
      target = (await (await fetch("http://127.0.0.1:9223/json/list")).json()).find(t => t.url.includes("appassets.androidplatform.net"));
      if (target) break;
    } catch {}
    await delay(100);
  }
  assert.ok(target, "No debuggable WebView found");
  socket = new WebSocket(target.webSocketDebuggerUrl);
  socket.addEventListener("message", event => {
    const message = JSON.parse(event.data);
    const request = pending.get(message.id);
    if (!request) return;
    clearTimeout(request.timeout);
    pending.delete(message.id);
    if (message.error) request.reject(new Error(message.error.message));
    else request.resolve(message.result);
  });
  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });
  return target;
}

async function evaluate(fn) {
  const result = await cdp("Runtime.evaluate", { expression: `(${fn})()`, returnByValue: true, awaitPromise: true, userGesture: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
  return result.result.value;
}

async function waitFor(fn, label) {
  for (let attempt = 0; attempt < 80; attempt++) {
    if (await evaluate(fn)) return;
    await delay(100);
  }
  const state = await evaluate(() => ({ title: document.querySelector("#status-title")?.textContent, message: document.querySelector("#status-message")?.textContent, hidden: document.hidden, startDisabled: document.querySelector("#start-button")?.disabled }));
  throw new Error(`Android state did not arrive: ${label}; ${JSON.stringify(state)}`);
}

async function check(name, fn) {
  if (process.env.SENSEI_ANDROID_CHECK && !name.includes(process.env.SENSEI_ANDROID_CHECK)) return;
  await fn();
  passed.push(name);
  console.log(`PASS ${name}`);
}

try {
  shell("am", "force-stop", packageName);
  shell("pm", "revoke", packageName, "android.permission.RECORD_AUDIO");
  shell("pm", "set-permission-flags", packageName, "android.permission.RECORD_AUDIO", "user-set", "user-fixed");
  shell("am", "start", "-W", "-f", "0x10008000", "-n", `${packageName}/.MainActivity`);
  await connect();
  await waitFor(() => Boolean(window.StringSensei && document.querySelector("#tuning-preset")?.options.length), "initial render");

  await check("local assets, native bridge, and system-bar insets", async () => {
    const rendered = (await (await fetch("http://127.0.0.1:9223/json/list")).json()).find(t => t.url.includes("appassets.androidplatform.net"));
    assert.ok(JSON.parse(rendered.description).screenY > 0, "Content overlaps the status bar");
    assert.deepEqual(await evaluate(() => ({ secure: isSecureContext, bridge: typeof StringSenseiAndroid.openSettings, images: [...document.images].every(i => i.complete && i.naturalWidth > 0), overflow: document.documentElement.scrollWidth > innerWidth })), { secure: true, bridge: "function", images: true, overflow: false });
    assert.equal(await evaluate(async () => "serviceWorker" in navigator ? (await navigator.serviceWorker.getRegistrations()).length : 0), 0);
  });

  await check("denied native microphone permission offers Android settings", async () => {
    await evaluate(() => document.querySelector("#start-button").click());
    await waitFor(() => !document.querySelector("#mic-settings").hidden, "permission error");
    assert.match(await evaluate(() => document.querySelector("#status-message").textContent), /App Settings/);
    assert.equal(await evaluate(() => document.querySelector("#start-button").disabled), false);
    await evaluate(() => document.querySelector("#mic-settings").click());
    await delay(500);
    const activities = shell("dumpsys", "activity", "activities");
    const resumed = activities.split("\n").find(line => /(?:mResumedActivity|topResumedActivity)[=:]/.test(line));
    assert.match(resumed ?? "", /com.android.settings/);
    shell("input", "keyevent", "KEYCODE_BACK");
    await waitFor(() => !document.hidden, "return from app settings");
  });

  await check("rotation preserves the selected guided string and page", async () => {
    shell("settings", "put", "system", "accelerometer_rotation", "0");
    await evaluate(() => { window.__rotationMarker = 42; document.querySelector("#guided-button").click(); });
    shell("settings", "put", "system", "user_rotation", "1");
    await waitFor(() => innerWidth > innerHeight, "landscape rotation");
    assert.deepEqual(await evaluate(() => ({ marker: window.__rotationMarker, hidden: document.querySelector("#guided-panel").hidden, selected: document.querySelector("#string-mode").value })), { marker: 42, hidden: false, selected: "standard:0" });
    shell("settings", "put", "system", "user_rotation", "0");
    await waitFor(() => innerHeight > innerWidth, "portrait rotation");
    await evaluate(() => document.querySelector("#guided-button").click());
  });

  await check("native microphone starts and backgrounding pauses capture", async () => {
    shell("pm", "clear-permission-flags", packageName, "android.permission.RECORD_AUDIO", "user-set", "user-fixed");
    shell("pm", "grant", packageName, "android.permission.RECORD_AUDIO");
    await evaluate(() => document.querySelector("#start-button").click());
    await waitFor(() => document.querySelector("#start-button").hidden && !document.querySelector("#stop-button").hidden, "microphone start");
    const windows = shell("dumpsys", "window", "windows");
    assert.match(windows, /KEEP_SCREEN_ON/);
    shell("input", "keyevent", "KEYCODE_HOME");
    await delay(300);
    shell("am", "start", "-W", "-n", `${packageName}/.MainActivity`);
    await waitFor(() => document.querySelector("#status-title").textContent === "Tuning Paused", "resume prompt");
    assert.equal(await evaluate(() => document.querySelector("#stop-button").hidden), true);
  });

  await check("system font scaling increases rendered text without overflow", async () => {
    await evaluate(() => document.querySelector("#start-button").click());
    await waitFor(() => document.querySelector("#start-button").hidden, "second microphone start");
    await evaluate(() => document.querySelector("#stop-button").click());
    const normalHeight = await evaluate(() => document.querySelector("#status-title").getBoundingClientRect().height);
    shell("settings", "put", "system", "font_scale", "1.3");
    await delay(500);
    await connect();
    await waitFor(() => Boolean(document.querySelector("#status-title")), "scaled render");
    const scaled = await evaluate(() => ({ height: document.querySelector("#status-title").getBoundingClientRect().height, overflow: document.documentElement.scrollWidth > innerWidth }));
    assert.ok(scaled.height > normalHeight, "System font scale was ignored");
    assert.equal(scaled.overflow, false);
  });

  await check("first-use Android permission dialog grants microphone capture", async () => {
    shell("pm", "revoke", packageName, "android.permission.RECORD_AUDIO");
    shell("pm", "clear-permission-flags", packageName, "android.permission.RECORD_AUDIO", "user-set", "user-fixed");
    shell("am", "start", "-W", "-f", "0x10008000", "-n", `${packageName}/.MainActivity`);
    await connect();
    await waitFor(() => Boolean(window.StringSensei), "first-use render");
    await evaluate(() => document.querySelector("#start-button").click());
    const dumpPath = `/sdcard/string-sensei-permission-${Date.now()}.xml`;
    let xml;
    for (let attempt = 0; attempt < 3; attempt++) {
      const output = shell("uiautomator", "dump", dumpPath);
      if (output.includes("dumped to:")) {
        xml = adb("exec-out", "cat", dumpPath);
        break;
      }
      await delay(300);
    }
    assert.ok(xml, "Permission dialog did not provide a fresh UI snapshot");
    const nodes = JSON.parse(execFileSync("python3", ["-c", "import sys,json,xml.etree.ElementTree as ET; print(json.dumps([n.attrib for n in ET.fromstring(sys.stdin.read()).iter('node') if n.get('clickable') == 'true']))"], { input: xml, encoding: "utf8", timeout: 5000 }));
    const allow = nodes.find(n => /permission_allow_foreground_only_button$|permission_allow_button$/.test(n["resource-id"]));
    assert.ok(allow, `Microphone dialog missing: ${nodes.map(n => n.text).join(", ")}`);
    const [left, top, right, bottom] = allow.bounds.match(/\d+/g).map(Number);
    shell("input", "tap", String(Math.round((left + right) / 2)), String(Math.round((top + bottom) / 2)));
    await waitFor(() => document.querySelector("#start-button").hidden && document.querySelector("#stop-button").textContent === "Stop", "first-use capture");
    await evaluate(() => document.querySelector("#stop-button").click());
    assert.equal(await evaluate(() => document.querySelector("#stop-button").hidden), true);
  });
  console.log(JSON.stringify({ passed: passed.length, checks: passed }));
} finally {
  socket?.close();
  for (const request of pending.values()) clearTimeout(request.timeout);
  shell("settings", "put", "system", "font_scale", originalFontScale === "null" ? "1.0" : originalFontScale);
  shell("settings", "put", "system", "user_rotation", originalRotation === "null" ? "0" : originalRotation);
  shell("settings", "put", "system", "accelerometer_rotation", originalAutoRotation === "null" ? "1" : originalAutoRotation);
  if (forwarded) adb("forward", "--remove", "tcp:9223");
}
