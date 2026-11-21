import {
  API_ENDPOINTS as E,
  type PlannerAlarmRow,
  type PlannerCollectionRow,
  type PlannerItemRow,
  type PlannerOccurrenceRow,
} from '@smarteverything/domain';
import { randomUUID } from 'expo-crypto';
import { useMemo } from 'react';
import type { z } from 'zod';
import {
  completePlannerItem,
  createPlannerAlarm,
  createPlannerCollection,
  createPlannerItem,
  deletePlannerAlarm,
  deletePlannerCollection,
  deletePlannerItem,
  movePlannerItem,
  reopenPlannerItem,
  skipPlannerItem,
  updatePlannerAlarm,
  updatePlannerCollection,
  updatePlannerItem,
  type PlannerDeleteScope,
} from '../../../api/planner';
import type { EntityStore } from '../../../store/entity-store';
import { useEntityStore } from '../../../store/store-context';
import { liveRowEdit, writeOptimistically } from '../../../store/optimistic';
import { predictedAlarm, predictedCollection } from './create-rows';
import { predictedItem } from './item-create';
import { alarmEdit, collectionEdit, itemEdit, occurrenceEdit } from './optimistic';
import { apiPerson, type PlannerPerson } from './person';

type Body<K extends keyof typeof E> = z.input<(typeof E)[K]['body']>;
type Output<K extends keyof typeof E> = z.output<(typeof E)[K]['response']>;

type DefinedChanges<T> = { readonly [K in keyof T]?: Exclude<T[K], undefined> };

export type ItemChange = Omit<Body<'updatePlannerItem'>, 'changes'> & {
  readonly changes: DefinedChanges<z.output<(typeof E)['updatePlannerItem']['body']>['changes']>;
};
export type CollectionChange = DefinedChanges<Body<'updatePlannerCollection'>>;
export type AlarmChange = DefinedChanges<Body<'updatePlannerAlarm'>>;
export type CompleteBody = Body<'completePlannerItem'>;
export type AlarmCreate = Body<'createPlannerAlarm'> & { readonly id: string };

export interface ItemWrites {
  readonly createItem: (body: Body<'createPlannerItem'>) => Promise<Output<'createPlannerItem'>>;
  readonly updateItem: (item: PlannerItemRow, change: ItemChange) => Promise<PlannerItemRow>;
  readonly deleteItem: (item: PlannerItemRow, scope?: PlannerDeleteScope) => Promise<void>;
  readonly completeItem: (itemId: string, body?: CompleteBody) => Promise<PlannerOccurrenceRow>;
  readonly skipItem: (itemId: string, key?: string) => Promise<PlannerOccurrenceRow>;
  readonly reopenItem: (item: PlannerItemRow, key: string) => Promise<void>;
  readonly moveItem: (
    itemId: string,
    body: Body<'movePlannerItem'>,
  ) => Promise<PlannerOccurrenceRow>;
}

export interface CollectionWrites {
  readonly createCollection: (
    body: Body<'createPlannerCollection'>,
  ) => Promise<PlannerCollectionRow>;
  readonly updateCollection: (
    row: PlannerCollectionRow,
    change: CollectionChange,
  ) => Promise<PlannerCollectionRow>;
  readonly deleteCollection: (row: PlannerCollectionRow) => Promise<void>;
}

export interface AlarmWrites {
  readonly createAlarm: (body: AlarmCreate) => Promise<PlannerAlarmRow>;
  readonly updateAlarm: (row: PlannerAlarmRow, change: AlarmChange) => Promise<PlannerAlarmRow>;
  readonly deleteAlarm: (row: PlannerAlarmRow) => Promise<void>;
}

export type PlannerWrites = ItemWrites & CollectionWrites & AlarmWrites;

function wholeSeries(scope: ItemChange['scope']): boolean {
  return scope === undefined || scope === 'all';
}

export interface OccurrenceDraft {
  readonly itemId: string;
  readonly key: string;
  readonly status: 'done' | 'skipped';
  readonly evidence: PlannerOccurrenceRow['evidence'];
}

export function occurrenceOf(
  { itemId, key, status, evidence }: OccurrenceDraft,
  now: Date,
): PlannerOccurrenceRow {
  const done = status === 'done';
  return {
    item_id: itemId,
    occurrence_key: key,
    status,
    completed_at: done ? now.toISOString() : null,
    completed_by: done ? 'person' : null,
    evidence,
    moved_start: null,
    moved_end: null,
  };
}

export function itemWith(item: PlannerItemRow, change: ItemChange): PlannerItemRow {
  return { ...item, ...change.changes };
}

function reopenWrite(store: EntityStore, who: string | undefined): ItemWrites['reopenItem'] {
  return (item, key) =>
    writeOptimistically(store, {
      event: 'planner_item.reopen',
      edits: [
        occurrenceEdit(store.get(), item.id, key, null),
        ...(item.rrule === null && item.status === 'done'
          ? [itemEdit(item, { ...item, status: 'open' })]
          : []),
      ],
      send: () => reopenPlannerItem(who, item.id, key),
    });
}

function createWrite(store: EntityStore, who: string | undefined): ItemWrites['createItem'] {
  return (body) => {
    const request = E.createPlannerItem.body.parse({ ...body, id: randomUUID() });
    const next = predictedItem(store.get(), request, new Date());
    return writeOptimistically(store, {
      event: 'planner_item.create',
      edits: next === null ? [] : [liveRowEdit('planner_items', next.id, null, next)],
      send: () => createPlannerItem(who, request),
      fields: { itemId: request.id, kind: request.kind },
    });
  };
}

function moveWrite(store: EntityStore, who: string | undefined): ItemWrites['moveItem'] {
  return (itemId, body) => {
    const key = body.occurrence_key ?? 'single';
    const next: PlannerOccurrenceRow = {
      item_id: itemId,
      occurrence_key: key,
      status: 'missed',
      completed_at: null,
      completed_by: null,
      evidence: null,
      moved_start: body.start,
      moved_end: body.end ?? null,
    };
    return writeOptimistically(store, {
      event: 'planner_item.move',
      edits: [occurrenceEdit(store.get(), itemId, key, next)],
      send: () => movePlannerItem(who, itemId, body),
    });
  };
}

function itemWrites(store: EntityStore, who: string | undefined): ItemWrites {
  return {
    createItem: createWrite(store, who),
    updateItem: (item, change) =>
      writeOptimistically(store, {
        event: 'planner_item.update',
        edits: wholeSeries(change.scope) ? [itemEdit(item, itemWith(item, change))] : [],
        send: () => updatePlannerItem(who, item.id, change),
      }),
    deleteItem: (item, scope = {}) =>
      writeOptimistically(store, {
        event: 'planner_item.delete',
        edits: wholeSeries(scope.scope) ? [itemEdit(item, null)] : [],
        send: () => deletePlannerItem(who, item.id, scope),
      }),
    completeItem: (itemId, body = {}): Promise<PlannerOccurrenceRow> => {
      const key = body.occurrence_key ?? 'single';
      const next = occurrenceOf(
        { itemId, key, status: 'done', evidence: body.evidence ?? null },
        new Date(),
      );
      return writeOptimistically(store, {
        event: 'planner_item.complete',
        edits: [occurrenceEdit(store.get(), itemId, key, next)],
        send: () => completePlannerItem(who, itemId, body),
      });
    },
    skipItem: (itemId, key = 'single'): Promise<PlannerOccurrenceRow> => {
      const next = occurrenceOf({ itemId, key, status: 'skipped', evidence: null }, new Date());
      return writeOptimistically(store, {
        event: 'planner_item.skip',
        edits: [occurrenceEdit(store.get(), itemId, key, next)],
        send: () => skipPlannerItem(who, itemId, key),
      });
    },
    reopenItem: reopenWrite(store, who),
    moveItem: moveWrite(store, who),
  };
}

function createCollectionWrite(
  store: EntityStore,
  person: PlannerPerson,
): CollectionWrites['createCollection'] {
  return (body) => {
    const request = E.createPlannerCollection.body.parse({ ...body, id: randomUUID() });
    const next = predictedCollection(store.get(), person, request, new Date());
    return writeOptimistically(store, {
      event: 'planner_collection.create',
      edits: next === null ? [] : [liveRowEdit('planner_collections', next.id, null, next)],
      send: () => createPlannerCollection(apiPerson(person), request),
      fields: { collectionId: request.id, kind: request.kind },
    });
  };
}

function collectionWrites(store: EntityStore, person: PlannerPerson): CollectionWrites {
  const who = apiPerson(person);
  return {
    createCollection: createCollectionWrite(store, person),
    updateCollection: (row, change) =>
      writeOptimistically(store, {
        event: 'planner_collection.update',
        edits: [collectionEdit(row, { ...row, ...change })],
        send: () => updatePlannerCollection(who, row.id, change),
      }),
    deleteCollection: (row) =>
      writeOptimistically(store, {
        event: 'planner_collection.delete',
        edits: [collectionEdit(row, null)],
        send: () => deletePlannerCollection(who, row.id),
      }),
  };
}

export function keptAlarm(store: EntityStore): (row: PlannerAlarmRow) => PlannerAlarmRow {
  return (row) => {
    store.update(alarmEdit(row, row).apply);
    return row;
  };
}

function createAlarmWrite(store: EntityStore, person: PlannerPerson): AlarmWrites['createAlarm'] {
  return (body) => {
    const request = E.createPlannerAlarm.body.parse(body);
    const next = predictedAlarm(store.get(), person, request, new Date());
    return writeOptimistically(store, {
      event: 'planner_alarm.create',
      edits: next === null ? [] : [liveRowEdit('planner_alarms', next.id, null, next)],
      send: () => createPlannerAlarm(apiPerson(person), request),
      fields: { alarmId: request.id },
    }).then(keptAlarm(store));
  };
}

function alarmWrites(store: EntityStore, person: PlannerPerson): AlarmWrites {
  const who = apiPerson(person);
  const keep = keptAlarm(store);
  return {
    createAlarm: createAlarmWrite(store, person),
    updateAlarm: (row, change) =>
      writeOptimistically(store, {
        event: 'planner_alarm.update',
        edits: [alarmEdit(row, { ...row, ...change })],
        send: () => updatePlannerAlarm(who, row.id, change),
      }).then(keep),
    deleteAlarm: (row) =>
      writeOptimistically(store, {
        event: 'planner_alarm.delete',
        edits: [alarmEdit(row, null)],
        send: () => deletePlannerAlarm(who, row.id),
      }),
  };
}

export function plannerWrites(store: EntityStore, person: PlannerPerson): PlannerWrites {
  const who = apiPerson(person);
  return {
    ...itemWrites(store, who),
    ...collectionWrites(store, person),
    ...alarmWrites(store, person),
  };
}

export function usePlannerWrites(person: PlannerPerson): PlannerWrites {
  const store = useEntityStore();
  return useMemo(() => plannerWrites(store, person), [store, person]);
}
