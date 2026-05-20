import assert from "node:assert/strict";
import test from "node:test";

import { detectPitchYin } from "../src/pitchDetection.js";
import { getTuningReading, TUNER_STATES } from "../src/tunerLogic.js";

const SAMPLE_RATE = 44100;

function sineBuffer(frequency, length = 4096, amplitude = 0.6) {
  const buffer = new Float32Array(length);
  for (let index = 0; index < buffer.length; index += 1) {
    buffer[index] = amplitude * Math.sin((2 * Math.PI * frequency * index) / SAMPLE_RATE);
  }
  return buffer;
}

function noiseBuffer(length = 8192, amplitude = 0.014) {
  const buffer = new Float32Array(length);
  let seed = 12_345;
  for (let index = 0; index < buffer.length; index += 1) {
    seed = (seed * 16_807) % 2_147_483_647;
    buffer[index] = ((seed / 2_147_483_647) * 2 - 1) * amplitude;
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

test("YIN detector accepts quiet but realistic guitar signal", () => {
  const detected = detectPitchYin(sineBuffer(110, 8192, 0.009), SAMPLE_RATE);
  assert.equal(detected.reason, "pitch");
  assert.ok(detected.rms < 0.012);
  assert.ok(Math.abs(detected.frequency - 110) < 0.08);
});

test("YIN detector does not tune low-level broadband noise", () => {
  const detected = detectPitchYin(noiseBuffer(), SAMPLE_RATE);
  assert.equal(detected.frequency, null);
  assert.notEqual(detected.reason, "pitch");
});
