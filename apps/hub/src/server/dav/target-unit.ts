import { dirname } from 'node:path';
import type { DriveItem, DriveRoot } from '@smarteverything/domain';
import { driveAccess, itemAccess, type DriveActor, type ItemAccess } from '../../drive/access';
import { storeUnit } from '../../store/host/unit';
import type { HostStore } from '../../store/host/host-store';

export interface DavLookup {
  readonly root: DriveRoot;
  readonly relPath: string;
  readonly actor: DriveActor;
}

export interface DavFound {
  readonly access: ItemAccess;
  readonly item: DriveItem | null;
}

function accessOf(store: HostStore, { root, relPath, actor }: DavLookup): ItemAccess {
  const whole = driveAccess(actor, root);
  if (whole !== 'none') return whole;
  for (let path = relPath; path !== ''; path = dirname(path) === '.' ? '' : dirname(path)) {
    const item = store.driveItems.byPath(root.id, path, null);
    if (item !== undefined) return itemAccess(store, actor, root, item);
  }
  return 'none';
}

export const DAV_TARGET_UNIT = storeUnit((store, lookup: DavLookup): DavFound => {
  const access = accessOf(store, lookup);
  if (access === 'none' || lookup.relPath === '') return { access, item: null };
  const item = store.driveItems.byPath(lookup.root.id, lookup.relPath, lookup.actor.profileId);
  return { access, item: item ?? null };
});
