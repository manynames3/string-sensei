import { closestString, centsOff, getFrequencyRange } from "./notes.js?v=13";

export const TUNER_STATES = {
  IDLE: "idle",
  LISTENING: "listening",
  FLAT: "flat",
  TUNED: "tuned",
  SHARP: "sharp",
  QUIET: "quiet",
  NO_PITCH: "no-pitch",
  OUT_OF_RANGE: "out-of-range",
  ERROR: "error"
};

export function getTuningReading(frequency, options) {
  if (!Number.isFinite(frequency)) return null;
  const normalizedOptions = typeof options === "string" ? { stringMode: options } : options ?? {};
  const range = getFrequencyRange(normalizedOptions.tuningId, normalizedOptions.calibrationHz);

  if (frequency < range.min || frequency > range.max) {
    return {
      state: TUNER_STATES.OUT_OF_RANGE,
      frequency,
      target: closestString(frequency, normalizedOptions),
      cents: null,
      instruction: "Play one standard guitar string"
    };
  }

  const target = closestString(frequency, normalizedOptions);
  const cents = centsOff(frequency, target.frequency);

  if (cents < -5) {
    return { state: TUNER_STATES.FLAT, frequency, target, cents, instruction: "Tune Up" };
  }

  if (cents > 5) {
    return { state: TUNER_STATES.SHARP, frequency, target, cents, instruction: "Tune Down" };
  }

  return { state: TUNER_STATES.TUNED, frequency, target, cents, instruction: "Perfect" };
}

export function clampCents(cents, max = 50) {
  if (!Number.isFinite(cents)) return 0;
  return Math.max(-max, Math.min(max, cents));
}
