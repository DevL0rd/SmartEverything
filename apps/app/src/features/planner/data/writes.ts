import type {
  API_ENDPOINTS as E,
  PlannerAlarmRow,
  PlannerCollectionRow,
  PlannerItemRow,
  PlannerOccurrenceRow,
} from '@smarteverything/domain';
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
  skipPlannerItem,
  updatePlannerAlarm,
  updatePlannerCollection,
  updatePlannerItem,
  type PlannerDeleteScope,
} from '../../../api/planner';
import type { EntityStore } from '../../../store/entity-store';
import { useEntityStore } from '../../../store/store-context';
import {
  alarmEdit,
  collectionEdit,
  itemEdit,
  occurrenceEdit,
  writeOptimistically,
} from './optimistic';
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

export interface ItemWrites {
  readonly createItem: (body: Body<'createPlannerItem'>) => Promise<Output<'createPlannerItem'>>;
  readonly updateItem: (item: PlannerItemRow, change: ItemChange) => Promise<PlannerItemRow>;
  readonly deleteItem: (item: PlannerItemRow, scope?: PlannerDeleteScope) => Promise<void>;
  readonly completeItem: (itemId: string, body?: CompleteBody) => Promise<PlannerOccurrenceRow>;
  readonly skipItem: (itemId: string, key?: string) => Promise<PlannerOccurrenceRow>;
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
  readonly createAlarm: (body: Body<'createPlannerAlarm'>) => Promise<PlannerAlarmRow>;
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

function itemWrites(store: EntityStore, who: string | undefined): ItemWrites {
  return {
    createItem: (body) => createPlannerItem(who, body),
    updateItem: (item, change) =>
      writeOptimistically(
        store,
        'planner_item.update',
        wholeSeries(change.scope) ? [itemEdit(item, itemWith(item, change))] : [],
        () => updatePlannerItem(who, item.id, change),
      ),
    deleteItem: (item, scope = {}) =>
      writeOptimistically(
        store,
        'planner_item.delete',
        wholeSeries(scope.scope) ? [itemEdit(item, null)] : [],
        () => deletePlannerItem(who, item.id, scope),
      ),
    completeItem: (itemId, body = {}): Promise<PlannerOccurrenceRow> => {
      const key = body.occurrence_key ?? 'single';
      const next = occurrenceOf(
        { itemId, key, status: 'done', evidence: body.evidence ?? null },
        new Date(),
      );
      return writeOptimistically(
        store,
        'planner_item.complete',
        [occurrenceEdit(store.get(), itemId, key, next)],
        () => completePlannerItem(who, itemId, body),
      );
    },
    skipItem: (itemId, key = 'single'): Promise<PlannerOccurrenceRow> => {
      const next = occurrenceOf({ itemId, key, status: 'skipped', evidence: null }, new Date());
      return writeOptimistically(
        store,
        'planner_item.skip',
        [occurrenceEdit(store.get(), itemId, key, next)],
        () => skipPlannerItem(who, itemId, key),
      );
    },
    moveItem: (itemId, body) => movePlannerItem(who, itemId, body),
  };
}

function collectionWrites(store: EntityStore, who: string | undefined): CollectionWrites {
  return {
    createCollection: (body) => createPlannerCollection(who, body),
    updateCollection: (row, change) =>
      writeOptimistically(
        store,
        'planner_collection.update',
        [collectionEdit(row, { ...row, ...change })],
        () => updatePlannerCollection(who, row.id, change),
      ),
    deleteCollection: (row) =>
      writeOptimistically(store, 'planner_collection.delete', [collectionEdit(row, null)], () =>
        deletePlannerCollection(who, row.id),
      ),
  };
}

function alarmWrites(store: EntityStore, who: string | undefined): AlarmWrites {
  return {
    createAlarm: (body) => createPlannerAlarm(who, body),
    updateAlarm: (row, change) =>
      writeOptimistically(
        store,
        'planner_alarm.update',
        [alarmEdit(row, { ...row, ...change })],
        () => updatePlannerAlarm(who, row.id, change),
      ),
    deleteAlarm: (row) =>
      writeOptimistically(store, 'planner_alarm.delete', [alarmEdit(row, null)], () =>
        deletePlannerAlarm(who, row.id),
      ),
  };
}

export function plannerWrites(store: EntityStore, person: PlannerPerson): PlannerWrites {
  const who = apiPerson(person);
  return {
    ...itemWrites(store, who),
    ...collectionWrites(store, who),
    ...alarmWrites(store, who),
  };
}

export function usePlannerWrites(person: PlannerPerson): PlannerWrites {
  const store = useEntityStore();
  return useMemo(() => plannerWrites(store, person), [store, person]);
}
