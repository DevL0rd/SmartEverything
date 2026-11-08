import type {
  PlannerAlarmRow,
  PlannerCollectionRow,
  PlannerItemRow,
  PlannerOccurrenceRow,
  PlannerStopwatchRow,
  PlannerTimerRow,
} from '@smarteverything/domain';
import { useMemo } from 'react';
import { memoOnInputs } from '../../../store/memo-selector';
import { rowsOf, type StoreState, type Table } from '../../../store/state';
import { shallowEqual, useStoreSelector } from '../../../store/store-context';
import { profileIn, type PlannerPerson } from './person';

type Select<T> = (state: StoreState) => readonly T[];

export function ownRows<R extends { readonly profile_id: string }>(
  table: (state: StoreState) => Table<R>,
  person: PlannerPerson,
): Select<R> {
  return memoOnInputs(
    (state) => [table(state), state.session],
    (state) => {
      const profile = profileIn(state, person);
      return rowsOf(table(state)).filter((row) => row.profile_id === profile);
    },
  );
}

export function collectionsSelector(person: PlannerPerson): Select<PlannerCollectionRow> {
  return ownRows((state) => state.tables.planner_collections, person);
}

export function itemsSelector(person: PlannerPerson): Select<PlannerItemRow> {
  return ownRows((state) => state.tables.planner_items, person);
}

export function alarmsSelector(person: PlannerPerson): Select<PlannerAlarmRow> {
  return ownRows((state) => state.tables.planner_alarms, person);
}

export function timersSelector(person: PlannerPerson): Select<PlannerTimerRow> {
  return ownRows((state) => state.tables.planner_timers, person);
}

export function stopwatchesSelector(person: PlannerPerson): Select<PlannerStopwatchRow> {
  return ownRows((state) => state.tables.planner_stopwatches, person);
}

export function occurrencesSelector(person: PlannerPerson): Select<PlannerOccurrenceRow> {
  const items = itemsSelector(person);
  return memoOnInputs(
    (state) => [state.tables.planner_occurrences, state.tables.planner_items, state.session],
    (state) => {
      const owned = new Set(items(state).map((item) => item.id));
      return rowsOf(state.tables.planner_occurrences).filter((row) => owned.has(row.item_id));
    },
  );
}

function useOwned<T>(
  make: (person: PlannerPerson) => Select<T>,
  person: PlannerPerson,
): readonly T[] {
  const select = useMemo(() => make(person), [make, person]);
  return useStoreSelector(select, shallowEqual);
}

export function usePlannerCollections(person: PlannerPerson): readonly PlannerCollectionRow[] {
  return useOwned(collectionsSelector, person);
}

export function usePlannerItems(person: PlannerPerson): readonly PlannerItemRow[] {
  return useOwned(itemsSelector, person);
}

export function usePlannerAlarms(person: PlannerPerson): readonly PlannerAlarmRow[] {
  return useOwned(alarmsSelector, person);
}

export function usePlannerTimers(person: PlannerPerson): readonly PlannerTimerRow[] {
  return useOwned(timersSelector, person);
}

export function usePlannerOccurrences(person: PlannerPerson): readonly PlannerOccurrenceRow[] {
  return useOwned(occurrencesSelector, person);
}

export function usePlannerStopwatch(person: PlannerPerson): PlannerStopwatchRow | null {
  return useOwned(stopwatchesSelector, person)[0] ?? null;
}
