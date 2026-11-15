import type { DriveActor } from '../../../src/drive/access';
import { DriveReadService } from '../../../src/drive/service-read';
import { personalDriveRoot, sharedDriveRoot } from '../../store/drive-roots-fixture';
import { captureLogs } from '../../support/logs';
import type { TestStore } from '../../support/store';
import { driveTestStore, putItem } from '../spaces-fixture';

const id = (n: number): string => `0e000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

export const HOME = '0d000000-0000-4000-8000-000000000001';
export const ROBIN_DRIVE = '0d000000-0000-4000-8000-000000000002';
export const SAM_DRIVE = '0d000000-0000-4000-8000-000000000003';
export const TRIP = id(1);
export const TRIP_FILE = id(2);
export const SECRET = id(3);
export const SHARED_FILE = id(4);
export const ROBIN_FILE = id(5);
export const ROBIN_FOLDER = id(6);
export const UNKNOWN = id(99);

export interface Social {
  readonly opened: TestStore;
  readonly read: DriveReadService;
  readonly robin: DriveActor;
  readonly sam: DriveActor;
  readonly kim: DriveActor;
}

export async function openSocial(): Promise<Social> {
  captureLogs();
  const opened = await driveTestStore();
  const { store } = opened;
  const robin = { profileId: store.profiles.first().id };
  const sam = { profileId: store.profiles.create({ name: 'Sam' }).id };
  const kim = { profileId: store.profiles.create({ name: 'Kim' }).id };
  store.driveRoots.insert(sharedDriveRoot(HOME));
  store.driveRoots.insert(personalDriveRoot(ROBIN_DRIVE, robin.profileId));
  store.driveRoots.insert(personalDriveRoot(SAM_DRIVE, sam.profileId));
  putItem(store, { rootId: SAM_DRIVE, id: TRIP, relPath: 'trip', kind: 'folder' });
  putItem(store, { rootId: SAM_DRIVE, id: TRIP_FILE, relPath: 'trip/a.txt', kind: 'document' });
  putItem(store, { rootId: SAM_DRIVE, id: SECRET, relPath: 'secret.txt', kind: 'document' });
  putItem(store, { rootId: HOME, id: SHARED_FILE, relPath: 'shared.txt', kind: 'document' });
  putItem(store, { rootId: ROBIN_DRIVE, id: ROBIN_FILE, relPath: 'mine.txt', kind: 'document' });
  putItem(store, { rootId: ROBIN_DRIVE, id: ROBIN_FOLDER, relPath: 'docs', kind: 'folder' });
  return { opened, read: new DriveReadService(store), robin, sam, kim };
}

export function share(social: Social, itemId: string, to: DriveActor, role: 'view' | 'edit'): void {
  social.opened.store.driveGrants.set(
    { itemId, profileId: to.profileId, role, expiresAt: null },
    social.sam.profileId,
  );
}
