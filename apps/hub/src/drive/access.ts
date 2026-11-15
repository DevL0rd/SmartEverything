import type { DriveAlbum, DriveGrantRole, DriveItem, DriveRoot } from '@smarteverything/domain';
import type { Store } from '../store/store';
import type { SqlFilter } from '../store/sql';

export interface DriveActor {
  readonly profileId: string;
  readonly lockedFolder?: 'open';
}

export type DriveAccess = 'own' | 'shared' | 'none';

export type ItemAccess = 'own' | 'shared' | DriveGrantRole | 'none';

type AccessStore = Pick<Store, 'driveGrants' | 'driveItems'>;

type Owned = Pick<DriveRoot, 'scope' | 'ownerProfileId'>;

const STRENGTH: Readonly<Record<ItemAccess, number>> = {
  none: 0,
  view: 1,
  edit: 2,
  shared: 3,
  own: 3,
};

export function driveAccess(actor: DriveActor, drive: Owned): DriveAccess {
  if (drive.scope === 'home') return 'shared';
  return drive.ownerProfileId === actor.profileId ? 'own' : 'none';
}

export function rootVisible(
  store: AccessStore,
  actor: DriveActor,
  root: Owned & Pick<DriveRoot, 'id'>,
): boolean {
  return (
    driveAccess(actor, root) !== 'none' ||
    store.driveGrants
      .receivedBy(actor.profileId)
      .some((grant) => store.driveItems.find(grant.itemId, actor.profileId)?.rootId === root.id)
  );
}

function covers(folder: DriveItem, item: DriveItem): boolean {
  return (
    folder.id === item.id ||
    (folder.kind === 'folder' &&
      folder.rootId === item.rootId &&
      item.relPath.startsWith(`${folder.relPath}/`))
  );
}

export function itemAccess(
  store: AccessStore,
  actor: DriveActor,
  drive: Owned,
  item: DriveItem,
): ItemAccess {
  if (inLockedFolder(item) && actor.lockedFolder !== 'open') return 'none';
  const whole = driveAccess(actor, drive);
  if (whole !== 'none') return whole;
  let strongest: ItemAccess = 'none';
  for (const grant of store.driveGrants.receivedBy(actor.profileId)) {
    const target = store.driveItems.find(grant.itemId, actor.profileId);
    if (
      target !== undefined &&
      covers(target, item) &&
      STRENGTH[grant.role] > STRENGTH[strongest]
    ) {
      strongest = grant.role;
    }
  }
  return strongest;
}

export function canRead(access: ItemAccess): boolean {
  return access !== 'none';
}

export function canWrite(access: ItemAccess): boolean {
  return access === 'own' || access === 'shared' || access === 'edit';
}

export function canShare(access: ItemAccess): boolean {
  return access === 'own' || access === 'shared';
}

export function albumVisibleTo(actor: DriveActor, album: DriveAlbum): boolean {
  return album.scope === 'home' || album.ownerProfileId === actor.profileId;
}

export function driveSql(root = 'r'): string {
  return `(${root}.scope = 'home' or ${root}.owner_profile_id = $profile)`;
}

export const LOCKED_FOLDER = '.locked';

export function inLockedFolder(item: Pick<DriveItem, 'relPath'>): boolean {
  return item.relPath === LOCKED_FOLDER || item.relPath.startsWith(`${LOCKED_FOLDER}/`);
}

export function lockedFolderSql(item = 'i'): string {
  return `(${item}.rel_path = '${LOCKED_FOLDER}' or ${item}.rel_path glob '${LOCKED_FOLDER}/*')`;
}

export function lockedTrashSql(trash = 't'): string {
  return `(${trash}.original_rel_path = '${LOCKED_FOLDER}'
    or ${trash}.original_rel_path glob '${LOCKED_FOLDER}/*')`;
}

export function accessSql(item = 'i', root = 'r'): string {
  return `(not ${lockedFolderSql(item)} and (${driveSql(root)} or exists (
    select 1 from drive_grants g join drive_items a on a.id = g.item_id
    where g.profile_id = $profile and a.root_id = ${item}.root_id
      and (a.id = ${item}.id or (a.kind = 'folder'
        and ${item}.rel_path >= a.rel_path || '/' and ${item}.rel_path < a.rel_path || '0')))))`;
}

export function lockedSql(item = 'i'): string {
  return `exists (select 1 from drive_item_locks l cross join drive_items a on a.id = l.item_id
    where a.root_id = ${item}.root_id and (a.id = ${item}.id or (a.kind = 'folder'
      and ${item}.rel_path >= a.rel_path || '/' and ${item}.rel_path < a.rel_path || '0')))`;
}

export function mayExport(access: ItemAccess, locked: boolean): boolean {
  return !(locked && access === 'view');
}

export function driveFilter(actor: DriveActor, root = 'r'): SqlFilter {
  return { text: driveSql(root), parameters: { profile: actor.profileId } };
}

export function accessFilter(actor: DriveActor, item = 'i', root = 'r'): SqlFilter {
  return { text: accessSql(item, root), parameters: { profile: actor.profileId } };
}
