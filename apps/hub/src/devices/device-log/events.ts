import {
  eventLabel,
  isRefill,
  phoneEventFor,
  type DeviceLogEntry,
  type DeviceRow,
  type EventRow,
} from '@smarteverything/domain';
import { causeOfDetails, peopleByClient } from './causes';
import type { DeviceLogSource, LogRequest, LogStore } from './types';

function titleOf(event: EventRow): string {
  if (isRefill(event.details)) return 'Refilled';
  const summary = event.details['summary'];
  return typeof summary === 'string' && summary !== ''
    ? summary
    : eventLabel(event.kind, event.details);
}

export function eventsWhere(
  store: LogStore,
  request: LogRequest,
  wanted: (event: EventRow) => boolean,
): EventRow[] {
  const { device, limit } = request;
  const picked = new Map<string, EventRow>();
  const seen = new Set<string>();
  let cursor = request.to;
  while (picked.size < limit) {
    const page = store.events.list({ deviceIds: [device.id], to: cursor, limit });
    const fresh = page.filter((event) => !seen.has(event.id));
    const oldest = page.at(-1);
    if (fresh.length === 0 || oldest === undefined) break;
    for (const event of fresh) {
      seen.add(event.id);
      if (wanted(event)) picked.set(event.id, event);
    }
    cursor = new Date(Date.parse(oldest.occurred_at) + 1).toISOString();
  }
  return [...picked.values()].slice(0, limit);
}

function claimedBy(
  device: DeviceRow,
  sources: readonly DeviceLogSource[],
): (event: EventRow) => boolean {
  return (event) => sources.some((source) => source.claims(device, event));
}

export function eventsSource(others: readonly DeviceLogSource[]): DeviceLogSource {
  return {
    claims: () => false,
    read: (store: LogStore, request: LogRequest): readonly DeviceLogEntry[] => {
      const claimed = claimedBy(request.device, others);
      const people = peopleByClient(store);
      const shown = (event: EventRow): EventRow | null =>
        request.tier === null ? event : phoneEventFor(event, request.tier);
      return eventsWhere(store, request, (event) => !claimed(event) && shown(event) !== null).map(
        (event): DeviceLogEntry => ({
          at: event.occurred_at,
          kind: 'event',
          title: titleOf(event),
          cause: causeOfDetails(people, event.details) ?? { kind: 'device' },
        }),
      );
    },
  };
}
