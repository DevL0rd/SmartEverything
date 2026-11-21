import { Logger, type LogPayload } from '@smarteverything/logging';
import type { EntityStore } from './entity-store';
import { applyChange, applyListChange } from './live-reducers';
import { sameJson } from './same-json';
import type { Device, ListTable, RowOf, StoreState } from './state';

const log = new Logger('app.store');

export interface Edit {
  readonly apply: (state: StoreState) => StoreState;
  readonly revert: (state: StoreState) => StoreState;
}

export interface RowAccess<R> {
  readonly find: (state: StoreState) => R | null;
  readonly put: (state: StoreState, row: R) => StoreState;
  readonly drop: (state: StoreState, row: R) => StoreState;
}

export type PlainTable = Exclude<ListTable, 'devices' | 'clients'>;

export function liveRowAccess<T extends PlainTable>(
  table: T,
  find: (state: StoreState) => RowOf<T> | null,
): RowAccess<RowOf<T>> {
  return {
    find,
    put: (state, row) =>
      applyListChange(state, table, { table, operation: 'UPDATE', record: row, oldRecord: null }),
    drop: (state, row) =>
      applyListChange(state, table, { table, operation: 'DELETE', record: null, oldRecord: row }),
  };
}

export function rowById<T extends PlainTable>(table: T, id: string): RowAccess<RowOf<T>> {
  return liveRowAccess(table, (state) => state.tables[table].byId[id] ?? null);
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

export function liveRowEdit<T extends PlainTable>(
  table: T,
  id: string,
  previous: RowOf<T> | null,
  next: RowOf<T> | null,
): Edit {
  return rowEdit(rowById(table, id), previous, next);
}

function deviceAccess(id: string): RowAccess<Device> {
  return {
    find: (state) => state.tables.devices.byId[id] ?? null,
    put: (state, row) =>
      applyChange(state, {
        type: 'change',
        table: 'devices',
        operation: 'UPDATE',
        record: row,
        oldRecord: null,
      }),
    drop: (state, row) =>
      applyChange(state, {
        type: 'change',
        table: 'devices',
        operation: 'DELETE',
        record: null,
        oldRecord: row,
      }),
  };
}

export function deviceEdit(previous: Device, next: Device | null): Edit {
  return rowEdit(deviceAccess(previous.id), previous, next);
}

export function composed(edits: readonly Edit[]): Edit {
  return {
    apply: (state) => edits.reduce((current, edit) => edit.apply(current), state),
    revert: (state) => edits.reduceRight((current, edit) => edit.revert(current), state),
  };
}

export interface OptimisticWrite<T> {
  readonly event: string;
  readonly edits: readonly Edit[];
  readonly send: () => Promise<T>;
  readonly fields?: LogPayload;
}

export async function writeOptimistically<T>(
  store: EntityStore,
  write: OptimisticWrite<T>,
): Promise<T> {
  const { event, edits, send, fields } = write;
  const edit = composed(edits);
  const operation = log.operation(event, { ...fields, optimistic: edits.length > 0 });
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
