import type { DriveItem } from '@smarteverything/domain';
import type { HostStore } from '../../store/host/host-store';
import { itemAccess, type ItemAccess } from '../access';

export type AudienceStore = Pick<
  HostStore,
  'driveRoots' | 'driveItems' | 'driveGrants' | 'profiles'
>;

export interface Person {
  readonly profileId: string;
  readonly name: string;
  readonly access: ItemAccess;
}

export function peopleWithAccess(store: AudienceStore, item: DriveItem): Person[] {
  const drive = store.driveRoots.byId(item.rootId);
  return store.profiles.list().flatMap((profile): Person[] => {
    const access = itemAccess(store, { profileId: profile.id }, drive, item);
    return access === 'none' ? [] : [{ profileId: profile.id, name: profile.name, access }];
  });
}

export function accessOfPerson(
  store: AudienceStore,
  profileId: string,
  item: DriveItem,
): ItemAccess {
  return itemAccess(store, { profileId }, store.driveRoots.byId(item.rootId), item);
}
