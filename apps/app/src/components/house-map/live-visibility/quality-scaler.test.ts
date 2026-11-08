import { describe, expect, it } from 'vitest';
import {
  DEFAULT_QUALITY_CONFIG,
  FULL_QUALITY,
  HiddenScanError,
  buildLadder,
  initialQuality,
  qualitySettings,
  recordFrame,
  splitLights,
  type QualityState,
} from './quality-scaler';

const config = DEFAULT_QUALITY_CONFIG;
const ladder = buildLadder(config.phases);

function feed(state: QualityState, frameMs: number, frames: number): QualityState {
  let current = state;
  for (let index = 0; index < frames; index += 1) {
    current = recordFrame(current, frameMs, config);
  }
  return current;
}

describe('quality ladder', () => {
  it('starts at full quality', () => {
    expect(ladder[0]).toEqual(FULL_QUALITY);
    expect(qualitySettings(initialQuality(), config)).toEqual(FULL_QUALITY);
  });

  it('steps down in the planned order: render scale, splat budget, LOD, lights to decals, animation rate', () => {
    const keys = [
      'renderScale',
      'splatScale',
      'lodBias',
      'decalLightShare',
      'animationDivisor',
    ] as const;
    const changedField = (index: number): string => {
      const before = ladder[index - 1];
      const after = ladder[index];
      if (before === undefined || after === undefined) {
        return 'missing';
      }
      return keys.filter((key) => after[key] !== before[key]).join(',');
    };
    const order: string[] = [];
    for (let index = 1; index < ladder.length; index += 1) {
      const field = changedField(index);
      if (order[order.length - 1] !== field) {
        order.push(field);
      }
    }
    expect(order).toEqual([
      'renderScale',
      'splatScale',
      'lodBias',
      'decalLightShare',
      'animationDivisor',
    ]);
  });

  it('only ever lowers cost: every step is monotone', () => {
    const pairs = ladder
      .slice(1)
      .map((after, index) => ({ before: ladder[index] ?? after, after }));
    for (const { before, after } of pairs) {
      expect(after.renderScale).toBeLessThanOrEqual(before.renderScale);
      expect(after.splatScale).toBeLessThanOrEqual(before.splatScale);
      expect(after.lodBias).toBeGreaterThanOrEqual(before.lodBias);
      expect(after.decalLightShare).toBeGreaterThanOrEqual(before.decalLightShare);
      expect(after.animationDivisor).toBeGreaterThanOrEqual(before.animationDivisor);
    }
  });
});

describe('splat budget', () => {
  it("starts at Spark's own default budget", () => {
    expect(FULL_QUALITY.splatScale).toBe(1);
  });

  it('lowers the splat budget while frames stay slow and never hides the scan', () => {
    const budgets: number[] = [];
    let state = initialQuality();
    for (let step = 0; step < ladder.length + 2; step += 1) {
      state = feed(state, 40, config.settleSamples);
      budgets.push(qualitySettings(state, config).splatScale);
    }
    expect(Math.min(...budgets)).toBeLessThan(1);
    expect(budgets.every((budget) => budget > 0)).toBe(true);
    expect(ladder.every((rung) => rung.splatScale > 0)).toBe(true);
  });

  it('raises the splat budget again when the frame time recovers', () => {
    const slow = feed(initialQuality(), 40, config.settleSamples * 5);
    const lowered = qualitySettings(slow, config).splatScale;
    expect(lowered).toBeLessThan(1);
    const recovered = feed(slow, 2, config.settleSamples * 2);
    expect(qualitySettings(recovered, config).splatScale).toBeGreaterThan(lowered);
  });

  it('refuses a budget step that would hide the scan', () => {
    const phases = { ...config.phases, splatScale: [0.5, 0] };
    expect(() => buildLadder(phases)).toThrow(HiddenScanError);
  });
});

describe('recordFrame', () => {
  it('does not move on a single slow frame', () => {
    const state = recordFrame(initialQuality(), 40, config);
    expect(state.level).toBe(0);
  });

  it('steps down one level when the frame time stays above the target', () => {
    const state = feed(initialQuality(), 25, config.settleSamples);
    expect(state.level).toBe(1);
    expect(qualitySettings(state, config)).toEqual(ladder[1]);
  });

  it('measures fresh at each level before stepping again', () => {
    const state = feed(initialQuality(), 25, config.settleSamples + 2);
    expect(state.level).toBe(1);
    const next = feed(state, 25, config.settleSamples);
    expect(next.level).toBe(2);
  });

  it('keeps stepping down while slow and stops at the last level', () => {
    const state = feed(initialQuality(), 100, config.settleSamples * (ladder.length + 5));
    expect(state.level).toBe(ladder.length - 1);
    expect(qualitySettings(state, config)).toEqual(ladder[ladder.length - 1]);
  });

  it('steps back up when there is headroom', () => {
    const down = feed(initialQuality(), 25, config.settleSamples * 3);
    expect(down.level).toBe(3);
    const up = feed(down, 6, config.settleSamples);
    expect(up.level).toBe(2);
  });

  it('holds the level inside the band between headroom and target', () => {
    const down = feed(initialQuality(), 25, config.settleSamples);
    const held = feed(down, 14, config.settleSamples * 4);
    expect(held.level).toBe(down.level);
  });

  it('does not step up from full quality', () => {
    expect(feed(initialQuality(), 2, config.settleSamples * 3).level).toBe(0);
  });

  it('settles back to full quality after load disappears', () => {
    const down = feed(initialQuality(), 100, config.settleSamples * ladder.length);
    const recovered = feed(down, 3, config.settleSamples * (ladder.length + 2));
    expect(recovered.level).toBe(0);
  });

  it('is pure: the same input state is not mutated', () => {
    const state = initialQuality();
    recordFrame(state, 100, config);
    expect(state).toEqual({ level: 0, samples: 0, smoothedMs: 0 });
  });
});

describe('splitLights', () => {
  const lights = [
    { id: 'hall', intensity: 0.4 },
    { id: 'kitchen', intensity: 0.9 },
    { id: 'bed', intensity: 0.1 },
    { id: 'lounge', intensity: 0.6 },
  ];

  it('keeps every light real at full quality', () => {
    const split = splitLights(lights, 0);
    expect(split.decal).toEqual([]);
    expect([...split.real].sort()).toEqual(['bed', 'hall', 'kitchen', 'lounge']);
  });

  it('turns the dimmest lights into decals first', () => {
    const split = splitLights(lights, 0.5);
    expect(split.decal).toEqual(['bed', 'hall']);
    expect(split.real).toEqual(['lounge', 'kitchen']);
  });

  it('never drops a light at any step of the ladder', () => {
    for (const step of ladder) {
      const split = splitLights(lights, step.decalLightShare);
      expect([...split.real, ...split.decal].sort()).toEqual(['bed', 'hall', 'kitchen', 'lounge']);
    }
  });

  it('keeps every light for any count of lights', () => {
    for (const count of [0, 1, 7, 50, 200]) {
      const many = Array.from({ length: count }, (_, index) => ({
        id: `light-${String(index)}`,
        intensity: (index * 37) % 11,
      }));
      for (const step of ladder) {
        const split = splitLights(many, step.decalLightShare);
        expect(split.real.length + split.decal.length).toBe(count);
      }
    }
  });
});
