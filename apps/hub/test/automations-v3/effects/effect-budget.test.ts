import { fullBucket, resolveBudgets, type Bucket } from '@smarteverything/flow/state/budgets';
import { describe, expect, it } from 'vitest';
import {
  EffectBudget,
  EffectBudgetExceededError,
  type EffectLimits,
} from '../../../src/automations/effects/effect-budget';
import { AutomationRunCancelledError } from '../../../src/automations/effects/run-abort';
import { FakeClock } from '../../support/fake-clock';
import { testRun } from './support';

const START = '2026-10-08T12:00:00.000Z';

const limits: EffectLimits = resolveBudgets();

function plus(seconds: number): string {
  return new Date(Date.parse(START) + seconds * 1000).toISOString();
}

interface Spending {
  readonly budget: EffectBudget;
  readonly bucket: Bucket;
  readonly run: ReturnType<typeof testRun>;
  readonly kind?: 'effects' | 'effects_person';
}

async function spend(spending: Spending, count: number): Promise<Bucket> {
  const { budget, run, kind = 'effects' } = spending;
  let { bucket } = spending;
  for (let index = 0; index < count; index += 1) {
    bucket = await budget.admit(
      { automationId: run.automationId, kind, limits, runBucket: bucket },
      run,
    );
  }
  return bucket;
}

function fresh(): Bucket {
  return fullBucket(limits.effectsRun, Date.parse(START));
}

describe('effect budget', () => {
  it('lets a burst of twenty effects through at once', async () => {
    const clock = new FakeClock(START);
    await spend({ budget: new EffectBudget(clock), bucket: fresh(), run: testRun() }, 20);
    expect(clock.pending()).toStrictEqual([]);
  });

  it('parks the next effect until the refill instant and then lets it go', async () => {
    const clock = new FakeClock(START);
    const budget = new EffectBudget(clock);
    const run = testRun();
    const bucket = await spend({ budget, bucket: fresh(), run }, 20);
    let released = false;
    const next = spend({ budget, bucket, run }, 1).then(() => {
      released = true;
    });
    await Promise.resolve();
    expect(clock.pending()).toStrictEqual([plus(1)]);
    expect(released).toBe(false);
    clock.advanceTo(plus(1));
    await next;
    expect(released).toBe(true);
  });

  it('shares the per-automation bucket between runs', async () => {
    const clock = new FakeClock(START);
    const budget = new EffectBudget(clock);
    const automationId = testRun().automationId;
    for (let index = 0; index < 60; index += 1) {
      const run = { ...testRun(), automationId };
      await budget.admit(
        {
          automationId,
          kind: 'effects',
          limits,
          runBucket: fullBucket(limits.effectsRun, Date.parse(START)),
        },
        run,
      );
    }
    const run = { ...testRun(), automationId };
    const waiting = budget.admit(
      {
        automationId,
        kind: 'effects',
        limits,
        runBucket: fullBucket(limits.effectsRun, Date.parse(START)),
      },
      run,
    );
    await Promise.resolve();
    expect(clock.pending()).toStrictEqual([plus(6)]);
    clock.advanceTo(plus(6));
    await waiting;
  });

  it('holds notifications to five at once', async () => {
    const clock = new FakeClock(START);
    const budget = new EffectBudget(clock);
    const run = testRun();
    const person = { budget, run, kind: 'effects_person' } as const;
    const bucket = await spend({ ...person, bucket: fresh() }, 5);
    const next = spend({ ...person, bucket }, 1);
    await Promise.resolve();
    expect(clock.pending()).toStrictEqual([plus(6)]);
    clock.advanceTo(plus(6));
    await next;
  });

  it('fails with the effects budget when the wait would pass a minute', async () => {
    const clock = new FakeClock(START);
    const slow: EffectLimits = {
      ...limits,
      effectsRun: { burst: 1, perMinute: 0.5 },
    };
    const budget = new EffectBudget(clock);
    const run = testRun();
    const bucket = await budget.admit(
      {
        automationId: run.automationId,
        kind: 'effects',
        limits: slow,
        runBucket: fullBucket(slow.effectsRun, Date.parse(START)),
      },
      run,
    );
    const error = await budget
      .admit(
        { automationId: run.automationId, kind: 'effects', limits: slow, runBucket: bucket },
        run,
      )
      .catch((cause: unknown) => cause);
    expect(error).toBeInstanceOf(EffectBudgetExceededError);
    expect(error).toMatchObject({ budget: 'effects', limit: 1 });
  });

  it('does nothing when the automation switched the effect budget off', async () => {
    const clock = new FakeClock(START);
    const budget = new EffectBudget(clock);
    const run = testRun();
    const empty: Bucket = { tokens: 0, at: Date.parse(START) };
    const kept = await budget.admit(
      {
        automationId: run.automationId,
        kind: 'effects_person',
        limits: { ...limits, effects: false },
        runBucket: empty,
      },
      run,
    );
    expect(kept).toBe(empty);
    expect(clock.pending()).toStrictEqual([]);
  });

  it('stops waiting when the run is cancelled and leaves no timer behind', async () => {
    const clock = new FakeClock(START);
    const budget = new EffectBudget(clock);
    const run = testRun();
    const bucket = await spend({ budget, bucket: fresh(), run }, 20);
    const next = spend({ budget, bucket, run }, 1);
    await Promise.resolve();
    run.controller.abort();
    await expect(next).rejects.toBeInstanceOf(AutomationRunCancelledError);
    expect(clock.pending()).toStrictEqual([]);
  });
});
