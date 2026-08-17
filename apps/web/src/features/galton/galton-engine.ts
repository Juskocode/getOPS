export const MAX_GALTON_BALLS = 50_000;
export const MIN_GALTON_ROWS = 6;
export const MAX_GALTON_ROWS = 22;

export type GaltonEquation = "constant" | "linear" | "wave" | "attractor";

export interface GaltonConfig {
  equation: GaltonEquation;
  rows: number;
  ballCount: number;
  seed: number;
  baseProbability: number;
  spatialDrift: number;
  rowDrift: number;
  waveAmplitude: number;
  frequency: number;
  phase: number;
  centerPull: number;
}

export interface GaltonSimulation {
  config: GaltonConfig;
  outcomes: Uint8Array;
  paths: Uint32Array;
  expected: Float64Array;
  expectedMean: number;
  expectedSigma: number;
}

export interface DistributionSummary {
  mean: number;
  sigma: number;
}

const TAU = Math.PI * 2;

export const defaultGaltonConfig: GaltonConfig = {
  equation: "wave",
  rows: 16,
  ballCount: MAX_GALTON_BALLS,
  seed: 20_260_817,
  baseProbability: 0.5,
  spatialDrift: 0.08,
  rowDrift: 0,
  waveAmplitude: 0.12,
  frequency: 1.5,
  phase: 0,
  centerPull: 0.18,
};

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function finiteOr(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}

export function sanitizeGaltonConfig(config: GaltonConfig): GaltonConfig {
  return {
    equation: config.equation,
    rows: Math.round(clamp(finiteOr(config.rows, defaultGaltonConfig.rows), MIN_GALTON_ROWS, MAX_GALTON_ROWS)),
    ballCount: Math.round(clamp(finiteOr(config.ballCount, defaultGaltonConfig.ballCount), 1_000, MAX_GALTON_BALLS)),
    seed: Math.round(finiteOr(config.seed, defaultGaltonConfig.seed)) >>> 0,
    baseProbability: clamp(finiteOr(config.baseProbability, 0.5), 0.1, 0.9),
    spatialDrift: clamp(finiteOr(config.spatialDrift, 0), -0.35, 0.35),
    rowDrift: clamp(finiteOr(config.rowDrift, 0), -0.3, 0.3),
    waveAmplitude: clamp(finiteOr(config.waveAmplitude, 0), 0, 0.3),
    frequency: clamp(finiteOr(config.frequency, 1), 0.25, 4),
    phase: clamp(finiteOr(config.phase, 0), 0, TAU),
    centerPull: clamp(finiteOr(config.centerPull, 0), 0, 0.4),
  };
}

export function normalizedNodePosition(row: number, rights: number): number {
  return row <= 0 ? 0 : (rights * 2 - row) / row;
}

export function evaluateRightProbability(config: GaltonConfig, row: number, rights: number): number {
  const x = normalizedNodePosition(row, rights);
  const u = config.rows <= 1 ? 0 : row / (config.rows - 1);
  let probability = config.baseProbability;

  if (config.equation === "linear") {
    probability += config.spatialDrift * x + config.rowDrift * (u * 2 - 1);
  } else if (config.equation === "wave") {
    probability +=
      config.spatialDrift * x +
      config.waveAmplitude * Math.sin(TAU * config.frequency * u + config.phase);
  } else if (config.equation === "attractor") {
    probability +=
      -config.centerPull * x +
      config.waveAmplitude * Math.sin(TAU * config.frequency * u + config.phase);
  }

  return clamp(probability, 0.02, 0.98);
}

function createRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
}

export function expectedDistribution(configInput: GaltonConfig): Float64Array {
  const config = sanitizeGaltonConfig(configInput);
  let current = new Float64Array(1);
  current[0] = 1;

  for (let row = 0; row < config.rows; row += 1) {
    const next = new Float64Array(row + 2);
    for (let rights = 0; rights <= row; rights += 1) {
      const mass = current[rights] ?? 0;
      const probability = evaluateRightProbability(config, row, rights);
      next[rights] = (next[rights] ?? 0) + mass * (1 - probability);
      next[rights + 1] = (next[rights + 1] ?? 0) + mass * probability;
    }
    current = next;
  }

  return current;
}

export function summarizeDistribution(values: ArrayLike<number>, total = 1): DistributionSummary {
  if (total <= 0) return { mean: 0, sigma: 0 };
  let weighted = 0;
  for (let index = 0; index < values.length; index += 1) {
    weighted += index * (values[index] ?? 0);
  }
  const mean = weighted / total;
  let variance = 0;
  for (let index = 0; index < values.length; index += 1) {
    variance += (values[index] ?? 0) * (index - mean) ** 2;
  }
  return { mean, sigma: Math.sqrt(variance / total) };
}

export function simulateGalton(configInput: GaltonConfig): GaltonSimulation {
  const config = sanitizeGaltonConfig(configInput);
  const outcomes = new Uint8Array(config.ballCount);
  const paths = new Uint32Array(config.ballCount);
  const random = createRandom(config.seed);

  for (let ball = 0; ball < config.ballCount; ball += 1) {
    let rights = 0;
    let path = 0;
    for (let row = 0; row < config.rows; row += 1) {
      if (random() < evaluateRightProbability(config, row, rights)) {
        path |= 1 << row;
        rights += 1;
      }
    }
    paths[ball] = path >>> 0;
    outcomes[ball] = rights;
  }

  const expected = expectedDistribution(config);
  const expectedSummary = summarizeDistribution(expected);
  return {
    config,
    outcomes,
    paths,
    expected,
    expectedMean: expectedSummary.mean,
    expectedSigma: expectedSummary.sigma,
  };
}

function signed(value: number): string {
  return value < 0 ? `- ${Math.abs(value).toFixed(2)}` : `+ ${value.toFixed(2)}`;
}

export function formatGaltonEquation(config: GaltonConfig): string {
  const base = config.baseProbability.toFixed(2);
  if (config.equation === "constant") return `p(r, x) = clamp(${base})`;
  if (config.equation === "linear") {
    return `p(r, x) = clamp(${base} ${signed(config.spatialDrift)}x ${signed(config.rowDrift)}(2r/R - 1))`;
  }
  if (config.equation === "wave") {
    return `p(r, x) = clamp(${base} ${signed(config.spatialDrift)}x + ${config.waveAmplitude.toFixed(2)} sin(2pi ${config.frequency.toFixed(2)}r/R + ${config.phase.toFixed(2)}))`;
  }
  return `p(r, x) = clamp(${base} - ${config.centerPull.toFixed(2)}x + ${config.waveAmplitude.toFixed(2)} sin(2pi ${config.frequency.toFixed(2)}r/R + ${config.phase.toFixed(2)}))`;
}
