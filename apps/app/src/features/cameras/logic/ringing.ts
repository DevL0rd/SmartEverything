const RING_WINDOW_MS = 60_000;

export const RING_FOR_MS = 45_000;

export type RingKind = 'call' | 'doorbell';

export interface RingSource {
  readonly id: string;
  readonly device_id: string | null;
  readonly kind: string;
  readonly occurred_at: string;
  readonly acknowledged_at: string | null;
}

export interface Ring {
  readonly eventId: string;
  readonly deviceId: string;
  readonly kind: RingKind;
  readonly occurredAt: string;
}

function ringKindOf(kind: string): RingKind | null {
  return kind === 'call' || kind === 'doorbell' ? kind : null;
}

export function newRings(
  events: readonly RingSource[],
  seen: ReadonlySet<string>,
  cameraIds: ReadonlySet<string>,
  now: number,
): Ring[] {
  const rings: Ring[] = [];
  for (const event of events) {
    const kind = ringKindOf(event.kind);
    const deviceId = event.device_id;
    if (
      kind !== null &&
      deviceId !== null &&
      cameraIds.has(deviceId) &&
      !seen.has(event.id) &&
      event.acknowledged_at === null &&
      now - Date.parse(event.occurred_at) <= RING_WINDOW_MS
    ) {
      rings.push({ eventId: event.id, deviceId, kind, occurredAt: event.occurred_at });
    }
  }
  return rings.sort((left, right) => left.occurredAt.localeCompare(right.occurredAt));
}

export function stillRinging(ring: Ring, now: number): boolean {
  return now - Date.parse(ring.occurredAt) < RING_FOR_MS;
}

export function ringTitle(kind: RingKind, camera: string): string {
  return kind === 'call' ? `${camera} is calling` : `Someone rang at ${camera}`;
}
