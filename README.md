# String Sensei

String Sensei is a manga-inspired browser and Android guitar tuner with a real microphone pitch detector, clear tuning guidance, reference tones, and an original animated mascot.

## Tech Stack

- Browser app: HTML, CSS, JavaScript, Web Audio API, YIN-style pitch detection, and a versioned service worker for PWA caching.
- Android app: Java, Android SDK, Gradle, and a secure local WebView shell with native microphone permission handling.
- Testing: Node.js built-in test runner with generated pitch fixtures.

## What It Does

- Requests microphone access only after the user clicks **Start Tuning**.
- Uses the Web Audio API and a YIN pitch detector in the browser.
- Shows detected frequency, target string, cents difference, and flat/perfect/sharp state.
- Supports standard, half-step down, drop D, DADGAD, and open G tuning.
- Includes A4 calibration from 430 Hz to 450 Hz.
- Includes a guided six-string tuning flow.
- Runs as a static app and can be installed as a PWA.

## Privacy

Audio is analyzed locally in the browser tab. This repo has no backend and does not upload, store, or transmit raw microphone audio.

## Run Locally

```bash
npm run dev
```

Open [http://localhost:4173](http://localhost:4173).

No environment variables or backend services are required. Microphone access works on `localhost` during development. In production, deploy over HTTPS.

## Test

```bash
npm test
```

The tests cover note frequency generation, tuning thresholds, alternate tuning target selection, and generated sine-wave pitch detection fixtures.

## Android App

The `android/` directory contains a native Android shell that packages the same tuner UI and local Web Audio/YIN detector for offline use. It requests microphone permission through Android and keeps audio analysis on-device.

```bash
cd android
./gradlew assembleDebug
```

The debug APK is written to `android/app/build/outputs/apk/debug/app-debug.apk`.

## Deploy

This is a static app. Deploy the repository root to Netlify, Vercel, GitHub Pages, Cloudflare Pages, or any static host.

Included configs:

- `netlify.toml`
- `vercel.json`

Production requirements:

- Serve over HTTPS so browsers allow microphone access.
- Do not add server-side audio collection unless the privacy copy is changed.
- Keep `service-worker.js` cache versioned when shipping asset changes.

## Browser Notes

Best results:

- Use Chrome, Edge, Safari, or Firefox on a modern device.
- Tune in a quiet room.
- Pluck one string at a time and mute the others.
- Move the guitar closer to the microphone if the app reports low volume.
- Use calibration when matching another tuner, piano, or rehearsal-room reference.

## Current Product Boundary

String Sensei is currently a focused consumer tuner. It does not include accounts, billing, teacher dashboards, analytics, or backend storage.
