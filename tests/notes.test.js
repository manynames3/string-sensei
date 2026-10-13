import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_CALIBRATION_HZ,
  frequencyForNote,
  getTuningTargets,
  normalizeCalibration,
  noteToMidi
} from "../src/notes.js";

function approx(actual, expected, tolerance = 0.02) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} should be within ${tolerance} of ${expected}`);
}

test("standard tuning frequencies are generated from A4 calibration", () => {
  const targets = getTuningTargets("standard", DEFAULT_CALIBRATION_HZ);
  assert.deepEqual(targets.map(target => target.stringNumber), [6, 5, 4, 3, 2, 1]);
  const frequencies = Object.fromEntries(targets.map((target) => [target.id, target.frequency]));

  approx(frequencies.E2, 82.41);
  approx(frequencies.A2, 110);
  approx(frequencies.D3, 146.83);
  approx(frequencies.G3, 196);
  approx(frequencies.B3, 246.94);
  approx(frequencies.E4, 329.63);
});

test("alternate tuning presets expose calibrated targets", () => {
  const dropD = getTuningTargets("drop-d", 440);
  assert.equal(dropD[0].id, "D2");
  approx(dropD[0].frequency, 73.42);

  const dadgad = getTuningTargets("dadgad", 432);
  assert.equal(dadgad.at(-1).id, "D4");
  approx(frequencyForNote("A4", 432), 432);
});

test("note parsing and calibration bounds are stable", () => {
  assert.equal(noteToMidi("A4"), 69);
  assert.equal(noteToMidi("Eb2"), 39);
  assert.equal(normalizeCalibration(100), 430);
  assert.equal(normalizeCalibration(1000), 450);
  assert.equal(normalizeCalibration("not a number"), 440);
});
