import { pushedMessageOf, type EventKind, type EventRow } from '@smarteverything/domain';

export interface UrgentEvent {
  readonly id: string;
  readonly kind: EventKind;
  readonly message: string | null;
  readonly automationName: string | null;
  readonly homeName: string;
  readonly deviceId: string | null;
  readonly deviceName: string | null;
}

interface Wording {
  readonly title: string;
  readonly body: (source: string) => string;
}

export const URGENT_WORDING: Partial<Readonly<Record<EventKind, Wording>>> = {
  doorbell: { title: 'Doorbell', body: (source) => `Someone is at the door (${source})` },
  call: { title: 'Incoming call', body: (source) => `${source} is calling` },
  alarm: { title: 'Alarm', body: (source) => `${source} raised an alarm` },
  leak: { title: 'Water leak', body: (source) => `${source} detected water` },
  smoke: { title: 'Smoke detected', body: (source) => `${source} detected smoke` },
};

export class MissingWordingError extends Error {
  override readonly name = 'MissingWordingError';

  constructor(readonly kind: EventKind) {
    super(`The urgent event kind ${kind} has no notification wording; add it to URGENT_WORDING`);
  }
}

export function urgentEventOf(
  row: EventRow,
  homeName: string,
  deviceName: string | null,
): UrgentEvent {
  const name = row.details['name'];
  return {
    id: row.id,
    kind: row.kind,
    message: pushedMessageOf(row.kind, row.details),
    automationName: typeof name === 'string' && name !== '' ? name : null,
    homeName,
    deviceId: row.device_id,
    deviceName,
  };
}

function sourceOf(event: UrgentEvent): string {
  return event.deviceName === null ? event.homeName : `${event.deviceName} in ${event.homeName}`;
}

export function notificationFor(event: UrgentEvent): {
  readonly title: string;
  readonly body: string;
} {
  if (event.message !== null) {
    return { title: event.automationName ?? event.homeName, body: event.message };
  }
  const wording = URGENT_WORDING[event.kind];
  if (wording === undefined) {
    throw new MissingWordingError(event.kind);
  }
  return { title: wording.title, body: wording.body(sourceOf(event)) };
}
