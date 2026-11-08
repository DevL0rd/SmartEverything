import { describe, expect, it } from 'vitest';
import {
  DEFAULT_QUALITY_CONFIG,
  FULL_QUALITY,
  buildLadder,
} from '../../../components/house-map/live-visibility/quality-scaler';
import type { ModelLod } from '../../../components/models/three/geometry';
import {
  frameDue,
  fullStep,
  widgetSteps,
  type WidgetSizing,
  type WidgetStep,
} from './widget-scaler-steps';

const ladder = buildLadder(DEFAULT_QUALITY_CONFIG.phases);

function sizings(count: number, lod: ModelLod = 2): WidgetSizing[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `w${String(index)}`,
    area: (index + 1) * 100,
    lod,
  }));
}

function stepsAt(level: number, views: readonly WidgetSizing[]): ReadonlyMap<string, WidgetStep> {
  const settings = ladder[level];
  if (settings === undefined) throw new Error(`no ladder level ${String(level)}`);
  return widgetSteps(views, settings);
}

function levelWhere(match: (index: number) => boolean): number {
  const level = ladder.findIndex((_, index) => match(index));
  if (level < 0) throw new Error('no such level');
  return level;
}

describe('widget scaler steps', () => {
  it('keeps every widget at full quality while the scaler is at full quality', () => {
    const steps = widgetSteps(sizings(3), FULL_QUALITY);
    expect([...steps.values()]).toEqual([fullStep(2), fullStep(2), fullStep(2)]);
  });

  it('never removes a visible widget at any step and has no count cap', () => {
    const views = sizings(500);
    for (let level = 0; level < ladder.length; level += 1) {
      const steps = stepsAt(level, views);
      expect(steps.size).toBe(500);
      for (const step of steps.values()) expect(step.divisor).toBeGreaterThanOrEqual(1);
    }
  });

  it('lowers the level of detail of the smallest widgets first', () => {
    const views = sizings(6);
    const firstLod = levelWhere((index) => ladder[index]?.lodBias === 1);
    const steps = stepsAt(firstLod, views);
    expect(steps.get('w0')?.lod).toBe(1);
    expect(steps.get('w1')?.lod).toBe(1);
    expect(steps.get('w5')?.lod).toBe(2);
    const deepest = stepsAt(
      levelWhere((index) => ladder[index]?.lodBias === 3),
      views,
    );
    for (const step of deepest.values()) expect(step.lod).toBe(0);
  });

  it('drops halos and shadows and moves lights to decals before slowing frame rate', () => {
    const views = sizings(4);
    const decal = levelWhere((index) => (ladder[index]?.decalLightShare ?? 0) > 0);
    const step = stepsAt(decal, views).get('w3');
    expect(step?.effects).toBe(false);
    expect(step?.decalShare).toBeGreaterThan(0);
    expect(step?.divisor).toBe(1);
  });

  it('slows the frame rate of the smallest widgets first and the largest last', () => {
    const views = sizings(6);
    const firstRate = levelWhere((index) => ladder[index]?.animationDivisor === 2);
    const steps = stepsAt(firstRate, views);
    expect(steps.get('w0')?.divisor).toBe(2);
    expect(steps.get('w5')?.divisor).toBe(1);
    const last = stepsAt(ladder.length - 1, views);
    for (const step of last.values()) expect(step.divisor).toBe(4);
  });

  it('is reversible: back at full quality every widget returns to its full step', () => {
    const views = sizings(5, 1);
    stepsAt(ladder.length - 1, views);
    const back = stepsAt(0, views);
    for (const step of back.values()) expect(step).toEqual(fullStep(1));
  });

  it('draws a slowed widget on every divisor-th frame', () => {
    const step = { ...fullStep(1), divisor: 3 };
    expect([0, 1, 2, 3, 4, 5, 6].map((serial) => frameDue(step, serial))).toEqual([
      true,
      false,
      false,
      true,
      false,
      false,
      true,
    ]);
  });
});
