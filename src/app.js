import {
  cycleStateMessage,
  getChaosLine,
  getStateCopy,
  renderMascot,
  renderStringOptions,
  renderToneButtons,
  renderTuningOptions
} from "./components.js?v=41";
import {
  DEFAULT_CALIBRATION_HZ,
  formatCents,
  formatFrequency,
  getFrequencyRange,
  getTuningTargets,
  normalizeCalibration
} from "./notes.js?v=41";
import { detectPitchYin, PitchSmoother } from "./pitchDetection.js?v=41";
import { centsToMeterPercent, getTuningReading, TuningHold, TUNER_STATES } from "./tunerLogic.js?v=41";

const PREFERENCES_KEY = "string-sensei-preferences";
const ANALYSIS_INTERVAL_MS = 1000 / 30;
const ANALYSER_FFT_SIZE = 8192;
const MIC_INPUT_BOOST = 8;
const PITCH_RMS_THRESHOLD = 0.00008;
const PITCH_YIN_THRESHOLD = 0.2;
const PITCH_ANALYSIS_SIZE = 3072;
const MISSED_PITCH_MS_BEFORE_READING = 600;
const MISSED_PITCH_MS_AFTER_READING = 1800;
const CHAOS_ROTATION_MS = 4200;
const IS_ANDROID = Boolean(window.StringSenseiAndroid);

const elements = {
  panel: document.querySelector(".status-panel"),
  mascot: document.querySelector("#mascot"),
  kicker: document.querySelector("#status-kicker"),
  title: document.querySelector("#status-title"),
  message: document.querySelector("#status-message"),
  frequency: document.querySelector("#frequency"),
  targetNote: document.querySelector("#target-note"),
  cents: document.querySelector("#cents"),
  needle: document.querySelector("#meter-needle"),
  meter: document.querySelector(".meter"),
  announcement: document.querySelector("#tuning-announcement"),
  currentString: document.querySelector("#current-string"),
  micSettings: document.querySelector("#mic-settings"),
  calmMode: document.querySelector("#calm-mode"),
  startButton: document.querySelector("#start-button"),
  stopButton: document.querySelector("#stop-button"),
  guidedButton: document.querySelector("#guided-button"),
  guidedPanel: document.querySelector("#guided-panel"),
  guidedTitle: document.querySelector("#guided-title"),
  guidedCopy: document.querySelector("#guided-copy"),
  guidedDots: document.querySelector("#guided-dots"),
  tuningPreset: document.querySelector("#tuning-preset"),
  calibration: document.querySelector("#calibration"),
  stringMode: document.querySelector("#string-mode"),
  toneButtons: document.querySelector("#tone-buttons"),
  chaosOutput: document.querySelector("#chaos-output")
};

const state = {
  audioContext: null,
  analyser: null,
  stream: null,
  source: null,
  inputGain: null,
  data: null,
  animationFrame: null,
  smoother: new PitchSmoother({ maxSamples: 6, maxJumpCents: 80 }),
  currentState: TUNER_STATES.IDLE,
  lastReading: null,
  startId: 0,
  starting: false,
  lastPitchAt: 0,
  lastAnalysisAt: 0,
  lastAnnouncementAt: 0,
  announcementKey: "",
  toneContext: null,
  lastMessageTick: 0,
  lastChaosTick: 0,
  lastChaosState: null,
  guided: {
    active: false,
    currentIndex: 0,
    hold: new TuningHold(),
    complete: false,
    previousString: "auto",
    completed: new Set()
  }
};

initializeApp();

elements.startButton.addEventListener("click", startTuning);
elements.stopButton.addEventListener("click", () => stopTuning());
elements.guidedButton.addEventListener("click", toggleGuidedMode);
elements.toneButtons.addEventListener("click", playReferenceTone);
elements.tuningPreset.addEventListener("change", () => {
  clearCompletion();
  stopGuidedMode();
  refreshControls("auto");
  savePreferences();
  state.smoother.reset();
  refreshChaosLine({ force: true });
});
elements.calibration.addEventListener("change", () => {
  clearCompletion();
  elements.calibration.value = formatCalibration(normalizeCalibration(elements.calibration.value));
  refreshControls(elements.stringMode.value);
  savePreferences();
  state.smoother.reset();
  refreshChaosLine({ force: true });
});
elements.calibration.addEventListener("input", () => {
  if (!elements.calibration.value) return;
  clearCompletion();
  refreshControls(elements.stringMode.value);
  savePreferences();
  state.smoother.reset();
  refreshChaosLine({ force: true });
});
elements.stringMode.addEventListener("change", () => {
  clearCompletion();
  savePreferences();
  state.smoother.reset();
  state.lastReading = null;
  resetReadouts();
  refreshChaosLine({ force: true });
});
elements.micSettings.addEventListener("click", () => window.StringSenseiAndroid?.openSettings());
elements.calmMode.addEventListener("change", () => {
  document.body.classList.toggle("calm-mode", elements.calmMode.checked);
  savePreferences();
});
document.addEventListener("visibilitychange", () => {
  if (document.hidden) pauseTuning();
});
window.StringSensei = { pause: pauseTuning };
window.setInterval(() => refreshChaosLine(), CHAOS_ROTATION_MS);

function initializeApp() {
  const preferences = loadPreferences();
  elements.tuningPreset.innerHTML = renderTuningOptions(preferences.tuningId);
  elements.tuningPreset.value = preferences.tuningId;
  elements.calibration.value = formatCalibration(preferences.calibrationHz);
  elements.calmMode.checked = preferences.calmMode;
  document.body.classList.toggle("calm-mode", preferences.calmMode);
  refreshControls(preferences.stringMode);
  setVisualState(TUNER_STATES.IDLE);
  registerServiceWorker();
}

async function startTuning() {
  if (state.starting || state.stream) return;
  if (state.guided.complete) stopGuidedMode();
  stopReferenceTone();
  elements.micSettings.hidden = true;
  if (!window.isSecureContext) {
    setVisualState(TUNER_STATES.ERROR, {
      title: "Secure Page Needed",
      message: "Microphone access requires HTTPS in production. Use the deployed HTTPS URL, or localhost while developing."
    });
    return;
  }

  if (!navigator.mediaDevices?.getUserMedia || (!window.AudioContext && !window.webkitAudioContext)) {
    setVisualState(TUNER_STATES.ERROR, {
      title: "Tuner Unavailable",
      kicker: "Browser support",
      message: "This browser does not support microphone pitch detection. Try a current Chrome, Edge, Safari, or Firefox build."
    });
    return;
  }

  const requestId = ++state.startId;
  let stream;
  let audioContext;
  try {
    state.starting = true;
    elements.startButton.disabled = true;
    elements.stopButton.hidden = false;
    elements.stopButton.textContent = "Cancel";
    setVisualState(TUNER_STATES.LISTENING, {
      kicker: "Microphone permission",
      title: "Allow Microphone",
      message: "Allow microphone access to tune. Your audio stays on this device."
    });

    // Create and resume during the tap so Safari retains user activation.
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    audioContext = new AudioContextClass();
    state.audioContext = audioContext;
    if (audioContext.state === "suspended") {
      let timeout;
      try {
        await Promise.race([
          audioContext.resume(),
          new Promise((_, reject) => {
            timeout = setTimeout(() => reject(new Error("Audio did not resume")), 8000);
          })
        ]);
      } finally {
        clearTimeout(timeout);
      }
    }
    if (requestId !== state.startId) return;

    stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: true,
        channelCount: 1
      }
    });

    if (requestId !== state.startId || document.hidden) {
      stream.getTracks().forEach((track) => track.stop());
      if (requestId === state.startId) pauseTuning();
      return;
    }
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = ANALYSER_FFT_SIZE;
    analyser.smoothingTimeConstant = 0;

    const source = audioContext.createMediaStreamSource(stream);
    const inputGain = audioContext.createGain();
    inputGain.gain.value = MIC_INPUT_BOOST;
    source.connect(inputGain);
    inputGain.connect(analyser);

    state.audioContext = audioContext;
    state.analyser = analyser;
    state.stream = stream;
    state.source = source;
    state.inputGain = inputGain;
    state.data = new Float32Array(analyser.fftSize);
    state.smoother.reset();
    state.lastPitchAt = performance.now();
    state.lastAnalysisAt = 0;
    state.starting = false;
    stream.getAudioTracks().forEach((track) => {
      track.addEventListener("ended", () => {
        if (state.stream === stream) pauseTuning("Microphone disconnected. Reconnect it and tap Start Tuning.");
      });
      track.addEventListener("mute", () => {
        if (state.stream === stream) pauseTuning("Microphone interrupted. Tap Start Tuning when it is available.");
      });
    });
    audioContext.addEventListener("statechange", () => {
      if (state.audioContext === audioContext && state.stream && audioContext.state !== "running") pauseTuning();
    });

    elements.startButton.hidden = true;
    elements.stopButton.hidden = false;
    elements.stopButton.textContent = "Stop";
    elements.startButton.disabled = false;
    elements.stopButton.focus({ preventScroll: true });
    window.StringSenseiAndroid?.setTuningActive(true);
    setVisualState(TUNER_STATES.LISTENING);
    listen();
  } catch (error) {
    stream?.getTracks().forEach((track) => track.stop());
    if (requestId !== state.startId) return;
    stopTuning();
    const denied = error?.name === "NotAllowedError";
    elements.micSettings.hidden = !(denied && IS_ANDROID);
    setVisualState(TUNER_STATES.ERROR, {
      title: denied ? "Mic Permission Needed" : "Microphone Unavailable",
      kicker: denied ? "Allow access to continue" : "Try again",
      message: denied
        ? IS_ANDROID
          ? "Allow microphone access in App Settings, then return and tap Start Tuning."
          : "Allow microphone access in this site's browser permissions, then tap Start Tuning."
        : "Check that a microphone is connected and not in use by another app, then try again."
    });
  } finally {
    if (requestId === state.startId) state.starting = false;
    if (audioContext && audioContext !== state.audioContext) audioContext.close().catch(() => {});
  }
}

function listen(timestamp = performance.now()) {
  if (!state.analyser || !state.data || !state.audioContext) return;
  state.animationFrame = requestAnimationFrame(listen);
  if (timestamp - state.lastAnalysisAt < ANALYSIS_INTERVAL_MS) return;
  state.lastAnalysisAt = timestamp;

  state.analyser.getFloatTimeDomainData(state.data);
  const settings = getSettings();
  const range = getFrequencyRange(settings.tuningId, settings.calibrationHz);
  const pitch = detectPitchYin(state.data, state.audioContext.sampleRate, {
    minFrequency: range.min,
    maxFrequency: range.max,
    rmsThreshold: PITCH_RMS_THRESHOLD,
    threshold: PITCH_YIN_THRESHOLD,
    analysisSize: PITCH_ANALYSIS_SIZE
  });

  if (pitch.frequency) {
    const smoothedFrequency = state.smoother.add(pitch.frequency);
    const reading = getTuningReading(smoothedFrequency, { ...settings, previousReading: state.lastReading });
    state.lastPitchAt = timestamp;
    updateFromReading(reading, timestamp);
  } else {
    state.guided.hold.reset();

    // Guitar notes decay unevenly, especially through laptop and phone mics.
    // Hold the last useful reading briefly instead of flashing a low-signal prompt.
    const missedPitchLimit = state.lastReading
      ? MISSED_PITCH_MS_AFTER_READING
      : MISSED_PITCH_MS_BEFORE_READING;

    if (timestamp - state.lastPitchAt > missedPitchLimit) {
      state.smoother.reset();
      state.lastReading = null;
      const nextState = pitch.reason === "quiet"
        ? TUNER_STATES.LISTENING
        : TUNER_STATES.NO_PITCH;
      if (state.currentState !== nextState) setVisualState(nextState);
      resetReadouts();
    }
  }

  if (state.stream && timestamp - state.lastMessageTick > 3600) {
    cycleStateMessage(state.currentState);
    setVisualState(state.currentState);
    state.lastMessageTick = timestamp;
  }

}

function updateFromReading(reading, timestamp) {
  if (!reading) {
    setVisualState(TUNER_STATES.NO_PITCH);
    return;
  }

  state.lastReading = reading;
  setVisualState(reading.state);
  elements.frequency.textContent = formatFrequency(reading.frequency);
  elements.targetNote.textContent = `${reading.target.id} ${reading.target.frequency.toFixed(2)} Hz`;
  elements.currentString.textContent = `String ${reading.target.stringNumber}: ${reading.target.label} (${reading.target.id})`;

  if (Number.isFinite(reading.cents)) {
    elements.cents.textContent = formatCents(reading.cents);
    elements.needle.style.left = `${centsToMeterPercent(reading.cents)}%`;
    elements.meter.setAttribute("aria-valuenow", String(Math.max(-15, Math.min(15, reading.cents))));
    elements.meter.setAttribute("aria-valuetext", `${reading.target.id}, ${formatCents(reading.cents)}, ${reading.instruction}`);
  } else {
    elements.cents.textContent = "-- cents";
    elements.needle.style.left = "50%";
  }

  const announcementKey = `${reading.target.key}:${reading.state}`;
  if (announcementKey !== state.announcementKey && timestamp - state.lastAnnouncementAt > 1200) {
    elements.announcement.textContent = Number.isFinite(reading.cents)
      ? `${reading.target.label}, ${formatCents(reading.cents)}. ${reading.instruction}.`
      : reading.instruction;
    state.announcementKey = announcementKey;
    state.lastAnnouncementAt = timestamp;
  }
  updateGuidedProgress(reading, timestamp);
}

function setVisualState(nextState, override = {}) {
  const previousTitle = elements.title.textContent;
  const shouldRenderMascot = state.currentState !== nextState || elements.mascot.children.length === 0;
  state.currentState = nextState;
  const copy = getStateCopy(nextState);

  elements.panel.dataset.status = nextState;
  if (shouldRenderMascot) {
    elements.mascot.innerHTML = renderMascot(nextState);
  }
  elements.kicker.textContent = override.kicker ?? copy.kicker;
  elements.title.textContent = override.title ?? copy.title;
  elements.message.textContent = override.message ?? copy.message;
  if (!state.lastReading && (shouldRenderMascot || previousTitle !== elements.title.textContent || override.message)) {
    elements.announcement.textContent = `${elements.title.textContent}. ${elements.message.textContent}`;
  }
  refreshChaosLine({ force: shouldRenderMascot });
}

function resetReadouts() {
  const selectedTarget = currentTargets().find((target) => target.key === elements.stringMode.value);
  elements.frequency.textContent = "-- Hz";
  elements.targetNote.textContent = selectedTarget
    ? `${selectedTarget.id} ${selectedTarget.frequency.toFixed(2)} Hz`
    : "Auto";
  elements.cents.textContent = "-- cents";
  elements.needle.style.left = "50%";
  elements.meter.setAttribute("aria-valuenow", "0");
  elements.meter.setAttribute("aria-valuetext", "Waiting for a note");
  elements.currentString.textContent = selectedTarget
    ? `String ${selectedTarget.stringNumber}: ${selectedTarget.label} (${selectedTarget.id})`
    : "Auto-detect: play one open string";
}

function stopTuning() {
  ++state.startId;
  state.starting = false;
  if (state.animationFrame) {
    cancelAnimationFrame(state.animationFrame);
  }

  const stream = state.stream;
  const context = state.audioContext;

  state.audioContext = null;
  state.analyser = null;
  state.stream = null;
  state.source = null;
  state.inputGain = null;
  state.data = null;
  state.animationFrame = null;
  state.smoother.reset();
  stream?.getTracks().forEach((track) => track.stop());
  context?.close().catch(() => {});
  window.StringSenseiAndroid?.setTuningActive(false);
  state.guided.hold.reset();
  state.lastReading = null;

  elements.startButton.hidden = false;
  elements.startButton.disabled = false;
  elements.startButton.textContent = "Start Tuning";
  elements.stopButton.hidden = true;
  elements.micSettings.hidden = true;
  setVisualState(TUNER_STATES.IDLE);
  resetReadouts();
}

function pauseTuning(message = "Tuning paused. Tap Start Tuning to continue.") {
  stopReferenceTone();
  if (!state.stream && !state.starting) return;
  stopTuning();
  setVisualState(TUNER_STATES.IDLE, { title: "Tuning Paused", kicker: "Microphone off", message });
}

function toggleGuidedMode() {
  if (state.guided.active) {
    stopGuidedMode();
  } else {
    startGuidedMode();
  }
}

function startGuidedMode() {
  const targets = currentTargets();
  state.guided.previousString = elements.stringMode.value;
  state.guided.active = true;
  state.guided.complete = false;
  state.guided.currentIndex = 0;
  state.guided.hold.reset();
  state.guided.completed = new Set();
  elements.guidedPanel.hidden = false;
  elements.guidedButton.textContent = "Exit Guide";
  elements.stringMode.value = targets[0].key;
  elements.stringMode.disabled = true;
  elements.tuningPreset.disabled = true;
  elements.calibration.disabled = true;
  state.smoother.reset();
  state.lastReading = null;
  updateGuidedPanel();
  resetReadouts();

  if (!state.audioContext) {
    setVisualState(TUNER_STATES.LISTENING, {
      title: "Guided Mode",
      kicker: "Microphone off",
      message: "Tap Start Tuning. Pluck the highlighted string and hold it steady."
    });
  }
}

function stopGuidedMode() {
  state.guided.active = false;
  state.guided.complete = false;
  state.guided.currentIndex = 0;
  state.guided.hold.reset();
  state.guided.completed = new Set();
  elements.guidedPanel.hidden = true;
  elements.guidedButton.textContent = "Guided Tune";
  elements.stringMode.disabled = false;
  elements.tuningPreset.disabled = false;
  elements.calibration.disabled = false;
  elements.stringMode.value = state.guided.previousString;
  savePreferences();
  resetReadouts();
}

function clearCompletion() {
  if (!state.guided.complete) return;
  state.guided.complete = false;
  state.guided.completed.clear();
  elements.guidedPanel.hidden = true;
  elements.guidedButton.textContent = "Guided Tune";
  elements.startButton.textContent = "Start Tuning";
  setVisualState(TUNER_STATES.IDLE);
}

function updateGuidedProgress(reading, timestamp) {
  if (!state.guided.active || !Number.isFinite(reading.cents)) return;

  const targets = currentTargets();
  const currentTarget = targets[state.guided.currentIndex];
  if (!currentTarget) return;

  // Guided locks stay within the advertised +/-5 cents, including hysteresis.
  const inTune = Math.abs(reading.cents) <= 5 && reading.target.key === currentTarget.key;
  if (!state.guided.hold.update(inTune, timestamp)) return;

  state.guided.completed.add(currentTarget.key);
  state.guided.hold.reset();
  state.guided.currentIndex += 1;

  if (state.guided.currentIndex >= targets.length) {
    finishGuidedMode();
    return;
  }

  elements.stringMode.value = targets[state.guided.currentIndex].key;
  state.smoother.reset();
  state.lastReading = null;
  updateGuidedPanel();
  resetReadouts();
}

function updateGuidedPanel() {
  const targets = currentTargets();
  const currentTarget = targets[state.guided.currentIndex] ?? targets[0];
  const completedCount = state.guided.completed.size;
  const isComplete = completedCount === targets.length;

  elements.guidedTitle.textContent = isComplete
    ? "All six strings are locked"
    : `Tune ${currentTarget.id} (${currentTarget.label})`;
  elements.guidedCopy.textContent = isComplete
    ? "Every string held steady inside +/-5 cents. That is the whole warm-up."
    : `Progress ${completedCount}/${targets.length}. Hold within +/-5 cents for a moment.`;
  elements.currentString.textContent = isComplete
    ? "All six strings checked"
    : `String ${currentTarget.stringNumber}: ${currentTarget.label} (${currentTarget.id})`;
  if (state.guided.active) elements.announcement.textContent = `Next: string ${currentTarget.stringNumber}, ${currentTarget.label}.`;
  elements.guidedDots.innerHTML = targets.map((target, index) => {
    const className = [
      "guided-dot",
      state.guided.completed.has(target.key) ? "is-complete" : "",
      index === state.guided.currentIndex && state.guided.active ? "is-current" : ""
    ].filter(Boolean).join(" ");

    return `<span class="${className}" title="${target.id}">${target.id}</span>`;
  }).join("");
}

function finishGuidedMode() {
  state.guided.active = false;
  state.guided.complete = true;
  stopTuning();
  elements.guidedButton.textContent = "Start Over";
  elements.startButton.textContent = "Tune Again";
  elements.stringMode.disabled = false;
  elements.tuningPreset.disabled = false;
  elements.calibration.disabled = false;
  elements.stringMode.value = state.guided.previousString;
  resetReadouts();
  updateGuidedPanel();
  savePreferences();
  setVisualState(TUNER_STATES.TUNED, {
    title: "All Set",
    kicker: "Microphone off",
    message: "All six strings held inside +/-5 cents. You're ready to play."
  });
}

function stopReferenceTone() {
  const context = state.toneContext;
  state.toneContext = null;
  context?.close().catch(() => {});
  elements.toneButtons.querySelectorAll("[aria-pressed]").forEach((button) => button.setAttribute("aria-pressed", "false"));
}

async function playReferenceTone(event) {
  const button = event.target.closest("[data-tone]");
  if (!button) return;

  const string = currentTargets().find((item) => item.id === button.dataset.tone);
  if (!string) return;

  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) {
    setVisualState(TUNER_STATES.ERROR, {
      title: "Tone Unavailable",
      kicker: "Browser support",
      message: "This browser cannot play reference tones because Web Audio is unavailable."
    });
    return;
  }

  const wasPlaying = button.getAttribute("aria-pressed") === "true";
  stopReferenceTone();
  if (wasPlaying) return;
  if (state.stream || state.starting) stopTuning();
  let context;
  try {
    context = new AudioContextClass();
    state.toneContext = context;
    if (context.state === "suspended") await context.resume();
    if (state.toneContext !== context) return;
    const oscillator = context.createOscillator();
    const gain = context.createGain();

    oscillator.type = "triangle";
    oscillator.frequency.setValueAtTime(string.frequency, context.currentTime);
    gain.gain.setValueAtTime(0.0001, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.25, context.currentTime + 0.03);
    gain.gain.setValueAtTime(0.25, context.currentTime + 2);
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 2.5);

    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 2.55);
    button.setAttribute("aria-pressed", "true");
    elements.announcement.textContent = `Reference tone: ${string.label}. Microphone off.`;
    oscillator.addEventListener("ended", () => {
      if (state.toneContext === context) stopReferenceTone();
    });
  } catch {
    if (state.toneContext === context) stopReferenceTone();
    setVisualState(TUNER_STATES.ERROR, { title: "Tone Unavailable", kicker: "Audio unavailable", message: "Could not play the reference tone. Try again." });
  }
}

function refreshChaosLine({ force = false } = {}) {
  if (elements.calmMode.checked) return;
  const now = performance.now();
  const stateChanged = state.lastChaosState !== state.currentState;
  if (!force && !stateChanged && now - state.lastChaosTick < CHAOS_ROTATION_MS) return;
  const selectedTarget = currentTargets().find((target) => target.key === elements.stringMode.value);
  const reading = state.lastReading;
  const line = getChaosLine({
    state: state.currentState,
    note: reading?.target?.id ?? selectedTarget?.id ?? "Auto",
    cents: reading && Number.isFinite(reading.cents) ? formatCents(reading.cents) : null,
    frequency: reading ? formatFrequency(reading.frequency) : null
  });

  elements.chaosOutput.textContent = line;
  elements.chaosOutput.dataset.status = state.currentState;
  elements.chaosOutput.classList.remove("chaos-pop");
  void elements.chaosOutput.offsetWidth;
  elements.chaosOutput.classList.add("chaos-pop");
  state.lastChaosTick = now;
  state.lastChaosState = state.currentState;
}

function refreshControls(selectedStringKey = "auto") {
  const targets = currentTargets();
  const hasSelectedTarget = selectedStringKey === "auto"
    || targets.some((target) => target.key === selectedStringKey || target.id === selectedStringKey);
  const safeSelectedKey = hasSelectedTarget ? selectedStringKey : "auto";

  elements.stringMode.innerHTML = renderStringOptions(targets, safeSelectedKey);
  elements.stringMode.value = targets.some((target) => target.key === safeSelectedKey)
    ? safeSelectedKey
    : "auto";
  elements.toneButtons.innerHTML = renderToneButtons(targets);
  updateGuidedPanel();
  resetReadouts();
}

function currentTargets() {
  return getTuningTargets(elements.tuningPreset.value || "standard", normalizeCalibration(elements.calibration.value));
}

function getSettings() {
  return {
    tuningId: elements.tuningPreset.value || "standard",
    calibrationHz: normalizeCalibration(elements.calibration.value),
    stringMode: elements.stringMode.value || "auto"
  };
}

function loadPreferences() {
  const fallback = {
    tuningId: "standard",
    calibrationHz: DEFAULT_CALIBRATION_HZ,
    stringMode: "auto",
    calmMode: window.matchMedia("(prefers-reduced-motion: reduce)").matches
  };

  try {
    const parsed = JSON.parse(localStorage.getItem(PREFERENCES_KEY));
    return {
      ...fallback,
      ...parsed,
      stringMode: parsed?.version === 2 ? parsed.stringMode ?? "auto" : "auto",
      calmMode: parsed?.calmMode ?? fallback.calmMode,
      calibrationHz: normalizeCalibration(parsed?.calibrationHz ?? fallback.calibrationHz)
    };
  } catch {
    return fallback;
  }
}

function savePreferences() {
  try {
    localStorage.setItem(PREFERENCES_KEY, JSON.stringify({
      ...getSettings(),
      stringMode: state.guided.active ? state.guided.previousString : elements.stringMode.value,
      calmMode: elements.calmMode.checked,
      version: 2
    }));
  } catch {
    // Preference persistence is nice to have; tuning should keep working without it.
  }
}

function formatCalibration(value) {
  const fixed = normalizeCalibration(value).toFixed(1);
  return fixed.endsWith(".0") ? fixed.slice(0, -2) : fixed;
}

function registerServiceWorker() {
  if (IS_ANDROID) return;
  if (!("serviceWorker" in navigator)) return;
  if (location.protocol !== "https:" && location.hostname !== "localhost" && location.hostname !== "127.0.0.1") return;

  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./service-worker.js").catch(() => {
      // The tuner should remain fully usable even if installability is unavailable.
    });
  });
}
