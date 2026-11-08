import { describe, expect, it } from 'vitest';
import {
  applyEventsPage,
  applyTasksPage,
  INITIAL_CALENDAR_SYNC,
  INITIAL_TASKS_SYNC,
  resetCalendarSync,
  SyncProtocolError,
  type EventsPage,
  type GoogleEvent,
  type GoogleTask,
  type TasksPage,
} from '../src';

const none = new Map<string, string>();

function event(id: string, etag = 'e', extra: object = {}): GoogleEvent {
  return { id, etag, status: 'confirmed' as const, ...extra };
}

describe('calendar sync state', () => {
  it('keeps the old token until the last page of an incremental sync', () => {
    const state = { syncToken: 'old', pageToken: null };
    const first = applyEventsPage(state, { items: [event('a')], nextPageToken: 'p2' }, none);
    expect(first.complete).toBe(false);
    expect(first.state).toEqual({ syncToken: 'old', pageToken: 'p2' });
    const last = applyEventsPage(first.state, { items: [event('b')], nextSyncToken: 'new' }, none);
    expect(last.complete).toBe(true);
    expect(last.state).toEqual({ syncToken: 'new', pageToken: null });
    expect(last.full).toBe(false);
  });

  it('marks a sync without a token as full', () => {
    const result = applyEventsPage(INITIAL_CALENDAR_SYNC, { items: [], nextSyncToken: 't' }, none);
    expect(result.full).toBe(true);
    expect(result.state.syncToken).toBe('t');
  });

  it('rejects a last page without a sync token', () => {
    expect(() => applyEventsPage(INITIAL_CALENDAR_SYNC, { items: [] }, none)).toThrow(
      SyncProtocolError,
    );
  });

  it('turns cancelled items into tombstones, instances with their three fields', () => {
    const page: EventsPage = {
      items: [
        { id: 'gone', etag: 'x', status: 'cancelled' },
        {
          id: 'series_20261107',
          etag: 'y',
          status: 'cancelled',
          recurringEventId: 'series',
          originalStartTime: { dateTime: '2026-11-07T10:00:00Z' },
        },
      ],
      nextSyncToken: 't',
    };
    const result = applyEventsPage(INITIAL_CALENDAR_SYNC, page, none);
    expect(result.upserts).toEqual([]);
    expect(result.tombstones).toEqual([
      { id: 'gone', recurringEventId: null, originalStartTime: null },
      {
        id: 'series_20261107',
        recurringEventId: 'series',
        originalStartTime: { dateTime: '2026-11-07T10:00:00Z' },
      },
    ]);
  });

  it('skips own writes by etag but applies a later remote change to the same event', () => {
    const own = new Map([['a', 'mine']]);
    const result = applyEventsPage(
      INITIAL_CALENDAR_SYNC,
      { items: [event('a', 'mine'), event('b', 'other')], nextSyncToken: 't' },
      own,
    );
    expect(result.ownWrites).toEqual(['a']);
    expect(result.upserts.map((item) => item.id)).toEqual(['b']);
    const changed = applyEventsPage(
      INITIAL_CALENDAR_SYNC,
      { items: [event('a', 'theirs')], nextSyncToken: 't' },
      own,
    );
    expect(changed.upserts.map((item) => item.id)).toEqual(['a']);
  });

  it('keeps the last copy of an id repeated within a page', () => {
    const result = applyEventsPage(
      INITIAL_CALENDAR_SYNC,
      { items: [event('a', 'one'), event('a', 'two')], nextSyncToken: 't' },
      none,
    );
    expect(result.upserts.map((item) => item.etag)).toEqual(['two']);
  });

  it('a 410 reset returns to a full sync', () => {
    expect(resetCalendarSync()).toEqual(INITIAL_CALENDAR_SYNC);
  });
});

function task(id: string, etag: string, updated: string, extra: object = {}): GoogleTask {
  return { id, etag, status: 'needsAction' as const, updated, ...extra };
}

describe('tasks sync state', () => {
  it('commits updatedMin from the largest server updated seen, only when the last page ends', () => {
    const first = applyTasksPage(
      INITIAL_TASKS_SYNC,
      {
        items: [
          task('a', '1', '2026-11-07T01:00:00.000Z'),
          task('b', '1', '2026-11-07T03:00:00.000Z'),
        ],
        nextPageToken: 'p',
      },
      none,
    );
    expect(first.state.updatedMin).toBeNull();
    expect(first.state.pageToken).toBe('p');
    const last = applyTasksPage(
      first.state,
      { items: [task('c', '1', '2026-11-07T02:00:00.000Z')] },
      none,
    );
    expect(last.complete).toBe(true);
    expect(last.state).toEqual({
      updatedMin: '2026-11-07T03:00:00.000Z',
      pageToken: null,
      highWater: null,
    });
  });

  it('never moves updatedMin back and keeps it on an empty pull', () => {
    const state = { updatedMin: '2026-11-07T03:00:00.000Z', pageToken: null, highWater: null };
    const older = applyTasksPage(
      state,
      { items: [task('a', '1', '2026-11-07T01:00:00.000Z')] },
      none,
    );
    expect(older.state.updatedMin).toBe('2026-11-07T03:00:00.000Z');
    const empty = applyTasksPage(state, { items: [] }, none);
    expect(empty.state.updatedMin).toBe('2026-11-07T03:00:00.000Z');
  });

  it('dedupes by id and etag, and reports deleted tasks as tombstones', () => {
    const page: TasksPage = {
      items: [
        task('same', 'e1', '2026-11-07T01:00:00.000Z'),
        task('changed', 'e2', '2026-11-07T01:00:00.000Z'),
        task('dead', 'e3', '2026-11-07T01:00:00.000Z', { deleted: true }),
      ],
    };
    const result = applyTasksPage(
      INITIAL_TASKS_SYNC,
      page,
      new Map([
        ['same', 'e1'],
        ['changed', 'old'],
      ]),
    );
    expect(result.unchanged).toEqual(['same']);
    expect(result.upserts.map((item) => item.id)).toEqual(['changed']);
    expect(result.tombstones).toEqual(['dead']);
  });
});
