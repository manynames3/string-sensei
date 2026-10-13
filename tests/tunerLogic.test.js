import assert from "node:assert/strict";
import test from "node:test";

import {
  centsToMeterPercent,
  clampCents,
  getTuningReading,
  TuningHold,
  METER_RANGE_CENTS,
  TUNER_STATES
} from "../src/tunerLogic.js";

test("standard A string reports tuned, flat, and sharp states", () => {
  const tuned = getTuningReading(110, { tuningId: "standard", calibrationHz: 440, stringMode: "standard:1" });
  assert.equal(tuned.state, TUNER_STATES.TUNED);
  assert.equal(tuned.target.id, "A2");

  const flat = getTuningReading(108, { tuningId: "standard", calibrationHz: 440, stringMode: "standard:1" });
  assert.equal(flat.state, TUNER_STATES.FLAT);
  assert.equal(flat.instruction, "Tune Up");

  const sharp = getTuningReading(112, { tuningId: "standard", calibrationHz: 440, stringMode: "standard:1" });
  assert.equal(sharp.state, TUNER_STATES.SHARP);
  assert.equal(sharp.instruction, "Tune Down");
});

test("in-tune hysteresis stabilizes the edge without carrying across strings", () => {
  const settings = { tuningId: "standard", calibrationHz: 440, stringMode: "auto" };
  const previousReading = getTuningReading(110, settings);
  const offset = (cents) => 110 * 2 ** (cents / 1200);
  assert.equal(getTuningReading(offset(6), settings).state, TUNER_STATES.SHARP);
  assert.equal(getTuningReading(offset(6), { ...settings, previousReading }).state, TUNER_STATES.TUNED);
  assert.equal(getTuningReading(offset(8), { ...settings, previousReading }).state, TUNER_STATES.SHARP);
  assert.equal(getTuningReading(offset(-8), { ...settings, previousReading }).state, TUNER_STATES.FLAT);
  const newString = 146.832384 * 2 ** (6 / 1200);
  assert.equal(getTuningReading(newString, { ...settings, previousReading }).state, TUNER_STATES.SHARP);
});

test("guided lock duration is consistent at 30, 60, and 120 updates per second", () => {
  for (const rate of [30, 60, 120]) {
    const hold = new TuningHold();
    let completedAt;
    for (let tick = 0; tick < rate; tick += 1) {
      const now = tick * 1000 / rate;
      if (hold.update(true, now)) { completedAt = now; break; }
    }
    assert.ok(completedAt >= 650 && completedAt <= 650 + 1000 / rate);
  }
});

test("guided lock resets on a missed pitch or an interrupted analysis loop", () => {
  const hold = new TuningHold();
  for (let now = 0; now <= 600; now += 50) assert.equal(hold.update(true, now), false);
  assert.equal(hold.update(false, 650), false);
  assert.equal(hold.update(true, 700), false);
  assert.equal(hold.update(true, 1000), false);
  for (let now = 1050; now < 1650; now += 50) assert.equal(hold.update(true, now), false);
  assert.equal(hold.update(true, 1650), true);
});

test("auto-detection chooses the closest string in alternate tunings", () => {
  const dropD = getTuningReading(73.42, { tuningId: "drop-d", calibrationHz: 440, stringMode: "auto" });
  assert.equal(dropD.state, TUNER_STATES.TUNED);
  assert.equal(dropD.target.id, "D2");

  const openG = getTuningReading(98, { tuningId: "open-g", calibrationHz: 440, stringMode: "auto" });
  assert.equal(openG.target.id, "G2");
});

test("out-of-range readings do not emit misleading cents", () => {
  const reading = getTuningReading(500, { tuningId: "standard", calibrationHz: 440, stringMode: "auto" });
  assert.equal(reading.state, TUNER_STATES.OUT_OF_RANGE);
  assert.equal(reading.cents, null);
});

test("meter maps a narrow plus-minus 15 cent range across the full track", () => {
  assert.equal(METER_RANGE_CENTS, 15);
  assert.equal(clampCents(-40), -15);
  assert.equal(clampCents(40), 15);
  assert.equal(centsToMeterPercent(-15), 0);
  assert.equal(centsToMeterPercent(0), 50);
  assert.equal(centsToMeterPercent(15), 100);
});
