export class PitchSmoother {
  constructor({ maxSamples = 5, maxJumpCents = 45 } = {}) {
    this.maxSamples = maxSamples;
    this.maxJumpCents = maxJumpCents;
    this.samples = [];
  }

  reset() {
    this.samples = [];
  }

  add(frequency) {
    if (!Number.isFinite(frequency)) return null;

    const last = this.samples.at(-1);
    if (last) {
      const jump = Math.abs(1200 * Math.log2(frequency / last));
      if (jump > this.maxJumpCents) {
        this.samples = [frequency];
        return frequency;
      }
    }

    this.samples.push(frequency);
    if (this.samples.length > this.maxSamples) {
      this.samples.shift();
    }

    const weights = this.samples.map((_, index) => index + 1);
    const weightedSum = this.samples.reduce((sum, sample, index) => sum + sample * weights[index], 0);
    const weightTotal = weights.reduce((sum, weight) => sum + weight, 0);
    return weightedSum / weightTotal;
  }
}

export function calculateRms(buffer) {
  let sum = 0;
  for (let index = 0; index < buffer.length; index += 1) {
    sum += buffer[index] * buffer[index];
  }
  return Math.sqrt(sum / buffer.length);
}

export function detectPitchYin(buffer, sampleRate, options = {}) {
  const threshold = options.threshold ?? 0.14;
  const minFrequency = options.minFrequency ?? 65;
  const maxFrequency = options.maxFrequency ?? 380;
  const rmsThreshold = options.rmsThreshold ?? 0.004;
  const rms = calculateRms(buffer);

  if (rms < rmsThreshold) {
    return { frequency: null, confidence: 0, reason: "quiet", rms };
  }

  const tauMin = Math.max(2, Math.floor(sampleRate / maxFrequency));
  const tauMax = Math.min(Math.floor(sampleRate / minFrequency), Math.floor(buffer.length / 2));
  const yin = new Float32Array(tauMax + 1);

  // YIN compares the waveform against delayed copies of itself. The first delay
  // with a small normalized difference is the likely period of the note.
  for (let tau = 1; tau <= tauMax; tau += 1) {
    let delta = 0;
    for (let index = 0; index < tauMax; index += 1) {
      const difference = buffer[index] - buffer[index + tau];
      delta += difference * difference;
    }
    yin[tau] = delta;
  }

  yin[0] = 1;
  let runningSum = 0;
  for (let tau = 1; tau <= tauMax; tau += 1) {
    runningSum += yin[tau];
    yin[tau] = runningSum === 0 ? 1 : (yin[tau] * tau) / runningSum;
  }

  let tauEstimate = -1;
  for (let tau = tauMin; tau <= tauMax; tau += 1) {
    if (yin[tau] < threshold) {
      while (tau + 1 <= tauMax && yin[tau + 1] < yin[tau]) {
        tau += 1;
      }
      tauEstimate = tau;
      break;
    }
  }

  if (tauEstimate === -1) {
    return { frequency: null, confidence: 0, reason: "unstable", rms };
  }

  const betterTau = parabolicInterpolate(yin, tauEstimate);
  const frequency = sampleRate / betterTau;
  const confidence = Math.max(0, Math.min(1, 1 - yin[tauEstimate]));

  if (!Number.isFinite(frequency) || frequency < minFrequency || frequency > maxFrequency) {
    return { frequency: null, confidence, reason: "out-of-range", rms };
  }

  return { frequency, confidence, reason: "pitch", rms };
}

function parabolicInterpolate(values, tau) {
  const previous = values[tau - 1] ?? values[tau];
  const current = values[tau];
  const next = values[tau + 1] ?? values[tau];
  const divisor = previous + next - 2 * current;

  if (divisor === 0) return tau;
  return tau + (previous - next) / (2 * divisor);
}
