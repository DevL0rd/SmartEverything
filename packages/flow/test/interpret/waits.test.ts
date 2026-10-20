import { SIGNAL_MATCHER } from '@smarteverything/domain';
import type { SignalInput } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import type { PlanOp } from '../../src/compile/plan';
import type { WaitSpec } from '../../src/compile/plan-parts';
import type { Checked, Outcome, StepEvent, StepResult } from '../../src/interpret/frames';
import { step } from '../../src/interpret/step';
import { eventAccepts, resumeResult, wakeAt, wakeResume, waitOps } from '../../src/interpret/waits';
import type { WaitResume, ZonePort } from '../../src/interpret/waits';
import { RUN_STATE } from '../../src/state/run-state';
import type { RunState, Wait } from '../../src/state/run-state';
import {
  BROKEN,
  NOW,
  at,
  broken,
  compute,
  contextOf,
  effect,
  wired,
  lit,
  planOf,
  run,
  seq,
  stateOf,
} from './core-support';
import type { Trace } from './core-support';

const MINUTE = 60_000;

const ZONE: ZonePort = {
  nextOccurrence: (clock, after): Checked<number> =>
    clock === '07:00'
      ? { ok: true, value: after + 9 * 60 * MINUTE }
      : { ok: false, class: 'Invalid', message: 'the clock is unknown' },
};

function waitNode(key: string, wait: WaitSpec, durable = true): PlanOp {
  return { op: 'wait', at: at(key), durable, wait };
}

function contextFor(body: PlanOp): ReturnType<typeof contextOf> {
  const base = contextOf(planOf(body));
  return { ...base, ops: { ...base.ops, ...waitOps(ZONE) } };
}

function begin(
  body: PlanOp,
  state: RunState = stateOf(),
): { trace: Trace; ctx: ReturnType<typeof contextFor> } {
  const ctx = contextFor(body);
  return { trace: run(ctx, state), ctx };
}

function parked(trace: Trace): Wait {
  if (trace.outcome.kind !== 'park') throw new Error(`expected a park, got ${trace.outcome.kind}`);
  return trace.outcome.wait;
}

function resumed(
  { ctx, from }: { ctx: ReturnType<typeof contextFor>; from: Trace },
  resume: WaitResume,
  now = NOW,
  wait: Wait = parked(from),
): { outcome: Outcome; state: RunState; requests: string[] } {
  let state = from.state;
  let event: StepEvent = { kind: 'resolved', now, result: resumeResult(wait, resume) };
  for (let guard = 0; guard < 100; guard += 1) {
    const stepped: StepResult = step(ctx, state, event);
    RUN_STATE.parse(JSON.parse(JSON.stringify(stepped.state)));
    state = stepped.state;
    const { outcome } = stepped;
    if (outcome.kind !== 'continue') {
      const requests = outcome.kind === 'effect' ? [outcome.request.node.key] : [];
      return { outcome, state, requests };
    }
    event = { kind: 'run', now };
  }
  throw new Error('the run did not stop');
}

function outputsOf(state: RunState, key: string): unknown {
  return state.frames[0]?.outputs[key];
}

function failure(outcome: Outcome): string | undefined {
  return outcome.kind === 'failed' ? `${outcome.error.class}: ${outcome.error.message}` : undefined;
}

const AFTER = effect('after');

describe('delay waits', () => {
  const delay = (extra: Partial<Extract<WaitSpec, { kind: 'duration' }>> = {}): WaitSpec => ({
    kind: 'duration',
    duration: lit(5 * MINUTE),
    ifLate: 'run',
    ...extra,
  });

  it('park with an absolute due instant, the node path and the plan durable flag', () => {
    const durable = begin(seq(waitNode('pause', delay()), AFTER));
    expect(parked(durable.trace)).toEqual({
      kind: 'duration',
      nodePath: 'body/ops/0',
      durable: true,
      dueAt: NOW + 5 * MINUTE,
    });
    expect(durable.trace.state.wait).toEqual(parked(durable.trace));
    const temporary = begin(seq(waitNode('pause', delay(), false), AFTER));
    expect(parked(temporary.trace).durable).toBe(false);
  });

  it('continue to the next node when the timer fires on time', () => {
    const { trace, ctx } = begin(seq(waitNode('pause', delay()), AFTER));
    const woke = resumed(
      { ctx, from: trace },
      { kind: 'due', recovered: false },
      NOW + 5 * MINUTE + 40,
    );
    expect(woke.requests).toEqual(['after']);
    expect(woke.state.wait).toBeUndefined();
    expect(outputsOf(woke.state, 'pause')).toEqual({ late: false });
  });

  it('pass at once when the duration is zero', () => {
    const { trace } = begin(seq(waitNode('pause', delay({ duration: lit(0) })), AFTER));
    expect(trace.outcome.kind).toBe('effect');
    expect(trace.state.wait).toBeUndefined();
  });

  it('raise an error from the duration expression', () => {
    const { trace } = begin(seq(waitNode('pause', delay({ duration: BROKEN })), broken()));
    expect(failure(trace.outcome)).toContain('MathError');
  });

  it('refuse a duration that is not a whole number of milliseconds', () => {
    for (const bad of [lit(1.5), lit(-1), lit('soon')]) {
      const { trace } = begin(seq(waitNode('pause', delay({ duration: bad }))));
      expect(failure(trace.outcome)).toContain('TypeError');
    }
  });

  it('run a late wake and report the lateness when ifLate is run', () => {
    const { trace, ctx } = begin(seq(waitNode('pause', delay()), AFTER));
    const woke = resumed({ ctx, from: trace }, { kind: 'due', recovered: true }, NOW + 9 * MINUTE);
    expect(woke.requests).toEqual(['after']);
    expect(outputsOf(woke.state, 'pause')).toEqual({ late: true, lateByMs: 4 * MINUTE });
  });

  it('end the scope quietly when ifLate is skip', () => {
    const { trace, ctx } = begin(seq(waitNode('pause', delay({ ifLate: 'skip' })), AFTER));
    const woke = resumed({ ctx, from: trace }, { kind: 'due', recovered: true }, NOW + 9 * MINUTE);
    expect(woke.requests).toEqual([]);
    expect(woke.outcome).toMatchObject({ kind: 'done', status: 'succeeded' });
  });

  it('fail the run when ifLate is fail', () => {
    const { trace, ctx } = begin(seq(waitNode('pause', delay({ ifLate: 'fail' })), AFTER));
    const woke = resumed({ ctx, from: trace }, { kind: 'due', recovered: true }, NOW + 9 * MINUTE);
    expect(failure(woke.outcome)).toContain('Failed: pause resumed 240000 ms late');
  });
});

describe('wait until waits', () => {
  const until = (extra: Partial<Extract<WaitSpec, { kind: 'until_instant' }>>): WaitSpec => ({
    kind: 'until_instant',
    ifLate: 'skip',
    graceMs: 5 * MINUTE,
    ...extra,
  });
  const future = new Date(NOW + 2 * 60 * MINUTE).toISOString();

  it('park until an instant given as text or as milliseconds', () => {
    const text = begin(seq(waitNode('until', until({ at: lit(future) })), AFTER));
    expect(parked(text.trace)).toMatchObject({ kind: 'until_instant', dueAt: NOW + 120 * MINUTE });
    const number = begin(seq(waitNode('until', until({ at: lit(NOW + MINUTE) }))));
    expect(parked(number.trace)).toMatchObject({ dueAt: NOW + MINUTE });
  });

  it('resolve a time of day through the zone port when the wait starts', () => {
    const { trace } = begin(seq(waitNode('until', until({ clock: '07:00' }), false)));
    expect(parked(trace)).toMatchObject({ dueAt: NOW + 540 * MINUTE, durable: false });
  });

  it('raise what the zone port refuses', () => {
    const { trace } = begin(seq(waitNode('until', until({ clock: 'dawn' }))));
    expect(failure(trace.outcome)).toBe('Invalid: the clock is unknown');
  });

  it('refuse a wait with neither a moment nor a time of day', () => {
    const { trace } = begin(seq(waitNode('until', until({}))));
    expect(failure(trace.outcome)).toContain('TypeError');
  });

  it('refuse a moment that is not an instant', () => {
    const { trace } = begin(seq(waitNode('until', until({ at: lit('tomorrow') }))));
    expect(failure(trace.outcome)).toContain('a moment in time');
  });

  it('raise an error from the moment expression', () => {
    const { trace } = begin(seq(waitNode('until', until({ at: BROKEN })), broken()));
    expect(failure(trace.outcome)).toContain('MathError');
  });

  it('continue at once when the moment is already past by less than the grace', () => {
    const past = new Date(NOW - MINUTE).toISOString();
    const { trace } = begin(seq(waitNode('until', until({ at: lit(past) })), AFTER));
    expect(trace.outcome).toMatchObject({ kind: 'effect' });
    expect(outputsOf(trace.state, 'until')).toEqual({ late: false });
  });

  it('skip, run or fail a moment that is past by more than the grace', () => {
    const past = new Date(NOW - 20 * MINUTE).toISOString();
    const skipped = begin(seq(waitNode('until', until({ at: lit(past) })), AFTER));
    expect(skipped.trace.outcome).toMatchObject({ kind: 'done', status: 'succeeded' });
    const ran = begin(seq(waitNode('until', until({ at: lit(past), ifLate: 'run' })), AFTER));
    expect(ran.trace.outcome.kind).toBe('effect');
    expect(outputsOf(ran.trace.state, 'until')).toEqual({ late: true, lateByMs: 20 * MINUTE });
  });

  it('wake on time, and treat a recovered wake inside the grace as on time', () => {
    const { trace, ctx } = begin(seq(waitNode('until', until({ at: lit(future) })), AFTER));
    const dueAt = NOW + 120 * MINUTE;
    const fresh = resumed({ ctx, from: trace }, { kind: 'due', recovered: false }, dueAt + 100);
    expect(outputsOf(fresh.state, 'until')).toEqual({ late: false });
    const inside = resumed({ ctx, from: trace }, { kind: 'due', recovered: true }, dueAt + MINUTE);
    expect(inside.requests).toEqual(['after']);
    const outside = resumed(
      { ctx, from: trace },
      { kind: 'due', recovered: true },
      dueAt + 30 * MINUTE,
    );
    expect(outside.outcome).toMatchObject({ kind: 'done' });
  });
});

describe('event waits', () => {
  const matcher = SIGNAL_MATCHER.parse({ source: 'device', kind: 'state', subject: 'door' });
  const event = (timeoutMs?: number): WaitSpec => ({
    kind: 'event',
    matcher,
    ...(timeoutMs === undefined ? {} : { timeoutMs }),
  });
  const signal = (extra: Partial<SignalInput> = {}): SignalInput => ({
    source: 'device',
    kind: 'state',
    subject: 'door',
    field: 'open',
    value: true,
    previous: false,
    at: new Date(NOW + MINUTE).toISOString(),
    profileId: null,
    data: { room: 'hall' },
    ...extra,
  });

  it('park with the matcher, the parked instant and the deadline', () => {
    const { trace } = begin(seq(waitNode('door', event(MINUTE)), AFTER));
    expect(parked(trace)).toEqual({
      kind: 'event',
      nodePath: 'body/ops/0',
      durable: true,
      matcher,
      parkedAt: NOW,
      deadlineAt: NOW + MINUTE,
    });
    expect(parked(begin(seq(waitNode('door', event()))).trace)).not.toHaveProperty('deadlineAt');
  });

  it('accept only matching signals that arrive after the wait started', () => {
    const wait = parked(begin(seq(waitNode('door', event()))).trace);
    if (wait.kind !== 'event') throw new Error('expected an event wait');
    expect(eventAccepts(wait, signal())).toBe(true);
    expect(eventAccepts(wait, signal({ at: new Date(NOW).toISOString() }))).toBe(false);
    expect(eventAccepts(wait, signal({ at: new Date(NOW - MINUTE).toISOString() }))).toBe(false);
    expect(eventAccepts(wait, signal({ subject: 'window' }))).toBe(false);
  });

  it('continue with the signal values as outputs', () => {
    const { trace, ctx } = begin(seq(waitNode('door', event()), AFTER));
    const woke = resumed({ ctx, from: trace }, { kind: 'signal', signal: signal() }, NOW + MINUTE);
    expect(woke.requests).toEqual(['after']);
    expect(outputsOf(woke.state, 'door')).toEqual({
      timedOut: false,
      value: true,
      data: { room: 'hall' },
      at: new Date(NOW + MINUTE).toISOString(),
      subject: 'door',
      field: 'open',
      previous: false,
    });
  });

  it('leave out the subject, field and previous value a signal does not have', () => {
    const { trace, ctx } = begin(seq(waitNode('door', event()), AFTER));
    const bare = signal({ field: null, previous: null });
    const woke = resumed({ ctx, from: trace }, { kind: 'signal', signal: bare }, NOW + MINUTE);
    expect(outputsOf(woke.state, 'door')).not.toHaveProperty('field');
    expect(outputsOf(woke.state, 'door')).not.toHaveProperty('previous');
    expect(
      failure(
        resumed({ ctx, from: trace }, { kind: 'signal', signal: { ...bare, subject: null } })
          .outcome,
      ),
    ).toContain('Invalid');
    const open: WaitSpec = {
      kind: 'event',
      matcher: SIGNAL_MATCHER.parse({ source: 'device', kind: 'state' }),
    };
    const anyone = begin(seq(waitNode('door', open), AFTER));
    const nameless = resumed(
      { ctx: anyone.ctx, from: anyone.trace },
      {
        kind: 'signal',
        signal: { ...bare, subject: null },
      },
    );
    expect(outputsOf(nameless.state, 'door')).not.toHaveProperty('subject');
  });

  it('take the timed out exit with timedOut true when the deadline passes', () => {
    const { trace, ctx } = begin(seq(waitNode('door', event(MINUTE)), AFTER));
    const woke = resumed({ ctx, from: trace }, { kind: 'timeout' }, NOW + MINUTE);
    expect(woke.requests).toEqual(['after']);
    expect(outputsOf(woke.state, 'door')).toEqual({ timedOut: true });
  });

  it('refuse a timeout for a wait with no deadline and signals that do not match', () => {
    const { trace, ctx } = begin(seq(waitNode('door', event()), AFTER));
    expect(failure(resumed({ ctx, from: trace }, { kind: 'timeout' }).outcome)).toContain(
      'no deadline',
    );
    const other = signal({ subject: 'window' });
    expect(
      failure(resumed({ ctx, from: trace }, { kind: 'signal', signal: other }).outcome),
    ).toContain('not waiting for');
    expect(failure(resumed({ ctx, from: trace }, { kind: 'evaluate' }).outcome)).toContain(
      'not waiting for',
    );
  });
});

describe('condition waits', () => {
  const condition = (extra: Partial<Extract<WaitSpec, { kind: 'condition' }>> = {}): WaitSpec => ({
    kind: 'condition',
    condition: wired('inputs.flag'),
    ...extra,
  });
  const withFlag = (flag: boolean): RunState => stateOf({ inputs: { flag } });
  const flipped = (state: RunState, flag: boolean): Trace => ({
    state: { ...state, inputs: { ...state.inputs, flag } },
    outcome: { kind: 'continue' },
    records: [],
    nodes: [],
    requests: [],
    steps: 0,
  });

  it('continue at once when the condition already holds', () => {
    const { trace } = begin(seq(waitNode('gate', condition()), AFTER), withFlag(true));
    expect(trace.outcome.kind).toBe('effect');
    expect(outputsOf(trace.state, 'gate')).toEqual({ timedOut: false });
  });

  it('park with the dependency keys and a deadline when the condition is false', () => {
    const spec = condition({ condition: wired('nowhere.result'), timeoutMs: 10 * MINUTE });
    const nowhere = compute('nowhere', 'logic.compare', {
      a: wired('home.timeZone'),
      op: lit('eq'),
      b: lit('Nowhere'),
    });
    const { trace } = begin(seq(waitNode('gate', spec), AFTER, nowhere), withFlag(false));
    expect(parked(trace)).toEqual({
      kind: 'condition',
      nodePath: 'body/ops/0',
      durable: true,
      deps: ['home:zone'],
      deadlineAt: NOW + 10 * MINUTE,
    });
  });

  it('continue when a dependency change makes the condition true and stay parked otherwise', () => {
    const { trace, ctx } = begin(seq(waitNode('gate', condition()), AFTER), withFlag(false));
    const still = resumed({ ctx, from: trace }, { kind: 'evaluate' });
    expect(still.outcome.kind).toBe('park');
    const woke = resumed(
      { ctx, from: flipped(trace.state, true) },
      { kind: 'evaluate' },
      NOW,
      parked(trace),
    );
    expect(woke.requests).toEqual(['after']);
    expect(outputsOf(woke.state, 'gate')).toEqual({ timedOut: false });
  });

  it('hold: start the hold when true, keep it while true, pass when it elapsed', () => {
    const spec = condition({ holdMs: MINUTE });
    const { trace, ctx } = begin(seq(waitNode('gate', spec), AFTER), withFlag(true));
    expect(parked(trace)).toMatchObject({ holdUntil: NOW + MINUTE });
    const early = resumed({ ctx, from: trace }, { kind: 'evaluate' }, NOW + 10_000);
    expect(early.outcome).toMatchObject({ kind: 'park', wait: { holdUntil: NOW + MINUTE } });
    const done = resumed({ ctx, from: trace }, { kind: 'evaluate' }, NOW + MINUTE);
    expect(done.requests).toEqual(['after']);
  });

  it('hold: begin a new hold when it becomes true and drop it when it turns false', () => {
    const spec = condition({ holdMs: MINUTE });
    const { trace, ctx } = begin(seq(waitNode('gate', spec), AFTER), withFlag(false));
    expect(parked(trace)).not.toHaveProperty('holdUntil');
    const rising = flipped(trace.state, true);
    const started = resumed({ ctx, from: rising }, { kind: 'evaluate' }, NOW + 5000, parked(trace));
    expect(started.outcome).toMatchObject({
      kind: 'park',
      wait: { holdUntil: NOW + 5000 + MINUTE },
    });
    const holding = { ...rising, state: started.state, outcome: started.outcome };
    const falling = flipped(holding.state, false);
    const dropped = resumed(
      { ctx, from: falling },
      { kind: 'evaluate' },
      NOW + 10_000,
      parked(holding),
    );
    expect(dropped.outcome.kind).toBe('park');
    expect(dropped.state.wait).not.toHaveProperty('holdUntil');
  });

  it('take the timed out exit at the deadline', () => {
    const { trace, ctx } = begin(
      seq(waitNode('gate', condition({ timeoutMs: MINUTE })), AFTER),
      withFlag(false),
    );
    const woke = resumed({ ctx, from: trace }, { kind: 'timeout' }, NOW + MINUTE);
    expect(woke.requests).toEqual(['after']);
    expect(outputsOf(woke.state, 'gate')).toEqual({ timedOut: true });
  });

  it('refuse a timeout without a deadline and a resume by due or signal', () => {
    const { trace, ctx } = begin(seq(waitNode('gate', condition()), AFTER), withFlag(false));
    expect(failure(resumed({ ctx, from: trace }, { kind: 'timeout' }).outcome)).toContain(
      'no deadline',
    );
    const due = resumed({ ctx, from: trace }, { kind: 'due', recovered: false });
    expect(failure(due.outcome)).toContain('cannot be resumed by due');
  });

  it('raise a condition that is not true or false', () => {
    const { trace } = begin(seq(waitNode('gate', condition({ condition: lit('yes') }))));
    expect(failure(trace.outcome)).toContain('TypeError');
    const later = begin(seq(waitNode('gate', condition()), AFTER), withFlag(false));
    const broken = {
      ...later.trace,
      state: { ...later.trace.state, inputs: { n: 0, flag: 'maybe' } },
    };
    const woke = resumed(
      { ctx: later.ctx, from: broken },
      { kind: 'evaluate' },
      NOW,
      parked(later.trace),
    );
    expect(failure(woke.outcome)).toContain('TypeError');
  });
});

describe('resuming a wait', () => {
  const duration: WaitSpec = { kind: 'duration', duration: lit(MINUTE), ifLate: 'run' };
  const gate: WaitSpec = { kind: 'condition', condition: lit(false) };

  it('refuse a resolution that is not a wait resolution', () => {
    const { trace, ctx } = begin(seq(waitNode('pause', duration), AFTER));
    const stepped = step(ctx, trace.state, {
      kind: 'resolved',
      now: NOW,
      result: { ok: true, value: {} },
    });
    expect(failure(stepped.outcome)).toContain('something unreadable');
  });

  it('raise the failure a resolution carries', () => {
    const { trace, ctx } = begin(seq(waitNode('pause', duration), AFTER));
    const result: Checked<Record<string, never>> = { ok: false, class: 'Failed', message: 'lost' };
    const stepped = step(ctx, trace.state, { kind: 'resolved', now: NOW, result });
    expect(failure(stepped.outcome)).toBe('Failed: lost');
  });

  it('refuse the wait of another node', () => {
    const { trace, ctx } = begin(seq(waitNode('pause', duration), AFTER));
    const wait: Wait = { ...parked(trace), nodePath: 'body/ops/3' };
    const woke = resumed({ ctx, from: trace }, { kind: 'due', recovered: false }, NOW, wait);
    expect(failure(woke.outcome)).toContain('the wait of body/ops/3');
  });

  it('refuse a resume that does not fit the node or the wait kind', () => {
    const { trace, ctx } = begin(seq(waitNode('pause', duration), AFTER));
    expect(failure(resumed({ ctx, from: trace }, { kind: 'evaluate' }).outcome)).toContain(
      'cannot be resumed',
    );
    const foreign: Wait = {
      kind: 'event',
      nodePath: 'body/ops/0',
      durable: true,
      matcher: SIGNAL_MATCHER.parse({ source: 'device', kind: 'state' }),
      parkedAt: NOW,
    };
    const mixed = resumed({ ctx, from: trace }, { kind: 'timeout' }, NOW, foreign);
    expect(failure(mixed.outcome)).toContain('no deadline');
    const answer: Wait = {
      kind: 'answer',
      nodePath: 'body/ops/0',
      durable: true,
      notificationId: 'n',
      options: [],
    };
    expect(
      failure(resumed({ ctx, from: trace }, { kind: 'evaluate' }, NOW, answer).outcome),
    ).toContain('answer waits');
  });

  it('refuse a timer resume of a wait whose node is not a timer', () => {
    const { trace, ctx } = begin(seq(waitNode('gate', gate), AFTER));
    const timer: Wait = { kind: 'duration', nodePath: 'body/ops/0', durable: true, dueAt: NOW };
    const woke = resumed({ ctx, from: trace }, { kind: 'due', recovered: false }, NOW, timer);
    expect(failure(woke.outcome)).toContain('cannot be resumed by due');
    const stale: Wait = { kind: 'condition', nodePath: 'body/ops/0', durable: true, deps: [] };
    const other = begin(seq(waitNode('pause', duration), AFTER));
    expect(
      failure(
        resumed({ ctx: other.ctx, from: other.trace }, { kind: 'evaluate' }, NOW, stale).outcome,
      ),
    ).toContain('cannot be resumed by evaluate');
  });
});

describe('wake helpers', () => {
  const base = { nodePath: 'body/ops/0', durable: true };
  const matcher = SIGNAL_MATCHER.parse({ source: 'device', kind: 'state' });

  it('name the next instant a parked wait needs a timer for', () => {
    expect(wakeAt({ kind: 'duration', ...base, dueAt: 5 })).toBe(5);
    expect(wakeAt({ kind: 'until_instant', ...base, dueAt: 6 })).toBe(6);
    expect(wakeAt({ kind: 'event', ...base, matcher, parkedAt: 1, deadlineAt: 7 })).toBe(7);
    expect(wakeAt({ kind: 'event', ...base, matcher, parkedAt: 1 })).toBeUndefined();
    expect(wakeAt({ kind: 'condition', ...base, deps: [], holdUntil: 9, deadlineAt: 4 })).toBe(4);
    expect(wakeAt({ kind: 'condition', ...base, deps: [], holdUntil: 3, deadlineAt: 4 })).toBe(3);
    expect(wakeAt({ kind: 'condition', ...base, deps: [], holdUntil: 3 })).toBe(3);
    expect(wakeAt({ kind: 'condition', ...base, deps: [], deadlineAt: 4 })).toBe(4);
    expect(wakeAt({ kind: 'condition', ...base, deps: [] })).toBeUndefined();
    expect(wakeAt({ kind: 'breakpoint', ...base })).toBeUndefined();
    const slow = { kind: 'duration', ...base, dueAt: 8 } as const;
    const fast = { kind: 'duration', ...base, dueAt: 5 } as const;
    const asking = { kind: 'answer' as const, ...base, notificationId: 'n', options: [] };
    expect(wakeAt({ kind: 'any', ...base, waits: [slow, fast, asking] })).toBe(5);
    expect(wakeAt({ kind: 'any', ...base, waits: [asking] })).toBeUndefined();
    expect(wakeAt({ kind: 'answer', ...base, notificationId: 'n', options: [] })).toBeUndefined();
    expect(
      wakeAt({ kind: 'refill', ...base, target: 'command', dueAt: 1, askedAt: 0 }),
    ).toBeUndefined();
  });

  it('turn a timer wake into the right resume event', () => {
    expect(wakeResume({ kind: 'duration', ...base, dueAt: 5 }, 9, true)).toEqual({
      kind: 'due',
      recovered: true,
    });
    expect(wakeResume({ kind: 'until_instant', ...base, dueAt: 5 }, 5, false)).toEqual({
      kind: 'due',
      recovered: false,
    });
    expect(
      wakeResume({ kind: 'event', ...base, matcher, parkedAt: 1, deadlineAt: 7 }, 7, false),
    ).toEqual({ kind: 'timeout' });
    expect(wakeResume({ kind: 'condition', ...base, deps: [], deadlineAt: 4 }, 4, false)).toEqual({
      kind: 'timeout',
    });
    expect(
      wakeResume({ kind: 'condition', ...base, deps: [], holdUntil: 3, deadlineAt: 8 }, 3, false),
    ).toEqual({ kind: 'evaluate' });
    expect(wakeResume({ kind: 'condition', ...base, deps: [], holdUntil: 3 }, 3, false)).toEqual({
      kind: 'evaluate',
    });
    expect(wakeResume({ kind: 'breakpoint', ...base }, 1, false)).toBeUndefined();
    expect(
      wakeResume({ kind: 'answer', ...base, notificationId: 'n', options: [] }, 1, false),
    ).toBeUndefined();
    expect(
      wakeResume({ kind: 'refill', ...base, target: 'effects', dueAt: 1, askedAt: 0 }, 1, false),
    ).toBeUndefined();
  });
});
