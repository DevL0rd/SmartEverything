import { describe, expect, it } from 'vitest';
import {
  BUDGET_OVERRIDES,
  CATCHABLE_ERROR_CLASS,
  ERROR_CLASS,
  ERROR_CLASSES,
  LOOP_LIMIT,
  NODE_POLICY,
  RETRY,
  RUN_MODES,
  RUN_POLICY,
  UNCATCHABLE_ERROR_CLASSES,
} from '../../src/automation-v3/policy';

describe('error classes', () => {
  it('lists the thirteen core classes', () => {
    expect(ERROR_CLASSES).toHaveLength(13);
    for (const name of ERROR_CLASSES) expect(ERROR_CLASS.safeParse(name).success).toBe(true);
    expect(ERROR_CLASS.safeParse('Other').success).toBe(false);
  });

  it('refuses to catch budget and cancel errors', () => {
    for (const name of UNCATCHABLE_ERROR_CLASSES) {
      expect(CATCHABLE_ERROR_CLASS.safeParse(name).success).toBe(false);
    }
    expect(CATCHABLE_ERROR_CLASS.safeParse('Timeout').success).toBe(true);
  });
});

describe('node policy', () => {
  it('accepts an empty policy and a full one', () => {
    expect(NODE_POLICY.safeParse({}).success).toBe(true);
    const full = {
      onError: 'route',
      retry: {
        attempts: 3,
        backoff: 'exponential',
        initial: 500,
        max: 4000,
        jitter: true,
        on: ['Unreachable', 'Timeout'],
      },
      timeout: 10_000,
      acknowledgeRepeat: true,
    };
    expect(NODE_POLICY.parse(full)).toEqual(full);
  });

  it('rejects an unknown error mode and unknown fields', () => {
    expect(NODE_POLICY.safeParse({ onError: 'ignore' }).success).toBe(false);
    expect(NODE_POLICY.safeParse({ extra: 1 }).success).toBe(false);
  });

  it('rejects a retry that is zero attempts, too long a cap or retries Unknown', () => {
    const base = { attempts: 2, backoff: 'fixed', initial: 1000 };
    expect(RETRY.safeParse(base).success).toBe(true);
    expect(RETRY.safeParse({ ...base, attempts: 0 }).success).toBe(false);
    expect(RETRY.safeParse({ ...base, max: 999 }).success).toBe(false);
    expect(RETRY.safeParse({ ...base, max: 1000 }).success).toBe(true);
    expect(RETRY.safeParse({ ...base, on: ['Unknown'] }).success).toBe(false);
    expect(RETRY.safeParse({ ...base, on: [] }).success).toBe(false);
  });

  it('rejects a zero timeout', () => {
    expect(NODE_POLICY.safeParse({ timeout: 0 }).success).toBe(false);
  });
});

describe('run policy', () => {
  it('knows the four modes', () => {
    expect(RUN_MODES).toEqual(['single', 'restart', 'queue', 'parallel']);
  });

  it('leaves max absent for queue and parallel', () => {
    expect(RUN_POLICY.parse({ mode: 'queue' })).toEqual({ mode: 'queue' });
    expect(RUN_POLICY.parse({ mode: 'parallel' })).toEqual({ mode: 'parallel' });
  });

  it('takes max, maxWait, key and timeout', () => {
    const policy = { mode: 'queue', max: 10, maxWait: 60_000, key: 'room', timeout: 5000 };
    expect(RUN_POLICY.parse(policy)).toEqual(policy);
  });

  it('rejects a zero max, an unknown mode and unknown fields', () => {
    expect(RUN_POLICY.safeParse({ mode: 'queue', max: 0 }).success).toBe(false);
    expect(RUN_POLICY.safeParse({ mode: 'fast' }).success).toBe(false);
    expect(RUN_POLICY.safeParse({ mode: 'single', extra: 1 }).success).toBe(false);
    expect(RUN_POLICY.safeParse({ mode: 'queue', key: '' }).success).toBe(false);
  });
});

describe('budget overrides', () => {
  it('takes the three switches and numeric overrides', () => {
    const budgets = {
      startBucket: 'off',
      feedback: 'off',
      effects: 'on',
      stepsInARow: 50_000,
      stepsTotal: 2_000_000,
      loopIterations: 200_000,
      ancestry: 4,
      parallelWidthRegion: 32,
      parallelWidthRun: 128,
      commandsPerMinute: 300,
      runStateBytes: 4_194_304,
      valueBytes: 524_288,
    };
    expect(BUDGET_OVERRIDES.parse(budgets)).toEqual(budgets);
  });

  it('accepts none and rejects bad switches, zero and unknown limits', () => {
    expect(BUDGET_OVERRIDES.parse({})).toEqual({});
    expect(BUDGET_OVERRIDES.safeParse({ startBucket: 'maybe' }).success).toBe(false);
    expect(BUDGET_OVERRIDES.safeParse({ stepsTotal: 0 }).success).toBe(false);
    expect(BUDGET_OVERRIDES.safeParse({ callDepth: 32 }).success).toBe(false);
    expect(BUDGET_OVERRIDES.safeParse({ other: 1 }).success).toBe(false);
  });
});

describe('loop limit', () => {
  it('takes iterations, time, onLimit and a note', () => {
    const limit = { iterations: 1000, time: 3_600_000, onLimit: 'fail', note: 'stopped' };
    expect(LOOP_LIMIT.parse(limit)).toEqual(limit);
    expect(LOOP_LIMIT.parse({ onLimit: 'end' })).toEqual({ onLimit: 'end' });
  });

  it('needs onLimit and positive numbers', () => {
    expect(LOOP_LIMIT.safeParse({ iterations: 5 }).success).toBe(false);
    expect(LOOP_LIMIT.safeParse({ iterations: 0, onLimit: 'end' }).success).toBe(false);
    expect(LOOP_LIMIT.safeParse({ time: 0, onLimit: 'end' }).success).toBe(false);
    expect(LOOP_LIMIT.safeParse({ onLimit: 'end', note: '' }).success).toBe(false);
  });
});
