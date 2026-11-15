import type {
  PlannerCollectionRow,
  PlannerItemRow,
  PlannerOccurrenceRow,
  PlannerShareRole,
} from '@smarteverything/domain';
import { useMemo } from 'react';
import { memoOnInputs } from '../../../store/memo-selector';
import { rowsOf, type StoreState } from '../../../store/state';
import { shallowEqual, useStoreSelector } from '../../../store/store-context';
import { profileIn, type PlannerPerson } from './person';

type Select<T> = (state: StoreState) => T;

export interface TaskRows {
  readonly items: readonly PlannerItemRow[];
  readonly occurrences: readonly PlannerOccurrenceRow[];
}

export function assignedToMe(item: PlannerItemRow, profile: string | null): boolean {
  return (
    profile !== null &&
    item.kind === 'task' &&
    item.assignee_id === profile &&
    item.profile_id !== profile &&
    item.deleted_at === null
  );
}

export function assignedRowsOf(
  items: readonly PlannerItemRow[],
  occurrences: readonly PlannerOccurrenceRow[],
  profile: string | null,
): TaskRows {
  const parents = new Set(items.filter((item) => assignedToMe(item, profile)).map((row) => row.id));
  if (parents.size === 0) return { items: [], occurrences: [] };
  const shown = items.filter(
    (item) =>
      item.profile_id !== profile &&
      (parents.has(item.id) || (item.parent_id !== null && parents.has(item.parent_id))),
  );
  const ids = new Set(shown.map((item) => item.id));
  return { items: shown, occurrences: occurrences.filter((row) => ids.has(row.item_id)) };
}

export function assignedSelector(person: PlannerPerson): Select<TaskRows> {
  return memoOnInputs(
    (state) => [state.tables.planner_items, state.tables.planner_occurrences, state.session],
    (state) =>
      assignedRowsOf(
        rowsOf(state.tables.planner_items),
        rowsOf(state.tables.planner_occurrences),
        profileIn(state, person),
      ),
  );
}

function sameRows(left: TaskRows, right: TaskRows): boolean {
  return shallowEqual(left.items, right.items) && shallowEqual(left.occurrences, right.occurrences);
}

export function useAssignedToMe(person: PlannerPerson): TaskRows {
  const select = useMemo(() => assignedSelector(person), [person]);
  return useStoreSelector(select, sameRows);
}

function invitedTo(state: StoreState, itemId: string, profile: string): boolean {
  return rowsOf(state.tables.planner_guests).some(
    (row) => row.item_id === itemId && row.kind === 'person' && row.profile_id === profile,
  );
}

export type CollectionRole = 'owner' | PlannerShareRole;

export function collectionRoleIn(
  state: StoreState,
  collection: PlannerCollectionRow,
  profile: string | null,
): CollectionRole | null {
  if (profile === null) return null;
  if (collection.profile_id === profile) return 'owner';
  const share = state.tables.planner_collection_shares.byId[`${collection.id}\n${profile}`];
  if (share !== undefined) return share.role;
  return collection.audience === 'household' ? 'edit' : null;
}

export function takesHandAddedItems(collection: PlannerCollectionRow): boolean {
  return collection.feed === null || collection.feed.kind === 'birthdays';
}

export function writableCollection(
  collection: PlannerCollectionRow,
  role: CollectionRole | null,
): boolean {
  return role !== null && role !== 'view' && takesHandAddedItems(collection);
}

function assigneeOf(state: StoreState, item: PlannerItemRow, profile: string): boolean {
  if (item.assignee_id === profile) return true;
  if (item.parent_id === null) return false;
  return state.tables.planner_items.byId[item.parent_id]?.assignee_id === profile;
}

export type ItemRole = CollectionRole | 'assignee' | 'guest';

function collectionRoleOfItem(
  state: StoreState,
  item: PlannerItemRow,
  profile: string,
): CollectionRole | null {
  const collection = state.tables.planner_collections.byId[item.collection_id];
  if (collection === undefined) return null;
  const role = collectionRoleIn(state, collection, profile);
  if (role === null || role === 'view') return role;
  return takesHandAddedItems(collection) && item.created_by !== 'feed' ? role : 'view';
}

export function itemRoleIn(
  state: StoreState,
  item: PlannerItemRow,
  profile: string | null,
): ItemRole | null {
  if (profile === null || item.deleted_at !== null) return null;
  const role = collectionRoleOfItem(state, item, profile);
  if (role !== null) return role;
  if (assigneeOf(state, item, profile)) return 'assignee';
  return invitedTo(state, item.series_id ?? item.id, profile) ? 'guest' : null;
}

export function seenBy(state: StoreState, item: PlannerItemRow, profile: string | null): boolean {
  return itemRoleIn(state, item, profile) !== null;
}

export function visibleItemSelector(
  person: PlannerPerson,
  itemId: string,
): Select<PlannerItemRow | null> {
  return (state) => {
    const item = state.tables.planner_items.byId[itemId];
    return item !== undefined && seenBy(state, item, profileIn(state, person)) ? item : null;
  };
}

export function useVisibleItem(person: PlannerPerson, itemId: string): PlannerItemRow | null {
  const select = useMemo(() => visibleItemSelector(person, itemId), [person, itemId]);
  return useStoreSelector(select);
}

const selectMe = (state: StoreState): string | null => state.session?.client.profile_id ?? null;

export function usePlannerProfile(person: PlannerPerson): string | null {
  const me = useStoreSelector(selectMe);
  return person ?? me;
}

export function useTaskRows(
  person: PlannerPerson,
  own: readonly PlannerItemRow[],
  ownOccurrences: readonly PlannerOccurrenceRow[],
): TaskRows {
  const assigned = useAssignedToMe(person);
  return useMemo(
    () =>
      assigned.items.length === 0
        ? { items: own, occurrences: ownOccurrences }
        : {
            items: [...own, ...assigned.items],
            occurrences: [...ownOccurrences, ...assigned.occurrences],
          },
    [assigned, own, ownOccurrences],
  );
}

export function useItemRole(person: PlannerPerson, item: PlannerItemRow): ItemRole | null {
  return useStoreSelector((state) => itemRoleIn(state, item, profileIn(state, person)), Object.is, [
    person,
    item,
  ]);
}

export interface ItemCollections {
  readonly writable: readonly PlannerCollectionRow[];
  readonly current: PlannerCollectionRow | null;
}

function viewerRowIn(
  state: StoreState,
  row: PlannerCollectionRow,
  profile: string,
): PlannerCollectionRow {
  const share = state.tables.planner_collection_shares.byId[`${row.id}\n${profile}`];
  if (share === undefined) return row;
  return { ...row, colour: share.colour ?? row.colour, visible: share.visible };
}

interface SeenCollection {
  readonly row: PlannerCollectionRow;
  readonly role: CollectionRole;
}

function seenCollectionsIn(state: StoreState, profile: string): readonly SeenCollection[] {
  return rowsOf(state.tables.planner_collections).flatMap((row) => {
    const role = collectionRoleIn(state, row, profile);
    return role === null ? [] : [{ row: viewerRowIn(state, row, profile), role }];
  });
}

const COLLECTION_INPUTS = (state: StoreState): readonly unknown[] => [
  state.tables.planner_collections,
  state.tables.planner_collection_shares,
  state.session,
];

export function writableCollectionsSelector(
  person: PlannerPerson,
): Select<readonly PlannerCollectionRow[]> {
  return memoOnInputs(COLLECTION_INPUTS, (state) => {
    const profile = profileIn(state, person);
    if (profile === null) return [];
    return seenCollectionsIn(state, profile)
      .filter((entry) => writableCollection(entry.row, entry.role))
      .map((entry) => entry.row);
  });
}

export function useWritableCollections(person: PlannerPerson): readonly PlannerCollectionRow[] {
  const select = useMemo(() => writableCollectionsSelector(person), [person]);
  return useStoreSelector(select, shallowEqual);
}

export function itemCollectionsSelector(
  person: PlannerPerson,
  collectionId: string,
): Select<ItemCollections> {
  const writable = writableCollectionsSelector(person);
  return memoOnInputs(COLLECTION_INPUTS, (state) => {
    const profile = profileIn(state, person);
    if (profile === null) return { writable: [], current: null };
    const current = state.tables.planner_collections.byId[collectionId];
    return {
      writable: writable(state),
      current:
        current === undefined || collectionRoleIn(state, current, profile) === null
          ? null
          : viewerRowIn(state, current, profile),
    };
  });
}

export function useItemCollections(person: PlannerPerson, collectionId: string): ItemCollections {
  const select = useMemo(
    () => itemCollectionsSelector(person, collectionId),
    [person, collectionId],
  );
  return useStoreSelector(select);
}
