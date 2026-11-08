import { describe, expect, it } from 'vitest';
import { ALL_NODE_KINDS, NODE_REGISTRY } from '../../src/automation-nodes/all-kinds';
import type { NodeKind } from '../../src/automation-nodes/define';
import { kindProblems } from '../../src/automation-nodes/registry';
import { compileTriggerMatcher } from '../../src/automation-nodes/triggers-device';
import {
  VACUUM_TRIGGER_EVENTS,
  VACUUM_TRIGGER_KINDS,
  vacuumTriggerOutputs,
} from '../../src/automation-nodes/triggers-vacuum';
import { signalMatches, type SignalMatcher } from '../../src/signal-matcher';
import { triggerTestHolds } from '../../src/signal-timing';
import type { SignalInput } from '../../src/signals';
import { VACUUM_CLEANING_READINGS } from '../../src/vacuum-status';

const ROBOT = 'robot-1';
const AT = '2026-10-25T10:00:00.000Z';

function eventSignal(kind: string, data: SignalInput['data']): SignalInput {
  return {
    source: 'event',
    kind,
    subject: ROBOT,
    field: null,
    value: true,
    previous: null,
    at: AT,
    profileId: null,
    data,
  };
}

function stateSignal(data: SignalInput['data'], value: string): SignalInput {
  return {
    source: 'device',
    kind: 'state',
    subject: ROBOT,
    field: 'cleaning',
    value,
    previous: 'cleaning',
    at: AT,
    profileId: null,
    data: { family: 'vacuum', kind: 'vacuum', provider: 'xiaomi', cause: 'physical', ...data },
  };
}

function matcherOf(event: string): SignalMatcher {
  const compiled = compileTriggerMatcher('trigger.vacuum', { vacuum: ROBOT, event });
  if (!compiled.ok) throw new Error(compiled.error);
  return compiled.matcher;
}

function fires(event: string, signal: SignalInput): boolean {
  const matcher = matcherOf(event);
  return (
    signalMatches(matcher, signal) &&
    triggerTestHolds(matcher.test, signal.value, signal.previous ?? undefined)
  );
}

const STARTED = eventSignal('activity', {
  family: 'vacuum',
  name: 'clean_started',
  rooms: [
    { id: 16, name: 'Kitchen' },
    { id: 17, name: 'Hall' },
  ],
});
const FINISHED = eventSignal('cycle_finished', {
  family: 'vacuum',
  outcome: 'finished',
  rooms: [{ id: 16, name: 'Kitchen' }],
});
const FAULT = eventSignal('fault', {
  family: 'vacuum',
  code: 21,
  title: 'The robot is stuck',
  message: 'Free the robot',
});
const LOW = eventSignal('maintenance', {
  family: 'vacuum',
  source: 'state',
  item: 'main-brush',
  state: 'low',
  level: 9,
});
const EVENT_SIGNALS = {
  started: STARTED,
  finished: FINISHED,
  error: FAULT,
  consumable_low: LOW,
} as const;
const CHARGING = stateSignal({ role: 'cleaning' }, 'charging');
const DOCKED = stateSignal({ role: 'cleaning' }, 'docked');
const TANK_FULL = stateSignal({ role: 'vacuum_sewage_tank' }, 'Full');

function triggerKind(): NodeKind {
  const kind = NODE_REGISTRY.get('trigger.vacuum');
  if (kind === undefined) throw new Error('trigger.vacuum is not registered');
  return kind;
}

describe('trigger.vacuum registration', () => {
  it('is one valid member trigger registered once', () => {
    const kind = NODE_REGISTRY.get('trigger.vacuum');
    expect(ALL_NODE_KINDS.filter((each) => each.id === 'trigger.vacuum')).toHaveLength(1);
    expect(VACUUM_TRIGGER_KINDS.map((each) => each.id)).toEqual(['trigger.vacuum']);
    expect(kind?.class).toBe('trigger');
    expect(kind?.access).toBe('member');
    expect(kind === undefined ? ['missing'] : kindProblems(kind)).toEqual([]);
  });

  it('takes a vacuum and an event choice', () => {
    const { inputs } = triggerKind();
    expect(inputs.map((port) => port.name)).toEqual(['vacuum', 'event']);
    expect(inputs[0]?.type).toEqual({ t: 'ref', of: 'device', families: ['vacuum'] });
    expect(inputs[1]?.type).toEqual({ t: 'choice', options: [...VACUUM_TRIGGER_EVENTS] });
    expect(inputs[1]?.default).toBe('finished');
  });

  it('gives the rooms and the fault, the fault only when there is one', () => {
    const { outputs } = triggerKind();
    expect(outputs.map((port) => port.name)).toEqual(['vacuum', 'event', 'rooms', 'fault', 'at']);
    expect(outputs.find((port) => port.name === 'fault')?.optional).toBe(true);
  });

  it('offers exactly the events the objective names', () => {
    expect(VACUUM_TRIGGER_EVENTS.map((event) => event.id)).toEqual([
      'started',
      'finished',
      'error',
      'docked',
      'needs_emptying',
      'consumable_low',
    ]);
  });
});

describe('trigger.vacuum matching', () => {
  it('compiles every event for the picked vacuum', () => {
    for (const { id } of VACUUM_TRIGGER_EVENTS) expect(matcherOf(id).subject, id).toBe(ROBOT);
  });

  it('refuses an event it does not offer', () => {
    expect(compileTriggerMatcher('trigger.vacuum', { vacuum: ROBOT, event: 'exploded' })).toEqual({
      ok: false,
      error: 'That choice is not offered here',
    });
  });

  it('fires started, finished, error and consumable low on their own events', () => {
    for (const [event, own] of Object.entries(EVENT_SIGNALS))
      expect(fires(event, own), event).toBe(true);
  });

  it('does not fire one of them on the events of the others', () => {
    for (const [event, own] of Object.entries(EVENT_SIGNALS))
      for (const other of Object.values(EVENT_SIGNALS).filter((signal) => signal !== own))
        expect(fires(event, other), `${event} vs ${other.kind}`).toBe(false);
  });

  it('ignores events of other kinds of device and activities that are not a cleaning start', () => {
    expect(
      fires('started', eventSignal('activity', { family: 'vacuum', name: 'mop_washed' })),
    ).toBe(false);
    expect(fires('error', eventSignal('fault', { family: 'treadmill', code: 3 }))).toBe(false);
    expect(fires('finished', eventSignal('cycle_finished', { family: 'laundry' }))).toBe(false);
  });

  it('fires docked when the robot reports charging or docked and not while it works', () => {
    expect(fires('docked', CHARGING)).toBe(true);
    expect(fires('docked', DOCKED)).toBe(true);
    for (const reading of VACUUM_CLEANING_READINGS.filter(
      (each) => each !== 'charging' && each !== 'docked',
    ))
      expect(fires('docked', stateSignal({ role: 'cleaning' }, reading)), reading).toBe(false);
  });

  it('fires needs emptying when the station tank is full and not when it is not full', () => {
    expect(fires('needs_emptying', TANK_FULL)).toBe(true);
    expect(fires('needs_emptying', stateSignal({ role: 'vacuum_sewage_tank' }, 'Not Full'))).toBe(
      false,
    );
    expect(fires('needs_emptying', CHARGING)).toBe(false);
    expect(fires('docked', TANK_FULL)).toBe(false);
  });

  it('does not fire for another robot or a device of another family', () => {
    expect(signalMatches(matcherOf('docked'), { ...CHARGING, subject: 'robot-2' })).toBe(false);
    expect(
      signalMatches(
        matcherOf('docked'),
        stateSignal({ role: 'cleaning', family: 'light' }, 'charging'),
      ),
    ).toBe(false);
  });

  it('matches every robot vacuum when no vacuum is picked', () => {
    const compiled = compileTriggerMatcher('trigger.vacuum', { event: 'finished' });
    if (!compiled.ok) throw new Error(compiled.error);
    expect(compiled.matcher.subject).toBeUndefined();
    expect(signalMatches(compiled.matcher, { ...FINISHED, subject: 'robot-9' })).toBe(true);
  });
});

describe('trigger.vacuum outputs', () => {
  it('names the rooms of a started or finished job as the robot map names them', () => {
    expect(vacuumTriggerOutputs(STARTED)).toEqual({
      event: 'started',
      rooms: ['Kitchen', 'Hall'],
      fault: undefined,
    });
    expect(vacuumTriggerOutputs(FINISHED)).toMatchObject({
      event: 'finished',
      rooms: ['Kitchen'],
    });
  });

  it('reports the fault title of an error', () => {
    expect(vacuumTriggerOutputs(FAULT)).toEqual({
      event: 'error',
      rooms: [],
      fault: 'The robot is stuck',
    });
  });

  it('classifies the remaining events and leaves rooms and fault empty', () => {
    expect(vacuumTriggerOutputs(LOW)).toEqual({
      event: 'consumable_low',
      rooms: [],
      fault: undefined,
    });
    expect(vacuumTriggerOutputs(CHARGING)).toMatchObject({ event: 'docked', rooms: [] });
    expect(vacuumTriggerOutputs(TANK_FULL)).toMatchObject({ event: 'needs_emptying', rooms: [] });
  });

  it('names the event the way the picker offers it for every signal the matcher accepts', () => {
    const signals = {
      started: STARTED,
      finished: FINISHED,
      error: FAULT,
      docked: CHARGING,
      needs_emptying: TANK_FULL,
      consumable_low: LOW,
    } as const;
    for (const [event, signal] of Object.entries(signals))
      expect(vacuumTriggerOutputs(signal)['event'], event).toBe(event);
  });
});
