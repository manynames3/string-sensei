import { closestString, centsOff, getFrequencyRange } from "./notes.js?v=41";

export const METER_RANGE_CENTS = 15;

export class TuningHold {
  constructor(durationMs = 650) {
    this.durationMs = durationMs;
    this.reset();
  }

  reset() {
    this.startedAt = null;
    this.lastAt = null;
  }

  update(inTune, now) {
    if (!inTune) {
      this.reset();
      return false;
    }
    if (this.startedAt === null || now - this.lastAt > 150) this.startedAt = now;
    this.lastAt = now;
    return now - this.startedAt >= this.durationMs;
  }
}

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

  const wasTuned = normalizedOptions.previousReading?.state === TUNER_STATES.TUNED
    && normalizedOptions.previousReading.target.key === target.key;
  const tolerance = wasTuned ? 7 : 5;

  if (cents < -tolerance) {
    return { state: TUNER_STATES.FLAT, frequency, target, cents, instruction: "Tune Up" };
  }

  if (cents > tolerance) {
    return { state: TUNER_STATES.SHARP, frequency, target, cents, instruction: "Tune Down" };
  }

  return { state: TUNER_STATES.TUNED, frequency, target, cents, instruction: "Perfect" };
}

export function clampCents(cents, max = METER_RANGE_CENTS) {
  if (!Number.isFinite(cents)) return 0;
  return Math.max(-max, Math.min(max, cents));
}

export function centsToMeterPercent(cents, max = METER_RANGE_CENTS) {
  if (!Number.isFinite(cents)) return 50;
  return 50 + (clampCents(cents, max) / max) * 50;
}
