import {
  cycleStateMessage,
  getChaosLine,
  getStateCopy,
  renderMascot,
  renderStringOptions,
  renderToneButtons,
  renderTuningOptions
} from "./components.js?v=10";
import {
  DEFAULT_CALIBRATION_HZ,
  formatCents,
  formatFrequency,
  getFrequencyRange,
  getTuningTargets,
  normalizeCalibration
} from "./notes.js?v=10";
import { detectPitchYin, PitchSmoother } from "./pitchDetection.js?v=10";
import { clampCents, getTuningReading, TUNER_STATES } from "./tunerLogic.js?v=10";

const PREFERENCES_KEY = "string-sensei-preferences";
const GUIDED_LOCK_FRAMES = 22;

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
  chaosActions: document.querySelector("#chaos-actions"),
  chaosOutput: document.querySelector("#chaos-output")
};

const state = {
  audioContext: null,
  analyser: null,
  stream: null,
  source: null,
  data: null,
  animationFrame: null,
  smoother: new PitchSmoother({ maxSamples: 6, maxJumpCents: 80 }),
  currentState: TUNER_STATES.IDLE,
  lastReading: null,
  stableMisses: 0,
  lastMessageTick: 0,
  guided: {
    active: false,
    currentIndex: 0,
    tunedFrames: 0,
    completed: new Set()
  }
};

initializeApp();

elements.startButton.addEventListener("click", startTuning);
elements.stopButton.addEventListener("click", stopTuning);
elements.guidedButton.addEventListener("click", toggleGuidedMode);
elements.toneButtons.addEventListener("click", playReferenceTone);
elements.chaosActions.addEventListener("click", handleChaosAction);
elements.tuningPreset.addEventListener("change", () => {
  stopGuidedMode();
  refreshControls("auto");
  savePreferences();
  state.smoother.reset();
});
elements.calibration.addEventListener("change", () => {
  elements.calibration.value = formatCalibration(normalizeCalibration(elements.calibration.value));
  stopGuidedMode();
  refreshControls(elements.stringMode.value);
  savePreferences();
  state.smoother.reset();
});
elements.calibration.addEventListener("input", () => {
  if (!elements.calibration.value) return;
  stopGuidedMode();
  refreshControls(elements.stringMode.value);
  savePreferences();
  state.smoother.reset();
});
elements.stringMode.addEventListener("change", () => {
  savePreferences();
  state.smoother.reset();
});

function initializeApp() {
  const preferences = loadPreferences();
  elements.tuningPreset.innerHTML = renderTuningOptions(preferences.tuningId);
  elements.tuningPreset.value = preferences.tuningId;
  elements.calibration.value = formatCalibration(preferences.calibrationHz);
  refreshControls(preferences.stringMode);
  setVisualState(TUNER_STATES.IDLE);
  registerServiceWorker();
}

async function startTuning() {
  if (!window.isSecureContext) {
    setVisualState(TUNER_STATES.ERROR, {
      title: "Secure Page Needed",
      message: "Microphone access requires HTTPS in production. Use the deployed HTTPS URL, or localhost while developing."
    });
    return;
  }

  if (!navigator.mediaDevices?.getUserMedia || (!window.AudioContext && !window.webkitAudioContext)) {
    setVisualState(TUNER_STATES.ERROR, {
      message: "This browser does not support microphone pitch detection. Try a current Chrome, Edge, Safari, or Firefox build."
    });
    return;
  }

  try {
    elements.startButton.disabled = true;
    setVisualState(TUNER_STATES.LISTENING);

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false
      }
    });

    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    const audioContext = new AudioContextClass();
    if (audioContext.state === "suspended") {
      await audioContext.resume();
    }
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 4096;
    analyser.smoothingTimeConstant = 0;

    const source = audioContext.createMediaStreamSource(stream);
    source.connect(analyser);

    state.audioContext = audioContext;
    state.analyser = analyser;
    state.stream = stream;
    state.source = source;
    state.data = new Float32Array(analyser.fftSize);
    state.smoother.reset();
    state.stableMisses = 0;

    elements.startButton.hidden = true;
    elements.stopButton.hidden = false;
    elements.startButton.disabled = false;
    listen();
  } catch (error) {
    elements.startButton.disabled = false;
    setVisualState(TUNER_STATES.ERROR, {
      message: error?.name === "NotAllowedError"
        ? "Microphone permission was denied. Allow mic access in the browser settings, then start tuning again."
        : "Could not start the microphone. Check your input device and try again."
    });
  }
}

function listen(timestamp = 0) {
  if (!state.analyser || !state.data || !state.audioContext) return;

  state.analyser.getFloatTimeDomainData(state.data);
  const settings = getSettings();
  const range = getFrequencyRange(settings.tuningId, settings.calibrationHz);
  const pitch = detectPitchYin(state.data, state.audioContext.sampleRate, {
    minFrequency: range.min,
    maxFrequency: range.max
  });

  if (pitch.frequency) {
    const smoothedFrequency = state.smoother.add(pitch.frequency);
    const reading = getTuningReading(smoothedFrequency, settings);
    state.stableMisses = 0;
    updateFromReading(reading);
  } else {
    state.stableMisses += 1;
    state.guided.tunedFrames = 0;
    if (state.stableMisses > 8) {
      state.smoother.reset();
      const nextState = pitch.reason === "quiet" ? TUNER_STATES.QUIET : TUNER_STATES.NO_PITCH;
      setVisualState(nextState);
      resetReadouts();
    }
  }

  if (timestamp - state.lastMessageTick > 3600) {
    cycleStateMessage(state.currentState);
    setVisualState(state.currentState);
    state.lastMessageTick = timestamp;
  }

  state.animationFrame = requestAnimationFrame(listen);
}

function updateFromReading(reading) {
  if (!reading) {
    setVisualState(TUNER_STATES.NO_PITCH);
    return;
  }

  state.lastReading = reading;
  setVisualState(reading.state);
  elements.frequency.textContent = formatFrequency(reading.frequency);
  elements.targetNote.textContent = `${reading.target.id} ${reading.target.frequency.toFixed(2)} Hz`;

  if (Number.isFinite(reading.cents)) {
    elements.cents.textContent = formatCents(reading.cents);
    const clamped = clampCents(reading.cents);
    elements.needle.style.left = `${50 + clamped}%`;
    elements.needle.setAttribute("aria-label", `${formatCents(reading.cents)} from ${reading.target.id}`);
  } else {
    elements.cents.textContent = "-- cents";
    elements.needle.style.left = "50%";
  }

  updateGuidedProgress(reading);
}

function setVisualState(nextState, override = {}) {
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
}

function resetReadouts() {
  const selectedTarget = currentTargets().find((target) => target.key === elements.stringMode.value);
  elements.frequency.textContent = "-- Hz";
  elements.targetNote.textContent = selectedTarget
    ? `${selectedTarget.id} ${selectedTarget.frequency.toFixed(2)} Hz`
    : "Auto";
  elements.cents.textContent = "-- cents";
  elements.needle.style.left = "50%";
}

function stopTuning() {
  if (state.animationFrame) {
    cancelAnimationFrame(state.animationFrame);
  }

  state.stream?.getTracks().forEach((track) => track.stop());
  state.audioContext?.close();

  state.audioContext = null;
  state.analyser = null;
  state.stream = null;
  state.source = null;
  state.data = null;
  state.animationFrame = null;
  state.smoother.reset();
  state.guided.tunedFrames = 0;
  state.lastReading = null;

  elements.startButton.hidden = false;
  elements.stopButton.hidden = true;
  setVisualState(TUNER_STATES.IDLE);
  resetReadouts();
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
  state.guided.active = true;
  state.guided.currentIndex = 0;
  state.guided.tunedFrames = 0;
  state.guided.completed = new Set();
  elements.guidedPanel.hidden = false;
  elements.guidedButton.textContent = "Exit Guide";
  elements.stringMode.value = targets[0].key;
  elements.stringMode.disabled = true;
  elements.tuningPreset.disabled = true;
  elements.calibration.disabled = true;
  savePreferences();
  updateGuidedPanel();
  resetReadouts();

  if (!state.audioContext) {
    setVisualState(TUNER_STATES.LISTENING, {
      title: "Guided Mode",
      message: "Now press Start Tuning and play the highlighted string. Sensei will lock each string when it holds steady."
    });
  }
}

function stopGuidedMode() {
  state.guided.active = false;
  state.guided.currentIndex = 0;
  state.guided.tunedFrames = 0;
  state.guided.completed = new Set();
  elements.guidedPanel.hidden = true;
  elements.guidedButton.textContent = "Guided Tune";
  elements.stringMode.disabled = false;
  elements.tuningPreset.disabled = false;
  elements.calibration.disabled = false;
  if (elements.stringMode.value !== "auto") {
    elements.stringMode.value = "auto";
  }
  savePreferences();
  resetReadouts();
}

function updateGuidedProgress(reading) {
  if (!state.guided.active || !Number.isFinite(reading.cents)) return;

  const targets = currentTargets();
  const currentTarget = targets[state.guided.currentIndex];
  if (!currentTarget) return;

  if (reading.state === TUNER_STATES.TUNED && reading.target.key === currentTarget.key) {
    state.guided.tunedFrames += 1;
  } else {
    state.guided.tunedFrames = 0;
  }

  if (state.guided.tunedFrames < GUIDED_LOCK_FRAMES) return;

  state.guided.completed.add(currentTarget.key);
  state.guided.tunedFrames = 0;
  state.guided.currentIndex += 1;

  if (state.guided.currentIndex >= targets.length) {
    finishGuidedMode();
    return;
  }

  elements.stringMode.value = targets[state.guided.currentIndex].key;
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
    : `Progress ${completedCount}/${targets.length}. Pluck only ${currentTarget.id} and let it ring.`;
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
  elements.guidedButton.textContent = "Guided Tune";
  elements.stringMode.disabled = false;
  elements.tuningPreset.disabled = false;
  elements.calibration.disabled = false;
  elements.stringMode.value = "auto";
  updateGuidedPanel();
  savePreferences();
  setVisualState(TUNER_STATES.TUNED, {
    title: "All Set",
    message: "Every string held inside +/-5 cents. Go make noise responsibly."
  });
}

async function playReferenceTone(event) {
  const button = event.target.closest("[data-tone]");
  if (!button) return;

  const string = currentTargets().find((item) => item.id === button.dataset.tone);
  if (!string) return;

  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) {
    setVisualState(TUNER_STATES.ERROR, {
      message: "This browser cannot play reference tones because Web Audio is unavailable."
    });
    return;
  }

  const context = new AudioContextClass();
  if (context.state === "suspended") {
    await context.resume();
  }
  const oscillator = context.createOscillator();
  const gain = context.createGain();

  oscillator.type = "sine";
  oscillator.frequency.setValueAtTime(string.frequency, context.currentTime);
  gain.gain.setValueAtTime(0.0001, context.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.25, context.currentTime + 0.03);
  gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 1.2);

  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.start();
  oscillator.stop(context.currentTime + 1.25);
  oscillator.addEventListener("ended", () => context.close());
}

function handleChaosAction(event) {
  const button = event.target.closest("[data-chaos]");
  if (!button) return;

  const selectedTarget = currentTargets().find((target) => target.key === elements.stringMode.value);
  const reading = state.lastReading;
  const line = getChaosLine(button.dataset.chaos, {
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
    stringMode: "auto"
  };

  try {
    const parsed = JSON.parse(localStorage.getItem(PREFERENCES_KEY));
    return {
      ...fallback,
      ...parsed,
      calibrationHz: normalizeCalibration(parsed?.calibrationHz ?? fallback.calibrationHz)
    };
  } catch {
    return fallback;
  }
}

function savePreferences() {
  try {
    localStorage.setItem(PREFERENCES_KEY, JSON.stringify(getSettings()));
  } catch {
    // Preference persistence is nice to have; tuning should keep working without it.
  }
}

function formatCalibration(value) {
  const fixed = normalizeCalibration(value).toFixed(1);
  return fixed.endsWith(".0") ? fixed.slice(0, -2) : fixed;
}

function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  if (location.protocol !== "https:" && location.hostname !== "localhost" && location.hostname !== "127.0.0.1") return;

  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./service-worker.js").catch(() => {
      // The tuner should remain fully usable even if installability is unavailable.
    });
  });
}
