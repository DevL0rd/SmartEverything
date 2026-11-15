import type {
  PlannerCollectionRow,
  PlannerCollectionShareRow,
  PlannerColourKey,
  PlannerGuestResponse,
  PlannerShareRole,
} from '@smarteverything/domain';
import { useMemo } from 'react';
import { updatePlannerCollection } from '../../../api/planner';
import {
  changePlannerShare,
  sharePlannerCollection,
  unsharePlannerCollection,
} from '../../../api/planner-sharing';
import type { EntityStore } from '../../../store/entity-store';
import { applyChange } from '../../../store/live-reducers';
import { memoOnInputs } from '../../../store/memo-selector';
import { rowsOf, type StoreState } from '../../../store/state';
import { shallowEqual, useEntityStore, useStoreSelector } from '../../../store/store-context';
import { viewerCalendarsOf, type ViewerCalendar } from '../calendar/calendars-model';
import { collectionEdit, rowEdit, writeOptimistically, type RowAccess } from './optimistic';
import { apiPerson, profileIn, type PlannerPerson } from './person';

type Select<T> = (state: StoreState) => T;

export function calendarsSelector(person: PlannerPerson): Select<readonly ViewerCalendar[]> {
  return memoOnInputs(
    (state) => [
      state.tables.planner_collections,
      state.tables.planner_collection_shares,
      state.tables.profiles,
      state.session,
    ],
    (state) =>
      viewerCalendarsOf({
        collections: rowsOf(state.tables.planner_collections),
        shares: rowsOf(state.tables.planner_collection_shares),
        profiles: rowsOf(state.tables.profiles),
        me: profileIn(state, person),
      }),
  );
}

export function useViewerCalendars(person: PlannerPerson): readonly ViewerCalendar[] {
  const select = useMemo(() => calendarsSelector(person), [person]);
  return useStoreSelector(select, shallowEqual);
}

export function usePlannerCalendars(person: PlannerPerson): readonly PlannerCollectionRow[] {
  const select = useMemo(() => {
    const calendars = calendarsSelector(person);
    return memoOnInputs(
      (state) => [calendars(state)],
      (state) => calendars(state).map((calendar) => calendar.row),
    );
  }, [person]);
  return useStoreSelector(select, shallowEqual);
}

export type ResponseOf = (itemId: string) => PlannerGuestResponse | null;

export function responsesSelector(
  person: PlannerPerson,
): Select<ReadonlyMap<string, PlannerGuestResponse>> {
  return memoOnInputs(
    (state) => [state.tables.planner_guests, state.tables.planner_items, state.session],
    (state) => {
      const me = profileIn(state, person);
      const answers = new Map<string, PlannerGuestResponse>();
      for (const guest of rowsOf(state.tables.planner_guests)) {
        if (guest.profile_id === me) answers.set(guest.item_id, guest.response);
      }
      for (const item of rowsOf(state.tables.planner_items)) {
        const series = item.series_id === null ? undefined : answers.get(item.series_id);
        if (series !== undefined && !answers.has(item.id)) answers.set(item.id, series);
      }
      return answers;
    },
  );
}

export function useMyResponses(person: PlannerPerson): ResponseOf {
  const select = useMemo(() => responsesSelector(person), [person]);
  const answers = useStoreSelector(select);
  return useMemo(() => (itemId: string) => answers.get(itemId) ?? null, [answers]);
}

export function generatedSelector(): Select<ReadonlySet<string>> {
  return memoOnInputs(
    (state) => [state.tables.planner_items],
    (state) =>
      new Set(
        rowsOf(state.tables.planner_items)
          .filter((item) => item.created_by === 'feed')
          .map((item) => item.id),
      ),
  );
}

const GENERATED = generatedSelector();

export function useGeneratedItems(): ReadonlySet<string> {
  return useStoreSelector(GENERATED);
}

function shareAccess(
  collectionId: string,
  profileId: string,
): RowAccess<PlannerCollectionShareRow> {
  return {
    find: (state) =>
      state.tables.planner_collection_shares.byId[`${collectionId}\n${profileId}`] ?? null,
    put: (state, row) =>
      applyChange(state, {
        type: 'change',
        table: 'planner_collection_shares',
        operation: 'UPDATE',
        record: row,
        oldRecord: null,
      }),
    drop: (state, row) =>
      applyChange(state, {
        type: 'change',
        table: 'planner_collection_shares',
        operation: 'DELETE',
        record: null,
        oldRecord: row,
      }),
  };
}

export interface ViewerLook {
  readonly colour?: PlannerColourKey;
  readonly visible?: boolean;
}

export interface SharingWrites {
  readonly share: (
    calendar: ViewerCalendar,
    personId: string,
    role: PlannerShareRole,
  ) => Promise<PlannerCollectionShareRow>;
  readonly unshare: (calendar: ViewerCalendar, personId: string) => Promise<void>;
  readonly look: (calendar: ViewerCalendar, change: ViewerLook) => Promise<unknown>;
}

function shareWrites(store: EntityStore, who: string | undefined): SharingWrites['share'] {
  return (calendar, personId, role) => {
    const previous = calendar.sharedWith.find((entry) => entry.profile_id === personId) ?? null;
    const edits =
      previous === null
        ? []
        : [rowEdit(shareAccess(calendar.row.id, personId), previous, { ...previous, role })];
    return writeOptimistically(store, 'planner_share.set', edits, () =>
      sharePlannerCollection(who, calendar.row.id, personId, { role }),
    );
  };
}

function unshareWrites(store: EntityStore, who: string | undefined): SharingWrites['unshare'] {
  return (calendar, personId) => {
    const previous =
      calendar.sharedWith.find((entry) => entry.profile_id === personId) ?? calendar.share;
    const edits =
      previous === null ? [] : [rowEdit(shareAccess(calendar.row.id, personId), previous, null)];
    return writeOptimistically(store, 'planner_share.remove', edits, () =>
      unsharePlannerCollection(who, calendar.row.id, personId),
    );
  };
}

function lookWrites(store: EntityStore, who: string | undefined): SharingWrites['look'] {
  return (calendar, change) => {
    const { share } = calendar;
    if (share === null) {
      const row = store.get().tables.planner_collections.byId[calendar.row.id] ?? calendar.row;
      return writeOptimistically(
        store,
        'planner_collection.update',
        [collectionEdit(row, { ...row, ...change })],
        () => updatePlannerCollection(who, row.id, change),
      );
    }
    return writeOptimistically(
      store,
      'planner_share.look',
      [rowEdit(shareAccess(share.collection_id, share.profile_id), share, { ...share, ...change })],
      () => changePlannerShare(who, share.collection_id, share.profile_id, change),
    );
  };
}

export function sharingWrites(store: EntityStore, person: PlannerPerson): SharingWrites {
  const who = apiPerson(person);
  return {
    share: shareWrites(store, who),
    unshare: unshareWrites(store, who),
    look: lookWrites(store, who),
  };
}

export function usePlannerSharing(person: PlannerPerson): SharingWrites {
  const store = useEntityStore();
  return useMemo(() => sharingWrites(store, person), [store, person]);
}
