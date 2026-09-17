# String Sensei Android

This directory contains the Android app shell for String Sensei. The existing browser tuner remains the source of truth for the UI and Web Audio/YIN pitch detection; the Android app packages those assets into an offline `WebView` with a secure local origin.

## Build

From this directory:

```bash
./gradlew assembleDebug
```

The debug APK is written to `app/build/outputs/apk/debug/app-debug.apk`.

The build copies only the web app's `index.html`, `manifest.webmanifest`, `service-worker.js`, `assets/`, and `src/` into the APK. No server or network connection is required to run the tuner.

## Device behavior

- Android requests microphone permission when **Start Tuning** is tapped.
- The embedded page uses an HTTPS-like local WebView origin so browser microphone APIs remain available.
- Audio stays on-device and is analyzed by the existing JavaScript pitch detector.
- External support links open in the device browser.
