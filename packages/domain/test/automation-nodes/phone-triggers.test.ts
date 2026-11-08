import { describe, expect, it } from 'vitest';
import {
  NODE_REGISTRY,
  PHONE_TRIGGER_EVENTS,
  compileTriggerMatcher,
  phoneStateEventName,
  signalMatchesMatcher,
  triggerTestHolds,
  type JsonValue,
  type SignalInput,
  type SignalMatcher,
} from '../../src/index';
import { PHONE_STATE_EVENTS } from '../../src/automation-nodes/triggers-phone';

function stateSignal(
  family: string,
  field: string,
  value: JsonValue,
  previous: JsonValue | null,
): SignalInput {
  return {
    source: 'device',
    kind: 'state',
    subject: '11111111-1111-4111-8111-111111111111',
    field,
    value,
    previous,
    at: '2026-10-25T10:00:00.000Z',
    profileId: null,
    data: { family, kind: family, cause: 'observed' },
  };
}

function matcherOf(kind: string, ports: Readonly<Record<string, JsonValue>> = {}): SignalMatcher {
  const compiled = compileTriggerMatcher('trigger.phone', { kind, ...ports });
  if (!compiled.ok) throw new Error(compiled.error);
  return compiled.matcher;
}

function fires(matcher: SignalMatcher, signal: SignalInput): boolean {
  return (
    signalMatchesMatcher(matcher, signal) &&
    (signal.value === null ||
      triggerTestHolds(matcher.test, signal.value, signal.previous ?? undefined))
  );
}

describe('trigger.phone charger, call and notification kinds', () => {
  it('offers the new kinds next to the old ones', () => {
    const choices = Object.keys(PHONE_TRIGGER_EVENTS);
    expect(choices).toEqual(
      expect.arrayContaining([
        'unlocked',
        'context_changed',
        'parked',
        ...Object.keys(PHONE_STATE_EVENTS),
      ]),
    );
    expect(Object.keys(PHONE_STATE_EVENTS)).toEqual([
      'charger_plugged',
      'charger_unplugged',
      'call_started',
      'call_ended',
      'notification_count_changed',
    ]);
  });

  it('keeps the old kinds compiling to the same matchers', () => {
    expect(matcherOf('unlocked')).toMatchObject({ source: 'event', kind: 'phone_unlocked' });
    expect(matcherOf('parked')).toMatchObject({ source: 'event', kind: 'parked' });
  });

  it('plugged in fires when charging turns on and not when it turns off', () => {
    const plugged = matcherOf('charger_plugged');
    expect(fires(plugged, stateSignal('phone', 'charging', true, false))).toBe(true);
    expect(fires(plugged, stateSignal('phone', 'charging', false, true))).toBe(false);
  });

  it('unplugged fires when charging turns off', () => {
    const unplugged = matcherOf('charger_unplugged');
    expect(fires(unplugged, stateSignal('phone', 'charging', false, true))).toBe(true);
    expect(fires(unplugged, stateSignal('phone', 'charging', true, false))).toBe(false);
  });

  it('a call started and ended follow in_call', () => {
    const started = matcherOf('call_started');
    const ended = matcherOf('call_ended');
    expect(fires(started, stateSignal('phone', 'in_call', true, false))).toBe(true);
    expect(fires(started, stateSignal('phone', 'in_call', false, true))).toBe(false);
    expect(fires(ended, stateSignal('phone', 'in_call', false, true))).toBe(true);
    expect(fires(ended, stateSignal('phone', 'in_call', true, false))).toBe(false);
  });

  it('the notification count fires on any change of the count', () => {
    const changed = matcherOf('notification_count_changed');
    expect(fires(changed, stateSignal('phone', 'notification_count', 4, 2))).toBe(true);
    expect(fires(changed, stateSignal('phone', 'notification_count', 0, 3))).toBe(true);
  });

  it('never fires for a computer that reports the same fields', () => {
    expect(
      fires(matcherOf('charger_plugged'), stateSignal('computer', 'charging', true, false)),
    ).toBe(false);
    expect(
      fires(
        matcherOf('notification_count_changed'),
        stateSignal('computer', 'notification_count', 1, 0),
      ),
    ).toBe(false);
  });

  it('one phone only when a phone is picked', () => {
    const phone = '11111111-1111-4111-8111-111111111111';
    const other = '22222222-2222-4222-8222-222222222222';
    const matcher = matcherOf('call_started', { phone });
    expect(fires(matcher, stateSignal('phone', 'in_call', true, false))).toBe(true);
    expect(
      fires(matcher, { ...stateSignal('phone', 'in_call', true, false), subject: other }),
    ).toBe(false);
  });

  it('names the event a state signal means for the kind output', () => {
    expect(phoneStateEventName(stateSignal('phone', 'charging', true, false))).toBe(
      'charger_plugged',
    );
    expect(phoneStateEventName(stateSignal('phone', 'charging', false, true))).toBe(
      'charger_unplugged',
    );
    expect(phoneStateEventName(stateSignal('phone', 'in_call', true, false))).toBe('call_started');
    expect(phoneStateEventName(stateSignal('phone', 'in_call', false, true))).toBe('call_ended');
    expect(phoneStateEventName(stateSignal('phone', 'notification_count', 1, 0))).toBe(
      'notification_count_changed',
    );
    expect(phoneStateEventName(stateSignal('phone', 'battery', 50, 51))).toBeUndefined();
    expect(
      phoneStateEventName({
        ...stateSignal('phone', 'charging', true, false),
        kind: 'phone_unlocked',
      }),
    ).toBeUndefined();
  });
});

describe('phone.read outputs', () => {
  const outputs = NODE_REGISTRY.get('phone.read')?.outputs ?? [];

  it('adds the new readings and keeps the old ones', () => {
    expect(outputs.map((port) => port.name)).toEqual([
      'battery',
      'charging',
      'ringerMode',
      'dnd',
      'screenOn',
      'context',
      'place',
      'network',
      'wifiOn',
      'bluetoothOn',
      'locationOn',
      'airplane',
      'notificationCount',
      'nextAlarm',
      'nowPlaying',
      'screenTimeToday',
      'inCall',
      'ringing',
      'powerSave',
      'thermal',
    ]);
    expect(outputs.every((port) => port.optional === true)).toBe(true);
  });

  it('types the choices from what a phone can report', () => {
    const type = (name: string): unknown => outputs.find((port) => port.name === name)?.type;
    expect(type('context')).toMatchObject({ t: 'choice' });
    expect(type('network')).toMatchObject({ t: 'choice' });
    expect(type('thermal')).toMatchObject({ t: 'choice' });
    expect(type('nextAlarm')).toEqual({ t: 'instant' });
  });
});
