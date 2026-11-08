import { Logger } from '@smarteverything/logging';
import type {
  PlannerAlarmRow,
  PlannerCollectionRow,
  PlannerItemRow,
  PlannerOccurrenceRow,
} from '@smarteverything/domain';
import type { EntityStore } from '../../../store/entity-store';
import { applyChange } from '../../../store/live-reducers';
import { sameJson } from '../../../store/same-json';
import type { StoreState } from '../../../store/state';

const log = new Logger('app.planner');

export interface Edit {
  readonly apply: (state: StoreState) => StoreState;
  readonly revert: (state: StoreState) => StoreState;
}

export interface RowAccess<R> {
  readonly find: (state: StoreState) => R | null;
  readonly put: (state: StoreState, row: R) => StoreState;
  readonly drop: (state: StoreState, row: R) => StoreState;
}

export function rowEdit<R>(access: RowAccess<R>, previous: R | null, next: R | null): Edit {
  return {
    apply: (state): StoreState => {
      if (next !== null) return access.put(state, next);
      return previous === null ? state : access.drop(state, previous);
    },
    revert: (state): StoreState => {
      const current = access.find(state);
      if (next === null) {
        return current === null && previous !== null ? access.put(state, previous) : state;
      }
      if (current === null || !sameJson(current, next)) return state;
      return previous === null ? access.drop(state, next) : access.put(state, previous);
    },
  };
}

export function composed(edits: readonly Edit[]): Edit {
  return {
    apply: (state) => edits.reduce((current, edit) => edit.apply(current), state),
    revert: (state) => edits.reduceRight((current, edit) => edit.revert(current), state),
  };
}

export async function writeOptimistically<T>(
  store: EntityStore,
  event: string,
  edits: readonly Edit[],
  send: () => Promise<T>,
): Promise<T> {
  const edit = composed(edits);
  const operation = log.operation(event, { optimistic: edits.length > 0 });
  store.update(edit.apply);
  try {
    const answer = await send();
    operation.succeeded();
    return answer;
  } catch (error) {
    operation.failed(error, { rolledBack: edits.length > 0 });
    store.update(edit.revert);
    throw error;
  }
}

function itemAccess(id: string): RowAccess<PlannerItemRow> {
  return {
    find: (state) => state.tables.planner_items.byId[id] ?? null,
    put: (state, row) =>
      applyChange(state, {
        type: 'change',
        table: 'planner_items',
        operation: 'UPDATE',
        record: row,
        oldRecord: null,
      }),
    drop: (state, row) =>
      applyChange(state, {
        type: 'change',
        table: 'planner_items',
        operation: 'DELETE',
        record: null,
        oldRecord: row,
      }),
  };
}

function alarmAccess(id: string): RowAccess<PlannerAlarmRow> {
  return {
    find: (state) => state.tables.planner_alarms.byId[id] ?? null,
    put: (state, row) =>
      applyChange(state, {
        type: 'change',
        table: 'planner_alarms',
        operation: 'UPDATE',
        record: row,
        oldRecord: null,
      }),
    drop: (state, row) =>
      applyChange(state, {
        type: 'change',
        table: 'planner_alarms',
        operation: 'DELETE',
        record: null,
        oldRecord: row,
      }),
  };
}

function collectionAccess(id: string): RowAccess<PlannerCollectionRow> {
  return {
    find: (state) => state.tables.planner_collections.byId[id] ?? null,
    put: (state, row) =>
      applyChange(state, {
        type: 'change',
        table: 'planner_collections',
        operation: 'UPDATE',
        record: row,
        oldRecord: null,
      }),
    drop: (state, row) =>
      applyChange(state, {
        type: 'change',
        table: 'planner_collections',
        operation: 'DELETE',
        record: null,
        oldRecord: row,
      }),
  };
}

function occurrenceAccess(itemId: string, key: string): RowAccess<PlannerOccurrenceRow> {
  return {
    find: (state) =>
      state.tables.planner_occurrences.rows.find(
        (row) => row.item_id === itemId && row.occurrence_key === key,
      ) ?? null,
    put: (state, row) =>
      applyChange(state, {
        type: 'change',
        table: 'planner_occurrences',
        operation: 'UPDATE',
        record: row,
        oldRecord: null,
      }),
    drop: (state, row) =>
      applyChange(state, {
        type: 'change',
        table: 'planner_occurrences',
        operation: 'DELETE',
        record: null,
        oldRecord: row,
      }),
  };
}

export function itemEdit(previous: PlannerItemRow, next: PlannerItemRow | null): Edit {
  return rowEdit(itemAccess(previous.id), previous, next);
}

export function alarmEdit(previous: PlannerAlarmRow, next: PlannerAlarmRow | null): Edit {
  return rowEdit(alarmAccess(previous.id), previous, next);
}

export function collectionEdit(
  previous: PlannerCollectionRow,
  next: PlannerCollectionRow | null,
): Edit {
  return rowEdit(collectionAccess(previous.id), previous, next);
}

export function occurrenceEdit(
  state: StoreState,
  itemId: string,
  key: string,
  next: PlannerOccurrenceRow,
): Edit {
  const access = occurrenceAccess(itemId, key);
  return rowEdit(access, access.find(state), next);
}
