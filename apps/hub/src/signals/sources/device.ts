import type { SignalInput, StateChange } from '@smarteverything/domain';
import type { RecordedEvent } from '../../state/event-router';

export function isTransition(change: StateChange): boolean {
  return change.value !== null && change.previous !== null;
}

export function stateSignal(change: StateChange, at: string): SignalInput {
  return {
    source: 'device',
    kind: 'state',
    subject: change.deviceId,
    field: change.capability,
    value: change.value,
    previous: change.previous ?? null,
    at,
    profileId: null,
    data: {},
  };
}

export function eventSignal(event: RecordedEvent): SignalInput {
  return {
    source: 'event',
    kind: event.kind,
    subject: event.deviceId,
    field: null,
    value: true,
    previous: null,
    at: event.occurredAt,
    profileId: null,
    data: { ...event.details, eventId: event.id },
  };
}
