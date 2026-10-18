import { createHash } from 'node:crypto';
import { z } from 'zod';
import { JSON_VALUE, type AdapterSink } from '@smarteverything/domain';
import type { ShellyDevice } from '@smarteverything/shelly';
import { redact, redactText } from '@smarteverything/logging';
import type { ShellyEvent } from './notifications';
export function componentEvent(
  sink: AdapterSink,
  snapshot: ShellyDevice,
  event: ShellyEvent,
): void {
  if (!snapshot.componentKeys.includes(event.component)) return;
  if (!event.component.startsWith('button:') && !event.component.startsWith('script:')) return;
  const details = {
    component: event.component,
    source: 'shelly',
    event: event.event,
    action: event.event,
    ...(event.data === undefined ? {} : { data: event.data }),
  };
  const safe = z.record(z.string(), JSON_VALUE).parse(redact(details));
  sink.event({
    externalId: snapshot.externalId,
    kind: event.component.startsWith('button:') ? 'button' : 'activity',
    occurredAt: new Date(event.ts * 1000).toISOString(),
    details: safe,
    occurrence: createHash('sha256')
      .update(JSON.stringify([snapshot.id, event]))
      .digest('hex'),
  });
}
export function faultTransition(
  sink: AdapterSink,
  before: ShellyDevice,
  after: ShellyDevice,
): boolean {
  if (before.status === after.status) return false;
  const previous = before.status?.errors ?? [];
  const errors = after.status?.errors ?? [];
  if (JSON.stringify(previous) === JSON.stringify(errors)) return false;
  sink.event({
    externalId: after.externalId,
    kind: errors.length > 0 ? 'fault' : 'activity',
    occurredAt: after.observedAt ?? new Date().toISOString(),
    details: {
      source: 'shelly',
      component: 'presence',
      event: errors.length > 0 ? 'sensor_fault' : 'fault_cleared',
      errors: errors.map((error) => redactText(error, 100)),
    },
  });
  return true;
}

export function sensorTransition(
  sink: AdapterSink,
  before: ShellyDevice,
  after: ShellyDevice,
): void {
  if (before.observedAt === null) return;
  const connectionChanged = before.connection.state !== after.connection.state;
  const revisionChanged =
    before.revision !== null && after.revision !== null && before.revision !== after.revision;
  if (!connectionChanged && !revisionChanged) return;
  sink.event({
    externalId: after.externalId,
    kind: 'activity',
    occurredAt: new Date().toISOString(),
    details: {
      source: 'shelly',
      component: 'presence',
      event: connectionChanged ? 'connection_changed' : 'configuration_changed',
      connection: after.connection.state,
      revision: after.revision,
    },
  });
}
