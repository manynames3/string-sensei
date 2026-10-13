export const DEFAULT_CALIBRATION_HZ = 440;
export const MIN_CALIBRATION_HZ = 430;
export const MAX_CALIBRATION_HZ = 450;
export const MIN_GUITAR_FREQUENCY = 55;
export const MAX_GUITAR_FREQUENCY = 420;

export const TUNING_PRESETS = [
  {
    id: "standard",
    name: "Standard",
    description: "E A D G B E",
    strings: [
      { note: "E2", label: "Low E" },
      { note: "A2", label: "A" },
      { note: "D3", label: "D" },
      { note: "G3", label: "G" },
      { note: "B3", label: "B" },
      { note: "E4", label: "High E" }
    ]
  },
  {
    id: "half-step-down",
    name: "Half-Step Down",
    description: "Eb Ab Db Gb Bb Eb",
    strings: [
      { note: "Eb2", label: "Low Eb" },
      { note: "Ab2", label: "Ab" },
      { note: "Db3", label: "Db" },
      { note: "Gb3", label: "Gb" },
      { note: "Bb3", label: "Bb" },
      { note: "Eb4", label: "High Eb" }
    ]
  },
  {
    id: "drop-d",
    name: "Drop D",
    description: "D A D G B E",
    strings: [
      { note: "D2", label: "Low D" },
      { note: "A2", label: "A" },
      { note: "D3", label: "D" },
      { note: "G3", label: "G" },
      { note: "B3", label: "B" },
      { note: "E4", label: "High E" }
    ]
  },
  {
    id: "dadgad",
    name: "DADGAD",
    description: "D A D G A D",
    strings: [
      { note: "D2", label: "Low D" },
      { note: "A2", label: "A" },
      { note: "D3", label: "D" },
      { note: "G3", label: "G" },
      { note: "A3", label: "A" },
      { note: "D4", label: "High D" }
    ]
  },
  {
    id: "open-g",
    name: "Open G",
    description: "D G D G B D",
    strings: [
      { note: "D2", label: "Low D" },
      { note: "G2", label: "G" },
      { note: "D3", label: "D" },
      { note: "G3", label: "G" },
      { note: "B3", label: "B" },
      { note: "D4", label: "High D" }
    ]
  }
];

const NOTE_OFFSETS = {
  C: 0,
  "C#": 1,
  Db: 1,
  D: 2,
  "D#": 3,
  Eb: 3,
  E: 4,
  F: 5,
  "F#": 6,
  Gb: 6,
  G: 7,
  "G#": 8,
  Ab: 8,
  A: 9,
  "A#": 10,
  Bb: 10,
  B: 11
};

export const GUITAR_STRINGS = getTuningTargets("standard", DEFAULT_CALIBRATION_HZ);

export function centsOff(frequency, targetFrequency) {
  return 1200 * Math.log2(frequency / targetFrequency);
}

export function closestString(frequency, options = {}) {
  const { stringMode = "auto", tuningId = "standard", calibrationHz = DEFAULT_CALIBRATION_HZ } = normalizeOptions(options);
  const targets = getTuningTargets(tuningId, calibrationHz);

  if (stringMode !== "auto") {
    return targets.find((string) => string.key === stringMode || string.id === stringMode) ?? targets[0];
  }

  return targets.reduce((closest, string) => {
    const currentDistance = Math.abs(centsOff(frequency, string.frequency));
    const closestDistance = Math.abs(centsOff(frequency, closest.frequency));
    return currentDistance < closestDistance ? string : closest;
  }, targets[0]);
}

export function getTuningPreset(tuningId = "standard") {
  return TUNING_PRESETS.find((preset) => preset.id === tuningId) ?? TUNING_PRESETS[0];
}

export function getTuningTargets(tuningId = "standard", calibrationHz = DEFAULT_CALIBRATION_HZ) {
  const preset = getTuningPreset(tuningId);
  const normalizedCalibration = normalizeCalibration(calibrationHz);

  return preset.strings.map((string, index) => {
    const frequency = frequencyForNote(string.note, normalizedCalibration);
    return {
      ...string,
      id: string.note,
      key: `${preset.id}:${index}`,
      stringNumber: preset.strings.length - index,
      frequency,
      display: `${string.note} - ${string.label}`
    };
  });
}

export function getFrequencyRange(tuningId = "standard", calibrationHz = DEFAULT_CALIBRATION_HZ) {
  const targets = getTuningTargets(tuningId, calibrationHz);
  const frequencies = targets.map((target) => target.frequency);
  return {
    min: Math.max(MIN_GUITAR_FREQUENCY, Math.min(...frequencies) * 0.72),
    max: Math.min(MAX_GUITAR_FREQUENCY, Math.max(...frequencies) * 1.24)
  };
}

export function normalizeCalibration(value) {
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed)) return DEFAULT_CALIBRATION_HZ;
  return Math.max(MIN_CALIBRATION_HZ, Math.min(MAX_CALIBRATION_HZ, parsed));
}

export function noteToMidi(note) {
  const match = /^([A-G](?:#|b)?)(-?\d+)$/.exec(note);
  if (!match) {
    throw new Error(`Invalid note name: ${note}`);
  }

  const [, name, octaveText] = match;
  const offset = NOTE_OFFSETS[name];
  if (offset === undefined) {
    throw new Error(`Unsupported note name: ${note}`);
  }

  return (Number.parseInt(octaveText, 10) + 1) * 12 + offset;
}

export function frequencyForNote(note, calibrationHz = DEFAULT_CALIBRATION_HZ) {
  return normalizeCalibration(calibrationHz) * 2 ** ((noteToMidi(note) - 69) / 12);
}

export function formatFrequency(frequency) {
  return `${frequency.toFixed(2)} Hz`;
}

export function formatCents(cents) {
  const rounded = Math.round(cents);
  if (Math.abs(rounded) === 0) return "0 cents";
  return `${rounded > 0 ? "+" : ""}${rounded} cents`;
}

function normalizeOptions(options) {
  if (typeof options === "string") {
    return { stringMode: options };
  }

  return options ?? {};
}
