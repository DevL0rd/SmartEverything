import {
  compileTriggerMatcher,
  signalMatchesMatcher,
  type SignalMatcher,
} from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import type { RecordedEvent } from '../../src/state/event-router';
import { eventSignal } from '../../src/signals/sources/device';

const KITCHEN = 'kitchen-1';
const STUDY = 'study-1';
const AT = '2026-10-25T10:00:00.000Z';

function recorded(kind: 'fault' | 'cycle_finished' | 'alarm'): RecordedEvent {
  return { id: 'event-1', deviceId: 'device-1', kind, occurredAt: AT, details: {} };
}

function matcherOf(
  kind: string,
  ports: Parameters<typeof compileTriggerMatcher>[1],
): SignalMatcher {
  const compiled = compileTriggerMatcher(kind, ports);
  if (!compiled.ok) throw new Error(compiled.error);
  return compiled.matcher;
}

describe('room matching on real event signals', () => {
  it('fires trigger.appliance for an appliance of the picked room only', () => {
    const matcher = matcherOf('trigger.appliance', { room: KITCHEN, event: 'fault' });
    expect(signalMatchesMatcher(matcher, eventSignal(recorded('fault'), KITCHEN))).toBe(true);
    expect(signalMatchesMatcher(matcher, eventSignal(recorded('fault'), STUDY))).toBe(false);
    expect(signalMatchesMatcher(matcher, eventSignal(recorded('fault'), null))).toBe(false);
  });

  it('fires trigger.safety alarm for a device of the picked room only', () => {
    const matcher = matcherOf('trigger.safety', { room: KITCHEN, kind: 'alarm' });
    expect(signalMatchesMatcher(matcher, eventSignal(recorded('alarm'), KITCHEN))).toBe(true);
    expect(signalMatchesMatcher(matcher, eventSignal(recorded('alarm'), STUDY))).toBe(false);
  });

  it('fires everywhere when no room is picked', () => {
    const matcher = matcherOf('trigger.appliance', { event: 'cycle_finished' });
    expect(signalMatchesMatcher(matcher, eventSignal(recorded('cycle_finished'), null))).toBe(true);
  });
});
