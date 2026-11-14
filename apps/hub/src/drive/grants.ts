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
import { Logger } from '@smarteverything/logging';
import type { Store } from '../store/store';
import { canRead, itemAccess, type DriveActor, type ItemAccess } from './access';

const log = new Logger('hub.drive');

export const GRANT_PAGE_SIZE = 50;

export interface GrantPage<T> {
  readonly items: readonly T[];
  readonly next: string | null;
}

export interface GrantsEnv {
  readonly store: Pick<
    Store,
    'driveGrants' | 'driveItems' | 'driveRoots' | 'driveShares' | 'profiles'
  >;
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

export class DriveGrants {
  constructor(private readonly env: GrantsEnv) {}

  list(actor: DriveActor, itemId: string): DriveGrant[] {
    const item = this.readable(actor, itemId);
    const grants = this.env.store.driveGrants.forItem(item.id);
    return this.accessTo(actor, item) === 'own'
      ? grants
      : grants.filter((grant) => grant.profileId === actor.profileId);
  }

  set(actor: DriveActor, input: DriveGrantSet): DriveGrant {
    const item = this.readable(actor, input.itemId);
    const drive = this.env.store.driveRoots.byId(item.rootId);
    if (drive.scope === 'home') {
      throw new ApiError('invalid_request', 'Everyone in the home already has the Shared Drive.');
    }
    if (this.accessTo(actor, item) !== 'own') {
      throw new ApiError('forbidden', 'Only the person whose drive this is can share it.');
    }
    if (input.profileId === actor.profileId) {
      throw new ApiError('invalid_request', 'A drive is already its person’s own.');
    }
    if (!this.env.store.profiles.list().some((profile) => profile.id === input.profileId)) {
      throw new ApiError('not_found', 'There is no such person to share with.');
    }
    const grant = this.env.store.driveGrants.set(input, actor.profileId);
    log.info('drive_grant.set', {
      grantId: grant.id,
      itemId: grant.itemId,
      role: grant.role,
      by: actor.profileId,
    });
    return grant;
  }

  remove(actor: DriveActor, grantId: string): void {
    const grant = this.env.store.driveGrants.find(grantId);
    if (
      grant === undefined ||
      (grant.grantedBy !== actor.profileId && grant.profileId !== actor.profileId)
    ) {
      throw new ApiError('not_found', 'There is no such share for this caller.');
    }
    this.env.store.driveGrants.remove(grant.id);
    log.info('drive_grant.removed', { grantId: grant.id, by: actor.profileId });
  }

  sharedWithMe(actor: DriveActor, cursor: string | undefined): GrantPage<DriveSharedWithMeEntry> {
    const entries: DriveSharedWithMeEntry[] = [];
    for (const grant of this.env.store.driveGrants.receivedBy(actor.profileId)) {
      const item = this.env.store.driveItems.find(grant.itemId, actor.profileId);
      if (item !== undefined) entries.push(DRIVE_SHARED_WITH_ME_ENTRY.parse({ item, grant }));
    }
    return pageOf(entries, (entry) => entry.grant.id, cursor);
  }

  sharedByMe(actor: DriveActor, cursor: string | undefined): GrantPage<DriveSharedByMeEntry> {
    const grants = new Map<string, DriveGrant[]>();
    for (const grant of this.env.store.driveGrants.madeBy(actor.profileId)) {
      appendTo(grants, grant.itemId, grant);
    }
    const links = new Map<string, DriveShare[]>();
    for (const itemId of new Set([...grants.keys(), ...this.linkedItemIds(actor)])) {
      const active = this.env.store.driveShares
        .forItem(itemId)
        .filter((share) => share.createdBy === actor.profileId && share.revokedAt === null);
      if (active.length > 0) links.set(itemId, active);
    }
    const entries: { readonly item: DriveItem; readonly entry: DriveSharedByMeEntry }[] = [];
    for (const itemId of new Set([...grants.keys(), ...links.keys()])) {
      const item = this.env.store.driveItems.find(itemId, actor.profileId);
      if (item === undefined || !this.ownDrive(actor, item)) continue;
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

  private linkedItemIds(actor: DriveActor): string[] {
    const ids: string[] = [];
    let after: { readonly at: string; readonly id: string } | null = null;
    for (;;) {
      const page: DriveShare[] = this.env.store.driveShares.madeBy({
        createdBy: actor.profileId,
        itemId: undefined,
        after,
        limit: 500,
      });
      for (const share of page) ids.push(share.itemId);
      const last = page.at(-1);
      if (page.length < 500 || last === undefined) return ids;
      after = { at: this.env.store.driveShares.createdAt(last.id), id: last.id };
    }
  }

  private ownDrive(actor: DriveActor, item: DriveItem): boolean {
    return this.accessTo(actor, item) === 'own';
  }

  private accessTo(actor: DriveActor, item: DriveItem): ItemAccess {
    return itemAccess(this.env.store, actor, this.env.store.driveRoots.byId(item.rootId), item);
  }

  private readable(actor: DriveActor, itemId: string): DriveItem {
    const item = this.env.store.driveItems.find(itemId, actor.profileId);
    if (item === undefined || !canRead(this.accessTo(actor, item))) throw missingItem();
    return item;
  }
}
