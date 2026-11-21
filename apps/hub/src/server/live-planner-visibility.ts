import type { LiveChange, LiveTable } from '@smarteverything/domain';
import { collectionRoleOf, itemRoleOf, itemVisibleTo } from '../planner/sharing/visibility';
import type { HostStore } from '../store/host/host-store';
import type { Hearing } from './live-visibility';

type LiveStore = Pick<
  HostStore,
  'profiles' | 'plannerItems' | 'plannerCollections' | 'plannerShares' | 'plannerGuests'
>;

type PlannerShared = Extract<
  LiveChange,
  {
    table:
      | 'planner_collections'
      | 'planner_items'
      | 'planner_occurrences'
      | 'planner_guests'
      | 'planner_collection_shares';
  }
>;

const PLANNER_SHARED_TABLES: ReadonlySet<LiveTable> = new Set([
  'planner_collections',
  'planner_items',
  'planner_occurrences',
  'planner_guests',
  'planner_collection_shares',
]);

export function plannerShared(change: LiveChange): change is PlannerShared {
  return PLANNER_SHARED_TABLES.has(change.table);
}

function shareVisible(
  viewerId: string,
  row: { readonly collection_id: string; readonly profile_id: string },
  store: LiveStore,
): boolean {
  const collection = store.plannerCollections.findAny(row.collection_id);
  return row.profile_id === viewerId || collection?.profile_id === viewerId;
}

function itemRowVisible(
  viewerId: string,
  row: { readonly item_id: string } | null,
  store: LiveStore,
): boolean {
  return row !== null && itemVisibleTo(store, viewerId, row.item_id);
}

function guestRowVisible(
  viewerId: string,
  row: { readonly item_id: string; readonly profile_id: string | null } | null,
  store: LiveStore,
): boolean {
  return row !== null && (row.profile_id === viewerId || itemRowVisible(viewerId, row, store));
}

function rowOf<Row>(change: {
  readonly record: Row | null;
  readonly oldRecord: Row | null;
}): Row | null {
  return change.record ?? change.oldRecord;
}

function itemChangeVisible(
  viewerId: string,
  change: Extract<PlannerShared, { readonly table: 'planner_items' }>,
  store: LiveStore,
): boolean {
  const row = rowOf(change);
  if (row === null) return false;
  return (
    itemRoleOf(store, viewerId, row) !== undefined || (change.guests?.includes(viewerId) ?? false)
  );
}

function sharedRowVisible(viewerId: string, change: PlannerShared, store: LiveStore): boolean {
  switch (change.table) {
    case 'planner_collections': {
      const row = rowOf(change);
      return row !== null && collectionRoleOf(store, viewerId, row) !== undefined;
    }
    case 'planner_items': {
      return itemChangeVisible(viewerId, change, store);
    }
    case 'planner_collection_shares': {
      const row = rowOf(change);
      return row !== null && shareVisible(viewerId, row, store);
    }
    case 'planner_occurrences':
      return itemRowVisible(viewerId, rowOf(change), store);
    case 'planner_guests':
      return guestRowVisible(viewerId, rowOf(change), store);
  }
}

export function visibleShared(
  connection: Hearing,
  change: PlannerShared,
  store: LiveStore,
): boolean {
  return (
    connection.client.role === 'owner' ||
    sharedRowVisible(store.profiles.activeOf(connection.client.id).id, change, store)
  );
}
