import type { EventTime, GoogleEvent, EventsPage } from './schemas-calendar';
import type { GoogleTask, TasksPage } from './schemas-tasks';

export class SyncProtocolError extends Error {
  override readonly name = 'SyncProtocolError';
}

export interface CalendarSyncState {
  readonly syncToken: string | null;
  readonly pageToken: string | null;
}

export const INITIAL_CALENDAR_SYNC: CalendarSyncState = { syncToken: null, pageToken: null };

export interface EventTombstone {
  readonly id: string;
  readonly recurringEventId: string | null;
  readonly originalStartTime: EventTime | null;
}

export interface EventsPageResult {
  readonly state: CalendarSyncState;
  readonly complete: boolean;
  readonly full: boolean;
  readonly upserts: readonly GoogleEvent[];
  readonly tombstones: readonly EventTombstone[];
  readonly ownWrites: readonly string[];
}

export function resetCalendarSync(): CalendarSyncState {
  return INITIAL_CALENDAR_SYNC;
}

function lastById<T extends { readonly id: string }>(items: readonly T[]): readonly T[] {
  const latest = new Map<string, T>();
  for (const item of items) latest.set(item.id, item);
  return [...latest.values()];
}

interface EventsPartition {
  readonly upserts: GoogleEvent[];
  readonly tombstones: EventTombstone[];
  readonly ownWrites: string[];
}

function partitionEvents(
  items: readonly GoogleEvent[],
  ownEtags: ReadonlyMap<string, string>,
): EventsPartition {
  const parts: EventsPartition = { upserts: [], tombstones: [], ownWrites: [] };
  for (const event of lastById(items)) {
    if (ownEtags.get(event.id) === event.etag) {
      parts.ownWrites.push(event.id);
    } else if (event.status === 'cancelled') {
      parts.tombstones.push({
        id: event.id,
        recurringEventId: event.recurringEventId ?? null,
        originalStartTime: event.originalStartTime ?? null,
      });
    } else {
      parts.upserts.push(event);
    }
  }
  return parts;
}

export function applyEventsPage(
  state: CalendarSyncState,
  page: EventsPage,
  ownEtags: ReadonlyMap<string, string>,
): EventsPageResult {
  const complete = page.nextPageToken === undefined;
  if (complete && page.nextSyncToken === undefined) {
    throw new SyncProtocolError('The last events page carried no sync token.');
  }
  const next: CalendarSyncState = complete
    ? { syncToken: page.nextSyncToken ?? null, pageToken: null }
    : { syncToken: state.syncToken, pageToken: page.nextPageToken ?? null };
  return {
    ...partitionEvents(page.items, ownEtags),
    state: next,
    complete,
    full: state.syncToken === null,
  };
}

export interface TasksSyncState {
  readonly updatedMin: string | null;
  readonly pageToken: string | null;
  readonly highWater: string | null;
}

export const INITIAL_TASKS_SYNC: TasksSyncState = {
  updatedMin: null,
  pageToken: null,
  highWater: null,
};

export interface TasksPageResult {
  readonly state: TasksSyncState;
  readonly complete: boolean;
  readonly upserts: readonly GoogleTask[];
  readonly tombstones: readonly string[];
  readonly unchanged: readonly string[];
}

function later(current: string | null, candidate: string): string {
  if (current === null) return candidate;
  return Date.parse(candidate) > Date.parse(current) ? candidate : current;
}

export function applyTasksPage(
  state: TasksSyncState,
  page: TasksPage,
  knownEtags: ReadonlyMap<string, string>,
): TasksPageResult {
  const upserts: GoogleTask[] = [];
  const tombstones: string[] = [];
  const unchanged: string[] = [];
  let highWater = state.highWater ?? state.updatedMin;
  for (const task of lastById(page.items)) {
    highWater = later(highWater, task.updated);
    if (knownEtags.get(task.id) === task.etag) unchanged.push(task.id);
    else if (task.deleted === true) tombstones.push(task.id);
    else upserts.push(task);
  }
  const complete = page.nextPageToken === undefined;
  const next: TasksSyncState = complete
    ? { updatedMin: highWater ?? state.updatedMin, pageToken: null, highWater: null }
    : { updatedMin: state.updatedMin, pageToken: page.nextPageToken ?? null, highWater };
  return { state: next, complete, upserts, tombstones, unchanged };
}
