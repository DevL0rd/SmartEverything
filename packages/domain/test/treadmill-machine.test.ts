import { describe, expect, it } from 'vitest';
import {
  initialMachine,
  stepMachine,
  type MachineEvent,
  type MachineSettings,
  type MachineState,
  type SessionSummary,
  type TreadmillInput,
  type TreadmillReading,
} from '../src';

const SETTINGS: MachineSettings = { weightKg: 70, gradePercent: 4, runSwitchKmh: 8 };

const START = Date.parse('2026-10-18T10:00:00.000Z');

function at(seconds: number): string {
  return new Date(START + seconds * 1000).toISOString();
}

function reading(seconds: number, values: TreadmillReading): TreadmillInput {
  return { kind: 'reading', at: at(seconds), reading: values };
}

function run(
  inputs: readonly TreadmillInput[],
  settings: MachineSettings = SETTINGS,
): { state: MachineState; events: MachineEvent[] } {
  let state = initialMachine();
  const events: MachineEvent[] = [];
  for (const input of inputs) {
    const step = stepMachine(state, input, settings);
    state = step.state;
    events.push(...step.events);
  }
  return { state, events };
}

function kinds(events: readonly MachineEvent[]): string[] {
  return events.map((event) => event.kind);
}

function walk(seconds: number, speed: number, distance: number): TreadmillInput {
  return reading(seconds, {
    state: 'running',
    speedKmh: speed,
    timeS: seconds,
    distanceM: distance,
    steps: seconds * 2,
  });
}

function finishedOf(events: readonly MachineEvent[]): SessionSummary {
  const finished = events.find((event) => event.kind === 'finished');
  if (finished?.kind !== 'finished') {
    throw new Error('the run finished no session');
  }
  return finished.summary;
}

describe('a belt that reports its own state', () => {
  it('opens a session when the belt runs and closes it when the belt stops', () => {
    const { events, state } = run([
      reading(0, { state: 'idle', speedKmh: 0 }),
      reading(1, { state: 'countdown', speedKmh: 0, timeS: 0 }),
      walk(2, 3, 0),
      walk(62, 3, 50),
      reading(63, { state: 'idle', speedKmh: 0, timeS: 62, distanceM: 50, steps: 124 }),
    ]);
    expect(kinds(events)).toStrictEqual(
      [
        'state_changed',
        'state_changed',
        'started',
        'speed_changed',
        'state_changed',
        'finished',
      ].filter((kind) => kind !== 'speed_changed'),
    );
    const summary = finishedOf(events);
    expect(summary.activeSeconds).toBe(62);
    expect(summary.distanceM).toBe(50);
    expect(summary.steps).toBe(124);
    expect(summary.kind).toBe('walk');
    expect(summary.zones.walk).toBe(60);
    expect(summary.kcal).toBeGreaterThan(0);
    expect(summary.kcalNet).toBeLessThan(summary.kcal ?? 0);
    expect(state.open).toBeNull();
    expect(state.state).toBe('idle');
  });

  it('estimates when a session started from the belt time when the link joined late', () => {
    const { events } = run([walk(600, 4, 600)]);
    const started = events.find((event) => event.kind === 'started');
    expect(started).toMatchObject({ at: at(600) });
    const stop = run([walk(600, 4, 600), reading(601, { state: 'stopped', speedKmh: 0 })]);
    expect(finishedOf(stop.events).startedAt).toBe(at(0));
  });

  it('keeps the counters through a pause and counts the paused time', () => {
    const { events, state } = run([
      walk(10, 3, 8),
      reading(20, { state: 'paused', speedKmh: 0, timeS: 10, distanceM: 8, steps: 20 }),
      reading(50, { state: 'paused', speedKmh: 0, timeS: 10, distanceM: 8, steps: 20 }),
      walk(60, 3, 10),
    ]);
    expect(kinds(events)).toStrictEqual([
      'state_changed',
      'started',
      'state_changed',
      'paused',
      'state_changed',
      'resumed',
    ]);
    expect(state.open?.pausedSeconds).toBe(40);
    expect(state.open?.activeSeconds).toBe(60);
  });

  it('opens a new session when the belt counters reset while it keeps running', () => {
    const { events } = run([walk(300, 4, 300), walk(301, 4, 301), walk(2, 4, 1)]);
    expect(kinds(events)).toStrictEqual(['state_changed', 'started', 'finished', 'started']);
    expect(finishedOf(events).activeSeconds).toBe(301);
  });

  it('ends a session where the link was lost instead of where it came back', () => {
    const { events } = run([
      walk(100, 4, 100),
      reading(300, { state: 'idle', speedKmh: 0, timeS: 100, distanceM: 100 }),
    ]);
    expect(finishedOf(events).endedAt).toBe(at(100));
  });

  it('splits the distance into kilometres and interpolates the crossing time', () => {
    const { events } = run([
      walk(0, 6, 0),
      walk(600, 6, 900),
      walk(1200, 6, 2100),
      reading(1201, { state: 'stopped', speedKmh: 0 }),
    ]);
    const splits = finishedOf(events).splits;
    expect(splits).toHaveLength(2);
    expect(splits[0]).toBeCloseTo(650, 5);
    expect(splits[1]).toBeCloseTo(500, 5);
  });

  it('leaves the calories empty when nobody is on the belt', () => {
    const { events } = run(
      [walk(0, 3, 0), walk(60, 3, 50), reading(61, { state: 'idle', speedKmh: 0 })],
      { ...SETTINGS, weightKg: null },
    );
    const summary = finishedOf(events);
    expect(summary.kcal).toBeNull();
    expect(summary.kcalNet).toBeNull();
  });

  it('reports speed changes and panel buttons once', () => {
    const { events } = run([
      walk(0, 3, 0),
      walk(1, 3.5, 1),
      reading(2, { button: 'up' }),
      reading(3, { button: 'up' }),
    ]);
    expect(events.filter((event) => event.kind === 'speed_changed')).toStrictEqual([
      { kind: 'speed_changed', at: at(1), from: 3, to: 3.5 },
    ]);
    expect(events.filter((event) => event.kind === 'button')).toStrictEqual([
      { kind: 'button', at: at(2), button: 'up' },
    ]);
  });
});

describe('session kinds', () => {
  function sessionOf(
    speeds: readonly number[],
    mode: TreadmillReading['mode'] = 'manual',
  ): SessionSummary {
    const inputs: TreadmillInput[] = speeds.map((speed, index) =>
      reading(index + 1, {
        state: 'running',
        speedKmh: speed,
        timeS: (index + 1) * 60,
        distanceM: (index + 1) * 100,
        mode,
      }),
    );
    inputs.push(reading(speeds.length + 1, { state: 'idle', speedKmh: 0 }));
    return finishedOf(run(inputs).events);
  }

  it('calls steady slow walking a walk, a steady jog a jog and a fast pace a run', () => {
    expect(sessionOf([3, 3, 3]).kind).toBe('walk');
    expect(sessionOf([7, 7, 7]).kind).toBe('jog');
    expect(sessionOf([10, 10, 10]).kind).toBe('run');
  });

  it('calls a session with large swings between zones intervals, and a HIIT session too', () => {
    expect(sessionOf([3, 9, 3, 9, 3, 9]).kind).toBe('intervals');
    expect(sessionOf([4, 4, 4], 'hiit').kind).toBe('intervals');
  });
});

describe('a belt that reports only speed and the machine status events', () => {
  function status(
    seconds: number,
    kind: 'started' | 'paused' | 'stopped' | 'safety_stop' | 'reset',
  ): TreadmillInput {
    return { kind: 'machine_status', at: at(seconds), status: { kind } };
  }

  it('counts down after a start with no speed and runs once speed arrives', () => {
    const { state, events } = run([
      status(0, 'started'),
      reading(1, { speedKmh: 0, timeS: 0 }),
      reading(5, { speedKmh: 1.6, timeS: 1, distanceM: 0 }),
    ]);
    expect(state.state).toBe('running');
    expect(kinds(events)).toStrictEqual(['state_changed', 'state_changed', 'started']);
  });

  it('pauses, resumes and stops on the status events', () => {
    const { events, state } = run([
      status(0, 'started'),
      reading(1, { speedKmh: 3, timeS: 1, distanceM: 1 }),
      status(5, 'paused'),
      reading(6, { speedKmh: 0, timeS: 5, distanceM: 4 }),
      status(8, 'started'),
      reading(9, { speedKmh: 3, timeS: 6, distanceM: 5 }),
      status(20, 'stopped'),
    ]);
    expect(kinds(events).filter((kind) => kind !== 'state_changed')).toStrictEqual([
      'started',
      'paused',
      'resumed',
      'finished',
    ]);
    expect(state.state).toBe('stopped');
  });

  it('closes the session and reports the safety key', () => {
    const { events, state } = run([
      status(0, 'started'),
      reading(1, { speedKmh: 3, timeS: 1 }),
      status(3, 'safety_stop'),
    ]);
    expect(kinds(events)).toContain('safety_stop');
    expect(kinds(events)).toContain('finished');
    expect(state.state).toBe('safety_stop');
  });

  it('forgets the status on a reset and goes idle', () => {
    const { state } = run([status(0, 'stopped'), status(1, 'reset'), reading(2, { speedKmh: 0 })]);
    expect(state.state).toBe('idle');
    expect(state.memory).toBeNull();
  });

  it('keeps standby until the belt moves', () => {
    const { state } = run([
      reading(0, { state: 'standby', speedKmh: 0 }),
      reading(1, { speedKmh: 0 }),
    ]);
    expect(state.state).toBe('standby');
  });

  it('tracks the target speed and a lost control permission without changing the state', () => {
    const { state, events } = run([
      { kind: 'machine_status', at: at(0), status: { kind: 'target_speed', kmh: 4 } },
      { kind: 'machine_status', at: at(1), status: { kind: 'control_lost' } },
      { kind: 'machine_status', at: at(2), status: { kind: 'other', opcode: 10 } },
    ]);
    expect(state.live.targetSpeedKmh).toBe(4);
    expect(kinds(events)).toStrictEqual(['control_lost']);
    expect(state.state).toBe('idle');
  });
});
