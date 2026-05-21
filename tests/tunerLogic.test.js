import assert from "node:assert/strict";
import test from "node:test";

import {
  centsToMeterPercent,
  clampCents,
  getTuningReading,
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
