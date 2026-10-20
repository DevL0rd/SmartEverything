import type { JsonValue } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import type { PlanOp } from '../../src/compile/plan';
import type { PlanPorts } from '../../src/compile/plan-parts';
import type { NodeResult, Outcome, StepContext, StepRecord } from '../../src/interpret/frames';
import { step } from '../../src/interpret/step';
import { stateOps } from '../../src/interpret/state-ops';
import type { StateMemoryPort } from '../../src/interpret/state-ops';
import { resumeResult, waitOps } from '../../src/interpret/waits';
import type { StateClock } from '../../src/nodes/state/adapter';
import { RUN_STATE } from '../../src/state/run-state';
import type { RunState } from '../../src/state/run-state';
import type { At } from '../../src/compile/plan-parts';
import { NOW, at, contextOf, effect, lit, planOf, seq, stateOf } from './core-support';

const SECOND = 1000;
const MINUTE = 60_000;

interface Row {
  readonly memory: JsonValue;
  readonly wakeAt: number | null;
}

class Memory implements StateMemoryPort {
  readonly rows = new Map<string, Row>();

  recall(automationId: string, slot: string): JsonValue | undefined {
    return this.rows.get(`${automationId}/${slot}`)?.memory;
  }

  keep(automationId: string, slot: string, memory: JsonValue, wakeAt: number | null): void {
    this.rows.set(`${automationId}/${slot}`, { memory, wakeAt });
  }
}

const CLOCK: StateClock = {
  localTime: (instant) => {
    const date = new Date(instant);
    return {
      msOfDay: instant % 86_400_000,
      localAsUtc: new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())),
    };
  },
};

function stateNode(kind: string, key: string | At, ports: PlanPorts, exits: string[]): PlanOp {
  return { op: 'state_op', at: typeof key === 'string' ? at(key) : key, kind, ports, exits };
}

function withLanes(op: PlanOp, scopes: Record<string, PlanOp>): PlanOp {
  if (op.op !== 'state_op') throw new Error('only a state operation has lanes');
  return { ...op, scopes };
}

const cooldownNode = (scopes?: Record<string, PlanOp>): PlanOp => {
  const op = stateNode('timing.cooldown', 'cool', { period: lit(MINUTE) }, ['pass', 'blocked']);
  return scopes === undefined ? op : withLanes(op, scopes);
};

interface Rig {
  readonly memory: Memory;
  readonly ctx: StepContext;
  readonly automationId: string;
}

function rigFor(body: PlanOp, memory = new Memory()): Rig {
  const base = contextOf(planOf(body));
  const ctx: StepContext = {
    ...base,
    ops: { ...base.ops, ...waitOps({ nextOccurrence: () => ({ ok: true, value: NOW }) }) },
  };
  const ops = { ...ctx.ops, ...stateOps({ memory, clock: CLOCK }) };
  return { memory, ctx: { ...ctx, ops }, automationId: stateOf().automationId };
}

interface Finished {
  readonly outcome: Outcome;
  readonly state: RunState;
  readonly effects: string[];
  readonly records: readonly StepRecord[];
}

function drive(rig: Rig, initial: RunState, now: number = NOW): Finished {
  const effects: string[] = [];
  const records: StepRecord[] = [];
  let state = initial;
  let event: Parameters<typeof step>[2] =
    state.wait === undefined ? { kind: 'start', now } : { kind: 'run', now };
  for (let steps = 0; steps < 200; steps += 1) {
    const stepped = step(rig.ctx, state, event);
    RUN_STATE.parse(JSON.parse(JSON.stringify(stepped.state)));
    state = stepped.state;
    records.push(...stepped.records);
    const { outcome } = stepped;
    if (outcome.kind === 'effect') {
      effects.push(outcome.request.node.key);
      const result: NodeResult = { ok: true, value: {} };
      event = { kind: 'resolved', now, result };
      continue;
    }
    if (outcome.kind !== 'continue') return { outcome, state, effects, records };
    event = { kind: 'run', now };
  }
  throw new Error('the run did not stop');
}

function startRun(rig: Rig, now: number = NOW): Finished {
  return drive(rig, stateOf({ automationId: rig.automationId }), now);
}

function wake(rig: Rig, from: Finished, now: number): Finished {
  const { wait } = from.state;
  if (wait === undefined) throw new Error('the run is not waiting');
  const resolved = step(rig.ctx, from.state, {
    kind: 'resolved',
    now,
    result: resumeResult(wait, { kind: 'due', recovered: false }),
  });
  const effects: string[] = [];
  let state = resolved.state;
  let outcome = resolved.outcome;
  let event: Parameters<typeof step>[2] = { kind: 'run', now };
  for (let steps = 0; steps < 200 && outcome.kind === 'continue'; steps += 1) {
    const stepped = step(rig.ctx, state, event);
    state = stepped.state;
    outcome = stepped.outcome;
    if (outcome.kind === 'effect') {
      effects.push(outcome.request.node.key);
      event = { kind: 'resolved', now, result: { ok: true, value: {} } };
      outcome = { kind: 'continue' };
    } else {
      event = { kind: 'run', now };
    }
  }
  return { outcome, state, effects, records: resolved.records };
}

function outputsOf(finished: Finished, key: string): unknown {
  return finished.state.frames[0]?.outputs[key];
}

function noteOf(finished: Finished): string[] {
  return finished.records.flatMap((entry) => (entry.kind === 'note' ? [entry.message] : []));
}

const AFTER = effect('after');

describe('timing.cooldown as a state operation', () => {
  it('lets the first run through and blocks the next within the period', () => {
    const rig = rigFor(seq(cooldownNode(), AFTER));
    expect(startRun(rig).effects).toEqual(['after']);
    const second = startRun(rig, NOW + 10 * SECOND);
    expect(second.effects).toEqual([]);
    expect(second.outcome).toMatchObject({ kind: 'done', status: 'succeeded' });
    expect(noteOf(second)).toEqual(['stopped by timing.cooldown cool (blocked)']);
    expect(outputsOf(second, 'cool')).toEqual({ remaining: MINUTE - 10 * SECOND });
  });

  it('lets a run through again once the period has passed', () => {
    const rig = rigFor(seq(cooldownNode(), AFTER));
    startRun(rig);
    expect(startRun(rig, NOW + MINUTE + 1).effects).toEqual(['after']);
  });

  it('remembers per automation so another automation is not blocked', () => {
    const rig = rigFor(seq(cooldownNode(), AFTER));
    startRun(rig);
    const other = drive(rig, stateOf());
    expect(other.effects).toEqual(['after']);
    expect(rig.memory.rows.size).toBe(2);
  });

  it('runs the blocked lane when one is connected and then goes on after the node', () => {
    const lane = seq(effect('told'));
    const rig = rigFor(seq(cooldownNode({ blocked: lane }), AFTER));
    startRun(rig);
    const second = startRun(rig, NOW + SECOND);
    expect(second.effects).toEqual(['told', 'after']);
  });

  it('refuses a period that is not a whole number of milliseconds', () => {
    const bad = stateNode('timing.cooldown', 'cool', { period: lit(-5) }, ['pass', 'blocked']);
    const finished = startRun(rigFor(seq(bad, AFTER)));
    expect(finished.outcome).toMatchObject({ kind: 'failed', error: { class: 'Invalid' } });
  });

  it('fails clearly for a kind that has no state adapter', () => {
    const unknown = stateNode('timing.nothing', 'odd', {}, ['next']);
    const finished = startRun(rigFor(seq(unknown)));
    expect(finished.outcome).toMatchObject({
      kind: 'failed',
      error: { message: 'no state adapter is registered for timing.nothing' },
    });
  });
});

describe('the other state kinds', () => {
  it('counts across runs and reports when the highest count is reached', () => {
    const counter = stateNode('state.counter', 'count', { max: lit(2) }, ['next']);
    const rig = rigFor(seq(counter));
    expect(outputsOf(startRun(rig), 'count')).toEqual({ value: 1, reachedMax: false });
    expect(outputsOf(startRun(rig), 'count')).toEqual({ value: 2, reachedMax: true });
    expect(outputsOf(startRun(rig), 'count')).toEqual({ value: 2, reachedMax: true });
  });

  it('flips two thresholds only when a threshold is crossed', () => {
    const place = at('band');
    const band = (value: number): PlanOp =>
      stateNode('timing.hysteresis', place, { value: lit(value), high: lit(50), low: lit(20) }, [
        'next',
      ]);
    const memory = new Memory();
    const id = stateOf().automationId;
    const outputs = (value: number): unknown => {
      const rig = rigFor(seq(band(value)), memory);
      return outputsOf(drive(rig, stateOf({ automationId: id })), 'band');
    };
    expect(outputs(60)).toEqual({ state: true, rose: true, fell: false });
    expect(outputs(40)).toEqual({ state: true, rose: false, fell: false });
    expect(outputs(10)).toEqual({ state: false, rose: false, fell: true });
  });

  it('moves a mode machine by events and remembers the state', () => {
    const states = lit(['home', 'away']);
    const transitions = lit([{ from: 'home', event: 'leave', to: 'away' }]);
    const place = at('mode');
    const modes = (event: string): PlanOp =>
      stateNode(
        'state.machine',
        place,
        { event: lit(event), states, initial: lit('home'), transitions },
        ['next'],
      );
    const memory = new Memory();
    const id = stateOf().automationId;
    const outputs = (event: string): unknown =>
      outputsOf(drive(rigFor(seq(modes(event)), memory), stateOf({ automationId: id })), 'mode');
    expect(outputs('nothing')).toEqual({ state: 'home', previous: 'home', changed: false });
    expect(outputs('leave')).toEqual({ state: 'away', previous: 'home', changed: true });
    expect(outputs('leave')).toEqual({ state: 'away', previous: 'away', changed: false });
  });

  it('keeps a timer by its name with the time it ends and clears it when cancelled', () => {
    const timerNode = (op: string): PlanOp =>
      stateNode(
        'state.timer',
        `timer_${op}`,
        { op: lit(op), name: lit('laundry'), duration: lit(10 * MINUTE) },
        ['next'],
      );
    const memory = new Memory();
    const id = stateOf().automationId;
    const finished = drive(rigFor(seq(timerNode('start')), memory), stateOf({ automationId: id }));
    expect(outputsOf(finished, 'timer_start')).toEqual({ remaining: 10 * MINUTE, running: true });
    expect(memory.rows.get(`${id}/timer:laundry`)).toEqual({
      memory: { deadline: NOW + 10 * MINUTE },
      wakeAt: NOW + 10 * MINUTE,
    });
    drive(rigFor(seq(timerNode('cancel')), memory), stateOf({ automationId: id }));
    expect(memory.rows.get(`${id}/timer:laundry`)).toEqual({ memory: {}, wakeAt: null });
  });
});

describe('state operations that hold the run', () => {
  const debounce = stateNode('timing.debounce', 'quiet', { quiet: lit(MINUTE) }, [
    'next',
    'superseded',
  ]);

  it('lets only the newest run continue after the quiet time', () => {
    const rig = rigFor(seq(debounce, AFTER));
    const first = startRun(rig);
    const second = startRun(rig, NOW + 20 * SECOND);
    expect(first.outcome.kind).toBe('park');
    expect(second.outcome.kind).toBe('park');
    const older = wake(rig, first, NOW + MINUTE);
    expect(older.effects).toEqual([]);
    expect(older.outcome).toMatchObject({ kind: 'done', status: 'succeeded' });
    const newer = wake(rig, second, NOW + 20 * SECOND + MINUTE);
    expect(newer.effects).toEqual(['after']);
  });

  it('queues a run over the rate limit until the next free slot', () => {
    const limit = stateNode(
      'timing.rate_limit',
      'limit',
      { max: lit(1), window: lit(MINUTE), excess: lit('queue') },
      ['pass', 'dropped'],
    );
    const rig = rigFor(seq(limit, AFTER));
    expect(startRun(rig).effects).toEqual(['after']);
    const queued = startRun(rig, NOW + 10 * SECOND);
    expect(queued.outcome).toMatchObject({ kind: 'park', wait: { dueAt: NOW + MINUTE } });
    const released = wake(rig, queued, NOW + MINUTE);
    expect(released.effects).toEqual(['after']);
    expect(outputsOf(released, 'limit')).toEqual({ delay: MINUTE - 10 * SECOND });
  });

  it('takes the dropped exit when the rate limit drops the excess', () => {
    const limit = stateNode('timing.rate_limit', 'limit', { max: lit(1), window: lit(MINUTE) }, [
      'pass',
      'dropped',
    ]);
    const rig = rigFor(seq(limit, AFTER));
    startRun(rig);
    const dropped = startRun(rig, NOW + SECOND);
    expect(dropped.effects).toEqual([]);
    expect(noteOf(dropped)).toEqual(['stopped by timing.rate_limit limit (dropped)']);
  });

  it('holds a run during quiet hours until the window ends', () => {
    const quiet = stateNode(
      'timing.quiet_hours',
      'night',
      { from: lit('00:00'), to: lit('13:00') },
      ['pass', 'held'],
    );
    const rig = rigFor(seq(quiet, AFTER));
    const held = startRun(rig);
    expect(held.outcome).toMatchObject({ kind: 'park', wait: { dueAt: NOW + 60 * MINUTE } });
    const released = wake(rig, held, NOW + 60 * MINUTE);
    expect(released.effects).toEqual(['after']);
    expect(outputsOf(released, 'night')).toEqual({ heldFor: 60 * MINUTE });
  });

  it('sends a run out of the held exit when quiet hours skip instead of waiting', () => {
    const quiet = withLanes(
      stateNode(
        'timing.quiet_hours',
        'night',
        { from: lit('00:00'), to: lit('13:00'), quiet: lit('skip') },
        ['pass', 'held'],
      ),
      { held: seq(effect('told')) },
    );
    const finished = startRun(rigFor(seq(quiet, AFTER)));
    expect(finished.effects).toEqual(['told', 'after']);
  });

  it('refuses a quiet window that is not a time of day', () => {
    const quiet = stateNode(
      'timing.quiet_hours',
      'night',
      { from: lit('late'), to: lit('07:00') },
      ['pass', 'held'],
    );
    const finished = startRun(rigFor(seq(quiet)));
    expect(finished.outcome).toMatchObject({ kind: 'failed', error: { class: 'Invalid' } });
  });
});
