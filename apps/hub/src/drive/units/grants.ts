import {
  ApiError,
  appendTo,
  DRIVE_SHARED_BY_ME_ENTRY,
  DRIVE_SHARED_WITH_ME_ENTRY,
  type DriveGrant,
  type DriveGrantSet,
  type DriveItem,
  type DriveSharedByMeEntry,
  type DriveSharedWithMeEntry,
  type DriveShare,
} from '@smarteverything/domain';
import type { Store } from '../../store/store';
import { storeUnit } from '../../store/host/unit';
import { canRead, itemAccess, type DriveActor, type ItemAccess } from '../access';
import { GRANT_PAGE_SIZE, type GrantPage } from '../grants';

type GrantsStore = Pick<
  Store,
  'driveGrants' | 'driveItems' | 'driveRoots' | 'driveShares' | 'driveNotifications' | 'profiles'
>;

export interface PageInput {
  readonly actor: DriveActor;
  readonly cursor: string | undefined;
}

function missingItem(): ApiError {
  return new ApiError('not_found', 'There is no such file or folder for this caller.');
}

function pageOf<T>(
  all: readonly T[],
  keyOf: (value: T) => string,
  cursor: string | undefined,
): GrantPage<T> {
  const start = cursor === undefined ? 0 : all.findIndex((value) => keyOf(value) === cursor) + 1;
  if (cursor !== undefined && start === 0) {
    throw new ApiError('invalid_request', 'The cursor is not one this list gave out.');
  }
  const items = all.slice(start, start + GRANT_PAGE_SIZE);
  const last = items.at(-1);
  return {
    items,
    next: start + GRANT_PAGE_SIZE < all.length && last !== undefined ? keyOf(last) : null,
  };
}

function accessTo(store: GrantsStore, actor: DriveActor, item: DriveItem): ItemAccess {
  return itemAccess(store, actor, store.driveRoots.byId(item.rootId), item);
}

function readable(store: GrantsStore, actor: DriveActor, itemId: string): DriveItem {
  const item = store.driveItems.find(itemId, actor.profileId);
  if (item === undefined || !canRead(accessTo(store, actor, item))) throw missingItem();
  return item;
}

function grantsOfItem(
  store: GrantsStore,
  input: { readonly actor: DriveActor; readonly itemId: string },
): DriveGrant[] {
  const item = readable(store, input.actor, input.itemId);
  const grants = store.driveGrants.forItem(item.id);
  return accessTo(store, input.actor, item) === 'own'
    ? grants
    : grants.filter((grant) => grant.profileId === input.actor.profileId);
}

function requireOwnGrantId(store: GrantsStore, actor: DriveActor, input: DriveGrantSet): void {
  const made = input.id === undefined ? undefined : store.driveGrants.find(input.id);
  if (made === undefined) return;
  const same =
    made.grantedBy === actor.profileId &&
    made.itemId === input.itemId &&
    made.profileId === input.profileId;
  if (!same) throw new ApiError('forbidden', 'That share belongs to someone else.');
}

function setGrant(
  store: GrantsStore,
  { actor, grant: input }: { readonly actor: DriveActor; readonly grant: DriveGrantSet },
): DriveGrant {
  requireOwnGrantId(store, actor, input);
  const item = readable(store, actor, input.itemId);
  const drive = store.driveRoots.byId(item.rootId);
  if (drive.scope === 'home') {
    throw new ApiError('invalid_request', 'Everyone in the home already has the Shared Drive.');
  }
  if (accessTo(store, actor, item) !== 'own') {
    throw new ApiError('forbidden', 'Only the person whose drive this is can share it.');
  }
  if (input.profileId === actor.profileId) {
    throw new ApiError('invalid_request', 'A drive is already its person’s own.');
  }
  if (!store.profiles.list().some((profile) => profile.id === input.profileId)) {
    throw new ApiError('not_found', 'There is no such person to share with.');
  }
  const fresh = store.driveGrants.forPerson(input.itemId, input.profileId) === undefined;
  const stored = store.driveGrants.set(input, actor.profileId);
  if (fresh) {
    store.driveNotifications.add({
      profileId: input.profileId,
      kind: 'shared',
      itemId: input.itemId,
      actorProfileId: actor.profileId,
      actorName: null,
      refId: null,
    });
  }
  return stored;
}

function removeGrant(
  store: GrantsStore,
  input: { readonly actor: DriveActor; readonly grantId: string },
): void {
  const grant = store.driveGrants.find(input.grantId);
  if (
    grant === undefined ||
    (grant.grantedBy !== input.actor.profileId && grant.profileId !== input.actor.profileId)
  ) {
    throw new ApiError('not_found', 'There is no such share for this caller.');
  }
  store.driveGrants.remove(grant.id);
}

function sharedWithMe(store: GrantsStore, input: PageInput): GrantPage<DriveSharedWithMeEntry> {
  const entries: DriveSharedWithMeEntry[] = [];
  for (const grant of store.driveGrants.receivedBy(input.actor.profileId)) {
    const item = store.driveItems.find(grant.itemId, input.actor.profileId);
    if (item !== undefined) entries.push(DRIVE_SHARED_WITH_ME_ENTRY.parse({ item, grant }));
  }
  return pageOf(entries, (entry) => entry.grant.id, input.cursor);
}

function linkedItemIds(store: GrantsStore, actor: DriveActor): string[] {
  const ids: string[] = [];
  let after: { readonly at: string; readonly id: string } | null = null;
  for (;;) {
    const page: DriveShare[] = store.driveShares.madeBy({
      createdBy: actor.profileId,
      itemId: undefined,
      after,
      limit: 500,
    });
    for (const share of page) if (share.itemId !== null) ids.push(share.itemId);
    const last = page.at(-1);
    if (page.length < 500 || last === undefined) return ids;
    after = { at: store.driveShares.createdAt(last.id), id: last.id };
  }
}

function sharedByMe(
  store: GrantsStore,
  { actor, cursor }: PageInput,
): GrantPage<DriveSharedByMeEntry> {
  const grants = new Map<string, DriveGrant[]>();
  for (const grant of store.driveGrants.madeBy(actor.profileId)) {
    appendTo(grants, grant.itemId, grant);
  }
  const links = new Map<string, DriveShare[]>();
  for (const itemId of new Set([...grants.keys(), ...linkedItemIds(store, actor)])) {
    const active = store.driveShares
      .forItem(itemId)
      .filter((share) => share.createdBy === actor.profileId && share.revokedAt === null);
    if (active.length > 0) links.set(itemId, active);
  }
  const entries: { readonly item: DriveItem; readonly entry: DriveSharedByMeEntry }[] = [];
  for (const itemId of new Set([...grants.keys(), ...links.keys()])) {
    const item = store.driveItems.find(itemId, actor.profileId);
    if (item === undefined || accessTo(store, actor, item) !== 'own') continue;
    entries.push({
      item,
      entry: DRIVE_SHARED_BY_ME_ENTRY.parse({
        item,
        grants: grants.get(itemId) ?? [],
        links: links.get(itemId) ?? [],
      }),
    });
  }
  entries.sort(
    (left, right) =>
      left.item.name.localeCompare(right.item.name) || left.item.id.localeCompare(right.item.id),
  );
  return pageOf(
    entries.map(({ entry }) => entry),
    (entry) => entry.item.id,
    cursor,
  );
}

export const DRIVE_GRANTS_OF_ITEM_UNIT = storeUnit(grantsOfItem);

export const DRIVE_GRANT_SET_UNIT = storeUnit(setGrant);

export const DRIVE_GRANT_REMOVE_UNIT = storeUnit(removeGrant);

export const DRIVE_SHARED_WITH_ME_UNIT = storeUnit(sharedWithMe);

export const DRIVE_SHARED_BY_ME_UNIT = storeUnit(sharedByMe);
