import assert from "node:assert/strict";
import test from "node:test";

import { detectPitchYin } from "../src/pitchDetection.js";
import { getTuningReading, TUNER_STATES } from "../src/tunerLogic.js";

const SAMPLE_RATE = 44100;

function sineBuffer(frequency, length = 4096) {
  const buffer = new Float32Array(length);
  for (let index = 0; index < buffer.length; index += 1) {
    buffer[index] = 0.6 * Math.sin((2 * Math.PI * frequency * index) / SAMPLE_RATE);
  }
  return buffer;
}

test("YIN detector identifies standard guitar tuning fixtures", () => {
  for (const frequency of [82.41, 110, 146.83, 196, 246.94, 329.63]) {
    const detected = detectPitchYin(sineBuffer(frequency), SAMPLE_RATE);
    assert.equal(detected.reason, "pitch");
    assert.ok(Math.abs(detected.frequency - frequency) < 0.08);

    const reading = getTuningReading(detected.frequency, {
      tuningId: "standard",
      calibrationHz: 440,
      stringMode: "auto"
    });
    assert.equal(reading.state, TUNER_STATES.TUNED);
  }
});

test("YIN detector rejects quiet input", () => {
  const detected = detectPitchYin(new Float32Array(4096), SAMPLE_RATE);
  assert.equal(detected.frequency, null);
  assert.equal(detected.reason, "quiet");
});
