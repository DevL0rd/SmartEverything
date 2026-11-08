import { describe, expect, it } from 'vitest';
import { ALL_NODE_KINDS } from '../src/automation-nodes/all-kinds';
import type { NodeKind } from '../src/automation-nodes/define';
import { kindProblems, buildRegistry } from '../src/automation-nodes/registry';
import { PLANNER_KINDS, PLANNER_MATCHER_MAPPINGS } from '../src/automation-nodes/planner';
import { compileTriggerMatcher } from '../src/automation-nodes/triggers-device';
import { PLANNER_SIGNAL, PLANNER_SIGNAL_KINDS } from '../src/planner/signals';
import { signalMatches, type SignalMatcher } from '../src/signal-matcher';
import type { SignalInput } from '../src/signals';

const ID = '7c1d2a3e-5b4f-4e6a-8c9d-0a1b2c3d4e5f';
const AT = '2026-11-07T08:00:00.000Z';
const TRIGGER = 'trigger.planner';

const SAMPLE_DATA = {
  task_due: { itemId: ID, occurrenceKey: 'single', title: 'Water plants', dueAt: AT },
  task_missed: { itemId: ID, occurrenceKey: 'single', title: 'Water plants', dueAt: AT },
  task_done: {
    itemId: ID,
    occurrenceKey: 'single',
    title: 'Water plants',
    dueAt: AT,
    completedBy: 'person',
  },
  alarm_rang: { alarmId: ID, ringId: ID, label: 'Wake up', dueAt: AT },
  alarm_dismissed: { alarmId: ID, ringId: ID, label: 'Wake up', dueAt: AT },
  alarm_snoozed: { alarmId: ID, ringId: ID, label: 'Wake up', dueAt: AT, snoozes: 1, until: AT },
  timer_done: { timerId: ID, label: 'Tea', durationMs: 180_000 },
  event_starting: {
    itemId: ID,
    occurrenceKey: AT,
    title: 'Dentist',
    startsAt: AT,
    minutesBefore: 10,
  },
} as const;

function signalOf(kind: (typeof PLANNER_SIGNAL_KINDS)[number]): SignalInput {
  return PLANNER_SIGNAL.parse({
    source: 'planner',
    kind,
    subject: ID,
    field: null,
    value: true,
    previous: null,
    at: AT,
    profileId: ID,
    data: SAMPLE_DATA[kind],
  });
}

function matcherOf(ports: Parameters<typeof compileTriggerMatcher>[1]): SignalMatcher {
  const compiled = compileTriggerMatcher(TRIGGER, ports, PLANNER_MATCHER_MAPPINGS[TRIGGER]);
  if (!compiled.ok) throw new Error(compiled.error);
  return compiled.matcher;
}

function kindOf(id: string): NodeKind {
  const found = PLANNER_KINDS.find((kind) => kind.id === id);
  if (found === undefined) throw new Error(`no kind ${id}`);
  return found;
}

describe('the planner node kinds', () => {
  it('pass the registry checks and join the registry without a clash', () => {
    for (const kind of PLANNER_KINDS) expect(kindProblems(kind), kind.id).toEqual([]);
    const known = new Set(ALL_NODE_KINDS.map((kind) => kind.id));
    for (const kind of PLANNER_KINDS) expect(known.has(kind.id), kind.id).toBe(true);
    expect(() => buildRegistry(ALL_NODE_KINDS)).not.toThrow();
  });

  it('use unique ids that name the planner', () => {
    const ids = PLANNER_KINDS.map((kind) => kind.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual([
      'trigger.planner',
      'planner.add_task',
      'planner.complete_task',
      'planner.start_timer',
      'planner.set_alarm',
    ]);
  });

  it('offer the four effects the planner promises and one trigger', () => {
    expect(PLANNER_KINDS.filter((kind) => kind.class === 'trigger').map((kind) => kind.id)).toEqual(
      [TRIGGER],
    );
    expect(PLANNER_KINDS.filter((kind) => kind.class === 'effect')).toHaveLength(4);
  });

  it('retry only what is safe to repeat', () => {
    expect(kindOf('planner.complete_task').effect?.retry).toBe('idempotent');
    for (const id of ['planner.add_task', 'planner.start_timer', 'planner.set_alarm']) {
      expect(kindOf(id).effect?.retry, id).toBe('external');
    }
  });

  it('require the one input each effect cannot work without', () => {
    const required = (id: string): readonly string[] =>
      kindOf(id)
        .inputs.filter((port) => port.required)
        .map((port) => port.name);
    expect(required('planner.add_task')).toEqual(['title']);
    expect(required('planner.complete_task')).toEqual(['itemId']);
    expect(required('planner.start_timer')).toEqual(['duration']);
    expect(required('planner.set_alarm')).toEqual(['at']);
  });

  it('end every effect with an error output and the next exit', () => {
    for (const kind of PLANNER_KINDS.filter((entry) => entry.class === 'effect')) {
      expect(kind.outputs.at(-1)?.name, kind.id).toBe('error');
      expect(kind.exits, kind.id).toEqual(['next']);
    }
  });
});

describe('the planner trigger', () => {
  it('offers exactly the signals the planner publishes', () => {
    const event = kindOf(TRIGGER).inputs.find((port) => port.name === 'event');
    const options = event?.type.t === 'choice' ? event.type.options.map((option) => option.id) : [];
    expect(options).toEqual([...PLANNER_SIGNAL_KINDS]);
    expect(Object.keys(PLANNER_MATCHER_MAPPINGS[TRIGGER]?.variants ?? {})).toEqual([
      ...PLANNER_SIGNAL_KINDS,
    ]);
  });

  it('matches its own signal kind and none of the others', () => {
    for (const kind of PLANNER_SIGNAL_KINDS) {
      const matcher = matcherOf({ event: kind });
      for (const other of PLANNER_SIGNAL_KINDS) {
        expect(signalMatches(matcher, signalOf(other)), `${kind} vs ${other}`).toBe(kind === other);
      }
    }
  });

  it('starts from task due when no event is chosen', () => {
    const matcher = matcherOf({});
    expect(matcher.kind).toBe('task_due');
    expect(matcher.source).toBe('planner');
  });

  it('narrows to one task title or one alarm label', () => {
    const task = matcherOf({ event: 'task_due', title: 'Water plants' });
    expect(signalMatches(task, signalOf('task_due'))).toBe(true);
    expect(
      signalMatches(matcherOf({ event: 'task_due', title: 'Pay rent' }), signalOf('task_due')),
    ).toBe(false);
    const alarm = matcherOf({ event: 'alarm_rang', label: 'Wake up' });
    expect(signalMatches(alarm, signalOf('alarm_rang'))).toBe(true);
    expect(
      signalMatches(matcherOf({ event: 'alarm_rang', label: 'Nap' }), signalOf('alarm_rang')),
    ).toBe(false);
  });

  it('refuses an event the planner does not publish', () => {
    const compiled = compileTriggerMatcher(
      TRIGGER,
      { event: 'task_deleted' },
      PLANNER_MATCHER_MAPPINGS[TRIGGER],
    );
    expect(compiled.ok).toBe(false);
  });
});
