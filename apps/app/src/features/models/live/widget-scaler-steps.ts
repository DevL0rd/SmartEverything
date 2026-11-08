import {
  DEFAULT_QUALITY_CONFIG,
  FULL_QUALITY,
  type QualityPhases,
  type QualitySettings,
} from '../../../components/house-map/live-visibility/quality-scaler';
import type { ModelLod } from '../../../components/models/three/geometry';

export interface WidgetSizing {
  readonly id: string;
  readonly area: number;
  readonly lod: ModelLod;
}

export interface WidgetStep {
  readonly lod: ModelLod;
  readonly effects: boolean;
  readonly decalShare: number;
  readonly divisor: number;
}

export function fullStep(lod: ModelLod): WidgetStep {
  return { lod, effects: true, decalShare: 0, divisor: 1 };
}

function stepIndex(phase: readonly number[], value: number, full: number): number {
  if (value === full) return 0;
  return phase.indexOf(value) + 1;
}

function reachedSmallest(rank: number, count: number, step: number, steps: number): boolean {
  if (step <= 0 || steps <= 0) return false;
  return rank < Math.ceil((count * step) / steps);
}

function loweredLod(lod: ModelLod, by: number): ModelLod {
  const next = lod - by;
  return next <= 0 ? 0 : next === 1 ? 1 : lod;
}

function smallestFirst(sizings: readonly WidgetSizing[]): readonly WidgetSizing[] {
  return [...sizings].sort((a, b) => a.area - b.area || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

export function sameStep(a: WidgetStep, b: WidgetStep): boolean {
  return (
    a.lod === b.lod &&
    a.effects === b.effects &&
    a.decalShare === b.decalShare &&
    a.divisor === b.divisor
  );
}

export function widgetSteps(
  sizings: readonly WidgetSizing[],
  settings: QualitySettings,
  phases: QualityPhases = DEFAULT_QUALITY_CONFIG.phases,
): ReadonlyMap<string, WidgetStep> {
  const lodStep = stepIndex(phases.lodBias, settings.lodBias, FULL_QUALITY.lodBias);
  const rateStep = stepIndex(
    phases.animationDivisor,
    settings.animationDivisor,
    FULL_QUALITY.animationDivisor,
  );
  const effects = settings.decalLightShare === FULL_QUALITY.decalLightShare;
  const ordered = smallestFirst(sizings);
  const steps = new Map<string, WidgetStep>();
  for (const [rank, sizing] of ordered.entries()) {
    const count = ordered.length;
    const lowered = reachedSmallest(rank, count, lodStep, phases.lodBias.length);
    const slowed = reachedSmallest(rank, count, rateStep, phases.animationDivisor.length);
    steps.set(sizing.id, {
      lod: lowered ? loweredLod(sizing.lod, settings.lodBias) : sizing.lod,
      effects,
      decalShare: settings.decalLightShare,
      divisor: slowed ? settings.animationDivisor : 1,
    });
  }
  return steps;
}

export function frameDue(step: WidgetStep, serial: number): boolean {
  return serial % step.divisor === 0;
}
