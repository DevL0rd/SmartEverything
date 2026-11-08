import { describe, expect, it } from 'vitest';
import { PLANNER_ENDPOINTS } from '../src/api/endpoints-planner';
import {
  PLANNER_COMPLETE_BODY,
  PLANNER_ITEM_CREATE,
  PLANNER_ITEM_DELETE_QUERY,
  PLANNER_ITEM_PATCH,
  PLANNER_MOVE_BODY,
} from '../src/api/endpoints-planner-items';
import {
  PLANNER_ALARM_CHANGES,
  PLANNER_ALARM_CREATE,
  PLANNER_TIMER_START,
} from '../src/api/endpoints-planner-clock';
import { API_ENDPOINTS } from '../src/api/endpoints';

const COLLECTION = '0b1c6a54-2f0e-4b6e-9a43-0f3b6d2b7a10';

describe('planner endpoint table', () => {
  it('has unique method and path pairs, none shared with the other endpoints', () => {
    const keys = Object.values(PLANNER_ENDPOINTS).map((e) => `${e.method} ${e.path}`);
    expect(new Set(keys).size).toBe(keys.length);
    const others = new Set(
      Object.values(API_ENDPOINTS)
        .filter((e) => !e.path.startsWith('/api/planner'))
        .map((e) => `${e.method} ${e.path}`),
    );
    for (const key of keys) expect(others.has(key)).toBe(false);
  });

  it('is member access with a path under /api/planner and lists every contract of the plan', () => {
    for (const e of Object.values(PLANNER_ENDPOINTS)) {
      expect(e.access).toBe('member');
      expect(e.path.startsWith('/api/planner/')).toBe(true);
    }
    const keys = Object.values(PLANNER_ENDPOINTS).map((e) => `${e.method} ${e.path}`);
    for (const wanted of [
      'GET /api/planner/day',
      'GET /api/planner/range',
      'GET /api/planner/stats',
      'POST /api/planner/items',
      'PATCH /api/planner/items/:itemId',
      'POST /api/planner/items/:itemId/complete',
      'POST /api/planner/items/:itemId/skip',
      'POST /api/planner/items/:itemId/move',
      'POST /api/planner/parse',
      'POST /api/planner/suggest-completion',
      'POST /api/planner/free-slots',
      'POST /api/planner/proposals/:id/accept',
      'POST /api/planner/proposals/:id/reject',
      'POST /api/planner/collections',
      'PUT /api/planner/preferences',
      'POST /api/planner/alarms/:alarmId/snooze',
      'POST /api/planner/alarms/:alarmId/dismiss',
      'POST /api/planner/alarms/:alarmId/skip-next',
      'POST /api/planner/timers/:timerId/add-time',
      'POST /api/planner/stopwatch/lap',
      'GET /api/planner/rings',
      'POST /api/planner/phone-rings/ack',
    ]) {
      expect(keys, wanted).toContain(wanted);
    }
  });

  it('lets the owner leave personId out and takes a person id when given', () => {
    const query = PLANNER_ENDPOINTS.readPlannerDay.query;
    expect(query.safeParse({ date: '2026-11-07' }).success).toBe(true);
    expect(query.safeParse({ date: '2026-11-07', personId: 'nobody' }).success).toBe(false);
    expect(query.safeParse({ date: '2026-11-07', personId: COLLECTION }).success).toBe(true);
  });

  it('reads range and stats queries', () => {
    const range = PLANNER_ENDPOINTS.readPlannerRange.query;
    const window = { from: '2026-11-01T00:00:00+00:00', to: '2026-11-08T00:00:00+00:00' };
    expect(range.safeParse({ ...window, collections: `${COLLECTION},${COLLECTION}` }).success).toBe(
      true,
    );
    expect(range.safeParse({ from: window.to, to: window.from }).success).toBe(false);
    const stats = PLANNER_ENDPOINTS.readPlannerStats.query;
    expect(stats.safeParse({ range: 'month' }).success).toBe(true);
    expect(stats.safeParse({ range: 'day' }).success).toBe(false);
  });
});

describe('planner item bodies', () => {
  it('creates an item with defaults and rejects an empty title or unknown field', () => {
    const made = PLANNER_ITEM_CREATE.parse({
      collection_id: COLLECTION,
      kind: 'task',
      title: 'Milk',
    });
    expect(made.completion).toEqual({ kind: 'manual' });
    expect(made.tags).toEqual([]);
    expect(
      PLANNER_ITEM_CREATE.safeParse({ collection_id: COLLECTION, kind: 'task', title: ' ' })
        .success,
    ).toBe(false);
    expect(
      PLANNER_ITEM_CREATE.safeParse({
        collection_id: COLLECTION,
        kind: 'task',
        title: 'x',
        status: 'done',
      }).success,
    ).toBe(false);
  });

  it('needs the occurrence for scopes this and following and defaults to all', () => {
    const changes = { title: 'New' };
    expect(PLANNER_ITEM_PATCH.parse({ changes }).scope).toBe('all');
    expect(PLANNER_ITEM_PATCH.safeParse({ scope: 'this', changes }).success).toBe(false);
    expect(
      PLANNER_ITEM_PATCH.safeParse({
        scope: 'following',
        occurrence_key: '2026-11-07T09:00:00+00:00',
        changes,
      }).success,
    ).toBe(true);
    expect(PLANNER_ITEM_PATCH.safeParse({ changes: {} }).success).toBe(false);
    expect(PLANNER_ITEM_DELETE_QUERY.safeParse({ scope: 'this' }).success).toBe(false);
    expect(PLANNER_ITEM_DELETE_QUERY.safeParse({}).success).toBe(true);
  });

  it('completes and moves a single occurrence by default and rejects an inverted move', () => {
    expect(PLANNER_COMPLETE_BODY.parse({}).occurrence_key).toBe('single');
    const start = '2026-11-07T15:00:00+00:00';
    expect(PLANNER_MOVE_BODY.safeParse({ start }).success).toBe(true);
    expect(PLANNER_MOVE_BODY.safeParse({ start, end: '2026-11-07T14:00:00+00:00' }).success).toBe(
      false,
    );
  });
});

describe('planner clock bodies', () => {
  it('accepts a weekday alarm and rejects a date together with weekdays', () => {
    expect(PLANNER_ALARM_CREATE.safeParse({ time: '06:30', days: [1, 2, 3] }).success).toBe(true);
    expect(
      PLANNER_ALARM_CREATE.safeParse({ time: '06:30', days: [1], once_on: '2026-11-08' }).success,
    ).toBe(false);
    expect(PLANNER_ALARM_CREATE.safeParse({ time: '6:30' }).success).toBe(false);
    expect(
      PLANNER_ALARM_CREATE.safeParse({ time: '06:30', wake_scene_id: COLLECTION }).success,
    ).toBe(false);
  });

  it('needs something to change on an alarm and a positive timer length', () => {
    expect(PLANNER_ALARM_CHANGES.safeParse({}).success).toBe(false);
    expect(PLANNER_ALARM_CHANGES.safeParse({ enabled: false }).success).toBe(true);
    expect(PLANNER_TIMER_START.safeParse({ duration_ms: 0 }).success).toBe(false);
    expect(PLANNER_TIMER_START.parse({ duration_ms: 60000 }).label).toBeNull();
  });
});
