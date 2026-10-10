import { burstsOf, type Burst } from './bursts';
import type { TimelineKind } from './timeline';

export interface RecordedItem {
  readonly id: string;
  readonly event: { readonly id: string } | null;
  readonly at: string;
  readonly kind: TimelineKind;
  readonly deviceId: string;
  readonly snapshot: { readonly id: string } | null;
  readonly clip: { readonly id: string; readonly duration_ms: number | null } | null;
}

export interface EventEntry {
  readonly id: string;
  readonly kind: TimelineKind;
  readonly deviceId: string;
  readonly at: string;
  readonly oldest: string;
  readonly count: number;
  readonly snapshotId: string | null;
  readonly clipId: string | null;
  readonly clipMs: number | null;
  readonly recordingIds: readonly string[];
  readonly removal: Removal;
  readonly children: readonly EventEntry[];
}

export interface Removal {
  readonly eventIds: readonly string[];
  readonly recordingIds: readonly string[];
}

function recordingIdsOf(item: RecordedItem): string[] {
  return [item.clip?.id, item.snapshot?.id].filter((id): id is string => id !== undefined);
}

export function entryOf(item: RecordedItem): EventEntry {
  return {
    id: item.id,
    kind: item.kind,
    deviceId: item.deviceId,
    at: item.at,
    oldest: item.at,
    count: 1,
    snapshotId: item.snapshot?.id ?? null,
    clipId: item.clip?.id ?? null,
    clipMs: item.clip?.duration_ms ?? null,
    recordingIds: recordingIdsOf(item),
    removal:
      item.event === null
        ? { eventIds: [], recordingIds: recordingIdsOf(item) }
        : { eventIds: [item.event.id], recordingIds: [] },
    children: [],
  };
}

class EmptyBurstError extends Error {
  override readonly name = 'EmptyBurstError';

  constructor() {
    super('A burst of camera events always holds at least one event.');
  }
}

function entryOfBurst(burst: Burst<RecordedItem>): EventEntry {
  const children = burst.items.map(entryOf);
  const newest = children[0];
  if (newest === undefined) {
    throw new EmptyBurstError();
  }
  if (children.length === 1) {
    return newest;
  }
  return {
    ...newest,
    id: `burst:${burst.id}`,
    oldest: burst.oldest,
    count: children.length,
    recordingIds: children.flatMap((child) => child.recordingIds),
    removal: {
      eventIds: children.flatMap((child) => child.removal.eventIds),
      recordingIds: children.flatMap((child) => child.removal.recordingIds),
    },
    children,
  };
}

export function eventEntries(items: readonly RecordedItem[]): EventEntry[] {
  return burstsOf(items).map(entryOfBurst);
}

export function recordingTarget(entry: EventEntry): string | null {
  return entry.clipId ?? entry.snapshotId;
}

export function thumbnailIds(entries: readonly EventEntry[]): string[] {
  return entries.flatMap((entry) => (entry.snapshotId === null ? [] : [entry.snapshotId]));
}
