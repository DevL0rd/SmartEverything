import { compareText } from '../../../format/text';

export interface QualitySettings {
  readonly renderScale: number;
  readonly splatScale: number;
  readonly lodBias: number;
  readonly decalLightShare: number;
  readonly animationDivisor: number;
}

export interface QualityPhases {
  readonly renderScale: readonly number[];
  readonly splatScale: readonly number[];
  readonly lodBias: readonly number[];
  readonly decalLightShare: readonly number[];
  readonly animationDivisor: readonly number[];
}

export interface QualityConfig {
  readonly targetMs: number;
  readonly headroomRatio: number;
  readonly smoothing: number;
  readonly settleSamples: number;
  readonly phases: QualityPhases;
}

export interface QualityState {
  readonly level: number;
  readonly samples: number;
  readonly smoothedMs: number;
}

export const FULL_QUALITY: QualitySettings = {
  renderScale: 1,
  splatScale: 1,
  lodBias: 0,
  decalLightShare: 0,
  animationDivisor: 1,
};

export const DEFAULT_QUALITY_CONFIG: QualityConfig = {
  targetMs: 1000 / 60,
  headroomRatio: 0.6,
  smoothing: 0.4,
  settleSamples: 6,
  phases: {
    renderScale: [0.85, 0.7, 0.55],
    splatScale: [0.75, 0.5, 0.35],
    lodBias: [1, 2, 3],
    decalLightShare: [0.25, 0.5, 0.75, 1],
    animationDivisor: [2, 3, 4],
  },
};

const ladders = new WeakMap<QualityPhases, readonly QualitySettings[]>();

const PHASE_ORDER = [
  'renderScale',
  'splatScale',
  'lodBias',
  'decalLightShare',
  'animationDivisor',
] as const satisfies readonly (keyof QualityPhases)[];

export class HiddenScanError extends Error {
  override readonly name = 'HiddenScanError';
}

function computeLadder(phases: QualityPhases): readonly QualitySettings[] {
  if (phases.splatScale.some((scale) => !(scale > 0))) {
    throw new HiddenScanError('A splat budget step must keep the scan visible (above 0)');
  }
  const ladder: QualitySettings[] = [FULL_QUALITY];
  let current = FULL_QUALITY;
  for (const key of PHASE_ORDER) {
    for (const value of phases[key]) {
      current = { ...current, [key]: value };
      ladder.push(current);
    }
  }
  return ladder;
}

export function buildLadder(phases: QualityPhases): readonly QualitySettings[] {
  const cached = ladders.get(phases);
  if (cached !== undefined) {
    return cached;
  }
  const built = computeLadder(phases);
  ladders.set(phases, built);
  return built;
}

export function initialQuality(): QualityState {
  return { level: 0, samples: 0, smoothedMs: 0 };
}

export function qualitySettings(
  state: QualityState,
  config: QualityConfig = DEFAULT_QUALITY_CONFIG,
): QualitySettings {
  const ladder = buildLadder(config.phases);
  return ladder[Math.min(state.level, ladder.length - 1)] ?? FULL_QUALITY;
}

function moveTo(level: number): QualityState {
  return { level, samples: 0, smoothedMs: 0 };
}

export function recordFrame(
  state: QualityState,
  frameMs: number,
  config: QualityConfig = DEFAULT_QUALITY_CONFIG,
): QualityState {
  const smoothedMs =
    state.samples === 0
      ? frameMs
      : state.smoothedMs + config.smoothing * (frameMs - state.smoothedMs);
  const samples = state.samples + 1;
  if (samples < config.settleSamples) {
    return { level: state.level, samples, smoothedMs };
  }
  const lastLevel = buildLadder(config.phases).length - 1;
  if (smoothedMs > config.targetMs && state.level < lastLevel) {
    return moveTo(state.level + 1);
  }
  if (smoothedMs < config.targetMs * config.headroomRatio && state.level > 0) {
    return moveTo(state.level - 1);
  }
  return { level: state.level, samples, smoothedMs };
}

export interface ScalerLight {
  readonly id: string;
  readonly intensity: number;
}

export interface LightSplit {
  readonly real: readonly string[];
  readonly decal: readonly string[];
}

export function splitLights(lights: readonly ScalerLight[], decalShare: number): LightSplit {
  const dimmestFirst = [...lights].sort(
    (a, b) => a.intensity - b.intensity || compareText(a.id, b.id),
  );
  const decalCount = Math.min(dimmestFirst.length, Math.ceil(dimmestFirst.length * decalShare));
  return {
    decal: dimmestFirst.slice(0, decalCount).map((light) => light.id),
    real: dimmestFirst.slice(decalCount).map((light) => light.id),
  };
}
