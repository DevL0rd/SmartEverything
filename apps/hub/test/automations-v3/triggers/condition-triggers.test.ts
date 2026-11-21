import { describe, expect, it } from 'vitest';
import type { PortValue, TriggerNode } from '@smarteverything/domain';
import type { Checked } from '@smarteverything/flow/interpret/frames';
import { SimulatedClock as TestClock } from '../../../src/clock/simulated';
import {
  armConditionTriggers,
  compileCondition,
  type ConditionHost,
} from '../../../src/automations/triggers-v3/condition-triggers';
import type { TriggerFire } from '../../../src/automations/triggers-v3/payload';
import type {
  ConditionEntry,
  TriggerProblem,
} from '../../../src/automations/triggers-v3/trigger-types';
import { node } from './support';

const START = '2026-10-19T08:00:00.000Z';

const CONDITION: PortValue = { wire: { from: 'bright', port: 'result' } };

type Verdict = boolean | string;

class Rig {
  readonly clock = new TestClock(START);
  readonly fires: TriggerFire[] = [];
  readonly problems: TriggerProblem[] = [];
  verdict: Verdict = false;
  keys: readonly string[] = ['device:brightness'];
  private readonly changes = new Set<() => void>();
  watching = 0;

  readonly entry: ConditionEntry = {
    automationId: 'auto',
    triggerId: 'trigger-1',
    key: 'becomes_true',
    kind: 'trigger.becomes_true',
    condition: CONDITION,
    holdMs: 0,
  };

  host(): ConditionHost {
    return {
      clock: this.clock,
      keysOf: () => this.keys,
      watch: (_keys, changed) => {
        this.changes.add(changed);
        this.watching += 1;
        return (): void => {
          this.changes.delete(changed);
          this.watching -= 1;
        };
      },
      evaluate: (): Promise<Checked<boolean>> =>
        Promise.resolve(
          typeof this.verdict === 'string'
            ? { ok: false, class: 'TypeError', message: this.verdict }
            : { ok: true, value: this.verdict },
        ),
      fire: (fire) => this.fires.push(fire),
      problem: (problem) => this.problems.push(problem),
    };
  }

  async arm(entry: ConditionEntry = this.entry): Promise<() => void> {
    const disarm = armConditionTriggers([entry], this.host());
    await settled();
    return disarm;
  }

  async change(verdict: Verdict): Promise<void> {
    this.verdict = verdict;
    for (const changed of [...this.changes]) changed();
    await settled();
  }

  advance(milliseconds: number): void {
    this.clock.advanceTo(new Date(this.clock.now().getTime() + milliseconds).toISOString());
  }
}

async function settled(): Promise<void> {
  for (let turn = 0; turn < 10; turn += 1) await Promise.resolve();
}

describe('trigger.becomes_true edge detection', () => {
  it('fires on the change from false to true and never when it was already true at arming', async () => {
    const rig = new Rig();
    rig.verdict = true;
    await rig.arm();
    expect(rig.fires).toEqual([]);
    await rig.change(true);
    expect(rig.fires).toEqual([]);
    await rig.change(false);
    await rig.change(true);
    expect(rig.fires).toHaveLength(1);
    expect(rig.fires[0]).toEqual({
      automationId: 'auto',
      triggerId: 'trigger-1',
      key: 'becomes_true',
      kind: 'trigger.becomes_true',
      at: START,
      payload: { at: START },
    });
  });

  it('fires once while the condition stays true and again after it fell and rose', async () => {
    const rig = new Rig();
    await rig.arm();
    await rig.change(true);
    await rig.change(true);
    await rig.change(true);
    expect(rig.fires).toHaveLength(1);
    await rig.change(false);
    await rig.change(true);
    expect(rig.fires).toHaveLength(2);
  });

  it('is evaluated only when a dependency changes, with no timer of its own', async () => {
    const rig = new Rig();
    await rig.arm();
    expect(rig.clock.pending()).toEqual([]);
    rig.advance(3_600_000);
    expect(rig.fires).toEqual([]);
  });

  it('reports a condition that reads nothing that can change', async () => {
    const rig = new Rig();
    rig.keys = [];
    await rig.arm();
    expect(rig.problems).toEqual([
      {
        automationId: 'auto',
        triggerId: 'trigger-1',
        message: 'The condition reads nothing that can change, so it can never become true',
      },
    ]);
  });

  it('stops watching and drops a pending hold when disarmed', async () => {
    const rig = new Rig();
    const disarm = await rig.arm({ ...rig.entry, holdMs: 60_000 });
    await rig.change(true);
    expect(rig.clock.pending()).toHaveLength(1);
    disarm();
    expect(rig.watching).toBe(0);
    expect(rig.clock.pending()).toEqual([]);
    rig.advance(120_000);
    expect(rig.fires).toEqual([]);
  });
});

describe('trigger.becomes_true hold', () => {
  const held = (rig: Rig): ConditionEntry => ({ ...rig.entry, holdMs: 300_000 });

  it('fires only after the condition stayed true for the hold, stamped with that moment', async () => {
    const rig = new Rig();
    await rig.arm(held(rig));
    await rig.change(true);
    rig.advance(299_000);
    expect(rig.fires).toEqual([]);
    rig.advance(1000);
    expect(rig.fires).toHaveLength(1);
    expect(rig.fires[0]?.at).toBe('2026-10-19T08:05:00.000Z');
    expect(rig.fires[0]?.payload).toEqual({ at: '2026-10-19T08:05:00.000Z' });
  });

  it('forgets a hold when the condition falls first and starts a full one when it rises again', async () => {
    const rig = new Rig();
    await rig.arm(held(rig));
    await rig.change(true);
    rig.advance(200_000);
    await rig.change(false);
    rig.advance(200_000);
    expect(rig.fires).toEqual([]);
    await rig.change(true);
    rig.advance(299_000);
    expect(rig.fires).toEqual([]);
    rig.advance(1000);
    expect(rig.fires).toHaveLength(1);
  });

  it('does not restart the hold when another dependency changes while it is still true', async () => {
    const rig = new Rig();
    await rig.arm(held(rig));
    await rig.change(true);
    rig.advance(100_000);
    await rig.change(true);
    rig.advance(200_000);
    expect(rig.fires).toHaveLength(1);
  });
});

describe('trigger.becomes_true failures', () => {
  it('treats a failing condition as not true, tells why once, and fires when it later rises', async () => {
    const rig = new Rig();
    await rig.arm();
    await rig.change('the left value of the comparison is absent');
    await rig.change('the left value of the comparison is absent');
    expect(rig.fires).toEqual([]);
    expect(rig.problems.map((problem) => problem.message)).toEqual([
      'the left value of the comparison is absent',
    ]);
    await rig.change(true);
    expect(rig.fires).toHaveLength(1);
    await rig.change('another failure');
    expect(rig.problems.map((problem) => problem.message)).toEqual([
      'the left value of the comparison is absent',
      'another failure',
    ]);
  });

  it('starts from false when the first evaluation already fails', async () => {
    const rig = new Rig();
    rig.verdict = 'no reading yet';
    await rig.arm();
    await rig.change(true);
    expect(rig.fires).toHaveLength(1);
  });
});

describe('compiling a condition trigger', () => {
  function trigger(ports: Record<string, PortValue>): TriggerNode {
    return { ...node('trigger.becomes_true', {}), ports };
  }

  it('keeps the condition as it was written and reads the hold', () => {
    const compiled = compileCondition(
      'auto',
      trigger({ condition: CONDITION, hold: { lit: 5000 } }),
    );
    expect(compiled).toMatchObject({
      condition: {
        automationId: 'auto',
        kind: 'trigger.becomes_true',
        holdMs: 5000,
        condition: CONDITION,
      },
    });
  });

  it('needs a condition', () => {
    expect(compileCondition('auto', trigger({}))).toEqual({
      problem: 'trigger.becomes_true needs a condition',
    });
  });

  it('wants the hold fixed and whole', () => {
    expect(
      compileCondition(
        'auto',
        trigger({ condition: CONDITION, hold: { wire: { from: 'lamp', port: 'value' } } }),
      ),
    ).toEqual({
      problem: 'hold must be a fixed value on a trigger.becomes_true trigger',
    });
    expect(compileCondition('auto', trigger({ condition: CONDITION, hold: { lit: -1 } }))).toEqual({
      problem: 'hold must be a whole number of milliseconds',
    });
    expect(compileCondition('auto', trigger({ condition: CONDITION, hold: { lit: 1.5 } }))).toEqual(
      {
        problem: 'hold must be a whole number of milliseconds',
      },
    );
  });
});
