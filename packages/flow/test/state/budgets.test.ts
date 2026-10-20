import { describe, expect, it } from 'vitest';
import {
  admit,
  ancestryBreach,
  breachClass,
  BUDGET_DEFAULTS,
  BUDGET_SCOPES,
  clearIterations,
  countIteration,
  countStep,
  fullBucket,
  iterationBreach,
  PARK_LIMIT_MS,
  parallelBreach,
  refilled,
  resolveBudgets,
  RUN_BUDGETS,
  SIZE_CHECK_STEP,
  sizeChecked,
  startBudgets,
  stateBreach,
  stateBytes,
  stateWarns,
  stepBreach,
  stepsWarn,
  suspended,
  usedAboveHalf,
  valueBreach,
} from '../../src/state/budgets';
import type { RunBudgets } from '../../src/state/budgets';

const limits = resolveBudgets();

describe('default limits', () => {
  it('set no step, loop, chain or width limit and keep the device rate and memory guard', () => {
    expect(limits).toStrictEqual({
      stepsInARow: null,
      stepsTotal: null,
      stepsWarnAt: 100_000,
      loopIterations: null,
      ancestry: null,
      parallelWidthRegion: null,
      parallelWidthRun: null,
      runStateWarnBytes: 262_144,
      runStateBytes: 8_388_608,
      valueBytes: null,
      commandsRun: { burst: 600, perMinute: 600 },
      commandsControl: { burst: 20, perMinute: 120 },
      effectsRun: { burst: 20, perMinute: 60 },
      effectsAutomation: { burst: 60, perMinute: 10 },
      effectsPerson: { burst: 5, perMinute: 10 },
      startBucket: true,
      feedback: true,
      effects: true,
    });
  });

  it('keeps the table of defaults and the resolved limits in step', () => {
    expect(BUDGET_DEFAULTS.commandsPerMinute).toBe(limits.commandsRun.perMinute);
    expect(BUDGET_DEFAULTS.runStateBytes).toBe(limits.runStateBytes);
    expect(BUDGET_DEFAULTS.effectsAutomation.perMinute * 60).toBe(600);
  });
});

describe('overrides', () => {
  it('replace every numeric default', () => {
    const resolved = resolveBudgets({
      stepsInARow: 5,
      stepsTotal: 50,
      loopIterations: 7,
      ancestry: 2,
      parallelWidthRegion: 4,
      parallelWidthRun: 9,
      commandsPerMinute: 30,
      runStateBytes: 1000,
      valueBytes: 64,
    });
    expect(resolved).toMatchObject({
      stepsInARow: 5,
      stepsTotal: 50,
      stepsWarnAt: 50,
      loopIterations: 7,
      ancestry: 2,
      parallelWidthRegion: 4,
      parallelWidthRun: 9,
      commandsRun: { burst: 30, perMinute: 30 },
      runStateBytes: 1000,
      runStateWarnBytes: 1000,
      valueBytes: 64,
    });
  });

  it('keeps the warning points when the limits sit above them', () => {
    const resolved = resolveBudgets({ stepsTotal: 2_000_000, runStateBytes: 16_000_000 });
    expect(resolved.stepsWarnAt).toBe(100_000);
    expect(resolved.runStateWarnBytes).toBe(262_144);
  });

  it('switch storm protection off one at a time', () => {
    expect(resolveBudgets({ startBucket: 'off' })).toMatchObject({
      startBucket: false,
      feedback: true,
      effects: true,
    });
    expect(resolveBudgets({ feedback: 'off' })).toMatchObject({
      startBucket: true,
      feedback: false,
      effects: true,
    });
    expect(resolveBudgets({ effects: 'off' })).toMatchObject({
      startBucket: true,
      feedback: true,
      effects: false,
    });
    expect(resolveBudgets({ startBucket: 'on', feedback: 'on', effects: 'on' })).toMatchObject({
      startBucket: true,
      feedback: true,
      effects: true,
    });
  });
});

describe('breach classes', () => {
  it('make run budgets uncatchable and node limits catchable', () => {
    expect(breachClass('steps_in_a_row')).toBe('BudgetExceeded');
    expect(breachClass('effects')).toBe('BudgetExceeded');
    expect(breachClass('loop_iterations')).toBe('LimitExceeded');
    expect(breachClass('value_bytes')).toBe('LimitExceeded');
    expect(Object.keys(BUDGET_SCOPES)).toHaveLength(10);
    expect(Object.keys(BUDGET_SCOPES)).not.toContain('call_depth');
  });
});

describe('token buckets', () => {
  const rate = { burst: 20, perMinute: 60 };

  it('start full', () => {
    expect(fullBucket(rate, 5)).toStrictEqual({ tokens: 20, at: 5 });
  });

  it('refill by time and stop at the burst', () => {
    expect(refilled({ tokens: 0, at: 0 }, rate, 500)).toStrictEqual({ tokens: 0.5, at: 500 });
    expect(refilled({ tokens: 19.5, at: 0 }, rate, 5000)).toStrictEqual({ tokens: 20, at: 5000 });
  });

  it('refill nothing at the same instant and restart full when the clock moved back', () => {
    expect(refilled({ tokens: 3, at: 100 }, rate, 100)).toStrictEqual({ tokens: 3, at: 100 });
    expect(refilled({ tokens: 3, at: 100 }, rate, 50)).toStrictEqual({ tokens: 20, at: 50 });
  });

  it('admit and take one token from every bucket', () => {
    const verdict = admit(
      [
        { bucket: { tokens: 5, at: 0 }, rate },
        { bucket: { tokens: 1, at: 0 }, rate },
      ],
      0,
      0,
    );
    expect(verdict).toStrictEqual({
      kind: 'go',
      buckets: [
        { tokens: 4, at: 0 },
        { tokens: 0, at: 0 },
      ],
    });
  });

  it('wait for the slowest empty bucket and keep every token', () => {
    const verdict = admit(
      [
        { bucket: { tokens: 5, at: 0 }, rate },
        { bucket: { tokens: 0, at: 0 }, rate },
        { bucket: { tokens: 0.5, at: 0 }, rate: { burst: 5, perMinute: 6 } },
      ],
      0,
      0,
    );
    expect(verdict).toStrictEqual({
      kind: 'wait',
      until: 5000,
      buckets: [
        { tokens: 5, at: 0 },
        { tokens: 0, at: 0 },
        { tokens: 0.5, at: 0 },
      ],
    });
  });

  it('wait exactly up to the park limit and fail beyond it', () => {
    const slow = { burst: 1, perMinute: 1 };
    const empty = { tokens: 0, at: 0 };
    expect(admit([{ bucket: empty, rate: slow }], 0, 0)).toMatchObject({
      kind: 'wait',
      until: PARK_LIMIT_MS,
    });
    expect(admit([{ bucket: { tokens: 0, at: 0 }, rate: slow }], 0, -1)).toMatchObject({
      kind: 'exhausted',
    });
  });

  it('count the park limit from the first ask', () => {
    const slow = { burst: 1, perMinute: 1 };
    const bucket = { tokens: 0, at: 30_000 };
    expect(admit([{ bucket, rate: slow }], 30_000, 0)).toMatchObject({ kind: 'exhausted' });
    expect(admit([{ bucket, rate: slow }], 30_000, 30_000)).toMatchObject({ kind: 'wait' });
  });

  it('go once the refill instant has come', () => {
    const verdict = admit([{ bucket: { tokens: 0, at: 0 }, rate }], 1000, 0);
    expect(verdict).toStrictEqual({ kind: 'go', buckets: [{ tokens: 0, at: 1000 }] });
  });
});

describe('run counters', () => {
  it('start empty with full buckets', () => {
    const budgets = startBudgets(limits, 7);
    expect(RUN_BUDGETS.parse(budgets)).toStrictEqual(budgets);
    expect(budgets).toStrictEqual({
      steps: 0,
      sinceSuspend: 0,
      iterations: {},
      commands: { tokens: 600, at: 7 },
      controls: {},
      effects: { tokens: 20, at: 7 },
      startedAt: 7,
      written: 0,
      sizeCheckAt: SIZE_CHECK_STEP,
    });
  });

  it('count steps and reset the steps in a row on suspension', () => {
    const counted = countStep(countStep(startBudgets(limits, 0)));
    expect(counted).toMatchObject({ steps: 2, sinceSuspend: 2 });
    expect(suspended(counted)).toMatchObject({ steps: 2, sinceSuspend: 0 });
  });

  it('count and clear iterations per loop path', () => {
    let budgets = startBudgets(limits, 0);
    budgets = countIteration(countIteration(budgets, 'a'), 'b');
    budgets = countIteration(budgets, 'a');
    expect(budgets.iterations).toStrictEqual({ a: 2, b: 1 });
    expect(clearIterations(budgets, 'a').iterations).toStrictEqual({ b: 1 });
  });

  it('warn once when the step count reaches the warning point', () => {
    const small = resolveBudgets({ stepsTotal: 2 });
    const first = countStep(startBudgets(small, 0));
    expect(stepsWarn(first, small)).toBe(false);
    expect(stepsWarn(countStep(first), small)).toBe(true);
    expect(stepsWarn(countStep(countStep(first)), small)).toBe(false);
  });
});

describe('breaches', () => {
  it('flag steps in a row first and total steps second', () => {
    const tight = resolveBudgets({ stepsInARow: 2, stepsTotal: 3 });
    let budgets = startBudgets(tight, 0);
    budgets = countStep(countStep(budgets));
    expect(stepBreach(budgets, tight)).toBeNull();
    expect(stepBreach(countStep(budgets), tight)).toStrictEqual({
      budget: 'steps_in_a_row',
      limit: 2,
      used: 3,
    });
    const reset = suspended(countStep(budgets));
    expect(stepBreach(reset, tight)).toBeNull();
    expect(stepBreach(countStep(reset), tight)).toStrictEqual({
      budget: 'steps_total',
      limit: 3,
      used: 4,
    });
  });

  it('flag a loop that ran past its limit', () => {
    expect(iterationBreach(10, 10)).toBeNull();
    expect(iterationBreach(11, 10)).toStrictEqual({
      budget: 'loop_iterations',
      limit: 10,
      used: 11,
    });
  });

  it('flag nothing without a limit, however much is used', () => {
    expect(
      stepBreach({ ...startBudgets(limits, 0), steps: 1e9, sinceSuspend: 1e9 }, limits),
    ).toBeNull();
    expect(iterationBreach(1e9, limits.loopIterations)).toBeNull();
    expect(ancestryBreach(1e6, limits)).toBeNull();
    expect(parallelBreach(1e6, 1e6, limits)).toBeNull();
  });

  it('flag ancestry when the automation sets a chain limit', () => {
    const chained = resolveBudgets({ ancestry: 8 });
    expect(ancestryBreach(8, chained)).toBeNull();
    expect(ancestryBreach(9, chained)).toMatchObject({ budget: 'ancestry', limit: 8 });
  });

  it('flag a region first and the whole run second when widths are set', () => {
    const wide = resolveBudgets({ parallelWidthRegion: 64, parallelWidthRun: 256 });
    expect(parallelBreach(64, 256, wide)).toBeNull();
    expect(parallelBreach(65, 300, wide)).toMatchObject({ budget: 'parallel_region' });
    expect(parallelBreach(2, 257, wide)).toMatchObject({ budget: 'parallel_run', used: 257 });
  });

  it('flag a value only when a value limit is set', () => {
    expect(valueBreach(10_000_000, limits)).toBeNull();
    const capped = resolveBudgets({ valueBytes: 8 });
    expect(valueBreach(8, capped)).toBeNull();
    expect(valueBreach(9, capped)).toMatchObject({ budget: 'value_bytes', limit: 8, used: 9 });
  });
});

describe('state size', () => {
  it('measures serialised bytes, not characters', () => {
    expect(stateBytes({ a: 'é' })).toBe(10);
    expect(stateBytes([])).toBe(2);
  });

  it('warns from 256 KiB up to the limit and fails above it', () => {
    expect(stateWarns(262_143, limits)).toBe(false);
    expect(stateWarns(262_144, limits)).toBe(true);
    expect(stateWarns(8_388_608, limits)).toBe(true);
    expect(stateWarns(8_388_609, limits)).toBe(false);
    expect(stateBreach(8_388_608, limits)).toBeNull();
    expect(stateBreach(8_388_609, limits)).toStrictEqual({
      budget: 'run_state',
      limit: 8_388_608,
      used: 8_388_609,
    });
  });
});

describe('run state size guard', () => {
  interface Sized {
    readonly budgets: RunBudgets;
    readonly frames: readonly string[];
  }
  const state = (frames: number, sizeCheckAt: number, pad = ''): Sized => ({
    budgets: { ...startBudgets(limits, 0), sizeCheckAt },
    frames: Array.from({ length: frames }, () => pad),
  });

  it('measures only when the bytes written reach the checkpoint and then moves it on', () => {
    expect(sizeChecked(state(3, 100), 0, limits)).toStrictEqual({
      value: state(3, 100),
      breach: null,
    });
    const counted = sizeChecked(state(3, 100), 40, limits);
    expect(counted.breach).toBeNull();
    expect(counted.value.budgets).toMatchObject({ written: 40, sizeCheckAt: 100 });
    const checked = sizeChecked(state(4, 100), 100, limits);
    expect(checked.breach).toBeNull();
    expect(checked.value.budgets.sizeCheckAt).toBe(100 + SIZE_CHECK_STEP);
  });

  it('fails with the run state budget once the measured state is too large', () => {
    const small = resolveBudgets({ runStateBytes: 100 });
    const checked = sizeChecked(state(2, 2, 'x'.repeat(200)), 5, small);
    expect(checked.breach).toMatchObject({ budget: 'run_state', limit: 100 });
    expect(breachClass('run_state')).toBe('BudgetExceeded');
  });
});

describe('usage above half', () => {
  it('is true only past half of the limit', () => {
    expect(usedAboveHalf(50, 100)).toBe(false);
    expect(usedAboveHalf(51, 100)).toBe(true);
  });
});
