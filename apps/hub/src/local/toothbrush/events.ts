import type { DeviceEvent, EventKind, JsonValue } from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import type { DeviceState } from './fleet';

const EVENTS_PER_MINUTE = 30;

const MINUTE_MS = 60_000;

export function admitEvent(state: DeviceState, nowMs: number, log: Logger): boolean {
  while (state.eventTimes.length > 0 && nowMs - (state.eventTimes[0] ?? nowMs) >= MINUTE_MS) {
    state.eventTimes.shift();
  }
  if (state.eventTimes.length >= EVENTS_PER_MINUTE) {
    log.warn('toothbrush.event_dropped', { device: state.deviceId, limit: EVENTS_PER_MINUTE });
    return false;
  }
  state.eventTimes.push(nowMs);
  return true;
}

export interface EventSpec {
  readonly kind: EventKind;
  readonly at: string;
  readonly details: Readonly<Record<string, JsonValue>>;
  readonly occurrence?: string;
}

export function eventOf(state: DeviceState, spec: EventSpec): DeviceEvent {
  return {
    externalId: state.entry.externalId,
    kind: spec.kind,
    occurredAt: spec.at,
    details: spec.details,
    ...(spec.occurrence === undefined ? {} : { occurrence: spec.occurrence }),
  };
}
