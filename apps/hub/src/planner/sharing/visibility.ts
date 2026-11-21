import { ApiError, type PlannerCollectionRow, type PlannerItemRow } from '@smarteverything/domain';
import type { HostStore } from '../../store/host/host-store';

export type PlannerAccessStore = Pick<
  HostStore,
  'plannerCollections' | 'plannerShares' | 'plannerGuests' | 'plannerItems'
>;

export type CollectionRole = 'owner' | 'edit' | 'view';

export type ItemRole = CollectionRole | 'assignee' | 'guest';

export type ItemNeed = 'read' | 'write' | 'complete' | 'steps' | 'notes' | 'rsvp';

const NEEDS: Readonly<Record<ItemRole, ReadonlySet<ItemNeed>>> = {
  owner: new Set(['read', 'write', 'complete', 'steps', 'notes', 'rsvp']),
  edit: new Set(['read', 'write', 'complete', 'steps', 'notes', 'rsvp']),
  view: new Set(['read']),
  assignee: new Set(['read', 'complete', 'steps', 'notes']),
  guest: new Set(['read', 'rsvp']),
};

export function mayDo(role: ItemRole, need: ItemNeed): boolean {
  return NEEDS[role].has(need);
}

export function collectionRoleOf(
  store: Pick<HostStore, 'plannerShares'>,
  profileId: string,
  collection: PlannerCollectionRow,
): CollectionRole | undefined {
  if (collection.profile_id === profileId) return 'owner';
  const share = store.plannerShares.find(collection.id, profileId);
  if (share !== undefined) return share.role;
  return collection.audience === 'household' ? 'edit' : undefined;
}

export function visibleCollections(
  store: PlannerAccessStore,
  profileId: string,
): PlannerCollectionRow[] {
  const shared = store.plannerShares
    .forProfile(profileId)
    .map((share) => store.plannerCollections.findAny(share.collection_id))
    .filter((collection) => collection !== undefined);
  const all = [
    ...store.plannerCollections.list(profileId),
    ...shared,
    ...store.plannerCollections.household(),
  ];
  return [...new Map(all.map((collection) => [collection.id, collection])).values()];
}

function guestOf(store: PlannerAccessStore, profileId: string, item: PlannerItemRow): boolean {
  return store.plannerGuests.ofPerson(item.series_id ?? item.id, profileId) !== undefined;
}

function assigneeOf(store: PlannerAccessStore, profileId: string, item: PlannerItemRow): boolean {
  if (item.assignee_id === profileId) return true;
  if (item.parent_id === null) return false;
  return store.plannerItems.findAny(item.parent_id)?.assignee_id === profileId;
}

export function itemRoleOf(
  store: PlannerAccessStore,
  profileId: string,
  item: PlannerItemRow,
): ItemRole | undefined {
  const collection = store.plannerCollections.findAny(item.collection_id);
  const role =
    collection === undefined ? undefined : collectionRoleOf(store, profileId, collection);
  if (role !== undefined) {
    return role !== 'view' && (collection?.source === 'feed' || item.created_by === 'feed')
      ? 'view'
      : role;
  }
  if (assigneeOf(store, profileId, item)) return 'assignee';
  return guestOf(store, profileId, item) ? 'guest' : undefined;
}

export function itemVisibleTo(
  store: PlannerAccessStore,
  profileId: string,
  itemId: string,
): boolean {
  const item = store.plannerItems.findAny(itemId);
  return item !== undefined && itemRoleOf(store, profileId, item) !== undefined;
}

export interface ResolvedItem {
  readonly item: PlannerItemRow;
  readonly role: ItemRole;
}

export function resolveItem(
  store: PlannerAccessStore,
  profileId: string,
  itemId: string,
  need: ItemNeed,
): ResolvedItem {
  const item = store.plannerItems.anyById(itemId);
  const role = itemRoleOf(store, profileId, item);
  if (role === undefined) throw new ApiError('not_found', 'That item does not exist.');
  if (!mayDo(role, need)) {
    throw new ApiError('forbidden', 'You may not do that with this item.');
  }
  return { item, role };
}

export function resolveCollection(
  store: PlannerAccessStore,
  profileId: string,
  collectionId: string,
  need: 'read' | 'write',
): PlannerCollectionRow {
  const collection = store.plannerCollections.findAny(collectionId);
  const role =
    collection === undefined ? undefined : collectionRoleOf(store, profileId, collection);
  if (collection === undefined || role === undefined) {
    throw new ApiError('not_found', 'That calendar or list does not exist.');
  }
  if (need === 'write' && role === 'view') {
    throw new ApiError('forbidden', 'That calendar or list is shared with you to view only.');
  }
  if (need === 'write' && collection.source === 'feed') {
    throw new ApiError('forbidden', 'A feed calendar is read-only.');
  }
  return collection;
}

export function collectionVisibleTo(
  store: PlannerAccessStore,
  profileId: string,
  collectionId: string,
): boolean {
  const collection = store.plannerCollections.findAny(collectionId);
  return collection !== undefined && collectionRoleOf(store, profileId, collection) !== undefined;
}

export function profilesSeeing(
  store: PlannerAccessStore & Pick<HostStore, 'profiles'>,
  itemId: string,
): string[] {
  const item = store.plannerItems.findAny(itemId);
  if (item === undefined) return [];
  return store.profiles
    .list()
    .filter((profile) => itemRoleOf(store, profile.id, item) !== undefined)
    .map((profile) => profile.id);
}

export function involvedProfiles(
  store: Pick<HostStore, 'plannerGuests'>,
  item: PlannerItemRow,
): string[] {
  const guests = store.plannerGuests
    .forItem(item.series_id ?? item.id)
    .flatMap((guest) => (guest.profile_id === null ? [] : [guest.profile_id]));
  const assignee = item.assignee_id === null ? [] : [item.assignee_id];
  return [...new Set([item.profile_id, ...assignee, ...guests])];
}

export function writableCollections(
  store: PlannerAccessStore,
  profileId: string,
): PlannerCollectionRow[] {
  return visibleCollections(store, profileId).filter(
    (collection) =>
      collection.source !== 'feed' && collectionRoleOf(store, profileId, collection) !== 'view',
  );
}
