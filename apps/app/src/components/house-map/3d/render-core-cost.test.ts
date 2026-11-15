import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_QUALITY_CONFIG,
  initialQuality,
  qualitySettings,
  recordFrame,
  type QualitySettings,
  type QualityState,
} from '../live-visibility/quality-scaler';
import { FrameCost, ProgramPins, type CompiledProgram } from './render-core-cost';

const STEADY_MS = 8;
const RESIZE_MS = 240;

let now = 0;

beforeEach(() => {
  now = 0;
  vi.spyOn(performance, 'now').mockImplementation(() => now);
});

afterEach(() => {
  vi.restoreAllMocks();
});

function shaderKey(quality: QualitySettings): string {
  return `${String(quality.lodBias)}|${String(quality.decalLightShare)}`;
}

class Stage {
  readonly keys: string[] = [];
  readonly programs: CompiledProgram[] = [];
  readonly info = { programs: this.programs };
  readonly cost = new FrameCost();
  scaler: QualityState = initialQuality();
  compiled = 0;

  frame(ms: number): void {
    const key = shaderKey(qualitySettings(this.scaler));
    const reported = this.cost.measure(this.info, () => {
      if (!this.keys.includes(key)) {
        this.keys.push(key);
        this.programs.push({ usedTimes: 1 });
        this.compiled += 1;
      }
      now += ms;
    });
    if (reported !== null) this.scaler = recordFrame(this.scaler, reported, DEFAULT_QUALITY_CONFIG);
  }

  steady(frames: number): void {
    for (let frame = 0; frame < frames; frame += 1) this.frame(STEADY_MS);
  }
}

describe('the 3D map frame cost', () => {
  it('reports an ordinary frame', () => {
    const cost = new FrameCost();
    expect(
      cost.measure({ programs: [] }, () => {
        now += STEADY_MS;
      }),
    ).toBe(STEADY_MS);
  });

  it('leaves out the frame that carries a resize and a frame that compiled a program', () => {
    const cost = new FrameCost();
    const programs: CompiledProgram[] = [];
    cost.resized();
    expect(cost.measure({ programs }, () => (now += RESIZE_MS))).toBeNull();
    expect(cost.measure({ programs }, () => programs.push({ usedTimes: 1 }))).toBeNull();
    expect(cost.measure({ programs }, () => (now += STEADY_MS))).toBe(STEADY_MS);
  });

  it('keeps the quality tier and compiles no shader through a resize', () => {
    const stage = new Stage();
    stage.steady(30);
    const compiled = stage.compiled;
    const level = stage.scaler.level;
    for (let resize = 0; resize < 4; resize += 1) {
      stage.cost.resized();
      stage.frame(RESIZE_MS);
      stage.steady(30);
    }
    expect(stage.scaler.level).toBe(level);
    expect(stage.compiled).toBe(compiled);
  });

  it('still steps the quality down for a sustained real frame cost', () => {
    const stage = new Stage();
    stage.steady(30);
    for (let frame = 0; frame < 30; frame += 1) stage.frame(RESIZE_MS);
    expect(stage.scaler.level).toBeGreaterThan(0);
  });

  it('pins every compiled program once so a model that leaves and returns reuses it', () => {
    const pins = new ProgramPins();
    const program = { usedTimes: 1 };
    const programs = [program];
    expect(pins.keep({ programs })).toBe(true);
    expect(pins.keep({ programs })).toBe(false);
    program.usedTimes -= 1;
    expect(program.usedTimes).toBe(1);
    const next = { usedTimes: 1 };
    programs.push(next);
    expect(pins.keep({ programs })).toBe(true);
    expect([program.usedTimes, next.usedTimes]).toEqual([1, 2]);
  });
});
