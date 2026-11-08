import { describe, expect, it } from 'vitest';
import type { FlowType } from '../../src/automation-v3/types';
import { ALL_NODE_KINDS, NODE_REGISTRY } from '../../src/automation-nodes/all-kinds';
import { EVENT_NODE_KINDS } from '../../src/automation-nodes/events';
import { kindProblems } from '../../src/automation-nodes/registry';
import {
  APPLIANCE_EVENTS,
  APPLIANCE_TRIGGER_KINDS,
  SAFETY_KINDS,
} from '../../src/automation-nodes/triggers-appliance';
import { compileTriggerMatcher } from '../../src/automation-nodes/triggers-device';
import { isOptionSourceId } from '../../src/automation-nodes/option-sources';
import { EVENT_KINDS } from '../../src/events';
import { signalMatches, type SignalMatcher } from '../../src/signal-matcher';
import type { SignalInput } from '../../src/signals';

const WASHER = 'washer-1';
const KITCHEN = 'kitchen-1';
const AT = '2026-10-25T10:00:00.000Z';

function eventSignal(kind: string, data: SignalInput['data'] = {}): SignalInput {
  return {
    source: 'event',
    kind,
    subject: WASHER,
    field: null,
    value: true,
    previous: null,
    at: AT,
    profileId: null,
    data,
  };
}

function stateSignal(field: string, value: boolean): SignalInput {
  return {
    source: 'device',
    kind: 'state',
    subject: 'sensor-1',
    field,
    value,
    previous: !value,
    at: AT,
    profileId: null,
    data: { roomId: KITCHEN },
  };
}

function listChoiceIds(type: FlowType | undefined): readonly string[] {
  const element = type?.t === 'list' ? type.of : undefined;
  return element?.t === 'choice' ? element.options.map((option) => option.id) : [];
}

function matcherOf(
  kind: string,
  ports: Parameters<typeof compileTriggerMatcher>[1],
): SignalMatcher {
  const compiled = compileTriggerMatcher(kind, ports);
  if (!compiled.ok) throw new Error(compiled.error);
  return compiled.matcher;
}

describe('appliance and safety trigger kinds', () => {
  it('are registered once each as valid member triggers', () => {
    for (const id of ['trigger.appliance', 'trigger.safety']) {
      const kind = NODE_REGISTRY.get(id);
      expect(
        ALL_NODE_KINDS.filter((each) => each.id === id),
        id,
      ).toHaveLength(1);
      expect(kind?.class, id).toBe('trigger');
      expect(kind?.access, id).toBe('member');
      expect(kind === undefined ? ['missing'] : kindProblems(kind), id).toEqual([]);
    }
    expect(APPLIANCE_TRIGGER_KINDS.map((kind) => kind.id)).toEqual([
      'trigger.appliance',
      'trigger.safety',
    ]);
  });

  it('declare the ports the objective names', () => {
    const appliance = NODE_REGISTRY.get('trigger.appliance');
    const safety = NODE_REGISTRY.get('trigger.safety');
    expect(appliance?.inputs.map((port) => port.name)).toEqual(['device', 'room', 'event']);
    expect(appliance?.outputs.map((port) => port.name)).toEqual(['device', 'kind', 'detail', 'at']);
    expect(safety?.inputs.map((port) => port.name)).toEqual(['device', 'room', 'kind']);
    expect(safety?.outputs.map((port) => port.name)).toEqual(['device', 'kind', 'at']);
    const choices = (id: string, port: string): readonly string[] => {
      const type = NODE_REGISTRY.get(id)?.inputs.find((input) => input.name === port)?.type;
      return type?.t === 'choice' ? type.options.map((option) => option.id) : [];
    };
    expect(choices('trigger.appliance', 'event')).toEqual([...APPLIANCE_EVENTS]);
    expect(choices('trigger.safety', 'kind')).toEqual([...SAFETY_KINDS]);
  });
});

describe('trigger.appliance matcher', () => {
  it('fires only for the chosen event of the chosen appliance', () => {
    const matcher = matcherOf('trigger.appliance', { device: WASHER, event: 'cycle_finished' });
    expect(matcher).toMatchObject({ source: 'event', kind: 'cycle_finished', subject: WASHER });
    expect(signalMatches(matcher, eventSignal('cycle_finished'))).toBe(true);
    expect(signalMatches(matcher, eventSignal('fault'))).toBe(false);
    expect(signalMatches(matcher, { ...eventSignal('cycle_finished'), subject: 'dryer-1' })).toBe(
      false,
    );
  });

  it('maps every appliance event to its own event kind', () => {
    for (const event of APPLIANCE_EVENTS) {
      expect(matcherOf('trigger.appliance', { event })).toMatchObject({
        source: 'event',
        kind: event,
      });
    }
  });

  it('covers any appliance when nothing is picked', () => {
    const anywhere = matcherOf('trigger.appliance', { event: 'maintenance' });
    expect(anywhere.subject).toBeUndefined();
    expect(signalMatches(anywhere, eventSignal('maintenance'))).toBe(true);
  });

  it('defaults to a finished cycle and rejects an event it does not offer', () => {
    expect(matcherOf('trigger.appliance', {}).kind).toBe('cycle_finished');
    expect(compileTriggerMatcher('trigger.appliance', { event: 'leak' })).toEqual({
      ok: false,
      error: 'That choice is not offered here',
    });
  });
});

describe('trigger.safety matcher', () => {
  it('fires when a leak, smoke or gas sensor turns on and not when it clears', () => {
    for (const kind of ['leak', 'smoke', 'gas']) {
      const matcher = matcherOf('trigger.safety', { kind, device: 'sensor-1' });
      expect(signalMatches(matcher, stateSignal(kind, true)), kind).toBe(true);
      expect(matcher).toMatchObject({ source: 'device', kind: 'state', field: kind });
      expect(matcher.test, kind).toEqual({ is: 'eq', to: true });
      expect(signalMatches(matcher, stateSignal('temperature', true)), kind).toBe(false);
    }
  });

  it('matches an alarm event by room through the roomId of the signal', () => {
    const matcher = matcherOf('trigger.safety', { kind: 'alarm', room: KITCHEN });
    expect(matcher).toMatchObject({ source: 'event', kind: 'alarm', match: { roomId: KITCHEN } });
  });

  it('covers the whole home when no device or room is picked', () => {
    const matcher = matcherOf('trigger.safety', { kind: 'smoke' });
    expect(matcher.subject).toBeUndefined();
    expect(matcher.match).toBeUndefined();
  });
});

describe('event.count kind', () => {
  const kind = NODE_REGISTRY.get('event.count');

  it('is registered once as a valid member read', () => {
    expect(EVENT_NODE_KINDS.map((each) => each.id)).toEqual(['event.count']);
    expect(ALL_NODE_KINDS.filter((each) => each.id === 'event.count')).toHaveLength(1);
    expect(kind?.class).toBe('read');
    expect(kind?.access).toBe('member');
    expect(kind === undefined ? ['missing'] : kindProblems(kind)).toEqual([]);
  });

  it('takes a target, several kinds and a duration and reports count, latest and events', () => {
    expect(kind?.inputs.map((port) => port.name)).toEqual(['target', 'kinds', 'last']);
    expect(kind?.outputs.map((port) => port.name)).toEqual(['count', 'latest', 'events']);
    expect(kind?.inputs.find((port) => port.name === 'last')?.type).toEqual({ t: 'duration' });
  });

  it('offers every event kind through a multiple picker with a known source', () => {
    const kinds = kind?.inputs.find((port) => port.name === 'kinds');
    expect(kinds?.ui?.multiple).toBe(true);
    expect(isOptionSourceId(kinds?.ui?.optionsFrom ?? '')).toBe(true);
    expect(listChoiceIds(kinds?.type)).toEqual([...EVENT_KINDS]);
  });
});
