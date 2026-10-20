import { randomUUID } from 'node:crypto';
import type { PlanOp } from '@smarteverything/flow/compile/plan';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Simulation } from '../../../src/automations/sim/simulation';
import type { SimStart } from '../../../src/automations/sim/rig';
import type { ScenarioInput } from '../../../src/automations/sim/scenario';
import {
  NOW,
  furnish,
  pause,
  programOf,
  runChild,
  send,
  seq,
  setDevice,
  signal,
  untilClock,
  untilSignal,
} from './support';
import type { Home } from './support';

let home: Home;

beforeEach(async () => {
  home = await furnish();
});

afterEach(async () => {
  await home.test.close();
});

const HOUR = 3_600_000;

function simulate(
  start: SimStart,
  scenario: Partial<ScenarioInput> = {},
  extra: { child?: (id: string) => SimStart | undefined; breakpoints?: string[] } = {},
): Simulation {
  return new Simulation({
    scenario: { start: NOW, ...scenario },
    base: home.deps,
    start,
    ...extra,
  });
}

function at(offsetMs: number): string {
  return new Date(Date.parse(NOW) + offsetMs).toISOString();
}

describe('virtual clock', () => {
  it('completes an eight hour wait at once and stamps the command with the virtual instant', async () => {
    const after = send('after');
    const run = simulate(programOf(seq(pause('hold', 8 * HOUR), after.op)));
    const real = performance.now();
    const report = await run.run();
    expect(performance.now() - real).toBeLessThan(2000);
    expect(report.status).toBe('finished');
    expect(report.commands.map((command) => command.at)).toEqual([at(8 * HOUR)]);
    expect(report.runs[0]).toMatchObject({ status: 'succeeded', error: null });
    expect(report.now).toBe(at(8 * HOUR));
  });

  it('stops at the seven day horizon and leaves the later command unsent', async () => {
    const later = send('later');
    const report = await simulate(programOf(seq(pause('long', 8 * 24 * HOUR), later.op))).run();
    expect(report.status).toBe('horizon');
    expect(report.commands).toHaveLength(0);
    expect(report.now).toBe(at(7 * 24 * HOUR));
  });

  it('honours a shorter horizon', async () => {
    const later = send('later');
    const report = await simulate(programOf(seq(pause('long', 3 * HOUR), later.op)), {
      horizonMs: 2 * HOUR,
    }).run();
    expect(report.status).toBe('horizon');
  });

  it('crosses the spring DST change: 07:00 local is 06:00Z, then 05:00Z', async () => {
    const marks = ['a', 'b', 'c'].map((key) => send(key));
    const body = seq(
      ...marks.flatMap((mark, index) => [untilClock(`day${String(index)}`, '07:00'), mark.op]),
    );
    const report = await simulate(programOf(body), {
      start: { date: '2026-03-28', clock: '06:30', zone: 'Europe/Stockholm' },
    }).run();
    expect(report.status).toBe('finished');
    expect(report.commands.map((command) => command.at)).toEqual([
      '2026-03-28T06:00:00.000Z',
      '2026-03-29T05:00:00.000Z',
      '2026-03-30T05:00:00.000Z',
    ]);
  });

  it('crosses the autumn DST change: 07:00 local is 05:00Z, then 06:00Z', async () => {
    const marks = ['a', 'b'].map((key) => send(key));
    const body = seq(
      ...marks.flatMap((mark, index) => [untilClock(`day${String(index)}`, '07:00'), mark.op]),
    );
    const report = await simulate(programOf(body), {
      start: { date: '2026-10-24', clock: '06:30', zone: 'Europe/Stockholm' },
    }).run();
    expect(report.commands.map((command) => command.at)).toEqual([
      '2026-10-24T05:00:00.000Z',
      '2026-10-25T06:00:00.000Z',
    ]);
  });

  it('starts at the instant a local wall time names', async () => {
    const report = await simulate(programOf(seq(send('now').op)), {
      start: { date: '2026-03-28', clock: '06:30', zone: 'Europe/Stockholm' },
    }).run();
    expect(report.commands[0]?.at).toBe('2026-03-28T05:30:00.000Z');
  });
});

describe('scripted signals', () => {
  it('wakes an event wait at the scripted moment', async () => {
    const after = send('after');
    const report = await simulate(
      programOf(seq(untilSignal('presence', 'sensor', 'occupancy'), after.op)),
      { timeline: [{ at: at(HOUR), signal: signal('sensor', 'occupancy', true) }] },
    ).run();
    expect(report.status).toBe('finished');
    expect(report.commands.map((command) => command.at)).toEqual([at(HOUR)]);
  });

  it('leaves a run parked when no scripted signal ever arrives', async () => {
    const report = await simulate(
      programOf(seq(untilSignal('presence', 'sensor', 'occupancy'), send('after').op)),
    ).run();
    expect(report.status).toBe('idle');
    expect(report.commands).toHaveLength(0);
  });
});

describe('effect outcomes', () => {
  it('fails only the scripted device, others succeed and change the world', async () => {
    const failing = setDevice('a', home.lampA.id, true);
    const fine = setDevice('b', home.lampB.id, true);
    const effects = [{ device: home.lampA.id, outcome: { kind: 'offline' as const } }];
    const bad = await simulate(programOf(seq(failing.op)), { effects }).run();
    const good = await simulate(programOf(seq(fine.op)), { effects }).run();
    expect(bad.runs[0]).toMatchObject({ status: 'failed' });
    expect(bad.runs[0]?.error).toContain('offline');
    expect(good.runs[0]).toMatchObject({ status: 'succeeded' });
    expect(good.commands[0]).toMatchObject({ kind: 'device.set', targets: [home.lampB.id] });
  });

  it('delays a slow command by the scripted virtual time', async () => {
    const slow = setDevice('a', home.lampA.id, true);
    const report = await simulate(programOf(seq(slow.op)), {
      effects: [{ outcome: { kind: 'slow', delayMs: 5 * 60_000 } }],
    }).run();
    expect(report.status).toBe('finished');
    expect(report.commands[0]?.at).toBe(at(5 * 60_000));
  });

  it('reports an unknown outcome as the Unknown error class', async () => {
    const report = await simulate(programOf(seq(send('a', 'notify.feed').op)), {
      effects: [{ kind: 'notify.feed', outcome: { kind: 'unknown' } }],
    }).run();
    expect(report.runs[0]?.status).toBe('failed');
    expect(report.commands[0]?.outcome).toBe('unknown');
  });
});

describe('runs started by the automation', () => {
  it('runs the child, waits for it and keeps both on the same virtual clock', async () => {
    const child = programOf(seq(pause('child wait', HOUR), send('child sent').op));
    const parent = programOf(seq(runChild('call', 'child-automation', true), send('after').op));
    const report = await simulate(
      parent,
      {},
      {
        child: (id) => (id === 'child-automation' ? child : undefined),
      },
    ).run();
    expect(report.status).toBe('finished');
    expect(report.runs).toHaveLength(2);
    expect(report.commands.map((command) => [command.node.includes('child'), command.at])).toEqual([
      [true, at(HOUR)],
      [false, at(HOUR)],
    ]);
  });

  it('runs a child started without waiting up to its first wait before the parent goes on', async () => {
    const slow = setDevice('child', home.lampA.id, true);
    const child = programOf(seq(slow.op, pause('child wait', HOUR)));
    const parent = programOf(seq(runChild('call', 'child-automation', false), send('after').op));
    const report = await simulate(
      parent,
      { effects: [{ device: home.lampA.id, outcome: { kind: 'slow', delayMs: 5 * 60_000 } }] },
      {
        child: (id) => (id === 'child-automation' ? child : undefined),
      },
    ).run();
    expect(report.commands.map((command) => [command.node.includes('child'), command.at])).toEqual([
      [true, at(5 * 60_000)],
      [false, at(5 * 60_000)],
    ]);
  });

  it('fails the call for an automation outside the scope', async () => {
    const parent = programOf(seq(runChild('call', 'missing', true)));
    const report = await simulate(parent).run();
    expect(report.runs[0]?.status).toBe('failed');
  });
});

describe('breakpoints', () => {
  it('pauses before the listed node, then continues', async () => {
    const first = send('first');
    const second = send('second');
    const run = simulate(programOf(seq(first.op, second.op)), {}, { breakpoints: [second.id] });
    const paused = await run.run();
    expect(paused.status).toBe('paused');
    expect(paused.paused.map((hit) => hit.nodeId)).toEqual([second.id]);
    expect(paused.commands.map((command) => command.node.includes('first'))).toEqual([true]);
    expect(run.proceed(paused.paused[0]?.runId ?? '', 'continue')).toBe(true);
    const done = await run.run();
    expect(done.status).toBe('finished');
    expect(done.commands).toHaveLength(2);
  });

  it('steps to the next node after a pause', async () => {
    const first = send('first');
    const second = send('second');
    const third = send('third');
    const run = simulate(
      programOf(seq(first.op, second.op, third.op)),
      {},
      { breakpoints: [first.id] },
    );
    const atFirst = await run.run();
    expect(atFirst.paused[0]?.nodeId).toBe(first.id);
    run.proceed(atFirst.paused[0]?.runId ?? '', 'step');
    const atSecond = await run.run();
    expect(atSecond.status).toBe('paused');
    expect(atSecond.paused[0]?.nodeId).toBe(second.id);
    expect(atSecond.commands).toHaveLength(1);
    run.proceed(atSecond.paused[0]?.runId ?? '', 'continue');
    expect((await run.run()).commands).toHaveLength(3);
  });

  it('pauses on every pass of a repeated node', async () => {
    const only = send('only');
    const run = simulate(
      programOf(seq(only.op, pause('gap', HOUR), { ...only.op })),
      {},
      { breakpoints: [only.id] },
    );
    const one = await run.run();
    run.proceed(one.paused[0]?.runId ?? '', 'continue');
    const two = await run.run();
    expect(two.status).toBe('paused');
    expect(two.now).toBe(at(HOUR));
  });

  it('pauses on every back to back entry of the same node', async () => {
    const only = send('only');
    const run = simulate(
      programOf(seq(only.op, { ...only.op }, { ...only.op })),
      {},
      {
        breakpoints: [only.id],
      },
    );
    let report = await run.run();
    for (let pass = 0; pass < 3; pass += 1) {
      expect(report.status).toBe('paused');
      expect(report.commands).toHaveLength(pass);
      run.proceed(report.paused[0]?.runId ?? '', 'continue');
      report = await run.run();
    }
    expect(report.status).toBe('finished');
    expect(report.commands).toHaveLength(3);
  });
});

describe('asking a person', () => {
  function ask(timeoutMs?: number, defaultAnswer?: string): PlanOp {
    return {
      op: 'wait',
      at: { id: randomUUID(), key: 'ask' },
      durable: true,
      wait: {
        kind: 'answer',
        person: { lit: 'someone' },
        question: { lit: 'Lock the door?' },
        options: ['Yes', 'No'],
        ...(timeoutMs === undefined ? {} : { timeoutMs }),
        ...(defaultAnswer === undefined ? {} : { defaultAnswer }),
      },
    };
  }

  it('records the question as a command it would send and continues on the scripted answer', async () => {
    const after = send('after');
    const report = await simulate(programOf(seq(ask(), after.op)), {
      timeline: [{ at: at(10 * 60_000), answer: 'Yes' }],
    }).run();
    expect(report.status).toBe('finished');
    expect(report.commands.map((command) => command.kind)).toEqual(['notify.ask', 'test.effect']);
    expect(report.commands[0]?.params).toMatchObject({
      question: 'Lock the door?',
      options: ['Yes', 'No'],
    });
    expect(report.commands[1]?.at).toBe(at(10 * 60_000));
  });

  it('times out on the virtual clock when nobody answers', async () => {
    const after = send('after');
    const report = await simulate(programOf(seq(ask(HOUR), after.op))).run();
    expect(report.status).toBe('finished');
    expect(report.commands.map((command) => command.at)).toEqual([at(0), at(HOUR)]);
  });

  it('ignores an answer that is not one of the buttons and stays idle', async () => {
    const report = await simulate(programOf(seq(ask())), {
      timeline: [{ at: at(60_000), answer: 'Maybe' }],
    }).run();
    expect(report.status).toBe('idle');
  });
});
