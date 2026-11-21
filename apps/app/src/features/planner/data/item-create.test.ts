import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PLANNER_COLLECTION_ROW, PLANNER_ITEM_ROW } from '@smarteverything/domain';
import { EntityStore } from '../../../store/entity-store';
import { applyListChange } from '../../../store/live-reducers';

const api = vi.hoisted(() => ({
  createPlannerItem: vi.fn(),
  createPlannerCollection: vi.fn(),
  createPlannerAlarm: vi.fn(),
  movePlannerItem: vi.fn(),
}));

vi.mock('expo-crypto', () => ({ randomUUID: (): string => randomUUID() }));
vi.mock('../../../api/planner', () => api);

const { plannerWrites } = await import('./writes');
const { instantOfLocal } = await import('./item-create');

const OWNER = '00000000-0000-4000-8000-000000000021';
const STAMP = '2026-11-01T00:00:00.000Z';
const COLLECTION = PLANNER_COLLECTION_ROW.parse({
  id: '00000000-0000-4000-8000-000000000022',
  profile_id: OWNER,
  kind: 'list',
  name: 'Errands',
  colour: 'personal',
  icon: 'list',
  position: 0,
  visible: true,
  default_reminders: [],
  audience: 'personal',
  source: 'local',
  google: null,
  feed: null,
  created_at: STAMP,
  updated_at: STAMP,
});

function plannerStore(): EntityStore {
  const store = new EntityStore();
  store.update((state) =>
    applyListChange(state, 'planner_collections', {
      table: 'planner_collections',
      operation: 'INSERT',
      record: COLLECTION,
      oldRecord: null,
    }),
  );
  return store;
}

function itemsOf(store: EntityStore): readonly string[] {
  return store.get().tables.planner_items.rows.map((row) => row.title);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('planner creates and moves', () => {
  it('shows a new task at once under the id it sends to the Hub', async () => {
    const store = plannerStore();
    const writes = plannerWrites(store, null);
    api.createPlannerItem.mockImplementationOnce((_who: unknown, body: { id: string }) => {
      expect(itemsOf(store)).toEqual(['Buy bulbs']);
      expect(store.get().tables.planner_items.byId[body.id]?.profile_id).toBe(OWNER);
      return Promise.resolve(
        PLANNER_ITEM_ROW.parse(store.get().tables.planner_items.byId[body.id]),
      );
    });
    await writes.createItem({ collection_id: COLLECTION.id, kind: 'task', title: 'Buy bulbs' });
    expect(api.createPlannerItem).toHaveBeenCalledTimes(1);
  });

  it('removes the new task again when the Hub refuses it', async () => {
    const store = plannerStore();
    api.createPlannerItem.mockRejectedValueOnce(new Error('refused'));
    await expect(
      plannerWrites(store, null).createItem({
        collection_id: COLLECTION.id,
        kind: 'task',
        title: 'Buy bulbs',
      }),
    ).rejects.toThrow('refused');
    expect(itemsOf(store)).toEqual([]);
  });

  it('moves an occurrence at once and puts it back when the move is refused', async () => {
    const store = plannerStore();
    const itemId = '00000000-0000-4000-8000-000000000023';
    let refuse = (_error: Error): void => {
      throw new Error('Expected a pending move');
    };
    api.movePlannerItem.mockImplementationOnce(
      () =>
        new Promise((_resolve, reject) => {
          refuse = reject;
        }),
    );
    const move = plannerWrites(store, null).moveItem(itemId, {
      start: '2026-11-21T10:00:00.000Z',
    });
    expect(store.get().tables.planner_occurrences.rows).toMatchObject([
      { item_id: itemId, moved_start: '2026-11-21T10:00:00.000Z', moved_end: null },
    ]);
    refuse(new Error('done already'));
    await expect(move).rejects.toThrow('done already');
    expect(store.get().tables.planner_occurrences.rows).toEqual([]);
  });

  it('shows a new repeating event at once with the end of its series', async () => {
    const store = plannerStore();
    api.createPlannerItem.mockResolvedValueOnce(undefined);
    await plannerWrites(store, null).createItem({
      collection_id: COLLECTION.id,
      kind: 'event',
      title: 'Yoga',
      start_local: '2026-11-09T09:00',
      end_local: '2026-11-09T10:00',
      time_zone: 'UTC',
      rrule: 'FREQ=WEEKLY;UNTIL=20261130T090000Z',
    });
    expect(store.get().tables.planner_items.rows).toMatchObject([
      { title: 'Yoga', start: '2026-11-09T09:00:00.000Z', series_end: '2026-11-30T10:00:00.000Z' },
    ]);
  });

  it('shows a new list at once and removes it when the Hub refuses it', async () => {
    const store = plannerStore();
    const writes = plannerWrites(store, OWNER);
    const names = (): readonly string[] =>
      store.get().tables.planner_collections.rows.map((row) => row.name);
    api.createPlannerCollection.mockImplementationOnce((_who: unknown, body: { id: string }) => {
      expect(names()).toEqual(['Errands', 'Groceries']);
      expect(store.get().tables.planner_collections.byId[body.id]?.position).toBe(1);
      return Promise.reject(new Error('refused'));
    });
    await expect(
      writes.createCollection({ kind: 'list', name: 'Groceries', colour: 'home', icon: 'cart' }),
    ).rejects.toThrow('refused');
    expect(names()).toEqual(['Errands']);
  });

  it('shows a new alarm at once under the id the caller chose', async () => {
    const store = plannerStore();
    const id = randomUUID();
    api.createPlannerAlarm.mockImplementationOnce((_who: unknown, body: { id: string }) => {
      expect(body.id).toBe(id);
      const row = store.get().tables.planner_alarms.byId[id];
      expect(row).toMatchObject({ time: '06:30', profile_id: OWNER, source: 'planner' });
      return Promise.resolve(row);
    });
    await plannerWrites(store, OWNER).createAlarm({
      id,
      time: '06:30',
      sound: { kind: 'tone', id: 'chime' },
      ramp_seconds: 30,
      vibrate: true,
      snooze_minutes: 9,
      snooze_limit: null,
      targets: [],
    });
    expect(api.createPlannerAlarm).toHaveBeenCalledTimes(1);
  });

  it('turns a local time in a zone into the instant the Hub stores', () => {
    expect(instantOfLocal('2026-11-09T09:00', 'UTC')).toBe('2026-11-09T09:00:00.000Z');
    expect(instantOfLocal('2026-11-09T09:00', 'Asia/Bangkok')).toBe('2026-11-09T02:00:00.000Z');
    expect(instantOfLocal('2026-11-09', null)).toBe('2026-11-09T00:00:00.000Z');
  });
});
